/*
 * Signature Pianos — driver test email
 * ------------------------------------
 * POST /api/send-driver-test  body: { test_email, type }
 *   type = 'pickup' | 'delivery'
 *
 * Fires a realistic driver pickup-or-delivery photo-upload email to the
 * supplied address. The upload link inside the email uses a placeholder
 * token, so it opens the "link not found" page.
 *
 * Admin only (Authorization: Bearer <admin access token>, attached by the
 * admin pages): without it this would send branded mail from info@ to any
 * address.
 */

const { Resend } = require('resend')
const { requireAdmin, sendAuthError } = require('../lib/auth')
const {
  BUSINESS, C, TEXT, esc, layout, p, h2, note, button, steps,
} = require('../lib/email-brand')

const resend   = new Resend(process.env.RESEND_API_KEY)
const SITE_URL = process.env.SITE_URL || 'https://signaturepianos.com.au'
const FROM     = 'Signature Pianos <info@signaturepianos.com.au>'

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try { await requireAdmin(req) } catch (e) { return sendAuthError(res, e) }

  const { test_email, type } = req.body || {}
  if (typeof test_email !== 'string' || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(test_email.trim())) {
    return res.status(400).json({ error: 'Missing or invalid test_email' })
  }

  const isPickup = type === 'pickup'

  // Match the real public routing: pickup → /delivery/{token},
  // delivery (dropoff) → /delivery/drop/{token}.
  const tokenUrl = isPickup
    ? `${SITE_URL}/delivery/TEST_PICKUP_TOKEN`
    : `${SITE_URL}/delivery/drop/TEST_DELIVERY_TOKEN`

  const customer = {
    first_name:    'Jane',
    last_name:     'Smith',
    address_line1: '456 Piano Street',
    suburb:        'South Yarra',
    state:         'VIC',
    postcode:      '3141',
    phone:         '+61411222333',
  }
  const piano = {
    model: 'U3A',
    year:  1983,
    serial_number: '3843471',
  }

  try {
    // Resend returns { error } rather than throwing.
    const { error: mailErr } = await resend.emails.send({
      from: FROM,
      to: test_email.trim(),
      subject: isPickup
        ? `[TEST] Piano pickup — action required · Yamaha U3A 1983`
        : `[TEST] Piano delivery — action required · Yamaha U3A 1983`,
      html: buildDriverTestEmail({ isPickup, customer, piano, tokenUrl }),
    })
    if (mailErr) throw mailErr
    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('[send-driver-test] failed', err)
    return res.status(500).json({ error: err.message || 'Test email failed' })
  }
}

/* ---------- email (built with lib/email-brand.js) ---------- */

function phoneLink() {
  return `<a href="tel:${BUSINESS.phoneHref}" style="color:${C.ink};">${BUSINESS.phone}</a>`
}

/* A customer's phone as a tap-to-call link (digits and + only in the href). */
function customerPhoneLink(phone) {
  if (!phone) return ''
  const href = String(phone).replace(/[^\d+]/g, '')
  return `<a href="tel:${esc(href)}" style="color:${C.ink};font-weight:500;">${esc(phone)}</a>`
}

function mapsLink(address) {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`
  return `<a href="${esc(url)}" style="font-family:${TEXT};font-size:13px;letter-spacing:1px;color:${C.ink};">Open in Maps</a>`
}

/*
 * Job details for delivery partners: each label sits above its value, in a
 * larger size, so the address and phone read easily on a phone in the van.
 * rows: [label, valueHtml]. Values are HTML: escape data before passing it in.
 */
function jobDetails(rows) {
  const tr = rows.filter(Boolean).map(([k, v]) => `
    <tr>
      <td style="padding:13px 0 14px;border-bottom:1px solid ${C.ivoryDeep};">
        <div style="font-family:${TEXT};font-size:11px;line-height:16px;letter-spacing:2px;text-transform:uppercase;color:${C.inkSoft};">${k}</div>
        <div style="margin-top:5px;font-family:${TEXT};font-size:17px;line-height:26px;color:${C.ink};">${v === '' || v == null ? '—' : v}</div>
      </td>
    </tr>`).join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;border-top:1px solid ${C.ivoryDeep};">${tr}</table>`
}

/*
 * The sample pickup or delivery job email, as a delivery partner would get
 * it. Pickups are collected from the showroom (as in the real pickup
 * reminder) and delivered to the customer.
 */
function buildDriverTestEmail({ isPickup, customer, piano, tokenUrl }) {
  const customerName = `${customer?.first_name || ''} ${customer?.last_name || ''}`.trim()
  const town = [customer?.suburb, customer?.state, customer?.postcode].filter(Boolean)
  const addressText = [customer?.address_line1, town.join(' ')].filter(Boolean).join(', ')
  const deliverTo = [
    customerName ? `<strong style="font-weight:500;">${esc(customerName)}</strong>` : '',
    customer?.address_line1 ? esc(customer.address_line1) : '',
    town.map(esc).join(' '),
    addressText ? mapsLink(addressText) : '',
  ].filter(Boolean).join('<br>')
  const collectFrom = `${BUSINESS.address1}<br>${BUSINESS.address2}<br>` +
    `<a href="${BUSINESS.mapsUrl}" style="font-family:${TEXT};font-size:13px;letter-spacing:1px;color:${C.ink};">Open in Maps</a>`
  const pianoText = `Yamaha ${piano?.model || ''} ${piano?.year || ''}`.replace(/\s+/g, ' ').trim()
  const pianoLabel = esc(pianoText)

  return layout({
    preview: isPickup
      ? `Pickup job: ${pianoText}. Photograph the piano before you move it.`
      : `Delivery job: ${pianoText}. Photograph the piano once it is in place.`,
    label: isPickup ? 'Pickup job · Test' : 'Delivery job · Test',
    title: isPickup ? 'Pickup photos required' : 'Delivery photos required',
    body: [
      note('<strong style="font-weight:500;">Test email.</strong> This is what your driver will receive.', 'mist'),
      p(isPickup
        ? 'You are picking up a piano for Signature Pianos. Before moving the piano, please photograph it thoroughly using the button below.'
        : "You are delivering a piano for Signature Pianos. After placing the piano in the customer's home, please photograph it using the button below.",
        { first: true }),
      jobDetails([
        ['Piano', pianoLabel],
        ['Serial number', esc(piano?.serial_number)],
        isPickup ? ['Collect from', collectFrom] : null,
        ['Deliver to', deliverTo],
        ['Customer phone', customerPhoneLink(customer?.phone)],
      ]),
      note(`<strong style="font-weight:500;">Important</strong><br>${isPickup
        ? 'Do not move the piano until photos are uploaded. These photos protect you and the business if any damage is claimed.'
        : 'Do not leave until photos are uploaded and confirmed. These photos confirm successful delivery.'}`, 'alert'),
      p('Tap the button to open the photo upload page. You can take photos straight from your phone camera.'),
      button(tokenUrl, isPickup ? 'Upload pickup photos' : 'Upload delivery photos'),
      p('This link is unique to this job. Do not share it.', { small: true, muted: true }),
      h2(isPickup ? 'Pickup steps' : 'Delivery steps'),
      steps(isPickup ? [
        'Inspect the piano for any existing damage before moving it.',
        'Photograph all 4 sides, the keys, and any existing marks or scratches.',
        'Upload all photos with the button above before moving the piano.',
        'The customer is notified automatically that their piano is on its way.',
      ] : [
        "Place the piano in the agreed position in the customer's home.",
        'Photograph the piano in its new position, all 4 sides.',
        'Upload the photos with the button above to confirm delivery.',
        'The customer is notified automatically and their warranty is issued.',
      ]),
      p(`If you have any issues, call Eric directly on ${phoneLink()}. Please do not email about urgent matters.`),
    ].join(''),
  })
}

module.exports.templates = { buildDriverTestEmail }
