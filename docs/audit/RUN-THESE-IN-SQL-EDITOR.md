# Two files to run in the Supabase SQL editor

Supabase → **keldra-prod** (`fmeixgnxkcapxyhrjhvm`) → SQL Editor → New query.

A pre-migration snapshot of every table was taken first — 1,287 rows at
`C:\keldra-backups\fmeixgnxkcapxyhrjhvm-2026-09-07T11-08-31-554Z`. It contains
personal data: keep it off the repo and off shared drives, and delete it once
you're satisfied the migration is good.

> **PITR could not be enabled from here.** It is a billable add-on and the CLI
> only exposes `backups list` and `backups restore`. Turn it on in
> Settings → Add-ons before you run these if you want a real recovery floor —
> the snapshot above is data only (no schema, roles, policies or storage).
>
> Current recovery position: daily physical backups, 8 retained, oldest
> 31 August. `pitr_enabled: false`.

---

## 1. `supabase-verify-cron-secret.sql` — read-only, run this first

Changes nothing. Reports whether the pg_cron tick holds its secret in Vault or in
clear text inside `cron.job.command`.

**What to look for** in the first result set:

| `secret_shape` | Meaning | Action |
|---|---|---|
| `vault (ok)` | secret read from Vault at run time | nothing to do |
| `inline literal (ROTATE)` | secret sitting in clear text in the job command | rotate, see below |
| `no secret header found` | job not scheduled, or shaped differently | paste me the output |

Also check `literal_secret_suspected` is `false`, and that the second result set
shows `keldra_tick_url` and `keldra_cron_secret` with `has_value = true`.

**If it says ROTATE:** generate a new secret (`openssl rand -hex 32`), set
`CRON_SECRET` to it in Vercel, then re-run `supabase-sequences-cron.sql` with the
new value in its step-2 block. That unschedules the old job, which removes the
clear-text command with it. Re-run the verify file to confirm.

Don't paste the secret value to me — the shape is all I need.

---

## 2. `supabase-data-protection.sql` — the migration

Creates `consent_records` and `erasure_log` (both append-only, no client writes),
adds `task_emails.purged_at`, creates `purge_old_email_bodies(12)`, and schedules
`keldra-email-retention` nightly at 03:30 UTC.

It is additive and idempotent: it creates tables, adds one nullable column, and
schedules a cron job. **It does not delete or rewrite any existing row.** The
retention purge only affects `direction = 'inbound'` rows older than 12 months,
and it runs on the schedule, not at migration time.

**Expected output at the end** — the file's own verify block:

```
consent_records      0
erasure_log          0
task_emails purged   0
```

plus both cron jobs listed: `keldra-email-retention` and `keldra-sequence-tick`.

### One thing to check before you run it

The file assumes `pg_cron` is already installed (it is — `supabase-sequences-cron.sql`
installed it). If `cron.schedule` errors, run `create extension if not exists pg_cron;`
first and re-run.

---

## 3. Tell me when both are done

Then I'll re-run all four suites and confirm:

- `consent_records` and `erasure_log` exist → the erasure endpoint stops
  returning 500 and starts writing its audit log
- `gdpr.mjs` flips "Consent record", "Erasure audit log" and "Retention rule"
  from MISSING to PRESENT
- a real end-to-end erasure completes with `ok: true`

---

## Still outstanding after these two

- **Sign-up is broken** until SMTP is configured in Supabase Auth
  (Authentication → Emails → SMTP). Resend is already a dependency and
  `RESEND_API_KEY` already exists. The deployed code now fails honestly instead
  of telling new customers their address is taken, but nobody can create an
  account until this is done. **This is the one that blocks the consultant.**
- **`supabase-contacts.sql` is unapplied** (`task_contacts` does not exist, so
  `/api/tasks/contacts` cannot work). Run it whenever — it is #11 in
  `docs/MIGRATIONS.md`.
