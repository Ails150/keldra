-- =============================================================================
-- Keldra: per-task email contacts (saved typed recipients).
--
-- Run AFTER supabase-instances.sql. Idempotent + safe to re-run.
--
-- When someone emails a free-typed address from a task, it's saved here so it's
-- a one-tap quick-pick next time. Org-scoped. These are EXTERNAL contacts — they
-- are NEVER used as recipients for internal-note notifications (those go only to
-- same-org assignees; see /api/tasks/notes).
-- =============================================================================

create table if not exists public.task_contacts (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organisations(id) on delete cascade,
  task_code  text not null,
  email      text not null,
  name       text,
  company    text,
  created_at timestamptz not null default now(),
  unique (org_id, task_code, email)
);
create index if not exists task_contacts_org_task_idx on public.task_contacts(org_id, task_code);

grant select on public.task_contacts to authenticated;
alter table public.task_contacts enable row level security;

drop policy if exists task_contacts_select on public.task_contacts;
create policy task_contacts_select on public.task_contacts for select to authenticated
  using (public.is_superadmin() or org_id = public.auth_org_id());

select 'task_contacts ready' as status;
