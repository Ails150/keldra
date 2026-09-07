# Keldra security audit — `fmeixgnxkcapxyhrjhvm` (keldra-prod)

**Date:** 7 September 2026 (updated later the same day — see §8)
**Scope:** `C:\keldra-web` at commit `d7bf521`, and the live Supabase project `fmeixgnxkcapxyhrjhvm` (`keldra-prod`, eu-west-1).
**Method:** the phase structure used for Quottrr's `docs/audit` — inventory, exposure, auth, input, secrets, logging, GDPR — with tenant isolation proven by executable probes rather than by reading code.
**Commercial context:** the first paying user is a single commissioning consultant with his own workspace, holding data he controls. The three questions that mattered most were therefore: *nothing leaks between workspaces*, *keys and tokens at rest*, *auth on every function*.

**Result:** 138 probes run, 0 failures. The three open triage items (M2, L1, L2) are closed and proven, which clears the whole of `SECURITY-TRIAGE.md` — C1, C2, H2, M1 and M3 were already applied, and group 4 of the isolation suite re-proves them. Six new findings raised in the first pass, plus two production defects found in the second (§8) — sign-up is broken, and a migration was never applied. **No cross-tenant leak was found on any path tested.** The material residual risk is not tenant isolation: it is that there is still no dev project, no point-in-time recovery, and that the data-protection layer built in §8 is written but not yet applied to the database.

---

## 1. Headline

| | |
|---|---|
| Cross-tenant leaks found | **0** across 61 isolation + 14 erasure probes |
| Routes reachable without credentials | **0** of 28 that should refuse (5 are public by design, each documented) |
| Live secrets in git history or the browser bundle | **0** |
| SQL-injection / XSS surface | **none found** |
| Personal data subjects held | **30**, of whom **19 have no account and no notice** |
| Row counts after the audit | **identical to the pre-audit baseline** — no data was altered |

### What changed in this run

| Item | Was | Now |
|---|---|---|
| **M2** — `team` destructive writes | DB writes org-scoped; four GoTrue admin calls rested on one guard 70 lines earlier | each auth-plane call re-asserts org membership immediately before firing |
| **L1** — `invites` GET/revoke | relied on RLS alone | in-code `.eq("org_id")`; proven by probe |
| **L2** — `extract-pdf`, `insights` | fully unauthenticated Gemini spend | authenticated + rate limited; anonymous demo preserved without spending the key |
| `sequences/tick` secret check | `!==` | constant-time compare |
| `extract-pdf` body | unbounded | 15 MB cap |
| RUNBOOK cron instructions | told operators to paste `CRON_SECRET` into `cron.schedule` | corrected to the Vault migration + verification SQL added |

---

## 2. How isolation was proven

Reading policies proves nothing about a running system, so the suite creates **two throwaway tenants**, signs both in for real, and attacks across them. `scripts/audit/isolation.mjs`, output in `evidence/isolation.txt`.

**Keldra does not read org from a JWT claim.** `authedActor()` and `getSessionState()` resolve the caller's user id and take `org_id` from the `public.users` row; RLS uses `auth_org_id()`, which does the same. So classic claim injection — minting a token with a forged `org_id` — has no reachable target. The two vectors that *do* exist were both tested:

**(a) Tampering the token.** Six variants, all refused with 401:

```
ok    GET /projects [edited sub -> tenant B user id]          -> 401
ok    GET /projects [edited role claim -> service_role]       -> 401
ok    GET /projects [injected app_metadata.org_id -> Ardmac]  -> 401
ok    GET /projects [alg:none, sub = tenant B]                -> 401
ok    GET /projects [alg:none, role = service_role]           -> 401
ok    GET /projects [signature stripped]                      -> 401
```

**(b) Injecting `org_id` and foreign ids into request bodies.** This is the vector that matters for Keldra, because every route derives scope from the session and must ignore what the caller claims.

An early version of these probes returned 403 and *looked* like a pass. It wasn't: those routes authenticate by **cookie**, not the `Authorization` header, so a Bearer token produced a "not logged in" 403 that proved nothing. The suite now mints a real `@supabase/ssr` session cookie and runs a **control probe first** — if the control doesn't return 200, every refusal below it is meaningless:

```
ok    CONTROL GET /api/invites as tenant A -> 200
      session accepted; sees 0 own-org invite(s)
ok    POST /api/invites/revoke [tenant B invite id + injected org_id] -> 404
      tenant B invite untouched (L1)
ok    POST /api/team [role change on tenant B user] -> 404
ok    POST /api/team [suspend tenant B user — auth-plane write] -> 404
ok    POST /api/team [remove tenant B user] -> 404
```

404, not 403 — the caller is authenticated and is being refused on **scope**, which is the semantics we want.

**(c) The sweep.** Nineteen tables read cross-tenant with tenant A's real session, twice: once against tenant B, once against **Ardmac, the real paying customer**. Zero rows returned in all 38. Ardmac was a read target only; nothing in the suite writes to it.

**(d) C1/C2 regressions.** Self-escalation (`role -> superadmin`, `org_id -> Ardmac`, inserting self into Ardmac, minting an Ardmac invite) — all 403, profile confirmed unchanged. Anonymous access to `mer_field_events` returns only the three org-less demo rows; an anon insert tagged `org_id=Ardmac` is refused.

> **On the destructive probes.** Anon DELETE was tested with filters that match zero rows by construction — the permission outcome is observable without deleting anything. Real destructive writes were never run against production data. The suite creates 2 orgs + 2 users and removes them; `evidence/inventory.txt` re-run after the audit is byte-identical to the pre-audit baseline.

**Limit of the M2 proof, stated plainly:** the 404s above are returned by the *original* guard, which is doing its job. The new per-call re-assertion is defence-in-depth and cannot be observed from outside without deliberately breaking the first guard. It is verified by inspection, not by probe.

---

## 3. Auth on every function

All 33 routes were called with no credentials (`evidence/exposure.txt`). Every route that should refuse, refuses.

Five are public by design, each for a stated reason:

| Route | Status | Why it is safe |
|---|---|---|
| `/api/signup` | 400 | creates a brand-new org; touches no existing tenant |
| `/api/join` | 400 | gated by an unguessable invite token, not a session |
| `/api/email/inbound` | 401 | Svix HMAC-SHA256 signature, timing-safe, 5-min replay window |
| `/api/sequences/tick` | 503 | `CRON_SECRET` header; fails closed when unset |
| `/api/insights` | 200 | anonymous callers get rule-based output only — never a Gemini call |

Two probes initially returned 405 (`tasks/share`, `tasks/summary`) because I used POST on GET-only handlers. A 405 means the handler was never exercised, so counting it as a refusal would have been a false pass — the harness no longer accepts 405, and both routes were re-probed correctly (401).

The anon PostgREST surface was swept table by table: 25 tables return 0 rows to the public anon key; `mer_field_events` returns only the three org-less demo rows, by design.

---

## 4. Findings

### F1 — There is no dev project. All testing happens on production. **(High, process)**

`supabase projects list` returns exactly one Keldra project: `fmeixgnxkcapxyhrjhvm`, named **keldra-prod**. Quottrr has `quottrr-dev` alongside its prod project, which is what let its isolation suite run 50 write-capable probes safely.

Keldra has no such place. Every migration in `supabase-*.sql` says "run in the Supabase SQL editor for project `fmeixgnxkcapxyhrjhvm`" — DDL is applied by hand, first time, on the database holding the paying customer's data. The convention that has been standing in for a dev environment is "prove in Blake, never touch Ardmac", which is a discipline, not a boundary: one mistyped `where` clause crosses it.

**This is why the audit could not honour "dev first, then prod" as asked.** There is no dev to go first. What I did instead: created throwaway tenants for write probes, kept every Ardmac probe read-only, made destructive probes zero-match by construction, and diffed row counts before and after.

**Recommendation — the highest-value item in this report.** Create `keldra-dev`, replay the `supabase-*.sql` files into it, and point the isolation suite there for write-capable probing. Until that exists, no migration can be rehearsed and no destructive test can be run honestly.

### F2 — No data-protection apparatus exists. **(High, before the first paying customer)**

`scripts/audit/gdpr.mjs` counts what is held without printing values (`evidence/gdpr.txt`). The database holds **30 distinct data subjects**. Only **11 have accounts**. The other **19 are third parties** — people whose names, addresses, and email bodies arrived through inbound email or were typed in by a customer. They never signed up, never saw a notice, and have no way to ask for anything.

Present: org-scoped CSV export (`/api/tasks/export`, `/api/gates/export`) covers access/portability.

Missing entirely:

| Right / control | State |
|---|---|
| Erasure | no endpoint. `/api/team` "remove" **deliberately retains** `auth.users` and all authored rows so the trail stays attributable |
| Rectification | no self-service profile edit |
| Consent record | no consent table; no timestamped record anywhere in the schema |
| Privacy notice | no policy page or copy in the app |
| Retention | nothing expires; no TTL, no scheduled purge |
| Processor disclosure | no sub-processor list for Gemini, Resend, Supabase |

The erasure gap deserves care rather than a quick fix. Keldra's *product* is an attributable audit trail; "never hard-delete" is a deliberate design decision, not an oversight, and it is defensible — but it needs a documented lawful basis and a defined procedure (what gets redacted vs. retained, and who decides) rather than silence. Right now the retention is real and the justification is undocumented.

Personal data leaving the platform: **Google Gemini** receives blocker text, asset ids and people's names via `/api/insights`, and email bodies via `lib/ai/task-summary.ts`. Both are authenticated-only after this run, but the flow itself is undisclosed to the people in that data.

This is not a code bug and I have not tried to fix it in code. It is the thing most likely to be asked about by the first customer who takes procurement seriously — and Microsoft sits at the end of this chain.

### F3 — Point-in-time recovery is disabled. **(Medium)**

```
region eu-west-1 | walg_enabled true | pitr_enabled FALSE | 8 daily physical backups retained
```

Recovery granularity is therefore ~24 hours. For a product whose value proposition is an evidence trail, and given that C2 was a live path to mass-deleting field events, a day of loss is a poor floor. Enabling PITR is a dashboard toggle on a paid tier.

### F4 — Postgres accepts connections from any IP. **(Medium)**

```
dbAllowedCidrs: ["0.0.0.0/0"]   dbAllowedCidrsV6: ["::/0"]
```

Direct database access is reachable from anywhere; only credentials stand in the way. Restricting to the app's egress ranges plus your own IP costs nothing and removes the entire class of credential-stuffing and leaked-connection-string attacks against the DB port.

### F5 — The runbook told operators to put the cron secret in the cron command. **(Medium — fixed in docs; live job still needs a check)**

`supabase-sequences-cron.sql` does this correctly: URL and secret go into **Vault**, and the schedule reads them back at run time. But `RUNBOOK.md` — the document an operator actually follows — showed this instead:

```sql
headers := jsonb_build_object('x-cron-secret', '<YOUR_CRON_SECRET>'),
```

Anything written into `cron.schedule` is stored verbatim in `cron.job.command`, readable by any role that can select from `cron.job`, and it surfaces in query logs. That is exactly the "secrets in Vault, not cron commands" rule, broken by the instructions rather than by the migration.

**Fixed:** the runbook now points at the Vault migration and carries an explicit warning. **Still needs you:** if the live job was created from the old snippet, the secret is sitting in clear text right now. Run `supabase-verify-cron-secret.sql` (read-only) — it reports `vault (ok)` or `inline literal (ROTATE)`, checks the Vault secrets exist, and flags any other job carrying an inline literal. If it says ROTATE: rotate `CRON_SECRET`, re-run `supabase-sequences-cron.sql` (it unschedules the old job, taking the clear-text command with it).

I could not check this myself — it needs SQL-editor access, which the anon and service-role keys don't provide.

### F6 — No error reporting is installed. **(Informational)**

You asked for "no PII in Sentry messages". There is no Sentry — no error-reporting SDK of any kind is in `package.json`. The control passes vacuously.

For completeness I read all nine server-side `console.*` calls: every one logs an error object or `err.message`, none interpolate an email address, name, or message body. The one to watch is `console.error("[inbound]", fetchError)` in `email/inbound/route.ts:105`, which logs a whole error object that may carry a signed attachment URL.

The real point is the inverse of the question: production currently has **no error visibility at all**. When you do add Sentry, the rule to carry in from Quottrr is that `task_emails.body_text`, `from_email`/`to_email`, and `blocker_events.payload` must never reach an event message.

### F7 — Smaller items

- **`middleware.ts:38`** — `// TEMP: removed /dashboard redirect for demo. Re-add before going live.` Contained today: anonymous visitors get only the synthetic demo, and real org data still requires a session (proven above). But it is load-bearing and marked TEMP; re-add the redirect before launch.
- **`CRON_SECRET` is unset**, so `/api/sequences/tick` returns 503 and chase sequences never fire. Fails closed, so it is a functional gap rather than a security one.
- **Three `public.users` rows have `org_id IS NULL`** and one `auth.users` row has no profile. Housekeeping; the null-org rows resolve to a "finish setup" state, not to data access.
- **Public sign-up is open** (`disable_signup: false`), consistent with `/api/signup` being public. Each sign-up creates its own new org, so it grants no access to existing tenants — but it is an unauthenticated row-creating path with no rate limit.

---

## 5. What was verified as sound

Not padding — these are the claims a buyer will test, each checked against the running system.

- **Tenant isolation.** 61 probes, 0 leaks, including 19 tables swept against the real customer org.
- **Identity is never taken from client input.** Org and role are resolved from the verified session's profile row on every authenticated route; body-injected `org_id` is ignored everywhere it was tried.
- **Secrets at rest.** No live secret value appears in any commit (`git grep` across all revisions), nor in `.next/static` or `.next/server`. Only the public URL and anon key reach the browser. `.env*` is git-ignored; `lib/supabase/admin.ts` is `server-only` and is imported by no client component.
- **Injection.** No raw SQL, no PostgREST `.or()`/`.filter()` built from user input; all three `.rpc()` calls use bound named parameters. No `dangerouslySetInnerHTML`, no `eval`, no `new Function`.
- **Webhook authenticity.** `lib/email/svix.ts` — HMAC-SHA256 over `id.timestamp.body`, `timingSafeEqual`, 5-minute replay window, rejects unsigned.
- **RLS.** Enabled on every table checked by `setup_health()`; helpers are `security definer` with a pinned `search_path`. Both storage buckets refuse anonymous listing.
- **Auth surface.** Email/password only; anonymous sign-in disabled; email confirmation required; no social or SAML providers enabled.
- **Data residency.** eu-west-1.

---

## 6. Re-running this

```bash
cd C:\keldra-web
npx next dev -p 3210                                  # in one shell

node scripts/audit/inventory.mjs                      # tenants + row counts (baseline)
APP_ORIGIN=http://localhost:3210 node scripts/audit/exposure.mjs   # 61 probes
APP_ORIGIN=http://localhost:3210 node scripts/audit/isolation.mjs  # 61 probes
node scripts/audit/gdpr.mjs                           # personal-data map
```

Both suites exit non-zero on any failure, so they drop into CI unchanged. `isolation.mjs` skips the app-route group if `APP_ORIGIN` is unset. Evidence is written to `docs/audit/evidence/`.

Re-run `inventory.mjs` afterwards and diff it against the committed baseline — that is the check that the audit changed nothing.

---

## 7. Recommended order

**Before the consultant's workspace holds anything he'd miss**

1. Enable **PITR** (F3) — one toggle, removes a 24-hour loss window.
2. Run `supabase-verify-cron-secret.sql` (F5) — rotate if it reports `inline literal`.
3. Restrict **`dbAllowedCidrs`** away from `0.0.0.0/0` (F4).
4. Set `CRON_SECRET` in Netlify, or accept that chase sequences stay off.

**Before the pilot is called live**

5. Create **`keldra-dev`** (F1) and stop rehearsing migrations on production.
6. Re-add the `/dashboard` redirect in `middleware.ts` (F7).
7. Write the **privacy notice, retention policy and erasure procedure** (F2) — including the documented reason the audit trail is retained, which is a good answer as long as it is written down.

**Before anyone from Microsoft asks**

8. Consent records and a sub-processor list (F2).
9. Sentry, with the PII exclusions named in F6.

---

*Fixes from this run are in commit `d7bf521`. Evidence: `docs/audit/evidence/{inventory,exposure,isolation,gdpr}.txt`. The two SQL files needing a human in the Supabase SQL editor are `supabase-verify-cron-secret.sql` (read-only check) and, only if it reports ROTATE, a re-run of `supabase-sequences-cron.sql`.*

---

## 8. Second pass — data-protection build and what it uncovered

Added after the first report, in the same session. Three things were asked for: a
dev project, prod network/cron hardening, and a minimum data-protection layer.
The first is blocked, the second is partly blocked, the third is built — and
building it surfaced two production defects the first pass had not reached.

### 8.1 Two production defects found by testing the new code

**D1 — Public sign-up is completely broken. (Critical — blocks the first customer)**

Nobody can create an account. Probing `auth.signUp` directly:

```
signUp -> error: "Error sending confirmation email" | user: NULL
```

Supabase Auth has no working SMTP, so GoTrue writes the auth row, fails to send
the confirmation, and returns no usable user. The route then read the empty
`identities` array as "this email already exists" and returned:

> That email is already registered. Try signing in, or use a different email.

…to a customer whose address had never been seen before — while leaving the
half-created auth row behind, so every retry hit the same message. That is the
origin of the orphan rows reported in §4/F2: the `3 public.users with org_id IS
NULL` and `1 auth.users with no profile` are the debris of failed sign-ups.

Fixed in code: account existence is now checked explicitly via
`user_id_by_email()` rather than inferred from `identities`; a mail failure rolls
back the stranded auth row and returns a 502 saying what actually went wrong.
Verified — retrying a previously failed address no longer reports "already
registered".

**The code fix does not make sign-up work.** It makes it fail honestly and
recoverably. Sign-up stays broken until SMTP is configured in Supabase Auth
(Authentication → Emails → SMTP). Resend is already a dependency and
`RESEND_API_KEY` already exists, so it is the obvious provider. **Do this before
the consultant is invited.**

**D2 — `supabase-contacts.sql` was never applied to prod. (Medium)**

`task_contacts` returns PostgREST `PGRST205` — the table does not exist, though
the migration has been in the repo since 15 June. Consequences: `GET
/api/tasks/contacts` cannot work, and the `task_contacts` upsert at
`app/api/tasks/email/route.ts:115` fails silently.

This is precisely what having no dev project costs (F1). It also went unnoticed
because of a tooling flaw worth naming: **a Supabase `head`+`count` request
returns `error: null, count: null` for a table that does not exist**, so it reads
as an empty table. My own first-pass inventory printed `task_contacts null` and I
took it for an empty table. `inventory.mjs` and `gdpr.mjs` now probe with a real
row select first, print `MISSING`, and exit non-zero.

### 8.2 Vercel compute runs in the US while the database is in Ireland

Static assets return `x-vercel-id: lhr1::…` (edge only). API routes — where all
personal data is handled — return `lhr1::iad1::…`. The second segment is the
compute region: **iad1, US East**. Supabase is in eu-west-1.

So every request carrying names, email bodies and blocker text crossed the
Atlantic and back. Fixed in `vercel.json` with `"regions": ["dub1"]` (Dublin,
co-located with Supabase). **This takes effect on next deploy and must be
verified then** — the privacy notice now states EU compute, so it needs to be
true before that page is live:

```bash
curl -sI https://app.keldra.io/api/health/setup | grep -i x-vercel-id   # expect lhr1::dub1::…
```

If the plan does not permit region selection, change the Vercel row in
`lib/privacy/policy.ts` back to US-with-SCCs rather than leaving the notice wrong.

### 8.3 The security headers are not live

`vercel.json` sets CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
and Permissions-Policy, and commit `689c6cf` is on `origin/main`. Production
serves **none of them** — only Vercel's own default HSTS (`max-age=63072000`,
which is not the value in `vercel.json`). Either the deployment predates that
commit, or the Vercel project is not building from this repo/root. Worth ten
minutes: it is a whole class of protection that everyone currently believes is on.

### 8.4 The data-protection layer

Built and tested against throwaway tenants. `scripts/audit/erasure.mjs`, 14
probes, evidence in `evidence/erasure.txt`.

| Asked for | Delivered |
|---|---|
| Privacy notice page | `/privacy` — public, versioned (`2026-09-07.1`) |
| Sub-processor list with regions | on `/privacy`, from `lib/privacy/policy.ts` — Supabase eu-west-1, Vercel dub1, Resend US, Gemini US, each with a transfer basis |
| Erasure endpoint across all tables | `POST /api/privacy/erase`, with `GET` dry run |
| 12-month retention on inbound email | `purge_old_email_bodies()` + nightly pg_cron, in `supabase-data-protection.sql` |
| Consent capture on signup | `consent_records`, written service-side with the policy version; sign-up refuses without it |

**The erasure design decision, made deliberately.** `blocker_events` and
`asset_tag_events` are append-only *and* hash-chained — `actor` / `actor_name`
are inputs to the row hash — and `gate_signoffs` is immutable. Redacting a name
in any of them breaks chain verification and destroys the evidence property
Keldra is sold on; the guard triggers reject the write anyway. So erasure removes
contact data, roster entries, invitations, email content, note authorship, the
profile and the account, and **retains the accountability record** under UK/EU
GDPR Art 17(3)(e). Every request records what it kept and why in `erasure_log`,
so "what do you still hold about me?" has an exact answer rather than a vague one.

Proven, not asserted:

```
ok  GET dry-run as tenant A -> 200, would erase 0 row(s)   (cannot see tenant B's subject)
ok  POST erase with injected org_id=B -> erased 0; tenant B roster intact
ok  POST without confirm:true -> 400
ok  roster removed (1 -> 0), org_invites removed, task_emails content redacted
ok  blocker_events unchanged — actor + hash identical
ok  service-role UPDATE on blocker_events rejected by the guard trigger
```

Two bugs were caught by that suite and fixed before commit: the endpoint
initially **reported redacting an email it had not redacted** (a failed write to a
column that did not exist yet, with the error ignored), and it treated a
not-yet-created table as a hard failure. It now counts only rows the database
actually returned, separates "table absent on this project" from a real write
error, and returns **500 with `ok:false`** if any part failed — a GDPR endpoint
that overstates what it erased is worse than one that errors.

It correctly returns 500 today, because `erasure_log` does not exist until the
migration is applied.

### 8.5 What is blocked, and on what

**`keldra-dev` does not exist.** `PASTE_REF` came through as a literal
placeholder, and `supabase projects list` shows no such project on the account —
only `keldra-prod`, `vantro-dev`, `Quottrr`, `quottrr-dev` and `vantro-testing`.
So it could not be linked, migrated or seeded, and the dev-first rule now written
into RUNBOOK.md §4 has nowhere to point yet. The harness is ready for it:
`KELDRA_ENV=dev` reads `.env.dev.local` and derives the project ref from the URL,
so no code changes when the project appears.

**No SQL execution path from here.** Every migration is applied by hand in the SQL
editor; the anon and service-role keys cannot run DDL, and the CLI needs a
database password to connect. So `supabase-data-protection.sql` is written and
reviewed but **not applied**, and `supabase-verify-cron-secret.sql` could not be
run — the plaintext-cron-secret question in F5 is still open.

**Network restrictions not changed, deliberately.** The instruction was to
restrict Postgres to "Vercel and Supabase only". Worth flagging before doing it:
**nothing in Keldra connects to Postgres directly.** There is no `pg` client, no
`DATABASE_URL`, no pooler string — the app speaks to Supabase entirely over HTTPS
(PostgREST / GoTrue / Storage), which network restrictions do not govern. So
Vercel needs no allowance at all, and Vercel publishes no stable egress CIDRs to
grant one with. The only thing `dbAllowedCidrs` controls is direct psql/pooler
access — that is, **your own** migration and dump tooling. Setting it wrong locks
you out of your own database rather than locking an attacker out of the app,
which is why I have not guessed at the value.

### 8.6 Revised order

**Before the consultant is invited — sign-up must work**

1. **Configure SMTP in Supabase Auth** (D1). Nothing else matters if nobody can
   create an account.
2. Apply `supabase-data-protection.sql` (dev first, once dev exists) — until
   then consent is not recorded and erasure reports incomplete.
3. Apply `supabase-contacts.sql` (D2).
4. Run `supabase-verify-cron-secret.sql`; rotate if it reports plaintext (F5).
5. Enable PITR (F3).

**Before the pilot is called live**

6. Create `keldra-dev` (F1) and replay migrations per `docs/MIGRATIONS.md`.
7. Deploy, then verify `x-vercel-id` shows `dub1` (8.2) and that the security
   headers are actually served (8.3).
8. Decide the `dbAllowedCidrs` policy (8.5) and re-add the `/dashboard` redirect.

*The commits from this session are **not pushed**. Pushing would trigger a
production deploy, which is yours to make.*

---

## 9. Third pass — actions taken on prod

Same session, after the §8 decisions. Suites in §8 ran against a local dev
server; **everything below re-ran against the live deployment at
`https://app.keldra.io`** — 138 probes, 0 failures, and the database finished at
exactly the pre-audit baseline (11 auth users, 10 profiles, 2 orgs).

### 9.1 Done

| Action | Result |
|---|---|
| Pre-migration snapshot | 1,287 rows, all 25 readable tables + `auth.users`, at `C:\keldra-backups\fmeixgnxkcapxyhrjhvm-2026-09-07T11-08-31-554Z` (outside the repo — personal data) |
| Deployed the session's work | 5 commits pushed to `origin/main`; Vercel built and released |
| Postgres network restriction | `dbAllowedCidrs: ["90.252.106.74/32"]`, `dbAllowedCidrsV6: []` — was `0.0.0.0/0` + `::/0` |
| Re-ran all four suites against production | exposure 63/63, isolation 61/61, erasure 14/14, inventory + gdpr clean |

### 9.2 Three findings closed by the deploy

The deploy resolved 8.2, 8.3 and part of F2 in one go — verified on the live site:

```
X-Vercel-Id: lhr1::dub1::…                          (was lhr1::iad1 — US East)
Content-Security-Policy: default-src 'self'; …      (was absent)
X-Frame-Options: SAMEORIGIN                         (was absent)
Referrer-Policy: strict-origin-when-cross-origin    (was absent)
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
                                                    (was Vercel's default 63072000)
GET /privacy -> 200                                 (privacy notice now live)
```

So **8.3 was simply an undeployed commit** — the headers had been written and
merged, and production had never been rebuilt since. And **8.2 is fixed and
confirmed**: compute now runs in Dublin alongside the eu-west-1 database, which
makes the EU-compute statement on `/privacy` true rather than aspirational.

### 9.3 The network restriction, and what it does not do

`dbAllowedCidrs` is now a single host. Worth being precise about what changed:
this closes **direct Postgres and pooler access**, which only your own tooling
uses. It does not touch the app, and I verified that after applying it —
PostgREST (anon and service), GoTrue and `app.keldra.io` all still return 200.

Note the CLI cleared the IPv6 list to `[]` as well, so the `::/0` hole went with
it rather than being left behind.

Two consequences to keep in mind:

- **If your IP changes** (dynamic broadband, a different network, a VPN), direct
  DB tooling stops working until you update it:
  `supabase network-restrictions update --project-ref fmeixgnxkcapxyhrjhvm --db-allow-cidr <new>/32 --experimental`
  To reopen entirely: same command with `0.0.0.0/0`.
- **The Supabase SQL editor runs server-side** inside Supabase and is not
  expected to be affected. If it is, the command above reverses this in seconds.

### 9.4 Not done, and why

**PITR is still off.** You asked for it enabled before the migration. It is a
billable add-on and the CLI exposes only `backups list` and `backups restore` —
there is no enable path from here. It needs Settings → Add-ons in the dashboard.
The snapshot in 9.1 stands in for it, but only for data: no schema, roles,
policies or storage objects. Recovery position is unchanged — daily physical
backups, 8 retained.

**`supabase-data-protection.sql` is not applied.** By your decision I prepared it
for you to run rather than seeking a database credential. Instructions,
expected output, and what to check are in
`docs/audit/RUN-THESE-IN-SQL-EDITOR.md`, along with
`supabase-verify-cron-secret.sql` — the plaintext-cron-secret question (F5) is
still open until that read-only file is run.

Until the migration lands: consent is not recorded at sign-up (the route logs the
failure and continues), and the erasure endpoint correctly returns
`500 / ok:false` because it cannot write `erasure_log`.

**`keldra-dev` was not created.** Skipped by your decision. The dev-first rule in
RUNBOOK.md §4 and the `KELDRA_ENV=dev` support in the harness are in place for
whenever it exists.

### 9.5 The one that still blocks the pilot

Sign-up remains broken until SMTP is configured in Supabase Auth. The deployed
fix means a failed sign-up now says so honestly and no longer strands an auth row
that poisons the address on retry — but it does not create accounts. Nothing else
in this report matters more: the first paying customer cannot get in.
