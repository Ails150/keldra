import { NextResponse, type NextRequest } from "next/server";
import { getSessionState, isAdminRole } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateInviteLink, sendInviteEmail } from "@/lib/auth/invite-link";

const ROLES = ["org_admin", "manager", "viewer", "field", "member"];
const BAN_FOREVER = "876000h"; // ~100 years

type AuthInfo = { email: string | null; lastSignIn: string | null; bannedUntil: string | null };

function statusOf(a: AuthInfo | undefined): "active" | "pending" | "suspended" {
  if (a?.bannedUntil && new Date(a.bannedUntil) > new Date()) return "suspended";
  if (a?.lastSignIn) return "active";
  return "pending";
}

async function authMap(admin: ReturnType<typeof createAdminClient>) {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const m = new Map<string, AuthInfo>();
  for (const u of data?.users ?? []) {
    m.set(u.id, {
      email: u.email ?? null,
      lastSignIn: u.last_sign_in_at ?? null,
      // banned_until isn't in the typed surface; read defensively.
      bannedUntil: (u as unknown as { banned_until?: string }).banned_until ?? null,
    });
  }
  return m;
}

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
  const auth = await authMap(admin);

  const people = (members ?? []).map((m) => {
    const a = auth.get(m.id);
    return {
      id: m.id,
      name: m.full_name ?? "(unnamed)",
      email: a?.email ?? "",
      role: m.role,
      status: statusOf(a),
      lastSignIn: a?.lastSignIn ?? null,
      isSelf: m.id === state.profile.id,
    };
  });
  return NextResponse.json({ people });
}

export async function POST(request: NextRequest) {
  const state = await getSessionState();
  if (state.status !== "ready" || !state.profile.org_id || !isAdminRole(state.profile.role)) {
    return NextResponse.json({ error: "Org admins only." }, { status: 403 });
  }
  const orgId = state.profile.org_id;

  let body: { userId?: string; action?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { userId, action } = body;
  if (!userId || !action) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const admin = createAdminClient();

  // Target must be in the caller's org.
  const { data: target } = await admin
    .from("users")
    .select("id, role, org_id")
    .eq("id", userId)
    .maybeSingle<{ id: string; role: string; org_id: string | null }>();
  if (!target || target.org_id !== orgId) {
    return NextResponse.json({ error: "Person not found in your org." }, { status: 404 });
  }

  const isSelf = userId === state.profile.id;

  // --- guards ---
  if (isSelf && (action === "suspend" || action === "remove")) {
    return NextResponse.json({ error: "You can't suspend or remove yourself." }, { status: 400 });
  }
  // Last org_admin protection (remove or demote).
  const demoting = action === "role" && body.role !== "org_admin";
  if (target.role === "org_admin" && (action === "remove" || demoting)) {
    const { count } = await admin
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("role", "org_admin");
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "Can't remove or demote the last org admin." },
        { status: 400 },
      );
    }
  }

  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  const email = authUser.user?.email ?? "";
  const origin = new URL(request.url).origin;
  const orgName = state.profile.org_name ?? "your organisation";

  switch (action) {
    case "resend": {
      try {
        const { link } = await generateInviteLink(admin, email, `${origin}/reset-password`);
        const sent = await sendInviteEmail(email, link, orgName);
        return NextResponse.json({
          ok: true,
          message: sent
            ? `Invite resent to ${email}.`
            : `Link regenerated, but email isn't configured (RESEND_API_KEY).`,
        });
      } catch (err) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
      }
    }
    case "cancel": {
      // Pending only — no history to preserve, so a hard delete is safe.
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, message: "Invite cancelled." });
    }
    case "suspend": {
      const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: BAN_FOREVER });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, message: "Access suspended — history kept." });
    }
    case "reactivate": {
      const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: "none" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, message: "Access reactivated." });
    }
    case "remove": {
      // Evidence product: revoke access (permanent ban) + drop the profile, but
      // KEEP auth.users so all history stays attributed. Never hard-delete.
      await admin.auth.admin.updateUserById(userId, { ban_duration: BAN_FOREVER });
      const { error } = await admin.from("users").delete().eq("id", userId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({
        ok: true,
        message: "Removed — access revoked, their records remain on the trail.",
      });
    }
    case "role": {
      if (!ROLES.includes(body.role ?? "")) {
        return NextResponse.json({ error: "Unknown role." }, { status: 400 });
      }
      const { error } = await admin.from("users").update({ role: body.role }).eq("id", userId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, message: `Role changed to ${body.role}.` });
    }
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
}
