/*
 * Signature Pianos — Stripe webhook receiver
 * ------------------------------------------
 * Vercel Node.js serverless function bound to /api/stripe-webhook in
 * vercel.json. Listens for checkout.session.completed (and
 * checkout.session.async_payment_succeeded, for payment methods that settle
 * later) and handles two kinds of session:
 *
 *   A. Website checkout (metadata.piano_id, metadata.type 'full' | 'deposit',
 *      from api/create-checkout-session.js):
 *      1. Upserts the customer row from session.customer_details.
 *      2. Inserts the orders row. stripe_session_id is UNIQUE, so a retried
 *         or duplicated event can never create a second order.
 *      3. Marks the piano sold (full) or reserved (deposit), only if it was
 *         still available. If it wasn't (two people paid at once, or it sold
 *         in the showroom meanwhile) the order is kept, since the money was
 *         taken, but flagged, the customer is not emailed, and Eric is told.
 *      4. Acoustic pianos: auto-creates the deliveries row (with
 *         preference_token) so the customer gets their preferences link.
 *      5. Emails the customer and pings the internal inbox.
 *
 *   B. Balance payment (metadata.type 'balance_payment' + metadata.order_id,
 *      from the Payment Link made by api/create-balance-payment-link.js):
 *      marks that deposit order paid and the piano sold, emails the customer
 *      their confirmation + tax invoice and pings the internal inbox.
 *
 * Deposit orders (the website deposit is a fixed $500): total is the piano's
 * full sale price inc GST, status 'pending', payment_method
 * 'deposit_paid_online', and the $500 paid is recorded on the line item and
 * in notes. Admin works out the balance as total − 500.
 *
 * Retries: anything that fails before the order row is saved returns 500 so
 * Stripe retries. Once it is saved we always return 200 (a retry would find
 * the order and stop), and any later step that fails is listed in an
 * "Action needed" email to the internal inbox instead.
 *
 * Required env (Vercel dashboard):
 *   STRIPE_SECRET_KEY            — Stripe API secret key
 *   STRIPE_WEBHOOK_SECRET        — whsec_... from the Stripe webhook endpoint
 *   SUPABASE_URL                 — Project URL
 *   SUPABASE_SERVICE_ROLE_KEY    — Service role key (server-only; also
 *                                  authorises our calls to /api/send-email)
 *   RESEND_API_KEY               — Resend API key (action-needed alerts)
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
const { Resend } = require('resend')
const { internalHeaders } = require('../lib/auth')
const { internalRecipients } = require('../lib/notify')
const { melbourneDate } = require('../lib/dates')
const { layout, p, details, note, button, esc, money } = require('../lib/email-brand')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const SITE_URL = (process.env.SITE_URL || 'https://signaturepianos.com.au').replace(/\/+$/, '')
const BUSINESS_EMAIL = process.env.BUSINESS_EMAIL || 'info@signaturepianos.com.au'
const FROM = 'Signature Pianos <info@signaturepianos.com.au>'
const DEPOSIT = 500   // the fixed website deposit, AUD inc GST
// Written into orders.notes when a payment came in for a piano that was no
// longer available; the retry repair below leaves those orders alone.
const CONFLICT_NOTE = 'CHECK: this piano was not available when the payment came in.'
// Only what the emails need: never pass cost or internal-note columns around.
const PIANO_COLS = 'id, brand, model, year, type, serial_number, sale_price, stock_status'
const CUSTOMER_COLS = 'id, first_name, last_name, email, phone, address_line1, address_line2, suburb, state, postcode, business_name, abn'

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
  if (!rawBody.length) {
    console.error('[stripe-webhook] empty body: was it parsed before this handler ran? (bodyParser must stay off)')
    return res.status(400).send('Empty body')
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
    if (event.type === 'checkout.session.completed' ||
        event.type === 'checkout.session.async_payment_succeeded') {
      await handleSession(event.data.object)
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

// Async iteration (not 'data'/'end' listeners) so a stream that has already
// been read resolves to an empty buffer instead of hanging until the timeout.
async function readRawBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks)
}

async function handleSession(session) {
  // Card payments are 'paid' on completion. A session still 'unpaid' settles
  // later and arrives again as checkout.session.async_payment_succeeded.
  if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
    console.log('[stripe-webhook] session not paid yet, waiting', session.id, session.payment_status)
    return
  }
  const meta = session.metadata || {}
  if (meta.type === 'balance_payment') return handleBalancePayment(session)
  if (!meta.piano_id) {
    console.warn('[stripe-webhook] no piano_id in session metadata — skipping', session.id)
    return
  }
  return handlePianoPurchase(session)
}

/* ============ A. Website checkout: full purchase or $500 deposit ============ */
async function handlePianoPurchase(session) {
  const meta = session.metadata || {}
  const pianoId = meta.piano_id
  // create-checkout-session sends 'full' | 'deposit'; sessions made before the
  // fix said 'full_purchase', which is also a full purchase.
  const type = meta.type === 'deposit' ? 'deposit' : 'full'
  const amountPaid = round2((session.amount_total || 0) / 100)
  const problems = []

  // ---- 1. Idempotency: bail if we've already processed this session id ----
  const { data: existingOrder, error: existingErr } = await supabase
    .from('orders')
    .select('id, piano_id, payment_method, status, voided, notes')
    .eq('stripe_session_id', session.id)
    .maybeSingle()
  if (existingErr) throw existingErr
  if (existingOrder) {
    console.log('[stripe-webhook] session already processed, skipping', session.id)
    await repairPianoStock(existingOrder)
    return
  }

  // ---- 2. Piano: line-item snapshot, and was it still for sale? ----------
  const { data: piano, error: pianoErr } = await supabase
    .from('pianos')
    .select(PIANO_COLS)
    .eq('id', pianoId)
    .maybeSingle()
  if (pianoErr) throw pianoErr
  const pianoLabel = pianoLabelOf(piano)

  // Deposit sessions made before the fix reserved the piano at checkout time
  // (no sale_price in their metadata); 'reserved' is expected for those.
  const legacyReserved = type === 'deposit' && !meta.sale_price && piano?.stock_status === 'reserved'
  let conflict = !piano || (piano.stock_status !== 'available' && !legacyReserved)
  if (!piano) {
    problems.push(`The piano on this payment (id ${pianoId}) is no longer in the database. The customer has not been emailed: contact them and refund or offer another piano.`)
  } else if (conflict) {
    problems.push(`${pianoLabel} was already ${piano.stock_status} when this payment came in, so it may have been sold twice. The customer has not been emailed: contact them and refund or offer another piano.`)
  }

  // ---- 3. Customer upsert from session.customer_details -------------------
  const customer = await upsertCustomer(session.customer_details || {})

  // ---- 4. Insert order (once this succeeds, we never return 500) ---------
  // Full purchase: total is what Stripe charged. Deposit: total is the full
  // sale price agreed at checkout, and the $500 is recorded as paid.
  const salePrice = round2(Number(meta.sale_price) || Number(piano?.sale_price) || 0)
  const total = type === 'deposit' ? Math.max(salePrice, amountPaid) : amountPaid
  const gst = round2(total / 11)
  const paidOn = melbourneDate()

  const lineItem = {
    description: pianoLabel,
    qty: 1,
    unit_price_inc_gst: total,
    amount_inc_gst: total,
  }
  if (type === 'deposit') {
    lineItem.deposit_paid_inc_gst = amountPaid
    lineItem.deposit_paid_on = paidOn
    lineItem.deposit_stripe_session_id = session.id
  }
  const notes = [
    conflict ? `${CONFLICT_NOTE} ${problems.join(' ')}` : '',
    type === 'deposit'
      ? `Reservation deposit of ${money(amountPaid)} paid online via Stripe on ${paidOn}. Balance owing: ${money(total - amountPaid)}.`
      : `Full purchase paid online via Stripe on ${paidOn}.`,
  ].filter(Boolean).join('\n')

  const orderPayload = {
    customer_id:       customer?.id || null,
    piano_id:          piano ? piano.id : null,
    status:            (type === 'deposit' || conflict) ? 'pending' : 'confirmed',
    subtotal:          total,
    subtotal_ex_gst:   round2(total - gst),
    gst_amount:        gst,
    discount:          0,
    total,
    currency:          (session.currency || 'aud').toUpperCase(),
    payment_method:    type === 'deposit' ? 'deposit_paid_online' : 'stripe',
    payment_reference: session.id,
    stripe_session_id: session.id,
    notes,
    line_items:        [lineItem],
  }
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert(orderPayload)
    .select('*')
    .single()
  if (orderErr) {
    // Two deliveries of the same event racing: the other one saved it.
    if (orderErr.code === '23505' && /stripe_session_id/.test(orderErr.message || '')) {
      console.log('[stripe-webhook] session saved by a concurrent delivery, skipping', session.id)
      return
    }
    throw orderErr
  }

  try {
    await finishPianoPurchase({ session, type, piano, pianoLabel, customer, order, amountPaid, conflict, problems })
  } catch (err) {
    // The order is saved; a 500 now would only make Stripe retry into step 1.
    console.error('[stripe-webhook] post-order step failed', err)
    problems.push(`Something failed after the order was saved: ${err.message || err}. Check the piano status, delivery record and customer emails by hand.`)
  }

  if (problems.length) {
    await sendInternalEmail({
      subject: `Action needed: online ${type === 'deposit' ? 'deposit' : 'sale'} — ${pianoLabel} (${order.order_number})`,
      label: 'Action needed',
      title: pianoLabel,
      intro: `A customer paid ${money(amountPaid)} online through Stripe, and the order was saved, but something needs a person to look at it.`,
      problems,
      rows: orderRows({ order, customer, pianoLabel, amountPaid, stripeSession: session.id }),
    })
  }
}

// Everything after the order row exists. Never throws on a failed step; it
// adds a line to `problems` so the action-needed email lists it.
async function finishPianoPurchase({ session, type, piano, pianoLabel, customer, order, amountPaid, conflict, problems }) {
  // ---- 5. Update piano stock_status --------------------------------------
  // Only flips a piano that is still 'available', so it can never overwrite
  // someone else's sale or reservation.
  if (!conflict && piano.stock_status === 'available') {
    const target = type === 'deposit' ? 'reserved' : 'sold'
    const { data: flipped, error: flipErr } = await supabase
      .from('pianos')
      .update({ stock_status: target })
      .eq('id', piano.id)
      .eq('stock_status', 'available')
      .select('id')
    if (flipErr) {
      problems.push(`Couldn't mark ${pianoLabel} as ${target} (${flipErr.message}). Change it in Inventory so it leaves the website.`)
    } else if (!flipped?.length) {
      conflict = true
      problems.push(`${pianoLabel} changed status while this payment was being recorded, so it may have been sold twice. The customer has not been emailed: contact them.`)
    }
  }

  // ---- 6. Piano-type gated delivery row ----------------------------------
  // Acoustic uprights and grands need a delivery row + preference link.
  // Digital pianos are collected from the showroom — no delivery row.
  const isAcoustic = isAcousticPiano(piano)

  let delivery = null
  if (isAcoustic && !conflict) {
    const { data: dlv, error: dlvErr } = await supabase
      .from('deliveries')
      .insert({
        order_id:     order.id,
        status:       'scheduled',
        auto_created: true,
      })
      .select('id, preference_token')
      .single()
    if (dlvErr) {
      // Don't throw — order is the source of truth, delivery can be created manually.
      console.error('[stripe-webhook] delivery insert failed', dlvErr)
      problems.push(`Couldn't create the delivery record (${dlvErr.message}), so the customer got no delivery-window link. Create the delivery from Deliveries.`)
    } else {
      delivery = dlv
    }
  }

  // ---- 7. Send customer confirmation (+ invoice) -------------------------
  // Not when the piano turned out to be unavailable: Eric contacts them.
  if (customer?.email && !conflict) {
    const failed = await sendCustomerEmails({
      paymentType:    type,
      customer,
      piano,
      order,
      pianoLabel,
      shownTotal:     amountPaid,
      isAcoustic,
      preferencesUrl: preferencesUrlFor(delivery),
    })
    problems.push(...failed)
  }

  // ---- 8. Internal notification ------------------------------------------
  const sentInternal = await postEmail({
    type:           'internal_sale_notification',
    email:          BUSINESS_EMAIL,
    customer:       fullName(customer),
    customer_email: customer?.email || session.customer_details?.email || '',
    piano_label:    pianoLabel,
    order_number:   order.order_number,
    total:          amountPaid,
    payment_type:   type,
    is_acoustic:    isAcoustic,
  })
  if (!sentInternal) problems.push('The usual "new sale" email to the inbox did not send.')
}

// A repeat of an event we already recorded. If the first attempt died between
// saving the order and updating the piano, finish that one step. Safe to
// repeat: it only touches a piano that is still 'available'. No emails here.
async function repairPianoStock(order) {
  if (!order.piano_id || order.voided || order.status === 'cancelled') return
  if (String(order.notes || '').includes(CONFLICT_NOTE)) return
  const target = order.payment_method === 'deposit_paid_online' ? 'reserved' : 'sold'
  const { error } = await supabase
    .from('pianos')
    .update({ stock_status: target })
    .eq('id', order.piano_id)
    .eq('stock_status', 'available')
  if (error) console.error('[stripe-webhook] stock repair failed', error)
}

/* ============ B. Balance payment on a deposit order ============ */
async function handleBalancePayment(session) {
  const meta = session.metadata || {}
  const orderId = meta.order_id
  const amountPaid = round2((session.amount_total || 0) / 100)
  const payer = session.customer_details || {}

  const alertUnmatched = (problem) => sendInternalEmail({
    subject: `Action needed: balance payment of ${money(amountPaid)} not matched to an order`,
    label: 'Action needed',
    title: 'Balance payment',
    intro: `A balance payment of ${money(amountPaid)} came in through Stripe but was not recorded against an order.`,
    problems: [problem],
    rows: [
      ['Paid by', esc([payer.name, payer.email].filter(Boolean).join(' · ') || '—')],
      ['Amount', money(amountPaid), true],
      ['Stripe session', esc(session.id)],
    ],
  })

  if (!orderId) {
    console.error('[stripe-webhook] balance payment without order_id', session.id)
    await alertUnmatched('The Stripe payment has no order_id. Find the order in admin and mark it paid by hand.')
    return
  }

  const { data: order, error } = await supabase
    .from('orders')
    .select(`*, customer:customer_id(${CUSTOMER_COLS}), piano:piano_id(${PIANO_COLS})`)
    .eq('id', orderId)
    .maybeSingle()
  if (error) throw error   // nothing written yet: let Stripe retry
  if (!order) {
    await alertUnmatched(`Order ${orderId} no longer exists. Check the payment in Stripe and refund or re-create the order.`)
    return
  }

  const pianoLabel = pianoLabelOf(order.piano)
  const rows = orderRows({ order, customer: order.customer, pianoLabel, amountPaid, stripeSession: session.id })

  // ---- 1. Idempotency: this session was already recorded on the order ----
  if (order.payment_reference === session.id) {
    console.log('[stripe-webhook] balance already processed, skipping', session.id)
    if (order.piano_id && !order.voided) {
      // Finish the piano step in case the first attempt died before it.
      const { error: soldErr } = await supabase.from('pianos').update({ stock_status: 'sold' }).eq('id', order.piano_id).neq('stock_status', 'sold')
      if (soldErr) console.error('[stripe-webhook] stock repair failed', soldErr)
    }
    return
  }

  const alertOrderState = (why) => sendInternalEmail({
    subject: `Action needed: extra balance payment — ${pianoLabel} (${order.order_number})`,
    label: 'Action needed',
    title: pianoLabel,
    intro: `A balance payment of ${money(amountPaid)} came in through Stripe for order ${order.order_number}.`,
    problems: [`${why} The customer may have paid twice: check Stripe and refund if so. Nothing was changed on the order.`],
    rows,
  })

  if (order.voided || ['paid', 'complete', 'cancelled'].includes(order.status)) {
    await alertOrderState(`That order is already ${order.voided ? 'voided' : order.status}.`)
    return
  }

  // ---- 2. Mark the order paid (only if nobody else just did) -------------
  const paidOn = melbourneDate()
  const { data: updatedRows, error: updErr } = await supabase
    .from('orders')
    .update({
      status:            'paid',
      payment_reference: session.id,
      notes:             [order.notes, `Balance of ${money(amountPaid)} paid online via Stripe on ${paidOn}.`].filter(Boolean).join('\n'),
    })
    .eq('id', order.id)
    .neq('status', 'paid')
    .select('*')
  if (updErr) throw updErr   // nothing written yet: let Stripe retry
  if (!updatedRows?.length) {
    // A concurrent delivery got there first. Only worth an alert if that was a different payment.
    const { data: now } = await supabase.from('orders').select('payment_reference').eq('id', order.id).maybeSingle()
    if (now && now.payment_reference !== session.id) await alertOrderState('That order was marked paid by another payment moments earlier.')
    return
  }
  const paidOrder = updatedRows[0]

  // ---- 3. Everything after the order is paid never returns 500 -----------
  const problems = []
  const expected = round2(Number(order.total || 0) - DEPOSIT)
  if (Math.abs(amountPaid - expected) > 0.01) {
    problems.push(`Stripe took ${money(amountPaid)} but the order total minus the $500 deposit is ${money(expected)}. Check the order total.`)
  }
  const isAcoustic = isAcousticPiano(order.piano)

  try {
    if (order.piano_id) {
      const { error: soldErr } = await supabase.from('pianos').update({ stock_status: 'sold' }).eq('id', order.piano_id)
      if (soldErr) problems.push(`Couldn't mark ${pianoLabel} as sold (${soldErr.message}). Change it in Inventory.`)
    }

    if (order.customer?.email) {
      // The delivery row (acoustic) was made when the deposit came in. Only
      // repeat the delivery-window link if they haven't chosen windows yet.
      let delivery = null
      if (isAcoustic) {
        const { data: dlv } = await supabase
          .from('deliveries')
          .select('id, preference_token, customer_preferences_submitted')
          .eq('order_id', order.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (dlv && !dlv.customer_preferences_submitted) delivery = dlv
      }
      const failed = await sendCustomerEmails({
        paymentType:    'full',
        customer:       order.customer,
        piano:          order.piano,
        order:          paidOrder,
        pianoLabel,
        shownTotal:     paidOrder.total,
        isAcoustic,
        preferencesUrl: preferencesUrlFor(delivery),
      })
      problems.push(...failed)
    } else {
      problems.push('The order has no customer email, so no confirmation or invoice was sent.')
    }
  } catch (err) {
    console.error('[stripe-webhook] balance post-payment step failed', err)
    problems.push(`Something failed after the order was marked paid: ${err.message || err}. Check the piano status and customer emails by hand.`)
  }

  // ---- 4. Internal notification (with any problems) ----------------------
  await sendInternalEmail({
    subject: `${problems.length ? 'Action needed: ' : ''}Balance paid — ${pianoLabel} (${order.order_number})`,
    label: problems.length ? 'Action needed' : 'Balance paid',
    title: pianoLabel,
    intro: `The balance has been paid online through Stripe. Order ${order.order_number} is now marked paid and the piano sold.`,
    problems,
    rows,
  })
}

/* ============ Shared helpers ============ */

// Find the customer by email (case-insensitive) or create them. On a
// returning customer only fill in what Stripe actually gave us, so a sparse
// checkout never blanks out a phone number or address we already hold.
async function upsertCustomer(cd) {
  const email = String(cd.email || '').trim()
  if (!email) return null

  // customers.first_name / last_name are NOT NULL: a one-word name gets ''.
  const nameParts = String(cd.name || '').trim().split(/\s+/).filter(Boolean)
  const first_name = nameParts[0] || ''
  const last_name = nameParts.slice(1).join(' ')
  const a = cd.address || {}
  const contact = nonEmpty({
    phone:         cd.phone,
    address_line1: a.line1,
    address_line2: a.line2,
    suburb:        a.city,
    state:         a.state,
    postcode:      a.postal_code,
  })

  const findByEmail = async () => {
    const { data: exact, error: exactErr } = await supabase
      .from('customers')
      .select(CUSTOMER_COLS)
      .eq('email', email)
      .limit(1)
    if (exactErr) throw exactErr
    if (exact?.length) return exact[0]
    // Then case-insensitively: ilike with LIKE wildcards escaped, plus an
    // exact lower-case check in JS so nothing but this address can match.
    const { data, error } = await supabase
      .from('customers')
      .select(CUSTOMER_COLS)
      .ilike('email', email.replace(/[\\%_]/g, (c) => '\\' + c))
      .order('created_at', { ascending: true })
      .limit(10)
    if (error) throw error
    return (data || []).find(c => String(c.email || '').toLowerCase() === email.toLowerCase()) || null
  }

  const existing = await findByEmail()
  if (existing) {
    const patch = { ...contact }
    // Keep a name we already hold: the cardholder isn't always the buyer.
    if (!existing.first_name && first_name) patch.first_name = first_name
    if (!existing.last_name && last_name) patch.last_name = last_name
    if (Object.keys(patch).length) {
      const { error } = await supabase.from('customers').update(patch).eq('id', existing.id)
      // Contact details are nice to have; don't lose the sale over them.
      if (error) { console.error('[stripe-webhook] customer update failed', error); return existing }
    }
    return { ...existing, ...patch }
  }

  const { data: created, error: insErr } = await supabase
    .from('customers')
    .insert({ email, first_name, last_name, ...contact })
    .select(CUSTOMER_COLS)
    .single()
  if (insErr) {
    if (insErr.code === '23505') {
      const again = await findByEmail()   // created by a concurrent event
      if (again) return again
    }
    throw insErr   // nothing else written yet: let Stripe retry
  }
  return created
}

// Customer emails, all through /api/send-email. Returns a line per failure.
//   deposit            → purchase_confirmation (no invoice: balance still owing)
//   full, acoustic     → purchase_confirmation w/ preference link + send_invoice
//   full, digital      → digital_order_confirmation (collection note + invoice)
async function sendCustomerEmails({ paymentType, customer, piano, order, pianoLabel, shownTotal, isAcoustic, preferencesUrl }) {
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

  const jobs = []
  if (paymentType === 'deposit' || isAcoustic) {
    jobs.push(['confirmation', {
      type:            'purchase_confirmation',
      email:           customer.email,
      first_name:      customer.first_name || '',
      last_name:       customer.last_name || '',
      piano_label:     pianoLabel,
      order_number:    order.order_number,
      total:           shownTotal,
      payment_type:    paymentType,
      preferences_url: preferencesUrl || '',
    }])
  }
  if (paymentType === 'full' && isAcoustic) {
    // A separate invoice email so the inbox shows two clear items:
    // a warm confirmation and a printable tax invoice.
    jobs.push(['tax invoice', { type: 'send_invoice', customer, piano, order: orderForEmail, settings }])
  }
  if (paymentType === 'full' && !isAcoustic) {
    jobs.push(['confirmation and tax invoice', { type: 'digital_order_confirmation', customer, piano, order: orderForEmail, settings }])
  }

  const results = await Promise.all(jobs.map(([, payload]) => postEmail(payload)))
  return jobs
    .filter((job, i) => !results[i])
    .map(([what]) => `The customer's ${what} email did not send. Send it to ${customer.email} from Orders.`)
}

// POST to /api/send-email as a trusted server-side caller. True on a 2xx.
async function postEmail(payload) {
  try {
    const r = await fetch(`${SITE_URL}/api/send-email`, {
      method: 'POST',
      headers: internalHeaders(),
      body: JSON.stringify(payload),
    })
    if (!r.ok) {
      console.error('[stripe-webhook] send-email', payload.type, r.status, await r.text().catch(() => ''))
      return false
    }
    return true
  } catch (err) {
    console.error('[stripe-webhook] send-email', payload.type, 'failed', err)
    return false
  }
}

// Internal email sent straight through Resend (not /api/send-email), so a
// problem with that route can't also swallow the alert. Never throws.
async function sendInternalEmail({ subject, label, title, intro, problems = [], rows = [] }) {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const body = `
      ${p(esc(intro), { muted: true, first: true })}
      ${problems.length ? note(problems.map(esc).join('<br><br>'), 'alert') : ''}
      ${details(rows)}
      ${button(`${SITE_URL}/admin/orders.html`, 'Open orders')}
    `
    const { error } = await resend.emails.send({
      from:    FROM,
      to:      internalRecipients(),
      subject,
      html:    layout({ internal: true, preview: problems[0] || intro, label, title: esc(title), body }),
    })
    if (error) console.error('[stripe-webhook] internal email failed', error)
  } catch (err) {
    console.error('[stripe-webhook] internal email failed', err)
  }
}

function orderRows({ order, customer, pianoLabel, amountPaid, stripeSession }) {
  return [
    ['Piano', esc(pianoLabel), true],
    ['Customer', esc([fullName(customer), customer?.email].filter(Boolean).join(' · ') || '—')],
    ['Order', esc(`${order.order_number || '—'} · invoice ${order.invoice_number || '—'}`)],
    ['Paid now', money(amountPaid), true],
    ['Order total', money(order.total)],
    ['Stripe session', esc(stripeSession)],
  ]
}

function preferencesUrlFor(delivery) {
  return delivery?.preference_token
    ? `${SITE_URL}/delivery-preferences.html?token=${encodeURIComponent(delivery.preference_token)}`
    : ''
}

function isAcousticPiano(piano) {
  return piano?.type === 'acoustic_upright' || piano?.type === 'acoustic_grand'
}

function pianoLabelOf(piano) {
  return [piano?.brand, piano?.model, piano?.year].filter(Boolean).join(' ') || 'Piano'
}

function fullName(c) {
  return `${c?.first_name || ''} ${c?.last_name || ''}`.trim()
}

function nonEmpty(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    const s = v == null ? '' : String(v).trim()
    if (s) out[k] = s
  }
  return out
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100
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
