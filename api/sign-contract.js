/*
 * Signature Pianos — payment plan signature receiver
 * --------------------------------------------------
 * POST /api/sign-contract
 * Body: { plan_id, token, signature_data, full_name, id_document_url }
 * (signed_at is stamped with server time; a client value is ignored.)
 *
 * Session 14: customer signing is now the FIRST of two signatures.
 *   1. Verifies the signature token matches the plan_id exactly.
 *   2. Refuses to overwrite an already-signed or cancelled contract.
 *   3. Uploads the customer signature PNG to the private `contracts` bucket.
 *      If that fails nothing is marked signed and the customer is told to
 *      try again.
 *   4. Marks payment_plans.contract_signed = true + audit fields. The plan
 *      stays at status='pending' until Eric countersigns via
 *      /api/countersign-contract — only THAT endpoint flips status='active'
 *      and triggers delivery scheduling.
 *   5. Ensures a countersign_token exists on the row (mints one if missing).
 *   6. Sends the customer an acknowledgement + Eric a countersign request
 *      with a link to /admin/countersign.html?token={countersign_token}.
 *
 * The page-facing client cannot do steps 3–6 directly under RLS — anon
 * only reads its own plan through get_plan_for_signing() and has no write
 * access to payment_plans or the contracts bucket. The service role key
 * (server-only) does the work.
 */

const crypto           = require('crypto')
const { createClient } = require('@supabase/supabase-js')
const { Resend }       = require('resend')
const { internalRecipients } = require('../lib/notify')
const { melbourneDate } = require('../lib/dates')
const {
  C, esc, layout, hello, p, h2, details, note, button, steps, signOff,
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
    plan_id, token, signature_data, full_name,
    id_document_url,
  } = req.body || {}
  if (!plan_id || !token || !signature_data || !full_name) {
    return res.status(400).json({ error: 'Missing required fields' })
  }
  // Plain strings only, so a crafted body can't turn the token check into
  // anything but an exact match. Real tokens are 16+ characters.
  if (typeof plan_id !== 'string' || typeof token !== 'string' || token.length < 16
      || typeof signature_data !== 'string' || typeof full_name !== 'string') {
    return res.status(400).json({ error: 'Invalid request' })
  }
  if (!/^data:image\/png;base64,/.test(signature_data)) {
    return res.status(400).json({ error: 'Signature must be a PNG image' })
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
    if (plan.status === 'cancelled' || plan.fully_executed) {
      return res.status(409).json({ error: 'This payment plan can no longer be signed. Please contact us.' })
    }

    // The ID path comes from the browser's own upload to id-documents; it
    // must sit in this plan's folder ({plan_id}/…), never someone else's.
    let idPath = null
    if (id_document_url) {
      if (typeof id_document_url !== 'string'
          || !id_document_url.startsWith(`${plan.id}/`)
          || id_document_url.includes('..')) {
        return res.status(400).json({ error: 'Invalid ID document reference' })
      }
      idPath = id_document_url
    }

    // ---- 2. Upload signature PNG to storage -------------------------------
    // The stored PNG is the signature on file. If it can't be saved, stop:
    // marking the contract signed without it would leave no signature.
    let contractUrl = null
    try {
      const base64 = signature_data.replace(/^data:image\/\w+;base64,/, '')
      const buffer = Buffer.from(base64, 'base64')
      if (!buffer.length) throw new Error('Empty signature image')
      const filename = `${plan.plan_number}-signature-${Date.now()}.png`

      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('contracts')
        .upload(filename, buffer, { contentType: 'image/png', upsert: false })
      if (uploadErr) throw uploadErr
      contractUrl = uploadData.path
    } catch (uploadErr) {
      console.error('[sign-contract] storage upload failed', uploadErr)
      return res.status(500).json({ error: "We couldn't save your signature. Please try again." })
    }

    // ---- 3. Ensure a countersign token exists -----------------------------
    // Most rows already have one from contract_updates.sql's backfill, but
    // newly-created plans won't until we set it here.
    const countersignToken = plan.countersign_token
      || crypto.randomBytes(24).toString('base64url')

    // ---- 4. Flip the plan to customer-signed ------------------------------
    // NOTE: status stays 'pending' until /api/countersign-contract flips it
    // to 'active'. fully_executed and delivery_triggered are also untouched.
    // The contract_signed guard makes a double submit a no-op, not a
    // second signature.
    const signedAtIso = new Date().toISOString()
    const { data: updated, error: updErr } = await supabase
      .from('payment_plans')
      .update({
        contract_signed:    true,
        contract_signed_at: signedAtIso,
        contract_url:       contractUrl,
        id_document_url:    idPath,
        id_uploaded_at:     idPath ? signedAtIso : null,
        signer_ip:          signerIp,
        signer_user_agent:  signerUa,
        countersign_token:  countersignToken,
      })
      .eq('id', plan_id)
      .not('contract_signed', 'is', true)
      .select('id')
    if (updErr) throw updErr
    if (!updated || !updated.length) {
      return res.status(400).json({ error: 'Contract already signed' })
    }

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
    // Resend returns { error } rather than throwing; the try/catch covers
    // template bugs. Either way the signature is already saved.
    try {
      const { error: mailErr } = await resend.emails.send({
        from: FROM,
        to: internalRecipients(),
        subject: `Action required: sign payment plan contract — ${plan.customer?.first_name || ''} ${plan.customer?.last_name || ''} · ${plan.plan_number}`,
        html: ericCountersignEmail({
          plan,
          customer:       plan.customer,
          piano:          plan.piano,
          countersignUrl,
          signed_at:      signedAtIso,
          signed_as:      full_name.trim(),
        }),
      })
      if (mailErr) console.error('[sign-contract] Eric countersign email failed', mailErr)
    } catch (mailErr) {
      console.error('[sign-contract] Eric countersign email failed', mailErr)
    }

    try {
      if (plan.customer?.email) {
        const { error: mailErr } = await resend.emails.send({
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
        if (mailErr) console.error('[sign-contract] customer ack email failed', mailErr)
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
   Shared bits for the two emails below (brand kit: lib/email-brand.js)
   ============================================================================ */
const formatCurrency = (v) =>
  '$' + Math.abs(v || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function pianoName(piano) {
  return `${piano?.brand || ''} ${piano?.model || ''} ${piano?.year || ''}`.trim() || 'Piano'
}

/* ============================================================================
   Eric — countersign request email
   ============================================================================ */
function ericCountersignEmail({ plan, customer, piano, countersignUrl, signed_at, signed_as }) {
  // Melbourne calendar date of the signing timestamp (the server runs in UTC).
  const formatDate = (d) => {
    if (!d) return '—'
    const [y, m, day] = melbourneDate(new Date(d)).split('-')
    return `${day}/${m}/${y}`
  }
  const name = `${customer?.first_name || ''} ${customer?.last_name || ''}`.trim()

  const body = `
    ${p(`${esc(name)} has signed their payment plan contract.`, { first: true })}
    ${p('Please review and countersign to execute the agreement. Once you sign, the contract will be emailed to the customer and their piano will be scheduled for delivery.')}
    ${details([
      ['Plan', esc(plan.plan_number), true],
      ['Customer', `${esc(name)}<br>
        <a href="mailto:${esc(customer?.email || '')}" style="color:${C.ink};">${esc(customer?.email || '')}</a><br>
        <a href="tel:${esc(customer?.phone || '')}" style="color:${C.ink};">${esc(customer?.phone || '—')}</a>`, true],
      ['Piano', esc(pianoName(piano))],
      ['Total', formatCurrency(plan.total_with_surcharge || plan.total_amount), true],
      ['Payment method', plan.payment_method === 'credit_card'
        ? `Credit card ···· ${esc(plan.card_last_four || '????')}`
        : 'Bank transfer'],
      ['Customer signed', esc(formatDate(signed_at))],
      ...(signed_as ? [['Typed name', esc(signed_as)]] : []),
    ])}
    ${note('<strong>Your signature is required.</strong> Review the contract and add your countersignature. This will execute the agreement and trigger delivery scheduling.', 'alert')}
    ${button(countersignUrl, 'Review and countersign')}
    ${p('This link is for your use only. Do not share it.', { muted: true, small: true, first: true })}
  `
  return layout({
    preview: `${name} has signed plan ${plan.plan_number}. Your countersignature is needed.`,
    label: 'For Signature Pianos',
    title: 'Countersignature needed',
    body,
    internal: true,
  })
}

/* ============================================================================
   Customer — "contract received, awaiting countersignature" acknowledgement
   ============================================================================ */
function customerSignedAcknowledgementEmail({ customer, piano, plan, settings }) {
  const body = `
    ${hello(customer?.first_name)}
    ${p('Thank you for signing your payment plan agreement. We have received your signature and are reviewing the contract.')}
    ${details([
      ['Plan', esc(plan.plan_number), true],
      ['Piano', esc(pianoName(piano))],
      ['Total', formatCurrency(plan.total_with_surcharge || plan.total_amount), true],
    ])}
    ${h2('What happens next')}
    ${steps([
      'We will countersign your agreement shortly and send you a fully executed copy.',
      'Your piano will then be scheduled for delivery.',
    ])}
    ${p('If you have any questions, reply to this email.', { first: true })}
    ${signOff()}
  `
  return layout({
    preview: `We have received your signed payment plan agreement, ${plan.plan_number}.`,
    label: 'Your payment plan',
    title: 'Contract received',
    body,
  })
}

// Template functions, exposed for email previews. The default export above
// (the API handler) is unchanged.
module.exports.templates = { ericCountersignEmail, customerSignedAcknowledgementEmail }
