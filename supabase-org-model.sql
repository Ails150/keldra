-- =============================================================================
-- Keldra: anonymous ?w= workspace model  ->  authenticated organisation model.
--
-- Run this ONCE in the Supabase SQL editor (project fmeixgnxkcapxyhrjhvm).
-- Idempotent + safe to re-run. The legacy anon ?w= demo keeps working
-- (separate anon RLS path), so app.keldra.io public demo does not break.
--
-- Mirrors Vantro's organisations / users / org_id + RLS pattern.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- 1. ORGANISATIONS ------------------------------------------------------------
create table if not exists public.organisations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

-- 2. USERS — profile mirror of auth.users ------------------------------------
create table if not exists public.users (
  id         uuid primary key references auth.users(id) on delete cascade,
  org_id     uuid references public.organisations(id),
  full_name  text,
  role       text not null default 'member',
  created_at timestamptz not null default now()
);

-- 3. ORG INVITES — email -> org + role, consumed by the new-user trigger ------
create table if not exists public.org_invites (
  email      text primary key,
  org_id     uuid not null references public.organisations(id),
  role       text not null default 'member',
  full_name  text,
  created_at timestamptz not null default now()
);

-- 4. mer_field_events: add org columns (keep EVERY existing column incl.
--    session_id legacy demo). Default the new columns from the caller's JWT so
--    an authenticated insert auto-stamps org_id + actor_user_id.
alter table public.mer_field_events
  add column if not exists org_id        uuid references public.organisations(id),
  add column if not exists actor_user_id uuid references auth.users(id);

create index if not exists mer_field_events_org_id_idx on public.mer_field_events(org_id);

-- 5. HELPERS — SECURITY DEFINER so they read public.users without tripping its
--    own RLS (no recursion).
create or replace function public.auth_org_id()
returns uuid language sql stable security definer set search_path = public as $$
  select org_id from public.users where id = auth.uid()
$$;

create or replace function public.is_superadmin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'superadmin' from public.users where id = auth.uid()), false)
$$;

grant execute on function public.auth_org_id(), public.is_superadmin() to anon, authenticated;

-- Auto-stamp org_id + actor_user_id on authenticated inserts (anon -> NULL,
-- which is fine: the anon demo path scopes by session_id instead).
alter table public.mer_field_events
  alter column org_id        set default public.auth_org_id(),
  alter column actor_user_id set default auth.uid();

-- 6. NEW-USER TRIGGER — create a public.users row when an auth user is created,
--    honouring an org_invite by email (so creating Johnny in the Auth dashboard
--    auto-maps him to Ardmac with role pm — no manual profile step).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare inv public.org_invites;
begin
  select * into inv from public.org_invites where lower(email) = lower(new.email);
  insert into public.users (id, org_id, full_name, role)
  values (
    new.id,
    inv.org_id,
    coalesce(inv.full_name, new.raw_user_meta_data->>'full_name'),
    coalesce(inv.role, 'member')
  )
  on conflict (id) do update
    set org_id    = coalesce(excluded.org_id, public.users.org_id),
        full_name = coalesce(excluded.full_name, public.users.full_name),
        role      = case when public.users.role = 'superadmin' then 'superadmin'
                         else coalesce(excluded.role, public.users.role) end;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- 7. GRANTS (table-level; RLS still restricts rows) ---------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.organisations to authenticated;
grant select, insert, update, delete on public.users        to authenticated;
grant select, insert, update, delete on public.org_invites  to authenticated;
grant select, insert, update, delete on public.mer_field_events to authenticated;
grant select, insert, delete         on public.mer_field_events to anon;

-- 8. RLS ----------------------------------------------------------------------
alter table public.organisations    enable row level security;
alter table public.users            enable row level security;
alter table public.org_invites      enable row level security;
alter table public.mer_field_events enable row level security;

-- organisations: members see their own org; superadmin sees all.
drop policy if exists org_select on public.organisations;
create policy org_select on public.organisations for select to authenticated
  using (id = public.auth_org_id() or public.is_superadmin());

-- users: see self; org peers; superadmin sees all. Update only self.
drop policy if exists users_select on public.users;
create policy users_select on public.users for select to authenticated
  using (id = auth.uid() or public.is_superadmin() or org_id = public.auth_org_id());
drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- org_invites: superadmin only.
drop policy if exists invites_admin on public.org_invites;
create policy invites_admin on public.org_invites for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

-- mer_field_events: wipe ALL existing policies, then recreate exactly what we
-- want so no leftover permissive "project = 'MER'" policy can let an
-- authenticated user bypass org scoping.
do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = 'mer_field_events'
  loop execute format('drop policy if exists %I on public.mer_field_events', p.policyname); end loop;
end $$;

-- (a) authenticated org members + superadmin
create policy mfe_auth_select on public.mer_field_events for select to authenticated
  using (public.is_superadmin() or org_id = public.auth_org_id());
create policy mfe_auth_insert on public.mer_field_events for insert to authenticated
  with check (public.is_superadmin() or org_id = public.auth_org_id());
create policy mfe_auth_delete on public.mer_field_events for delete to authenticated
  using (public.is_superadmin() or org_id = public.auth_org_id());

-- (b) LEGACY anon demo (?w= workspace via session_id) — unchanged behaviour.
create policy mfe_anon_select on public.mer_field_events for select to anon
  using (project = 'MER');
create policy mfe_anon_insert on public.mer_field_events for insert to anon
  with check (project = 'MER');
create policy mfe_anon_delete on public.mer_field_events for delete to anon
  using (project = 'MER');

-- 9. REALTIME — ensure the table broadcasts (RLS still filters per-subscriber).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'mer_field_events'
  ) then
    alter publication supabase_realtime add table public.mer_field_events;
  end if;
end $$;

-- 10. SEED — org Ardmac + invite Johnny (pm), backfill existing users, and
--     elevate the owner to superadmin.
insert into public.organisations (id, name)
select gen_random_uuid(), 'Ardmac'
where not exists (select 1 from public.organisations where name = 'Ardmac');

insert into public.org_invites (email, org_id, role, full_name)
select v.email, o.id, v.role, v.full_name
from public.organisations o
cross join (values
  ('jonathan.mckenna@ardmac.com', 'pm', 'Johnny McKenna'),
  -- throwaway QA account for end-to-end verification (delete when done)
  ('fieldtest@keldra.io',          'pm', 'Field Test')
) as v(email, role, full_name)
where o.name = 'Ardmac'
on conflict (email) do update
  set org_id = excluded.org_id, role = excluded.role, full_name = excluded.full_name;

-- NOTE: accounts + passwords are created in the Supabase Auth dashboard
-- (Authentication -> Users -> Add user -> Create new user, with "Auto Confirm
-- User" ticked). The handle_new_user trigger above reads the matching invite on
-- creation and maps the new user to Ardmac with the right role automatically.
-- No password is stored in this file or anywhere in the repo (rule #3).

-- backfill a profile row for any existing auth user (e.g. the admin account)
insert into public.users (id, full_name, role)
select u.id, u.raw_user_meta_data->>'full_name', 'member'
from auth.users u
on conflict (id) do nothing;

-- elevate the owner to cross-org superadmin
update public.users set role = 'superadmin'
where id = (select id from auth.users where lower(email) = lower('ailsdoherty00@gmail.com'));

-- 11. (Accounts are created in the Auth dashboard — see the NOTE above. No
--      passwords live in this repo.) If a user was created BEFORE this migration
--      (so the trigger never fired for them), map them to Ardmac here by email.
update public.users u
  set org_id = o.id,
      role  = coalesce(i.role, u.role),
      full_name = coalesce(u.full_name, i.full_name)
from auth.users au
join public.org_invites i on lower(i.email) = lower(au.email)
join public.organisations o on o.id = i.org_id
where u.id = au.id;

-- 12. SANITY OUTPUT -----------------------------------------------------------
select 'org'  as kind, id::text, name        as detail from public.organisations
union all
select 'user' as kind, u.id::text, coalesce(u.full_name,'') || ' / ' || u.role ||
       ' / org=' || coalesce(o.name,'(none)')
from public.users u left join public.organisations o on o.id = u.org_id;
