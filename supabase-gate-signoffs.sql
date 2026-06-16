-- =============================================================================
-- Keldra: gate sign-offs — evidence-grade commissioning sign-off records.
--
-- Run AFTER supabase-instances.sql + supabase-orgdata.sql. Idempotent.
--
-- A gate that says "16/16 signed off" is a status light. Keldra's thesis is
-- EVIDENCE: each commissioning item carries WHO signed it (verified identity),
-- WHEN, and the signature itself (typed name OR a drawn-signature image). Once
-- signed, the record is IMMUTABLE — same rule as the hash-chained trail and
-- task_notes. The gate's "X / Y signed off" + cleared/blocked is recomputed from
-- these rows, never a static number. Org-scoped; no hardcoded gate names.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- 1. TABLE — one row per (org, gate_code, item_label). Items start 'outstanding'
--    (the denominator); signing fills the evidence fields ONCE.
create table if not exists public.gate_signoffs (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organisations(id) on delete cascade,
  gate_code          text not null,                       -- matches gates.code (org-scoped)
  item_label         text not null,                       -- the commissioning tag / item
  status             text not null default 'outstanding'
                       check (status in ('outstanding','signed')),
  -- evidence — all captured server-side from the VERIFIED SESSION, never the body:
  signed_by_user_id  uuid references auth.users(id),
  signed_by_name     text,                                -- snapshot of signer name
  signed_by_role     text,                                -- snapshot of signer role
  signature_kind     text check (signature_kind in ('typed','drawn')),
  signature_text     text,                                -- typed-name signature
  signature_path     text,                                -- storage path to drawn PNG
  signed_at          timestamptz,
  created_at         timestamptz not null default now(),
  unique (org_id, gate_code, item_label)
);
create index if not exists gate_signoffs_org_gate_idx on public.gate_signoffs(org_id, gate_code);

-- 2. IMMUTABILITY (edit) — once SIGNED, a row's evidence can NEVER be altered,
--    by ANYONE including the service role (triggers fire regardless of RLS).
--    This is the hard guarantee the proof checks: a second attempt to edit a
--    signed record is rejected at the database.
create or replace function public.gate_signoffs_guard()
returns trigger language plpgsql as $$
begin
  if old.status = 'signed' then
    raise exception 'gate_signoffs: % / % already signed — record is immutable', old.gate_code, old.item_label;
  end if;
  return new;
end $$;

drop trigger if exists gate_signoffs_guard_trg on public.gate_signoffs;
create trigger gate_signoffs_guard_trg
  before update on public.gate_signoffs
  for each row execute function public.gate_signoffs_guard();

-- 3. RLS — org members READ their org's rows. NO insert/update/delete grant or
--    policy for clients (so users can neither edit NOR delete a record — same
--    "no edit/delete" rule as task_notes / the trail). Every write goes through
--    the service-role sign-off API, which binds the signer identity from the
--    session and refuses re-signing.
grant select on public.gate_signoffs to authenticated;
alter table public.gate_signoffs enable row level security;

drop policy if exists gate_signoffs_select on public.gate_signoffs;
create policy gate_signoffs_select on public.gate_signoffs for select to authenticated
  using (public.is_superadmin() or org_id = public.auth_org_id());

-- 4. PRIVATE STORAGE BUCKET for drawn signatures. Path = {org_id}/{signoff_id}.png
--    so it is org-scoped AND can't be overwritten (id is unique + immutable).
insert into storage.buckets (id, name, public)
values ('gate-signatures', 'gate-signatures', false)
on conflict (id) do nothing;

drop policy if exists gate_signatures_read on storage.objects;
create policy gate_signatures_read on storage.objects for select to authenticated
  using (
    bucket_id = 'gate-signatures'
    and (
      public.is_superadmin()
      or (storage.foldername(name))[1] = public.auth_org_id()::text
    )
  );

-- 5. SANITY -------------------------------------------------------------------
select 'gate_signoffs' as table, count(*)::text as rows from public.gate_signoffs;
