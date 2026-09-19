/*
 * Signature Pianos — blog post generation helpers
 * -----------------------------------------------
 * Shared by api/blog-generate.js (manual), api/cron-blog-writer.js (auto) and
 * api/run-blog-writer.js (auto, on demand). Holds the structured-output
 * schema, the writing rules, the save logic (slug de-duplication + insert as
 * draft) and the auto-writer, which works through the topic queue in
 * blog_topic_queue (supabase/blog_topic_plan.sql) before choosing freely.
 */

const { writeJson, research, supabaseAdmin, slugify } = require('./ai')
const { insightsBlock } = require('./search-console')

// JSON Schema for a generated post. Note: structured outputs forbid
// minLength/maxLength etc., so length guidance lives in the prompt.
const BLOG_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'slug', 'meta_description', 'excerpt', 'body_html', 'tags', 'keywords', 'faq'],
  properties: {
    title: { type: 'string' },
    slug: { type: 'string' },
    meta_description: { type: 'string' },
    excerpt: { type: 'string' },
    body_html: { type: 'string' },   // article body: see FORMAT in WRITING_RULES
    tags: { type: 'array', items: { type: 'string' } },
    keywords: { type: 'array', items: { type: 'string' } },
    faq: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['question', 'answer'],
        properties: {
          question: { type: 'string' },
          answer: { type: 'string' },
        },
      },
    },
  },
}

// Brand voice from brand/BRAND-GUIDELINES.md (section 6) and the claims list
// from the September 2026 content research. These override BRAND_CONTEXT.
const WRITING_RULES = `
Write a complete, original, genuinely useful article for The Journal, the blog
of Signature Pianos in Mount Waverley, Melbourne. It must work for Google and
for AI answer engines. These rules take precedence over any general guidance.

WHO WE ARE
- Signature Pianos sells pre-loved Japanese acoustic pianos, mostly Yamaha and
  Kawai, from a showroom at 63 Blackburn Road, Mount Waverley VIC 3149. Every
  piano is chosen in Japan (by the owner, Eric Kuang, or by partners who know
  what he looks for), photographed there before import, imported direct, and
  checked in the Melbourne workshop before it goes on the floor. We don't buy
  in bulk from auction.
- Articles are published under Eric Kuang's name. First person ("I choose each
  piano in Japan...") is fine for how the business works, but never invent
  anecdotes, customers, conversations or experiences.
- Digital pianos are not in stock yet. Don't promote a digital range; compare
  acoustic and digital neutrally only if the topic asks for it.

VOICE
- Plain Australian English (colour, centre, licence), like a patient piano
  technician explaining things to a parent: exact, calm, never selling.
- Lead with Japan: the first or second paragraph says, naturally, that our
  pianos are chosen in Japan and checked in Melbourne, or ties the topic to it.
- Name pianos precisely: maker, model, year, finish ("Yamaha U3H, 1981, polished ebony").
- Explain a technical term once, simply, the first time it appears.
- Reassure with facts, not adjectives.
- Never use: best, world-class, unbeatable, stunning, amazing, cheap, bargain,
  "Buy now", exclamation marks or em dashes.
- Dates as 19 September 2026. Prices as $8,900 (no cents). Phone 0479 128 955.
- One next step: book a visit (/services/book-a-viewing.html). End with it.

SEARCH WORDS VS BRAND WORDS
- People search "second hand", "second-hand" and "used"; we say "pre-loved".
  Write "pre-loved" throughout the prose. The searched phrase may appear ONCE
  in the body, where it's explained (e.g. "pre-loved, or second-hand as most
  people search it"), and freely in keywords and the meta description.
- Titles lead with the reader's question. A title may carry the searched
  phrase once, only if it is the primary keyword.

PROMISES: only these four, worded plainly
- White-glove delivery.
- A 10-year warranty, always called the "Signature Pianos warranty".
- The first tuning included, three to four weeks after delivery.
- Delivery booked and tracked in the customer portal.
Nothing else: no free delivery, price-match, trade-in, finance, "interest-free",
guarantees or turnaround times.

CLAIMS TO AVOID OR VERIFY
- Warranty: never imply Yamaha or Kawai cover these pianos; Yamaha Australia's
  warranty excludes instruments imported from overseas. The Signature Pianos
  warranty sits alongside Australian Consumer Law rights; never suggest it
  limits or replaces them.
- Legality: don't say grey market means illegal, and don't say "100% legal".
- Climate: never call a piano humidity-proof, risk-free or "seasoned for
  Australia" (Yamaha Australia says that of its new Australian-market pianos,
  not Japanese-market ones). When comparing humidity, compare like with like:
  Tokyo's figure is a daily mean, Melbourne Airport's is a 3 pm reading. The
  real point is indoor dryness from heating.
- "Made in Japan": not every piano sourced from Japan was built there (the
  b121 and U1J are Indonesian). Only say where a piano was built if its serial
  or stamp confirms it. A serial dates a piano; it doesn't show its market.
- History: only say "one owner" or "never a school piano" if documented.
  Containers carry mixed lots.
- Features: sources conflict on YUS3 pedals, so don't state pedal layouts, and
  don't repeat component claims ("German strings", "CFX hammers") unless
  Yamaha confirms them. Say whether a silent system is factory Yamaha SILENT
  or aftermarket.
- Ivory: don't describe keytops as ivory unless checked; the trade is regulated.
- Prices: never state a Signature Pianos price or say what's in stock. Any
  other price is date-stamped ("in September 2026"), says whether GST is
  included if known, and links its source.
- Teachers: don't say teachers are verified, checked or vetted.
- Payment plans: don't call them finance or interest-free.
- AMEB rules and strata or noise rules differ by state and change; say so and
  link the source.
- Reviews: never invent, paraphrase or summarise reviews or testimonials.
If a fact isn't in the brief or research notes with a source, leave it out.
If you keep something that still needs checking, put an HTML comment straight
after it: <!-- VERIFY: what to check -->. The editor sees these; readers don't.

FORMAT
- title: at most 60 characters, leads with the reader's question, includes the
  primary keyword.
- slug: short, kebab-case, keyword-led.
- meta_description: at most 155 characters, includes the primary keyword,
  plain and specific.
- excerpt: 1-2 plain sentences for the listing page.
- body_html: 800-1,200 words. Use only <h2>, <h3>, <p>, <ul>, <ol>, <li>,
  <strong>, <em>, <a>, <blockquote> (a quoted source only) and, for a genuine
  side-by-side comparison, one simple <table> with <thead>, <tbody>, <tr>,
  <th>, <td>. No <h1>, <html>, <head>, <style>, images or inline styles.
  Open with a direct, factual answer to the core question (good for AI
  Overviews), then question-led <h2> sections.
  Cite sources as plain links (<a href="https://...">Source name</a>) beside
  the claims that need them.
  Link to our pages with relative URLs where they genuinely help, only from:
  /instruments/, /services/book-a-viewing.html, /services/delivery-warranty.html,
  /services/tuning-servicing.html, /teachers.html, /about.html.
- tags: 1-3, chosen from: Buying guide, Yamaha, Kawai, Grand pianos,
  Piano care, Melbourne, Lessons.
- keywords: 4-8 search phrases (searched wording like "second hand" is fine here).
- faq: 3-6 questions people actually ask, answered in 1-3 plain sentences
  under the same rules as the body.
`.trim()

/*
 * planBrief(topic) — the editorial plan from a blog_topic_queue row, as text
 * for the prompt.
 */
function planBrief(t) {
  const list = (a) => (Array.isArray(a) ? a : []).filter(Boolean)
  const lines = [
    'EDITORIAL PLAN (from the Signature Pianos topic queue; follow it):',
    `- Working title: ${t.working_title}`,
    `- Primary keyword: ${t.primary_keyword} (use it in the title, slug, meta description and first paragraph)`,
  ]
  if (list(t.secondary_keywords).length) lines.push(`- Secondary keywords (use where they fit naturally): ${list(t.secondary_keywords).join('; ')}`)
  if (list(t.intent).length || t.funnel_stage) {
    lines.push(`- Search intent: ${list(t.intent).join(', ') || 'n/a'}. Funnel stage: ${t.funnel_stage || 'n/a'}.`)
  }
  if (t.brief) lines.push(`- Brief (angle and sourced facts; confirm each against the research notes before using it):\n${t.brief}`)
  if (list(t.faq_questions).length) {
    lines.push(`- The faq must answer these questions (light rewording is fine):\n${list(t.faq_questions).map((q) => `  - ${q}`).join('\n')}`)
  }
  if (list(t.internal_links).length) lines.push(`- Link to these pages in the body: ${list(t.internal_links).join(', ')}`)
  return lines.join('\n')
}

/*
 * generatePost({ topic, research, avoidTitles, plan }) — returns a validated
 * post object (not yet saved). `research` is optional fact-gathering notes;
 * `plan` is an optional blog_topic_queue row whose brief, keywords, FAQ
 * questions and internal links steer the article.
 */
async function generatePost({ topic, research = '', avoidTitles = [], plan = null }) {
  const avoid = avoidTitles.length
    ? `\n\nDo NOT duplicate these existing articles; take a distinct angle:\n- ${avoidTitles.join('\n- ')}`
    : ''
  const planText = plan ? `\n\n${planBrief(plan)}` : ''
  const notes = research ? `\n\nUse these researched notes as source material (verify, don't copy verbatim):\n${research}` : ''

  const prompt = `${WRITING_RULES}\n\nTOPIC / BRIEF:\n${topic}${planText}${notes}${avoid}`
  return writeJson(prompt, BLOG_SCHEMA)
}

/*
 * savePostDraft(post, source) — inserts the post as a draft, guaranteeing a
 * unique slug. Returns the inserted row.
 */
async function savePostDraft(post, source = 'manual') {
  let base = slugify(post.slug || post.title)
  if (!base) base = 'post-' + Math.random().toString(36).slice(2, 8)

  // Ensure slug uniqueness.
  let slug = base
  for (let n = 2; n < 50; n++) {
    const { data: clash } = await supabaseAdmin
      .from('blog_posts').select('id').eq('slug', slug).maybeSingle()
    if (!clash) break
    slug = `${base}-${n}`
  }

  const row = {
    slug,
    title: post.title,
    meta_description: post.meta_description || null,
    excerpt: post.excerpt || null,
    body_html: post.body_html || '',
    tags: Array.isArray(post.tags) ? post.tags : [],
    keywords: Array.isArray(post.keywords) ? post.keywords : [],
    faq: Array.isArray(post.faq) ? post.faq : [],
    status: 'draft',
    source,
  }

  const { data, error } = await supabaseAdmin
    .from('blog_posts').insert(row).select().single()
  if (error) throw new Error('Could not save post: ' + error.message)
  return data
}

/* ---------------------------------------------------------------------------
   Topic queue (blog_topic_queue)
   ------------------------------------------------------------------------- */

const TOPIC_QUEUE = 'blog_topic_queue'

// The highest-priority queued topic, or null when the queue is empty or the
// table doesn't exist yet (blog_topic_plan.sql not run), so callers fall back.
async function nextQueuedTopic() {
  try {
    const { data, error } = await supabaseAdmin
      .from(TOPIC_QUEUE)
      .select('*')
      .eq('status', 'queued')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(1)
    if (error) {
      console.warn('[blog] topic queue unavailable, choosing freely:', error.message)
      return null
    }
    return (data && data[0]) || null
  } catch (err) {
    console.warn('[blog] topic queue unavailable, choosing freely:', err.message)
    return null
  }
}

async function markTopicUsed(topicId, postId) {
  const { error } = await supabaseAdmin
    .from(TOPIC_QUEUE)
    .update({ status: 'used', used_at: new Date().toISOString(), post_id: postId })
    .eq('id', topicId)
  if (error) console.error('[blog] could not mark topic used', error)
}

function queueResearchPrompt(t) {
  return `Check and extend the facts for a Signature Pianos article (Melbourne, Australia).

WORKING TITLE: ${t.working_title}
PRIMARY KEYWORD: ${t.primary_keyword}

BRIEF, with the sources our researcher found:
${t.brief || '(no brief)'}

1. Open the source URLs in the brief where you can and confirm each claim is
   still stated there. Note anything that has changed or can't be confirmed.
2. Add current, specific facts an Australian piano buyer needs for this topic,
   each with its source URL and the month you checked it. For prices, say
   whether GST is included.
3. List anything in the brief that should NOT be stated as fact.
Keep the notes concise and factual.`
}

async function freeChoiceTopic(avoidTitles) {
  // Real search demand from Google Search Console (null if not set up).
  const gsc = await insightsBlock({ days: 90 })
  const demandBlock = gsc
    ? `\n\nPRIORITISE these real searches our own site already gets impressions for
(prefer a topic that directly answers one of the opportunity queries):
${gsc.text}\n`
    : ''

  const notes = await research(
    `Research the questions Australian piano buyers are asking in ${new Date().getFullYear()}
about pre-loved Japanese acoustic pianos (Yamaha and Kawai uprights and grands):
choosing a model, buying well, and looking after a piano in Melbourne. Note any
relevant new Yamaha or Kawai acoustic models worth comparing. Skip digital
pianos (not stocked yet). Summarise concrete facts and sources.${demandBlock}

We have already published about these; suggest a DIFFERENT angle:
${avoidTitles.map((t) => '- ' + t).join('\n') || '(nothing yet)'}

End your notes with one line: "CHOSEN TOPIC: <a specific, fresh article title or brief>".`
  )

  const chosen = (notes.match(/CHOSEN TOPIC:\s*(.+)/i) || [])[1]?.trim()
    || 'A buyer-focused guide to choosing a pre-loved Japanese Yamaha or Kawai piano in Melbourne'
  return { chosen, notes }
}

/*
 * writeAutoDraft({ onTopic }) — one run of the auto-writer. Takes the
 * highest-priority queued topic and writes it from its brief (still
 * researching current facts), then marks it used with the new post's id. With
 * no queue, it chooses freely from research and Search Console as before.
 * Always saves a DRAFT. Returns { post, topic } (topic is null on free choice).
 */
async function writeAutoDraft({ onTopic } = {}) {
  const { data: recent } = await supabaseAdmin
    .from('blog_posts').select('title').order('created_at', { ascending: false }).limit(40)
  const avoidTitles = (recent || []).map((r) => r.title)

  const planned = await nextQueuedTopic()
  let post
  if (planned) {
    if (onTopic) await onTopic(planned.working_title)
    const notes = await research(queueResearchPrompt(planned))
    post = await generatePost({ topic: planned.working_title, plan: planned, research: notes, avoidTitles })
  } else {
    const { chosen, notes } = await freeChoiceTopic(avoidTitles)
    if (onTopic) await onTopic(chosen)
    post = await generatePost({ topic: chosen, research: notes, avoidTitles })
  }

  const saved = await savePostDraft(post, 'auto')
  if (planned) await markTopicUsed(planned.id, saved.id)
  try { await supabaseAdmin.from('blog_topics').insert({ topic: saved.title }) } catch (_) {}

  return { post: saved, topic: planned }
}

module.exports = {
  BLOG_SCHEMA,
  WRITING_RULES,
  generatePost,
  savePostDraft,
  nextQueuedTopic,
  markTopicUsed,
  writeAutoDraft,
}
