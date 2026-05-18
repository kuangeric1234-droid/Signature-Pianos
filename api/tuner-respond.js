/*
 * Signature Pianos — tuner booking response receiver
 * --------------------------------------------------
 * POST /api/tuner-respond
 *   body: { token, booking_id, response, proposed_date?, proposed_time?, notes? }
 *   response: 'accepted' | 'proposed_new'
 *
 *   1. Verifies acceptance_token + booking_id pair.
 *   2. On 'accepted'  — flips tuner_accepted + status='confirmed',
 *                       sends customer confirmation + Eric note.
 *   3. On 'proposed_new' — records the tuner's proposed date/time +
 *                       a tuner_response='proposed_new' marker, leaves
 *                       status='pending'. Eric gets an action-required
 *                       email so he can ring the customer + update
 *                       the booking in admin.
 */

const { createClient } = require('@supabase/supabase-js')
const { Resend } = require('resend')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
const resend = new Resend(process.env.RESEND_API_KEY)

const FROM           = 'Signature Pianos <info@signaturepianos.com.au>'
const BUSINESS_EMAIL = process.env.BUSINESS_EMAIL || 'info@signaturepianos.com.au'

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { token, booking_id, response, proposed_date, proposed_time, notes } = req.body || {}
  if (!token || !booking_id) return res.status(400).json({ error: 'Missing token or booking_id' })
  if (!['accepted', 'proposed_new'].includes(response)) {
    return res.status(400).json({ error: 'Invalid response' })
  }
  if (response === 'proposed_new' && (!proposed_date || !proposed_time)) {
    return res.status(400).json({ error: 'Proposed date and time are required' })
  }

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
      .eq('acceptance_token', token)
      .maybeSingle()
    if (error) throw error
    if (!booking) return res.status(404).json({ error: 'Booking not found' })

    if (booking.tuner_accepted || booking.tuner_response === 'proposed_new') {
      return res.status(400).json({ error: 'Already responded' })
    }

    const tuner    = booking.tuner            || {}
    const customer = booking.order?.customer  || {}
    const piano    = booking.order?.piano     || {}

    // Settings for email footer (non-fatal)
    let settings = {}
    try {
      const { data: s } = await supabase.from('company_settings').select('*').limit(1).maybeSingle()
      if (s) settings = s
    } catch (sErr) {
      console.warn('[tuner-respond] settings load fell back', sErr)
    }

    if (response === 'accepted') {
      const { error: updErr } = await supabase
        .from('tuner_bookings')
        .update({
          tuner_accepted:    true,
          tuner_accepted_at: new Date().toISOString(),
          tuner_response:    'accepted',
          status:            'confirmed',
        })
        .eq('id', booking_id)
      if (updErr) throw updErr

      // Customer confirmation
      if (customer.email) {
        try {
          await resend.emails.send({
            from: FROM,
            to: customer.email,
            subject: 'Your piano tuning is confirmed — Signature Pianos',
            html: customerTuningConfirmedEmail({
              customer, piano,
              confirmedDate: fmtDateLong(booking.proposed_date),
              confirmedTime: booking.proposed_time,
              settings,
            }),
          })
        } catch (mailErr) {
          console.error('[tuner-respond] customer email failed', mailErr)
        }
      }

      // Eric notification
      try {
        await resend.emails.send({
          from: FROM,
          to: BUSINESS_EMAIL,
          subject: `Tuner confirmed — ${tuner.name || ''} · ${fmtDateLong(booking.proposed_date)}`.trim(),
          html: `
            <h2>Tuner accepted booking</h2>
            <p>Tuner: ${esc(tuner.name || '—')} (${esc(tuner.email || '—')})</p>
            <p>Customer: ${esc((customer.first_name || '') + ' ' + (customer.last_name || ''))}</p>
            <p>Piano: ${esc((piano.brand || 'Yamaha') + ' ' + (piano.model || '') + ' ' + (piano.year || ''))}</p>
            <p><strong>Confirmed: ${esc(fmtDateLong(booking.proposed_date))} · ${esc(booking.proposed_time || 'Flexible')}</strong></p>
            <p>Customer has been notified.</p>
          `,
        })
      } catch (mailErr) {
        console.error('[tuner-respond] eric email failed', mailErr)
      }

      return res.status(200).json({ success: true })
    }

    // ---- response === 'proposed_new' ------------------------------------
    const mergedNotes = notes
      ? (booking.completion_notes ? booking.completion_notes + '\n\nTuner notes: ' + notes : 'Tuner notes: ' + notes)
      : booking.completion_notes

    const { error: updErr } = await supabase
      .from('tuner_bookings')
      .update({
        tuner_response:      'proposed_new',
        tuner_proposed_date: proposed_date,
        tuner_proposed_time: proposed_time,
        status:              'pending',
        completion_notes:    mergedNotes,
      })
      .eq('id', booking_id)
    if (updErr) throw updErr

    // Eric action-required notification
    try {
      await resend.emails.send({
        from: FROM,
        to: BUSINESS_EMAIL,
        subject: `Tuner proposed new date — ${tuner.name || ''} · ${fmtDateLong(proposed_date)}`.trim(),
        html: tunerProposedNewEmail({ tuner, customer, piano, booking, proposed_date, proposed_time, notes, settings }),
      })
    } catch (mailErr) {
      console.error('[tuner-respond] eric proposed-new email failed', mailErr)
    }

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('[tuner-respond] handler failed', err)
    return res.status(500).json({ error: err.message || 'Respond failed' })
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

function customerTuningConfirmedEmail({ customer, piano, confirmedDate, confirmedTime, settings }) {
  const pianoLabel = `${piano.brand || 'Yamaha'} ${piano.model || ''} ${piano.year || ''}`.trim()
  return `<!DOCTYPE html>
<html>
<body style="font-family:Arial,Helvetica,sans-serif;background:#f8f7f5;margin:0;padding:40px 20px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e8e4dd;">
    <div style="background:#1a1917;padding:32px;text-align:center;">
      <div style="font-size:20px;color:#b8935a;font-style:italic;">${esc(settings?.business_name || 'Signature Pianos')}</div>
    </div>
    <div style="padding:32px;">
      <h2 style="color:#1a1917;margin:0 0 16px;">Your tuning is confirmed, ${esc(customer.first_name || 'friend')}.</h2>
      <p style="color:#6b6760;font-size:14px;line-height:1.7;">
        A certified tuner has been confirmed for your ${esc(pianoLabel)}.
      </p>
      <div style="background:#f0f9f4;border:1px solid #9fe1cb;border-radius:4px;padding:20px;margin:20px 0;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#085041;margin-bottom:8px;">Confirmed appointment</div>
        <div style="font-size:18px;font-weight:500;color:#085041;">${esc(confirmedDate)}</div>
        ${confirmedTime ? `<div style="font-size:14px;color:#085041;margin-top:4px;">${esc(confirmedTime)}</div>` : ''}
      </div>
      <p style="color:#6b6760;font-size:13px;line-height:1.7;">
        Please ensure someone is home during the time window. The tuning takes approximately 60–90 minutes. If you need to reschedule please contact us as soon as possible.
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

function tunerProposedNewEmail({ tuner, customer, piano, booking, proposed_date, proposed_time, notes, settings }) {
  const pianoLabel = `${piano.brand || 'Yamaha'} ${piano.model || ''} ${piano.year || ''}`.trim()
  return `<!DOCTYPE html>
<html>
<body style="font-family:Arial,Helvetica,sans-serif;background:#f8f7f5;margin:0;padding:40px 20px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e8e4dd;">
    <div style="background:#1a1917;padding:24px 32px;">
      <div style="font-size:18px;color:#b8935a;font-style:italic;">${esc(settings?.business_name || 'Signature Pianos')}</div>
      <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:4px;">Tuner proposed new date — action required</div>
    </div>
    <div style="padding:32px;">
      <h2 style="color:#1a1917;margin:0 0 16px;">${esc(tuner.name || 'The tuner')} cannot do the proposed date</h2>
      <p style="color:#6b6760;font-size:14px;line-height:1.7;">
        ${esc(tuner.name || 'The tuner')} has proposed a new date. Please confirm this with the customer and update the booking in admin.
      </p>

      <div style="background:#f8f7f5;border-radius:4px;padding:16px;margin:20px 0;">
        <table style="width:100%;font-size:13px;border-collapse:collapse;">
          <tr><td style="padding:8px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;width:45%;">Original date</td><td style="padding:8px 0;border-bottom:1px solid #e8e4dd;text-decoration:line-through;color:#9a9590;">${esc(fmtDateLong(booking.proposed_date))} · ${esc(booking.proposed_time || 'Flexible')}</td></tr>
          <tr><td style="padding:8px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;">Tuner's proposed date</td><td style="padding:8px 0;font-weight:500;border-bottom:1px solid #e8e4dd;color:#b8935a;">${esc(fmtDateLong(proposed_date))}</td></tr>
          <tr><td style="padding:8px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;">Proposed time</td><td style="padding:8px 0;border-bottom:1px solid #e8e4dd;">${esc(proposed_time || '—')}</td></tr>
          <tr><td style="padding:8px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;">Piano</td><td style="padding:8px 0;border-bottom:1px solid #e8e4dd;">${esc(pianoLabel)}</td></tr>
          <tr><td style="padding:8px 0;color:#9a9590;${notes ? 'border-bottom:1px solid #e8e4dd;' : ''}">Customer</td><td style="padding:8px 0;${notes ? 'border-bottom:1px solid #e8e4dd;' : ''}">
            ${esc((customer.first_name || '') + ' ' + (customer.last_name || ''))}<br>
            <a href="tel:${esc(customer.phone || '')}" style="color:#b8935a;font-size:12px;">${esc(customer.phone || '—')}</a>
          </td></tr>
          ${notes ? `
            <tr><td style="padding:8px 0;color:#9a9590;">Tuner notes</td><td style="padding:8px 0;font-style:italic;color:#6b6760;">${esc(notes)}</td></tr>
          ` : ''}
        </table>
      </div>

      <div style="background:#fff3cd;border-radius:4px;padding:14px;margin-bottom:20px;border-left:3px solid #ffc107;">
        <div style="font-size:13px;color:#856404;font-weight:500;margin-bottom:4px;">Action required</div>
        <div style="font-size:12px;color:#856404;line-height:1.6;">
          1. Call or email the customer to confirm the new date works for them<br>
          2. Update the tuner booking date in your admin portal<br>
          3. Send updated confirmation to both tuner and customer
        </div>
      </div>

      <a href="https://signaturepianos.com.au/admin/deliveries.html"
         style="display:inline-block;background:#b8935a;color:#000;padding:12px 24px;border-radius:4px;text-decoration:none;font-size:13px;font-weight:500;">
        Go to admin portal →
      </a>
    </div>
    <div style="background:#f8f7f5;padding:16px;text-align:center;font-size:12px;color:#9a9590;border-top:1px solid #e8e4dd;">
      ${esc(settings?.business_name || 'Signature Pianos')} Melbourne · ${esc(settings?.website || 'signaturepianos.com.au')}
    </div>
  </div>
</body>
</html>`
}
