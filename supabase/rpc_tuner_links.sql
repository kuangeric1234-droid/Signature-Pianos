-- =============================================================================
-- SIGNATURE PIANOS — token lookup for the public tuner pages
-- =============================================================================
-- tuner/respond.html   (/tuner/respond/{acceptance_token})
-- tuner/log-date.html  (/tuner/log-date/{log_date_token})
--
-- The pages used to read tuner_bookings directly with the anon key, through
-- the policy "Public read tuner_booking by token" (USING acceptance_token IS
-- NOT NULL). That policy matches every row, so anyone with the anon key could
-- list every booking with its tokens. Anon also can't read orders / customers /
-- pianos, so the pages never showed the customer.
--
-- Now the pages call this one function instead. It returns a single booking,
-- only when the token is an exact match, and only the fields the tuner needs.
-- Every write still goes through the api/tuner-*.js routes (service role),
-- which check the token and the booking's state themselves.
--
-- Run order:
--   1. Run this file (safe any time; nothing uses it until the new pages deploy).
--   2. Deploy the site.
--   3. Then drop the old anon policy (step at the bottom).
-- =============================================================================

create or replace function public.get_tuner_booking_by_token(p_token text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'kind',           case when tb.acceptance_token = p_token then 'respond' else 'log_date' end,
    'id',             tb.id,
    'status',         tb.status,
    'tuner_response', tb.tuner_response,
    'tuner_accepted', coalesce(tb.tuner_accepted, false),
    'proposed_date',  tb.proposed_date,
    'proposed_time',  tb.proposed_time,
    'scheduled_date', tb.scheduled_date,
    'scheduled_time', to_char(tb.scheduled_time, 'HH24:MI'),
    'confirmed_date', tb.confirmed_date,
    'confirmed_time', tb.confirmed_time,
    'date_logged',    coalesce(tb.date_logged, false),
    'completed',      coalesce(tb.completed, false),
    'tuner',          jsonb_build_object('name', coalesce(t.name, tb.tuner_name)),
    -- Customer and piano only while the job is open: a finished or cancelled
    -- booking's link just shows a status message.
    'customer', case when tb.status in ('completed', 'cancelled') or coalesce(tb.completed, false) then null
                     when c.id is null then null
                     else jsonb_build_object(
                       'first_name',    c.first_name,
                       'last_name',     c.last_name,
                       'phone',         c.phone,
                       'address_line1', c.address_line1,
                       'address_line2', c.address_line2,
                       'suburb',        c.suburb,
                       'state',         c.state,
                       'postcode',      c.postcode
                     ) end,
    'piano',    case when tb.status in ('completed', 'cancelled') or coalesce(tb.completed, false) then null
                     when pi.id is null then null
                     else jsonb_build_object(
                       'brand',         pi.brand,
                       'model',         pi.model,
                       'year',          pi.year,
                       'serial_number', pi.serial_number
                     ) end
  )
  from tuner_bookings tb
  left join tuners    t  on t.id  = tb.tuner_id
  left join orders    o  on o.id  = tb.order_id
  left join customers c  on c.id  = coalesce(o.customer_id, tb.customer_id)
  left join pianos    pi on pi.id = o.piano_id
  where p_token is not null
    and length(p_token) >= 16
    and (tb.acceptance_token = p_token or tb.log_date_token = p_token)
  limit 1;
$$;

revoke all on function public.get_tuner_booking_by_token(text) from public;
grant execute on function public.get_tuner_booking_by_token(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. AFTER the new tuner pages are live, remove the policy that exposed every
--    booking to anon (nothing reads tuner_bookings with the anon key any more):
--
-- drop policy if exists "Public read tuner_booking by token" on tuner_bookings;
-- drop policy if exists "Public read tuner_booking by log_date_token" on tuner_bookings;
-- -----------------------------------------------------------------------------
