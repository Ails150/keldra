# Keldra migrations — canonical order

Keldra has no `supabase/migrations` directory: migrations are `supabase-*.sql`
files applied by hand in the Supabase SQL editor. This file is the ordered list,
because "run them in order" is otherwise unanswerable once there are two dozen.

**Every migration goes to `keldra-dev` first, then `keldra-prod`.** See
RUNBOOK.md §4. All files are idempotent and safe to re-run.

Order below is the order the files were added to git, which matches their
dependency order. Where two files share a date, the dependency is noted.

| # | File | Creates / changes | Applied to prod? |
|---|------|-------------------|------------------|
| 1 | `supabase-org-model.sql` | `organisations`, `users`, org columns on `mer_field_events`, `auth_org_id()`, `is_superadmin()` | yes |
| 2 | `supabase-signup.sql` | `org_invite_links`, `auth_role()`, `claim_org_invite()` | yes |
| 3 | `supabase-email.sql` | `task_threads`, `task_emails`, `task_email_attachments`, `inbound_unmatched`, private bucket, `user_id_by_email()` | yes |
| 4 | `supabase-instances.sql` | `projects`, `tasks`, `gates`, `blockers`, `org_config`, `init_org_from_template()` | yes |
| 5 | `supabase-sequences.sql` | `task_sequences`, `sequence_audit`, `sequence` block on org_config | yes |
| 6 | `supabase-orgdata.sql` | `roster`, `blocker_events`, `task_assignments`, blocker state columns | yes |
| 7 | `supabase-health.sql` | `setup_health()` | yes |
| 8 | `supabase-field-rls.sql` | RLS + grants on `blockers` / `blocker_events` | yes |
| 9 | `supabase-notes.sql` | `task_notes` | yes |
| 10 | `supabase-summaries.sql` | `task_summaries` | yes |
| 11 | `supabase-contacts.sql` | `task_contacts` | **NO — see below** |
| 12 | `supabase-gate-signoffs.sql` | `gate_signoffs` + immutability trigger | yes |
| 13 | `supabase-milestones.sql` | `milestones` | yes |
| 14 | `supabase-sequences-cron.sql` | pg_cron tick, secrets held in **Vault** | needs verification |
| 15 | `supabase-blocker-visibility.sql` | per-blocker `visibility` + policy | yes |
| 16 | `supabase-signoff-trail.sql` | sign-off trail additions | yes |
| 17 | `supabase-asset-tags.sql` | `asset_tags` | yes |
| 18 | `supabase-asset-tag-foundation.sql` | `asset_tag_events` + append-only guard | yes |
| 19 | `supabase-harden-identity.sql` | **security C1 + M3** — revoke client writes on identity tables | yes |
| 20 | `supabase-blocker-events-guard.sql` | **security H2** — `blocker_events` append-only trigger | yes |
| 21 | `supabase-retire-anon-field.sql` | **security C2** — scope anon policies to org-less demo rows | yes |
| 22 | `supabase-harden-blocker-writes.sql` | **security M1** — revoke client INSERT on blockers/notes | yes |
| 23 | `supabase-data-protection.sql` | `consent_records`, `erasure_log`, 12-month email retention + cron | **not yet** |

Read-only checks, not migrations — run any time:

| File | What it reports |
|------|-----------------|
| `supabase-verify-cron-secret.sql` | whether the pg_cron tick holds its secret in Vault or in clear text |

## Known drift (7 September 2026)

**`supabase-contacts.sql` (#11) was never applied to keldra-prod.** `task_contacts`
returns PostgREST `PGRST205` — the table does not exist. Consequences:

- `GET /api/tasks/contacts` cannot work in production.
- `app/api/tasks/email/route.ts:115` upserts into `task_contacts`; that write fails.

This is what the absence of a dev project costs: a migration sat in the repo for
nearly three months looking applied. Apply it to dev, confirm the two call sites
work, then apply to prod.

## Verifying what is actually applied

`setup_health()` covers 15 tables and is exposed at `GET /api/health/setup`
(superadmin only). It does **not** cover every table — `task_contacts`,
`asset_tags`, `asset_tag_events`, `gate_signoffs`, `milestones`,
`consent_records` and `erasure_log` are outside it, which is why the drift above
went unnoticed. `node scripts/audit/inventory.mjs` counts every table and is the
faster check: a table that errors there is a table that does not exist.
