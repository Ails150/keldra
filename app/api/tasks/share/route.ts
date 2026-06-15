import { NextResponse, type NextRequest } from "next/server";
import { authedActor } from "@/lib/auth/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureThread, buildThreadAddress } from "@/lib/email/task-email";

const DAY = 86_400_000;

// "Get updates on record" — returns the task's unique inbound address + a one-
// line status, so it can be shared (WhatsApp etc.) as a CAPTURE FUNNEL: anyone,
// on Keldra or not, emails updates/photos to the address and they land on the
// trail. Not an invitation to converse off-record.
export async function GET(request: NextRequest) {
  const actor = await authedActor(request);
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const taskCode = (new URL(request.url).searchParams.get("taskCode") ?? "").trim();
  if (!taskCode) return NextResponse.json({ error: "Missing taskCode." }, { status: 400 });

  const admin = createAdminClient();
  // Ensure the thread exists so a task always has a shareable inbound address,
  // even before any email has been sent.
  const thread = await ensureThread(admin, actor.orgId, taskCode);
  const address = buildThreadAddress(thread.id, thread.email_token);

  const { data: task } = await admin
    .from("tasks")
    .select("name, status, blocked_reason, blocking_company, planned_start")
    .eq("org_id", actor.orgId)
    .eq("code", taskCode)
    .maybeSingle<{ name: string | null; status: string | null; blocked_reason: string | null; blocking_company: string | null; planned_start: string | null }>();

  const daysOpen = task?.planned_start
    ? Math.max(0, Math.floor((Date.now() - new Date(task.planned_start).getTime()) / DAY))
    : null;
  const statusBits = [
    (task?.status ?? "").replace(/_/g, " "),
    daysOpen != null ? `${daysOpen} days open` : "",
    task?.blocking_company ? `held by ${task.blocking_company}` : "",
  ].filter(Boolean);

  return NextResponse.json({
    address,
    taskCode,
    title: task?.name ?? taskCode,
    statusLine: statusBits.join(" · "),
  });
}
