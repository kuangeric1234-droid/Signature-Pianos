/*
 * Signature Pianos — buyer's guide request
 * ----------------------------------------
 * POST from the homepage form (index.html, #playableGuideForm) and the QR
 * landing page (guide.html, /guide):
 *   { firstName, lastName?, email, phone?, consent: true, consentVersion?, page?, utm?, company? }
 *
 * 1. Validates the form. `company` is a hidden honeypot: bots fill it, people
 *    never see it, so a filled one gets a quiet 200 and nothing else.
 * 2. Saves the lead to `leads` (supabase/leads.sql, crm_pipeline.sql) with the
 *    service role. One row per person: someone already in the pipeline (from a
 *    viewing request, say) is updated, not duplicated, and the request goes on
 *    their timeline in `lead_events`.
 * 3. Emails the guide to the customer through Resend (lib/guide-emails.js),
 *    then records email_status / resend_id on the lead.
 * 4. Sends a heads-up to BUSINESS_EMAIL with everything needed to follow up.
 * 5. Returns { leadId, token } so the page can send the optional follow-up
 *    answers (what they're after, budget, timeframe, who's playing):
 *      { step: 'details', leadId, token, interestType?, budget?, timeframe?, player? }
 *    The token is random per request and only unlocks those four fields.
 *
 * A failed CRM save never stops the guide going out: the customer still gets
 * it, and the internal email carries the details and says the save failed.
 * The same address can't trigger the guide email more than once in two
 * minutes, which stops a double-click (or a script) from sending repeats.
 *
 * Env: RESEND_API_KEY, BUSINESS_EMAIL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *      SITE_URL (optional, defaults to https://signaturepianos.com.au)
 */

const crypto = require('crypto')
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
// The exact wording each form shows, stored with the lead as their consent
const CONSENT_TEXTS = {
  guide: 'I agree to the privacy policy and consent to receiving the guide by email.',
  guide_followup: 'Email me the guide. Signature Pianos may follow up about pianos, and I can ask them to stop at any time.'
}
const REPEAT_WINDOW_MS = 2 * 60 * 1000

const resend = new Resend(process.env.RESEND_API_KEY)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
})

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid']

// The follow-up questions on the guide page, and how they read in the CRM
const DETAILS = {
  interest_type: { key: 'interestType', options: { upright: 'Upright', grand: 'Grand', digital: 'Digital', not_sure: 'Not sure yet' } },
  budget: { key: 'budget', options: { under_5k: 'Under $5,000', '5_10k': '$5,000 to $10,000', '10_20k': '$10,000 to $20,000', '20k_plus': '$20,000 or more', not_sure: 'Budget not set' } },
  timeframe: { key: 'timeframe', options: { asap: 'In the next few weeks', '1_3_months': 'In 1 to 3 months', '3_6_months': 'In 3 to 6 months', researching: 'Just researching' } },
  player: { key: 'player', options: { child: 'A child starting out', adult_beginner: 'An adult beginner', returning: 'Someone coming back to it', advanced: 'An experienced player', teacher: 'A teacher or studio' } }
}

function text(v, max) {
  if (typeof v !== 'string') return ''
  // drop control characters, collapse whitespace
  return v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

function parseLead(body) {
  const lead = {
    first_name: text(body.firstName, 80),
    last_name: text(body.lastName, 80) || null,
    email: text(body.email, 254).toLowerCase(),
    phone: text(body.phone, 30) || null,
    source_page: text(body.page, 300) || null,
    utm: {}
  }
  const consentText = CONSENT_TEXTS[body.consentVersion] || CONSENT_TEXTS.guide
  if (!lead.first_name) return { error: 'Please enter your first name.' }
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
  return { lead, consentText }
}

// "QR code (showroom)", "Google ads", "Homepage": for the internal email and the timeline
function cameFrom(lead) {
  const u = lead.utm || {}
  if (u.utm_source === 'qr') return `QR code${u.utm_campaign ? ` (${u.utm_campaign})` : ''}`
  if (u.utm_source) return [u.utm_source, u.utm_medium, u.utm_campaign].filter(Boolean).join(' / ')
  if (lead.source_page === '/') return 'Homepage'
  return lead.source_page || null
}

/* Insert the lead, or update this person's existing row (whatever brought them
 * in first). Returns { row, isRepeat, recentlyEmailed } or throws. */
async function saveLead(lead, token, consentText) {
  const now = new Date()
  const consent = { consent: true, consent_text: consentText, consent_at: now.toISOString() }

  const findExisting = () => supabase
    .from('leads')
    .select('id, request_count, last_requested_at, email_status, phone, last_name, sources')
    .eq('email', lead.email)
    .maybeSingle()

  let { data: existing, error } = await findExisting()
  if (error) throw error

  if (!existing) {
    const { data: row, error: insertErr } = await supabase
      .from('leads')
      .insert({ ...lead, ...consent, source: SOURCE, sources: [SOURCE], followup_token: token, last_requested_at: now.toISOString() })
      .select('id, request_count')
      .single()
    if (!insertErr) return { row, isRepeat: false, recentlyEmailed: false }
    // Two requests raced: the other one inserted first. Fall through to update it.
    if (insertErr.code !== '23505') throw insertErr
    ;({ data: existing, error } = await findExisting())
    if (error || !existing) throw error || insertErr
  }

  const askedBefore = (existing.sources || []).includes(SOURCE)
  const recentlyEmailed = askedBefore && existing.email_status === 'sent' &&
    now - new Date(existing.last_requested_at) < REPEAT_WINDOW_MS
  const { data: row, error: updateErr } = await supabase
    .from('leads')
    .update({
      first_name: lead.first_name,
      last_name: lead.last_name || existing.last_name,
      phone: lead.phone || existing.phone,
      ...consent,
      source_page: lead.source_page,
      ...(Object.keys(lead.utm).length ? { utm: lead.utm } : {}),
      ...(askedBefore ? {} : { sources: [...(existing.sources || []), SOURCE] }),
      request_count: askedBefore ? (existing.request_count || 1) + 1 : 1,
      last_requested_at: now.toISOString(),
      last_activity_at: now.toISOString(),
      followup_token: token
    })
    .eq('id', existing.id)
    .select('id, request_count')
    .single()
  if (updateErr) throw updateErr
  return { row, isRepeat: askedBefore, recentlyEmailed }
}

async function logEvent(leadId, fields) {
  if (!leadId) return
  const { error } = await supabase.from('lead_events').insert({ lead_id: leadId, auto: true, ...fields })
  if (error) console.error('[buyer-guide] could not log event', error)
}

async function markEmail(id, fields) {
  if (!id) return
  const { error } = await supabase.from('leads').update(fields).eq('id', id)
  if (error) console.error('[buyer-guide] could not record email status', error)
}

/* Step 2 on the guide page: what they're looking for. */
async function saveDetails(body, res) {
  const leadId = text(body.leadId, 40)
  const token = text(body.token, 60)
  if (!/^[0-9a-f-]{36}$/i.test(leadId) || token.length < 20) return res.status(400).json({ error: 'Invalid request.' })

  const fields = {}
  const said = []
  for (const [column, { key, options }] of Object.entries(DETAILS)) {
    const v = text(body[key], 30)
    if (v && options[v]) {
      fields[column] = v
      said.push(options[v])
    }
  }
  if (!said.length) return res.status(400).json({ error: 'Nothing to save.' })

  const { data, error } = await supabase
    .from('leads')
    .update(fields)
    .eq('id', leadId)
    .eq('followup_token', token)
    .select('id')
    .maybeSingle()
  if (error) {
    console.error('[buyer-guide] details save failed', error)
    return res.status(500).json({ error: 'Sorry, that didn\'t save. You can tell us when you visit.' })
  }
  if (!data) return res.status(403).json({ error: 'That link has expired. Thank you anyway.' })

  await logEvent(leadId, { type: 'details', title: 'Told us what they\'re looking for', detail: said.join(' · ') })
  return res.status(200).json({ ok: true })
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

  if (body.step === 'details') return saveDetails(body, res)

  const guideUrl = `${SITE_URL}${GUIDE_PATH}`

  // Honeypot: pretend it worked, do nothing.
  if (typeof body.company === 'string' && body.company.trim()) {
    return res.status(200).json({ ok: true, emailed: true, guideUrl })
  }

  const { lead, consentText, error: invalid } = parseLead(body)
  if (invalid) return res.status(400).json({ error: invalid })
  const from = cameFrom(lead)
  const token = crypto.randomBytes(18).toString('base64url')

  // 1. CRM
  let saved = null
  try {
    saved = await saveLead(lead, token, consentText)
  } catch (err) {
    console.error('[buyer-guide] lead save failed', err)
  }
  const leadId = saved?.row?.id || null

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
      await markEmail(leadId, {
        email_status: 'sent', email_sent_at: new Date().toISOString(), email_error: null, resend_id: data?.id || null
      })
    } catch (err) {
      console.error('[buyer-guide] guide email failed', err)
      await markEmail(leadId, { email_status: 'failed', email_error: String(err?.message || err).slice(0, 500) })
    }
  }

  // 3. The timeline and the heads-up to the business (not for a double-click repeat)
  if (!saved?.recentlyEmailed) {
    await logEvent(leadId, {
      type: 'guide',
      title: saved?.isRepeat ? 'Asked for the buyer\'s guide again' : 'Downloaded the buyer\'s guide',
      detail: [from, emailed ? 'Guide emailed' : 'Guide email failed'].filter(Boolean).join(' · ')
    })

    const note = guideInternalEmail({
      lead,
      isRepeat: !!saved?.isRepeat,
      requestCount: saved?.row?.request_count || 1,
      adminUrl: leadId ? `${SITE_URL}/admin/pipeline.html?lead=${leadId}` : `${SITE_URL}/admin/pipeline.html`,
      crmSaved: !!saved,
      customerEmailed: emailed,
      cameFrom: from
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
  return res.status(200).json({ ok: true, emailed, guideUrl, ...(leadId ? { leadId, token } : {}) })
}
