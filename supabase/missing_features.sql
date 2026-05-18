-- =============================================================================
-- SIGNATURE PIANOS — Session 13: 8 missing features
-- =============================================================================
-- Run AFTER all previous migrations. Safe to re-run.
--
-- Adds:
--   * viewing_appointments   — admin-created direct bookings (separate from
--                              the public viewing_bookings form submissions)
--   * deliveries.damage_*    — damage report flow on dropoff
--   * deliveries.failed_*    — failed-delivery flow on dropoff
--   * orders.followup_*      — post-tuning warm follow-up cron flag
--   * orders.review_request_* — Google review request cron flag
--   * company_settings.google_review_url
--   * payment_instalments.reminder_{3,7,14}day_sent + _at
--   * 'damage_reported' added to delivery_status enum
--
-- Note: the spec referenced update_updated_at_column() — this project
-- standardises on set_updated_at() (see missing_tables.sql), so triggers
-- below use the existing helper.
-- =============================================================================


-- ---------- delivery_status enum — add damage_reported -------------------
do $$ begin
  alter type delivery_status add value if not exists 'damage_reported';
exception when others then null;
end $$;


-- ---------- viewing_appointments ----------------------------------------
create table if not exists viewing_appointments (
  id                uuid primary key default gen_random_uuid(),
  customer_id       uuid references customers(id),
  first_name        text not null,
  last_name         text not null,
  email             text not null,
  phone             text,
  appointment_date  date not null,
  appointment_time  text not null,
  notes             text,
  source            text default 'admin',
  status            text default 'confirmed'
    check (status in ('confirmed', 'reminder_sent', 'completed', 'cancelled', 'no_show')),
  reminder_sent     boolean default false,
  reminder_sent_at  timestamptz,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create index if not exists idx_viewing_appointments_date    on viewing_appointments(appointment_date);
create index if not exists idx_viewing_appointments_status  on viewing_appointments(status);

alter table viewing_appointments enable row level security;

drop policy if exists "Admin full access — viewing_appointments" on viewing_appointments;
create policy "Admin full access — viewing_appointments"
on viewing_appointments for all
to authenticated
using (is_admin())
with check (is_admin());

drop trigger if exists trg_set_updated_at on viewing_appointments;
create trigger trg_set_updated_at
before update on viewing_appointments
for each row execute function set_updated_at();


-- ---------- deliveries: damage + failed-delivery fields ------------------
alter table deliveries
  add column if not exists damage_reported       boolean default false,
  add column if not exists damage_reported_at    timestamptz,
  add column if not exists damage_notes          text,
  add column if not exists damage_photos         text[] default '{}',
  add column if not exists failed_delivery       boolean default false,
  add column if not exists failed_delivery_reason text,
  add column if not exists failed_delivery_at    timestamptz,
  add column if not exists redelivery_scheduled  boolean default false;


-- ---------- orders: post-tuning follow-up + review request flags ---------
alter table orders
  add column if not exists followup_sent             boolean default false,
  add column if not exists followup_sent_at          timestamptz,
  add column if not exists review_request_sent       boolean default false,
  add column if not exists review_request_sent_at    timestamptz;


-- ---------- company_settings.google_review_url ---------------------------
alter table company_settings
  add column if not exists google_review_url text default '';


-- ---------- payment_instalments: overdue reminder flags ------------------
-- These mirror the deliveries reminder pattern. The cron uses the
-- *_sent flags as idempotency markers so retries never double-send.
alter table payment_instalments
  add column if not exists reminder_3day_sent      boolean default false,
  add column if not exists reminder_3day_sent_at   timestamptz,
  add column if not exists reminder_7day_sent      boolean default false,
  add column if not exists reminder_7day_sent_at   timestamptz,
  add column if not exists reminder_14day_sent     boolean default false,
  add column if not exists reminder_14day_sent_at  timestamptz;
