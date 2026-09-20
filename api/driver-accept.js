/*
 * Signature Pianos — driver delivery acceptance
 * ---------------------------------------------
 * POST /api/driver-accept  body: { token, delivery_id, accepted_preference, notes }
 *
 *   1. Verifies acceptance_token (exact match) + delivery_id match, and that
 *      the delivery is still waiting for a driver (status scheduled or
 *      pickup_pending, not yet accepted).
 *   2. Resolves the selected preference (1/2/3) to a date + time window.
 *      Customer prefs are stored as jsonb { date, time }; driver pages
 *      flatten them to "YYYY-MM-DD <time>" strings, so we split on the
 *      first space to extract the date. A date already past (Melbourne)
 *      is refused.
 *   3. Updates the row — driver_accepted, scheduled_date / window,
 *      status='scheduled', driver notes appended. The update only applies
 *      while driver_accepted is still false, so a double tap can't accept
 *      twice.
 *   4. Customer confirmation email + Eric notification.
 *   5. If the pickup is 3 days away or less (Melbourne dates), emails the
 *      driver their pickup photo link now and sets reminder_3day_sent, so a
 *      late acceptance still gets the link and the daily cron doesn't send
 *      it again.
 */

const { createClient } = require('@supabase/supabase-js')
const { Resend } = require('resend')
const { internalRecipients } = require('../lib/notify')
const { melbourneDate, addDays } = require('../lib/dates')
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
const SITE_URL       = process.env.SITE_URL || 'https://signaturepianos.com.au'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isToken = t => typeof t === 'string' && t.length >= 16 && t.length <= 200

// A driver can only accept while the delivery is still waiting to be scheduled.
const ACCEPTABLE_STATUSES = ['scheduled', 'pickup_pending']

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { token, delivery_id, notes } = req.body || {}
  const accepted_preference = Number((req.body || {}).accepted_preference)
  if (!isToken(token) || typeof delivery_id !== 'string' || !UUID_RE.test(delivery_id)) {
    return res.status(400).json({ error: 'Missing or invalid token' })
  }
  if (![1, 2, 3].includes(accepted_preference)) {
    return res.status(400).json({ error: 'Invalid preference selection' })
  }
  if (notes != null && (typeof notes !== 'string' || notes.length > 2000)) {
    return res.status(400).json({ error: 'Notes must be 2000 characters or fewer' })
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
    if (!delivery || delivery.acceptance_token !== token) {
      return res.status(404).json({ error: 'Delivery not found' })
    }
    if (delivery.driver_accepted) return res.status(409).json({ error: 'Already accepted' })
    if (!ACCEPTABLE_STATUSES.includes(delivery.status)) {
      return res.status(409).json({ error: 'This delivery is already under way. Please contact Signature Pianos.' })
    }

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
    // scheduled_date is a date column: anything that isn't YYYY-MM-DD would
    // fail the update, so treat it as "no date" (admin sets it by hand).
    if (dateStr && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) dateStr = null

    const today = melbourneDate()
    if (dateStr && dateStr < today) {
      return res.status(409).json({ error: 'That date has already passed. Please contact Signature Pianos to arrange a new date.' })
    }

    const customer = delivery.order?.customer || {}
    const piano    = delivery.order?.piano    || {}
    const partner  = delivery.partner         || {}

    // Append driver notes to the existing delivery notes rather than
    // overwriting (might contain admin or customer-preference notes).
    const cleanNotes = typeof notes === 'string' ? notes.trim() : ''
    const mergedNotes = cleanNotes
      ? (delivery.notes ? delivery.notes + '\n\nDriver notes: ' + cleanNotes : 'Driver notes: ' + cleanNotes)
      : delivery.notes

    // Conditional on driver_accepted still being false and the status not
    // having moved on, so two taps (or two tabs) can't both accept.
    const { data: updated, error: updErr } = await supabase
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
      .eq('id', delivery.id)
      .eq('acceptance_token', token)
      .or('driver_accepted.is.null,driver_accepted.eq.false')
      .in('status', ACCEPTABLE_STATUSES)
      .select('id')
    if (updErr) throw updErr
    if (!updated || !updated.length) return res.status(409).json({ error: 'Already accepted' })

    // Settings for the email footer (non-fatal)
    let settings = {}
    try {
      const { data: s } = await supabase.from('company_settings').select('*').limit(1).maybeSingle()
      if (s) settings = s
    } catch (sErr) {
      console.warn('[driver-accept] settings load fell back', sErr)
    }

    const confirmedDisplay = dateStr
      ? fmtDateLong(dateStr) + (timeStr ? ' · ' + timeStr : '')
      : (typeof acceptedPref === 'string' ? acceptedPref : '—')

    // Customer email. Resend returns { error } rather than throwing; a failed
    // notification is logged and reported to Eric, but the acceptance stands.
    let customerNotified = false
    if (customer.email) {
      try {
        const { error: mailErr } = await resend.emails.send({
          from: FROM,
          to: customer.email,
          subject: 'Your piano delivery is confirmed — Signature Pianos',
          html: customerDeliveryConfirmedEmail({ customer, piano, confirmedDate: confirmedDisplay, settings }),
        })
        if (mailErr) throw mailErr
        customerNotified = true
      } catch (mailErr) {
        console.error('[driver-accept] customer email failed', mailErr)
      }
    }

    // Pickup within 3 days (or today): the daily cron may already have
    // passed this delivery's window, so send the pickup photo link now and
    // mark reminder_3day_sent so the cron doesn't send it again.
    let pickupLinkSent = false
    if (dateStr && dateStr <= addDays(today, 3) && partner.email && delivery.pickup_link_token) {
      try {
        const pickupUrl = `${SITE_URL}/delivery/${delivery.pickup_link_token}`
        const { error: mailErr } = await resend.emails.send({
          from: FROM,
          to: partner.email,
          subject: `Your pickup photo link — ${fmtDateLong(dateStr)}`,
          html: driverPickupLinkEmail({
            driver_name: partner.name, scheduled_date: dateStr, time_window: timeStr,
            piano, customer, address: delivery.customer_address_confirmed, pickupUrl,
          }),
        })
        if (mailErr) throw mailErr
        pickupLinkSent = true
        const { error: flagErr } = await supabase
          .from('deliveries')
          .update({ reminder_3day_sent: true, reminder_3day_sent_at: new Date().toISOString() })
          .eq('id', delivery.id)
        if (flagErr) console.error('[driver-accept] reminder_3day_sent update failed', flagErr)
      } catch (mailErr) {
        console.error('[driver-accept] pickup link email failed', mailErr)
      }
    }

    // Internal Eric notification
    try {
      const { error: mailErr } = await resend.emails.send({
        from: FROM,
        to: internalRecipients(),
        subject: `Driver accepted — ${partner.name || ''} · ${confirmedDisplay}`.trim(),
        html: internalDriverAcceptedEmail({
          partner, customer, piano, confirmedDate: confirmedDisplay, notes: cleanNotes,
          customerNotified, hasCustomerEmail: !!customer.email, pickupLinkSent,
        }),
      })
      if (mailErr) throw mailErr
    } catch (mailErr) {
      console.error('[driver-accept] internal email failed', mailErr)
    }

    return res.status(200).json({
      success: true,
      confirmed_date: confirmedDisplay,
      pickup_link_sent: pickupLinkSent,
    })
  } catch (err) {
    console.error('[driver-accept] handler failed', err)
    return res.status(500).json({ error: err.message || 'Accept failed' })
  }
}


/* ---------- emails (built with lib/email-brand.js) ---------- */

/* "Saturday 26 September 2026" from 'YYYY-MM-DD' (parsed and printed in the same zone). */
function fmtDateLong(d) {
  if (!d) return '—'
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
  } catch { return d }
}

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

/*
 * To the delivery partner, straight after they accept a job whose pickup is
 * 3 days away or less: the pickup photo link the daily cron would otherwise
 * have sent.
 */
function driverPickupLinkEmail({ driver_name, scheduled_date, time_window, piano, customer, address, pickupUrl }) {
  const pianoLabel = pianoName(piano)
  const customerName = `${customer?.first_name || ''} ${customer?.last_name || ''}`.trim()
  const deliverTo = address || [customer?.address_line1, customer?.suburb, customer?.state, customer?.postcode]
    .filter(Boolean).join(', ')
  const when = fmtDateLong(scheduled_date) + (time_window ? ` · ${time_window}` : '')
  return layout({
    preview: `Pickup ${when}: ${pianoLabel}. Your pickup photo link is inside.`,
    label: 'Pickup job',
    title: 'Your pickup photo link',
    body: [
      hello(String(driver_name || '').trim().split(/\s+/)[0]),
      p('Thanks for accepting this delivery. The pickup is coming up soon, so here is your pickup photo link now.'),
      details([
        ['Pickup date', esc(when), true],
        ['Piano', esc(pianoLabel), true],
        ['Serial', esc(piano?.serial_number || '—')],
        ['Collect from', `${BUSINESS.address1}<br>${BUSINESS.address2}`],
        ['Deliver to', [esc(customerName), esc(deliverTo || '—')].filter(Boolean).join('<br>')],
      ]),
      h2('Upload pickup photos'),
      p('Use this link when you collect the piano. Photograph it before you move it.'),
      button(pickupUrl, 'Upload pickup photos'),
      p('This link is for this job only.', { small: true, muted: true }),
      p(`Questions? Call Signature Pianos on ${phoneLink()}.`, { small: true }),
    ].join(''),
  })
}

/* To Signature Pianos, when a driver accepts a delivery. */
function internalDriverAcceptedEmail({
  partner, customer, piano, confirmedDate, notes,
  customerNotified = true, hasCustomerEmail = true, pickupLinkSent = false,
}) {
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
      !hasCustomerEmail
        ? note('<strong>The customer has no email address on file.</strong> Let them know the date by phone.', 'alert')
        : customerNotified
          ? p('The customer has been notified.')
          : note('<strong>The customer confirmation email FAILED to send.</strong> Let them know the date directly.', 'alert'),
      pickupLinkSent
        ? note('The pickup is 3 days away or less, so the driver has been emailed their pickup photo link now.', 'mist')
        : note('The driver will receive their pickup photo link automatically once the pickup is 3 days away (sent by the daily cron).', 'mist'),
      buttonOutline(`${BUSINESS.adminUrl}deliveries.html`, 'Open deliveries'),
    ].join(''),
  })
}

module.exports.templates = { customerDeliveryConfirmedEmail, internalDriverAcceptedEmail, driverPickupLinkEmail }
