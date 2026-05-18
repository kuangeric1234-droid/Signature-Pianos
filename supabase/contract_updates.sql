-- =============================================================================
-- Signature Pianos — countersignature + delivery trigger fields
-- -----------------------------------------------------------------------------
-- Run AFTER supabase/payment_plans_upgrade.sql.
-- Adds the second-party-signature audit columns (Eric countersigning the
-- contract after the customer signs) and the delivery-trigger flag that
-- /api/countersign-contract sets after auto-creating the order +
-- delivery rows for acoustic pianos. Idempotent.
--
-- countersign_url is added (in addition to the user spec) because
-- /api/countersign-contract writes the countersignature PNG path into
-- it — the mirror of contract_url for the customer signature. The user
-- spec mentioned final_contract_url but that's reserved for the future
-- merged-PDF render of both signatures.
-- =============================================================================

alter table payment_plans
  add column if not exists countersigned         boolean default false,
  add column if not exists countersigned_at      timestamptz,
  add column if not exists countersigned_by      text,
  add column if not exists countersign_token     text unique,
  add column if not exists countersign_url       text,
  add column if not exists fully_executed        boolean default false,
  add column if not exists fully_executed_at     timestamptz,
  add column if not exists final_contract_url    text,
  add column if not exists delivery_triggered    boolean default false,
  add column if not exists delivery_triggered_at timestamptz;

-- Backfill countersign tokens for every existing plan that doesn't have
-- one. New rows get a token at insert time from /api/sign-contract
-- (the customer-sign endpoint mints one if missing).
update payment_plans
set countersign_token =
      md5(random()::text || id::text || 'countersign')
where countersign_token is null;
