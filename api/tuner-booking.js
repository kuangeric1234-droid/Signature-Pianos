/*
 * Signature Pianos — Tuner booking notifier
 * -----------------------------------------
 * Vercel Node.js serverless function. Called by admin/deliveries.html
 * when Eric assigns a tuner from the delivery detail panel. Mints
 * confirmation + completion tokens, sends a branded email to the tuner,
 * fires an SMS via Twilio, and emails Eric the internal notification.
 *
 * Required environment variables — add to Vercel dashboard:
 *
 *   RESEND_API_KEY            → resend.com → API keys
 *   BUSINESS_EMAIL            → info@signaturepianos.com.au (Eric's inbox)
 *   SUPABASE_URL              → project URL
 *   SUPABASE_SERVICE_ROLE_KEY → server-only Supabase key
 *
 *   TWILIO_ACCOUNT_SID        → twilio.com → Console → Account SID
 *   TWILIO_AUTH_TOKEN         → twilio.com → Console → Auth Token
 *   TWILIO_PHONE              → your Twilio phone number e.g. +61400000000
 *   SITE_URL                  → https://signaturepianos.com.au
 *
 * To get Twilio set up:
 *   1. Create account at twilio.com
 *   2. Get a phone number with SMS capability
 *   3. Verify your account for Australian SMS sending
 *   4. Add the 3 env vars above to Vercel
 *
 * Twilio is graceful: if the env vars aren't set, the SMS step is
 * skipped and we still send the email. SMS errors are logged but never
 * abort the booking flow.
 */

const { Resend } = require('resend')
const { internalRecipients } = require('../lib/notify')
const { createClient } = require('@supabase/supabase-js')
const { generateCalendarLinks } = require('../lib/calendar')
const { layout, hello, p, h2, details, button, buttonOutline, divider, signOff } = require('../lib/email-brand')
const { parts } = require('../lib/tuner-emails')

const resend = new Resend(process.env.RESEND_API_KEY)
const BUSINESS_EMAIL = process.env.BUSINESS_EMAIL
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID
const TWILIO_AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN
const TWILIO_PHONE       = process.env.TWILIO_PHONE
const SITE_URL           = process.env.SITE_URL || 'https://signaturepianos.com.au'
const FROM               = 'Signature Pianos <info@signaturepianos.com.au>'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { tuner_booking_id } = req.body || {}
  if (!tuner_booking_id) {
    return res.status(400).json({ error: 'Missing tuner_booking_id' })
  }

  try {
    // Fetch full booking with joins
    const { data: booking, error } = await supabase
      .from('tuner_bookings')
      .select(`
        *,
        tuner:tuner_id(*),
        order:order_id(
          *,
          customer:customer_id(*),
          piano:piano_id(*)
        )
      `)
      .eq('id', tuner_booking_id)
      .single()

    if (error || !booking) {
      console.error('[tuner-booking] booking not found', error)
      return res.status(404).json({ error: 'Booking not found' })
    }
    if (!booking.tuner) {
      return res.status(400).json({ error: 'Booking has no tuner assigned' })
    }
    if (!booking.order || !booking.order.customer || !booking.order.piano) {
      return res.status(400).json({ error: 'Booking is missing order / customer / piano' })
    }

    // Reuse existing tokens if already minted (so re-sends don't break the
    // tuner's earlier link); otherwise mint fresh ones.
    const confirmationToken = booking.confirmation_token || generateToken()
    const completionToken   = booking.completion_token   || generateToken()
    const acceptanceToken   = booking.acceptance_token   || generateToken()

    const { error: updateErr } = await supabase
      .from('tuner_bookings')
      .update({
        confirmation_token: confirmationToken,
        completion_token:   completionToken,
        acceptance_token:   acceptanceToken,
        status: 'pending',
      })
      .eq('id', tuner_booking_id)
    if (updateErr) throw updateErr

    const tuner = booking.tuner
    const customer = booking.order.customer
    const piano = booking.order.piano

    // Legacy one-click confirm endpoint — kept for backwards compat but
    // no longer surfaced in the email. The new email uses Accept /
    // Propose buttons that route through /tuner/respond/{acceptance_token}.
    const confirmUrl  = `${SITE_URL}/api/tuner-confirm?token=${confirmationToken}`
    const completeUrl = `${SITE_URL}/api/tuner-complete?token=${completionToken}`
    const acceptUrl   = `${SITE_URL}/tuner/respond/${acceptanceToken}`
    const proposeUrl  = `${SITE_URL}/tuner/respond/${acceptanceToken}?action=propose`

    // 1) Email to tuner
    try {
      await resend.emails.send({
        from: FROM,
        to: tuner.email,
        subject: `Piano tuning request — ${customer.first_name} ${customer.last_name}`,
        html: tunerBookingEmail({ tuner, customer, piano, booking, confirmUrl, completeUrl, acceptUrl, proposeUrl }),
      })
    } catch (mailErr) {
      console.error('[tuner-booking] tuner email failed', mailErr)
      throw mailErr
    }

    // 2) SMS to tuner — skipped silently if Twilio isn't configured.
    // Body mirrors the email so the tuner can act from SMS alone if needed
    // (customer name, phone, email, full address, piano + serial, date).
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE) {
      try {
        const fullAddress = [
          customer.address_line1,
          customer.suburb,
          customer.state,
          customer.postcode,
        ].filter(Boolean).join(', ') || '—'
        const twilio = require('twilio')(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        await twilio.messages.create({
          body:
            `Hi ${tuner.name}, new piano tuning booking from Signature Pianos.\n\n` +
            `CUSTOMER\n` +
            `Name: ${customer.first_name || ''} ${customer.last_name || ''}\n` +
            `Phone: ${customer.phone || '—'}\n` +
            `Email: ${customer.email || '—'}\n` +
            `Address: ${fullAddress}\n\n` +
            `PIANO\n` +
            `Yamaha ${piano.model || ''} ${piano.year || ''}\n` +
            `Serial: ${piano.serial_number || '—'}\n\n` +
            `PROPOSED DATE\n` +
            `${formatDate(booking.proposed_date)}` +
            `${booking.proposed_time ? ' · ' + booking.proposed_time : ''}\n\n` +
            `Confirm here: ${confirmUrl}`,
          from: TWILIO_PHONE,
          to: tuner.phone,
        })
      } catch (smsErr) {
        // Log and continue — the email already went out.
        console.warn('[tuner-booking] SMS failed, continuing with email-only', smsErr)
      }
    } else {
      console.warn('[tuner-booking] Twilio env vars not set — SMS skipped')
    }

    // 3) Internal notification to Eric
    try {
      await resend.emails.send({
        from: FROM,
        to: internalRecipients(),
        subject: `Tuner booking sent — ${tuner.name} for ${customer.first_name} ${customer.last_name}`,
        html: internalBookingSentEmail({ tuner, customer, piano, booking }),
      })
    } catch (mailErr) {
      // Internal email failure shouldn't abort — the tuner has been notified.
      console.error('[tuner-booking] internal email failed', mailErr)
    }

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('[tuner-booking] error', err)
    return res.status(500).json({ error: err.message || 'Internal error' })
  }
}

/* ---------- helpers ---------- */

function generateToken() {
  // 32 chars of base36 entropy — sufficient for a one-shot URL token.
  return (
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2)
  ).slice(0, 32)
}

function formatDate(dateStr) {
  if (!dateStr) return 'TBC'
  try {
    return new Date(dateStr).toLocaleDateString('en-AU', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function escapeHtml(s) {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/* ---------- email templates (brand kit: lib/email-brand.js) ----------
 * The tuner email carries the customer's email, phone and full address
 * so the tuner can reach them directly without bouncing off Eric; the
 * phone number taps straight into the dialer on mobile. */

function tunerBookingEmail({ tuner, customer, piano, booking, confirmUrl, completeUrl, acceptUrl, proposeUrl }) {
  const fullAddress = [
    customer.address_line1,
    customer.address_line2,
    customer.suburb,
    customer.state,
    customer.postcode,
  ].filter(Boolean).join(', ')
  const customerName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim()
  const pianoText = `Yamaha ${piano.model || ''} ${piano.year || ''}`.trim()
  const when = formatDate(booking.proposed_date)

  // Calendar links for the proposed date. The booking row's
  // proposed_time is a readable window like "Morning (9am–12pm)" — the
  // helper maps known windows to a sensible start hour.
  const cal = generateCalendarLinks({
    title: `Piano tuning — Yamaha ${piano.model || ''} ${piano.year || ''}`.trim(),
    description:
      `Piano tuning for Signature Pianos.\n\n` +
      `Customer: ${customer.first_name || ''} ${customer.last_name || ''}\n` +
      `Phone: ${customer.phone || '—'}\n` +
      `Address: ${[customer.address_line1, customer.suburb, customer.state, customer.postcode].filter(Boolean).join(', ')}\n\n` +
      `Piano: Yamaha ${piano.model || ''} ${piano.year || ''}\n` +
      `Serial: ${piano.serial_number || '—'}\n\n` +
      `Complete tuning: ${completeUrl}`,
    location: [customer.address_line1, customer.suburb, customer.state, customer.postcode].filter(Boolean).join(', '),
    startDate: booking.proposed_date,
    startTime: booking.proposed_time || 'Morning',
    durationHours: 2,
  })

  return layout({
    preview: `${customerName}, ${pianoText}. Proposed for ${when}${booking.proposed_time ? ', ' + booking.proposed_time : ''}. Please accept or propose another date.`,
    label: 'Tuning request',
    title: 'Can you take this tuning?',
    body:
      hello(tuner.name) +
      p('You have a new piano tuning booking request from Signature Pianos. Please look over the details below and let us know if the proposed date works for you.') +
      parts.appointment('Proposed date', escapeHtml(when), escapeHtml(booking.proposed_time || 'Flexible — please suggest')) +
      h2('Customer') +
      details([
        ['Name', escapeHtml(customerName) || '—', true],
        ['Phone', parts.phoneLink(customer.phone)],
        ['Email', parts.emailLink(customer.email)],
        ['Address', parts.addressBlock(fullAddress)],
      ]) +
      h2('Piano') +
      details([
        ['Piano', escapeHtml(pianoText), true],
        ['Serial number', escapeHtml(piano.serial_number || '—')],
        ['Condition', escapeHtml(piano.condition || '—')],
      ]) +
      h2('Your response') +
      button(acceptUrl, 'Accept this date') +
      buttonOutline(proposeUrl, 'Propose a different date') +
      p(`Alternatively, contact the customer directly on ${parts.phoneLink(customer.phone)} to arrange a suitable time, then reply to this email with the agreed date.`, { small: true, muted: true }) +
      h2('Add to your calendar') +
      p('For the proposed date. If you propose a different date, the calendar links will be re-issued with the confirmed time.', { small: true, muted: true }) +
      parts.calendarLinks(cal, 'signature-pianos-tuning.ics') +
      divider() +
      p(`Once the tuning is done, use this link to mark it complete and notify the customer:<br>${parts.textLink(completeUrl, 'Mark tuning complete')}`, { small: true, muted: true }) +
      p(`Questions? Reply to this email or call ${parts.officePhone()}.`, { small: true, muted: true }) +
      signOff(),
  })
}

/* Internal note to Eric once the request has gone to the tuner. */
function internalBookingSentEmail({ tuner, customer, piano, booking }) {
  return layout({
    internal: true,
    preview: `The tuning request for ${customer.first_name || ''} ${customer.last_name || ''} has gone to ${tuner.name || 'the tuner'}.`,
    label: 'For Signature Pianos',
    title: 'Tuning request sent',
    body:
      p(`The tuner booking notification has been sent to ${escapeHtml(tuner.name)}.`, { first: true }) +
      details([
        ['Tuner', escapeHtml(tuner.name), true],
        ['Tuner email', parts.emailLink(tuner.email)],
        ['Tuner phone', parts.phoneLink(tuner.phone)],
        ['Customer', `${escapeHtml(customer.first_name)} ${escapeHtml(customer.last_name)}`],
        ['Piano', `Yamaha ${escapeHtml(piano.model || '')} ${escapeHtml(piano.year || '')}`],
        ['Serial', escapeHtml(piano.serial_number || '')],
        ['Proposed date', escapeHtml(formatDate(booking.proposed_date)), true],
      ]),
  })
}

/* generateCalendarLinks now lives in lib/calendar.js — required at the
 * top of this file. Shared with api/tuner-log-date.js (the new
 * agreed-date-confirmation flow). */

module.exports.templates = { tunerBookingEmail, internalBookingSentEmail }
