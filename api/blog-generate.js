/*
 * Signature Pianos — Generate a blog draft (manual)
 * -------------------------------------------------
 * POST { topic, research?: boolean }  (admin only)
 *
 * Writes one SEO/AEO-optimised post from the given topic and saves it as a
 * DRAFT. If research=true, gathers current facts via web search first.
 * Returns the saved draft for review in the admin.
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

  const topic = (req.body?.topic || '').trim()
  if (!topic) return res.status(400).json({ error: 'Please provide a topic or brief.' })
  const doResearch = req.body?.research === true

  try {
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
    return res.status(200).json({ post: saved })
  } catch (err) {
    console.error('[blog-generate] failed', err)
    return res.status(502).json({ error: err.message || 'Generation failed' })
  }
}
