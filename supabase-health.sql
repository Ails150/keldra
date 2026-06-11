-- =============================================================================
-- Keldra: setup health check helper.
--
-- Run this LAST in the Supabase SQL editor, AFTER supabase-org-model.sql,
-- supabase-signup.sql and supabase-email.sql. Idempotent + safe to re-run.
--
-- Powers GET /api/health/setup (superadmin-only), which turns "did the
-- migrations apply?" into green ticks. SECURITY DEFINER so it can read
-- pg_class / storage.buckets; service-role only (no anon/authenticated grant).
-- =============================================================================

create or replace function public.setup_health()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tables', jsonb_build_object(
      'org_invite_links',       to_regclass('public.org_invite_links') is not null,
      'task_threads',           to_regclass('public.task_threads') is not null,
      'task_emails',            to_regclass('public.task_emails') is not null,
      'task_email_attachments', to_regclass('public.task_email_attachments') is not null,
      'inbound_unmatched',      to_regclass('public.inbound_unmatched') is not null,
      'projects',               to_regclass('public.projects') is not null,
      'tasks',                  to_regclass('public.tasks') is not null,
      'gates',                  to_regclass('public.gates') is not null,
      'blockers',               to_regclass('public.blockers') is not null,
      'org_config',             to_regclass('public.org_config') is not null
    ),
    'rls', jsonb_build_object(
      'org_invite_links',       coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.org_invite_links')), false),
      'task_threads',           coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.task_threads')), false),
      'task_emails',            coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.task_emails')), false),
      'task_email_attachments', coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.task_email_attachments')), false),
      'inbound_unmatched',      coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.inbound_unmatched')), false),
      'projects',               coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.projects')), false),
      'tasks',                  coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.tasks')), false),
      'gates',                  coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.gates')), false),
      'blockers',               coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.blockers')), false),
      'org_config',             coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.org_config')), false)
    ),
    'functions', jsonb_build_object(
      'auth_role',             to_regprocedure('public.auth_role()') is not null,
      'is_superadmin',         to_regprocedure('public.is_superadmin()') is not null,
      'claim_org_invite',      to_regprocedure('public.claim_org_invite(text)') is not null,
      'user_id_by_email',      to_regprocedure('public.user_id_by_email(text)') is not null,
      'init_org_from_template', to_regprocedure('public.init_org_from_template(uuid, text)') is not null
    ),
    'storage_bucket', exists(select 1 from storage.buckets where id = 'task-email-attachments')
  )
$$;

revoke all on function public.setup_health() from public, anon, authenticated;

select public.setup_health();
