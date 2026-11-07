/*
 * Signature Pianos — public blog post (/blog/:slug)
 * -------------------------------------------------
 * Server-rendered single article with full SEO meta + JSON-LD (BlogPosting,
 * BreadcrumbList and FAQPage) so both Google and AI answer engines can parse
 * and cite it. Only PUBLISHED posts are served; anything else 404s.
 * Rendering lives in lib/blog-render.js; the posts come from
 * lib/journal-source.js (the old tables until the move, then the office).
 */

const { post: readPost, published } = require('../lib/journal-source')
const { renderPost, renderNotFound, pickRelated } = require('../lib/blog-render')

module.exports = async (req, res) => {
  const slug = (req.query?.slug || '').toString().trim()
  if (!slug) return notFound(res)

  let post
  let short = false
  try {
    ;({ post, short } = await readPost(slug))
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
    const list = await published(25)
    related = pickRelated(post, list.posts.filter((p) => p.slug !== post.slug).slice(0, 24), 3)
    short = short || list.short
  } catch (err) {
    console.error('[blog post] related failed', err)
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  // A cover signed for five minutes (not yet at its lasting address) keeps the page a minute at most.
  res.setHeader('Cache-Control', short ? 's-maxage=60' : 's-maxage=600, stale-while-revalidate=86400')
  return res.status(200).send(renderPost(post, related))
}

function notFound(res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  return res.status(404).send(renderNotFound())
}
