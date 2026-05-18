/*
 * Signature Pianos — tuner test email
 * -----------------------------------
 * POST /api/send-tuner-test  body: { test_email }
 *
 * Fires a realistic tuner-booking email — same shape as the live
 * api/tuner-booking.js template — to the supplied address, with a
 * "TEST EMAIL" banner across the top so it can't be mistaken for a
 * live booking. Triggered by the "Send test emails" button in
 * admin/deliveries.html.
 */

const { Resend } = require('resend')

const resend   = new Resend(process.env.RESEND_API_KEY)
const SITE_URL = process.env.SITE_URL || 'https://signaturepianos.com.au'
const FROM     = 'Signature Pianos <info@signaturepianos.com.au>'

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { test_email } = req.body || {}
  if (!test_email) {
    return res.status(400).json({ error: 'Missing test_email' })
  }

  const tuner = {
    name: 'Eric Kuang (Test)',
    email: test_email,
    phone: '+61400000000',
  }
  const customer = {
    first_name: 'Jane',
    last_name:  'Smith',
    email:      'jane.smith@example.com',
    phone:      '+61411222333',
    address_line1: '456 Piano Street',
    address_line2: null,
    suburb:        'South Yarra',
    state:         'VIC',
    postcode:      '3141',
  }
  const piano = {
    model: 'U3A',
    year: 1983,
    serial_number: '3843471',
    condition: 'B+',
  }
  const booking = {
    proposed_date: '2026-06-25',
    proposed_time: 'Morning (9am–12pm)',
  }
  const confirmUrl  = `${SITE_URL}/api/tuner-confirm?token=TEST_TOKEN_EXAMPLE`
  const completeUrl = `${SITE_URL}/api/tuner-complete?token=TEST_TOKEN_EXAMPLE`

  try {
    await resend.emails.send({
      from: FROM,
      to: test_email,
      subject: `[TEST] Tuner booking — Jane Smith · Yamaha U3A 1983`,
      html: buildTunerTestEmail({ tuner, customer, piano, booking, confirmUrl, completeUrl }),
    })
    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('[send-tuner-test] failed', err)
    return res.status(500).json({ error: err.message || 'Test email failed' })
  }
}

function escapeHtml(s) {
  if (s == null) return ''
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function formatDate(d) {
  if (!d) return 'TBC'
  try {
    return new Date(d).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return d
  }
}

function buildTunerTestEmail({ tuner, customer, piano, booking, confirmUrl, completeUrl }) {
  const fullAddress = [
    customer.address_line1, customer.suburb, customer.state, customer.postcode,
  ].filter(Boolean).map(escapeHtml).join(', ')

  return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; background: #f8f7f5; margin: 0; padding: 40px 20px; }
    .card { background: #fff; max-width: 560px; margin: 0 auto; border-radius: 8px; overflow: hidden; border: 1px solid #e8e4dd; }
    .header { background: #1a1917; padding: 32px; text-align: center; }
    .logo { font-size: 20px; color: #b8935a; font-style: italic; }
    .test-banner { background: #633806; color: #FAC775; padding: 8px 32px; font-size: 12px; text-align: center; font-weight: 500; }
    .body { padding: 32px; }
    h2 { font-size: 20px; color: #1a1917; margin: 0 0 8px; }
    p { color: #6b6760; font-size: 14px; line-height: 1.7; margin: 0 0 16px; }
    .section-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #9a9590; margin-bottom: 10px; margin-top: 20px; display: block; }
    .detail-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 4px; }
    .detail-table td { padding: 8px 0; border-bottom: 1px solid #e8e4dd; }
    .detail-table td:first-child { color: #9a9590; width: 40%; }
    .detail-table td:last-child { font-weight: 500; color: #1a1917; }
    .detail-table tr:last-child td { border-bottom: none; }
    .btn { display: inline-block; padding: 12px 24px; border-radius: 4px; text-decoration: none; font-size: 13px; font-weight: 500; margin: 6px 6px 6px 0; }
    .btn-gold { background: #b8935a; color: #000; }
    .btn-outline { border: 1px solid #b8935a; color: #b8935a; }
    .highlight { background: #f0f9f4; border-left: 3px solid #1a7f4b; padding: 12px 16px; border-radius: 0 4px 4px 0; margin: 16px 0; }
    .footer { background: #f8f7f5; padding: 20px; text-align: center; font-size: 12px; color: #9a9590; border-top: 1px solid #e8e4dd; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header"><div class="logo">Signature Pianos</div></div>
    <div class="test-banner">⚠ TEST EMAIL — This is what your tuners will receive</div>
    <div class="body">
      <h2>Hi ${escapeHtml(tuner.name)},</h2>
      <p>You have a new piano tuning booking request from Signature Pianos.</p>

      <span class="section-label">Customer details</span>
      <table class="detail-table">
        <tr><td>Name</td><td>${escapeHtml(customer.first_name)} ${escapeHtml(customer.last_name)}</td></tr>
        <tr><td>Email</td><td><a href="mailto:${escapeHtml(customer.email)}" style="color:#b8935a;">${escapeHtml(customer.email)}</a></td></tr>
        <tr><td>Phone</td><td><a href="tel:${escapeHtml(customer.phone)}" style="color:#b8935a;">${escapeHtml(customer.phone)}</a></td></tr>
        <tr><td>Address</td><td>${fullAddress}</td></tr>
      </table>

      <span class="section-label">Piano details</span>
      <table class="detail-table">
        <tr><td>Piano</td><td>Yamaha ${escapeHtml(piano.model)} ${escapeHtml(piano.year)}</td></tr>
        <tr><td>Serial number</td><td style="font-family:monospace;">${escapeHtml(piano.serial_number)}</td></tr>
        <tr><td>Condition</td><td>${escapeHtml(piano.condition)}</td></tr>
      </table>

      <span class="section-label">Booking details</span>
      <table class="detail-table">
        <tr><td>Proposed date</td><td style="color:#b8935a;font-weight:500;">${formatDate(booking.proposed_date)}</td></tr>
        <tr><td>Time window</td><td>${escapeHtml(booking.proposed_time)}</td></tr>
      </table>

      <div class="highlight">
        <div style="font-size:13px;color:#085041;font-weight:500;margin-bottom:4px;">Please confirm or suggest an alternative time</div>
        <div style="font-size:12px;color:#085041;">Contact the customer directly if you need to arrange a different time before confirming.</div>
      </div>

      <a href="${confirmUrl}" class="btn btn-gold">Confirm this booking</a>
      <a href="mailto:${escapeHtml(customer.email)}" class="btn btn-outline">Email customer</a>
      <a href="tel:${escapeHtml(customer.phone)}" class="btn btn-outline">Call customer</a>

      <p style="margin-top:20px;font-size:12px;color:#9a9590;">
        Once tuning is complete use this link to mark it done and notify the customer:<br>
        <a href="${completeUrl}" style="color:#b8935a;word-break:break-all;">${completeUrl}</a>
      </p>
    </div>
    <div class="footer">Signature Pianos Melbourne · signaturepianos.com.au</div>
  </div>
</body>
</html>`
}
