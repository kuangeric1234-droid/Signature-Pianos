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
const { internalRecipients } = require('../lib/notify')
const { C, layout, hello, p, h2, details, note, button, steps, signOff } = require('../lib/email-brand')
const { parts } = require('../lib/tuner-emails')

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
          to: internalRecipients(),
          subject: `Tuner confirmed — ${tuner.name || ''} · ${fmtDateLong(booking.proposed_date)}`.trim(),
          html: internalTunerAcceptedEmail({ tuner, customer, piano, booking }),
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
        to: internalRecipients(),
        subject: `Action needed: tuner proposed a new date — ${tuner.name || ''} · ${fmtDateLong(proposed_date)}`.trim(),
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

/* ---------- templates (brand kit: lib/email-brand.js) ---------- */

/* To the customer, when the tuner accepts the proposed date. `settings`
 * is still accepted; contact details come from the brand kit. */
function customerTuningConfirmedEmail({ customer, piano, confirmedDate, confirmedTime, settings }) {
  const pianoLabel = `${piano.brand || 'Yamaha'} ${piano.model || ''} ${piano.year || ''}`.trim()
  return layout({
    preview: `Your piano tuning is confirmed for ${confirmedDate}${confirmedTime ? ', ' + confirmedTime : ''}.`,
    label: 'Your tuning',
    title: 'Your tuning is confirmed',
    body:
      hello(customer.first_name) +
      p(`A certified tuner has been confirmed for your ${esc(pianoLabel)}.`) +
      parts.appointment('Your appointment', esc(confirmedDate), confirmedTime ? esc(confirmedTime) : '') +
      p('Please make sure someone is home during the time window. The tuning takes approximately 60–90 minutes.') +
      p(`If you need to reschedule, please reply to this email or call ${parts.officePhone()} as soon as possible.`) +
      signOff(),
  })
}

/* To Eric, when the tuner accepts the proposed date. */
function internalTunerAcceptedEmail({ tuner, customer, piano, booking }) {
  return layout({
    internal: true,
    preview: `${tuner.name || 'The tuner'} accepted ${fmtDateLong(booking.proposed_date)}. The customer has been notified.`,
    label: 'For Signature Pianos',
    title: 'Tuner accepted the booking',
    body:
      p('The customer has been notified.', { first: true }) +
      details([
        ['Tuner', `${esc(tuner.name || '—')} (${esc(tuner.email || '—')})`],
        ['Customer', esc((customer.first_name || '') + ' ' + (customer.last_name || ''))],
        ['Piano', esc((piano.brand || 'Yamaha') + ' ' + (piano.model || '') + ' ' + (piano.year || ''))],
        ['Confirmed', `${esc(fmtDateLong(booking.proposed_date))} · ${esc(booking.proposed_time || 'Flexible')}`, true],
      ]),
  })
}

/* To Eric, when the tuner can't do the proposed date and suggests another. Needs action. */
function tunerProposedNewEmail({ tuner, customer, piano, booking, proposed_date, proposed_time, notes, settings }) {
  const pianoLabel = `${piano.brand || 'Yamaha'} ${piano.model || ''} ${piano.year || ''}`.trim()
  const tunerName = tuner.name || 'The tuner'
  return layout({
    internal: true,
    preview: `${tunerName} cannot do the proposed date and has suggested ${fmtDateLong(proposed_date)}. Please confirm with the customer.`,
    label: 'Action needed',
    title: 'Tuner proposed a new date',
    body:
      p(`${esc(tunerName)} cannot do the proposed date and has proposed a new one. Please confirm this with the customer and update the booking in admin.`, { first: true }) +
      details([
        ['Original date', `<span style="text-decoration:line-through;color:${C.inkSoft};">${esc(fmtDateLong(booking.proposed_date))} · ${esc(booking.proposed_time || 'Flexible')}</span>`],
        ["Tuner's proposed date", esc(fmtDateLong(proposed_date)), true],
        ['Proposed time', esc(proposed_time || '—'), true],
        ['Piano', esc(pianoLabel)],
        ['Customer', `${esc((customer.first_name || '') + ' ' + (customer.last_name || ''))}<br>${parts.phoneLink(customer.phone)}`],
        notes ? ['Tuner notes', `<em>${esc(notes).replace(/\r?\n/g, '<br>')}</em>`] : null,
      ]) +
      note('<strong style="font-weight:500;">Action required.</strong> The booking stays pending until you update it.', 'alert') +
      h2('What to do') +
      steps([
        'Call or email the customer to confirm the new date works for them.',
        'Update the tuner booking date in your admin portal.',
        'Send the updated confirmation to both the tuner and the customer.',
      ]) +
      button('https://signaturepianos.com.au/admin/deliveries.html', 'Go to admin portal'),
  })
}

module.exports.templates = { customerTuningConfirmedEmail, internalTunerAcceptedEmail, tunerProposedNewEmail }
