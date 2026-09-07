import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, createSignupClient } from "@/lib/supabase/admin";
import { PRIVACY_POLICY_VERSION } from "@/lib/privacy/policy";

// Coarsen the caller's IP before it is stored with a consent record: /24 for
// IPv4, /48 for IPv6. Enough to evidence where consent came from, not enough to
// be a precise location trace of someone who has just signed up.
function ipPrefix(request: NextRequest): string | null {
  const raw = (request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "")
    .split(",")[0]
    .trim();
  if (!raw) return null;
  if (raw.includes(":")) return raw.split(":").slice(0, 3).join(":") + "::/48";
  const parts = raw.split(".");
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.0/24` : null;
}

// New-organisation sign-up. Creates the auth user (email confirmation ON), the
// organisation, and the org_admin public.users row in one server route. If any
// step after the auth user fails, we delete the auth user so we never leave an
// orphan with no profile row.
export async function POST(request: NextRequest) {
  let body: {
    fullName?: string;
    email?: string;
    password?: string;
    companyName?: string;
    acceptPrivacy?: boolean;
    policyVersion?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const fullName = (body.fullName ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const companyName = (body.companyName ?? "").trim();

  if (!fullName || !email || !companyName) {
    return NextResponse.json(
      { error: "Name, work email and company name are all required." },
      { status: 400 },
    );
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "That email doesn't look right." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Use a password of at least 8 characters." },
      { status: 400 },
    );
  }
  // Consent is a precondition, not a checkbox we record after the fact: refuse
  // the sign-up outright rather than create an account with no lawful basis.
  if (body.acceptPrivacy !== true) {
    return NextResponse.json(
      { error: "Please confirm you've read the privacy notice to continue." },
      { status: 400 },
    );
  }

  const origin = new URL(request.url).origin;
  const admin = createAdminClient();

  // Does this address already have an account? Ask the database directly.
  //
  // This used to be inferred from signUp() returning a user with an empty
  // `identities` array, which is not a reliable signal: when confirmation email
  // delivery fails, GoTrue creates the auth row and then returns no usable user,
  // and the old check reported that to the customer as "already registered".
  // Ask explicitly instead.
  const { data: existingId } = await admin.rpc("user_id_by_email", { p_email: email });
  if (existingId) {
    return NextResponse.json(
      { error: "That email is already registered. Try signing in, or use a different email." },
      { status: 409 },
    );
  }

  const anon = createSignupClient();

  // 1. Auth user with confirmation email.
  const { data: signUpData, error: signUpError } = await anon.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (signUpError) {
    // A mail-delivery failure is ours, not the customer's, and GoTrue may already
    // have written the auth row — clean it up so the address stays usable.
    if (/confirmation email|sending email|smtp/i.test(signUpError.message)) {
      const { data: strandedId } = await admin.rpc("user_id_by_email", { p_email: email });
      if (strandedId) await admin.auth.admin.deleteUser(strandedId as string);
      console.error("[signup] confirmation email failed to send:", signUpError.message);
      return NextResponse.json(
        {
          error:
            "We couldn't send your confirmation email, so the account wasn't created. This is our problem, not yours — please try again shortly.",
        },
        { status: 502 },
      );
    }
    return NextResponse.json({ error: signUpError.message }, { status: 400 });
  }
  const user = signUpData.user;

  // No user back, but no error either. In practice this means GoTrue accepted the
  // account and then could not send the confirmation email (Supabase Auth has no
  // working SMTP configured — see RUNBOOK "Auth email"). The auth row usually
  // exists anyway, which would poison the address: the customer is told
  // something went wrong, and every retry then hits "already registered".
  //
  // So: clean up the half-made account, and say what is actually wrong instead of
  // blaming the customer's email.
  if (!user) {
    const { data: strandedId } = await admin.rpc("user_id_by_email", { p_email: email });
    if (strandedId) {
      await admin.auth.admin.deleteUser(strandedId as string);
    }
    console.error("[signup] no user returned — confirmation email almost certainly failed to send");
    return NextResponse.json(
      {
        error:
          "We couldn't send your confirmation email, so the account wasn't created. This is our problem, not yours — please try again shortly.",
      },
      { status: 502 },
    );
  }

  // 2. Organisation.
  const { data: org, error: orgError } = await admin
    .from("organisations")
    .insert({ name: companyName })
    .select("id")
    .single();

  if (orgError || !org) {
    await admin.auth.admin.deleteUser(user.id); // rollback orphan
    return NextResponse.json(
      { error: "Couldn't create your organisation. Please try again." },
      { status: 500 },
    );
  }

  // 3. Profile row as org_admin (handle_new_user may have created a bare row;
  //    upsert promotes it to org_admin and links the org).
  const { error: profileError } = await admin.from("users").upsert(
    {
      id: user.id,
      org_id: org.id,
      full_name: fullName,
      role: "org_admin",
    },
    { onConflict: "id" },
  );

  if (profileError) {
    await admin.from("organisations").delete().eq("id", org.id);
    await admin.auth.admin.deleteUser(user.id);
    return NextResponse.json(
      { error: "Couldn't finish setting up your account. Please try again." },
      { status: 500 },
    );
  }

  // 4. Consent record. Written with the service role so it cannot be forged or
  //    back-dated from a browser, and stamped with the policy version actually
  //    shown — a later notice never inherits this agreement. Best-effort: a
  //    missing table (migration not yet applied) must not fail a sign-up that
  //    has already created the account, but it IS logged loudly.
  const { error: consentError } = await admin.from("consent_records").insert({
    user_id: user.id,
    email,
    org_id: org.id,
    policy_version: body.policyVersion ?? PRIVACY_POLICY_VERSION,
    document: "privacy-notice",
    source: "signup",
    user_agent: request.headers.get("user-agent")?.slice(0, 400) ?? null,
    ip_prefix: ipPrefix(request),
  });
  if (consentError) {
    console.error("[signup] consent record NOT written:", consentError.message);
  }

  // Initialise the org from the default template (org_config + gate ladder).
  // Best-effort: if the instances migration isn't applied yet, signup still
  // succeeds and the org can be configured later.
  try {
    await admin.rpc("init_org_from_template", {
      p_org_id: org.id,
      p_template: "hyperscaler-dc",
    });
  } catch {
    /* instances migration not applied yet — non-fatal */
  }

  return NextResponse.json({ ok: true, needsConfirmation: true });
}
