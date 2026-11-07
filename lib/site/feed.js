/*
 * Signature Pianos · the office's stock feed, read on the server
 * ---------------------------------------------------------------
 * The pages that show pianos (home, the collection, a piano's own page) are
 * rendered by api/site.js with every word in the HTML. They read the same
 * public feed js/office.js reads in the browser, from the server, and keep it
 * for a minute in this function's memory (the CDN keeps each page longer, see
 * api/site.js).
 *
 * A piano is shaped here exactly as js/office.js shapes it: the feed's
 * allow-list and nothing else, its photos the office's own addresses only, and
 * an illustration always carrying its words.
 */

const SITE = (process.env.SITE_URL || 'https://signaturepianos.com.au').replace(/\/+$/, '')
// The office's address, as js/office-config.js and api/sitemap.js have it: change them together
const OFFICE_ORIGIN = (process.env.OFFICE_ORIGIN || 'https://portal.signaturepianos.com.au').replace(/\/+$/, '')

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const isSlug = (s) => typeof s === 'string' && s.length <= 120 && SLUG.test(s)
const STATUSES = { 'For sale': true, Reserved: true, Sold: true }
const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const cents = (v) => (typeof v === 'number' && isFinite(v) && v > 0 ? Math.round(v) : null)
const kindKey = (kind) => (/grand/i.test(kind) ? 'grand' : /upright/i.test(kind) ? 'upright' : /digital/i.test(kind) ? 'digital' : '')

function photoUrl(u) {
  if (typeof u !== 'string') return null
  const path = u.indexOf(OFFICE_ORIGIN + '/') === 0 ? u.slice(OFFICE_ORIGIN.length) : u
  return /^\/public\/(file|shown)\?[A-Za-z0-9_.~=&%-]+$/.test(path) ? OFFICE_ORIGIN + path : null
}

/** a piano as the pages use it, from the feed's allow-list and nothing else */
function shape(p) {
  if (!p || typeof p !== 'object' || !isSlug(p.slug) || !STATUSES[p.status]) return null
  const brand = text(p.brand) || ''
  const model = text(p.model) || ''
  const kind = text(p.kind) || ''
  const photos = (Array.isArray(p.photos) ? p.photos : []).map((f) => {
    const url = f && photoUrl(f.url)
    // an illustration says so: the office's caption, the bare word only where it has none (S1.32)
    return url ? { url, note: f.illustration === true ? text(f.caption) || 'Illustration' : null } : null
  }).filter(Boolean)
  const due = typeof p.due_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.due_on) ? p.due_on : null
  return {
    slug: p.slug,
    name: (brand + ' ' + model).trim() || 'Piano',
    brand, model, kind,
    kindKey: kindKey(kind),
    year: typeof p.year === 'number' && isFinite(p.year) ? p.year : null,
    heightCm: typeof p.height_cm === 'number' && isFinite(p.height_cm) && p.height_cm > 0 && p.height_cm < 400 ? Math.round(p.height_cm) : null,
    story: text(p.story),
    finish: text(p.finish),
    classWord: text(p.class),
    origin: text(p.origin),
    defects: text(p.defects_told),
    status: p.status,
    arriving: p.arriving === true,
    dueOn: p.arriving === true ? due : null,
    priceCents: p.status === 'Sold' ? null : cents(p.price_cents),
    depositCents: p.status === 'For sale' ? cents(p.deposit_cents) : null,
    depositTerms: p.status === 'For sale' && cents(p.deposit_cents) ? text(p.deposit_terms) : null,
    photos: photos.map((f) => f.url),
    notes: photos.map((f) => f.note),
  }
}

/* one read at a time, kept for a minute; the last good read stands in when the office can't be reached */
const KEEP_MS = 60 * 1000
let kept = null // { at, pianos }
let reading = null

async function get(path) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(OFFICE_ORIGIN + path, { headers: { Origin: SITE, Accept: 'application/json' }, signal: ctrl.signal, redirect: 'error' })
    const body = await res.json().catch(() => null)
    return { status: res.status, ok: res.ok, body }
  } finally {
    clearTimeout(timer)
  }
}

/** every piano on the website (For sale, Reserved and Sold), in the feed's order; null where the office can't be read
    and nothing was read before */
async function pianos() {
  if (kept && Date.now() - kept.at < KEEP_MS) return kept.pianos
  if (!reading) {
    reading = get('/public/m/stock/pianos').then((r) => {
      if (!r.ok || !r.body || !Array.isArray(r.body.pianos)) throw new Error('the office answered ' + r.status)
      const list = r.body.pianos.map(shape).filter(Boolean)
      kept = { at: Date.now(), pianos: list }
      return list
    }).catch((err) => {
      console.error('[site] the office feed failed', err && err.message)
      return kept ? kept.pianos : null
    }).finally(() => { reading = null })
  }
  return reading
}

module.exports = { SITE, OFFICE_ORIGIN, isSlug, shape, pianos, kindKey, photoUrl }
