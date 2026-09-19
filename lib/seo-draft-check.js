/*
 * Signature Pianos — SEO engine draft checker
 * -------------------------------------------
 * Mechanical pre-flight for an engine draft (or a proposed update to a
 * published post) BEFORE Eric reads it. Mirrors the FORMAT and claims rules
 * in lib/blog.js WRITING_RULES, so what reaches Eric needs his judgment, not
 * a rules pass. Pure function, no I/O: lib/seo-engine.js hands it the posts
 * that already exist.
 *
 *   checkDraft(draft, { posts, topic, partial, selfSlug })
 *     -> { failures, warnings, stats }
 *
 * failures block the save; warnings are for the writer to weigh. partial is
 * for a proposed update, where only the changed fields are present.
 * Never relax a rule here to let a draft through: fix the draft.
 */

const ALLOWED_TAGS = new Set([
  'h2', 'h3', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'a', 'blockquote',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
])
const ALLOWED_POST_TAGS = ['Buying guide', 'Yamaha', 'Kawai', 'Grand pianos', 'Piano care', 'Melbourne', 'Lessons']
// Our pages an article may link to (lib/blog.js FORMAT), plus published Journal posts.
const ALLOWED_PATHS = [
  '/instruments/', '/services/book-a-viewing.html', '/services/delivery-warranty.html',
  '/services/tuning-servicing.html', '/teachers.html', '/about.html', '/serial-number-lookup.html',
]
const BOOK_PATH = '/services/book-a-viewing.html'
// Searches our own site pages already answer. An article on one of these
// competes with the page; improve the page instead. Add pages as they launch.
const SITE_PAGES = [
  { slug: '/serial-number-lookup.html', title: 'Serial number lookup (tool page)', status: 'page', primary_keyword: 'yamaha piano serial number lookup' },
  { slug: '/serial-number-lookup.html', title: 'Serial number lookup (tool page)', status: 'page', primary_keyword: 'kawai piano serial number lookup' },
  { slug: '/serial-number-lookup.html', title: 'Serial number lookup (tool page)', status: 'page', primary_keyword: 'how old is my piano' },
]

const BANNED = ['best', 'world-class', 'unbeatable', 'stunning', 'amazing', 'cheap', 'bargain', 'buy now']
const US_SPELLINGS = ['color', 'colors', 'colored', 'center', 'centers', 'favorite', 'favorites', 'organize', 'organized', 'gray', 'jewelry', 'catalog']
// Only the four promises exist (white-glove delivery, the Signature Pianos
// warranty, first tuning included, portal-tracked delivery). These words
// usually mean a fifth has crept in; ACL "consumer guarantees" is the one
// legitimate use of "guarantee", so these warn rather than fail.
const PROMISE_WORDS = ['free delivery', 'price match', 'price-match', 'trade-in', 'trade in', 'finance', 'financing', 'interest-free', 'interest free', 'guarantee', 'guaranteed', 'turnaround']
const RISKY_CLAIMS = [
  'humidity-proof', 'humidity proof', 'risk-free', 'risk free', 'seasoned for australia', '100% legal', 'illegal',
  'one owner', 'one-owner', 'never a school piano', 'ivory', 'german strings', 'cfx hammers', 'vetted', 'verified teacher',
  'in stock', 'on our floor', 'we currently have', 'our current stock',
]
const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December'

// Words in nearly every piano query: no signal when two keywords share them.
const STOPWORDS = new Set(['a', 'an', 'and', 'do', 'does', 'for', 'how', 'i', 'in', 'is', 'my', 'of', 'or', 'should', 'the', 'to', 'what', 'when', 'which', 'with', 'you', 'your', 'vs', 'much', 'can'])
const UNIVERSAL = new Set(['piano', 'pianos', 'melbourne', 'australia', 'australian', 'buy', 'buying', 'guide'])

function stripComments(html) {
  return String(html || '').replace(/<!--[\s\S]*?-->/g, '')
}

function textOf(html) {
  return stripComments(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function words(s) {
  return (String(s || '').match(/\S+/g) || []).length
}

// Content words, singularised, so "pianos" matches "piano". dropUniversal
// also drops the words nearly every piano query shares.
function tokens(q, dropUniversal) {
  return new Set(
    String(q || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
      .filter((t) => t && !STOPWORDS.has(t) && !(dropUniversal && UNIVERSAL.has(t)))
      .map((t) => t.replace(/s$/, '')),
  )
}

// Every content token of the keyword appears in the text (plural-tolerant).
function carriesKeyword(text, keyword) {
  const have = tokens(text, false)
  const need = [...tokens(keyword, false)]
  return need.length > 0 && need.every((t) => have.has(t))
}

function countPhrase(text, re) {
  return (text.match(re) || []).length
}

function phraseRe(phrase) {
  return new RegExp(`(^|[^a-z0-9])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[\\s-]')}($|[^a-z0-9])`, 'gi')
}

// Blocks a reader sees as one unit: a paragraph, a list item, a table row.
function blocks(html) {
  return [...stripComments(html).matchAll(/<(p|li|tr|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => m[2])
}

function isValidDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(new Date(s + 'T00:00:00Z'))
}

function checkDraft(draft, { posts = [], topic = null, partial = false, selfSlug = null } = {}) {
  const failures = []
  const warnings = []
  const fail = (m) => failures.push(m)
  const warn = (m) => warnings.push(m)
  const d = draft || {}
  const has = (k) => d[k] !== undefined && d[k] !== null
  const want = (k) => !partial || has(k)
  const primary = String(d.primary_keyword || (topic && topic.primary_keyword) || '').trim()
  const others = posts.filter((p) => p.slug !== (selfSlug || d.slug))

  // ---- required fields ----
  const required = partial
    ? ['notes']
    : ['title', 'slug', 'meta_description', 'excerpt', 'body_html', 'tags', 'keywords', 'faq',
       'primary_keyword', 'research_notes', 'reverify_by', 'reverify_notes']
  for (const k of required) {
    if (!has(k) || (typeof d[k] === 'string' && !d[k].trim())) fail(`${k} is missing`)
  }

  // ---- title / slug / meta / excerpt ----
  if (want('title') && has('title')) {
    if (d.title.length > 60) fail(`title is ${d.title.length} characters (max 60): "${d.title}"`)
    if (primary && !carriesKeyword(d.title, primary)) warn(`title doesn't carry the primary keyword "${primary}"`)
  }
  if (want('slug') && has('slug')) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d.slug)) fail(`slug "${d.slug}" is not kebab-case`)
    if (/\b(19|20)\d{2}\b/.test(d.slug)) warn(`slug "${d.slug}" contains a year: a dateless URL never needs a redirect when the article is updated`)
    if (d.slug.length > 60) warn(`slug is ${d.slug.length} characters; shorter, keyword-led slugs read better in results`)
    const clash = others.find((p) => p.slug === d.slug)
    if (clash) warn(`slug "${d.slug}" already exists (${clash.status}: "${clash.title}"). Same slug usually means the same topic.`)
  }
  if (want('meta_description') && has('meta_description')) {
    const n = d.meta_description.length
    if (n > 155) fail(`meta_description is ${n} characters (max 155)`)
    if (n < 70) warn(`meta_description is ${n} characters; under 70 wastes the space`)
    if (primary && !carriesKeyword(d.meta_description, primary)) warn(`meta_description doesn't carry the primary keyword "${primary}"`)
  }
  if (want('excerpt') && has('excerpt')) {
    if (d.excerpt.length > 300) warn(`excerpt is ${d.excerpt.length} characters; 1 to 2 plain sentences`)
  }

  // ---- tags / keywords / faq ----
  if (want('tags') && has('tags')) {
    if (!Array.isArray(d.tags) || d.tags.length < 1 || d.tags.length > 3) fail('tags: 1 to 3 required')
    for (const t of d.tags || []) if (!ALLOWED_POST_TAGS.includes(t)) fail(`tag "${t}" isn't one of: ${ALLOWED_POST_TAGS.join(', ')}`)
  }
  if (want('keywords') && has('keywords')) {
    const n = Array.isArray(d.keywords) ? d.keywords.length : 0
    if (!n) fail('keywords: none given')
    else if (n < 4 || n > 8) warn(`keywords: ${n} given, 4 to 8 expected`)
  }
  let faqText = ''
  if (want('faq') && has('faq')) {
    const faq = Array.isArray(d.faq) ? d.faq : []
    if (faq.length < 3 || faq.length > 6) fail(`faq has ${faq.length} questions (3 to 6)`)
    for (const f of faq) {
      if (!f || !String(f.question || '').trim() || !String(f.answer || '').trim()) { fail('faq entry missing a question or answer'); continue }
      const sentences = (String(f.answer).match(/[.?](\s|$)/g) || []).length
      if (sentences > 3) warn(`faq answer runs ${sentences} sentences (1 to 3): "${f.question}"`)
      faqText += ` ${f.question} ${f.answer}`
    }
    if (topic && Array.isArray(topic.faq_questions)) {
      const asked = faq.map((f) => String(f.question || '').toLowerCase())
      for (const q of topic.faq_questions) {
        const core = [...tokens(q, true)]
        if (core.length && !asked.some((a) => core.filter((t) => a.includes(t)).length >= Math.ceil(core.length * 0.6))) {
          warn(`brief asked the faq to answer "${q}"; no close match found`)
        }
      }
    }
  }

  // ---- reverify ----
  if (want('reverify_by') && has('reverify_by')) {
    if (!isValidDate(d.reverify_by)) fail(`reverify_by "${d.reverify_by}" isn't a YYYY-MM-DD date`)
    else {
      const days = (new Date(d.reverify_by + 'T00:00:00Z') - Date.now()) / 86400000
      if (days < 14) fail('reverify_by is less than two weeks away')
      if (days > 550) warn('reverify_by is more than 18 months away; dated claims rot faster than that')
    }
  }

  // ---- body ----
  const stats = { words: 0, h2: 0, internal_links: [], external_links: 0, faq: Array.isArray(d.faq) ? d.faq.length : 0, verify: [], prices: 0 }
  let bodyText = ''
  if (want('body_html') && has('body_html')) {
    const html = String(d.body_html)
    const clean = stripComments(html)
    bodyText = textOf(html)
    stats.words = words(bodyText)
    stats.verify = [...html.matchAll(/<!--\s*VERIFY:?\s*([\s\S]*?)-->/gi)].map((m) => m[1].replace(/\s+/g, ' ').trim()).filter(Boolean)

    const badTags = new Set()
    for (const m of clean.matchAll(/<\/?([a-z][a-z0-9]*)\b/gi)) {
      const tag = m[1].toLowerCase()
      if (!ALLOWED_TAGS.has(tag)) badTags.add(tag)
    }
    if (badTags.size) fail(`body uses tags outside the allowed set: <${[...badTags].join('>, <')}>`)
    if (/\sstyle\s*=/i.test(clean)) fail('body has inline styles')
    if (/\son[a-z]+\s*=/i.test(clean)) fail('body has an event-handler attribute')
    if ((clean.match(/<table\b/gi) || []).length > 1) warn('more than one table: keep one, for a genuine side-by-side comparison')

    if (stats.words < 700) fail(`body is ${stats.words} words (800 to 1,200; thin content doesn't ship)`)
    else if (stats.words > 1500) fail(`body is ${stats.words} words (800 to 1,200)`)
    else if (stats.words < 800 || stats.words > 1200) warn(`body is ${stats.words} words (800 to 1,200)`)

    stats.h2 = (clean.match(/<h2\b/gi) || []).length
    if (stats.h2 < 3) warn(`only ${stats.h2} <h2> sections; question-led sections are how answer engines find the passage`)

    // Answer first: the article opens with a paragraph that answers the question.
    const first = /^\s*<(p|h2|h3|ul|ol|table|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/i.exec(clean)
    if (!first || first[1].toLowerCase() !== 'p') warn('body should open with a <p> that answers the question directly, before any heading')
    else {
      const n = words(textOf(first[2]))
      if (n < 25 || n > 80) warn(`opening paragraph is ${n} words; 40 to 60 makes a self-contained answer an AI overview can lift`)
      if (primary && !carriesKeyword(textOf(first[2]), primary)) warn(`opening paragraph doesn't carry the primary keyword "${primary}"`)
    }
    if (!/japan/i.test(bodyText.slice(0, 1200))) warn('Japan isn\'t mentioned in the first paragraphs (voice rule: lead with Japan)')

    // Links
    const published = new Set(others.filter((p) => p.status === 'published').map((p) => `/blog/${p.slug}`))
    const draftSlugs = new Set(others.filter((p) => p.status !== 'published').map((p) => `/blog/${p.slug}`))
    for (const m of clean.matchAll(/<a\b[^>]*\bhref\s*=\s*"([^"]*)"/gi)) {
      const href = m[1].trim()
      if (/^https?:\/\/(www\.)?signaturepianos\.com\.au/i.test(href)) { warn(`link our own pages relatively: ${href}`); continue }
      if (/^https?:\/\//i.test(href)) {
        stats.external_links++
        if (/^http:\/\//i.test(href)) warn(`insecure source link: ${href}`)
        continue
      }
      if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue
      const path = href.split('#')[0].split('?')[0]
      stats.internal_links.push(path)
      if (ALLOWED_PATHS.includes(path) || published.has(path)) continue
      if (draftSlugs.has(path)) warn(`links to ${path}, which is still a draft: publish both together, or remove the link`)
      else fail(`internal link ${href} isn't an allowed page or a published Journal post`)
    }
    if (!stats.internal_links.includes(BOOK_PATH)) fail(`no link to ${BOOK_PATH} (the one next step)`)
    else {
      const bl = blocks(html)
      const last = bl.length ? bl[bl.length - 1] : ''
      if (!last.includes(BOOK_PATH)) warn('the book-a-visit link should be the article\'s final step')
    }
    if (topic && Array.isArray(topic.internal_links)) {
      for (const l of topic.internal_links) if (!stats.internal_links.includes(l)) warn(`brief asked for a link to ${l}`)
    }
    if (stats.external_links === 0) warn('no source links: every fact that needs one cites it beside the claim')

    // Prices: dated, sourced, no cents, never ours.
    for (const b of blocks(html)) {
      const figures = textOf(b).match(/\$\d[\d,]*(\.\d{2})?/g)
      if (!figures) continue
      stats.prices += figures.length
      if (figures.some((f) => /\.\d{2}$/.test(f))) warn(`price with cents (${figures.join(', ')}): write $8,900`)
      if (!/<a\b[^>]*href\s*=\s*"https?:/i.test(b)) warn(`price without a source link in the same block: "${textOf(b).slice(0, 90)}"`)
      if (!new RegExp(`\\b(${MONTHS})\\s+20\\d{2}\\b`).test(textOf(b))) warn(`price without a month-and-year stamp in the same block: "${textOf(b).slice(0, 90)}"`)
    }

    // "pre-loved" in prose; the searched phrase once, where it's explained.
    const secondHand = countPhrase(bodyText, /second[\s-]hand/gi)
    const used = countPhrase(bodyText, /\bused (pianos?|yamahas?|kawais?|uprights?|grands?)\b/gi)
    if (secondHand > 1) warn(`"second-hand" appears ${secondHand} times in the body; say "pre-loved" and use the searched phrase once`)
    if (used > 1) warn(`"used piano" wording appears ${used} times in the body; say "pre-loved"`)
    if (!/pre-loved/i.test(bodyText)) warn('"pre-loved" never appears in the body')

    if (/\bTODO\b|\bTK\b|lorem ipsum|\[citation needed\]/i.test(bodyText)) fail('body contains a TODO / TK / placeholder')
  }

  // ---- voice, across everything a reader sees ----
  const visible = [d.title, d.meta_description, d.excerpt, bodyText, faqText].filter(Boolean).join(' \n ')
  if (visible) {
    for (const w of BANNED) {
      const n = countPhrase(visible, phraseRe(w))
      if (n) fail(`banned word "${w}" (${n}x)`)
    }
    if (/!/.test(visible)) fail('exclamation mark')
    if (/—/.test(visible)) fail('em dash (—): rewrite the sentence')
    if (/\s--\s/.test(visible)) fail('double-hyphen dash')
    if (/–/.test(visible)) warn('en dash (–): write ranges as "$1,500 to $10,000"')
    for (const w of US_SPELLINGS) if (countPhrase(visible, phraseRe(w))) warn(`US spelling "${w}": Australian English`)
    for (const w of PROMISE_WORDS) {
      const n = countPhrase(visible, phraseRe(w))
      if (n) warn(`"${w}" (${n}x): only the four promises exist; check this isn't a fifth`)
    }
    for (const w of RISKY_CLAIMS) {
      const n = countPhrase(visible, phraseRe(w))
      if (n) warn(`"${w}" (${n}x): a claim the rules say to avoid or verify`)
    }
    if (/10[\s-]year warranty/i.test(visible) && !/Signature Pianos warranty/i.test(visible)) warn('call it the "Signature Pianos warranty"')
    if (/\b(Yamaha|Kawai)(\s+Australia)?['’]?s?\s+warranty/i.test(visible)) warn('mentions a maker\'s warranty: never imply Yamaha or Kawai cover these pianos')
    if (new RegExp(`\\b(${MONTHS})\\s+\\d{1,2},\\s+\\d{4}`).test(visible)) warn('US-style date: write 19 September 2026')
    if (/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(visible)) warn('numeric date: write 19 September 2026')
    const phones = visible.match(/\b0\d{3}\s?\d{3}\s?\d{3}\b/g) || []
    for (const ph of phones) if (ph.replace(/\s/g, '') !== '0479128955') warn(`unknown phone number ${ph}`)
  }

  // ---- one question per page: never two of our posts on one query ----
  if (primary && !partial) {
    const mine = tokens(primary, true)
    for (const o of [...others, ...SITE_PAGES]) {
      const theirKw = String(o.primary_keyword || (o.keywords || [])[0] || '')
      if (!theirKw) continue
      if (theirKw.toLowerCase().trim() === primary.toLowerCase()) {
        fail(`"${o.title}" (${o.status}) already targets "${theirKw}". Retarget, or fold this angle into that article.`)
        continue
      }
      const theirs = tokens(theirKw, true)
      const shared = [...mine].filter((t) => theirs.has(t))
      const smaller = Math.min(mine.size, theirs.size)
      if (smaller > 0 && shared.length / smaller >= 0.6) {
        warn(`primary keyword "${primary}" overlaps "${theirKw}" ("${o.title}") on [${shared.join(', ')}]. Two of our pages on one question splits our authority.`)
      }
    }
  }

  return { failures, warnings, stats }
}

module.exports = { checkDraft, ALLOWED_PATHS, ALLOWED_POST_TAGS, SITE_PAGES, stripComments, textOf }
