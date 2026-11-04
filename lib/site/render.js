/*
 * Signature Pianos · the redesigned pages, rendered on the server
 * ----------------------------------------------------------------
 * Home, the collection (and its uprights, grands, Yamaha and Kawai pages), each
 * piano's own page and the 404, with every word, price and piece of structured
 * data in the HTML. api/site.js calls these with the office's feed
 * (lib/site/feed.js); tools/site-chrome.js puts the same header and footer into
 * the static pages.
 *
 * The idea (approved 5 Nov 2026): the site is the face of an upright piano. The
 * headline is the fallboard, a Hammer Felt line runs under it, and the pianos
 * for sale are the keys. Motion lives in js/site.js; this file only writes the
 * words. Only real facts: anything the feed doesn't say is left out, never
 * guessed.
 */

const SITE = (process.env.SITE_URL || 'https://signaturepianos.com.au').replace(/\/+$/, '')
const OFFICE = require('./feed').OFFICE_ORIGIN
const PHONE = '0479 128 955'
const TEL = 'tel:+61479128955'
const EMAIL = 'info@signaturepianos.com.au'
const MAPS = 'https://www.google.com/maps/dir/?api=1&amp;destination=63+Blackburn+Road+Mount+Waverley+VIC+3149'
const PORTAL = '/portal'

/* ---------- helpers ---------- */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const money = (c) => (typeof c === 'number' && isFinite(c)
  ? '$' + (c / 100).toLocaleString('en-AU', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })
  : '')
const day = (d, withYear) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' })
const todayMelbourne = () => {
  const p = {}
  new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date()).forEach((x) => { p[x.type] = x.value })
  return `${p.year}-${p.month}-${p.day}`
}
const daysTo = (d) => Math.max(0, Math.round((Date.parse(d + 'T00:00:00Z') - Date.parse(todayMelbourne() + 'T00:00:00Z')) / 86400000))
/* The office's photos come full size (about 280 KB each): Vercel's image service sends each at the width it is
   shown, as AVIF or WebP (vercel.json "images"; the widths must be among its sizes). Other addresses pass as they are. */
const IMG_W = [256, 384, 640, 960, 1280]
const isOffice = (u) => typeof u === 'string' && u.indexOf(OFFICE + '/public/') === 0
const opt = (u, w) => (isOffice(u) ? `/_vercel/image?url=${encodeURIComponent(u)}&w=${w}&q=72` : u)
const srcset = (u, ws) => (isOffice(u) ? ws.map((w) => `${opt(u, w)} ${w}w`).join(', ') : '')
/** an office photo as an <img>: src at a middling width, srcset across the widths that suit where it sits */
function img(u, { ws, sizes, w, alt = '', width = 960, height = 720, eager = false, extra = '' }) {
  const set = srcset(u, ws)
  return `<img src="${esc(opt(u, w))}"${set ? ` srcset="${esc(set)}" sizes="${sizes}"` : ''} alt="${esc(alt)}" width="${width}" height="${height}" loading="${eager ? 'eager' : 'lazy'}" decoding="async"${extra}>`
}
const KEY_IMG = { ws: [256, 384, 640], sizes: '(max-width: 899px) 60vw, 16vw', w: 384 }
const serial = (p) => { const m = p.slug.match(/-(\d{5,})$/); return m ? m[1] : null }
const kindWord = (p) => (p.kind ? p.kind.toLowerCase() : 'piano')
const pianoWord = (p) => (p.kind ? `${p.kind.toLowerCase()} piano` : 'piano')
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

const STATUS = { room: 'In the showroom', sea: 'On its way from Japan', sold: 'Sold', reserved: 'Reserved' }
const ORDER = { room: 0, reserved: 1, sea: 2, sold: 3 }
const CATS = {
  uprights: { key: 'upright', field: 'kind', label: 'Uprights' },
  grands: { key: 'grand', field: 'kind', label: 'Grands' },
  yamaha: { key: 'yamaha', field: 'brand', label: 'Yamaha' },
  kawai: { key: 'kawai', field: 'brand', label: 'Kawai' },
}

/* ---------- the stock, as the pages count it ---------- */
function stock(pianos) {
  const ps = Array.isArray(pianos) ? pianos : []
  const where = (p) => (p.status === 'Sold' ? 'sold' : p.status === 'Reserved' ? 'reserved' : p.arriving ? 'sea' : 'room')
  const sorted = ps.map((p, i) => [p, i]).sort((a, b) => ORDER[where(a[0])] - ORDER[where(b[0])] || a[1] - b[1]).map((x) => x[0])
  const forSale = sorted.filter((p) => where(p) !== 'sold')
  const cs = { all: 0, upright: 0, grand: 0, yamaha: 0, kawai: 0, room: 0, sea: 0, reserved: 0 }
  forSale.forEach((p) => {
    cs.all++
    if (p.kindKey) cs[p.kindKey] = (cs[p.kindKey] || 0) + 1
    if (/yamaha/i.test(p.brand)) cs.yamaha++
    if (/kawai/i.test(p.brand)) cs.kawai++
    cs[where(p)]++
  })
  const sold = sorted.filter((p) => where(p) === 'sold').length
  // the next container: the earliest day a piano at sea is due
  const dues = forSale.filter((p) => where(p) === 'sea' && p.dueOn).map((p) => p.dueOn).sort()
  const due = dues[0] || null
  const shipment = due ? ps.filter((p) => p.arriving && p.dueOn === due) : []
  const prices = forSale.map((p) => p.priceCents).filter(Boolean)
  // a deposit's share of the price, said only where every piano at sea takes the same one
  const shares = [...new Set(forSale.filter((p) => p.depositCents && p.priceCents).map((p) => Math.round((p.depositCents / p.priceCents) * 100)))]
  const refundable = forSale.some((p) => p.depositCents) && forSale.filter((p) => p.depositCents).every((p) => /refundable/i.test(p.depositTerms || ''))
  const makers = [...new Set(forSale.map((p) => p.brand).filter(Boolean))]
  return {
    ok: Array.isArray(pianos), ps, where, sorted, forSale, cs, sold, due, shipment,
    minPrice: prices.length ? Math.min(...prices) : null,
    depositShare: shares.length === 1 ? shares[0] : null,
    refundable,
    makers: makers.length ? makers.join(' and ') : 'Yamaha',
  }
}

/* ---------- icons ---------- */
const IC = {
  chev: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  arrow: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6"/></svg>',
  left: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12H5M11 6l-6 6 6 6"/></svg>',
  user: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5c1.4-3.6 4.3-5.5 7.5-5.5s6.1 1.9 7.5 5.5"/></svg>',
  phone: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 3.5h3.2l1.8 4.6-2.2 1.4a11.5 11.5 0 0 0 6.2 6.2l1.4-2.2 4.6 1.8v3.2a2 2 0 0 1-2 2A16.5 16.5 0 0 1 3.5 5.5a2 2 0 0 1 2-2z"/></svg>',
  menu: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h16M4 15h16"/></svg>',
}
function route(w) {
  const a = w !== 'sold', b = ['sea', 'room', 'reserved'].includes(w), c = ['room', 'reserved'].includes(w)
  return `<svg class="route" viewBox="0 0 34 10" aria-hidden="true"><line x1="3" y1="5" x2="31" y2="5"/><circle cx="3" cy="5" r="3" class="${a ? 'on' : ''}"/><circle cx="17" cy="5" r="3" class="${b ? 'on' : ''}${w === 'sea' ? ' sea' : ''}"/><circle cx="31" cy="5" r="3" class="${c ? 'on' : ''}"/></svg>`
}
const xh = (d, s, tag = 'h2', cls = 'h2', id = '') => `<${tag}${id ? ` id="${id}"` : ''} class="xh ${cls}"><span class="d"><span class="mk"><span>${d}</span></span></span><span class="s"><span class="mk"><span>${s}</span></span></span></${tag}>`

/* ---------- head and frame ---------- */
const ORG = {
  '@context': 'https://schema.org', '@type': 'MusicStore', '@id': SITE + '/#store', name: 'Signature Pianos',
  description: 'Pre-loved Japanese pianos, hand-picked in Japan and checked in Melbourne, with a 10-year warranty on every piano, white-glove delivery, tuning and servicing, and piano teachers through TeachMusic.',
  url: SITE + '/', email: EMAIL, telephone: '+61 479 128 955', priceRange: '$$', currenciesAccepted: 'AUD',
  address: { '@type': 'PostalAddress', streetAddress: '63 Blackburn Road', addressLocality: 'Mount Waverley', addressRegion: 'VIC', postalCode: '3149', addressCountry: 'AU' },
  areaServed: { '@type': 'City', name: 'Melbourne' },
  openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], opens: '09:00', closes: '17:00' }],
}

/* Runs before the first paint: motion classes only. Reduced motion turns every move off; a page reached through the
   fallboard lifts it (js/site.js); the intro's failsafe releases everything after 3.2 s whatever happens. */
const HEAD_JS = `(function(h){h.classList.add('js');var rm=matchMedia('(prefers-reduced-motion: reduce)').matches;if(rm)h.classList.add('rm');else h.classList.add('intro');var pt=false,ph=false;try{if(sessionStorage.getItem('sp-pt')==='1'){sessionStorage.removeItem('sp-pt');pt=true;ph=sessionStorage.getItem('sp-pt-photo')==='1'}}catch(e){}if(pt&&!rm){h.classList.add('pt-in','pt');if(ph)h.classList.add('pt-photo')}setTimeout(function(){h.classList.remove('intro','pt-in','pt-photo')},3200)})(document.documentElement)`

/** what every page loads in its head for the new look: fonts first, then the stylesheet (also used by the static pages) */
const FONT_PRELOADS = [
  '/media/fonts/NotoSerifDisplay-ExtraCondensedMedium.woff2',
  '/media/fonts/Jost-Regular.woff2',
].map((f) => `<link rel="preload" href="${f}" as="font" type="font/woff2" crossorigin>`).join('\n')

function page({ title, desc, canon, body, ld = [], bodyClass = '', ogImg, noindex = false, status }) {
  const lds = [ORG, ...ld].map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('\n')
  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${noindex ? '<meta name="robots" content="noindex, follow">\n' : ''}${canon ? `<link rel="canonical" href="${SITE}${canon}">\n` : ''}<meta property="og:type" content="website">
<meta property="og:site_name" content="Signature Pianos">
<meta property="og:locale" content="en_AU">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
${canon ? `<meta property="og:url" content="${SITE}${canon}">\n` : ''}<meta property="og:image" content="${esc(ogImg || SITE + '/media/site/og.jpg')}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#F3F0E9">
<link rel="icon" href="/media/brand/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/media/brand/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/media/brand/apple-touch-icon.png">
${FONT_PRELOADS}
<link rel="preconnect" href="${OFFICE}">
<link rel="stylesheet" href="/css/chrome.css">
<link rel="stylesheet" href="/css/site.css">
<link rel="stylesheet" href="/css/book.css">
<script src="/js/analytics.js"></script>
<script>${HEAD_JS}</script>
${lds}
</head>
<body class="sp-new${bodyClass ? ' ' + bodyClass : ''}">
<a class="skip" href="#main">Skip to content</a>
${header()}
${body}
<div class="fallboard" aria-hidden="true"><span class="fb-l">Signature</span></div>
<div class="pp-probe wrap grid" aria-hidden="true"><div class="pp-photo"><div class="pp-main"></div></div></div>
<script src="/js/v/gsap.min.js" defer></script>
<script src="/js/v/ScrollTrigger.min.js" defer></script>
<script src="/js/v/SplitText.min.js" defer></script>
<script src="/js/v/Flip.min.js" defer></script>
<script src="/js/v/CustomEase.min.js" defer></script>
<script src="/js/v/lenis.min.js" defer></script>
<script src="/js/office-config.js" defer></script>
<script src="/js/office.js" defer></script>
<script src="/js/chrome.js" defer></script>
<script src="/js/site.js" defer></script>
<script src="/js/signature-book.js" defer></script>
</body>
</html>
`
}

/* ---------- header: the menu exactly as listed ---------- */
const SIC = {
  chev: '<svg class="spc-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  user: '<svg class="spc-ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5c1.4-3.6 4.3-5.5 7.5-5.5s6.1 1.9 7.5 5.5"/></svg>',
  phone: '<svg class="spc-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 3.5h3.2l1.8 4.6-2.2 1.4a11.5 11.5 0 0 0 6.2 6.2l1.4-2.2 4.6 1.8v3.2a2 2 0 0 1-2 2A16.5 16.5 0 0 1 3.5 5.5a2 2 0 0 1 2-2z"/></svg>',
  menu: '<svg class="spc-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h16M4 15h16"/></svg>',
}
/** the header, the same on every page: tools/site-chrome.js puts it into the static pages */
function header() {
  const col = (title, links) => `<div class="spc-ddcol"><p class="spc-lbl spc-ddh">${title}</p>${links}</div>`
  const ddl = (href, strong, span, extra = '') => `<a class="spc-ddl" href="${href}"${extra}><strong>${strong}</strong><span>${span}</span></a>`
  const pianosLinks =
    col('The pianos',
      ddl('/pianos/uprights/', 'Pre-loved Japanese uprights', 'Hand-picked in Japan, checked in Melbourne', ' data-label="Uprights"') +
      ddl('/pianos/grands/', 'Pre-loved Japanese grands', 'Salon and concert grands from Yamaha and Kawai', ' data-label="Grands"') +
      ddl('/pianos/#digital', 'Digital pianos', 'Roland, Kawai, Casio and Yamaha, coming soon', ' data-label="The pianos"')) +
    col('By maker',
      ddl('/pianos/yamaha/', 'Yamaha pianos', 'Uprights and grands chosen in Japan', ' data-label="Yamaha"') +
      ddl('/pianos/kawai/', 'Kawai pianos', 'Kawai uprights and grands, hand-picked', ' data-label="Kawai"') +
      ddl('/pianos/', 'Every piano for sale', 'All of them, each with its price', ' data-label="The pianos"')) +
    col('Before you buy',
      ddl('/blog', 'Buying advice', 'Plain answers before you choose a piano') +
      ddl('/serial-number-lookup.html', 'How old is my piano?', 'Look up a Yamaha or Kawai serial number') +
      ddl('/#guide', "Free Yamaha buyer's guide", 'Every Yamaha upright and grand from 1970 to today', ' data-label="Signature"'))
  const services =
    ddl('/services/delivery-warranty.html', 'Delivery &amp; warranty', 'White-glove delivery and a 10-year warranty') +
    ddl('/services/book-a-viewing.html', 'Book a visit', 'Play the pianos in our Mount Waverley showroom') +
    ddl('/services/tuning-servicing.html', 'Tuning &amp; servicing', 'Tuning and care for pianos across Melbourne')
  const teachers =
    col('For students', ddl('/teachers.html', 'Find a teacher', 'Piano teachers across Melbourne, via TeachMusic') + ddl('/teachers-match.html', 'Match me with a teacher', 'A few quick questions, three suggestions')) +
    col('For teachers', ddl('https://www.teachmusic.com.au/for-teachers', 'List your studio', 'Reach new students on TeachMusic, our sister platform') + ddl('https://www.teachmusic.com.au/login', 'Teacher log in', 'Your studio, bookings and students on TeachMusic'))
  const dd = (key, label, inner) => `<div class="spc-dd" data-dd="${key}"><button type="button" class="spc-ddt" aria-expanded="false" aria-controls="spc-dd-${key}">${label}${SIC.chev}</button><div class="spc-ddp spc-ddp-${key}" id="spc-dd-${key}">${inner}</div></div>`
  const grp = (key, label, inner) => `<div class="spc-shg" data-sh="${key}"><button type="button" class="spc-sht" aria-expanded="false">${label}${SIC.chev}</button><div class="spc-shb">${inner}</div></div>`
  return `<div class="spc spc-chrome">
<div class="spc-top"><div class="spc-wrap"><span>Pianos imported direct from Japan</span><span><a href="${MAPS}" target="_blank" rel="noopener">63 Blackburn Road, Mount Waverley</a><i aria-hidden="true">·</i><a href="${TEL}">${PHONE}</a></span></div></div>
<header class="spc-hdr"><div class="spc-wrap spc-nav">
<button type="button" class="spc-burger" aria-expanded="false" aria-controls="spc-sheet">${SIC.menu}<span class="spc-burger-l">Menu</span></button>
<nav class="spc-navl" aria-label="Main">${dd('pianos', 'Pianos', pianosLinks)}${dd('services', 'Services', services)}${dd('teachers', 'Teachers', teachers)}<a href="/blog">Blog</a><a href="/piano-rental">Rent a piano</a><a href="/about.html">About</a></nav>
<a class="spc-lockup" href="/" data-label="Signature"><img src="/media/brand/logo-ink.svg" alt="Signature Pianos home" width="1542" height="592"></a>
<div class="spc-navr"><a class="spc-phone" href="${TEL}">${SIC.phone}${PHONE}</a><a class="spc-acct" href="${PORTAL}" aria-label="Customer portal">${SIC.user}</a><a class="spc-btn" href="/services/book-a-viewing.html">Book a visit</a><a class="spc-callic" href="${TEL}" aria-label="Call ${PHONE}">${SIC.phone}</a></div>
</div></header>
<div class="spc-sheet" id="spc-sheet" data-lenis-prevent hidden>
${grp('pianos', 'Pianos', pianosLinks)}
${grp('services', 'Services', services)}
${grp('teachers', 'Teachers', teachers)}
<div class="spc-shg"><a class="spc-sht" href="/blog">Blog</a></div>
<div class="spc-shg"><a class="spc-sht" href="/piano-rental">Rent a piano</a></div>
<div class="spc-shg"><a class="spc-sht" href="/about.html">About</a></div>
<div class="spc-shacts"><a class="spc-btn" href="/services/book-a-viewing.html">Book a visit</a><a class="spc-btn spc-ol" href="${TEL}">Call ${PHONE}</a><a class="spc-btn spc-ol" href="${PORTAL}">Customer portal</a></div>
<p class="spc-shaddr">63 Blackburn Road, Mount Waverley VIC 3149<br>Monday to Saturday, 9 am to 5 pm. Sunday by appointment.</p>
</div>
</div>`
}

/* ---------- a key: one piano ---------- */
function key(F, p, { eager = false, cursorLabel = 'View' } = {}) {
  const w = F.where(p)
  const illus = p.notes[0]
  const alt = (illus ? 'Illustration of a ' : '') + p.name + ' ' + pianoWord(p)
  const ph = p.photos[0]
    ? `${img(p.photos[0], { ...KEY_IMG, alt, eager })}${illus ? '<span class="illus" aria-hidden="true">Illustration</span>' : ''}`
    : `<span class="no-ph">Photographs soon</span>`
  const st = w === 'sea' ? 'On its way' : STATUS[w]
  const price = w === 'sold' ? 'Sold' : w === 'reserved' ? 'Reserved' : p.priceCents ? money(p.priceCents) : 'Price on request'
  return `<a class="key c-${w}" href="/pianos/${p.slug}" data-piano data-label="${esc(p.name)}" data-cursor="${cursorLabel}"><span class="key-in"><span class="key-ph">${ph}</span><span class="key-tx"><span class="key-st">${route(w)}${st}</span><span class="key-br">${esc(p.brand)}</span><span class="key-nm">${esc(p.model)}</span><span class="key-fx num">${[p.year, p.heightCm ? p.heightCm + ' cm' : null].filter(Boolean).join(' · ')}</span><span class="key-pr num">${price}</span></span></span></a>`
}

/* ---------- the forms: the office's, wired by js/site.js through js/office.js ---------- */
const consentBox = (form) => `<label class="consent" data-consent="${form}" style="display:none"><input type="checkbox" name="consent"><span></span></label>`
const hp = '<input type="text" class="sp-hp" name="sp_check" tabindex="-1" autocomplete="off" aria-hidden="true">'
const answer = '<p class="answer" role="status" aria-live="polite" hidden></p>'
const fld = (id, label, attrs, opt) => `<div class="field"><label for="${id}">${label}${opt ? ' <small>(optional)</small>' : ''}</label><input id="${id}" ${attrs}></div>`

function visitForm(prefix, piano) {
  const today = todayMelbourne()
  return `<form class="form" data-form="visit" novalidate${piano ? ` data-piano-slug="${esc(piano.slug)}" data-piano-name="${esc(piano.name)}"` : ''}>
<h3 class="h3">Book a visit</h3>
<div class="two">${fld(prefix + '-name', 'Your name', 'name="name" autocomplete="name" maxlength="80" required')}${fld(prefix + '-email', 'Email', 'name="email" type="email" autocomplete="email" inputmode="email" maxlength="254"')}</div>
<div class="two">${fld(prefix + '-phone', 'Phone', 'name="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="30"')}<div class="field"><label for="${prefix}-day">Day</label><input id="${prefix}-day" name="day" type="date" min="${today}" required></div></div>
<div class="two"><div class="field"><label for="${prefix}-time">Time</label><select id="${prefix}-time" name="time" required><option value="">Choose a time</option><option value="morning">Morning, 9 am to 12 pm</option><option value="afternoon">Afternoon, 12 pm to 4 pm</option></select></div><div class="field"><label for="${prefix}-msg">Anything to add <small>(optional)</small></label><input id="${prefix}-msg" name="message" maxlength="2000"></div></div>
<p class="fine">An email or a phone number, so we can confirm your time.</p>
${consentBox('visit')}${hp}<div class="check-box" hidden></div>
<button class="btn" type="submit">Send my request${IC.arrow}</button>${answer}
</form>`
}

/* ---------- the close: where to find us, then the signature ---------- */
function close({ form = true, piano = null } = {}) {
  return `<footer class="close" id="visit">
<div class="wrap grid visit">
${xh('Where can I', 'find you?', 'h2', 'h2', 'visit-h')}
<div class="vi" data-rv><p class="body">Our showroom is in Mount Waverley, in Melbourne's east. Come and play, or call us first.</p>
<dl><dt>Address</dt><dd><a class="ul" href="${MAPS}" target="_blank" rel="noopener">63 Blackburn Road<br>Mount Waverley VIC 3149</a></dd><dt>Hours</dt><dd>Monday to Saturday, 9 am to 5 pm<br>Sunday by appointment</dd><dt>Phone</dt><dd><a class="ul" href="${TEL}">${PHONE}</a></dd><dt>Email</dt><dd><a class="ul" href="mailto:${EMAIL}">${EMAIL}</a></dd></dl></div>
${form ? visitForm('v', piano) : ''}
</div>
${footer()}
</footer>`
}

/** the signature and the footer's links, the same on every page: the static pages get these too */
function footer() {
  return `<div class="spc spc-end">
<div class="spc-sign spc-wrap" aria-hidden="true"><span class="spc-s">Signature</span><span class="spc-cover"></span></div>
<div class="spc-wrap spc-foot"><div class="spc-cols">
<div><p class="spc-lbl">Pianos</p><ul><li><a href="/pianos/" data-label="The pianos">All pianos for sale</a></li><li><a href="/pianos/uprights/" data-label="Uprights">Uprights</a></li><li><a href="/pianos/grands/" data-label="Grands">Grands</a></li><li><a href="/pianos/yamaha/" data-label="Yamaha">Yamaha</a></li><li><a href="/pianos/kawai/" data-label="Kawai">Kawai</a></li></ul></div>
<div><p class="spc-lbl">Services</p><ul><li><a href="/services/book-a-viewing.html">Book a visit</a></li><li><a href="/services/delivery-warranty.html">Delivery and warranty</a></li><li><a href="/services/tuning-servicing.html">Tuning and servicing</a></li><li><a href="/piano-rental">Rent a piano</a></li></ul></div>
<div><p class="spc-lbl">Learn</p><ul><li><a href="/blog">Buying advice</a></li><li><a href="/serial-number-lookup.html">How old is my piano?</a></li><li><a href="/#guide" data-label="Signature">Free Yamaha buyer's guide</a></li><li><a href="/teachers.html">Find a teacher</a></li></ul></div>
<div><p class="spc-lbl">Signature Pianos</p><ul><li><a href="/about.html">About</a></li><li><a href="${PORTAL}">Customer portal</a></li><li><a href="/privacy">Privacy</a></li><li><a href="${TEL}">${PHONE}</a></li><li><a href="mailto:${EMAIL}">${EMAIL}</a></li></ul></div>
</div>
<p class="spc-small"><span>© ${new Date().getFullYear()} Parke Music Group Pty Ltd · ABN 94 702 480 340</span><span>Signature Pianos, 63 Blackburn Road, Mount Waverley VIC 3149</span></p></div>
</div>`
}

/* ---------- home ---------- */
const STORY_IMG = '/media/site/'
function home(F) {
  const { cs, due } = F
  const sea = cs.sea, room = cs.room
  const lead = sea && !room
    ? `Pre-loved ${F.makers} pianos, hand-picked in Japan and checked in our Melbourne workshop. Reserve one while it is at sea, and play it in our Mount Waverley showroom once it lands.`
    : sea
      ? `Pre-loved ${F.makers} pianos, hand-picked in Japan and checked in our Melbourne workshop. Play them in our Mount Waverley showroom, or reserve one still at sea.`
      : `Pre-loved ${F.makers} pianos, hand-picked in Japan and checked in our Melbourne workshop. Every one is in our Mount Waverley showroom, ready to play.`
  const stockLine = !F.ok || !cs.all
    ? `<span><b>Call us for the pianos in stock today.</b> ${PHONE}.</span>`
    : room && sea
      ? `<span><b>${plural(room, 'piano', 'pianos')} in the showroom now,</b> and ${sea} more on the way${due ? `, due ${day(due)}` : ''}.</span>`
      : sea
        ? `<span><b>${plural(sea, 'piano', 'pianos')} on the way from Japan,</b>${due ? ` due ${day(due)}.` : ''} Reserve one before it lands.</span>`
        : `<span><b>${plural(room, 'piano', 'pianos')} in the showroom now.</b> Monday to Saturday, 9 am to 5 pm.</span>`
  const row = F.forSale.slice(0, 10)
  const keysRow = row.map((p, i) => `<li style="--i:${i}">${key(F, p, { eager: i < 3, cursorLabel: 'Drag' })}</li>`).join('') +
    `<li style="--i:${row.length}"><a class="key-all" href="/pianos/" data-label="The pianos" data-cursor="View" data-cursor-inv><span class="d">All ${cs.all}</span><span class="tl">for sale${IC.arrow}</span></a></li>`

  // the price list: every model for sale, lowest price first
  const groups = {}
  F.forSale.filter((p) => p.priceCents && F.where(p) !== 'reserved').forEach((p) => { const k = p.brand + '|' + p.model; (groups[k] = groups[k] || []).push(p) })
  const models = Object.values(groups).map((g) => ({
    g, min: Math.min(...g.map((p) => p.priceCents)),
    y0: Math.min(...g.map((p) => p.year || 9999)), y1: Math.max(...g.map((p) => p.year || 0)),
  })).sort((a, b) => a.min - b.min || a.g[0].model.localeCompare(b.g[0].model))
  const plRows = models.map(({ g, min, y0, y1 }) => {
    const p = g[0]
    const hs = [...new Set(g.map((q) => q.heightCm).filter(Boolean))].join(' and ')
    const made = y1 ? (y0 === y1 ? 'Made in ' + y0 : 'Made ' + y0 + ' to ' + y1) : ''
    return `<li><a class="pl-row" href="/pianos/#m-${esc(p.model.toLowerCase())}" data-label="${esc(p.name)}"${p.photos[0] ? ` data-preview="${esc(opt(p.photos[0], 640))}"` : ''}><span class="pl-th">${p.photos[0] ? img(p.photos[0], { ws: [256], sizes: '64px', w: 256 }) : ''}</span><span class="pl-m d">${esc(p.model)}</span><span class="pl-k">${esc(p.brand)} ${hs ? hs + ' cm ' : ''}${esc(kindWord(p))}</span><span class="pl-y num">${made}</span><span class="pl-n">${plural(g.length, 'piano', 'pianos')}</span><span class="pl-p num">${g.length > 1 ? '<small>from</small>' : '<small>&nbsp;</small>'}${money(min)}</span><span class="pl-a">${IC.arrow}</span></a></li>`
  }).join('')

  const shipFor = F.shipment.filter((p) => p.status !== 'Sold').length
  const shipSold = F.shipment.length - shipFor
  const chapters = [
    { t: 'Chosen in Japan', p: 'Each piano is hand-picked in Japan, where Yamaha and Kawai make them, one piano at a time.', cap: 'A Yamaha UX30A, photographed in Japan', img: 'unit-ux30a.webp', alt: 'A black Yamaha UX30A upright piano photographed in Japan' },
    { t: 'Listed with its price', p: 'Every piano is on this site with its model, year, height and price before it ships. Until it lands you see an illustration of its model, marked as one. Its own photos go up the day it arrives.', cap: 'A Yamaha upright in Japan', img: 'unit-b121.webp', alt: 'A Yamaha upright piano in Japan', arch: true },
    { t: 'Imported direct', p: due && F.shipment.length
      ? `Our pianos travel by sea from Japan to Melbourne. The ${F.shipment.length} pianos in our next container${shipSold ? ` (${shipFor} for sale, ${shipSold === 1 ? 'one' : shipSold} already sold)` : ''} are due on ${day(due)}.`
      : 'Our pianos travel by sea from Japan to Melbourne, a container at a time, and come straight to our workshop.',
      cap: 'A container terminal at the Port of Melbourne. Photo: Bernard Spragg, CC0, via Wikimedia Commons', credit: 'Port of Melbourne. Photo: Bernard Spragg, CC0, Wikimedia Commons', img: 'port-of-melbourne.webp', alt: 'Container ships loaded high under the cranes of a container terminal at the Port of Melbourne' },
    { t: 'Checked in our workshop', p: 'Before a piano goes on sale in the showroom, our Melbourne workshop checks it.', cap: 'The action of a Yamaha upright', img: 'detail-action.webp', alt: 'Close view of the hammers and action inside a Yamaha upright piano' },
  ]
  const frames = chapters.map((ch, i) => `<div class="st-fr${ch.arch ? ' arch' : ''}${i === 0 ? ' on' : ''}"><img src="${STORY_IMG + ch.img}" alt="${esc(ch.alt)}" width="960" height="1200" loading="lazy"></div>`).join('')
  const chaps = chapters.map((ch, i) => `<article class="chap" data-chapter data-cap="${esc(ch.cap)}"><p class="n num">0${i + 1} / 04</p><h3 class="h3">${ch.t}</h3><p class="body">${ch.p}</p><div class="ph-m"><img src="${STORY_IMG + ch.img}" alt="${esc(ch.alt)}" width="960" height="720" loading="lazy"></div>${ch.credit ? `<p class="ph-cr">${esc(ch.credit)}</p>` : ''}</article>`).join('')

  const feat = F.forSale.filter((p) => p.priceCents && F.where(p) !== 'reserved').sort((a, b) => b.priceCents - a.priceCents)[0]
  const steps = sea
    ? `<div class="pair-tx">${xh('How do I', 'reserve one?', 'h2', 'h2', 'res-h')}
${due ? `<div class="count"><span class="d num" data-days="${due}" data-count="${daysTo(due)}">${daysTo(due)}</span><span><span data-days-unit>${daysTo(due) === 1 ? 'day' : 'days'}</span> until our next container lands in Melbourne, on ${day(due)}.</span></div>` : ''}
<ol class="steps3" data-stag><li>Choose a piano on its way from Japan.</li><li>Pay a deposit${F.depositShare ? ` of ${F.depositShare}% of its price` : ''}.${F.refundable ? ' It is refundable if you change your mind.' : ''}</li><li>Pay the balance before delivery, once it has landed and been checked.</li></ol>
<a class="btn" href="/pianos/#sea" data-label="On its way">See the pianos on their way${IC.arrow}</a></div>`
    : `<div class="pair-tx">${xh('Can I', 'play it first?', 'h2', 'h2', 'res-h')}
<p class="body" data-rv style="margin-top:22px">Yes. Every piano for sale is in our Mount Waverley showroom. Book a time and play as many as you like before you choose.</p>
<ol class="steps3" data-stag><li>Book a time, Monday to Saturday, or Sunday by appointment.</li><li>Play them side by side, with the price on every one.</li><li>We deliver it to your home, tracked in your customer portal.</li></ol>
<a class="btn" href="#visit">Book a visit${IC.arrow}</a></div>`
  const pair = feat ? `<section class="sec wrap" aria-labelledby="res-h">
<div class="grid pair">
<figure class="pair-ph" data-lift>${feat.photos[0] ? `${img(feat.photos[0], { ws: [640, 960, 1280], sizes: '(max-width: 899px) 100vw, 56vw', w: 960, alt: (feat.notes[0] ? 'Illustration of a ' : '') + feat.name + ' ' + pianoWord(feat) })}${feat.notes[0] ? '<span class="illus" style="left:12px;bottom:auto;top:12px">Illustration</span>' : ''}` : ''}<figcaption class="cap"><a href="/pianos/${feat.slug}" data-piano data-label="${esc(feat.name)}"><span class="key-st">${route(F.where(feat))}${STATUS[F.where(feat)]}</span><span class="key-nm">${esc(feat.name)}</span><span class="key-fx num">${[feat.year, feat.heightCm ? feat.heightCm + ' cm' : null].filter(Boolean).join(' · ')} · <b>${money(feat.priceCents)}</b></span></a></figcaption></figure>
${steps}
</div>
</section>` : ''

  const depositFact = sea && F.depositShare
    ? `<div class="fact"><p class="d num" data-count="${F.depositShare}" data-suf="%">${F.depositShare}%</p><h3>Holds a piano at sea</h3><p>A${F.refundable ? ' refundable' : ''} deposit reserves a piano before it lands.</p></div>`
    : `<div class="fact"><p class="d num">9 to 5</p><h3>Open six days to play</h3><p>Monday to Saturday, 9 am to 5 pm, and Sunday by appointment.</p></div>`

  const keysBlock = row.length ? `<div class="felt" data-felt aria-hidden="true"></div>
<div class="keys-wrap" data-keys>
<div class="keys-head"><h2 class="lbl">The pianos today</h2><div class="r"><a class="tl" href="/pianos/" data-label="The pianos">All ${cs.all} for sale${IC.arrow}</a><div class="keys-ctl"><button type="button" data-k="-1" aria-label="Earlier pianos">${IC.left}</button><button type="button" data-k="1" aria-label="More pianos">${IC.arrow}</button></div></div></div>
<ul class="keys">${keysRow}</ul>
</div>` : '<div class="felt" data-felt aria-hidden="true"></div>'

  const body = `<main id="main">
<section class="hero" aria-labelledby="hero-h">
<div class="wrap"><div class="hero-h">
<h1 id="hero-h" class="xh"><span class="d"><span class="mk"><span>Find your</span></span> <span class="mk"><span style="--i:1">piano</span></span></span><span class="s"><span class="mk"><span style="--i:2">in Melbourne</span></span></span></h1>
<a class="ring" href="/pianos/" data-label="The pianos"><span class="vh">Browse the pianos</span><svg viewBox="0 0 132 132" aria-hidden="true"><defs><path id="ring-p" d="M66,66 m-54,0 a54,54 0 1,1 108,0 a54,54 0 1,1 -108,0"/></defs><text><textPath href="#ring-p">Browse the pianos · Mount Waverley ·</textPath></text></svg><span class="core">${IC.arrow}</span></a>
</div>
<div class="hero-row"><p class="lead">${lead}</p>
<div class="hero-acts"><p class="stock" data-in style="--i:0">${route(sea && !room ? 'sea' : 'room')}${stockLine}</p><div class="hero-btns" data-in style="--i:1"><a class="btn" href="/pianos/" data-label="The pianos">Browse the pianos${IC.arrow}</a><a class="tl" href="#visit">Book a visit${IC.arrow}</a></div></div></div>
</div>
${keysBlock}
</section>

${models.length ? `<section class="sec wrap" aria-labelledby="price-h">
<div class="sec-head">${xh('What does', 'a piano cost?', 'h2', 'h2', 'price-h')}<div class="aside"><p class="body" data-rv>Every model we have, the lowest price first. Each row opens those pianos, with the price on every one. Prices are in Australian dollars, for the piano alone: delivery, tuning and a stool are not included.</p></div></div>
<ol class="plist" data-plist>${plRows}</ol>
<div class="pl-foot"><p class="body">${plural(models.length, 'model', 'models')}, ${plural(F.forSale.length, 'piano', 'pianos')}, from ${money(F.minPrice)}.</p><a class="btn ol" href="/pianos/" data-label="The pianos">See all ${cs.all} pianos${IC.arrow}</a></div>
</section>` : ''}

<section class="story sec on-dark" data-story aria-labelledby="story-h">
<div class="wrap grid">
<div class="st-stage" data-stage><div class="st-frames">${frames}</div><p class="st-cap"><span data-cap>${esc(chapters[0].cap)}</span><span class="lbl">Real photos</span></p></div>
<div class="st-ch">${xh('Where do', 'they come from?', 'h2', 'h2', 'story-h')}${chaps}</div>
</div>
</section>

${pair}

<section class="facts sec" aria-labelledby="facts-h">
<div class="wrap"><div class="sec-head">${xh('Why buy', 'from us?', 'h2', 'h2', 'facts-h')}<div class="aside"><p class="body" data-rv>Four things that come with every piano we sell, written down so you can hold us to them.</p></div></div>
<div class="fact-row" data-stag>
<div class="fact"><p class="d num" data-count="10">10</p><h3>Years of warranty</h3><p>Every piano we sell carries a 10-year warranty.</p></div>
<div class="fact"><p class="d">Tracked</p><h3>White-glove delivery</h3><p>Quoted with your piano, carried into your home, and followed in your customer portal.</p></div>
${depositFact}
<div class="fact"><p class="d num" data-count="115" data-pre="$">$115</p><h3>A month to rent</h3><p>Rent a piano from $115 a month instead. <a class="ul" href="/piano-rental">See piano rental</a></p></div>
</div></div>
</section>

<section class="sec wrap" id="guide" aria-labelledby="guide-h">
<div class="grid">
<figure class="guide-ph" data-lift><img src="/media/site/guide-cover.webp" alt="The cover of the Signature Pianos Yamaha buyer's guide" width="960" height="1200" loading="lazy"></figure>
<div class="guide-tx">${xh('New to', 'pianos?', 'h2', 'h2', 'guide-h')}
<p class="body" style="margin-top:22px" data-rv>Our free Yamaha buyer's guide covers every Yamaha upright and grand from 1970 to today. Tell us where to send it.</p>
<form class="form" data-form="guide" novalidate data-rv>
<div class="two">${fld('g-name', 'Your name', 'name="name" autocomplete="name" maxlength="80" required')}${fld('g-email', 'Email', 'name="email" type="email" autocomplete="email" inputmode="email" maxlength="254" required')}</div>
${consentBox('guide')}${hp}<div class="check-box" hidden></div>
<div><button class="btn" type="submit">Send me the guide${IC.arrow}</button></div>${answer}
<a class="tl" href="/serial-number-lookup.html">How old is my piano? Look up a serial number${IC.arrow}</a>
</form></div>
</div>
</section>

<section class="bleed" aria-labelledby="teach-h">
<div class="bg" data-par><img src="/media/site/grand-c3x.webp" alt="A black Yamaha grand piano with its lid open" width="1600" height="1067" loading="lazy"></div>
<div class="wrap">${xh('Looking for', 'a teacher?', 'h2', 'h2', 'teach-h')}<p class="body" data-rv>Piano teachers across Melbourne list their studios on TeachMusic, our sister platform.</p><a class="btn lt" href="/teachers.html">Find a teacher${IC.arrow}</a></div>
</section>
</main>
${close()}
${F.forSale[0] && F.forSale[0].photos[0] ? `<div class="preview" aria-hidden="true"><img alt="" src="${esc(opt(F.forSale[0].photos[0], 640))}" width="960" height="720" loading="lazy"></div>` : ''}`
  return page({
    title: 'Piano Shop in Mount Waverley, Melbourne | Signature Pianos',
    desc: `Pre-loved ${F.makers} pianos, hand-picked in Japan and checked in our Melbourne workshop. Visit our piano store at 63 Blackburn Road, Mount Waverley.`,
    canon: '/', body, bodyClass: 'home',
  })
}

/* ---------- the collection, and its uprights, grands, Yamaha and Kawai pages ---------- */
const CAT_PAGES = {
  '': {
    title: 'Second-hand Pianos for Sale in Melbourne | Signature Pianos',
    h1: ['Pianos for sale', 'in Mount Waverley'],
    desc: (F) => `Every pre-loved piano we have, with its price: ${F.makers} pianos chosen in Japan, in our Mount Waverley showroom or on the way.${F.cs.sea ? ' Reserve one before it lands.' : ''}`,
  },
  uprights: {
    title: 'Upright Pianos for Sale in Melbourne | Signature Pianos',
    h1: ['Upright pianos', 'for Melbourne homes'],
    desc: (F, list) => { const hs = [...new Set(list.map((p) => p.heightCm).filter(Boolean))].sort().map((h) => h + ' cm'); return `Pre-loved ${F.makers} uprights${hs.length ? ', ' + hs.join(' and ') : ''}, hand-picked in Japan and checked in our Mount Waverley workshop. The price is on every piano.` },
  },
  grands: {
    title: 'Grand Pianos for Sale in Melbourne | Signature Pianos',
    h1: ['Grand pianos', 'for Melbourne homes'],
    desc: () => 'Pre-loved Yamaha and Kawai grand pianos, hand-picked in Japan and checked in our Mount Waverley workshop. See what is in stock and on its way.',
  },
  yamaha: {
    title: 'Pre-loved Yamaha Pianos in Melbourne | Signature Pianos',
    h1: ['Yamaha pianos', 'in Mount Waverley'],
    desc: () => 'Yamaha uprights and grands chosen in Japan and checked in our Melbourne workshop. Price and serial number on every piano.',
  },
  kawai: {
    title: 'Pre-loved Kawai Pianos in Melbourne | Signature Pianos',
    h1: ['Kawai pianos', 'in Mount Waverley'],
    desc: (F, list) => `Kawai uprights and grands, hand-picked in Japan and checked in our Mount Waverley workshop.${list.length ? ' The price is on every piano.' : ' None in stock today: ask us about the next one.'}`,
  },
}
function inCat(p, cat) {
  if (!cat) return true
  const c = CATS[cat]
  return c.field === 'kind' ? p.kindKey === c.key : new RegExp(c.key, 'i').test(p.brand)
}

function collection(F, cat = '') {
  const meta = CAT_PAGES[cat]
  const list = F.sorted.filter((p) => inCat(p, cat))
  const forSale = list.filter((p) => F.where(p) !== 'sold')
  const sea = forSale.filter((p) => F.where(p) === 'sea').length
  const room = forSale.filter((p) => F.where(p) === 'room').length
  const prices = forSale.map((p) => p.priceCents).filter(Boolean)
  const noun = cat === 'uprights' ? 'uprights' : cat === 'grands' ? 'grands' : cat === 'yamaha' ? 'Yamaha pianos' : cat === 'kawai' ? 'Kawai pianos' : 'pianos'
  const first = !F.ok
    ? `The pianos could not be loaded just now. Call us on ${PHONE}, or try again in a minute.`
    : !forSale.length
      ? `No ${noun} for sale just now. Ask us about the next one on ${PHONE}, or see every piano for sale.`
      : `Every pre-loved ${cat ? noun.replace(/s$/, '').replace(/ piano$/, '') + ' ' : ''}piano we have, with its price. Pre-loved is our word for second-hand: ${F.makers} pianos hand-picked in Japan, ${[room ? `${room} in our Mount Waverley showroom now` : '', sea ? `${sea} on their way${F.due ? ` and due on ${day(F.due)}` : ''}` : ''].filter(Boolean).join(', and ')}${prices.length ? `, from ${money(Math.min(...prices))}` : ''}.`
  const chipLink = (c, label, n) => `<a class="chip" href="/pianos/${c ? c + '/' : ''}" data-chip="${c ? CATS[c].key : 'all'}" ${c === cat ? ' aria-current="page"' : ''} data-label="${esc(label)}">${label} <b class="num">${n}</b></a>`
  const chipBtn = (k, label, n) => (n ? `<button type="button" class="chip" data-chip="${k}" aria-pressed="false">${label} <b class="num">${n}</b></button>` : '')
  const chips = [
    chipLink('', 'All for sale', F.cs.all),
    F.cs.upright ? chipLink('uprights', 'Uprights', F.cs.upright) : '',
    F.cs.grand ? chipLink('grands', 'Grands', F.cs.grand) : '',
    F.cs.yamaha ? chipLink('yamaha', 'Yamaha', F.cs.yamaha) : '',
    F.cs.kawai ? chipLink('kawai', 'Kawai', F.cs.kawai) : '',
    !cat ? chipBtn('room', 'In the showroom', F.cs.room) : '',
    !cat ? chipBtn('sea', 'On its way', F.cs.sea) : '',
  ].join('')
  const items = []
  let i = 0
  const anyIllus = list.some((p) => p.notes[0])
  list.forEach((p) => {
    const w = F.where(p)
    if (w === 'sold' && !items.some((s) => s.includes('data-band="sold"'))) items.push('<li class="sold-h" data-band="sold"><span class="d">Sold</span><span>These have found homes. They stay listed so you can see what has been through our hands.</span></li>')
    items.push(`<li data-p data-kind="${p.kindKey}" data-brand="${esc(p.brand.toLowerCase())}" data-where="${w}" data-model="${esc(p.model.toLowerCase())}">${key(F, p, { eager: i < 4 })}</li>`)
    i++
    if (i === 10 && anyIllus) items.push(`<li class="band" data-band="illus"><span class="d">Why you see illustrations</span><p>These pianos are at sea. Until each lands${F.due ? ` on ${day(F.due)}` : ''}, you see an illustration of its model, marked as one. Real photos of the piano itself go up the day it arrives.</p></li>`)
    if (i === 20) items.push(`<li class="band ink" data-band="story"><span class="d">From Japan to Mount Waverley</span><p>Hand-picked in Japan, imported direct, checked in our Melbourne workshop, then played in our showroom before it goes home with you. <a class="tl" href="/#story-h" data-label="Signature">The whole story${IC.arrow}</a></p></li>`)
  })
  const empty = {
    upright: 'No uprights for sale just now. Ask us about the next one.',
    grand: 'No grands for sale just now. Ask us about the next one.',
    yamaha: 'No Yamaha pianos for sale just now. Ask us about the next one.',
    kawai: 'No Kawai pianos for sale just now. Ask us about the next one.',
    digital: 'Digital pianos from Roland, Kawai, Casio and Yamaha are coming. Ask us about one.',
    room: F.due ? `None in the showroom yet. They land on ${day(F.due)}.` : 'None in the showroom just now.',
    sea: 'None on the way just now. The pianos for sale are in our showroom.',
  }
  items.unshift(`<li class="empty" data-band="empty"${forSale.length ? ' hidden' : ''} ${Object.entries(empty).map(([k, v]) => `data-e-${k}="${esc(v)}"`).join(' ')}><span class="d">None for sale just now</span><p class="body">${esc(cat ? empty[CATS[cat].key] : 'Nothing here just now.')}</p>${cat ? `<a class="btn ol" href="/pianos/" data-label="The pianos">See all ${F.cs.all} for sale</a>` : `<button type="button" class="btn ol" data-chip="all">See all ${F.cs.all} for sale</button>`}</li>`)
  const path = '/pianos/' + (cat ? cat + '/' : '')
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' }, { '@type': 'ListItem', position: 2, name: 'Pianos for sale', item: SITE + '/pianos/' }, ...(cat ? [{ '@type': 'ListItem', position: 3, name: CATS[cat].label, item: SITE + path }] : [])] }
  const itemList = { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: forSale.map((p, j) => ({ '@type': 'ListItem', position: j + 1, url: `${SITE}/pianos/${p.slug}` })) }
  const crumbsHtml = cat ? `<div class="wrap"><nav class="crumbs" aria-label="Breadcrumb"><a href="/" data-label="Signature">Home</a><span aria-hidden="true">/</span><a href="/pianos/" data-label="The pianos">Pianos for sale</a><span aria-hidden="true">/</span><span aria-current="page">${CATS[cat].label}</span></nav></div>` : ''
  const body = `<main id="main">
${crumbsHtml}
<section class="chead" aria-labelledby="c-h">
<div class="wrap grid"><h1 id="c-h" class="xh"><span class="d"><span class="mk"><span>${meta.h1[0]}</span></span></span><span class="s"><span class="mk"><span style="--i:1">${meta.h1[1]}</span></span></span></h1><p class="first">${first}</p></div>
<div class="felt" data-felt aria-hidden="true"></div>
<div class="chips" role="group" aria-label="Show">${chips}</div>
</section>
<ul class="kgrid" data-kgrid${cat ? '' : ' data-all'}>${items.join('')}</ul>
</main>
${close()}`
  return page({
    title: meta.title, desc: meta.desc(F, forSale), canon: path, body, ld: [crumbs, itemList],
    // a page with nothing for sale stays out of the index until there is
    noindex: !forSale.length,
  })
}

/* ---------- one piano ---------- */
const MAIN_IMG = { ws: [640, 960, 1280], sizes: '(max-width: 899px) 100vw, 55vw', w: 960 }
function piano(F, p) {
  const w = F.where(p), s = serial(p)
  const kind = kindWord(p)
  const yr = p.year ? ` (${p.year})` : ''
  let title = w === 'sold' ? `${p.name}${yr} ${p.kind || ''} Piano, Sold | Signature Pianos` : `${p.name}${yr} ${p.kind || ''} Piano for Sale | Signature Pianos`
  title = title.replace(/\s+/g, ' ')
  if (title.length > 60) title = title.replace(' Piano', '')
  if (title.length > 60) title = title.replace(yr, '')
  const classWord = (p.classWord || 'Pre-loved').toLowerCase()
  const due = p.dueOn || (w === 'sea' ? F.due : null)
  const where = w === 'sea' ? 'on its way from Japan to Mount Waverley' : w === 'room' ? 'in our Mount Waverley showroom' : w === 'reserved' ? 'reserved just now' : 'sold'
  const refundable = /refundable/i.test(p.depositTerms || '')
  const desc = w === 'sold'
    ? `This ${classWord} ${p.name} ${kind}${p.year ? ', ' + p.year : ''}, is sold. See the pianos for sale in our Mount Waverley showroom and on the way.`
    : `${cap(classWord)} ${p.name} ${kind}${p.year ? ', ' + p.year : ''}${p.finish ? ', ' + p.finish.toLowerCase() : ''}${p.heightCm ? ', ' + p.heightCm + ' cm' : ''}. ${p.priceCents && w !== 'reserved' ? money(p.priceCents) + ', ' : ''}${where}. ${w === 'sea' && p.depositCents ? `Reserve it with a${refundable ? ' refundable' : ''} deposit.` : w === 'room' ? 'Book a time to play it.' : w === 'reserved' ? 'Ask us about it.' : ''}`.trim()
  const alt = (i) => (p.notes[i] ? `Illustration of a ${p.name} ${pianoWord(p)}` : `${p.name} ${pianoWord(p)}, photo ${i + 1}`)
  const like = F.forSale.filter((q) => q.slug !== p.slug && F.where(q) !== 'reserved')
    .map((q) => [q, (q.model === p.model ? 0 : q.kindKey === p.kindKey ? 1 : 2) * 1e9 + Math.abs((q.priceCents || 0) - (p.priceCents || 0))])
    .sort((a, b) => a[1] - b[1]).slice(0, 8).map((x) => x[0])
  const status = w === 'sea' ? `On its way from Japan${due ? `, lands ${day(due)}` : ''}` : STATUS[w]

  /* what can be done here: reserve with a deposit, book a time, ask about it */
  const canReserve = p.status === 'For sale' && p.priceCents && p.depositCents
  const bookLink = `<a class="btn${canReserve ? ' ol' : ''}" href="/services/book-a-viewing.html" data-piano="${esc(p.name + yr)}" data-piano-slug="${esc(p.slug)}">Book a time to play it${canReserve ? '' : IC.arrow}</a>`
  const askBtn = `<button type="button" class="btn ol" data-open-act="question">Ask about it</button>`
  let acts
  if (w === 'sold') acts = `<a class="btn" href="/pianos/" data-label="The pianos">See the pianos for sale${IC.arrow}</a>`
  else if (w === 'reserved') acts = `<p class="pp-fine">This piano is reserved just now. Ask us about it, or call ${PHONE}.</p>${askBtn}`
  else {
    acts = (canReserve ? `<button type="button" class="btn" data-open-act="reserve">${w === 'sea' ? 'Reserve it before it lands' : 'Reserve it'}${IC.arrow}</button>` : '') +
      (w === 'room' ? bookLink : '') + askBtn + `<a class="btn ol" href="${TEL}">Call ${PHONE}</a>`
    acts += canReserve ? `<p class="pp-fine">${esc(p.depositTerms || '')} Secure payment by Stripe. The balance is paid before delivery.</p>` : ''
    acts += '<p class="pp-fine pp-rent" data-rent hidden></p>'
  }
  const reserveForm = canReserve ? `<form class="form act-panel" data-form="reserve" data-act="reserve" data-piano-slug="${esc(p.slug)}" data-piano-name="${esc(p.name)}" novalidate>
<h2 class="h3">Reserve the ${esc(p.model || p.name)} with a ${money(p.depositCents)} deposit</h2>
${fld('r-name', 'Your name', 'name="name" autocomplete="name" maxlength="120" required')}
<div class="two">${fld('r-email', 'Email', 'name="email" type="email" autocomplete="email" inputmode="email" maxlength="254" required')}${fld('r-phone', 'Phone', 'name="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="40"', true)}</div>
<div class="check-box" hidden></div>
<button class="btn" type="submit">Continue to payment${IC.arrow}</button>${answer}
</form>` : ''
  const questionForm = w === 'sold' ? '' : `<form class="form act-panel" data-form="question" data-act="question" data-piano-slug="${esc(p.slug)}" data-piano-name="${esc(p.name)}" novalidate>
<h2 class="h3">Ask about the ${esc(p.name)}</h2>
${fld('q-name', 'Your name', 'name="name" autocomplete="name" maxlength="80" required')}
<div class="two">${fld('q-email', 'Email', 'name="email" type="email" autocomplete="email" inputmode="email" maxlength="254"')}${fld('q-phone', 'Phone', 'name="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="30"', true)}</div>
<div class="field"><label for="q-msg">Your question</label><textarea id="q-msg" name="message" rows="3" maxlength="2000" required>${w === 'reserved' ? `Please let me know if the ${esc(p.name + yr)} comes back on sale.` : `I'd like to know more about the ${esc(p.name + yr)}.`}</textarea></div>
${consentBox('question')}${hp}<div class="check-box" hidden></div>
<button class="btn" type="submit">Send my question${IC.arrow}</button>${answer}
</form>`

  const journey = [
    ['Chosen in Japan', 'Hand-picked', 'done'],
    ['At sea', w === 'sea' ? 'Where it is now' : 'Done', w === 'sea' ? 'now' : 'done'],
    [due && w === 'sea' ? `Lands ${day(due)}` : 'Landed', 'In Melbourne', w === 'sea' ? '' : 'done'],
    ['Checked', 'In our workshop', w === 'sea' ? '' : 'done'],
    ['Your home', 'White-glove delivery', w === 'sold' ? 'done' : ''],
  ]
  const playA = w === 'sold'
    ? 'This one is sold. The pianos for sale are in our Mount Waverley showroom or on their way, each with its price.'
    : w === 'sea'
      ? `Yes. Once it lands${due ? ` on ${day(due)}` : ''} you can play it in our Mount Waverley showroom before you pay the balance.${canReserve ? ' Reserve it now and it is held for you.' : ''}`
      : w === 'reserved'
        ? 'It is reserved just now. Ask us about it, and we will tell you if it comes back on sale.'
        : 'Yes. It is in our Mount Waverley showroom now. Book a time, Monday to Saturday, 9 am to 5 pm, or Sunday by appointment.'
  const crumbsLd = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' }, { '@type': 'ListItem', position: 2, name: 'Pianos for sale', item: SITE + '/pianos/' }, { '@type': 'ListItem', position: 3, name: p.name, item: `${SITE}/pianos/${p.slug}` }] }
  // its real photos only: a search result shows a picture with no label, so an illustration there would pass an AI
  // piano off as this one (ACL ss 18, 29)
  const real = p.photos.filter((_, i) => !p.notes[i])
  const product = {
    '@context': 'https://schema.org', '@type': 'Product', name: `${p.name} ${pianoWord(p)}${yr}`, brand: { '@type': 'Brand', name: p.brand }, model: p.model,
    sku: p.slug, ...(s ? { serialNumber: s } : {}), category: p.kind ? `${p.kind} piano` : 'Piano',
    ...(p.story ? { description: p.story } : {}), ...(real.length ? { image: real } : {}),
    itemCondition: `https://schema.org/${p.classWord === 'New' ? 'NewCondition' : 'UsedCondition'}`,
    ...(p.priceCents || w === 'sold' ? { offers: { '@type': 'Offer', priceCurrency: 'AUD', ...(p.priceCents ? { price: (p.priceCents / 100).toFixed(2) } : {}),
      availability: `https://schema.org/${w === 'sold' ? 'SoldOut' : w === 'reserved' ? 'Reserved' : w === 'sea' ? 'PreOrder' : 'InStock'}`,
      itemCondition: `https://schema.org/${p.classWord === 'New' ? 'NewCondition' : 'UsedCondition'}`,
      url: `${SITE}/pianos/${p.slug}`, seller: { '@id': SITE + '/#store' } } } : {}),
  }
  const specs = [
    ['Maker', esc(p.brand)], ['Model', esc(p.model)], ['Year', p.year], ['Finish', esc(p.finish)],
    ['Height', p.heightCm ? p.heightCm + ' cm' : null], ['Serial number', s], ['Condition', esc(p.classWord)],
    ['Origin', esc(p.origin)], ['Price', w === 'sold' ? 'Sold' : w === 'reserved' ? 'Reserved' : p.priceCents ? money(p.priceCents) : null],
  ].filter(([, v]) => v != null && v !== '')
  const mainPh = p.photos[0]
    ? `${img(p.photos[0], { ...MAIN_IMG, alt: alt(0), eager: true, extra: ' fetchpriority="high"' })}${p.notes[0] ? '<span class="illus" aria-hidden="true">Illustration</span>' : ''}`
    : '<span class="no-ph">Photographs soon</span>'

  const body = `<main id="main">
<div class="wrap"><nav class="crumbs" aria-label="Breadcrumb"><a href="/" data-label="Signature">Home</a><span aria-hidden="true">/</span><a href="/pianos/" data-label="The pianos">Pianos for sale</a><span aria-hidden="true">/</span><span aria-current="page">${esc(p.name)}</span></nav></div>
<section class="wrap grid pp-top" aria-labelledby="pp-h">
<div class="pp-photo"><div class="pp-main">${mainPh}</div>
${p.photos.length > 1 ? `<div class="pp-thumbs">${p.photos.map((ph, i) => `<button type="button" data-src="${esc(opt(ph, MAIN_IMG.w))}" data-srcset="${esc(srcset(ph, MAIN_IMG.ws))}" data-note="${esc(p.notes[i] || '')}" aria-pressed="${i === 0}" aria-label="Show photo ${i + 1}">${img(ph, { ws: [256, 384], sizes: '(max-width: 899px) 33vw, 18vw', w: 384 })}</button>`).join('')}</div>` : ''}
<p class="pp-note"${p.notes[0] ? '' : ' hidden'}>${esc(p.notes[0] || '')}</p></div>
<div class="pp-side"><h1 id="pp-h" class="xh"><span class="d"><span class="mk"><span>${esc(p.name)}</span></span></span></h1><p class="sub" data-in style="--i:0">${cap(classWord)} ${esc(pianoWord(p))}${p.year ? ', ' + p.year : ''} · Mount Waverley, Melbourne</p>
<p class="pp-st" data-in style="--i:1">${route(w)}${status}</p>
<div class="pp-price"><span class="d num">${w === 'sold' ? 'Sold' : w === 'reserved' ? 'Reserved' : p.priceCents ? money(p.priceCents) : 'Price on request'}</span>${canReserve ? `<small>${money(p.depositCents)} holds it</small>` : ''}</div>
<div class="pp-act">${acts}</div>${reserveForm}${questionForm}</div>
</section>

<section class="wrap sec" style="padding-bottom:0" aria-label="The facts">
<dl class="specs" data-stag>${specs.map(([k, v]) => `<div><dt>${k}</dt><dd${/^\$|^\d/.test(String(v)) ? ' class="num"' : ''}>${v}</dd></div>`).join('')}</dl>
</section>

<div class="wrap" style="margin-top:var(--tight)">
${p.story ? `<section class="qa first" aria-labelledby="q1">${xh('What is', `the ${esc(p.model || p.name)}?`, 'h2', 'h2', 'q1')}<div class="ans"><p class="body" data-rv>${esc(p.story)}</p></div></section>` : ''}
${p.defects ? `<section class="qa${p.story ? '' : ' first'}" aria-labelledby="q0">${xh('What should', 'I know?', 'h2', 'h2', 'q0')}<div class="ans"><p class="body" data-rv style="white-space:pre-line">${esc(p.defects)}</p></div></section>` : ''}
<section class="qa${p.story || p.defects ? '' : ' first'}" aria-labelledby="q2">${xh('Where is', 'it now?', 'h2', 'h2', 'q2')}<div class="ans"><ol class="journey" data-stag>${journey.map(([a, b, cl]) => `<li class="${cl}"><b>${a}</b>${b}</li>`).join('')}</ol></div></section>
<section class="qa" aria-labelledby="q3">${xh('What comes', 'with it?', 'h2', 'h2', 'q3')}<div class="ans" data-rv><p class="body">A 10-year warranty. The price is for the piano alone: delivery, tuning and a stool are not included. We quote them with the piano, and you follow the delivery in your customer portal.</p>${canReserve ? `<p class="body">A deposit of ${money(p.depositCents)} holds it${w === 'sea' ? ' while it is at sea' : ''}, and the rest is paid before delivery.</p>` : ''}</div></section>
<section class="qa" aria-labelledby="q4">${xh('Can I', 'play it first?', 'h2', 'h2', 'q4')}<div class="ans" data-rv><p class="body">${playA}</p></div></section>
</div>

${like.length ? `<section class="sec" style="padding-top:var(--tight)" aria-labelledby="like-h"><div class="keys-wrap" data-keys>
<div class="keys-head"><h2 class="lbl" id="like-h">Pianos like it</h2><div class="r"><a class="tl" href="/pianos/" data-label="The pianos">All ${F.cs.all} for sale${IC.arrow}</a><div class="keys-ctl"><button type="button" data-k="-1" aria-label="Earlier pianos">${IC.left}</button><button type="button" data-k="1" aria-label="More pianos">${IC.arrow}</button></div></div></div>
<ul class="keys">${like.map((q) => `<li>${key(F, q, { cursorLabel: 'Drag' })}</li>`).join('')}</ul></div></section>` : ''}
</main>
${close({ piano: w === 'room' ? p : null })}
${w === 'sold' || w === 'reserved' ? '' : `<div class="pbar" aria-label="Price"><div><span class="d num">${p.priceCents ? money(p.priceCents) : 'Price on request'}</span><small>${canReserve ? `${money(p.depositCents)} holds it` : w === 'room' ? 'In the showroom' : 'On its way'}</small></div><button type="button" class="btn" data-open-act="${canReserve ? 'reserve' : 'question'}">${canReserve ? 'Reserve it' : 'Ask about it'}</button></div>`}`
  return page({
    title, desc, canon: `/pianos/${p.slug}`, body, ld: [crumbsLd, product],
    bodyClass: w === 'sold' || w === 'reserved' ? 'piano' : 'piano has-pbar',
    ogImg: real[0],
  })
}

/* ---------- 404 ---------- */
function notFound(F) {
  const ks = F.forSale.slice(0, 7).map((p) => `<li>${key(F, p, { cursorLabel: 'View' })}</li>`)
  ks.splice(Math.min(3, ks.length), 0, '<li><div class="gap-key">This key<br>is missing</div></li>')
  const body = `<main id="main" class="nf">
<div class="wrap">${xh('This key', 'is missing', 'h1', 'h2', 'nf-h')}<p class="body" data-in>The page you asked for is not here. The pianos are.</p><div class="hero-btns" data-in><a class="btn" href="/pianos/" data-label="The pianos">See the pianos${IC.arrow}</a><a class="tl" href="/" data-label="Signature">Home${IC.arrow}</a></div></div>
<div class="felt" data-felt aria-hidden="true" style="margin-top:var(--tight)"></div>
${F.forSale.length ? `<div class="keys-wrap" data-keys style="padding-top:2px"><ul class="keys">${ks.join('')}</ul></div>` : ''}
</main>
${close({ form: false })}`
  return page({ title: 'Page not found | Signature Pianos', desc: 'This page is not here. See the pre-loved pianos for sale at Signature Pianos, 63 Blackburn Road, Mount Waverley.', canon: '', body, noindex: true })
}

/** a page for when the office's feed can't be read: said plainly, never cached long */
function unavailable() {
  const body = `<main id="main" class="nf">
<div class="wrap">${xh('One', 'moment', 'h1', 'h2', 'nf-h')}<p class="body" data-in>The pianos could not be loaded just now. Please try again in a minute, or call us on <a class="ul" href="${TEL}">${PHONE}</a>.</p><div class="hero-btns" data-in><a class="btn" href="${TEL}">Call ${PHONE}</a><a class="tl" href="/" data-label="Signature">Home${IC.arrow}</a></div></div>
</main>
${close({ form: false })}`
  return page({ title: 'The pianos could not be loaded | Signature Pianos', desc: 'Signature Pianos, 63 Blackburn Road, Mount Waverley. Call 0479 128 955.', canon: '', body, noindex: true })
}

module.exports = { stock, home, collection, piano, notFound, unavailable, header, footer, CATS, SITE, FONT_PRELOADS }
