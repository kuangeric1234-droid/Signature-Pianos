/*
 * Signature Pianos — Blog generation job status (admin)
 * -----------------------------------------------------
 * POST { id }  (admin only)  → { id, status, post_id, title, error }
 *
 * The admin UI polls this after kicking off /api/blog-generate (or
 * /api/run-blog-writer) until status is `done` or `error`.
 *
 * The job's final status is written by the invocation doing the work. If
 * Vercel kills that invocation (maxDuration 300) its catch never runs, so a
 * job still pending/running well past the limit is dead: mark it 'error'
 * here so the admin sees it and can try again.
 */

const { requireAdmin, supabaseAdmin } = require('../lib/ai')

// maxDuration is 300s; a live job always updates its row within that.
const STALE_AFTER_MS = 6 * 60 * 1000

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    await requireAdmin(req)
  } catch (e) {
    return res.status(e.status || 401).json({ error: e.message || 'Unauthorized' })
  }

  const id = String(req.body?.id || req.query?.id || '').trim()
  if (!id) return res.status(400).json({ error: 'Missing job id.' })

  const { data, error } = await supabaseAdmin
    .from('blog_jobs')
    .select('id, status, post_id, title, error, updated_at')
    .eq('id', id)
    .single()

  if (error || !data) return res.status(404).json({ error: 'Job not found.' })

  const { updated_at, ...job } = data
  const age = Date.now() - new Date(updated_at).getTime()
  if ((job.status === 'pending' || job.status === 'running') && age > STALE_AFTER_MS) {
    const message = 'Timed out: the writer was stopped before it finished. Please try again.'
    // Only flip it if it is still unfinished (the job may have just landed).
    const { data: flipped } = await supabaseAdmin
      .from('blog_jobs')
      .update({ status: 'error', error: message })
      .eq('id', id)
      .in('status', ['pending', 'running'])
      .select('id, status, post_id, title, error')
      .maybeSingle()
    if (flipped) return res.status(200).json(flipped)
    const { data: fresh } = await supabaseAdmin
      .from('blog_jobs').select('id, status, post_id, title, error').eq('id', id).maybeSingle()
    return res.status(200).json(fresh || { ...job, status: 'error', error: message })
  }

  return res.status(200).json(job)
}
