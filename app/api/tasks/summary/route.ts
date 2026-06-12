import { NextResponse, type NextRequest } from "next/server";
import { authedActor } from "@/lib/auth/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTaskSummary } from "@/lib/ai/task-summary";

export const runtime = "nodejs";

// Per-task AI summary. Org-scoped (org derived from the verified session, never
// the body). Regenerates when the trail moved; never serves stale.
export async function GET(request: NextRequest) {
  const actor = await authedActor(request);
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const url = new URL(request.url);
  const taskCode = (url.searchParams.get("taskCode") ?? "").trim();
  if (!taskCode) return NextResponse.json({ error: "Missing taskCode." }, { status: 400 });
  const force = url.searchParams.get("force") === "1";

  try {
    const summary = await getTaskSummary(createAdminClient(), actor.orgId, taskCode, force);
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
