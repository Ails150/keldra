-- =============================================================================
-- Keldra: wire the chase-sequence TICK to pg_cron so it runs automatically.
--
-- Run AFTER supabase-sequences.sql. Idempotent + safe to re-run.
--
-- This replaces the "forgotten manual step" of calling /api/sequences/tick by
-- hand. pg_cron fires every 15 minutes; pg_net POSTs the tick endpoint with the
-- shared CRON_SECRET header. The endpoint itself stays gated (401 without the
-- secret) and every send stays gated per-org by org_config.sequence.enabled, so
-- this is inert until an org opts in.
--
-- NO HARDCODED URL OR SECRET: both are read from Supabase Vault at run time, so
-- nothing environment-specific lives in this committed migration.
--
-- OPERATOR PREREQUISITES (one-time, per project) — do these first:
--   1. Enable extensions (Dashboard → Database → Extensions, or below).
--   2. Set CRON_SECRET in the APP env (Netlify) to the SAME value stored here,
--      otherwise the tick endpoint returns 401/503. (It is currently unset.)
--   3. Store the deployed tick URL + the secret in Vault (see step 2 block).
-- =============================================================================

-- 1. EXTENSIONS ---------------------------------------------------------------
create extension if not exists pg_cron;                       -- schema: cron
create extension if not exists pg_net with schema extensions; -- schema: extensions

-- 2. SECRETS (Vault) ----------------------------------------------------------
-- Replace the two literals below with THIS deployment's values, then run once.
-- Re-running updates them in place (no duplicate secrets).
do $$
declare
  v_url    text := 'https://YOUR-APP-DOMAIN/api/sequences/tick';  -- <-- set me
  v_secret text := 'YOUR-CRON-SECRET';                            -- <-- set me (== app CRON_SECRET)
begin
  if exists (select 1 from vault.secrets where name = 'keldra_tick_url') then
    perform vault.update_secret(
      (select id from vault.secrets where name = 'keldra_tick_url'), v_url, 'keldra_tick_url');
  else
    perform vault.create_secret(v_url, 'keldra_tick_url');
  end if;

  if exists (select 1 from vault.secrets where name = 'keldra_cron_secret') then
    perform vault.update_secret(
      (select id from vault.secrets where name = 'keldra_cron_secret'), v_secret, 'keldra_cron_secret');
  else
    perform vault.create_secret(v_secret, 'keldra_cron_secret');
  end if;
end $$;

-- 3. SCHEDULE — every 15 minutes. Unschedule any prior job of the same name
--    first so this is fully idempotent.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'keldra-sequence-tick') then
    perform cron.unschedule('keldra-sequence-tick');
  end if;
end $$;

select cron.schedule(
  'keldra-sequence-tick',
  '*/15 * * * *',
  $cron$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets where name = 'keldra_tick_url'),
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'keldra_cron_secret')
                 ),
      body    := '{}'::jsonb
    );
  $cron$
);

-- 4. VERIFY — confirm the job is registered and see its recent run status.
select jobid, jobname, schedule, active from cron.job where jobname = 'keldra-sequence-tick';
-- After it has fired at least once:
-- select status, return_message, start_time, end_time
--   from cron.job_run_details
--  where jobid = (select jobid from cron.job where jobname = 'keldra-sequence-tick')
--  order by start_time desc limit 5;
