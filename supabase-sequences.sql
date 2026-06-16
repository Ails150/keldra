-- =============================================================================
-- Keldra: chase sequences (virtual PM) — schema + per-org config defaults.
--
-- Run AFTER supabase-instances.sql. Idempotent + safe to re-run.
--
-- A sequence is per-task: it starts when a chase with a deadline is sent, then
-- advances through steps (offsets from start) defined in org_config.sequence.
-- ANY inbound reply on the thread pauses it. Actual SENDING is gated OFF per
-- org (org_config.sequence.enabled=false) until explicitly turned on, so nothing
-- auto-chases external parties until you opt in AND the pg_cron tick is wired.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- 1. SEQUENCES — one active row per (org, task). -------------------------------
create table if not exists public.task_sequences (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organisations(id) on delete cascade,
  task_code          text not null,
  task_id            uuid references public.tasks(id) on delete set null,
  status             text not null default 'active' check (status in ('active','paused','completed','stopped')),
  current_step       int  not null default 0,
  total_steps        int  not null default 3,
  to_email           text not null,
  escalation_contact text,                 -- per-task CC; never guessed
  commitment_quote   text,
  gate_code          text,
  gate_date          date,
  deadline           timestamptz,
  started_at         timestamptz not null default now(),
  next_run_at        timestamptz,          -- when the next step is due
  paused_reason      text,
  created_by         uuid references auth.users(id),
  created_at         timestamptz not null default now(),
  unique (org_id, task_code)
);
create index if not exists task_sequences_due_idx on public.task_sequences(status, next_run_at);
create index if not exists task_sequences_org_idx on public.task_sequences(org_id);

-- 2. AUDIT — every decision (sent / paused / resumed / skipped / completed). ----
create table if not exists public.sequence_audit (
  id          uuid primary key default gen_random_uuid(),
  sequence_id uuid references public.task_sequences(id) on delete cascade,
  org_id      uuid not null references public.organisations(id) on delete cascade,
  task_code   text,
  step        int,
  action      text not null,   -- 'sent' | 'paused' | 'resumed' | 'started' | 'completed' | 'skipped-disabled' | 'skipped-hours' | 'skipped-cap'
  detail      text,
  created_at  timestamptz not null default now()
);
create index if not exists sequence_audit_org_idx on public.sequence_audit(org_id, created_at desc);
create index if not exists sequence_audit_sent_idx on public.sequence_audit(org_id, action, created_at);

-- 3. GRANTS + RLS (org members read; writes via the service role). -------------
grant select on public.task_sequences to authenticated;
grant select on public.sequence_audit to authenticated;

alter table public.task_sequences enable row level security;
alter table public.sequence_audit enable row level security;

drop policy if exists task_sequences_select on public.task_sequences;
create policy task_sequences_select on public.task_sequences for select to authenticated
  using (public.is_superadmin() or org_id = public.auth_org_id());

drop policy if exists sequence_audit_select on public.sequence_audit;
create policy sequence_audit_select on public.sequence_audit for select to authenticated
  using (public.is_superadmin() or org_id = public.auth_org_id());

-- 4. CONFIG DEFAULTS — extend template_config with a `sequence` block, and
--    backfill existing org_config rows that don't have one yet.
create or replace function public.sequence_default_config()
returns jsonb language sql immutable as $$
  -- ESCALATING cadence (tighter early, widening, then escalate). gap_days = days
  -- of silence to wait AFTER the previous step (after start/original silence for
  -- step 1) before this chase fires. Editable per org in org_config — the engine
  -- never hardcodes these. After the final step + escalate_after_days grace with
  -- no reply from the awaited party, the engine ESCALATES (stops chasing, sets the
  -- blocker to 'escalated', notifies escalation_owner_email if the org set one).
  select jsonb_build_object(
    'enabled', false,                       -- OFF by default (per-org opt-in)
    'daily_send_cap', 50,
    'timezone', 'Europe/Dublin',
    'working_hours', jsonb_build_object('start','08:00','end','18:00','days', jsonb_build_array(1,2,3,4,5)),
    'escalate_after_days', 7,               -- grace after final chase before escalation
    'escalation_owner_email', null,         -- who escalation notifies; NEVER guessed
    'steps', jsonb_build_array(
      jsonb_build_object('n',1,'gap_days',3,'cc_escalation',false,
        'subject','Following up — {task_code}',
        'body','Hi, following up on {task_code}. You mentioned: "{commitment_quote}". That was {days_silent} days ago — could you share an update? Thanks.'),
      jsonb_build_object('n',2,'gap_days',7,'cc_escalation',true,
        'subject','Action needed — {task_code} ({gate_code})',
        'body','{task_code} is now holding {gate_code} (due {gate_date}). "{commitment_quote}" was {days_silent} days ago with no movement. Please advise today.'),
      jsonb_build_object('n',3,'gap_days',14,'cc_escalation',false,'flag_to_report',true,
        'subject','Final notice — {task_code} unresolved',
        'body','{task_code} remains unresolved after {days_silent} days and is now flagged to the project report. This is a final notice before escalation. An immediate response is required.')
    )
  )
$$;

-- New orgs: template_config now carries the sequence block too.
create or replace function public.template_config(p_template text)
returns jsonb language sql stable as $$
  select case p_template
    when 'hyperscaler-dc' then jsonb_build_object(
      'terminology', jsonb_build_object(
        'project','Project','task','Task','gate','Gate',
        'blocker','Blocker','company','Company','room','Room'),
      'gate_structure', jsonb_build_array(
        jsonb_build_object('code','A','name','Power on'),
        jsonb_build_object('code','B','name','Yellow tag'),
        jsonb_build_object('code','C','name','Green tag'),
        jsonb_build_object('code','BU','name','Beneficial use')),
      'blocker_taxonomy', jsonb_build_array(
        'supply','design','deprioritisation','unstaffed','sign-off','procurement'),
      'escalation_cadences', jsonb_build_object(
        'first_chase_days',2,'escalate_after_days',7,'formal_after_days',14),
      'sequence', public.sequence_default_config()
    )
    else jsonb_build_object(
      'terminology', jsonb_build_object('project','Project','task','Task',
        'gate','Gate','blocker','Blocker','company','Company','room','Room'),
      'gate_structure', jsonb_build_array(),
      'blocker_taxonomy', jsonb_build_array(),
      'escalation_cadences', jsonb_build_object(
        'first_chase_days',2,'escalate_after_days',7,'formal_after_days',14),
      'sequence', public.sequence_default_config()
    )
  end
$$;

-- Backfill: any org_config without a sequence block gets the default.
update public.org_config
   set config = jsonb_set(config, '{sequence}', public.sequence_default_config(), true),
       updated_at = now()
 where not (config ? 'sequence');

-- Migrate the OLD shape (offset_days, no gap_days / escalate_after_days /
-- escalation_owner_email) to the new escalating-cadence shape the engine reads.
-- Re-seed steps + escalation knobs from the default, but PRESERVE each org's own
-- enabled flag and any escalation_owner_email they've set (never clobber opt-in
-- or a configured owner). Targets rows whose first step still lacks gap_days.
update public.org_config
   set config = jsonb_set(
                  config,
                  '{sequence}',
                  public.sequence_default_config()
                    || jsonb_build_object('enabled', coalesce(config #> '{sequence,enabled}', 'false'::jsonb))
                    || (case when (config #> '{sequence,escalation_owner_email}') is not null
                              and config #>> '{sequence,escalation_owner_email}' <> ''
                             then jsonb_build_object('escalation_owner_email', config #> '{sequence,escalation_owner_email}')
                             else '{}'::jsonb end),
                  true),
       updated_at = now()
 where (config #> '{sequence,steps,0}') is not null
   and not (config #> '{sequence,steps,0}' ? 'gap_days');

-- 5. SANITY -------------------------------------------------------------------
select 'task_sequences' as table, count(*)::text as rows from public.task_sequences
union all select 'sequence_audit', count(*)::text from public.sequence_audit
union all select 'org_config w/ sequence', count(*)::text from public.org_config where config ? 'sequence';
