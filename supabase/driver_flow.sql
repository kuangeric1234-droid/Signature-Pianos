-- =============================================================================
-- SIGNATURE PIANOS — driver pickup + delivery photo flow
-- =============================================================================
-- Run AFTER missing_tables.sql, admin_rls.sql and delivery_updates.sql.
-- Safe to re-run: every object uses IF NOT EXISTS / DROP-then-CREATE.
--
-- Adds:
--   pickup_notes / delivery_notes  — free-text notes from the driver
--   storage bucket 'delivery-photos' — receipt photos for each leg
--   anon INSERT policy             — public pickup/dropoff pages upload here
--   admin SELECT + service-role manage — for inspection + server writes
--
-- The existing deliveries_anon_guard trigger blocks anon from changing
-- status / tokens / etc. The driver pages therefore POST to
-- /api/driver-pickup-confirm and /api/driver-delivery-confirm which use the
-- service role to update the row (and to fire the warranty + tuner chain
-- on delivery). The client only uploads the photos themselves.
--
-- Bucket visibility: public = TRUE. The spec specified false, but the
-- admin photo grid reads photos via plain <img src=...> on the
-- getPublicUrl() value, which 401s for a private bucket. Photos are
-- delivery proof, not customer PII, and the storage path is
-- {deliveryId}/{leg}/{ts}-{n}.jpg — deliveryId is a UUID, effectively
-- unguessable. If stricter access is needed later, flip the bucket to
-- private and switch admin rendering to createSignedUrl().
-- =============================================================================


-- ---------- deliveries: driver notes (tokens + photo arrays already exist) -
alter table deliveries add column if not exists pickup_link_token   text unique default generate_token();
alter table deliveries add column if not exists delivery_link_token text unique default generate_token();
alter table deliveries add column if not exists pickup_photos       text[] default '{}';
alter table deliveries add column if not exists delivery_photos     text[] default '{}';
alter table deliveries add column if not exists pickup_confirmed_at timestamptz;
alter table deliveries add column if not exists delivered_at        timestamptz;
alter table deliveries add column if not exists pickup_notes        text;
alter table deliveries add column if not exists delivery_notes      text;

-- Backfill tokens for any pre-existing rows missing them.
update deliveries
   set pickup_link_token   = encode(gen_random_bytes(16), 'hex')
 where pickup_link_token is null;
update deliveries
   set delivery_link_token = encode(gen_random_bytes(16), 'hex')
 where delivery_link_token is null;


-- ---------- storage bucket -----------------------------------------------
insert into storage.buckets (id, name, public)
values ('delivery-photos', 'delivery-photos', true)
on conflict (id) do update set public = true;


-- ---------- storage RLS --------------------------------------------------
-- Anon can INSERT into the bucket (the public pickup/dropoff pages do
-- the upload directly with the anon key, since the upload happens before
-- the API row update so we can store the URLs in pickup_photos[]).
drop policy if exists "Anon upload delivery photos" on storage.objects;
create policy "Anon upload delivery photos"
on storage.objects for insert
to anon
with check (bucket_id = 'delivery-photos');

-- Admin can list / fetch the photos via the dashboard.
drop policy if exists "Admin read delivery photos" on storage.objects;
create policy "Admin read delivery photos"
on storage.objects for select
to authenticated
using (bucket_id = 'delivery-photos' and is_admin());

-- Service role does row writes + storage ops from the API.
drop policy if exists "Service role manage delivery photos" on storage.objects;
create policy "Service role manage delivery photos"
on storage.objects for all
to service_role
using (bucket_id = 'delivery-photos')
with check (bucket_id = 'delivery-photos');
