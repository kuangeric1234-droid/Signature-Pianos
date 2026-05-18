-- =============================================================================
-- SIGNATURE PIANOS — ADMIN RLS POLICIES
-- =============================================================================
-- Run this in the Supabase SQL editor AFTER missing_tables.sql.
--
-- Most of these policies already exist (missing_tables.sql created them).
-- This file is safe to re-run because every CREATE POLICY is preceded by
-- a DROP POLICY IF EXISTS. The newly-needed piece is the policy on
-- service_requests, which was created out-of-band and never got one.
--
-- The is_admin() function is also redefined here — schema.sql/missing_tables
-- already define it; CREATE OR REPLACE makes that a no-op.
-- =============================================================================

-- Helper: returns true if the current auth.uid() is an active row in
-- admin_users. SECURITY DEFINER so it can bypass RLS on admin_users
-- itself (otherwise the admin_users policy below would recurse).
create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from admin_users
    where user_id = auth.uid()
      and active = true
  );
$$;


-- ----- viewing_bookings -----
drop policy if exists "Admin full access — viewing_bookings" on viewing_bookings;
create policy "Admin full access — viewing_bookings"
  on viewing_bookings for all
  to authenticated
  using (is_admin())
  with check (is_admin());

-- ----- service_requests (the one that didn't have a policy before) -----
drop policy if exists "Admin full access — service_requests" on service_requests;
create policy "Admin full access — service_requests"
  on service_requests for all
  to authenticated
  using (is_admin())
  with check (is_admin());

-- ----- pianos -----
drop policy if exists "Admin full access — pianos" on pianos;
create policy "Admin full access — pianos"
  on pianos for all
  to authenticated
  using (is_admin())
  with check (is_admin());

-- ----- orders -----
drop policy if exists "Admin full access — orders" on orders;
create policy "Admin full access — orders"
  on orders for all
  to authenticated
  using (is_admin())
  with check (is_admin());

-- ----- customers -----
drop policy if exists "Admin full access — customers" on customers;
create policy "Admin full access — customers"
  on customers for all
  to authenticated
  using (is_admin())
  with check (is_admin());

-- ----- deliveries -----
drop policy if exists "Admin full access — deliveries" on deliveries;
create policy "Admin full access — deliveries"
  on deliveries for all
  to authenticated
  using (is_admin())
  with check (is_admin());

-- ----- warranties -----
drop policy if exists "Admin full access — warranties" on warranties;
create policy "Admin full access — warranties"
  on warranties for all
  to authenticated
  using (is_admin())
  with check (is_admin());

-- ----- tuner_bookings -----
drop policy if exists "Admin full access — tuner_bookings" on tuner_bookings;
create policy "Admin full access — tuner_bookings"
  on tuner_bookings for all
  to authenticated
  using (is_admin())
  with check (is_admin());

-- ----- teachers -----
drop policy if exists "Admin full access — teachers" on teachers;
create policy "Admin full access — teachers"
  on teachers for all
  to authenticated
  using (is_admin())
  with check (is_admin());

-- ----- teacher_listings -----
drop policy if exists "Admin full access — teacher_listings" on teacher_listings;
create policy "Admin full access — teacher_listings"
  on teacher_listings for all
  to authenticated
  using (is_admin())
  with check (is_admin());

-- ----- teacher_bookings -----
drop policy if exists "Admin full access — teacher_bookings" on teacher_bookings;
create policy "Admin full access — teacher_bookings"
  on teacher_bookings for all
  to authenticated
  using (is_admin())
  with check (is_admin());

-- ----- teacher_students (not in the original spec but in the schema) -----
drop policy if exists "Admin full access — teacher_students" on teacher_students;
create policy "Admin full access — teacher_students"
  on teacher_students for all
  to authenticated
  using (is_admin())
  with check (is_admin());

-- ----- teacher_invoices (not in the original spec but in the schema) -----
drop policy if exists "Admin full access — teacher_invoices" on teacher_invoices;
create policy "Admin full access — teacher_invoices"
  on teacher_invoices for all
  to authenticated
  using (is_admin())
  with check (is_admin());

-- ----- admin_users -----
-- Note: missing_tables.sql restricts admin_users mutations to super_admin
-- via is_super_admin(). This broader is_admin() policy will let staff and
-- admin roles read admin_users too, which matches the spec for this file.
drop policy if exists "Admin full access — admin_users" on admin_users;
create policy "Admin full access — admin_users"
  on admin_users for all
  to authenticated
  using (is_admin())
  with check (is_admin());

-- ----- tuners (created by supabase/tuners_table.sql) -----
-- Same policy is also defined in tuners_table.sql; safe to apply twice.
drop policy if exists "Admin full access — tuners" on tuners;
create policy "Admin full access — tuners"
  on tuners for all
  to authenticated
  using (is_admin())
  with check (is_admin());
