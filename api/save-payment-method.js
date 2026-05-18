/*
 * Signature Pianos — Stripe payment method saver
 * ---------------------------------------------
 * POST /api/save-payment-method
 * Body: { token, plan_id, payment_method_id, card_last_four, card_brand }
 *
 *   1. Verifies the signature_token matches the plan_id (anon-callable
 *      but token-gated).
 *   2. Creates a Stripe Customer for the buyer if one doesn't already
 *      exist on the plan, with metadata pointing back at the Supabase
 *      customer + plan number.
 *   3. Attaches the client-side-created PaymentMethod to that Customer
 *      and sets it as the default — enabling future off_session charges
 *      for overdue instalments (handled by a separate cron, out of
 *      scope here).
 *   4. Saves stripe_customer_id / stripe_payment_method_id / card brand
 *      and last four to the payment_plans row.
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
    card_last_four,
    card_brand,
  } = req.body || {}

  if (!token || !plan_id || !payment_method_id) {
    return res.status(400).json({ error: 'Missing required fields' })
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

    const customer = plan.customer || {}

    // 2. Stripe customer — create if missing
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
    }

    // 3. Attach PaymentMethod + set as default
    await stripe.paymentMethods.attach(payment_method_id, {
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
        card_last_four:           card_last_four || null,
        card_brand:               card_brand || null,
      })
      .eq('id', plan_id)
    if (updErr) throw updErr

    return res.status(200).json({ success: true, stripe_customer_id: stripeCustomerId })
  } catch (err) {
    console.error('[save-payment-method] failed', err)
    return res.status(500).json({ error: err.message || 'Save payment method failed' })
  }
}
