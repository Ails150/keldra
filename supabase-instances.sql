-- =============================================================================
-- Keldra: custom-instance architecture (foundation).
--
-- Run AFTER supabase-org-model.sql / supabase-signup.sql / supabase-email.sql.
-- Idempotent + safe to re-run.
--
-- Moves the per-instance model into the DB: projects, tasks, gates, blockers,
-- and org_config (terminology / gate structure / blocker taxonomy / escalation
-- cadences). Everything is org-scoped with the superadmin carve-out. New orgs
-- initialise from a named template (hyperscaler-dc) so client calibration is
-- DATA ENTRY, not code.
--
-- STAGED CUTOVER: these tables are ADDITIVE. The dashboard still reads its
-- localStorage seed today; rewiring the views to read from these tables is the
-- next stage (see RUNBOOK "Staged cutover"). Until then nothing breaks.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- 1. PROJECTS -----------------------------------------------------------------
create table if not exists public.projects (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organisations(id) on delete cascade,
  name       text not null,
  baseline_revision_date date,
  created_at timestamptz not null default now()
);
create index if not exists projects_org_idx on public.projects(org_id);

-- 2. TASKS (the durable task table; task_code stays the stable business key) ---
create table if not exists public.tasks (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organisations(id) on delete cascade,
  project_id          uuid references public.projects(id) on delete cascade,
  code                text not null,
  name                text,
  wbs_path            text,
  responsible_company text,
  blocking_company    text,
  status              text,
  blocked_reason      text,
  affects_room        text,
  planned_start       date,
  planned_end         date,
  planned_manpower    int,
  actual_manpower     int,
  cost_per_day        numeric not null default 0,
  created_at          timestamptz not null default now(),
  unique (org_id, code)
);
create index if not exists tasks_org_idx on public.tasks(org_id);

-- 3. GATES --------------------------------------------------------------------
create table if not exists public.gates (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations(id) on delete cascade,
  project_id  uuid references public.projects(id) on delete cascade,
  code        text not null,
  name        text,
  target_date date,
  sort        int not null default 0,
  unique (org_id, code)
);
create index if not exists gates_org_idx on public.gates(org_id);

-- 4. BLOCKERS -----------------------------------------------------------------
create table if not exists public.blockers (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organisations(id) on delete cascade,
  task_id          uuid references public.tasks(id) on delete set null,
  task_code        text,
  title            text,
  held_by_company  text,
  affects_room     text,
  gate             text,
  status           text not null default 'open',
  days_open        int,
  cost_per_day     numeric not null default 0,
  created_at       timestamptz not null default now()
);
create index if not exists blockers_org_idx on public.blockers(org_id);

-- 5. ORG_CONFIG — the calibration knobs, one row per org. ---------------------
create table if not exists public.org_config (
  org_id     uuid primary key references public.organisations(id) on delete cascade,
  config     jsonb not null default '{}'::jsonb,
  template   text,
  updated_at timestamptz not null default now()
);

-- 6. task_threads gains a task_id FK alongside task_code. ---------------------
alter table public.task_threads
  add column if not exists task_id uuid references public.tasks(id) on delete set null;

-- 7. GRANTS (RLS still restricts rows; writes are via the service role). -------
grant select on public.projects   to authenticated;
grant select on public.tasks      to authenticated;
grant select on public.gates      to authenticated;
grant select on public.blockers   to authenticated;
grant select on public.org_config to authenticated;

-- 8. RLS — org members + superadmin read their org. ---------------------------
alter table public.projects   enable row level security;
alter table public.tasks      enable row level security;
alter table public.gates      enable row level security;
alter table public.blockers   enable row level security;
alter table public.org_config enable row level security;

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select to authenticated
  using (public.is_superadmin() or org_id = public.auth_org_id());

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
  using (public.is_superadmin() or org_id = public.auth_org_id());

drop policy if exists gates_select on public.gates;
create policy gates_select on public.gates for select to authenticated
  using (public.is_superadmin() or org_id = public.auth_org_id());

drop policy if exists blockers_select on public.blockers;
create policy blockers_select on public.blockers for select to authenticated
  using (public.is_superadmin() or org_id = public.auth_org_id());

drop policy if exists org_config_select on public.org_config;
create policy org_config_select on public.org_config for select to authenticated
  using (public.is_superadmin() or org_id = public.auth_org_id());

-- 9. TEMPLATE — default org_config by template name. The superadmin config
--    screen edits the per-org copy afterwards. Service-role only.
create or replace function public.template_config(p_template text)
returns jsonb language sql immutable as $$
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
        'first_chase_days',2,'escalate_after_days',7,'formal_after_days',14)
    )
    else jsonb_build_object(
      'terminology', jsonb_build_object('project','Project','task','Task',
        'gate','Gate','blocker','Blocker','company','Company','room','Room'),
      'gate_structure', jsonb_build_array(),
      'blocker_taxonomy', jsonb_build_array(),
      'escalation_cadences', jsonb_build_object(
        'first_chase_days',2,'escalate_after_days',7,'formal_after_days',14)
    )
  end
$$;

-- Initialise (or re-seed if empty) an org from a template. Used by /api/signup
-- for new orgs, and by the Ardmac seed below. Also seeds the gate ladder.
create or replace function public.init_org_from_template(p_org_id uuid, p_template text)
returns void language plpgsql security definer set search_path = public as $$
declare g jsonb;
begin
  insert into public.org_config (org_id, config, template)
  values (p_org_id, public.template_config(p_template), p_template)
  on conflict (org_id) do nothing;

  for g in select * from jsonb_array_elements(public.template_config(p_template)->'gate_structure')
  loop
    insert into public.gates (org_id, code, name, sort)
    values (p_org_id, g->>'code', g->>'name', 0)
    on conflict (org_id, code) do nothing;
  end loop;
end $$;

revoke all on function public.init_org_from_template(uuid, text) from public, anon, authenticated;

-- 10. ARDMAC SEED — the demo org is configured from the hyperscaler-dc template
--     and gets a project row. (Full task/blocker seeding from the baseline is
--     stage 2 of the cutover — see RUNBOOK.)
do $$
declare a uuid;
begin
  select id into a from public.organisations where name = 'Ardmac' limit 1;
  if a is not null then
    perform public.init_org_from_template(a, 'hyperscaler-dc');
    insert into public.projects (org_id, name, baseline_revision_date)
    select a, 'MER Cx', date '2026-04-21'
    where not exists (select 1 from public.projects where org_id = a);
  end if;
end $$;

-- 11. SANITY ------------------------------------------------------------------
select 'projects' as table, count(*)::text as rows from public.projects
union all select 'tasks', count(*)::text from public.tasks
union all select 'gates', count(*)::text from public.gates
union all select 'org_config', count(*)::text from public.org_config;
