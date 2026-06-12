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

export type DbGate = {
  code: string;
  name: string | null;
  target_date: string | null;
  sort: number;
  openBlockers: number;
  burnPerDay: number;
  status: "cleared" | "blocked" | "waiting";
};

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
  const evs = events
    .filter((e) => e.blocker_id === b.id)
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
  };
}

// Build the dashboard's WizardData + BlockerMap + Baseline from an org's DB rows.
// Returns hasData:false when the org has no tasks (→ empty state). Throws on a
// missing-table error, which the caller treats as "fall back to demo".
export async function loadOrgDashboard(
  supabase: SupabaseClient,
  orgName: string,
): Promise<OrgDashboard> {
  const [tasksR, blockersR, eventsR, rosterR, gatesR, projectsR] = await Promise.all([
    supabase.from("tasks").select("*"),
    supabase.from("blockers").select("*"),
    supabase.from("blocker_events").select("*"),
    supabase.from("roster").select("*"),
    supabase.from("gates").select("code,name,target_date,sort"),
    supabase.from("projects").select("name,baseline_revision_date").limit(1),
  ]);

  // A missing table (pre-migration) surfaces as an error → let the caller fall back.
  for (const r of [tasksR, blockersR, eventsR, rosterR, gatesR, projectsR]) {
    if (r.error) throw new Error(r.error.message);
  }

  const tasks = (tasksR.data ?? []).map(taskFromRow);
  if (tasks.length === 0) return { hasData: false };

  // Commercials cascade: task override (cost_per_day) → gate day-rate → org
  // standing rate. Feeds cost_per_day so exposure/burn reflect real rates.
  const { data: cfgRows } = await supabase.from("org_config").select("config").limit(1);
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

  // Per-gate open-blocker counts + burn, from the blockers' gate column.
  const gateStats = new Map<string, { open: number; burn: number }>();
  for (const b of blockersR.data ?? []) {
    if (s(b.state) === "closed" || !b.gate) continue;
    const cur = gateStats.get(s(b.gate)) ?? { open: 0, burn: 0 };
    cur.open += 1;
    cur.burn += effCost(b.cost_per_day, s(b.gate));
    gateStats.set(s(b.gate), cur);
  }
  const ordered = (gatesR.data ?? [])
    .map((g: any) => ({ code: s(g.code), name: g.name ?? null, target_date: g.target_date ?? null, sort: n(g.sort) }))
    .sort((a, b) => a.sort - b.sort || a.code.localeCompare(b.code));
  let priorBlocked = false;
  const gates: DbGate[] = ordered.map((g) => {
    const st = gateStats.get(g.code) ?? { open: 0, burn: 0 };
    const status: DbGate["status"] = st.open > 0 ? "blocked" : priorBlocked ? "waiting" : "cleared";
    if (st.open > 0) priorBlocked = true;
    return { ...g, openBlockers: st.open, burnPerDay: st.burn, status };
  });

  return { hasData: true, project, blockerMap, baseline, gates };
}
