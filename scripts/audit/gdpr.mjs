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
  task_threads: ["subject"],
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
const rights = [
  ["Right of access / portability (export)", true, "/api/tasks/export + /api/gates/export — org-scoped CSV"],
  ["Right to erasure (delete a person's data)", false, "no endpoint; /api/team 'remove' deliberately RETAINS auth.users + all authored rows"],
  ["Right to rectification (edit own profile)", false, "no self-service profile edit; org_admin can change role only"],
  ["Consent record (who agreed, when, to what)", false, "no consent table, no timestamped record anywhere in the schema"],
  ["Privacy notice shown to data subjects", false, "no privacy policy page or copy in the app"],
  ["Retention policy / automatic deletion", false, "nothing expires; no TTL, no scheduled purge"],
  ["Processor disclosure (Gemini, Resend, Supabase)", false, "no DPA list or sub-processor page in the repo"],
];
for (const [name, present, detail] of rights) {
  console.log(`  ${present ? "PRESENT " : "MISSING "} ${name}`);
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
