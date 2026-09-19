/*
 * Signature Pianos — buyer's guide request
 * ----------------------------------------
 * POST from the homepage form (index.html, #playableGuideForm):
 *   { firstName, lastName, email, phone?, consent: true, page?, utm?, company? }
 *
 * 1. Validates the form. `company` is a hidden honeypot: bots fill it, people
 *    never see it, so a filled one gets a quiet 200 and nothing else.
 * 2. Saves the lead to `leads` (supabase/leads.sql) with the service role. A
 *    repeat request from the same email updates that row and bumps
 *    request_count instead of adding a duplicate.
 * 3. Emails the guide to the customer through Resend (lib/guide-emails.js),
 *    then records email_status / resend_id on the lead.
 * 4. Sends a heads-up to BUSINESS_EMAIL with everything needed to follow up.
 *
 * A failed CRM save never stops the guide going out: the customer still gets
 * it, and the internal email carries the details and says the save failed.
 * The same address can't trigger the guide email more than once in two
 * minutes, which stops a double-click (or a script) from sending repeats.
 *
 * Env: RESEND_API_KEY, BUSINESS_EMAIL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *      SITE_URL (optional, defaults to https://signaturepianos.com.au)
 */

const { Resend } = require('resend')
const { internalRecipients } = require('../lib/notify')
const { createClient } = require('@supabase/supabase-js')
const { guideEmail, guideInternalEmail } = require('../lib/guide-emails')

const SITE_URL = process.env.SITE_URL || 'https://signaturepianos.com.au'
const BUSINESS_EMAIL = process.env.BUSINESS_EMAIL || 'info@signaturepianos.com.au'
const FROM = 'Signature Pianos <info@signaturepianos.com.au>'
const SOURCE = 'buyer_guide'
const GUIDE_PATH = '/media/guides/signature-pianos-yamaha-buyers-guide.pdf'
const COVER_PATH = '/media/guides/buyers-guide-cover.jpg'
const LOGO_PATH = '/images/brand/signature-logo@2x.png'
const CONSENT_TEXT = 'I agree to the privacy policy and consent to receiving the guide by email.'
const REPEAT_WINDOW_MS = 2 * 60 * 1000

const resend = new Resend(process.env.RESEND_API_KEY)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
})

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid']

function text(v, max) {
  if (typeof v !== 'string') return ''
  // drop control characters, collapse whitespace
  return v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

function parseLead(body) {
  const lead = {
    first_name: text(body.firstName, 80),
    last_name: text(body.lastName, 80),
    email: text(body.email, 254).toLowerCase(),
    phone: text(body.phone, 30) || null,
    source_page: text(body.page, 300) || null,
    utm: {}
  }
  if (!lead.first_name || !lead.last_name) return { error: 'Please enter your first and last name.' }
  if (!EMAIL_RE.test(lead.email)) return { error: 'Please enter a valid email address.' }
  if (lead.phone && !/^[0-9+()\-.\s]{6,30}$/.test(lead.phone)) return { error: 'Please check your phone number.' }
  if (body.consent !== true) return { error: 'Please tick the box to agree to receive the guide by email.' }
  if (lead.source_page && !lead.source_page.startsWith('/')) lead.source_page = null
  if (body.utm && typeof body.utm === 'object') {
    for (const k of UTM_KEYS) {
      const v = text(body.utm[k], 120)
      if (v) lead.utm[k] = v
    }
  }
  return { lead }
}

/* Insert the lead, or update the existing row for this email. Returns
 * { row, isRepeat, recentlyEmailed } or throws. */
async function saveLead(lead) {
  const now = new Date()
  const consent = { consent: true, consent_text: CONSENT_TEXT, consent_at: now.toISOString() }

  const findExisting = () => supabase
    .from('leads')
    .select('id, request_count, last_requested_at, email_status, phone')
    .eq('source', SOURCE)
    .eq('email', lead.email)
    .maybeSingle()

  let { data: existing, error } = await findExisting()
  if (error) throw error

  if (!existing) {
    const { data: row, error: insertErr } = await supabase
      .from('leads')
      .insert({ ...lead, ...consent, source: SOURCE, last_requested_at: now.toISOString() })
      .select('id, request_count')
      .single()
    if (!insertErr) return { row, isRepeat: false, recentlyEmailed: false }
    // Two requests raced: the other one inserted first. Fall through to update it.
    if (insertErr.code !== '23505') throw insertErr
    ;({ data: existing, error } = await findExisting())
    if (error || !existing) throw error || insertErr
  }

  const recentlyEmailed = existing.email_status === 'sent' &&
    now - new Date(existing.last_requested_at) < REPEAT_WINDOW_MS
  const { data: row, error: updateErr } = await supabase
    .from('leads')
    .update({
      first_name: lead.first_name,
      last_name: lead.last_name,
      phone: lead.phone || existing.phone,
      ...consent,
      source_page: lead.source_page,
      ...(Object.keys(lead.utm).length ? { utm: lead.utm } : {}),
      request_count: (existing.request_count || 1) + 1,
      last_requested_at: now.toISOString()
    })
    .eq('id', existing.id)
    .select('id, request_count')
    .single()
  if (updateErr) throw updateErr
  return { row, isRepeat: true, recentlyEmailed }
}

async function markEmail(id, fields) {
  if (!id) return
  const { error } = await supabase.from('leads').update(fields).eq('id', id)
  if (error) console.error('[buyer-guide] could not record email status', error)
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  let body = req.body || {}
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { return res.status(400).json({ error: 'Invalid request.' }) }
  }

  const guideUrl = `${SITE_URL}${GUIDE_PATH}`

  // Honeypot: pretend it worked, do nothing.
  if (typeof body.company === 'string' && body.company.trim()) {
    return res.status(200).json({ ok: true, emailed: true, guideUrl })
  }

  const { lead, error: invalid } = parseLead(body)
  if (invalid) return res.status(400).json({ error: invalid })

  // 1. CRM
  let saved = null
  try {
    saved = await saveLead(lead)
  } catch (err) {
    console.error('[buyer-guide] lead save failed', err)
  }

  // 2. The customer's email (skipped if we sent it to this address moments ago)
  let emailed = false
  if (saved?.recentlyEmailed) {
    emailed = true
  } else {
    const mail = guideEmail({
      firstName: lead.first_name,
      guideUrl,
      coverUrl: `${SITE_URL}${COVER_PATH}`,
      logoUrl: `${SITE_URL}${LOGO_PATH}`,
      siteUrl: SITE_URL
    })
    try {
      const { data, error } = await resend.emails.send({
        from: FROM,
        to: lead.email,
        reply_to: BUSINESS_EMAIL,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        tags: [{ name: 'category', value: 'buyer_guide' }]
      })
      if (error) throw error
      emailed = true
      await markEmail(saved?.row?.id, {
        email_status: 'sent', email_sent_at: new Date().toISOString(), email_error: null, resend_id: data?.id || null
      })
    } catch (err) {
      console.error('[buyer-guide] guide email failed', err)
      await markEmail(saved?.row?.id, { email_status: 'failed', email_error: String(err?.message || err).slice(0, 500) })
    }
  }

  // 3. Heads-up to the business (not for a double-click repeat)
  if (!saved?.recentlyEmailed) {
    const note = guideInternalEmail({
      lead,
      isRepeat: !!saved?.isRepeat,
      requestCount: saved?.row?.request_count || 1,
      adminUrl: `${SITE_URL}/admin/enquiries.html#guide`,
      crmSaved: !!saved,
      customerEmailed: emailed
    })
    try {
      const { error } = await resend.emails.send({
        from: FROM,
        to: internalRecipients(),
        reply_to: lead.email,
        subject: note.subject,
        html: note.html
      })
      if (error) throw error
    } catch (err) {
      console.error('[buyer-guide] internal email failed', err)
    }
  }

  if (!saved && !emailed) {
    return res.status(502).json({ error: 'Sorry, something went wrong. Please try again, or call us on 0479 128 955.', guideUrl })
  }
  return res.status(200).json({ ok: true, emailed, guideUrl })
}
