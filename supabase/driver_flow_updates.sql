-- =============================================================================
-- SIGNATURE PIANOS — driver acceptance + reminder fields
-- =============================================================================
-- Run AFTER driver_flow.sql. Safe to re-run.
--
-- Adds:
--   driver_accepted / driver_accepted_at / driver_accepted_preference
--                                       — driver locks in 1 of 3 windows
--   acceptance_token                    — public /delivery/accept/{token}
--   reminder_3day_sent / reminder_day_of_sent + *_at
--                                       — cron idempotency flags
-- =============================================================================

alter table deliveries
  add column if not exists driver_accepted             boolean default false,
  add column if not exists driver_accepted_at          timestamptz,
  add column if not exists driver_accepted_preference  integer,
  add column if not exists acceptance_token            text unique,
  add column if not exists reminder_3day_sent          boolean default false,
  add column if not exists reminder_3day_sent_at       timestamptz,
  add column if not exists reminder_day_of_sent        boolean default false,
  add column if not exists reminder_day_of_sent_at     timestamptz;

-- Backfill acceptance tokens for existing rows that don't have one yet.
-- We use gen_random_bytes hex so the token is unguessable; if the column
-- ever gets a default later, this stays compatible.
update deliveries
   set acceptance_token = encode(gen_random_bytes(16), 'hex')
 where acceptance_token is null;

create index if not exists idx_deliveries_acceptance_token on deliveries(acceptance_token);
create index if not exists idx_deliveries_scheduled_date   on deliveries(scheduled_date);

-- The existing anon SELECT policy on deliveries (delivery_updates.sql)
-- already lets the public accept page load by acceptance_token because
-- every row also has pickup_link_token + delivery_link_token set. No
-- new RLS policies needed here — the row update happens server-side in
-- api/driver-accept.js under the service role.
