-- =============================================================================
-- Keldra: asset-level Red/Yellow/Green commissioning tags + next-tag checklist.
--
-- Run AFTER supabase-instances.sql. Idempotent + safe to re-run.
--
-- An asset-level layer UNDER the Gate A–E model — the granular drill-down the
-- commissioning team works in. Does NOT touch gates/blockers/tasks. One row per
-- (org, asset). Ladder: red → yellow → green (each requires the previous);
-- next_checklist holds "what we need to align to reach the next tag".
-- Reads are org-scoped via RLS; writes happen via the service role (seed/API).
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.asset_tags (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organisations(id) on delete cascade,
  asset_id       text not null,
  tag            text not null default 'red' check (tag in ('red','yellow','green')),
  -- [{ "label": text, "status": "approved" | "outstanding" }]
  next_checklist jsonb not null default '[]'::jsonb,
  updated_at     timestamptz not null default now(),
  unique (org_id, asset_id)
);
create index if not exists asset_tags_org_idx on public.asset_tags(org_id);

grant select on public.asset_tags to authenticated;          -- writes via service role only

alter table public.asset_tags enable row level security;
drop policy if exists asset_tags_select on public.asset_tags;
create policy asset_tags_select on public.asset_tags for select to authenticated
  using (public.is_superadmin() or org_id = public.auth_org_id());

-- SANITY (bulletproof — no reserved-word alias, no cast-on-filter)
select
  count(*)                                  as total,
  count(*) filter (where tag = 'red')       as red,
  count(*) filter (where tag = 'yellow')    as yellow,
  count(*) filter (where tag = 'green')     as green
from public.asset_tags;
