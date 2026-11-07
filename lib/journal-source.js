/*
 * Signature Pianos · where the Journal's published posts are read from
 * ---------------------------------------------------------------------
 * /blog, /blog/:slug, /sitemap.xml and /llms.txt read the published posts
 * through here (office step S7.5). Until the move (Eric, 7 Nov 2026: "the seo
 * engine runs from this now portal") they come from the old Supabase tables;
 * once the office holds them, from the office's public Journal reads:
 *
 *   GET <office>/public/m/journal/posts          the newest 100, for /blog
 *   GET <office>/public/m/journal/post?slug=<a>  one, whole, or a 404
 *   GET <office>/public/m/journal/sitemap        each post's address and last change
 *   GET <office>/public/m/journal/llms           the newest 50's titles and excerpts
 *
 * JOURNAL_SOURCE ('office' or 'supabase') picks; FROM below is the default.
 *
 * Either way a post reaches lib/blog-render.js in the old row's shape (slug,
 * title, excerpt, body_html, tags, keywords, faq [{ question, answer }],
 * hero_image_url, author, meta_description, published_at, updated_at), so the
 * renderer is unchanged. From the office: only the fields named here, its body
 * as the office's cleanBody gives it, and a cover only at the office's own
 * /public/shown or /public/file address (lib/site/feed.js photoUrl). A cover
 * the office signs for five minutes (not yet shown at its lasting address)
 * makes the page `short`, so it's cached for a minute, not ten.
 */

const { OFFICE_ORIGIN, SITE, isSlug, photoUrl } = require('./site/feed')

// the move into the office (S8.7): 'supabase' until every post answered from the office, then 'office'
const FROM = 'office'
const from = () => (process.env.JOURNAL_SOURCE === 'office' || process.env.JOURNAL_SOURCE === 'supabase' ? process.env.JOURNAL_SOURCE : FROM)

class Unavailable extends Error {}

const text = (v) => (typeof v === 'string' && v.trim() ? v : null)
const words = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : [])
const when = (v) => (typeof v === 'string' && !isNaN(Date.parse(v)) ? v : null)

/* ---------- the office ---------- */

async function office(path) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(OFFICE_ORIGIN + '/public/m/journal/' + path, { headers: { Origin: SITE, Accept: 'application/json' }, signal: ctrl.signal, redirect: 'error' })
    const body = await res.json().catch(() => null)
    return { status: res.status, ok: res.ok, body }
  } catch (err) {
    throw new Unavailable(`the office's Journal could not be read (${path}): ${err.message}`)
  } finally {
    clearTimeout(timer)
  }
}

/** a post from the office in the old row's shape: the fields named here and no other; null where it isn't one */
function shaped(p, whole) {
  if (!p || typeof p !== 'object' || !isSlug(p.slug) || !text(p.title) || !when(p.published_at)) return null
  const cover = p.cover && typeof p.cover === 'object' ? photoUrl(p.cover.url) : null
  const row = {
    slug: p.slug,
    title: p.title.trim(),
    excerpt: text(p.excerpt),
    tags: words(p.tags),
    author: text(p.author),
    published_at: p.published_at,
    updated_at: when(p.updated_at) || p.published_at,
    hero_image_url: cover,
  }
  if (whole) {
    row.meta_description = text(p.meta_description)
    row.keywords = words(p.keywords)
    row.body_html = typeof p.body_html === 'string' ? p.body_html : ''
    row.faq = (Array.isArray(p.faq) ? p.faq : [])
      .filter((f) => f && text(f.question) && text(f.answer))
      .map((f) => ({ question: f.question.trim(), answer: f.answer.trim() }))
  }
  return row
}
const signed = (p) => !!(p && p.cover && typeof p.cover === 'object' && p.cover.expires_at)

/* ---------- the old Supabase tables (until the move) ---------- */

function supabase() {
  return require('./ai').supabaseAdmin
}

/* ---------- what the pages read ---------- */

/** the published posts, newest first: { posts, short } */
async function published(limit = 100) {
  if (from() === 'office') {
    const r = await office('posts')
    if (!r.ok || !r.body || !Array.isArray(r.body.posts)) throw new Unavailable(`the office's Journal answered ${r.status} for its posts`)
    const posts = r.body.posts.map((p) => shaped(p, false)).filter(Boolean).slice(0, limit)
    return { posts, short: r.body.posts.some(signed) }
  }
  const { data, error } = await supabase()
    .from('blog_posts')
    .select('slug, title, excerpt, published_at, updated_at, tags, hero_image_url, author')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(limit)
  if (error) throw new Unavailable(error.message)
  return { posts: data || [], short: false }
}

/** one published post, whole: { post: row or null, short } */
async function post(slug) {
  if (!isSlug(slug)) return { post: null, short: false }
  if (from() === 'office') {
    const r = await office('post?slug=' + encodeURIComponent(slug))
    if (r.status === 404) return { post: null, short: false }
    if (!r.ok || !r.body || !r.body.post) throw new Unavailable(`the office's Journal answered ${r.status} for /blog/${slug}`)
    return { post: shaped(r.body.post, true), short: signed(r.body.post) }
  }
  const { data, error } = await supabase()
    .from('blog_posts')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()
  if (error) throw new Unavailable(error.message)
  return { post: data || null, short: false }
}

/** each published post's address and when it last changed, for the sitemap: [{ slug, updated_at, published_at }] */
async function sitemapEntries() {
  if (from() === 'office') {
    const r = await office('sitemap')
    if (!r.ok || !r.body || !Array.isArray(r.body.entries)) throw new Unavailable(`the office's Journal answered ${r.status} for its sitemap`)
    return r.body.entries
      .filter((e) => e && isSlug(e.slug) && when(e.lastmod))
      .map((e) => ({ slug: e.slug, updated_at: e.lastmod, published_at: e.lastmod }))
  }
  const { data, error } = await supabase()
    .from('blog_posts')
    .select('slug, updated_at, published_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(1000)
  if (error) throw new Unavailable(error.message)
  return data || []
}

/** the newest 50 posts' address, title and excerpt, for llms.txt */
async function llmsArticles() {
  if (from() === 'office') {
    const r = await office('llms')
    if (!r.ok || !r.body || !Array.isArray(r.body.articles)) throw new Unavailable(`the office's Journal answered ${r.status} for llms`)
    return r.body.articles
      .filter((a) => a && isSlug(a.slug) && text(a.title))
      .map((a) => ({ slug: a.slug, title: a.title.trim(), excerpt: text(a.excerpt) }))
  }
  const { data, error } = await supabase()
    .from('blog_posts')
    .select('slug, title, excerpt')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(50)
  if (error) throw new Unavailable(error.message)
  return data || []
}

module.exports = { from, published, post, sitemapEntries, llmsArticles, Unavailable, shaped }
