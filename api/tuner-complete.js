/*
 * Signature Pianos — Tuner completion handler
 * -------------------------------------------
 * GET  /api/tuner-complete?token=...  → renders a tiny mobile-friendly
 *                                       form so the tuner can leave
 *                                       optional notes before marking
 *                                       the booking complete.
 * POST /api/tuner-complete            → consumes the form submission,
 *                                       sets the booking to 'completed',
 *                                       emails the customer + Eric, and
 *                                       returns a thank-you page.
 *
 * Env required: RESEND_API_KEY, BUSINESS_EMAIL,
 *               SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

const { createClient } = require('@supabase/supabase-js')
const { Resend } = require('resend')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const resend = new Resend(process.env.RESEND_API_KEY)
const BUSINESS_EMAIL = process.env.BUSINESS_EMAIL
const FROM = 'Signature Pianos <info@signaturepianos.com.au>'

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      return handleGet(req, res)
    }
    if (req.method === 'POST') {
      return handlePost(req, res)
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

/* ---------- GET: render the completion form ---------- */
async function handleGet(req, res) {
  const token = (req.query && req.query.token) || ''
  if (!token) {
    return res.status(400).send(htmlMessage('Missing token', 'This link is missing its token. Please use the link from your tuning booking email.'))
  }

  const { data: booking, error } = await supabase
    .from('tuner_bookings')
    .select(`
      *,
      tuner:tuner_id(*),
      order:order_id(*, customer:customer_id(*), piano:piano_id(*))
    `)
    .eq('completion_token', token)
    .single()

  if (error || !booking) {
    return res.status(404).send(htmlMessage(
      'Booking not found',
      'This completion link may have already been used. If you think this is a mistake, please email info@signaturepianos.com.au.'
    ))
  }

  if (booking.status === 'completed') {
    return res.send(htmlMessage(
      'Already marked complete',
      `This tuning was already marked complete${booking.completed_at ? ' on ' + formatDate(booking.completed_at) : ''}. No further action needed.`
    ))
  }

  const customer = booking.order && booking.order.customer
  const piano = booking.order && booking.order.piano
  res.setHeader('content-type', 'text/html; charset=utf-8')
  return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mark tuning complete — Signature Pianos</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: -apple-system, system-ui, 'Segoe UI', Arial, sans-serif; background: #f8f7f5; margin: 0; padding: 40px 20px; color: #1a1917; }
    .card { background: #fff; max-width: 480px; margin: 0 auto; border-radius: 8px; padding: 32px; border: 1px solid #e8e4dd; }
    .logo { text-align: center; font-size: 18px; color: #b8935a; letter-spacing: 0.08em; font-style: italic; margin-bottom: 24px; }
    h2 { color: #1a1917; font-size: 22px; margin: 0 0 8px; }
    p { color: #6b6760; font-size: 14px; line-height: 1.65; margin: 0 0 14px; }
    p strong { color: #1a1917; }
    label { font-size: 12px; color: #9a9590; text-transform: uppercase; letter-spacing: 0.08em; display: block; margin: 18px 0 6px; }
    textarea { width: 100%; padding: 12px; border: 1px solid #e8e4dd; border-radius: 4px; font-size: 14px; font-family: inherit; resize: vertical; min-height: 96px; }
    textarea:focus { outline: none; border-color: #b8935a; box-shadow: 0 0 0 3px rgba(184, 147, 90, 0.15); }
    button { background: #b8935a; color: #000; border: none; padding: 14px 28px; border-radius: 4px; font-size: 14px; font-weight: 500; cursor: pointer; width: 100%; margin-top: 16px; }
    button:hover { background: #a07f4a; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Signature Pianos</div>
    <h2>Mark tuning complete</h2>
    <p>Customer: <strong>${escapeHtml(customer ? customer.first_name + ' ' + customer.last_name : '—')}</strong></p>
    <p>Piano: <strong>Yamaha ${escapeHtml(piano ? (piano.model || '') + ' ' + (piano.year || '') : '—')}</strong></p>
    <form method="POST">
      <input type="hidden" name="token" value="${escapeHtml(token)}">
      <label for="notes">Notes (optional)</label>
      <textarea id="notes" name="notes" rows="4" placeholder="Any notes about the tuning — pitch raise needed, action/regulation notes, anything for our records."></textarea>
      <button type="submit">Mark as complete</button>
    </form>
  </div>
</body>
</html>`)
}

/* ---------- POST: persist completion + send emails ---------- */
async function handlePost(req, res) {
  // Vercel auto-parses application/x-www-form-urlencoded into req.body.
  const body = req.body || {}
  const token = body.token
  const notes = (body.notes || '').toString().slice(0, 2000)

  if (!token) {
    return res.status(400).send(htmlMessage('Missing token', 'This form submission was missing its token.'))
  }

  const { data: booking, error } = await supabase
    .from('tuner_bookings')
    .select(`
      *,
      tuner:tuner_id(*),
      order:order_id(*, customer:customer_id(*), piano:piano_id(*))
    `)
    .eq('completion_token', token)
    .single()

  if (error || !booking) {
    return res.status(404).send(htmlMessage(
      'Booking not found',
      'This completion link is no longer valid.'
    ))
  }

  const { error: updErr } = await supabase
    .from('tuner_bookings')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      completion_notes: notes || booking.completion_notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking.id)
  if (updErr) {
    console.error('[tuner-complete] update failed', updErr)
    return res.status(500).send(htmlMessage(
      'Something went wrong',
      'We could not save this update. Please try again.'
    ))
  }

  const tuner = booking.tuner || {}
  const customer = booking.order && booking.order.customer
  const piano = booking.order && booking.order.piano

  // Customer notification
  if (customer && customer.email) {
    try {
      await resend.emails.send({
        from: FROM,
        to: customer.email,
        subject: 'Your piano has been tuned — Signature Pianos',
        html: customerCompletionEmail({ customer, piano, tuner, notes }),
      })
    } catch (mailErr) {
      console.error('[tuner-complete] customer email failed', mailErr)
    }
  }

  // Internal notification
  if (BUSINESS_EMAIL) {
    try {
      await resend.emails.send({
        from: FROM,
        to: BUSINESS_EMAIL,
        subject: `Tuning complete — ${customer ? customer.first_name + ' ' + customer.last_name : '—'}`,
        html:
          `<p>Tuning marked complete by ${escapeHtml(tuner.name || 'tuner')}.</p>` +
          `<p>Customer: ${escapeHtml(customer ? customer.first_name + ' ' + customer.last_name : '—')}</p>` +
          `<p>Piano: Yamaha ${escapeHtml(piano ? (piano.model || '') + ' ' + (piano.year || '') : '—')}</p>` +
          (notes ? `<p>Notes: ${escapeHtml(notes)}</p>` : ''),
      })
    } catch (mailErr) {
      console.error('[tuner-complete] internal email failed', mailErr)
    }
  }

  res.setHeader('content-type', 'text/html; charset=utf-8')
  return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Complete — Signature Pianos</title>
  <style>
    body { font-family: -apple-system, system-ui, 'Segoe UI', Arial, sans-serif; background: #f8f7f5; padding: 40px 20px; margin: 0; text-align: center; }
    .card { background: #fff; max-width: 420px; margin: 0 auto; border-radius: 8px; padding: 40px 32px; border: 1px solid #e8e4dd; }
    .logo { font-size: 18px; color: #b8935a; letter-spacing: 0.08em; font-style: italic; margin-bottom: 24px; }
    .tick { display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; border-radius: 50%; background: #e8f5ee; color: #1a7f4b; font-size: 36px; margin-bottom: 18px; }
    h2 { color: #1a1917; font-size: 22px; margin: 0 0 8px; }
    p { color: #6b6760; font-size: 14px; line-height: 1.65; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Signature Pianos</div>
    <div class="tick">&#10003;</div>
    <h2>Tuning marked complete.</h2>
    <p>Thank you ${escapeHtml(tuner.name || '')}. The customer has been notified.</p>
  </div>
</body>
</html>`)
}

/* ---------- helpers / templates ---------- */

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

function escapeHtml(s) {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function htmlMessage(title, body) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — Signature Pianos</title>
<style>
  body{font-family:-apple-system,system-ui,Arial,sans-serif;background:#f8f7f5;margin:0;padding:40px 20px;}
  .card{background:#fff;max-width:480px;margin:0 auto;border-radius:8px;padding:36px;border:1px solid #e8e4dd;text-align:center;}
  h2{color:#1a1917;font-size:20px;margin:0 0 12px;}
  p{color:#6b6760;font-size:14px;line-height:1.7;margin:0;}
  .logo{font-size:18px;color:#b8935a;letter-spacing:0.08em;font-style:italic;margin-bottom:20px;}
</style></head><body>
<div class="card">
  <div class="logo">Signature Pianos</div>
  <h2>${escapeHtml(title)}</h2>
  <p>${escapeHtml(body)}</p>
</div>
</body></html>`
}

function customerCompletionEmail({ customer, piano, tuner, notes }) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;">
      <div style="background:#1a1917;padding:32px;text-align:center;">
        <div style="font-size:20px;color:#b8935a;font-style:italic;letter-spacing:0.08em;">Signature Pianos</div>
      </div>
      <div style="padding:32px;">
        <h2 style="color:#1a1917;margin:0 0 12px;">Your piano is perfectly tuned, ${escapeHtml(customer.first_name)}.</h2>
        <p style="color:#6b6760;font-size:14px;line-height:1.7;margin:0 0 18px;">
          Your Yamaha ${escapeHtml(piano ? (piano.model || '') : '')} has been professionally tuned by
          ${escapeHtml(tuner.name || 'one of our certified tuners')}.
          Enjoy playing — it should sound better than ever.
        </p>
        ${notes ? `<p style="color:#6b6760;font-size:13px;font-style:italic;padding:16px;background:#f8f7f5;border-radius:4px;margin:0 0 18px;">Tuner notes: ${escapeHtml(notes)}</p>` : ''}
        <p style="color:#6b6760;font-size:13px;margin:0 0 18px;">
          Remember — your piano comes with a 10-year warranty. If you ever need another tuning
          or have any questions about your instrument, we're always here to help.
        </p>
        <a href="https://signaturepianos.com.au/services/tuning-servicing.html"
           style="display:inline-block;background:#b8935a;color:#000;padding:14px 28px;border-radius:4px;text-decoration:none;font-size:13px;font-weight:500;margin-top:8px;">
          Book another tuning
        </a>
      </div>
      <div style="background:#f8f7f5;padding:20px;text-align:center;font-size:12px;color:#9a9590;">
        Signature Pianos Melbourne · signaturepianos.com.au
      </div>
    </div>
  `
}
