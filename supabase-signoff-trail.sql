-- =============================================================================
-- Keldra: link a commissioning sign-off item to the activity trail behind it.
--
-- Run AFTER supabase-gate-signoffs.sql. Idempotent + safe to re-run.
--
-- A signed gate item carries WHO/WHEN/the signature (gate_signoffs). This adds
-- the pointer to HOW it got there — the activity whose task_emails / task_notes /
-- blocker_events tell the story (chases, commitments, the sign-off). The item
-- drilldown reads that trail, org-scoped. Nullable: items without a trail just
-- show the sign-off event. No RLS change — gate_signoffs_select is org-scoped.
-- =============================================================================

alter table public.gate_signoffs add column if not exists task_code text;

create index if not exists gate_signoffs_org_task_idx
  on public.gate_signoffs(org_id, task_code);
