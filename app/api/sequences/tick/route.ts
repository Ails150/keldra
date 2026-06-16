import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { advanceDueSequences, autoStartSilentSequences } from "@/lib/sequences/engine";

// The pg_cron tick. Supabase calls this (via pg_net) on a schedule with the
// shared CRON_SECRET header. Advances every due sequence. Sending is still
// gated per-org by org_config.sequence.enabled, so this is inert until opted in.
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 });
  }
  if (request.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    // 1. Auto-start chases on newly-silent tasks, then 2. advance/escalate due
    //    sequences. Both are inert until an org sets sequence.enabled = true.
    const autostart = await autoStartSilentSequences(admin);
    const summary = await advanceDueSequences(admin);
    return NextResponse.json({ ok: true, autostart, ...summary });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
