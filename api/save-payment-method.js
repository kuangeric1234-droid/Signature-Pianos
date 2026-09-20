/*
 * Signature Pianos — Stripe payment method saver
 * ---------------------------------------------
 * POST /api/save-payment-method
 * Body: { token, plan_id, payment_method_id }
 *
 *   1. Verifies the signature_token matches the plan_id exactly (anon-
 *      callable but token-gated). Only a credit-card plan that the
 *      customer hasn't signed yet (and isn't cancelled) can save a card —
 *      the signing page saves the card in step 3, before the signature.
 *   2. Creates a Stripe Customer for the buyer if one doesn't already
 *      exist on the plan, with metadata pointing back at the Supabase
 *      customer + plan number, and stores its id straight away so a retry
 *      reuses it.
 *   3. Attaches the client-side-created PaymentMethod to that Customer
 *      and sets it as the default — enabling future off_session charges
 *      for overdue instalments (handled by a separate cron, out of
 *      scope here).
 *   4. Saves stripe_customer_id / stripe_payment_method_id / card brand
 *      and last four to the payment_plans row. Brand and last four come
 *      from Stripe's copy of the card, not the request body.
 */

const { createClient } = require('@supabase/supabase-js')
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const {
    token,
    plan_id,
    payment_method_id,
  } = req.body || {}

  if (!token || !plan_id || !payment_method_id) {
    return res.status(400).json({ error: 'Missing required fields' })
  }
  // Plain strings only, so the token check stays an exact match.
  if (typeof token !== 'string' || token.length < 16 || typeof plan_id !== 'string'
      || typeof payment_method_id !== 'string' || !payment_method_id.startsWith('pm_')) {
    return res.status(400).json({ error: 'Invalid request' })
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('[save-payment-method] STRIPE_SECRET_KEY is not set')
    return res.status(503).json({ error: "Card payments aren't set up yet. Please call us." })
  }

  try {
    // 1. Token check
    const { data: plan, error: planErr } = await supabase
      .from('payment_plans')
      .select('*, customer:customer_id(*)')
      .eq('id', plan_id)
      .eq('signature_token', token)
      .maybeSingle()
    if (planErr) throw planErr
    if (!plan)   return res.status(404).json({ error: 'Plan not found' })

    if (plan.payment_method !== 'credit_card') {
      return res.status(400).json({ error: 'This plan is paid by bank transfer.' })
    }
    if (plan.status === 'cancelled' || plan.status === 'completed' || plan.status === 'defaulted') {
      return res.status(409).json({ error: 'This payment plan is closed. Please contact us.' })
    }
    if (plan.contract_signed || plan.countersigned || plan.fully_executed) {
      return res.status(409).json({ error: 'This agreement is already signed. Please contact us to change your card.' })
    }

    const customer = plan.customer || {}

    // 2. Stripe customer — create if missing. Stored straight away so a
    // retry after a later failure reuses it instead of creating another.
    let stripeCustomerId = plan.stripe_customer_id
    if (!stripeCustomerId) {
      const created = await stripe.customers.create({
        email: customer.email || undefined,
        name:  `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || undefined,
        metadata: {
          supabase_customer_id: plan.customer_id || '',
          supabase_plan_id:     plan.id,
          plan_number:          plan.plan_number || '',
        },
      })
      stripeCustomerId = created.id

      const { error: custErr } = await supabase
        .from('payment_plans')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', plan_id)
      if (custErr) throw custErr
    }

    // 3. Attach PaymentMethod + set as default. The Stripe SDK throws on
    // any API error (declined, already attached elsewhere, bad id), which
    // lands in the catch below and nothing is saved on the plan.
    const pm = await stripe.paymentMethods.attach(payment_method_id, {
      customer: stripeCustomerId,
    })
    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: { default_payment_method: payment_method_id },
    })

    // 4. Persist on the plan
    const { error: updErr } = await supabase
      .from('payment_plans')
      .update({
        stripe_customer_id:       stripeCustomerId,
        stripe_payment_method_id: payment_method_id,
        card_last_four:           pm?.card?.last4 || null,
        card_brand:               pm?.card?.brand || null,
      })
      .eq('id', plan_id)
    if (updErr) throw updErr

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('[save-payment-method] failed', err)
    // Stripe card errors carry a customer-safe message; anything else
    // (database, config) gets a generic one.
    const message = err && err.type === 'StripeCardError' && err.message
      ? err.message
      : 'Could not save your card. Please try again.'
    return res.status(500).json({ error: message })
  }
}
