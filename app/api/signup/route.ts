import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, createSignupClient } from "@/lib/supabase/admin";

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

  const origin = new URL(request.url).origin;
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
    return NextResponse.json({ error: signUpError.message }, { status: 400 });
  }
  const user = signUpData.user;
  // Supabase returns a user with no identities (and no error) when the email is
  // already registered, to avoid leaking account existence.
  if (!user || (user.identities && user.identities.length === 0)) {
    return NextResponse.json(
      {
        error:
          "That email is already registered. Try signing in, or use a different email.",
      },
      { status: 409 },
    );
  }

  const admin = createAdminClient();

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
