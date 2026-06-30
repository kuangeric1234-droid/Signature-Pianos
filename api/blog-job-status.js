/*
 * Signature Pianos — Blog generation job status (admin)
 * -----------------------------------------------------
 * POST { id }  (admin only)  → { id, status, post_id, title, error }
 *
 * The admin UI polls this after kicking off /api/blog-generate (or
 * /api/run-blog-writer) until status is `done` or `error`.
 */

const { requireAdmin, supabaseAdmin } = require('../lib/ai')

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    await requireAdmin(req)
  } catch (e) {
    return res.status(e.status || 401).json({ error: e.message || 'Unauthorized' })
  }

  const id = (req.body?.id || req.query?.id || '').trim()
  if (!id) return res.status(400).json({ error: 'Missing job id.' })

  const { data, error } = await supabaseAdmin
    .from('blog_jobs')
    .select('id, status, post_id, title, error')
    .eq('id', id)
    .single()

  if (error || !data) return res.status(404).json({ error: 'Job not found.' })
  return res.status(200).json(data)
}
