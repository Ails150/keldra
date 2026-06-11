import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { BASELINE_TASKS, COMPANIES } from "@/app/dashboard/lib/baseline-seed";

type Admin = ReturnType<typeof createAdminClient>;

// Seed an org with a full demo project (same richness as the Ardmac demo),
// fully org-scoped + idempotent. tasks + gates seed against tables that always
// exist; blockers + roster are guarded so they no-op cleanly until
// supabase-orgdata.sql is applied (then they populate too).
export async function seedSampleData(orgId: string): Promise<{
  tasks: number;
  gates: number;
  blockers: number;
  roster: number;
}> {
  const admin = createAdminClient();
  const result = { tasks: 0, gates: 0, blockers: 0, roster: 0 };

  // Ensure a project to hang tasks off.
  let { data: proj } = await admin
    .from("projects")
    .select("id")
    .eq("org_id", orgId)
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (!proj) {
    const r = await admin
      .from("projects")
      .insert({ org_id: orgId, name: "Sample project", baseline_revision_date: "2026-04-21" })
      .select("id")
      .single<{ id: string }>();
    proj = r.data ?? null;
  }

  // --- tasks (upsert on org_id+code) ---
  const taskRows = BASELINE_TASKS.map((t) => ({
    org_id: orgId,
    project_id: proj?.id ?? null,
    code: t.activity_id,
    name: t.name,
    wbs_path: t.wbs_path,
    responsible_company: t.responsible_company,
    blocking_company: t.blocking_company,
    status: t.status,
    blocked_reason: t.blocked_reason,
    affects_room: t.affects_room,
    planned_start: t.planned_start,
    planned_end: t.planned_end,
    planned_manpower: t.planned_manpower,
    actual_manpower: t.actual_manpower,
    cost_per_day: t.cost_per_day,
  }));
  await admin.from("tasks").upsert(taskRows, { onConflict: "org_id,code" });
  result.tasks = taskRows.length;

  // --- gates (from the org's template ladder; ensure present) ---
  const { count: gateCount } = await admin
    .from("gates")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId);
  result.gates = gateCount ?? 0;

  // --- blockers + raised events (guarded — needs supabase-orgdata.sql) ---
  try {
    const { count: existing } = await admin
      .from("blockers")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId);
    if (!existing) {
      result.blockers = await seedBlockers(admin, orgId, proj?.id ?? null);
    } else {
      result.blockers = existing;
    }
  } catch {
    /* blockers columns / blocker_events not migrated yet */
  }

  // --- roster (guarded) ---
  try {
    const { count: existing } = await admin
      .from("roster")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId);
    if (!existing) {
      const people = COMPANIES.map((c, i) => ({
        org_id: orgId,
        name: `${c.name} Lead`,
        email: `lead${i + 1}@${c.slug}.example`,
        company: c.name,
        role: c.role,
      }));
      await admin.from("roster").insert(people);
      result.roster = people.length;
    } else {
      result.roster = existing;
    }
  } catch {
    /* roster not migrated yet */
  }

  return result;
}

async function seedBlockers(admin: Admin, orgId: string, projectId: string | null): Promise<number> {
  // A blocker per blocked / not-started task — the variance heroes.
  const blocked = BASELINE_TASKS.filter(
    (t) => t.status === "blocked" || t.status === "not_started_should_be",
  );
  // map task code -> id
  const { data: taskRows } = await admin
    .from("tasks")
    .select("id, code")
    .eq("org_id", orgId);
  const idByCode = new Map((taskRows ?? []).map((r) => [r.code, r.id]));

  let n = 0;
  for (const t of blocked) {
    const priority = t.cost_per_day >= 18000 ? "Critical" : t.cost_per_day >= 8000 ? "High" : "Medium";
    const state = t.status === "blocked" ? "awaiting-input" : "unowned";
    const { data: b } = await admin
      .from("blockers")
      .insert({
        org_id: orgId,
        task_id: idByCode.get(t.activity_id) ?? null,
        task_code: t.activity_id,
        title: t.name,
        description: t.blocked_reason,
        held_by_company: t.blocking_company,
        affects_room: t.affects_room,
        status: state === "awaiting-input" ? "open" : "open",
        state,
        priority,
        cost_per_day: t.cost_per_day,
        raised_by: "System seed",
        since_timestamp: new Date(t.planned_start).toISOString(),
        raised_date: new Date(t.planned_start).toISOString(),
        linked_assets: [t.activity_id],
      })
      .select("id")
      .single<{ id: string }>();
    if (b) {
      await admin.from("blocker_events").insert({
        blocker_id: b.id,
        org_id: orgId,
        seq: 0,
        event_type: "raised",
        actor: "System seed",
        payload: { description: t.blocked_reason, priority },
      });
      n++;
    }
  }
  void projectId;
  return n;
}
