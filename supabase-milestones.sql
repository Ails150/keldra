-- =============================================================================
-- Keldra: milestones + gate dependency edges — the blocker→deadline impact chain.
--
-- Run AFTER supabase-instances.sql. Idempotent + safe to re-run.
--
-- A blocked gate threatens a MILESTONE and blocks the gates that DEPEND on it.
-- This adds per-org milestones, links each gate to the milestone it must clear
-- by, and records which gates depend on which (Gate C blocks D & E). Slip is
-- computed in app code from real dates; nothing here is hardcoded per org.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- 1. MILESTONES — per-org delivery dates a gate must clear by. -----------------
create table if not exists public.milestones (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations(id) on delete cascade,
  code        text not null,
  name        text,
  target_date date,
  created_at  timestamptz not null default now(),
  unique (org_id, code)
);
create index if not exists milestones_org_idx on public.milestones(org_id);

-- 2. GATES gain the downstream link + dependency edges. ------------------------
--    milestone_code → the milestone this gate must clear by (matches milestones.code).
--    depends_on     → gate codes this gate depends on (e.g. D, E depends_on {C}).
alter table public.gates
  add column if not exists milestone_code text,
  add column if not exists depends_on     text[] not null default '{}';

-- 3. GRANTS + RLS — org members read their org; writes via the service role. ---
grant select on public.milestones to authenticated;
alter table public.milestones enable row level security;

drop policy if exists milestones_select on public.milestones;
create policy milestones_select on public.milestones for select to authenticated
  using (public.is_superadmin() or org_id = public.auth_org_id());

-- 4. SANITY -------------------------------------------------------------------
select 'milestones' as table, count(*)::text as rows from public.milestones;
