-- =============================================================================
-- Keldra tag-model Foundation: extend asset_tags + add the append-only
-- asset_tag_events transition log (who/what/where/when/why/how).
--
-- Run AFTER supabase-asset-tags.sql, in project fmeixgnxkcapxyhrjhvm. Idempotent.
-- Reuses the H2 append-only + hash-chain pattern. Does NOT touch gates/blockers.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- 1. asset_tags gains owner / status / dates (current-state row).
alter table public.asset_tags
  add column if not exists owner_name    text,
  add column if not exists owner_org     text,
  add column if not exists status        text not null default 'in_progress',
  add column if not exists target_date   date,
  add column if not exists achieved_date date;

alter table public.asset_tags drop constraint if exists asset_tags_status_chk;
alter table public.asset_tags
  add constraint asset_tags_status_chk check (status in ('achieved','in_progress','late','blocked'));

-- 2. asset_tag_events — append-only, hash-chained transition log.
create table if not exists public.asset_tag_events (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations(id) on delete cascade,
  asset_id    text not null,
  seq         int  not null default 0,
  event_type  text not null,
  actor_name  text,
  actor_org   text,
  payload     jsonb not null default '{}'::jsonb,   -- where / why / how / to_tag / note
  ts          timestamptz not null default now(),
  prev_hash   text,
  hash        text,
  created_at  timestamptz not null default now()
);
create index if not exists asset_tag_events_idx on public.asset_tag_events(org_id, asset_id, seq);

grant select on public.asset_tag_events to authenticated;   -- writes via service role only
alter table public.asset_tag_events enable row level security;
drop policy if exists asset_tag_events_select on public.asset_tag_events;
create policy asset_tag_events_select on public.asset_tag_events for select to authenticated
  using (public.is_superadmin() or org_id = public.auth_org_id());

-- 3. Append-only guard (identical model to blocker_events_guard).
create or replace function public.asset_tag_events_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'asset_tag_events is append-only — events cannot be modified';
  end if;
  if tg_op = 'DELETE' and current_user in ('authenticated','anon') then
    raise exception 'asset_tag_events is append-only — events cannot be deleted';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists asset_tag_events_guard_trg on public.asset_tag_events;
create trigger asset_tag_events_guard_trg
  before update or delete on public.asset_tag_events
  for each row execute function public.asset_tag_events_guard();

-- Refresh PostgREST's schema cache so the new column/table are immediately
-- visible to the REST API + app (standard at the end of every Keldra migration).
notify pgrst, 'reload schema';

-- SANITY (read-only, bulletproof).
select
  (select count(*) from public.asset_tag_events) as events,
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='asset_tags' and column_name='status') as has_status;
