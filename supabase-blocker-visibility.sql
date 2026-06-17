-- =============================================================================
-- Keldra: per-blocker privacy (owner can hide a whole blocker from other orgs).
--
-- Run AFTER supabase-instances.sql. Idempotent + safe to re-run.
--
-- Extends the task_notes org-isolation model to whole blockers via an explicit
-- `visibility` column. FORWARD-LOOKING: there is no cross-org / shared-project
-- blocker view yet, so cross-org reads are closed for ALL blockers today. The
-- policy bakes the privacy rule in now so that when that view ships, an
-- 'org_private' blocker can NEVER leak cross-org. The owning org is the row's
-- org_id (the org that raised it); held_by_company is only a text label.
-- =============================================================================

-- 1. COLUMN — default 'shared' = current behaviour. Constrained to two values.
alter table public.blockers
  add column if not exists visibility text not null default 'shared';

alter table public.blockers drop constraint if exists blockers_visibility_chk;
alter table public.blockers
  add constraint blockers_visibility_chk check (visibility in ('shared','org_private'));

-- 2. FORWARD-LOOKING cross-org seam. No shared-project view exists yet, so this
--    returns false: no blocker is visible cross-org today, shared or not. When
--    that view ships, its body becomes the real project-membership test — and
--    'org_private' can never enter the branch that calls it, so privacy holds.
create or replace function public.blocker_visible_cross_org(p_owner_org uuid)
returns boolean language sql stable as $$
  select false  -- TODO(cross-org view): replace with real project-membership test
$$;
grant execute on function public.blocker_visible_cross_org(uuid) to authenticated;

-- 3. SELECT policy (replaces the org-scoped one). superadmin reads platform-wide;
--    an org reads its OWN blockers (shared OR org_private) for every known role;
--    cross-org is closed for all blockers today, and an 'org_private' row can
--    never reach the cross-org branch. The role array includes 'superadmin' and
--    every other role that currently reads blockers (incl. the legacy 'pm' seen
--    in org_invites) so no role loses read access.
drop policy if exists blockers_select on public.blockers;
create policy blockers_select on public.blockers for select to authenticated
using (
  public.is_superadmin()
  or (
    org_id = public.auth_org_id()
    and public.auth_role() = any (
      array['superadmin','org_admin','manager','member','field','viewer','pm']::text[]
    )
  )
  or (
    visibility = 'shared'
    and public.blocker_visible_cross_org(org_id)
  )
);

-- 4. SANITY --------------------------------------------------------------------
select
  count(*)                                          as total_blockers,
  count(*) filter (where visibility = 'org_private') as org_private_blockers,
  count(*) filter (where visibility = 'shared')      as shared_blockers
from public.blockers;
