/*
 * Signature Pianos — Eric's countersignature receiver
 * ---------------------------------------------------
 * POST /api/countersign-contract
 * Body: { token, plan_id, signature_data, countersigned_by,
 *         countersigned_at }
 *
 *   1. Verifies the countersign_token matches the plan_id.
 *   2. Refuses to overwrite an already-countersigned contract.
 *   3. Uploads Eric's signature PNG to the private `contracts` bucket
 *      as {plan_number}-countersig-{ts}.png.
 *   4. Marks payment_plans.countersigned + fully_executed + status='active'.
 *   5. For acoustic pianos: auto-creates an order (if plan.order_id is
 *      null) and a deliveries row with pickup / delivery / acceptance /
 *      preference tokens, marks the piano stock_status='reserved', and
 *      sets delivery_triggered = true.
 *   6. Sends the customer the fully-executed agreement email + a delivery
 *      preferences link (acoustic only), and notifies Eric.
 *
 * Token verification is the security boundary. Even though this lives
 * under /admin/countersign.html (which requires admin auth), the API
 * itself only validates the countersign_token — same pattern as
 * sign-contract.js, so a leaked token alone isn't enough (the page also
 * requires an admin Supabase session).
 */

const { createClient } = require('@supabase/supabase-js')
const { Resend }       = require('resend')
const { internalRecipients } = require('../lib/notify')
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

  const {
    token, plan_id,
    signature_data,
    countersigned_by,
    countersigned_at,
  } = req.body || {}

  if (!token || !plan_id || !countersigned_by) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

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

    const customer = plan.customer || {}
    const piano    = plan.piano    || {}

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
    let countersignatureUrl = null
    if (signature_data) {
      try {
        const base64 = signature_data.replace(/^data:image\/\w+;base64,/, '')
        const buffer = Buffer.from(base64, 'base64')
        const filename = `${plan.plan_number}-countersig-${Date.now()}.png`

        const { data: uploadData, error: upErr } = await supabase.storage
          .from('contracts')
          .upload(filename, buffer, { contentType: 'image/png', upsert: false })
        if (upErr) throw upErr
        countersignatureUrl = uploadData.path
      } catch (uploadErr) {
        console.error('[countersign] storage upload failed (non-fatal)', uploadErr)
      }
    }

    // ---- 4. Flip plan to fully executed -----------------------------------
    const countersignedAtIso = countersigned_at || new Date().toISOString()
    const { error: updErr } = await supabase
      .from('payment_plans')
      .update({
        countersigned:     true,
        countersigned_at:  countersignedAtIso,
        countersigned_by:  countersigned_by,
        countersign_url:   countersignatureUrl,
        fully_executed:    true,
        fully_executed_at: new Date().toISOString(),
        status:            'active',
      })
      .eq('id', plan_id)
    if (updErr) throw updErr

    // ---- 5. Acoustic-only: auto-create delivery -------------------------
    const isAcoustic = piano.type === 'acoustic_upright' || piano.type === 'acoustic_grand'

    let preferenceToken = null
    if (isAcoustic && !plan.delivery_triggered) {
      preferenceToken = randomToken()
      const pickupToken     = randomToken()
      const deliveryToken   = randomToken()
      const acceptanceToken = randomToken()

      // Re-use the plan's existing order_id if present, otherwise create
      // a confirmed order so the deliveries row has a parent to FK into.
      let orderId = plan.order_id
      if (!orderId) {
        try {
          const year = new Date().getFullYear()
          const { data: existingOrders } = await supabase
            .from('orders')
            .select('order_number')
            .ilike('order_number', `SP-${year}-%`)
            .order('order_number', { ascending: false })
            .limit(1)
          const lastNum = existingOrders?.[0]?.order_number
            ? parseInt(existingOrders[0].order_number.split('-')[2], 10) || 0
            : 0
          const orderNumber = `SP-${year}-${String(lastNum + 1).padStart(5, '0')}`

          const { data: newOrder, error: orderErr } = await supabase
            .from('orders')
            .insert({
              customer_id:    plan.customer_id,
              piano_id:       plan.piano_id,
              order_number:   orderNumber,
              invoice_number: plan.plan_number.replace('PP-', 'INV-'),
              status:         'confirmed',
              subtotal:       plan.total_amount,
              total:          plan.total_amount,
              currency:       'AUD',
              payment_method: plan.payment_method === 'credit_card'
                ? 'Credit card (payment plan)'
                : 'Bank transfer (payment plan)',
            })
            .select()
            .single()
          if (orderErr) throw orderErr
          orderId = newOrder?.id

          // Link the plan back to the new order so future flows can reuse it.
          if (orderId) {
            await supabase
              .from('payment_plans')
              .update({ order_id: orderId })
              .eq('id', plan_id)
          }
        } catch (e) {
          console.error('[countersign] order auto-create failed (non-fatal)', e)
        }
      }

      // Create the deliveries row (only if we have an order to FK into).
      if (orderId) {
        try {
          const { error: delErr } = await supabase
            .from('deliveries')
            .insert({
              order_id:                       orderId,
              status:                         'scheduled',
              auto_created:                   true,
              preference_token:               preferenceToken,
              pickup_link_token:              pickupToken,
              delivery_link_token:            deliveryToken,
              acceptance_token:               acceptanceToken,
              customer_preferences_submitted: false,
              customer_notified_pickup:       false,
              customer_notified_delivery:     false,
            })
          if (delErr) throw delErr
        } catch (e) {
          console.error('[countersign] delivery insert failed (non-fatal)', e)
        }
      }

      // Mark the piano reserved (not sold — only sold when fully paid).
      try {
        await supabase.from('pianos')
          .update({ stock_status: 'reserved' })
          .eq('id', plan.piano_id)
      } catch (e) {
        console.error('[countersign] piano reserve failed (non-fatal)', e)
      }

      // Flag on the plan
      await supabase
        .from('payment_plans')
        .update({
          delivery_triggered:    true,
          delivery_triggered_at: new Date().toISOString(),
        })
        .eq('id', plan_id)
    }

    const preferenceUrl = preferenceToken
      ? `${SITE_URL}/delivery-preferences.html?token=${preferenceToken}`
      : null

    // ---- 6. Emails (customer fully executed + Eric notification) ---------
    // formatCurrency / formatDate live at the bottom of this file.
    try {
      if (customer.email) {
        await resend.emails.send({
          from: FROM,
          to:   customer.email,
          subject: `Your payment plan is fully executed — ${plan.plan_number} · Signature Pianos`,
          html: fullyExecutedCustomerEmail({
            customer, piano, plan, instalments,
            settings, formatCurrency, formatDate,
            preferenceUrl, isAcoustic,
          }),
        })
      }
    } catch (mailErr) {
      console.error('[countersign] customer email failed', mailErr)
    }

    try {
      await resend.emails.send({
        from: FROM,
        to:   internalRecipients(),
        subject: `Contract fully executed — ${plan.plan_number} · ${customer.first_name} ${customer.last_name}`,
        html: executedInternalEmail({
          customer, piano, plan, countersigned_by, countersignedAtIso,
          isAcoustic, formatCurrency, formatDate,
        }),
      })
    } catch (mailErr) {
      console.error('[countersign] Eric email failed', mailErr)
    }

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('[countersign] handler failed', err)
    return res.status(500).json({ error: err.message || 'Countersign failed' })
  }
}

function randomToken() {
  return Math.random().toString(36).substring(2)
    + Date.now().toString(36)
    + Math.random().toString(36).substring(2)
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
  return `${piano?.brand || 'Yamaha'} ${piano?.model || ''} ${piano?.year || ''}`.trim()
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
      ['Deposit', `${formatCurrency(plan.deposit_amount)} (paid)`],
      ['Instalments', `${esc(plan.number_of_instalments)} × ${formatCurrency(plan.instalment_amount)} monthly`],
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
}) {
  const name = `${customer?.first_name || ''} ${customer?.last_name || ''}`.trim()
  const body = `
    ${p('Both signatures are in. The payment plan is now active.', { first: true })}
    ${details([
      ['Customer', `${esc(name)}<br><a href="mailto:${esc(customer?.email || '')}" style="color:${C.ink};">${esc(customer?.email || '')}</a>`, true],
      ['Plan', esc(plan.plan_number), true],
      ['Piano', esc(pianoName(piano))],
      ['Total', formatCurrency(plan.total_with_surcharge || plan.total_amount), true],
      ['Countersigned by', esc(countersigned_by)],
      ['Executed', esc(formatDate(countersignedAtIso?.split('T')[0]))],
    ])}
    ${isAcoustic
      ? note('<strong>Delivery record created.</strong> The customer has been sent the delivery preference link.', 'mist')
      : note('Digital piano. No delivery created.')}
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
