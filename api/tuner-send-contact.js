/*
 * Signature Pianos — manual trigger for the tuner contact emails
 * --------------------------------------------------------------
 * POST /api/tuner-send-contact  body: { booking_id }
 *
 * Same two-email pair as the daily cron (customer heads-up + tuner
 * action), but fired on demand from the admin delivery detail panel.
 * Useful when the cron hasn't reached the trigger_date yet or when
 * the contact email needs to be re-sent.
 *
 * Idempotent on contact_sent — won't double-send if already flipped,
 * unless the admin explicitly resets the flag.
 */

const { createClient } = require('@supabase/supabase-js')
const { Resend } = require('resend')
const { customerTuningReadyEmail, tunerContactEmail } = require('../lib/tuner-emails')

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

  const { booking_id } = req.body || {}
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
    const logDateUrl = `${SITE_URL}/tuner/log-date/${booking.log_date_token}`

    if (customer.email) {
      try {
        await resend.emails.send({
          from: FROM,
          to: customer.email,
          subject: 'Your piano is ready for its first tuning — Signature Pianos',
          html: customerTuningReadyEmail({ customer, piano, settings }),
        })
      } catch (mailErr) {
        console.error('[tuner-send-contact] customer email failed', mailErr)
      }
    }

    try {
      await resend.emails.send({
        from: FROM,
        to: tuner.email,
        subject: `New tuning job — ${customer.first_name || ''} ${customer.last_name || ''} · ${pianoLabel}`.trim(),
        html: tunerContactEmail({ tuner, customer, piano, logDateUrl }),
      })
    } catch (mailErr) {
      console.error('[tuner-send-contact] tuner email failed', mailErr)
      // If the tuner email fails we shouldn't flip contact_sent — the
      // whole point is that the tuner has been notified.
      return res.status(500).json({ error: 'Tuner email failed' })
    }

    await supabase
      .from('tuner_bookings')
      .update({
        contact_sent:    true,
        contact_sent_at: new Date().toISOString(),
        status:          'contact_sent',
      })
      .eq('id', booking_id)

    // Eric notification (best-effort)
    try {
      await resend.emails.send({
        from: FROM,
        to: BUSINESS_EMAIL,
        subject: `Tuner contact email sent — ${tuner.name || ''} · ${pianoLabel}`.trim(),
        html: `
          <p>Tuner contact email sent manually from admin.</p>
          <p>Tuner: ${tuner.name || '—'} (${tuner.email || '—'})</p>
          <p>Customer: ${(customer.first_name || '') + ' ' + (customer.last_name || '')} (${customer.email || '—'} · ${customer.phone || '—'})</p>
          <p>Piano: ${pianoLabel}</p>
        `,
      })
    } catch (mailErr) {
      console.error('[tuner-send-contact] eric email failed', mailErr)
    }

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('[tuner-send-contact] handler failed', err)
    return res.status(500).json({ error: err.message || 'Send failed' })
  }
}
