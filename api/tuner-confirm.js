/*
 * Signature Pianos — Tuner confirmation handler
 * ---------------------------------------------
 * The "Confirm this booking" link the tuner receives hits this endpoint
 * with ?token=... in the URL. We flip the booking to 'confirmed', send
 * the customer their happy confirmation email, ping Eric, and redirect
 * the tuner to a friendly landing page.
 *
 * Env required: RESEND_API_KEY, BUSINESS_EMAIL,
 *               SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

const { createClient } = require('@supabase/supabase-js')
const { Resend } = require('resend')
const { internalRecipients } = require('../lib/notify')
const { layout, hello, p, details, signOff } = require('../lib/email-brand')
const { parts } = require('../lib/tuner-emails')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const resend = new Resend(process.env.RESEND_API_KEY)
const BUSINESS_EMAIL = process.env.BUSINESS_EMAIL
const FROM = 'Signature Pianos <info@signaturepianos.com.au>'

module.exports = async (req, res) => {
  const token = (req.query && req.query.token) || ''
  if (!token) return res.status(400).send('<h2>Missing token.</h2>')

  try {
    const { data: booking, error } = await supabase
      .from('tuner_bookings')
      .select(`
        *,
        tuner:tuner_id(*),
        order:order_id(*, customer:customer_id(*), piano:piano_id(*))
      `)
      .eq('confirmation_token', token)
      .single()

    if (error || !booking) {
      return res.status(404).send(htmlMessage(
        'Booking not found',
        'This confirmation link may have already been used or is no longer valid. If you think this is a mistake, please email info@signaturepianos.com.au.'
      ))
    }

    if (!booking.tuner || !booking.order || !booking.order.customer || !booking.order.piano) {
      return res.status(400).send(htmlMessage(
        'Booking incomplete',
        'This booking is missing customer or piano details. Please contact us.'
      ))
    }

    // Mark confirmed
    const { error: updErr } = await supabase
      .from('tuner_bookings')
      .update({
        status: 'confirmed',
        confirmation_sent: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', booking.id)
    if (updErr) throw updErr

    // Notify the customer (their happy day)
    try {
      await resend.emails.send({
        from: FROM,
        to: booking.order.customer.email,
        subject: 'Your piano tuning is confirmed — Signature Pianos',
        html: customerTunerConfirmEmail(booking),
      })
    } catch (mailErr) {
      console.error('[tuner-confirm] customer email failed', mailErr)
    }

    // Notify Eric
    try {
      await resend.emails.send({
        from: FROM,
        to: internalRecipients(),
        subject: `Tuner confirmed — ${booking.tuner.name} for ${booking.order.customer.first_name} ${booking.order.customer.last_name}`,
        html: internalTunerConfirmedEmail(booking),
      })
    } catch (mailErr) {
      console.error('[tuner-confirm] internal email failed', mailErr)
    }

    // Friendly landing page for the tuner
    return res.redirect(
      303,
      `/tuner/confirmed.html?name=${encodeURIComponent(booking.tuner.name || '')}`
    )
  } catch (err) {
    console.error('[tuner-confirm] error', err)
    return res.status(500).send(htmlMessage(
      'Something went wrong',
      'We could not confirm this booking right now. Please try again, or email info@signaturepianos.com.au.'
    ))
  }
}

/* ---------- helpers ---------- */

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

/* Plain message page for error states — mobile-friendly, brand shell in lib/tuner-emails.js. */
function htmlMessage(title, body) {
  return parts.tunerPage({
    title,
    label: 'Tuning',
    body: `<p>${escapeHtml(body)}</p>`,
  })
}

/* ---------- email templates (brand kit: lib/email-brand.js) ---------- */

/* To the customer, when the tuner confirms the booking. */
function customerTunerConfirmEmail(booking) {
  const customer = booking.order.customer
  const piano = booking.order.piano
  const tuner = booking.tuner
  return layout({
    preview: `Your piano tuning is confirmed for ${formatDate(booking.proposed_date)}.`,
    label: 'Your tuning',
    title: 'Your tuning is confirmed',
    body:
      hello(customer.first_name) +
      p('Your piano tuner has confirmed the appointment. Here are the details.') +
      parts.appointment('Your appointment', escapeHtml(formatDate(booking.proposed_date)), escapeHtml(booking.proposed_time || 'To be confirmed by tuner')) +
      details([
        ['Tuner', escapeHtml(tuner.name), true],
        ['Piano', `Yamaha ${escapeHtml(piano.model || '')} ${escapeHtml(piano.year || '')}`],
      ]) +
      p(`Your tuner will arrive at your home at the agreed time. If you need to reschedule, please contact us at ${parts.officeEmail()} or call ${parts.officePhone()}.`) +
      signOff(),
  })
}

/* To Eric, when the tuner confirms the booking. */
function internalTunerConfirmedEmail(booking) {
  const customer = booking.order.customer
  return layout({
    internal: true,
    preview: `${booking.tuner.name} has confirmed the tuning for ${customer.first_name} ${customer.last_name}.`,
    label: 'For Signature Pianos',
    title: 'Tuner confirmed',
    body:
      p(`${escapeHtml(booking.tuner.name)} has confirmed the tuning booking for ` +
        `${escapeHtml(customer.first_name)} ${escapeHtml(customer.last_name)} ` +
        `on ${escapeHtml(formatDate(booking.proposed_date))}.`, { first: true }) +
      details([
        ['Tuner', escapeHtml(booking.tuner.name)],
        ['Customer', `${escapeHtml(customer.first_name)} ${escapeHtml(customer.last_name)}`],
        ['Date', escapeHtml(formatDate(booking.proposed_date)), true],
      ]),
  })
}

module.exports.templates = { customerTunerConfirmEmail, internalTunerConfirmedEmail }
module.exports.pages = { htmlMessage }
