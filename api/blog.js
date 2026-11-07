/*
 * Signature Pianos — public blog index (/blog, /blog?tag=...)
 * -----------------------------------------------------------
 * Server-rendered list of PUBLISHED posts. Crawlable by Google + AI engines.
 * Rendering lives in lib/blog-render.js; the posts come from
 * lib/journal-source.js (the old tables until the move, then the office).
 */

const { published } = require('../lib/journal-source')
const { renderIndex } = require('../lib/blog-render')

module.exports = async (req, res) => {
  let posts = []
  let failed = false
  let short = false
  try {
    ;({ posts, short } = await published(100))
  } catch (err) {
    console.error('[blog index] load failed', err)
    failed = true
  }

  const tag = (req.query?.tag || '').toString().trim().slice(0, 60)
  const html = renderIndex(posts, { tag })

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  // A failed load renders the empty journal: never let the CDN keep that. A cover signed for
  // five minutes (not yet at its lasting address) keeps the page a minute at most.
  res.setHeader('Cache-Control', failed ? 'no-store' : short ? 's-maxage=60' : 's-maxage=600, stale-while-revalidate=86400')
  return res.status(failed ? 503 : 200).send(html)
}
