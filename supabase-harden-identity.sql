-- =============================================================================
-- Keldra security fix C1 (+ M3): remove client write paths to identity tables.
--
-- Run in the Supabase SQL editor for project fmeixgnxkcapxyhrjhvm. Idempotent.
--
-- C1: `users_update_self` allowed `update users using (id = auth.uid())` with NO
-- column restriction, and `authenticated` held full CRUD on users — so a member
-- could `update users set role='superadmin'` (or change org_id) on their own row
-- and gain cross-org access. Every legitimate user/org write goes through
-- service-role routes (signup, onboarding/complete, team, invites/direct), which
-- bypass these grants; verified no client component writes to `users` (all
-- browser `from('users')` calls are SELECT-only). So removing the client write
-- paths breaks nothing and closes the self-escalation hole.
-- M3: the inert full-CRUD grants on organisations/org_invites are reduced too.
-- service_role is a separate role and is unaffected (it bypasses RLS + has its
-- own privileges), so onboarding/team/signup continue to work.
-- =============================================================================

revoke insert, update, delete on public.users         from authenticated;
revoke insert, update, delete on public.organisations from authenticated;
revoke insert, update, delete on public.org_invites   from authenticated;

drop policy if exists users_update_self on public.users;

-- SANITY (read-only). Expect: users has only its SELECT policy (no UPDATE row);
-- authenticated retains SELECT only on these tables.
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and tablename in ('users','organisations','org_invites')
order by tablename, policyname;

select table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('users','organisations','org_invites')
  and grantee = 'authenticated'
order by table_name, privilege_type;
