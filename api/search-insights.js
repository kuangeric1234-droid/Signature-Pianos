/*
 * Signature Pianos — top search queries from Google Search Console (admin)
 * ------------------------------------------------------------------------
 * POST (admin only). Returns the real queries people use to find the site, plus
 * the "opportunity" subset the blog writer prioritises. Read-only — purely for
 * visibility in the admin Auto-writer tab.
 *
 * Responds 200 with { configured:false } (not an error) when the GSC env vars
 * aren't set yet, so the UI can show a friendly "connect Search Console" hint.
 */

const { requireAdmin } = require('../lib/ai')
const { isConfigured, topQueries, opportunities, siteProperty } = require('../lib/search-console')

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    await requireAdmin(req)
  } catch (e) {
    return res.status(e.status || 401).json({ error: e.message || 'Unauthorized' })
  }

  if (!isConfigured()) {
    return res.status(200).json({ configured: false })
  }

  try {
    const days = Math.min(Math.max(parseInt(req.body?.days, 10) || 90, 7), 480)
    const rows = await topQueries({ days })
    return res.status(200).json({
      configured: true,
      property: siteProperty(),
      days,
      total: rows.length,
      top: rows.slice(0, 30),
      opportunities: opportunities(rows),
    })
  } catch (err) {
    console.error('[search-insights] failed', err)
    return res.status(502).json({ error: err.message || 'Could not load search data' })
  }
}
