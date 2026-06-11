import { NextResponse, type NextRequest } from "next/server";
import { getSessionState } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";

function canAssign(role: string): boolean {
  return role === "org_admin" || role === "manager" || role === "superadmin";
}

// GET ?taskCode=… → the org's assignable members + who's already assigned.
export async function GET(request: NextRequest) {
  const state = await getSessionState();
  if (state.status !== "ready" || !state.profile.org_id || !canAssign(state.profile.role)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }
  const taskCode = new URL(request.url).searchParams.get("taskCode") ?? "";
  const admin = createAdminClient();

  const { data: members } = await admin
    .from("users")
    .select("id, full_name, role")
    .eq("org_id", state.profile.org_id);

  let assigned: string[] = [];
  try {
    const { data: task } = await admin
      .from("tasks")
      .select("id")
      .eq("org_id", state.profile.org_id)
      .eq("code", taskCode)
      .maybeSingle<{ id: string }>();
    if (task) {
      const { data: rows } = await admin
        .from("task_assignments")
        .select("user_id")
        .eq("task_id", task.id);
      assigned = (rows ?? []).map((r) => r.user_id as string);
    }
  } catch {
    /* task_assignments not migrated yet */
  }

  return NextResponse.json({
    members: (members ?? []).map((m) => ({ id: m.id, name: m.full_name ?? "(unnamed)", role: m.role })),
    assigned,
  });
}

// POST { taskCode, userId, action: 'add'|'remove' }
export async function POST(request: NextRequest) {
  const state = await getSessionState();
  if (state.status !== "ready" || !state.profile.org_id || !canAssign(state.profile.role)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }
  let body: { taskCode?: string; userId?: string; action?: "add" | "remove" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.taskCode || !body.userId || !["add", "remove"].includes(body.action ?? "")) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: task } = await admin
    .from("tasks")
    .select("id")
    .eq("org_id", state.profile.org_id)
    .eq("code", body.taskCode)
    .maybeSingle<{ id: string }>();
  if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });

  try {
    if (body.action === "add") {
      await admin.from("task_assignments").upsert(
        {
          org_id: state.profile.org_id,
          task_id: task.id,
          user_id: body.userId,
          assigned_by: state.profile.id,
        },
        { onConflict: "task_id,user_id" },
      );
    } else {
      await admin
        .from("task_assignments")
        .delete()
        .eq("task_id", task.id)
        .eq("user_id", body.userId);
    }
  } catch (err) {
    return NextResponse.json(
      { error: `Assignments need supabase-orgdata.sql: ${(err as Error).message}` },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
