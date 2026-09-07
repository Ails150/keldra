import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
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
  // Constant-time compare so the header can't be recovered a byte at a time.
  // Same treatment the Resend webhook secret already gets in lib/email/svix.ts.
  const presented = Buffer.from(request.headers.get("x-cron-secret") ?? "");
  const expected = Buffer.from(secret);
  if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
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
