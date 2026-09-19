/*
 * Signature Pianos — run the auto-writer on demand (admin, async)
 * ---------------------------------------------------------------
 * POST (admin only)  → 202 { jobId }
 *
 * Same logic as the cron writer (lib/blog.js writeAutoDraft: the planned
 * topic queue first, free choice when it's empty), but triggered manually
 * from the admin "Generate one now" button. Research + writing can take
 * minutes, so this returns a job id immediately and finishes in the
 * background (waitUntil); the admin UI polls /api/blog-job-status.
 */

const { waitUntil } = require('@vercel/functions')
const { requireAdmin, supabaseAdmin } = require('../lib/ai')
const { writeAutoDraft } = require('../lib/blog')

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    await requireAdmin(req)
  } catch (e) {
    return res.status(e.status || 401).json({ error: e.message || 'Unauthorized' })
  }

  const { data: job, error: jobErr } = await supabaseAdmin
    .from('blog_jobs')
    .insert({ status: 'pending', kind: 'auto', research: true })
    .select('id')
    .single()
  if (jobErr) {
    console.error('[run-blog-writer] could not create job', jobErr)
    return res.status(500).json({ error: 'Could not start generation.' })
  }

  waitUntil(runJob(job.id))
  return res.status(202).json({ jobId: job.id })
}

async function runJob(jobId) {
  const set = (fields) =>
    supabaseAdmin.from('blog_jobs').update(fields).eq('id', jobId)

  try {
    await set({ status: 'running' })

    // Same run as the cron: the planned queue first, free choice if it's empty.
    const { post: saved } = await writeAutoDraft({ onTopic: (topic) => set({ topic }) })

    await set({ status: 'done', post_id: saved.id, title: saved.title })
  } catch (err) {
    console.error('[run-blog-writer] job failed', err)
    await set({ status: 'error', error: String(err?.message || err).slice(0, 500) })
  }
}
