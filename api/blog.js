/*
 * Signature Pianos — public blog index (/blog)
 * --------------------------------------------
 * Server-rendered list of PUBLISHED posts. Crawlable by Google + AI engines.
 */

const { supabaseAdmin, SITE_URL } = require('../lib/ai')
const { shell, esc, fmtDate } = require('../lib/blog-render')

module.exports = async (req, res) => {
  let posts = []
  try {
    const { data } = await supabaseAdmin
      .from('blog_posts')
      .select('slug, title, excerpt, published_at, tags')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(100)
    posts = data || []
  } catch (err) {
    console.error('[blog index] load failed', err)
  }

  const cards = posts.length
    ? posts.map((p) => `
      <a class="card" href="/blog/${esc(p.slug)}">
        <h2>${esc(p.title)}</h2>
        <p>${esc(p.excerpt || '')}</p>
        <div class="meta">${fmtDate(p.published_at)}</div>
      </a>`).join('')
    : `<div class="empty">No articles published yet — check back soon.</div>`

  const body = `
  <main class="wrap">
    <h1>The Signature Pianos Journal</h1>
    <p class="meta">Buying guides, piano care, and the instruments we love — for Melbourne players.</p>
    ${cards}
  </main>`

  const html = shell({
    title: 'Blog — Signature Pianos Melbourne',
    description: 'Piano buying guides, care tips and reviews from Signature Pianos, Melbourne. Yamaha, digital pianos and more.',
    canonical: `${SITE_URL}/blog`,
    body,
  })

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=86400')
  return res.status(200).send(html)
}
