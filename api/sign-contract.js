/*
 * Signature Pianos — payment plan signature receiver
 * --------------------------------------------------
 * POST /api/sign-contract
 * Body: { plan_id, token, signature_data, full_name, signed_at }
 *
 *   1. Verifies the signature token matches the plan_id.
 *   2. Refuses to overwrite an already-signed contract.
 *   3. Decodes the data-URL PNG and uploads it to the private
 *      `contracts` Supabase Storage bucket.
 *   4. Marks payment_plans.contract_signed + contract_url + status='active'.
 *   5. Fires customer confirmation + Eric notification via send-email.
 *
 * The page-facing client cannot do steps 3–5 directly under RLS — anon
 * has SELECT only on payment_plans and no write access to storage. The
 * service role key (server-only) does the work.
 */

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const SITE_URL       = process.env.SITE_URL       || 'https://signaturepianos.com.au'
const BUSINESS_EMAIL = process.env.BUSINESS_EMAIL || 'info@signaturepianos.com.au'

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const {
    plan_id, token, signature_data, full_name, signed_at,
    id_document_url, // Step 9 — Storage path from the signing page upload
  } = req.body || {}
  if (!plan_id || !token || !signature_data || !full_name) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  // Step 9 — request-derived audit fields
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
      // Storage failure shouldn't lose the signature event — log and proceed.
      // The full_name + checkbox are still legal evidence; the image is
      // supporting material. Eric will be alerted by the internal email.
      console.error('[sign-contract] storage upload failed', uploadErr)
    }

    // ---- 3. Flip the plan to signed + active ------------------------------
    const signedAtIso = signed_at || new Date().toISOString()
    const { error: updErr } = await supabase
      .from('payment_plans')
      .update({
        contract_signed:    true,
        contract_signed_at: signedAtIso,
        contract_url:       contractUrl,
        status:             'active',
        // Step 9 — capture verified identity ref + audit
        id_document_url:    id_document_url || null,
        id_uploaded_at:     id_document_url ? signedAtIso : null,
        signer_ip:          signerIp,
        signer_user_agent:  signerUa,
      })
      .eq('id', plan_id)
    if (updErr) throw updErr

    // ---- 4. Emails (customer + internal) ----------------------------------
    try {
      await fetch(`${SITE_URL}/api/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type:        'payment_plan_signed',
          plan,
          customer:    plan.customer,
          piano:       plan.piano,
          signed_at:   signedAtIso,
          full_name,
          contract_url: contractUrl,
        }),
      })
    } catch (mailErr) {
      console.error('[sign-contract] confirmation email failed', mailErr)
    }

    return res.status(200).json({ success: true, contract_url: contractUrl })
  } catch (err) {
    console.error('[sign-contract] handler failed', err)
    return res.status(500).json({ error: err.message || 'Signature failed' })
  }
}
