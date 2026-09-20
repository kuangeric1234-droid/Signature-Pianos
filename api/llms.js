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
  let failed = false
  try {
    const { data, error } = await supabaseAdmin
      .from('blog_posts')
      .select('slug, title, excerpt')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(50)
    if (error) throw error
    posts = data || []
  } catch (err) {
    console.error('[llms] load failed', err)
    failed = true
  }

  const lines = [
    '# Signature Pianos',
    '',
    '> Signature Pianos sells pre-loved Yamaha and Kawai pianos, hand-picked in Japan',
    '> and checked in Melbourne, from a showroom at 63 Blackburn Road, Mount Waverley VIC.',
    '> Every piano carries the Signature Pianos 10-year warranty, with white-glove',
    '> delivery and the first tuning included. Piano teachers are listed through',
    '> TeachMusic, our sister platform.',
    '',
    '## Key pages',
    `- [Browse pianos](${SITE_URL}/instruments/): Pre-loved Japanese upright and grand pianos in stock.`,
    `- [Book a visit](${SITE_URL}/services/book-a-viewing.html): Play the pianos in the Mount Waverley showroom.`,
    `- [Delivery and warranty](${SITE_URL}/services/delivery-warranty.html): White-glove delivery and the 10-year warranty.`,
    `- [Tuning and servicing](${SITE_URL}/services/tuning-servicing.html): Tuning and care for pianos across Melbourne.`,
    `- [How old is my piano?](${SITE_URL}/serial-number-lookup.html): Yamaha and Kawai serial number lookup, from the makers' own charts.`,
    `- [Find a teacher](${SITE_URL}/teachers.html): Piano teachers across Melbourne, via TeachMusic.`,
    `- [About](${SITE_URL}/about.html): Who we are and how we help.`,
    `- [Blog](${SITE_URL}/blog): Buying advice and piano care from the showroom.`,
    '',
    '## Latest articles',
    ...posts.filter((p) => p.slug && p.title).map((p) =>
      `- [${mdText(p.title)}](${SITE_URL}/blog/${encodeURIComponent(p.slug)}): ${oneLine(p.excerpt)}`),
    '',
  ]

  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  // Without the articles (load failed), serve it but don't let the CDN keep it.
  res.setHeader('Cache-Control', failed ? 'no-store' : 's-maxage=3600, stale-while-revalidate=86400')
  return res.status(200).send(lines.join('\n'))
}

// One line of plain text (a stray newline would start a new Markdown block).
function oneLine(s) {
  return String(s || '').replace(/\s+/g, ' ').trim()
}

// Link text: brackets would end the [text](url) early.
function mdText(s) {
  return oneLine(s).replace(/([[\]\\])/g, '\\$1')
}
