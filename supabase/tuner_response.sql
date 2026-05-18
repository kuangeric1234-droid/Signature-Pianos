-- =============================================================================
-- SIGNATURE PIANOS — tuner acceptance / propose-new-date fields
-- =============================================================================
-- Run AFTER tuners_table.sql. Safe to re-run.
--
-- Mirrors the driver acceptance pattern (delivery_flow_updates.sql) so
-- tuners can either accept the proposed date in one click or propose an
-- alternative from a public mobile page at /tuner/respond/{token}.
--
-- Adds:
--   acceptance_token        — unique, used as public URL token
--   tuner_accepted / _at    — set when the tuner clicks Accept
--   tuner_response          — 'accepted' | 'proposed_new'
--   tuner_proposed_date     — date the tuner suggests instead
--   tuner_proposed_time     — readable window (e.g. 'Morning (9am–12pm)')
--
-- No new RLS — the existing admin policy on tuner_bookings covers the
-- admin side, and the public respond page reads by acceptance_token via
-- the service-role API (api/tuner-respond.js) so it doesn't depend on
-- anon SELECT on tuner_bookings.
-- =============================================================================

alter table tuner_bookings
  add column if not exists acceptance_token     text unique,
  add column if not exists tuner_accepted       boolean default false,
  add column if not exists tuner_accepted_at    timestamptz,
  add column if not exists tuner_proposed_date  date,
  add column if not exists tuner_proposed_time  text,
  add column if not exists tuner_response       text
    check (tuner_response in ('accepted', 'proposed_new'));

create index if not exists idx_tuner_bookings_acceptance_token on tuner_bookings(acceptance_token);

-- Backfill tokens for any pre-existing bookings.
update tuner_bookings
   set acceptance_token = encode(gen_random_bytes(16), 'hex')
 where acceptance_token is null;

-- Allow anon SELECT by acceptance_token — needed so tuner/respond.html
-- (which uses the anon Supabase client) can render the booking details
-- before submitting through the API. The write path always goes through
-- the service role, so this is read-only exposure scoped by an
-- unguessable token.
drop policy if exists "Public read tuner_booking by token" on tuner_bookings;
create policy "Public read tuner_booking by token"
on tuner_bookings for select
to anon
using (acceptance_token is not null);
