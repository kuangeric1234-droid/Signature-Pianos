-- =============================================================================
-- SIGNATURE PIANOS — Tuners table + tuner_bookings extensions
-- =============================================================================
-- Run AFTER missing_tables.sql in the Supabase SQL editor.
-- Safe to re-run: every object uses IF NOT EXISTS / CREATE OR REPLACE /
-- ON CONFLICT DO NOTHING / DROP-then-CREATE.
-- =============================================================================

-- ---------- tuners ----------------------------------------------------------
create table if not exists tuners (
  id          uuid default gen_random_uuid() primary key,
  name        text not null,
  email       text not null,
  phone       text not null,
  suburb      text,
  active      boolean default true,
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Unique email so the seed is idempotent and we don't get duplicate rows.
create unique index if not exists tuners_email_unique on tuners(email);

-- RLS
alter table tuners enable row level security;

drop policy if exists "Admin full access — tuners" on tuners;
create policy "Admin full access — tuners"
on tuners for all
to authenticated
using (is_admin())
with check (is_admin());

-- updated_at trigger reuses the existing helper from schema.sql /
-- missing_tables.sql (set_updated_at — not "update_updated_at_column").
drop trigger if exists trg_set_updated_at on tuners;
create trigger trg_set_updated_at
before update on tuners
for each row execute function set_updated_at();

-- Seed with placeholder tuners. ON CONFLICT DO NOTHING (paired with the
-- unique index above) makes this re-runnable.
-- TODO: replace with your real partner tuners.
insert into tuners (name, email, phone, suburb, notes) values
  ('Tuner One',   'tuner1@email.com', '+61400000001', 'Melbourne CBD', 'Available Mon-Fri'),
  ('Tuner Two',   'tuner2@email.com', '+61400000002', 'Richmond',      'Available weekends'),
  ('Tuner Three', 'tuner3@email.com', '+61400000003', 'Fitzroy',       'Specialises in Yamaha')
on conflict (email) do nothing;


-- ---------- tuner_bookings extensions ---------------------------------------
-- Adds the columns the new tuner flow needs on top of what schema.sql
-- already defines. `completion_notes` already exists in schema.sql —
-- IF NOT EXISTS makes that a no-op.
alter table tuner_bookings add column if not exists confirmation_token text unique;
alter table tuner_bookings add column if not exists tuner_id           uuid references tuners(id);
alter table tuner_bookings add column if not exists proposed_date      date;
alter table tuner_bookings add column if not exists proposed_time      text;
alter table tuner_bookings add column if not exists completion_token   text unique;
alter table tuner_bookings add column if not exists completed_at       timestamptz;
alter table tuner_bookings add column if not exists completion_notes   text;

-- Helpful indexes for the admin lookups (one tuner_booking per order is
-- the common case, but the FK column needs an index either way).
create index if not exists idx_tuner_bookings_tuner_id on tuner_bookings(tuner_id);


-- ---------- token helper (currently unused — tokens are minted in JS) -------
-- Left in so future SQL flows can mint URL-safe random tokens without
-- depending on app-side code. Returns a 32-char a-z0-9 string.
create or replace function generate_tuner_token()
returns text
language sql
as $$
  select string_agg(
    substr('abcdefghijklmnopqrstuvwxyz0123456789', ceil(random() * 36)::int, 1), ''
  )
  from generate_series(1, 32);
$$;
