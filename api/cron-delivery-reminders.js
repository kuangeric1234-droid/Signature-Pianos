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
const { customerTuningReadyEmail, tunerContactEmail } = require('../lib/tuner-emails')

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

    // ─────────────────────────────────────────────────────────────────
    // TUNER BOOKINGS — day-25 contact send
    // (Session 12 rebuild: cron pushes customer heads-up + tuner action
    // email when trigger_date hits today, replacing the old
    // accept/propose flow.)
    // ─────────────────────────────────────────────────────────────────
    let sentTunerContact = 0
    let sentTunerReminder = 0

    let settings = {}
    try {
      const { data: s } = await supabase.from('company_settings').select('*').limit(1).maybeSingle()
      if (s) settings = s
    } catch (sErr) {
      console.warn('[cron-delivery-reminders] settings load fell back', sErr)
    }

    try {
      const { data: tunerBookingsToSend, error: tbErr } = await supabase
        .from('tuner_bookings')
        .select(`
          *,
          order:order_id (
            *,
            customer:customer_id ( * ),
            piano:piano_id ( * )
          ),
          tuner:tuner_id ( * )
        `)
        .eq('trigger_date', todayStr)
        .eq('contact_sent', false)
        .eq('completed', false)
      if (tbErr) throw tbErr

      for (const booking of (tunerBookingsToSend || [])) {
        const customer = booking.order?.customer || {}
        const piano    = booking.order?.piano    || {}
        const pianoLabel = `${piano.brand || 'Yamaha'} ${piano.model || ''} ${piano.year || ''}`.trim()

        // No tuner assigned yet → ping Eric to assign one. Don't flip
        // contact_sent so tomorrow's cron picks it up again once a tuner
        // is in place.
        if (!booking.tuner) {
          try {
            await resend.emails.send({
              from: FROM,
              to: process.env.BUSINESS_EMAIL || FROM,
              subject: `Action required: Assign tuner — ${customer.first_name || ''} ${customer.last_name || ''} · ${pianoLabel}`.trim(),
              html: noTunerAssignedEmail({ customer, piano, pianoLabel }),
            })
          } catch (mailErr) {
            console.error('[cron] no-tuner alert failed', booking.id, mailErr)
            errors.push({ id: booking.id, kind: 'no_tuner', err: String(mailErr) })
          }
          continue
        }

        const logDateUrl = `${SITE_URL}/tuner/log-date/${booking.log_date_token}`

        try {
          // Customer heads-up
          if (customer.email) {
            await resend.emails.send({
              from: FROM,
              to: customer.email,
              subject: 'Your piano is ready for its first tuning — Signature Pianos',
              html: customerTuningReadyEmail({ customer, piano, settings }),
            })
          }
          // Tuner action email
          await resend.emails.send({
            from: FROM,
            to: booking.tuner.email,
            subject: `New tuning job — ${customer.first_name || ''} ${customer.last_name || ''} · ${pianoLabel}`.trim(),
            html: tunerContactEmail({ tuner: booking.tuner, customer, piano, logDateUrl }),
          })

          await supabase
            .from('tuner_bookings')
            .update({
              contact_sent:    true,
              contact_sent_at: new Date().toISOString(),
              status:          'contact_sent',
            })
            .eq('id', booking.id)

          sentTunerContact++
        } catch (mailErr) {
          console.error('[cron] tuner contact failed', booking.id, mailErr)
          errors.push({ id: booking.id, kind: 'tuner_contact', err: String(mailErr) })
        }
      }
    } catch (tunerOuterErr) {
      console.error('[cron] tuner-contact section failed', tunerOuterErr)
    }

    // ─────────────────────────────────────────────────────────────────
    // TUNER BOOKINGS — day-before reminders
    // ─────────────────────────────────────────────────────────────────
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toISOString().slice(0, 10)

    try {
      const { data: tunerReminders, error: trErr } = await supabase
        .from('tuner_bookings')
        .select(`
          *,
          order:order_id (
            *,
            customer:customer_id ( * ),
            piano:piano_id ( * )
          ),
          tuner:tuner_id ( * )
        `)
        .eq('confirmed_date', tomorrowStr)
        .eq('day_before_reminder_sent', false)
        .eq('completed', false)
      if (trErr) throw trErr

      for (const booking of (tunerReminders || [])) {
        const customer = booking.order?.customer || {}
        const piano    = booking.order?.piano    || {}
        const completeUrl = `${SITE_URL}/api/tuner-complete?token=${booking.completion_token}`

        try {
          if (booking.tuner?.email) {
            await resend.emails.send({
              from: FROM,
              to: booking.tuner.email,
              subject: `Reminder: Piano tuning tomorrow — ${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
              html: tunerDayBeforeEmail({
                tuner: booking.tuner, customer, piano,
                confirmedDate: booking.confirmed_date,
                confirmedTime: booking.confirmed_time,
                completeUrl,
              }),
            })
          }
          if (customer.email) {
            await resend.emails.send({
              from: FROM,
              to: customer.email,
              subject: 'Reminder: Your piano tuning is tomorrow — Signature Pianos',
              html: customerDayBeforeEmail({
                customer, piano,
                confirmedDate: booking.confirmed_date,
                confirmedTime: booking.confirmed_time,
                settings,
              }),
            })
          }

          await supabase
            .from('tuner_bookings')
            .update({
              day_before_reminder_sent:    true,
              day_before_reminder_sent_at: new Date().toISOString(),
            })
            .eq('id', booking.id)

          sentTunerReminder++
        } catch (mailErr) {
          console.error('[cron] tuner reminder failed', booking.id, mailErr)
          errors.push({ id: booking.id, kind: 'tuner_reminder', err: String(mailErr) })
        }
      }
    } catch (remOuterErr) {
      console.error('[cron] tuner-reminder section failed', remOuterErr)
    }

    console.log(`[cron-delivery-reminders] sent3Day=${sent3Day} sentDayOf=${sentDayOf} tunerContact=${sentTunerContact} tunerReminder=${sentTunerReminder} errors=${errors.length}`)
    return res.status(200).json({ success: true, sent3Day, sentDayOf, sentTunerContact, sentTunerReminder, errors })
  } catch (err) {
    console.error('[cron-delivery-reminders] handler failed', err)
    return res.status(500).json({ error: err.message || 'Cron failed' })
  }
}

/* ============================================================================
 * Tuner-flow templates used only by this cron handler.
 * Customer heads-up + tuner contact email live in lib/tuner-emails.js
 * since /api/tuner-send-contact.js also fires them.
 * ======================================================================== */

function noTunerAssignedEmail({ customer, piano, pianoLabel }) {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;">
      <h2 style="color:#c0392b;">Action required — No tuner assigned</h2>
      <p>A tuning job is due today but no tuner has been assigned in the admin portal.</p>
      <p><strong>Customer:</strong> ${esc((customer.first_name || '') + ' ' + (customer.last_name || ''))} (${esc(customer.email || '—')} · ${esc(customer.phone || '—')})</p>
      <p><strong>Piano:</strong> ${esc(pianoLabel)}</p>
      <p><strong>Action:</strong> Go to admin/deliveries.html, find this delivery, assign a tuner, then send the contact email manually.</p>
      <a href="https://signaturepianos.com.au/admin/deliveries.html"
         style="display:inline-block;background:#b8935a;color:#000;padding:10px 20px;border-radius:4px;text-decoration:none;font-size:13px;">
        Go to admin portal →
      </a>
    </div>
  `
}

function tunerDayBeforeEmail({ tuner, customer, piano, confirmedDate, confirmedTime, completeUrl }) {
  const pianoLabel = `${piano?.brand || 'Yamaha'} ${piano?.model || ''} ${piano?.year || ''}`.trim()
  const fullAddress = [customer?.address_line1, customer?.suburb, customer?.state, customer?.postcode].filter(Boolean).map(esc).join(', ')
  return `<!DOCTYPE html>
<html>
<body style="font-family:Arial,Helvetica,sans-serif;background:#f8f7f5;margin:0;padding:40px 20px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e8e4dd;">
    <div style="background:#b8935a;padding:24px 32px;">
      <div style="font-size:18px;color:#000;font-style:italic;">Signature Pianos</div>
      <div style="font-size:12px;color:rgba(0,0,0,0.6);margin-top:4px;">⚡ Tuning reminder — tomorrow</div>
    </div>
    <div style="padding:32px;">
      <h2 style="color:#1a1917;margin:0 0 8px;">Hi ${esc(tuner?.name || '')} — tuning tomorrow</h2>
      <p style="color:#6b6760;font-size:14px;line-height:1.7;margin:0 0 20px;">This is your reminder for tomorrow's tuning job.</p>

      <div style="background:#fff3cd;border-radius:4px;padding:16px;margin-bottom:20px;border:1px solid #ffc107;text-align:center;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#856404;margin-bottom:6px;">Tomorrow</div>
        <div style="font-size:18px;font-weight:500;color:#1a1917;">${esc(fmtDateLong(confirmedDate))}</div>
        <div style="font-size:14px;color:#6b6760;margin-top:4px;">${esc(confirmedTime || 'Flexible')}</div>
      </div>

      <table style="width:100%;font-size:13px;border-collapse:collapse;margin-bottom:20px;">
        <tr><td style="padding:8px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;width:35%;">Customer</td><td style="padding:8px 0;font-weight:500;border-bottom:1px solid #e8e4dd;">${esc((customer?.first_name || '') + ' ' + (customer?.last_name || ''))}</td></tr>
        <tr><td style="padding:8px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;">Phone</td><td style="padding:8px 0;border-bottom:1px solid #e8e4dd;"><a href="tel:${esc(customer?.phone || '')}" style="color:#b8935a;">${esc(customer?.phone || '—')}</a></td></tr>
        <tr><td style="padding:8px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;">Address</td><td style="padding:8px 0;border-bottom:1px solid #e8e4dd;">${fullAddress}</td></tr>
        <tr><td style="padding:8px 0;color:#9a9590;">Piano</td><td style="padding:8px 0;">${esc(pianoLabel)}</td></tr>
      </table>

      <div style="background:#f0f9f4;border:1px solid #9fe1cb;border-radius:4px;padding:16px;text-align:center;">
        <div style="font-size:13px;font-weight:500;color:#085041;margin-bottom:8px;">After you complete the tuning</div>
        <p style="font-size:12px;color:#085041;margin:0 0 12px;">Use this link to mark the job as done. The customer will be notified automatically.</p>
        <a href="${esc(completeUrl)}" style="display:inline-block;background:#085041;color:#fff;padding:10px 24px;border-radius:4px;text-decoration:none;font-size:13px;font-weight:500;">
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

function customerDayBeforeEmail({ customer, piano, confirmedDate, confirmedTime, settings }) {
  const pianoLabel = `${piano?.brand || 'Yamaha'} ${piano?.model || ''} ${piano?.year || ''}`.trim()
  return `<!DOCTYPE html>
<html>
<body style="font-family:Arial,Helvetica,sans-serif;background:#f8f7f5;margin:0;padding:40px 20px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e8e4dd;">
    <div style="background:#1a1917;padding:32px;text-align:center;">
      <div style="font-size:20px;color:#b8935a;font-style:italic;">${esc(settings?.business_name || 'Signature Pianos')}</div>
    </div>
    <div style="padding:32px;">
      <h2 style="color:#1a1917;margin:0 0 16px;">Your piano tuning is tomorrow, ${esc(customer?.first_name || 'friend')}.</h2>
      <p style="color:#6b6760;font-size:14px;line-height:1.7;">Just a friendly reminder that your piano tuning is scheduled for tomorrow.</p>
      <div style="background:#f0f9f4;border:1px solid #9fe1cb;border-radius:4px;padding:16px;margin:20px 0;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#085041;margin-bottom:6px;">Your appointment</div>
        <div style="font-size:18px;font-weight:500;color:#085041;">${esc(fmtDateLong(confirmedDate))}</div>
        <div style="font-size:14px;color:#085041;margin-top:4px;">${esc(confirmedTime || 'Your tuner will confirm the time')}</div>
      </div>
      <p style="color:#6b6760;font-size:13px;line-height:1.7;">Please ensure someone is home during the time window. Tuning takes approximately 60–90 minutes.</p>
      <p style="color:#6b6760;font-size:13px;line-height:1.7;">If you need to reschedule please reply to this email or contact us as soon as possible.</p>
    </div>
    <div style="background:#f8f7f5;padding:20px;text-align:center;font-size:12px;color:#9a9590;border-top:1px solid #e8e4dd;">
      ${esc(settings?.business_name || 'Signature Pianos')} Melbourne · ${esc(settings?.website || 'signaturepianos.com.au')}
      ${settings?.phone ? ' · ' + esc(settings.phone) : ''}
    </div>
  </div>
</body>
</html>`
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
