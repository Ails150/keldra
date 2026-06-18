import "server-only";
import { randomBytes } from "crypto";
import { hashBlockerEvent, normalizeTs } from "@/lib/blockers/event-hash";
import { createAdminClient } from "@/lib/supabase/admin";
import { BASELINE_TASKS, COMPANIES } from "@/app/dashboard/lib/baseline-seed";
import { generateAssets } from "@/app/dashboard/lib/demo-assets";

type Admin = ReturnType<typeof createAdminClient>;

const DAY = 86_400_000;
const isoDaysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();
const dateDaysAgo = (n: number) => isoDaysAgo(n).slice(0, 10);

// The worked-example shape. Everything below is the SEED'S OWN identifiers, so a
// re-run can delete exactly these rows (scoped to the calling org) and re-insert
// — idempotent + non-destructive to any unrelated data the org may hold.
const GATES = [
  { code: "A", name: "Containment & first fix", target_date: dateDaysAgo(120), sort: 1, milestone_code: null as string | null, depends_on: [] as string[] },
  { code: "B", name: "Power distribution live", target_date: dateDaysAgo(75), sort: 2, milestone_code: null, depends_on: [] },
  { code: "C", name: "COLO Hall 1 cooling", target_date: dateDaysAgo(60), sort: 3, milestone_code: "ENERGISATION", depends_on: [] },
  { code: "D", name: "Energisation (yellow tag)", target_date: "2026-11-04", sort: 4, milestone_code: "ENERGISATION", depends_on: ["C"] },
  { code: "E", name: "Beneficial Use (green tag)", target_date: "2026-12-02", sort: 5, milestone_code: "BU", depends_on: ["C", "D"] },
];
const GATE_CODES = GATES.map((g) => g.code);

const MILESTONES = [
  { code: "ENERGISATION", name: "Energisation", target_date: "2026-11-04" },
  { code: "BU", name: "Beneficial Use", target_date: "2026-12-02" },
];

// Blockers on the blocked gate (C). Each maps to a real BASELINE task so the
// trail + AI summary resolve. `since` drives days-blocked; ELE-COLO-1030 is the
// 90-day hero. state/priority/cost/owner come from the baseline task.
const BLOCKERS: { code: string; since: number; state: string }[] = [
  { code: "ELE-COLO-1030", since: 90, state: "awaiting-input" },
  { code: "ELE-MER-1010", since: 34, state: "unowned" },
  { code: "MEC-COLO-1040", since: 56, state: "awaiting-input" },
  { code: "ELE-ADMIN-1020", since: 46, state: "awaiting-input" },
  { code: "FAB-ADMIN-1120", since: 62, state: "awaiting-input" },
  { code: "CX-1180", since: 18, state: "unowned" },
  { code: "SEC-COLO-1000", since: 40, state: "awaiting-input" },
  { code: "PRO-1110", since: 30, state: "unowned" },
];
// Seed-owned identifiers for the clean replace: the full template gate ladder
// (incl. the legacy "BU" gate the A–E ladder supersedes) and the entire baseline
// task universe (so any blocker the seed/baseline ever created is replaced).
// These are seed/template artifacts — never a real customer's own data.
const SEED_GATE_CODES = [...GATES.map((g) => g.code), "BU"];
const ALL_BASELINE_CODES = BASELINE_TASKS.map((t) => t.activity_id);

// ---- blocker audit trail (dated, hash-chained) -------------------------------
// Every blocker gets a real back-and-forth in the History panel — dated across
// its open period, NOT all "today". The hero (ELE-COLO-1030) carries the full
// documented story: 8 outbound chases, MEP Sub's replies, the unopened formal
// escalation, and the cost-of-delay raise. seq + prev_hash/hash are chained.
type SeedEvent = { ago: number; type: string; actor: string; note?: string };

const compName = (slug: string | null): string =>
  COMPANIES.find((c) => c.slug === slug)?.name ?? (slug || "the responsible party");

const HERO_EVENTS: SeedEvent[] = [
  { ago: 90, type: "raised",     actor: "Commissioning Lead", note: "Brackets not installed by MEP Sub — Telecoms Sub can't run fibre." },
  { ago: 88, type: "chase",      actor: "Commissioning Lead", note: "Chased MEP Sub for a bracket install date." },
  { ago: 85, type: "respond",    actor: "MEP Sub",            note: "Will have lads on it next week, chasing materials." },
  { ago: 74, type: "chase",      actor: "Commissioning Lead", note: "Chase 2 — still no brackets on site." },
  { ago: 66, type: "chase",      actor: "Commissioning Lead", note: "Chase 3 — now on the critical path for Gate C." },
  { ago: 60, type: "chase",      actor: "Commissioning Lead", note: "Chase 4 — please confirm a firm date today." },
  { ago: 53, type: "respond",    actor: "MEP Sub",            note: "Brackets arrived — but the crew was moved to Project Brown." },
  { ago: 47, type: "chase",      actor: "Commissioning Lead", note: "Chase 5 — crew diverted off MER, need them back." },
  { ago: 44, type: "respond",    actor: "MEP Sub",            note: "Friday for definite, 2 lads allocated." },
  { ago: 37, type: "chase",      actor: "Commissioning Lead", note: "Chase 6 — Friday came and went, no show." },
  { ago: 28, type: "chase",      actor: "Commissioning Lead", note: "Chase 7 — fourth broken commitment." },
  { ago: 19, type: "escalate",   actor: "Commissioning Lead", note: "Formal escalation to MEP Sub Operations Manager — still unopened." },
  { ago: 12, type: "chase",      actor: "Commissioning Lead", note: "Chase 8 — FORMAL notice: programme delay & cost recovery." },
  { ago: 10, type: "cost-raise", actor: "Commissioning Lead", note: "£20,000/day" },
];

function genBlockerEvents(
  b: { code: string; since: number; state: string },
  t: { blocked_reason: string | null; blocking_company: string | null },
): SeedEvent[] {
  if (b.code === "ELE-COLO-1030") return HERO_EVENTS;
  const held = compName(t.blocking_company);
  const evs: SeedEvent[] = [
    { ago: b.since, type: "raised", actor: "Commissioning Lead", note: t.blocked_reason ?? undefined },
    { ago: Math.max(2, Math.round(b.since * 0.75)), type: "chase", actor: "Commissioning Lead", note: `Chased ${held} for a date.` },
  ];
  if (b.since >= 30) evs.push({ ago: Math.round(b.since * 0.5), type: "respond", actor: held, note: "Looking into it — will revert." });
  evs.push({ ago: Math.max(2, Math.round(b.since * 0.25)), type: "chase", actor: "Commissioning Lead", note: "Chase 2 — still open, please confirm a date." });
  if (b.state === "awaiting-input" || b.state === "escalated")
    evs.push({ ago: Math.max(1, Math.round(b.since * 0.1)), type: "escalate", actor: "Commissioning Lead", note: `Escalated — no movement from ${held}.` });
  return evs;
}


const SIGNERS = [
  { name: "Aoife Byrne", role: "Commissioning Lead" },
  { name: "Tom Hughes", role: "Site Manager" },
  { name: "Lena Walsh", role: "M&E Lead" },
];

// Per-gate commissioning items. signed=true rows become evidence; A/B fully
// signed (cleared), C partly signed (3/5), D/E outstanding.
const SIGNOFFS: { gate: string; item: string; signed: boolean }[] = [
  ...["LV containment COLO 1-2", "LV containment COLO 3-4", "First-fix tray runs", "Earthing & bonding"].map((item) => ({ gate: "A", item, signed: true })),
  ...["LV terminations", "Power-on checks", "Board energisation", "Protection settings"].map((item) => ({ gate: "B", item, signed: true })),
  { gate: "C", item: "CRAC unit A", signed: true },
  { gate: "C", item: "CRAC unit B", signed: true },
  { gate: "C", item: "Chilled water loop", signed: true },
  { gate: "C", item: "Leak detection", signed: false },
  { gate: "C", item: "BMS integration", signed: false },
  ...["Energisation sequence", "Yellow-tag inspection", "Load bank test"].map((item) => ({ gate: "D", item, signed: false })),
  ...["Integrated systems test", "Client witness test", "Handover pack"].map((item) => ({ gate: "E", item, signed: false })),
];

// EVERY signed commissioning item carries a full anonymised trail — chase out →
// commitment in → progress → completion — so the item drilldown always shows a
// real evidence breakdown, not a one-line "signed off by X". The sign-off event
// itself comes from the gate_signoffs row and closes the timeline. Each signed
// item links to a unique synthetic task_code that hosts its task_emails/notes.
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function buildSignoffTrail(item: string): { dir: "outbound" | "inbound"; ago: number; subject: string; body: string }[] {
  return [
    { dir: "outbound", ago: 132, subject: `${item} — readiness check`, body: `${item} is coming up on the commissioning programme. Confirm crew, materials and access so we can schedule the witness and sign-off.` },
    { dir: "inbound", ago: 129, subject: `RE: ${item} — readiness check`, body: `Crew booked and materials on site. Starting this week — will flag when it's ready for witness.` },
    { dir: "inbound", ago: 110, subject: `RE: ${item} — progress`, body: `${item} largely complete, snagging the last items now. Should be ready to witness in a few days.` },
    { dir: "inbound", ago: 96, subject: `RE: ${item} — complete`, body: `${item} finished, tested and snagged. Ready for commissioning sign-off.` },
  ];
}
const signoffNote = (item: string) => `Witnessed ${item} on site — works to spec, records filed. Cleared to sign.`;

const SIGNOFF_TRAILS: {
  gate: string;
  item: string;
  taskCode: string;
  trail: { dir: "outbound" | "inbound"; ago: number; subject: string; body: string }[];
  note?: string;
}[] = SIGNOFFS.filter((s) => s.signed).map((s) => ({
  gate: s.gate,
  item: s.item,
  taskCode: `SO-${s.gate}-${slug(s.item)}`,
  trail: buildSignoffTrail(s.item),
  note: signoffNote(s.item),
}));

// OUTSTANDING items link to the SPECIFIC blocker(s) holding them (by shared
// task_code) so the drilldown shows that item's real blocker — not the whole
// gate's pile. ELE-COLO-1030 is the hero, so "BMS integration" opens its story.
const OUTSTANDING_LINKS: { gate: string; item: string; taskCode: string }[] = [
  { gate: "C", item: "Leak detection", taskCode: "MEC-COLO-1040" },
  { gate: "C", item: "BMS integration", taskCode: "ELE-COLO-1030" },
];

const TASK_CODE_BY_ITEM = new Map<string, string>([
  ...SIGNOFF_TRAILS.map((t) => [`${t.gate}::${t.item}`, t.taskCode] as [string, string]),
  ...OUTSTANDING_LINKS.map((o) => [`${o.gate}::${o.item}`, o.taskCode] as [string, string]),
]);
const TRAIL_TASK_CODES = SIGNOFF_TRAILS.map((t) => t.taskCode);

// The ELE-COLO-1030 trail (chases out / responses in) so the activity trail +
// AI root-cause render from the DB, not a hardcoded array.
const HERO = "ELE-COLO-1030";
const TRAIL: { dir: "outbound" | "inbound"; ago: number; subject: string; body: string }[] = [
  { dir: "outbound", ago: 88, subject: "Following up — ELE-COLO-1030 brackets", body: "We need brackets installed before Telecoms Sub can run fibre. What's your start date?" },
  { dir: "inbound", ago: 85, subject: "RE: ELE-COLO-1030 brackets", body: "Will have lads on it next week, chasing materials." },
  { dir: "outbound", ago: 60, subject: "Chase 2 — ELE-COLO-1030 still open", body: "Brackets still not installed. This is now holding Gate C. Please confirm a date today." },
  { dir: "inbound", ago: 44, subject: "RE: ELE-COLO-1030", body: "Friday for definite, 2 lads allocated." },
  { dir: "outbound", ago: 12, subject: "FORMAL: ELE-COLO-1030 — programme delay & cost recovery", body: "No movement after multiple chases. £20k/day exposure. Escalating to director level." },
];

export type SeedResult = {
  tasks: number; gates: number; milestones: number; blockers: number;
  signoffs: number; roster: number; assignments: number; emails: number;
  assetTags: number;
};

// Asset R→Y→G tag derived from the register's existing stage, so the tag layer
// agrees with the Stage column. Delivered = pre-tag (skip).
function tagFromStage(stage: string): "red" | "yellow" | "green" | null {
  if (stage === "On GT" || stage === "Off GT") return "green";
  if (stage.includes("YT")) return "yellow";
  if (stage === "RT") return "red";
  return null;
}
const RYG_CHECKLISTS: Record<"red" | "yellow", { label: string; owner: string }[]> = {
  red: [
    { label: "Equipment in place", owner: "J. Brennan" },
    { label: "Documentation loaded for testing", owner: "M. Walsh" },
    { label: "Cables installed", owner: "MEP Sub" },
    { label: "Panel terminations complete", owner: "MEP Sub" },
    { label: "Power-on test booked", owner: "Cx Engineer" },
  ],
  yellow: [
    { label: "Integrated systems test passed", owner: "Cx Sub" },
    { label: "Witness sign-off complete", owner: "Commissioning Lead" },
    { label: "Snag list closed", owner: "Main Contractor" },
    { label: "Handover pack uploaded", owner: "Document Control" },
  ],
};
type ChecklistItem = { label: string; status: "approved" | "outstanding"; owner: string };
function hashStr(s: string): number { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

// Checklist to reach the NEXT tag, each item with its owner. Deterministic
// approved/outstanding spread so assets sit at different points.
function assetChecklist(tag: "red" | "yellow" | "green", assetId: string): ChecklistItem[] {
  if (tag === "green") return [];
  const items = RYG_CHECKLISTS[tag];
  const approved = 1 + (hashStr(assetId) % items.length);
  return items.map((it, i) => ({ label: it.label, owner: it.owner, status: i < approved ? "approved" : "outstanding" }));
}

// Named owners (polish #1) — a real person + org per asset, deterministic.
const ASSET_OWNERS: { name: string; org: string }[] = [
  { name: "Declan Kearney", org: "Main Contractor" },
  { name: "Aoife Byrne", org: "Main Contractor" },
  { name: "Tom Hughes", org: "Main Contractor" },
  { name: "Liam Nolan", org: "MEP Sub" },
  { name: "Sean Daly", org: "MEP Sub" },
  { name: "Cathal Ryan", org: "Mech Sub" },
  { name: "Niamh Power", org: "Controls Sub" },
  { name: "Eoin Walsh", org: "Fire Sub" },
  { name: "Mark Fitzgerald", org: "Cx Sub" },
];
function ownerFor(assetId: string): { name: string; org: string } {
  return ASSET_OWNERS[hashStr(assetId + "o") % ASSET_OWNERS.length];
}

// Status: green = achieved; otherwise a believable spread of in-progress / late /
// blocked (Step 3 will govern this from real transitions; seeded here for the demo).
function assetStatus(tag: "red" | "yellow" | "green", assetId: string, checklist: ChecklistItem[]): "achieved" | "in_progress" | "late" | "blocked" {
  if (tag === "green") return "achieved";
  const allDone = checklist.length > 0 && checklist.every((i) => i.status === "approved");
  if (allDone) return "in_progress";
  const h = hashStr(assetId + "s");
  if (h % 5 === 0) return "blocked";
  if (h % 3 === 0) return "late";
  return "in_progress";
}

// Per-asset transition history (who/what/where/when/why/how), oldest first.
// Stuck red assets carry a short chase→reply story like the hero blocker.
type AssetForEvents = { asset_id: string; location: string; red_tag_date: string; yellow_tag_date: string; green_date: string };
function assetTagEventSpecs(
  a: AssetForEvents, tag: "red" | "yellow" | "green",
  owner: { name: string; org: string }, status: string,
): { ago: number; type: string; actorName: string; actorOrg: string; payload: Record<string, unknown> }[] {
  const evs: { ago: number; type: string; actorName: string; actorOrg: string; payload: Record<string, unknown> }[] = [];
  const daysAgo = (iso: string) => Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / DAY));
  const where = a.location;
  if (a.red_tag_date) evs.push({ ago: daysAgo(a.red_tag_date), type: "red_achieved", actorName: owner.name, actorOrg: owner.org, payload: { to_tag: "red", where, what: "Equipment in place, RT checklist approved", why: "Asset ready to be worked on", how: "Physical install + red-tag checklist sign-off" } });
  if ((tag === "yellow" || tag === "green") && a.yellow_tag_date) evs.push({ ago: daysAgo(a.yellow_tag_date), type: "yellow_achieved", actorName: owner.name, actorOrg: owner.org, payload: { to_tag: "yellow", where, what: "Cables in, panel complete, tested", why: "Ready for power-on", how: "Yellow-tag checklist sign-off" } });
  if (tag === "green" && a.green_date) evs.push({ ago: daysAgo(a.green_date), type: "green_achieved", actorName: owner.name, actorOrg: owner.org, payload: { to_tag: "green", where, what: "Commissioned, now in operations", why: "Operational", how: "Green-tag handover" } });
  if (tag === "red" && (status === "blocked" || status === "late") && a.red_tag_date) {
    const base = daysAgo(a.red_tag_date);
    evs.push({ ago: Math.max(2, base - 12), type: "chase", actorName: "Commissioning Lead", actorOrg: "Main Contractor", payload: { where, what: "Panel terminations not started — chased for a date", why: "Crew diverted, not a supply issue", how: "Chase the sub for a firm date" } });
    evs.push({ ago: Math.max(1, base - 25), type: "response", actorName: "MEP Sub", actorOrg: "MEP Sub", payload: { where, what: "Crew moved to another hall, back next week", why: "Resourcing", how: "Awaiting return" } });
  }
  return evs.sort((x, y) => y.ago - x.ago); // oldest (largest ago) first
}

// Seed the calling org's DB with the full worked example. Idempotent: deletes
// the seed's own rows for THIS org (by the fixed codes above) then re-inserts.
// Every read/write is scoped to `orgId`.
export async function seedSampleData(orgId: string): Promise<SeedResult> {
  const admin = createAdminClient();
  const result: SeedResult = { tasks: 0, gates: 0, milestones: 0, blockers: 0, signoffs: 0, roster: 0, assignments: 0, emails: 0, assetTags: 0 };

  // --- project to hang everything off ---
  let { data: proj } = await admin.from("projects").select("id").eq("org_id", orgId).limit(1).maybeSingle<{ id: string }>();
  if (!proj) {
    const r = await admin.from("projects").insert({ org_id: orgId, name: "Sample project", baseline_revision_date: "2026-04-21" }).select("id").single<{ id: string }>();
    proj = r.data ?? null;
  }
  const projectId = proj?.id ?? null;

  // === CLEAN REPLACE (scoped to org + the seed's own identifiers) ==========
  await admin.from("blockers").delete().eq("org_id", orgId).in("task_code", ALL_BASELINE_CODES); // cascades blocker_events
  await del(admin, "gate_signoffs", (q) => q.eq("org_id", orgId).in("gate_code", SEED_GATE_CODES));
  await del(admin, "milestones", (q) => q.eq("org_id", orgId)); // milestones are a seed-only concept
  await admin.from("task_threads").delete().eq("org_id", orgId).in("task_code", [HERO, ...TRAIL_TASK_CODES]); // cascades task_emails
  await del(admin, "task_notes", (q) => q.eq("org_id", orgId).in("task_code", [HERO, ...TRAIL_TASK_CODES]));
  await admin.from("gates").delete().eq("org_id", orgId).in("code", SEED_GATE_CODES);
  await del(admin, "roster", (q) => q.eq("org_id", orgId).like("email", "%.example"));
  await del(admin, "asset_tags", (q) => q.eq("org_id", orgId));
  await del(admin, "asset_tag_events", (q) => q.eq("org_id", orgId));

  // --- tasks (upsert keeps ids stable for assignments) ---
  const taskRows = BASELINE_TASKS.map((t) => ({
    org_id: orgId, project_id: projectId, code: t.activity_id, name: t.name, wbs_path: t.wbs_path,
    responsible_company: t.responsible_company, blocking_company: t.blocking_company, status: t.status,
    blocked_reason: t.blocked_reason, affects_room: t.affects_room, planned_start: t.planned_start,
    planned_end: t.planned_end, planned_manpower: t.planned_manpower, actual_manpower: t.actual_manpower,
    cost_per_day: t.cost_per_day,
  }));
  await admin.from("tasks").upsert(taskRows, { onConflict: "org_id,code" });
  result.tasks = taskRows.length;
  const { data: taskRowsDb } = await admin.from("tasks").select("id, code").eq("org_id", orgId);
  const idByCode = new Map((taskRowsDb ?? []).map((r) => [r.code as string, r.id as string]));

  // --- gates ---
  await admin.from("gates").insert(GATES.map((g) => ({ org_id: orgId, project_id: projectId, code: g.code, name: g.name, target_date: g.target_date, sort: g.sort, milestone_code: g.milestone_code, depends_on: g.depends_on })));
  result.gates = GATES.length;

  // --- milestones (guarded — table may be unmigrated) ---
  try {
    await admin.from("milestones").insert(MILESTONES.map((m) => ({ org_id: orgId, code: m.code, name: m.name, target_date: m.target_date })));
    result.milestones = MILESTONES.length;
  } catch { /* milestones not migrated */ }

  // --- blockers on Gate C + raised events ---
  const baseByCode = new Map(BASELINE_TASKS.map((t) => [t.activity_id, t]));
  for (const b of BLOCKERS) {
    const t = baseByCode.get(b.code);
    if (!t) continue;
    const priority = t.cost_per_day >= 18000 ? "Critical" : t.cost_per_day >= 8000 ? "High" : "Medium";
    const { data: row } = await admin.from("blockers").insert({
      org_id: orgId, task_id: idByCode.get(b.code) ?? null, task_code: b.code, title: t.name,
      description: t.blocked_reason, held_by_company: t.blocking_company, affects_room: t.affects_room,
      gate: "C", status: "open", state: b.state, priority, cost_per_day: t.cost_per_day,
      raised_by: "Commissioning Lead", since_timestamp: isoDaysAgo(b.since), raised_date: isoDaysAgo(b.since),
      linked_assets: [b.code],
    }).select("id").single<{ id: string }>();
    if (row) {
      // Full dated, hash-chained chase trail (raised → chases ↔ responses →
      // escalation → cost-raise), oldest first. Hero gets the documented story.
      let prev: string | null = null;
      const eventRows = genBlockerEvents(b, t).map((e, seq) => {
        const ts = normalizeTs(isoDaysAgo(e.ago));
        const payload = e.type === "raised" ? { description: t.blocked_reason, priority } : e.note ? { note: e.note } : {};
        const hash = hashBlockerEvent({ prevHash: prev, seq, eventType: e.type, actor: e.actor, ts, payload });
        const eventRow = { blocker_id: row.id, org_id: orgId, seq, event_type: e.type, actor: e.actor, ts, payload, prev_hash: prev, hash };
        prev = hash;
        return eventRow;
      });
      await admin.from("blocker_events").insert(eventRows);
      result.blockers++;
    }
  }

  // --- gate sign-offs (guarded) ---
  try {
    const rows = SIGNOFFS.map((s, i) => {
      const signer = SIGNERS[i % SIGNERS.length];
      return {
        org_id: orgId, gate_code: s.gate, item_label: s.item, status: s.signed ? "signed" : "outstanding",
        signed_by_user_id: null, signed_by_name: s.signed ? signer.name : null, signed_by_role: s.signed ? signer.role : null,
        signature_kind: s.signed ? "typed" : null, signature_text: s.signed ? signer.name : null,
        signed_at: s.signed ? isoDaysAgo(70 - i) : null,
        task_code: TASK_CODE_BY_ITEM.get(`${s.gate}::${s.item}`) ?? null,
      };
    });
    await admin.from("gate_signoffs").insert(rows);
    result.signoffs = rows.length;
  } catch { /* gate_signoffs not migrated */ }

  // --- roster (the team) ---
  try {
    const people = COMPANIES.map((c, i) => ({ org_id: orgId, name: `${c.name} Lead`, email: `lead${i + 1}@${c.slug}.example`, company: c.name, role: c.role }));
    await admin.from("roster").insert(people);
    result.roster = people.length;
  } catch { /* roster not migrated */ }

  // --- ELE-COLO-1030 trail (thread + emails + a note) so AI/trail render ---
  try {
    const token = randomBytes(8).toString("hex");
    const { data: thread } = await admin.from("task_threads").insert({ org_id: orgId, task_code: HERO, task_id: idByCode.get(HERO) ?? null, email_token: token }).select("id").single<{ id: string }>();
    if (thread) {
      const emails = TRAIL.map((e) => ({
        thread_id: thread.id, org_id: orgId, task_code: HERO, direction: e.dir,
        from_email: e.dir === "outbound" ? "commissioning@maincontractor.example" : "ops@mep-sub.example",
        to_email: e.dir === "outbound" ? "ops@mep-sub.example" : "commissioning@maincontractor.example",
        subject: e.subject, body_text: e.body, created_at: isoDaysAgo(e.ago),
      }));
      await admin.from("task_emails").insert(emails);
      result.emails = emails.length;
    }
    await admin.from("task_notes").insert({ org_id: orgId, task_code: HERO, body: "MEP Sub have promised a start date three times with no movement. Recommend director-to-director escalation — £20k/day and holding Gate C.", author_name: "Commissioning Lead", author_id: null, mentions: [] });
  } catch { /* email/notes tables not migrated */ }

  // --- gate sign-off trails: the chase→commit→done story behind a few signed
  //     A/B items, so the commissioning-item drilldown has real history. ---
  try {
    for (const t of SIGNOFF_TRAILS) {
      const token = randomBytes(8).toString("hex");
      const { data: thread } = await admin.from("task_threads").insert({ org_id: orgId, task_code: t.taskCode, task_id: idByCode.get(t.taskCode) ?? null, email_token: token }).select("id").single<{ id: string }>();
      if (thread) {
        const emails = t.trail.map((e) => ({
          thread_id: thread.id, org_id: orgId, task_code: t.taskCode, direction: e.dir,
          from_email: e.dir === "outbound" ? "commissioning@maincontractor.example" : "ops@subcontractor.example",
          to_email: e.dir === "outbound" ? "ops@subcontractor.example" : "commissioning@maincontractor.example",
          subject: e.subject, body_text: e.body, created_at: isoDaysAgo(e.ago),
        }));
        await admin.from("task_emails").insert(emails);
        result.emails += emails.length;
      }
      if (t.note) {
        await admin.from("task_notes").insert({ org_id: orgId, task_code: t.taskCode, body: t.note, author_name: "Commissioning Lead", author_id: null, mentions: [] });
      }
    }
  } catch { /* email/notes tables not migrated */ }

  // --- task assignments (assign the heroes to the org's real users) ---
  try {
    const { data: users } = await admin.from("users").select("id, role").eq("org_id", orgId);
    const assignable = (users ?? []) as { id: string; role: string }[];
    if (assignable.length) {
      const assignedBy = assignable.find((u) => u.role === "org_admin" || u.role === "superadmin")?.id ?? assignable[0].id;
      const heroCodes = ["ELE-COLO-1030", "ELE-MER-1010", "MEC-COLO-1040", "FAB-ADMIN-1120"];
      const taskIds = heroCodes.map((c) => idByCode.get(c)).filter(Boolean) as string[];
      await admin.from("task_assignments").delete().eq("org_id", orgId).in("task_id", taskIds);
      const rows = taskIds.map((taskId, i) => ({ org_id: orgId, task_id: taskId, user_id: assignable[i % assignable.length].id, assigned_by: assignedBy }));
      if (rows.length) {
        await admin.from("task_assignments").upsert(rows, { onConflict: "task_id,user_id" });
        result.assignments = rows.length;
      }
    }
  } catch { /* task_assignments not migrated */ }

  // --- asset R/Y/G tags + next-tag checklists — the granular layer under gates.
  //     Tag derived from each asset's stage so it agrees with the Stage column;
  //     a believable spread of red/yellow/green for the drilldown demo. ---
  try {
    const tagRows: Record<string, unknown>[] = [];
    const eventRows: Record<string, unknown>[] = [];
    for (const a of generateAssets()) {
      const tag = tagFromStage(a.current_stage);
      if (!tag) continue;
      const owner = ownerFor(a.asset_id);
      const checklist = assetChecklist(tag, a.asset_id);
      const status = assetStatus(tag, a.asset_id, checklist);
      const achieved = tag === "green" ? a.green_date : tag === "yellow" ? a.yellow_tag_date : a.red_tag_date;
      const achievedDate = achieved || null;
      const targetDate = achievedDate ? new Date(new Date(achievedDate).getTime() + 30 * DAY).toISOString().slice(0, 10) : null;
      tagRows.push({ org_id: orgId, asset_id: a.asset_id, tag, next_checklist: checklist, owner_name: owner.name, owner_org: owner.org, status, achieved_date: achievedDate, target_date: targetDate });
      // hash-chained transition history
      let prev: string | null = null;
      assetTagEventSpecs(a, tag, owner, status).forEach((e, seq) => {
        const ts = normalizeTs(isoDaysAgo(e.ago));
        const hash = hashBlockerEvent({ prevHash: prev, seq, eventType: e.type, actor: e.actorName, ts, payload: e.payload });
        eventRows.push({ org_id: orgId, asset_id: a.asset_id, seq, event_type: e.type, actor_name: e.actorName, actor_org: e.actorOrg, payload: e.payload, ts, prev_hash: prev, hash });
        prev = hash;
      });
    }
    if (tagRows.length) {
      await admin.from("asset_tags").upsert(tagRows, { onConflict: "org_id,asset_id" });
      result.assetTags = tagRows.length;
    }
    if (eventRows.length) await admin.from("asset_tag_events").insert(eventRows);
  } catch { /* asset_tags / asset_tag_events not migrated yet */ }

  return result;
}

// Small helper so a delete against an unmigrated table no-ops instead of throwing.
async function del(admin: Admin, table: string, build: (q: any) => any): Promise<void> {
  try {
    await build(admin.from(table).delete());
  } catch {
    /* table not migrated */
  }
}
