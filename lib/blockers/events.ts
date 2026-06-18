import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { hashBlockerEvent } from "./event-hash";

type Admin = ReturnType<typeof createAdminClient>;

// The ONE runtime append path for blocker_events: reads the blocker's last event
// (max seq + hash), computes the next seq + prev_hash + a server-computed hash,
// and inserts. Every appender (engine, field capture) goes through this so the
// hash chain is real — never NULL — and stays continuous.
export async function appendBlockerEvent(
  admin: Admin,
  input: {
    blockerId: string;
    orgId: string;
    eventType: string;
    actor: string | null;
    payload?: Record<string, unknown>;
    ts?: string;
  },
): Promise<void> {
  const { data: last } = await admin
    .from("blocker_events")
    .select("seq, hash")
    .eq("blocker_id", input.blockerId)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle<{ seq: number; hash: string | null }>();

  const seq = ((last?.seq ?? -1) as number) + 1;
  const prevHash = last?.hash ?? null;
  const ts = new Date(input.ts ?? new Date().toISOString()).toISOString();
  const payload = input.payload ?? {};
  const hash = hashBlockerEvent({ prevHash, seq, eventType: input.eventType, actor: input.actor, ts, payload });

  await admin.from("blocker_events").insert({
    blocker_id: input.blockerId,
    org_id: input.orgId,
    seq,
    event_type: input.eventType,
    actor: input.actor,
    ts,
    payload,
    prev_hash: prevHash,
    hash,
  });
}
