/*
 * Signature Pianos — the email brand kit
 * --------------------------------------
 * Every email the site sends is built from these pieces, so customers,
 * tuners, drivers and Eric all get the same look: the brand in
 * brand/BRAND-GUIDELINES.md, cut down to what email clients can render.
 *
 *   layout({ preview, label, title, body, footnote })  the whole email
 *   hello(name) · p(html) · note(html) · details(rows) · button(url, text)
 *   buttonOutline(url, text) · steps(items) · divider() · signOff()
 *
 * Rules the kit enforces:
 *   - Key Ivory ground, white card, Ink text, one Ink button per email,
 *     Hammer Felt only as a short rule, a label or an alert edge. No gold.
 *   - Display type is Noto Serif Display capitals with Bodoni, Didot and
 *     Georgia fallbacks; text is Jost falling back to Helvetica and Arial.
 *     Most email apps ignore web fonts, so the fallbacks are what most
 *     people see, and the layout is built to look right in them.
 *   - Tables and inline styles only, 600px wide, stacks on phones.
 *   - The contact details below are the only place the address, phone and
 *     hours live. Change them here.
 */

const SITE_URL = process.env.SITE_URL || 'https://signaturepianos.com.au'

const BUSINESS = {
  name: 'Signature Pianos',
  address1: '63 Blackburn Road',
  address2: 'Mount Waverley VIC 3149',
  phone: '0479 128 955',
  phoneHref: '+61479128955',
  email: 'info@signaturepianos.com.au',
  site: 'signaturepianos.com.au',
  siteUrl: SITE_URL,
  hours: 'Monday to Saturday 9am–5pm · Sunday by appointment',
  line: 'Hand-picked in Japan · Checked in Melbourne',
  logo: `${SITE_URL}/images/brand/signature-logo@2x.png`,
  mapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=63+Blackburn+Road+Mount+Waverley+VIC+3149',
  adminUrl: `${SITE_URL}/admin/`
}

const C = {
  ink: '#16222E',
  inkSoft: '#3A4855',
  ivory: '#F3F0E9',
  ivoryDeep: '#E9E5DB',
  mistLight: '#DCE6ED',
  felt: '#4A1520',
  white: '#FFFFFF'
}

const DISPLAY = "'Noto Serif Display','Bodoni 72','Didot','Bodoni MT',Georgia,'Times New Roman',serif"
const TEXT = "Jost,'Helvetica Neue',Helvetica,Arial,sans-serif"

function esc(value) {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/* Trusted title HTML back to plain text (tags dropped, esc() undone), so it
   can be escaped once for <title> instead of showing "&amp;#39;". */
function plainText(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim()
}

/* ---------- type ---------- */

function label(text, color = C.inkSoft) {
  return `<div style="font-family:${TEXT};font-size:11px;line-height:16px;letter-spacing:3px;text-transform:uppercase;color:${color};">${text}</div>`
}

function title(text) {
  return `<h1 style="margin:12px 0 0;font-family:${DISPLAY};font-weight:500;font-size:36px;line-height:36px;letter-spacing:-.3px;text-transform:uppercase;color:${C.ink};">${text}</h1>`
}

/* A smaller heading inside the card. */
function h2(text) {
  return `<h2 style="margin:30px 0 8px;font-family:${DISPLAY};font-weight:500;font-size:20px;line-height:22px;letter-spacing:.3px;text-transform:uppercase;color:${C.ink};">${text}</h2>`
}

function p(html, opts = {}) {
  const color = opts.muted ? C.inkSoft : C.ink
  const size = opts.small ? 14 : 16
  const lh = opts.small ? 22 : 26
  return `<p style="margin:${opts.first ? '24px' : '14px'} 0 0;font-family:${TEXT};font-size:${size}px;line-height:${lh}px;color:${color};${opts.center ? 'text-align:center;' : ''}">${html}</p>`
}

function hello(name) {
  return p(`Hi ${esc(name || 'there')},`, { first: true })
}

/* ---------- blocks ---------- */

/* rows: [label, valueHtml, strong?]. Values are HTML: escape user data before passing it in. */
function details(rows) {
  const tr = rows.filter(Boolean).map(([k, v, strong]) => `
    <tr>
      <td style="padding:11px 16px 11px 0;border-bottom:1px solid ${C.ivoryDeep};font-family:${TEXT};font-size:11px;line-height:16px;letter-spacing:2px;text-transform:uppercase;color:${C.inkSoft};vertical-align:top;width:38%;">${k}</td>
      <td style="padding:10px 0;border-bottom:1px solid ${C.ivoryDeep};font-family:${TEXT};font-size:15px;line-height:22px;color:${C.ink};${strong ? 'font-weight:500;' : ''}vertical-align:top;">${v === '' || v == null ? '—' : v}</td>
    </tr>`).join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;border-top:1px solid ${C.ivoryDeep};">${tr}</table>`
}

/* A quiet boxed note. tone: 'ivory' (default), 'mist', or 'alert' (felt edge, for anything that needs action). */
function note(html, tone = 'ivory') {
  const bg = tone === 'mist' ? C.mistLight : C.ivory
  const edge = tone === 'alert' ? `border-left:3px solid ${C.felt};` : ''
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;"><tr>
    <td style="background:${bg};${edge}padding:16px 18px;font-family:${TEXT};font-size:15px;line-height:23px;color:${C.ink};">${html}</td>
  </tr></table>`
}

function button(url, text, opts = {}) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" ${opts.center ? 'align="center" style="margin:28px auto 0;"' : 'style="margin-top:28px;"'}><tr>
    <td bgcolor="${C.ink}" style="background:${C.ink};">
      <a href="${esc(url)}" style="display:inline-block;padding:17px 32px 15px;font-family:${TEXT};font-size:13px;line-height:16px;font-weight:500;letter-spacing:3px;text-transform:uppercase;color:${C.white};text-decoration:none;">${text}</a>
    </td>
  </tr></table>`
}

function buttonOutline(url, text, opts = {}) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" ${opts.center ? 'align="center" style="margin:20px auto 0;"' : 'style="margin-top:20px;"'}><tr>
    <td style="border:1px solid ${C.ink};">
      <a href="${esc(url)}" style="display:inline-block;padding:14px 26px 12px;font-family:${TEXT};font-size:12px;line-height:16px;font-weight:500;letter-spacing:3px;text-transform:uppercase;color:${C.ink};text-decoration:none;">${text}</a>
    </td>
  </tr></table>`
}

/* A numbered list of what happens next. items: HTML strings. */
function steps(items) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;">${items.map((html, i) => `
    <tr>
      <td style="width:34px;padding:10px 0;vertical-align:top;font-family:${DISPLAY};font-weight:500;font-size:22px;line-height:24px;color:${C.felt};">${i + 1}</td>
      <td style="padding:10px 0;border-bottom:1px solid ${C.ivoryDeep};font-family:${TEXT};font-size:15px;line-height:23px;color:${C.ink};">${html}</td>
    </tr>`).join('')}</table>`
}

function divider() {
  return `<div style="margin:30px 0 0;height:1px;line-height:1px;font-size:0;background:${C.ivoryDeep};">&nbsp;</div>`
}

function signOff(name = 'Eric Kuang', role = 'Founder, Signature Pianos') {
  return `
    <p style="margin:30px 0 0;font-family:${DISPLAY};font-style:italic;font-size:22px;line-height:26px;color:${C.ink};">${esc(name)}</p>
    <p style="margin:2px 0 0;font-family:${TEXT};font-size:13px;line-height:20px;color:${C.inkSoft};">${esc(role)}</p>`
}

/* Where the showroom is, for any email about a visit. */
function visitBlock() {
  return details([
    ['Showroom', `${BUSINESS.address1}<br>${BUSINESS.address2}<br><a href="${BUSINESS.mapsUrl}" style="color:${C.ink};">Get directions</a>`],
    ['Hours', BUSINESS.hours.replace(' · ', '<br>')],
    ['Phone', `<a href="tel:${BUSINESS.phoneHref}" style="color:${C.ink};text-decoration:none;">${BUSINESS.phone}</a>`]
  ])
}

/* ---------- the whole email ---------- */

/*
 * preview   inbox preview line (hidden in the body)
 * label     small tracked caps above the title, e.g. "Your viewing"
 * title     the display heading (plain text or trusted HTML)
 * body      the card's HTML, built from the pieces above
 * footnote  optional small print under the footer
 * internal  true for emails to Signature Pianos staff: drops the brand line
 */
function layout({ preview = '', label: lbl = '', title: ttl = '', body = '', footnote = '', internal = false }) {
  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${esc(plainText(ttl)) || BUSINESS.name}</title>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500&family=Noto+Serif+Display:wdth,wght@62.5,500&display=swap" rel="stylesheet">
<style>
  @media (max-width:620px) {
    .sp-card { padding:32px 22px !important; }
    .sp-title { font-size:30px !important; line-height:30px !important; }
  }
  a { color:${C.ink}; }
</style>
</head>
<body style="margin:0;padding:0;background:${C.ivory};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.ivory};">${esc(preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.ivory};">
  <tr>
    <td align="center" style="padding:36px 16px 44px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
        <tr>
          <td align="center" style="padding:0 0 18px;">
            <a href="${BUSINESS.siteUrl}/" style="text-decoration:none;"><img src="${BUSINESS.logo}" width="150" alt="Signature Pianos" style="display:block;width:150px;height:auto;border:0;"></a>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 0 28px;">
            <div style="width:36px;height:2px;background:${C.felt};line-height:2px;font-size:0;">&nbsp;</div>
          </td>
        </tr>
        <tr>
          <td class="sp-card" style="background:${C.white};padding:44px 48px 42px;">
            ${lbl ? label(lbl, internal ? C.felt : C.inkSoft) : ''}
            ${ttl ? title(ttl).replace('<h1 ', '<h1 class="sp-title" ') : ''}
            ${body}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:28px 12px 0;font-family:${TEXT};font-size:11px;line-height:20px;letter-spacing:2px;text-transform:uppercase;color:${C.inkSoft};">
            ${BUSINESS.address1}, ${BUSINESS.address2}<br>
            <a href="tel:${BUSINESS.phoneHref}" style="color:${C.inkSoft};text-decoration:none;">${BUSINESS.phone}</a> &nbsp;·&nbsp; <a href="mailto:${BUSINESS.email}" style="color:${C.inkSoft};text-decoration:none;">${BUSINESS.email}</a><br>
            <a href="${BUSINESS.siteUrl}/" style="color:${C.inkSoft};text-decoration:none;">${BUSINESS.site}</a>
          </td>
        </tr>
        ${internal ? '' : `<tr>
          <td align="center" style="padding:14px 12px 0;font-family:${TEXT};font-size:11px;line-height:16px;letter-spacing:3px;text-transform:uppercase;color:${C.felt};">${BUSINESS.line.replace(' · ', ' &nbsp;·&nbsp; ')}</td>
        </tr>`}
        ${footnote ? `<tr>
          <td align="center" style="padding:16px 24px 0;font-family:${TEXT};font-size:12px;line-height:18px;color:${C.inkSoft};">${footnote}</td>
        </tr>` : ''}
      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}

/* Money as $1,234.56 (or $1,234 when whole and opts.whole). */
function money(value, opts = {}) {
  const n = Number(value || 0)
  const s = Math.abs(n).toLocaleString('en-AU', {
    minimumFractionDigits: opts.whole ? 0 : 2, maximumFractionDigits: opts.whole ? 0 : 2
  })
  return (n < 0 ? '−$' : '$') + s
}

/* A date as "Saturday 26 September 2026". Accepts YYYY-MM-DD or anything Date parses.
   Returns safe HTML (unparseable input comes back escaped). A bare date is read
   as noon UTC, which is the same calendar day in Melbourne whatever the server's
   own time zone. */
function longDate(value) {
  if (!value) return '—'
  try {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? new Date(value + 'T12:00:00Z') : new Date(value)
    if (isNaN(d)) return esc(value)
    return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Melbourne' })
  } catch {
    return esc(value)
  }
}

module.exports = {
  BUSINESS, C, DISPLAY, TEXT, esc,
  label, title, h2, p, hello, details, note, button, buttonOutline, steps, divider, signOff, visitBlock,
  layout, money, longDate
}
