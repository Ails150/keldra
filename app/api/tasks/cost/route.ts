import { NextResponse, type NextRequest } from "next/server";
import { getSessionState } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";

function canEdit(role: string): boolean {
  return role === "org_admin" || role === "manager" || role === "superadmin";
}

// Per-task cost-of-delay override → tasks.cost_per_day. Feeds the existing
// exposure maths + dashboard burn directly.
export async function POST(request: NextRequest) {
  const state = await getSessionState();
  if (state.status !== "ready" || !state.profile.org_id || !canEdit(state.profile.role)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }
  let body: { taskCode?: string; costPerDay?: number | string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const taskCode = (body.taskCode ?? "").trim();
  if (!taskCode) return NextResponse.json({ error: "Missing task code." }, { status: 400 });
  const cost = Math.max(0, Math.round(Number(body.costPerDay) || 0));

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tasks")
    .update({ cost_per_day: cost })
    .eq("org_id", state.profile.org_id)
    .eq("code", taskCode)
    .select("code")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  // Mirror onto any open blocker for this task so gate/overview burn matches.
  await admin
    .from("blockers")
    .update({ cost_per_day: cost })
    .eq("org_id", state.profile.org_id)
    .eq("task_code", taskCode)
    .neq("state", "closed");
  // Bust the AI summary cache for this task. The summary embeds the £/day rate
  // but is only regenerated when the TRAIL changes (entry_count / newest_at) — a
  // cost edit doesn't touch the trail, so without this the panel keeps showing
  // the old rate. Deleting the row forces a fresh regen on next load.
  try {
    await admin
      .from("task_summaries")
      .delete()
      .eq("org_id", state.profile.org_id)
      .eq("task_code", taskCode);
  } catch {
    /* task_summaries not migrated — nothing to invalidate */
  }
  return NextResponse.json({ ok: true, costPerDay: cost });
}
