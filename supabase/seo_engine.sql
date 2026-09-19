-- =============================================================================
-- SIGNATURE PIANOS — SEO ENGINE (the every-second-day cloud routine)
-- =============================================================================
-- Run after blog.sql and blog_topic_plan.sql. Safe to re-run.
--
-- The engine is a Claude Code routine that runs /seo-engine every second day
-- (.claude/skills/seo-engine/SKILL.md). It reaches the database only through
-- /api/seo-engine (lib/seo-engine.js), never with a service key of its own.
--
-- blog_post_seo    one row per post: the engine's bookkeeping. Kept OFF
--                  blog_posts on purpose: blog_posts.updated_at drives the
--                  public dateModified and the sitemap lastmod, so writing a
--                  recheck date or a proposed update there would tell Google
--                  an article changed when it hadn't.
-- seo_engine_runs  one row per run: what it did and why. The engine reads it
--                  to choose the next job (monthly review due? reminder
--                  already sent?) and the admin shows it on Marketing.
-- blog_topic_queue gains a SERP verdict, so a topic is checked against what
--                  actually ranks before anyone writes it.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----- blog_post_seo ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS blog_post_seo (
  post_id          uuid PRIMARY KEY REFERENCES blog_posts(id) ON DELETE CASCADE,
  primary_keyword  text,
  reverify_by      date,           -- recheck the dated claims by this date
  reverify_notes   text,           -- which claims, and where they came from
  research_notes   text,           -- what ranks, sources checked: for the editor
  last_checked_at  timestamptz,
  proposed_update  jsonb,          -- {title, meta_description, excerpt, body_html, faq, notes, reverify_by, reverify_notes, proposed_at}
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_blog_post_seo_updated_at ON blog_post_seo;
CREATE TRIGGER trg_blog_post_seo_updated_at BEFORE UPDATE ON blog_post_seo
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----- seo_engine_runs -------------------------------------------------------
CREATE TABLE IF NOT EXISTS seo_engine_runs (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at    timestamptz NOT NULL DEFAULT now(),
  action    text NOT NULL CHECK (action IN
              ('setup', 'draft', 'refresh', 'checked', 'queue', 'review', 'ping', 'error')),
  summary   text NOT NULL,
  post_id   uuid REFERENCES blog_posts(id) ON DELETE SET NULL,
  topic_id  uuid REFERENCES blog_topic_queue(id) ON DELETE SET NULL,
  emailed   boolean NOT NULL DEFAULT false,
  details   jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_seo_engine_runs_ran_at ON seo_engine_runs (ran_at DESC);

-- ----- blog_topic_queue: SERP verdict ----------------------------------------
ALTER TABLE blog_topic_queue ADD COLUMN IF NOT EXISTS serp_verdict text;
ALTER TABLE blog_topic_queue ADD COLUMN IF NOT EXISTS serp_checked_at timestamptz;
ALTER TABLE blog_topic_queue ADD COLUMN IF NOT EXISTS serp_notes text;

ALTER TABLE blog_topic_queue DROP CONSTRAINT IF EXISTS blog_topic_queue_serp_verdict_check;
ALTER TABLE blog_topic_queue ADD CONSTRAINT blog_topic_queue_serp_verdict_check
  CHECK (serp_verdict IS NULL OR serp_verdict IN
    ('open', 'weakly-occupied', 'contested', 'crowded', 'mismatch'));

-- ----- RLS: admins only (the API uses the service role, which bypasses RLS)
ALTER TABLE blog_post_seo   ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_engine_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access — blog_post_seo" ON blog_post_seo;
CREATE POLICY "Admin full access — blog_post_seo"
  ON blog_post_seo FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admin full access — seo_engine_runs" ON seo_engine_runs;
CREATE POLICY "Admin full access — seo_engine_runs"
  ON seo_engine_runs FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- =============================================================================
-- Backfill
-- =============================================================================
-- Every existing post gets a bookkeeping row. The primary keyword comes from
-- the queue topic that produced the post, else its first keyword. Published
-- posts get their first recheck six months after publishing.
INSERT INTO blog_post_seo (post_id, primary_keyword, reverify_by, reverify_notes)
SELECT p.id,
       COALESCE(q.primary_keyword, p.keywords[1]),
       CASE WHEN p.status = 'published'
            THEN (COALESCE(p.published_at, p.created_at) + interval '6 months')::date END,
       CASE WHEN p.status = 'published'
            THEN 'First engine check: every dated price, rule and source link.' END
FROM blog_posts p
LEFT JOIN blog_topic_queue q ON q.post_id = p.id
ON CONFLICT (post_id) DO NOTHING;

-- The install marker counts as this month's review, so the first monthly
-- review lands next month rather than on day one.
INSERT INTO seo_engine_runs (action, summary)
SELECT 'setup', 'SEO engine installed. Runs every second day; nothing publishes without Eric.'
WHERE NOT EXISTS (SELECT 1 FROM seo_engine_runs WHERE action = 'setup');

NOTIFY pgrst, 'reload schema';
