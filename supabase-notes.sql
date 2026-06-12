-- =============================================================================
-- Keldra: per-task INTERNAL team notes.
--
-- Run AFTER supabase-instances.sql. Idempotent + safe to re-run.
--
-- Internal notes are same-org-only and EVIDENCE: immutable (no update/delete
-- policy or grant), attributed, timestamped. They count as trail events and
-- feed the AI summary, but are NEVER included in outbound email and are EXCLUDED
-- from PDF export by default (both enforced server-side). MVP = text + optional
-- photo; author_id + mentions are here so @mentions/notifications can be added
-- later without a migration.
-- =============================================================================

create table if not exists public.task_notes (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations(id) on delete cascade,
  task_code   text not null,
  task_id     uuid references public.tasks(id) on delete set null,
  body        text not null,
  photo_path  text,
  author_id   uuid references auth.users(id),
  author_name text,
  mentions    jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists task_notes_org_task_idx on public.task_notes(org_id, task_code, created_at);

-- SELECT + INSERT only. The absence of UPDATE/DELETE policies (and grants) makes
-- notes immutable under RLS — same rule as the rest of the trail.
grant select, insert on public.task_notes to authenticated;
alter table public.task_notes enable row level security;

drop policy if exists task_notes_select on public.task_notes;
create policy task_notes_select on public.task_notes for select to authenticated
  using (public.is_superadmin() or org_id = public.auth_org_id());

drop policy if exists task_notes_insert on public.task_notes;
create policy task_notes_insert on public.task_notes for insert to authenticated
  with check (
    public.is_superadmin()
    or (
      org_id = public.auth_org_id()
      and public.auth_role() = any (array['field','member','manager','org_admin','superadmin']::text[])
    )
  );

select 'task_notes ready' as status;
