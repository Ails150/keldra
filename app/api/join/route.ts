import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, createSignupClient } from "@/lib/supabase/admin";

// Accept a token invite: validate the token, create the auth user (email
// confirmation ON), map them into the invite's org with the invite's role, and
// atomically consume one use. If profile mapping fails we delete the auth user
// so there's no orphan.
export async function POST(request: NextRequest) {
  let body: {
    token?: string;
    fullName?: string;
    email?: string;
    password?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const token = (body.token ?? "").trim();
  const fullName = (body.fullName ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  if (!token) {
    return NextResponse.json({ error: "Missing invite token." }, { status: 400 });
  }
  if (!fullName || !email) {
    return NextResponse.json(
      { error: "Name and email are required." },
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

  const admin = createAdminClient();

  // 1. Atomically validate + consume one use. Returns the org/role to map, or
  //    nothing if the token is invalid, expired, or exhausted.
  const { data: claim, error: claimError } = await admin
    .rpc("claim_org_invite", { p_token: token })
    .maybeSingle<{ org_id: string; role: string }>();

  if (claimError) {
    return NextResponse.json(
      { error: "Couldn't validate that invite. Please try again." },
      { status: 500 },
    );
  }
  if (!claim) {
    return NextResponse.json(
      { error: "This invite link is invalid, expired, or fully used." },
      { status: 410 },
    );
  }

  const origin = new URL(request.url).origin;
  const anon = createSignupClient();

  // 2. Auth user with confirmation email.
  const { data: signUpData, error: signUpError } = await anon.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (signUpError || !signUpData.user) {
    await refund(admin, token);
    return NextResponse.json(
      { error: signUpError?.message ?? "Couldn't create your account." },
      { status: 400 },
    );
  }
  const user = signUpData.user;
  if (user.identities && user.identities.length === 0) {
    await refund(admin, token);
    return NextResponse.json(
      {
        error:
          "That email is already registered. Try signing in instead.",
      },
      { status: 409 },
    );
  }

  // 3. Map into the invite's org with the invite's role.
  const { error: profileError } = await admin.from("users").upsert(
    {
      id: user.id,
      org_id: claim.org_id,
      full_name: fullName,
      role: claim.role,
    },
    { onConflict: "id" },
  );

  if (profileError) {
    await admin.auth.admin.deleteUser(user.id);
    await refund(admin, token);
    return NextResponse.json(
      { error: "Couldn't finish joining. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, needsConfirmation: true });
}

// Give a consumed use back if a later step fails, so a failed attempt doesn't
// burn one of a limited-use invite.
async function refund(admin: ReturnType<typeof createAdminClient>, token: string) {
  try {
    const { data } = await admin
      .from("org_invite_links")
      .select("id, use_count")
      .eq("token", token)
      .maybeSingle();
    if (data && data.use_count > 0) {
      await admin
        .from("org_invite_links")
        .update({ use_count: data.use_count - 1 })
        .eq("id", data.id);
    }
  } catch {
    // best-effort; a stray +1 on a multi-use invite is harmless.
  }
}
