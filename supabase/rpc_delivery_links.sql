-- ============================================================================
-- Signature Pianos — token-scoped RPCs for the public delivery pages
-- ----------------------------------------------------------------------------
-- The public pages (delivery/accept.html, delivery/pickup.html,
-- delivery/dropoff.html, delivery-preferences.html) used to read and write
-- the deliveries table directly with the anon key. The anon RLS policies that
-- allowed that match EVERY row (`pickup_link_token IS NOT NULL ...`), so the
-- public key could read every delivery (addresses, gate codes, all tokens)
-- and update any of them.
--
-- The pages now go through these SECURITY DEFINER functions instead. Each one
-- takes the token from the link, matches it EXACTLY against one column, and
-- returns only what that page needs. Driver actions (accept / pickup /
-- delivery confirm) still go through api/driver-*.js under the service role.
--
--   get_delivery_for_driver(p_token)       accept / pickup / drop pages
--   get_delivery_for_customer(p_token)     delivery-preferences.html (read)
--   submit_delivery_preferences(p_token, …) delivery-preferences.html (write)
--
-- Run order:
--   1. Run this file (safe to re-run).
--   2. Deploy the site code that calls these functions.
--   3. Then run the "STEP 2" block at the bottom to drop the old anon
--      policies on deliveries.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Acceptance tokens: mint them in the database like the other link tokens.
-- (acceptance_token had no default, so admin/deliveries.html minted one in the
-- browser with Math.random. The page now uses crypto.getRandomValues as a
-- fallback, but with this default every new delivery already has one.)
-- ----------------------------------------------------------------------------
alter table public.deliveries
  alter column acceptance_token set default public.generate_token();

update public.deliveries
   set acceptance_token = public.generate_token()
 where acceptance_token is null;


-- ----------------------------------------------------------------------------
-- get_delivery_for_driver(p_token text) → jsonb | null
--
-- Matches p_token against acceptance_token, pickup_link_token or
-- delivery_link_token (exact match, in that order) and returns:
--   kind                       'accept' | 'pickup' | 'drop'
--   delivery_id, status, scheduled_date, scheduled_time_window
--   driver_accepted
--   customer_preference_1/2/3, customer_preferences_submitted  (accept only)
--   special_instructions       customer's access notes (stairs, parking…)
--   order_number
--   customer                   { first_name, last_name, phone }
--   delivery_address           customer_address_confirmed, else the
--                              customer's address on file
--   piano                      { brand, model, year, serial_number,
--                                weight_kg }
-- Returns null for a missing, short or unknown token.
-- ----------------------------------------------------------------------------
create or replace function public.get_delivery_for_driver(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_kind text;
  d      public.deliveries%rowtype;
  o      public.orders%rowtype;
  c      public.customers%rowtype;
  pn     public.pianos%rowtype;
  v_addr text;
begin
  if p_token is null or length(p_token) < 16 or length(p_token) > 200 then
    return null;
  end if;

  select * into d from public.deliveries where acceptance_token = p_token;
  if found then
    v_kind := 'accept';
  else
    select * into d from public.deliveries where pickup_link_token = p_token;
    if found then
      v_kind := 'pickup';
    else
      select * into d from public.deliveries where delivery_link_token = p_token;
      if found then
        v_kind := 'drop';
      else
        return null;
      end if;
    end if;
  end if;

  select * into o  from public.orders    where id = d.order_id;
  select * into c  from public.customers where id = o.customer_id;
  select * into pn from public.pianos    where id = o.piano_id;

  v_addr := coalesce(
    nullif(btrim(d.customer_address_confirmed), ''),
    nullif(concat_ws(', ',
      nullif(btrim(coalesce(c.address_line1, c.address)), ''),
      nullif(btrim(c.address_line2), ''),
      nullif(btrim(concat_ws(' ', c.suburb, c.state, c.postcode)), '')
    ), '')
  );

  return jsonb_build_object(
    'kind',                  v_kind,
    'delivery_id',           d.id,
    'status',                d.status,
    'scheduled_date',        d.scheduled_date,
    'scheduled_time_window', d.scheduled_time_window,
    'driver_accepted',       coalesce(d.driver_accepted, false),
    'customer_preference_1', case when v_kind = 'accept' then d.customer_preference_1 end,
    'customer_preference_2', case when v_kind = 'accept' then d.customer_preference_2 end,
    'customer_preference_3', case when v_kind = 'accept' then d.customer_preference_3 end,
    'customer_preferences_submitted',
                             case when v_kind = 'accept' then d.customer_preferences_submitted end,
    'special_instructions',  d.customer_special_instructions,
    'order_number',          o.order_number,
    'customer', jsonb_build_object(
      'first_name', c.first_name,
      'last_name',  c.last_name,
      'phone',      c.phone
    ),
    'delivery_address',      v_addr,
    'piano', jsonb_build_object(
      'brand',         pn.brand,
      'model',         pn.model,
      'year',          pn.year,
      'serial_number', pn.serial_number,
      'weight_kg',     pn.weight_kg
    )
  );
end;
$$;


-- ----------------------------------------------------------------------------
-- get_delivery_for_customer(p_token text) → jsonb | null
--
-- Matches p_token against preference_token (exact) and returns:
--   delivery_id, status
--   submitted                        true once preferences are in
--   customer_preferences_submitted   timestamp
--   customer_preference_1/2/3        { date, time }
--   customer_special_instructions, customer_address_confirmed
--   order_number, order_total
--   piano                            { brand, model, year }
--   customer                         { first_name, last_name }
--   address                          the customer's address on file (prefill)
-- Returns null for a missing, short or unknown token.
-- ----------------------------------------------------------------------------
create or replace function public.get_delivery_for_customer(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  d  public.deliveries%rowtype;
  o  public.orders%rowtype;
  c  public.customers%rowtype;
  pn public.pianos%rowtype;
begin
  if p_token is null or length(p_token) < 16 or length(p_token) > 200 then
    return null;
  end if;

  select * into d from public.deliveries where preference_token = p_token;
  if not found then
    return null;
  end if;

  select * into o  from public.orders    where id = d.order_id;
  select * into c  from public.customers where id = o.customer_id;
  select * into pn from public.pianos    where id = o.piano_id;

  return jsonb_build_object(
    'delivery_id',                    d.id,
    'status',                         d.status,
    'submitted',                      d.customer_preferences_submitted is not null,
    'customer_preferences_submitted', d.customer_preferences_submitted,
    'customer_preference_1',          d.customer_preference_1,
    'customer_preference_2',          d.customer_preference_2,
    'customer_preference_3',          d.customer_preference_3,
    'customer_special_instructions',  d.customer_special_instructions,
    'customer_address_confirmed',     d.customer_address_confirmed,
    'order_number',                   o.order_number,
    'order_total',                    o.total,
    'piano', jsonb_build_object(
      'brand', pn.brand,
      'model', pn.model,
      'year',  pn.year
    ),
    'customer', jsonb_build_object(
      'first_name', c.first_name,
      'last_name',  c.last_name
    ),
    'address', nullif(concat_ws(', ',
      nullif(btrim(coalesce(c.address_line1, c.address)), ''),
      nullif(btrim(c.address_line2), ''),
      nullif(btrim(concat_ws(' ', c.suburb, c.state, c.postcode)), '')
    ), '')
  );
end;
$$;


-- ----------------------------------------------------------------------------
-- submit_delivery_preferences(p_token, p_pref1, p_pref2, p_pref3,
--                             p_address, p_instructions) → jsonb
--
-- Writes ONLY the preference columns (customer_preference_1/2/3,
-- customer_address_confirmed, customer_special_instructions,
-- customer_preferences_submitted = now()) on the row whose
-- preference_token = p_token.
--
-- One submission per delivery: once customer_preferences_submitted is set the
-- call is refused ('already_submitted'). The page has no edit mode and tells
-- the customer to reply to their email for changes; after submission the
-- windows go to a driver, so silent edits would contradict what they accepted.
--
-- Each pref must be { "date": "YYYY-MM-DD", "time": "<window>" }, dated from
-- today (Melbourne) to a year out; time 1–60 chars. Address 1–300 chars,
-- instructions up to 2000. Stored prefs are rebuilt as clean { date, time }.
--
-- Returns { ok: true, delivery_id, order_id }
--      or { ok: false, error: 'not_found' | 'already_submitted' |
--           'invalid_preference' | 'invalid_date' | 'invalid_address' |
--           'invalid_instructions' }
-- ----------------------------------------------------------------------------
create or replace function public.submit_delivery_preferences(
  p_token        text,
  p_pref1        jsonb,
  p_pref2        jsonb,
  p_pref3        jsonb,
  p_address      text,
  p_instructions text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_today   date    := (now() at time zone 'Australia/Melbourne')::date;
  v_prefs   jsonb[] := array[p_pref1, p_pref2, p_pref3];
  v_clean   jsonb[] := '{}';
  v_pref    jsonb;
  v_date    date;
  v_time    text;
  v_address text    := btrim(coalesce(p_address, ''));
  v_notes   text    := nullif(btrim(coalesce(p_instructions, '')), '');
  v_id      uuid;
  v_order   uuid;
begin
  if p_token is null or length(p_token) < 16 or length(p_token) > 200 then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  foreach v_pref in array v_prefs loop
    if v_pref is null or jsonb_typeof(v_pref) <> 'object' then
      return jsonb_build_object('ok', false, 'error', 'invalid_preference');
    end if;
    v_time := btrim(coalesce(v_pref->>'time', ''));
    if coalesce(v_pref->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$'
       or v_time = '' or length(v_time) > 60 then
      return jsonb_build_object('ok', false, 'error', 'invalid_preference');
    end if;
    begin
      v_date := (v_pref->>'date')::date;
    exception when others then
      return jsonb_build_object('ok', false, 'error', 'invalid_preference');
    end;
    if v_date < v_today or v_date > v_today + 365 then
      return jsonb_build_object('ok', false, 'error', 'invalid_date');
    end if;
    v_clean := array_append(v_clean,
      jsonb_build_object('date', to_char(v_date, 'YYYY-MM-DD'), 'time', v_time));
  end loop;

  if v_address = '' or length(v_address) > 300 then
    return jsonb_build_object('ok', false, 'error', 'invalid_address');
  end if;
  if v_notes is not null and length(v_notes) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'invalid_instructions');
  end if;

  update public.deliveries
     set customer_preference_1          = v_clean[1],
         customer_preference_2          = v_clean[2],
         customer_preference_3          = v_clean[3],
         customer_address_confirmed     = v_address,
         customer_special_instructions  = v_notes,
         customer_preferences_submitted = now()
   where preference_token = p_token
     and customer_preferences_submitted is null
  returning id, order_id into v_id, v_order;

  if v_id is null then
    if exists (select 1 from public.deliveries where preference_token = p_token) then
      return jsonb_build_object('ok', false, 'error', 'already_submitted');
    end if;
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object('ok', true, 'delivery_id', v_id, 'order_id', v_order);
end;
$$;


-- ----------------------------------------------------------------------------
-- Grants: callable by the public pages (anon) and signed-in users only.
-- ----------------------------------------------------------------------------
revoke all on function public.get_delivery_for_driver(text) from public;
grant execute on function public.get_delivery_for_driver(text) to anon, authenticated, service_role;

revoke all on function public.get_delivery_for_customer(text) from public;
grant execute on function public.get_delivery_for_customer(text) to anon, authenticated, service_role;

revoke all on function public.submit_delivery_preferences(text, jsonb, jsonb, jsonb, text, text) from public;
grant execute on function public.submit_delivery_preferences(text, jsonb, jsonb, jsonb, text, text) to anon, authenticated, service_role;

-- Make PostgREST pick up the new functions straight away.
notify pgrst, 'reload schema';


-- ============================================================================
-- STEP 2 — run AFTER the site code that uses the functions above is live.
-- Removes the anon policies that exposed every delivery row. Nothing public
-- reads or writes deliveries directly any more; admins keep "is_admin()"
-- access and customers keep "deliveries customer read own".
-- ============================================================================
-- drop policy if exists "Anon can read by token"               on public.deliveries;
-- drop policy if exists "deliveries anon read by token"         on public.deliveries;
-- drop policy if exists "Anon can submit preferences by token" on public.deliveries;
--
-- Optional: get_delivery_by_token(text) is no longer used by any page and
-- returns the whole row (every token) to anyone holding one pickup or
-- delivery token.
-- revoke execute on function public.get_delivery_by_token(text) from public, anon, authenticated;
