/*
 * Signature Pianos — Stripe balance payment link
 * ----------------------------------------------
 * POST /api/create-balance-payment-link  body: { order_id }
 *
 * For deposit-paid orders awaiting the remaining balance: creates a
 * Stripe Payment Link for (order.total - $500) and emails it to the
 * customer. The link redirects to /checkout-success.html on completion;
 * the existing stripe webhook will pick up the metadata and complete
 * the order.
 *
 * Triggered from admin/orders.html → Reserved pianos tab → "Send
 * payment link" button.
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const { createClient } = require('@supabase/supabase-js')
const { Resend } = require('resend')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
const resend = new Resend(process.env.RESEND_API_KEY)

const FROM     = 'Signature Pianos <info@signaturepianos.com.au>'
const SITE_URL = process.env.SITE_URL || 'https://signaturepianos.com.au'

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { order_id } = req.body || {}
  if (!order_id) return res.status(400).json({ error: 'Missing order_id' })

  try {
    const { data: order, error } = await supabase
      .from('orders')
      .select('*, customer:customer_id(*), piano:piano_id(*)')
      .eq('id', order_id)
      .maybeSingle()
    if (error) throw error
    if (!order) return res.status(404).json({ error: 'Order not found' })
    if (!order.customer?.email) return res.status(400).json({ error: 'No customer email on this order' })

    const balanceCents = Math.round((Number(order.total || 0) - 500) * 100)
    if (balanceCents <= 0) {
      return res.status(400).json({ error: 'Balance is zero or negative — nothing to pay' })
    }

    const pianoLabel = `${order.piano?.brand || 'Yamaha'} ${order.piano?.model || ''} ${order.piano?.year || ''}`.trim()

    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{
        price_data: {
          currency: 'aud',
          product_data: {
            name: `Balance payment — ${pianoLabel}`,
            description: `Invoice ${order.invoice_number || ''} · Balance owing after $500 deposit`,
          },
          unit_amount: balanceCents,
        },
        quantity: 1,
      }],
      metadata: {
        order_id: order.id,
        invoice_number: order.invoice_number || '',
        type: 'balance_payment',
      },
      after_completion: {
        type: 'redirect',
        redirect: { url: `${SITE_URL}/checkout-success.html` },
      },
    })

    let settings = {}
    try {
      const { data: s } = await supabase.from('company_settings').select('*').limit(1).maybeSingle()
      if (s) settings = s
    } catch (sErr) {
      console.warn('[create-balance-payment-link] settings load fell back', sErr)
    }

    const fmtCur = (v) => '$' + Math.abs(Number(v || 0)).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

    await resend.emails.send({
      from: FROM,
      to: order.customer.email,
      subject: `Complete your purchase — ${pianoLabel}`,
      html: `<!DOCTYPE html>
<html>
<body style="font-family:Arial,Helvetica,sans-serif;background:#f8f7f5;margin:0;padding:40px 20px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e8e4dd;">
    <div style="background:#1a1917;padding:32px;text-align:center;">
      <div style="font-size:20px;color:#b8935a;font-style:italic;">${esc(settings?.business_name || 'Signature Pianos')}</div>
    </div>
    <div style="padding:32px;">
      <h2 style="color:#1a1917;margin:0 0 16px;">Complete your purchase, ${esc(order.customer.first_name || 'friend')}.</h2>
      <p style="color:#6b6760;font-size:14px;line-height:1.7;">
        Your ${esc(pianoLabel)} is reserved and waiting for you. Use the button below to pay the balance and confirm your purchase.
      </p>
      <div style="background:#f8f7f5;border-radius:4px;padding:16px;margin:20px 0;">
        <table style="width:100%;font-size:13px;border-collapse:collapse;">
          <tr><td style="padding:7px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;">Deposit paid</td><td style="padding:7px 0;color:#1D9E75;border-bottom:1px solid #e8e4dd;text-align:right;">$500.00 ✓</td></tr>
          <tr><td style="padding:7px 0;color:#9a9590;">Balance to pay</td><td style="padding:7px 0;font-weight:500;font-size:15px;color:#b8935a;text-align:right;">${fmtCur(Number(order.total || 0) - 500)}</td></tr>
        </table>
      </div>
      <div style="text-align:center;margin:24px 0;">
        <a href="${paymentLink.url}" style="display:inline-block;background:#b8935a;color:#000;padding:16px 40px;border-radius:4px;text-decoration:none;font-size:15px;font-weight:500;">
          Pay balance now →
        </a>
        <p style="font-size:11px;color:#9a9590;margin:10px 0 0;">Secure payment via Stripe</p>
      </div>
      <p style="color:#6b6760;font-size:13px;line-height:1.7;">
        This link is unique to your order. Do not share it. If you have any questions reply to this email.
      </p>
    </div>
    <div style="background:#f8f7f5;padding:20px;text-align:center;font-size:12px;color:#9a9590;border-top:1px solid #e8e4dd;">
      ${esc(settings?.business_name || 'Signature Pianos')} Melbourne · ${esc(settings?.website || 'signaturepianos.com.au')}
    </div>
  </div>
</body>
</html>`,
    })

    return res.status(200).json({ success: true, url: paymentLink.url })
  } catch (err) {
    console.error('[create-balance-payment-link] handler failed', err)
    return res.status(500).json({ error: err.message || 'Failed to create payment link' })
  }
}

function esc(s) {
  if (s == null) return ''
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
