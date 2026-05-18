-- ============================================================================
-- Signature Pianos — Storage RLS for delivery-photos bucket
-- ----------------------------------------------------------------------------
-- Public token-bearing pages (delivery/pickup.html, delivery/dropoff.html)
-- upload directly to storage as anon. Token verification + row updates
-- happen server-side in /api/driver-pickup-confirm and
-- /api/driver-delivery-confirm under the service role, so we only need
-- the storage write itself to succeed for anon.
--
-- Run AFTER supabase/delivery_tokens.sql.
-- ============================================================================

-- Allow anyone to upload delivery photos.
-- Token verification happens server-side in the API.
create policy "Allow delivery photo uploads"
on storage.objects for insert
to anon
with check (bucket_id = 'delivery-photos');

-- Allow service role full access
create policy "Service role delivery photos"
on storage.objects for all
to service_role
using (bucket_id = 'delivery-photos');
