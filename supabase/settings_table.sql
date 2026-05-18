-- =============================================================================
-- SIGNATURE PIANOS — company_settings + orders invoice-management columns
-- =============================================================================
-- Run AFTER missing_tables.sql in the Supabase SQL editor.
-- Safe to re-run: every object uses IF NOT EXISTS / DROP-then-CREATE /
-- ON CONFLICT DO NOTHING.
-- =============================================================================

-- ---------- company_settings ----------------------------------------------
-- One row only — everything reads / writes the same row. Source of truth
-- for what appears in invoice headers + bank-detail blocks.
create table if not exists company_settings (
  id                  uuid default gen_random_uuid() primary key,
  business_name       text default 'Signature Pianos',
  abn                 text default '',
  address_line1       text default '',
  address_line2       text default '',
  suburb              text default '',
  state               text default 'VIC',
  postcode            text default '',
  email               text default '',
  phone               text default '',
  website             text default 'signaturepianos.com.au',
  bank_name           text default '',
  bank_bsb            text default '',
  bank_account        text default '',
  bank_account_name   text default '',
  invoice_notes       text default 'Thank you for choosing Signature Pianos. This piano is covered by a 10-year warranty.',
  invoice_prefix      text default 'INV',
  next_invoice_number integer default 1,
  updated_at          timestamptz default now()
);

-- Enforce single-row by making the bare row truly upsert-friendly. A
-- partial unique index over a constant expression gives us a singleton
-- guarantee without a synthetic key.
create unique index if not exists company_settings_singleton on company_settings ((true));

-- RLS
alter table company_settings enable row level security;

drop policy if exists "Admin full access — company_settings" on company_settings;
create policy "Admin full access — company_settings"
on company_settings for all
to authenticated
using (is_admin())
with check (is_admin());

-- Seed the one row. The unique index ensures repeat runs are no-ops.
insert into company_settings (business_name)
values ('Signature Pianos')
on conflict do nothing;


-- ---------- orders: invoice-management columns ----------------------------
-- voided / voided_at / voided_reason support the soft-delete workflow on
-- the orders admin page (kept in the table for audit; filtered out of
-- the default view). invoice_number and line_items already exist on a
-- current database — IF NOT EXISTS makes those a no-op.
alter table orders add column if not exists voided        boolean default false;
alter table orders add column if not exists voided_at     timestamptz;
alter table orders add column if not exists voided_reason text;
alter table orders add column if not exists invoice_number text;
alter table orders add column if not exists line_items    jsonb default '[]';

-- An index on voided helps the active / voided toggle on the orders page.
create index if not exists idx_orders_voided on orders(voided);
