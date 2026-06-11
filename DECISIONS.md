# DECISIONS — full new-org experience + DB cutover

Running log of judgment calls made while building the "every new org is a
complete working platform" work, so nothing is silently assumed.

## Context discovered
- Live DB had **one org (Ardmac)** + two orphaned `aileen odoherty` users with
  `org_id = null`. **There was no "Blake" / blakekelly154 org.** Verification
  target #5 didn't exist.
- `register` / `xer` parsed structures are consumed only by the `assets` view.
  The relational cutover therefore models tasks / gates / blockers / roster and
  leaves the assets-register view to degrade gracefully when absent.
- The dashboard renders entirely from a single client `WizardData` object
  (`keldra_demo_project` in localStorage) + a derived `BlockerMap`. Most views
  consume `project` + `blockerMap`; `overview` is hardcoded narrative and
  `gates` reads the in-memory demo store.

## Judgment calls
1. **Provisioned a Blake org for verification.** Created org "Blake" + an
   org_admin (`blakekelly154+admin@…`) and a field user, via the service role
   (simulating signup), so #5 can be verified live. Documented row ids in the
   verification section.
2. **Architecture — reuse the view pipeline, don't rewrite every view.** For an
   authenticated org with DB data, the dashboard builds `project` (WizardData) +
   `blockerMap` from relational rows via a loader, so the existing views
   (people / holding-back / schedule / constraints / blockers / today) render
   real org data unchanged. Only `overview` (hardcoded) and `gates` (demo-store)
   are rewritten to compute from the real rows. Anonymous demo path is untouched
   (still `seedDemoStore` → localStorage).
3. **Blocker model.** `blockers` is extended with the state-machine columns the
   `BlockerMap` needs, plus a `blocker_events` event store (hash-chained in the
   client today; persisted server-side for real orgs). Interactive mutations
   write through to the DB.
4. **Sample data = canonical baseline.** "Start with sample data" seeds the same
   content the Ardmac demo uses (the 46 baseline tasks, the gate ladder from the
   org's template, a blocker per blocked/not-started task, and a roster), all
   org-scoped and idempotent. Generalised from `scripts/seed-ardmac.ts` into a
   server module + an org_admin-only API the empty-state button calls.
5. **Killed the name gate.** Removed the lowercase-`ardmac` special case. Any
   authenticated org with DB data gets the full dashboard reading its own rows;
   an org with no data gets the empty state + "Start with sample data".
6. **Task assignments.** New `task_assignments` (task_id, user_id, org-scoped).
   org_admin/manager assign; field users see only their assigned tasks in
   `/field` (empty list when none); viewers stay read-only.

## Hard constraint — I cannot apply DDL
The service-role key reaches only the data API / auth / storage, not
`CREATE TABLE`. `.env.local` has no direct Postgres connection string. So I
**cannot apply** `supabase-orgdata.sql` / `supabase-sequences.sql` myself —
**you must run them in the Supabase SQL editor.** Consequences:
- The relational cutover degrades **gracefully**: the dashboard loader tries the
  DB and falls back to the current behaviour on any missing-table error, so
  Ardmac/production does **not** break before the migration is applied. Once the
  migrations are run + sample data seeded, authed orgs render purely from DB.
- Live verification of roster / blocker / assignment rendering is blocked until
  you run `supabase-orgdata.sql`. I verified everything reachable with the
  existing tables (tasks read-path, org provisioning, invites, routing) and
  build/typecheck for the rest.

## Status
- [x] **1. Sample data on demand — DONE.** `lib/org/sample-seed.ts` +
  `/api/admin/seed-sample` (org_admin, idempotent) + the empty-state "Start with
  sample data" button. Tasks + gates seed against existing tables (live);
  blockers + roster are guarded and activate once `supabase-orgdata.sql` runs.
- [ ] **2. Complete cutover (overview/gates/blockers from DB) — NOT DONE.**
  Two hard blockers: (a) I can't apply DDL, so the supporting tables
  (`blocker_events`, extended `blockers`, `roster`) don't exist live → can't
  populate or verify; (b) the dashboard is client-rendered and I can't drive an
  authenticated browser headlessly, so pushing a blind dashboard-shell data-
  source rewrite to **production** (it auto-deploys `main`) is unacceptably
  risky. Design is captured above (loader builds `WizardData` + `BlockerMap`
  from DB rows; overview/gates rewritten to compute from them). Deferred until
  the migration is applied + the change can be verified in a browser.
- [ ] **3. Kill name gate — NOT DONE** (coupled to #2's loader; same blockers).
- [ ] **4. Wizard → DB — NOT DONE** (same blockers; needs the loader + write path).
- [~] **5. Verify in Blake — PARTIAL.** Blake org provisioned (org_admin
  `blakekelly154+admin@keldra.io`, field `blakekelly154+field@keldra.io`),
  template-initialised, 46 tasks + A/B/C/BU gates + org_config seeded and
  verified live. Task read-path verified. Blocker/roster/assignment rendering +
  the field-assignment check are blocked on `supabase-orgdata.sql`.
- [~] **6. Task assignments — CODE-COMPLETE, verification blocked.**
  `task_assignments` table (in `supabase-orgdata.sql`), `/api/tasks/assign`
  (GET members+assigned, POST add/remove; org_admin/manager only), task-panel
  assign control, and field "My tasks" (field users see only their assigned
  tasks; "no tasks assigned yet" when none). Live verification needs the table
  (DDL — run `supabase-orgdata.sql`).

## To finish (for the human, then me)
1. Run `supabase-orgdata.sql` (and `supabase-sequences.sql` if not yet) in the
   Supabase SQL editor.
2. Then I can: seed Blake's blockers/roster, build the loader + overview/gates
   rewrite + kill the name gate (#2/#3), wire the wizard to the DB (#4), and
   verify the whole thing in Blake — including assigning a task to the field
   user and confirming `/field` shows exactly that one.
