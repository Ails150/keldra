import { NextResponse, type NextRequest } from "next/server";
import { getSessionState, isAdminRole } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";

// Resend a direct invite email to a still-pending person.
export async function POST(request: NextRequest) {
  const state = await getSessionState();
  if (state.status !== "ready" || !state.profile.org_id || !isAdminRole(state.profile.role)) {
    return NextResponse.json({ error: "Org admins only." }, { status: 403 });
  }
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const email = (body.email ?? "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "Missing email." }, { status: 400 });

  const admin = createAdminClient();
  const origin = new URL(request.url).origin;
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/reset-password`,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
