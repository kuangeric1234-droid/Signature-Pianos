-- =============================================================================
-- Signature Pianos — fix generate_plan_number() RPC
-- -----------------------------------------------------------------------------
-- Run AFTER supabase/payment_plans.sql. The function body references the
-- payment_plans table; PL/pgSQL doesn't validate that reference at CREATE
-- time, but it WILL error when the function is called if the table is
-- missing. Run order:
--   1. supabase/payment_plans.sql       (creates payment_plans + RPC)
--   2. supabase/fix_plan_number.sql     (this file — rebuilds RPC clean)
--   3. supabase/payment_plans_upgrade.sql (adds new columns + buckets)
--
-- The "Could not find the function public.generate_plan_number without
-- parameters" error means PostgREST's schema cache is out of date or the
-- function is missing. Drop both possible signatures and recreate clean.
--
-- The admin/payment-plans.html createPaymentPlan() flow now generates the
-- plan number client-side as a fallback, so this RPC is no longer on the
-- critical path — but keeping it clean lets backfills + manual SQL inserts
-- continue to use it.
-- =============================================================================

drop function if exists generate_plan_number();
drop function if exists public.generate_plan_number();

create or replace function public.generate_plan_number()
returns text
language plpgsql
security definer
as $$
declare
  year_str text := to_char(now(), 'YYYY');
  seq      integer;
  plan_num text;
begin
  select coalesce(
    max(cast(split_part(plan_number, '-', 3) as integer)),
    0
  ) + 1
  into seq
  from payment_plans
  where plan_number like 'PP-' || year_str || '-%';

  plan_num := 'PP-' || year_str || '-' || lpad(seq::text, 5, '0');

  return plan_num;
end;
$$;

grant execute on function public.generate_plan_number() to authenticated;
grant execute on function public.generate_plan_number() to anon;
grant execute on function public.generate_plan_number() to service_role;

-- Manual sanity check (run separately, only after payment_plans.sql has
-- created the table — otherwise this errors with 42P01):
--   select public.generate_plan_number();
