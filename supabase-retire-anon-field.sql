-- =============================================================================
-- Keldra security fix C2: lock the anon (?w= demo) path out of real orgs' data,
-- while KEEPING the public field demo working (SCOPE option).
--
-- Run in the Supabase SQL editor for project fmeixgnxkcapxyhrjhvm. Idempotent.
--
-- Root cause: the legacy anon policies on mer_field_events were
-- `using (project = 'MER')` with NO org constraint, and AUTHENTICATED captures
-- are also tagged project='MER' (with a non-null org_id). So a caller with the
-- public anon key could read/insert/DELETE every org's field events.
--
-- The public ?w= demo genuinely needs anon writes, but it ALWAYS writes org-less
-- rows (org_id IS NULL, scoped by a client session_id); authenticated captures
-- ALWAYS set org_id. So we scope the anon policies to org-less demo rows only:
-- real org data (org_id NOT NULL) becomes invisible + untouchable to anon, and
-- the demo keeps working. Anon GRANTs (select/insert/delete) are intentionally
-- retained — the policies are what gate the rows.
--
-- Accepted residual (demo-only): anon session_id is not server-verifiable, so a
-- demo visitor can still affect another org-LESS demo row. No real tenant data.
-- =============================================================================

do $$
declare p record;
begin
  for p in select policyname from pg_policies
           where schemaname='public' and tablename='mer_field_events'
             and policyname like 'mfe_anon_%'
  loop execute format('drop policy if exists %I on public.mer_field_events', p.policyname); end loop;
end $$;

create policy mfe_anon_select on public.mer_field_events for select to anon
  using (project = 'MER' and org_id is null);
create policy mfe_anon_insert on public.mer_field_events for insert to anon
  with check (project = 'MER' and org_id is null);
create policy mfe_anon_delete on public.mer_field_events for delete to anon
  using (project = 'MER' and org_id is null);

-- SANITY (read-only). Expect each anon policy's qual/with_check to read
-- ((project = 'MER') AND (org_id IS NULL)).
select policyname, cmd, qual, with_check
from pg_policies
where schemaname='public' and tablename='mer_field_events' and policyname like 'mfe_anon_%'
order by policyname;
