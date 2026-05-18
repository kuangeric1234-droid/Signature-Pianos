/*
 * Signature Pianos — Stripe webhook receiver
 * ------------------------------------------
 * Vercel Node.js serverless function bound to /api/stripe-webhook in
 * vercel.json. Listens for checkout.session.completed events and:
 *
 *   1. Upserts the customer row from session.customer_details.
 *   2. Inserts the orders row (full purchase OR deposit), with stable
 *      idempotency keyed on session.id so retries don't duplicate.
 *   3. Marks the piano sold (full) or reserved (deposit).
 *   4. Auto-creates the deliveries row (with preference_token) and emails
 *      the customer their preferences link.
 *   5. Pings the internal inbox so Eric sees the sale.
 *
 * Required env (Vercel dashboard):
 *   STRIPE_SECRET_KEY            — Stripe API secret key
 *   STRIPE_WEBHOOK_SECRET        — whsec_... from the Stripe webhook endpoint
 *   SUPABASE_URL                 — Project URL
 *   SUPABASE_SERVICE_ROLE_KEY    — Service role key (server-only)
 *   RESEND_API_KEY               — Resend API key
 *   BUSINESS_EMAIL               — info@signaturepianos.com.au
 *   SITE_URL                     — https://signaturepianos.com.au
 *
 * Important: Stripe signs the RAW request body. We disable Vercel's
 * automatic JSON parsing via `module.exports.config.api.bodyParser = false`
 * and read req as a buffer. Don't refactor this to `req.body` — the
 * signature will fail.
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const SITE_URL = process.env.SITE_URL || 'https://signaturepianos.com.au'
const BUSINESS_EMAIL = process.env.BUSINESS_EMAIL || 'info@signaturepianos.com.au'

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Read raw body — Vercel's parsed req.body would invalidate the signature.
  let rawBody
  try {
    rawBody = await readRawBody(req)
  } catch (err) {
    console.error('[stripe-webhook] body read failed', err)
    return res.status(400).send('Invalid body')
  }

  let event
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed', err.message)
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  try {
    if (event.type === 'checkout.session.completed') {
      await handleCheckoutCompleted(event.data.object)
    }
    return res.status(200).json({ received: true })
  } catch (err) {
    console.error('[stripe-webhook] handler failed', err)
    // Return 500 so Stripe retries the event.
    return res.status(500).json({ error: err.message })
  }
}

module.exports.config = {
  api: {
    bodyParser: false,
  },
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function handleCheckoutCompleted(session) {
  const meta = session.metadata || {}
  const pianoId = meta.piano_id
  const type = meta.type || 'full'   // 'full' or 'deposit'
  const amountPaid = (session.amount_total || 0) / 100

  if (!pianoId) {
    console.warn('[stripe-webhook] no piano_id in session metadata — skipping', session.id)
    return
  }

  // ---- 1. Idempotency: bail if we've already processed this session id ----
  const { data: existingOrder } = await supabase
    .from('orders')
    .select('id')
    .eq('stripe_session_id', session.id)
    .maybeSingle()
  if (existingOrder) {
    console.log('[stripe-webhook] session already processed, skipping', session.id)
    return
  }

  // ---- 2. Customer upsert from session.customer_details -------------------
  const cd = session.customer_details || {}
  const [first_name, ...rest] = (cd.name || '').split(' ')
  const last_name = rest.join(' ').trim() || null
  const customerPayload = {
    email:         cd.email || null,
    first_name:    first_name || null,
    last_name,
    phone:         cd.phone || null,
    address_line1: cd.address?.line1 || null,
    address_line2: cd.address?.line2 || null,
    suburb:        cd.address?.city || null,
    state:         cd.address?.state || null,
    postcode:      cd.address?.postal_code || null,
  }

  let customerId = null
  if (customerPayload.email) {
    const { data: existingCust } = await supabase
      .from('customers')
      .select('id')
      .eq('email', customerPayload.email)
      .maybeSingle()
    if (existingCust?.id) {
      customerId = existingCust.id
      await supabase.from('customers').update(customerPayload).eq('id', customerId)
    } else {
      const { data: newCust, error: custErr } = await supabase
        .from('customers')
        .insert(customerPayload)
        .select('id')
        .single()
      if (custErr) throw custErr
      customerId = newCust.id
    }
  }

  // ---- 3. Fetch piano for line-item snapshot ------------------------------
  const { data: piano } = await supabase
    .from('pianos')
    .select('*')
    .eq('id', pianoId)
    .maybeSingle()

  const pianoLabel = piano ? `${piano.brand || ''} ${piano.model || ''} ${piano.year || ''}`.trim() : 'Piano'
  const total = amountPaid
  const gst = total / 11
  const exGst = total - gst

  // ---- 4. Insert order ----------------------------------------------------
  const orderPayload = {
    customer_id:       customerId,
    piano_id:          pianoId,
    status:            type === 'deposit' ? 'pending' : 'confirmed',
    subtotal:          total,
    subtotal_ex_gst:   exGst,
    gst_amount:        gst,
    discount:          0,
    total,
    currency:          (session.currency || 'aud').toUpperCase(),
    payment_method:    type === 'deposit' ? 'deposit_paid_online' : 'stripe',
    payment_reference: session.id,
    stripe_session_id: session.id,
    notes:             type === 'deposit' ? 'Reservation deposit paid online via Stripe.' : 'Full purchase paid online via Stripe.',
    line_items: [{
      description: pianoLabel,
      qty: 1,
      unit_price_inc_gst: total,
      amount_inc_gst: total,
    }],
  }
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert(orderPayload)
    .select('*')
    .single()
  if (orderErr) throw orderErr

  // ---- 5. Update piano stock_status --------------------------------------
  // Deposit → reserved (already set by create-checkout-session, idempotent).
  // Full purchase → sold.
  if (type === 'full') {
    await supabase.from('pianos').update({ stock_status: 'sold' }).eq('id', pianoId)
  } else if (type === 'deposit') {
    await supabase.from('pianos').update({ stock_status: 'reserved' }).eq('id', pianoId)
  }

  // ---- 6. Piano-type gated delivery + customer emails --------------------
  // Acoustic uprights and grands need a delivery row + preference link.
  // Digital pianos are collected from the showroom — no delivery row.
  const isAcoustic = piano?.type === 'acoustic_upright' || piano?.type === 'acoustic_grand'

  let delivery = null
  if (isAcoustic) {
    const { data: dlv, error: dlvErr } = await supabase
      .from('deliveries')
      .insert({
        order_id:     order.id,
        status:       'scheduled',
        auto_created: true,
      })
      .select('*')
      .single()
    if (dlvErr) {
      // Don't throw — order is the source of truth, delivery can be created manually.
      console.error('[stripe-webhook] delivery insert failed', dlvErr)
    } else {
      delivery = dlv
    }
  }

  // ---- 7. Send customer confirmation (+ invoice) -------------------------
  // For acoustic full purchases: branded confirmation w/ preference link
  //   (purchase_confirmation type) PLUS a separate invoice email.
  // For digital full purchases: collection confirmation + invoice in one
  //   dispatcher branch (digital_order_confirmation type).
  // For deposits: just the existing purchase_confirmation, no invoice
  //   email (the customer hasn't paid the full balance yet).
  if (customerPayload.email) {
    const settings = await getSettings()
    const orderForEmail = {
      invoice_number: order.invoice_number,
      order_number:   order.order_number,
      total:          order.total,
      subtotal:       order.subtotal,
      discount:       order.discount,
      payment_method: order.payment_method,
      created_at:     order.created_at,
      line_items:     order.line_items || [],
    }
    const customerForEmail = { ...customerPayload, id: customerId }

    try {
      if (type === 'deposit' || isAcoustic) {
        // Existing acoustic + deposit flow — branded confirmation w/ preference link.
        await fetch(`${SITE_URL}/api/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type:            'purchase_confirmation',
            email:           customerPayload.email,
            first_name:      customerPayload.first_name || '',
            last_name:       customerPayload.last_name || '',
            piano_label:     pianoLabel,
            order_number:    order.order_number,
            total,
            payment_type:    type,
            preferences_url: delivery?.preference_token
              ? `${SITE_URL}/delivery-preferences.html?token=${encodeURIComponent(delivery.preference_token)}`
              : '',
          }),
        })
      }

      if (type === 'full' && isAcoustic) {
        // Send invoice as a separate email so the inbox shows two clear items:
        // a warm confirmation and a printable tax invoice.
        await fetch(`${SITE_URL}/api/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'send_invoice',
            customer: customerForEmail,
            piano,
            order: orderForEmail,
            settings,
          }),
        })
      }

      if (type === 'full' && !isAcoustic) {
        // Digital — collection confirmation + invoice in one branch.
        await fetch(`${SITE_URL}/api/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'digital_order_confirmation',
            customer: customerForEmail,
            piano,
            order: orderForEmail,
            settings,
          }),
        })
      }
    } catch (err) {
      console.error('[stripe-webhook] customer email failed', err)
    }
  }

  // ---- 8. Internal notification ------------------------------------------
  try {
    await fetch(`${SITE_URL}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type:           'internal_sale_notification',
        email:          BUSINESS_EMAIL,
        customer:       `${customerPayload.first_name || ''} ${customerPayload.last_name || ''}`.trim(),
        customer_email: customerPayload.email || '',
        piano_label:    pianoLabel,
        order_number:   order.order_number,
        total,
        payment_type:   type,
        is_acoustic:    isAcoustic,
      }),
    })
  } catch (err) {
    console.error('[stripe-webhook] internal email failed', err)
  }
}

/* Fetch the singleton company_settings row. Falls back to a thin defaults
   object if the row hasn't been seeded yet — the invoice email will still
   render, just with the placeholder business address. */
async function getSettings() {
  try {
    const { data } = await supabase
      .from('company_settings')
      .select('*')
      .limit(1)
      .maybeSingle()
    return data || {}
  } catch (err) {
    console.error('[stripe-webhook] settings load failed', err)
    return {}
  }
}
