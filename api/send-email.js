/*
 * Signature Pianos — single transactional email endpoint
 * ------------------------------------------------------
 * Deployed as a Vercel Node.js serverless function. The browser POSTs
 * JSON of the form { type, ...payload } and this handler fans out to
 * one customer-facing email and one internal notification per `type`.
 *
 * Required env (configured in the Vercel dashboard):
 *   RESEND_API_KEY  — Resend API key
 *   BUSINESS_EMAIL  — Internal address (e.g. info@signaturepianos.com.au)
 *
 * The forms call this in fire-and-forget mode AFTER the row is safely
 * in Supabase, so any email failure is logged but never blocks the UX.
 */

const { Resend } = require('resend')

const resend = new Resend(process.env.RESEND_API_KEY)
const BUSINESS_EMAIL = process.env.BUSINESS_EMAIL
const FROM = 'Signature Pianos <info@signaturepianos.com.au>'

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { type, ...data } = req.body || {}

  try {
    if (type === 'viewing_booking') {
      // Customer confirmation
      await resend.emails.send({
        from: FROM,
        to: data.email,
        subject: 'Your viewing request — Signature Pianos',
        html: viewingConfirmationEmail(data)
      })
      // Internal notification
      await resend.emails.send({
        from: FROM,
        to: BUSINESS_EMAIL,
        subject: `New viewing request — ${data.first_name} ${data.last_name}`,
        html: viewingInternalEmail(data)
      })
    }

    if (type === 'service_request') {
      await resend.emails.send({
        from: FROM,
        to: data.email,
        subject: 'Your service request — Signature Pianos',
        html: serviceConfirmationEmail(data)
      })
      await resend.emails.send({
        from: FROM,
        to: BUSINESS_EMAIL,
        subject: `New service request — ${data.first_name} ${data.last_name}`,
        html: serviceInternalEmail(data)
      })
    }

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('Email error:', err)
    return res.status(500).json({ error: 'Email failed' })
  }
}

/* ===========================================================================
 * Email helpers + templates
 * ===========================================================================
 * All four emails share a single dark/gold shell so they read as one brand.
 * Cormorant Garamond is pulled via Google Fonts @import; most clients will
 * fall back to a serif system font, which is acceptable.
 * ======================================================================== */

// Tiny HTML escaper so user-supplied strings can't break the markup.
function esc(value) {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Pretty-print enum-ish values back into readable English.
function pretty(value) {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.length ? value.map(esc).join(', ') : '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return esc(String(value).replace(/_/g, ' '))
}

function shell({ preview, body }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Signature Pianos</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=DM+Sans:wght@300;400;500&display=swap');
    body { margin: 0; padding: 0; background: #0e0e0d; }
    /* Outlook-friendly: explicit table layout below */
  </style>
</head>
<body style="margin:0;padding:0;background:#0e0e0d;color:#f5f0e8;font-family:'DM Sans',Helvetica,Arial,sans-serif;font-weight:300;line-height:1.7;">
  <span style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${esc(preview)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0e0e0d;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#1a1a18;border:1px solid rgba(184,147,90,0.3);">
          <tr>
            <td style="padding:36px 40px 24px;border-bottom:1px solid rgba(184,147,90,0.15);text-align:center;">
              <div style="font-family:'Cormorant Garamond',Georgia,serif;font-weight:300;font-size:28px;letter-spacing:0.01em;color:#f5f0e8;">
                Signature <em style="font-style:italic;color:#b8935a;font-weight:400;">Pianos</em>
              </div>
              <div style="font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:0.24em;text-transform:uppercase;color:#9a9590;margin-top:8px;">
                Melbourne
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              ${body}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px;border-top:1px solid rgba(184,147,90,0.15);text-align:center;font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:11px;color:#6b6760;letter-spacing:0.08em;">
              Signature Pianos · Melbourne, VIC · info@signaturepianos.com.au
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function h1(text) {
  return `<h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-weight:300;font-size:32px;line-height:1.15;margin:0 0 18px;color:#f5f0e8;">${text}</h1>`
}

function p(text, opts = {}) {
  const color = opts.muted ? '#9a9590' : '#f5f0e8'
  return `<p style="font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:${color};margin:0 0 16px;">${text}</p>`
}

function detailTable(rows) {
  const tr = rows
    .map(([label, value, highlight]) => `
      <tr>
        <td style="padding:10px 16px 10px 0;border-bottom:1px solid rgba(184,147,90,0.12);font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#9a9590;vertical-align:top;width:40%;">
          ${esc(label)}
        </td>
        <td style="padding:10px 0;border-bottom:1px solid rgba(184,147,90,0.12);font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:14px;color:${highlight ? '#b8935a' : '#f5f0e8'};${highlight ? 'font-weight:500;' : ''}">
          ${value}
        </td>
      </tr>
    `).join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">${tr}</table>`
}

function divider() {
  return '<div style="height:1px;background:rgba(184,147,90,0.2);margin:24px 0;"></div>'
}

function signOff(name) {
  return `
    ${divider()}
    <p style="font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:18px;color:#f5f0e8;margin:0 0 6px;">
      Warmly,
    </p>
    <p style="font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:14px;color:#9a9590;margin:0;">
      ${esc(name || 'Eric')} · Signature Pianos
    </p>
  `
}

function formatTime(value) {
  const map = { morning: 'Morning (9am–12pm)', afternoon: 'Afternoon (12pm–4pm)', late_afternoon: 'Late afternoon (4pm–6pm)' }
  return map[value] || pretty(value)
}

function formatDate(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return esc(value)
  }
}

/* ---------- VIEWING — customer confirmation ---------- */
function viewingConfirmationEmail(data) {
  const body = `
    ${h1(`Hi ${esc(data.first_name)},`)}
    ${p(`Thanks for booking a viewing with Signature Pianos. We've received your request and will be in touch within 24 hours to confirm your appointment.`)}

    <h2 style="font-family:'Cormorant Garamond',Georgia,serif;font-weight:400;font-size:20px;color:#b8935a;margin:32px 0 8px;">Your booking</h2>
    ${detailTable([
      ['Preferred date', formatDate(data.preferred_date)],
      ['Preferred time', formatTime(data.preferred_time)],
      ['Pianos you want to play', pretty(data.pianos_interested)],
    ])}

    <h2 style="font-family:'Cormorant Garamond',Georgia,serif;font-weight:400;font-size:20px;color:#b8935a;margin:32px 0 8px;">What to expect</h2>
    ${p(`When you arrive, the pianos you're interested in will already be tuned, positioned and ready to play. Take as long as you need — there's no script, no pressure, and absolutely no obligation to buy. We're here to answer questions, not to sell to you.`, { muted: true })}

    ${divider()}

    <h2 style="font-family:'Cormorant Garamond',Georgia,serif;font-weight:400;font-size:20px;color:#b8935a;margin:0 0 8px;">Where to find us</h2>
    ${p('<!-- TODO: ADD SHOWROOM ADDRESS -->Showroom address — Melbourne, VIC<br>Monday to Saturday 9am–5pm', { muted: true })}
    ${p('<!-- TODO: ADD PHONE / EMAIL -->Phone coming soon · info@signaturepianos.com.au', { muted: true })}

    ${signOff('Eric Kuang')}
  `
  return shell({
    preview: `Your viewing on ${formatDate(data.preferred_date)} — we'll confirm within 24 hours.`,
    body
  })
}

/* ---------- VIEWING — internal notification ---------- */
function viewingInternalEmail(data) {
  const submittedAt = new Date().toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
  const body = `
    ${h1('New viewing request')}
    ${p(`A new viewing has just been booked through signaturepianos.com.au.`, { muted: true })}

    ${detailTable([
      ['Customer', `${esc(data.first_name)} ${esc(data.last_name)}`],
      ['Email', `<a href="mailto:${esc(data.email)}" style="color:#b8935a;text-decoration:none;">${esc(data.email)}</a>`],
      ['Phone', `<a href="tel:${esc(data.phone)}" style="color:#b8935a;text-decoration:none;">${esc(data.phone)}</a>`],
      ['Preferred date', formatDate(data.preferred_date)],
      ['Preferred time', formatTime(data.preferred_time)],
      ['Pianos of interest', pretty(data.pianos_interested)],
      ['How they heard', pretty(data.how_heard)],
      ['Message', data.message ? esc(data.message) : '—'],
      ['Submitted', esc(submittedAt)],
    ])}

    ${p(`<!-- TODO: ADD ADMIN DASHBOARD LINK --><a href="#" style="color:#b8935a;text-decoration:none;">View in admin dashboard →</a>`, { muted: true })}
  `
  return shell({
    preview: `New viewing — ${data.first_name} ${data.last_name}, ${formatDate(data.preferred_date)}`,
    body
  })
}

/* ---------- SERVICE — customer confirmation ---------- */
function serviceConfirmationEmail(data) {
  const body = `
    ${h1(`Hi ${esc(data.first_name)},`)}
    ${p(`Thanks for sending through your service request. We've received your details and will be in touch within 24 hours to confirm your appointment.`)}

    <h2 style="font-family:'Cormorant Garamond',Georgia,serif;font-weight:400;font-size:20px;color:#b8935a;margin:32px 0 8px;">Your request</h2>
    ${detailTable([
      ['Piano', `${esc(data.piano_brand)}${data.piano_age ? ' · ' + pretty(data.piano_age) : ''}`],
      ['Last tuned', pretty(data.last_tuned)],
      ['Service required', pretty(data.service_required)],
      ['Preferred timeframe', pretty(data.preferred_timeframe)],
      ['Suburb', esc(data.suburb)],
    ])}

    ${p(`We aim to respond to every service request within 24 hours. If you need to reach us sooner, give us a call directly.`, { muted: true })}

    ${divider()}
    ${p('<!-- TODO: ADD PHONE / EMAIL -->Phone coming soon · info@signaturepianos.com.au', { muted: true })}

    ${signOff('Eric Kuang')}
  `
  return shell({
    preview: `Service request received — we'll be in touch within 24 hours.`,
    body
  })
}

/* ---------- SERVICE — internal notification ---------- */
function serviceInternalEmail(data) {
  const submittedAt = new Date().toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
  const isSig = data.is_signature_piano === true
  const body = `
    ${h1('New service request')}
    ${p(`A new tuning / service request has just been submitted.`, { muted: true })}

    ${detailTable([
      ['Customer', `${esc(data.first_name)} ${esc(data.last_name)}`],
      ['Email', `<a href="mailto:${esc(data.email)}" style="color:#b8935a;text-decoration:none;">${esc(data.email)}</a>`],
      ['Phone', `<a href="tel:${esc(data.phone)}" style="color:#b8935a;text-decoration:none;">${esc(data.phone)}</a>`],
      ['Suburb', esc(data.suburb)],
      ['Piano brand', esc(data.piano_brand)],
      ['Piano age', pretty(data.piano_age)],
      ['Last tuned', pretty(data.last_tuned)],
      ['Service required', pretty(data.service_required)],
      ['Preferred timeframe', pretty(data.preferred_timeframe)],
      ['Signature Pianos customer', isSig ? '★ YES — check service history' : 'No', isSig],
      ['Message', data.message ? esc(data.message) : '—'],
      ['Submitted', esc(submittedAt)],
    ])}

    ${p(`<!-- TODO: ADD ADMIN DASHBOARD LINK --><a href="#" style="color:#b8935a;text-decoration:none;">View in admin dashboard →</a>`, { muted: true })}
  `
  return shell({
    preview: `New service request — ${data.first_name} ${data.last_name}${isSig ? ' (existing customer)' : ''}`,
    body
  })
}
