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
 * abort the booking flow; they come back as `warning` in the response.
 *
 * Admin only (requireAdmin). Every send is a new request to the tuner:
 * the acceptance + legacy confirmation tokens are re-minted and the
 * tuner's previous answer is cleared, so a re-send with a changed date
 * (or to a different tuner) gets a working Accept link instead of
 * "Already responded". Completed / cancelled bookings are refused.
 */

const crypto = require('crypto')
const { Resend } = require('resend')
const { internalRecipients } = require('../lib/notify')
const { createClient } = require('@supabase/supabase-js')
const { requireAdmin, sendAuthError } = require('../lib/auth')
const { generateCalendarLinks } = require('../lib/calendar')
const { layout, hello, p, h2, details, button, buttonOutline, divider, signOff } = require('../lib/email-brand')
const { parts, sendEmail, errText } = require('../lib/tuner-emails')

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

  try { await requireAdmin(req) } catch (e) { return sendAuthError(res, e) }

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
    if (!booking.tuner.email) {
      return res.status(400).json({ error: 'The assigned tuner has no email address' })
    }
    // A finished or cancelled job is never re-opened from here.
    if (booking.completed === true || booking.status === 'completed') {
      return res.status(409).json({ error: 'This tuning is already marked complete. Nothing was sent.' })
    }
    if (booking.status === 'cancelled') {
      return res.status(409).json({ error: 'This tuning booking is cancelled. Nothing was sent.' })
    }

    // Fresh acceptance + confirmation tokens on every send, and the
    // tuner's previous answer cleared. Links from an earlier request (an
    // old date, or a tuner who has since been replaced) stop working; the
    // tuner answers this request with the links in this email. The
    // completion token is kept so earlier "mark complete" links still work.
    // Any previously agreed date is cleared too: this send asks for a new
    // acceptance, and the day-before reminder re-arms for whatever date is
    // agreed next.
    const confirmationToken = newToken()
    const acceptanceToken   = newToken()
    const completionToken   = booking.completion_token || newToken()

    const { error: updateErr } = await supabase
      .from('tuner_bookings')
      .update({
        confirmation_token: confirmationToken,
        completion_token:   completionToken,
        acceptance_token:   acceptanceToken,
        tuner_accepted:     false,
        tuner_accepted_at:  null,
        tuner_response:     null,
        confirmed_date:     null,
        confirmed_time:     null,
        day_before_reminder_sent:    false,
        day_before_reminder_sent_at: null,
        status: 'pending',
      })
      .eq('id', tuner_booking_id)
    if (updateErr) throw updateErr

    const tuner = booking.tuner
    const customer = booking.order.customer
    const piano = booking.order.piano

    // The tuner's Accept / Propose page. The SMS links here too (the old
    // one-click /api/tuner-confirm link confirmed on any GET, including
    // link previews); that endpoint now just forwards old links here.
    const completeUrl = `${SITE_URL}/api/tuner-complete?token=${completionToken}`
    const acceptUrl   = `${SITE_URL}/tuner/respond/${acceptanceToken}`
    const proposeUrl  = `${SITE_URL}/tuner/respond/${acceptanceToken}?action=propose`

    const warnings = []

    // 1) Email to tuner — the one send that must work.
    const tunerErr = await sendEmail(resend, {
      from: FROM,
      to: tuner.email,
      subject: `Piano tuning request — ${customer.first_name} ${customer.last_name}`,
      html: tunerBookingEmail({ tuner, customer, piano, booking, completeUrl, acceptUrl, proposeUrl }),
    })
    if (tunerErr) {
      console.error('[tuner-booking] tuner email failed', tunerErr)
      return res.status(502).json({ error: `Email to the tuner failed: ${errText(tunerErr)}` })
    }

    // 2) SMS to tuner — skipped if Twilio isn't configured or the phone
    // number can't be put in E.164 form (Twilio rejects "0479 128 955").
    // Body mirrors the email so the tuner can act from SMS alone if needed
    // (customer name, phone, email, full address, piano + serial, date).
    const smsTo = toE164(tuner.phone)
    if (!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE)) {
      console.warn('[tuner-booking] Twilio env vars not set — SMS skipped')
      warnings.push('SMS not sent (Twilio is not configured)')
    } else if (!smsTo) {
      console.warn('[tuner-booking] tuner phone not usable for SMS — SMS skipped', tuner.phone)
      warnings.push(`SMS not sent (tuner phone "${tuner.phone || ''}" is not a valid mobile number)`)
    } else {
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
            `${pianoText(piano)}\n` +
            `Serial: ${piano.serial_number || '—'}\n\n` +
            `PROPOSED DATE\n` +
            `${formatDate(booking.proposed_date)}` +
            `${booking.proposed_time ? ' · ' + booking.proposed_time : ''}\n\n` +
            `Accept or propose another date: ${acceptUrl}`,
          from: TWILIO_PHONE,
          to: smsTo,
        })
      } catch (smsErr) {
        // Log and continue — the email already went out.
        console.warn('[tuner-booking] SMS failed, continuing with email-only', smsErr)
        warnings.push(`SMS failed: ${errText(smsErr)}`)
      }
    }

    // 3) Internal notification to Eric — failure shouldn't abort, the
    // tuner has been notified.
    const internalErr = await sendEmail(resend, {
      from: FROM,
      to: internalRecipients(),
      subject: `Tuner booking sent — ${tuner.name} for ${customer.first_name} ${customer.last_name}`,
      html: internalBookingSentEmail({ tuner, customer, piano, booking }),
    })
    if (internalErr) {
      console.error('[tuner-booking] internal email failed', internalErr)
      warnings.push(`Internal copy to Signature Pianos failed: ${errText(internalErr)}`)
    }

    return res.status(200).json({ success: true, warning: warnings.length ? warnings.join('; ') : null })
  } catch (err) {
    console.error('[tuner-booking] error', err)
    return res.status(500).json({ error: err.message || 'Internal error' })
  }
}

/* ---------- helpers ---------- */

function newToken() {
  // 128 bits from the OS CSPRNG, 32 hex chars (Math.random is guessable).
  return crypto.randomBytes(16).toString('hex')
}

/* Australian number → E.164 for Twilio ("0479 128 955" → "+61479128955").
 * Numbers already in +E.164 pass through. Returns null if it can't tell. */
function toE164(raw) {
  if (!raw) return null
  let s = String(raw).replace(/[\s\-().]/g, '')
  if (s.startsWith('+')) return /^\+[1-9]\d{7,14}$/.test(s) ? s : null
  if (s.startsWith('0061')) s = s.slice(4)
  else if (/^61\d{9}$/.test(s)) s = s.slice(2)
  else if (/^0\d{9}$/.test(s)) s = s.slice(1)
  else return null
  return /^[2-478]\d{8}$/.test(s) ? `+61${s}` : null
}

/* "Kawai K-300 2011" — brand from the piano row, not assumed Yamaha. */
function pianoText(piano) {
  return `${piano.brand || 'Yamaha'} ${piano.model || ''} ${piano.year || ''}`.replace(/\s+/g, ' ').trim()
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

function tunerBookingEmail({ tuner, customer, piano, booking, completeUrl, acceptUrl, proposeUrl }) {
  const fullAddress = [
    customer.address_line1,
    customer.address_line2,
    customer.suburb,
    customer.state,
    customer.postcode,
  ].filter(Boolean).join(', ')
  const customerName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim()
  const pianoLabel = pianoText(piano)
  const when = formatDate(booking.proposed_date)
  const hasDate = !!booking.proposed_date

  // Calendar links for the proposed date (none when no date was proposed).
  // The booking row's proposed_time is a readable window like
  // "Morning (9am–12pm)" — the helper maps known windows to a sensible
  // start hour.
  const cal = hasDate ? generateCalendarLinks({
    title: `Piano tuning — ${pianoLabel}`,
    description:
      `Piano tuning for Signature Pianos.\n\n` +
      `Customer: ${customer.first_name || ''} ${customer.last_name || ''}\n` +
      `Phone: ${customer.phone || '—'}\n` +
      `Address: ${[customer.address_line1, customer.suburb, customer.state, customer.postcode].filter(Boolean).join(', ')}\n\n` +
      `Piano: ${pianoLabel}\n` +
      `Serial: ${piano.serial_number || '—'}\n\n` +
      `Complete tuning: ${completeUrl}`,
    location: [customer.address_line1, customer.suburb, customer.state, customer.postcode].filter(Boolean).join(', '),
    startDate: booking.proposed_date,
    startTime: booking.proposed_time || 'Morning',
    durationHours: 2,
    uid: booking.id ? `tuning-${booking.id}` : undefined,
  }) : null

  return layout({
    preview: hasDate
      ? `${customerName}, ${pianoLabel}. Proposed for ${when}${booking.proposed_time ? ', ' + booking.proposed_time : ''}. Please accept or propose another date.`
      : `${customerName}, ${pianoLabel}. Please propose a date for the tuning.`,
    label: 'Tuning request',
    title: 'Can you take this tuning?',
    body:
      hello(tuner.name) +
      p(hasDate
        ? 'You have a new piano tuning booking request from Signature Pianos. Please look over the details below and let us know if the proposed date works for you.'
        : 'You have a new piano tuning booking request from Signature Pianos. No date has been set yet: please look over the details below and propose one.') +
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
        ['Piano', escapeHtml(pianoLabel), true],
        ['Serial number', escapeHtml(piano.serial_number || '—')],
        ['Condition', escapeHtml(piano.condition || '—')],
      ]) +
      h2('Your response') +
      (hasDate
        ? button(acceptUrl, 'Accept this date') + buttonOutline(proposeUrl, 'Propose a different date')
        : button(proposeUrl, 'Propose a date')) +
      p(`Alternatively, contact the customer directly on ${parts.phoneLink(customer.phone)} to arrange a suitable time, then reply to this email with the agreed date.`, { small: true, muted: true }) +
      (cal
        ? h2('Add to your calendar') +
          p('For the proposed date. If you propose a different date, the calendar links will be re-issued with the confirmed time.', { small: true, muted: true }) +
          parts.calendarLinks(cal, 'signature-pianos-tuning.ics')
        : '') +
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
        ['Piano', escapeHtml(pianoText(piano))],
        ['Serial', escapeHtml(piano.serial_number || '')],
        ['Proposed date', escapeHtml(formatDate(booking.proposed_date)), true],
      ]),
  })
}

/* generateCalendarLinks now lives in lib/calendar.js — required at the
 * top of this file. Shared with api/tuner-log-date.js (the new
 * agreed-date-confirmation flow). */

module.exports.templates = { tunerBookingEmail, internalBookingSentEmail }
