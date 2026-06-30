/*
 * Signature Pianos — sitemap.xml (/sitemap.xml)
 * ---------------------------------------------
 * Lists core pages + every published blog post so search engines crawl new
 * articles quickly. Served dynamically from Supabase.
 */

const { supabaseAdmin, SITE_URL } = require('../lib/ai')

const STATIC_PATHS = ['/', '/instruments.html', '/teachers.html', '/about.html', '/blog']

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

  const urls = [
    ...STATIC_PATHS.map((p) => ({ loc: SITE_URL + p })),
    ...posts.map((p) => ({
      loc: `${SITE_URL}/blog/${p.slug}`,
      lastmod: (p.updated_at || p.published_at || '').slice(0, 10),
    })),
  ]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')}
</urlset>`

  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
  return res.status(200).send(xml)
}
