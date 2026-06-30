/*
 * Signature Pianos — run the auto-writer on demand (admin)
 * --------------------------------------------------------
 * POST (admin only). Same logic as the cron writer, but triggered manually
 * from the admin "Generate one now" button — so it's guarded by the admin
 * session rather than CRON_SECRET. Saves a draft and returns its title.
 */

const { requireAdmin, research, supabaseAdmin } = require('../lib/ai')
const { generatePost, savePostDraft } = require('../lib/blog')

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    await requireAdmin(req)
  } catch (e) {
    return res.status(e.status || 401).json({ error: e.message || 'Unauthorized' })
  }

  try {
    const { data: recent } = await supabaseAdmin
      .from('blog_posts').select('title').order('created_at', { ascending: false }).limit(40)
    const avoidTitles = (recent || []).map((r) => r.title)

    const notes = await research(
      `Research recent and upcoming Yamaha pianos and digital pianos and trending questions
Australian piano buyers are asking in ${new Date().getFullYear()}. Identify NEW model releases
and noteworthy comparisons worth writing about. Summarise concrete facts and sources.

Already covered (pick a DIFFERENT angle):
${avoidTitles.map((t) => '- ' + t).join('\n') || '(nothing yet)'}

End with one line: "CHOSEN TOPIC: <a specific, fresh article title or brief>".`
    )

    const chosen = (notes.match(/CHOSEN TOPIC:\s*(.+)/i) || [])[1]?.trim()
      || 'A buyer-focused guide to a current Yamaha or digital piano relevant to Australian buyers'

    const post = await generatePost({ topic: chosen, research: notes, avoidTitles })
    const saved = await savePostDraft(post, 'auto')
    try { await supabaseAdmin.from('blog_topics').insert({ topic: saved.title }) } catch (_) {}

    return res.status(200).json({ ok: true, created: saved.title, slug: saved.slug })
  } catch (err) {
    console.error('[run-blog-writer] failed', err)
    return res.status(502).json({ error: err.message || 'Failed' })
  }
}
