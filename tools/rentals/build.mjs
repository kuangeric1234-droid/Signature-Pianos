/* Signature Pianos · builds the piano-rental pages into piano-rental/
   node tools/rentals/build.mjs [path to the office's discovery/drafts/rental-terms.md]

   One set of figures below, so no page can disagree with another; the header and footer cut from
   services/delivery-warranty.html, so they stay the site's; the terms read from the office's draft,
   so the page and the agreement a customer signs are the same words. Figures and terms are Eric's
   to approve (office D5, rental-rates.md). The pages it writes are committed; nothing here runs on
   the site. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SITE = 'https://signaturepianos.com.au'
const OUT = path.join(ROOT, 'piano-rental')

/* Eric, 1 Nov 2026 (office E112): plain rentals first. Rent-to-buy stays built and off; true brings back its page, links and
   words, once office S6.19, the PPSR account and the accountant's answer on GST are done. */
const RENT_TO_BUY = false

/* ---------- the figures ---------- */
const DELIVERY = 200
const COLLECTION = 200
const BOND = 500
const money = (n) => `$${n.toLocaleString('en-AU')}`
const toOwn = (price) => Math.ceil(price / 24 / 5) * 5
const payments = (price) => Math.ceil((price - DELIVERY) / toOwn(price))

const FROM = 115
const TOP = 190
/** what each model rents for: the ladder in office discovery/drafts/rental-rates.md at the office's prices of E123 (Eric, E124, 2 Nov 2026) */
const MODELS = [
  ['Yamaha U1', '121 cm', '1979 to 1986', '$115 to $125'],
  ['Yamaha YM5', '121 cm', '2004 to 2006', '$125'],
  ['Yamaha U10', '121 cm', '1987 to 1993', '$125 to $130'],
  ['Yamaha U3', '131 cm', '1979 to 1986', '$125 to $130'],
  ['Yamaha UX1', '121 cm', '1982 to 1983', '$130'],
  ['Yamaha YU10', '121 cm', '2002', '$140'],
  ['Yamaha U30A', '131 cm', '1990 to 1991', '$150'],
  ['Yamaha UX3', '131 cm', '1983 to 1985', '$150'],
  ['Yamaha UX5', '131 cm', '1983', '$150'],
  ['Yamaha U300', '131 cm', '1995', '$150'],
  ['Yamaha YU11', '121 cm', '2007 to 2023', '$150'],
  ['Yamaha UX30A', '131 cm', '1992', '$165'],
  ['Yamaha YUS3', '131 cm', '2016', '$190'],
]
/* the only sale prices on these pages: they are the office's (E123, 1 Nov 2026), so a change of price there is a change here */
const EX = { name: 'Yamaha U1A, 1985', rent: 125, price: 4290 }
const allIn = (months) => EX.rent * months + DELIVERY + COLLECTION
const dayOne = EX.rent + DELIVERY + BOND
const OWN = [
  ['Yamaha U1H, 1979', 2990],
  ['Yamaha U1A, 1985', 4290],
  ['Yamaha UX5, 1983', 7380],
  ['Yamaha YUS3, 2016', 13390],
]

/* ---------- the shell, cut from a page of the site ---------- */
const page = fs.readFileSync(path.join(ROOT, 'services/delivery-warranty.html'), 'utf8').replace(/\r\n/g, '\n')
const cut = (from, to) => {
  const a = page.indexOf(from)
  const b = page.indexOf(to, a)
  if (a < 0 || b < 0) throw new Error(`the shell has moved: ${from}`)
  return page.slice(a, b)
}
const HEADER = cut('<div class="sp-topbar"', '<!-- ============ §1 HERO')
const FOOTER = cut('<footer class="sp-footer">', '<script>\n  /* -------- NAV')
const BOTTOM = cut('<div class="sp-bottombar"', '<script src="/js/signature-nav.js"')

/* ---------- pieces ---------- */
/** the collection page's hero and section head, by its own classes: the script word sits on the line, as it does there */
const hero = ({ eyebrow, big, script, sub, actions = '' }) => `<section class="ins-hero">
  <div class="ins-hero-inner">
    <div class="ins-hero-eyebrow">${eyebrow}</div>
    <h1 class="ins-hero-h1">${big} <em>${script}</em>.</h1>
    <p class="ins-hero-sub">${sub}</p>${actions ? `\n    <div class="ins-hero-actions">${actions}</div>` : ''}
  </div>
</section>`
const head = (big, script, note = '') => `<header class="cat-section-header">
    <h2 class="cat-section-title">${big} <em>${script}</em></h2>${note ? `\n    ${note.startsWith('<') ? note : `<span class="cat-section-count">${note}</span>`}` : ''}
  </header>`
const CHOOSE = '<a class="rp-btn" href="/piano-rental#pianos">Choose a piano</a>'

const table = (cols, rows, numeric = [], wide = false) => `<div class="rp-table-wrap"><table class="rp-table${wide ? ' rp-table--wide' : ''}">
<thead><tr>${cols.map((h, i) => `<th scope="col"${numeric.includes(i) ? ' class="rp-num"' : ''}>${h}</th>`).join('')}</tr></thead>
<tbody>
${rows.map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${c}</th>` : `<td${numeric.includes(i) ? ' class="rp-num"' : ''}>${c}</td>`)).join('')}</tr>`).join('\n')}
</tbody></table></div>`

const faqBlock = (faqs) => `<div class="rp-faq">
${faqs.map(([q, a]) => `<details><summary>${q}</summary><p class="rp-answer">${a}</p></details>`).join('\n')}
</div>`

const plainText = (html) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&')
const faqSchema = (faqs) => ({
  '@type': 'FAQPage',
  mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: plainText(q), acceptedAnswer: { '@type': 'Answer', text: plainText(a) } })),
})

const CLOSE = `<section class="rp-section rp-section--deep">
  <div class="rp-inner">
  ${head('Come and', 'play one', '<a class="card-link" href="/services/book-a-viewing.html">Book a visit<i class="ti ti-arrow-right" aria-hidden="true"></i></a>')}
  <p class="rp-lead">Our showroom is in Mount Waverley. Sit down at the pianos, ask anything, and choose the one you would like to rent.</p>
  </div>
</section>`

const MORE = (skip) => {
  const links = [
    ['/piano-rental', 'Piano rental in Melbourne', 'The options, the pianos and how it works'],
    ['/piano-rental/prices', 'Rental prices', 'Rent by model, worked totals, renting or buying'],
    ...(RENT_TO_BUY ? [['/piano-rental/rent-to-buy', 'Rent-to-buy', 'Every dollar counts toward a price fixed at signing']] : []),
    ['/piano-rental/short-term', 'Short term hire', 'A pre-loved Yamaha for 3 months'],
    ['/piano-rental/yamaha-u1-u3', 'Which Yamaha to rent', 'U1, U3, UX and YU compared'],
    ['/piano-rental/terms', 'Rental terms', 'Every word you would sign'],
  ].filter(([href]) => href !== skip)
  return `<div class="rp-more">${links.map(([href, t, s]) => `<a href="${href}">${t}<small>${s}</small></a>`).join('')}</div>`
}

function shell({ file, url, title, description, body, schema = [], crumbs = [], noindex = false, scripts = '', dir = OUT }) {
  if (title.length > 60) throw new Error(`title over 60: ${title}`)
  if (description.length > 160) throw new Error(`description over 160 (${description.length}): ${title}`)
  const canonical = SITE + url
  const trail = [['Home', '/'], ...crumbs].map(([name, u], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + u }))
  const graph = [{ '@type': 'BreadcrumbList', itemListElement: trail }, ...schema]
  const ld = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c')
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  const html = `<!DOCTYPE html>
<html lang="en-AU">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
${noindex ? '<meta name="robots" content="noindex, follow" />\n' : ''}<link rel="canonical" href="${canonical}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Signature Pianos" />
<meta property="og:locale" content="en_AU" />
<meta property="og:url" content="${canonical}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:image" content="${SITE}/media/home/unit-yu33.webp" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Italianno&amp;family=Jost:wght@300..500&amp;family=Noto+Serif+Display:wdth,wght@62.5,400..500&amp;display=swap" rel="stylesheet" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css" />
<script type="application/ld+json">${ld}</script>
<link rel="stylesheet" href="/css/rentals-base.css" />
<link rel="stylesheet" href="/css/signature-theme.css" />
<link rel="stylesheet" href="/css/rentals.css" />
<link rel="icon" href="/media/brand/favicon.svg" type="image/svg+xml" />
<link rel="icon" href="/media/brand/favicon-32.png" sizes="32x32" type="image/png" />
<link rel="apple-touch-icon" href="/media/brand/apple-touch-icon.png" />
</head>
<body>

${HEADER.trimEnd()}

<main>
${body.trim()}
</main>

${FOOTER.trimEnd()}

${BOTTOM.trimEnd()}
<script src="/js/signature-nav.js" defer></script>
<script src="/js/signature-book.js" defer></script>
${scripts}</body>
</html>
`
  const text = plainText(html.slice(html.indexOf('<main>'), html.indexOf('</main>')))
  for (const [bad, why] of [[/[–—]/, 'a dash'], [/\b(used|second-hand|cheap|bargain|stunning|amazing|world-class|unbeatable)\b/i, 'a word the brand avoids'], [/!/, 'an exclamation mark']]) {
    const m = text.match(bad)
    if (m) throw new Error(`${file}: ${why}: "${text.slice(Math.max(0, m.index - 40), m.index + 40)}"`)
  }
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, file), html.replace(/\n/g, '\n'))
}

const SERVICE = {
  '@type': 'Service',
  name: 'Piano rental in Melbourne',
  serviceType: 'Piano rental',
  areaServed: { '@type': 'City', name: 'Melbourne' },
  provider: { '@type': 'MusicStore', '@id': `${SITE}/#store`, name: 'Signature Pianos' },
  offers: {
    '@type': 'AggregateOffer',
    priceCurrency: 'AUD',
    lowPrice: FROM,
    highPrice: TOP,
    offerCount: 3,
    description: 'Monthly rent for a pre-loved Yamaha upright, GST included',
  },
}

/* ---------- the questions ---------- */
const FAQ_COST = [`How much does it cost to rent a piano in Melbourne?`, `Our Yamaha uprights rent from ${money(FROM)} to ${money(TOP)} a month, GST included. Delivery is ${money(DELIVERY)}, collection is ${money(COLLECTION)} and a ${money(BOND)} bond comes back at the end. A ${EX.name} at ${money(EX.rent)} a month comes to ${money(allIn(6))} over 6 months, plus the bond.`]
const FAQ_MIN = [`What is the minimum rental?`, `3 months. Every rental has a fixed end date of 3, 6 or 12 months. After the first 3 months you can return the piano early on 14 days' notice, and rent stops the day it is collected.`]
const FAQ_KEEP = RENT_TO_BUY
  ? [`Can I buy the piano I am renting?`, `Only on <a href="/piano-rental/rent-to-buy">rent-to-buy</a>. A short hire or a rental gives you no right to buy the piano. If you may want to keep it, choose rent-to-buy from the start.`]
  : [`Can I buy the piano I am renting?`, `No. A short hire or a rental gives you no right to buy the piano.`]
const FAQ_CHECK = [`Do you run a credit check?`, `No. You need to be over 18, live in metro Melbourne and show photo ID to our mover at delivery. We check it and keep no copy.`]
const FAQ_SOON = [`How soon can I have a piano?`, `You can sign and pay online today and choose a start date from a week away. We then offer you delivery days around that date.`]
const FAQ_STAIRS = [`What if I have stairs?`, `The ${money(DELIVERY)} covers a ground-floor room in metro Melbourne with up to 4 steps to get in. For anything more we quote before we book. If you do not accept the quote, we cancel and refund everything you have paid.`]
const FAQ_FAULT = [`What if something goes wrong with the piano?`, `Faults from normal use are ours to fix, at our cost. If the piano cannot be played for a time, you pay no rent for those days, or we swap it for a similar one. Fair wear and tear is ours too. Damage beyond that comes out of the bond, itemised with photos.`]
const FAQ_GRAND = [`Do you rent grand pianos?`, `Not at the moment. Our rental pianos are Yamaha uprights.`]
const FAQ_EVENT = [`Can I hire a piano for a wedding or an event?`, `No. Our shortest hire is 3 months, so we are not the right call for a single event.`]
const FAQ_CANCEL = [`Can I change my mind after signing?`, `Yes. You can cancel at any time before the piano leaves us, and we refund everything you have paid.`]
const FAQ_MOVE = [`Can I move the piano myself?`, `No. Only our mover may move it. If you move house, tell us and we arrange it at the mover's cost.`]

/* ---------- /piano-rental ---------- */
const hubFaqs = [FAQ_COST, FAQ_MIN, FAQ_KEEP, FAQ_CHECK, FAQ_SOON, FAQ_STAIRS, FAQ_FAULT, FAQ_CANCEL, FAQ_GRAND, FAQ_EVENT]
shell({
  file: 'index.html',
  url: '/piano-rental',
  title: `Piano Rental Melbourne from ${money(FROM)} a Month | Signature Pianos`,
  description: `Rent a pre-loved Yamaha upright in Melbourne from ${money(FROM)} a month. Hand-picked in Japan, tuned and delivered. Sign online and pay once.${RENT_TO_BUY ? ' Rental or rent-to-buy.' : ''}`,
  crumbs: [['Piano rental', '/piano-rental']],
  schema: [SERVICE, faqSchema(hubFaqs)],
  scripts: '<script src="/js/office-config.js"></script>\n<script src="/js/office.js"></script>\n<script src="/js/rentals.js" defer></script>\n',
  body: `
${hero({ eyebrow: 'Pre-loved Yamaha uprights', big: 'Piano rental', script: 'in Melbourne',
  sub: `Yamaha uprights hand-picked in Japan and checked in Melbourne, from ${money(FROM)} a month. Choose your piano, sign on your phone and pay once. We tune it, bring it to you and look after it while it is with you.`,
  actions: '<a class="rp-btn" href="#pianos">Choose a piano</a><a class="rp-link" href="/piano-rental/terms">Read the terms</a>' })}

<dl class="rp-strip">
  <div><dt>Rent from</dt><dd>${money(FROM)} a month</dd></div>
  <div><dt>Fixed terms</dt><dd>3, 6 or 12 months</dd></div>
  ${RENT_TO_BUY ? '<div><dt>Or own it</dt><dd>Rent-to-buy</dd></div>' : `<div><dt>Bond, returned</dt><dd>${money(BOND)}</dd></div>`}
  <div><dt>Fees and interest</dt><dd>None</dd></div>
</dl>

<section class="rp-section" id="options">
  <div class="rp-inner">
  ${head(RENT_TO_BUY ? 'Three ways' : 'Two ways', 'to rent')}
  <p class="rp-lead">Every option has a clear end and a total you can add up before you sign. There is no admin fee, no late fee and no interest on any of them.</p>
  <div class="rp-options${RENT_TO_BUY ? '' : ' rp-options--two'}">
    <article class="rp-option">
      <h3>Short hire</h3>
      <p>3 months, for a term of lessons, an exam or a long stay in Melbourne.</p>
      <ul>
        <li><span>Term</span><span>3 months</span></li>
        <li><span>Rent</span><span>The piano's rent</span></li>
        <li><span>Delivery and collection</span><span>${money(DELIVERY)} each way</span></li>
        <li><span>Bond, returned</span><span>${money(BOND)}</span></li>
        <li><span>${EX.name}, all in</span><span>${money(allIn(3))}</span></li>
      </ul>
      <a class="rp-link" href="/piano-rental/short-term">About short hire</a>
    </article>
    <article class="rp-option">
      <h3>Rental</h3>
      <p>6 or 12 months, for a year of lessons or a piano at home for as long as you need one. 12 months includes a home tuning.</p>
      <ul>
        <li><span>Term</span><span>6 or 12 months</span></li>
        <li><span>Rent</span><span>The piano's rent</span></li>
        <li><span>Delivery and collection</span><span>${money(DELIVERY)} each way</span></li>
        <li><span>Bond, returned</span><span>${money(BOND)}</span></li>
        <li><span>${EX.name}, all in</span><span>${money(allIn(6))} or ${money(allIn(12))}</span></li>
      </ul>
      <a class="rp-link" href="/piano-rental/prices">See the prices</a>
    </article>
    ${RENT_TO_BUY ? `    <article class="rp-option rp-option--felt">
      <h3>Rent-to-buy</h3>
      <p>Every dollar you pay counts toward a price fixed the day you sign. Give it back after 3 months if you change your mind.</p>
      <ul>
        <li><span>Term</span><span>Up to 24 months</span></li>
        <li><span>Rent</span><span>The price ÷ 24</span></li>
        <li><span>Delivery</span><span>${money(DELIVERY)}, counted</span></li>
        <li><span>Bond, returned</span><span>${money(BOND)}</span></li>
        <li><span>${EX.name}</span><span>${money(toOwn(EX.price))} a month</span></li>
      </ul>
      <a class="rp-link" href="/piano-rental/rent-to-buy">How rent-to-buy works</a>
    </article>` : ''}
  </div>
  ${RENT_TO_BUY ? '<p class="rp-note">A short hire or a rental gives you no right to buy the piano. If you may want to keep it, choose rent-to-buy from the start.</p>' : ''}
  </div>
</section>

<section class="rp-section" id="pianos">
  <div class="rp-inner">
  <section class="cat-section" id="rp-live" hidden>
    ${head('Ready', 'to rent', '<span class="cat-section-count" id="rp-live-count"></span>')}
    <div class="cat-grid" id="rp-live-list"></div>
  </section>
  ${head('What each model', 'rents for')}
  <p class="rp-lead">All Yamaha, all hand-picked in Japan and checked in Melbourne. Rent follows each piano's age and condition, so two of the same model can differ.</p>
  ${table(['Model', 'Height', 'Made', 'Rent a month'], MODELS, [3])}
  <p class="rp-note">GST is included. <span id="rp-table-note">To hear what is ready to rent now, call <a href="tel:+61479128955">0479 128 955</a> or <a href="/services/book-a-viewing.html">book a visit</a>.</span> Not sure which? <a href="/piano-rental/yamaha-u1-u3">We compare them here.</a></p>
  </div>
</section>

<section class="rp-section rp-section--deep">
  <div class="rp-inner">
  ${head('Five steps', 'from your phone')}
  <ol class="rp-steps">
    <li><h3>Choose</h3><p>Pick a piano and how long you want it. You see the rent, the total and what you pay today before you go any further.</p></li>
    <li><h3>Sign</h3><p>Read the agreement and sign it on your phone or computer. A copy stays on your own page.</p></li>
    <li><h3>Pay once</h3><p>Save one card or bank account. We take the first month, the delivery fee and the bond together.</p></li>
    <li><h3>Pick your day</h3><p>Choose a delivery day from those on offer and tell us about the way in.</p></li>
    <li><h3>Play</h3><p>Our mover brings the piano, places it and photographs its condition. Your page shows your agreement, payments and what comes next.</p></li>
  </ol>
  </div>
</section>

<section class="rp-section">
  <div class="rp-inner">
  <div class="rp-split">
    <img src="/media/home/unit-yu33.webp" width="1200" height="1200" alt="A pre-loved Yamaha upright in polished ebony, photographed in Japan" loading="lazy">
    <div>
      ${head('What comes', 'with it')}
      <ul class="rp-list">
        <li>A piano checked in Melbourne and tuned before it leaves us</li>
        <li>A stool with every rental</li>
        <li>Faults from normal use fixed at our cost</li>
        <li>A home tuning on 12-month rentals${RENT_TO_BUY ? ' and rent-to-buy' : ''}</li>
        <li>Your own page, with your agreement, payments and delivery in one place</li>
      </ul>
    </div>
  </div>
  </div>
</section>

<section class="rp-section">
  <div class="rp-inner">
  ${head('Questions', 'we hear most')}
  ${faqBlock(hubFaqs)}
  ${MORE('/piano-rental')}
  </div>
</section>

${CLOSE}`,
})

/* ---------- /piano-rental/prices ---------- */
const priceFaqs = [FAQ_COST, [`What do I pay on the first day?`, `The first month's rent, the delivery fee and the bond, together. On a ${EX.name} that is ${money(EX.rent)} + ${money(DELIVERY)} + ${money(BOND)}, which comes to ${money(dayOne)}. After that you pay the rent each month.`], [`Do I get the bond back?`, `Yes, after the piano comes back, in full unless rent is owing or there is damage beyond fair wear and tear. If we keep any of it we tell you in writing how much and why, with photos.`], [`Are there any other fees?`, `No. There is no admin fee, no late fee and no interest. The only extra charge you could meet is a quote for difficult access, which you see before we book.`]]
shell({
  file: 'prices.html',
  url: '/piano-rental/prices',
  title: 'Piano Rental Prices in Melbourne | Signature Pianos',
  description: 'What it costs to rent a piano in Melbourne: monthly rent by Yamaha model, delivery and bond, worked totals for 3, 6 and 12 months, and when buying costs less.',
  crumbs: [['Piano rental', '/piano-rental'], ['Prices', '/piano-rental/prices']],
  schema: [SERVICE, faqSchema(priceFaqs)],
  body: `
${hero({ eyebrow: 'Pre-loved Yamaha uprights', big: 'Piano rental prices', script: 'in Melbourne',
  sub: `Our Yamaha uprights, hand-picked in Japan and checked in Melbourne, rent from ${money(FROM)} to ${money(TOP)} a month with GST included. Here is every cost, added up.`,
  actions: CHOOSE })}

<section class="rp-section rp-section--deep">
  <div class="rp-inner">
  ${head('Rent', 'by model')}
  <p class="rp-lead">Rent follows each piano's age and condition, so two of the same model can differ. Published rents in Melbourne for the same Yamaha models ran from $120 to $140 a month when we checked in October 2026.</p>
  ${table(['Model', 'Height', 'Made', 'Rent a month'], MODELS, [3])}
  </div>
</section>

<section class="rp-section">
  <div class="rp-inner">
  ${head('Worked', 'totals')}
  <p class="rp-lead">A ${EX.name}, which rents for ${money(EX.rent)} a month and sells for ${money(EX.price)}. The bond is kept apart because it comes back.</p>
  ${table(['Option', 'Rent a month', 'Rent over the term', 'Delivery and collection', 'All in', 'First day'], [
    ['Short hire, 3 months', money(EX.rent), money(EX.rent * 3), money(DELIVERY + COLLECTION), money(allIn(3)), money(dayOne)],
    ['Rental, 6 months', money(EX.rent), money(EX.rent * 6), money(DELIVERY + COLLECTION), money(allIn(6)), money(dayOne)],
    ['Rental, 12 months', money(EX.rent), money(EX.rent * 12), money(DELIVERY + COLLECTION), money(allIn(12)), money(dayOne)],
    ...(RENT_TO_BUY ? [['Rent-to-buy', money(toOwn(EX.price)), `${money(EX.price - DELIVERY)} over ${payments(EX.price)} payments`, `${money(DELIVERY)}, counted`, `${money(EX.price)}, and it is yours`, money(toOwn(EX.price) + DELIVERY + BOND)]] : []),
  ], [1, 4, 5], true)}
  <p class="rp-note">The first day is the first month, the delivery fee and the ${money(BOND)} bond. Delivery and collection cover a ground-floor room in metro Melbourne with up to 4 steps to get in.</p>
  </div>
</section>

<section class="rp-section rp-section--deep">
  <div class="rp-inner">
  <div class="rp-prose">
    ${head('Renting', 'or buying')}
    <p>Renting suits you when you do not yet know how long a piano will stay in your life. Buying suits you once you do.</p>
    <p>On the ${EX.name}, two 12-month rentals in a row would come to about ${money(EX.rent * 24 + DELIVERY + COLLECTION)}, and the piano goes back at the end. Buying it costs ${money(EX.price)} plus delivery, and it stays yours. So on this piano, if you expect to play for about three years or more, buying costs less.</p>
    ${RENT_TO_BUY ? '<p>If you are somewhere between the two, <a href="/piano-rental/rent-to-buy">rent-to-buy</a> counts every dollar toward the price and lets you stop after 3 months.</p>' : ''}
  </div>
  </div>
</section>

<section class="rp-section">
  <div class="rp-inner">
  ${head('Price', 'questions')}
  ${faqBlock(priceFaqs)}
  ${MORE('/piano-rental/prices')}
  </div>
</section>

${CLOSE}`,
})

/* ---------- /piano-rental/rent-to-buy ---------- */
const ownFaqs = [
  [`Is rent-to-buy a loan?`, `You hire the piano and hold a right to buy it at the price in your agreement. We charge no fee and no interest, and you can never pay more than that price.`],
  [`What happens to my payments if I give it back?`, `What you paid covered your time with the piano. It is not refunded, and it no longer counts toward any piano. We collect at no charge and refund your bond, in full unless rent is owing or there is damage beyond fair wear and tear.`],
  [`Can I pay it off early?`, `Yes, at any time. Your own page shows what is left, which is simply the price less everything you have paid toward it.`],
  [`When does the piano become mine?`, `On the day what you have paid toward it reaches the price. The 10-year warranty starts that day.`],
  [`Why do you need my date of birth?`, `Until the piano is yours we record our interest in it on the Personal Property Securities Register, a national register, and that record needs your date of birth. We remove it when you own the piano.`],
  FAQ_CHECK,
]
if (RENT_TO_BUY) shell({
  file: 'rent-to-buy.html',
  url: '/piano-rental/rent-to-buy',
  title: 'Rent to Buy a Piano in Melbourne | Signature Pianos',
  description: 'Rent-to-buy a pre-loved Yamaha in Melbourne. Every dollar of rent counts toward a price fixed the day you sign. No fees, no interest, yours within 24 months.',
  crumbs: [['Piano rental', '/piano-rental'], ['Rent-to-buy', '/piano-rental/rent-to-buy']],
  schema: [{ ...SERVICE, name: 'Rent-to-buy a piano in Melbourne', serviceType: 'Piano rent-to-buy' }, faqSchema(ownFaqs)],
  body: `
${hero({ eyebrow: 'Pre-loved Yamaha uprights', big: 'Rent to buy a piano', script: 'in Melbourne',
  sub: 'Take a Yamaha upright, hand-picked in Japan and checked in Melbourne, home now and pay for it month by month. Every dollar counts toward a price fixed the day you sign. No fee, no interest, and you can stop after 3 months.',
  actions: `${CHOOSE}<a class="rp-link" href="/piano-rental/terms#rent-to-buy">Read the agreement</a>` })}

<section class="rp-section rp-section--deep">
  <div class="rp-inner">
  ${head('How it', 'adds up')}
  <p class="rp-lead">The monthly payment is the price divided by 24, rounded up to the next $5. The ${money(DELIVERY)} delivery fee counts toward the price too, so most pianos are paid off a little sooner.</p>
  ${table(['Piano', 'Price, fixed', 'A month', 'Payments', 'First day'], OWN.map(([name, price]) => [name, money(price), money(toOwn(price)), String(payments(price)), money(toOwn(price) + DELIVERY + BOND)]), [1, 2, 3, 4])}
  <p class="rp-note">GST is included. The first day is the first month, the delivery fee and the ${money(BOND)} bond. The bond does not count as rent: when you own the piano we put it toward your last payment or refund it, as you choose.</p>
  </div>
</section>

<section class="rp-section">
  <div class="rp-inner">
  <div class="rp-prose">
    ${head('The promises', 'in writing')}
    <ul>
      <li><strong>Every dollar counts.</strong> All your rent and the delivery fee go toward the price.</li>
      <li><strong>The price cannot go up.</strong> It is fixed the day you sign.</li>
      <li><strong>You never pay more than the price.</strong> There is no fee, no late fee and no interest.</li>
      <li><strong>You can pay it off at any time.</strong> Your own page always shows what is left.</li>
      <li><strong>You can stop.</strong> After the first 3 months, give us 14 days' notice and we collect it at no charge.</li>
      <li><strong>It is looked after.</strong> We tune it once a year in your home and fix faults from normal use at our cost.</li>
    </ul>
    <h2>Rent-to-buy, or a rental?</h2>
    <p>A rental costs less each month, but the piano goes back at the end and you have no right to buy it. Rent-to-buy costs more each month because every dollar is working toward owning the piano. If you are fairly sure you will keep playing, it is the better fit. If you only need a piano for a while, <a href="/piano-rental">a rental</a> is.</p>
  </div>
  </div>
</section>

<section class="rp-section rp-section--deep">
  <div class="rp-inner">
  ${head('Rent-to-buy', 'questions')}
  ${faqBlock(ownFaqs)}
  ${MORE('/piano-rental/rent-to-buy')}
  </div>
</section>

${CLOSE}`,
})

if (!RENT_TO_BUY) fs.rmSync(path.join(OUT, 'rent-to-buy.html'), { force: true })

/* ---------- /piano-rental/short-term ---------- */
const shortFaqs = [FAQ_MIN, [`Can I extend a short hire?`, `Yes, by signing a new agreement for a new fixed term before this one ends. It does not roll on by itself.`], FAQ_EVENT, FAQ_STAIRS, FAQ_CANCEL]
shell({
  file: 'short-term.html',
  url: '/piano-rental/short-term',
  title: 'Short Term Piano Hire Melbourne | Signature Pianos',
  description: 'Hire a pre-loved Yamaha upright in Melbourne for 3 months. Tuned, delivered and collected, with a fixed end date. For a term of lessons, an exam or a long stay.',
  crumbs: [['Piano rental', '/piano-rental'], ['Short term hire', '/piano-rental/short-term']],
  schema: [{ ...SERVICE, name: 'Short term piano hire in Melbourne', serviceType: 'Short term piano hire' }, faqSchema(shortFaqs)],
  body: `
${hero({ eyebrow: 'Pre-loved Yamaha uprights', big: 'Short term piano hire', script: 'in Melbourne',
  sub: 'A real Yamaha upright, hand-picked in Japan and checked in Melbourne, in your home for 3 months. It arrives tuned, and we collect it at the end.',
  actions: CHOOSE })}

<section class="rp-section rp-section--deep">
  <div class="rp-inner">
  <div class="rp-prose">
    ${head('Who it', 'suits')}
    <ul>
      <li>A child starting lessons, for a first term on a real piano</li>
      <li>A student with an exam or audition coming up</li>
      <li>A family in Melbourne for a few months, with no piano of their own here</li>
      <li>A pianist whose own piano is away for repairs or a renovation</li>
    </ul>
    <h2>What it costs</h2>
    <p>A ${EX.name} rents for ${money(EX.rent)} a month, so a 3-month hire comes to ${money(EX.rent * 3)} in rent, plus ${money(DELIVERY)} delivery and ${money(COLLECTION)} collection: ${money(allIn(3))} all in. The ${money(BOND)} bond comes back after the piano does. <a href="/piano-rental/prices">Every model's rent is on our prices page.</a></p>
    <h2>When the 3 months end</h2>
    <p>Your hire has a fixed end date and does not roll on. About 30 days before it, we ask what you would like. We collect the piano, or we both sign a new agreement for a new fixed term.</p>
  </div>
  </div>
</section>

<section class="rp-section">
  <div class="rp-inner">
  ${head('Short hire', 'questions')}
  ${faqBlock(shortFaqs)}
  ${MORE('/piano-rental/short-term')}
  </div>
</section>

${CLOSE}`,
})

/* ---------- /piano-rental/yamaha-u1-u3 ---------- */
const modelFaqs = [
  [`Is a Yamaha U1 or U3 better for a beginner?`, `Either. The U1 is 121 cm tall and the U3 is 131 cm. The taller piano has longer strings and a fuller bass, while the U1 fits more easily under a window or in a smaller room. Both are full 88-note acoustic pianos.`],
  [`How old are your rental pianos?`, `Most were made between 1979 and 1995, with some from 2002 to 2023. You can check a Yamaha's age yourself with our <a href="/serial-number-lookup.html">serial number lookup</a>.`],
  [`Can I try one first?`, `Yes. <a href="/services/book-a-viewing.html">Book a visit</a> to our Mount Waverley showroom and play them.`],
  FAQ_COST,
]
shell({
  file: 'yamaha-u1-u3.html',
  url: '/piano-rental/yamaha-u1-u3',
  title: 'Rent a Yamaha U1 or U3 in Melbourne | Signature Pianos',
  description: 'Which Yamaha upright to rent: the U1, U3, UX and YU compared by height, age and monthly rent, from the pianos we hand-pick in Japan and check in Melbourne.',
  crumbs: [['Piano rental', '/piano-rental'], ['Which Yamaha to rent', '/piano-rental/yamaha-u1-u3']],
  schema: [SERVICE, faqSchema(modelFaqs)],
  body: `
${hero({ eyebrow: 'Hand-picked in Japan', big: 'Rent a Yamaha U1 or U3', script: 'in Melbourne',
  sub: 'The U1 and the U3 are the uprights most people ask for, and the two heights you will meet in every Yamaha below. Here is how the models we rent compare.',
  actions: CHOOSE })}

<section class="rp-section rp-section--deep">
  <div class="rp-inner">
  <div class="rp-prose">
    ${head('121 cm', 'or 131 cm')}
    <p>Height is the first choice. A taller upright has longer strings, which gives a fuller bass and a bigger sound. A 121 cm piano sits more easily under a window and suits a smaller room. A 131 cm piano suits a player who wants the sound to fill the room. Both weigh well over 200 kg, which is why only our mover moves them.</p>
  </div>
  ${table(['Model', 'Height', 'What sets it apart', 'Rent a month'], [
    ['U10 (U10Bl, U10A)', '121 cm', 'Yamaha called the U10A its standard 121 cm model', '$125 to $130'],
    ['U1 (U1H, U1M, U1A)', '121 cm', 'The classic 121 cm Yamaha', '$115 to $125'],
    ['UX1', '121 cm', 'X-type back post and all-underfelt hammers', '$130'],
    ['YM5', '121 cm', 'A newer piano, made 2004 to 2006', '$125'],
    ['YU10', '121 cm', 'All-underfelt hammers and a soft-landing fallboard', '$140'],
    ['YU11', '121 cm', 'The 121 cm piano of the U series from 2006, with a soft-landing fallboard', '$150'],
    ['U3 (U3H, U3M, U3A)', '131 cm', 'The classic 131 cm Yamaha', '$125 to $130'],
    ['UX3', '131 cm', 'X-type back post, with slits beside the upper panel to let the sound out', '$150'],
    ['U30A', '131 cm', 'All 88 hammers underfelted', '$150'],
    ['UX5', '131 cm', 'Agraffes in the tenor and bass, and a music desk that slides forward', '$150'],
    ['U300', '131 cm', 'The last of its line, made 1994 to 1997', '$150'],
    ['UX30A', '131 cm', 'Agraffes in the tenor and bass, and walnut hammer mouldings', '$165'],
    ['YUS3', '131 cm', 'The higher grade of Yamaha\'s modern 131 cm line, made 2016', '$190'],
  ], [3])}
  <p class="rp-note">Rent differs with each piano's age and condition. All-underfelt means an extra layer of felt under each hammer. An agraffe is a small metal guide that holds a string in exact position.</p>
  </div>
</section>

<section class="rp-section">
  <div class="rp-inner">
  ${head('Yamaha', 'questions')}
  ${faqBlock(modelFaqs)}
  ${MORE('/piano-rental/yamaha-u1-u3')}
  </div>
</section>

${CLOSE}`,
})

/* ---------- /piano-rental/terms: the office's own words ---------- */
const draftAt = [process.argv[2], path.resolve(ROOT, '../../Signature-Pianos-office/discovery/drafts/rental-terms.md'), path.resolve(ROOT, '../Signature-Pianos-office/discovery/drafts/rental-terms.md')].find((p) => p && fs.existsSync(p))
if (!draftAt) throw new Error('the office draft rental-terms.md was not found: give its path')
const blocks = fs.readFileSync(draftAt, 'utf8').replace(/\r\n/g, '\n').split('```')
const [plainWords, earlyWords, ownWords] = [blocks[1], blocks[3], blocks[5]]
const FACTS = {
  rental: 'its number',
  date: 'the day you sign',
  shop: 'Parke Music Group Pty Ltd, trading as Signature Pianos, ABN 94 702 480 340, 63 Blackburn Road, Mount Waverley VIC 3149, phone 0479 128 955, email info@signaturepianos.com.au',
  hirer: 'Your name, address, email and phone.',
  piano: 'Its make, model, serial number and year.',
  term: '3, 6 or 12 months, as you choose',
  start: 'the start date',
  end: 'the end date',
  rent: 'The piano\'s rent a month, shown before you sign',
  payments: 'The agreement lists how many monthly payments there are, and the rent in all.',
  bond: money(BOND),
  delivery: `Delivery: ${money(DELIVERY)}`,
  return_fee: `Collection at the end: ${money(COLLECTION)}`,
  total: 'The rent, delivery and collection added up, with the bond shown beside it.',
  early_return: earlyWords.trim(),
  price: 'The piano\'s price, shown before you sign',
  buy_rent: 'The price divided by 24, rounded up to the next $5, each month, with a last payment of whatever is left,',
  months: '24',
}
const fill = (t) => t.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (w, k) => {
  if (!(k in FACTS)) throw new Error(`no words for the fact ${w}`)
  return FACTS[k]
})
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const agreement = (words) => {
  const lines = fill(words).trim().split('\n').filter((l) => l.trim())
  return lines.slice(2).map((l) => {
    const isHead = /^\d+\. /.test(l) || ['The shop', 'The hirer', 'The piano'].includes(l.trim())
    return isHead ? `<h3>${esc(l)}</h3>` : `<p>${esc(l)}</p>`
  }).join('\n')
}
shell({
  file: 'terms.html',
  url: '/piano-rental/terms',
  title: 'Piano Rental Terms and Conditions | Signature Pianos',
  description: `The full terms of our piano rentals${RENT_TO_BUY ? ' and rent-to-buy' : ''} in Melbourne, in plain English: the rent, bond, delivery, early return, damage and what happens at the end.`,
  crumbs: [['Piano rental', '/piano-rental'], ['Terms', '/piano-rental/terms']],
  body: `
${hero({ eyebrow: 'Version 1', big: 'Rental terms', script: 'and conditions',
  sub: 'These are the words you sign. The figures for your piano are filled in and shown before you sign, and a copy stays on your own page.',
  actions: '<a class="rp-link" href="#summary">In short</a><a class="rp-link" href="#rental">Short hire and rental</a>' + (RENT_TO_BUY ? '<a class="rp-link" href="#rent-to-buy">Rent-to-buy</a>' : '') })}

<section class="rp-section rp-section--deep" id="summary">
  <div class="rp-inner">
  <div class="rp-prose">
    ${head('In', 'short')}
    <ul>
      <li>Every rental has an end date: 3, 6 or 12 months${RENT_TO_BUY ? ', or up to 24 months on rent-to-buy' : ''}. Nothing rolls on.</li>
      <li>The first month, the ${money(DELIVERY)} delivery fee and the ${money(BOND)} bond are paid before we book delivery.</li>
      <li>You can cancel for a full refund at any time before the piano leaves us.</li>
      <li>The rent for the first 3 months is payable whatever happens. After that you can return the piano on 14 days' notice.</li>
      <li>There is no admin fee, no late fee and no interest.</li>
      <li>Faults from normal use and fair wear and tear are ours. Damage beyond that is yours, itemised with photos.</li>
      <li>You must be over 18, live in metro Melbourne and show photo ID at delivery.</li>
      <li>A short hire or a rental gives you no right to buy the piano.${RENT_TO_BUY ? ' Rent-to-buy does.' : ''}</li>
    </ul>
    <p>This summary is a guide. The agreement below is what binds us both. Nothing here takes away your rights under the Australian Consumer Law.</p>
  </div>
  </div>
</section>

<section class="rp-section" id="rental">
  <div class="rp-inner">
  ${head('Short hire', 'and rental')}
  <div class="rp-agreement">
${agreement(plainWords)}
  </div>
  </div>
</section>

${RENT_TO_BUY ? `<section class="rp-section rp-section--deep" id="rent-to-buy">
  <div class="rp-inner">
  ${head('Rent-to-buy', 'agreement')}
  <div class="rp-agreement">
${agreement(ownWords)}
  </div>
  </div>
</section>` : ''}

${CLOSE}`,
})

/* ---------- /privacy: every line a fact of the site or the office; change it when they change ---------- */
shell({
  file: 'privacy.html',
  dir: ROOT,
  url: '/privacy',
  title: 'Privacy Policy | Signature Pianos',
  description: 'What Signature Pianos collects when you enquire, buy or rent a piano, why we need it, who sees it, and how to see, change or remove it.',
  crumbs: [['Privacy policy', '/privacy']],
  body: `
${hero({ eyebrow: 'Signature Pianos', big: 'Privacy', script: 'policy',
  sub: 'What we collect when you enquire, buy or rent a piano, why we need it, who sees it, and how to see, change or remove it.' })}

<section class="rp-section">
  <div class="rp-inner">
  <div class="rp-prose">
    <h2>Who we are</h2>
    <p>Signature Pianos is the trading name of Parke Music Group Pty Ltd, ABN 94 702 480 340, of 63 Blackburn Road, Mount Waverley VIC 3149. In this policy, we and us mean that company.</p>

    <h2>What we collect</h2>
    <ul>
      <li><strong>Enquiries and visits:</strong> your name, email, phone, what you ask us, the pianos you are interested in and the day you would like to come.</li>
      <li><strong>The buyer's guide and piano questions:</strong> your name, email, phone if you give it, and your answers about budget, space, who is playing and when you hope to buy.</li>
      <li><strong>Tuning and servicing:</strong> your name, contact details, suburb and details of your piano.</li>
      <li><strong>Teacher matching:</strong> your suburb, the price you have in mind and your answers about lessons.</li>
      <li><strong>Buying or renting a piano:</strong> your name, email, phone, delivery address and the way in, what you bought or rented, your payments, your agreement and your signature, and when you signed.</li>
      <li><strong>Delivery and collection:</strong> our mover records that the piano arrived and photographs its condition. At a rental's delivery the mover sees your photo ID. We keep no copy, only a note that it was checked.</li>
      <li><strong>How you found us:</strong> what you tell us, the page you came from, and any campaign tag on the link you followed, such as one from a Google or Facebook ad.</li>
      <li><strong>Keeping our forms safe:</strong> our systems count the forms sent from each internet address, and keep a scrambled copy of that address for a short time, to stop automated abuse.</li>
    </ul>
    <p>Your card or bank details go straight to Stripe, our payment provider. We never see the full number. We keep the kind of card or account and its last digits, so we can tell you which one is saved.</p>

    <h2>Why we need it</h2>
    <ul>
      <li>To answer you, and to arrange your visit, delivery, tuning or service.</li>
      <li>To sell or rent you a piano, take payment, and keep your agreement, receipts and warranty.</li>
      <li>To look after a piano while it is with you, and to contact you about it.</li>
      <li>To keep the records the law asks of a business.</li>
      <li>To see which of our pages and advertising bring people to us.</li>
    </ul>

    <h2>Who sees it</h2>
    <p>We do not sell your information. It is seen by our own people, and by others only as far as each needs it:</p>
    <ul>
      <li><strong>Movers and tuners:</strong> your name, contact details, address and the way in, for the job they are doing.</li>
      <li><strong>Stripe:</strong> takes and holds your payment details.</li>
      <li><strong>Resend:</strong> sends our emails.</li>
      <li><strong>Vercel, Railway and Supabase:</strong> host our website, our office system and its records.</li>
      <li><strong>Cloudflare:</strong> checks that a form is being sent by a person.</li>
      <li><strong>Our accountant and advisers,</strong> when we need them, and anyone the law requires us to tell.</li>
    </ul>
    <p>Some of these providers store or handle information outside Australia, including in the United States.</p>

    <h2>Emails and messages</h2>
    <p>We send the messages your enquiry, order or rental needs. We send news and offers only if you agreed to them, and you can tell us to stop at any time. We value your privacy and will never spam you.</p>

    <h2>Cookies and this website</h2>
    <p>This website runs no advertising or analytics trackers. It keeps small notes in your browser while you visit, such as where you came from, and a sign-in cookie on your own customer page. Fonts and icons load from Google Fonts and jsDelivr, and payment pages from Stripe, and those services see your internet address as they do. Other websites we link to, such as TeachMusic, have their own privacy policies.</p>

    <h2>How long we keep it</h2>
    <p>We keep your details for as long as we need them to look after you and your piano, its warranty and your account, and for as long as the law requires. Tax records, for example, are kept for at least five years.</p>

    <h2>Seeing, changing or removing it</h2>
    <p>You can ask to see what we hold about you, ask us to correct it, or ask us to remove it. Some records we must keep by law, and if so we tell you which. Email <a href="mailto:info@signaturepianos.com.au">info@signaturepianos.com.au</a> or call <a href="tel:+61479128955">0479 128 955</a>.</p>

    <h2>If you have a complaint</h2>
    <p>Tell us first, at the same address, and we will look into it and reply. If you are not happy with our answer, you can go to the Office of the Australian Information Commissioner at <a href="https://www.oaic.gov.au">oaic.gov.au</a> or on 1300 363 992.</p>

    <p class="rp-note">Last updated 1 November 2026.</p>
  </div>
  </div>
</section>`,
})

/* ---------- /piano-rental/start: renting a piano ---------- */
shell({
  file: 'start.html',
  url: '/piano-rental/start',
  title: 'Rent this piano | Signature Pianos',
  description: 'Choose how long you want your piano, tell us where it is going, and sign.',
  crumbs: [['Piano rental', '/piano-rental'], ['Rent this piano', '/piano-rental/start']],
  noindex: true,
  scripts: '<script src="/js/office-config.js"></script>\n<script src="/js/office.js"></script>\n<script src="/js/rentals.js" defer></script>\n',
  body: `
<div class="rp-crumb" role="navigation" aria-label="Breadcrumb"><a href="/piano-rental">Piano rental</a> · <span id="rp-crumb">Rent this piano</span></div>
<section class="product-hero" id="rp-start">
<div class="product-hero-inner">
  <aside class="product-gallery" id="rp-summary" hidden aria-live="polite"></aside>
  <div class="product-info">
    <div class="product-eyebrow" id="rp-start-kind">Piano rental</div>
    <h1 class="product-name" id="rp-start-title">Rent this piano</h1>
    <p class="product-brand" id="rp-start-lead">Choose how long you want it and tell us where it is going. You read and sign the agreement on the next page.</p>
    <div class="product-meta-row" id="rp-start-meta" hidden></div>

    <div id="rp-start-off" hidden>
      <p class="rp-stop">We cannot take a rental online just now. Call us on <a href="tel:+61479128955">0479 128 955</a> or <a href="/services/book-a-viewing.html">book a visit</a> and we will sort it out with you.</p>
    </div>

    <form id="rp-form" novalidate hidden>
      <fieldset class="rp-fieldset" id="rp-piano-pick" hidden>
        <legend>Your piano</legend>
        <div class="rp-plans" id="rp-piano-list"></div>
      </fieldset>

      <fieldset class="rp-fieldset" id="rp-plan-field">
        <legend>How long</legend>
        <div class="rp-plans" id="rp-plans"></div>
      </fieldset>
      <dl class="rp-money" id="rp-money"></dl>

      <fieldset class="rp-fieldset">
        <legend>You</legend>
        <div class="rp-grid">
          <div class="rp-field rp-field--wide"><label for="rp-name">Full name</label><input id="rp-name" name="name" autocomplete="name" required></div>
          <div class="rp-field"><label for="rp-email">Email</label><input id="rp-email" name="email" type="email" autocomplete="email" required></div>
          <div class="rp-field"><label for="rp-phone">Mobile</label><input id="rp-phone" name="phone" type="tel" autocomplete="tel" required></div>
          <div class="rp-field" id="rp-dob-field" hidden><label for="rp-dob">Date of birth</label><input id="rp-dob" name="date_of_birth" type="date" autocomplete="bday">${RENT_TO_BUY ? '<span class="rp-field-help">Rent-to-buy only: we need it to record our interest in the piano on a national register until it is yours.</span>' : ''}</div>
        </div>
      </fieldset>

      <fieldset class="rp-fieldset">
        <legend>Where it is going</legend>
        <div class="rp-grid">
          <div class="rp-field rp-field--wide"><label for="rp-street">Street address</label><input id="rp-street" name="street" autocomplete="street-address" required></div>
          <div class="rp-field"><label for="rp-suburb">Suburb</label><input id="rp-suburb" name="suburb" autocomplete="address-level2" required></div>
          <div class="rp-field"><label for="rp-postcode">Postcode</label><input id="rp-postcode" name="postcode" inputmode="numeric" maxlength="4" autocomplete="postal-code" required></div>
          <div class="rp-field"><label for="rp-start-on">Start date</label><input id="rp-start-on" name="start_on" type="date" required><span class="rp-field-help">Rent runs from the day it is delivered.</span></div>
        </div>
        <label class="rp-tick"><input type="checkbox" id="rp-steps"><span>It is going to a ground-floor room, with no more than 4 steps to get in.</span></label>
        <div class="rp-stop" id="rp-steps-stop" hidden>
          <p>More steps than that is fine, but we need to quote the move first. Call us on <a href="tel:+61479128955">0479 128 955</a> and we will do it with you.</p>
        </div>
      </fieldset>

      <fieldset class="rp-fieldset">
        <legend>Before you sign</legend>
        <label class="rp-tick"><input type="checkbox" id="rp-adult"><span>I am over 18.</span></label>
        <label class="rp-tick"><input type="checkbox" id="rp-terms"><span>I have read the <a href="/piano-rental/terms" target="_blank" rel="noopener">rental terms</a>.</span></label>
        <div id="rp-check" hidden></div>
        <span class="rp-honey" aria-hidden="true"><label>Leave this empty<input id="rp-honey" tabindex="-1"></label></span>
        <p class="rp-error" id="rp-error" role="alert" hidden></p>
        <div class="rp-submit">
          <button class="rp-btn" id="rp-go" type="submit">Continue to sign</button>
        </div>
        <p class="rp-small">Nothing is charged yet. We hold the piano for you while you sign. <a href="/privacy">We value your privacy</a> and will never spam you.</p>
      </fieldset>
    </form>
  </div>
</div>
</section>`,
})

console.log('built piano-rental/ from', path.relative(ROOT, draftAt))
