-- =============================================================================
-- SIGNATURE PIANOS — BLOG GENERATION JOBS (async background work)
-- =============================================================================
-- Run ONCE in the Supabase SQL editor, after blog.sql.
--
-- Blog generation (research + write) can take minutes — too long to hold an
-- HTTP request open without the browser/proxy returning a 504. So the API now
-- kicks off the work in the background (Vercel waitUntil) and records progress
-- here. The admin UI polls a job row until it's `done` (or `error`).
--
-- Reads/writes happen via the service role (server-side), which bypasses RLS.
-- Admins may also read their jobs directly if ever needed.
-- Safe to re-run.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS blog_jobs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status      text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'running', 'done', 'error')),
  kind        text NOT NULL DEFAULT 'manual'      -- manual | auto
                CHECK (kind IN ('manual', 'auto')),
  topic       text,
  research    boolean NOT NULL DEFAULT false,
  post_id     uuid REFERENCES blog_posts(id) ON DELETE SET NULL,
  title       text,                               -- filled in when done
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blog_jobs_created ON blog_jobs (created_at DESC);

-- keep updated_at fresh (set_updated_at() created by missing_tables.sql)
DROP TRIGGER IF EXISTS trg_blog_jobs_updated_at ON blog_jobs;
CREATE TRIGGER trg_blog_jobs_updated_at BEFORE UPDATE ON blog_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE blog_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access — blog_jobs" ON blog_jobs;
CREATE POLICY "Admin full access — blog_jobs"
  ON blog_jobs FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
