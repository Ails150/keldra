-- =============================================================================
-- Keldra: verify no secret is stored in clear text inside a pg_cron command.
--
-- READ-ONLY. Run in the Supabase SQL editor for project fmeixgnxkcapxyhrjhvm.
--
-- Why: a secret pasted straight into cron.schedule(...) is persisted verbatim in
-- cron.job.command. Any role that can select from cron.job can read it, and it
-- appears in query logs. supabase-sequences-cron.sql avoids that by keeping the
-- URL + secret in Vault and having the command read them back at run time.
-- RUNBOOK.md previously showed the inline shape, so a job created by following
-- the old runbook needs rotating.
--
-- Expected on a healthy project:
--   secret_shape = 'vault (ok)'  and  literal_secret_suspected = false
--
-- If it reports 'inline literal (ROTATE)':
--   1. Rotate CRON_SECRET (new random value) in the app env (Netlify) .
--   2. Re-run supabase-sequences-cron.sql with the new value — it unschedules
--      the old job, so the clear-text command is removed with it.
--   3. Re-run this file to confirm.
-- =============================================================================

select
  j.jobname,
  j.schedule,
  j.active,
  case
    when j.command ilike '%vault.decrypted_secrets%' then 'vault (ok)'
    when j.command ilike '%x-cron-secret%'           then 'inline literal (ROTATE)'
    else 'no secret header found'
  end                                                     as secret_shape,
  -- true when the command carries a quoted value next to the header name
  (j.command ~* '''x-cron-secret''\s*,\s*''[^'']{8,}''')   as literal_secret_suspected,
  length(j.command)                                        as command_len
from cron.job j
where j.jobname = 'keldra-sequence-tick';

-- Whether the Vault secrets the good migration expects are actually present.
select
  name,
  (decrypted_secret is not null and length(decrypted_secret) > 0) as has_value,
  length(decrypted_secret)                                        as value_len
from vault.decrypted_secrets
where name in ('keldra_tick_url', 'keldra_cron_secret')
order by name;

-- Belt and braces: any OTHER scheduled job carrying an inline secret-ish literal.
select jobname, 'review — possible inline secret' as note
from cron.job
where command ~* '(secret|token|apikey|api_key|password|bearer)\s*''?\s*[:,]\s*''[^'']{8,}'''
  and command not ilike '%vault.decrypted_secrets%';
