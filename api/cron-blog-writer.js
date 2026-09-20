/*
 * Signature Pianos — auto-loop blog writer (cron)
 * -----------------------------------------------
 * Hit by Vercel Cron (schedule in vercel.json — Mon/Wed/Fri). Takes the
 * highest-priority topic from the planned queue (blog_topic_queue, seeded by
 * supabase/blog_topic_plan.sql), researches current facts for its brief,
 * writes a full SEO/AEO post and saves it as a DRAFT for admin review, then
 * marks the topic used. With an empty or missing queue it falls back to
 * choosing a fresh topic from web research and Search Console, as before.
 * It never auto-publishes. The logic lives in lib/blog.js (writeAutoDraft).
 *
 * Auth: Vercel attaches `Authorization: Bearer ${CRON_SECRET}` automatically,
 * so we reject anything else (keeps the endpoint unhittable publicly).
 */

const { supabaseAdmin } = require('../lib/ai')
const { writeAutoDraft, runBlogJob } = require('../lib/blog')

module.exports = async (req, res) => {
  const expected = process.env.CRON_SECRET
  const got = req.headers.authorization || ''
  // Allow Vercel cron (bearer secret). Also allow a manually-triggered run
  // from the admin via the same secret if ever needed.
  if (!expected || got !== `Bearer ${expected}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Record the run as a blog_jobs row (kind 'auto') so the admin sees cron
  // runs and failures; runBlogJob always leaves it 'done' or 'error'.
  const { data: job, error: jobErr } = await supabaseAdmin
    .from('blog_jobs')
    .insert({ status: 'pending', kind: 'auto', research: true })
    .select('id')
    .single()
  if (jobErr) {
    console.error('[cron-blog-writer] could not create job', jobErr)
    return res.status(500).json({ error: 'Could not start generation.' })
  }

  let topic = null
  const result = await runBlogJob(job.id, async ({ deadline, setTopic }) => {
    const run = await writeAutoDraft({ onTopic: setTopic, deadline })
    topic = run.topic
    return run.post
  })
  if (result.error) {
    return res.status(500).json({ error: result.error, jobId: job.id })
  }
  return res.status(200).json({
    ok: true,
    jobId: job.id,
    created: result.post.title,
    slug: result.post.slug,
    fromQueue: !!topic,
    queuedTopic: topic ? topic.working_title : null,
  })
}
