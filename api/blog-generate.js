/*
 * Signature Pianos — Generate a blog draft (manual, async)
 * --------------------------------------------------------
 * POST { topic, research?: boolean }  (admin only)  → 202 { jobId }
 *
 * Writes one SEO/AEO-optimised post from the given topic and saves it as a
 * DRAFT. If research=true, gathers current facts via web search first.
 *
 * Because research + writing can take minutes (too long to hold an HTTP
 * request open without a 504), this endpoint returns immediately with a job
 * id and finishes the work in the background via Vercel's waitUntil. The admin
 * UI polls /api/blog-job-status until the job is `done`.
 */

const { waitUntil } = require('@vercel/functions')
const { requireAdmin, research, supabaseAdmin } = require('../lib/ai')
const { generatePost, savePostDraft } = require('../lib/blog')

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    await requireAdmin(req)
  } catch (e) {
    return res.status(e.status || 401).json({ error: e.message || 'Unauthorized' })
  }

  const topic = (req.body?.topic || '').trim()
  if (!topic) return res.status(400).json({ error: 'Please provide a topic or brief.' })
  const doResearch = req.body?.research === true

  // Record the job up front so the client has something to poll.
  const { data: job, error: jobErr } = await supabaseAdmin
    .from('blog_jobs')
    .insert({ status: 'pending', kind: 'manual', topic, research: doResearch })
    .select('id')
    .single()
  if (jobErr) {
    console.error('[blog-generate] could not create job', jobErr)
    return res.status(500).json({ error: 'Could not start generation.' })
  }

  // Do the heavy lifting AFTER responding. waitUntil keeps the function alive
  // until the promise settles (bounded by this route's maxDuration).
  waitUntil(runJob(job.id, { topic, doResearch }))

  return res.status(202).json({ jobId: job.id })
}

async function runJob(jobId, { topic, doResearch }) {
  const set = (fields) =>
    supabaseAdmin.from('blog_jobs').update(fields).eq('id', jobId)

  try {
    await set({ status: 'running' })

    // Avoid repeating recent titles.
    const { data: recent } = await supabaseAdmin
      .from('blog_posts').select('title').order('created_at', { ascending: false }).limit(25)
    const avoidTitles = (recent || []).map((r) => r.title)

    let notes = ''
    if (doResearch) {
      notes = await research(
        `Research up-to-date, accurate facts for a blog article on: "${topic}". ` +
        `Focus on details relevant to Australian piano buyers. Summarise key points, ` +
        `specs, models, and any recent releases with sources.`
      )
    }

    const post = await generatePost({ topic, research: notes, avoidTitles })
    const saved = await savePostDraft(post, 'manual')
    await set({ status: 'done', post_id: saved.id, title: saved.title })
  } catch (err) {
    console.error('[blog-generate] job failed', err)
    await set({ status: 'error', error: String(err?.message || err).slice(0, 500) })
  }
}
