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

update deliveries
set
  pickup_link_token =
    md5(random()::text || id::text || 'pickup'),
  delivery_link_token =
    md5(random()::text || id::text || 'delivery'),
  acceptance_token =
    md5(random()::text || id::text || 'accept')
where
  pickup_link_token is null
  or delivery_link_token is null
  or acceptance_token is null;

insert into storage.buckets (id, name, public)
values ('delivery-photos', 'delivery-photos', false)
on conflict do nothing;
