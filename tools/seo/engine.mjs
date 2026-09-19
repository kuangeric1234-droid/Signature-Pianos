// The /seo-engine command line: every call the engine makes to the site.
//
//   node tools/seo/engine.mjs status [--json]
//   node tools/seo/engine.mjs post <slug>                 # saves drafts/<slug>.live.json + .live.html
//   node tools/seo/engine.mjs topic <topic_key>
//   node tools/seo/engine.mjs check <drafts/slug.json>    # a new article (body in drafts/slug.html)
//   node tools/seo/engine.mjs check-update <drafts/slug.update.json>
//   node tools/seo/engine.mjs save-draft <drafts/slug.json>
//   node tools/seo/engine.mjs propose-update <drafts/slug.update.json>
//   node tools/seo/engine.mjs mark-checked <slug> --reverify-by=YYYY-MM-DD --notes="..." [--reverify-notes="..."]
//   node tools/seo/engine.mjs queue-add <topics.json>     # an array of topics
//   node tools/seo/engine.mjs queue-update <topic_key> <patch.json | '{"priority":3}'>
//   node tools/seo/engine.mjs log <queue|review|error> --summary="..." [--report=<file.md>]
//   node tools/seo/engine.mjs insights [--days=28]
//   node tools/seo/engine.mjs ping
//
// Talks to https://signaturepianos.com.au/api/seo-engine with SEO_ENGINE_SECRET
// (a cloud environment variable, or .env.local on this machine). --local runs
// lib/seo-engine.js in-process instead (needs node_modules and a live
// SUPABASE_SERVICE_ROLE_KEY): for testing before a deploy.
//
// A body can live beside its JSON as <same name>.html, so nobody has to
// escape 1,000 words of HTML inside a JSON string. Exit 1 on any failure.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DRAFTS = join(ROOT, 'tools', 'seo', 'drafts')

// .env.local for local runs; real environment variables win.
const envFile = join(ROOT, '.env.local')
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
}

const argv = process.argv.slice(2)
const flags = Object.fromEntries(argv.filter((a) => a.startsWith('--')).map((a) => {
  const i = a.indexOf('=')
  return i === -1 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)]
}))
const [cmd, ...args] = argv.filter((a) => !a.startsWith('--'))
const LOCAL = flags.local || process.env.SEO_ENGINE_URL === 'local'
const URL_ = process.env.SEO_ENGINE_URL && !LOCAL ? process.env.SEO_ENGINE_URL : 'https://signaturepianos.com.au/api/seo-engine'

function die(msg) {
  console.error(msg)
  process.exit(1)
}

async function call(action, params = {}) {
  if (LOCAL) {
    if (!process.env.SUPABASE_URL) process.env.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
    const require = createRequire(import.meta.url)
    const { handle } = require(join(ROOT, 'lib', 'seo-engine.js'))
    try {
      return await handle(action, params)
    } catch (err) {
      return { __error: err.message, __status: err.status || 500, details: err.extra }
    }
  }
  const secret = process.env.SEO_ENGINE_SECRET
  if (!secret) die('SEO_ENGINE_SECRET is not set. In the cloud: add it to the routine environment. Locally: add it to .env.local.')
  let res
  try {
    res = await fetch(URL_, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...params }),
    })
  } catch (err) {
    die(`Couldn't reach ${URL_}: ${err.message}. In the cloud, the environment's network access must allow signaturepianos.com.au.`)
  }
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { error: text.slice(0, 500) } }
  if (!res.ok) return { __error: json.error || `HTTP ${res.status}`, __status: res.status, details: json.details }
  return json
}

function readJson(path) {
  if (!path) die(`usage: node tools/seo/engine.mjs ${cmd} <file.json>`)
  const raw = path.trim().startsWith('{') || path.trim().startsWith('[') ? path : readFileSync(path, 'utf8')
  try { return JSON.parse(raw) } catch (err) { die(`${path}: not valid JSON (${err.message})`) }
}

// <name>.json + <name>.html beside it
function withBody(path, obj, key = 'body_html') {
  const html = path.replace(/\.json$/, '.html')
  if (obj[key] === undefined && html !== path && existsSync(html)) obj[key] = readFileSync(html, 'utf8')
  return obj
}

function printChecks(r) {
  if (!r) return
  const s = r.stats || {}
  if (s.words) {
    console.log(`  ${s.words} words · ${s.h2} sections · ${s.faq} faq · ${s.external_links} source links · internal: ${(s.internal_links || []).join(', ') || 'none'}`)
  }
  if (s.verify && s.verify.length) {
    console.log(`  VERIFY notes for Eric (${s.verify.length}):`)
    for (const v of s.verify) console.log(`    - ${v}`)
  }
  if (r.we_already_target) {
    console.log('  we already target:')
    for (const t of r.we_already_target) console.log(`    "${t.keyword}"`.padEnd(46) + ` ${t.slug} (${t.status})`)
    console.log('  → confirm this is a different QUESTION, not just different words.')
  }
  for (const f of r.failures || []) console.log(`✗ ${f}`)
  for (const w of r.warnings || []) console.log(`⚠ ${w}`)
}

function finish(r, ok) {
  if (r && r.__error) {
    console.log(`✗ ${r.__error}`)
    if (r.details) printChecks(r.details)
    process.exit(1)
  }
  ok(r)
}

function printStatus(s) {
  console.log(`today ${s.today} (Melbourne)`)
  console.log(`\nNEXT ACTION: ${s.next.action}${s.next.target ? ' → ' + s.next.target : ''}`)
  console.log(`  ${s.next.reason}`)
  console.log(`\nwaiting for Eric: ${s.backlog.waiting} of ${s.backlog.cap}`)
  for (const d of s.backlog.drafts) console.log(`  draft     ${d.created}  ${d.title}  (/blog/${d.slug})`)
  for (const d of s.backlog.proposals) console.log(`  proposal  ${String(d.proposed).slice(0, 10)}  ${d.title}`)
  console.log('\npublished:')
  for (const p of s.posts.filter((x) => x.status === 'published')) {
    console.log(`  ${p.published}  ${p.title}\n      keyword "${p.primary_keyword}" · recheck by ${p.reverify_by || 'never set'} · last checked ${p.last_checked || 'never'}${p.has_proposal ? ' · UPDATE PROPOSED' : ''}`)
  }
  console.log(`\nqueue: ${s.queue.queued} queued · ${s.queue.used} used · ${s.queue.skipped} skipped${s.queue.low ? ` · LOW (under ${s.limits.QUEUE_LOW})` : ''}`)
  for (const t of s.queue.next) {
    const serp = t.serp_verdict ? `SERP ${t.serp_verdict} (${t.serp_checked})` : 'SERP unchecked'
    console.log(`  [${t.priority}] ${t.topic_key}: "${t.primary_keyword}" · ${serp}${t.serp_stale ? ' · recheck before writing' : ''}`)
  }
  for (const t of s.queue.skipped_topics) console.log(`  skipped ${t.topic_key}: ${t.hold_reason || ''}`)
  if (s.pings_due.length) console.log(`\npings due (run: engine.mjs ping): ${s.pings_due.join(', ')}`)
  console.log(`\nSearch Console connected: ${s.search_console ? 'yes (engine.mjs insights)' : 'no'}`)
  console.log('\nlast runs:')
  for (const r of s.runs) console.log(`  ${String(r.ran).slice(0, 16).replace('T', ' ')}Z  ${r.action.padEnd(8)} ${r.summary}`)
}

const commands = {
  async status() {
    finish(await call('status'), (s) => (flags.json ? console.log(JSON.stringify(s, null, 2)) : printStatus(s)))
  },

  async post() {
    const slug = args[0] || die('usage: post <slug>')
    finish(await call('post', { slug }), ({ post, seo }) => {
      mkdirSync(DRAFTS, { recursive: true })
      const { body_html, ...rest } = post
      writeFileSync(join(DRAFTS, `${slug}.live.json`), JSON.stringify({ ...rest, seo }, null, 2))
      writeFileSync(join(DRAFTS, `${slug}.live.html`), body_html || '')
      console.log(`"${post.title}" (${post.status}, published ${post.published_at || 'never'})`)
      console.log(`  keyword: ${seo && seo.primary_keyword} · recheck notes: ${(seo && seo.reverify_notes) || 'none'}`)
      console.log(`  saved: tools/seo/drafts/${slug}.live.json and .live.html`)
    })
  },

  async topic() {
    const topic_key = args[0] || die('usage: topic <topic_key>')
    finish(await call('topic', { topic_key }), (r) => console.log(JSON.stringify(r.topic, null, 2)))
  },

  async check() {
    const draft = withBody(args[0], readJson(args[0]))
    const r = await call('check', { draft })
    finish(r, (res) => {
      console.log(`check: ${draft.slug}`)
      printChecks(res)
      if (res.failures.length) process.exit(1)
      console.log('\nmechanical checks pass. That is not the gate: Eric reads it next.')
    })
  },

  async 'check-update'() {
    const u = readJson(args[0])
    u.update = withBody(args[0], u.update || {})
    const r = await call('check', { draft: { ...u.update, notes: u.notes, reverify_by: u.reverify_by }, partial: true, slug: u.slug })
    finish(r, (res) => {
      console.log(`check-update: ${u.slug}`)
      printChecks(res)
      if (res.failures.length) process.exit(1)
    })
  },

  async 'save-draft'() {
    const draft = withBody(args[0], readJson(args[0]))
    finish(await call('save_draft', { draft }), (r) => {
      console.log(`✓ saved draft "${r.post.title}" → /blog/${r.post.slug} (not live)`)
      console.log(`  email to Eric: ${r.emailed ? 'sent' : 'NOT sent'}`)
      printChecks(r.checks)
    })
  },

  async 'propose-update'() {
    const u = readJson(args[0])
    u.update = withBody(args[0], u.update || {})
    finish(await call('propose_update', u), (r) => {
      console.log(`✓ proposed an update to "${r.post.title}" (the live page is unchanged)`)
      console.log(`  email to Eric: ${r.emailed ? 'sent' : 'NOT sent'}`)
      printChecks(r.checks)
    })
  },

  async 'mark-checked'() {
    const slug = args[0] || die('usage: mark-checked <slug> --reverify-by=YYYY-MM-DD --notes="..."')
    finish(await call('mark_checked', { slug, reverify_by: flags['reverify-by'], reverify_notes: flags['reverify-notes'], notes: flags.notes }),
      (r) => console.log(`✓ ${r.run.summary}`))
  },

  async 'queue-add'() {
    const topics = readJson(args[0])
    finish(await call('queue_add', { topics: Array.isArray(topics) ? topics : [topics] }), (r) => {
      for (const t of r.added) console.log(`✓ queued ${t.topic_key} (priority ${t.priority})`)
      for (const t of r.skipped) console.log(`✗ skipped ${t.topic_key}: ${t.reason}`)
    })
  },

  async 'queue-update'() {
    const topic_key = args[0] || die('usage: queue-update <topic_key> <patch.json | JSON>')
    finish(await call('queue_update', { topic_key, patch: readJson(args[1]) }), (r) => console.log(`✓ ${JSON.stringify(r.topic)}`))
  },

  async log() {
    const type = args[0] || die('usage: log <queue|review|error> --summary="..." [--report=file.md]')
    const report = flags.report ? readFileSync(flags.report, 'utf8') : undefined
    finish(await call('log', { type, summary: flags.summary, report }), (r) => {
      console.log(`✓ logged ${r.run.action}: ${r.run.summary}`)
      console.log(`  email to Eric: ${r.emailed ? 'sent' : 'not sent'}`)
    })
  },

  async insights() {
    finish(await call('insights', { days: Number(flags.days) || 28 }), (r) => console.log(JSON.stringify(r, null, 2)))
  },

  async ping() {
    finish(await call('ping'), (r) => console.log(r.submitted ? `✓ submitted ${r.submitted}: ${r.urls.join(', ')}` : `nothing submitted: ${r.note}`))
  },
}

if (!commands[cmd]) die(`unknown command "${cmd || ''}". One of: ${Object.keys(commands).join(', ')}`)
await commands[cmd]()
