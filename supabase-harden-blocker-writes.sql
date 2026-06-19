-- =============================================================================
-- Keldra security fix M1: clients can't FORGE audit/attribution by direct insert.
--
-- Run in the Supabase SQL editor for project fmeixgnxkcapxyhrjhvm. Idempotent.
--
-- Every blocker / blocker_events / task_notes write already goes through
-- service-role routes (field/capture, tasks/notes, sequences engine, seed) —
-- verified no browser insert — so revoking the `authenticated` INSERT grants
-- closes the forgery hole with zero functional impact. Pairs with H2: a client
-- can now neither edit/delete (the blocker_events_guard trigger) NOR forge new
-- (this) audit/attribution rows. service_role bypasses grants, so seeding +
-- appendBlockerEvent + the asset_tag chains are unaffected.
-- =============================================================================

revoke insert on public.blockers       from authenticated;
revoke insert on public.blocker_events from authenticated;
revoke insert on public.task_notes     from authenticated;

notify pgrst, 'reload schema';

-- SANITY: authenticated should retain SELECT only on these three.
select table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('blockers','blocker_events','task_notes')
  and grantee = 'authenticated'
order by table_name, privilege_type;
