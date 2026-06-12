import { NextResponse, type NextRequest } from "next/server";
import { getSessionState, isAdminRole } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";

const ROLES = ["org_admin", "manager", "viewer", "field", "member"];

// GET — org members with their email + pending status (not yet signed in).
export async function GET() {
  const state = await getSessionState();
  if (state.status !== "ready" || !state.profile.org_id || !isAdminRole(state.profile.role)) {
    return NextResponse.json({ error: "Org admins only." }, { status: 403 });
  }
  const admin = createAdminClient();
  const { data: members } = await admin
    .from("users")
    .select("id, full_name, role")
    .eq("org_id", state.profile.org_id);

  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const authById = new Map(
    (list?.users ?? []).map((u) => [u.id, { email: u.email, lastSignIn: u.last_sign_in_at }]),
  );

  const people = (members ?? []).map((m) => {
    const a = authById.get(m.id);
    return {
      id: m.id,
      name: m.full_name ?? "(unnamed)",
      role: m.role,
      email: a?.email ?? "",
      pending: !a?.lastSignIn,
    };
  });
  return NextResponse.json({ people });
}

// POST { name, email, role } — direct invite: link the profile, then email an
// invite that lands on the set-password page and routes by role.
export async function POST(request: NextRequest) {
  const state = await getSessionState();
  if (state.status !== "ready" || !state.profile.org_id || !isAdminRole(state.profile.role)) {
    return NextResponse.json({ error: "Org admins only." }, { status: 403 });
  }

  let body: { name?: string; email?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const role = ROLES.includes(body.role ?? "") ? (body.role as string) : "member";
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }

  const admin = createAdminClient();
  const origin = new URL(request.url).origin;

  // Invite (creates the auth user + sends the email). The handle_new_user
  // trigger creates a bare profile row; we immediately set the org + role so
  // the profile is correct before they ever click — no finish-setup detour.
  const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: name },
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });
  if (error || !invited.user) {
    return NextResponse.json(
      { error: error?.message ?? "Couldn't send the invite." },
      { status: 400 },
    );
  }

  const { error: profileError } = await admin.from("users").upsert(
    { id: invited.user.id, org_id: state.profile.org_id, role, full_name: name || null },
    { onConflict: "id" },
  );
  if (profileError) {
    return NextResponse.json(
      { error: `Invited, but linking the profile failed: ${profileError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
