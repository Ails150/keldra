// Logical data snapshot of a Keldra Supabase project, taken before a migration.
//
// What this IS: every row of every known table, plus the auth user list, written
// as JSON. Enough to reconstruct content by hand if a migration goes wrong.
// What this is NOT: a physical backup. It does not capture schema, roles, RLS
// policies, triggers, storage objects, or sequence positions. It is a safety net
// for a data mistake, not a substitute for PITR.
//
// Output goes OUTSIDE the repo (default C:\keldra-backups) because it contains
// personal data and must never be committed.
//
// Run: node scripts/backup-snapshot.mjs [outputDir]
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SUPABASE_URL, SERVICE, PROJECT_REF, TARGET_ENV } from "./audit/_env.mjs";
import { TABLES } from "./audit/inventory.mjs";

const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const base = process.argv[2] || "C:\\keldra-backups";
const dir = join(base, `${PROJECT_REF}-${stamp}`);
mkdirSync(dir, { recursive: true });

console.log(`Keldra snapshot — ${PROJECT_REF} (${TARGET_ENV})`);
console.log(`Run: ${new Date().toISOString()}`);
console.log(`Out: ${dir}`);
console.log("");

let totalRows = 0;
const manifest = { project: PROJECT_REF, target: TARGET_ENV, taken_at: new Date().toISOString(), tables: {} };

for (const t of TABLES) {
  // Page through so a large table can't be silently truncated at the API cap.
  const rows = [];
  const PAGE = 1000;
  let from = 0;
  let failed = null;
  for (;;) {
    const { data, error } = await admin.from(t).select("*").range(from, from + PAGE - 1);
    if (error) { failed = error.message; break; }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  if (failed) {
    console.log(`  ${t.padEnd(24)} SKIPPED — ${failed.slice(0, 50)}`);
    manifest.tables[t] = { rows: null, error: failed };
    continue;
  }
  writeFileSync(join(dir, `${t}.json`), JSON.stringify(rows, null, 2), "utf8");
  manifest.tables[t] = { rows: rows.length };
  totalRows += rows.length;
  console.log(`  ${t.padEnd(24)} ${String(rows.length).padStart(6)} row(s)`);
}

// auth.users is not reachable through PostgREST — take it via the admin API.
const { data: au, error: auErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (auErr) {
  console.log(`  ${"auth.users".padEnd(24)} SKIPPED — ${auErr.message}`);
  manifest.auth_users = { rows: null, error: auErr.message };
} else {
  const users = (au?.users ?? []).map((u) => ({
    id: u.id, email: u.email, created_at: u.created_at,
    email_confirmed_at: u.email_confirmed_at, last_sign_in_at: u.last_sign_in_at,
    banned_until: u.banned_until ?? null, user_metadata: u.user_metadata,
  }));
  writeFileSync(join(dir, "auth_users.json"), JSON.stringify(users, null, 2), "utf8");
  manifest.auth_users = { rows: users.length };
  totalRows += users.length;
  console.log(`  ${"auth.users".padEnd(24)} ${String(users.length).padStart(6)} row(s)`);
}

manifest.total_rows = totalRows;
writeFileSync(join(dir, "_manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

console.log("");
console.log(`${totalRows} rows written to ${dir}`);
console.log("Contains personal data — keep it off the repo and off shared drives.");
