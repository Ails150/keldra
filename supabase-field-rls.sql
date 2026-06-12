-- =============================================================================
-- Keldra: field-capture RLS — defence-in-depth.
--
-- Run AFTER supabase-orgdata.sql. Idempotent + safe to re-run.
--
-- /api/field/capture uses the service role (org_id derived from the verified
-- session, never the body), so these policies aren't strictly required for that
-- route. They exist so RLS is NOT a silent gap: blockers / blocker_events had
-- SELECT-only policies, which is exactly how the field-write bug stayed
-- invisible. Now an org member (field / manager / org_admin / superadmin) can
-- insert their own org's rows directly too.
-- =============================================================================

grant insert on public.blockers       to authenticated;
grant insert on public.blocker_events to authenticated;

-- blockers: org-scoped insert for capture-capable roles.
drop policy if exists blockers_insert on public.blockers;
create policy blockers_insert on public.blockers for insert to authenticated
  with check (
    public.is_superadmin()
    or (
      org_id = public.auth_org_id()
      and public.auth_role() = any (array['field','manager','org_admin','superadmin']::text[])
    )
  );

-- blocker_events: insert when the parent blocker is in the caller's org.
drop policy if exists blocker_events_insert on public.blocker_events;
create policy blocker_events_insert on public.blocker_events for insert to authenticated
  with check (
    public.is_superadmin()
    or (
      org_id = public.auth_org_id()
      and public.auth_role() = any (array['field','manager','org_admin','superadmin']::text[])
    )
  );

-- Storage: mer-field-photos — authenticated org-scoped insert + read. Field
-- photos are stored under {org_id}/… so the first path segment is the org.
drop policy if exists mer_photos_insert on storage.objects;
create policy mer_photos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'mer-field-photos'
    and (public.is_superadmin() or (storage.foldername(name))[1] = public.auth_org_id()::text)
  );

drop policy if exists mer_photos_select on storage.objects;
create policy mer_photos_select on storage.objects for select to authenticated
  using (
    bucket_id = 'mer-field-photos'
    and (public.is_superadmin() or (storage.foldername(name))[1] = public.auth_org_id()::text)
  );

select 'field-rls applied' as status;
