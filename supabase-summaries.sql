-- =============================================================================
-- Keldra: per-task AI summary cache.
--
-- Run AFTER supabase-instances.sql. Idempotent + safe to re-run.
--
-- /api/tasks/summary regenerates the 3-part summary whenever the trail entry
-- count moves; this table caches the result with generated_at + entry_count so
-- the UI can show "Updated 2h ago · from 18 entries" and we never serve a
-- summary older than the newest trail entry. If this table is absent the route
-- still works — it just regenerates every load instead of caching.
-- =============================================================================

create table if not exists public.task_summaries (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organisations(id) on delete cascade,
  task_code     text not null,
  where_text    text,
  changed_text  text,
  insight_text  text,
  entry_count   int  not null default 0,
  newest_at     timestamptz,
  model         text,
  generated_at  timestamptz not null default now(),
  unique (org_id, task_code)
);
create index if not exists task_summaries_org_idx on public.task_summaries(org_id, task_code);

grant select on public.task_summaries to authenticated;
alter table public.task_summaries enable row level security;

drop policy if exists task_summaries_select on public.task_summaries;
create policy task_summaries_select on public.task_summaries for select to authenticated
  using (public.is_superadmin() or org_id = public.auth_org_id());

select 'task_summaries ready' as status;
