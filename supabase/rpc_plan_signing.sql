-- =============================================================================
-- Signature Pianos — token-gated read for the public contract signing page
-- -----------------------------------------------------------------------------
-- payment-plan-sign.html used to read payment_plans / payment_instalments
-- straight from the browser with the anon key. The anon SELECT policies that
-- allowed it ("signature_token IS NOT NULL") match EVERY row, so anyone with
-- the public anon key could list every plan: countersign tokens, card last
-- four, ID-document paths, signer IPs. The page also showed a blank buyer,
-- a bare "Yamaha" and no ABN, because anon can't read customers,
-- reserved pianos or company_settings.
--
-- get_plan_for_signing(p_token) replaces those reads. It returns null unless
-- the token matches a plan's signature_token exactly, and otherwise returns
-- only what the signing page renders. Never add countersign_token, stripe
-- ids, card details, id_document_url, signer_ip or notes to it.
--
-- Step 1 (now):   run this file.
-- Step 2 (after the new payment-plan-sign.html is live): run the two DROP
--                 POLICY lines at the bottom (commented out on purpose).
-- Idempotent.
-- =============================================================================

create or replace function public.get_plan_for_signing(p_token text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'plan', jsonb_build_object(
      'id',                    pp.id,
      'plan_number',           pp.plan_number,
      'status',                pp.status,
      'total_amount',          pp.total_amount,
      'deposit_amount',        pp.deposit_amount,
      'deposit_paid',          coalesce(pp.deposit_paid, false),
      'remaining_amount',      pp.remaining_amount,
      'surcharge_percentage',  pp.surcharge_percentage,
      'surcharge_amount',      pp.surcharge_amount,
      'total_with_surcharge',  pp.total_with_surcharge,
      'instalment_frequency',  pp.instalment_frequency,
      'number_of_instalments', pp.number_of_instalments,
      'instalment_amount',     pp.instalment_amount,
      'start_date',            pp.start_date,
      'end_date',              pp.end_date,
      'payment_method',        pp.payment_method,
      'contract_signed',       coalesce(pp.contract_signed, false),
      'contract_signed_at',    pp.contract_signed_at,
      -- Buyer
      'customer', (
        select jsonb_build_object(
          'first_name',    c.first_name,
          'last_name',     c.last_name,
          'email',         c.email,
          'phone',         c.phone,
          'address',       c.address,
          'address_line1', c.address_line1,
          'address_line2', c.address_line2,
          'suburb',        c.suburb,
          'state',         c.state,
          'postcode',      c.postcode
        )
        from customers c
        where c.id = pp.customer_id
      ),
      -- Instrument (no condition grade: grades are internal)
      'piano', (
        select jsonb_build_object(
          'brand',         p.brand,
          'model',         p.model,
          'year',          p.year,
          'serial_number', p.serial_number,
          'type',          p.type
        )
        from pianos p
        where p.id = pp.piano_id
      )
    ),
    'instalments', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'instalment_number', i.instalment_number,
          'due_date',          i.due_date,
          'amount',            i.amount
        )
        order by i.instalment_number
      )
      from payment_instalments i
      where i.payment_plan_id = pp.id
    ), '[]'::jsonb),
    -- Seller. Bank details are included because the bank-transfer step shows
    -- them; they're the same details the customer gets by email.
    'settings', (
      select jsonb_build_object(
        'business_name',     s.business_name,
        'abn',               s.abn,
        'address_line1',     s.address_line1,
        'address_line2',     s.address_line2,
        'suburb',            s.suburb,
        'state',             s.state,
        'postcode',          s.postcode,
        'email',             s.email,
        'phone',             s.phone,
        'bank_name',         s.bank_name,
        'bank_bsb',          s.bank_bsb,
        'bank_account',      s.bank_account,
        'bank_account_name', s.bank_account_name
      )
      from company_settings s
      order by s.updated_at desc nulls last
      limit 1
    )
  )
  from payment_plans pp
  where p_token is not null
    and length(p_token) >= 16
    and pp.signature_token = p_token
  limit 1;
$$;

revoke all on function public.get_plan_for_signing(text) from public;
grant execute on function public.get_plan_for_signing(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Step 2 — run ONLY after the new payment-plan-sign.html (which calls the
-- function above) is deployed. Admin access is unaffected: the admin pages use
-- the "Admin full access" policies, and the api/ routes use the service role.
-- -----------------------------------------------------------------------------
-- drop policy if exists "Public read payment_plan by token"      on public.payment_plans;
-- drop policy if exists "Public read payment_instalments by plan" on public.payment_instalments;
