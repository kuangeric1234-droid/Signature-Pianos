/*
 * Signature Pianos — driver pickup confirmation
 * ---------------------------------------------
 * POST /api/driver-pickup-confirm  body: { token, photo_urls, photo_count, notes }
 *
 *   1. Verifies the pickup_link_token (anon SELECT permitted by RLS but
 *      we re-check with service role anyway).
 *   2. Updates the deliveries row — pickup_photos, pickup_confirmed_at,
 *      pickup_notes, status='picked_up'. Routed through the service role
 *      to bypass the deliveries_anon_guard trigger that blocks anon
 *      status / token changes.
 *   3. Sends the customer "your piano is on its way" email + Eric's
 *      internal notification.
 */

const { createClient } = require('@supabase/supabase-js')
const { Resend } = require('resend')

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

  const { token, photo_urls, photo_count, notes } = req.body || {}
  if (!token) return res.status(400).json({ error: 'Missing token' })
  if (!Array.isArray(photo_urls) || photo_urls.length < 3) {
    return res.status(400).json({ error: 'At least 3 photos required' })
  }

  try {
    // 1. Token check
    const { data: delivery, error } = await supabase
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
      .eq('pickup_link_token', token)
      .maybeSingle()
    if (error) throw error
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' })

    if (['picked_up', 'in_transit', 'delivered'].includes(delivery.status)) {
      return res.status(400).json({ error: 'Pickup already confirmed' })
    }

    const customer = delivery.order?.customer || {}
    const piano    = delivery.order?.piano    || {}

    // 2. Row update via service role (bypasses anon guard trigger)
    const { error: updErr } = await supabase
      .from('deliveries')
      .update({
        pickup_photos:       photo_urls,
        pickup_confirmed_at: new Date().toISOString(),
        pickup_notes:        notes || null,
        status:              'picked_up',
      })
      .eq('id', delivery.id)
    if (updErr) throw updErr

    // 3. Company settings for the email footer (non-fatal)
    let settings = {}
    try {
      const { data: s } = await supabase.from('company_settings').select('*').limit(1).maybeSingle()
      if (s) settings = s
    } catch (sErr) {
      console.warn('[driver-pickup-confirm] settings load fell back', sErr)
    }

    // 4. Customer email — "your piano is on its way"
    if (customer.email) {
      try {
        await resend.emails.send({
          from: FROM,
          to: customer.email,
          subject: 'Your piano is on its way — Signature Pianos',
          html: pianoOnItsWayEmail({ customer, piano, settings }),
        })
      } catch (mailErr) {
        console.error('[driver-pickup-confirm] customer email failed', mailErr)
      }
    }

    // 5. Internal Eric notification
    try {
      await resend.emails.send({
        from: FROM,
        to: BUSINESS_EMAIL,
        subject: `Pickup confirmed — ${piano.brand || 'Yamaha'} ${piano.model || ''} ${piano.year || ''} · ${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
        html: `
          <h2>Piano picked up</h2>
          <p>Customer: ${esc(customer.first_name || '')} ${esc(customer.last_name || '')} (${esc(customer.email || '—')})</p>
          <p>Piano: ${esc((piano.brand || 'Yamaha') + ' ' + (piano.model || '') + ' ' + (piano.year || ''))}</p>
          <p>Serial: ${esc(piano.serial_number || '—')}</p>
          <p>Photos uploaded: ${esc(photo_count)}</p>
          ${notes ? `<p>Driver notes: ${esc(notes)}</p>` : ''}
          <p>Status updated to: picked_up</p>
          <p>Customer has been notified.</p>
        `,
      })
    } catch (mailErr) {
      console.error('[driver-pickup-confirm] internal email failed', mailErr)
    }

    // 6. Driver next-step — immediately send the delivery photo link
    // so they have it ready when they arrive at the customer's home.
    const partner = delivery.partner || {}
    if (partner.email && delivery.delivery_link_token) {
      const SITE_URL = process.env.SITE_URL || 'https://signaturepianos.com.au'
      const deliveryUrl = `${SITE_URL}/delivery/drop/${delivery.delivery_link_token}`
      try {
        await resend.emails.send({
          from: FROM,
          to: partner.email,
          subject: `Next step: delivery photos required — ${piano.brand || 'Yamaha'} ${piano.model || ''} ${piano.year || ''}`.trim(),
          html: driverDeliveryLinkEmail({
            driver_name: partner.name,
            customer, piano, delivery_url: deliveryUrl, settings,
          }),
        })
      } catch (mailErr) {
        console.error('[driver-pickup-confirm] delivery-link email failed', mailErr)
      }
    }

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('[driver-pickup-confirm] handler failed', err)
    return res.status(500).json({ error: err.message || 'Confirm failed' })
  }
}

function esc(s) {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function driverDeliveryLinkEmail({ driver_name, customer, piano, delivery_url, settings }) {
  const pianoLabel = `${piano?.brand || 'Yamaha'} ${piano?.model || ''} ${piano?.year || ''}`.trim()
  const fullAddress = [
    customer?.address_line1, customer?.suburb, customer?.state, customer?.postcode,
  ].filter(Boolean).map(esc).join(', ') || '—'
  return `<!DOCTYPE html>
<html>
<body style="font-family:Arial,Helvetica,sans-serif;background:#f8f7f5;margin:0;padding:40px 20px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e8e4dd;">
    <div style="background:#1a1917;padding:24px 32px;">
      <div style="font-size:18px;color:#b8935a;font-style:italic;">${esc(settings?.business_name || 'Signature Pianos')}</div>
      <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:4px;">Pickup confirmed — next step</div>
    </div>
    <div style="padding:32px;">
      <h2 style="color:#1a1917;margin:0 0 8px;">Great work, ${esc(driver_name || '')}.</h2>
      <p style="color:#6b6760;font-size:14px;line-height:1.7;margin:0 0 20px;">
        Pickup photos received. The customer has been notified their piano is on its way. Here are the delivery details:
      </p>

      <table style="width:100%;font-size:13px;border-collapse:collapse;margin-bottom:20px;">
        <tr><td style="padding:8px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;width:40%;">Deliver to</td><td style="padding:8px 0;font-weight:500;border-bottom:1px solid #e8e4dd;">${esc((customer?.first_name || '') + ' ' + (customer?.last_name || ''))}</td></tr>
        <tr><td style="padding:8px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;">Address</td><td style="padding:8px 0;border-bottom:1px solid #e8e4dd;">${fullAddress}</td></tr>
        <tr><td style="padding:8px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;">Customer phone</td><td style="padding:8px 0;border-bottom:1px solid #e8e4dd;"><a href="tel:${esc(customer?.phone || '')}" style="color:#b8935a;">${esc(customer?.phone || '—')}</a></td></tr>
        <tr><td style="padding:8px 0;color:#9a9590;">Piano</td><td style="padding:8px 0;">${esc(pianoLabel)}</td></tr>
      </table>

      <div style="background:#f0f9f4;border:1px solid #9fe1cb;border-radius:4px;padding:20px;text-align:center;">
        <div style="font-size:14px;font-weight:500;color:#085041;margin-bottom:8px;">After you deliver the piano</div>
        <p style="font-size:13px;color:#085041;margin:0 0 16px;line-height:1.5;">
          Place the piano in the agreed position then use this link to upload your delivery photos before leaving.
        </p>
        <a href="${esc(delivery_url || '#')}" style="display:inline-block;background:#b8935a;color:#000;padding:12px 28px;border-radius:4px;text-decoration:none;font-size:13px;font-weight:500;">
          Upload delivery photos →
        </a>
        <p style="font-size:11px;color:#9a9590;margin:12px 0 0;">Do not leave the property until photos are uploaded.</p>
      </div>
    </div>
    <div style="background:#f8f7f5;padding:20px;text-align:center;font-size:12px;color:#9a9590;border-top:1px solid #e8e4dd;">
      ${esc(settings?.business_name || 'Signature Pianos')} Melbourne · ${esc(settings?.website || 'signaturepianos.com.au')}
    </div>
  </div>
</body>
</html>`
}

function pianoOnItsWayEmail({ customer, piano, settings }) {
  const pianoLabel = `${piano.brand || 'Yamaha'} ${piano.model || ''} ${piano.year || ''}`.trim()
  return `<!DOCTYPE html>
<html>
<body style="font-family:Arial,Helvetica,sans-serif;background:#f8f7f5;margin:0;padding:40px 20px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e8e4dd;">
    <div style="background:#1a1917;padding:32px;text-align:center;">
      <div style="font-size:20px;color:#b8935a;font-style:italic;">${esc(settings?.business_name || 'Signature Pianos')}</div>
    </div>
    <div style="padding:32px;">
      <h2 style="color:#1a1917;margin:0 0 16px;">Your piano is on its way, ${esc(customer.first_name || 'friend')}.</h2>
      <p style="color:#6b6760;font-size:14px;line-height:1.7;">
        Your ${esc(pianoLabel)} has been collected and is on its way to you.
      </p>

      <div style="background:#f0f9f4;border:1px solid #9fe1cb;border-radius:4px;padding:16px;margin:20px 0;">
        <div style="font-size:14px;font-weight:500;color:#085041;margin-bottom:8px;">What to expect</div>
        <div style="font-size:13px;color:#085041;line-height:1.8;">
          ✓ Your piano has been photographed before collection<br>
          ✓ Our team will place it exactly where you want it<br>
          ✓ Your warranty certificate will be emailed after delivery<br>
          ✓ A tuner will be booked for 3–4 weeks time
        </div>
      </div>

      <p style="color:#6b6760;font-size:13px;line-height:1.7;">
        If you have any questions or need to make arrangements please reply to this email or call us directly.
      </p>
    </div>
    <div style="background:#f8f7f5;padding:20px;text-align:center;font-size:12px;color:#9a9590;border-top:1px solid #e8e4dd;">
      ${esc(settings?.business_name || 'Signature Pianos')} Melbourne · ${esc(settings?.website || 'signaturepianos.com.au')}
      ${settings?.phone ? ' · ' + esc(settings.phone) : ''}
    </div>
  </div>
</body>
</html>`
}
