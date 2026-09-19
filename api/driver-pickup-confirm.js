/*
 * Signature Pianos — driver pickup confirmation
 * ---------------------------------------------
 * POST /api/driver-pickup-confirm  body: { token, photo_urls, photo_count, notes }
 *
 *   1. Verifies the pickup_link_token (anon SELECT permitted by RLS but
 *      we re-check with service role anyway).
 *   2. Updates the deliveries row — pickup_photos, pickup_confirmed_at,
 *      pickup_notes, status='picked_up'. Routed through the service role
 *      to bypass the deliveries_anon_guard trigger that blocks anon
 *      status / token changes.
 *   3. Sends the customer "your piano is on its way" email + Eric's
 *      internal notification.
 */

const { createClient } = require('@supabase/supabase-js')
const { Resend } = require('resend')
const { internalRecipients } = require('../lib/notify')
const {
  BUSINESS, C, TEXT, esc, layout, hello, p, h2, details, note, button, buttonOutline, steps, longDate,
} = require('../lib/email-brand')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
const resend = new Resend(process.env.RESEND_API_KEY)

const FROM           = 'Signature Pianos <info@signaturepianos.com.au>'
const BUSINESS_EMAIL = process.env.BUSINESS_EMAIL || 'info@signaturepianos.com.au'

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { token, photo_urls, photo_count, notes } = req.body || {}
  if (!token) return res.status(400).json({ error: 'Missing token' })
  if (!Array.isArray(photo_urls) || photo_urls.length < 3) {
    return res.status(400).json({ error: 'At least 3 photos required' })
  }

  try {
    // 1. Token check
    const { data: delivery, error } = await supabase
      .from('deliveries')
      .select(`
        *,
        order:order_id (
          *,
          customer:customer_id ( * ),
          piano:piano_id ( * )
        ),
        partner:delivery_partner_id ( * )
      `)
      .eq('pickup_link_token', token)
      .maybeSingle()
    if (error) throw error
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' })

    if (['picked_up', 'in_transit', 'delivered'].includes(delivery.status)) {
      return res.status(400).json({ error: 'Pickup already confirmed' })
    }

    const customer = delivery.order?.customer || {}
    const piano    = delivery.order?.piano    || {}

    // 2. Row update via service role (bypasses anon guard trigger)
    const { error: updErr } = await supabase
      .from('deliveries')
      .update({
        pickup_photos:       photo_urls,
        pickup_confirmed_at: new Date().toISOString(),
        pickup_notes:        notes || null,
        status:              'picked_up',
      })
      .eq('id', delivery.id)
    if (updErr) throw updErr

    // 3. Company settings for the email footer (non-fatal)
    let settings = {}
    try {
      const { data: s } = await supabase.from('company_settings').select('*').limit(1).maybeSingle()
      if (s) settings = s
    } catch (sErr) {
      console.warn('[driver-pickup-confirm] settings load fell back', sErr)
    }

    // 4. Customer email — "your piano is on its way"
    if (customer.email) {
      try {
        await resend.emails.send({
          from: FROM,
          to: customer.email,
          subject: 'Your piano is on its way — Signature Pianos',
          html: pianoOnItsWayEmail({ customer, piano, settings, delivery }),
        })
      } catch (mailErr) {
        console.error('[driver-pickup-confirm] customer email failed', mailErr)
      }
    }

    // 5. Internal Eric notification
    try {
      await resend.emails.send({
        from: FROM,
        to: internalRecipients(),
        subject: `Pickup confirmed — ${piano.brand || 'Yamaha'} ${piano.model || ''} ${piano.year || ''} · ${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
        html: internalPickupConfirmedEmail({ customer, piano, photo_count, notes }),
      })
    } catch (mailErr) {
      console.error('[driver-pickup-confirm] internal email failed', mailErr)
    }

    // 6. Driver next-step — immediately send the delivery photo link
    // so they have it ready when they arrive at the customer's home.
    const partner = delivery.partner || {}
    if (partner.email && delivery.delivery_link_token) {
      const SITE_URL = process.env.SITE_URL || 'https://signaturepianos.com.au'
      const deliveryUrl = `${SITE_URL}/delivery/drop/${delivery.delivery_link_token}`
      try {
        await resend.emails.send({
          from: FROM,
          to: partner.email,
          subject: `Next step: delivery photos required — ${piano.brand || 'Yamaha'} ${piano.model || ''} ${piano.year || ''}`.trim(),
          html: driverDeliveryLinkEmail({
            driver_name: partner.name,
            customer, piano, delivery_url: deliveryUrl, settings,
          }),
        })
      } catch (mailErr) {
        console.error('[driver-pickup-confirm] delivery-link email failed', mailErr)
      }
    }

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('[driver-pickup-confirm] handler failed', err)
    return res.status(500).json({ error: err.message || 'Confirm failed' })
  }
}


/* ---------- emails (built with lib/email-brand.js) ---------- */

function pianoName(piano) {
  return `${piano?.brand || 'Yamaha'} ${piano?.model || ''} ${piano?.year || ''}`.replace(/\s+/g, ' ').trim()
}

function phoneLink() {
  return `<a href="tel:${BUSINESS.phoneHref}" style="color:${C.ink};">${BUSINESS.phone}</a>`
}

/* A customer's phone as a tap-to-call link (digits and + only in the href). */
function customerPhoneLink(phone) {
  if (!phone) return ''
  const href = String(phone).replace(/[^\d+]/g, '')
  return `<a href="tel:${esc(href)}" style="color:${C.ink};font-weight:500;">${esc(phone)}</a>`
}

/* The customer's address as escaped HTML lines, and as plain text for a maps search. */
function addressHtml(customer) {
  const town = [customer?.suburb, customer?.state, customer?.postcode].filter(Boolean).map(esc).join(' ')
  return [customer?.address_line1 ? esc(customer.address_line1) : '', town].filter(Boolean).join('<br>')
}

function addressText(customer) {
  const town = [customer?.suburb, customer?.state, customer?.postcode].filter(Boolean).join(' ')
  return [customer?.address_line1, town].filter(Boolean).join(', ')
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
 * To the delivery partner, straight after they confirm pickup: where the
 * piano is going, and the link to upload delivery photos once it is placed.
 * `settings` is still accepted; the footer now comes from the brand kit.
 */
function driverDeliveryLinkEmail({ driver_name, customer, piano, delivery_url, settings }) {
  const pianoLabel = pianoName(piano)
  const customerName = `${customer?.first_name || ''} ${customer?.last_name || ''}`.trim()
  const address = addressText(customer)
  const deliverTo = [
    customerName ? `<strong style="font-weight:500;">${esc(customerName)}</strong>` : '',
    addressHtml(customer),
    address ? mapsLink(address) : '',
  ].filter(Boolean).join('<br>')

  return layout({
    preview: `Pickup photos received. Deliver to ${[customerName, address].filter(Boolean).join(', ') || 'the customer'}, then upload delivery photos before you leave.`,
    label: 'Delivery job · Next step',
    title: 'Pickup confirmed',
    body: [
      hello(String(driver_name || '').trim().split(/\s+/)[0]),
      p('Thanks, your pickup photos are in. The customer has been told their piano is on its way. Here are the delivery details.'),
      jobDetails([
        ['Deliver to', deliverTo],
        ['Customer phone', customerPhoneLink(customer?.phone)],
        ['Piano', esc(pianoLabel)],
      ]),
      note('<strong style="font-weight:500;">After you deliver the piano</strong><br>Place it in the agreed position, then use the button below to upload your delivery photos before you leave. Do not leave the property until the photos are uploaded.', 'alert'),
      delivery_url ? button(delivery_url, 'Upload delivery photos') : '',
      p('This link is for this job only.', { small: true, muted: true }),
      p(`Any problems on the job? Call us on ${phoneLink()}.`, { small: true }),
    ].join(''),
  })
}

/*
 * To the customer, the moment the driver confirms pickup. The clearest email
 * in the delivery set: what is happening, when to expect the team, the
 * tracking link (the customer portal), what they will do, and who to call.
 * `delivery` (optional) supplies the confirmed date and time window.
 * `settings` is still accepted; the footer now comes from the brand kit.
 */
function pianoOnItsWayEmail({ customer, piano, settings, delivery }) {
  const pianoLabel = pianoName(piano)
  const trackUrl = `${BUSINESS.siteUrl}/portal`
  const date = delivery?.scheduled_date ? longDate(delivery.scheduled_date) : ''
  const timeWindow = delivery?.scheduled_time_window || ''
  const arriving = [date, timeWindow ? esc(timeWindow) : ''].filter(Boolean).join('<br>')
  const arrivingText = [date, timeWindow].filter(Boolean).join(', ')
  const address = addressHtml(customer)

  return layout({
    preview: `Your ${pianoLabel} has been collected and is on its way.${arrivingText ? ` Arriving ${arrivingText}.` : ''}`,
    label: 'Your delivery',
    title: 'Your piano is on its way',
    body: [
      hello(customer?.first_name),
      p(`Your <strong style="font-weight:500;">${esc(pianoLabel)}</strong> has been collected and is on its way to you. It was photographed before it left, so its condition is on record.`),
      details([
        arriving ? ['Arriving', arriving, true] : null,
        address ? ['Delivering to', address] : null,
      ]),
      button(trackUrl, 'Track your delivery'),
      p('Your customer portal shows where your delivery is up to. Sign in with this email address and we will send you a secure link, no password needed.', { small: true, muted: true }),
      h2('What happens next'),
      steps([
        'The delivery team brings your piano in and places it exactly where you want it.',
        'Before they leave, they photograph it in its new position.',
        'After delivery we email you your 10-year warranty certificate.',
        'Your first tuning is included. We will book a tuner for 3–4 weeks after delivery.',
      ]),
      note(`Questions, or need to make arrangements for the delivery? Call us on ${phoneLink()} or reply to this email.`),
    ].join(''),
  })
}

/* To Signature Pianos, when a driver confirms pickup. */
function internalPickupConfirmedEmail({ customer, piano, photo_count, notes }) {
  const customerName = `${customer?.first_name || ''} ${customer?.last_name || ''}`.trim()
  return layout({
    internal: true,
    preview: `${pianoName(piano)} picked up for ${customerName || 'a customer'}. ${photo_count ?? 0} photos uploaded.`,
    label: 'For Signature Pianos',
    title: 'Piano picked up',
    body: [
      details([
        ['Customer', `${esc(customerName)}<br>${esc(customer?.email || '—')}`],
        ['Piano', esc(pianoName(piano)), true],
        ['Serial', esc(piano?.serial_number || '—')],
        ['Photos uploaded', esc(photo_count)],
        notes ? ['Driver notes', esc(notes).replace(/\n/g, '<br>')] : null,
        ['Status', 'picked_up'],
      ]),
      p('The customer has been notified.'),
      buttonOutline(`${BUSINESS.adminUrl}deliveries.html`, 'Open deliveries'),
    ].join(''),
  })
}

module.exports.templates = {
  pianoOnItsWayEmail, driverDeliveryLinkEmail, internalPickupConfirmedEmail,
}
