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

async function callMessages(body) {
  const r = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY || '',
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, ...body }),
  })
  const json = await r.json().catch(() => ({}))
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
retailer in Melbourne, Australia (signaturepianos.com.au). They sell acoustic
and digital pianos (Yamaha and other brands), offer delivery, tuning, payment
plans, and connect customers with piano teachers. Audience: Australian families,
students, teachers, and piano buyers. Tone: warm, expert, trustworthy, concise —
never salesy or generic "AI slop". Use Australian English and AUD.
Write for BOTH traditional search (Google) and AI answer engines (ChatGPT,
Perplexity, Google AI Overviews): clear question-led headings, direct factual
answers near the top, scannable structure, and genuine expertise.
`.trim()

/*
 * research(prompt) — gathers current facts using Claude's server-side web
 * search tool. Returns plain text notes. Handles the server-tool pause_turn
 * continuation loop.
 */
async function research(prompt) {
  const messages = [{ role: 'user', content: prompt }]
  let response
  for (let i = 0; i < 5; i++) {
    response = await callMessages({
      max_tokens: 4000,
      system: BRAND_CONTEXT,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6 }],
      messages,
    })
    if (response.stop_reason !== 'pause_turn') break
    // Server tool hit its per-turn iteration limit — re-send to resume.
    messages.push({ role: 'assistant', content: response.content })
  }
  return textOf(response)
}

/*
 * writeJson(userPrompt, schema) — asks Claude to produce JSON that conforms
 * to the given JSON Schema (structured outputs). Returns the parsed object.
 * Uses adaptive thinking at medium effort for quality.
 */
async function writeJson(userPrompt, schema) {
  const response = await callMessages({
    max_tokens: 8000,
    system: BRAND_CONTEXT,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema },
    },
    messages: [{ role: 'user', content: userPrompt }],
  })
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
 * requireAdmin(req) — verifies the caller's Supabase access token (sent as
 * `Authorization: Bearer <token>`) and confirms they're an active admin.
 * Returns the admin_users row, or throws { status, message }.
 */
async function requireAdmin(req) {
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) throw { status: 401, message: 'Not signed in' }

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token)
  if (userErr || !userData?.user) throw { status: 401, message: 'Invalid session' }

  const { data: adminRow, error: rowErr } = await supabaseAdmin
    .from('admin_users')
    .select('*')
    .eq('user_id', userData.user.id)
    .eq('active', true)
    .single()
  if (rowErr || !adminRow) throw { status: 403, message: 'Not authorised for admin' }

  return adminRow
}

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
  research,
  writeJson,
  requireAdmin,
  slugify,
}
