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
    const formatCurrency = (v) =>
      '$' + Math.abs(v || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const formatDate = (d) => {
      if (!d) return '—'
      const [y, m, day] = (String(d).split('T')[0]).split('-')
      return `${day}/${m}/${y}`
    }

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
        to:   BUSINESS_EMAIL,
        subject: `Contract fully executed — ${plan.plan_number} · ${customer.first_name} ${customer.last_name}`,
        html: `
          <h2>Payment plan contract fully executed ✓</h2>
          <p>Customer: ${customer.first_name} ${customer.last_name} (${customer.email})</p>
          <p>Plan: ${plan.plan_number}</p>
          <p>Piano: Yamaha ${piano.model} ${piano.year}</p>
          <p>Total: ${formatCurrency(plan.total_with_surcharge || plan.total_amount)}</p>
          <p>Countersigned by: ${countersigned_by}</p>
          <p>Executed at: ${formatDate(countersignedAtIso?.split('T')[0])}</p>
          ${isAcoustic
            ? `<p style="color:#1a7f4b;"><strong>✓ Delivery record created</strong> — customer sent delivery preference link.</p>`
            : '<p>Digital piano — no delivery created.</p>'}
        `,
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
   Customer — fully executed agreement email
   ============================================================================ */
function fullyExecutedCustomerEmail({
  customer, piano, plan, instalments,
  settings, formatCurrency, formatDate,
  preferenceUrl, isAcoustic,
}) {
  return `
    <!DOCTYPE html>
    <html>
    <body style="font-family:Arial,sans-serif;background:#f8f7f5;margin:0;padding:40px 20px;">
      <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e8e4dd;">

        <div style="background:#1a1917;padding:32px;text-align:center;">
          <div style="font-size:20px;color:#b8935a;font-style:italic;margin-bottom:4px;">
            ${settings?.business_name || 'Signature Pianos'}
          </div>
          <div style="font-size:12px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.1em;">
            Payment Plan Agreement — Fully Executed
          </div>
        </div>

        <div style="padding:32px;">
          <h2 style="color:#1a1917;margin:0 0 16px;">
            Your agreement is confirmed, ${customer.first_name}.
          </h2>
          <p style="color:#6b6760;font-size:14px;line-height:1.7;">
            Your payment plan agreement has been signed by both parties and is now fully executed. Please keep this email for your records.
          </p>

          <div style="background:#f0f9f4;border:1px solid #9fe1cb;border-radius:4px;padding:14px 16px;margin:20px 0;display:flex;align-items:center;gap:10px;">
            <span style="font-size:24px;">✓</span>
            <div>
              <div style="font-size:13px;font-weight:500;color:#085041;">Fully executed agreement</div>
              <div style="font-size:12px;color:#085041;">${plan.plan_number} · Signed by both parties</div>
            </div>
          </div>

          <div style="background:#f8f7f5;border-radius:4px;padding:16px;margin-bottom:20px;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#9a9590;margin-bottom:10px;">
              Agreement summary
            </div>
            <table style="width:100%;font-size:13px;border-collapse:collapse;">
              <tr>
                <td style="padding:7px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;width:45%;">Piano</td>
                <td style="padding:7px 0;font-weight:500;border-bottom:1px solid #e8e4dd;">
                  Yamaha ${piano.model} ${piano.year}
                </td>
              </tr>
              <tr>
                <td style="padding:7px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;">Total</td>
                <td style="padding:7px 0;font-weight:500;border-bottom:1px solid #e8e4dd;color:#b8935a;">
                  ${formatCurrency(plan.total_with_surcharge || plan.total_amount)}
                </td>
              </tr>
              <tr>
                <td style="padding:7px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;">Deposit</td>
                <td style="padding:7px 0;border-bottom:1px solid #e8e4dd;color:#1D9E75;">
                  ${formatCurrency(plan.deposit_amount)} ✓
                </td>
              </tr>
              <tr>
                <td style="padding:7px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;">Instalments</td>
                <td style="padding:7px 0;border-bottom:1px solid #e8e4dd;">
                  ${plan.number_of_instalments} × ${formatCurrency(plan.instalment_amount)} monthly
                </td>
              </tr>
              <tr>
                <td style="padding:7px 0;color:#9a9590;">Payment method</td>
                <td style="padding:7px 0;">
                  ${plan.payment_method === 'credit_card'
                    ? `Credit card ···· ${plan.card_last_four}`
                    : 'Bank transfer'}
                </td>
              </tr>
            </table>
          </div>

          <div style="margin-bottom:24px;">
            <div style="font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:0.08em;color:#1a1917;margin-bottom:10px;">
              Your payment schedule
            </div>
            <table style="width:100%;font-size:12px;border-collapse:collapse;">
              <thead>
                <tr style="background:#f8f7f5;">
                  <th style="padding:7px 10px;text-align:left;color:#6b6760;font-weight:500;border-bottom:1px solid #e8e4dd;">#</th>
                  <th style="padding:7px 10px;text-align:left;color:#6b6760;font-weight:500;border-bottom:1px solid #e8e4dd;">Due date</th>
                  <th style="padding:7px 10px;text-align:right;color:#6b6760;font-weight:500;border-bottom:1px solid #e8e4dd;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${(instalments || []).map(ins => `
                  <tr>
                    <td style="padding:6px 10px;color:#6b6760;border-bottom:1px solid #f0f0f0;">${ins.instalment_number}</td>
                    <td style="padding:6px 10px;color:#1a1917;border-bottom:1px solid #f0f0f0;">${formatDate(ins.due_date)}</td>
                    <td style="padding:6px 10px;color:#1a1917;border-bottom:1px solid #f0f0f0;text-align:right;">${formatCurrency(ins.amount)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          ${plan.payment_method === 'bank_transfer' && settings?.bank_bsb ? `
            <div style="background:#f8f7f5;border-radius:4px;padding:14px;margin-bottom:20px;">
              <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#9a9590;margin-bottom:8px;">
                Payment details
              </div>
              <div style="font-size:13px;color:#6b6760;line-height:1.8;">
                BSB: ${settings.bank_bsb}<br>
                Account: ${settings.bank_account}<br>
                Account name: ${settings.bank_account_name}<br>
                Reference: <strong>${plan.plan_number}</strong>
              </div>
            </div>
          ` : ''}

          ${isAcoustic && preferenceUrl ? `
            <div style="background:#f0f9f4;border:1px solid #9fe1cb;border-radius:4px;padding:20px;margin-bottom:20px;">
              <div style="font-size:14px;font-weight:500;color:#085041;margin-bottom:8px;">
                Next step — choose your delivery times
              </div>
              <p style="font-size:13px;color:#085041;margin:0 0 14px;line-height:1.5;">
                Please let us know 3 preferred delivery windows and we will arrange delivery of your piano.
              </p>
              <a href="${preferenceUrl}"
                 style="display:inline-block;background:#b8935a;color:#000;padding:12px 24px;border-radius:4px;text-decoration:none;font-size:13px;font-weight:500;">
                Choose delivery times →
              </a>
            </div>
          ` : ''}

          <div style="font-size:12px;color:#9a9590;border-top:1px solid #e8e4dd;padding-top:16px;line-height:1.7;">
            By signing this agreement you confirmed acceptance of the Signature Pianos payment plan terms and conditions. The instrument remains the property of Signature Pianos until all payments are received in full. This piano is covered by the Signature Pianos 10-year warranty from the date of delivery.
          </div>
        </div>

        <div style="background:#f8f7f5;padding:20px;text-align:center;font-size:12px;color:#9a9590;border-top:1px solid #e8e4dd;">
          ${settings?.business_name || 'Signature Pianos'} Melbourne ·
          ${settings?.website || 'signaturepianos.com.au'}${settings?.abn ? ` · ABN: ${settings.abn}` : ''}
        </div>

      </div>
    </body>
    </html>
  `
}
