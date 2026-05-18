-- =============================================================================
-- SIGNATURE PIANOS — payment plans + instalments + contracts bucket
-- =============================================================================
-- Run AFTER missing_tables.sql, admin_rls.sql and delivery_updates.sql.
-- Safe to re-run: every object uses IF NOT EXISTS / DROP-then-CREATE.
--
-- Adds:
--   payment_plans                — one row per plan (deposit + instalments)
--   payment_instalments          — schedule of due payments
--   storage.buckets 'contracts'  — private bucket for signed signature PNGs
--   plan-number generator        — PP-YYYY-XXXXX
--
-- Trigger note: existing tables use the project's shared set_updated_at()
-- function (see missing_tables.sql / schema.sql). We reuse it here instead
-- of introducing a parallel update_updated_at_column() helper so the
-- behaviour stays consistent across every table.
-- =============================================================================


-- ---------- payment_plans ------------------------------------------------
create table if not exists payment_plans (
  id                       uuid primary key default gen_random_uuid(),
  order_id                 uuid references orders(id)    on delete cascade,
  customer_id              uuid references customers(id) on delete cascade,
  piano_id                 uuid references pianos(id),
  plan_number              text unique,
  total_amount             numeric(10,2) not null,
  deposit_amount           numeric(10,2) not null default 0,
  deposit_paid             boolean       default false,
  deposit_paid_at          timestamptz,
  remaining_amount         numeric(10,2),
  instalment_amount        numeric(10,2) not null,
  instalment_frequency     text not null
    check (instalment_frequency in ('weekly', 'fortnightly', 'monthly')),
  number_of_instalments    integer not null,
  instalments_paid         integer default 0,
  start_date               date not null,
  end_date                 date,
  status                   text default 'pending'
    check (status in ('pending', 'active', 'completed', 'defaulted', 'cancelled')),
  contract_sent            boolean default false,
  contract_sent_at         timestamptz,
  contract_signed          boolean default false,
  contract_signed_at       timestamptz,
  contract_url             text,
  signature_token          text unique default generate_token(),
  notes                    text,
  created_at               timestamptz default now(),
  updated_at               timestamptz default now()
);

create index if not exists idx_payment_plans_order_id        on payment_plans(order_id);
create index if not exists idx_payment_plans_customer_id     on payment_plans(customer_id);
create index if not exists idx_payment_plans_status          on payment_plans(status);
create index if not exists idx_payment_plans_signature_token on payment_plans(signature_token);


-- ---------- payment_instalments ------------------------------------------
create table if not exists payment_instalments (
  id                   uuid primary key default gen_random_uuid(),
  payment_plan_id      uuid not null references payment_plans(id) on delete cascade,
  instalment_number    integer not null,
  due_date             date not null,
  amount               numeric(10,2) not null,
  paid                 boolean default false,
  paid_at              timestamptz,
  payment_method       text,
  payment_reference    text,
  notes                text,
  created_at           timestamptz default now()
);

create index if not exists idx_payment_instalments_plan_id  on payment_instalments(payment_plan_id);
create index if not exists idx_payment_instalments_due_date on payment_instalments(due_date);
create index if not exists idx_payment_instalments_paid     on payment_instalments(paid);


-- ---------- RLS -----------------------------------------------------------
alter table payment_plans       enable row level security;
alter table payment_instalments enable row level security;

drop policy if exists "Admin full access — payment_plans" on payment_plans;
create policy "Admin full access — payment_plans"
on payment_plans for all
to authenticated
using (is_admin())
with check (is_admin());

drop policy if exists "Admin full access — payment_instalments" on payment_instalments;
create policy "Admin full access — payment_instalments"
on payment_instalments for all
to authenticated
using (is_admin())
with check (is_admin());

-- Public read by signature token — the contract-signing page needs to load
-- the plan + customer + piano without auth. Service-role writes only.
drop policy if exists "Public read payment_plan by token" on payment_plans;
create policy "Public read payment_plan by token"
on payment_plans for select
to anon
using (signature_token is not null);

drop policy if exists "Public read payment_instalments by plan" on payment_instalments;
create policy "Public read payment_instalments by plan"
on payment_instalments for select
to anon
using (
  payment_plan_id in (
    select id from payment_plans where signature_token is not null
  )
);


-- ---------- updated_at trigger -------------------------------------------
drop trigger if exists trg_set_updated_at on payment_plans;
create trigger trg_set_updated_at
before update on payment_plans
for each row execute function set_updated_at();


-- ---------- Plan number generator (PP-YYYY-XXXXX) ------------------------
create or replace function generate_plan_number()
returns text
language plpgsql
as $$
declare
  yr  text := extract(year from now())::text;
  seq integer;
begin
  select coalesce(max(cast(split_part(plan_number, '-', 3) as integer)), 0) + 1
    into seq
    from payment_plans
   where plan_number like 'PP-' || yr || '-%';
  return 'PP-' || yr || '-' || lpad(seq::text, 5, '0');
end;
$$;


-- ---------- Storage bucket for signed contracts --------------------------
-- Private bucket. Service role writes (via api/sign-contract.js), admin
-- reads via the policy below. The customer-facing signing page POSTs the
-- signature image to the API; nothing is uploaded directly from anon.
insert into storage.buckets (id, name, public)
values ('contracts', 'contracts', false)
on conflict (id) do nothing;

drop policy if exists "Admin read contracts" on storage.objects;
create policy "Admin read contracts"
on storage.objects for select
to authenticated
using (bucket_id = 'contracts' and is_admin());

drop policy if exists "Service role manage contracts" on storage.objects;
create policy "Service role manage contracts"
on storage.objects for all
to service_role
using (bucket_id = 'contracts')
with check (bucket_id = 'contracts');
