/*
 * Signature Pianos — driver test email
 * ------------------------------------
 * POST /api/send-driver-test  body: { test_email, type }
 *   type = 'pickup' | 'delivery'
 *
 * Fires a realistic driver pickup-or-delivery photo-upload email to the
 * supplied address. The upload link inside the email points at the
 * /delivery/[token] page which is not yet built — the link will 404
 * for now; that page is a follow-up session.
 */

const { Resend } = require('resend')

const resend   = new Resend(process.env.RESEND_API_KEY)
const SITE_URL = process.env.SITE_URL || 'https://signaturepianos.com.au'
const FROM     = 'Signature Pianos <info@signaturepianos.com.au>'

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { test_email, type } = req.body || {}
  if (!test_email) {
    return res.status(400).json({ error: 'Missing test_email' })
  }

  const isPickup = type === 'pickup'

  // Match the real public routing: pickup → /delivery/{token},
  // delivery (dropoff) → /delivery/drop/{token}.
  const tokenUrl = isPickup
    ? `${SITE_URL}/delivery/TEST_PICKUP_TOKEN`
    : `${SITE_URL}/delivery/drop/TEST_DELIVERY_TOKEN`

  const customer = {
    first_name:    'Jane',
    last_name:     'Smith',
    address_line1: '456 Piano Street',
    suburb:        'South Yarra',
    state:         'VIC',
    postcode:      '3141',
    phone:         '+61411222333',
  }
  const piano = {
    model: 'U3A',
    year:  1983,
    serial_number: '3843471',
  }

  try {
    await resend.emails.send({
      from: FROM,
      to: test_email,
      subject: isPickup
        ? `[TEST] Piano pickup — Action required · Yamaha U3A 1983`
        : `[TEST] Piano delivery — Action required · Yamaha U3A 1983`,
      html: buildDriverTestEmail({ isPickup, customer, piano, tokenUrl }),
    })
    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('[send-driver-test] failed', err)
    return res.status(500).json({ error: err.message || 'Test email failed' })
  }
}

function escapeHtml(s) {
  if (s == null) return ''
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function buildDriverTestEmail({ isPickup, customer, piano, tokenUrl }) {
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
    .action-box { background: #f0f9f4; border: 1px solid #9fe1cb; border-radius: 4px; padding: 20px; text-align: center; margin: 24px 0; }
    .btn-gold { display: inline-block; background: #b8935a; color: #000; padding: 14px 32px; border-radius: 4px; text-decoration: none; font-size: 14px; font-weight: 500; }
    .steps { background: #f8f7f5; border-radius: 4px; padding: 16px; margin: 16px 0; }
    .step { display: flex; gap: 12px; margin-bottom: 10px; font-size: 13px; color: #6b6760; }
    .step:last-child { margin-bottom: 0; }
    .step-num { background: #b8935a; color: #000; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 500; flex-shrink: 0; margin-top: 1px; }
    .warning { background: #fdecea; border-left: 3px solid #c0392b; padding: 12px 16px; border-radius: 0 4px 4px 0; font-size: 13px; color: #c0392b; margin: 16px 0; }
    .footer { background: #f8f7f5; padding: 20px; text-align: center; font-size: 12px; color: #9a9590; border-top: 1px solid #e8e4dd; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header"><div class="logo">Signature Pianos</div></div>
    <div class="test-banner">⚠ TEST EMAIL — This is what your driver will receive</div>
    <div class="body">
      <h2>${isPickup ? 'Piano pickup — photos required' : 'Piano delivery — photos required'}</h2>
      <p>
        ${isPickup
          ? 'You are picking up a piano for Signature Pianos. Before moving the piano please photograph it thoroughly using the link below.'
          : `You are delivering a piano for Signature Pianos. After placing the piano in the customer's home please photograph it using the link below.`}
      </p>

      <span class="section-label">Job details</span>
      <table class="detail-table">
        <tr><td>Piano</td><td>Yamaha ${escapeHtml(piano.model)} ${escapeHtml(piano.year)}</td></tr>
        <tr><td>Serial number</td><td style="font-family:monospace;">${escapeHtml(piano.serial_number)}</td></tr>
        <tr><td>${isPickup ? 'Pickup from' : 'Deliver to'}</td><td>${fullAddress}</td></tr>
        ${!isPickup ? `<tr><td>Customer phone</td><td><a href="tel:${escapeHtml(customer.phone)}" style="color:#b8935a;">${escapeHtml(customer.phone)}</a></td></tr>` : ''}
      </table>

      <span class="section-label">${isPickup ? 'Pickup steps' : 'Delivery steps'}</span>
      <div class="steps">
        ${isPickup ? `
          <div class="step"><div class="step-num">1</div><div>Inspect the piano for any existing damage before moving</div></div>
          <div class="step"><div class="step-num">2</div><div>Photograph all 4 sides, the keys, and any existing marks or scratches</div></div>
          <div class="step"><div class="step-num">3</div><div>Upload all photos using the button below before moving the piano</div></div>
          <div class="step"><div class="step-num">4</div><div>The customer will be automatically notified that their piano is on its way</div></div>
        ` : `
          <div class="step"><div class="step-num">1</div><div>Place the piano in the agreed position in the customer's home</div></div>
          <div class="step"><div class="step-num">2</div><div>Photograph the piano in its new position — all 4 sides</div></div>
          <div class="step"><div class="step-num">3</div><div>Upload photos using the button below to confirm delivery</div></div>
          <div class="step"><div class="step-num">4</div><div>The customer will be automatically notified and their warranty will be issued</div></div>
        `}
      </div>

      <div class="warning">
        <strong>Important:</strong>
        ${isPickup
          ? 'Do not move the piano until photos are uploaded. These photos protect you and the business if any damage is claimed.'
          : 'Do not leave until photos are uploaded and confirmed. These photos confirm successful delivery.'}
      </div>

      <div class="action-box">
        <div style="font-size:15px;font-weight:500;color:#085041;margin-bottom:8px;">
          ${isPickup ? 'Take and upload pickup photos' : 'Take and upload delivery photos'}
        </div>
        <p style="font-size:13px;color:#085041;margin:0 0 16px;">
          Tap the button below to open the photo upload page. You can take photos directly from your phone camera.
        </p>
        <a href="${tokenUrl}" class="btn-gold">
          ${isPickup ? 'Upload pickup photos →' : 'Upload delivery photos →'}
        </a>
        <p style="font-size:11px;color:#9a9590;margin:12px 0 0;">This link is unique to this job. Do not share it.</p>
      </div>

      <p style="font-size:13px;color:#6b6760;">
        If you have any issues please call Eric directly. Do not email for urgent matters.
      </p>
    </div>
    <div class="footer">Signature Pianos Melbourne · signaturepianos.com.au</div>
  </div>
</body>
</html>`
}
