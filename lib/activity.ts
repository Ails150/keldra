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
    photo_url?: string;
    // Set on entries bridged in from a phone field capture (mer_field_events).
    field?: boolean;
    kind?: string;
    with_party?: string | null;
    // Set on entries bridged in from the email thread (task_emails). Renders a
    // "via email" badge and downloadable (signed-URL) attachments.
    via_email?: boolean;
    email_attachments?: { name: string; url: string }[];
  };
  created_at: string;
  created_by: string;
};

const KEY = "keldra_activity";
const PROJECT = "mer";

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

const LEAD = { name: "Commissioning Lead", company_slug: "main-contractor", role: "Construction Manager" };
const KELDRA = { name: "Keldra", company_slug: "system", role: "System" };
const SITE_LEAD = { name: "Site Lead — MEP Sub", company_slug: "mep-sub", role: "Site lead" };
const PROJ_ENG = { name: "Project Engineer", company_slug: "main-contractor", role: "Project Engineer" };
const DESIGN_DIR = { name: "Design Director — Design House", company_slug: "design-house", role: "Design Lead" };
const DESIGN_ENG = { name: "Design Engineer — Design House", company_slug: "design-house", role: "Design Engineer" };
const DRAWINGS_LEAD = { name: "Drawings Lead — Drawings Office", company_slug: "drawings-office", role: "Drawings Lead" };
const PROC_LEAD = { name: "Procurement Lead — Sprinkler Sub", company_slug: "sprinkler-sub", role: "Procurement Lead" };

// Reused recipients.
const TO_LEAD = { name: "Commissioning Lead", company_slug: "main-contractor" };
const TO_DESIGN_HOUSE = { name: "Design Director — Design House", company_slug: "design-house" };
const TO_DESIGN_HOUSE_DOORS = { name: "Design Engineer — Design House", company_slug: "design-house" };
const TO_DRAWINGS = { name: "Drawings Lead — Drawings Lead", company_slug: "drawings-office" };
const TO_PROC = { name: "Procurement Lead — Sprinkler Sub Procurement", company_slug: "sprinkler-sub" };

function seed(): Activity[] {
  return [
    // ELE-COLO-1030 — 75-day trail
    entry("a01", "ELE-COLO-1030", "status_change", "internal", "system", "2026-03-13T08:00:00", KELDRA,
      "Task moved to Blocked. Reason: MEP Sub brackets not yet installed.",
      { metadata: { new_status: "Blocked" } }),
    entry("a02", "ELE-COLO-1030", "chase", "outbound", "email", "2026-03-13T14:22:00", LEAD,
      "Following up on programme item ELE-COLO-1030. We need brackets installed before Telecoms Sub can start fibre. What's your start date?",
      { recipient: { name: "MEP Sub site lead", company_slug: "mep-sub" }, subject: "Bracketery for COLO 1-4 telecoms — need start date" }),
    entry("a03", "ELE-COLO-1030", "response", "inbound", "email", "2026-03-16T09:15:00", SITE_LEAD,
      "Hi Commissioning Lead, we've a delivery delay on the brackets from the manufacturer. Looking at 2-3 weeks. Will confirm Friday.",
      { recipient: { name: "Commissioning Lead", company_slug: "main-contractor" }, subject: "RE: Bracketery for COLO 1-4 telecoms" }),
    entry("a04", "ELE-COLO-1030", "chase", "outbound", "email", "2026-03-23T11:40:00", LEAD,
      "Site Lead, you mentioned you'd confirm Friday. We're now Monday. Telecoms Sub crew sitting. Please advise.",
      { recipient: { name: "Site Lead — MEP Sub", company_slug: "mep-sub" }, subject: "MEP Sub brackets — confirmation overdue" }),
    entry("a05", "ELE-COLO-1030", "chase", "outbound", "whatsapp", "2026-03-30T08:50:00", LEAD,
      "Site Lead — any update on the brackets? Telecoms Sub have called me twice this morning. Costing us money.",
      { recipient: { name: "Site Lead — MEP Sub", company_slug: "mep-sub" } }),
    entry("a06", "ELE-COLO-1030", "response", "inbound", "call", "2026-04-04T15:30:00", SITE_LEAD,
      "Phone call. Site Lead says brackets arrived at warehouse but install crew booked on Project Brown until 18 Apr. Will try to free 2 lads for 1 day install week of 20 Apr.",
      { recipient: { name: "Commissioning Lead", company_slug: "main-contractor" } }),
    entry("a07", "ELE-COLO-1030", "cost_change", "internal", "keldra", "2026-04-12T10:00:00", LEAD,
      "Cost of delay raised from £15k to £20k/day. SCCR cabling now also held up — second downstream task added.",
      { metadata: { old_cost: 15000, new_cost: 20000, cost_change_reason: "Fibre runs now blocking SCCR cabling. Downstream impact widening." } }),
    entry("a08", "ELE-COLO-1030", "chase", "outbound", "site_visit", "2026-04-20T07:45:00", LEAD,
      "Walked the deck with Site Lead. No MEP Sub crew on site. Site Lead said 'next week.' Took photo of empty brackets bay.",
      { attachments: [{ name: "IMG_20260420_0745.jpg", size_kb: 2400 }] }),
    entry("a09", "ELE-COLO-1030", "status_change", "internal", "keldra", "2026-05-01T09:00:00", LEAD,
      "Status confirmed blocked. Escalating to Main Contractor PM lead. MEP Sub have missed 4 verbal commitments. Formal letter being drafted.",
      { metadata: { old_status: "Blocked", new_status: "Blocked" } }),
    entry("a10", "ELE-COLO-1030", "chase", "outbound", "email", "2026-05-08T14:15:00", LEAD,
      "Operations Manager, escalating to you directly. The bracketery has been open since 13 March. We have logged 5 chases and 2 commitments from Site Lead that were not met. Telecoms Sub are claiming £4,200/day in standing time. Main Contractor will seek cost recovery if not resolved by 15 May. Please advise plan.",
      { recipient: { name: "Operations Manager — MEP Sub Operations", company_slug: "mep-sub" }, subject: "FORMAL: ELE-COLO-1030 — programme delay & cost recovery" }),
    entry("a11", "ELE-COLO-1030", "system", "internal", "keldra", "2026-05-08T14:17:00", KELDRA,
      "Letter sent to Operations Manager — MEP Sub Operations. Read receipt: NOT YET OPENED."),
    entry("a12", "ELE-COLO-1030", "note", "internal", "keldra", "2026-05-27T09:00:00", LEAD,
      "Still no response from Operations Manager or Site Lead. 19 days since formal letter. Raising in Thursday director call."),

    // ELE-ADMIN-1020 — recent unanswered MEP Sub chases (feeds the company roll-up)
    entry("b01", "ELE-ADMIN-1020", "chase", "outbound", "email", "2026-05-10T10:00:00", LEAD,
      "Site Lead — AD1-4 high-level bracketery. Same dependency as COLO. Need a start date this week.",
      { recipient: { name: "Site Lead — MEP Sub", company_slug: "mep-sub" }, subject: "AD1-4 bracketery — start date" }),
    entry("b02", "ELE-ADMIN-1020", "chase", "outbound", "whatsapp", "2026-05-16T08:30:00", LEAD,
      "Site Lead, no reply on AD1-4. MMR mech complete date 29 Jun is now at risk.",
      { recipient: { name: "Site Lead — MEP Sub", company_slug: "mep-sub" } }),
    entry("b03", "ELE-ADMIN-1020", "chase", "outbound", "email", "2026-05-22T11:00:00", LEAD,
      "Third chase on AD1-4 bracketery. No response to either previous. Escalating alongside ELE-COLO-1030.",
      { recipient: { name: "Site Lead — MEP Sub", company_slug: "mep-sub" }, subject: "AD1-4 bracketery — third chase" }),

    // ===== Design House — 18 chases / 4 responses (~22% · ~11d) =====
    // Water services (MEC-COLO-1040) + FOK doors (SEC-COLO-1000). Slow, not silent.
    entry("s01", "MEC-COLO-1040", "chase", "outbound", "email", "2026-03-10T08:40:00", LEAD,
      "Kicking off COLO 1-4 water services & connections — we need the Status A spec to release first-fix. When can you issue?",
      { recipient: TO_DESIGN_HOUSE, subject: "MEC-COLO-1040 water services — Status A needed" }),
    entry("s02", "SEC-COLO-1000", "chase", "outbound", "keldra", "2026-03-13T09:10:00", PROJ_ENG,
      "Chasing the FOK door-type schedule for Security COLO. Door procurement is gated on your sign-off — when can we expect it?",
      { recipient: TO_DESIGN_HOUSE_DOORS, subject: "SEC-COLO FOK door types — schedule?" }),
    entry("s03", "MEC-COLO-1040", "chase", "outbound", "email", "2026-03-18T10:05:00", LEAD,
      "Following up on the water services package. No issue date yet — MMR1 first-fix is gated on this.",
      { recipient: TO_DESIGN_HOUSE, subject: "MEC-COLO-1040 water services — follow-up" }),
    entry("s04", "SEC-COLO-1000", "chase", "outbound", "keldra", "2026-03-24T08:25:00", PROJ_ENG,
      "FOK doors — no schedule yet. Door delivery slips every week this stays open.",
      { recipient: TO_DESIGN_HOUSE_DOORS }),
    entry("s05", "MEC-COLO-1040", "chase", "outbound", "email", "2026-03-27T14:30:00", LEAD,
      "Water services spec still outstanding. Can you give me a firm Status A date this week?",
      { recipient: TO_DESIGN_HOUSE, subject: "MEC-COLO-1040 — firm date please" }),
    entry("s06", "SEC-COLO-1000", "chase", "outbound", "keldra", "2026-03-31T09:00:00", PROJ_ENG,
      "Following up on FOK door types. Can you confirm which types are signed off so we can release the order?",
      { recipient: TO_DESIGN_HOUSE_DOORS }),
    entry("s07", "MEC-COLO-1040", "chase", "outbound", "email", "2026-04-06T08:15:00", LEAD,
      "Chasing water services again — we're now three weeks past the planned start for MEC-COLO-1040.",
      { recipient: TO_DESIGN_HOUSE, subject: "MEC-COLO-1040 — three weeks overdue" }),
    entry("s08", "SEC-COLO-1000", "chase", "outbound", "keldra", "2026-04-09T11:20:00", PROJ_ENG,
      "FOK doors still pending. We need the full type schedule to place the procurement.",
      { recipient: TO_DESIGN_HOUSE_DOORS }),
    entry("s09", "MEC-COLO-1040", "chase", "outbound", "email", "2026-04-14T09:45:00", LEAD,
      "Any movement on the water services Status A? M&E first-fix can't proceed without it.",
      { recipient: TO_DESIGN_HOUSE, subject: "MEC-COLO-1040 — Status A?" }),
    entry("s10", "SEC-COLO-1000", "chase", "outbound", "keldra", "2026-04-20T08:50:00", PROJ_ENG,
      "FOK door schedule — third chase. Security COLO completion depends on it.",
      { recipient: TO_DESIGN_HOUSE_DOORS }),
    entry("s11", "MEC-COLO-1040", "chase", "outbound", "email", "2026-04-23T10:30:00", LEAD,
      "Water services spec — fourth week open. This is becoming critical path. Please advise.",
      { recipient: TO_DESIGN_HOUSE, subject: "MEC-COLO-1040 — critical path" }),
    entry("s12", "SEC-COLO-1000", "chase", "outbound", "keldra", "2026-04-28T09:15:00", PROJ_ENG,
      "Any update on FOK door types? We're holding the door order waiting on you.",
      { recipient: TO_DESIGN_HOUSE_DOORS }),
    entry("s13", "MEC-COLO-1040", "chase", "outbound", "email", "2026-05-01T08:30:00", LEAD,
      "Still no Status A on water services. We need to talk timelines today.",
      { recipient: TO_DESIGN_HOUSE, subject: "MEC-COLO-1040 — timelines call" }),
    entry("s14", "MEC-COLO-1040", "chase", "outbound", "email", "2026-05-06T07:50:00", LEAD,
      "Design Director — escalating formally. The water services spec has been open since 13 March. We have logged 12+ chases. MMR1 first-fix cannot start without Status A — this is now the critical path to BU. Please confirm a release date by 13 May or we escalate to client governance.",
      { recipient: { name: "Design Director — Design House Director", company_slug: "design-house" }, subject: "FORMAL: MEC-COLO-1040 — water services spec overdue" }),
    entry("s14b", "MEC-COLO-1040", "system", "internal", "keldra", "2026-05-06T07:52:00", KELDRA,
      "Letter sent to Design Director — Design House Director. Read receipt: NOT YET OPENED."),
    entry("s15", "SEC-COLO-1000", "chase", "outbound", "keldra", "2026-05-11T09:05:00", PROJ_ENG,
      "FOK doors — types 4-6 still outstanding per your last note. Timeline?",
      { recipient: TO_DESIGN_HOUSE_DOORS }),
    entry("s16", "MEC-COLO-1040", "chase", "outbound", "email", "2026-05-13T08:40:00", LEAD,
      "Post-escalation: still awaiting water services release. Director sign-off was due last week.",
      { recipient: TO_DESIGN_HOUSE, subject: "MEC-COLO-1040 — still awaiting release" }),
    entry("s17", "SEC-COLO-1000", "chase", "outbound", "keldra", "2026-05-20T09:30:00", PROJ_ENG,
      "FOK doors — still awaiting types 4-6 sign-off. This is holding Security COLO.",
      { recipient: TO_DESIGN_HOUSE_DOORS }),
    entry("s18", "MEC-COLO-1040", "chase", "outbound", "email", "2026-05-26T08:20:00", LEAD,
      "Water services spec — no release yet. Raising at Thursday governance call.",
      { recipient: TO_DESIGN_HOUSE, subject: "MEC-COLO-1040 — governance escalation" }),
    entry("sr1", "MEC-COLO-1040", "response", "inbound", "email", "2026-03-23T16:20:00", DESIGN_DIR,
      "Hi Commissioning Lead — water services package is with our M&E consultant for review. Expecting comments back end of next week, will issue Status A once incorporated.",
      { recipient: TO_LEAD, subject: "RE: MEC-COLO-1040 water services" }),
    entry("sr2", "SEC-COLO-1000", "response", "inbound", "email", "2026-04-13T15:40:00", DESIGN_ENG,
      "Apologies for the delay. FOK schedule needs structural input on the SER wall build-up before we can finalise door types. Chasing internally.",
      { recipient: TO_LEAD, subject: "RE: SEC-COLO FOK door types" }),
    entry("sr3", "MEC-COLO-1040", "response", "inbound", "email", "2026-05-05T17:10:00", DESIGN_DIR,
      "Water services Status A is drafted but awaiting director sign-off before release. Hoping to clear this week.",
      { recipient: TO_LEAD, subject: "RE: MEC-COLO-1040 — Status A" }),
    entry("sr4", "SEC-COLO-1000", "response", "inbound", "email", "2026-05-18T14:05:00", DESIGN_ENG,
      "Partial issue on FOK doors attached — types 1-3 confirmed, types 4-6 still under review with the client security team.",
      { recipient: TO_LEAD, subject: "RE: SEC-COLO FOK door types — partial" }),

    // ===== Drawings Office — 11 chases / 1 response (~9% · ~21d) =====
    // External Service Support Steel (FAB-ADMIN-1120) — Drawings Lead can't sign without Design Lead's lights spec.
    entry("m01", "FAB-ADMIN-1120", "chase", "outbound", "email", "2026-03-25T09:00:00", LEAD,
      "Drawings Lead — we need the external service support steel drawings signed off. Modular fab is waiting. Any update?",
      { recipient: TO_DRAWINGS, subject: "FAB-ADMIN-1120 steel drawings — sign-off" }),
    entry("m02", "FAB-ADMIN-1120", "chase", "outbound", "keldra", "2026-03-30T10:15:00", PROJ_ENG,
      "Drawings Lead, chasing the steel drawings again. Design Lead's external lights spec is the dependency — has it reached you?",
      { recipient: TO_DRAWINGS }),
    entry("m03", "FAB-ADMIN-1120", "chase", "outbound", "email", "2026-04-02T08:30:00", LEAD,
      "Steel drawings for external service support — still unsigned. Drawings Lead, what's blocking you?",
      { recipient: TO_DRAWINGS, subject: "FAB-ADMIN-1120 — what's blocking?" }),
    entry("m04", "FAB-ADMIN-1120", "chase", "outbound", "keldra", "2026-04-07T11:00:00", PROJ_ENG,
      "Drawings Lead — third chase. We can't cut steel without your sign-off. Is the lights spec still the holdup?",
      { recipient: TO_DRAWINGS }),
    entry("m05", "FAB-ADMIN-1120", "chase", "outbound", "email", "2026-04-13T09:20:00", LEAD,
      "External steel drawings — two weeks past when we needed them. Please advise.",
      { recipient: TO_DRAWINGS, subject: "FAB-ADMIN-1120 — overdue" }),
    entry("m06", "FAB-ADMIN-1120", "chase", "outbound", "keldra", "2026-04-28T10:40:00", PROJ_ENG,
      "Drawings Lead, following your partial response — when can you issue the full steel package?",
      { recipient: TO_DRAWINGS }),
    entry("m07", "FAB-ADMIN-1120", "chase", "outbound", "email", "2026-05-04T08:50:00", LEAD,
      "Steel drawings — lighting bracket details still outstanding. Has Design Lead issued the lights spec yet?",
      { recipient: TO_DRAWINGS, subject: "FAB-ADMIN-1120 — lighting brackets" }),
    entry("m08", "FAB-ADMIN-1120", "chase", "outbound", "keldra", "2026-05-07T09:35:00", PROJ_ENG,
      "Drawings Lead — still waiting on the full steel sign-off. Fab slot is slipping.",
      { recipient: TO_DRAWINGS }),
    entry("m09", "FAB-ADMIN-1120", "chase", "outbound", "email", "2026-05-12T10:10:00", LEAD,
      "External service steel — no movement. This is holding the facility modules.",
      { recipient: TO_DRAWINGS, subject: "FAB-ADMIN-1120 — holding modules" }),
    entry("m10", "FAB-ADMIN-1120", "chase", "outbound", "keldra", "2026-05-15T08:45:00", PROJ_ENG,
      "Drawings Lead, fifth-plus chase on the steel drawings. Need a date.",
      { recipient: TO_DRAWINGS }),
    entry("m11", "FAB-ADMIN-1120", "chase", "outbound", "email", "2026-05-20T09:25:00", LEAD,
      "Steel drawings still unsigned. Raising at Thursday governance call.",
      { recipient: TO_DRAWINGS, subject: "FAB-ADMIN-1120 — governance escalation" }),
    entry("mr1", "FAB-ADMIN-1120", "response", "inbound", "email", "2026-04-24T16:50:00", DRAWINGS_LEAD,
      "Commissioning Lead — reviewed the external service steel drawings. I can sign the primary supports, but the lighting bracket details depend on Design Lead's spec which I still don't have. Can't issue the full package yet.",
      { recipient: TO_LEAD, subject: "RE: FAB-ADMIN-1120 steel drawings" }),

    // ===== Sprinkler Sub — 6 chases / 2 responses (~33% · ~9d) =====
    // Sprinkler diesel pumps (PRO-1110) + Generator A (FAB-2000). Deflective: supplier delays.
    entry("f01", "PRO-1110", "chase", "outbound", "email", "2026-03-02T08:30:00", LEAD,
      "Procurement Lead — where are we on the sprinkler diesel pump gensets (PRO-1110)? It's overdue and holding the FER BU room.",
      { recipient: TO_PROC, subject: "PRO-1110 diesel pumps — delivery date?" }),
    entry("f02", "PRO-1110", "chase", "outbound", "keldra", "2026-03-05T10:00:00", PROJ_ENG,
      "Procurement Lead, chasing the diesel pump delivery date. We need it for the sprinkler package.",
      { recipient: TO_PROC }),
    entry("f03", "FAB-2000", "chase", "outbound", "email", "2026-04-13T09:10:00", LEAD,
      "Procurement Lead — Generator A install (FAB-2000) is due to start soon. Is the unit on site or in transit?",
      { recipient: TO_PROC, subject: "FAB-2000 Generator A — on site?" }),
    entry("f04", "PRO-1110", "chase", "outbound", "keldra", "2026-04-17T11:30:00", PROJ_ENG,
      "Diesel pump gensets — still no firm date. The 14-week lead time you quoted lands when exactly?",
      { recipient: TO_PROC }),
    entry("f05", "FAB-2000", "chase", "outbound", "email", "2026-04-30T08:40:00", LEAD,
      "Procurement Lead, Generator A has slipped again per your note. We need a committed delivery date.",
      { recipient: TO_PROC, subject: "FAB-2000 — committed date needed" }),
    entry("f06", "PRO-1110", "chase", "outbound", "keldra", "2026-05-07T09:50:00", PROJ_ENG,
      "Procurement Lead — diesel pumps and Generator A both outstanding. Both are on the BU critical path now.",
      { recipient: TO_PROC }),
    entry("fr1", "PRO-1110", "response", "inbound", "email", "2026-03-09T15:25:00", PROC_LEAD,
      "Commissioning Lead — the diesel pump gensets are with the manufacturer, we've been quoted a 14-week lead time from order. I'm pushing for an earlier slot but it's a supplier constraint.",
      { recipient: TO_LEAD, subject: "RE: PRO-1110 diesel pumps" }),
    entry("fr2", "FAB-2000", "response", "inbound", "email", "2026-04-27T16:15:00", PROC_LEAD,
      "Generator A delivery has slipped again — our supplier flagged a parts shortage. Best case now early June. I'll confirm a firm date when I have it.",
      { recipient: TO_LEAD, subject: "RE: FAB-2000 Generator A" }),
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
    actor: payload.actor ?? LEAD,
    recipient: payload.recipient ?? null,
    subject: payload.subject ?? null,
    body: payload.body ?? "",
    attachments: payload.attachments ?? [],
    metadata: payload.metadata ?? {},
    created_at: new Date().toISOString(),
    created_by: payload.actor?.name ?? LEAD.name,
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

  // Row — live field reports logged from a phone on site (the loop into the trail)
  const field = asc.filter((e) => e.metadata.field);
  if (field.length > 0) {
    const last = field[field.length - 1];
    const note = last.body ? lastSentence(last.body) : last.metadata.kind ?? "field entry";
    rows.push({
      bold: `${field.length} field report${field.length === 1 ? "" : "s"} from site`,
      detail: `latest ${relTimeWords(last.created_at, now)} — ${note}`,
    });
  }

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
