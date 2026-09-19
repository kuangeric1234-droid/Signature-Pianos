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
const { internalRecipients } = require('../lib/notify')
const { customerTuningReadyEmail, tunerContactEmail } = require('../lib/tuner-emails')
const {
  BUSINESS, C, layout, hello, p, h2, details, note, button, signOff, visitBlock, money,
} = require('../lib/email-brand')

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
            subject: `Reminder: piano pickup in 3 days — ${fmtDateLong(schedDate)}`,
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
            subject: `Reminder: piano pickup today — ${fmtDateLong(schedDate)}`,
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
              to: internalRecipients(),
              subject: `Action required: assign a tuner — ${customer.first_name || ''} ${customer.last_name || ''} · ${pianoLabel}`.trim(),
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
              subject: `Reminder: piano tuning tomorrow — ${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
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
              subject: 'Reminder: your piano tuning is tomorrow — Signature Pianos',
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

    // ─────────────────────────────────────────────────────────────────
    // VIEWING APPOINTMENT REMINDERS — day-before (Session 13)
    // ─────────────────────────────────────────────────────────────────
    let sentViewingReminders = 0
    try {
      const { data: upcomingViewings, error: vwErr } = await supabase
        .from('viewing_appointments')
        .select('*')
        .eq('appointment_date', tomorrowStr)
        .eq('reminder_sent', false)
        .eq('status', 'confirmed')
      if (vwErr) throw vwErr

      for (const appt of (upcomingViewings || [])) {
        try {
          await resend.emails.send({
            from: FROM,
            to: appt.email,
            subject: 'Reminder: your viewing is tomorrow — Signature Pianos',
            html: viewingReminderCronEmail({ appt, settings }),
          })
          await supabase
            .from('viewing_appointments')
            .update({ reminder_sent: true, reminder_sent_at: new Date().toISOString(), status: 'reminder_sent' })
            .eq('id', appt.id)
          sentViewingReminders++
        } catch (mailErr) {
          console.error('[cron] viewing reminder failed', appt.id, mailErr)
          errors.push({ id: appt.id, kind: 'viewing_reminder', err: String(mailErr) })
        }
      }
    } catch (outerErr) {
      console.error('[cron] viewing-reminder section failed', outerErr)
    }

    // ─────────────────────────────────────────────────────────────────
    // POST-TUNING FOLLOW-UP + GOOGLE REVIEW REQUEST (Session 13)
    // Fires 14 days after the first tuning is marked completed. Review
    // request only fires when google_review_url is set in settings.
    // ─────────────────────────────────────────────────────────────────
    let sentFollowups = 0
    let sentReviewRequests = 0
    const fourteenDaysAgo = new Date(today)
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)

    try {
      const { data: completedTunings, error: ctErr } = await supabase
        .from('tuner_bookings')
        .select(`
          *,
          order:order_id (
            *,
            customer:customer_id ( * ),
            piano:piano_id ( * )
          )
        `)
        .eq('completed', true)
        .lte('completed_at', fourteenDaysAgo.toISOString())
        .not('order_id', 'is', null)
      if (ctErr) throw ctErr

      for (const booking of (completedTunings || [])) {
        const order    = booking.order
        const customer = order?.customer
        const piano    = order?.piano
        if (!order?.id || !customer?.email) continue

        // Read order's followup_sent + review_request_sent flags
        const { data: flags } = await supabase
          .from('orders')
          .select('followup_sent, review_request_sent')
          .eq('id', order.id)
          .maybeSingle()

        if (flags && !flags.followup_sent) {
          try {
            await resend.emails.send({
              from: FROM,
              to: customer.email,
              subject: `How is your ${piano?.brand || 'Yamaha'} ${piano?.model || ''} going? — Signature Pianos`.trim(),
              html: postTuningFollowupEmail({ customer, piano, settings }),
            })
            await supabase.from('orders')
              .update({ followup_sent: true, followup_sent_at: new Date().toISOString() })
              .eq('id', order.id)
            sentFollowups++
          } catch (mailErr) {
            console.error('[cron] followup failed', order.id, mailErr)
            errors.push({ id: order.id, kind: 'followup', err: String(mailErr) })
          }
        } else if (flags?.followup_sent && !flags.review_request_sent && settings?.google_review_url) {
          // Review request — fires on the next cron pass after the followup,
          // so customer doesn't get both in the same inbox at the same time.
          try {
            await resend.emails.send({
              from: FROM,
              to: customer.email,
              subject: 'Would you mind leaving us a review? — Signature Pianos',
              html: googleReviewRequestEmail({ customer, piano, settings }),
            })
            await supabase.from('orders')
              .update({ review_request_sent: true, review_request_sent_at: new Date().toISOString() })
              .eq('id', order.id)
            sentReviewRequests++
          } catch (mailErr) {
            console.error('[cron] review request failed', order.id, mailErr)
            errors.push({ id: order.id, kind: 'review_request', err: String(mailErr) })
          }
        }
      }
    } catch (outerErr) {
      console.error('[cron] followup/review section failed', outerErr)
    }

    // ─────────────────────────────────────────────────────────────────
    // PAYMENT INSTALMENT OVERDUE REMINDERS — 3 / 7 / 14 day (Session 13)
    // ─────────────────────────────────────────────────────────────────
    let sent3DayInst = 0
    let sent7DayInst = 0
    let sent14DayAlerts = 0

    try {
      const { data: overdueInstalments, error: oiErr } = await supabase
        .from('payment_instalments')
        .select(`
          *,
          plan:payment_plan_id (
            *,
            customer:customer_id ( * ),
            piano:piano_id ( * )
          )
        `)
        .eq('paid', false)
        .lt('due_date', todayStr)
      if (oiErr) throw oiErr

      for (const ins of (overdueInstalments || [])) {
        const plan = ins.plan
        if (!plan?.customer?.email) continue
        const customer = plan.customer
        const piano    = plan.piano
        const dueDate = new Date(ins.due_date + 'T00:00:00')
        const daysOverdue = Math.floor((today - dueDate) / 86400000)

        try {
          if (daysOverdue >= 3 && daysOverdue < 7 && !ins.reminder_3day_sent) {
            await resend.emails.send({
              from: FROM,
              to: customer.email,
              subject: `Payment overdue — Plan ${plan.plan_number || ''} · Signature Pianos`,
              html: instalmentOverdueEmail({ customer, piano, plan, instalment: ins, daysOverdue, settings, urgency: 'gentle' }),
            })
            await supabase.from('payment_instalments').update({ reminder_3day_sent: true, reminder_3day_sent_at: new Date().toISOString() }).eq('id', ins.id)
            sent3DayInst++
          } else if (daysOverdue >= 7 && daysOverdue < 14 && !ins.reminder_7day_sent) {
            await resend.emails.send({
              from: FROM,
              to: customer.email,
              subject: `Second reminder — payment overdue ${daysOverdue} days · Plan ${plan.plan_number || ''}`,
              html: instalmentOverdueEmail({ customer, piano, plan, instalment: ins, daysOverdue, settings, urgency: 'firm' }),
            })
            await supabase.from('payment_instalments').update({ reminder_7day_sent: true, reminder_7day_sent_at: new Date().toISOString() }).eq('id', ins.id)
            sent7DayInst++
          } else if (daysOverdue >= 14 && !ins.reminder_14day_sent) {
            // Final customer notice
            await resend.emails.send({
              from: FROM,
              to: customer.email,
              subject: `Urgent — payment overdue ${daysOverdue} days · Plan ${plan.plan_number || ''}`,
              html: instalmentOverdueEmail({ customer, piano, plan, instalment: ins, daysOverdue, settings, urgency: 'urgent' }),
            })
            // + alert Eric
            await resend.emails.send({
              from: FROM,
              to: internalRecipients(),
              subject: `Payment plan default risk — ${customer.first_name || ''} ${customer.last_name || ''} · ${daysOverdue} days overdue`,
              html: paymentDefaultRiskEmail({ customer, piano, plan, instalment: ins, daysOverdue }),
            })
            await supabase.from('payment_instalments').update({ reminder_14day_sent: true, reminder_14day_sent_at: new Date().toISOString() }).eq('id', ins.id)
            sent14DayAlerts++
          }
        } catch (mailErr) {
          console.error('[cron] instalment reminder failed', ins.id, mailErr)
          errors.push({ id: ins.id, kind: 'instalment_reminder', err: String(mailErr) })
        }
      }
    } catch (outerErr) {
      console.error('[cron] instalment-overdue section failed', outerErr)
    }

    console.log(`[cron-delivery-reminders] sent3Day=${sent3Day} sentDayOf=${sentDayOf} tunerContact=${sentTunerContact} tunerReminder=${sentTunerReminder} viewingReminders=${sentViewingReminders} followups=${sentFollowups} reviewRequests=${sentReviewRequests} inst3=${sent3DayInst} inst7=${sent7DayInst} inst14=${sent14DayAlerts} errors=${errors.length}`)
    return res.status(200).json({
      success: true, sent3Day, sentDayOf, sentTunerContact, sentTunerReminder,
      sentViewingReminders, sentFollowups, sentReviewRequests,
      sent3DayInst, sent7DayInst, sent14DayAlerts,
      errors,
    })
  } catch (err) {
    console.error('[cron-delivery-reminders] handler failed', err)
    return res.status(500).json({ error: err.message || 'Cron failed' })
  }
}

/* ============================================================================
 * Email templates used only by this cron handler, built from the brand kit
 * in lib/email-brand.js. The customer heads-up + tuner contact email live in
 * lib/tuner-emails.js since /api/tuner-send-contact.js also fires them.
 * ======================================================================== */

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

/* "Sarah Nguyen" from a customer row (raw text: escape before use). */
function fullName(c) {
  return `${c?.first_name || ''} ${c?.last_name || ''}`.trim()
}

/* A tappable phone number. */
function telLink(phone) {
  if (!phone) return '—'
  return `<a href="tel:${esc(phone)}" style="color:${C.ink};">${esc(phone)}</a>`
}

function mailLink(email) {
  if (!email) return '—'
  return `<a href="mailto:${esc(email)}" style="color:${C.ink};">${esc(email)}</a>`
}

const OUR_PHONE = `<a href="tel:${BUSINESS.phoneHref}" style="color:${C.ink};">${BUSINESS.phone}</a>`

/* ---------- Delivery driver: pickup reminder (3 days out / on the day) ---------- */
function buildReminderEmail({ driver_name, type, scheduled_date, piano, customer, pickupUrl }) {
  const is3Day = type === '3day'
  const pianoLabel = `${piano?.brand || 'Yamaha'} ${piano?.model || ''} ${piano?.year || ''}`.trim()
  const deliverTo = [
    customer?.address_line1, customer?.suburb, customer?.state, customer?.postcode,
  ].filter(Boolean).map(esc).join(', ')

  const body = `
    ${hello(driver_name)}
    ${p(is3Day
      ? 'This is a reminder that you have a piano pickup in 3 days.'
      : 'This is your day-of reminder. Your piano pickup is scheduled for today.')}
    ${details([
      [is3Day ? 'Pickup date' : 'Today', esc(fmtDateLong(scheduled_date)), true],
      ['Piano', esc(pianoLabel), true],
      ['Serial', esc(piano?.serial_number || '—')],
      ['Collect from', `${BUSINESS.address1}<br>${BUSINESS.address2}`],
      ['Deliver to', [
        esc(fullName(customer)),
        deliverTo || '—',
        customer?.phone ? telLink(customer.phone) : '',
      ].filter(Boolean).join('<br>')],
    ])}
    ${h2(is3Day ? 'Your pickup photo link' : 'Upload pickup photos now')}
    ${p(is3Day
      ? 'Use this link when you collect the piano. Photograph it before you move it.'
      : 'When you collect the piano today, use this link to upload your pickup photos.')}
    ${button(pickupUrl, 'Upload pickup photos')}
    ${p(`Questions? Contact Eric at Signature Pianos on ${OUR_PHONE}.`, { muted: true, small: true })}
  `
  return layout({
    preview: is3Day
      ? `Piano pickup in 3 days: ${fmtDateLong(scheduled_date)}. ${pianoLabel}.`
      : `Piano pickup today: ${pianoLabel}. Upload your pickup photos with the link inside.`,
    label: is3Day ? 'Pickup reminder' : 'Pickup today',
    title: is3Day ? 'Pickup in three days' : 'Your pickup is today',
    body,
  })
}

/* ---------- Eric: tuning job due but no tuner assigned ---------- */
function noTunerAssignedEmail({ customer, piano, pianoLabel }) {
  const body = `
    ${p('A tuning job is due today but no tuner has been assigned in the admin portal.', { first: true })}
    ${details([
      ['Customer', `${esc(fullName(customer)) || '—'}<br>${mailLink(customer?.email)}<br>${telLink(customer?.phone)}`, true],
      ['Piano', esc(pianoLabel)],
    ])}
    ${note('<strong>Action:</strong> go to admin/deliveries.html, find this delivery, assign a tuner, then send the contact email manually.', 'alert')}
    ${button('https://signaturepianos.com.au/admin/deliveries.html', 'Go to admin portal')}
  `
  return layout({
    preview: `No tuner assigned: ${fullName(customer)} · ${pianoLabel}`,
    label: 'For Signature Pianos',
    title: 'Assign a tuner',
    body,
    internal: true,
  })
}

/* ---------- Tuner: job reminder the day before ---------- */
function tunerDayBeforeEmail({ tuner, customer, piano, confirmedDate, confirmedTime, completeUrl }) {
  const pianoLabel = `${piano?.brand || 'Yamaha'} ${piano?.model || ''} ${piano?.year || ''}`.trim()
  const fullAddress = [customer?.address_line1, customer?.suburb, customer?.state, customer?.postcode].filter(Boolean).map(esc).join(', ')
  const body = `
    ${hello(tuner?.name)}
    ${p('This is your reminder for tomorrow’s tuning job.')}
    ${details([
      ['Tomorrow', esc(fmtDateLong(confirmedDate)), true],
      ['Time', esc(confirmedTime || 'Flexible')],
      ['Customer', esc(fullName(customer)), true],
      ['Phone', telLink(customer?.phone)],
      ['Address', fullAddress],
      ['Piano', esc(pianoLabel)],
    ])}
    ${h2('After you complete the tuning')}
    ${p('Use this link to mark the job as done. The customer will be notified automatically.')}
    ${button(completeUrl, 'Mark tuning complete')}
  `
  return layout({
    preview: `Tuning tomorrow: ${fullName(customer)}, ${fmtDateLong(confirmedDate)}${confirmedTime ? ', ' + confirmedTime : ''}.`,
    label: 'Tuning reminder',
    title: 'Tuning tomorrow',
    body,
  })
}

/* ---------- Customer: tuning reminder the day before ---------- */
function customerDayBeforeEmail({ customer, piano, confirmedDate, confirmedTime, settings }) {
  const pianoLabel = `${piano?.brand || 'Yamaha'} ${piano?.model || ''} ${piano?.year || ''}`.trim()
  const body = `
    ${hello(customer?.first_name)}
    ${p(`A reminder that the tuning for your ${esc(pianoLabel)} is booked for tomorrow.`)}
    ${details([
      ['Date', esc(fmtDateLong(confirmedDate)), true],
      ['Time', esc(confirmedTime || 'Your tuner will confirm the time')],
    ])}
    ${p('Please make sure someone is home during the time window. Tuning takes about 60–90 minutes.', { first: true })}
    ${p(`If you need to reschedule, reply to this email or call us on ${OUR_PHONE} as soon as you can.`)}
    ${signOff()}
  `
  return layout({
    preview: `Your piano tuning is tomorrow, ${fmtDateLong(confirmedDate)}.`,
    label: 'Your tuning',
    title: 'Your tuning is tomorrow',
    body,
  })
}

/* ---------- Customer: showroom viewing the day before ---------- */
function viewingReminderCronEmail({ appt, settings }) {
  const body = `
    ${hello(appt.first_name)}
    ${p('We look forward to seeing you tomorrow. Here are your appointment details.')}
    ${details([
      ['Date', esc(fmtDateLong(appt.appointment_date)), true],
      ['Time', esc(appt.appointment_time || '—'), true],
    ])}
    ${visitBlock()}
    ${p('Parking is available on site.', { first: true })}
    ${signOff()}
  `
  return layout({
    preview: `Your viewing is tomorrow, ${fmtDateLong(appt.appointment_date)}${appt.appointment_time ? ' at ' + appt.appointment_time : ''}.`,
    label: 'Your viewing',
    title: 'Your viewing is tomorrow',
    body,
  })
}

/* ---------- Customer: 14 days after the first tuning ---------- */
function postTuningFollowupEmail({ customer, piano, settings }) {
  const pianoLabel = `${piano?.brand || 'Yamaha'} ${piano?.model || ''} ${piano?.year || ''}`.trim()
  const body = `
    ${hello(customer.first_name)}
    ${p(`It has been a couple of weeks since your ${esc(pianoLabel)} was tuned and settled into its new home. We hope you and your family are enjoying it.`)}
    ${p(`If you have any questions about your piano, whether about how often to tune it, care and maintenance, or anything else, reply to this email or call us on ${OUR_PHONE}. We are always happy to help.`)}
    ${note('Your piano is covered by your 10-year warranty. Keep this email for your records.')}
    ${signOff()}
  `
  return layout({
    preview: `A couple of weeks on from its tuning: how is your ${pianoLabel} going?`,
    label: 'Your piano',
    title: 'How is the piano going?',
    body,
  })
}

/* ---------- Customer: Google review request (after the follow-up) ----------
 * Australian Consumer Law: a plain ask sent to every customer. It does not
 * suggest what to write, ask only happy customers, or offer anything back. */
function googleReviewRequestEmail({ customer, piano, settings }) {
  const pianoLabel = `${piano?.brand || 'Yamaha'} ${piano?.model || ''}`.trim()
  const body = `
    ${hello(customer.first_name)}
    ${p(`We hope your ${esc(pianoLabel)} is settling in well. Thank you for choosing Signature Pianos.`)}
    ${p('If you have a minute, would you leave us a Google review of your experience with us? It helps other families find us.')}
    ${button(settings.google_review_url, 'Leave a Google review')}
    ${p('Thank you for being a Signature Pianos customer.', { first: true })}
    ${signOff()}
  `
  return layout({
    preview: 'Would you mind leaving us a Google review? It takes about a minute.',
    label: 'A small favour',
    title: 'Would you leave us a review?',
    body,
  })
}

/* ---------- Customer: payment plan instalment overdue (3 / 7 / 14 days) ---------- */
function instalmentOverdueEmail({ customer, piano, plan, instalment, daysOverdue, settings, urgency }) {
  const fmtCur = (v) => '$' + Math.abs(Number(v || 0)).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const cfg = {
    gentle: { label: 'Your payment plan', title: 'Payment reminder',        intro: `This is a gentle reminder that instalment #${instalment.instalment_number} of your payment plan is now ${daysOverdue} days overdue.`, cta: 'Please arrange payment at your earliest convenience.' },
    firm:   { label: 'Second reminder',   title: 'Payment overdue',         intro: `Your instalment #${instalment.instalment_number} is now ${daysOverdue} days overdue. This is your second reminder.`, cta: 'Please make payment immediately to avoid a late fee.' },
    urgent: { label: 'Final notice',      title: 'Urgent: payment overdue', intro: `Your instalment #${instalment.instalment_number} is now ${daysOverdue} days overdue. This is your final notice before we initiate the default process.`, cta: 'Please contact us immediately to discuss your account.' },
  }[urgency] || {}

  const body = `
    ${hello(customer.first_name)}
    ${p(esc(cfg.intro))}
    ${details([
      ['Plan', esc(plan.plan_number || '—'), true],
      ['Instalment', `#${esc(instalment.instalment_number)}`],
      ['Amount overdue', fmtCur(instalment.amount), true],
      ['Days overdue', `${daysOverdue} days`, true],
    ])}
    ${settings?.bank_bsb ? `
      ${h2('Bank transfer details')}
      ${details([
        ['BSB', esc(settings.bank_bsb)],
        ['Account', esc(settings.bank_account || '')],
        ['Account name', esc(settings.bank_account_name || '')],
        ['Reference', esc(plan.plan_number || '—'), true],
      ])}
    ` : ''}
    ${urgency === 'gentle' ? p(esc(cfg.cta), { first: true }) : note(esc(cfg.cta), 'alert')}
    ${p(`Questions about your account? Reply to this email or call us on ${OUR_PHONE}.`, { muted: true, small: true })}
    ${signOff()}
  `
  return layout({
    preview: `Instalment #${instalment.instalment_number} of plan ${plan.plan_number || ''} is ${daysOverdue} days overdue: ${fmtCur(instalment.amount)}.`,
    label: cfg.label,
    title: cfg.title,
    body,
  })
}

/* ---------- Eric: instalment 14+ days overdue (default risk) ---------- */
function paymentDefaultRiskEmail({ customer, piano, plan, instalment, daysOverdue }) {
  const body = `
    ${p(`An instalment on this payment plan is now ${daysOverdue} days overdue. The customer has been sent their final notice.`, { first: true })}
    ${details([
      ['Customer', `${esc(fullName(customer)) || '—'}<br>${mailLink(customer?.email)}<br>${telLink(customer?.phone)}`, true],
      ['Plan', esc(plan.plan_number || '—'), true],
      ['Piano', esc((piano?.brand || 'Yamaha') + ' ' + (piano?.model || '') + ' ' + (piano?.year || ''))],
      ['Overdue instalment', `#${esc(instalment.instalment_number)}`],
      ['Amount', money(instalment.amount), true],
      ['Due', esc(fmtDateLong(instalment.due_date))],
      ['Days overdue', `${daysOverdue} days`, true],
    ])}
    ${note('<strong>Action required:</strong> contact the customer directly. Consider initiating the default process if there is no response.', 'alert')}
    ${button('https://signaturepianos.com.au/admin/payment-plans.html', 'View in admin')}
  `
  return layout({
    preview: `${fullName(customer)} · plan ${plan.plan_number || ''} · ${daysOverdue} days overdue`,
    label: 'For Signature Pianos',
    title: `Payment plan overdue ${daysOverdue} days`,
    body,
    internal: true,
  })
}

// Template functions, exposed for email previews. The default export above
// (the cron handler) is unchanged.
module.exports.templates = {
  buildReminderEmail,
  noTunerAssignedEmail,
  tunerDayBeforeEmail,
  customerDayBeforeEmail,
  viewingReminderCronEmail,
  postTuningFollowupEmail,
  googleReviewRequestEmail,
  instalmentOverdueEmail,
  paymentDefaultRiskEmail,
}
