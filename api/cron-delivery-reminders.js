/*
 * Signature Pianos — daily delivery reminder cron
 * -----------------------------------------------
 * Hit by Vercel Cron once a day. Schedule is configured in vercel.json:
 *   "0 22 * * *"  (22:00 UTC = 08:00 AEST in standard time / 09:00 AEDT
 *                  in daylight saving — close enough for a morning ping)
 *
 * Vercel auto-attaches `Authorization: Bearer ${CRON_SECRET}` when the
 * env var is set, so we reject anything else with 401 to keep this
 * endpoint unhittable from the public internet. CRON_SECRET must be set
 * in Vercel: without it every run (Vercel's included) is refused.
 *
 * "Today" is the Melbourne calendar day (lib/dates.js). The cron fires at
 * 22:00 UTC, which is already the next morning in Melbourne, so UTC dates
 * put every reminder a day off.
 *
 * Per accepted delivery (driver_accepted=true, scheduled_date set, not
 * yet picked up, order not voided) it sends:
 *   - reminder_3day  (carries the pickup-photo link) once scheduled_date
 *     is within the next 3 days — not only exactly 3 days out, so a
 *     driver who accepts late still gets the link. api/driver-accept.js
 *     may already have sent it and set the flag.
 *   - reminder_day_of when scheduled_date = today, while status is
 *     still 'scheduled' (i.e. the pickup hasn't happened yet today)
 *
 * Every flag flips only after its email was accepted by Resend, so a
 * failed send is retried by the next run instead of being counted as
 * sent. The response lists sent / failed counts per kind.
 */

const crypto = require('crypto')
const { createClient } = require('@supabase/supabase-js')
const { Resend } = require('resend')
const { internalRecipients } = require('../lib/notify')
const { melbourneDate, addDays } = require('../lib/dates')
const { customerTuningReadyEmail, tunerContactEmail, sendEmail, errText } = require('../lib/tuner-emails')
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

/* Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`. Constant-time
 * compare; no secret configured means nobody gets in. */
function cronAuthorized(req) {
  const secret = process.env.CRON_SECRET || ''
  if (!secret) {
    console.error('[cron-delivery-reminders] CRON_SECRET is not set; refusing the run. Set it in Vercel.')
    return false
  }
  const got = Buffer.from(String(req.headers.authorization || ''))
  const want = Buffer.from(`Bearer ${secret}`)
  return got.length === want.length && crypto.timingSafeEqual(got, want)
}

/* Whole days from one 'YYYY-MM-DD' to another (b - a). */
function daysBetween(a, b) {
  const [ay, am, ad] = String(a).slice(0, 10).split('-').map(Number)
  const [by, bm, bd] = String(b).slice(0, 10).split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

module.exports = async (req, res) => {
  if (!cronAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Melbourne calendar days, as 'YYYY-MM-DD'.
  const todayStr     = melbourneDate()
  const tomorrowStr  = addDays(todayStr, 1)
  const threeDaysStr = addDays(todayStr, 3)

  // Per-kind tallies for the response and the log line.
  const sent = {}
  const failed = {}
  const errors = []
  const bump = (tally, kind) => { tally[kind] = (tally[kind] || 0) + 1 }
  const fail = (kind, id, err) => {
    bump(failed, kind)
    errors.push({ id, kind, err: errText(err) })
    console.error(`[cron] ${kind} failed`, id, err)
  }
  // Send one email; tally it. Returns true when Resend accepted it.
  const send = async (kind, id, message) => {
    const err = await sendEmail(resend, { from: FROM, ...message })
    if (err) { fail(kind, id, err); return false }
    bump(sent, kind)
    return true
  }
  // Record a sent-flag. The email already went: a failed update is logged
  // (the next run may repeat that email) rather than hidden.
  const setFlag = async (table, id, fields, kind) => {
    const { error } = await supabase.from(table).update(fields).eq('id', id)
    if (error) fail(`${kind}_flag`, id, error)
    return !error
  }

  try {
    // ─────────────────────────────────────────────────────────────────
    // DELIVERY PICKUP REMINDERS (each section has its own try/catch, so
    // one failing query doesn't stop the rest of the run)
    // ─────────────────────────────────────────────────────────────────
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
        .lte('scheduled_date', threeDaysStr)
        .gte('scheduled_date', todayStr)
      if (error) throw error

      for (const delivery of (deliveries || [])) {
        if (!delivery.partner?.email) continue
        if (delivery.order?.voided) continue   // voided sale: no pickup
        const piano    = delivery.order?.piano    || {}
        const customer = delivery.order?.customer || {}
        const partner  = delivery.partner
        const schedDate = String(delivery.scheduled_date).slice(0, 10)

        const pickupUrl = `${SITE_URL}/delivery/${delivery.pickup_link_token}`

        const dayOfDue = schedDate === todayStr && !delivery.reminder_day_of_sent && delivery.status === 'scheduled'
        // On the day itself the day-of reminder carries the same link.
        const dayOfCovers = schedDate === todayStr && (dayOfDue || delivery.reminder_day_of_sent)

        // Pickup-link reminder: any day from 3 days out to the day itself,
        // until it has gone once (not only exactly 3 days out).
        if (schedDate >= todayStr && schedDate <= threeDaysStr && !delivery.reminder_3day_sent && !dayOfCovers) {
          const daysOut = daysBetween(todayStr, schedDate)
          const ok = await send('pickup3Day', delivery.id, {
            to: partner.email,
            subject: `Reminder: piano pickup ${whenPhrase(daysOut)} — ${fmtDateLong(schedDate)}`,
            html: buildReminderEmail({
              driver_name: partner.name, type: '3day', days_until: daysOut,
              scheduled_date: schedDate, piano, customer, pickupUrl,
            }),
          })
          if (ok) {
            await setFlag('deliveries', delivery.id,
              { reminder_3day_sent: true, reminder_3day_sent_at: new Date().toISOString() }, 'pickup3Day')
          }
        }

        // Day-of reminder — only if status is still 'scheduled'
        if (dayOfDue) {
          const ok = await send('pickupDayOf', delivery.id, {
            to: partner.email,
            subject: `Reminder: piano pickup today — ${fmtDateLong(schedDate)}`,
            html: buildReminderEmail({
              driver_name: partner.name, type: 'day_of',
              scheduled_date: schedDate, piano, customer, pickupUrl,
            }),
          })
          if (ok) {
            await setFlag('deliveries', delivery.id,
              { reminder_day_of_sent: true, reminder_day_of_sent_at: new Date().toISOString() }, 'pickupDayOf')
          }
        }
      }
    } catch (delOuterErr) {
      fail('delivery_section', null, delOuterErr)
    }

    // ─────────────────────────────────────────────────────────────────
    // TUNER BOOKINGS — day-25 contact send
    // (Session 12 rebuild: cron pushes customer heads-up + tuner action
    // email once trigger_date is reached, replacing the old
    // accept/propose flow.)
    // ─────────────────────────────────────────────────────────────────
    let settings = {}
    try {
      const { data: s } = await supabase.from('company_settings').select('*').limit(1).maybeSingle()
      if (s) settings = s
    } catch (sErr) {
      console.warn('[cron-delivery-reminders] settings load fell back', sErr)
    }

    // Every booking whose trigger_date has been reached and whose contact
    // emails haven't gone — not only trigger_date = today, so a booking
    // skipped on its day (no tuner assigned yet, a failed send) goes on a
    // later run. Bookings whose date is already agreed (confirmed via the
    // tuner's Accept link or the log-date page), finished or cancelled are
    // left alone.
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
        .lte('trigger_date', todayStr)
        .not('contact_sent', 'is', true)
        .not('completed', 'is', true)
        .not('status', 'in', '(confirmed,completed,cancelled)')
      if (tbErr) throw tbErr

      for (const booking of (tunerBookingsToSend || [])) {
        if (booking.order?.voided) continue
        const customer = booking.order?.customer || {}
        const piano    = booking.order?.piano    || {}
        const pianoLabel = `${piano.brand || 'Yamaha'} ${piano.model || ''} ${piano.year || ''}`.trim()

        // No tuner assigned yet → ping Eric to assign one. Don't flip
        // contact_sent so the next run picks it up again once a tuner
        // is in place (Eric is reminded each day until then).
        if (!booking.tuner) {
          await send('noTunerAlert', booking.id, {
            to: internalRecipients(),
            subject: `Action required: assign a tuner — ${customer.first_name || ''} ${customer.last_name || ''} · ${pianoLabel}`.trim(),
            html: noTunerAssignedEmail({ customer, piano, pianoLabel }),
          })
          continue
        }
        if (!booking.tuner.email || !booking.log_date_token) {
          fail('tunerContact', booking.id, { message: !booking.tuner.email ? 'Tuner has no email address' : 'No log_date_token' })
          continue
        }

        const logDateUrl = `${SITE_URL}/tuner/log-date/${booking.log_date_token}`

        // Tuner action email first: if it fails, nothing is flagged and
        // the customer isn't told a tuner will call; the next run retries.
        const tunerOk = await send('tunerContact', booking.id, {
          to: booking.tuner.email,
          subject: `New tuning job — ${customer.first_name || ''} ${customer.last_name || ''} · ${pianoLabel}`.trim(),
          html: tunerContactEmail({ tuner: booking.tuner, customer, piano, logDateUrl }),
        })
        if (!tunerOk) continue

        // Customer heads-up (a failure is logged; the tuner has the job).
        if (customer.email) {
          await send('tunerContactCustomer', booking.id, {
            to: customer.email,
            subject: 'Your piano is ready for its first tuning — Signature Pianos',
            html: customerTuningReadyEmail({ customer, piano, settings }),
          })
        }

        const flagErr = await markContactSent(booking.id, booking.status === 'pending')
        if (flagErr) fail('tunerContact_flag', booking.id, flagErr)
      }
    } catch (tunerOuterErr) {
      fail('tunerContact_section', null, tunerOuterErr)
    }

    // ─────────────────────────────────────────────────────────────────
    // TUNER BOOKINGS — day-before reminders (confirmed_date = tomorrow,
    // Melbourne)
    // ─────────────────────────────────────────────────────────────────
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
        .not('day_before_reminder_sent', 'is', true)
        .not('completed', 'is', true)
        .not('status', 'in', '(completed,cancelled)')
      if (trErr) throw trErr

      for (const booking of (tunerReminders || [])) {
        if (booking.order?.voided) continue
        const customer = booking.order?.customer || {}
        const piano    = booking.order?.piano    || {}
        const completeUrl = `${SITE_URL}/api/tuner-complete?token=${booking.completion_token}`

        // The flag covers both emails: it flips only when every email
        // attempted here went out.
        let attempted = 0
        let delivered = 0
        if (booking.tuner?.email) {
          attempted++
          if (await send('tunerReminder', booking.id, {
            to: booking.tuner.email,
            subject: `Reminder: piano tuning tomorrow — ${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
            html: tunerDayBeforeEmail({
              tuner: booking.tuner, customer, piano,
              confirmedDate: booking.confirmed_date,
              confirmedTime: booking.confirmed_time,
              completeUrl,
            }),
          })) delivered++
        }
        if (customer.email) {
          attempted++
          if (await send('tunerReminderCustomer', booking.id, {
            to: customer.email,
            subject: 'Reminder: your piano tuning is tomorrow — Signature Pianos',
            html: customerDayBeforeEmail({
              customer, piano,
              confirmedDate: booking.confirmed_date,
              confirmedTime: booking.confirmed_time,
              settings,
            }),
          })) delivered++
        }

        if (attempted && delivered === attempted) {
          await setFlag('tuner_bookings', booking.id, {
            day_before_reminder_sent:    true,
            day_before_reminder_sent_at: new Date().toISOString(),
          }, 'tunerReminder')
        }
      }
    } catch (remOuterErr) {
      fail('tunerReminder_section', null, remOuterErr)
    }

    // ─────────────────────────────────────────────────────────────────
    // VIEWING APPOINTMENT REMINDERS — day-before (Session 13)
    // ─────────────────────────────────────────────────────────────────
    try {
      const { data: upcomingViewings, error: vwErr } = await supabase
        .from('viewing_appointments')
        .select('*')
        .eq('appointment_date', tomorrowStr)
        .not('reminder_sent', 'is', true)
        .eq('status', 'confirmed')
      if (vwErr) throw vwErr

      for (const appt of (upcomingViewings || [])) {
        if (!appt.email) continue
        const ok = await send('viewingReminder', appt.id, {
          to: appt.email,
          subject: 'Reminder: your viewing is tomorrow — Signature Pianos',
          html: viewingReminderCronEmail({ appt, settings }),
        })
        if (ok) {
          await setFlag('viewing_appointments', appt.id,
            { reminder_sent: true, reminder_sent_at: new Date().toISOString(), status: 'reminder_sent' }, 'viewingReminder')
        }
      }
    } catch (outerErr) {
      fail('viewingReminder_section', null, outerErr)
    }

    // ─────────────────────────────────────────────────────────────────
    // POST-TUNING FOLLOW-UP + GOOGLE REVIEW REQUEST (Session 13)
    // Fires 14 days after the first tuning is marked completed
    // (tuner_bookings.completed, set by api/tuner-complete.js). Review
    // request only fires when google_review_url is set in settings.
    // ─────────────────────────────────────────────────────────────────
    const fourteenDaysAgoIso = new Date(Date.now() - 14 * 86400000).toISOString()

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
        .lte('completed_at', fourteenDaysAgoIso)
        .not('order_id', 'is', null)
      if (ctErr) throw ctErr

      // One email per order per run, even if the order has two completed
      // tunings. The flags are the order's own columns (embedded above).
      const seenOrders = new Set()
      for (const booking of (completedTunings || [])) {
        const order    = booking.order
        const customer = order?.customer
        const piano    = order?.piano
        if (!order?.id || !customer?.email || order.voided) continue
        if (seenOrders.has(order.id)) continue
        seenOrders.add(order.id)

        if (!order.followup_sent) {
          const ok = await send('followup', order.id, {
            to: customer.email,
            subject: `How is your ${piano?.brand || 'Yamaha'} ${piano?.model || ''} going? — Signature Pianos`.trim(),
            html: postTuningFollowupEmail({ customer, piano, settings }),
          })
          if (ok) {
            await setFlag('orders', order.id,
              { followup_sent: true, followup_sent_at: new Date().toISOString() }, 'followup')
          }
        } else if (!order.review_request_sent && settings?.google_review_url) {
          // Review request — fires on the next cron pass after the followup,
          // so customer doesn't get both in the same inbox at the same time.
          const ok = await send('reviewRequest', order.id, {
            to: customer.email,
            subject: 'Would you mind leaving us a review? — Signature Pianos',
            html: googleReviewRequestEmail({ customer, piano, settings }),
          })
          if (ok) {
            await setFlag('orders', order.id,
              { review_request_sent: true, review_request_sent_at: new Date().toISOString() }, 'reviewRequest')
          }
        }
      }
    } catch (outerErr) {
      fail('followup_section', null, outerErr)
    }

    // ─────────────────────────────────────────────────────────────────
    // PAYMENT INSTALMENT OVERDUE REMINDERS — 3 / 7 / 14 day (Session 13)
    // Only for plans that are in force: status 'active' (set on
    // countersign) with the contract signed, on an order that isn't
    // voided. Pending / unsigned / cancelled / completed / defaulted plans
    // get no overdue notices.
    // ─────────────────────────────────────────────────────────────────
    try {
      const { data: overdueInstalments, error: oiErr } = await supabase
        .from('payment_instalments')
        .select(`
          *,
          plan:payment_plan_id (
            *,
            customer:customer_id ( * ),
            piano:piano_id ( * ),
            order:order_id ( id, voided )
          )
        `)
        .not('paid', 'is', true)
        .lt('due_date', todayStr)
      if (oiErr) throw oiErr

      for (const ins of (overdueInstalments || [])) {
        const plan = ins.plan
        if (!plan?.customer?.email) continue
        if (plan.status !== 'active' || plan.contract_signed !== true) continue
        if (plan.order?.voided) continue
        const customer = plan.customer
        const piano    = plan.piano
        const daysOverdue = daysBetween(ins.due_date, todayStr)
        const stamp = new Date().toISOString()

        if (daysOverdue >= 3 && daysOverdue < 7 && !ins.reminder_3day_sent) {
          const ok = await send('instalment3Day', ins.id, {
            to: customer.email,
            subject: `Payment overdue — Plan ${plan.plan_number || ''} · Signature Pianos`,
            html: instalmentOverdueEmail({ customer, piano, plan, instalment: ins, daysOverdue, settings, urgency: 'gentle' }),
          })
          if (ok) await setFlag('payment_instalments', ins.id, { reminder_3day_sent: true, reminder_3day_sent_at: stamp }, 'instalment3Day')
        } else if (daysOverdue >= 7 && daysOverdue < 14 && !ins.reminder_7day_sent) {
          const ok = await send('instalment7Day', ins.id, {
            to: customer.email,
            subject: `Second reminder — payment overdue ${daysOverdue} days · Plan ${plan.plan_number || ''}`,
            html: instalmentOverdueEmail({ customer, piano, plan, instalment: ins, daysOverdue, settings, urgency: 'firm' }),
          })
          if (ok) await setFlag('payment_instalments', ins.id, { reminder_7day_sent: true, reminder_7day_sent_at: stamp }, 'instalment7Day')
        } else if (daysOverdue >= 14 && !ins.reminder_14day_sent) {
          // Final customer notice. The flag follows this email: if only
          // Eric's alert fails, the customer isn't sent a second notice.
          const ok = await send('instalment14Day', ins.id, {
            to: customer.email,
            subject: `Urgent — payment overdue ${daysOverdue} days · Plan ${plan.plan_number || ''}`,
            html: instalmentOverdueEmail({ customer, piano, plan, instalment: ins, daysOverdue, settings, urgency: 'urgent' }),
          })
          if (!ok) continue
          // + alert Eric
          await send('instalment14DayAlert', ins.id, {
            to: internalRecipients(),
            subject: `Payment plan default risk — ${customer.first_name || ''} ${customer.last_name || ''} · ${daysOverdue} days overdue`,
            html: paymentDefaultRiskEmail({ customer, piano, plan, instalment: ins, daysOverdue }),
          })
          await setFlag('payment_instalments', ins.id, { reminder_14day_sent: true, reminder_14day_sent_at: stamp }, 'instalment14Day')
        }
      }
    } catch (outerErr) {
      fail('instalment_section', null, outerErr)
    }

    const fmt = (t) => Object.entries(t).map(([k, v]) => `${k}=${v}`).join(' ') || 'none'
    console.log(`[cron-delivery-reminders] today=${todayStr} sent: ${fmt(sent)} | failed: ${fmt(failed)}`)
    return res.status(200).json({
      success: true,
      today: todayStr,
      sent,
      failed,
      errors,
    })
  } catch (err) {
    console.error('[cron-delivery-reminders] handler failed', err)
    return res.status(500).json({ error: err.message || 'Cron failed', sent, failed, errors })
  }
}

/* Save contact_sent on a tuner booking (+ status 'contact_sent' when
 * withStatus). The 'contact_sent' enum value comes from
 * tuner_flow_rebuild.sql; if the live enum doesn't have it (22P02 invalid
 * enum input) the flag is still saved without the status, so the booking
 * isn't contacted again tomorrow. Returns the error, or null. */
async function markContactSent(id, withStatus) {
  const stamp = { contact_sent: true, contact_sent_at: new Date().toISOString() }
  let { error } = await supabase.from('tuner_bookings')
    .update(withStatus ? { ...stamp, status: 'contact_sent' } : stamp).eq('id', id)
  if (error && withStatus && error.code === '22P02') {
    console.warn('[cron] status contact_sent not in enum; saving the flag only')
    ;({ error } = await supabase.from('tuner_bookings').update(stamp).eq('id', id))
  }
  return error || null
}

/* "in 3 days" / "in 2 days" / "tomorrow" / "today" for the pickup reminder. */
function whenPhrase(days) {
  if (days <= 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `in ${days} days`
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

/* ---------- Delivery driver: pickup reminder (up to 3 days out / on the day) ----------
 * type '3day' is the reminder that carries the pickup link ahead of the
 * day; days_until (default 3) says how far ahead it actually is, since it
 * also goes to drivers who accept inside the 3-day window. */
function buildReminderEmail({ driver_name, type, days_until = 3, scheduled_date, piano, customer, pickupUrl }) {
  const is3Day = type === '3day'
  const when = whenPhrase(days_until)
  const whenTitle = { 0: 'Pickup today', 1: 'Pickup tomorrow', 2: 'Pickup in two days', 3: 'Pickup in three days' }[days_until] || `Pickup ${when}`
  const pianoLabel = `${piano?.brand || 'Yamaha'} ${piano?.model || ''} ${piano?.year || ''}`.trim()
  const deliverTo = [
    customer?.address_line1, customer?.suburb, customer?.state, customer?.postcode,
  ].filter(Boolean).map(esc).join(', ')

  const body = `
    ${hello(driver_name)}
    ${p(is3Day
      ? `This is a reminder that you have a piano pickup ${when}.`
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
      ? `Piano pickup ${when}: ${fmtDateLong(scheduled_date)}. ${pianoLabel}.`
      : `Piano pickup today: ${pianoLabel}. Upload your pickup photos with the link inside.`,
    label: is3Day ? 'Pickup reminder' : 'Pickup today',
    title: is3Day ? whenTitle : 'Your pickup is today',
    body,
  })
}

/* ---------- Eric: tuning job due but no tuner assigned ---------- */
function noTunerAssignedEmail({ customer, piano, pianoLabel }) {
  const body = `
    ${p('A tuning job is now due but no tuner has been assigned in the admin portal.', { first: true })}
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
