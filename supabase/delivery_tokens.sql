-- ============================================================================
-- Signature Pianos — delivery tokens + storage bucket
-- ----------------------------------------------------------------------------
-- Run in Supabase SQL editor. Idempotent: add-if-missing columns, backfill
-- only NULL token rows, create the storage bucket if it does not exist.
--
-- Adds:
--   * pickup_link_token / delivery_link_token / acceptance_token  (unique)
--   * pickup_photos / delivery_photos                              (text[])
--   * pickup_confirmed_at / delivered_at                           (timestamptz)
--   * pickup_notes / delivery_notes                                (text)
--   * driver_accepted / _at / _preference                          (acceptance state)
--   * delivery-photos storage bucket (private)
-- ============================================================================

alter table deliveries
  add column if not exists pickup_link_token text unique,
  add column if not exists delivery_link_token text unique,
  add column if not exists acceptance_token text unique,
  add column if not exists pickup_photos text[] default '{}',
  add column if not exists delivery_photos text[] default '{}',
  add column if not exists pickup_confirmed_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists pickup_notes text,
  add column if not exists delivery_notes text,
  add column if not exists driver_accepted boolean default false,
  add column if not exists driver_accepted_at timestamptz,
  add column if not exists driver_accepted_preference integer;

-- The deliveries table has a deliveries_anon_guard trigger (see
-- delivery_updates.sql) that blocks token rotation when auth.role() is not
-- 'anon'. In the Supabase SQL editor auth.role() returns NULL, which the
-- guard treats as anon and rejects. Disable the trigger for the backfill,
-- then re-enable it.
alter table deliveries disable trigger trg_deliveries_anon_guard;

update deliveries
set
  pickup_link_token =
    coalesce(pickup_link_token,   md5(random()::text || id::text || 'pickup')),
  delivery_link_token =
    coalesce(delivery_link_token, md5(random()::text || id::text || 'delivery')),
  acceptance_token =
    coalesce(acceptance_token,    md5(random()::text || id::text || 'accept'))
where
  pickup_link_token is null
  or delivery_link_token is null
  or acceptance_token is null;

alter table deliveries enable trigger trg_deliveries_anon_guard;

insert into storage.buckets (id, name, public)
values ('delivery-photos', 'delivery-photos', false)
on conflict do nothing;
