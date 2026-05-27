// Activity trail — every chase, reply, silence, status flip and cost change on a
// task. Persisted in localStorage (mirrors the baseline pattern). The moat:
// silence is computed and surfaced as a first-class signal.

import {
  loadBaseline,
  holdingCompany,
  companyName,
  daysOpen,
  type Baseline,
  type BaselineTask,
} from "@/app/dashboard/lib/baseline-seed";

export type ActivityType =
  | "chase"
  | "response"
  | "status_change"
  | "note"
  | "cost_change"
  | "system";

export type Direction = "outbound" | "inbound" | "internal";

export type Channel =
  | "email"
  | "call"
  | "whatsapp"
  | "site_visit"
  | "in_person"
  | "keldra"
  | "system"
  | null;

export type Activity = {
  id: string;
  task_id: string;
  project_id: string;
  type: ActivityType;
  direction: Direction;
  channel: Channel;
  actor: { name: string; company_slug: string; role: string };
  recipient: { name: string; company_slug: string } | null;
  subject: string | null;
  body: string;
  attachments: { name: string; size_kb: number }[];
  metadata: {
    old_status?: string;
    new_status?: string;
    old_cost?: number;
    new_cost?: number;
    cost_change_reason?: string;
  };
  created_at: string;
  created_by: string;
};

const KEY = "keldra_activity";
const PROJECT = "dub16";

// ---------- seed ----------

function entry(
  id: string,
  task_id: string,
  type: ActivityType,
  direction: Direction,
  channel: Channel,
  created_at: string,
  actor: Activity["actor"],
  body: string,
  extra: Partial<Activity> = {},
): Activity {
  return {
    id,
    task_id,
    project_id: PROJECT,
    type,
    direction,
    channel,
    actor,
    recipient: null,
    subject: null,
    body,
    attachments: [],
    metadata: {},
    created_at,
    created_by: actor.name,
    ...extra,
  };
}

const JOHNNY = { name: "Johnny McKenna", company_slug: "ardmac", role: "Construction Manager" };
const KELDRA = { name: "Keldra", company_slug: "system", role: "System" };
const PAWEL = { name: "Pawel — Cental", company_slug: "cental", role: "Site lead" };

function seed(): Activity[] {
  return [
    // ELE-COLO-1030 — 75-day trail
    entry("a01", "ELE-COLO-1030", "status_change", "internal", "system", "2026-03-13T08:00:00", KELDRA,
      "Task moved to Blocked. Reason: Cental brackets not yet installed.",
      { metadata: { new_status: "Blocked" } }),
    entry("a02", "ELE-COLO-1030", "chase", "outbound", "email", "2026-03-13T14:22:00", JOHNNY,
      "Following up on programme item ELE-COLO-1030. We need brackets installed before Onnec can start fibre. What's your start date?",
      { recipient: { name: "Cental site lead", company_slug: "cental" }, subject: "Bracketery for COLO 1-4 telecoms — need start date" }),
    entry("a03", "ELE-COLO-1030", "response", "inbound", "email", "2026-03-16T09:15:00", PAWEL,
      "Hi Johnny, we've a delivery delay on the brackets from the manufacturer. Looking at 2-3 weeks. Will confirm Friday.",
      { recipient: { name: "Johnny McKenna", company_slug: "ardmac" }, subject: "RE: Bracketery for COLO 1-4 telecoms" }),
    entry("a04", "ELE-COLO-1030", "chase", "outbound", "email", "2026-03-23T11:40:00", JOHNNY,
      "Pawel, you mentioned you'd confirm Friday. We're now Monday. Onnec crew sitting. Please advise.",
      { recipient: { name: "Pawel — Cental", company_slug: "cental" }, subject: "Cental brackets — confirmation overdue" }),
    entry("a05", "ELE-COLO-1030", "chase", "outbound", "whatsapp", "2026-03-30T08:50:00", JOHNNY,
      "Pawel — any update on the brackets? Onnec have called me twice this morning. Costing us money.",
      { recipient: { name: "Pawel — Cental", company_slug: "cental" } }),
    entry("a06", "ELE-COLO-1030", "response", "inbound", "call", "2026-04-04T15:30:00", PAWEL,
      "Phone call. Pawel says brackets arrived at warehouse but install crew booked on Project Brown until 18 Apr. Will try to free 2 lads for 1 day install week of 20 Apr.",
      { recipient: { name: "Johnny McKenna", company_slug: "ardmac" } }),
    entry("a07", "ELE-COLO-1030", "cost_change", "internal", "keldra", "2026-04-12T10:00:00", JOHNNY,
      "Cost of delay raised from £15k to £20k/day. SCCR cabling now also held up — second downstream task added.",
      { metadata: { old_cost: 15000, new_cost: 20000, cost_change_reason: "Fibre runs now blocking SCCR cabling. Downstream impact widening." } }),
    entry("a08", "ELE-COLO-1030", "chase", "outbound", "site_visit", "2026-04-20T07:45:00", JOHNNY,
      "Walked the deck with Pawel. No Cental crew on site. Pawel said 'next week.' Took photo of empty brackets bay.",
      { attachments: [{ name: "IMG_20260420_0745.jpg", size_kb: 2400 }] }),
    entry("a09", "ELE-COLO-1030", "status_change", "internal", "keldra", "2026-05-01T09:00:00", JOHNNY,
      "Status confirmed blocked. Escalating to Ardmac PM lead. Cental have missed 4 verbal commitments. Formal letter being drafted.",
      { metadata: { old_status: "Blocked", new_status: "Blocked" } }),
    entry("a10", "ELE-COLO-1030", "chase", "outbound", "email", "2026-05-08T14:15:00", JOHNNY,
      "Mark, escalating to you directly. The bracketery has been open since 13 March. We have logged 5 chases and 2 commitments from Pawel that were not met. Onnec are claiming £4,200/day in standing time. Ardmac will seek cost recovery if not resolved by 15 May. Please advise plan.",
      { recipient: { name: "Mark Higgins — Cental Operations", company_slug: "cental" }, subject: "FORMAL: ELE-COLO-1030 — programme delay & cost recovery" }),
    entry("a11", "ELE-COLO-1030", "system", "internal", "keldra", "2026-05-08T14:17:00", KELDRA,
      "Letter sent to Mark Higgins — Cental Operations. Read receipt: NOT YET OPENED."),
    entry("a12", "ELE-COLO-1030", "note", "internal", "keldra", "2026-05-27T09:00:00", JOHNNY,
      "Still no response from Mark or Pawel. 19 days since formal letter. Raising in Thursday director call."),

    // ELE-ADMIN-1020 — recent unanswered Cental chases (feeds the company roll-up)
    entry("b01", "ELE-ADMIN-1020", "chase", "outbound", "email", "2026-05-10T10:00:00", JOHNNY,
      "Pawel — AD1-4 high-level bracketery. Same dependency as COLO. Need a start date this week.",
      { recipient: { name: "Pawel — Cental", company_slug: "cental" }, subject: "AD1-4 bracketery — start date" }),
    entry("b02", "ELE-ADMIN-1020", "chase", "outbound", "whatsapp", "2026-05-16T08:30:00", JOHNNY,
      "Pawel, no reply on AD1-4. MMR mech complete date 29 Jun is now at risk.",
      { recipient: { name: "Pawel — Cental", company_slug: "cental" } }),
    entry("b03", "ELE-ADMIN-1020", "chase", "outbound", "email", "2026-05-22T11:00:00", JOHNNY,
      "Third chase on AD1-4 bracketery. No response to either previous. Escalating alongside ELE-COLO-1030.",
      { recipient: { name: "Pawel — Cental", company_slug: "cental" }, subject: "AD1-4 bracketery — third chase" }),
  ];
}

// ---------- persistence ----------

function getAll(): Activity[] {
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      const s = seed();
      window.localStorage.setItem(KEY, JSON.stringify(s));
      return s;
    }
    return JSON.parse(raw) as Activity[];
  } catch {
    return seed();
  }
}

function setAll(all: Activity[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* quota — ignore */
  }
}

const byNewest = (a: Activity, b: Activity) =>
  b.created_at.localeCompare(a.created_at);

// ---------- queries ----------

export function listActivityForTask(task_id: string): Activity[] {
  return getAll().filter((e) => e.task_id === task_id).sort(byNewest);
}

// Slugs of tasks the company is held responsible for (from the baseline).
function tasksHeldBy(slug: string): Set<string> {
  const b = loadBaseline();
  const set = new Set<string>();
  for (const t of b.tasks) {
    if (holdingCompany(t) === slug || t.blocking_company === slug)
      set.add(t.activity_id);
  }
  return set;
}

export function listActivityForCompany(slug: string): Activity[] {
  const held = tasksHeldBy(slug);
  return getAll()
    .filter(
      (e) =>
        held.has(e.task_id) ||
        e.recipient?.company_slug === slug ||
        e.actor.company_slug === slug,
    )
    .sort(byNewest);
}

export function logActivity(payload: Partial<Activity>): Activity {
  const all = getAll();
  const e: Activity = {
    id: `u-${Date.now().toString(36)}`,
    task_id: payload.task_id ?? "",
    project_id: PROJECT,
    type: payload.type ?? "note",
    direction: payload.direction ?? "internal",
    channel: payload.channel ?? null,
    actor: payload.actor ?? JOHNNY,
    recipient: payload.recipient ?? null,
    subject: payload.subject ?? null,
    body: payload.body ?? "",
    attachments: payload.attachments ?? [],
    metadata: payload.metadata ?? {},
    created_at: new Date().toISOString(),
    created_by: payload.actor?.name ?? JOHNNY.name,
  };
  all.push(e);
  setAll(all);
  return e;
}

const DAY = 86400000;

export type SilenceMetrics = {
  days_since_last_outbound: number;
  days_since_last_inbound: number;
  days_since_any: number;
  outbound_count: number;
  inbound_count: number;
  response_rate: number;
};

// Whole calendar days (date-only, ignores time-of-day) so "19 days" reads 19.
function daysSince(iso: string | null): number {
  if (!iso) return Infinity;
  const a = new Date();
  a.setHours(0, 0, 0, 0);
  const b = new Date(iso);
  b.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((a.getTime() - b.getTime()) / DAY));
}

export function metricsFor(entries: Activity[]): SilenceMetrics {
  const outbound = entries.filter((e) => e.direction === "outbound");
  const inbound = entries.filter((e) => e.direction === "inbound");
  const latest = (list: Activity[]) =>
    list.length ? list.slice().sort(byNewest)[0].created_at : null;
  return {
    days_since_last_outbound: daysSince(latest(outbound)),
    days_since_last_inbound: daysSince(latest(inbound)),
    days_since_any: daysSince(latest(entries)),
    outbound_count: outbound.length,
    inbound_count: inbound.length,
    response_rate: outbound.length
      ? Math.round((inbound.length / outbound.length) * 100)
      : 0,
  };
}

export function computeSilenceMetrics(task_id: string): SilenceMetrics {
  return metricsFor(listActivityForTask(task_id));
}

export type SilentTask = {
  activity_id: string;
  name: string;
  held_by: string | null;
  cost_per_day: number;
  days_open: number;
  days_silent: number;
};

// Blocked, chased at least once, but no outbound in `threshold` days.
export function listSilentTasks(threshold = 14): SilentTask[] {
  const b = loadBaseline();
  const out: SilentTask[] = [];
  for (const t of b.tasks) {
    if (t.status !== "blocked") continue;
    const m = computeSilenceMetrics(t.activity_id);
    if (m.outbound_count === 0) continue;
    if (m.days_since_last_outbound <= threshold) continue;
    const open = t.planned_start ? daysSince(t.planned_start) : 0;
    out.push({
      activity_id: t.activity_id,
      name: t.name,
      held_by: holdingCompany(t),
      cost_per_day: t.cost_per_day,
      days_open: open,
      days_silent: m.days_since_last_outbound,
    });
  }
  return out.sort((a, b2) => b2.cost_per_day - a.cost_per_day);
}

// For a company timeline: is this outbound chase still unanswered (no inbound
// from the recipient on the same task within 7 days)?
export function isUnanswered(entry: Activity, all: Activity[]): boolean {
  if (entry.direction !== "outbound") return false;
  const sent = new Date(entry.created_at).getTime();
  return !all.some(
    (e) =>
      e.task_id === entry.task_id &&
      e.direction === "inbound" &&
      new Date(e.created_at).getTime() > sent &&
      new Date(e.created_at).getTime() <= sent + 7 * DAY,
  );
}

// ---------- synopsis (executive summary of a task's trail) ----------

export type SynopsisRow = { bold: string; detail: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDMY(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
}
function fmtDM(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
function dateDaysSince(iso: string, now: number): number {
  const a = new Date(now);
  a.setHours(0, 0, 0, 0);
  const b = new Date(iso);
  b.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((a.getTime() - b.getTime()) / DAY));
}
function relTimeWords(iso: string, now: number): string {
  const ms = now - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(ms / 3_600_000);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(ms / DAY);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
function firstName(name: string): string {
  return name.split(/[\s—-]+/).filter(Boolean)[0] ?? name;
}
function lastSentence(text: string): string {
  const parts = text.trim().split(/[.!?]\s+/).filter(Boolean);
  const s = (parts[parts.length - 1] ?? text).trim().replace(/[.!?]+$/, "").trim();
  return s.charAt(0).toLowerCase() + s.slice(1);
}
function modeOf(arr: string[]): string {
  const m = new Map<string, number>();
  let best = arr[0] ?? "";
  let bestN = 0;
  for (const x of arr) {
    const n = (m.get(x) ?? 0) + 1;
    m.set(x, n);
    if (n > bestN) {
      bestN = n;
      best = x;
    }
  }
  return best;
}
function readStatusFrom(entries: Activity[]): string | null {
  for (const e of entries) {
    if (e.type !== "system") continue;
    const b = e.body.toLowerCase();
    if (b.includes("not yet opened") || b.includes("not opened") || b.includes("unread")) {
      return "NOT YET OPENED";
    }
    if (b.includes("opened") || b.includes("read receipt: read")) return "OPENED";
  }
  return null;
}
function actionShort(e: Activity): string {
  switch (e.type) {
    case "note":
      return lastSentence(e.body);
    case "status_change":
      return e.metadata.new_status ? `moved task to ${e.metadata.new_status}` : "updated status";
    case "chase":
      return e.recipient ? `chased ${firstName(e.recipient.name)}` : "sent a chase";
    case "response":
      return "replied";
    case "cost_change":
      return "changed the cost of delay";
    default:
      return lastSentence(e.body);
  }
}

// Auto-computed executive summary for a task's activity trail — 4-6 rows, each
// row skipped when its source data isn't present.
export function buildSynopsis(
  task: BaselineTask,
  entries: Activity[],
  b: Baseline,
): SynopsisRow[] {
  const rows: SynopsisRow[] = [];
  const now = Date.now();
  const asc = [...entries].sort(
    (a, z) => new Date(a.created_at).getTime() - new Date(z.created_at).getTime(),
  );

  // Row 1 — age + start (always available)
  rows.push({
    bold: `${daysOpen(task)} days open`,
    detail: `· since ${fmtDMY(task.planned_start)}`,
  });

  // Row 2 — outbound chases
  const outbound = asc.filter((e) => e.direction === "outbound");
  if (outbound.length > 0) {
    rows.push({
      bold: `${outbound.length} outbound chase${outbound.length === 1 ? "" : "s"}`,
      detail: `sent by ${modeOf(outbound.map((e) => e.actor.name))}`,
    });
  }

  // Row 3 — responses
  const responses = asc.filter((e) => e.direction === "inbound" && e.type === "response");
  if (responses.length > 0) {
    const company = companyName(b, responses[0].actor.company_slug);
    const who = firstName(responses[0].actor.name);
    const dates = responses.map((e) => fmtDM(e.created_at)).join(" + ");
    const stuck = task.status === "blocked" || task.status === "not_started_should_be";
    rows.push({
      bold: `${responses.length} response${responses.length === 1 ? "" : "s"}`,
      detail: `from ${company} (${who}, ${dates})${stuck ? " — neither led to action" : ""}`,
    });
  }

  // Row 4 — formal escalation
  const esc = asc.find(
    (e) => e.direction === "outbound" && (e.subject ?? "").toUpperCase().includes("FORMAL"),
  );
  if (esc) {
    const recip = esc.recipient?.name?.split(" — ")[0] ?? esc.recipient?.name ?? "recipient";
    const read = readStatusFrom(asc);
    rows.push({
      bold: `Formal escalation to ${recip}`,
      detail: `on ${fmtDM(esc.created_at)} · ${dateDaysSince(esc.created_at, now)} days ago${read ? ` · ${read}` : ""}`,
    });
  }

  // Row 5 — cost change
  const cost = asc.find((e) => e.type === "cost_change" && e.metadata.new_cost != null);
  if (cost) {
    const oldK = Math.round((cost.metadata.old_cost ?? 0) / 1000);
    const newK = Math.round((cost.metadata.new_cost ?? 0) / 1000);
    const reason = cost.metadata.cost_change_reason
      ? lastSentence(cost.metadata.cost_change_reason)
      : "";
    rows.push({
      bold: `Cost raised from £${oldK}k to £${newK}k/day`,
      detail: `on ${fmtDM(cost.created_at)}${reason ? ` (${reason})` : ""}`,
    });
  }

  // Row 6 — last activity
  const last = asc[asc.length - 1];
  if (last) {
    rows.push({
      bold: `Last activity ${relTimeWords(last.created_at, now)}`,
      detail: `· ${last.actor.name} ${actionShort(last)}`,
    });
  }

  return rows;
}
