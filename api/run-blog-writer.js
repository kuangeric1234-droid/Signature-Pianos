/*
 * Signature Pianos — run the auto-writer on demand (admin, async)
 * ---------------------------------------------------------------
 * POST (admin only)  → 202 { jobId }
 *
 * Same logic as the cron writer, but triggered manually from the admin
 * "Generate one now" button. Research + writing can take minutes, so this
 * returns a job id immediately and finishes in the background (waitUntil);
 * the admin UI polls /api/blog-job-status.
 */

const { waitUntil } = require('@vercel/functions')
const { requireAdmin, research, supabaseAdmin } = require('../lib/ai')
const { generatePost, savePostDraft } = require('../lib/blog')
const { insightsBlock } = require('../lib/search-console')

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

    const { data: recent } = await supabaseAdmin
      .from('blog_posts').select('title').order('created_at', { ascending: false }).limit(40)
    const avoidTitles = (recent || []).map((r) => r.title)

    // Pull REAL search demand from Google Search Console (null if not set up).
    const gsc = await insightsBlock({ days: 90 })
    const demandBlock = gsc
      ? `\n\nPRIORITISE these real searches our own site already gets impressions for
(prefer a topic that directly answers one of the opportunity queries):
${gsc.text}\n`
      : ''

    const notes = await research(
      `Research recent and upcoming Yamaha pianos and digital pianos and trending questions
Australian piano buyers are asking in ${new Date().getFullYear()}. Identify NEW model releases
and noteworthy comparisons worth writing about. Summarise concrete facts and sources.${demandBlock}

Already covered (pick a DIFFERENT angle):
${avoidTitles.map((t) => '- ' + t).join('\n') || '(nothing yet)'}

End with one line: "CHOSEN TOPIC: <a specific, fresh article title or brief>".`
    )

    const chosen = (notes.match(/CHOSEN TOPIC:\s*(.+)/i) || [])[1]?.trim()
      || 'A buyer-focused guide to a current Yamaha or digital piano relevant to Australian buyers'

    const post = await generatePost({ topic: chosen, research: notes, avoidTitles })
    const saved = await savePostDraft(post, 'auto')
    try { await supabaseAdmin.from('blog_topics').insert({ topic: saved.title }) } catch (_) {}

    await set({ status: 'done', post_id: saved.id, title: saved.title })
  } catch (err) {
    console.error('[run-blog-writer] job failed', err)
    await set({ status: 'error', error: String(err?.message || err).slice(0, 500) })
  }
}
