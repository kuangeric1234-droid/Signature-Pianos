/*
 * Signature Pianos — public blog index (/blog, /blog?tag=...)
 * -----------------------------------------------------------
 * Server-rendered list of PUBLISHED posts. Crawlable by Google + AI engines.
 * Rendering lives in lib/blog-render.js; this handler only loads rows.
 */

const { supabaseAdmin } = require('../lib/ai')
const { renderIndex } = require('../lib/blog-render')

module.exports = async (req, res) => {
  let posts = []
  try {
    const { data, error } = await supabaseAdmin
      .from('blog_posts')
      .select('slug, title, excerpt, published_at, tags, hero_image_url, author')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(100)
    if (error) throw error
    posts = data || []
  } catch (err) {
    console.error('[blog index] load failed', err)
  }

  const tag = (req.query?.tag || '').toString().trim().slice(0, 60)
  const html = renderIndex(posts, { tag })

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=86400')
  return res.status(200).send(html)
}
