// PHASE 1 — INVENTORY. Read-only. Enumerates tenants, row counts per tenant and
// migration/RLS health. Also serves as the pre-change count baseline.
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SERVICE, PROJECT_REF } from "./_env.mjs";

const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

export const TABLES = ["users","organisations","projects","tasks","gates","blockers","blocker_events",
  "asset_tags","asset_tag_events","task_notes","task_emails","task_threads","task_email_attachments",
  "gate_signoffs","org_invite_links","org_invites","org_config","roster","task_sequences","sequence_audit",
  "milestones","task_contacts","task_assignments","task_summaries","inbound_unmatched","mer_field_events"];

console.log(`Keldra inventory — project ${PROJECT_REF} (keldra-prod)`);
console.log(`Run: ${new Date().toISOString()}\n`);

const { data: h, error: he } = await admin.rpc("setup_health");
if (he) console.log(`setup_health(): ERROR ${he.message}`);
else {
  const bad = [];
  for (const g of ["tables","rls","functions"]) for (const [k,v] of Object.entries(h[g]||{})) if (!v) bad.push(`${g}.${k}`);
  if (!h.storage_bucket) bad.push("storage_bucket");
  console.log(`setup_health(): ${bad.length ? "FAILING -> " + bad.join(", ") : "all green"}`);
  console.log(`  RLS enabled on ${Object.values(h.rls||{}).filter(Boolean).length}/${Object.keys(h.rls||{}).length} checked tables`);
}

const { data: orgs } = await admin.from("organisations").select("id, name, created_at").order("created_at");
console.log(`\n=== TENANTS (${orgs?.length ?? 0}) ===`);
for (const o of orgs ?? []) console.log(`  ${o.id}  ${o.name}`);

console.log(`\n=== ROW COUNTS ===`);
const header = "table".padEnd(24) + "total".padStart(7) + (orgs??[]).map(o=>o.name.padStart(12)).join("") + "   org-less".padStart(11);
console.log(header);
const counts = {};
let missing = 0;
for (const t of TABLES) {
  // A head+count request returns error:null / count:null for a table that does
  // not exist, so it silently reads as an empty table. Probe with a real row
  // select first — this is what makes unapplied migrations visible.
  const { error: probeErr } = await admin.from(t).select("*").limit(1);
  if (probeErr) {
    console.log(`  ${t.padEnd(22)}   MISSING — ${probeErr.message.slice(0, 60)}`);
    missing++;
    continue;
  }
  const { count, error } = await admin.from(t).select("*", { count: "exact", head: true });
  if (error) { console.log(`  ${t.padEnd(22)} ERR ${error.message.slice(0,50)}`); continue; }
  let line = "  " + t.padEnd(22) + String(count).padStart(7);
  counts[t] = { total: count, per: {} };
  let scoped = 0, hasOrg = true;
  for (const o of orgs ?? []) {
    const { count: c, error: e2 } = await admin.from(t).select("*", { count: "exact", head: true }).eq("org_id", o.id);
    if (e2) { hasOrg = false; break; }
    counts[t].per[o.name] = c; scoped += c ?? 0;
    line += String(c).padStart(12);
  }
  if (!hasOrg) line += "   (no org_id column)".padStart(11);
  else line += String((count ?? 0) - scoped).padStart(11);
  console.log(line);
}
console.log(`\nTables checked: ${TABLES.length}, missing: ${missing}`);
if (missing) {
  console.log("A MISSING table means a migration in the repo was never applied to this");
  console.log("project. See docs/MIGRATIONS.md for the canonical order and known drift.");
  process.exitCode = 1;
}
