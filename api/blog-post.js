/*
 * Signature Pianos — public blog post (/blog/:slug)
 * -------------------------------------------------
 * Server-rendered single article with full SEO meta + JSON-LD (BlogPosting
 * and FAQPage) so both Google and AI answer engines can parse and cite it.
 * Only PUBLISHED posts are served; anything else 404s.
 */

const { supabaseAdmin, SITE_URL } = require('../lib/ai')
const { shell, esc, fmtDate } = require('../lib/blog-render')

module.exports = async (req, res) => {
  const slug = (req.query?.slug || '').toString().trim()
  if (!slug) return notFound(res)

  let post
  try {
    const { data } = await supabaseAdmin
      .from('blog_posts')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle()
    post = data
  } catch (err) {
    console.error('[blog post] load failed', err)
  }
  if (!post) return notFound(res)

  const url = `${SITE_URL}/blog/${esc(post.slug)}`
  const faq = Array.isArray(post.faq) ? post.faq : []

  const tagsHtml = (post.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')

  const faqHtml = faq.length ? `
    <section class="faq">
      <h2>Frequently asked questions</h2>
      ${faq.map((f) => `
        <details>
          <summary>${esc(f.question)}</summary>
          <p>${esc(f.answer)}</p>
        </details>`).join('')}
    </section>` : ''

  // JSON-LD: BlogPosting + FAQPage (AEO). Use JSON.stringify so content is
  // safely escaped inside the script tag.
  const blogLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.meta_description || post.excerpt || '',
    datePublished: post.published_at,
    dateModified: post.updated_at || post.published_at,
    author: { '@type': 'Organization', name: post.author || 'Signature Pianos' },
    publisher: {
      '@type': 'Organization',
      name: 'Signature Pianos',
      url: SITE_URL,
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    keywords: (post.keywords || []).join(', '),
  }
  const faqLd = faq.length ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  } : null

  const headExtra = [
    `<script type="application/ld+json">${jsonLd(blogLd)}</script>`,
    faqLd ? `<script type="application/ld+json">${jsonLd(faqLd)}</script>` : '',
    `<meta property="article:published_time" content="${esc(post.published_at)}" />`,
  ].join('\n')

  const body = `
  <main class="wrap article">
    <a class="back" href="/blog">← All articles</a>
    <h1>${esc(post.title)}</h1>
    <div class="meta">${fmtDate(post.published_at)}${post.author ? ' · ' + esc(post.author) : ''}</div>
    ${post.body_html || ''}
    <div style="margin-top:36px;">${tagsHtml}</div>
    ${faqHtml}
  </main>`

  const html = shell({
    title: `${post.title} — Signature Pianos`,
    description: post.meta_description || post.excerpt || '',
    canonical: url,
    headExtra,
    body,
  })

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=86400')
  return res.status(200).send(html)
}

// Escape '</' so a string in the data can't break out of the <script> tag.
function jsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c')
}

function notFound(res) {
  const html = shell({
    title: 'Not found — Signature Pianos',
    description: '',
    canonical: `${SITE_URL}/blog`,
    body: `<main class="wrap"><h1>Article not found</h1><p class="meta">This article may have moved. <a href="/blog">Browse the blog →</a></p></main>`,
  })
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  return res.status(404).send(html)
}
