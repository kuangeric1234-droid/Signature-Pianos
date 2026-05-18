-- =============================================================================
-- Signature Pianos — payment plan upgrades
-- -----------------------------------------------------------------------------
-- Run AFTER supabase/fix_plan_number.sql.
-- Adds columns for: payment method (bank/card + Stripe ids + surcharge),
-- ID verification, generated agreement PDF, and signer audit fields.
-- Creates the id-documents and agreements storage buckets (private) plus
-- the minimal RLS so the public signing page can upload ID docs and so
-- admins can read agreements server-side via signed URLs.
-- Idempotent — every alter is `add column if not exists`, every policy is
-- drop-then-create.
-- =============================================================================

-- ---------- payment_plans: payment method + Stripe -------------------------
alter table payment_plans
  add column if not exists payment_method        text
    default 'bank_transfer'
    check (payment_method in ('bank_transfer', 'credit_card')),
  add column if not exists surcharge_percentage  numeric default 0,
  add column if not exists surcharge_amount      numeric default 0,
  add column if not exists total_with_surcharge  numeric,
  add column if not exists stripe_customer_id    text,
  add column if not exists stripe_payment_method_id text,
  add column if not exists card_last_four        text,
  add column if not exists card_brand            text;

-- ---------- payment_plans: ID verification ---------------------------------
alter table payment_plans
  add column if not exists id_document_url       text,
  add column if not exists id_document_type      text,
  add column if not exists id_verified           boolean default false,
  add column if not exists id_uploaded_at        timestamptz;

-- ---------- payment_plans: agreement + signer audit ------------------------
alter table payment_plans
  add column if not exists agreement_pdf_url     text,
  add column if not exists agreement_generated_at timestamptz,
  add column if not exists signer_ip             text,
  add column if not exists signer_user_agent     text;


-- ---------- Storage buckets ------------------------------------------------
insert into storage.buckets (id, name, public)
values ('id-documents', 'id-documents', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('agreements', 'agreements', false)
on conflict (id) do nothing;


-- ---------- Storage RLS — id-documents -------------------------------------
-- Public signing page uploads the customer's ID directly (anon insert).
-- Admin reads via signed URL minted under is_admin(); service role does
-- everything else from the API.
drop policy if exists "Service role manage id documents" on storage.objects;
create policy "Service role manage id documents"
on storage.objects for all
to service_role
using (bucket_id = 'id-documents')
with check (bucket_id = 'id-documents');

drop policy if exists "Anon upload id documents" on storage.objects;
create policy "Anon upload id documents"
on storage.objects for insert
to anon
with check (bucket_id = 'id-documents');

drop policy if exists "Admin read id documents" on storage.objects;
create policy "Admin read id documents"
on storage.objects for select
to authenticated
using (bucket_id = 'id-documents' and is_admin());


-- ---------- Storage RLS — agreements ---------------------------------------
drop policy if exists "Service role manage agreements" on storage.objects;
create policy "Service role manage agreements"
on storage.objects for all
to service_role
using (bucket_id = 'agreements')
with check (bucket_id = 'agreements');

drop policy if exists "Admin read agreements" on storage.objects;
create policy "Admin read agreements"
on storage.objects for select
to authenticated
using (bucket_id = 'agreements' and is_admin());
