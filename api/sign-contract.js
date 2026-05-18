/*
 * Signature Pianos — payment plan signature receiver
 * --------------------------------------------------
 * POST /api/sign-contract
 * Body: { plan_id, token, signature_data, full_name, signed_at,
 *         id_document_url }
 *
 * Session 14: customer signing is now the FIRST of two signatures.
 *   1. Verifies the signature token matches the plan_id.
 *   2. Refuses to overwrite an already-signed contract.
 *   3. Uploads the customer signature PNG to the private `contracts` bucket.
 *   4. Marks payment_plans.contract_signed = true + audit fields. The plan
 *      stays at status='pending' until Eric countersigns via
 *      /api/countersign-contract — only THAT endpoint flips status='active'
 *      and triggers delivery scheduling.
 *   5. Ensures a countersign_token exists on the row (mints one if missing).
 *   6. Sends the customer an acknowledgement + Eric a countersign request
 *      with a link to /admin/countersign.html?token={countersign_token}.
 *
 * The page-facing client cannot do steps 3–6 directly under RLS — anon
 * has SELECT only on payment_plans and no write access to storage. The
 * service role key (server-only) does the work.
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
    plan_id, token, signature_data, full_name, signed_at,
    id_document_url,
  } = req.body || {}
  if (!plan_id || !token || !signature_data || !full_name) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const signerIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket?.remoteAddress
    || null
  const signerUa = req.headers['user-agent'] || null

  try {
    // ---- 1. Token check ---------------------------------------------------
    const { data: plan, error: planErr } = await supabase
      .from('payment_plans')
      .select(`*, customer:customer_id(*), piano:piano_id(*)`)
      .eq('id', plan_id)
      .eq('signature_token', token)
      .maybeSingle()
    if (planErr) throw planErr
    if (!plan)   return res.status(404).json({ error: 'Plan not found' })

    if (plan.contract_signed) {
      return res.status(400).json({ error: 'Contract already signed' })
    }

    // ---- 2. Upload signature PNG to storage -------------------------------
    let contractUrl = null
    try {
      const base64 = signature_data.replace(/^data:image\/\w+;base64,/, '')
      const buffer = Buffer.from(base64, 'base64')
      const filename = `${plan.plan_number}-signature-${Date.now()}.png`

      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('contracts')
        .upload(filename, buffer, { contentType: 'image/png', upsert: false })
      if (uploadErr) throw uploadErr
      contractUrl = uploadData.path
    } catch (uploadErr) {
      console.error('[sign-contract] storage upload failed', uploadErr)
    }

    // ---- 3. Ensure a countersign token exists -----------------------------
    // Most rows already have one from contract_updates.sql's backfill, but
    // newly-created plans won't until we set it here.
    const countersignToken = plan.countersign_token
      || (Math.random().toString(36).substring(2) + Date.now().toString(36))

    // ---- 4. Flip the plan to customer-signed ------------------------------
    // NOTE: status stays 'pending' until /api/countersign-contract flips it
    // to 'active'. fully_executed and delivery_triggered are also untouched.
    const signedAtIso = signed_at || new Date().toISOString()
    const { error: updErr } = await supabase
      .from('payment_plans')
      .update({
        contract_signed:    true,
        contract_signed_at: signedAtIso,
        contract_url:       contractUrl,
        id_document_url:    id_document_url || null,
        id_uploaded_at:     id_document_url ? signedAtIso : null,
        signer_ip:          signerIp,
        signer_user_agent:  signerUa,
        countersign_token:  countersignToken,
      })
      .eq('id', plan_id)
    if (updErr) throw updErr

    // ---- 5. Settings for email footers ------------------------------------
    let settings = {}
    try {
      const { data: s } = await supabase
        .from('company_settings')
        .select('*')
        .limit(1)
        .maybeSingle()
      settings = s || {}
    } catch (e) {
      console.error('[sign-contract] settings load failed (non-fatal)', e)
    }

    const countersignUrl = `${SITE_URL}/admin/countersign.html?token=${countersignToken}`

    // ---- 6. Emails (Eric countersign request + customer acknowledgement) -
    try {
      await resend.emails.send({
        from: FROM,
        to: BUSINESS_EMAIL,
        subject: `Action required: Sign payment plan contract — ${plan.customer.first_name} ${plan.customer.last_name} · ${plan.plan_number}`,
        html: ericCountersignEmail({
          plan,
          customer:       plan.customer,
          piano:          plan.piano,
          countersignUrl,
          signed_at:      signedAtIso,
        }),
      })
    } catch (mailErr) {
      console.error('[sign-contract] Eric countersign email failed', mailErr)
    }

    try {
      if (plan.customer?.email) {
        await resend.emails.send({
          from: FROM,
          to:   plan.customer.email,
          subject: `Contract received — ${plan.plan_number} · Signature Pianos`,
          html: customerSignedAcknowledgementEmail({
            customer: plan.customer,
            piano:    plan.piano,
            plan,
            settings,
          }),
        })
      }
    } catch (mailErr) {
      console.error('[sign-contract] customer ack email failed', mailErr)
    }

    return res.status(200).json({ success: true, contract_url: contractUrl })
  } catch (err) {
    console.error('[sign-contract] handler failed', err)
    return res.status(500).json({ error: err.message || 'Signature failed' })
  }
}

/* ============================================================================
   Eric — countersign request email
   ============================================================================ */
function ericCountersignEmail({ plan, customer, piano, countersignUrl, signed_at }) {
  const formatCurrency = (v) =>
    '$' + Math.abs(v || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const formatDate = (d) => {
    if (!d) return '—'
    const dt = new Date(d)
    return dt.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  return `
    <!DOCTYPE html>
    <html>
    <body style="font-family:Arial,sans-serif;background:#f8f7f5;margin:0;padding:40px 20px;">
      <div style="max-width:580px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e8e4dd;">
        <div style="background:#1a1917;padding:24px 32px;">
          <div style="font-size:18px;color:#b8935a;font-style:italic;">Signature Pianos</div>
          <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:4px;">Action required — countersignature needed</div>
        </div>
        <div style="padding:32px;">
          <h2 style="color:#1a1917;margin:0 0 16px;">
            ${customer.first_name} ${customer.last_name} has signed their payment plan contract.
          </h2>
          <p style="color:#6b6760;font-size:14px;line-height:1.7;">
            Please review and countersign to execute the agreement. Once you sign the contract will be emailed to the customer and their piano will be scheduled for delivery.
          </p>
          <div style="background:#f8f7f5;border-radius:4px;padding:16px;margin:20px 0;">
            <table style="width:100%;font-size:13px;border-collapse:collapse;">
              <tr>
                <td style="padding:7px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;width:40%;">Plan</td>
                <td style="padding:7px 0;font-weight:500;border-bottom:1px solid #e8e4dd;font-family:monospace;">${plan.plan_number}</td>
              </tr>
              <tr>
                <td style="padding:7px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;">Customer</td>
                <td style="padding:7px 0;font-weight:500;border-bottom:1px solid #e8e4dd;">
                  ${customer.first_name} ${customer.last_name}<br>
                  <a href="mailto:${customer.email}" style="color:#b8935a;font-size:12px;">${customer.email}</a><br>
                  <a href="tel:${customer.phone || ''}" style="color:#b8935a;font-size:12px;">${customer.phone || '—'}</a>
                </td>
              </tr>
              <tr>
                <td style="padding:7px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;">Piano</td>
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
                <td style="padding:7px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;">Payment method</td>
                <td style="padding:7px 0;border-bottom:1px solid #e8e4dd;">
                  ${plan.payment_method === 'credit_card'
                    ? `Credit card ···· ${plan.card_last_four || '????'}`
                    : 'Bank transfer'}
                </td>
              </tr>
              <tr>
                <td style="padding:7px 0;color:#9a9590;">Customer signed</td>
                <td style="padding:7px 0;">${formatDate(signed_at?.split('T')[0])}</td>
              </tr>
            </table>
          </div>

          <div style="background:#f0f9f4;border:1px solid #9fe1cb;border-radius:4px;padding:20px;text-align:center;margin:20px 0;">
            <div style="font-size:14px;font-weight:500;color:#085041;margin-bottom:8px;">Your signature is required</div>
            <p style="font-size:13px;color:#085041;margin:0 0 16px;line-height:1.5;">
              Click below to review the contract and add your countersignature. This will execute the agreement and trigger delivery scheduling.
            </p>
            <a href="${countersignUrl}"
               style="display:inline-block;background:#b8935a;color:#000;padding:14px 36px;border-radius:4px;text-decoration:none;font-size:14px;font-weight:500;">
              Review and countersign →
            </a>
          </div>

          <p style="font-size:12px;color:#9a9590;line-height:1.6;">
            This link is for your use only. Do not share it.
          </p>
        </div>
        <div style="background:#f8f7f5;padding:16px;text-align:center;font-size:12px;color:#9a9590;border-top:1px solid #e8e4dd;">
          Signature Pianos Admin · signaturepianos.com.au
        </div>
      </div>
    </body>
    </html>
  `
}

/* ============================================================================
   Customer — "contract received, awaiting countersignature" acknowledgement
   ============================================================================ */
function customerSignedAcknowledgementEmail({ customer, piano, plan, settings }) {
  const formatCurrency = (v) =>
    '$' + Math.abs(v || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return `
    <!DOCTYPE html>
    <html>
    <body style="font-family:Arial,sans-serif;background:#f8f7f5;margin:0;padding:40px 20px;">
      <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e8e4dd;">
        <div style="background:#1a1917;padding:32px;text-align:center;">
          <div style="font-size:20px;color:#b8935a;font-style:italic;">
            ${settings?.business_name || 'Signature Pianos'}
          </div>
        </div>
        <div style="padding:32px;">
          <h2 style="color:#1a1917;margin:0 0 16px;">Contract received, ${customer.first_name}.</h2>
          <p style="color:#6b6760;font-size:14px;line-height:1.7;">
            Thank you for signing your payment plan agreement. We have received your signature and are reviewing the contract.
          </p>
          <div style="background:#f8f7f5;border-radius:4px;padding:16px;margin:20px 0;">
            <div style="font-size:13px;color:#6b6760;line-height:1.8;">
              Plan: <strong>${plan.plan_number}</strong><br>
              Piano: <strong>Yamaha ${piano.model} ${piano.year}</strong><br>
              Total: <strong>${formatCurrency(plan.total_with_surcharge || plan.total_amount)}</strong>
            </div>
          </div>
          <div style="background:#f0f9f4;border:1px solid #9fe1cb;border-radius:4px;padding:14px;margin:16px 0;">
            <div style="font-size:13px;color:#085041;line-height:1.7;">
              <strong>What happens next:</strong><br>
              We will countersign your agreement shortly and send you a fully executed copy. Your piano will then be scheduled for delivery.
            </div>
          </div>
          <p style="color:#6b6760;font-size:13px;line-height:1.7;">
            If you have any questions please reply to this email.
          </p>
        </div>
        <div style="background:#f8f7f5;padding:20px;text-align:center;font-size:12px;color:#9a9590;border-top:1px solid #e8e4dd;">
          ${settings?.business_name || 'Signature Pianos'} Melbourne ·
          ${settings?.website || 'signaturepianos.com.au'}
        </div>
      </div>
    </body>
    </html>
  `
}
