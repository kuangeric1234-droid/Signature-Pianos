/*
 * Signature Pianos — Eric's countersignature receiver
 * ---------------------------------------------------
 * POST /api/countersign-contract
 * Auth: admin bearer token (admin/countersign.html sends it automatically
 *       via admin-auth.js).
 * Body: { token, plan_id, signature_data }
 *
 *   1. Checks the caller is an active admin, then that the countersign_token
 *      matches the plan_id.
 *   2. Refuses unless the customer has signed, and refuses to overwrite an
 *      already-countersigned or cancelled contract.
 *   3. Uploads Eric's signature PNG to the private `contracts` bucket
 *      as {plan_number}-countersig-{ts}.png (a failed upload stops here).
 *   4. Marks payment_plans.countersigned + fully_executed + status='active'.
 *      countersigned_by is the signed-in admin's name and countersigned_at
 *      is server time — neither is taken from the request.
 *   5. For acoustic pianos: auto-creates an order (if plan.order_id is
 *      null; order/invoice numbers come from the DB sequences) linked back
 *      to the plan, and a deliveries row (tokens from the DB defaults),
 *      marks the piano stock_status='reserved', and sets
 *      delivery_triggered = true — only once the delivery row exists.
 *   6. Sends the customer the fully-executed agreement email + a delivery
 *      preferences link (only if the delivery row was created), and
 *      notifies Eric. Anything that didn't happen comes back in
 *      `warnings` so the page can say so.
 *
 * The countersign_token alone is NOT enough: it used to be readable by
 * anyone through the old anon policy on payment_plans, so admin auth is the
 * real gate here.
 */

const crypto           = require('crypto')
const { createClient } = require('@supabase/supabase-js')
const { Resend }       = require('resend')
const { internalRecipients } = require('../lib/notify')
const { requireAdmin, sendAuthError } = require('../lib/auth')
const { melbourneDate } = require('../lib/dates')
const {
  C, TEXT, esc, layout, hello, p, h2, details, note, button, divider, signOff,
} = require('../lib/email-brand')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
const resend = new Resend(process.env.RESEND_API_KEY)

const SITE_URL       = process.env.SITE_URL       || 'https://signaturepianos.com.au'
const BUSINESS_EMAIL = process.env.BUSINESS_EMAIL || 'info@signaturepianos.com.au'
const FROM           = 'Signature Pianos <hello@signaturepianos.com.au>'

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // ---- 0. Admin only ------------------------------------------------------
  let admin
  try { admin = await requireAdmin(req) } catch (e) { return sendAuthError(res, e) }

  const {
    token, plan_id,
    signature_data,
  } = req.body || {}

  if (!token || !plan_id || !signature_data) {
    return res.status(400).json({ error: 'Missing required fields' })
  }
  if (typeof token !== 'string' || typeof plan_id !== 'string' || typeof signature_data !== 'string'
      || !/^data:image\/png;base64,/.test(signature_data)) {
    return res.status(400).json({ error: 'Invalid request' })
  }

  // Recorded on the contract: whoever is signed in, not what the page typed.
  const countersigned_by = `${admin.first_name || ''} ${admin.last_name || ''}`.trim() || admin.email || 'Signature Pianos'

  try {
    // ---- 1. Token check ---------------------------------------------------
    const { data: plan, error: planErr } = await supabase
      .from('payment_plans')
      .select(`*, customer:customer_id(*), piano:piano_id(*)`)
      .eq('id', plan_id)
      .eq('countersign_token', token)
      .maybeSingle()
    if (planErr) throw planErr
    if (!plan)   return res.status(404).json({ error: 'Plan not found' })

    if (plan.countersigned) {
      return res.status(400).json({ error: 'Already countersigned' })
    }
    if (!plan.contract_signed) {
      return res.status(409).json({ error: 'The customer has not signed this contract yet.' })
    }
    if (plan.status === 'cancelled') {
      return res.status(409).json({ error: 'This payment plan has been cancelled.' })
    }

    const customer = plan.customer || {}
    const piano    = plan.piano    || {}
    const warnings = []

    // ---- 2. Fetch settings + instalments for emails ----------------------
    let settings = {}
    let instalments = []
    try {
      const [{ data: s }, { data: ins }] = await Promise.all([
        supabase.from('company_settings').select('*').limit(1).maybeSingle(),
        supabase.from('payment_instalments').select('*').eq('payment_plan_id', plan_id).order('instalment_number'),
      ])
      settings    = s   || {}
      instalments = ins || []
    } catch (e) {
      console.error('[countersign] settings/instalments load failed (non-fatal)', e)
    }

    // ---- 3. Upload Eric's signature PNG ----------------------------------
    // Required: without it there is no countersignature on file.
    let countersignatureUrl = null
    try {
      const base64 = signature_data.replace(/^data:image\/\w+;base64,/, '')
      const buffer = Buffer.from(base64, 'base64')
      if (!buffer.length) throw new Error('Empty signature image')
      const filename = `${plan.plan_number}-countersig-${Date.now()}.png`

      const { data: uploadData, error: upErr } = await supabase.storage
        .from('contracts')
        .upload(filename, buffer, { contentType: 'image/png', upsert: false })
      if (upErr) throw upErr
      countersignatureUrl = uploadData.path
    } catch (uploadErr) {
      console.error('[countersign] storage upload failed', uploadErr)
      return res.status(500).json({ error: "Couldn't save your signature. Nothing was changed; please try again." })
    }

    // ---- 4. Flip plan to fully executed -----------------------------------
    // Server time only. The countersigned guard stops a double submit from
    // executing twice (and creating a second order/delivery).
    const countersignedAtIso = new Date().toISOString()
    const { data: flipped, error: updErr } = await supabase
      .from('payment_plans')
      .update({
        countersigned:     true,
        countersigned_at:  countersignedAtIso,
        countersigned_by:  countersigned_by,
        countersign_url:   countersignatureUrl,
        fully_executed:    true,
        fully_executed_at: countersignedAtIso,
        status:            'active',
      })
      .eq('id', plan_id)
      .not('countersigned', 'is', true)
      .select('id')
    if (updErr) throw updErr
    if (!flipped || !flipped.length) {
      return res.status(400).json({ error: 'Already countersigned' })
    }

    // ---- 5. Acoustic-only: auto-create delivery -------------------------
    const isAcoustic = piano.type === 'acoustic_upright' || piano.type === 'acoustic_grand'

    let preferenceToken = null
    let deliveryCreated = false
    if (isAcoustic && !plan.delivery_triggered) {
      // Re-use the plan's existing order_id if present, otherwise create
      // a confirmed order so the deliveries row has a parent to FK into.
      // order_number / invoice_number are left to the DB sequences
      // (generate_order_number / generate_invoice_number); hand-built
      // numbers collided with them.
      let orderId = plan.order_id
      if (!orderId) {
        const total = Number(plan.total_with_surcharge || plan.total_amount || 0)
        const gst   = Math.round((total / 11) * 100) / 100
        const lineItems = [{
          description:        `${pianoName(piano)} (payment plan ${plan.plan_number})`,
          qty:                1,
          unit_price_inc_gst: Number(plan.total_amount || 0),
          amount_inc_gst:     Number(plan.total_amount || 0),
        }]
        if (Number(plan.surcharge_amount) > 0) {
          lineItems.push({
            description:        `Credit card surcharge (${plan.surcharge_percentage || 1.5}%)`,
            qty:                1,
            unit_price_inc_gst: Number(plan.surcharge_amount),
            amount_inc_gst:     Number(plan.surcharge_amount),
          })
        }

        const { data: newOrder, error: orderErr } = await supabase
          .from('orders')
          .insert({
            customer_id:       plan.customer_id,
            piano_id:          plan.piano_id,
            status:            'confirmed',
            subtotal:          total,
            subtotal_ex_gst:   Math.round((total - gst) * 100) / 100,
            gst_amount:        gst,
            discount:          0,
            total,
            currency:          'AUD',
            payment_method:    plan.payment_method === 'credit_card'
              ? 'Credit card (payment plan)'
              : 'Bank transfer (payment plan)',
            payment_reference: plan.plan_number,
            notes:             `Created when payment plan ${plan.plan_number} was fully executed.`,
            line_items:        lineItems,
          })
          .select('id')
          .single()
        if (orderErr || !newOrder?.id) {
          console.error('[countersign] order auto-create failed', orderErr)
          warnings.push('The order was not created, so no delivery was scheduled. Create the order and delivery by hand.')
        } else {
          orderId = newOrder.id

          // Link the plan back to the new order so future flows can reuse it.
          const { error: linkErr } = await supabase
            .from('payment_plans')
            .update({ order_id: orderId })
            .eq('id', plan_id)
          if (linkErr) {
            console.error('[countersign] linking order to plan failed', linkErr)
            warnings.push('The order was created but not linked to this plan.')
          }
        }
      }

      // An order the plan was linked to at creation may already have a
      // delivery (e.g. from an online deposit); reuse it, don't add another.
      if (orderId && plan.order_id) {
        const { data: existing, error: exErr } = await supabase
          .from('deliveries')
          .select('id, preference_token')
          .eq('order_id', orderId)
          .limit(1)
        if (exErr) console.error('[countersign] existing delivery lookup failed', exErr)
        if (existing && existing.length) {
          deliveryCreated = true
          preferenceToken = existing[0].preference_token || null
        }
      }

      // Create the deliveries row (only if we have an order to FK into).
      // pickup / delivery / preference tokens come from the column
      // defaults (generate_token()); the acceptance token has no default.
      if (orderId && !deliveryCreated) {
        const { data: delivery, error: delErr } = await supabase
          .from('deliveries')
          .insert({
            order_id:         orderId,
            status:           'scheduled',
            auto_created:     true,
            acceptance_token: crypto.randomBytes(24).toString('base64url'),
          })
          .select('id, preference_token')
          .single()
        if (delErr || !delivery?.id) {
          console.error('[countersign] delivery insert failed', delErr)
          warnings.push('The delivery was not created. Create it from the Deliveries page.')
        } else {
          deliveryCreated = true
          preferenceToken = delivery.preference_token || null
        }
      }

      // Mark the piano reserved (not sold — only sold when fully paid).
      if (plan.piano_id) {
        const { error: pianoErr } = await supabase.from('pianos')
          .update({ stock_status: 'reserved' })
          .eq('id', plan.piano_id)
        if (pianoErr) {
          console.error('[countersign] piano reserve failed', pianoErr)
          warnings.push('The piano could not be marked reserved in inventory.')
        }
      }

      // Flag on the plan — only when there really is a delivery.
      if (deliveryCreated) {
        const { error: flagErr } = await supabase
          .from('payment_plans')
          .update({
            delivery_triggered:    true,
            delivery_triggered_at: new Date().toISOString(),
          })
          .eq('id', plan_id)
        if (flagErr) console.error('[countersign] delivery_triggered flag failed', flagErr)
      }
    }

    const preferenceUrl = preferenceToken
      ? `${SITE_URL}/delivery-preferences.html?token=${encodeURIComponent(preferenceToken)}`
      : null

    // ---- 6. Emails (customer fully executed + Eric notification) ---------
    // formatCurrency / formatDate live at the bottom of this file.
    // Resend returns { error } rather than throwing.
    let customerEmailed = false
    try {
      if (customer.email) {
        const { error: mailErr } = await resend.emails.send({
          from: FROM,
          to:   customer.email,
          subject: `Your payment plan is fully executed — ${plan.plan_number} · Signature Pianos`,
          html: fullyExecutedCustomerEmail({
            customer, piano, plan, instalments,
            settings, formatCurrency, formatDate,
            preferenceUrl, isAcoustic,
          }),
        })
        if (mailErr) console.error('[countersign] customer email failed', mailErr)
        else customerEmailed = true
      }
    } catch (mailErr) {
      console.error('[countersign] customer email failed', mailErr)
    }
    if (!customerEmailed) warnings.push('The executed agreement email to the customer did not send.')

    try {
      const { error: mailErr } = await resend.emails.send({
        from: FROM,
        to:   internalRecipients(),
        subject: `Contract fully executed — ${plan.plan_number} · ${customer.first_name || ''} ${customer.last_name || ''}`,
        html: executedInternalEmail({
          customer, piano, plan, countersigned_by, countersignedAtIso,
          isAcoustic, formatCurrency, formatDate,
          deliveryCreated: deliveryCreated || !!plan.delivery_triggered,
          warnings,
        }),
      })
      if (mailErr) console.error('[countersign] Eric email failed', mailErr)
    } catch (mailErr) {
      console.error('[countersign] Eric email failed', mailErr)
    }

    return res.status(200).json({
      success:          true,
      is_acoustic:      isAcoustic,
      delivery_created: deliveryCreated || !!plan.delivery_triggered,
      customer_emailed: customerEmailed,
      warnings,
    })
  } catch (err) {
    console.error('[countersign] handler failed', err)
    return res.status(500).json({ error: err.message || 'Countersign failed' })
  }
}

/* ============================================================================
   Formatters shared by the handler and the emails below
   ============================================================================ */
function formatCurrency(v) {
  return '$' + Math.abs(v || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(d) {
  if (!d) return '—'
  const [y, m, day] = (String(d).split('T')[0]).split('-')
  return `${day}/${m}/${y}`
}

/* Defaults for the templates, so a preview can call them without passing the formatters. */
const FORMATTERS = { formatCurrency, formatDate }

function pianoName(piano) {
  return `${piano?.brand || ''} ${piano?.model || ''} ${piano?.year || ''}`.trim() || 'Piano'
}

/* The payment schedule: a line-item table in the kit's detail-table style
   (hairline rules, tracked-caps column labels, Jost). */
function scheduleTable(instalments, formatCurrency, formatDate) {
  const th = (text, align = 'left') =>
    `<th style="padding:0 0 9px;border-bottom:1px solid ${C.ivoryDeep};font-family:${TEXT};font-size:11px;line-height:16px;letter-spacing:2px;text-transform:uppercase;font-weight:400;color:${C.inkSoft};text-align:${align};">${text}</th>`
  const td = (html, align = 'left', color = C.ink) =>
    `<td style="padding:10px 0;border-bottom:1px solid ${C.ivoryDeep};font-family:${TEXT};font-size:15px;line-height:22px;color:${color};text-align:${align};vertical-align:top;">${html}</td>`
  const rows = (instalments || []).map(ins => `
    <tr>
      ${td(esc(ins.instalment_number), 'left', C.inkSoft)}
      ${td(esc(formatDate(ins.due_date)))}
      ${td(formatCurrency(ins.amount), 'right')}
    </tr>`).join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;">
    <tr>${th('#')}${th('Due date')}${th('Amount', 'right')}</tr>
    ${rows}
  </table>`
}

/* ============================================================================
   Customer — fully executed agreement email
   ============================================================================ */
function fullyExecutedCustomerEmail({
  customer, piano, plan, instalments,
  settings, formatCurrency = FORMATTERS.formatCurrency,
  formatDate = FORMATTERS.formatDate,
  preferenceUrl, isAcoustic,
}) {
  const body = `
    ${hello(customer?.first_name)}
    ${p('Your payment plan agreement has been signed by both parties and is now fully executed. Please keep this email for your records.')}
    ${note(`<strong>Fully executed agreement</strong><br>${esc(plan.plan_number)} · Signed by both parties`, 'mist')}

    ${h2('Agreement summary')}
    ${details([
      ['Piano', esc(pianoName(piano)), true],
      ['Total', formatCurrency(plan.total_with_surcharge || plan.total_amount), true],
      ['Deposit', `${formatCurrency(plan.deposit_amount)}${plan.deposit_paid ? ' (paid)' : Number(plan.deposit_amount) > 0 ? ' (due)' : ''}`],
      ['Instalments', `${esc(plan.number_of_instalments)} × ${formatCurrency(plan.instalment_amount)} ${esc(plan.instalment_frequency || '')}`.trim()],
      ['Payment method', plan.payment_method === 'credit_card'
        ? `Credit card ···· ${esc(plan.card_last_four)}`
        : 'Bank transfer'],
    ])}

    ${h2('Your payment schedule')}
    ${scheduleTable(instalments, formatCurrency, formatDate)}

    ${plan.payment_method === 'bank_transfer' && settings?.bank_bsb ? `
      ${h2('Payment details')}
      ${details([
        ['BSB', esc(settings.bank_bsb)],
        ['Account', esc(settings.bank_account)],
        ['Account name', esc(settings.bank_account_name)],
        ['Reference', esc(plan.plan_number), true],
      ])}
    ` : ''}

    ${isAcoustic && preferenceUrl ? `
      ${h2('Next step: choose your delivery times')}
      ${p('Please let us know 3 preferred delivery windows and we will arrange delivery of your piano.')}
      ${button(preferenceUrl, 'Choose delivery times')}
    ` : ''}

    ${signOff()}
    ${divider()}
    ${p('By signing this agreement you confirmed acceptance of the Signature Pianos payment plan terms and conditions. The instrument remains the property of Signature Pianos until all payments are received in full. This piano is covered by the Signature Pianos 10-year warranty from the date of delivery.', { muted: true, small: true })}
  `
  return layout({
    preview: `Your payment plan ${plan.plan_number} is signed by both parties and fully executed.`,
    label: 'Payment plan agreement',
    title: 'Your agreement is confirmed',
    body,
    footnote: settings?.abn ? `ABN ${esc(settings.abn)}` : '',
  })
}

/* ============================================================================
   Eric — contract fully executed notification
   ============================================================================ */
function executedInternalEmail({
  customer, piano, plan, countersigned_by, countersignedAtIso,
  isAcoustic, formatCurrency = FORMATTERS.formatCurrency,
  formatDate = FORMATTERS.formatDate,
  deliveryCreated = true, warnings = [],
}) {
  const name = `${customer?.first_name || ''} ${customer?.last_name || ''}`.trim()
  const body = `
    ${p('Both signatures are in. The payment plan is now active.', { first: true })}
    ${details([
      ['Customer', `${esc(name)}<br><a href="mailto:${esc(customer?.email || '')}" style="color:${C.ink};">${esc(customer?.email || '')}</a>`, true],
      ['Plan', esc(plan.plan_number), true],
      ['Piano', esc(pianoName(piano))],
      ['Total', formatCurrency(plan.total_with_surcharge || plan.total_amount), true],
      ['Deposit', `${formatCurrency(plan.deposit_amount)}${plan.deposit_paid ? ' (paid)' : Number(plan.deposit_amount) > 0 ? ' (not yet paid)' : ''}`],
      ['Countersigned by', esc(countersigned_by)],
      ['Executed', esc(formatDate(countersignedAtIso ? melbourneDate(new Date(countersignedAtIso)) : null))],
    ])}
    ${!isAcoustic
      ? note('Digital piano. No delivery created.')
      : deliveryCreated
        ? note('<strong>Delivery record created.</strong> The customer has been sent the delivery preference link.', 'mist')
        : note('<strong>Delivery NOT scheduled.</strong> Create the order and delivery by hand from the admin.', 'alert')}
    ${warnings && warnings.length
      ? note(`<strong>Needs attention</strong><br>${warnings.map(w => esc(w)).join('<br>')}`, 'alert')
      : ''}
  `
  return layout({
    preview: `${plan.plan_number} · ${name} · fully executed`,
    label: 'For Signature Pianos',
    title: 'Contract fully executed',
    body,
    internal: true,
  })
}

// Template functions, exposed for email previews. The default export above
// (the API handler) is unchanged.
module.exports.templates = {
  fullyExecutedCustomerEmail,
  executedInternalEmail,
}
