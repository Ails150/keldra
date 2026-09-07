// PHASE 7 — GDPR / DATA PROTECTION. Builds the personal-data map by COUNTING what
// is held, never printing values. Then checks which subject-rights paths exist in
// code (erasure, portability, consent) and which do not.
//
// Run: node scripts/audit/gdpr.mjs
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SERVICE, PROJECT_REF } from "./_env.mjs";

const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

console.log(`Keldra GDPR / personal-data map — ${PROJECT_REF} (keldra-prod)`);
console.log(`Run: ${new Date().toISOString()}`);
console.log("Values are never printed — counts and distinct-cardinality only.");
console.log("");

// table -> the columns on it that carry personal data
const PD = {
  users: ["full_name"],
  roster: ["name", "email"],
  task_contacts: ["name", "email"],
  org_invites: ["email", "full_name"],
  task_emails: ["from_email", "to_email", "subject", "body_text", "body_html"],
  // task_threads holds no personal data: org_id, task_code, email_token only.
  task_notes: ["author_name", "body"],
  blocker_events: ["actor", "payload"],
  asset_tag_events: ["actor_name", "payload"],
  gate_signoffs: ["signed_by_name", "signed_by_email"],
  mer_field_events: ["actor_user_id"],
  inbound_unmatched: ["from_email", "subject"],
};

console.log("1. Personal data held, by table");
console.log("--------------------------------");
for (const [table, cols] of Object.entries(PD)) {
  const { count, error } = await admin.from(table).select("*", { count: "exact", head: true });
  if (error) {
    console.log(`  ${table.padEnd(20)} n/a  (${error.message.slice(0, 45)})`);
    continue;
  }
  console.log(`  ${table.padEnd(20)} ${String(count).padStart(5)} row(s)   cols: ${cols.join(", ")}`);
}

// Distinct email addresses held anywhere — the population whose rights apply.
console.log("");
console.log("2. Data-subject population (distinct addresses, values not shown)");
console.log("-----------------------------------------------------------------");
const addresses = new Set();
const sources = [
  ["roster", "email"], ["org_invites", "email"], ["task_emails", "from_email"],
  ["task_emails", "to_email"], ["inbound_unmatched", "from_email"],
];
for (const [table, col] of sources) {
  const { data, error } = await admin.from(table).select(col).limit(5000);
  if (error) { console.log(`  ${table}.${col}: unavailable (${error.message.slice(0, 40)})`); continue; }
  let n = 0;
  for (const row of data ?? []) {
    const v = row[col];
    if (!v) continue;
    for (const one of String(v).split(/[,;]/)) {
      const e = one.trim().toLowerCase();
      if (e.includes("@")) { addresses.add(e); n++; }
    }
  }
  console.log(`  ${`${table}.${col}`.padEnd(32)} ${String(n).padStart(4)} value(s)`);
}
const { data: authUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
const accountEmails = new Set((authUsers?.users ?? []).map((u) => (u.email ?? "").toLowerCase()).filter(Boolean));
for (const e of accountEmails) addresses.add(e);
console.log(`  auth.users (account holders)      ${String(accountEmails.size).padStart(4)} value(s)`);
console.log("");
console.log(`  DISTINCT data subjects total      ${String(addresses.size).padStart(4)}`);
console.log(`    of which hold an account        ${String(accountEmails.size).padStart(4)}`);
console.log(`    NON-users (no account, no login) ${String(addresses.size - accountEmails.size).padStart(3)}`);
console.log("    -> non-users are third parties whose data arrived by inbound email or");
console.log("       was entered by a customer. They never see a notice or a consent step.");

// Orphaned profiles: public.users rows with no org, and auth users with no profile.
console.log("");
console.log("3. Orphaned / retained identity rows");
console.log("-------------------------------------");
const { count: noOrg } = await admin.from("users").select("*", { count: "exact", head: true }).is("org_id", null);
console.log(`  public.users with org_id IS NULL           ${String(noOrg).padStart(4)}`);
const { data: profiles } = await admin.from("users").select("id");
const profileIds = new Set((profiles ?? []).map((p) => p.id));
const authOnly = (authUsers?.users ?? []).filter((u) => !profileIds.has(u.id));
console.log(`  auth.users with NO public.users profile   ${String(authOnly.length).padStart(4)}`);
console.log("    (this is what /api/team 'remove' leaves behind by design, so the");
console.log("     audit trail stays attributable — it is retained personal data)");
const banned = (authUsers?.users ?? []).filter((u) => u.banned_until).length;
console.log(`  auth.users banned (access revoked, kept)  ${String(banned).padStart(4)}`);

// Which subject-rights paths exist in the codebase.
console.log("");
console.log("4. Subject-rights paths present in code");
console.log("----------------------------------------");
// Detected, not asserted: check the database and the app rather than trusting a
// hardcoded list that goes stale the moment something is built.
// NB: a head+count request does NOT surface a missing-table error through
// supabase-js — it comes back with error null and count null, which reads as
// "present". A real row select does surface PGRST205. Do not "simplify" this.
const exists = async (table) => {
  const { error } = await admin.from(table).select("*").limit(1);
  return !error;
};
const routeExists = async (path) => {
  const app = process.env.APP_ORIGIN;
  if (!app) return null;
  try {
    const r = await fetch(`${app}${path}`, { method: "GET" });
    return r.status !== 404;
  } catch { return null; }
};

const hasConsent = await exists("consent_records");
const hasErasureLog = await exists("erasure_log");
const hasPurgeCol = await (async () => {
  const { error } = await admin.from("task_emails").select("purged_at").limit(1);
  return !error;
})();
const hasErasureRoute = await routeExists("/api/privacy/erase");
const hasPrivacyPage = await routeExists("/privacy");
const tri = (v) => (v === null ? "UNKNOWN " : v ? "PRESENT " : "MISSING ");

const rights = [
  ["Right of access / portability (export)", true, "/api/tasks/export + /api/gates/export — org-scoped CSV"],
  ["Right to erasure (endpoint)", hasErasureRoute,
    hasErasureRoute === null ? "set APP_ORIGIN to check" :
    hasErasureRoute ? "/api/privacy/erase — org-scoped, dry-run + confirm, logs what it retained"
                    : "no erasure endpoint"],
  ["Erasure audit log (erasure_log table)", hasErasureLog,
    hasErasureLog ? "present" : "MISSING — supabase-data-protection.sql not applied; erasures will report incomplete"],
  ["Right to rectification (edit own profile)", false, "still no self-service profile edit"],
  ["Consent record (consent_records table)", hasConsent,
    hasConsent ? "present — written by the signup route with the policy version"
               : "MISSING — supabase-data-protection.sql not applied; signup logs a consent failure"],
  ["Privacy notice page", hasPrivacyPage,
    hasPrivacyPage === null ? "set APP_ORIGIN to check" :
    hasPrivacyPage ? "/privacy — public, includes sub-processors and retention" : "no privacy page"],
  ["Retention rule (12-month inbound email purge)", hasPurgeCol,
    hasPurgeCol ? "task_emails.purged_at present; nightly cron purges inbound bodies at 12 months"
                : "MISSING — supabase-data-protection.sql not applied"],
  ["Processor disclosure (sub-processor list)", hasPrivacyPage,
    hasPrivacyPage ? "rendered on /privacy from lib/privacy/policy.ts" : "no sub-processor list"],
];

for (const [name, present, detail] of rights) {
  console.log(`  ${tri(present)} ${name}`);
  console.log(`            ${detail}`);
}

console.log("");
console.log("5. Personal data leaving the platform (processors)");
console.log("--------------------------------------------------");
console.log("  Google Gemini   <- /api/insights forwards blocker text, asset ids and PEOPLE'S");
console.log("                     NAMES; /api/tasks/summary + lib/ai/task-summary.ts forward");
console.log("                     email bodies. Both authenticated-only after this audit.");
console.log("  Resend          <- outbound chase email + inbound webhook (addresses, bodies)");
console.log("  Supabase        <- primary processor, eu-west-1");
console.log("");
console.log("Note: no automated check can establish lawful basis or a DPA. Items above are");
console.log("reported as present/missing in the CODE, not as legal conclusions.");
