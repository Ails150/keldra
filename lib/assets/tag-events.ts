import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { hashBlockerEvent, verifyBlockerChain, type ChainEvent } from "@/lib/blockers/event-hash";

type Admin = ReturnType<typeof createAdminClient>;

// The single runtime append path for asset_tag_events — reads the asset's last
// event (max seq + hash), computes seq/prev_hash/real hash, inserts. Reuses the
// H2 audit-hash primitives so the chain is real and verifiable.
export async function appendAssetTagEvent(
  admin: Admin,
  input: {
    orgId: string;
    assetId: string;
    eventType: string;
    actorName: string | null;
    actorOrg?: string | null;
    payload?: Record<string, unknown>;
    ts?: string;
  },
): Promise<void> {
  const { data: last } = await admin
    .from("asset_tag_events")
    .select("seq, hash")
    .eq("org_id", input.orgId)
    .eq("asset_id", input.assetId)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle<{ seq: number; hash: string | null }>();

  const seq = ((last?.seq ?? -1) as number) + 1;
  const prevHash = last?.hash ?? null;
  const ts = new Date(input.ts ?? new Date().toISOString()).toISOString();
  const payload = input.payload ?? {};
  const hash = hashBlockerEvent({ prevHash, seq, eventType: input.eventType, actor: input.actorName, ts, payload });

  await admin.from("asset_tag_events").insert({
    org_id: input.orgId,
    asset_id: input.assetId,
    seq,
    event_type: input.eventType,
    actor_name: input.actorName,
    actor_org: input.actorOrg ?? null,
    payload,
    ts,
    prev_hash: prevHash,
    hash,
  });
}

// Verify an asset's transition chain (maps actor_name → the generic verifier's
// `actor` field).
export function verifyAssetTagChain(rows: { seq: number | null; event_type: string; actor_name: string | null; ts: string | null; created_at?: string | null; payload: unknown; prev_hash: string | null; hash: string | null }[]) {
  const mapped: ChainEvent[] = rows.map((r) => ({
    seq: r.seq, event_type: r.event_type, actor: r.actor_name, ts: r.ts, created_at: r.created_at, payload: r.payload, prev_hash: r.prev_hash, hash: r.hash,
  }));
  return verifyBlockerChain(mapped);
}
