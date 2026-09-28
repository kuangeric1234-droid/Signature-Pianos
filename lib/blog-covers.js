/*
 * Cover images for Journal posts. Every post needs one to be published (the
 * blog_posts_published_needs_image constraint), so both writers, the admin
 * "Generate draft" / auto-writer (lib/blog.js) and the SEO engine
 * (lib/seo-engine.js), attach one when they save a draft.
 *
 * The library is media/blog/covers.json: the site's own photography plus the
 * Unsplash set in media/blog/library (credits in media/blog/CREDITS.md). The
 * admin cover picker reads the same file. `about` is what's in the frame,
 * used to match a photo to a post's title and keywords.
 */

const COVERS = require('../media/blog/covers.json')

const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'in', 'to', 'for', 'is', 'it', 'how', 'what', 'much', 'does', 'do', 'your', 'you', 'vs', 'piano', 'pianos', 'australia', 'melbourne', 'cost', 'need'])
// Lower-cased, singular-ish words, stop words dropped.
const words = (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w)).map((w) => (w.length > 3 ? w.replace(/s$/, '') : w))

// Uploaded covers live in the public blog-images bucket.
function isBucketUrl(url) {
  const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
  return !!base && url.startsWith(`${base}/storage/v1/object/public/blog-images/`)
}

// A cover a writer may set: one from the library or an uploaded one.
function isKnownCover(url) {
  const u = String(url || '').trim()
  return COVERS.some((c) => c.url === u) || isBucketUrl(u)
}

/*
 * pickCover(post, usedUrls) — the library photo that best fits the post's
 * title, keywords and tags, preferring photos no other post uses yet.
 */
function pickCover({ title, keywords, tags } = {}, usedUrls = []) {
  const want = new Set(words([title, ...(keywords || []), ...(tags || [])].join(' ')))
  const used = new Map()
  for (const u of usedUrls) if (u) used.set(u, (used.get(u) || 0) + 1)
  let best = null
  for (const [i, c] of COVERS.entries()) {
    const match = [...new Set(words(c.about))].filter((w) => want.has(w)).length
    // A match outweighs reuse, but an unused photo wins a tie, then list order.
    const score = match * 10 - (used.get(c.url) || 0) * 6 - i * 0.01
    if (!best || score > best.score) best = { url: c.url, score }
  }
  return best.url
}

module.exports = { COVERS, pickCover, isKnownCover }
