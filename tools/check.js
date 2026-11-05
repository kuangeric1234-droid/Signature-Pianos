#!/usr/bin/env node
/*
 * Signature Pianos · npm run check
 * --------------------------------
 * Fast checks that need no network and no secrets:
 *   1. every script parses (node --check on js/, api/, lib/, tools/, server.js)
 *   2. vercel.json is valid JSON
 *   3. the static pages carry the current header and footer (tools/site-chrome.js --check)
 *   4. the redesigned pages, rendered from a made-up feed that has a piano in every state, keep the rules:
 *      one H1; a title of 60 characters or fewer and a description of 160 or fewer; a canonical address;
 *      structured data that parses, with no illustration in a Product's images; no em dash; no free
 *      or included delivery (the first tuning is included, Eric 5 Nov 2026); every price is the piano's own;
 *      a sold piano offers no visit
 *   5. no Mist blue in the new stylesheets (charcoal in its place, Eric 5 Nov 2026)
 * Exit 1 on any failure.
 */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
let failed = 0
const fail = (msg) => { failed++; console.log('FAIL ' + msg) }
const ok = (msg) => console.log('ok   ' + msg)

/* 1. scripts parse */
const dirs = ['js', 'api', 'lib', 'tools']
const files = ['server.js']
for (const d of dirs) {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'v') walk(p) } else if (/\.(c?js)$/.test(e.name)) files.push(path.relative(ROOT, p))
  })
  walk(path.join(ROOT, d))
}
let bad = 0
for (const f of files) {
  try { execFileSync(process.execPath, ['--check', path.join(ROOT, f)], { stdio: 'pipe' }) } catch (e) { bad++; fail(`${f} does not parse: ${String(e.stderr).split('\n').slice(0, 4).join(' ')}`) }
}
if (!bad) ok(`${files.length} scripts parse`)

/* 2. vercel.json */
try { JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')); ok('vercel.json is valid JSON') } catch (e) { fail('vercel.json: ' + e.message) }

/* 3. the static pages' header and footer */
try { execFileSync(process.execPath, [path.join(ROOT, 'tools', 'site-chrome.js'), '--check'], { stdio: 'pipe', cwd: ROOT }); ok('static pages carry the current header and footer') } catch (e) { fail('static pages are out of date: run node tools/site-chrome.js\n' + String(e.stdout)) }

/* 4. the redesigned pages */
const { shape } = require('../lib/site/feed')
const render = require('../lib/site/render')
const O = 'https://portal.signaturepianos.com.au'
const ph = (k, ill) => ({ url: `${O}/public/shown?key=${k}`, illustration: !!ill, caption: ill ? 'Illustration of this model. Real photos when it arrives.' : null })
const base = { brand: 'Yamaha', kind: 'Upright', height_cm: 131, story: 'A pre-loved upright. It is quiet and even.', finish: 'Black', class: 'Pre-loved', origin: 'Japan', defects_told: null, deposit_terms: 'The deposit is refundable if you change your mind.' }
const FIXTURE = [
  { ...base, slug: 'yamaha-u3h-1234567', model: 'U3H', year: 1981, price_cents: 549000, deposit_cents: 54900, status: 'For sale', arriving: false, due_on: null, photos: [ph('a1'), ph('a2')] },
  { ...base, slug: 'yamaha-yus5-2345678', model: 'YUS5', year: 2008, price_cents: 1489000, deposit_cents: 148900, status: 'For sale', arriving: true, due_on: '2030-12-05', photos: [ph('b1', 1), ph('b2', 1)] },
  { ...base, slug: 'yamaha-u1h-3456789', model: 'U1H', year: 1979, price_cents: 429000, deposit_cents: null, status: 'For sale', arriving: false, due_on: null, defects_told: 'A small mark on the lid.', photos: [] },
  { ...base, slug: 'yamaha-ux3-4567890', model: 'UX3', year: 1984, price_cents: 659000, deposit_cents: null, status: 'Reserved', arriving: false, due_on: null, photos: [ph('d1')] },
  { ...base, slug: 'kawai-gl30-5678901', brand: 'Kawai', model: 'GL30', kind: 'Grand', height_cm: null, year: 2012, price_cents: null, deposit_cents: null, status: 'Sold', arriving: true, due_on: '2030-12-05', photos: [ph('e1', 1)] },
].map(shape)
const F = render.stock(FIXTURE)
const pages = [
  ['home', render.home(F)],
  ['collection', render.collection(F, '')],
  ...['uprights', 'grands', 'yamaha', 'kawai'].map((c) => ['collection/' + c, render.collection(F, c)]),
  ...FIXTURE.map((p) => ['piano/' + p.slug, render.piano(F, p)]),
  ['404', render.notFound(F)],
  ['404 static', render.notFound(render.stock([]))],
]
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ')
const PROMISE = /free delivery|delivery (is )?included|free tuning|complimentary/i
for (const [name, html] of pages) {
  const errs = []
  const h1 = (html.match(/<h1[\s>]/g) || []).length
  if (h1 !== 1) errs.push(`${h1} H1s`)
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || ''
  const t = title.replace(/&amp;/g, '&').replace(/&#39;/g, "'")
  if (!t || t.length > 60) errs.push(`title ${t.length}: ${t}`)
  const desc = ((html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '').replace(/&amp;/g, '&').replace(/&#39;/g, "'")
  if (!desc || desc.length > 160) errs.push(`description ${desc.length}`)
  if (!name.startsWith('404') && !/<link rel="canonical"/.test(html)) errs.push('no canonical')
  if (/—/.test(html)) errs.push('an em dash')
  if (PROMISE.test(strip(html))) errs.push('free or included delivery: ' + strip(html).match(PROMISE)[0])
  if (name.startsWith('piano/') && !/Sold/.test(name) && FIXTURE.find((x) => 'piano/' + x.slug === name).status !== 'Sold' && !/first tuning/i.test(strip(html))) errs.push('the included first tuning is not said')
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let o; try { o = JSON.parse(m[1]) } catch (e) { errs.push('structured data does not parse'); continue }
    if (o['@type'] === 'Product') {
      const p = FIXTURE.find((x) => x.slug === o.sku)
      const ill = p.photos.filter((_, i) => p.notes[i])
      if ((o.image || []).some((u) => ill.includes(u))) errs.push('an illustration in Product images')
      if (p.priceCents && o.offers && o.offers.price !== (p.priceCents / 100).toFixed(2)) errs.push('Offer price is not the piano\'s')
    }
  }
  if (name.startsWith('piano/')) {
    const p = FIXTURE.find((x) => 'piano/' + x.slug === name)
    const main = (html.match(/<main[\s\S]*?<\/main>/) || [''])[0]
    if (p.status === 'Sold' && /book-a-viewing|data-open-act/.test(main)) errs.push('a sold piano offers a visit')
    if ((p.status !== 'For sale' || p.arriving) && /data-form="visit"[^>]*data-piano-slug/.test(html)) errs.push('a visit to see a piano that is not in the showroom')
    if (p.notes.some(Boolean) && !html.includes('Illustration of this model. Real photos when it arrives.')) errs.push("an illustration without the office's words")
    if (p.defects && !html.includes(p.defects)) errs.push('the defects every buyer is told of are missing')
  }
  if (errs.length) fail(`${name}: ${errs.join('; ')}`); else ok(`${name}: ${t.length}-character title, ${desc.length}-character description`)
}

/* 5. no Mist blue in the new stylesheets */
for (const css of ['css/site.css', 'css/chrome.css', 'css/book.css']) {
  const s = fs.readFileSync(path.join(ROOT, css), 'utf8')
  if (/#BCCEDA|#DCE6ED|var\(--mist\)|var\(--mist-l\)/i.test(s)) fail(`${css} still has Mist blue`)
  else ok(`${css}: no Mist blue`)
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed')
process.exit(failed ? 1 : 0)
