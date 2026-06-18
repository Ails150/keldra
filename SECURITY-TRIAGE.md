# Keldra Security Triage

Status: **proposed fixes — nothing applied yet.** Derived from the read-only audit
(API routes, RLS, secrets, audit-trail/injection). Each item has evidence, a
concrete fix, effort, the risk if deferred, and how to verify. Apply in the
order listed. DDL items are applied by hand in the Supabase SQL editor (project
`fmeixgnxkcapxyhrjhvm`); prove in Blake, never touch Ardmac (`437ec2d5`).

## Ranked summary

| # | Sev | Finding | Fix type | Effort |
|---|-----|---------|----------|--------|
| C1 | 🔴 Critical | Authenticated user can self-escalate `role`/`org_id` via direct `users` UPDATE | DDL (RLS/grants) + maybe 1 route | S |
| C2 | 🔴 Critical | **CONFIRMED:** `anon` can read/insert/**delete** ALL orgs' `mer_field_events` (live captures are tagged `project='MER'`) | DDL + verify demo | S–M |
| H2 | 🟠 High | "Tamper-evident" audit trail not enforced (no trigger, NULL hashes, no verifier) | DDL + lib + UI wording | M |
| M1 | 🟡 Med | Direct client INSERT lets users forge attribution (`actor`/`author`/`hash`) in-org | DDL (revoke insert) + keep service-role APIs | S–M |
| M2 | 🟡 Med | `team` destructive writes scoped by `userId` only (service role) | Code (defensive `.eq org_id`) | S |
| M3 | 🟡 Med | Misleading full-CRUD grants on `organisations`/`org_invites` (inert today) | DDL (reduce grants) | S |
| L1 | 🟢 Low | `invites` GET/revoke rely on RLS, not in-code org filter (RLS verified correct) | Code (defensive filter) | S |
| L2 | 🟢 Low | Unauth AI routes (`extract-pdf`, `insights`) — cost/DoS, no tenant data | Code (auth + rate limit) | S |

---

## C1 — Self-escalation of role/org (CRITICAL, fix first)

**Evidence:** `supabase-org-model.sql:97` grants `authenticated` full CRUD on `public.users`;
`:117-119` `users_update_self` allows `update ... using (id = auth.uid())` with **no column
restriction**, so a user can set their own `role='superadmin'` (or change `org_id`) with the anon
key + their JWT → `is_superadmin()` opens every org's data.

**Proposed fix (DDL):** all legitimate user/org writes already go through service-role routes
(`signup`, `onboarding/complete`, `team`, `invites/*`), which bypass RLS — so remove the client
write paths entirely:
```sql
-- supabase-harden-identity.sql  (proposed)
revoke insert, update, delete on public.users         from authenticated;
revoke insert, update, delete on public.organisations from authenticated;
revoke insert, update, delete on public.org_invites   from authenticated;
drop policy if exists users_update_self on public.users;
-- (SELECT policies unchanged; service-role writes unaffected — they don't use these grants.)
```
**Verified safe to apply:** every `users` write goes through the service-role admin client
(`team/route.ts:148,159`, `join/route.ts:99`, `signup/route.ts:90`, `invites/direct/route.ts:73`);
every browser-client `from("users")` call is SELECT-only (`profile.ts`, `task-cost.tsx`,
`task-notes.tsx`, `field/page.tsx`, `reset-password`, etc.). Revoking the grants + dropping
`users_update_self` breaks no client path and leaves service-role writes untouched. No profile
self-edit route is needed. Do **not** use a BEFORE-UPDATE trigger to block role changes — the
`team` route legitimately changes `role` via the service role and a trigger would break it.

**Risk if deferred:** total tenant-isolation break — the product's core guarantee.
**Verify after:** signed in as a Blake member, `update({role:'superadmin'})` on own row must be
rejected; team/onboarding/role-change via the admin UI must still work.

---

## C2 — Anonymous cross-tenant delete/insert on `mer_field_events` (CRITICAL — CONFIRMED)

**Evidence:** `supabase-org-model.sql:100` `grant select, insert, delete ... to anon`; `:146-151`
anon policies gated only by `project = 'MER'` (no org, no auth). **Confirmed live exposure:**
`app/api/field/capture/route.ts:103` writes `project: "MER"` on *authenticated* captures, and
`lib/supabase/mer-field.ts:161` does the same — so real orgs' red tags / photos / comments all
carry `project='MER'`. A caller with the public anon key (it ships in the browser) can run
`supabase.from('mer_field_events').delete().eq('project','MER')` and the anon DELETE policy
(`using (project='MER')`, no org/session constraint) permits **wiping every org's field events**.
This is unauthenticated, cross-tenant data destruction on production data — rank alongside C1.

**Proposed fix:** retire the legacy anon path, or namespace the public demo to a throwaway
org/project distinct from any live tag:
```sql
-- proposed (after confirming the public ?w= demo no longer needs it)
revoke insert, delete on public.mer_field_events from anon;
drop policy if exists mfe_anon_insert on public.mer_field_events;
drop policy if exists mfe_anon_delete on public.mer_field_events;
-- keep mfe_anon_select only if the public demo still reads it; otherwise drop too.
```
**Risk if deferred:** unauthenticated deletion/forgery of field events on production data.

---

## H2 — Audit trail is not actually tamper-evident

**Evidence:** no trigger on `blocker_events` (cf. `gate_signoffs_guard_trg`,
`supabase-gate-signoffs.sql:42-54`); runtime appenders write NULL hashes
(`lib/sequences/engine.ts:485-492`, `app/api/field/capture/route.ts:92-99`); only the seed chains
(`lib/org/sample-seed.ts:93-95`); nothing verifies on read (`lib/org/dashboard-data.ts:76-79`); UI
claims integrity that isn't computed (`blocker-detail-panel.tsx` footer; `audit.tsx:40,64`
"100% / All hashes verified"); clients can INSERT events directly (`supabase-field-rls.sql:15,30-37`).

**Proposed fix (pick a target, then make code match the claim):**
1. Add a guard trigger: `before update or delete on public.blocker_events` → raise (immutable),
   mirroring `gate_signoffs`.
2. Make the runtime appenders compute `prev_hash`/`hash` server-side (reuse the seed's
   `chainHash`) so live events are actually chained; remove or validate the client INSERT grant.
3. Add a read-path verifier that walks `prev_hash` and reports real status — OR, until 1–3 land,
   **soften the UI** ("append-only log", drop "verified/100%") so we don't overclaim.

**Risk if deferred:** a buyer's security/forensics question about the trail is answerable only with
"the UI says so" — reputationally damaging. Cross-tenant risk is low (org-scoped).

---

## M1 — Direct client writes allow forged attribution in-org

**Evidence:** `grant insert ... to authenticated` on `blockers`/`blocker_events`
(`supabase-field-rls.sql:14-15`) and `task_notes` (`supabase-notes.sql:30`); clients can set
`actor`/`author_id`/`author_name`/`hash`. Org+role gated → no cross-tenant leak.

**Proposed fix:** revoke the client INSERT grants and route these writes through the existing
service-role APIs (which bind identity from the session), or keep the grant only where a client
insert is genuinely required and bind `actor`/`author` server-side. Pairs with H2.
**Risk if deferred:** in-org repudiation/forgery of notes and audit events.

---

## M2 — `team` writes scoped by `userId` only

**Evidence:** `app/api/team/route.ts` ~135/148/159 `.eq("id", userId)` with service role; mitigated
by the prior `target.org_id !== orgId → 404` check (~77-84).
**Proposed fix:** add `.eq("org_id", orgId)` to the update/delete/ban calls as defence-in-depth so
safety doesn't rest on one earlier guard.
**Risk if deferred:** a future refactor dropping the guard → cross-org user takeover.

---

## M3 — Misleading full-CRUD grants (inert today)

**Evidence:** `supabase-org-model.sql:96,98` full CRUD to `authenticated` on
`organisations`/`org_invites`; no write policy exists so they're default-denied now.
**Proposed fix:** reduce to `grant select` (folded into C1's migration). **Risk:** regression
hazard — one permissive policy away from being live.

---

## L1 — `invites` GET/revoke rely on RLS, not in-code filter

**Evidence:** `app/api/invites/route.ts:15-18`, `invites/revoke/route.ts:24-29` have no
`.eq("org_id")`. Cross-checked: `org_invite_links` RLS **is** correctly org+role scoped
(`supabase-signup.sql:54-90`), so contained.
**Proposed fix:** add a defensive `.eq("org_id", state.profile.org_id)` since these touch invite
tokens. Low priority.

---

## L2 — Unauthenticated AI routes

**Evidence:** `app/api/extract-pdf/route.ts`, `app/api/insights/route.ts` — no auth, no rate limit;
no DB/tenant data.
**Proposed fix:** require a session (or an internal token) and add basic rate limiting to protect
`GEMINI_API_KEY` spend.

---

## Confirmed strengths (buyer-facing)
- Secrets server-only (`lib/supabase/admin.ts:1` `server-only`); no secret committed/logged/in
  responses; only the public URL + anon key reach the browser. `.env*` git-ignored.
- No SQL-injection surface — supabase-js query builder only; all `.rpc()` calls use bound args.
- Identity/org/role derived from the JWT-verified session on every authenticated route, never from
  client input (`lib/auth/api-auth.ts`, `lib/auth/profile.ts`).
- RLS enabled on all 23 tables, org-scoped + superadmin carve-out; helper functions are
  `security definer` with `set search_path`. `gate_signoffs` immutability trigger is real.
- Private storage buckets (`gate-signatures`, `task-email-attachments`) with org-scoped RLS.

## Data protection — confirm in the Supabase dashboard (not in code)
Region/residency of `fmeixgnxkcapxyhrjhvm`; backup/PITR tier + retention; MFA for project admins;
Postgres network restrictions; confirm both storage buckets are `public:false`. TLS in transit and
AES-256 at rest are Supabase platform defaults.

## Suggested sequence
**C1 + C2 are both critical and ship first** (two small DDL migrations: identity-hardening
[C1 + M3] and the anon-path retirement [C2]). Then H2 → M1 → M2 → L1/L2. C2 needs a 60-second
check that the public `?w=` demo no longer depends on the anon write/delete path before revoking it.
