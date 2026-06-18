-- =============================================================================
-- Keldra H2: make the blocker_events audit trail genuinely tamper-evident.
--
-- Run in the Supabase SQL editor for project fmeixgnxkcapxyhrjhvm. Idempotent.
--
-- Append-only guard, modelled on gate_signoffs_guard:
--   * UPDATE is blocked for EVERYONE (incl. service role) — nothing legitimately
--     edits an audit event; this is the strong, gate_signoffs-style guarantee.
--   * DELETE is blocked for the client roles (authenticated/anon); the
--     service-role backend remains the controlled path so the seed's clean-
--     replace (cascade delete when a blocker is removed) still works. Clients
--     have no delete grant anyway, so this is belt-and-braces.
--
-- Trust boundary (honest): tamper-PROOF against tenants (no grant + trigger);
-- tamper-EVIDENT against the backend via the hash chain + read-path verifier
-- (any out-of-band edit/delete breaks chain continuity and the verifier flags it).
-- =============================================================================

create or replace function public.blocker_events_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'blocker_events is append-only — events cannot be modified';
  end if;
  if tg_op = 'DELETE' and current_user in ('authenticated','anon') then
    raise exception 'blocker_events is append-only — events cannot be deleted';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists blocker_events_guard_trg on public.blocker_events;
create trigger blocker_events_guard_trg
  before update or delete on public.blocker_events
  for each row execute function public.blocker_events_guard();

-- SANITY (read-only): expect one row for the new trigger.
select tgname, tgenabled
from pg_trigger
where tgrelid = 'public.blocker_events'::regclass and not tgisinternal
order by tgname;
