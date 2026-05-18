/*
 * Signature Pianos — Stripe Checkout session creator
 * --------------------------------------------------
 * Vercel Node.js serverless function. Called from piano.html when the
 * customer clicks "Buy now" (full purchase) or "Reserve with $500 deposit".
 *
 * Required env (Vercel dashboard):
 *   STRIPE_SECRET_KEY            — Stripe API secret key (sk_live_... / sk_test_...)
 *   SUPABASE_URL                 — Project URL
 *   SUPABASE_SERVICE_ROLE_KEY    — Service role key (server-only)
 *
 * On a successful deposit checkout session the piano is immediately marked
 * 'reserved' so the inventory grid hides it from other browsers while the
 * customer completes payment. Full-purchase flips happen later, on webhook
 * confirmation, so this endpoint only touches stock_status for deposits.
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const {
    type,
    piano_id,
    piano_name,
    amount,
    currency,
    success_url,
    cancel_url
  } = req.body

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: currency || 'aud',
          product_data: {
            name: piano_name,
            description: type === 'deposit'
              ? 'Reservation deposit — balance payable on delivery'
              : 'Full purchase includes 10-year warranty and complimentary first tuning',
          },
          unit_amount: amount,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url,
      cancel_url,
      metadata: { piano_id, type }
    })

    // Mark piano as reserved immediately on deposit
    if (type === 'deposit') {
      await supabase
        .from('pianos')
        .update({ stock_status: 'reserved' })
        .eq('id', piano_id)
    }

    return res.status(200).json({ url: session.url })

  } catch (err) {
    console.error('Stripe checkout error:', err)
    return res.status(500).json({ error: err.message })
  }
}
