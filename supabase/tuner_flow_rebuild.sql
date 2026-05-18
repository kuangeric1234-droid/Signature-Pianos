-- =============================================================================
-- SIGNATURE PIANOS — tuner booking flow rebuild
-- =============================================================================
-- Run AFTER tuner_response.sql (which adds the previous accept/propose
-- columns — those stay in place but are no longer wired in. The new flow
-- has the tuner contact the customer directly, agree a date offline, then
-- log it via /tuner/log-date/{token}).
--
-- New columns:
--   trigger_date          — date the cron should fire the contact email
--                           (auto-set to delivery_date + 25 days by
--                            api/driver-delivery-confirm.js)
--   contact_sent / _at    — flag flipped by the cron / manual-send button
--   log_date_token        — unique token, used as /tuner/log-date/{token}
--   date_logged / _at     — flag flipped when tuner submits the form
--   confirmed_date        — the date the tuner actually agreed with the
--                           customer (the old proposed_date stays in
--                           place for backwards compat with admin form)
--   confirmed_time        — readable window (e.g. 'Morning (9am–12pm)')
--   day_before_reminder_sent / _at — cron idempotency flag
--   completed / _at       — set when /tuner/complete/{token} is opened
--   completion_token      — already exists (tuners_table.sql); included
--                           here with IF NOT EXISTS as a no-op safety net
--
-- Enum:
--   adds 'contact_sent' to tuner_booking_status so the cron can update
--   status without violating the check constraint
-- =============================================================================

-- Enum value — must run outside a transaction in some Postgres versions.
-- Supabase's SQL editor handles this fine because it auto-commits.
do $$ begin
  alter type tuner_booking_status add value if not exists 'contact_sent';
exception when others then null;
end $$;

alter table tuner_bookings
  add column if not exists trigger_date                  date,
  add column if not exists contact_sent                  boolean default false,
  add column if not exists contact_sent_at               timestamptz,
  add column if not exists log_date_token                text unique,
  add column if not exists date_logged                   boolean default false,
  add column if not exists date_logged_at                timestamptz,
  add column if not exists confirmed_date                date,
  add column if not exists confirmed_time                text,
  add column if not exists day_before_reminder_sent      boolean default false,
  add column if not exists day_before_reminder_sent_at   timestamptz,
  add column if not exists completed                     boolean default false,
  add column if not exists completed_at                  timestamptz,
  add column if not exists completion_token              text unique;

-- Backfill tokens for any pre-existing rows.
update tuner_bookings
   set log_date_token   = encode(gen_random_bytes(16), 'hex')
 where log_date_token is null;
update tuner_bookings
   set completion_token = encode(gen_random_bytes(16), 'hex')
 where completion_token is null;

create index if not exists idx_tuner_bookings_trigger_date    on tuner_bookings(trigger_date);
create index if not exists idx_tuner_bookings_log_date_token  on tuner_bookings(log_date_token);
create index if not exists idx_tuner_bookings_confirmed_date  on tuner_bookings(confirmed_date);

-- Anon SELECT-by-log-date-token policy so tuner/log-date.html can read
-- the booking before submitting via the API. Write path is service-role
-- only (api/tuner-log-date.js).
drop policy if exists "Public read tuner_booking by log_date_token" on tuner_bookings;
create policy "Public read tuner_booking by log_date_token"
on tuner_bookings for select
to anon
using (log_date_token is not null);
