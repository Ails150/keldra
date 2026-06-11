-- =============================================================================
-- Keldra: full org data model — roster, blocker event store, task assignments.
--
-- Run AFTER supabase-instances.sql. Idempotent + safe to re-run.
--
-- Backs the dashboard DB cutover: the BlockerMap is rebuilt from `blockers`
-- (now carrying its state-machine columns) + `blocker_events`; the roster is the
-- org's people; task_assignments scopes what field users see. Org-scoped RLS,
-- superadmin carve-out. Writes happen via service-role APIs.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- 1. BLOCKERS — add the state-machine columns the client BlockerMap needs. -----
alter table public.blockers
  add column if not exists description            text,
  add column if not exists raised_by              text,
  add column if not exists state                  text default 'unowned',
  add column if not exists current_owner          text,
  add column if not exists current_owner_org      text,
  add column if not exists waiting_on_person      text,
  add column if not exists waiting_on_org         text,
  add column if not exists since_timestamp        timestamptz default now(),
  add column if not exists priority               text,
  add column if not exists raised_date            timestamptz default now(),
  add column if not exists sit_on_today           boolean not null default false,
  add column if not exists sit_on_today_date      date,
  add column if not exists proposed_resolution_note text,
  add column if not exists linked_assets          text[] default '{}';

-- 2. BLOCKER EVENTS — the hash-chained audit trail, persisted server-side. -----
create table if not exists public.blocker_events (
  id         uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.blockers(id) on delete cascade,
  org_id     uuid not null references public.organisations(id) on delete cascade,
  seq        int  not null default 0,
  event_type text not null,
  actor      text,
  ts         timestamptz not null default now(),
  payload    jsonb not null default '{}'::jsonb,
  prev_hash  text,
  hash       text,
  created_at timestamptz not null default now()
);
create index if not exists blocker_events_blocker_idx on public.blocker_events(blocker_id, seq);
create index if not exists blocker_events_org_idx on public.blocker_events(org_id);

-- 3. ROSTER — the org's people (the dashboard "team"). ------------------------
create table if not exists public.roster (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organisations(id) on delete cascade,
  name       text not null,
  email      text,
  company    text,
  role       text,
  created_at timestamptz not null default now()
);
create index if not exists roster_org_idx on public.roster(org_id);

-- 4. TASK ASSIGNMENTS — who is responsible for a task (scopes field users). ----
create table if not exists public.task_assignments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations(id) on delete cascade,
  task_id     uuid not null references public.tasks(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  unique (task_id, user_id)
);
create index if not exists task_assignments_org_idx  on public.task_assignments(org_id);
create index if not exists task_assignments_user_idx on public.task_assignments(user_id);
create index if not exists task_assignments_task_idx on public.task_assignments(task_id);

-- 5. GRANTS + RLS -------------------------------------------------------------
grant select on public.blocker_events   to authenticated;
grant select on public.roster           to authenticated;
grant select on public.task_assignments to authenticated;

alter table public.blocker_events   enable row level security;
alter table public.roster           enable row level security;
alter table public.task_assignments enable row level security;

drop policy if exists blocker_events_select on public.blocker_events;
create policy blocker_events_select on public.blocker_events for select to authenticated
  using (public.is_superadmin() or org_id = public.auth_org_id());

drop policy if exists roster_select on public.roster;
create policy roster_select on public.roster for select to authenticated
  using (public.is_superadmin() or org_id = public.auth_org_id());

drop policy if exists task_assignments_select on public.task_assignments;
create policy task_assignments_select on public.task_assignments for select to authenticated
  using (public.is_superadmin() or org_id = public.auth_org_id());

-- 6. SANITY -------------------------------------------------------------------
select 'roster' as table, count(*)::text as rows from public.roster
union all select 'blocker_events', count(*)::text from public.blocker_events
union all select 'task_assignments', count(*)::text from public.task_assignments;
