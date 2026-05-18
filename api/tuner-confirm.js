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
        to: BUSINESS_EMAIL,
        subject: `Tuner confirmed — ${booking.tuner.name} for ${booking.order.customer.first_name} ${booking.order.customer.last_name}`,
        html:
          `<p>${escapeHtml(booking.tuner.name)} has confirmed the tuning booking for ` +
          `${escapeHtml(booking.order.customer.first_name)} ${escapeHtml(booking.order.customer.last_name)} ` +
          `on ${formatDate(booking.proposed_date)}.</p>`,
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

/* Plain HTML for error states — mobile-friendly, matches the brand tone. */
function htmlMessage(title, body) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — Signature Pianos</title>
<style>
  body{font-family:-apple-system,system-ui,Arial,sans-serif;background:#f8f7f5;margin:0;padding:40px 20px;}
  .card{background:#fff;max-width:480px;margin:0 auto;border-radius:8px;padding:36px;border:1px solid #e8e4dd;text-align:center;}
  h2{color:#1a1917;font-size:20px;margin:0 0 12px;}
  p{color:#6b6760;font-size:14px;line-height:1.7;margin:0;}
  .logo{font-size:18px;color:#b8935a;letter-spacing:0.08em;font-style:italic;margin-bottom:20px;}
</style></head><body>
<div class="card">
  <div class="logo">Signature Pianos</div>
  <h2>${escapeHtml(title)}</h2>
  <p>${escapeHtml(body)}</p>
</div>
</body></html>`
}

function customerTunerConfirmEmail(booking) {
  const customer = booking.order.customer
  const piano = booking.order.piano
  const tuner = booking.tuner
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;">
      <div style="background:#1a1917;padding:32px;text-align:center;">
        <div style="font-size:20px;color:#b8935a;font-style:italic;letter-spacing:0.08em;">Signature Pianos</div>
      </div>
      <div style="padding:32px;">
        <h2 style="color:#1a1917;margin:0 0 12px;">Your tuning is confirmed, ${escapeHtml(customer.first_name)}.</h2>
        <p style="color:#6b6760;font-size:14px;line-height:1.7;margin:0 0 18px;">
          Great news — your piano tuner has confirmed the appointment.
          Here are the details:
        </p>
        <table style="width:100%;font-size:13px;border-collapse:collapse;">
          <tr>
            <td style="padding:10px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;">Tuner</td>
            <td style="padding:10px 0;font-weight:500;border-bottom:1px solid #e8e4dd;text-align:right;">${escapeHtml(tuner.name)}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;">Piano</td>
            <td style="padding:10px 0;font-weight:500;border-bottom:1px solid #e8e4dd;text-align:right;">Yamaha ${escapeHtml(piano.model || '')} ${escapeHtml(piano.year || '')}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;">Date</td>
            <td style="padding:10px 0;font-weight:500;border-bottom:1px solid #e8e4dd;text-align:right;">${formatDate(booking.proposed_date)}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#9a9590;">Time</td>
            <td style="padding:10px 0;font-weight:500;text-align:right;">${escapeHtml(booking.proposed_time || 'To be confirmed by tuner')}</td>
          </tr>
        </table>
        <p style="margin-top:24px;color:#6b6760;font-size:13px;line-height:1.7;">
          Your tuner will arrive at your home at the agreed time.
          If you need to reschedule please contact us at
          <a href="mailto:info@signaturepianos.com.au" style="color:#b8935a;">info@signaturepianos.com.au</a>.
        </p>
      </div>
      <div style="background:#f8f7f5;padding:20px;text-align:center;font-size:12px;color:#9a9590;">
        Signature Pianos Melbourne · signaturepianos.com.au
      </div>
    </div>
  `
}
