-- =============================================================================
-- SIGNATURE PIANOS — Orders + customers extensions for the upgraded POS panel
-- =============================================================================
-- Run AFTER missing_tables.sql in the Supabase SQL editor.
-- Safe to re-run: every ALTER uses IF NOT EXISTS.
-- =============================================================================

-- ---------- orders ----------------------------------------------------------
-- line_items:        the full breakdown rendered on the invoice
--                    (piano line + delivery / tuning / stool / etc).
-- subtotal_ex_gst:   ex-GST total AFTER discount.
-- gst_amount:        GST portion of the final total (total / 11).
--
-- The legacy `subtotal` column stays in place — admin/orders.html now
-- writes it as the inc-GST subtotal PRE-discount, matching the column's
-- original intent.
alter table orders add column if not exists line_items      jsonb not null default '[]'::jsonb;
alter table orders add column if not exists subtotal_ex_gst numeric;
alter table orders add column if not exists gst_amount      numeric;


-- ---------- customers -------------------------------------------------------
-- `suburb`, `state`, `postcode` already exist in schema.sql; the
-- IF NOT EXISTS makes those ALTERs no-ops on a current database. The
-- new fields are:
--   address_line1 / address_line2 — full delivery + invoice address
--   is_business / business_name / abn — flagged on the invoice header
--                                       when the customer is a business
alter table customers add column if not exists address_line1 text;
alter table customers add column if not exists address_line2 text;
alter table customers add column if not exists suburb        text;
alter table customers add column if not exists state         text default 'VIC';
alter table customers add column if not exists postcode      text;
alter table customers add column if not exists is_business   boolean default false;
alter table customers add column if not exists business_name text;
alter table customers add column if not exists abn           text;
