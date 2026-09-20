-- ============================================================================
-- Signature Pianos — customer portal RPCs (portal/dashboard.html)
-- ----------------------------------------------------------------------------
-- Why: the portal signs customers in with a magic link, then looked them up in
-- `customers` by email. The only customer-facing policies all match
-- `customers.user_id = auth.uid()`, and nothing ever set customers.user_id, so
-- every customer saw "No account found".
--
-- This file:
--   1. Drops the per-customer table policies (customers self select / insert /
--      update, and "customer read own" on orders, deliveries, warranties and
--      tuner_bookings). They have never matched a row (user_id was never set),
--      but claim_customer() below makes them live, and then a signed-in
--      customer could read, straight from the REST API:
--        - customers.notes and orders.notes (the admin's "Internal notes"),
--        - every link token on their deliveries and tuner bookings
--          (pickup / delivery / preference / acceptance, acceptance /
--          completion / log-date), i.e. mark their own delivery delivered or
--          their own tuning completed on the driver / tuner pages,
--      and could rewrite their own customers row (email, notes, ABN).
--      The portal reads everything through portal_summary() instead.
--   2. claim_customer()  — links the signed-in user to their customer record(s)
--      by verified email (sets customers.user_id where it is still empty).
--   3. portal_summary()  — returns only what the portal shows, for the caller:
--      first name, orders (not voided) with piano brand / model / year,
--      delivery progress, warranties, and tuner bookings. No notes, no tokens,
--      no addresses, no driver details, no cost prices.
--
-- Safe to run at any time and to re-run. Nothing that works today depends on
-- the dropped policies (the portal never found a customer). Admin access
-- (is_admin() policies) and the service-role APIs are untouched;
-- api/warranty-certificate.js uses the service role and keeps working.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Latent per-customer table policies (replaced by portal_summary())
-- ----------------------------------------------------------------------------
drop policy if exists "customers self select"             on public.customers;
drop policy if exists "customers self insert"             on public.customers;
drop policy if exists "customers self update"             on public.customers;
drop policy if exists "orders customer read own"          on public.orders;
drop policy if exists "deliveries customer read own"      on public.deliveries;
drop policy if exists "warranties customer read own"      on public.warranties;
drop policy if exists "tuner_bookings customer read own"  on public.tuner_bookings;


-- ----------------------------------------------------------------------------
-- 2. claim_customer(): link auth user -> customers row(s) by verified email
-- ----------------------------------------------------------------------------
-- Returns the caller's customer id (most recent record if there are several
-- with the same email), or null when the email is unverified or there is no
-- customer record for it. Never takes over a record already linked to a
-- different sign-in.
create or replace function public.claim_customer()
returns uuid
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(nullif(btrim(auth.jwt() ->> 'email'), ''));
  v_id    uuid;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if v_email is null then
    return null;
  end if;

  -- The email must be the account's own, confirmed address (a magic-link
  -- sign-in confirms it; this also covers any other sign-in method).
  if not exists (
    select 1
      from auth.users u
     where u.id = v_uid
       and u.email_confirmed_at is not null
       and lower(u.email) = v_email
  ) then
    return null;
  end if;

  update public.customers
     set user_id = v_uid
   where lower(email) = v_email
     and user_id is null;

  select c.id
    into v_id
    from public.customers c
   where c.user_id = v_uid
   order by c.created_at desc
   limit 1;

  return v_id;
end;
$$;

revoke all on function public.claim_customer() from public, anon;
grant execute on function public.claim_customer() to authenticated;


-- ----------------------------------------------------------------------------
-- 3. portal_summary(): everything the portal shows, scoped to the caller
-- ----------------------------------------------------------------------------
-- Shape (jsonb), or null when the caller has no linked customer record:
-- {
--   first_name,
--   orders: [{ id, order_number, invoice_number, status, total, currency,
--              payment_method, created_at, item,
--              piano: { brand, model, year, type } | null,
--              deliveries: [{ status, scheduled_date, scheduled_time_window,
--                             delivered_at, preferences_submitted,
--                             driver_accepted, failed }],
--              warranties: [{ id, warranty_number, start_date, expiry_date,
--                             years, status }] }],
--   tuner_bookings: [{ order_id, status, scheduled_date, scheduled_time,
--                      confirmed_date, confirmed_time, contact_sent,
--                      completed, completed_at, created_at }]
-- }
-- Orders and bookings are newest first. Voided orders (and their bookings)
-- and void warranties are left out.
create or replace function public.portal_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid    uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if not exists (select 1 from public.customers where user_id = v_uid) then
    return null;
  end if;

  with mine as (
    select c.id from public.customers c where c.user_id = v_uid
  ),
  my_orders as (
    select o.*
      from public.orders o
     where o.customer_id in (select id from mine)
       and coalesce(o.voided, false) = false
  )
  select jsonb_build_object(
    'first_name', (
      select c.first_name
        from public.customers c
       where c.user_id = v_uid
       order by c.created_at desc
       limit 1
    ),
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',             o.id,
               'order_number',   o.order_number,
               'invoice_number', o.invoice_number,
               'status',         o.status,
               'total',          o.total,
               'currency',       o.currency,
               'payment_method', o.payment_method,
               'created_at',     o.created_at,
               'item',           case when jsonb_typeof(o.line_items) = 'array'
                                      then o.line_items -> 0 ->> 'description' end,
               'piano',          case when p.id is null then null else jsonb_build_object(
                                   'brand', p.brand,
                                   'model', p.model,
                                   'year',  p.year,
                                   'type',  p.type) end,
               'deliveries', coalesce((
                  select jsonb_agg(jsonb_build_object(
                           'status',                d.status,
                           'scheduled_date',        d.scheduled_date,
                           'scheduled_time_window', d.scheduled_time_window,
                           'delivered_at',          d.delivered_at,
                           'preferences_submitted', d.customer_preferences_submitted is not null,
                           'driver_accepted',       coalesce(d.driver_accepted, false),
                           'failed',                coalesce(d.failed_delivery, false)
                         ) order by d.created_at desc)
                    from public.deliveries d
                   where d.order_id = o.id
               ), '[]'::jsonb),
               'warranties', coalesce((
                  select jsonb_agg(jsonb_build_object(
                           'id',              w.id,
                           'warranty_number', w.warranty_number,
                           'start_date',      w.start_date,
                           'expiry_date',     w.expiry_date,
                           'years',           w.years,
                           'status',          w.status
                         ) order by w.created_at desc)
                    from public.warranties w
                   where w.order_id = o.id
                     and w.status <> 'void'
               ), '[]'::jsonb)
             ) order by o.created_at desc)
        from my_orders o
        left join public.pianos p on p.id = o.piano_id
    ), '[]'::jsonb),
    'tuner_bookings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'order_id',       t.order_id,
               'status',         t.status,
               'scheduled_date', t.scheduled_date,
               'scheduled_time', t.scheduled_time,
               'confirmed_date', t.confirmed_date,
               'confirmed_time', t.confirmed_time,
               'contact_sent',   coalesce(t.contact_sent, false),
               'completed',      coalesce(t.completed, false) or t.status::text = 'completed',
               'completed_at',   t.completed_at,
               'created_at',     t.created_at
             ) order by t.created_at desc)
        from public.tuner_bookings t
       where t.order_id in (select id from my_orders)
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.portal_summary() from public, anon;
grant execute on function public.portal_summary() to authenticated;


-- Make PostgREST pick up the new functions straight away.
notify pgrst, 'reload schema';
