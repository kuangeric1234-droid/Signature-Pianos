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
const { internalRecipients } = require('../lib/notify')
const { generateCalendarLinks } = require('../lib/calendar')
const { layout, hello, p, h2, details, button, signOff } = require('../lib/email-brand')
const { parts } = require('../lib/tuner-emails')

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
        to:   internalRecipients(),
        subject: `Tuning date logged — ${tuner.name || ''} · ${fmtDateLong(agreed_date)}`.trim(),
        html: internalDateLoggedEmail({
          tuner, customer, pianoLabel,
          agreedDate: agreed_date,
          agreedTime: agreed_time,
          notes,
        }),
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

/* ---------- templates (brand kit: lib/email-brand.js) ---------- */

/* To the tuner, once they have logged the agreed date. */
function tunerDateConfirmedEmail({ tuner, customer, piano, pianoLabel, agreedDate, agreedTime, completeUrl, cal }) {
  const address = [customer.address_line1, customer.suburb, customer.state, customer.postcode].filter(Boolean).join(', ')
  const customerName = ((customer.first_name || '') + ' ' + (customer.last_name || '')).trim()
  return layout({
    preview: `Confirmed for ${fmtDateLong(agreedDate)}, ${agreedTime}. ${customerName}, ${pianoLabel}.`,
    label: 'Tuning booked',
    title: 'Booking confirmed',
    body:
      hello(tuner.name) +
      p('Your tuning date has been logged and the customer has been notified.') +
      parts.appointment('Confirmed', esc(fmtDateLong(agreedDate)), esc(agreedTime)) +
      h2('Customer') +
      details([
        ['Customer', esc(customerName) || '—', true],
        ['Phone', parts.phoneLink(customer.phone)],
        ['Address', parts.addressBlock(address)],
        ['Piano', esc(pianoLabel)],
        ['Serial', esc(piano.serial_number || '—')],
      ]) +
      h2('Add to your calendar') +
      parts.calendarLinks(cal, 'tuning.ics', ['Google', 'Outlook', 'Apple']) +
      h2('After the tuning') +
      p('Use this button to mark the job as done. The customer will be notified automatically.') +
      button(completeUrl, 'Mark tuning complete') +
      p(`Questions? Reply to this email or call ${parts.officePhone()}.`, { small: true, muted: true }) +
      signOff(),
  })
}

/* To the customer, once the tuner has logged the agreed date. `settings`
 * is still accepted; contact details come from the brand kit. */
function customerTuningConfirmedEmail({ customer, piano, pianoLabel, agreedDate, agreedTime, settings }) {
  return layout({
    preview: `Your piano tuning is confirmed for ${fmtDateLong(agreedDate)}, ${agreedTime}.`,
    label: 'Your tuning',
    title: 'Your tuning is confirmed',
    body:
      hello(customer.first_name) +
      p(`A certified tuner has been booked for your ${esc(pianoLabel)}.`) +
      parts.appointment('Your appointment', esc(fmtDateLong(agreedDate)), esc(agreedTime)) +
      p('Please make sure someone is home during the time window. Tuning takes approximately 60–90 minutes.') +
      p(`You will receive a reminder the day before your appointment. If you need to reschedule, please reply to this email or call ${parts.officePhone()} as soon as possible.`) +
      signOff(),
  })
}

/* To Eric, once the tuner has logged the agreed date. */
function internalDateLoggedEmail({ tuner, customer, pianoLabel, agreedDate, agreedTime, notes }) {
  return layout({
    internal: true,
    preview: `${tuner.name || 'The tuner'} logged ${fmtDateLong(agreedDate)}, ${agreedTime}.`,
    label: 'For Signature Pianos',
    title: 'Tuner logged the agreed date',
    body:
      p('Both the tuner and the customer have been notified. Day-before reminders will go out automatically.', { first: true }) +
      details([
        ['Tuner', `${esc(tuner.name || '—')} (${esc(tuner.email || '—')})`],
        ['Customer', esc((customer.first_name || '') + ' ' + (customer.last_name || ''))],
        ['Piano', esc(pianoLabel)],
        ['Confirmed', `${esc(fmtDateLong(agreedDate))} · ${esc(agreedTime)}`, true],
        notes ? ['Notes', esc(notes).replace(/\r?\n/g, '<br>')] : null,
      ]),
  })
}

module.exports.templates = { tunerDateConfirmedEmail, customerTuningConfirmedEmail, internalDateLoggedEmail }
