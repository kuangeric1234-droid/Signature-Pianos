/*
 * Signature Pianos — Tuner completion handler
 * -------------------------------------------
 * GET  /api/tuner-complete?token=...  → renders a tiny mobile-friendly
 *                                       form so the tuner can leave
 *                                       optional notes before marking
 *                                       the booking complete.
 * POST /api/tuner-complete            → consumes the form submission,
 *                                       sets the booking to 'completed'
 *                                       (status + completed=true +
 *                                       completed_at, which the cron's
 *                                       follow-up / review emails and the
 *                                       day-before reminder filter on),
 *                                       emails the customer + Eric, and
 *                                       returns a thank-you page.
 *
 * Both answer "Already marked complete" once the job is done; the POST's
 * update is conditional on completed still being false, so a double-tap
 * can't send the emails twice. A cancelled booking can't be completed.
 *
 * Env required: RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * (Eric's copy goes to lib/notify.js internalRecipients()).
 */

const { createClient } = require('@supabase/supabase-js')
const { Resend } = require('resend')
const { internalRecipients } = require('../lib/notify')
const { C, layout, hello, p, details, note, label, button, signOff } = require('../lib/email-brand')
const { parts, sendEmail } = require('../lib/tuner-emails')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = 'Signature Pianos <info@signaturepianos.com.au>'

module.exports = async (req, res) => {
  try {
    // await, so a failure inside lands in the catch below.
    if (req.method === 'GET') {
      return await handleGet(req, res)
    }
    if (req.method === 'POST') {
      return await handlePost(req, res)
    }
    return res.status(405).send('<h2>Method not allowed.</h2>')
  } catch (err) {
    console.error('[tuner-complete] handler error', err)
    return res.status(500).send(htmlMessage(
      'Something went wrong',
      'We could not process this request. Please try again, or email info@signaturepianos.com.au.'
    ))
  }
}

/* The booking for a completion token (exact match), or null. */
async function findByToken(token) {
  if (typeof token !== 'string' || token.length < 16) return null
  const { data: booking, error } = await supabase
    .from('tuner_bookings')
    .select(`
      *,
      tuner:tuner_id(*),
      order:order_id(*, customer:customer_id(*), piano:piano_id(*))
    `)
    .eq('completion_token', token)
    .maybeSingle()
  if (error) throw error
  return booking && booking.completion_token === token ? booking : null
}

function isComplete(booking) {
  return booking.completed === true || booking.status === 'completed'
}

/* Page for a booking that is already done (or cancelled), or null. */
function closedPage(booking) {
  if (isComplete(booking)) {
    return htmlMessage(
      'Already marked complete',
      `This tuning was already marked complete${booking.completed_at ? ' on ' + formatDate(booking.completed_at) : ''}. No further action needed.`
    )
  }
  if (booking.status === 'cancelled') {
    return htmlMessage(
      'Booking cancelled',
      'This tuning booking was cancelled. If you did complete a tuning, please email info@signaturepianos.com.au.'
    )
  }
  return null
}

/* ---------- GET: render the completion form ---------- */
async function handleGet(req, res) {
  res.setHeader('content-type', 'text/html; charset=utf-8')
  const token = (req.query && req.query.token) || ''
  if (!token) {
    return res.status(400).send(htmlMessage('Missing token', 'This link is missing its token. Please use the link from your tuning booking email.'))
  }

  const booking = await findByToken(token)
  if (!booking) {
    return res.status(404).send(htmlMessage(
      'Booking not found',
      'This completion link may have already been used. If you think this is a mistake, please email info@signaturepianos.com.au.'
    ))
  }

  const closed = closedPage(booking)
  if (closed) return res.send(closed)

  const customer = booking.order && booking.order.customer
  const piano = booking.order && booking.order.piano
  return res.send(completionFormPage({ customer, piano, token }))
}

/* ---------- POST: persist completion + send emails ---------- */
async function handlePost(req, res) {
  res.setHeader('content-type', 'text/html; charset=utf-8')
  // Vercel auto-parses application/x-www-form-urlencoded into req.body.
  const body = req.body || {}
  const token = body.token
  const notes = (body.notes || '').toString().slice(0, 2000)

  if (!token) {
    return res.status(400).send(htmlMessage('Missing token', 'This form submission was missing its token.'))
  }

  const booking = await findByToken(token)
  if (!booking) {
    return res.status(404).send(htmlMessage(
      'Booking not found',
      'This completion link is no longer valid.'
    ))
  }

  // Done already (e.g. a double-tap): same page as the GET, no emails.
  const closed = closedPage(booking)
  if (closed) return res.send(closed)

  // Keep earlier notes (tuner's scheduling notes etc.) and add these.
  const mergedNotes = notes
    ? (booking.completion_notes ? booking.completion_notes + '\n\nCompletion notes: ' + notes : notes)
    : (booking.completion_notes || null)

  const now = new Date().toISOString()
  const { data: updated, error: updErr } = await supabase
    .from('tuner_bookings')
    .update({
      status: 'completed',
      completed: true,
      completed_at: now,
      completion_notes: mergedNotes,
      updated_at: now,
    })
    .eq('id', booking.id)
    .eq('completion_token', token)
    .not('completed', 'is', true)
    .not('status', 'in', '(completed,cancelled)')
    .select('id')
  if (updErr) {
    console.error('[tuner-complete] update failed', updErr)
    return res.status(500).send(htmlMessage(
      'Something went wrong',
      'We could not save this update. Please try again.'
    ))
  }
  if (!updated || !updated.length) {
    // Another request completed it between our read and this update.
    return res.send(htmlMessage('Already marked complete', 'This tuning was already marked complete. No further action needed.'))
  }

  const tuner = booking.tuner || {}
  const customer = booking.order && booking.order.customer
  const piano = booking.order && booking.order.piano

  // Customer notification
  if (customer && customer.email) {
    const mailErr = await sendEmail(resend, {
      from: FROM,
      to: customer.email,
      subject: 'Your piano has been tuned — Signature Pianos',
      html: customerCompletionEmail({ customer, piano, tuner, notes }),
    })
    if (mailErr) console.error('[tuner-complete] customer email failed', booking.id, mailErr)
  }

  // Internal notification — always (internalRecipients() has defaults).
  const internalErr = await sendEmail(resend, {
    from: FROM,
    to: internalRecipients(),
    subject: `Tuning complete — ${customer ? customer.first_name + ' ' + customer.last_name : '—'}`,
    html: internalTuningCompleteEmail({ tuner, customer, piano, notes }),
  })
  if (internalErr) console.error('[tuner-complete] internal email failed', booking.id, internalErr)

  return res.send(completionDonePage({ tuner }))
}

/* ---------- helpers ---------- */

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

/* "Kawai K-300 2011" — brand from the piano row, not assumed Yamaha. */
function pianoText(piano, withYear) {
  return `${piano.brand || 'Yamaha'} ${piano.model || ''} ${withYear ? (piano.year || '') : ''}`.replace(/\s+/g, ' ').trim()
}

function escapeHtml(s) {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/* ---------- pages the tuner sees (brand shell in lib/tuner-emails.js) ---------- */

/* Plain message page for error and already-done states. */
function htmlMessage(title, body) {
  return parts.tunerPage({
    title,
    label: 'Tuning',
    body: `<p>${escapeHtml(body)}</p>`,
  })
}

/* GET: the mark-complete form, with optional notes. */
function completionFormPage({ customer, piano, token }) {
  return parts.tunerPage({
    title: 'Mark tuning complete',
    label: 'Tuning',
    body: `
    <p>Customer: <strong>${escapeHtml(customer ? customer.first_name + ' ' + customer.last_name : '—')}</strong><br>
    Piano: <strong>${escapeHtml(piano ? pianoText(piano, true) : '—')}</strong></p>
    <form method="POST">
      <input type="hidden" name="token" value="${escapeHtml(token)}">
      <label for="notes">Notes (optional)</label>
      <textarea id="notes" name="notes" rows="4" placeholder="Any notes about the tuning — pitch raise needed, action/regulation notes, anything for our records."></textarea>
      <button type="submit">Mark as complete</button>
    </form>`,
  })
}

/* POST: the thank-you page once the booking is marked complete. */
function completionDonePage({ tuner }) {
  return parts.tunerPage({
    title: 'Tuning marked complete',
    label: 'Tuning',
    body: `<p>Thank you${tuner && tuner.name ? ' ' + escapeHtml(tuner.name) : ''}. The customer has been notified.</p>`,
  })
}

/* ---------- email templates (brand kit: lib/email-brand.js) ---------- */

/* To the customer, once the tuner marks the job complete. */
function customerCompletionEmail({ customer, piano, tuner, notes }) {
  const pianoLabel = piano ? pianoText(piano, false) : 'piano'
  return layout({
    preview: `Your ${pianoLabel} has been tuned by ${tuner.name || 'one of our certified tuners'}.`,
    label: 'Your tuning',
    title: 'Your piano has been tuned',
    body:
      hello(customer.first_name) +
      p(`Your ${escapeHtml(pianoLabel)} has been professionally tuned by ${escapeHtml(tuner.name || 'one of our certified tuners')}. Enjoy playing it.`) +
      (notes
        ? note(label('Notes from your tuner') + `<div style="margin-top:8px;color:${C.ink};">${escapeHtml(notes).replace(/\r?\n/g, '<br>')}</div>`)
        : '') +
      p(`Remember, your piano comes with a 10-year warranty. If you ever need another tuning or have any questions about your piano, reply to this email or call us on ${parts.officePhone()}. We are here to help.`) +
      button('https://signaturepianos.com.au/services/tuning-servicing.html', 'Book another tuning') +
      signOff(),
  })
}

/* To Eric, once the tuner marks the job complete. */
function internalTuningCompleteEmail({ tuner, customer, piano, notes }) {
  return layout({
    internal: true,
    preview: `${tuner.name || 'The tuner'} has marked the tuning complete for ${customer ? customer.first_name + ' ' + customer.last_name : 'a customer'}.`,
    label: 'For Signature Pianos',
    title: 'Tuning complete',
    body:
      p(`Tuning marked complete by ${escapeHtml(tuner.name || 'tuner')}.`, { first: true }) +
      details([
        ['Tuner', escapeHtml(tuner.name || '—')],
        ['Customer', escapeHtml(customer ? customer.first_name + ' ' + customer.last_name : '—'), true],
        ['Piano', escapeHtml(piano ? pianoText(piano, true) : '—')],
        notes ? ['Notes', escapeHtml(notes).replace(/\r?\n/g, '<br>')] : null,
      ]),
  })
}

module.exports.templates = { customerCompletionEmail, internalTuningCompleteEmail }
module.exports.pages = { completionFormPage, completionDonePage, htmlMessage }
