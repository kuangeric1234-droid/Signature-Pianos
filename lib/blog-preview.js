/*
 * Signature Pianos · a Journal post drawn for the office's editor (the office's step S7.9, Eric 10 Nov 2026)
 * ---------------------------------------------------------------------------------------------------------
 * The office's editor shows the person writing a post the page the website will draw of it, as they write. It sends
 * the post here in the shape the office's public read gives one (lib/journal-source.js shaped: a draft, with no date of
 * its own, shows today's), and the Journal's own renderer draws it (lib/blog-render.js renderPost, its body through the
 * same cleaner as every post on the website).
 *
 * The page is answered as JSON ({ html }), never as a page at this address, so nothing sent here is ever shown on the
 * website's own origin; the office draws it in a frame with no scripts. It is kept by no one, kept from search, and
 * carries none of the website's analytics (a preview is not a visit). Only the office's address may ask: the live
 * portal, and any address PREVIEW_ORIGINS names for a local run (commas between).
 */
const { renderPost } = require('./blog-render')
const { shaped } = require('./journal-source')
const { isSlug } = require('./site/feed')

const SITE = 'https://signaturepianos.com.au'
const OFFICE = 'https://portal.signaturepianos.com.au'
/** the most a post sent to be drawn may be, in bytes: a body of 100,000 characters and its questions fit well inside */
const MOST = 400 * 1024

function origins() {
  const more = String(process.env.PREVIEW_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean)
  return new Set([OFFICE, ...more])
}

/** the post's page made a preview: its addresses read from the website, its links going nowhere in the office's frame
    (a new window, which that frame does not allow), kept from search, without the website's analytics */
function previewPage(html) {
  return String(html)
    .replace(/<script\b[^>]*\bsrc="\/js\/analytics\.js"[^>]*>\s*<\/script>\s*/gi, '')
    .replace(/<head>/i, `<head>\n<base href="${SITE}/" target="_blank">\n<meta name="robots" content="noindex, nofollow">`)
}

/**
 * The answer to one ask, worked out from what came: the method, the Origin header, the Content-Type header and the
 * body as text (null where it was past MOST). Gives { status, headers, json } (json absent for a preflight).
 */
function answer({ method, origin, contentType, raw }) {
  const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', Vary: 'Origin' }
  const allowed = typeof origin === 'string' && origins().has(origin)
  if (allowed) headers['Access-Control-Allow-Origin'] = origin
  const say = (status, error, more = {}) => ({ status, headers: { ...headers, ...more }, json: { error } })

  if (method === 'OPTIONS') {
    if (!allowed) return say(403, 'This address may not ask the website for a preview.')
    return { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' } }
  }
  if (method !== 'POST') return say(405, 'A preview is asked for with POST.', { Allow: 'POST, OPTIONS' })
  if (!allowed) return say(403, 'This address may not ask the website for a preview.')
  if (!/^application\/json\s*(;|$)/i.test(String(contentType || ''))) return say(415, 'Send the post as JSON, with Content-Type: application/json.')
  if (raw === null || Buffer.byteLength(String(raw)) > MOST) return say(413, `The post is too large to draw: ${MOST / 1024} KB at most.`)

  let p
  try { p = JSON.parse(raw) } catch { return say(400, 'The post could not be read: it is not JSON.') }
  if (!p || typeof p !== 'object' || Array.isArray(p)) return say(400, 'Send the post itself, as one object.')
  if (typeof p.title !== 'string' || !p.title.trim()) return say(400, 'A post needs a title before it can be drawn.')
  const date = typeof p.published_at === 'string' && !isNaN(Date.parse(p.published_at)) ? p.published_at : new Date().toISOString()
  const row = shaped({ ...p, slug: isSlug(p.slug) ? p.slug : 'preview', published_at: date }, true)
  if (!row) return say(400, 'The post could not be read as one.')
  return { status: 200, headers, json: { html: previewPage(renderPost(row, [])) } }
}

module.exports = { answer, previewPage, origins, MOST }
