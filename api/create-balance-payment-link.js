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
const { layout, hello, p, details, button, signOff } = require('../lib/email-brand')

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

    await resend.emails.send({
      from: FROM,
      to: order.customer.email,
      subject: `Complete your purchase — ${pianoLabel}`,
      html: balancePaymentLinkEmail({ order, pianoLabel, paymentUrl: paymentLink.url, settings }),
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

const fmtCur = (v) => '$' + Math.abs(Number(v || 0)).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/* ---------- Customer: pay the balance on a reserved piano ---------- */
function balancePaymentLinkEmail({ order, pianoLabel, paymentUrl, settings }) {
  const body = `
    ${hello(order.customer?.first_name)}
    ${p(`Your ${esc(pianoLabel)} is reserved and waiting for you. Use the button below to pay the balance and confirm your purchase.`)}
    ${details([
      ['Piano', esc(pianoLabel)],
      ['Deposit paid', fmtCur(500)],
      ['Balance to pay', fmtCur(Number(order.total || 0) - 500), true],
    ])}
    ${button(paymentUrl, 'Pay balance now')}
    ${p('Secure payment via Stripe.', { muted: true, small: true })}
    ${p('This link is unique to your order. Please do not share it. If you have any questions, reply to this email.', { first: true })}
    ${signOff()}
  `
  return layout({
    preview: `Your ${pianoLabel} is reserved. Balance to pay: ${fmtCur(Number(order.total || 0) - 500)}.`,
    label: 'Your purchase',
    title: 'Complete your purchase',
    body,
  })
}

// Template functions, exposed for email previews. The default export above
// (the API handler) is unchanged.
module.exports.templates = { balancePaymentLinkEmail }
