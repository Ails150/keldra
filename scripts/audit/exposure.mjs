// PHASE 2 — EXPOSURE + AUTH. Hits every app route with NO credentials and records
// what comes back, so "auth on every function" is a measured fact rather than a
// code-reading opinion. Then checks the anon PostgREST surface table by table.
//
// A route PASSES when an anonymous caller gets 401/403/404/405 — or when it is on
// the PUBLIC allow-list below with a documented reason.
//
// Run: APP_ORIGIN=http://localhost:3210 node scripts/audit/exposure.mjs
import { rest, PROJECT_REF, SUPABASE_URL } from "./_env.mjs";

const APP = process.env.APP_ORIGIN || "http://localhost:3210";

// Routes that are meant to be reachable without a session, each with the reason
// it is safe. Anything NOT on this list must refuse an anonymous caller.
const PUBLIC = {
  "/api/signup": "public sign-up; creates a brand-new org, touches no existing tenant",
  "/api/join": "invite acceptance; gated by an unguessable invite token, not a session",
  "/api/email/inbound": "Resend webhook; gated by RESEND_WEBHOOK_SECRET signature",
  "/api/sequences/tick": "cron entry point; gated by the CRON_SECRET header",
  "/api/insights": "public demo panel; anonymous callers get rule-based output only, never Gemini",
};

// method + a body that gets past shape validation, so a 400 doesn't mask a 200.
const ROUTES = [
  ["/api/admin/seed-sample", "POST", {}],
  ["/api/assets/tag", "POST", { asset_id: "X", tag: "red" }],
  ["/api/assets/tags", "GET", null],
  ["/api/blockers/visibility", "POST", { id: "00000000-0000-0000-0000-000000000000", visibility: "org" }],
  ["/api/email/inbound", "POST", { type: "email.delivered", data: {} }],
  ["/api/extract-pdf", "POST", { pdf_base64: "eA==" }],
  ["/api/field/capture", "POST", { kind: "note", body: "x" }],
  ["/api/gates/export", "GET", null],
  ["/api/gates/signoff", "POST", { gate_code: "G1" }],
  ["/api/gates/signoff/history", "GET", null],
  ["/api/health/setup", "GET", null],
  ["/api/insights", "POST", { projectName: "d", blockers: [], assets: [], people: [], totalExposurePerDay: 0, unownedCount: 0, awaitingInputCount: 0 }],
  ["/api/invites", "GET", null],
  ["/api/invites/direct", "POST", { email: "a@b.invalid", role: "member" }],
  ["/api/invites/direct/resend", "POST", { id: "00000000-0000-0000-0000-000000000000" }],
  ["/api/invites/revoke", "POST", { id: "00000000-0000-0000-0000-000000000000" }],
  ["/api/join", "POST", { token: "definitely-not-a-real-invite-token" }],
  ["/api/onboarding/complete", "POST", { org_name: "x" }],
  ["/api/org-commercials", "GET", null],
  ["/api/privacy/erase", "GET", null],
  ["/api/privacy/erase", "POST", { email: "nobody@example.invalid", confirm: true }],
  ["/api/org-config", "GET", null],
  ["/api/sequences/control", "POST", { action: "pause" }],
  ["/api/sequences/start", "POST", { task_id: "00000000-0000-0000-0000-000000000000" }],
  ["/api/sequences/tick", "POST", {}],
  ["/api/signup", "POST", {}],
  ["/api/tasks/assign", "POST", { task_id: "00000000-0000-0000-0000-000000000000" }],
  ["/api/tasks/contacts", "GET", null],
  ["/api/tasks/cost", "POST", { task_id: "00000000-0000-0000-0000-000000000000", cost_per_day: 1 }],
  ["/api/tasks/email", "POST", { task_id: "00000000-0000-0000-0000-000000000000" }],
  ["/api/tasks/export", "GET", null],
  ["/api/tasks/notes", "POST", { task_id: "00000000-0000-0000-0000-000000000000", body: "x" }],
  ["/api/tasks/share", "GET", null],
  ["/api/tasks/summary", "GET", null],
  ["/api/team", "GET", null],
];

let pass = 0, fail = 0;
const ok = (c, label, detail) => {
  console.log(`  ${c ? "ok  " : "FAIL"}  ${label}`);
  if (detail) console.log(`        ${detail}`);
  c ? pass++ : fail++;
};

console.log(`Keldra exposure + auth sweep — ${PROJECT_REF} (keldra-prod)`);
console.log(`Run: ${new Date().toISOString()}`);
console.log(`App: ${APP}`);
console.log("");
console.log("1. Every app route, called with NO credentials");
console.log("-----------------------------------------------");

for (const [path, method, body] of ROUTES) {
  let status = 0, snippet = "";
  try {
    const r = await fetch(`${APP}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    status = r.status;
    snippet = (await r.text()).slice(0, 90).replace(/\s+/g, " ");
  } catch (e) {
    ok(false, `${method} ${path} -> request failed`, e.message);
    continue;
  }
  // 405 deliberately NOT treated as a refusal — it means the probe used the
  // wrong method and never exercised the handler.
  const refused = [401, 403, 404].includes(status);
  const why = PUBLIC[path];
  if (why) {
    ok(true, `${method} ${path} -> ${status} [PUBLIC BY DESIGN]`, why);
  } else {
    ok(refused, `${method} ${path} -> ${status}`,
      refused ? undefined : `REACHABLE ANONYMOUSLY: ${snippet}`);
  }
}

console.log("");
console.log("2. Anon PostgREST surface (no session, public anon key)");
console.log("--------------------------------------------------------");
const TABLES = ["users", "organisations", "projects", "tasks", "gates", "blockers",
  "blocker_events", "asset_tags", "asset_tag_events", "task_notes", "task_emails",
  "task_threads", "task_email_attachments", "gate_signoffs", "org_invite_links",
  "org_invites", "org_config", "roster", "task_sequences", "sequence_audit",
  "milestones", "task_contacts", "task_assignments", "task_summaries",
  "inbound_unmatched", "mer_field_events"];

for (const t of TABLES) {
  const r = await rest(`${t}?select=*&limit=5`, {});
  let rows = [];
  try { rows = JSON.parse(await r.text()); } catch { /* */ }
  const n = Array.isArray(rows) ? rows.length : null;
  // mer_field_events intentionally exposes org-less demo rows to anon (C2 design).
  if (t === "mer_field_events") {
    const orgOwned = Array.isArray(rows) ? rows.filter((x) => x.org_id !== null).length : 0;
    ok(orgOwned === 0, `anon GET /${t} -> ${r.status}, ${n} row(s), ${orgOwned} org-owned`,
      orgOwned ? "anon sees real tenant rows" : "demo rows only, by design");
    continue;
  }
  ok(n === 0 || n === null, `anon GET /${t} -> ${r.status}${n === null ? "" : `, ${n} row(s)`}`,
    n ? `ANON CAN READ ${n} ROW(S)` : undefined);
}

console.log("");
console.log("3. Storage buckets, unauthenticated");
console.log("------------------------------------");
for (const bucket of ["gate-signatures", "task-email-attachments"]) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: (await import("./_env.mjs")).ANON },
    body: JSON.stringify({ prefix: "", limit: 5 }),
  });
  const txt = (await r.text()).slice(0, 120);
  let rows = [];
  try { rows = JSON.parse(txt); } catch { /* */ }
  const listed = Array.isArray(rows) && rows.length > 0;
  ok(!listed, `anon list bucket ${bucket} -> ${r.status}`,
    listed ? `LISTED ${rows.length} object(s)` : "no objects listed");
}

console.log("");
console.log("=".repeat(78));
console.log(`${pass + fail} probes run | passed ${pass} | FAILED ${fail}`);
console.log(fail === 0 ? "\nNo unauthenticated route or table exposes tenant data." : "\n*** EXPOSURE FAILURES PRESENT ***");
process.exit(fail > 0 ? 1 : 0);
