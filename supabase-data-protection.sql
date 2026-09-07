-- =============================================================================
-- Keldra: minimum data-protection layer.
--   1. consent_records  — who agreed to what, when (signup capture)
--   2. erasure_log      — what an erasure removed and what it lawfully retained
--   3. purge_old_email_bodies() + pg_cron — 12-month retention on inbound email
--
-- Run in the Supabase SQL editor. Idempotent + safe to re-run.
-- APPLY TO keldra-dev FIRST, then keldra-prod. See RUNBOOK.md "Migrations".
--
-- Design note that the whole erasure story rests on:
-- blocker_events and asset_tag_events are append-only AND hash-chained (`actor`
-- and `actor_name` are inputs to the row hash), and gate_signoffs is immutable.
-- Redacting a name in any of them would break chain verification and trip the
-- guard triggers — i.e. it would destroy the evidence property the product is
-- sold on. So erasure does NOT touch them. That retention is deliberate and is
-- recorded per-request in erasure_log.retained, relying on UK/EU GDPR
-- Art 17(3)(e) — retention necessary for the establishment, exercise or defence
-- of legal claims, which is exactly what a commissioning accountability trail is.
-- =============================================================================

-- 1. CONSENT ------------------------------------------------------------------
create table if not exists public.consent_records (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users(id) on delete set null,
  email          text not null,
  org_id         uuid references public.organisations(id) on delete set null,
  policy_version text not null,
  document       text not null default 'privacy-notice',
  consented_at   timestamptz not null default now(),
  source         text not null default 'signup',
  user_agent     text,
  ip_prefix      text,           -- truncated (/24 or /48), never the full address
  created_at     timestamptz not null default now()
);

create index if not exists consent_records_email_idx   on public.consent_records (lower(email));
create index if not exists consent_records_user_id_idx on public.consent_records (user_id);
create index if not exists consent_records_org_id_idx  on public.consent_records (org_id);

alter table public.consent_records enable row level security;

-- Readable by admins of the org the consent belongs to, plus superadmin.
drop policy if exists consent_records_select on public.consent_records;
create policy consent_records_select on public.consent_records
  for select to authenticated
  using (
    public.is_superadmin()
    or (org_id is not null and org_id = public.auth_org_id() and public.auth_role() in ('org_admin','superadmin'))
  );

-- No client writes at all: consent is recorded by the service-role signup route,
-- so a consent record can never be forged or back-dated from a browser.
revoke insert, update, delete on public.consent_records from anon, authenticated;
grant select on public.consent_records to authenticated;

-- Consent is evidence: append-only, like the rest of the trail.
create or replace function public.consent_records_guard()
returns trigger language plpgsql as $$
begin
  raise exception 'consent_records is append-only — consent cannot be altered or deleted';
end $$;

drop trigger if exists consent_records_guard_trg on public.consent_records;
create trigger consent_records_guard_trg
  before update or delete on public.consent_records
  for each row execute function public.consent_records_guard();

-- 2. ERASURE LOG --------------------------------------------------------------
-- The subject's address is stored as a SHA-256 hash, not in clear: the log has
-- to prove an erasure happened without re-introducing the data just erased.
create table if not exists public.erasure_log (
  id              uuid primary key default gen_random_uuid(),
  subject_hash    text not null,
  org_id          uuid references public.organisations(id) on delete set null,
  requested_by    uuid references auth.users(id) on delete set null,
  requested_at    timestamptz not null default now(),
  erased          jsonb not null default '{}'::jsonb,   -- {table: rows_affected}
  retained        jsonb not null default '{}'::jsonb,   -- {table: {rows, basis}}
  policy_version  text
);

create index if not exists erasure_log_subject_idx on public.erasure_log (subject_hash);
create index if not exists erasure_log_org_idx     on public.erasure_log (org_id);

alter table public.erasure_log enable row level security;

drop policy if exists erasure_log_select on public.erasure_log;
create policy erasure_log_select on public.erasure_log
  for select to authenticated
  using (
    public.is_superadmin()
    or (org_id is not null and org_id = public.auth_org_id() and public.auth_role() in ('org_admin','superadmin'))
  );

revoke insert, update, delete on public.erasure_log from anon, authenticated;
grant select on public.erasure_log to authenticated;

create or replace function public.erasure_log_guard()
returns trigger language plpgsql as $$
begin
  raise exception 'erasure_log is append-only';
end $$;

drop trigger if exists erasure_log_guard_trg on public.erasure_log;
create trigger erasure_log_guard_trg
  before update or delete on public.erasure_log
  for each row execute function public.erasure_log_guard();

-- 3. RETENTION — 12 months on inbound email content ---------------------------
-- Subject and body are the bulk of the personal data and the part with no
-- lasting accountability value once the task has moved on. The ROW survives
-- (so the trail still shows that an email happened, from whom, and when) —
-- only the content is dropped. task_emails is not hash-chained, so this is safe.
-- Column first: the function below writes to it.
alter table public.task_emails add column if not exists purged_at timestamptz;

create or replace function public.purge_old_email_bodies(p_months int default 12)
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  -- INBOUND only, as scoped. task_emails has no received_at — created_at is the
  -- row's arrival time and is what the retention clock runs on.
  update public.task_emails
     set body_text = null,
         body_html = null,
         subject   = case when subject is null then null
                          else '[content purged — 12-month retention]' end,
         purged_at = now()
   where purged_at is null
     and direction = 'inbound'
     and created_at < now() - make_interval(months => p_months);
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.purge_old_email_bodies(int) from public, anon, authenticated;

-- Schedule nightly at 03:30 UTC. Idempotent.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'keldra-email-retention') then
    perform cron.unschedule('keldra-email-retention');
  end if;
end $$;

select cron.schedule(
  'keldra-email-retention',
  '30 3 * * *',
  $cron$ select public.purge_old_email_bodies(12); $cron$
);
-- NOTE: this schedule carries NO secret — it is a plain local function call, so
-- there is nothing here for Vault to hold. Contrast supabase-sequences-cron.sql,
-- which does carry a secret and therefore reads it from Vault at run time.

-- 4. VERIFY (read-only) -------------------------------------------------------
select 'consent_records' as t, count(*) from public.consent_records
union all select 'erasure_log', count(*) from public.erasure_log
union all select 'task_emails purged', count(*) from public.task_emails where purged_at is not null;

select jobname, schedule, active from cron.job
where jobname in ('keldra-email-retention', 'keldra-sequence-tick')
order by jobname;
