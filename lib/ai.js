/*
 * Signature Pianos — AI + marketing shared helpers
 * ------------------------------------------------
 * Used by the marketing API routes:
 *   - api/marketing-audit.js   (website SEO / AI-search audit)
 *   - api/blog-generate.js     (manual blog draft)
 *   - api/cron-blog-writer.js  (auto-loop blog drafts)
 *
 * Wraps the Anthropic Messages API (Claude) for two jobs:
 *   research()  — web-search-backed fact gathering (returns text)
 *   writeJson() — structured JSON output validated against a schema
 *
 * The model is configurable via the AI_MODEL env var. Default is
 * claude-sonnet-4-6 (best speed/cost for high-volume writing — $3/$15 per
 * 1M tokens). Set AI_MODEL=claude-opus-4-8 in Vercel for higher quality at
 * higher cost. Never hardcode the API key — it lives in ANTHROPIC_API_KEY.
 */

const { createClient } = require('@supabase/supabase-js')

const MODEL = process.env.AI_MODEL || 'claude-sonnet-4-6'

// We call the Anthropic Messages API over fetch (Node 18+ has global fetch on
// Vercel) rather than the SDK — it keeps this function dependency-free and the
// request body explicit. Auth + version headers per the Messages API.
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

// Every call gets a deadline. The blog and audit routes run with maxDuration
// 300 (vercel.json); if Vercel kills the function first, no catch block runs
// and the job row is left 'running' forever. Aborting ourselves first means
// the error is caught and recorded. Callers with a whole-job budget pass
// `deadline` (epoch ms); anything else gets DEFAULT_TIMEOUT_MS.
const DEFAULT_TIMEOUT_MS = 240000
const MIN_CALL_MS = 5000

/*
 * jobDeadline(ms) — the epoch-ms deadline for a job that must finish within
 * `ms` of now. The blog jobs use JOB_BUDGET_MS: under the 300s platform limit
 * with room left to write the final status row.
 */
const JOB_BUDGET_MS = 270000
function jobDeadline(ms = JOB_BUDGET_MS) {
  return Date.now() + ms
}

async function callMessages(body, { deadline, timeoutMs } = {}) {
  let ms = timeoutMs || DEFAULT_TIMEOUT_MS
  if (deadline) ms = Math.min(ms, deadline - Date.now())
  if (ms < MIN_CALL_MS) throw new Error('Ran out of time before the AI call could start')

  let r, json
  try {
    r = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(ms),
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: MODEL, ...body }),
    })
    // The timeout covers reading the body too.
    json = await r.json().catch((err) => {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') throw err
      return {}
    })
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new Error(`The AI call timed out after ${Math.round(ms / 1000)}s`)
    }
    throw err
  }
  if (!r.ok) {
    const msg = json?.error?.message || `Anthropic API error ${r.status}`
    throw new Error(msg)
  }
  return json
}

// Service-role Supabase client — bypasses RLS. Used server-side only.
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const SITE_URL = process.env.SITE_URL || 'https://signaturepianos.com.au'

const BRAND_CONTEXT = `
You are the in-house content + SEO specialist for Signature Pianos, a piano
retailer in Mount Waverley, Melbourne (signaturepianos.com.au). They sell
pre-loved Yamaha and Kawai pianos, hand-picked in Japan and checked in Melbourne,
with white-glove delivery, a 10-year warranty and the first tuning included.
Piano teachers are listed through TeachMusic, their sister platform. Digital
pianos are not stocked yet. Audience: Australian families, students, teachers
and piano buyers. Voice: plain Australian English, like a patient piano
technician talking to a parent; reassure with facts, not adjectives. Say
"pre-loved", never "used" or "second-hand" in prose. Never salesy or generic
"AI slop". Use AUD.
Write for BOTH traditional search (Google) and AI answer engines (ChatGPT,
Perplexity, Google AI Overviews): clear question-led headings, direct factual
answers near the top, scannable structure, and genuine expertise.
`.trim()

/*
 * Time budget for one blog job (JOB_BUDGET_MS): research gets what's left
 * after holding WRITE_RESERVE_MS back for writing the article, so a slow
 * research phase can't starve the write and push the job past the platform
 * kill. researchDeadline(deadline) is the cut-off to pass to research().
 */
const WRITE_RESERVE_MS = 150000
function researchDeadline(deadline) {
  return deadline ? deadline - WRITE_RESERVE_MS : undefined
}

const RESEARCH_MAX_TURNS = 3        // pause_turn continuations
const RESEARCH_MAX_SEARCHES = 4     // web searches per turn
const RESEARCH_MIN_CONTINUE_MS = 30000

/*
 * research(prompt, { deadline }) — gathers current facts using Claude's
 * server-side web search tool. Returns plain text notes. Handles the
 * server-tool pause_turn continuation loop, keeping the text of EVERY turn
 * (a paused turn's notes are not repeated in the continuation). Near the
 * deadline it stops continuing and returns what it has; it throws only when
 * it has no notes at all.
 */
async function research(prompt, { deadline } = {}) {
  const messages = [{ role: 'user', content: prompt }]
  const notes = []
  for (let i = 0; i < RESEARCH_MAX_TURNS; i++) {
    let response
    try {
      response = await callMessages({
        max_tokens: 4000,
        system: BRAND_CONTEXT,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: RESEARCH_MAX_SEARCHES }],
        messages,
      }, { deadline })
    } catch (err) {
      if (notes.length) break
      throw err
    }
    const text = textOf(response)
    if (text) notes.push(text)
    if (response.stop_reason !== 'pause_turn') break
    if (deadline && deadline - Date.now() < RESEARCH_MIN_CONTINUE_MS) break
    // Server tool hit its per-turn iteration limit — re-send to resume.
    messages.push({ role: 'assistant', content: response.content })
  }
  return notes.join('\n').trim()
}

/*
 * writeJson(userPrompt, schema, { deadline, timeoutMs }) — asks Claude to
 * produce JSON that conforms to the given JSON Schema (structured outputs).
 * Returns the parsed object. Uses adaptive thinking at medium effort for quality.
 */
async function writeJson(userPrompt, schema, { deadline, timeoutMs } = {}) {
  const response = await callMessages({
    max_tokens: 8000,
    system: BRAND_CONTEXT,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema },
    },
    messages: [{ role: 'user', content: userPrompt }],
  }, { deadline, timeoutMs })
  const raw = textOf(response)
  try {
    return JSON.parse(raw)
  } catch (err) {
    throw new Error('AI returned invalid JSON: ' + (raw || '').slice(0, 200))
  }
}

// Concatenate all text blocks from a Messages API response.
function textOf(response) {
  return (response.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()
}

/*
 * requireAdmin(req) — kept for the routes that import it from here; the one
 * implementation lives in lib/auth.js. Returns the admin_users row, or throws
 * { status, message }.
 */
const { requireAdmin } = require('./auth')

// Build a URL-safe slug from a title.
function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

module.exports = {
  callMessages,
  supabaseAdmin,
  MODEL,
  SITE_URL,
  BRAND_CONTEXT,
  JOB_BUDGET_MS,
  jobDeadline,
  researchDeadline,
  research,
  writeJson,
  requireAdmin,
  slugify,
}
