/*
 * Signature Pianos — public blog post (/blog/:slug)
 * -------------------------------------------------
 * Server-rendered single article with full SEO meta + JSON-LD (BlogPosting,
 * BreadcrumbList and FAQPage) so both Google and AI answer engines can parse
 * and cite it. Only PUBLISHED posts are served; anything else 404s.
 * Rendering lives in lib/blog-render.js; this handler only loads rows.
 */

const { supabaseAdmin } = require('../lib/ai')
const { renderPost, renderNotFound, pickRelated } = require('../lib/blog-render')

module.exports = async (req, res) => {
  const slug = (req.query?.slug || '').toString().trim()
  if (!slug) return notFound(res)

  let post
  try {
    const { data, error } = await supabaseAdmin
      .from('blog_posts')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle()
    if (error) throw error
    post = data
  } catch (err) {
    // A database hiccup is not a missing article: don't tell crawlers it's gone.
    console.error('[blog post] load failed', err)
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Retry-After', '120')
    return res.status(503).send('The journal is briefly unavailable. Please try again in a minute.')
  }
  if (!post) return notFound(res)

  // Related: recent published posts, ranked by shared tags in pickRelated().
  let related = []
  try {
    const { data } = await supabaseAdmin
      .from('blog_posts')
      .select('slug, title, excerpt, published_at, tags, hero_image_url')
      .eq('status', 'published')
      .neq('slug', post.slug)
      .order('published_at', { ascending: false })
      .limit(24)
    related = pickRelated(post, data || [], 3)
  } catch (err) {
    console.error('[blog post] related failed', err)
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=86400')
  return res.status(200).send(renderPost(post, related))
}

function notFound(res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  return res.status(404).send(renderNotFound())
}
