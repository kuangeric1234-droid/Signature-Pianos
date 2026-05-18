/*
 * Signature Pianos — daily delivery reminder cron
 * -----------------------------------------------
 * Hit by Vercel Cron once a day. Schedule is configured in vercel.json:
 *   "0 22 * * *"  (22:00 UTC = 08:00 AEST in standard time / 09:00 AEDT
 *                  in daylight saving — close enough for a morning ping)
 *
 * Vercel auto-attaches `Authorization: Bearer ${CRON_SECRET}` when the
 * env var is set, so we reject anything else with 401 to keep this
 * endpoint unhittable from the public internet.
 *
 * Per accepted delivery (driver_accepted=true, scheduled_date set, not
 * yet picked up) it sends:
 *   - reminder_3day  exactly when scheduled_date = today + 3 days
 *   - reminder_day_of when scheduled_date = today, while status is
 *     still 'scheduled' (i.e. the pickup hasn't happened yet today)
 *
 * Both flags are idempotent — they flip true on the row + a *_at
 * timestamp lands, so a retried cron run won't double-send.
 */

const { createClient } = require('@supabase/supabase-js')
const { Resend } = require('resend')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
const resend = new Resend(process.env.RESEND_API_KEY)

const FROM     = 'Signature Pianos <info@signaturepianos.com.au>'
const SITE_URL = process.env.SITE_URL || 'https://signaturepianos.com.au'

module.exports = async (req, res) => {
  // Cron auth — Vercel sends `Bearer ${CRON_SECRET}` automatically.
  const expected = process.env.CRON_SECRET
  const got = req.headers.authorization || ''
  if (!expected || got !== `Bearer ${expected}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const threeDaysFromNow = new Date(today)
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3)

  const todayStr = today.toISOString().slice(0, 10)
  const threeDaysStr = threeDaysFromNow.toISOString().slice(0, 10)

  let sent3Day = 0
  let sentDayOf = 0
  const errors = []

  try {
    const { data: deliveries, error } = await supabase
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
      .eq('driver_accepted', true)
      .in('status', ['scheduled', 'pickup_pending'])
      .not('scheduled_date', 'is', null)
    if (error) throw error

    for (const delivery of (deliveries || [])) {
      if (!delivery.partner?.email) continue
      const piano    = delivery.order?.piano    || {}
      const customer = delivery.order?.customer || {}
      const partner  = delivery.partner
      const schedDate = delivery.scheduled_date

      const pickupUrl = `${SITE_URL}/delivery/${delivery.pickup_link_token}`

      // 3-day reminder
      if (schedDate === threeDaysStr && !delivery.reminder_3day_sent) {
        try {
          await resend.emails.send({
            from: FROM,
            to: partner.email,
            subject: `Reminder: Piano pickup in 3 days — ${fmtDateLong(schedDate)}`,
            html: buildReminderEmail({
              driver_name: partner.name, type: '3day',
              scheduled_date: schedDate, piano, customer, pickupUrl,
            }),
          })
          await supabase
            .from('deliveries')
            .update({ reminder_3day_sent: true, reminder_3day_sent_at: new Date().toISOString() })
            .eq('id', delivery.id)
          sent3Day++
        } catch (mailErr) {
          console.error('[cron] 3day reminder failed', delivery.id, mailErr)
          errors.push({ id: delivery.id, kind: '3day', err: String(mailErr) })
        }
      }

      // Day-of reminder — only if status is still 'scheduled'
      if (schedDate === todayStr && !delivery.reminder_day_of_sent && delivery.status === 'scheduled') {
        try {
          await resend.emails.send({
            from: FROM,
            to: partner.email,
            subject: `Reminder: Piano pickup TODAY — ${fmtDateLong(schedDate)}`,
            html: buildReminderEmail({
              driver_name: partner.name, type: 'day_of',
              scheduled_date: schedDate, piano, customer, pickupUrl,
            }),
          })
          await supabase
            .from('deliveries')
            .update({ reminder_day_of_sent: true, reminder_day_of_sent_at: new Date().toISOString() })
            .eq('id', delivery.id)
          sentDayOf++
        } catch (mailErr) {
          console.error('[cron] day-of reminder failed', delivery.id, mailErr)
          errors.push({ id: delivery.id, kind: 'day_of', err: String(mailErr) })
        }
      }
    }

    console.log(`[cron-delivery-reminders] sent3Day=${sent3Day} sentDayOf=${sentDayOf} errors=${errors.length}`)
    return res.status(200).json({ success: true, sent3Day, sentDayOf, errors })
  } catch (err) {
    console.error('[cron-delivery-reminders] handler failed', err)
    return res.status(500).json({ error: err.message || 'Cron failed' })
  }
}

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

function buildReminderEmail({ driver_name, type, scheduled_date, piano, customer, pickupUrl }) {
  const is3Day = type === '3day'
  const pianoLabel = `${piano?.brand || 'Yamaha'} ${piano?.model || ''} ${piano?.year || ''}`.trim()
  const deliverTo = [
    customer?.address_line1, customer?.suburb, customer?.state, customer?.postcode,
  ].filter(Boolean).map(esc).join(', ')

  return `<!DOCTYPE html>
<html>
<body style="font-family:Arial,Helvetica,sans-serif;background:#f8f7f5;margin:0;padding:40px 20px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e8e4dd;">
    <div style="background:${is3Day ? '#1a1917' : '#b8935a'};padding:24px 32px;">
      <div style="font-size:18px;color:${is3Day ? '#b8935a' : '#000'};font-style:italic;">Signature Pianos</div>
      <div style="font-size:13px;color:${is3Day ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.6)'};margin-top:4px;">
        ${is3Day ? 'Pickup reminder — 3 days' : '⚡ Pickup reminder — TODAY'}
      </div>
    </div>
    <div style="padding:32px;">
      <h2 style="color:#1a1917;margin:0 0 8px;">Hi ${esc(driver_name || '')},</h2>
      <p style="color:#6b6760;font-size:14px;line-height:1.7;margin:0 0 20px;">
        ${is3Day
          ? 'This is a reminder that you have a piano pickup in 3 days.'
          : 'This is your day-of reminder. Your piano pickup is scheduled for today.'}
      </p>

      <div style="background:${is3Day ? '#f8f7f5' : '#fff3cd'};border-radius:4px;padding:16px;margin-bottom:20px;text-align:center;border:1px solid ${is3Day ? '#e8e4dd' : '#ffc107'};">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#9a9590;margin-bottom:6px;">${is3Day ? 'Scheduled pickup date' : 'TODAY'}</div>
        <div style="font-size:18px;font-weight:500;color:#1a1917;">${esc(fmtDateLong(scheduled_date))}</div>
      </div>

      <table style="width:100%;font-size:13px;border-collapse:collapse;margin-bottom:20px;">
        <tr><td style="padding:8px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;width:45%;">Piano</td><td style="padding:8px 0;font-weight:500;border-bottom:1px solid #e8e4dd;">${esc(pianoLabel)}</td></tr>
        <tr><td style="padding:8px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;">Serial</td><td style="padding:8px 0;border-bottom:1px solid #e8e4dd;font-family:monospace;">${esc(piano?.serial_number || '—')}</td></tr>
        <tr><td style="padding:8px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;">Collect from</td><td style="padding:8px 0;border-bottom:1px solid #e8e4dd;">63 Blackburn Road<br>Mount Waverley VIC 3149</td></tr>
        <tr><td style="padding:8px 0;color:#9a9590;">Deliver to</td><td style="padding:8px 0;">
          ${esc((customer?.first_name || '') + ' ' + (customer?.last_name || ''))}<br>
          ${deliverTo || '—'}<br>
          ${customer?.phone ? `<a href="tel:${esc(customer.phone)}" style="color:#b8935a;">${esc(customer.phone)}</a>` : ''}
        </td></tr>
      </table>

      <div style="background:#f0f9f4;border:1px solid #9fe1cb;border-radius:4px;padding:20px;text-align:center;margin-bottom:16px;">
        <div style="font-size:14px;font-weight:500;color:#085041;margin-bottom:8px;">
          ${is3Day ? 'Your pickup photo link' : 'Upload pickup photos now'}
        </div>
        <p style="font-size:13px;color:#085041;margin:0 0 16px;line-height:1.5;">
          ${is3Day
            ? 'Use this link when you collect the piano. Photograph it before moving.'
            : 'When you collect the piano today, use this link to upload your pickup photos.'}
        </p>
        <a href="${esc(pickupUrl)}" style="display:inline-block;background:#b8935a;color:#000;padding:12px 28px;border-radius:4px;text-decoration:none;font-size:13px;font-weight:500;">
          Upload pickup photos →
        </a>
      </div>

      <p style="font-size:12px;color:#9a9590;line-height:1.6;">Questions? Contact Eric at Signature Pianos.</p>
    </div>
    <div style="background:#f8f7f5;padding:20px;text-align:center;font-size:12px;color:#9a9590;border-top:1px solid #e8e4dd;">
      Signature Pianos Melbourne · signaturepianos.com.au
    </div>
  </div>
</body>
</html>`
}
