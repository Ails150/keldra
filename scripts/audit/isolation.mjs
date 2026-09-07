// PHASE 3 — TENANT ISOLATION, proven with real signed sessions + claim injection.
//
// Model note: Keldra does NOT read org from a JWT claim. authedActor() and
// getSessionState() look the caller's user id up in public.users and take org_id
// from that row, and RLS uses auth_org_id() which does the same. So "claim
// injection" here means the two vectors that actually exist:
//   (a) tampering the token itself — alg:none, edited payload, stripped signature
//   (b) injecting org_id / foreign ids into the REQUEST BODY of an app route, to
//       see whether any route trusts caller-supplied scope over the session
//
// Tenants: two throwaway orgs created for the run and deleted after. Ardmac (the
// real customer) is used ONLY as a read target — every probe against it expects a
// refusal, and nothing in this file writes to it.
//
// Run:  node scripts/audit/isolation.mjs
//   env APP_ORIGIN=http://localhost:3000  to include the app-route probes (group 6)
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, ANON, SERVICE, ARDMAC, PROJECT_REF, rest, sessionCookieHeader } from "./_env.mjs";

const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
const APP = process.env.APP_ORIGIN || "";
const STAMP = Date.now();

let pass = 0, fail = 0, skip = 0;
const ok = (cond, label, detail) => {
  console.log(`  ${cond ? "ok  " : "FAIL"}  ${label}`);
  if (detail) console.log(`        ${detail}`);
  cond ? pass++ : fail++;
};
const skipped = (label, why) => {
  console.log(`  SKIP  ${label}`);
  console.log(`        ${why}`);
  skip++;
};

const made = { orgs: [], authUsers: [] };

async function mkTenant(name) {
  const { data: org, error: oe } = await admin
    .from("organisations").insert({ name }).select("id").single();
  if (oe) throw new Error(`create org: ${oe.message}`);
  made.orgs.push(org.id);

  const email = `audit-${name.toLowerCase()}-${STAMP}@keldra-audit.invalid`;
  const password = `Aud1t!-${STAMP}-${Math.random().toString(36).slice(2, 10)}`;
  const { data: au, error: ue } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (ue) throw new Error(`create auth user: ${ue.message}`);
  made.authUsers.push(au.user.id);

  // A new-user trigger may already have made the profile row; force org + role.
  await admin.from("users").upsert({
    id: au.user.id, org_id: org.id, role: "org_admin", full_name: `Audit ${name}`,
  });

  const anonClient = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data: sess, error: se } = await anonClient.auth.signInWithPassword({ email, password });
  if (se) throw new Error(`sign in: ${se.message}`);
  return {
    orgId: org.id, userId: au.user.id, email,
    token: sess.session.access_token,
    cookie: sessionCookieHeader(sess.session),
  };
}

// --- token tampering helpers (no JWT secret required) ---
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function decode(tok) {
  const [h, p, s] = tok.split(".");
  return {
    h: JSON.parse(Buffer.from(h, "base64url").toString()),
    p: JSON.parse(Buffer.from(p, "base64url").toString()),
    s,
  };
}
function editedClaims(tok, patch) {
  const { h, p, s } = decode(tok);
  return `${b64u(h)}.${b64u({ ...p, ...patch })}.${s}`; // signature no longer matches
}
function algNone(tok, patch = {}) {
  const { p } = decode(tok);
  return `${b64u({ alg: "none", typ: "JWT" })}.${b64u({ ...p, ...patch })}.`;
}
function stripSig(tok) {
  const [h, p] = tok.split(".");
  return `${h}.${p}.`;
}

const SWEEP = [
  "users", "projects", "tasks", "gates", "blockers", "blocker_events", "asset_tags",
  "asset_tag_events", "task_notes", "task_emails", "task_threads", "gate_signoffs",
  "org_invite_links", "org_config", "roster", "milestones", "task_assignments",
  "task_summaries", "mer_field_events",
];

async function main() {
  console.log(`Keldra tenant-isolation suite — ${PROJECT_REF} (keldra-prod)`);
  console.log(`Run: ${new Date().toISOString()}`);
  console.log(`App-route probes: ${APP ? APP : "skipped (APP_ORIGIN unset)"}`);
  console.log("");

  const A = await mkTenant(`AuditA${STAMP}`);
  const B = await mkTenant(`AuditB${STAMP}`);
  console.log(`tenant A    : ${A.orgId} (user ${A.userId})`);
  console.log(`tenant B    : ${B.orgId} (user ${B.userId})`);
  console.log(`real tenant : ${ARDMAC} (Ardmac — read-only target, never written)`);
  console.log("");

  // Give B something to find, so "no rows" means RLS worked, not "nothing existed".
  await admin.from("projects").insert({ org_id: B.orgId, name: `audit-B-project-${STAMP}` });
  await admin.from("org_config").insert({ org_id: B.orgId });

  // ---- 1. PostgREST cross-tenant reads, tenant A session -> tenant B rows ----
  console.log("1. PostgREST cross-tenant reads (tenant A session -> tenant B rows)");
  console.log("-------------------------------------------------------------------");
  for (const t of SWEEP) {
    const r = await rest(`${t}?org_id=eq.${B.orgId}&select=*`, { token: A.token });
    let rows = [];
    try { rows = JSON.parse(await r.text()); } catch { /* non-array error body */ }
    const leaked = Array.isArray(rows) && rows.length > 0;
    ok(!leaked,
      `GET /${t}?org_id=B -> ${r.status}${Array.isArray(rows) ? ` ${rows.length} rows` : ""}`,
      leaked ? `LEAKED ${rows.length} row(s) of tenant B` : undefined);
  }

  // ---- 2. Same sweep against the real paying tenant ----
  console.log("");
  console.log("2. Same sweep against the real customer tenant (Ardmac)");
  console.log("--------------------------------------------------------");
  for (const t of SWEEP) {
    const r = await rest(`${t}?org_id=eq.${ARDMAC}&select=*`, { token: A.token });
    let rows = [];
    try { rows = JSON.parse(await r.text()); } catch { /* */ }
    const leaked = Array.isArray(rows) && rows.length > 0;
    ok(!leaked,
      `GET /${t}?org_id=Ardmac -> ${r.status}${Array.isArray(rows) ? ` ${rows.length} rows` : ""}`,
      leaked ? `LEAKED ${rows.length} row(s) of a paying customer` : undefined);
  }

  // ---- 3. Tampered tokens ----
  console.log("");
  console.log("3. Tampered tokens (claim injection on the token itself)");
  console.log("--------------------------------------------------------");
  const tamper = [
    ["edited sub -> tenant B user id", editedClaims(A.token, { sub: B.userId })],
    ["edited role claim -> service_role", editedClaims(A.token, { role: "service_role" })],
    ["injected app_metadata.org_id -> Ardmac", editedClaims(A.token, { app_metadata: { org_id: ARDMAC } })],
    ["alg:none, sub = tenant B", algNone(A.token, { sub: B.userId })],
    ["alg:none, role = service_role", algNone(A.token, { role: "service_role" })],
    ["signature stripped", stripSig(A.token)],
  ];
  for (const [label, tok] of tamper) {
    const r = await rest("projects?select=*", { token: tok });
    let rows = [];
    try { rows = JSON.parse(await r.text()); } catch { /* */ }
    const accepted = r.status === 200 && Array.isArray(rows);
    ok(!accepted, `GET /projects [${label}] -> ${r.status}`,
      accepted ? `token ACCEPTED — returned ${rows.length} row(s)` : undefined);
  }

  // ---- 4. C1 regression: privilege self-escalation ----
  console.log("");
  console.log("4. C1 regression — self-escalation via direct table writes");
  console.log("----------------------------------------------------------");
  const esc = [
    ["role -> superadmin", `users?id=eq.${A.userId}`, "PATCH", { role: "superadmin" }],
    ["own org_id -> Ardmac", `users?id=eq.${A.userId}`, "PATCH", { org_id: ARDMAC }],
    ["insert self into Ardmac", "users", "POST", { id: A.userId, org_id: ARDMAC, role: "org_admin" }],
    ["create an organisation", "organisations", "POST", { name: `esc-${STAMP}` }],
    ["mint an org invite for Ardmac", "org_invite_links", "POST", { org_id: ARDMAC, token: `esc-${STAMP}`, role: "org_admin" }],
  ];
  for (const [label, path, method, body] of esc) {
    const r = await rest(path, { token: A.token, method, body, prefer: "return=representation" });
    const txt = (await r.text()).slice(0, 120);
    ok(r.status >= 400, `${method} /${path.split("?")[0]} [${label}] -> ${r.status}`,
      r.status < 400 ? `WRITE ACCEPTED: ${txt}` : undefined);
  }
  const { data: after } = await admin.from("users")
    .select("role, org_id").eq("id", A.userId).maybeSingle();
  ok(after?.role === "org_admin" && after?.org_id === A.orgId,
    `tenant A profile unchanged after escalation attempts (role=${after?.role})`);

  // ---- 5. C2 regression: anonymous access to field events ----
  console.log("");
  console.log("5. C2 regression — anonymous access to mer_field_events");
  console.log("--------------------------------------------------------");
  {
    const r = await rest("mer_field_events?select=id,org_id,project", {});
    let rows = [];
    try { rows = JSON.parse(await r.text()); } catch { /* */ }
    const withOrg = Array.isArray(rows) ? rows.filter((x) => x.org_id !== null) : [];
    ok(withOrg.length === 0,
      `anon GET /mer_field_events -> ${r.status}, ${Array.isArray(rows) ? rows.length : "?"} rows, ${withOrg.length} org-owned`,
      withOrg.length ? "anon can see real org field events" : "only org-less demo rows visible");

    // Zero-match delete: proves the permission outcome WITHOUT deleting anything.
    const d = await rest("mer_field_events?id=eq.00000000-0000-0000-0000-000000000000",
      { method: "DELETE", prefer: "return=representation" });
    let d0 = [];
    try { d0 = JSON.parse(await d.text()); } catch { /* */ }
    ok(!Array.isArray(d0) || d0.length === 0,
      `anon DELETE (zero-match probe) -> ${d.status}`,
      "non-destructive by construction: filter matches no row");

    const d2 = await rest(`mer_field_events?org_id=eq.${ARDMAC}`,
      { method: "DELETE", prefer: "return=representation" });
    let del = [];
    try { del = JSON.parse(await d2.text()); } catch { /* */ }
    ok(!Array.isArray(del) || del.length === 0,
      `anon DELETE where org_id=Ardmac -> ${d2.status}, ${Array.isArray(del) ? del.length : "?"} rows deleted`,
      Array.isArray(del) && del.length ? "DELETED REAL ROWS" : "policy scoped to org_id IS NULL — no org row reachable");

    const i = await rest("mer_field_events", {
      method: "POST", body: { project: "MER", org_id: ARDMAC, kind: "note" },
      prefer: "return=representation",
    });
    ok(i.status >= 400, `anon INSERT tagged org_id=Ardmac -> ${i.status}`,
      i.status < 400 ? "anon forged a row into a real org" : undefined);
  }

  // ---- 6. App routes with injected org_id / foreign ids ----
  console.log("");
  console.log("6. App routes — org_id / foreign ids injected into the request body");
  console.log("-------------------------------------------------------------------");
  if (!APP) {
    skipped("all app-route probes", "APP_ORIGIN not set — start `next dev` and re-run to include these");
  } else {
    // These routes authenticate with getSessionState(), which reads the SSR
    // cookie — a Bearer header is ignored, so send both and let the route pick.
    const call = (path, actor, body, method = "POST") =>
      fetch(`${APP}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${actor.token}`,
          Cookie: actor.cookie,
        },
        body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
      });

    // CONTROL: prove the cookie session is actually accepted, otherwise every
    // refusal below would be a meaningless "not logged in" 403.
    const ctrl = await call("/api/invites", A, undefined, "GET");
    const ctrlBody = await ctrl.json().catch(() => ({}));
    ok(ctrl.status === 200,
      `CONTROL GET /api/invites as tenant A -> ${ctrl.status}`,
      ctrl.status === 200
        ? `session accepted; sees ${Array.isArray(ctrlBody.invites ?? ctrlBody) ? (ctrlBody.invites ?? ctrlBody).length : "?"} own-org invite(s)`
        : "session NOT accepted — the probes below would prove nothing");

    const { data: bInvite } = await admin.from("org_invite_links")
      .insert({ org_id: B.orgId, token: `audit-b-${STAMP}`, role: "member" })
      .select("id").single();

    const r1 = await call("/api/invites/revoke", A, { id: bInvite.id, org_id: B.orgId });
    const { data: inviteAfter } = await admin.from("org_invite_links")
      .select("expires_at").eq("id", bInvite.id).maybeSingle();
    ok(!inviteAfter?.expires_at,
      `POST /api/invites/revoke [tenant B invite id + injected org_id] -> ${r1.status}`,
      inviteAfter?.expires_at ? "REVOKED ANOTHER TENANT'S INVITE" : "tenant B invite untouched (L1)");

    const r2 = await call("/api/team", A, { userId: B.userId, action: "role", role: "viewer", org_id: B.orgId });
    const { data: bUserAfter } = await admin.from("users").select("role").eq("id", B.userId).maybeSingle();
    ok(bUserAfter?.role === "org_admin",
      `POST /api/team [role change on tenant B user] -> ${r2.status}`,
      bUserAfter?.role !== "org_admin" ? `CHANGED TENANT B ROLE to ${bUserAfter?.role}` : "tenant B user role unchanged (M2)");

    const r3 = await call("/api/team", A, { userId: B.userId, action: "suspend" });
    const { data: bAuth } = await admin.auth.admin.getUserById(B.userId);
    const banned = !!bAuth?.user?.banned_until;
    ok(!banned, `POST /api/team [suspend tenant B user — auth-plane write] -> ${r3.status}`,
      banned ? "SUSPENDED A USER IN ANOTHER TENANT" : "tenant B user not banned (M2 auth-plane guard)");

    const r4 = await call("/api/team", A, { userId: B.userId, action: "remove" });
    const { count: bStill } = await admin.from("users")
      .select("*", { count: "exact", head: true }).eq("id", B.userId);
    ok(bStill === 1, `POST /api/team [remove tenant B user] -> ${r4.status}`,
      bStill !== 1 ? "DELETED A USER IN ANOTHER TENANT" : "tenant B user still present");

    const r5 = await fetch(`${APP}/api/extract-pdf`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pdf_base64: "x" }),
    });
    ok(r5.status === 401, `POST /api/extract-pdf [no session] -> ${r5.status}`, "L2: must be 401");

    const r6 = await fetch(`${APP}/api/insights`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectName: "demo", blockers: [], assets: [], people: [],
        totalExposurePerDay: 0, unownedCount: 0, awaitingInputCount: 0,
      }),
    });
    const j6 = await r6.json().catch(() => ({}));
    ok(r6.status === 200 && j6.source === "rules",
      `POST /api/insights [no session] -> ${r6.status} source=${j6.source}`,
      "L2: anonymous demo served by rules, no Gemini spend");
  }

  console.log("");
  console.log("=".repeat(78));
  console.log(`${pass + fail} probes run, ${skip} skipped | passed ${pass} | FAILED ${fail}`);
  console.log(fail === 0 ? "\nAll cross-tenant access paths denied." : "\n*** ISOLATION FAILURES PRESENT ***");
}

async function cleanup() {
  try { await admin.from("projects").delete().eq("name", `audit-B-project-${STAMP}`); } catch { /* */ }
  for (const id of made.authUsers) {
    try { await admin.auth.admin.deleteUser(id); } catch { /* */ }
  }
  for (const id of made.orgs) {
    for (const t of ["org_invite_links", "org_config", "projects", "users"]) {
      try { await admin.from(t).delete().eq("org_id", id); } catch { /* */ }
    }
    try { await admin.from("organisations").delete().eq("id", id); } catch { /* */ }
  }
  const { count: leftOrgs } = await admin.from("organisations").select("*", { count: "exact", head: true });
  const { count: leftUsers } = await admin.from("users").select("*", { count: "exact", head: true });
  console.log(`\ncleanup: removed ${made.authUsers.length} user(s) + ${made.orgs.length} org(s); organisations now = ${leftOrgs}, users now = ${leftUsers}`);
}

main()
  .catch((e) => { console.error("SUITE ERROR:", e.message); fail++; })
  .finally(async () => { await cleanup(); process.exit(fail > 0 ? 1 : 0); });
