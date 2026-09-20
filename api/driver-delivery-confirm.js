/*
 * Signature Pianos — driver delivery confirmation
 * -----------------------------------------------
 * POST /api/driver-delivery-confirm
 *   body: { token, photo_urls, notes, delivery_status, issue_description }
 *   delivery_status 'damage' | 'failed' takes the issue branch (1b);
 *   anything else is a normal delivery.
 *
 *   1. Verifies the delivery_link_token (exact match) and the state: a
 *      delivery can't be confirmed twice, and once damage is reported the
 *      link is closed until admin moves the status back. 'failed' stays
 *      open so the same link works for the redelivery. Photo URLs must be
 *      this delivery's own uploads in the delivery-photos bucket.
 *   2. Updates deliveries — delivery_photos, delivered_at, delivery_notes,
 *      status='delivered'. Service role write (bypasses anon guard),
 *      conditional on the status so a double tap can't confirm twice.
 *   3. Creates a warranties row for pianos.warranty_years (default 10;
 *      0 means no Signature warranty), starting today in Melbourne.
 *      warranty_number comes from the column default
 *      (generate_warranty_number, a sequence) and expiry_date from the
 *      compute_warranty_expiry trigger; both are read back from the insert.
 *      An existing warranty for the order is reused, not duplicated.
 *   4. If the piano needs one (pianos.requires_tuner_booking, default
 *      true) and the order has none yet, creates an auto-booked
 *      tuner_bookings row with trigger_date 25 days out (Melbourne). The
 *      daily cron sends the contact emails when trigger_date arrives.
 *      log_date_token / completion_token come from the column defaults.
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
const { melbourneDate, addDays } = require('../lib/dates')
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

const isToken = t => typeof t === 'string' && t.length >= 16 && t.length <= 200

// The delivery link accepts a submission in any of these states. Not after
// 'delivered' (already done) or 'damage_reported' (admin decides what next,
// and can reopen the link by moving the status back). 'failed' stays open so
// the same link works for the redelivery.
const OPEN_STATUSES = ['scheduled', 'pickup_pending', 'picked_up', 'in_transit', 'failed']

// First tuning: this many days after delivery (Melbourne calendar).
const TUNING_AFTER_DAYS = 25

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { token, photo_urls, notes, delivery_status } = req.body || {}
  if (!isToken(token)) return res.status(400).json({ error: 'Missing or invalid token' })
  if (!Array.isArray(photo_urls) || photo_urls.length < 3) {
    return res.status(400).json({ error: 'At least 3 photos required' })
  }
  if (notes != null && (typeof notes !== 'string' || notes.length > 2000)) {
    return res.status(400).json({ error: 'Notes must be 2000 characters or fewer' })
  }
  const issueKind = (delivery_status === 'damage' || delivery_status === 'failed') ? delivery_status : null
  const rawIssue = (req.body || {}).issue_description
  const issue_description = typeof rawIssue === 'string' ? rawIssue.trim() : ''
  if (issueKind && !issue_description) {
    return res.status(400).json({ error: 'Please describe what happened before submitting.' })
  }
  if (issue_description.length > 4000) {
    return res.status(400).json({ error: 'Description must be 4000 characters or fewer' })
  }
  const cleanNotes = typeof notes === 'string' && notes.trim() ? notes.trim() : null

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
    if (!delivery || delivery.delivery_link_token !== token) {
      return res.status(404).json({ error: 'Delivery not found' })
    }

    if (delivery.status === 'delivered') {
      return res.status(409).json({ error: 'Delivery already confirmed' })
    }
    if (!OPEN_STATUSES.includes(delivery.status)) {
      return res.status(409).json({ error: 'Damage has already been reported for this delivery. Please call Signature Pianos.' })
    }

    const photos = checkPhotoUrls(photo_urls, delivery.id, 'delivery')
    if (!photos) {
      return res.status(400).json({ error: 'Photo upload not recognised. Please upload the photos again.' })
    }
    const photo_count = photos.length

    const order    = delivery.order || {}
    const customer = order.customer || {}
    const piano    = order.piano    || {}
    const pianoLabel = `${piano.brand || 'Yamaha'} ${piano.model || ''} ${piano.year || ''}`.trim()

    // Every status change below is conditional on the row still being open,
    // so two submissions (double tap, two tabs) can't both apply.
    const updateOpenDelivery = async (fields) => {
      const { data: rows, error: err } = await supabase
        .from('deliveries')
        .update(fields)
        .eq('id', delivery.id)
        .eq('delivery_link_token', token)
        .in('status', OPEN_STATUSES)
        .select('id')
      if (err) throw err
      return !!(rows && rows.length)
    }

    // 1b. Session 13 — damage or failed-delivery branch.
    //     Writes the new damage_* / failed_* columns, urgent-emails
    //     Eric, and returns early WITHOUT creating warranty or auto-
    //     booking the tuner. The flow can be resumed manually from
    //     admin after the issue is resolved.
    if (issueKind === 'damage') {
      const applied = await updateOpenDelivery({
        damage_reported:    true,
        damage_reported_at: new Date().toISOString(),
        damage_notes:       issue_description,
        damage_photos:      photos,
        delivery_notes:     cleanNotes,
        status:             'damage_reported',
      })
      if (!applied) return res.status(409).json({ error: 'This delivery has already been submitted.' })
      let notified = false
      try {
        const { error: mailErr } = await resend.emails.send({
          from: FROM,
          to: internalRecipients(),
          subject: `Urgent: delivery damage reported · ${pianoLabel}`,
          html: damageReportedEmail({ customer, piano, pianoLabel, issue_description, photo_count }),
        })
        if (mailErr) throw mailErr
        notified = true
      } catch (mailErr) {
        console.error('[driver-delivery-confirm] damage email failed', mailErr)
      }
      return res.status(200).json({ success: true, status: 'damage_reported', notified })
    }

    if (issueKind === 'failed') {
      const applied = await updateOpenDelivery({
        failed_delivery:        true,
        failed_delivery_reason: issue_description,
        failed_delivery_at:     new Date().toISOString(),
        delivery_photos:        photos,
        delivery_notes:         cleanNotes,
        status:                 'failed',
      })
      if (!applied) return res.status(409).json({ error: 'This delivery has already been submitted.' })
      let notified = false
      try {
        const { error: mailErr } = await resend.emails.send({
          from: FROM,
          to: internalRecipients(),
          subject: `Delivery failed · ${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
          html: deliveryFailedEmail({ customer, pianoLabel, issue_description }),
        })
        if (mailErr) throw mailErr
        notified = true
      } catch (mailErr) {
        console.error('[driver-delivery-confirm] failed email failed', mailErr)
      }
      return res.status(200).json({ success: true, status: 'failed', notified })
    }

    // 2. Normal happy-path — row update — flip to delivered
    const applied = await updateOpenDelivery({
      delivery_photos:  photos,
      delivered_at:     new Date().toISOString(),
      delivery_notes:   cleanNotes,
      status:           'delivered',
    })
    if (!applied) return res.status(409).json({ error: 'Delivery already confirmed' })

    // Calendar dates are Melbourne's: Vercel runs in UTC, so a morning
    // delivery would otherwise start its warranty the day before.
    const todayIso = melbourneDate()

    // 3. Warranty record. Length from the piano (default 10 years; 0 means
    //    no Signature warranty). warranty_number and expiry_date are set by
    //    the database (sequence default + trigger) and read back here.
    const warrantyYears = piano.warranty_years == null ? 10 : Number(piano.warranty_years)
    let warranty = null
    let warrantyNumber = null
    let expiryIso = null
    let warrantyExisted = false
    if (warrantyYears > 0 && order.id) {
      try {
        const { data: existing, error: exErr } = await supabase
          .from('warranties')
          .select('*')
          .eq('order_id', order.id)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()
        if (exErr) throw exErr
        if (existing) {
          warranty = existing
          warrantyExisted = true
        } else {
          const { data: w, error: wErr } = await supabase
            .from('warranties')
            .insert({
              order_id:    order.id,
              customer_id: customer.id || null,
              piano_id:    piano.id    || null,
              start_date:  todayIso,
              years:       warrantyYears,
              status:      'active',
              certificate_sent: false,
            })
            .select('*')
            .single()
          if (wErr) throw wErr
          warranty = w
        }
        warrantyNumber = warranty.warranty_number
        expiryIso = warranty.expiry_date
      } catch (warrErr) {
        console.error('[driver-delivery-confirm] warranty insert failed', warrErr)
        // Don't abort — the delivery is the source of truth; warranty can
        // be created manually if this step fails.
        warranty = null
      }
    }

    // 4. Auto tuner booking — 25 days from today (Melbourne), only when the
    //    piano needs one and the order doesn't already have a booking.
    //    New flow (Session 12 rebuild): just create the row with a
    //    trigger_date. The daily cron fires the customer + tuner
    //    contact emails when trigger_date hits today. No emails
    //    sent immediately here. log_date_token and completion_token come
    //    from the column defaults (generate_token()).
    const tuningIncluded = piano.requires_tuner_booking !== false
    let tunerDateIso = null
    let tunerBooking = tuningIncluded ? 'failed' : 'not_required'
    if (tuningIncluded && order.id) {
      try {
        const { data: existingTb, error: tbReadErr } = await supabase
          .from('tuner_bookings')
          .select('id, trigger_date, proposed_date, confirmed_date')
          .eq('order_id', order.id)
          .limit(1)
          .maybeSingle()
        if (tbReadErr) throw tbReadErr
        if (existingTb) {
          tunerBooking = 'existing'
          tunerDateIso = existingTb.confirmed_date || existingTb.trigger_date || existingTb.proposed_date || null
        } else {
          const triggerDate = addDays(todayIso, TUNING_AFTER_DAYS)
          const { error: tbErr } = await supabase
            .from('tuner_bookings')
            .insert({
              order_id:         order.id,
              customer_id:      customer.id || null,
              warranty_id:      warranty?.id || null,
              trigger_date:     triggerDate,
              // proposed_date stays in sync for backwards-compat with the
              // existing admin form; the cron only reads trigger_date.
              proposed_date:    triggerDate,
              status:           'pending',
              auto_booked:      true,
              contact_sent:     false,
              date_logged:      false,
              completed:        false,
            })
          if (tbErr) throw tbErr
          tunerBooking = 'booked'
          tunerDateIso = triggerDate
        }
      } catch (tbErr) {
        console.error('[driver-delivery-confirm] tuner_bookings insert failed', tbErr)
        tunerBooking = 'failed'
      }
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

    // 6. Customer arrival email + warranty certificate. A warranty reused
    //    from an earlier confirmation whose certificate already went out is
    //    not sent again.
    const years = Number(warranty?.years) || warrantyYears
    const certificateAlreadySent = warrantyExisted && !!warranty?.certificate_sent
    let arrivalSent = false
    let certificateSent = certificateAlreadySent
    let certificateFlagFailed = false
    if (customer.email) {
      try {
        const photoUrl = await placementPhotoUrl(photos)
        const { error: arrivalErr } = await resend.emails.send({
          from: FROM,
          to: customer.email,
          reply_to: BUSINESS_EMAIL,
          subject: 'Your piano has arrived — Signature Pianos',
          html: deliveryCompleteEmail({
            customer, piano, tunerDateIso, settings, photoUrl,
            warrantyYears: warranty ? years : 0, tuningIncluded,
          }),
        })
        if (arrivalErr) throw arrivalErr
        arrivalSent = true
      } catch (mailErr) {
        console.error('[driver-delivery-confirm] arrival email failed', mailErr)
      }

      if (warranty && !certificateAlreadySent) {
        try {
          const { error: certErr } = await resend.emails.send({
            from: FROM,
            to: customer.email,
            reply_to: BUSINESS_EMAIL,
            subject: `Your ${years}-year warranty certificate — ${warrantyNumber}`,
            html: warrantyCertificateEmail({ customer, piano, warranty, settings, attached: !!certificate }),
            attachments: certificate ? [certificate] : undefined,
          })
          if (certErr) throw certErr
          certificateSent = true
        } catch (certErr) {
          console.error('[driver-delivery-confirm] certificate email failed', certErr)
        }
        // The email went out; if recording that fails, log it and flag it to
        // Eric rather than failing the driver's (already applied) confirmation.
        if (certificateSent) {
          const { error: flagErr } = await supabase
            .from('warranties')
            .update({ certificate_sent: true, certificate_sent_at: new Date().toISOString() })
            .eq('id', warranty.id)
          if (flagErr) {
            certificateFlagFailed = true
            console.error('[driver-delivery-confirm] certificate_sent update failed', flagErr)
          }
        }
      }
    }

    // 7. Internal Eric notification
    try {
      const { error: mailErr } = await resend.emails.send({
        from: FROM,
        to: internalRecipients(),
        subject: `Delivery confirmed — ${piano.brand || 'Yamaha'} ${piano.model || ''} ${piano.year || ''} · ${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
        html: deliveryConfirmedInternalEmail({
          customer, pianoLabel, photo_count, notes: cleanNotes, warrantyNumber, expiryIso, tunerDateIso,
          arrivalSent, certificateSent, certificateAttached: !!certificate, hasEmail: !!customer.email,
          warrantyYears, warrantyExisted, certificateAlreadySent, certificateFlagFailed, tunerBooking,
        }),
        attachments: certificate ? [certificate] : undefined,
      })
      if (mailErr) throw mailErr
    } catch (mailErr) {
      console.error('[driver-delivery-confirm] internal email failed', mailErr)
    }

    return res.status(200).json({
      success: true,
      customer_notified: arrivalSent,
      warranty_number: warrantyNumber,
      warranty_years: warranty ? years : 0,
      tuner_booking: tunerBooking,
      tuner_date: tunerDateIso,
    })
  } catch (err) {
    console.error('[driver-delivery-confirm] handler failed', err)
    return res.status(500).json({ error: err.message || 'Confirm failed' })
  }
}

/* ---------- helpers ---------- */

/*
 * The photo URLs must be public delivery-photos objects in this delivery's
 * own folder ({deliveryId}/{leg}/<file>), exactly as the upload page makes
 * them, on our Supabase project. Anything else (another delivery's folder,
 * an outside host, a javascript: link) is refused: these URLs end up as
 * links and images in admin and in customer emails.
 * Returns the de-duplicated list (3 to 20 photos), or null.
 */
function checkPhotoUrls(urls, deliveryId, leg) {
  if (!Array.isArray(urls)) return null
  let ourHost = ''
  try { ourHost = new URL(process.env.SUPABASE_URL).host } catch { /* no env: fall back below */ }
  const prefix = `/storage/v1/object/public/delivery-photos/${deliveryId}/${leg}/`
  const out = []
  for (const raw of urls) {
    if (typeof raw !== 'string' || raw.length > 500) return null
    let u
    try { u = new URL(raw) } catch { return null }
    if (u.protocol !== 'https:' || u.search || u.hash) return null
    if (ourHost ? u.host !== ourHost : !u.host.endsWith('.supabase.co')) return null
    if (!u.pathname.startsWith(prefix)) return null
    if (!/^[A-Za-z0-9._-]+$/.test(u.pathname.slice(prefix.length))) return null
    if (!out.includes(u.href)) out.push(u.href)
  }
  return out.length >= 3 && out.length <= 20 ? out : null
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

/*
 * Customer: the piano is in. Sent the moment the driver confirms delivery.
 * warrantyYears 0 leaves the warranty line out; tuningIncluded false leaves
 * the tuning line out, and without a tunerDateIso the tuning line has no date.
 */
function deliveryCompleteEmail({ customer, piano, tunerDateIso, settings, photoUrl, warrantyYears = 10, tuningIncluded = true }) {
  const name = esc(pianoName(piano))
  const tuningLine = !tuningIncluded ? null : tunerDateIso
    ? `<strong>Your first tuning is included.</strong> A piano needs a few weeks to settle into a new room, so around ${esc(longDate(tunerDateIso))} a tuner will contact you to arrange a time.`
    : `<strong>Your first tuning is included.</strong> A piano needs a few weeks to settle into a new room, so we will be in touch in 3–4 weeks to arrange a time.`
  const portalItems = ['delivery', warrantyYears > 0 ? 'warranty' : null, tuningIncluded ? 'tuning' : null].filter(Boolean)
  const portalLine = portalItems.length === 1
    ? 'Your delivery details are in one place.'
    : `Your ${portalItems.slice(0, -1).join(', ')} and ${portalItems[portalItems.length - 1]} are all in one place.`
  const photo = photoUrl ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;"><tr><td>
      <img src="${esc(photoUrl)}" width="504" alt="Your ${name} in place" style="display:block;width:100%;max-width:504px;height:auto;border:0;background:${C.ivory};">
    </td></tr></table>
    <p style="margin:8px 0 0;font-family:${TEXT};font-size:12px;line-height:18px;color:${C.inkSoft};">Your ${name} in place, photographed by our delivery team.</p>` : ''
  return layout({
    preview: `Your ${pianoName(piano)} has been delivered.${warrantyYears > 0 ? ' Your warranty certificate is in a separate email.' : ''}`,
    label: 'Your delivery',
    title: 'Your piano is home',
    body: `
      ${hello(customer.first_name)}
      ${p(`Your <strong>${name}${piano.year ? ` (${esc(piano.year)})` : ''}</strong> has been delivered and placed. We hope it brings you years of music.`)}
      ${photo}
      ${steps([
        warrantyYears > 0 ? `<strong>Your ${esc(warrantyYears)}-year warranty.</strong> The certificate is in a separate email, as a PDF to keep.` : null,
        tuningLine,
        `<strong>Your customer portal.</strong> ${portalLine}`
      ].filter(Boolean))}
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
function deliveryConfirmedInternalEmail({
  customer, pianoLabel, photo_count, notes, warrantyNumber, expiryIso, tunerDateIso,
  arrivalSent, certificateSent, certificateAttached, hasEmail,
  warrantyYears = 10, warrantyExisted = false, certificateAlreadySent = false,
  certificateFlagFailed = false, tunerBooking = 'booked',
}) {
  const hasWarranty = !!warrantyNumber
  const emails = !hasEmail
    ? 'None: the customer has no email address on file.'
    : [
        arrivalSent ? 'Arrival email sent' : 'Arrival email FAILED',
        !hasWarranty ? null
          : certificateAlreadySent ? 'warranty certificate was already sent earlier'
          : certificateSent ? 'warranty email sent' : 'warranty email FAILED',
      ].filter(Boolean).join(', ') + '.'
  const bad = (text) => `<span style="color:${C.felt};font-weight:500;">${text}</span>`
  const warrantyCell = hasWarranty
    ? `${esc(warrantyNumber)}${warrantyExisted ? ' (existing)' : ''}<br>Expires ${esc(longDate(expiryIso))}${certificateAttached ? '<br>Certificate attached' : ''}` +
      (certificateFlagFailed ? `<br>${bad('Certificate emailed, but certificate_sent was not saved. Check the logs.')}` : '')
    : warrantyYears > 0
      ? bad('Not created. Check the logs.')
      : 'None: this piano is set to 0 warranty years.'
  const tuningCell = {
    booked:       `Auto-booked for ${esc(longDate(tunerDateIso))}`,
    existing:     `Already booked${tunerDateIso ? ` for ${esc(longDate(tunerDateIso))}` : ''} (no new booking made)`,
    not_required: 'Not included for this piano.',
    failed:       bad('NOT booked: the booking could not be created. Book it by hand and check the logs.'),
  }[tunerBooking] || esc(tunerBooking)
  const action = tunerBooking === 'booked'
    ? note('<strong>Action:</strong> open Deliveries in admin and assign a tuner to the auto-created booking.', 'alert')
    : tunerBooking === 'failed'
      ? note('<strong>Action:</strong> the first tuning was NOT booked. Open Deliveries in admin and create the tuner booking by hand.', 'alert')
      : ''
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
        ['Warranty', warrantyCell],
        ['First tuning', tuningCell],
        ['Customer emails', esc(emails)]
      ])}
      ${action}
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
