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
const { writeAutoDraft, runBlogJob } = require('../lib/blog')

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

  // runBlogJob never throws and always leaves the row 'done' or 'error'.
  // Same run as the cron: the planned queue first, free choice if it's empty.
  waitUntil(runBlogJob(job.id, async ({ deadline, setTopic }) => {
    const { post } = await writeAutoDraft({ onTopic: setTopic, deadline })
    return post
  }))
  return res.status(202).json({ jobId: job.id })
}
