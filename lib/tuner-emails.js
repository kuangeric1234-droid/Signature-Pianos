/*
 * Signature Pianos — shared tuner email templates
 * -----------------------------------------------
 * The day-25 contact-stage emails fired by:
 *   - api/cron-delivery-reminders.js (auto, when trigger_date hits)
 *   - api/tuner-send-contact.js (manual, fired from admin button)
 *
 * The two send the same two-email pair (customer heads-up + tuner
 * action) so the templates live here to avoid drift.
 *
 * Built from the brand kit in lib/email-brand.js. The small pieces every
 * tuner email shares (tappable phone, address with a Maps link, the big
 * appointment date, calendar links, the tuner-facing web page shell) are
 * exported as `parts` so the api/tuner-*.js handlers use the same ones.
 */

const {
  BUSINESS, C, DISPLAY, TEXT, esc, label,
  layout, hello, p, h2, details, note, button, steps, divider, signOff
} = require('./email-brand')

/* ---------- shared pieces ---------- */

/* A phone number that dials when tapped. */
function phoneLink(phone) {
  if (!phone) return '—'
  return `<a href="tel:${esc(phone)}" style="color:${C.ink};font-weight:500;">${esc(phone)}</a>`
}

/* An email address that opens a new message when tapped. */
function emailLink(email) {
  if (!email) return '—'
  return `<a href="mailto:${esc(email)}" style="color:${C.ink};word-break:break-word;">${esc(email)}</a>`
}

/* A small caps text link, e.g. "Open in Maps". */
function textLink(url, text, attrs = '') {
  return `<a href="${esc(url)}" ${attrs} style="font-family:${TEXT};font-size:11px;line-height:20px;letter-spacing:2px;text-transform:uppercase;color:${C.ink};">${text}</a>`
}

/* An address (plain text) with a Maps link underneath, for anyone driving there. */
function addressBlock(addressText) {
  if (!addressText) return '—'
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText)}`
  return `${esc(addressText)}<br>${textLink(maps, 'Open in Maps', 'target="_blank" rel="noopener"')}`
}

/* A row of small caps text links separated by dots. links: [url, text, attrs?] */
function linkRow(links) {
  return `<p style="margin:12px 0 0;font-family:${TEXT};font-size:11px;line-height:22px;letter-spacing:2px;text-transform:uppercase;color:${C.inkSoft};">${
    links.map(([url, text, attrs]) => `<a href="${esc(url)}" ${attrs || ''} style="color:${C.ink};white-space:nowrap;">${text}</a>`).join(' &nbsp;·&nbsp; ')
  }</p>`
}

/* Google / Outlook / Apple links from lib/calendar.js's generateCalendarLinks(). */
function calendarLinks(cal, icsFilename, names = ['Google Calendar', 'Outlook', 'Apple / .ics']) {
  return linkRow([
    [cal.googleUrl, names[0], 'target="_blank" rel="noopener"'],
    [cal.outlookUrl, names[1], 'target="_blank" rel="noopener"'],
    [cal.icsDataUrl, names[2], `download="${esc(icsFilename)}"`]
  ])
}

/* The appointment, set large so it can't be missed. dateText and timeText are HTML: escape first. */
function appointment(labelText, dateText, timeText, tone = 'mist') {
  return note(
    label(labelText) +
    `<div style="margin-top:8px;font-family:${DISPLAY};font-weight:500;font-size:26px;line-height:28px;letter-spacing:.2px;text-transform:uppercase;color:${C.ink};">${dateText}</div>` +
    (timeText ? `<div style="margin-top:6px;font-family:${TEXT};font-size:16px;line-height:24px;color:${C.ink};">${timeText}</div>` : ''),
    tone
  )
}

/* The business phone as a tappable link. */
function officePhone() {
  return `<a href="tel:${BUSINESS.phoneHref}" style="color:${C.ink};">${BUSINESS.phone}</a>`
}

/* The business email as a tappable link. */
function officeEmail() {
  return `<a href="mailto:${BUSINESS.email}" style="color:${C.ink};">${BUSINESS.email}</a>`
}

/*
 * The shell for the small web pages a tuner lands on from an email link
 * (mark-complete form, thank-you, "link no longer valid"). Same ground,
 * logo, felt rule and type as the emails. `body` is trusted HTML.
 */
function tunerPage({ title = '', label: lbl = '', body = '' }) {
  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)} — ${BUSINESS.name}</title>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500&family=Noto+Serif+Display:wdth,wght@62.5,500&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; padding: 40px 16px 48px; background: ${C.ivory}; color: ${C.ink}; font-family: ${TEXT}; -webkit-font-smoothing: antialiased; }
  .logo { display: block; width: 150px; height: auto; margin: 0 auto 18px; border: 0; }
  .rule { width: 36px; height: 2px; margin: 0 auto 28px; background: ${C.felt}; }
  .card { max-width: 480px; margin: 0 auto; padding: 40px 32px 38px; background: ${C.white}; }
  .label { font-size: 11px; line-height: 16px; letter-spacing: 3px; text-transform: uppercase; color: ${C.inkSoft}; }
  h1 { margin: 12px 0 0; font-family: ${DISPLAY}; font-weight: 500; font-size: 32px; line-height: 32px; letter-spacing: -.3px; text-transform: uppercase; color: ${C.ink}; }
  p { margin: 14px 0 0; font-size: 16px; line-height: 26px; color: ${C.inkSoft}; }
  p strong { color: ${C.ink}; font-weight: 500; }
  a { color: ${C.ink}; }
  label { display: block; margin: 26px 0 8px; font-size: 11px; line-height: 16px; letter-spacing: 3px; text-transform: uppercase; color: ${C.inkSoft}; }
  textarea { display: block; width: 100%; min-height: 120px; padding: 12px 14px; border: 1px solid ${C.ivoryDeep}; border-radius: 0; background: ${C.white}; font-family: ${TEXT}; font-size: 16px; line-height: 24px; color: ${C.ink}; resize: vertical; }
  textarea:focus { outline: none; border-color: ${C.ink}; }
  button { display: block; width: 100%; margin-top: 22px; padding: 17px 24px 15px; border: 1px solid ${C.ink}; border-radius: 0; background: ${C.ink}; color: ${C.white}; font-family: ${TEXT}; font-size: 13px; line-height: 16px; font-weight: 500; letter-spacing: 3px; text-transform: uppercase; cursor: pointer; transition: background .4s linear, color .4s linear; }
  button:hover, button:focus-visible { background: transparent; color: ${C.ink}; }
  .foot { max-width: 480px; margin: 26px auto 0; text-align: center; font-size: 11px; line-height: 20px; letter-spacing: 2px; text-transform: uppercase; color: ${C.inkSoft}; }
  .foot a { color: ${C.inkSoft}; text-decoration: none; }
  @media (max-width: 520px) { .card { padding: 32px 22px; } h1 { font-size: 28px; line-height: 28px; } }
  @media (prefers-reduced-motion: reduce) { button { transition: none; } }
</style>
</head>
<body>
  <a href="${BUSINESS.siteUrl}/"><img class="logo" src="${BUSINESS.logo}" width="150" alt="${BUSINESS.name}"></a>
  <div class="rule"></div>
  <main class="card">
    ${lbl ? `<div class="label">${lbl}</div>` : ''}
    <h1>${esc(title)}</h1>
    ${body}
  </main>
  <div class="foot">
    <a href="tel:${BUSINESS.phoneHref}">${BUSINESS.phone}</a> &nbsp;·&nbsp; <a href="mailto:${BUSINESS.email}">${BUSINESS.email}</a><br>
    <a href="${BUSINESS.siteUrl}/">${BUSINESS.site}</a>
  </div>
</body>
</html>`
}

/* ---------- templates ---------- */

/* Customer heads-up — sent on day 25 (or whenever admin manually
 * triggers). Tells the customer their piano is ready for its first
 * tuning and that a tuner will call them directly.
 * `settings` is still accepted for the callers; contact details now come
 * from the brand kit (lib/email-brand.js), the one place they live. */
function customerTuningReadyEmail({ customer, piano, settings }) {
  const pianoLabel = `${piano?.brand || 'Yamaha'} ${piano?.model || ''} ${piano?.year || ''}`.trim()
  return layout({
    preview: `Your ${pianoLabel} is ready for its first tuning. One of our tuners will be in touch within the next few days.`,
    label: 'Your first tuning',
    title: 'Your piano is ready for its first tuning',
    body:
      hello(customer?.first_name) +
      p(`Your ${esc(pianoLabel)} has now had enough time to settle into its new home. It is ready for its first tuning, which is included with your piano.`) +
      h2('What happens next') +
      steps([
        'One of our certified tuners will contact you directly to arrange a time that suits you.',
        'They will call or email you within the next few days.',
        'You will receive a confirmation email once the date is agreed.'
      ]) +
      note(`If you have not heard from a tuner within 3 days, please reply to this email or call us on ${officePhone()} and we will follow up.`) +
      signOff()
  })
}

/* Tuner action email — sent at the same time as the customer heads-up.
 * Hands the tuner the customer's name + phone + email + address + the
 * log-date link. Tuner contacts the customer themselves, agrees a date,
 * then opens the link. */
function tunerContactEmail({ tuner, customer, piano, logDateUrl }) {
  const pianoLabel = `${piano?.brand || 'Yamaha'} ${piano?.model || ''} ${piano?.year || ''}`.trim()
  const fullAddress = [
    customer?.address_line1, customer?.address_line2,
    customer?.suburb, customer?.state, customer?.postcode,
  ].filter(Boolean).join(', ')
  const customerName = `${customer?.first_name || ''} ${customer?.last_name || ''}`.trim()

  return layout({
    preview: `${customerName || 'A customer'}, ${pianoLabel}. Please call to arrange the tuning, then log the agreed date.`,
    label: 'Tuning job',
    title: 'New tuning job',
    body:
      hello(tuner?.name) +
      p('You have a new tuning job from Signature Pianos. Please contact the customer directly to arrange a convenient time, then log the agreed date with the button below.') +
      h2('Customer') +
      details([
        ['Name', esc(customerName) || '—', true],
        ['Phone', phoneLink(customer?.phone)],
        ['Email', emailLink(customer?.email)],
        ['Address', addressBlock(fullAddress)]
      ]) +
      h2('Piano') +
      details([
        ['Piano', esc(pianoLabel), true],
        ['Serial', esc(piano?.serial_number || '—')],
        ['Condition', esc(piano?.condition || '—')]
      ]) +
      h2('What to do') +
      steps([
        'Call or email the customer to arrange a convenient time.',
        'Once you have agreed on a date and time, use the button below to log it.',
        'The customer and Signature Pianos are both notified automatically.'
      ]) +
      (logDateUrl
        ? button(logDateUrl, 'Log the agreed date') +
          p('Use this after you have spoken with the customer and agreed on a date and time.', { small: true, muted: true })
        : note('Once you have agreed on a date and time with the customer, reply to this email with it.', 'alert')) +
      divider() +
      p(`Questions? Reply to this email, or call Eric at Signature Pianos on ${officePhone()}.`, { small: true, muted: true }) +
      signOff()
  })
}

module.exports = {
  customerTuningReadyEmail,
  tunerContactEmail,
  parts: {
    phoneLink, emailLink, textLink, addressBlock, linkRow, calendarLinks,
    appointment, officePhone, officeEmail, tunerPage
  }
}

module.exports.templates = { customerTuningReadyEmail, tunerContactEmail }
