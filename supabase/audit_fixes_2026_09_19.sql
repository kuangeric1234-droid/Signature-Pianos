-- =============================================================================
-- SIGNATURE PIANOS — audit fixes, phase 1 (19 Sep 2026)
-- =============================================================================
-- Additive only: new columns, defaults, a trigger and a data fix. Safe to run
-- before the matching code deploys. Run the enum line on its own first
-- (ALTER TYPE ... ADD VALUE can't be used in the same transaction).
--
--   1. tuner_flow_rebuild.sql was never applied live, so the tuner contact /
--      log-date / reminder flow errored on missing columns. Applied here
--      WITHOUT its "log_date_token is not null" anon policy, which would have
--      exposed every booking (token pages now go through RPCs instead).
--   2. Columns the admin already writes to: tuners.updated_at (the shared
--      set_updated_at trigger failed every tuner edit), service_requests.
--      updated_at (every status change failed), notes on service_requests and
--      viewing_bookings (notes were silently lost).
--   3. pianos.cost_price only recalculated from the service log; adding or
--      editing a piano's base_cost left cost_price at 0 / stale.
--   4. blog_jobs stuck in 'running' since June (function killed at the
--      300 s cap before it could record the error).
-- =============================================================================

-- 1. Tuner flow ---------------------------------------------------------------
-- (run separately first)
-- alter type tuner_booking_status add value if not exists 'contact_sent';

alter table tuner_bookings
  add column if not exists trigger_date                  date,
  add column if not exists contact_sent                  boolean default false,
  add column if not exists contact_sent_at               timestamptz,
  add column if not exists log_date_token                text unique default generate_token(),
  add column if not exists date_logged                   boolean default false,
  add column if not exists date_logged_at                timestamptz,
  add column if not exists confirmed_date                date,
  add column if not exists confirmed_time                text,
  add column if not exists day_before_reminder_sent      boolean default false,
  add column if not exists day_before_reminder_sent_at   timestamptz,
  add column if not exists completed                     boolean default false,
  add column if not exists completed_at                  timestamptz,
  add column if not exists completion_token              text unique;

alter table tuner_bookings alter column log_date_token   set default generate_token();
alter table tuner_bookings alter column completion_token set default generate_token();
update tuner_bookings set log_date_token   = generate_token() where log_date_token   is null;
update tuner_bookings set completion_token = generate_token() where completion_token is null;

create index if not exists idx_tuner_bookings_trigger_date   on tuner_bookings(trigger_date);
create index if not exists idx_tuner_bookings_confirmed_date on tuner_bookings(confirmed_date);

-- 2. Columns the admin writes to ----------------------------------------------
alter table tuners           add column if not exists updated_at timestamptz default now();
alter table service_requests add column if not exists updated_at timestamptz default now();
alter table service_requests add column if not exists notes      text;
alter table viewing_bookings add column if not exists notes      text;

drop trigger if exists trg_set_updated_at on service_requests;
create trigger trg_set_updated_at before update on service_requests
  for each row execute function set_updated_at();

-- 3. cost_price follows base_cost ---------------------------------------------
create or replace function public.pianos_sync_cost_price()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  new.cost_price := coalesce(new.base_cost, 0) +
                    coalesce((select sum(cost) from piano_service_log where piano_id = new.id), 0);
  return new;
end;
$$;

drop trigger if exists trg_pianos_sync_cost_price on pianos;
create trigger trg_pianos_sync_cost_price
  before insert or update of base_cost on pianos
  for each row execute function pianos_sync_cost_price();

-- 4. Stuck blog jobs ------------------------------------------------------------
update blog_jobs
   set status = 'error', error = 'Timed out (function stopped before finishing)'
 where status in ('pending', 'running')
   and updated_at < now() - interval '10 minutes';

notify pgrst, 'reload schema';
