-- =============================================================================
-- SIGNATURE PIANOS — TEACHER ONBOARDING & VERIFICATION
-- =============================================================================
-- Run ONCE in the Supabase SQL editor, after schema.sql.
--
-- Adds a real verification workflow to `teachers` (the schema previously only
-- had a binary `verified` boolean):
--   • verification_status  — pending / approved / rejected (with notes)
--   • Working With Children Check (WWCC) capture — legally required in Victoria
--     for anyone teaching minors. A teacher of children may not go live without
--     a sighted, verified WWCC (enforced in the admin UI).
--   • agreement_accepted_at — when the teacher accepted the terms/commission.
--
-- The legacy `verified` boolean is kept in sync via trigger so existing reads
-- (public directory, admin table) keep working unchanged.
-- Safe to re-run.
-- =============================================================================

ALTER TABLE teachers ADD COLUMN IF NOT EXISTS verification_status   text NOT NULL DEFAULT 'pending';
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS verification_notes    text;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS wwcc_number           text;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS wwcc_expiry           date;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS wwcc_document_url     text;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS wwcc_verified         boolean NOT NULL DEFAULT false;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS agreement_accepted_at timestamptz;

-- Constrain the status to known values (named so the DO block is idempotent).
DO $$ BEGIN
  ALTER TABLE teachers ADD CONSTRAINT teachers_verification_status_chk
    CHECK (verification_status IN ('pending', 'approved', 'rejected'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill status from the legacy boolean for any existing rows.
UPDATE teachers SET verification_status = 'approved'
  WHERE verified = true AND verification_status <> 'approved';

-- Keep `verified` mirroring verification_status so the public directory
-- ("read verified teachers") and existing admin code need no changes.
CREATE OR REPLACE FUNCTION sync_teacher_verified() RETURNS trigger AS $$
BEGIN
  NEW.verified := (NEW.verification_status = 'approved');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_teacher_verified ON teachers;
CREATE TRIGGER trg_sync_teacher_verified BEFORE INSERT OR UPDATE ON teachers
  FOR EACH ROW EXECUTE FUNCTION sync_teacher_verified();

CREATE INDEX IF NOT EXISTS idx_teachers_verification_status ON teachers(verification_status);
