// Seed the Ardmac org's baseline TASKS into the DB `tasks` table from the
// canonical client seed (baseline-seed.ts), so the DB read-path cutover has
// real data to read. Idempotent (upsert on org_id+code). Reads the service-role
// key from .env.local. Run: npx tsx scripts/seed-ardmac.ts
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { BASELINE_TASKS } from "@/app/dashboard/lib/baseline-seed";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function main() {
const { data: orgs, error: orgErr } = await admin
  .from("organisations")
  .select("id, name");
if (orgErr) throw orgErr;
const ardmac = orgs?.find((o) => o.name === "Ardmac");
if (!ardmac) throw new Error("No Ardmac org found.");

const { data: proj } = await admin
  .from("projects")
  .select("id")
  .eq("org_id", ardmac.id)
  .limit(1)
  .maybeSingle();

const rows = BASELINE_TASKS.map((t) => ({
  org_id: ardmac.id,
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

const { error } = await admin
  .from("tasks")
  .upsert(rows, { onConflict: "org_id,code" });
if (error) throw error;

const { count } = await admin
  .from("tasks")
  .select("*", { count: "exact", head: true })
  .eq("org_id", ardmac.id);

console.log(`Seeded ${rows.length} tasks. Ardmac tasks now in DB: ${count}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
