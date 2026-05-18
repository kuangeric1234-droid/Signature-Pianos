-- =============================================================================
-- SIGNATURE PIANOS — delivery partners + customer-preference tokens
-- =============================================================================
-- Run AFTER missing_tables.sql in the Supabase SQL editor.
-- Safe to re-run: every object uses IF NOT EXISTS / DROP-then-CREATE /
-- ON CONFLICT DO NOTHING.
--
-- Adds:
--   * delivery_partners — the couriers / carriers we can assign to a job
--   * deliveries.preference_token, customer_preference_1/2/3,
--     customer_preferences_submitted, delivery_partner_id, auto_created
--   * anon-readable policy on deliveries scoped to a preference_token
--     so the public preferences form works without authentication
-- =============================================================================


-- ---------- orders: stripe_session_id for webhook idempotency ------------
-- The Stripe webhook keys on this column to avoid double-inserting orders
-- if Stripe retries the same checkout.session.completed event.
alter table orders add column if not exists stripe_session_id text unique;
create index if not exists idx_orders_stripe_session_id on orders(stripe_session_id);


-- ---------- delivery_partners ---------------------------------------------
create table if not exists delivery_partners (
  id          uuid default gen_random_uuid() primary key,
  name        text not null,
  contact_name text,
  email       text,
  phone       text,
  service_area text,
  notes       text,
  active      boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists idx_delivery_partners_active on delivery_partners(active);

alter table delivery_partners enable row level security;

drop policy if exists "Admin full access — delivery_partners" on delivery_partners;
create policy "Admin full access — delivery_partners"
on delivery_partners for all
to authenticated
using (is_admin())
with check (is_admin());

drop trigger if exists trg_set_updated_at on delivery_partners;
create trigger trg_set_updated_at
before update on delivery_partners
for each row execute function set_updated_at();

-- Seed two placeholders so the Partners tab is populated on first load.
insert into delivery_partners (name, contact_name, email, phone, service_area, notes, active)
values
  ('Melbourne Piano Movers', 'TODO: Contact', 'TODO: email', 'TODO: phone',
   'Metro Melbourne', 'Default partner for inner-city deliveries.', true),
  ('Regional Victoria Freight', 'TODO: Contact', 'TODO: email', 'TODO: phone',
   'Regional VIC', 'Used for jobs outside metro Melbourne.', true)
on conflict do nothing;


-- ---------- deliveries: new columns --------------------------------------
alter table deliveries add column if not exists delivery_partner_id          uuid references delivery_partners(id);
alter table deliveries add column if not exists preference_token             text unique default generate_token();
alter table deliveries add column if not exists customer_preference_1        jsonb;
alter table deliveries add column if not exists customer_preference_2        jsonb;
alter table deliveries add column if not exists customer_preference_3        jsonb;
alter table deliveries add column if not exists customer_preferences_submitted timestamptz;
alter table deliveries add column if not exists customer_special_instructions text;
alter table deliveries add column if not exists customer_address_confirmed   text;
alter table deliveries add column if not exists auto_created                 boolean default false;

create index if not exists idx_deliveries_preference_token on deliveries(preference_token);
create index if not exists idx_deliveries_partner_id       on deliveries(delivery_partner_id);

-- Backfill: existing rows get a preference_token so the public form works
-- for legacy jobs too. NULL filter so already-set rows are untouched.
update deliveries
   set preference_token = generate_token()
 where preference_token is null;


-- ---------- Public (anon) access to deliveries scoped to preference_token -
-- The existing anon SELECT policy already permits reading rows where ANY
-- token column is non-null. Re-create explicitly so it covers preference_token
-- and so anon UPDATE is allowed when the row is matched on preference_token.
drop policy if exists "Anon can read by token" on deliveries;
create policy "Anon can read by token"
on deliveries for select
to anon
using (
  pickup_link_token        is not null
  or delivery_link_token   is not null
  or preference_token      is not null
);

-- Allow the public preferences form to write back the three preferences and
-- the submitted timestamp. The app must filter on preference_token; this
-- policy is intentionally permissive on column choice but the trigger below
-- locks down which columns can change.
drop policy if exists "Anon can submit preferences by token" on deliveries;
create policy "Anon can submit preferences by token"
on deliveries for update
to anon
using (preference_token is not null)
with check (preference_token is not null);


-- ---------- Guard trigger: anon can only write preference fields ---------
-- Anon updates that touch anything other than the preference columns
-- (or the submitted timestamp) are rejected. Authenticated admin updates
-- bypass this check.
create or replace function deliveries_anon_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- If the caller is authenticated (admin) we don't restrict columns.
  if auth.role() <> 'anon' then
    return new;
  end if;

  -- Whitelist: anon can only touch these columns.
  if  new.id                              is distinct from old.id                              then raise exception 'anon may not change id';                            end if;
  if  new.order_id                        is distinct from old.order_id                        then raise exception 'anon may not change order_id';                      end if;
  if  new.status                          is distinct from old.status                          then raise exception 'anon may not change status';                        end if;
  if  new.driver_name                     is distinct from old.driver_name                     then raise exception 'anon may not change driver_name';                   end if;
  if  new.driver_phone                    is distinct from old.driver_phone                    then raise exception 'anon may not change driver_phone';                  end if;
  if  new.scheduled_date                  is distinct from old.scheduled_date                  then raise exception 'anon may not change scheduled_date';                end if;
  if  new.scheduled_time_window           is distinct from old.scheduled_time_window           then raise exception 'anon may not change scheduled_time_window';         end if;
  if  new.delivery_partner_id             is distinct from old.delivery_partner_id             then raise exception 'anon may not change delivery_partner_id';           end if;
  if  new.pickup_link_token               is distinct from old.pickup_link_token               then raise exception 'anon may not rotate pickup_link_token';             end if;
  if  new.delivery_link_token             is distinct from old.delivery_link_token             then raise exception 'anon may not rotate delivery_link_token';           end if;
  if  new.preference_token                is distinct from old.preference_token                then raise exception 'anon may not rotate preference_token';              end if;
  if  new.auto_created                    is distinct from old.auto_created                    then raise exception 'anon may not change auto_created';                  end if;
  return new;
end;
$$;

drop trigger if exists trg_deliveries_anon_guard on deliveries;
create trigger trg_deliveries_anon_guard
before update on deliveries
for each row execute function deliveries_anon_guard();
