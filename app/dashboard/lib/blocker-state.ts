import type { WizardData } from "../../onboarding/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type BlockerStateName =
  | "unowned"
  | "pending-acceptance"
  | "accepted"
  | "working"
  | "awaiting-input"
  | "escalated"
  | "proposed-resolved"
  | "verified"
  | "closed"
  | "reopened";

export type BlockerEvent = {
  event_type: string;
  actor: string;
  timestamp: string;
  payload: Record<string, unknown>;
  prevHash: string | null;
  hash: string;
};

export type Blocker = {
  id: string;
  description: string;
  linked_assets: string[];
  raised_by: string;
  state: BlockerStateName;
  current_owner: string | null;
  current_owner_org: string | null;
  waiting_on_person: string | null;
  waiting_on_org: string | null;
  since_timestamp: string;
  events: BlockerEvent[];
  cost_per_day: number;
  sit_on_today: boolean;
  sit_on_today_date: string | null;
  proposed_resolution_note: string | null;
  priority: string;
  raised_date: string;
};

export type BlockerMap = Record<string, Blocker>;

export const STORAGE_KEY = "keldra_blocker_state";

// ---------- cost helpers ----------

export function costForPriority(priority: string): number {
  const p = (priority || "").toString().trim().toLowerCase();
  if (p.includes("critical")) return 20000;
  if (p.includes("high")) return 8000;
  if (p.includes("medium") || p.includes("med")) return 3000;
  if (p.includes("low")) return 1000;
  return 3000;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysBetween(later: string, earlier: string): number {
  const a = new Date(later).getTime();
  const b = new Date(earlier).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

export function daysInState(b: Blocker, now: Date = new Date()): number {
  return daysBetween(now.toISOString(), b.since_timestamp);
}

export function daysSinceRaised(b: Blocker, now: Date = new Date()): number {
  const first = b.events[0]?.timestamp ?? b.since_timestamp;
  return daysBetween(now.toISOString(), first);
}

export function computeCostSunk(b: Blocker, now: Date = new Date()): number {
  // Total open days × cost/day, regardless of state churn.
  return daysSinceRaised(b, now) * b.cost_per_day;
}

// ---------- sha-256 chain ----------

async function sha256(s: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const enc = new TextEncoder().encode(s);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Lightweight fallback so this still works in SSR or test envs.
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0").repeat(8);
}

export async function hashEvent(
  e: Omit<BlockerEvent, "hash">,
): Promise<string> {
  const msg = JSON.stringify({
    event_type: e.event_type,
    actor: e.actor,
    timestamp: e.timestamp,
    payload: e.payload,
    prevHash: e.prevHash,
  });
  return sha256(msg);
}

async function buildEvent(
  prev: BlockerEvent | undefined,
  event_type: string,
  actor: string,
  timestamp: string,
  payload: Record<string, unknown>,
): Promise<BlockerEvent> {
  const base = {
    event_type,
    actor,
    timestamp,
    payload,
    prevHash: prev?.hash ?? null,
  };
  const hash = await hashEvent(base);
  return { ...base, hash };
}

// ---------- hydration ----------

function isoOrNow(d: unknown, fallback: string): string {
  const s = (d ?? "").toString().trim();
  if (!s) return fallback;
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return fallback;
  return dt.toISOString();
}

function splitLinkedAssets(s: unknown): string[] {
  return (s ?? "")
    .toString()
    .split(/[,;|]/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function initialStateFromCsv(row: any): BlockerStateName {
  const owner = (row.owner_name ?? "").toString().trim();
  const status = (row.status ?? "").toString().trim().toLowerCase();
  // Honour explicit blocker-state values from the source register first — a
  // constraint log can mark an item "unowned" even when an action-by name is
  // listed (suggested owner, not yet accepted).
  if (status.includes("closed")) return "closed";
  if (status.includes("unowned")) return "unowned";
  if (status.includes("await") || status.includes("input"))
    return "awaiting-input";
  if (status.includes("escalat")) return "escalated";
  if (status.includes("verif")) return "verified";
  if (status.includes("reopen")) return "reopened";
  if (status.includes("pending")) return "pending-acceptance";
  if (
    status.includes("working") ||
    status.includes("in progress") ||
    status.includes("in-progress")
  )
    return "working";
  // Fall back to ownership when the status isn't a recognised state name.
  if (!owner) return "unowned";
  return "pending-acceptance";
}

export async function hydrateFromProject(
  project: WizardData,
): Promise<BlockerMap> {
  const nowIso = new Date().toISOString();
  const rows = project.uploads.constraints ?? [];
  const map: BlockerMap = {};

  for (let i = 0; i < rows.length; i++) {
    const row: any = rows[i];
    const id = (row.id ?? `C-${i + 1}`).toString().trim();
    const raisedDate = isoOrNow(row.raised_date, nowIso);
    const raisedBy = (row.raised_by ?? "—").toString().trim() || "—";
    const ownerName = (row.owner_name ?? "").toString().trim() || null;
    const ownerOrg = (row.owner_org ?? "").toString().trim() || null;
    const priority = (row.priority ?? "").toString().trim();

    const events: BlockerEvent[] = [];
    const raisedEvent = await buildEvent(
      undefined,
      "raised",
      raisedBy,
      raisedDate,
      {
        description: (row.description ?? "").toString().trim(),
        priority,
      },
    );
    events.push(raisedEvent);

    // An ingested action register carries its Comments history as parsed,
    // date-ordered events. Each one becomes a hash-chained "comment" event so
    // the project's real audit trail shows up in the chain, not just "raised".
    const commentEvents: Array<{ date?: string; content?: string }> = Array.isArray(
      row.comment_events,
    )
      ? row.comment_events
      : [];
    for (const ce of commentEvents) {
      const content = (ce?.content ?? "").toString().trim();
      if (!content) continue;
      const ts = isoOrNow(ce?.date, raisedDate);
      const evt = await buildEvent(
        events[events.length - 1],
        "comment",
        raisedBy,
        ts,
        { note: content },
      );
      events.push(evt);
    }

    map[id] = {
      id,
      description: (row.description ?? "").toString().trim(),
      linked_assets: splitLinkedAssets(row.linked_assets),
      raised_by: raisedBy,
      state: initialStateFromCsv(row),
      current_owner: ownerName,
      current_owner_org: ownerOrg,
      waiting_on_person: null,
      waiting_on_org: null,
      since_timestamp: raisedDate,
      events,
      cost_per_day: costForPriority(priority),
      sit_on_today: false,
      sit_on_today_date: null,
      proposed_resolution_note: null,
      priority,
      raised_date: raisedDate,
    };
  }
  return map;
}

// ---------- persistence ----------

export function readBlockerState(): BlockerMap | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BlockerMap;
  } catch {
    return null;
  }
}

export function writeBlockerState(map: BlockerMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore — demo
  }
}

export function getBlocker(map: BlockerMap, id: string): Blocker | undefined {
  return map[id];
}

// ---------- state machine ----------

export type PromptKind = false | "person" | "reason" | "resolution-note" | "photo-stub";

export type ActionDef = {
  id: string;
  label: string;
  primary?: boolean;
  prompts?: PromptKind;
  nextState: BlockerStateName;
};

export const ACTIONS_BY_STATE: Record<BlockerStateName, ActionDef[]> = {
  unowned: [
    { id: "assign-self", label: "Accept ownership", primary: true, prompts: false, nextState: "accepted" },
    { id: "assign-other", label: "Assign to someone", prompts: "person", nextState: "pending-acceptance" },
    { id: "escalate", label: "Escalate to PM", nextState: "escalated" },
  ],
  "pending-acceptance": [
    { id: "accept", label: "Accept", primary: true, nextState: "accepted" },
    { id: "decline", label: "Decline — not me", prompts: "reason", nextState: "unowned" },
    { id: "reassign", label: "Reassign", prompts: "person", nextState: "pending-acceptance" },
  ],
  accepted: [
    { id: "start", label: "Mark as working", primary: true, nextState: "working" },
    { id: "block", label: "Blocked — waiting on…", prompts: "person", nextState: "awaiting-input" },
  ],
  working: [
    { id: "add-evidence", label: "Add photo evidence", prompts: "photo-stub", nextState: "working" },
    { id: "block", label: "Mark blocked by…", prompts: "person", nextState: "awaiting-input" },
    { id: "propose", label: "Propose resolved", primary: true, prompts: "resolution-note", nextState: "proposed-resolved" },
  ],
  "awaiting-input": [
    { id: "chase", label: "Chase them", prompts: false, nextState: "awaiting-input" },
    { id: "escalate", label: "Escalate to PM", nextState: "escalated" },
    { id: "unblock", label: "Mark unblocked", primary: true, nextState: "working" },
  ],
  escalated: [
    { id: "accept-pm", label: "PM accepting", nextState: "accepted" },
    { id: "reassign", label: "Reassign", prompts: "person", nextState: "pending-acceptance" },
  ],
  "proposed-resolved": [
    { id: "approve", label: "Approve & close", primary: true, nextState: "verified" },
    { id: "reject", label: "Reject — reopen", prompts: "reason", nextState: "reopened" },
  ],
  verified: [
    { id: "close", label: "Close blocker", primary: true, nextState: "closed" },
  ],
  reopened: [
    { id: "restart", label: "Restart work", primary: true, nextState: "working" },
  ],
  closed: [],
};

export function getAvailableActions(b: Blocker): ActionDef[] {
  return ACTIONS_BY_STATE[b.state] ?? [];
}

export type ActionPayload = {
  person?: { name: string; org: string };
  reason?: string;
  note?: string;
};

// Some actions are events without a state change (the next state equals the
// current one). The store records the event but skips touching since_timestamp.
function isPureEvent(action: ActionDef, current: BlockerStateName): boolean {
  return action.nextState === current;
}

export async function applyAction(
  map: BlockerMap,
  id: string,
  actionId: string,
  actor: string,
  payload: ActionPayload = {},
): Promise<BlockerMap> {
  const blocker = map[id];
  if (!blocker) return map;
  const action = (ACTIONS_BY_STATE[blocker.state] ?? []).find(
    (a) => a.id === actionId,
  );
  if (!action) return map;

  const next: Blocker = { ...blocker, events: [...blocker.events] };
  const nowIso = new Date().toISOString();
  const eventPayload: Record<string, unknown> = {};

  // --- side effects per action ---
  switch (action.id) {
    case "assign-self":
      next.current_owner = actor;
      next.current_owner_org = blocker.current_owner_org ?? null;
      eventPayload.assigned_to = actor;
      break;
    case "assign-other":
    case "reassign":
      if (payload.person) {
        next.current_owner = payload.person.name;
        next.current_owner_org = payload.person.org;
        eventPayload.assigned_to = payload.person.name;
        eventPayload.org = payload.person.org;
      }
      break;
    case "accept":
      next.current_owner = blocker.current_owner ?? actor;
      break;
    case "decline":
      next.current_owner = null;
      eventPayload.reason = payload.reason ?? "";
      break;
    case "start":
      // no field changes
      break;
    case "block":
      if (payload.person) {
        next.waiting_on_person = payload.person.name;
        next.waiting_on_org = payload.person.org;
        eventPayload.waiting_on = payload.person.name;
        eventPayload.org = payload.person.org;
      }
      break;
    case "chase":
      eventPayload.chased = next.waiting_on_person ?? "(no one)";
      break;
    case "unblock":
      next.waiting_on_person = null;
      next.waiting_on_org = null;
      break;
    case "escalate":
      eventPayload.from_state = blocker.state;
      break;
    case "accept-pm":
      next.current_owner = actor;
      break;
    case "propose":
      next.proposed_resolution_note = payload.note ?? "";
      eventPayload.note = payload.note ?? "";
      break;
    case "approve":
      break;
    case "reject":
      eventPayload.reason = payload.reason ?? "";
      next.proposed_resolution_note = null;
      break;
    case "close":
      break;
    case "restart":
      break;
    case "add-evidence":
      eventPayload.evidence = "photo-stub";
      break;
  }

  // --- record event ---
  const prev = next.events[next.events.length - 1];
  const evt = await buildEvent(
    prev,
    action.id,
    actor,
    nowIso,
    eventPayload,
  );
  next.events.push(evt);

  // --- state transition ---
  if (!isPureEvent(action, blocker.state)) {
    next.state = action.nextState;
    next.since_timestamp = nowIso;
  }

  return { ...map, [id]: next };
}

export function setSitOnToday(
  map: BlockerMap,
  id: string,
  on: boolean,
): BlockerMap {
  const blocker = map[id];
  if (!blocker) return map;
  const today = new Date().toISOString().slice(0, 10);
  return {
    ...map,
    [id]: {
      ...blocker,
      sit_on_today: on,
      sit_on_today_date: on ? today : null,
    },
  };
}

// ---------- selectors for the daily ritual ----------

export function isOpen(b: Blocker): boolean {
  return b.state !== "closed";
}

export function totalDailyExposure(map: BlockerMap): number {
  return Object.values(map)
    .filter(isOpen)
    .reduce((sum, b) => sum + b.cost_per_day, 0);
}

export function unownedBlockers(map: BlockerMap): Blocker[] {
  return Object.values(map)
    .filter((b) => b.state === "unowned")
    .sort((a, b) => b.cost_per_day - a.cost_per_day);
}

export function awaitingInputOver48h(
  map: BlockerMap,
  now: Date = new Date(),
): Blocker[] {
  return Object.values(map)
    .filter((b) => b.state === "awaiting-input" && daysInState(b, now) > 2)
    .sort((a, b) => b.cost_per_day - a.cost_per_day);
}

export function escalatedBlockers(map: BlockerMap): Blocker[] {
  return Object.values(map)
    .filter((b) => b.state === "escalated")
    .sort((a, b) => b.cost_per_day - a.cost_per_day);
}

export function starredBlockers(map: BlockerMap): Blocker[] {
  return Object.values(map).filter((b) => b.sit_on_today);
}
