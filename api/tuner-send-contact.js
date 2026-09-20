/*
 * Signature Pianos — manual trigger for the tuner contact emails
 * --------------------------------------------------------------
 * POST /api/tuner-send-contact  body: { booking_id, force? }
 *
 * Same two-email pair as the daily cron (customer heads-up + tuner
 * action), but fired on demand from the admin delivery detail panel.
 * Useful when the cron hasn't reached the trigger_date yet or when
 * the contact email needs to be re-sent.
 *
 * Admin only. Idempotent on contact_sent — answers 409 if the contact
 * emails already went, unless the body says force: true (a deliberate
 * re-send). Refused for completed / cancelled bookings.
 *
 * The tuner email goes first: if it fails nothing else is sent and
 * contact_sent stays false. If it succeeds the customer heads-up follows
 * and contact_sent flips (a failed customer email comes back as
 * `warning`).
 */

const { createClient } = require('@supabase/supabase-js')
const { Resend } = require('resend')
const { internalRecipients } = require('../lib/notify')
const { requireAdmin, sendAuthError } = require('../lib/auth')
const { customerTuningReadyEmail, tunerContactEmail, parts, sendEmail, errText } = require('../lib/tuner-emails')
const { esc, layout, p, details } = require('../lib/email-brand')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
const resend = new Resend(process.env.RESEND_API_KEY)

const FROM           = 'Signature Pianos <info@signaturepianos.com.au>'
const BUSINESS_EMAIL = process.env.BUSINESS_EMAIL || 'info@signaturepianos.com.au'
const SITE_URL       = process.env.SITE_URL       || 'https://signaturepianos.com.au'

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try { await requireAdmin(req) } catch (e) { return sendAuthError(res, e) }

  const { booking_id, force } = req.body || {}
  if (!booking_id) return res.status(400).json({ error: 'Missing booking_id' })

  try {
    const { data: booking, error } = await supabase
      .from('tuner_bookings')
      .select(`
        *,
        tuner:tuner_id ( * ),
        order:order_id (
          *,
          customer:customer_id ( * ),
          piano:piano_id ( * )
        )
      `)
      .eq('id', booking_id)
      .maybeSingle()
    if (error) throw error
    if (!booking) return res.status(404).json({ error: 'Booking not found' })
    if (!booking.tuner) return res.status(400).json({ error: 'No tuner assigned to this booking' })
    if (!booking.tuner.email) return res.status(400).json({ error: 'The assigned tuner has no email address' })
    if (booking.completed === true || booking.status === 'completed' || booking.status === 'cancelled') {
      return res.status(409).json({ error: `This tuning booking is ${booking.status === 'cancelled' ? 'cancelled' : 'already complete'}. Nothing was sent.` })
    }
    if (booking.contact_sent && force !== true) {
      return res.status(409).json({ error: 'The contact emails were already sent. Send again with force: true to re-send.' })
    }
    if (!booking.log_date_token) {
      return res.status(500).json({ error: 'This booking has no log-date link yet (log_date_token is empty). Run the tuner flow migration.' })
    }

    let settings = {}
    try {
      const { data: s } = await supabase.from('company_settings').select('*').limit(1).maybeSingle()
      if (s) settings = s
    } catch (sErr) {
      console.warn('[tuner-send-contact] settings load fell back', sErr)
    }

    const customer = booking.order?.customer || {}
    const piano    = booking.order?.piano    || {}
    const tuner    = booking.tuner
    const pianoLabel = `${piano.brand || 'Yamaha'} ${piano.model || ''} ${piano.year || ''}`.trim()
    // /tuner/log-date/{token} → tuner/log-date.html (vercel.json rewrite).
    const logDateUrl = `${SITE_URL}/tuner/log-date/${booking.log_date_token}`
    const warnings = []

    // Tuner first. If it fails we don't flip contact_sent (the whole point
    // is that the tuner has been notified) and don't send the customer a
    // heads-up that a retry would then repeat.
    const tunerErr = await sendEmail(resend, {
      from: FROM,
      to: tuner.email,
      subject: `New tuning job — ${customer.first_name || ''} ${customer.last_name || ''} · ${pianoLabel}`.trim(),
      html: tunerContactEmail({ tuner, customer, piano, logDateUrl }),
    })
    if (tunerErr) {
      console.error('[tuner-send-contact] tuner email failed', booking_id, tunerErr)
      return res.status(502).json({ error: `Tuner email failed: ${errText(tunerErr)}` })
    }

    if (customer.email) {
      const custErr = await sendEmail(resend, {
        from: FROM,
        to: customer.email,
        subject: 'Your piano is ready for its first tuning — Signature Pianos',
        html: customerTuningReadyEmail({ customer, piano, settings }),
      })
      if (custErr) {
        console.error('[tuner-send-contact] customer email failed', booking_id, custErr)
        warnings.push(`Customer heads-up failed: ${errText(custErr)}`)
      }
    } else {
      warnings.push('Customer has no email address; heads-up not sent')
    }

    // Don't move a booking whose date is already agreed back to 'contact_sent'.
    const flagErr = await markContactSent(booking_id, booking.status === 'pending')
    if (flagErr) {
      console.error('[tuner-send-contact] contact_sent update failed', booking_id, flagErr)
      return res.status(500).json({ error: `Emails sent, but saving contact_sent failed: ${errText(flagErr)}` })
    }

    // Eric notification (best-effort)
    const ericErr = await sendEmail(resend, {
      from: FROM,
      to: internalRecipients(),
      subject: `Tuner contact email sent — ${tuner.name || ''} · ${pianoLabel}`.trim(),
      html: internalContactSentEmail({ tuner, customer, pianoLabel }),
    })
    if (ericErr) console.error('[tuner-send-contact] eric email failed', booking_id, ericErr)

    return res.status(200).json({ success: true, warning: warnings.length ? warnings.join('; ') : null })
  } catch (err) {
    console.error('[tuner-send-contact] handler failed', err)
    return res.status(500).json({ error: err.message || 'Send failed' })
  }
}

/* Flip contact_sent (+ status 'contact_sent' when withStatus). The
 * 'contact_sent' enum value comes from tuner_flow_rebuild.sql; if the live
 * enum doesn't have it (22P02 invalid enum input), the flag is still saved
 * without the status so nothing re-sends. Returns the error, or null. */
async function markContactSent(id, withStatus) {
  const stamp = { contact_sent: true, contact_sent_at: new Date().toISOString() }
  let { error } = await supabase.from('tuner_bookings')
    .update(withStatus ? { ...stamp, status: 'contact_sent' } : stamp).eq('id', id)
  if (error && withStatus && error.code === '22P02') {
    console.warn('[tuner-send-contact] status contact_sent not in enum; saving the flag only')
    ;({ error } = await supabase.from('tuner_bookings').update(stamp).eq('id', id))
  }
  return error || null
}

/* ---------- templates (brand kit: lib/email-brand.js) ---------- */

/* To Eric, after the contact emails are sent manually from admin. */
function internalContactSentEmail({ tuner, customer, pianoLabel }) {
  return layout({
    internal: true,
    preview: `The tuner contact email for ${pianoLabel} has gone to ${tuner.name || 'the tuner'}.`,
    label: 'For Signature Pianos',
    title: 'Tuner contact email sent',
    body:
      p('Tuner contact email sent manually from admin.', { first: true }) +
      details([
        ['Tuner', `${esc(tuner.name || '—')} (${esc(tuner.email || '—')})`],
        ['Customer', esc((customer.first_name || '') + ' ' + (customer.last_name || '')), true],
        ['Customer email', parts.emailLink(customer.email)],
        ['Customer phone', parts.phoneLink(customer.phone)],
        ['Piano', esc(pianoLabel)],
      ]),
  })
}

module.exports.templates = { internalContactSentEmail }
