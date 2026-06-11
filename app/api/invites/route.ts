import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { getSessionState, isAdminRole } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

// List the current org's invite links (admins only). RLS is the real gate; the
// role check here just returns a clean 403 instead of an empty list.
export async function GET() {
  const state = await getSessionState();
  if (state.status !== "ready" || !isAdminRole(state.profile.role)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("org_invite_links")
    .select("id, token, role, expires_at, max_uses, use_count, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ invites: data ?? [] });
}

// Create a new invite link for the current org (admins only).
export async function POST(request: NextRequest) {
  const state = await getSessionState();
  if (state.status !== "ready" || !isAdminRole(state.profile.role)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }
  if (!state.profile.org_id) {
    return NextResponse.json(
      { error: "Your account isn't linked to an organisation yet." },
      { status: 400 },
    );
  }

  let body: { role?: string; maxUses?: number | null; expiresInDays?: number | null };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  // Dashboard roles (org_admin/manager/viewer) + the field-app role; anything
  // unrecognised falls back to the safe default.
  const ALLOWED_ROLES = ["org_admin", "manager", "viewer", "field", "member"];
  const role = ALLOWED_ROLES.includes(body.role ?? "") ? (body.role as string) : "member";
  const maxUses =
    typeof body.maxUses === "number" && body.maxUses > 0
      ? Math.floor(body.maxUses)
      : null;
  const expiresAt =
    typeof body.expiresInDays === "number" && body.expiresInDays > 0
      ? new Date(Date.now() + body.expiresInDays * 86_400_000).toISOString()
      : null;

  const token = randomBytes(18).toString("base64url"); // 24 url-safe chars

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("org_invite_links")
    .insert({
      org_id: state.profile.org_id,
      token,
      role,
      created_by: state.profile.id,
      max_uses: maxUses,
      expires_at: expiresAt,
    })
    .select("id, token, role, expires_at, max_uses, use_count, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Couldn't create the invite." },
      { status: 500 },
    );
  }
  return NextResponse.json({ invite: data });
}
