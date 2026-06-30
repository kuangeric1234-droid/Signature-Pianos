/*
 * Signature Pianos — blog post generation helpers
 * -----------------------------------------------
 * Shared by api/blog-generate.js (manual) and api/cron-blog-writer.js (auto).
 * Holds the structured-output schema, the writing prompt, and the save logic
 * (slug de-duplication + insert as draft).
 */

const { writeJson, supabaseAdmin, slugify } = require('./ai')

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
    body_html: { type: 'string' },   // article body: <h2>/<h3>/<p>/<ul>/<ol> only
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

const WRITING_RULES = `
Write a complete, original, genuinely useful blog article optimised for BOTH
Google and AI answer engines.

Requirements:
- title: compelling, ~50-60 chars, includes the primary keyword naturally.
- slug: short, kebab-case, keyword-focused.
- meta_description: ~150-160 chars, includes primary keyword, invites the click.
- excerpt: 1-2 sentence summary for listing pages.
- body_html: 700-1100 words. Use ONLY these tags: <h2>, <h3>, <p>, <ul>, <ol>,
  <li>, <strong>, <em>, <a>. Do NOT include <h1>, <html>, <head>, <style>, or images.
  Open with a direct, factual answer to the core question (good for AI Overviews),
  then go deeper with scannable question-led <h2> headings. Be specific and accurate.
  Where natural, link to relevant Signature Pianos pages using relative URLs
  (e.g. /pianos.html, /teachers.html, /instruments.html) — but only when genuinely helpful.
- tags: 2-4 short topic tags.
- keywords: 4-8 target search keywords/phrases.
- faq: 3-5 question/answer pairs people actually ask (used to emit FAQ schema for AEO).

Australian English, AUD, warm expert tone. No fabricated specs, prices, or claims —
if unsure of a detail, keep it general rather than inventing numbers.
`.trim()

/*
 * generatePost({ topic, research, avoidTitles }) — returns a validated post
 * object (not yet saved). `research` is optional fact-gathering notes; passing
 * it grounds the article in current information.
 */
async function generatePost({ topic, research = '', avoidTitles = [] }) {
  const avoid = avoidTitles.length
    ? `\n\nDo NOT duplicate these recently-published articles — pick a distinct angle:\n- ${avoidTitles.join('\n- ')}`
    : ''
  const notes = research ? `\n\nUse these researched notes as source material (verify, don't copy verbatim):\n${research}` : ''

  const prompt = `${WRITING_RULES}\n\nTOPIC / BRIEF:\n${topic}${notes}${avoid}`
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

module.exports = { BLOG_SCHEMA, generatePost, savePostDraft }
