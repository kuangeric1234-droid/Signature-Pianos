-- =============================================================================
-- SIGNATURE PIANOS — BLOG + MARKETING (AI content engine)
-- =============================================================================
-- Run ONCE in the Supabase SQL editor (project ernwymzmwhscsjgrnouv), after
-- missing_tables.sql (it needs the is_admin() helper).
--
-- Creates:
--   blog_posts     — SEO/AEO-optimised articles. Drafts written by the AI
--                    engine; admins review + publish. Public reads see only
--                    published rows.
--   content_audits — saved website audit reports (SEO + AI-search readiness).
--   blog_topics    — a lightweight memory of topics already covered, so the
--                    auto-loop doesn't repeat itself.
--
-- Safe to re-run (IF NOT EXISTS + DROP POLICY IF EXISTS throughout).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----- blog_posts ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blog_posts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             text NOT NULL UNIQUE,
  title            text NOT NULL,
  meta_description text,
  excerpt          text,
  body_html        text,                       -- the article body (h2/h3/p/ul...)
  tags             text[] NOT NULL DEFAULT '{}',
  keywords         text[] NOT NULL DEFAULT '{}',
  faq              jsonb  NOT NULL DEFAULT '[]'::jsonb,  -- [{question, answer}] → FAQ schema
  hero_image_url   text,
  author           text NOT NULL DEFAULT 'Signature Pianos',
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  source           text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'auto')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  published_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_status_pub ON blog_posts (status, published_at DESC);

-- ----- content_audits --------------------------------------------------------
CREATE TABLE IF NOT EXISTS content_audits (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url         text NOT NULL,
  result      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ----- blog_topics (auto-loop memory) ---------------------------------------
CREATE TABLE IF NOT EXISTS blog_topics (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ----- keep updated_at fresh -------------------------------------------------
-- set_updated_at() is created by missing_tables.sql; reuse it.
DROP TRIGGER IF EXISTS trg_blog_updated_at ON blog_posts;
CREATE TRIGGER trg_blog_updated_at BEFORE UPDATE ON blog_posts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- RLS
-- =============================================================================
ALTER TABLE blog_posts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_topics    ENABLE ROW LEVEL SECURITY;

-- Anyone may read PUBLISHED posts (anon + authenticated). Server-side rendering
-- uses the service role and bypasses RLS anyway, but this lets the public site
-- read directly if ever needed.
DROP POLICY IF EXISTS "Public can read published posts" ON blog_posts;
CREATE POLICY "Public can read published posts"
  ON blog_posts FOR SELECT
  TO anon, authenticated
  USING (status = 'published');

-- Admins: full access to everything.
DROP POLICY IF EXISTS "Admin full access — blog_posts" ON blog_posts;
CREATE POLICY "Admin full access — blog_posts"
  ON blog_posts FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admin full access — content_audits" ON content_audits;
CREATE POLICY "Admin full access — content_audits"
  ON content_audits FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admin full access — blog_topics" ON blog_topics;
CREATE POLICY "Admin full access — blog_topics"
  ON blog_topics FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
