/*
 * Signature Pianos · the pages that show pianos (/, /pianos/, /pianos/<slug> and the 404)
 * ------------------------------------------------------------------------------------
 * vercel.json rewrites those addresses here (?page=home|collection|piano|404, ?slug=,
 * ?cat=). Each is rendered with every word in the HTML from the office's feed
 * (lib/site/feed.js, lib/site/render.js), so search engines read the pianos, their
 * prices and their Product data without running any script.
 *
 * The CDN keeps a page for five minutes and serves the kept one while it fetches a
 * fresh one, so a price the office changes shows within minutes. A page made while
 * the office couldn't be read is kept for 30 seconds only.
 */

const feed = require('../lib/site/feed')
const render = require('../lib/site/render')

const CATS = { uprights: 1, grands: 1, yamaha: 1, kawai: 1 }

function send(res, status, html, { fresh = true } = {}) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', fresh ? 's-maxage=300, stale-while-revalidate=86400' : 's-maxage=30, stale-while-revalidate=60')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  return res.status(status).send(html)
}

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    return res.status(405).send('Method not allowed')
  }
  const q = req.query || {}
  const page = String(q.page || 'home')
  const list = await feed.pianos()
  const F = render.stock(list)
  const ok = Array.isArray(list)

  try {
    if (page === 'home') return send(res, 200, render.home(F), { fresh: ok })

    if (page === 'collection') {
      const cat = String(q.cat || '')
      if (cat && !CATS[cat]) return send(res, 404, render.notFound(F), { fresh: ok })
      return send(res, 200, render.collection(F, cat), { fresh: ok })
    }

    if (page === 'piano') {
      const slug = String(q.slug || '')
      // the collection's four pages share the address pattern
      if (CATS[slug]) return send(res, 200, render.collection(F, slug), { fresh: ok })
      if (!feed.isSlug(slug)) return send(res, 404, render.notFound(F), { fresh: ok })
      if (!ok) return send(res, 503, render.unavailable(), { fresh: false })
      const p = F.ps.find((x) => x.slug === slug)
      if (!p) return send(res, 404, render.notFound(F))
      return send(res, 200, render.piano(F, p))
    }

    return send(res, 404, render.notFound(F), { fresh: ok })
  } catch (err) {
    console.error('[site] render failed', page, err)
    res.setHeader('Cache-Control', 'no-store')
    return res.status(500).send('Sorry, this page could not be shown. Please call us on 0479 128 955.')
  }
}
