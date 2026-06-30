/*
 * Signature Pianos — Website SEO + AI-search audit
 * ------------------------------------------------
 * POST { url }  (admin only — Authorization: Bearer <supabase token>)
 *
 * Fetches the page, then asks Claude to grade it on traditional SEO and
 * AI-search readiness (AEO/GEO), returning a structured report with
 * specific fixes. The report is saved to content_audits.
 */

const { requireAdmin, writeJson, supabaseAdmin } = require('../lib/ai')

const AUDIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['scores', 'summary', 'seo_findings', 'aeo_findings', 'quick_wins'],
  properties: {
    scores: {
      type: 'object',
      additionalProperties: false,
      required: ['seo', 'aeo', 'overall'],
      properties: {
        seo: { type: 'integer' },      // 0-100
        aeo: { type: 'integer' },      // 0-100 (AI-search readiness)
        overall: { type: 'integer' },  // 0-100
      },
    },
    summary: { type: 'string' },
    seo_findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'title', 'recommendation'],
        properties: {
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          title: { type: 'string' },
          recommendation: { type: 'string' },
        },
      },
    },
    aeo_findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'title', 'recommendation'],
        properties: {
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          title: { type: 'string' },
          recommendation: { type: 'string' },
        },
      },
    },
    quick_wins: { type: 'array', items: { type: 'string' } },
  },
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  let admin
  try {
    admin = await requireAdmin(req)
  } catch (e) {
    return res.status(e.status || 401).json({ error: e.message || 'Unauthorized' })
  }

  const url = (req.body?.url || '').trim()
  if (!/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: 'Please provide a full URL (https://…)' })
  }

  // Fetch the page HTML (cap size so we don't blow the token budget).
  let html = ''
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'SignaturePianosAuditBot/1.0' },
      redirect: 'follow',
    })
    if (!r.ok) return res.status(400).json({ error: `Page returned HTTP ${r.status}` })
    html = (await r.text()).slice(0, 60000)
  } catch (err) {
    console.error('[audit] fetch failed', err)
    return res.status(400).json({ error: 'Could not fetch that URL' })
  }

  const prompt = `Audit this web page for Signature Pianos. Score it on traditional SEO
and on AI-search readiness (how well AI answer engines like ChatGPT, Perplexity and
Google AI Overviews can understand, trust and cite it).

URL: ${url}

Evaluate: title tag & meta description, heading structure (h1/h2), keyword targeting
and search intent, internal linking, image alt text, structured data (JSON-LD / schema),
mobile/perf signals visible in markup, E-E-A-T signals, and for AEO: clear question-led
answers, factual directness, scannability, citability, and presence of FAQ/HowTo schema.

Give concrete, page-specific recommendations — not generic advice. Order findings by severity.

PAGE HTML:
${html}`

  let result
  try {
    result = await writeJson(prompt, AUDIT_SCHEMA)
  } catch (err) {
    console.error('[audit] AI failed', err)
    return res.status(502).json({ error: 'The audit could not be generated. ' + err.message })
  }

  // Save it (best-effort — don't fail the request if the insert hiccups).
  try {
    await supabaseAdmin.from('content_audits').insert({ url, result })
  } catch (err) {
    console.error('[audit] save failed', err)
  }

  return res.status(200).json({ url, result, auditedBy: admin.email })
}
