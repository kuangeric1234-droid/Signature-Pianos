/*
 * Signature Pianos — legacy tuner confirmation link
 * -------------------------------------------------
 * GET /api/tuner-confirm?token={confirmation_token}
 *
 * Old tuner SMS messages linked here ("Confirm here: …"). This used to
 * confirm the booking and email the customer on every GET — so a link
 * preview (iMessage, Outlook safe-links) confirmed it, and every re-open
 * re-sent the customer email, without ever recording tuner_accepted or
 * the confirmed date.
 *
 * Now it changes nothing. It finds the booking and:
 *   - already confirmed / completed / cancelled → a short status page;
 *   - otherwise → forwards to the tuner's Accept / Propose page
 *     (/tuner/respond/{acceptance_token}), where the Confirm button POSTs
 *     to api/tuner-respond.js (which records the acceptance, the
 *     confirmed date, and sends the emails once).
 * New SMS messages link straight to the respond page.
 *
 * The email templates below are kept for the email previews; they are no
 * longer sent from here (api/tuner-respond.js sends the confirmation).
 *
 * Env required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

const { createClient } = require('@supabase/supabase-js')
const { layout, hello, p, details, signOff } = require('../lib/email-brand')
const { parts } = require('../lib/tuner-emails')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

module.exports = async (req, res) => {
  const token = req.query && typeof req.query.token === 'string' ? req.query.token : ''
  res.setHeader('content-type', 'text/html; charset=utf-8')
  if (token.length < 16) {
    return res.status(400).send(htmlMessage(
      'Link not valid',
      'This confirmation link is incomplete. Please use the link from your latest tuning request email.'
    ))
  }

  try {
    const { data: booking, error } = await supabase
      .from('tuner_bookings')
      .select('id, status, completed, tuner_accepted, tuner_response, acceptance_token, confirmed_date, proposed_date')
      .eq('confirmation_token', token)
      .maybeSingle()
    if (error) throw error

    if (!booking) {
      return res.status(404).send(htmlMessage(
        'Link no longer valid',
        'This confirmation link has been replaced by a newer request, or is no longer valid. Please use the link in your latest email from us, or email info@signaturepianos.com.au.'
      ))
    }

    if (booking.completed === true || booking.status === 'completed') {
      return res.send(htmlMessage('Already complete', 'This tuning has already been marked complete. No further action needed.'))
    }
    if (booking.status === 'cancelled') {
      return res.send(htmlMessage('Booking cancelled', 'This tuning booking has been cancelled. No action needed. Questions? Email info@signaturepianos.com.au.'))
    }
    if (booking.tuner_accepted || booking.status === 'confirmed') {
      const date = booking.confirmed_date || booking.proposed_date
      return res.send(htmlMessage(
        'Already confirmed',
        `This booking is already confirmed${date ? ' for ' + formatDate(date) : ''}. No further action needed.`
      ))
    }
    if (!booking.acceptance_token) {
      return res.status(404).send(htmlMessage(
        'Link no longer valid',
        'Please use the link in your latest email from us, or email info@signaturepianos.com.au.'
      ))
    }

    // Not answered yet: send the tuner to the page where they confirm
    // (or propose another date) with a button, not on page load.
    return res.redirect(303, `/tuner/respond/${encodeURIComponent(booking.acceptance_token)}`)
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
        ['Piano', `${escapeHtml(piano.brand || 'Yamaha')} ${escapeHtml(piano.model || '')} ${escapeHtml(piano.year || '')}`],
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
