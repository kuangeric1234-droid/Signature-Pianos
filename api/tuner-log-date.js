/*
 * Signature Pianos — tuner logs the agreed tuning date
 * ----------------------------------------------------
 * POST /api/tuner-log-date
 *   body: { token, booking_id, agreed_date, agreed_time, notes? }
 *
 *   1. Verifies log_date_token + booking_id pair.
 *   2. Updates tuner_bookings — confirmed_date / _time, date_logged,
 *      status='confirmed', notes appended.
 *   3. Fires three emails:
 *        - tuner   : confirmation with calendar links + complete CTA
 *        - customer: "your tuning is confirmed" with date/time
 *        - Eric    : internal note
 */

const { createClient } = require('@supabase/supabase-js')
const { Resend } = require('resend')
const { generateCalendarLinks } = require('../lib/calendar')

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

  const { token, booking_id, agreed_date, agreed_time, notes } = req.body || {}
  if (!token || !booking_id) return res.status(400).json({ error: 'Missing token or booking_id' })
  if (!agreed_date || !agreed_time) return res.status(400).json({ error: 'agreed_date and agreed_time are required' })

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
      .eq('log_date_token', token)
      .maybeSingle()
    if (error) throw error
    if (!booking) return res.status(404).json({ error: 'Booking not found' })
    if (booking.date_logged) return res.status(400).json({ error: 'Already logged' })

    const tuner    = booking.tuner            || {}
    const customer = booking.order?.customer  || {}
    const piano    = booking.order?.piano     || {}

    const mergedNotes = notes
      ? (booking.completion_notes ? booking.completion_notes + '\n\nTuner notes: ' + notes : 'Tuner notes: ' + notes)
      : booking.completion_notes

    const { error: updErr } = await supabase
      .from('tuner_bookings')
      .update({
        confirmed_date:   agreed_date,
        confirmed_time:   agreed_time,
        date_logged:      true,
        date_logged_at:   new Date().toISOString(),
        status:           'confirmed',
        completion_notes: mergedNotes,
      })
      .eq('id', booking_id)
    if (updErr) throw updErr

    // Settings for the customer email footer (non-fatal)
    let settings = {}
    try {
      const { data: s } = await supabase.from('company_settings').select('*').limit(1).maybeSingle()
      if (s) settings = s
    } catch (sErr) {
      console.warn('[tuner-log-date] settings load fell back', sErr)
    }

    const completeUrl = `${SITE_URL}/api/tuner-complete?token=${booking.completion_token}`
    const pianoLabel = `${piano.brand || 'Yamaha'} ${piano.model || ''} ${piano.year || ''}`.trim()

    // Calendar links for the tuner email
    const cal = generateCalendarLinks({
      title: `Piano tuning — ${pianoLabel}`,
      description:
        `Piano tuning for Signature Pianos.\n\n` +
        `Customer: ${customer.first_name || ''} ${customer.last_name || ''}\n` +
        `Phone: ${customer.phone || '—'}\n` +
        `Address: ${[customer.address_line1, customer.suburb, customer.state, customer.postcode].filter(Boolean).join(', ')}\n\n` +
        `Piano: ${pianoLabel}\n` +
        `Serial: ${piano.serial_number || '—'}\n\n` +
        `Mark complete: ${completeUrl}`,
      location: [customer.address_line1, customer.suburb, customer.state, customer.postcode].filter(Boolean).join(', '),
      startDate:     agreed_date,
      startTime:     agreed_time,
      durationHours: 2,
    })

    // Tuner confirmation
    if (tuner.email) {
      try {
        await resend.emails.send({
          from: FROM,
          to:   tuner.email,
          subject: `Tuning confirmed — ${fmtDateLong(agreed_date)} · ${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
          html: tunerDateConfirmedEmail({
            tuner, customer, piano, pianoLabel,
            agreedDate: agreed_date,
            agreedTime: agreed_time,
            completeUrl, cal,
          }),
        })
      } catch (mailErr) {
        console.error('[tuner-log-date] tuner email failed', mailErr)
      }
    }

    // Customer confirmation
    if (customer.email) {
      try {
        await resend.emails.send({
          from: FROM,
          to:   customer.email,
          subject: 'Your piano tuning is confirmed — Signature Pianos',
          html: customerTuningConfirmedEmail({
            customer, piano, pianoLabel,
            agreedDate: agreed_date,
            agreedTime: agreed_time,
            settings,
          }),
        })
      } catch (mailErr) {
        console.error('[tuner-log-date] customer email failed', mailErr)
      }
    }

    // Eric notification
    try {
      await resend.emails.send({
        from: FROM,
        to:   BUSINESS_EMAIL,
        subject: `Tuning date logged — ${tuner.name || ''} · ${fmtDateLong(agreed_date)}`.trim(),
        html: `
          <h2>Tuner logged agreed date</h2>
          <p>Tuner: ${esc(tuner.name || '—')} (${esc(tuner.email || '—')})</p>
          <p>Customer: ${esc((customer.first_name || '') + ' ' + (customer.last_name || ''))}</p>
          <p>Piano: ${esc(pianoLabel)}</p>
          <p><strong>Confirmed: ${esc(fmtDateLong(agreed_date))} · ${esc(agreed_time)}</strong></p>
          ${notes ? `<p>Notes: ${esc(notes)}</p>` : ''}
          <p>Both tuner and customer have been notified. Day-before reminders will fire automatically.</p>
        `,
      })
    } catch (mailErr) {
      console.error('[tuner-log-date] eric email failed', mailErr)
    }

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('[tuner-log-date] handler failed', err)
    return res.status(500).json({ error: err.message || 'Log date failed' })
  }
}

/* ---------- helpers ---------- */

function esc(s) {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function fmtDateLong(d) {
  if (!d) return '—'
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
  } catch { return d }
}

/* ---------- templates ---------- */

function tunerDateConfirmedEmail({ tuner, customer, piano, pianoLabel, agreedDate, agreedTime, completeUrl, cal }) {
  return `<!DOCTYPE html>
<html>
<body style="font-family:Arial,Helvetica,sans-serif;background:#f8f7f5;margin:0;padding:40px 20px;">
  <div style="max-width:580px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e8e4dd;">
    <div style="background:#1a1917;padding:32px;text-align:center;">
      <div style="font-size:20px;color:#b8935a;font-style:italic;">Signature Pianos</div>
      <div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:4px;">Tuning booking confirmed</div>
    </div>
    <div style="padding:32px;">
      <h2 style="color:#1a1917;margin:0 0 8px;">Booking confirmed, ${esc(tuner.name || '')}.</h2>
      <p style="color:#6b6760;font-size:14px;line-height:1.7;margin:0 0 20px;">
        Your tuning date has been logged. The customer has been notified.
      </p>

      <div style="background:#f0f9f4;border:1px solid #9fe1cb;border-radius:4px;padding:16px;margin-bottom:20px;text-align:center;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#085041;margin-bottom:6px;">Confirmed</div>
        <div style="font-size:18px;font-weight:500;color:#085041;">${esc(fmtDateLong(agreedDate))}</div>
        <div style="font-size:14px;color:#085041;margin-top:4px;">${esc(agreedTime)}</div>
      </div>

      <table style="width:100%;font-size:13px;border-collapse:collapse;margin-bottom:20px;">
        <tr><td style="padding:8px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;width:35%;">Customer</td><td style="padding:8px 0;font-weight:500;border-bottom:1px solid #e8e4dd;">${esc((customer.first_name || '') + ' ' + (customer.last_name || ''))}</td></tr>
        <tr><td style="padding:8px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;">Phone</td><td style="padding:8px 0;border-bottom:1px solid #e8e4dd;"><a href="tel:${esc(customer.phone || '')}" style="color:#b8935a;">${esc(customer.phone || '—')}</a></td></tr>
        <tr><td style="padding:8px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;">Address</td><td style="padding:8px 0;border-bottom:1px solid #e8e4dd;">${esc([customer.address_line1, customer.suburb, customer.state, customer.postcode].filter(Boolean).join(', ') || '—')}</td></tr>
        <tr><td style="padding:8px 0;color:#9a9590;">Piano</td><td style="padding:8px 0;">${esc(pianoLabel)} · Serial ${esc(piano.serial_number || '—')}</td></tr>
      </table>

      <div style="background:#f8f7f5;border-radius:4px;padding:14px;margin-bottom:20px;border:1px solid #e8e4dd;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#9a9590;margin-bottom:10px;">Add to your calendar</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <a href="${cal.googleUrl}" target="_blank" rel="noopener"
             style="display:inline-flex;align-items:center;gap:5px;background:#fff;border:1px solid #e8e4dd;border-radius:4px;padding:7px 14px;text-decoration:none;font-size:12px;color:#1a1917;font-weight:500;">
            📅 Google
          </a>
          <a href="${cal.outlookUrl}" target="_blank" rel="noopener"
             style="display:inline-flex;align-items:center;gap:5px;background:#fff;border:1px solid #e8e4dd;border-radius:4px;padding:7px 14px;text-decoration:none;font-size:12px;color:#1a1917;font-weight:500;">
            📅 Outlook
          </a>
          <a href="${cal.icsDataUrl}" download="tuning.ics"
             style="display:inline-flex;align-items:center;gap:5px;background:#fff;border:1px solid #e8e4dd;border-radius:4px;padding:7px 14px;text-decoration:none;font-size:12px;color:#1a1917;font-weight:500;">
            📅 Apple
          </a>
        </div>
      </div>

      <div style="background:#f8f7f5;border-radius:4px;padding:16px;border:1px solid #e8e4dd;">
        <div style="font-size:12px;font-weight:500;color:#1a1917;margin-bottom:6px;">After you complete the tuning</div>
        <p style="font-size:12px;color:#6b6760;margin:0 0 10px;line-height:1.5;">
          Use this link to mark the job as done. The customer will be notified automatically.
        </p>
        <a href="${esc(completeUrl)}"
           style="display:inline-block;background:#1a1917;color:#b8935a;padding:10px 20px;border-radius:4px;text-decoration:none;font-size:13px;font-weight:500;">
          Mark tuning complete →
        </a>
      </div>
    </div>
    <div style="background:#f8f7f5;padding:20px;text-align:center;font-size:12px;color:#9a9590;border-top:1px solid #e8e4dd;">
      Signature Pianos Melbourne · signaturepianos.com.au
    </div>
  </div>
</body>
</html>`
}

function customerTuningConfirmedEmail({ customer, piano, pianoLabel, agreedDate, agreedTime, settings }) {
  return `<!DOCTYPE html>
<html>
<body style="font-family:Arial,Helvetica,sans-serif;background:#f8f7f5;margin:0;padding:40px 20px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e8e4dd;">
    <div style="background:#1a1917;padding:32px;text-align:center;">
      <div style="font-size:20px;color:#b8935a;font-style:italic;">${esc(settings?.business_name || 'Signature Pianos')}</div>
    </div>
    <div style="padding:32px;">
      <h2 style="color:#1a1917;margin:0 0 16px;">Your tuning is confirmed, ${esc(customer.first_name || 'friend')}.</h2>
      <p style="color:#6b6760;font-size:14px;line-height:1.7;">A certified tuner has been booked for your ${esc(pianoLabel)}.</p>
      <div style="background:#f0f9f4;border:1px solid #9fe1cb;border-radius:4px;padding:20px;margin:20px 0;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#085041;margin-bottom:8px;">Confirmed appointment</div>
        <div style="font-size:18px;font-weight:500;color:#085041;">${esc(fmtDateLong(agreedDate))}</div>
        <div style="font-size:14px;color:#085041;margin-top:4px;">${esc(agreedTime)}</div>
      </div>
      <p style="color:#6b6760;font-size:13px;line-height:1.7;">
        Please ensure someone is home during the time window. Tuning takes approximately 60–90 minutes.
      </p>
      <p style="color:#6b6760;font-size:13px;line-height:1.7;">
        You will receive a reminder the day before your appointment. If you need to reschedule please reply to this email as soon as possible.
      </p>
    </div>
    <div style="background:#f8f7f5;padding:20px;text-align:center;font-size:12px;color:#9a9590;border-top:1px solid #e8e4dd;">
      ${esc(settings?.business_name || 'Signature Pianos')} Melbourne · ${esc(settings?.website || 'signaturepianos.com.au')}
      ${settings?.phone ? ' · ' + esc(settings.phone) : ''}
    </div>
  </div>
</body>
</html>`
}
