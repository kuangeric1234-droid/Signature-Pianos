/*
 * Signature Pianos — llms.txt (/llms.txt)
 * ---------------------------------------
 * A plain-text guide for AI crawlers / answer engines: who we are and the
 * key pages + latest articles worth citing. An emerging convention (like
 * robots.txt, but for LLMs). Generated from published posts.
 */

const { supabaseAdmin, SITE_URL } = require('../lib/ai')

module.exports = async (req, res) => {
  let posts = []
  try {
    const { data } = await supabaseAdmin
      .from('blog_posts')
      .select('slug, title, excerpt')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(50)
    posts = data || []
  } catch (err) {
    console.error('[llms] load failed', err)
  }

  const lines = [
    '# Signature Pianos',
    '',
    '> Signature Pianos is a trusted piano retailer in Melbourne, Australia. We sell',
    '> acoustic and digital pianos (Yamaha and other brands), and offer delivery,',
    '> tuning, payment plans, and connections to verified piano teachers.',
    '',
    '## Key pages',
    `- [Browse pianos](${SITE_URL}/instruments.html): New, pre-loved, acoustic and digital pianos.`,
    `- [Find a teacher](${SITE_URL}/teachers.html): Verified piano teachers across Melbourne.`,
    `- [About](${SITE_URL}/about.html): Who we are and how we help.`,
    `- [Blog](${SITE_URL}/blog): Buying guides, piano care, and reviews.`,
    '',
    '## Latest articles',
    ...posts.map((p) => `- [${p.title}](${SITE_URL}/blog/${p.slug}): ${(p.excerpt || '').replace(/\s+/g, ' ').trim()}`),
    '',
  ]

  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
  return res.status(200).send(lines.join('\n'))
}
