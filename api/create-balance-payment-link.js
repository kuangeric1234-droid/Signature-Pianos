/*
 * Signature Pianos — Stripe balance payment link
 * ----------------------------------------------
 * POST /api/create-balance-payment-link  body: { order_id }   (admin only)
 *
 * For a website deposit order (payment_method 'deposit_paid_online') still
 * waiting on its balance: creates a single-use Stripe Payment Link for
 * (order.total − $500) and emails it to the customer. Any earlier live link
 * for the same order is switched off first, so there is only ever one link
 * the customer can pay. The link redirects to
 * /checkout-success.html?type=balance; api/stripe-webhook.js sees
 * metadata.type 'balance_payment' + order_id and marks the order paid and
 * the piano sold.
 *
 * Triggered from admin/orders.html → Reserved pianos tab → "Send
 * payment link" button (the admin fetch wrapper sends the bearer token).
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const { createClient } = require('@supabase/supabase-js')
const { Resend } = require('resend')
const { requireAdmin, sendAuthError } = require('../lib/auth')
const { layout, hello, p, details, button, signOff } = require('../lib/email-brand')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
const resend = new Resend(process.env.RESEND_API_KEY)

const FROM     = 'Signature Pianos <info@signaturepianos.com.au>'
const SITE_URL = (process.env.SITE_URL || 'https://signaturepianos.com.au').replace(/\/+$/, '')
const DEPOSIT  = 500   // the fixed website deposit, AUD inc GST

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try { await requireAdmin(req) } catch (e) { return sendAuthError(res, e) }

  const { order_id } = req.body || {}
  if (!order_id) return res.status(400).json({ error: 'Missing order_id' })

  try {
    const { data: order, error } = await supabase
      .from('orders')
      .select('*, customer:customer_id(id, first_name, last_name, email), piano:piano_id(id, brand, model, year)')
      .eq('id', order_id)
      .maybeSingle()
    if (error) throw error
    if (!order) return res.status(404).json({ error: 'Order not found' })
    if (order.payment_method !== 'deposit_paid_online') {
      return res.status(400).json({ error: 'Payment links are only for orders reserved with an online deposit.' })
    }
    if (order.voided) return res.status(400).json({ error: 'This order is voided.' })
    if (['paid', 'complete', 'cancelled'].includes(order.status)) {
      return res.status(400).json({ error: `This order is already ${order.status}.` })
    }
    if (!order.customer?.email) return res.status(400).json({ error: 'No customer email on this order' })

    const balance = Math.round((Number(order.total || 0) - DEPOSIT) * 100) / 100
    const balanceCents = Math.round(balance * 100)
    if (!(balanceCents > 0)) {
      return res.status(400).json({ error: "Balance is zero or negative. Check the order total is the piano's full price." })
    }

    const pianoLabel = [order.piano?.brand, order.piano?.model, order.piano?.year].filter(Boolean).join(' ') || 'Piano'

    // One live link per order: switch off any earlier one before making a new one.
    for await (const link of stripe.paymentLinks.list({ active: true, limit: 100 })) {
      if (link.metadata?.order_id === order.id) {
        await stripe.paymentLinks.update(link.id, { active: false })
      }
    }

    // Payment Links take a Price id (this API version has no inline price_data).
    const price = await stripe.prices.create({
      currency: 'aud',
      unit_amount: balanceCents,
      product_data: {
        name: `Balance payment — ${pianoLabel} (invoice ${order.invoice_number})`,
        metadata: { order_id: order.id },
      },
    })

    const metadata = {
      type: 'balance_payment',
      order_id: order.id,
      piano_id: order.piano_id || '',
      invoice_number: order.invoice_number || '',
    }
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      metadata,                               // copied onto the Checkout Session the webhook sees
      payment_intent_data: { metadata },
      payment_method_types: ['card'],
      restrictions: { completed_sessions: { limit: 1 } },   // can't be paid twice
      inactive_message: 'This payment link has already been used or replaced. Please contact Signature Pianos on 0479 128 955.',
      after_completion: {
        type: 'redirect',
        redirect: { url: `${SITE_URL}/checkout-success.html?type=balance&session_id={CHECKOUT_SESSION_ID}` },
      },
    })
    const paymentUrl = `${paymentLink.url}?prefilled_email=${encodeURIComponent(order.customer.email)}`

    let settings = {}
    try {
      const { data: s } = await supabase.from('company_settings').select('*').limit(1).maybeSingle()
      if (s) settings = s
    } catch (sErr) {
      console.warn('[create-balance-payment-link] settings load fell back', sErr)
    }

    // resend.emails.send never throws: it returns { data, error }.
    const { error: mailErr } = await resend.emails.send({
      from: FROM,
      to: order.customer.email,
      subject: `Complete your purchase — ${pianoLabel}`,
      html: balancePaymentLinkEmail({ order, pianoLabel, paymentUrl, settings }),
    })
    if (mailErr) {
      console.error('[create-balance-payment-link] email failed', mailErr)
      return res.status(502).json({
        error: `The payment link was made but the email did not send (${mailErr.message || 'Resend error'}). Try again: a new link replaces this one.`,
      })
    }

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
      ['Deposit paid', fmtCur(DEPOSIT)],
      ['Balance to pay', fmtCur(Number(order.total || 0) - DEPOSIT), true],
    ])}
    ${button(paymentUrl, 'Pay balance now')}
    ${p('Secure payment via Stripe.', { muted: true, small: true })}
    ${p('This link is unique to your order. Please do not share it. If you have any questions, reply to this email.', { first: true })}
    ${signOff()}
  `
  return layout({
    preview: `Your ${pianoLabel} is reserved. Balance to pay: ${fmtCur(Number(order.total || 0) - DEPOSIT)}.`,
    label: 'Your purchase',
    title: 'Complete your purchase',
    body,
  })
}

// Template functions, exposed for email previews. The default export above
// (the API handler) is unchanged.
module.exports.templates = { balancePaymentLinkEmail }
