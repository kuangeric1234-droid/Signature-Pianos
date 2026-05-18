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
const { createClient } = require('@supabase/supabase-js')

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

    const { error: updateErr } = await supabase
      .from('tuner_bookings')
      .update({
        confirmation_token: confirmationToken,
        completion_token: completionToken,
        status: 'pending',
      })
      .eq('id', tuner_booking_id)
    if (updateErr) throw updateErr

    const tuner = booking.tuner
    const customer = booking.order.customer
    const piano = booking.order.piano

    const confirmUrl = `${SITE_URL}/api/tuner-confirm?token=${confirmationToken}`
    const completeUrl = `${SITE_URL}/api/tuner-complete?token=${completionToken}`

    // 1) Email to tuner
    try {
      await resend.emails.send({
        from: FROM,
        to: tuner.email,
        subject: `Piano tuning booking — ${customer.first_name} ${customer.last_name}`,
        html: tunerBookingEmail({ tuner, customer, piano, booking, confirmUrl, completeUrl }),
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
        to: BUSINESS_EMAIL,
        subject: `Tuner booking sent — ${tuner.name} for ${customer.first_name} ${customer.last_name}`,
        html:
          `<p>Tuner booking notification sent to ${escapeHtml(tuner.name)} ` +
          `(${escapeHtml(tuner.email)} / ${escapeHtml(tuner.phone)})</p>` +
          `<p>Customer: ${escapeHtml(customer.first_name)} ${escapeHtml(customer.last_name)}</p>` +
          `<p>Piano: Yamaha ${escapeHtml(piano.model || '')} ${escapeHtml(piano.year || '')} — ` +
          `Serial ${escapeHtml(piano.serial_number || '')}</p>` +
          `<p>Proposed date: ${formatDate(booking.proposed_date)}</p>`,
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

/* ---------- email template (dark / gold brand) ----------
 * Now includes the customer's email, phone and full address so the
 * tuner can reach them directly without bouncing off Eric, plus a
 * Call button that taps straight into the phone dialer on mobile. */

function tunerBookingEmail({ tuner, customer, piano, booking, confirmUrl, completeUrl }) {
  const fullAddress = [
    customer.address_line1,
    customer.address_line2,
    customer.suburb,
    customer.state,
    customer.postcode,
  ].filter(Boolean).map(escapeHtml).join(', ') || '—'

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, Helvetica, sans-serif; background: #f8f7f5; margin: 0; padding: 40px 20px; }
        .card { background: #fff; max-width: 560px; margin: 0 auto; border-radius: 8px; overflow: hidden; border: 1px solid #e8e4dd; }
        .header { background: #1a1917; padding: 32px; text-align: center; }
        .logo { font-size: 20px; color: #b8935a; font-style: italic; }
        .body { padding: 32px; }
        h2 { font-size: 20px; color: #1a1917; margin: 0 0 8px; }
        p { color: #6b6760; font-size: 14px; line-height: 1.7; margin: 0 0 16px; }
        .section-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #9a9590; margin-bottom: 10px; margin-top: 20px; display: block; }
        .detail-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 4px; }
        .detail-table td { padding: 8px 0; border-bottom: 1px solid #e8e4dd; }
        .detail-table td:first-child { color: #9a9590; width: 40%; }
        .detail-table td:last-child { font-weight: 500; color: #1a1917; }
        .detail-table tr:last-child td { border-bottom: none; }
        .btn { display: inline-block; padding: 12px 24px; border-radius: 4px; text-decoration: none; font-size: 13px; font-weight: 500; margin: 6px 6px 6px 0; }
        .btn-gold { background: #b8935a; color: #000; }
        .btn-outline { border: 1px solid #b8935a; color: #b8935a; }
        .highlight { background: #f0f9f4; border-left: 3px solid #1a7f4b; padding: 12px 16px; border-radius: 0 4px 4px 0; margin: 16px 0; }
        .footer { background: #f8f7f5; padding: 20px; text-align: center; font-size: 12px; color: #9a9590; border-top: 1px solid #e8e4dd; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div class="logo">Signature Pianos</div>
        </div>
        <div class="body">
          <h2>Hi ${escapeHtml(tuner.name)},</h2>
          <p>You have a new piano tuning booking request from Signature Pianos. Please review the details below and confirm your availability.</p>

          <span class="section-label">Customer details</span>
          <table class="detail-table">
            <tr><td>Name</td><td>${escapeHtml(customer.first_name || '')} ${escapeHtml(customer.last_name || '')}</td></tr>
            <tr><td>Email</td><td><a href="mailto:${escapeHtml(customer.email || '')}" style="color:#b8935a;">${escapeHtml(customer.email || '—')}</a></td></tr>
            <tr><td>Phone</td><td><a href="tel:${escapeHtml(customer.phone || '')}" style="color:#b8935a;">${escapeHtml(customer.phone || '—')}</a></td></tr>
            <tr><td>Address</td><td>${fullAddress}</td></tr>
          </table>

          <span class="section-label">Piano details</span>
          <table class="detail-table">
            <tr><td>Piano</td><td>Yamaha ${escapeHtml(piano.model || '')} ${escapeHtml(piano.year || '')}</td></tr>
            <tr><td>Serial number</td><td style="font-family:monospace;">${escapeHtml(piano.serial_number || '—')}</td></tr>
            <tr><td>Condition</td><td>${escapeHtml(piano.condition || '—')}</td></tr>
          </table>

          <span class="section-label">Booking details</span>
          <table class="detail-table">
            <tr><td>Proposed date</td><td style="color:#b8935a;font-weight:500;">${formatDate(booking.proposed_date)}</td></tr>
            <tr><td>Time window</td><td>${escapeHtml(booking.proposed_time || 'Flexible — please suggest')}</td></tr>
          </table>

          <div class="highlight">
            <div style="font-size:13px;color:#085041;font-weight:500;margin-bottom:4px;">Please confirm or suggest an alternative time</div>
            <div style="font-size:12px;color:#085041;">Contact the customer directly if you need to arrange a different time before confirming.</div>
          </div>

          <a href="${confirmUrl}" class="btn btn-gold">Confirm this booking</a>
          <a href="mailto:${escapeHtml(customer.email || '')}" class="btn btn-outline">Email customer</a>
          <a href="tel:${escapeHtml(customer.phone || '')}" class="btn btn-outline">Call customer</a>

          <p style="margin-top:20px;font-size:12px;color:#9a9590;">
            Once the tuning is complete use this link to mark it as done and notify the customer:<br>
            <a href="${completeUrl}" style="color:#b8935a;word-break:break-all;">${completeUrl}</a>
          </p>
        </div>
        <div class="footer">
          Signature Pianos Melbourne · signaturepianos.com.au
        </div>
      </div>
    </body>
    </html>
  `
}
