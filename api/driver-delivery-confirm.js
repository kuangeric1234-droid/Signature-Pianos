/*
 * Signature Pianos — driver delivery confirmation
 * -----------------------------------------------
 * POST /api/driver-delivery-confirm  body: { token, photo_urls, photo_count, notes }
 *
 *   1. Verifies the delivery_link_token.
 *   2. Updates deliveries — delivery_photos, delivered_at, delivery_notes,
 *      status='delivered'. Service role write (bypasses anon guard).
 *   3. Creates a warranties row (WRT-YYYY-XXXXX, 10 years from today).
 *      warranty_number has a SQL default (generate_warranty_number), but
 *      we mint it explicitly so the value is in scope for the customer
 *      email without a re-fetch.
 *   4. Creates an auto-booked tuner_bookings row 25 days out, with
 *      confirmation + completion tokens minted client-side so the
 *      existing tuner flow keeps working when Eric assigns one.
 *   5. Sends the customer arrival email (with a placement photo) and the
 *      warranty email with the certificate PDF (lib/warranty-pdf.js)
 *      attached, then Eric's note with the same PDF.
 *   6. Flips warranty.certificate_sent + certificate_sent_at after the
 *      certificate email is accepted by Resend.
 *
 * Every email is built with the brand kit in lib/email-brand.js.
 */

const { createClient } = require('@supabase/supabase-js')
const { Resend } = require('resend')
const { internalRecipients } = require('../lib/notify')
const { buildWarrantyPdf, loadSignature, warrantyFilename } = require('../lib/warranty-pdf')
const {
  BUSINESS, C, TEXT, esc, p, hello, details, note, button, buttonOutline, steps, signOff, layout, longDate
} = require('../lib/email-brand')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
const resend = new Resend(process.env.RESEND_API_KEY)

const FROM           = 'Signature Pianos <info@signaturepianos.com.au>'
const BUSINESS_EMAIL = process.env.BUSINESS_EMAIL || 'info@signaturepianos.com.au'

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { token, photo_urls, photo_count, notes, delivery_status, issue_description } = req.body || {}
  if (!token) return res.status(400).json({ error: 'Missing token' })
  if (!Array.isArray(photo_urls) || photo_urls.length < 3) {
    return res.status(400).json({ error: 'At least 3 photos required' })
  }
  const issueKind = (delivery_status === 'damage' || delivery_status === 'failed') ? delivery_status : null
  if (issueKind && !issue_description) {
    return res.status(400).json({ error: 'Issue description required for damage/failed deliveries' })
  }

  try {
    // 1. Token check
    const { data: delivery, error } = await supabase
      .from('deliveries')
      .select(`
        *,
        order:order_id (
          *,
          customer:customer_id ( * ),
          piano:piano_id ( * )
        )
      `)
      .eq('delivery_link_token', token)
      .maybeSingle()
    if (error) throw error
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' })

    if (delivery.status === 'delivered') {
      return res.status(400).json({ error: 'Delivery already confirmed' })
    }

    const order    = delivery.order || {}
    const customer = order.customer || {}
    const piano    = order.piano    || {}
    const pianoLabel = `${piano.brand || 'Yamaha'} ${piano.model || ''} ${piano.year || ''}`.trim()

    // 1b. Session 13 — damage or failed-delivery branch.
    //     Writes the new damage_* / failed_* columns, urgent-emails
    //     Eric, and returns early WITHOUT creating warranty or auto-
    //     booking the tuner. The flow can be resumed manually from
    //     admin after the issue is resolved.
    if (issueKind === 'damage') {
      try {
        await supabase
          .from('deliveries')
          .update({
            damage_reported:    true,
            damage_reported_at: new Date().toISOString(),
            damage_notes:       issue_description,
            damage_photos:      photo_urls,
            delivery_notes:     notes || null,
            status:             'damage_reported',
          })
          .eq('id', delivery.id)
      } catch (updErr) {
        console.error('[driver-delivery-confirm] damage update failed', updErr)
      }
      try {
        await resend.emails.send({
          from: FROM,
          to: internalRecipients(),
          subject: `Urgent: delivery damage reported · ${pianoLabel}`,
          html: damageReportedEmail({ customer, piano, pianoLabel, issue_description, photo_count }),
        })
      } catch (mailErr) {
        console.error('[driver-delivery-confirm] damage email failed', mailErr)
      }
      return res.status(200).json({ success: true, status: 'damage_reported' })
    }

    if (issueKind === 'failed') {
      try {
        await supabase
          .from('deliveries')
          .update({
            failed_delivery:        true,
            failed_delivery_reason: issue_description,
            failed_delivery_at:     new Date().toISOString(),
            delivery_photos:        photo_urls,
            delivery_notes:         notes || null,
            status:                 'failed',
          })
          .eq('id', delivery.id)
      } catch (updErr) {
        console.error('[driver-delivery-confirm] failed-delivery update failed', updErr)
      }
      try {
        await resend.emails.send({
          from: FROM,
          to: internalRecipients(),
          subject: `Delivery failed · ${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
          html: deliveryFailedEmail({ customer, pianoLabel, issue_description }),
        })
      } catch (mailErr) {
        console.error('[driver-delivery-confirm] failed email failed', mailErr)
      }
      return res.status(200).json({ success: true, status: 'failed' })
    }

    // 2. Normal happy-path — row update — flip to delivered
    const nowIso = new Date().toISOString()
    const { error: updErr } = await supabase
      .from('deliveries')
      .update({
        delivery_photos:  photo_urls,
        delivered_at:     nowIso,
        delivery_notes:   notes || null,
        status:           'delivered',
      })
      .eq('id', delivery.id)
    if (updErr) throw updErr

    // 3. Warranty record — WRT-YYYY-XXXXX, 10 years from today
    const year = new Date().getFullYear()
    let warrantyNumber
    try {
      const { data: lastRows } = await supabase
        .from('warranties')
        .select('warranty_number')
        .ilike('warranty_number', `WRT-${year}-%`)
        .order('created_at', { ascending: false })
        .limit(1)
      const lastNum = lastRows?.[0]?.warranty_number
        ? parseInt(String(lastRows[0].warranty_number).split('-')[2], 10) || 0
        : 0
      warrantyNumber = `WRT-${year}-${String(lastNum + 1).padStart(5, '0')}`
    } catch (numErr) {
      console.warn('[driver-delivery-confirm] warranty number gen fell back to default', numErr)
      // generate_warranty_number() default on the column will kick in.
      warrantyNumber = null
    }

    const startDate  = new Date()
    const expiryDate = new Date()
    expiryDate.setFullYear(expiryDate.getFullYear() + 10)
    const startIso  = startDate.toISOString().slice(0, 10)
    const expiryIso = expiryDate.toISOString().slice(0, 10)

    const warrantyPayload = {
      order_id:    order.id,
      customer_id: customer.id || null,
      piano_id:    piano.id    || null,
      start_date:  startIso,
      expiry_date: expiryIso,
      years:       10,
      status:      'active',
      certificate_sent: false,
    }
    if (warrantyNumber) warrantyPayload.warranty_number = warrantyNumber

    let warranty
    try {
      const { data: w, error: wErr } = await supabase
        .from('warranties')
        .insert(warrantyPayload)
        .select('*')
        .single()
      if (wErr) throw wErr
      warranty = w
      warrantyNumber = w.warranty_number
    } catch (warrErr) {
      console.error('[driver-delivery-confirm] warranty insert failed', warrErr)
      // Don't abort — the delivery is the source of truth; warranty can
      // be created manually if this step fails.
    }

    // 4. Auto tuner booking — 25 days from today.
    //    New flow (Session 12 rebuild): just create the row with a
    //    trigger_date. The daily cron fires the customer + tuner
    //    contact emails when trigger_date hits today. No emails
    //    sent immediately here.
    const tunerDate = new Date()
    tunerDate.setDate(tunerDate.getDate() + 25)
    const tunerDateIso = tunerDate.toISOString().slice(0, 10)
    const logDateToken   = randToken()
    const completionToken = randToken()

    try {
      await supabase
        .from('tuner_bookings')
        .insert({
          order_id:         order.id,
          customer_id:      customer.id || null,
          warranty_id:      warranty?.id || null,
          trigger_date:     tunerDateIso,
          // proposed_date stays in sync for backwards-compat with the
          // existing admin form; the cron only reads trigger_date.
          proposed_date:    tunerDateIso,
          status:           'pending',
          auto_booked:      true,
          contact_sent:     false,
          date_logged:      false,
          completed:        false,
          log_date_token:   logDateToken,
          completion_token: completionToken,
        })
    } catch (tbErr) {
      console.error('[driver-delivery-confirm] tuner_bookings insert failed', tbErr)
    }

    // 5. Settings for footers
    let settings = {}
    try {
      const { data: s } = await supabase.from('company_settings').select('*').limit(1).maybeSingle()
      if (s) settings = s
    } catch (sErr) {
      console.warn('[driver-delivery-confirm] settings load fell back', sErr)
    }

    // 5b. The warranty certificate PDF, attached to the customer's and Eric's emails.
    let certificate = null
    if (warranty) {
      try {
        const signature = await loadSignature(supabase)
        const pdf = await buildWarrantyPdf({ customer, piano, order, warranty, signature })
        // base64: the Resend API's documented form for attachment content
        certificate = { filename: warrantyFilename(warranty), content: Buffer.from(pdf).toString('base64') }
      } catch (pdfErr) {
        console.error('[driver-delivery-confirm] certificate PDF failed', pdfErr)
      }
    }

    // 6. Customer arrival email + warranty certificate
    let arrivalSent = false
    let certificateSent = false
    if (customer.email) {
      try {
        const photoUrl = await placementPhotoUrl(photo_urls)
        const { error: arrivalErr } = await resend.emails.send({
          from: FROM,
          to: customer.email,
          reply_to: BUSINESS_EMAIL,
          subject: 'Your piano has arrived — Signature Pianos',
          html: deliveryCompleteEmail({ customer, piano, tunerDateIso, settings, photoUrl }),
        })
        if (arrivalErr) throw arrivalErr
        arrivalSent = true
      } catch (mailErr) {
        console.error('[driver-delivery-confirm] arrival email failed', mailErr)
      }

      if (warranty) {
        try {
          const { error: certErr } = await resend.emails.send({
            from: FROM,
            to: customer.email,
            reply_to: BUSINESS_EMAIL,
            subject: `Your 10-year warranty certificate — ${warrantyNumber}`,
            html: warrantyCertificateEmail({ customer, piano, warranty, settings, attached: !!certificate }),
            attachments: certificate ? [certificate] : undefined,
          })
          if (certErr) throw certErr
          certificateSent = true
          await supabase
            .from('warranties')
            .update({ certificate_sent: true, certificate_sent_at: new Date().toISOString() })
            .eq('id', warranty.id)
        } catch (certErr) {
          console.error('[driver-delivery-confirm] certificate email failed', certErr)
        }
      }
    }

    // 7. Internal Eric notification
    try {
      await resend.emails.send({
        from: FROM,
        to: internalRecipients(),
        subject: `Delivery confirmed — ${piano.brand || 'Yamaha'} ${piano.model || ''} ${piano.year || ''} · ${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
        html: deliveryConfirmedInternalEmail({
          customer, pianoLabel, photo_count, notes, warrantyNumber, expiryIso, tunerDateIso,
          arrivalSent, certificateSent, certificateAttached: !!certificate, hasEmail: !!customer.email
        }),
        attachments: certificate ? [certificate] : undefined,
      })
    } catch (mailErr) {
      console.error('[driver-delivery-confirm] internal email failed', mailErr)
    }

    return res.status(200).json({
      success: true,
      warranty_number: warrantyNumber,
      tuner_date: tunerDateIso,
    })
  } catch (err) {
    console.error('[driver-delivery-confirm] handler failed', err)
    return res.status(500).json({ error: err.message || 'Confirm failed' })
  }
}

/* ---------- helpers ---------- */

function randToken() {
  return (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 32)
}

/*
 * The driver's first photo, as a link that works for a year whether or not the
 * delivery-photos bucket is public. Returns null if it can't be signed.
 */
async function placementPhotoUrl(urls) {
  const first = Array.isArray(urls) ? urls.find(Boolean) : null
  const match = first && String(first).match(/\/delivery-photos\/([^?]+)/)
  if (!match) return null
  try {
    const { data, error } = await supabase.storage
      .from('delivery-photos')
      .createSignedUrl(decodeURIComponent(match[1]), 60 * 60 * 24 * 365)
    if (error) throw error
    return data?.signedUrl || null
  } catch (err) {
    console.warn('[driver-delivery-confirm] placement photo link failed', err?.message || err)
    return null
  }
}

const fullName = c => `${c.first_name || ''} ${c.last_name || ''}`.trim()
const telLink = phone => phone
  ? `<a href="tel:${esc(String(phone).replace(/[^\d+]/g, ''))}" style="color:${C.ink};text-decoration:none;">${esc(phone)}</a>`
  : '—'
const mailLink = email => email
  ? `<a href="mailto:${esc(email)}" style="color:${C.ink};">${esc(email)}</a>`
  : '—'
const pianoName = piano => [piano.brand || 'Yamaha', piano.model].filter(Boolean).join(' ')

/* ---------- email templates ---------- */

/* Customer: the piano is in. Sent the moment the driver confirms delivery. */
function deliveryCompleteEmail({ customer, piano, tunerDateIso, settings, photoUrl }) {
  const name = esc(pianoName(piano))
  const photo = photoUrl ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;"><tr><td>
      <img src="${esc(photoUrl)}" width="504" alt="Your ${name} in place" style="display:block;width:100%;max-width:504px;height:auto;border:0;background:${C.ivory};">
    </td></tr></table>
    <p style="margin:8px 0 0;font-family:${TEXT};font-size:12px;line-height:18px;color:${C.inkSoft};">Your ${name} in place, photographed by our delivery team.</p>` : ''
  return layout({
    preview: `Your ${pianoName(piano)} has been delivered. Your warranty certificate is in a separate email.`,
    label: 'Your delivery',
    title: 'Your piano is home',
    body: `
      ${hello(customer.first_name)}
      ${p(`Your <strong>${name}${piano.year ? ` (${esc(piano.year)})` : ''}</strong> has been delivered and placed. We hope it brings you years of music.`)}
      ${photo}
      ${steps([
        `<strong>Your 10-year warranty.</strong> The certificate is in a separate email, as a PDF to keep.`,
        `<strong>Your first tuning is included.</strong> A piano needs a few weeks to settle into a new room, so around ${esc(longDate(tunerDateIso))} a tuner will contact you to arrange a time.`,
        `<strong>Your customer portal.</strong> Your delivery, warranty and tuning are all in one place.`
      ])}
      ${button(`${BUSINESS.siteUrl}/portal`, 'Open your portal')}
      ${p(`If anything about the piano isn’t right, reply to this email or call us on ${telLink(BUSINESS.phone)}.`, { muted: true, small: true, first: true })}
      ${signOff()}
    `
  })
}

/* Customer: the warranty, with the certificate PDF attached. */
function warrantyCertificateEmail({ customer, piano, warranty, settings, attached = true }) {
  const years = Number(warranty.years) || 10
  return layout({
    preview: `Your ${years}-year warranty for your ${pianoName(piano)}, certificate ${warranty.warranty_number}.`,
    label: 'Warranty certificate',
    title: `Your ${years}-year warranty`,
    body: `
      ${hello(customer.first_name)}
      ${p(attached
        ? `Your warranty certificate for your ${esc(pianoName(piano))} is attached as a PDF. Please keep it with your records.`
        : `Your ${esc(pianoName(piano))} is covered by our ${years}-year warranty. The details are below. Reply to this email and we’ll send the certificate as a PDF.`)}
      ${details([
        ['Certificate', esc(warranty.warranty_number), true],
        ['Issued to', esc(fullName(customer))],
        ['Piano', `${esc(pianoName(piano))}${piano.year ? `, ${esc(piano.year)}` : ''}`],
        piano.serial_number ? ['Serial number', esc(piano.serial_number)] : null,
        ['Covered from', esc(longDate(warranty.start_date))],
        ['Covered until', esc(longDate(warranty.expiry_date)), true]
      ])}
      ${note(`<strong>What it covers.</strong> Faults in the materials and workmanship of every structural and mechanical part: soundboard, frame, pin block, action, hammers, dampers, keys, pedals and case. The full terms are on the second page of the certificate.`)}
      ${p(`<strong>If something goes wrong,</strong> call ${telLink(BUSINESS.phone)} or email ${mailLink(BUSINESS.email)} with your certificate number. A photo helps.`, { first: true })}
      ${buttonOutline(`${BUSINESS.siteUrl}/portal`, 'View it in your portal')}
      ${signOff()}
    `,
    footnote: 'This warranty is in addition to your rights under the Australian Consumer Law.'
  })
}

/* Eric: delivery confirmed, with the certificate attached for the records. */
function deliveryConfirmedInternalEmail({ customer, pianoLabel, photo_count, notes, warrantyNumber, expiryIso, tunerDateIso, arrivalSent, certificateSent, certificateAttached, hasEmail }) {
  const emails = !hasEmail
    ? 'None: the customer has no email address on file.'
    : [arrivalSent ? 'Arrival email sent' : 'Arrival email FAILED', certificateSent ? 'warranty email sent' : 'warranty email FAILED'].join(', ') + '.'
  return layout({
    internal: true,
    preview: `${pianoLabel} delivered to ${fullName(customer)}.`,
    label: 'Delivery',
    title: 'Piano delivered',
    body: `
      ${details([
        ['Customer', `${esc(fullName(customer))}<br>${mailLink(customer.email)}`, true],
        ['Piano', esc(pianoLabel)],
        ['Photos uploaded', esc(photo_count)],
        notes ? ['Driver notes', esc(notes)] : null,
        ['Warranty', warrantyNumber
          ? `${esc(warrantyNumber)}<br>Expires ${esc(longDate(expiryIso))}${certificateAttached ? '<br>Certificate attached' : ''}`
          : `<span style="color:${C.felt};font-weight:500;">Not created. Check the logs.</span>`],
        ['First tuning', `Auto-booked for ${esc(longDate(tunerDateIso))}`],
        ['Customer emails', esc(emails)]
      ])}
      ${note('<strong>Action:</strong> open Deliveries in admin and assign a tuner to the auto-created booking.', 'alert')}
      ${button(`${BUSINESS.siteUrl}/admin/deliveries.html`, 'Open deliveries')}
    `
  })
}

/* Eric: the driver reported damage. The warranty and tuning are not created. */
function damageReportedEmail({ customer, piano, pianoLabel, issue_description, photo_count }) {
  return layout({
    internal: true,
    preview: `Damage reported delivering ${pianoLabel} to ${fullName(customer)}.`,
    label: 'Urgent',
    title: 'Damage reported during delivery',
    body: `
      ${note('<strong>Act now:</strong> contact the customer and the driver.', 'alert')}
      ${details([
        ['Customer', `${esc(fullName(customer))}<br>${mailLink(customer.email)}<br>${telLink(customer.phone)}`, true],
        ['Piano', `${esc(pianoLabel)}<br>Serial ${esc(piano.serial_number || '—')}`],
        ['Driver’s notes', esc(issue_description)],
        ['Photos uploaded', esc(photo_count)]
      ])}
      ${p('The delivery is marked “damage reported”. No warranty or tuning has been created; resume the flow from admin once it’s resolved.', { muted: true, small: true, first: true })}
      ${button(`${BUSINESS.siteUrl}/admin/deliveries.html`, 'Open deliveries')}
    `
  })
}

/* Eric: the delivery couldn't be completed. */
function deliveryFailedEmail({ customer, pianoLabel, issue_description }) {
  return layout({
    internal: true,
    preview: `Delivery of ${pianoLabel} to ${fullName(customer)} failed.`,
    label: 'Action needed',
    title: 'Delivery failed',
    body: `
      ${note('<strong>Action:</strong> contact the customer to reschedule.', 'alert')}
      ${details([
        ['Customer', `${esc(fullName(customer))}<br>${mailLink(customer.email)}<br>${telLink(customer.phone)}`, true],
        ['Piano', esc(pianoLabel)],
        ['Reason', esc(issue_description)]
      ])}
      ${button(`${BUSINESS.siteUrl}/admin/deliveries.html`, 'Open deliveries')}
    `
  })
}

module.exports.templates = {
  deliveryCompleteEmail,
  warrantyCertificateEmail,
  deliveryConfirmedInternalEmail,
  damageReportedEmail,
  deliveryFailedEmail
}
