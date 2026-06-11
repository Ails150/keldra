import { NextResponse } from "next/server";
import { getSessionState, isAdminRole } from "@/lib/auth/profile";
import { seedSampleData } from "@/lib/org/sample-seed";

// "Start with sample data" — seed the caller's org with a full demo project.
// org_admin (or superadmin) only; idempotent.
export async function POST() {
  const state = await getSessionState();
  if (state.status !== "ready" || !state.profile.org_id || !isAdminRole(state.profile.role)) {
    return NextResponse.json({ error: "Org admins only." }, { status: 403 });
  }
  try {
    const result = await seedSampleData(state.profile.org_id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
