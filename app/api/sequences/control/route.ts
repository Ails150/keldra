import { NextResponse, type NextRequest } from "next/server";
import { getSessionState, canWrite } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { setSequenceStatus } from "@/lib/sequences/engine";

// Manual pause / resume / stop of a sequence, scoped to the caller's org.
export async function POST(request: NextRequest) {
  const state = await getSessionState();
  if (state.status !== "ready" || !state.profile.org_id || !canWrite(state.profile.role)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  let body: { id?: string; action?: "pause" | "resume" | "stop" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.id || !["pause", "resume", "stop"].includes(body.action ?? "")) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const admin = createAdminClient();
  // Ownership check: the sequence must belong to the caller's org.
  const { data: seq } = await admin
    .from("task_sequences")
    .select("id, org_id")
    .eq("id", body.id)
    .maybeSingle<{ id: string; org_id: string }>();
  if (!seq || (seq.org_id !== state.profile.org_id && state.profile.role !== "superadmin")) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const status = body.action === "resume" ? "active" : body.action === "stop" ? "stopped" : "paused";
  await setSequenceStatus(admin, body.id, status);
  return NextResponse.json({ ok: true });
}
