/*
 * Signature Pianos — driver delivery acceptance
 * ---------------------------------------------
 * POST /api/driver-accept  body: { token, delivery_id, accepted_preference, notes }
 *
 *   1. Verifies acceptance_token + delivery_id match.
 *   2. Resolves the selected preference (1/2/3) to a date + time window.
 *      Customer prefs are stored as jsonb { date, time }; driver pages
 *      flatten them to "YYYY-MM-DD <time>" strings, so we split on the
 *      first space to extract the date.
 *   3. Updates the row — driver_accepted, scheduled_date / window,
 *      status='scheduled', driver notes appended.
 *   4. Customer confirmation email + Eric notification.
 */

const { createClient } = require('@supabase/supabase-js')
const { Resend } = require('resend')
const { internalRecipients } = require('../lib/notify')
const {
  BUSINESS, C, esc, layout, hello, p, h2, details, note, button, buttonOutline, steps,
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

  const { token, delivery_id, accepted_preference, notes } = req.body || {}
  if (!token || !delivery_id) return res.status(400).json({ error: 'Missing token or delivery_id' })
  if (![1, 2, 3].includes(Number(accepted_preference))) {
    return res.status(400).json({ error: 'Invalid preference selection' })
  }

  try {
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
      .eq('id', delivery_id)
      .eq('acceptance_token', token)
      .maybeSingle()
    if (error) throw error
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' })
    if (delivery.driver_accepted) return res.status(400).json({ error: 'Already accepted' })

    const prefMap = {
      1: delivery.customer_preference_1,
      2: delivery.customer_preference_2,
      3: delivery.customer_preference_3,
    }
    const acceptedPref = prefMap[accepted_preference]
    if (!acceptedPref) {
      return res.status(400).json({ error: 'Customer preference not found' })
    }

    // jsonb {date, time} OR legacy string "YYYY-MM-DD <time>" — handle both.
    let dateStr, timeStr
    if (typeof acceptedPref === 'object' && acceptedPref !== null) {
      dateStr = acceptedPref.date || null
      timeStr = acceptedPref.time || null
    } else {
      const s = String(acceptedPref || '')
      dateStr = s.split(' ')[0] || null
      timeStr = s.split(' ').slice(1).join(' ') || null
    }

    const customer = delivery.order?.customer || {}
    const piano    = delivery.order?.piano    || {}
    const partner  = delivery.partner         || {}

    // Append driver notes to the existing delivery notes rather than
    // overwriting (might contain admin or customer-preference notes).
    const mergedNotes = notes
      ? (delivery.notes ? delivery.notes + '\n\nDriver notes: ' + notes : 'Driver notes: ' + notes)
      : delivery.notes

    const { error: updErr } = await supabase
      .from('deliveries')
      .update({
        driver_accepted:            true,
        driver_accepted_at:         new Date().toISOString(),
        driver_accepted_preference: accepted_preference,
        scheduled_date:             dateStr,
        scheduled_time_window:      timeStr,
        status:                     'scheduled',
        notes:                      mergedNotes,
      })
      .eq('id', delivery_id)
    if (updErr) throw updErr

    // Settings for the email footer (non-fatal)
    let settings = {}
    try {
      const { data: s } = await supabase.from('company_settings').select('*').limit(1).maybeSingle()
      if (s) settings = s
    } catch (sErr) {
      console.warn('[driver-accept] settings load fell back', sErr)
    }

    const fmtDateLong = (d) => {
      if (!d) return '—'
      try {
        return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        })
      } catch { return d }
    }
    const confirmedDisplay = dateStr
      ? fmtDateLong(dateStr) + (timeStr ? ' · ' + timeStr : '')
      : (typeof acceptedPref === 'string' ? acceptedPref : '—')

    // Customer email
    if (customer.email) {
      try {
        await resend.emails.send({
          from: FROM,
          to: customer.email,
          subject: 'Your piano delivery is confirmed — Signature Pianos',
          html: customerDeliveryConfirmedEmail({ customer, piano, confirmedDate: confirmedDisplay, settings }),
        })
      } catch (mailErr) {
        console.error('[driver-accept] customer email failed', mailErr)
      }
    }

    // Internal Eric notification
    try {
      await resend.emails.send({
        from: FROM,
        to: internalRecipients(),
        subject: `Driver accepted — ${partner.name || ''} · ${confirmedDisplay}`.trim(),
        html: internalDriverAcceptedEmail({ partner, customer, piano, confirmedDate: confirmedDisplay, notes }),
      })
    } catch (mailErr) {
      console.error('[driver-accept] internal email failed', mailErr)
    }

    return res.status(200).json({ success: true, confirmed_date: confirmedDisplay })
  } catch (err) {
    console.error('[driver-accept] handler failed', err)
    return res.status(500).json({ error: err.message || 'Accept failed' })
  }
}


/* ---------- emails (built with lib/email-brand.js) ---------- */

function pianoName(piano) {
  return `${piano?.brand || 'Yamaha'} ${piano?.model || ''} ${piano?.year || ''}`.replace(/\s+/g, ' ').trim()
}

function phoneLink() {
  return `<a href="tel:${BUSINESS.phoneHref}" style="color:${C.ink};">${BUSINESS.phone}</a>`
}

/*
 * To the customer, once a delivery partner has accepted one of their
 * preferred dates. `confirmedDate` is the display string built in the
 * handler ("Saturday 26 September 2026 · Morning (9am–12pm)").
 * `settings` is still accepted; the footer now comes from the brand kit.
 */
function customerDeliveryConfirmedEmail({ customer, piano, confirmedDate, settings }) {
  const pianoLabel = pianoName(piano)
  return layout({
    preview: `Delivery confirmed for your ${pianoLabel}: ${confirmedDate}.`,
    label: 'Your delivery',
    title: 'Your delivery is confirmed',
    body: [
      hello(customer?.first_name),
      p(`We have confirmed one of the delivery times you chose. Here are the details to keep handy.`),
      details([
        ['Delivery', esc(confirmedDate), true],
        ['Piano', esc(pianoLabel)],
      ]),
      h2('What to expect'),
      steps([
        'On the morning of delivery we will send you a photo of your piano before it leaves.',
        'When it is on its way you will get another email, with a link to follow the delivery in your customer portal.',
      ]),
      button(`${BUSINESS.siteUrl}/portal`, 'View your delivery'),
      note(`Need to reschedule? Please let us know as soon as possible. Reply to this email or call us on ${phoneLink()}.`),
    ].join(''),
  })
}

/* To Signature Pianos, when a driver accepts a delivery. */
function internalDriverAcceptedEmail({ partner, customer, piano, confirmedDate, notes }) {
  const customerName = `${customer?.first_name || ''} ${customer?.last_name || ''}`.trim()
  return layout({
    internal: true,
    preview: `${partner?.name || 'A driver'} accepted the delivery for ${customerName || 'a customer'}: ${confirmedDate}.`,
    label: 'For Signature Pianos',
    title: 'Driver accepted a delivery',
    body: [
      details([
        ['Confirmed date', esc(confirmedDate), true],
        ['Driver', `${esc(partner?.name || '—')}<br>${esc(partner?.email || '—')}`],
        ['Customer', esc(customerName)],
        ['Piano', esc(pianoName(piano))],
        notes ? ['Driver notes', esc(notes).replace(/\n/g, '<br>')] : null,
      ]),
      p('The customer has been notified.'),
      note('The driver will receive their pickup photo link automatically 3 days before the confirmed date (sent by the daily cron).', 'mist'),
      buttonOutline(`${BUSINESS.adminUrl}deliveries.html`, 'Open deliveries'),
    ].join(''),
  })
}

module.exports.templates = { customerDeliveryConfirmedEmail, internalDriverAcceptedEmail }
