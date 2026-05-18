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
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE) {
      try {
        const twilio = require('twilio')(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        await twilio.messages.create({
          body:
            `Hi ${tuner.name}, you have a piano tuning booking request from Signature Pianos.\n\n` +
            `Customer: ${customer.first_name} ${customer.last_name}\n` +
            `Piano: Yamaha ${piano.model} ${piano.year || ''}\n` +
            `Proposed date: ${formatDate(booking.proposed_date)}\n` +
            `Address: ${customer.suburb || 'Melbourne'}\n\n` +
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

/* ---------- email template (dark / gold brand) ---------- */

function tunerBookingEmail({ tuner, customer, piano, booking, confirmUrl, completeUrl }) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'DM Sans', Arial, sans-serif; background: #f8f7f5; margin: 0; padding: 40px 20px; }
        .card { background: #fff; max-width: 560px; margin: 0 auto; border-radius: 8px; overflow: hidden; border: 1px solid #e8e4dd; }
        .header { background: #1a1917; padding: 32px; text-align: center; }
        .logo { font-size: 20px; color: #b8935a; letter-spacing: 0.1em; font-style: italic; }
        .body { padding: 32px; }
        h2 { font-size: 22px; color: #1a1917; margin: 0 0 8px; }
        p { color: #6b6760; font-size: 14px; line-height: 1.7; margin: 0 0 16px; }
        .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e8e4dd; font-size: 13px; }
        .detail-label { color: #9a9590; }
        .detail-value { color: #1a1917; font-weight: 500; }
        .btn { display: inline-block; padding: 14px 28px; border-radius: 4px; text-decoration: none; font-size: 13px; font-weight: 500; letter-spacing: 0.05em; margin: 8px 8px 8px 0; }
        .btn-gold { background: #b8935a; color: #000; }
        .btn-outline { border: 1px solid #b8935a; color: #b8935a; }
        .footer { background: #f8f7f5; padding: 20px 32px; font-size: 12px; color: #9a9590; text-align: center; }
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

          <div class="detail-row">
            <span class="detail-label">Customer</span>
            <span class="detail-value">${escapeHtml(customer.first_name)} ${escapeHtml(customer.last_name)}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Address</span>
            <span class="detail-value">${escapeHtml(customer.suburb || 'Melbourne')}, VIC</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Piano</span>
            <span class="detail-value">Yamaha ${escapeHtml(piano.model || '')} ${escapeHtml(piano.year || '')}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Serial number</span>
            <span class="detail-value">${escapeHtml(piano.serial_number || '—')}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Proposed date</span>
            <span class="detail-value">${formatDate(booking.proposed_date)}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Proposed time</span>
            <span class="detail-value">${escapeHtml(booking.proposed_time || 'Flexible — please suggest')}</span>
          </div>

          <p style="margin-top:24px;">Please confirm or contact us if this date doesn't work for you.</p>

          <a href="${confirmUrl}" class="btn btn-gold">Confirm this booking</a>
          <a href="mailto:${escapeHtml(BUSINESS_EMAIL || 'info@signaturepianos.com.au')}" class="btn btn-outline">Contact Eric</a>

          <p style="margin-top:24px;font-size:12px;color:#9a9590;">
            Once the tuning is complete, use this link to mark it as done:<br>
            <a href="${completeUrl}" style="color:#b8935a;">${completeUrl}</a>
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
