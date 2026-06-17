import "server-only";
import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { BASELINE_TASKS, COMPANIES } from "@/app/dashboard/lib/baseline-seed";

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
};

// Seed the calling org's DB with the full worked example. Idempotent: deletes
// the seed's own rows for THIS org (by the fixed codes above) then re-inserts.
// Every read/write is scoped to `orgId`.
export async function seedSampleData(orgId: string): Promise<SeedResult> {
  const admin = createAdminClient();
  const result: SeedResult = { tasks: 0, gates: 0, milestones: 0, blockers: 0, signoffs: 0, roster: 0, assignments: 0, emails: 0 };

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
      await admin.from("blocker_events").insert({ blocker_id: row.id, org_id: orgId, seq: 0, event_type: "raised", actor: "Commissioning Lead", payload: { description: t.blocked_reason, priority } });
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
