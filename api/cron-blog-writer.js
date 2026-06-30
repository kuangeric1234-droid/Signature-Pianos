/*
 * Signature Pianos — auto-loop blog writer (cron)
 * -----------------------------------------------
 * Hit by Vercel Cron (schedule in vercel.json — Mon/Wed/Fri). Researches
 * new Yamaha / digital piano releases and piano-buyer topics via web search,
 * picks a fresh angle, writes a full SEO/AEO post, and saves it as a DRAFT
 * for admin review. It never auto-publishes.
 *
 * Auth: Vercel attaches `Authorization: Bearer ${CRON_SECRET}` automatically,
 * so we reject anything else (keeps the endpoint unhittable publicly).
 */

const { research, supabaseAdmin } = require('../lib/ai')
const { generatePost, savePostDraft } = require('../lib/blog')
const { insightsBlock } = require('../lib/search-console')

module.exports = async (req, res) => {
  const expected = process.env.CRON_SECRET
  const got = req.headers.authorization || ''
  // Allow Vercel cron (bearer secret). Also allow a manually-triggered run
  // from the admin via the same secret if ever needed.
  if (!expected || got !== `Bearer ${expected}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    // What have we covered recently? Avoid repeats.
    const { data: recent } = await supabaseAdmin
      .from('blog_posts').select('title').order('created_at', { ascending: false }).limit(40)
    const avoidTitles = (recent || []).map((r) => r.title)

    // 0. Pull REAL search demand from Google Search Console (null if not set up).
    const gsc = await insightsBlock({ days: 90 })
    const demandBlock = gsc
      ? `\n\nPRIORITISE these real searches our own site already gets impressions for
(prefer a topic that directly answers one of the opportunity queries):
${gsc.text}\n`
      : ''

    // 1. Research the landscape and choose a topic.
    const notes = await research(
      `Research recent and upcoming Yamaha pianos and digital pianos (acoustic uprights,
grands, Clavinova, P-series, Arius, hybrid pianos) and trending questions Australian
piano buyers are asking in ${new Date().getFullYear()}. Identify NEW model releases and
noteworthy comparisons worth writing about. Summarise concrete facts and sources.${demandBlock}

We have already published about these — suggest a DIFFERENT angle:
${avoidTitles.map((t) => '- ' + t).join('\n') || '(nothing yet)'}

End your notes with one line: "CHOSEN TOPIC: <a specific, fresh article title or brief>".`
    )

    const chosen = (notes.match(/CHOSEN TOPIC:\s*(.+)/i) || [])[1]?.trim()
      || 'A buyer-focused guide to a current Yamaha or digital piano relevant to Australian buyers'

    // 2. Write the post grounded in the research.
    const post = await generatePost({ topic: chosen, research: notes, avoidTitles })
    const saved = await savePostDraft(post, 'auto')

    // 3. Remember the topic.
    try { await supabaseAdmin.from('blog_topics').insert({ topic: saved.title }) } catch (_) {}

    return res.status(200).json({ ok: true, created: saved.title, slug: saved.slug })
  } catch (err) {
    console.error('[cron-blog-writer] failed', err)
    return res.status(500).json({ error: err.message || 'Failed' })
  }
}
