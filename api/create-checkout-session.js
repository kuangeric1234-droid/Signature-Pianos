/*
 * Signature Pianos — Stripe Checkout session creator
 * --------------------------------------------------
 * Vercel Node.js serverless function. Called from piano.html when the
 * customer clicks "Buy now" (full purchase) or "Reserve with $500 deposit".
 *
 * POST body: { piano_id, type }  where type is 'full' or 'deposit'
 * ('full_purchase' is accepted as the old spelling of 'full'). Nothing else
 * is taken from the browser: the price, product name and return URLs are
 * all worked out here from the pianos row.
 *
 * Required env (Vercel dashboard):
 *   STRIPE_SECRET_KEY            — Stripe API secret key (sk_live_... / sk_test_...)
 *   SUPABASE_URL                 — Project URL
 *   SUPABASE_SERVICE_ROLE_KEY    — Service role key (server-only)
 *   SITE_URL                     — https://signaturepianos.com.au (return URLs)
 *
 * This endpoint never changes stock_status. The piano is marked reserved
 * (deposit) or sold (full) by api/stripe-webhook.js only after Stripe
 * confirms the payment, so an abandoned checkout leaves it on sale.
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const SITE_URL = (process.env.SITE_URL || 'https://signaturepianos.com.au').replace(/\/+$/, '')
const DEPOSIT_CENTS = 50000   // the website deposit is a fixed $500; the webhook and admin assume it
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const body = req.body || {}
  const pianoId = String(body.piano_id || '').trim()
  const type = body.type === 'deposit' ? 'deposit'
    : (body.type === 'full' || body.type === 'full_purchase') ? 'full'
    : null
  if (!type) return res.status(400).json({ error: 'Unknown checkout type' })
  if (!UUID_RE.test(pianoId)) return res.status(400).json({ error: 'Missing piano' })

  try {
    const { data: piano, error } = await supabase
      .from('pianos')
      .select('id, brand, model, year, sale_price, stock_status')
      .eq('id', pianoId)
      .maybeSingle()
    if (error) throw error
    if (!piano || piano.stock_status !== 'available') {
      return res.status(409).json({ error: 'Sorry, this piano is no longer available.' })
    }

    const priceCents = Math.round(Number(piano.sale_price) * 100)
    if (!Number.isFinite(priceCents) || priceCents <= 0) {
      return res.status(409).json({ error: 'This piano is price on request. Please call us or book a visit.' })
    }
    if (type === 'deposit' && priceCents <= DEPOSIT_CENTS) {
      return res.status(400).json({ error: 'A deposit is not available for this piano. Please use Buy now.' })
    }
    const amount = type === 'deposit' ? DEPOSIT_CENTS : priceCents

    const pianoName = [piano.brand, piano.model, piano.year].filter(Boolean).join(' ') || 'Piano'
    // sale_price is the price the customer agreed to; the webhook stores it as
    // the order total for deposits even if the listing price changes later.
    const metadata = { piano_id: piano.id, type, sale_price: (priceCents / 100).toFixed(2) }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'aud',
          product_data: {
            name: pianoName,
            description: type === 'deposit'
              ? 'Reservation deposit — balance payable on delivery'
              : 'Full purchase includes 10-year warranty and complimentary first tuning',
          },
          unit_amount: amount,
        },
        quantity: 1,
      }],
      billing_address_collection: 'required',
      phone_number_collection: { enabled: true },
      client_reference_id: piano.id,
      metadata,
      payment_intent_data: { metadata },
      // The piano stays on sale until someone pays, so keep the window in which
      // two people can be paying for it at once short (Stripe's default is 24h).
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
      success_url: `${SITE_URL}/checkout-success.html?type=${type}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/piano.html?id=${encodeURIComponent(piano.id)}`,
    })

    return res.status(200).json({ url: session.url })

  } catch (err) {
    console.error('[create-checkout-session] failed', err)
    return res.status(500).json({ error: 'We could not start the payment. Please try again or call us.' })
  }
}
