/*
 * Signature Pianos — Google Search Console (real search data)
 * -----------------------------------------------------------
 * Pulls the ACTUAL search queries people use to find signaturepianos.com.au
 * (impressions, clicks, CTR, average position) so the blog writer targets
 * proven demand instead of the model guessing at "trending" topics.
 *
 * Auth uses a Google service account via a hand-rolled signed JWT — no SDK,
 * dependency-free (matches lib/ai.js). The service account must be added as a
 * user on the Search Console property (Settings → Users and permissions).
 *
 * Required env vars (all set in Vercel):
 *   GSC_SERVICE_ACCOUNT_EMAIL — e.g. blog-writer@my-proj.iam.gserviceaccount.com
 *   GSC_PRIVATE_KEY           — the service-account private key (PEM). Paste the
 *                               whole "-----BEGIN PRIVATE KEY----- ... " block;
 *                               literal \n in the value are converted to newlines.
 *   GSC_SITE_URL              — the property exactly as it appears in Search
 *                               Console. Domain property: "sc-domain:signaturepianos.com.au".
 *                               URL-prefix property: "https://signaturepianos.com.au/".
 *                               Defaults to SITE_URL (url-prefix form) if unset.
 *
 * If the env vars aren't configured, isConfigured() returns false and the
 * writer falls back to its old web-search-only behaviour — nothing breaks.
 */

const crypto = require('crypto')

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly'
const SITE_URL = process.env.SITE_URL || 'https://signaturepianos.com.au'

function siteProperty() {
  return process.env.GSC_SITE_URL || SITE_URL
}

function isConfigured() {
  return !!(process.env.GSC_SERVICE_ACCOUNT_EMAIL && process.env.GSC_PRIVATE_KEY)
}

function base64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

/*
 * getAccessToken() — signs a JWT with the service-account key and exchanges it
 * for a short-lived OAuth access token (the two-legged JWT-bearer flow).
 */
async function getAccessToken() {
  const email = process.env.GSC_SERVICE_ACCOUNT_EMAIL
  // Env stores newlines as literal "\n"; restore them for the PEM parser.
  const key = (process.env.GSC_PRIVATE_KEY || '').replace(/\\n/g, '\n')

  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claims = {
    iss: email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }

  const signingInput = base64url(JSON.stringify(header)) + '.' + base64url(JSON.stringify(claims))
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(signingInput)
  const signature = base64url(signer.sign(key))
  const assertion = signingInput + '.' + signature

  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  })
  const json = await r.json().catch(() => ({}))
  if (!r.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || `Token exchange failed (${r.status})`)
  }
  return json.access_token
}

// YYYY-MM-DD for `daysAgo` days before now (UTC).
function isoDaysAgo(daysAgo) {
  const d = new Date(Date.now() - daysAgo * 86400000)
  return d.toISOString().slice(0, 10)
}

/*
 * topQueries({ days, limit }) — returns the property's top search queries over
 * the window, each: { query, clicks, impressions, ctr, position }.
 * Ordered by impressions (most-seen first). Throws if not configured.
 */
async function topQueries({ days = 90, limit = 200 } = {}) {
  if (!isConfigured()) throw new Error('Search Console not configured')
  const token = await getAccessToken()
  const property = siteProperty()
  const url =
    'https://www.googleapis.com/webmasters/v3/sites/' +
    encodeURIComponent(property) +
    '/searchAnalytics/query'

  const r = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      startDate: isoDaysAgo(days),
      endDate: isoDaysAgo(1),
      dimensions: ['query'],
      rowLimit: limit,
      dataState: 'all',
    }),
  })
  const json = await r.json().catch(() => ({}))
  if (!r.ok) {
    const msg = json?.error?.message || `Search Console API error ${r.status}`
    throw new Error(msg)
  }
  return (json.rows || []).map((row) => ({
    query: row.keys?.[0] || '',
    clicks: row.clicks || 0,
    impressions: row.impressions || 0,
    ctr: row.ctr || 0,
    position: row.position || 0,
  }))
}

/*
 * opportunities(rows) — picks the best queries to write NEW content for:
 * terms with real demand (impressions) that we're NOT yet winning — i.e.
 * ranking on page ~2+ (position > 8) or barely getting clicks (low CTR).
 * These are the "almost ranking" wins where a targeted post moves the needle.
 */
function opportunities(rows, max = 25) {
  return rows
    .filter((r) => r.impressions >= 5 && (r.position > 8 || r.ctr < 0.03))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, max)
}

/*
 * insightsBlock({ days }) — convenience wrapper for the writers. Returns
 *   { rows, opportunities, text }
 * where `text` is a ready-to-paste research note. Returns null (never throws)
 * if Search Console isn't configured or the call fails, so callers can simply
 * fall back to web-search-only topic selection.
 */
async function insightsBlock({ days = 90 } = {}) {
  if (!isConfigured()) return null
  try {
    const rows = await topQueries({ days })
    if (!rows.length) return null
    const opps = opportunities(rows)
    const fmt = (r) =>
      `- "${r.query}" — ${r.impressions} impressions, ${r.clicks} clicks, ` +
      `CTR ${(r.ctr * 100).toFixed(1)}%, avg position ${r.position.toFixed(1)}`

    const text =
      `REAL Google Search Console data for ${siteProperty()} (last ${days} days).\n\n` +
      `Top opportunity queries — people ARE searching these and finding us, but we\n` +
      `rank poorly or get few clicks. New, well-targeted articles here can win real traffic:\n` +
      (opps.map(fmt).join('\n') || '(none stood out)') +
      `\n\nHighest-impression queries overall (for context):\n` +
      rows.slice(0, 20).map(fmt).join('\n')

    return { rows, opportunities: opps, text }
  } catch (err) {
    console.error('[search-console] insights failed:', err.message)
    return null
  }
}

module.exports = {
  isConfigured,
  getAccessToken,
  topQueries,
  opportunities,
  insightsBlock,
  siteProperty,
}
