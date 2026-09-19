/*
 * Signature Pianos — SEO engine (server side)
 * -------------------------------------------
 * Everything the /seo-engine routine may do to the site, behind one narrow
 * door: api/seo-engine.js, authorised with SEO_ENGINE_SECRET. The routine
 * runs in Anthropic's cloud and reads arbitrary web pages, so it never holds
 * a database key. Through here it can read the blog, save DRAFTS, propose
 * updates to published posts, work the topic queue, log its runs and email
 * Eric. It cannot publish, change a live article, or read anything outside
 * the blog tables.
 *
 * tools/seo/engine.mjs --local calls handle() directly with .env.local, so
 * a run on this machine and a cloud run share one implementation.
 *
 * Each run ends with exactly one terminal call, which logs the run and sends
 * any email: save_draft, propose_update, mark_checked or log.
 * Tables: blog_post_seo, seo_engine_runs (supabase/seo_engine.sql),
 * blog_posts, blog_topic_queue.
 */

const { supabaseAdmin: sb } = require('./ai')
const { checkDraft, ALLOWED_PATHS, SITE_PAGES } = require('./seo-draft-check')
const { internalRecipients } = require('./notify')
const { layout, p, h2, details, note, button, steps, esc } = require('./email-brand')
const searchConsole = require('./search-console')

const TZ = 'Australia/Melbourne'
const SITE_URL = process.env.SITE_URL || 'https://signaturepianos.com.au'
const ADMIN_MARKETING = 'https://admin.signaturepianos.com.au/marketing.html'
const FROM = 'Signature Pianos <info@signaturepianos.com.au>'
const INDEXNOW_KEY = 'dd3206669f43824113d38e94137005ad' // served from /<key>.txt at the site root

const BACKLOG_CAP = 5       // drafts + proposed updates waiting for Eric before the engine stops adding more
const QUEUE_LOW = 6         // below this many queued topics, a queue run researches new ones
const NUDGE_EVERY_DAYS = 6  // at most one "waiting for you" reminder this often
const SERP_STALE_DAYS = 60  // an older SERP verdict is rechecked before writing

const VERDICTS = ['open', 'weakly-occupied', 'contested', 'crowded', 'mismatch']
const INTENTS = ['commercial', 'informational', 'local']
const FUNNEL = ['awareness', 'consideration', 'decision', 'owner']

class EngineError extends Error {
  constructor(status, message, extra) {
    super(message)
    this.status = status
    this.extra = extra
  }
}

/* ---------- small helpers ---------- */

function melbDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

function longDate(s) {
  const d = typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T12:00:00Z') : new Date(s || Date.now())
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ })
}

function monthName(d = new Date()) {
  return d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric', timeZone: TZ })
}

const daysSince = (iso) => (Date.now() - new Date(iso).getTime()) / 86400000
const str = (v, max) => String(v ?? '').trim().slice(0, max)
const list = (v, max = 20, len = 300) => (Array.isArray(v) ? v : []).map((x) => str(x, len)).filter(Boolean).slice(0, max)
const notesList = (v) => (Array.isArray(v) ? list(v, 30, 1000) : str(v, 6000).split(/\n+/).map((s) => s.replace(/^[-*]\s*/, '').trim()).filter(Boolean))

async function q(query) {
  const { data, error } = await query
  if (error) throw new EngineError(500, error.message)
  return data
}

/* ---------- state ---------- */

async function loadState() {
  const [posts, seo, queue, runs, pings] = await Promise.all([
    q(sb.from('blog_posts').select('id, slug, title, status, source, keywords, created_at, published_at').order('created_at', { ascending: false })),
    q(sb.from('blog_post_seo').select('post_id, primary_keyword, reverify_by, reverify_notes, last_checked_at, proposed_update')),
    q(sb.from('blog_topic_queue')
      .select('id, topic_key, priority, working_title, primary_keyword, intent, funnel_stage, status, hold_reason, serp_verdict, serp_checked_at, post_id')
      .order('priority', { ascending: true }).order('created_at', { ascending: true })),
    q(sb.from('seo_engine_runs').select('id, ran_at, action, summary, post_id, topic_id, emailed, details').order('ran_at', { ascending: false }).limit(60)),
    q(sb.from('seo_engine_runs').select('details').eq('action', 'ping')),
  ])
  const bySeo = new Map(seo.map((s) => [s.post_id, s]))
  const merged = posts.map((row) => {
    const s = bySeo.get(row.id) || {}
    return {
      ...row,
      primary_keyword: s.primary_keyword || (row.keywords || [])[0] || null,
      reverify_by: s.reverify_by || null,
      reverify_notes: s.reverify_notes || null,
      last_checked_at: s.last_checked_at || null,
      proposal: s.proposed_update ? { proposed_at: s.proposed_update.proposed_at, notes: s.proposed_update.notes } : null,
    }
  })
  const pinged = new Set(pings.flatMap((r) => (r.details && r.details.urls) || []))
  return { posts: merged, queue, runs, pinged }
}

function backlogOf(posts) {
  const drafts = posts.filter((x) => x.status === 'draft')
  const proposals = posts.filter((x) => x.proposal)
  return { drafts, proposals, waiting: drafts.length + proposals.length }
}

/*
 * The one job for this run, in order: the monthly review; if Eric has a
 * full backlog, queue work only; a live article due for a recheck; research
 * topics when the queue is empty; otherwise the next queued article.
 */
function decideNext({ posts, queue, runs }) {
  const today = melbDate()
  const month = today.slice(0, 7)
  const { waiting } = backlogOf(posts)
  const reviewDone = runs.some((r) => ['review', 'setup'].includes(r.action) && melbDate(new Date(r.ran_at)).slice(0, 7) === month)
  const due = posts
    .filter((x) => x.status === 'published' && !x.proposal && (!x.reverify_by || x.reverify_by <= today))
    .sort((a, b) => String(a.reverify_by || '').localeCompare(String(b.reverify_by || '')))
  const queued = queue.filter((t) => t.status === 'queued')

  if (!reviewDone) {
    return { action: 'review', reason: `No review yet in ${monthName()}. The monthly review comes first.` }
  }
  if (waiting >= BACKLOG_CAP) {
    return { action: 'queue', reason: `${waiting} items are waiting for Eric (cap ${BACKLOG_CAP}). No new drafts or updates until he clears some; prepare the queue instead.` }
  }
  if (due.length) {
    const x = due[0]
    return { action: 'refresh', target: x.slug, reason: `"${x.title}" was due for a recheck ${x.reverify_by ? 'on ' + x.reverify_by : '(never checked)'}. Keeping live articles true comes before adding new ones.` }
  }
  if (!queued.length) {
    return { action: 'queue', reason: 'The topic queue is empty. Research new topics.' }
  }
  const t = queued[0]
  return { action: 'draft', target: t.topic_key, reason: `The highest-priority queued topic (priority ${t.priority}).` }
}

/* ---------- email ---------- */

function textBlocks(s, max = 6000) {
  return esc(str(s, max)).split(/\n{2,}/).map((par) => p(par.replace(/\n/g, '<br>'), { small: true })).join('')
}

async function sendEmail({ subject, preview, title, body }) {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.warn('[seo-engine] RESEND_API_KEY not set: email skipped')
    return false
  }
  try {
    const { Resend } = require('resend')
    const resend = new Resend(key)
    const { error } = await resend.emails.send({
      from: FROM,
      to: internalRecipients(),
      subject,
      html: layout({ internal: true, label: 'SEO engine', preview, title, body }),
    })
    if (error) {
      console.error('[seo-engine] email failed', error)
      return false
    }
    return true
  } catch (err) {
    console.error('[seo-engine] email failed', err)
    return false
  }
}

async function logRun({ action, summary, post_id = null, topic_id = null, emailed = false, details: extra = {} }) {
  return q(sb.from('seo_engine_runs')
    .insert({ action, summary: str(summary, 2000), post_id, topic_id, emailed, details: extra })
    .select('id, ran_at, action, summary').single())
}

/* ---------- actions ---------- */

async function status() {
  const state = await loadState()
  const { drafts, proposals, waiting } = backlogOf(state.posts)
  const queued = state.queue.filter((t) => t.status === 'queued')
  const count = (s) => state.queue.filter((t) => t.status === s).length
  return {
    today: melbDate(),
    next: decideNext(state),
    backlog: {
      waiting,
      cap: BACKLOG_CAP,
      drafts: drafts.map((x) => ({ slug: x.slug, title: x.title, created: melbDate(new Date(x.created_at)) })),
      proposals: proposals.map((x) => ({ slug: x.slug, title: x.title, proposed: x.proposal.proposed_at })),
    },
    posts: state.posts.map((x) => ({
      slug: x.slug, title: x.title, status: x.status, primary_keyword: x.primary_keyword,
      published: x.published_at ? melbDate(new Date(x.published_at)) : null,
      reverify_by: x.reverify_by, last_checked: x.last_checked_at ? melbDate(new Date(x.last_checked_at)) : null,
      has_proposal: !!x.proposal,
    })),
    queue: {
      queued: queued.length, used: count('used'), skipped: count('skipped'), low: queued.length < QUEUE_LOW,
      next: queued.slice(0, 8).map((t) => ({
        topic_key: t.topic_key, priority: t.priority, working_title: t.working_title, primary_keyword: t.primary_keyword,
        serp_verdict: t.serp_verdict, serp_checked: t.serp_checked_at ? melbDate(new Date(t.serp_checked_at)) : null,
        serp_stale: !t.serp_checked_at || daysSince(t.serp_checked_at) > SERP_STALE_DAYS,
      })),
      skipped_topics: state.queue.filter((t) => t.status === 'skipped').map((t) => ({ topic_key: t.topic_key, hold_reason: t.hold_reason })),
    },
    runs: state.runs.slice(0, 10).map((r) => ({ ran: r.ran_at, action: r.action, summary: r.summary })),
    pings_due: state.posts.filter((x) => x.status === 'published' && !state.pinged.has(`${SITE_URL}/blog/${x.slug}`)).map((x) => x.slug),
    search_console: searchConsole.isConfigured(),
    limits: { BACKLOG_CAP, QUEUE_LOW, SERP_STALE_DAYS },
  }
}

async function getPost({ slug }) {
  const post = await q(sb.from('blog_posts').select('*').eq('slug', str(slug, 200)).maybeSingle())
  if (!post) throw new EngineError(404, `No post with slug "${slug}"`)
  const seo = await q(sb.from('blog_post_seo').select('*').eq('post_id', post.id).maybeSingle())
  return { post, seo }
}

async function getTopic({ topic_key }) {
  const topic = await q(sb.from('blog_topic_queue').select('*').eq('topic_key', str(topic_key, 100)).maybeSingle())
  if (!topic) throw new EngineError(404, `No topic "${topic_key}"`)
  return { topic }
}

async function topicById(id) {
  if (!id) return null
  const topic = await q(sb.from('blog_topic_queue').select('*').eq('id', str(id, 60)).maybeSingle())
  if (!topic) throw new EngineError(400, `topic_id ${id} not found`)
  return topic
}

async function check({ draft = {}, partial = false, slug = null }) {
  const state = await loadState()
  const topic = !partial && draft && draft.topic_id ? await topicById(draft.topic_id) : null
  const self = slug ? state.posts.find((x) => x.slug === slug) : null
  const d = self && !draft.primary_keyword ? { ...draft, primary_keyword: self.primary_keyword } : draft
  const result = checkDraft(d, { posts: state.posts, topic, partial: !!partial, selfSlug: slug })
  return {
    ...result,
    we_already_target: [...state.posts.filter((x) => x.slug !== (slug || (draft && draft.slug))), ...SITE_PAGES]
      .map((x) => ({ keyword: x.primary_keyword, slug: x.slug, status: x.status })),
  }
}

async function saveDraft({ draft }) {
  const d = draft || {}
  const state = await loadState()
  const topic = await topicById(d.topic_id)
  if (topic && topic.status !== 'queued') throw new EngineError(409, `Topic "${topic.topic_key}" is ${topic.status}, not queued`)
  const result = checkDraft(d, { posts: state.posts, topic })
  if (result.failures.length) throw new EngineError(422, 'The draft fails the checks. Fix it and save again.', result)

  let slug = d.slug
  for (let n = 2; state.posts.some((x) => x.slug === slug); n++) slug = `${d.slug}-${n}`

  const post = await q(sb.from('blog_posts').insert({
    slug,
    title: str(d.title, 200),
    meta_description: str(d.meta_description, 300),
    excerpt: str(d.excerpt, 600),
    body_html: String(d.body_html).slice(0, 100000),
    tags: list(d.tags, 3, 40),
    keywords: list(d.keywords, 8, 120),
    faq: (d.faq || []).slice(0, 6).map((f) => ({ question: str(f.question, 300), answer: str(f.answer, 1200) })),
    author: 'Eric Kuang',
    status: 'draft',
    source: 'auto',
  }).select('id, slug, title').single())

  const now = new Date().toISOString()
  await q(sb.from('blog_post_seo').upsert({
    post_id: post.id,
    primary_keyword: str(d.primary_keyword, 120),
    reverify_by: d.reverify_by,
    reverify_notes: str(d.reverify_notes, 4000),
    research_notes: str(d.research_notes, 20000),
    last_checked_at: now,
  }))
  if (topic) {
    await q(sb.from('blog_topic_queue').update({ status: 'used', used_at: now, post_id: post.id }).eq('id', topic.id))
  }

  const { stats, warnings } = result
  const body = [
    p('A new article for The Journal is waiting in the admin as a draft. Nothing goes live until you press Publish.', { first: true }),
    details([
      ['Title', `<strong>${esc(post.title)}</strong>`],
      ['Answers the search', esc(d.primary_keyword)],
      ['Length', `${stats.words} words, ${stats.faq} FAQs`],
      ['Recheck by', esc(longDate(d.reverify_by))],
    ]),
    stats.verify.length ? h2('Check before publishing') + steps(stats.verify.map((v) => esc(v))) : '',
    warnings.length ? h2('Borderline, for your judgement') + steps(warnings.slice(0, 8).map((w) => esc(w))) : '',
    h2('What ranks today'),
    textBlocks(d.research_notes, 2500),
    button(ADMIN_MARKETING, 'Review the draft'),
  ].join('')
  const emailed = await sendEmail({
    subject: `New Journal draft: ${post.title}`,
    preview: `Written for "${d.primary_keyword}". ${stats.verify.length} things to check before it goes live.`,
    title: 'A new draft',
    body,
  })
  await logRun({
    action: 'draft',
    summary: `Drafted "${post.title}" for "${d.primary_keyword}".`,
    post_id: post.id,
    topic_id: topic ? topic.id : null,
    emailed,
    details: { words: stats.words, verify: stats.verify.length, warnings: warnings.length },
  })
  return { post, checks: result, emailed }
}

const UPDATE_FIELDS = ['title', 'meta_description', 'excerpt', 'body_html', 'faq']

async function proposeUpdate({ slug, update = {}, notes, reverify_by, reverify_notes, research_notes }) {
  const { post, seo } = await getPost({ slug })
  if (post.status !== 'published') throw new EngineError(409, 'Only published posts take proposed updates; drafts are edited directly in the admin.')
  const fields = {}
  for (const k of UPDATE_FIELDS) if (update && update[k] !== undefined && update[k] !== null) fields[k] = update[k]
  if (!Object.keys(fields).length) throw new EngineError(400, `update must change at least one of: ${UPDATE_FIELDS.join(', ')}`)
  if (!reverify_by) throw new EngineError(400, 'reverify_by is required: when should this article be rechecked next?')
  const changes = notesList(notes)
  if (!changes.length) throw new EngineError(400, 'notes are required: what changed, and the source for each change')

  const state = await loadState()
  const result = checkDraft(
    { ...fields, notes: changes, reverify_by, primary_keyword: seo && seo.primary_keyword },
    { posts: state.posts, partial: true, selfSlug: post.slug },
  )
  if (result.failures.length) throw new EngineError(422, 'The update fails the checks. Fix it and propose again.', result)

  const now = new Date().toISOString()
  await q(sb.from('blog_post_seo').upsert({
    post_id: post.id,
    proposed_update: { ...fields, notes: changes, reverify_by, reverify_notes: str(reverify_notes, 4000) || null, proposed_at: now },
    ...(research_notes ? { research_notes: str(research_notes, 20000) } : {}),
    last_checked_at: now,
  }))

  const body = [
    p(`The engine rechecked a live article and suggests an update. The live page hasn't changed. Open it in the admin, load the suggestion into the editor, read it, then Save.`, { first: true }),
    details([
      ['Article', `<a href="${SITE_URL}/blog/${esc(post.slug)}">${esc(post.title)}</a>`],
      ['Fields changed', esc(Object.keys(fields).join(', '))],
      ['Next recheck', esc(longDate(reverify_by))],
    ]),
    h2('What changed, and why'),
    steps(changes.map((c) => esc(c))),
    result.stats.verify.length ? h2('Check before saving') + steps(result.stats.verify.map((v) => esc(v))) : '',
    button(ADMIN_MARKETING, 'Review the update'),
  ].join('')
  const emailed = await sendEmail({
    subject: `Suggested update: ${post.title}`,
    preview: `${changes.length} change${changes.length === 1 ? '' : 's'} to a live article. Nothing changes until you save.`,
    title: 'A suggested update',
    body,
  })
  await logRun({
    action: 'refresh',
    summary: `Proposed ${changes.length} change${changes.length === 1 ? '' : 's'} to "${post.title}".`,
    post_id: post.id,
    emailed,
    details: { fields: Object.keys(fields), changes },
  })
  return { post: { id: post.id, slug: post.slug, title: post.title }, checks: result, emailed }
}

async function markChecked({ slug, reverify_by, reverify_notes, notes }) {
  const { post } = await getPost({ slug })
  if (post.status !== 'published') throw new EngineError(409, 'Only published posts are rechecked')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reverify_by || '') || daysSince(reverify_by) > -14) {
    throw new EngineError(400, 'reverify_by must be a YYYY-MM-DD date at least two weeks away')
  }
  const summary = str(notes, 2000)
  if (!summary) throw new EngineError(400, 'notes are required: what was checked, and against which sources')
  await q(sb.from('blog_post_seo').upsert({
    post_id: post.id,
    reverify_by,
    ...(reverify_notes ? { reverify_notes: str(reverify_notes, 4000) } : {}),
    last_checked_at: new Date().toISOString(),
  }))
  const run = await logRun({ action: 'checked', summary: `Rechecked "${post.title}": still accurate. ${summary}`, post_id: post.id, details: { reverify_by } })
  return { run }
}

function cleanTopic(t, nextPriority) {
  const key = str(t.topic_key, 60)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)) throw new Error(`topic_key "${key}" is not kebab-case`)
  const primary = str(t.primary_keyword, 100).toLowerCase()
  if (!primary) throw new Error('primary_keyword is required')
  if (!str(t.working_title, 160)) throw new Error('working_title is required')
  if (!str(t.brief, 6000)) throw new Error('brief is required: the angle, sourced facts and cautions')
  const intent = list(t.intent, 3, 20)
  if (intent.some((i) => !INTENTS.includes(i))) throw new Error(`intent must be from ${INTENTS.join(', ')}`)
  if (t.funnel_stage && !FUNNEL.includes(t.funnel_stage)) throw new Error(`funnel_stage must be one of ${FUNNEL.join(', ')}`)
  const links = list(t.internal_links, 6, 200)
  for (const l of links) if (!ALLOWED_PATHS.includes(l) && !/^\/blog\/[a-z0-9-]+$/.test(l)) throw new Error(`internal link ${l} isn't an allowed page`)
  if (t.serp_verdict && !VERDICTS.includes(t.serp_verdict)) throw new Error(`serp_verdict must be one of ${VERDICTS.join(', ')}`)
  return {
    topic_key: key,
    priority: Number.isInteger(t.priority) && t.priority > 0 ? t.priority : nextPriority,
    working_title: str(t.working_title, 160),
    primary_keyword: primary,
    secondary_keywords: list(t.secondary_keywords, 8, 120),
    intent,
    funnel_stage: t.funnel_stage || null,
    brief: str(t.brief, 6000),
    faq_questions: list(t.faq_questions, 8, 300),
    internal_links: links,
    status: 'queued',
    ...(t.serp_verdict ? { serp_verdict: t.serp_verdict, serp_checked_at: new Date().toISOString(), serp_notes: str(t.serp_notes, 4000) } : {}),
  }
}

async function queueAdd({ topics }) {
  if (!Array.isArray(topics) || !topics.length) throw new EngineError(400, 'topics: a non-empty array')
  if (topics.length > 10) throw new EngineError(400, 'at most 10 topics per call')
  const state = await loadState()
  const taken = new Map([
    ...state.posts.filter((x) => x.primary_keyword).map((x) => [x.primary_keyword.toLowerCase(), `post "${x.title}"`]),
    ...state.queue.map((t) => [t.primary_keyword.toLowerCase(), `topic "${t.topic_key}" (${t.status})`]),
    ...SITE_PAGES.map((x) => [x.primary_keyword, `the page ${x.slug}`]),
  ])
  const keys = new Set(state.queue.map((t) => t.topic_key))
  let nextPriority = Math.max(0, ...state.queue.map((t) => t.priority)) + 1
  const rows = []
  const skipped = []
  for (const t of topics) {
    try {
      const row = cleanTopic(t || {}, nextPriority)
      if (keys.has(row.topic_key)) { skipped.push({ topic_key: row.topic_key, reason: 'topic_key already exists' }); continue }
      if (taken.has(row.primary_keyword)) { skipped.push({ topic_key: row.topic_key, reason: `"${row.primary_keyword}" is already targeted by ${taken.get(row.primary_keyword)}` }); continue }
      taken.set(row.primary_keyword, `topic "${row.topic_key}"`)
      keys.add(row.topic_key)
      if (row.priority === nextPriority) nextPriority++
      rows.push(row)
    } catch (err) {
      skipped.push({ topic_key: t && t.topic_key, reason: err.message })
    }
  }
  const added = rows.length ? await q(sb.from('blog_topic_queue').insert(rows).select('topic_key, priority')) : []
  return { added, skipped }
}

const PATCHABLE = ['priority', 'working_title', 'primary_keyword', 'secondary_keywords', 'faq_questions', 'internal_links', 'brief', 'serp_verdict', 'serp_notes', 'status', 'hold_reason', 'intent', 'funnel_stage']

async function queueUpdate({ topic_key, patch = {} }) {
  const { topic } = await getTopic({ topic_key })
  if (topic.status === 'used') throw new EngineError(409, `Topic "${topic_key}" is already used by a post`)
  const upd = {}
  for (const k of PATCHABLE) if (patch[k] !== undefined) upd[k] = patch[k]
  if (upd.status !== undefined && !['queued', 'skipped'].includes(upd.status)) throw new EngineError(400, 'status may only be queued or skipped')
  if (upd.status === 'skipped' && !str(upd.hold_reason || topic.hold_reason, 1000)) throw new EngineError(400, 'hold_reason is required to skip a topic')
  if (upd.serp_verdict !== undefined) {
    if (!VERDICTS.includes(upd.serp_verdict)) throw new EngineError(400, `serp_verdict must be one of ${VERDICTS.join(', ')}`)
    upd.serp_checked_at = new Date().toISOString()
  }
  if (upd.priority !== undefined && !(Number.isInteger(upd.priority) && upd.priority > 0)) throw new EngineError(400, 'priority must be a positive integer')
  if (upd.primary_keyword !== undefined) upd.primary_keyword = str(upd.primary_keyword, 100).toLowerCase()
  for (const k of ['secondary_keywords', 'faq_questions', 'intent']) if (upd[k] !== undefined) upd[k] = list(upd[k], 8, 300)
  if (upd.intent && upd.intent.some((i) => !INTENTS.includes(i))) throw new EngineError(400, `intent must be from ${INTENTS.join(', ')}`)
  if (upd.funnel_stage && !FUNNEL.includes(upd.funnel_stage)) throw new EngineError(400, `funnel_stage must be one of ${FUNNEL.join(', ')}`)
  if (upd.internal_links !== undefined) {
    upd.internal_links = list(upd.internal_links, 6, 200)
    for (const l of upd.internal_links) if (!ALLOWED_PATHS.includes(l) && !/^\/blog\/[a-z0-9-]+$/.test(l)) throw new EngineError(400, `internal link ${l} isn't an allowed page`)
  }
  for (const k of ['brief', 'serp_notes', 'hold_reason', 'working_title']) if (upd[k] !== undefined) upd[k] = str(upd[k], 6000)
  if (!Object.keys(upd).length) throw new EngineError(400, `patch must set at least one of: ${PATCHABLE.join(', ')}`)
  const row = await q(sb.from('blog_topic_queue').update(upd).eq('id', topic.id).select('topic_key, priority, status, serp_verdict, hold_reason').single())
  return { topic: row }
}

// `type` rather than `action`: the request body's `action` names the door's action ('log').
async function log({ type: action, summary, report, details: extra = {} }) {
  if (!['queue', 'review', 'error'].includes(action)) throw new EngineError(400, 'log type must be queue, review or error (drafts, updates and checks log themselves)')
  const text = str(summary, 2000)
  if (!text) throw new EngineError(400, 'summary is required')
  const state = await loadState()
  const { drafts, proposals, waiting } = backlogOf(state.posts)

  let emailed = false
  let nudge = false
  if (action === 'review') {
    emailed = await sendEmail({
      subject: `SEO review, ${monthName()}`,
      preview: text,
      title: 'Monthly review',
      body: p(esc(text), { first: true }) + textBlocks(report, 18000) + button(ADMIN_MARKETING, 'Open Marketing'),
    })
  } else if (action === 'error') {
    emailed = await sendEmail({
      subject: 'SEO engine: a run didn\'t finish',
      preview: text,
      title: 'A run didn\'t finish',
      body: note(esc(text), 'alert') + textBlocks(report, 6000) + p('The next run tries again in two days. Nothing was published.', { small: true, muted: true }),
    })
  } else {
    const lastNudge = state.runs.find((r) => r.emailed && r.details && r.details.nudge)
    nudge = waiting >= BACKLOG_CAP && (!lastNudge || daysSince(lastNudge.ran_at) >= NUDGE_EVERY_DAYS)
    if (nudge) {
      const waitingList = [
        ...drafts.map((x) => `Draft: ${esc(x.title)}`),
        ...proposals.map((x) => `Suggested update: ${esc(x.title)}`),
      ]
      emailed = await sendEmail({
        subject: `${waiting} Journal items are waiting for you`,
        preview: 'The engine has paused new drafts until you review these.',
        title: 'Waiting for you',
        body: p(`The engine has paused new articles until you review what's waiting. Publish, edit or delete them in the admin and it picks up again on its next run.`, { first: true })
          + steps(waitingList)
          + h2('Meanwhile')
          + p(esc(text), { small: true })
          + button(ADMIN_MARKETING, 'Review in the admin'),
      })
    }
  }
  const run = await logRun({
    action,
    summary: text,
    emailed,
    details: { ...(typeof extra === 'object' && extra ? extra : {}), ...(report ? { report: str(report, 20000) } : {}), ...(nudge ? { nudge: true } : {}) },
  })
  return { run, emailed }
}

async function insights({ days = 28 } = {}) {
  if (!searchConsole.isConfigured()) return { configured: false }
  const rows = await searchConsole.topQueries({ days: Math.min(Math.max(Number(days) || 28, 7), 480), limit: 250 })
  return {
    configured: true,
    property: searchConsole.siteProperty(),
    days,
    opportunities: searchConsole.opportunities(rows, 30),
    top: rows.slice(0, 40),
  }
}

async function ping() {
  const state = await loadState()
  const fresh = state.posts
    .filter((x) => x.status === 'published')
    .map((x) => `${SITE_URL}/blog/${x.slug}`)
    .filter((u) => !state.pinged.has(u))
  if (!fresh.length) return { submitted: 0, note: 'nothing new to submit' }

  const keyRes = await fetch(`${SITE_URL}/${INDEXNOW_KEY}.txt`).catch(() => null)
  const keyText = keyRes && keyRes.ok ? (await keyRes.text()).trim() : ''
  if (keyText !== INDEXNOW_KEY) return { submitted: 0, note: `key file isn't live at ${SITE_URL}/${INDEXNOW_KEY}.txt yet (deploy first)` }

  const urls = [...fresh, `${SITE_URL}/blog`]
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: new URL(SITE_URL).host, key: INDEXNOW_KEY, keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`, urlList: urls }),
  })
  if (!res.ok) return { submitted: 0, note: `IndexNow responded ${res.status}: ${(await res.text()).slice(0, 200)}` }
  await logRun({ action: 'ping', summary: `Sent ${fresh.length} newly published article${fresh.length === 1 ? '' : 's'} to Bing and other engines via IndexNow.`, details: { urls: fresh, status: res.status } })
  return { submitted: fresh.length, urls: fresh, status: res.status }
}

/* ---------- dispatcher ---------- */

const ACTIONS = {
  status: () => status(),
  post: (a) => getPost(a),
  topic: (a) => getTopic(a),
  check: (a) => check(a),
  save_draft: (a) => saveDraft(a),
  propose_update: (a) => proposeUpdate(a),
  mark_checked: (a) => markChecked(a),
  queue_add: (a) => queueAdd(a),
  queue_update: (a) => queueUpdate(a),
  log: (a) => log(a),
  insights: (a) => insights(a),
  ping: () => ping(),
}

async function handle(action, params = {}) {
  const fn = ACTIONS[action]
  if (!fn) throw new EngineError(400, `Unknown action "${action}". One of: ${Object.keys(ACTIONS).join(', ')}`)
  return fn(params || {})
}

module.exports = { handle, EngineError, decideNext, INDEXNOW_KEY, BACKLOG_CAP }
