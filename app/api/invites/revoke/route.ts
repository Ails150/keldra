import { NextResponse, type NextRequest } from "next/server";
import { getSessionState, isAdminRole } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

// "Revoke" an invite = expire it now. RLS guarantees the admin can only touch
// their own org's invites; the role check returns a clean 403 otherwise.
export async function POST(request: NextRequest) {
  const state = await getSessionState();
  if (state.status !== "ready" || !isAdminRole(state.profile.role)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.id) {
    return NextResponse.json({ error: "Missing invite id." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("org_invite_links")
    .update({ expires_at: new Date().toISOString() })
    .eq("id", body.id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Invite not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
