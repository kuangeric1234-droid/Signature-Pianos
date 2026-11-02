/*
 * Signature Pianos — sitemap.xml (/sitemap.xml)
 * ---------------------------------------------
 * Lists core pages, every published blog post and every piano on the website
 * so search engines crawl them quickly. Posts come from Supabase, pianos from
 * the office's feed.
 */

const { supabaseAdmin, SITE_URL } = require('../lib/ai')

// The office's address, as js/office-config.js has it: change the two together
const OFFICE_ORIGIN = process.env.OFFICE_ORIGIN || 'https://portal.signaturepianos.com.au'

const xmlEscape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

const STATIC_PATHS = [
  '/', '/instruments/', '/services/book-a-viewing.html', '/services/delivery-warranty.html',
  '/services/tuning-servicing.html', '/serial-number-lookup.html', '/guide', '/teachers.html', '/about.html', '/blog',
  '/privacy', '/piano-rental', '/piano-rental/prices', '/piano-rental/short-term',
  '/piano-rental/yamaha-u1-u3', '/piano-rental/terms',
]

module.exports = async (req, res) => {
  let posts = []
  try {
    const { data } = await supabaseAdmin
      .from('blog_posts')
      .select('slug, updated_at, published_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(1000)
    posts = data || []
  } catch (err) {
    console.error('[sitemap] load failed', err)
  }

  let pianos = []
  try {
    const feed = await fetch(`${OFFICE_ORIGIN}/public/m/stock/pianos`, { headers: { Origin: SITE_URL } })
    if (!feed.ok) throw new Error(`the office answered ${feed.status}`)
    pianos = (await feed.json()).pianos || []
  } catch (err) {
    console.error('[sitemap] pianos load failed', err)
  }

  const urls = [
    ...STATIC_PATHS.map((p) => ({ loc: SITE_URL + p })),
    ...pianos.map((p) => ({ loc: `${SITE_URL}/piano.html?slug=${encodeURIComponent(p.slug)}` })),
    ...posts.map((p) => ({
      loc: `${SITE_URL}/blog/${encodeURIComponent(p.slug)}`,
      lastmod: (p.updated_at || p.published_at || '').slice(0, 10),
    })),
  ]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${xmlEscape(u.loc)}</loc>${u.lastmod ? `<lastmod>${xmlEscape(u.lastmod)}</lastmod>` : ''}</url>`).join('\n')}
</urlset>`

  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
  return res.status(200).send(xml)
}
