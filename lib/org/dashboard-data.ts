import type { SupabaseClient } from "@supabase/supabase-js";
import type { WizardData } from "@/app/onboarding/types";
import type { Blocker, BlockerMap, BlockerStateName } from "@/app/dashboard/lib/blocker-state";
import {
  COMPANIES,
  CRITICAL_ROOMS,
  SITE_DIARY,
  type Baseline,
  type BaselineTask,
  type TaskStatus,
} from "@/app/dashboard/lib/baseline-seed";
import { computeGateImpacts, impactBadge, impactNarrative, type Milestone } from "@/lib/gates/impact";
import { verifyBlockerChain } from "@/lib/blockers/event-hash";
import { generateAssets } from "@/app/dashboard/lib/demo-assets";

export type DbGate = {
  code: string;
  name: string | null;
  target_date: string | null;
  sort: number;
  openBlockers: number;
  burnPerDay: number;
  status: "cleared" | "blocked" | "waiting";
  // Deadline impact chain (computed from real milestones + gate dependencies).
  daysBlocked: number;
  blocksGates: string[];
  milestoneName: string | null;
  milestoneTarget: string | null;
  milestoneProjected: string | null;
  milestoneSlipDays: number;
  impactBadge: string;
  impactNarrative: string | null;
  // Tags roll up FROM assets: count of this gate's assets at each tag. An ADDED
  // signal beside the sign-off/blocker status — does not change `status`.
  tagCounts: { red: number; yellow: number; green: number; total: number };
};

// Provisional asset→gate heuristic (by system). Flagged as an open question in
// keldra-tag-model-plan.md; a single derivation point to revise once confirmed.
export function gateForSystem(system: string): string | null {
  switch ((system || "").toLowerCase()) {
    case "power": return "B";
    case "cooling": return "C";
    case "controls": return "D";
    case "fire": return "E";
    default: return null;
  }
}

export type LoadedDashboard = {
  project: WizardData;
  blockerMap: BlockerMap;
  baseline: Baseline;
  gates: DbGate[];
};
export type OrgDashboard = { hasData: false } | ({ hasData: true } & LoadedDashboard);

/* eslint-disable @typescript-eslint/no-explicit-any */

function s(v: unknown): string {
  return v == null ? "" : String(v);
}
function n(v: unknown): number {
  return v == null ? 0 : Number(v);
}

function taskFromRow(r: any): BaselineTask {
  return {
    activity_id: s(r.code),
    name: s(r.name) || s(r.code),
    wbs_path: s(r.wbs_path),
    responsible_company: s(r.responsible_company),
    planned_start: s(r.planned_start),
    planned_end: s(r.planned_end),
    planned_manpower: n(r.planned_manpower),
    actual_manpower: n(r.actual_manpower),
    status: (s(r.status) || "on_track") as TaskStatus,
    blocked_reason: r.blocked_reason == null ? null : String(r.blocked_reason),
    blocking_company: r.blocking_company == null ? null : String(r.blocking_company),
    affects_room: r.affects_room == null ? null : String(r.affects_room),
    cost_per_day: n(r.cost_per_day),
  };
}

function blockerFromRow(b: any, events: any[]): Blocker {
  const raw = events.filter((e) => e.blocker_id === b.id);
  // Walk the hash chain on read — the "verified" state in the UI reflects this,
  // not a hardcoded string.
  const chain = verifyBlockerChain(raw);
  const evs = raw
    .sort((x, y) => (x.seq ?? 0) - (y.seq ?? 0))
    .map((e) => ({
      event_type: s(e.event_type),
      actor: s(e.actor),
      timestamp: s(e.ts) || s(e.created_at),
      payload: (e.payload ?? {}) as Record<string, unknown>,
      prevHash: e.prev_hash ?? null,
      hash: s(e.hash),
    }));
  return {
    id: s(b.id),
    description: s(b.description) || s(b.title),
    linked_assets: Array.isArray(b.linked_assets) ? b.linked_assets : [],
    raised_by: s(b.raised_by) || "—",
    state: (s(b.state) || "unowned") as BlockerStateName,
    current_owner: b.current_owner ?? null,
    gate: b.gate ?? null,
    visibility: b.visibility === "org_private" ? "org_private" : "shared",
    // Surface "who's holding it" (held_by_company) as the org when no explicit
    // owner is set, so rollups/overview have something to group by.
    current_owner_org: b.current_owner_org ?? b.held_by_company ?? null,
    waiting_on_person: b.waiting_on_person ?? null,
    waiting_on_org: b.waiting_on_org ?? (b.state === "awaiting-input" ? b.held_by_company ?? null : null),
    since_timestamp: s(b.since_timestamp) || s(b.raised_date),
    events: evs,
    cost_per_day: n(b.cost_per_day),
    sit_on_today: !!b.sit_on_today,
    sit_on_today_date: b.sit_on_today_date ?? null,
    proposed_resolution_note: b.proposed_resolution_note ?? null,
    priority: s(b.priority),
    raised_date: s(b.raised_date) || s(b.since_timestamp),
    chainVerified: chain.ok,
    chainBrokenAtSeq: chain.brokenAtSeq,
  };
}

// Build the dashboard's WizardData + BlockerMap + Baseline from an org's DB rows.
// Returns hasData:false when the org has no tasks (→ empty state). Throws on a
// missing-table error, which the caller treats as "fall back to demo".
export async function loadOrgDashboard(
  supabase: SupabaseClient,
  orgName: string,
  orgId: string,
): Promise<OrgDashboard> {
  // Scope EVERY query to the viewing org. RLS alone is not enough: a superadmin's
  // _select policies match all orgs (is_superadmin()), so without this filter a
  // superadmin's dashboard fans out every org's rows — two orgs that share the
  // gate codes A/B/C/BU render as duplicate gate cards, and other orgs' blockers
  // leak in. Filtering by org_id here makes the dashboard one-org for everyone.
  const [tasksR, blockersR, eventsR, rosterR, gatesR, projectsR] = await Promise.all([
    supabase.from("tasks").select("*").eq("org_id", orgId),
    supabase.from("blockers").select("*").eq("org_id", orgId),
    supabase.from("blocker_events").select("*").eq("org_id", orgId),
    supabase.from("roster").select("*").eq("org_id", orgId),
    supabase.from("gates").select("*").eq("org_id", orgId),
    supabase.from("projects").select("name,baseline_revision_date").eq("org_id", orgId).limit(1),
  ]);

  // Milestones are optional (pre-migration → table absent); tolerate gracefully.
  let milestones: Milestone[] = [];
  try {
    const { data: ms } = await supabase.from("milestones").select("code,name,target_date").eq("org_id", orgId);
    milestones = (ms ?? []).map((m: any) => ({ code: s(m.code), name: m.name ?? null, target_date: m.target_date ?? null }));
  } catch {
    /* milestones table not migrated yet */
  }

  // A missing table (pre-migration) surfaces as an error → let the caller fall back.
  for (const r of [tasksR, blockersR, eventsR, rosterR, gatesR, projectsR]) {
    if (r.error) throw new Error(r.error.message);
  }

  const tasks = (tasksR.data ?? []).map(taskFromRow);
  if (tasks.length === 0) return { hasData: false };

  // Commercials cascade: task override (cost_per_day) → gate day-rate → org
  // standing rate. Feeds cost_per_day so exposure/burn reflect real rates.
  const { data: cfgRows } = await supabase.from("org_config").select("config").eq("org_id", orgId).limit(1);
  const commercials =
    ((cfgRows?.[0]?.config as {
      commercials?: { gate_rates?: Record<string, number>; standing_rate?: number | null };
    } | undefined)?.commercials) ?? {};
  const gateRates = commercials.gate_rates ?? {};
  const standing = commercials.standing_rate ?? null;
  const effCost = (raw: unknown, gate: string | null): number => {
    const c = n(raw);
    if (c > 0) return c;
    if (gate && gateRates[gate] != null) return gateRates[gate];
    if (standing != null) return standing;
    return 0;
  };
  // Standing rate applies to non-complete tasks only (completed work isn't slipping).
  for (const t of tasks) {
    if (t.status !== "complete") t.cost_per_day = effCost(t.cost_per_day, null);
  }

  const blockerMap: BlockerMap = {};
  for (const b of blockersR.data ?? []) {
    const blk = blockerFromRow(b, eventsR.data ?? []);
    blk.cost_per_day = effCost(b.cost_per_day, b.gate ? s(b.gate) : null);
    blockerMap[s(b.id)] = blk;
  }

  const projectName = s(projectsR.data?.[0]?.name) || "Project";
  const baselineRev = s(projectsR.data?.[0]?.baseline_revision_date) || "2026-04-21";

  const team = (rosterR.data ?? []).map((p: any) => ({
    name: s(p.name),
    organisation: s(p.company),
    company: s(p.company),
    role: s(p.role),
    email: s(p.email),
  }));

  const constraints = (blockersR.data ?? []).map((b: any) => ({
    id: s(b.id),
    description: s(b.description) || s(b.title),
    raised_by: s(b.raised_by),
    owner_name: b.current_owner ?? "",
    owner_org: b.current_owner_org ?? "",
    priority: s(b.priority),
    status: s(b.state),
    raised_date: s(b.raised_date),
    linked_assets: (Array.isArray(b.linked_assets) ? b.linked_assets : []).join(","),
  }));

  const baseline: Baseline = {
    project: { name: projectName, baseline_revision_date: baselineRev },
    companies: COMPANIES,
    rooms: CRITICAL_ROOMS,
    tasks,
    diary: SITE_DIARY,
    blockers: [],
  };

  const project: WizardData = {
    phase: "done",
    org: { name: orgName, type: "main-contractor", colour: "#8a3dd6" },
    project: {
      name: projectName,
      client: "",
      sector: "",
      startDate: "",
      handoverDate: "",
      buildType: null,
      location: "",
    },
    otherOrgs: [],
    template: null,
    uploads: { team, assets: null, constraints, register: null, xer: null },
    invites: [],
    viewingAs: { orgName, orgType: "main-contractor", role: "main-contractor" },
  };

  // Per-gate open-blocker counts + burn + days-blocked (from the oldest open
  // blocker on the gate), from the blockers' gate column.
  const now = Date.now();
  const gateStats = new Map<string, { open: number; burn: number; oldest: number }>();
  for (const b of blockersR.data ?? []) {
    if (s(b.state) === "closed" || !b.gate) continue;
    const cur = gateStats.get(s(b.gate)) ?? { open: 0, burn: 0, oldest: now };
    cur.open += 1;
    cur.burn += effCost(b.cost_per_day, s(b.gate));
    const since = new Date(s(b.since_timestamp) || s(b.raised_date)).getTime();
    if (!Number.isNaN(since)) cur.oldest = Math.min(cur.oldest, since);
    gateStats.set(s(b.gate), cur);
  }
  // One card per DISTINCT gate code. The query is already org-scoped (and the
  // gates table is unique on (org_id, code)), but dedupe defensively so a stray
  // duplicate row can never render a second card for the same gate.
  const seenGate = new Set<string>();
  const ordered = (gatesR.data ?? [])
    .map((g: any) => ({
      code: s(g.code),
      name: g.name ?? null,
      target_date: g.target_date ?? null,
      sort: n(g.sort),
      milestone_code: g.milestone_code ?? null,
      depends_on: Array.isArray(g.depends_on) ? (g.depends_on as string[]) : [],
    }))
    .filter((g) => (seenGate.has(g.code) ? false : (seenGate.add(g.code), true)))
    .sort((a, b) => a.sort - b.sort || a.code.localeCompare(b.code));

  // Impact chain: slip per blocked gate, propagated to dependents + milestone.
  const impacts = computeGateImpacts(
    ordered.map((g) => {
      const st = gateStats.get(g.code);
      return {
        code: g.code,
        target_date: g.target_date,
        milestone_code: g.milestone_code,
        depends_on: g.depends_on,
        blocked: !!st && st.open > 0,
        daysBlocked: st && st.open > 0 ? Math.max(0, Math.floor((now - st.oldest) / 86_400_000)) : 0,
      };
    }),
    milestones,
    now,
  );

  // Tags roll up FROM assets: count each gate's assets per tag. Asset tags live
  // in the DB keyed by asset_id; the system (→ gate) comes from the register.
  const tagByGate = new Map<string, { red: number; yellow: number; green: number; total: number }>();
  try {
    const { data: at } = await supabase.from("asset_tags").select("asset_id, tag").eq("org_id", orgId);
    if (at && at.length) {
      const systemById = new Map<string, string>();
      for (const a of generateAssets()) systemById.set(a.asset_id, a.system);
      for (const row of at as { asset_id: string; tag: string }[]) {
        const gate = gateForSystem(systemById.get(row.asset_id) ?? "");
        if (!gate) continue;
        const c = tagByGate.get(gate) ?? { red: 0, yellow: 0, green: 0, total: 0 };
        if (row.tag === "red" || row.tag === "yellow" || row.tag === "green") { c[row.tag] += 1; c.total += 1; }
        tagByGate.set(gate, c);
      }
    }
  } catch {
    /* asset_tags not migrated yet → no tag rollup */
  }

  let priorBlocked = false;
  const gates: DbGate[] = ordered.map((g) => {
    const st = gateStats.get(g.code) ?? { open: 0, burn: 0, oldest: now };
    const status: DbGate["status"] = st.open > 0 ? "blocked" : priorBlocked ? "waiting" : "cleared";
    if (st.open > 0) priorBlocked = true;
    const imp = impacts.get(g.code);
    return {
      tagCounts: tagByGate.get(g.code) ?? { red: 0, yellow: 0, green: 0, total: 0 },
      code: g.code,
      name: g.name,
      target_date: g.target_date,
      sort: g.sort,
      openBlockers: st.open,
      burnPerDay: st.burn,
      status,
      daysBlocked: imp?.daysBlocked ?? 0,
      blocksGates: imp?.blocksGates ?? [],
      milestoneName: imp?.milestoneName ?? null,
      milestoneTarget: imp?.milestoneTarget ?? null,
      milestoneProjected: imp?.milestoneProjected ?? null,
      milestoneSlipDays: imp?.milestoneSlipDays ?? 0,
      impactBadge: impactBadge(imp, st.burn),
      impactNarrative: status === "blocked" ? impactNarrative(imp, g.code) : null,
    };
  });

  return { hasData: true, project, blockerMap, baseline, gates };
}
