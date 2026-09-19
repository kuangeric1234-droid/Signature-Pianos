-- =============================================================================
-- SIGNATURE PIANOS — LEADS (buyer's guide requests and future lead magnets)
-- =============================================================================
-- Run in the Supabase SQL editor after missing_tables.sql (it needs
-- set_updated_at() and is_admin()). Safe to re-run: every object is created
-- idempotently.
--
-- One row per person per source. The first request inserts the row; a repeat
-- request from the same email for the same source updates it and bumps
-- request_count, so the CRM never fills with duplicates.
--
-- Written only by /api/buyer-guide with the service role (which bypasses RLS).
-- There is deliberately no anon policy: the public form never touches this
-- table directly. Admins read and update it from admin/enquiries.html
-- ("Buyer's guide" tab).
--
-- status is the sales follow-up: new -> contacted -> visited -> purchased,
-- or closed. email_status records whether the guide email went out.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS leads (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source             text NOT NULL DEFAULT 'buyer_guide',   -- which form or offer they came through
  first_name         text NOT NULL,
  last_name          text,
  email              text NOT NULL,                         -- stored lower-case
  phone              text,
  consent            boolean NOT NULL DEFAULT false,        -- agreed to the privacy policy and to receive the guide
  consent_text       text,                                  -- the wording they agreed to, as shown on the form
  consent_at         timestamptz,
  status             text NOT NULL DEFAULT 'new'
                       CHECK (status IN ('new', 'contacted', 'visited', 'purchased', 'closed')),
  notes              text,
  request_count      integer NOT NULL DEFAULT 1,
  last_requested_at  timestamptz NOT NULL DEFAULT now(),
  email_status       text NOT NULL DEFAULT 'pending'
                       CHECK (email_status IN ('pending', 'sent', 'failed')),
  email_sent_at      timestamptz,
  email_error        text,
  resend_id          text,                                  -- Resend message id, for tracing delivery
  source_page        text,                                  -- page the form was on
  utm                jsonb NOT NULL DEFAULT '{}'::jsonb,    -- utm_source, utm_medium, utm_campaign ... if present
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- one row per email per source (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_email_source ON leads (lower(email), source);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads (status, last_requested_at DESC);

DROP TRIGGER IF EXISTS trg_leads_updated_at ON leads;
CREATE TRIGGER trg_leads_updated_at BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----- RLS: admins only (the API uses the service role, which bypasses RLS)
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access — leads" ON leads;
CREATE POLICY "Admin full access — leads"
  ON leads FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
