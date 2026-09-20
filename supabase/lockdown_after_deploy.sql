-- =============================================================================
-- SIGNATURE PIANOS — audit fixes, phase 2: lock down public access
-- =============================================================================
-- Run ONLY AFTER the site code from the 19 Sep 2026 audit is deployed.
-- Before that deploy, the live driver / tuner / contract pages still read these
-- tables with the public key and would break.
--
-- Prerequisites (already applied live on 19 Sep 2026):
--   rpc_plan_signing.sql, rpc_delivery_links.sql, rpc_tuner_links.sql
--
-- What this closes:
--   * Six "by token" policies whose condition was `<token> IS NOT NULL`. Every
--     row has a token, so anyone with the public key could read every delivery
--     (addresses, gate codes, all link tokens), every payment plan (signing and
--     countersigning tokens, card last four, ID document path, signer IP),
--     every instalment and every tuner booking, and UPDATE any delivery.
--     The pages now use token-scoped SECURITY DEFINER functions instead.
--   * get_delivery_by_token(): unused, and returned every column (including
--     all other link tokens) to anyone holding one token.
--   * pianos: the public could read cost price, base cost, condition grade and
--     internal/purchase notes of every listed piano. Public pages now select
--     explicit columns; the anon role gets only those columns.
-- =============================================================================

begin;

drop policy if exists "Anon can read by token"                  on public.deliveries;
drop policy if exists "Anon can submit preferences by token"    on public.deliveries;
drop policy if exists "deliveries anon read by token"           on public.deliveries;
drop policy if exists "Public read payment_plan by token"       on public.payment_plans;
drop policy if exists "Public read payment_instalments by plan" on public.payment_instalments;
drop policy if exists "Public read tuner_booking by token"      on public.tuner_bookings;

revoke execute on function public.get_delivery_by_token(text) from public, anon, authenticated;

-- Public piano columns (the union of what the public pages select).
revoke select on public.pianos from anon;
grant select (
  id, slug, type, brand, model, year, serial_number, weight_kg, dimensions_cm, finish, colour,
  images, description, description_short, sale_price, stock_status, featured, created_at
) on public.pianos to anon;

commit;

notify pgrst, 'reload schema';
