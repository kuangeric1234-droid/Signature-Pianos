/*
 * Signature Pianos — driver delivery acceptance
 * ---------------------------------------------
 * POST /api/driver-accept  body: { token, delivery_id, accepted_preference, notes }
 *
 *   1. Verifies acceptance_token + delivery_id match.
 *   2. Resolves the selected preference (1/2/3) to a date + time window.
 *      Customer prefs are stored as jsonb { date, time }; driver pages
 *      flatten them to "YYYY-MM-DD <time>" strings, so we split on the
 *      first space to extract the date.
 *   3. Updates the row — driver_accepted, scheduled_date / window,
 *      status='scheduled', driver notes appended.
 *   4. Customer confirmation email + Eric notification.
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

  const { token, delivery_id, accepted_preference, notes } = req.body || {}
  if (!token || !delivery_id) return res.status(400).json({ error: 'Missing token or delivery_id' })
  if (![1, 2, 3].includes(Number(accepted_preference))) {
    return res.status(400).json({ error: 'Invalid preference selection' })
  }

  try {
    const { data: delivery, error } = await supabase
      .from('deliveries')
      .select(`
        *,
        order:order_id (
          *,
          customer:customer_id ( * ),
          piano:piano_id ( * )
        ),
        partner:delivery_partner_id ( * )
      `)
      .eq('id', delivery_id)
      .eq('acceptance_token', token)
      .maybeSingle()
    if (error) throw error
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' })
    if (delivery.driver_accepted) return res.status(400).json({ error: 'Already accepted' })

    const prefMap = {
      1: delivery.customer_preference_1,
      2: delivery.customer_preference_2,
      3: delivery.customer_preference_3,
    }
    const acceptedPref = prefMap[accepted_preference]
    if (!acceptedPref) {
      return res.status(400).json({ error: 'Customer preference not found' })
    }

    // jsonb {date, time} OR legacy string "YYYY-MM-DD <time>" — handle both.
    let dateStr, timeStr
    if (typeof acceptedPref === 'object' && acceptedPref !== null) {
      dateStr = acceptedPref.date || null
      timeStr = acceptedPref.time || null
    } else {
      const s = String(acceptedPref || '')
      dateStr = s.split(' ')[0] || null
      timeStr = s.split(' ').slice(1).join(' ') || null
    }

    const customer = delivery.order?.customer || {}
    const piano    = delivery.order?.piano    || {}
    const partner  = delivery.partner         || {}

    // Append driver notes to the existing delivery notes rather than
    // overwriting (might contain admin or customer-preference notes).
    const mergedNotes = notes
      ? (delivery.notes ? delivery.notes + '\n\nDriver notes: ' + notes : 'Driver notes: ' + notes)
      : delivery.notes

    const { error: updErr } = await supabase
      .from('deliveries')
      .update({
        driver_accepted:            true,
        driver_accepted_at:         new Date().toISOString(),
        driver_accepted_preference: accepted_preference,
        scheduled_date:             dateStr,
        scheduled_time_window:      timeStr,
        status:                     'scheduled',
        notes:                      mergedNotes,
      })
      .eq('id', delivery_id)
    if (updErr) throw updErr

    // Settings for the email footer (non-fatal)
    let settings = {}
    try {
      const { data: s } = await supabase.from('company_settings').select('*').limit(1).maybeSingle()
      if (s) settings = s
    } catch (sErr) {
      console.warn('[driver-accept] settings load fell back', sErr)
    }

    const fmtDateLong = (d) => {
      if (!d) return '—'
      try {
        return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        })
      } catch { return d }
    }
    const confirmedDisplay = dateStr
      ? fmtDateLong(dateStr) + (timeStr ? ' · ' + timeStr : '')
      : (typeof acceptedPref === 'string' ? acceptedPref : '—')

    // Customer email
    if (customer.email) {
      try {
        await resend.emails.send({
          from: FROM,
          to: customer.email,
          subject: 'Your piano delivery is confirmed — Signature Pianos',
          html: customerDeliveryConfirmedEmail({ customer, piano, confirmedDate: confirmedDisplay, settings }),
        })
      } catch (mailErr) {
        console.error('[driver-accept] customer email failed', mailErr)
      }
    }

    // Internal Eric notification
    try {
      await resend.emails.send({
        from: FROM,
        to: BUSINESS_EMAIL,
        subject: `Driver accepted — ${partner.name || ''} · ${confirmedDisplay}`.trim(),
        html: `
          <h2>Driver accepted delivery</h2>
          <p>Driver: ${esc(partner.name || '—')} (${esc(partner.email || '—')})</p>
          <p>Customer: ${esc((customer.first_name || '') + ' ' + (customer.last_name || ''))}</p>
          <p>Piano: ${esc((piano.brand || 'Yamaha') + ' ' + (piano.model || '') + ' ' + (piano.year || ''))}</p>
          <p><strong>Confirmed date: ${esc(confirmedDisplay)}</strong></p>
          ${notes ? `<p>Driver notes: ${esc(notes)}</p>` : ''}
          <p>Customer has been notified.</p>
          <p style="color:#b8935a;">
            The driver will receive their pickup photo link automatically 3 days before the confirmed date (via the daily cron).
          </p>
        `,
      })
    } catch (mailErr) {
      console.error('[driver-accept] internal email failed', mailErr)
    }

    return res.status(200).json({ success: true, confirmed_date: confirmedDisplay })
  } catch (err) {
    console.error('[driver-accept] handler failed', err)
    return res.status(500).json({ error: err.message || 'Accept failed' })
  }
}

function esc(s) {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function customerDeliveryConfirmedEmail({ customer, piano, confirmedDate, settings }) {
  const pianoLabel = `${piano.brand || 'Yamaha'} ${piano.model || ''} ${piano.year || ''}`.trim()
  return `<!DOCTYPE html>
<html>
<body style="font-family:Arial,Helvetica,sans-serif;background:#f8f7f5;margin:0;padding:40px 20px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e8e4dd;">
    <div style="background:#1a1917;padding:32px;text-align:center;">
      <div style="font-size:20px;color:#b8935a;font-style:italic;">${esc(settings?.business_name || 'Signature Pianos')}</div>
    </div>
    <div style="padding:32px;">
      <h2 style="color:#1a1917;margin:0 0 16px;">Your delivery is confirmed, ${esc(customer.first_name || 'friend')}.</h2>
      <p style="color:#6b6760;font-size:14px;line-height:1.7;">Great news — your delivery has been confirmed.</p>
      <div style="background:#f0f9f4;border:1px solid #9fe1cb;border-radius:4px;padding:20px;margin:20px 0;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#085041;margin-bottom:8px;">Confirmed delivery</div>
        <div style="font-size:18px;font-weight:500;color:#085041;">${esc(confirmedDate)}</div>
      </div>
      <table style="width:100%;font-size:13px;border-collapse:collapse;margin:20px 0;">
        <tr>
          <td style="padding:8px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;width:45%;">Piano</td>
          <td style="padding:8px 0;font-weight:500;border-bottom:1px solid #e8e4dd;">${esc(pianoLabel)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#9a9590;">What to expect</td>
          <td style="padding:8px 0;font-size:12px;color:#6b6760;line-height:1.6;">
            On the morning of delivery you will receive a photo of your piano before it leaves. You will also receive a notification when it is on its way.
          </td>
        </tr>
      </table>
      <p style="color:#6b6760;font-size:13px;line-height:1.7;">
        If you need to reschedule please contact us as soon as possible. Reply to this email or call us directly.
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
