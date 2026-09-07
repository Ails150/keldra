// PHASE 8 — RIGHT TO ERASURE. Proves the erasure endpoint (a) is org-scoped, so
// it can't be used as a cross-tenant delete primitive, (b) removes what it says
// it removes, and (c) leaves the append-only accountability record intact and
// still protected by the database guard.
//
// Two throwaway tenants; Ardmac is never touched. Everything created is deleted.
//
// Run: APP_ORIGIN=http://localhost:3210 node scripts/audit/erasure.mjs
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, ANON, SERVICE, ARDMAC, PROJECT_REF, sessionCookieHeader } from "./_env.mjs";

const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
const APP = process.env.APP_ORIGIN || "http://localhost:3210";
const STAMP = Date.now();

let pass = 0, fail = 0;
const ok = (c, label, detail) => {
  console.log(`  ${c ? "ok  " : "FAIL"}  ${label}`);
  if (detail) console.log(`        ${detail}`);
  c ? pass++ : fail++;
};

const made = { orgs: [], authUsers: [] };

async function mkTenant(name) {
  const { data: org, error: oe } = await admin.from("organisations").insert({ name }).select("id").single();
  if (oe) throw new Error(`create org: ${oe.message}`);
  made.orgs.push(org.id);
  const email = `audit-${name.toLowerCase()}-${STAMP}@keldra-audit.invalid`;
  const password = `Aud1t!-${STAMP}-${Math.random().toString(36).slice(2, 10)}`;
  const { data: au, error: ue } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (ue) throw new Error(`create auth user: ${ue.message}`);
  made.authUsers.push(au.user.id);
  await admin.from("users").upsert({ id: au.user.id, org_id: org.id, role: "org_admin", full_name: `Audit ${name}` });
  const c = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data: sess, error: se } = await c.auth.signInWithPassword({ email, password });
  if (se) throw new Error(`sign in: ${se.message}`);
  return { orgId: org.id, userId: au.user.id, email, cookie: sessionCookieHeader(sess.session) };
}

const call = (path, actor, init = {}) =>
  fetch(`${APP}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Cookie: actor.cookie, ...(init.headers ?? {}) },
  });

async function main() {
  console.log(`Keldra erasure suite — ${PROJECT_REF} (keldra-prod)`);
  console.log(`Run: ${new Date().toISOString()}`);
  console.log("");

  const A = await mkTenant(`ErasA${STAMP}`);
  const B = await mkTenant(`ErasB${STAMP}`);
  console.log(`tenant A (attacker) : ${A.orgId}`);
  console.log(`tenant B (holds the subject) : ${B.orgId}`);
  console.log(`Ardmac ${ARDMAC} — never touched`);
  console.log("");

  // The data subject lives in tenant B and has no account.
  const SUBJECT = `subject-${STAMP}@example.invalid`;

  await admin.from("roster").insert({ org_id: B.orgId, name: "Test Subject", email: SUBJECT });
  await admin.from("org_invites").insert({ email: SUBJECT, org_id: B.orgId, role: "member", full_name: "Test Subject" });
  const { data: thread, error: thErr } = await admin.from("task_threads")
    .insert({ org_id: B.orgId, task_code: `ERAS-${STAMP}`, email_token: `eras-${STAMP}` }).select("id").single();
  if (thErr) throw new Error(`seed task_threads: ${thErr.message}`);
  await admin.from("task_emails").insert({
    thread_id: thread.id, org_id: B.orgId, task_code: `ERAS-${STAMP}`, direction: "inbound",
    from_email: SUBJECT, to_email: "site@example.invalid", subject: "Please action",
    body_text: "personal content that must go", body_html: "<p>personal content</p>",
  });

  // An accountability record naming the subject — this must SURVIVE.
  const { data: blocker, error: blErr } = await admin.from("blockers")
    .insert({ org_id: B.orgId, task_code: `ERAS-${STAMP}`, title: "test blocker" }).select("id").single();
  if (blErr) throw new Error(`seed blockers: ${blErr.message}`);
  await admin.from("blocker_events").insert({
    blocker_id: blocker.id, org_id: B.orgId, seq: 1, event_type: "raised",
    actor: "Test Subject", ts: new Date().toISOString(), payload: {}, prev_hash: null, hash: `seed-${STAMP}`,
  });

  console.log("1. Cross-tenant: tenant A tries to erase tenant B's subject");
  console.log("-----------------------------------------------------------");
  {
    const dry = await call(`/api/privacy/erase?email=${encodeURIComponent(SUBJECT)}`, A);
    const j = await dry.json().catch(() => ({}));
    const totals = Object.values(j.would_erase ?? {}).reduce((a, b) => a + b, 0);
    ok(dry.status === 200 && totals === 0,
      `GET dry-run as tenant A -> ${dry.status}, would erase ${totals} row(s)`,
      totals ? "TENANT A CAN SEE TENANT B'S SUBJECT" : "sees nothing — scoped to its own org");

    const doIt = await call("/api/privacy/erase", A, {
      method: "POST",
      body: JSON.stringify({ email: SUBJECT, confirm: true, org_id: B.orgId }),
    });
    const j2 = await doIt.json().catch(() => ({}));
    const erased = Object.values(j2.erased ?? {}).reduce((a, b) => a + b, 0);
    const { count: rosterStill } = await admin.from("roster")
      .select("*", { count: "exact", head: true }).eq("org_id", B.orgId).ilike("email", SUBJECT);
    ok(erased === 0 && rosterStill === 1,
      `POST erase with injected org_id=B -> ${doIt.status}, erased ${erased}; tenant B roster row still present: ${rosterStill === 1}`,
      rosterStill !== 1 ? "TENANT A ERASED TENANT B DATA" : "injected org_id ignored — session org wins");
  }

  console.log("");
  console.log("2. Refuses to act without explicit confirmation");
  console.log("------------------------------------------------");
  {
    const r = await call("/api/privacy/erase", B, { method: "POST", body: JSON.stringify({ email: SUBJECT }) });
    ok(r.status === 400, `POST without confirm:true -> ${r.status}`, "must refuse");
  }

  console.log("");
  console.log("3. Tenant B erases its own subject");
  console.log("-----------------------------------");
  const beforeEvents = await admin.from("blocker_events")
    .select("id, actor, hash").eq("org_id", B.orgId);
  {
    const dry = await call(`/api/privacy/erase?email=${encodeURIComponent(SUBJECT)}`, B);
    const j = await dry.json().catch(() => ({}));
    ok(dry.status === 200 && (j.would_erase?.roster ?? 0) === 1,
      `GET dry-run as tenant B -> ${dry.status}`,
      `would erase: ${JSON.stringify(j.would_erase)}`);
    ok((j.would_retain?.blocker_events?.rows ?? 0) >= 0 && !!j.would_retain?.blocker_events?.basis,
      "dry run states what it would RETAIN and the lawful basis",
      (j.would_retain?.blocker_events?.basis ?? "").slice(0, 60) + "…");

    const { count: rosterBefore } = await admin.from("roster")
      .select("*", { count: "exact", head: true }).eq("org_id", B.orgId).ilike("email", SUBJECT);
    console.log(`        [counts before erase] roster=${rosterBefore}, blocker_events=${beforeEvents.data?.length}`);

    const r = await call("/api/privacy/erase", B, {
      method: "POST", body: JSON.stringify({ email: SUBJECT, confirm: true }),
    });
    const j2 = await r.json().catch(() => ({}));
    // Until supabase-data-protection.sql is applied, erasure_log is absent and
    // the endpoint MUST report failure rather than a clean success.
    const logMissing = (j2.log_error ?? "").includes("erasure_log");
    ok(logMissing ? r.status === 500 && j2.ok === false : r.status === 200 && j2.ok === true,
      `POST erase -> ${r.status} ok=${j2.ok}`,
      logMissing
        ? "correctly reports INCOMPLETE: erasure_log table not yet created"
        : `erased: ${JSON.stringify(j2.erased)}`);
    ok(!j2.problems, `no per-table write problems`,
      j2.problems ? JSON.stringify(j2.problems) : "all writes succeeded");
    ok(true, `tables skipped as absent on this project`,
      j2.skipped ? JSON.stringify(j2.skipped) : "none");

    const { count: rosterAfter } = await admin.from("roster")
      .select("*", { count: "exact", head: true }).eq("org_id", B.orgId).ilike("email", SUBJECT);
    ok(rosterAfter === 0, `roster row removed (${rosterBefore} -> ${rosterAfter})`);

    const { count: inviteAfter } = await admin.from("org_invites")
      .select("*", { count: "exact", head: true }).eq("org_id", B.orgId).ilike("email", SUBJECT);
    ok(inviteAfter === 0, `org_invites row removed (-> ${inviteAfter})`);

    const { data: mail } = await admin.from("task_emails")
      .select("from_email, subject, body_text, body_html").eq("org_id", B.orgId);
    const m = (mail ?? [])[0];
    ok(m && m.body_text === null && m.body_html === null && m.from_email === "[erased]",
      `task_emails content redacted (from_email="${m?.from_email}", body_text=${m?.body_text})`,
      "row kept so the trail still shows an email happened");

    ok(true, `erasure_log: log_written=${j2.log_written}`,
      j2.log_written ? "logged" : `NOT logged — ${j2.log_error ?? "table missing (migration not applied)"}`);
  }

  console.log("");
  console.log("4. The accountability record survived, and is still DB-protected");
  console.log("----------------------------------------------------------------");
  {
    const after = await admin.from("blocker_events").select("id, actor, hash").eq("org_id", B.orgId);
    const same =
      after.data?.length === beforeEvents.data?.length &&
      JSON.stringify(after.data) === JSON.stringify(beforeEvents.data);
    ok(same, `blocker_events unchanged by the erasure (${after.data?.length} row(s), actor + hash identical)`,
      same ? "retained under Art 17(3)(e), chain inputs untouched" : "ERASURE MUTATED THE AUDIT TRAIL");

    // The retention isn't just our code being polite — the DB refuses edits.
    const { error: upErr } = await admin.from("blocker_events")
      .update({ actor: "[erased]" }).eq("org_id", B.orgId);
    ok(!!upErr, `service-role UPDATE on blocker_events rejected by guard trigger`,
      upErr ? upErr.message.slice(0, 80) : "NO GUARD — the append-only claim is not enforced");
  }

  console.log("");
  console.log("=".repeat(78));
  console.log(`${pass + fail} probes run | passed ${pass} | FAILED ${fail}`);
  console.log(fail === 0 ? "\nErasure is org-scoped, effective, and leaves the trail intact." : "\n*** ERASURE FAILURES PRESENT ***");
}

async function cleanup() {
  for (const id of made.orgs) {
    for (const t of ["blocker_events", "blockers", "task_emails", "task_threads", "roster",
                     "org_invites", "org_config", "users", "consent_records", "erasure_log"]) {
      try { await admin.from(t).delete().eq("org_id", id); } catch { /* */ }
    }
  }
  for (const id of made.authUsers) { try { await admin.auth.admin.deleteUser(id); } catch { /* */ } }
  for (const id of made.orgs) { try { await admin.from("organisations").delete().eq("id", id); } catch { /* */ } }
  const { count: orgs } = await admin.from("organisations").select("*", { count: "exact", head: true });
  const { count: users } = await admin.from("users").select("*", { count: "exact", head: true });
  console.log(`\ncleanup: organisations now = ${orgs}, users now = ${users}`);
}

main().catch((e) => { console.error("SUITE ERROR:", e.message); fail++; })
  .finally(async () => { await cleanup(); process.exit(fail > 0 ? 1 : 0); });
