/*
 * Signature Pianos — SEO engine door (POST /api/seo-engine)
 * ---------------------------------------------------------
 * The only way the /seo-engine cloud routine touches the site. Body:
 * { action, ...params }; see lib/seo-engine.js for the actions. It can read
 * the blog, save drafts, propose updates, work the topic queue and email
 * Eric; it can't publish or read anything outside the blog tables.
 *
 * Auth: Authorization: Bearer ${SEO_ENGINE_SECRET}. The same secret is set in
 * Vercel and in the routine's cloud environment, and nowhere else.
 */

const crypto = require('crypto')
const { handle } = require('../lib/seo-engine')

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const secret = process.env.SEO_ENGINE_SECRET
  if (!secret) return res.status(503).json({ error: 'SEO_ENGINE_SECRET is not set on this deployment' })
  const got = Buffer.from(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''))
  const want = Buffer.from(secret)
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { action, ...params } = req.body || {}
  try {
    return res.status(200).json(await handle(action, params))
  } catch (err) {
    if (!err.status || err.status >= 500) console.error('[seo-engine]', action, err)
    return res.status(err.status || 500).json({ error: err.message || 'Failed', ...(err.extra ? { details: err.extra } : {}) })
  }
}
