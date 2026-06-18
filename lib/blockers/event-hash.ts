import { createHash } from "crypto";

// Canonical hash for a blocker_events row. ONE format, shared by every append
// path (seed, engine, field capture) and the read-path verifier, so a row
// hashed on write reproduces exactly on verify despite jsonb/timestamptz
// reserialization:
//   - ts normalized via new Date(ts).toISOString() (ms precision, round-trips)
//   - payload via a stable (recursively sorted-key) stringify
export type EventHashInput = {
  prevHash: string | null;
  seq: number;
  eventType: string;
  actor: string | null;
  ts: string;
  payload: unknown;
};

// Deterministic JSON: object keys sorted recursively so key order never affects
// the hash (Postgres jsonb does not preserve insertion order).
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}

export function normalizeTs(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? String(ts) : d.toISOString();
}

export function hashBlockerEvent(input: EventHashInput): string {
  const canonical = [
    input.prevHash ?? "",
    input.seq,
    input.eventType,
    input.actor ?? "",
    normalizeTs(input.ts),
    stableStringify(input.payload ?? {}),
  ].join("|");
  return createHash("sha256").update(canonical).digest("hex");
}

// Walk a blocker's events (any order in → sorted by seq here) and verify both
// hash integrity (each hash recomputes) and chain continuity (each prev_hash
// links to the previous event's hash). Returns the first break, if any.
export type ChainEvent = {
  seq: number | null;
  event_type: string;
  actor: string | null;
  ts: string | null;
  created_at?: string | null;
  payload: unknown;
  prev_hash: string | null;
  hash: string | null;
};

export function verifyBlockerChain(events: ChainEvent[]): { ok: boolean; brokenAtSeq: number | null } {
  const sorted = [...events].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  let prev: string | null = null;
  for (const e of sorted) {
    const seq = e.seq ?? 0;
    if ((e.prev_hash ?? null) !== prev) return { ok: false, brokenAtSeq: seq };
    const recomputed = hashBlockerEvent({
      prevHash: prev,
      seq,
      eventType: e.event_type,
      actor: e.actor,
      ts: e.ts ?? e.created_at ?? "",
      payload: e.payload,
    });
    if (recomputed !== (e.hash ?? "")) return { ok: false, brokenAtSeq: seq };
    prev = e.hash ?? null;
  }
  return { ok: true, brokenAtSeq: null };
}
