-- =============================================================================
-- Keldra: self-serve sign-up — token-based organisation invites.
--
-- Run this ONCE in the Supabase SQL editor (project fmeixgnxkcapxyhrjhvm),
-- AFTER supabase-org-model.sql. Idempotent + safe to re-run.
--
-- This adds a NEW, token-based invite table (org_invite_links) for self-serve
-- "join by link" sign-up. It deliberately does NOT touch the existing
-- email-keyed public.org_invites table or the handle_new_user trigger — that
-- manual-provisioning path keeps working unchanged.
--
-- The privileged writes for sign-up (creating organisations, mapping
-- public.users, incrementing use_count) are performed by server route handlers
-- using the SERVICE ROLE key, which bypasses RLS. The RLS below only governs
-- what an authenticated admin can read/create from the dashboard "Invite
-- people" panel with their own session.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- 1. HELPER — the caller's role, SECURITY DEFINER so policies can read
--    public.users.role without tripping that table's own RLS (no recursion).
create or replace function public.auth_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid()
$$;

grant execute on function public.auth_role() to anon, authenticated;

-- 2. ORG INVITE LINKS — token-based, multi-use, expiring. -----------------------
create table if not exists public.org_invite_links (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organisations(id) on delete cascade,
  token      text not null unique,
  role       text not null default 'member',
  created_by uuid references auth.users(id),
  expires_at timestamptz,
  max_uses   int default null,
  use_count  int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists org_invite_links_org_id_idx on public.org_invite_links(org_id);
create index if not exists org_invite_links_token_idx  on public.org_invite_links(token);

-- 3. GRANTS (table-level; RLS still restricts rows). --------------------------
grant select, insert, update on public.org_invite_links to authenticated;

-- 4. RLS — org admins + superadmin, own org only. -----------------------------
--    Rule: every role check includes 'superadmin'::text. is_superadmin() also
--    short-circuits cross-org access for the platform owner.
alter table public.org_invite_links enable row level security;

drop policy if exists invite_links_select on public.org_invite_links;
create policy invite_links_select on public.org_invite_links for select to authenticated
  using (
    public.is_superadmin()
    or (
      org_id = public.auth_org_id()
      and public.auth_role() = any (array['org_admin','superadmin']::text[])
    )
  );

drop policy if exists invite_links_insert on public.org_invite_links;
create policy invite_links_insert on public.org_invite_links for insert to authenticated
  with check (
    public.is_superadmin()
    or (
      org_id = public.auth_org_id()
      and public.auth_role() = any (array['org_admin','superadmin']::text[])
    )
  );

-- update is how the panel "revokes" (sets expires_at in the past).
drop policy if exists invite_links_update on public.org_invite_links;
create policy invite_links_update on public.org_invite_links for update to authenticated
  using (
    public.is_superadmin()
    or (
      org_id = public.auth_org_id()
      and public.auth_role() = any (array['org_admin','superadmin']::text[])
    )
  )
  with check (
    public.is_superadmin()
    or (
      org_id = public.auth_org_id()
      and public.auth_role() = any (array['org_admin','superadmin']::text[])
    )
  );

-- 5. ATOMIC CLAIM — check-and-increment use_count in one statement so two
--    simultaneous joins can't blow past max_uses. SECURITY DEFINER; called by
--    the service-role join route (and safe for anyone — it only consumes a
--    valid, unexpired, non-exhausted token and returns the org/role to map).
create or replace function public.claim_org_invite(p_token text)
returns table (org_id uuid, role text)
language plpgsql security definer set search_path = public as $$
declare claimed public.org_invite_links;
begin
  update public.org_invite_links l
     set use_count = l.use_count + 1
   where l.token = p_token
     and (l.expires_at is null or l.expires_at > now())
     and (l.max_uses is null or l.use_count < l.max_uses)
  returning * into claimed;

  if claimed.id is null then
    return; -- no row: invalid, expired, or exhausted
  end if;

  org_id := claimed.org_id;
  role   := claimed.role;
  return next;
end $$;

-- Only the service role should call this (it bypasses the use-count guards a
-- client could otherwise script). Do NOT grant to anon/authenticated.
revoke all on function public.claim_org_invite(text) from public, anon, authenticated;

-- 6. SANITY OUTPUT ------------------------------------------------------------
select 'org_invite_links' as table, count(*)::text as rows from public.org_invite_links;
