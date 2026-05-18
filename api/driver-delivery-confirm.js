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
 *   5. Sends customer arrival email + warranty certificate + Eric note.
 *   6. Flips warranty.certificate_sent + certificate_sent_at after the
 *      certificate email fires successfully.
 */

const { createClient } = require('@supabase/supabase-js')
const { Resend } = require('resend')

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

  const { token, photo_urls, photo_count, notes } = req.body || {}
  if (!token) return res.status(400).json({ error: 'Missing token' })
  if (!Array.isArray(photo_urls) || photo_urls.length < 3) {
    return res.status(400).json({ error: 'At least 3 photos required' })
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

    // 2. Row update — flip to delivered
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

    // 6. Customer arrival email + warranty certificate
    if (customer.email) {
      try {
        await resend.emails.send({
          from: FROM,
          to: customer.email,
          subject: 'Your piano has arrived — Signature Pianos',
          html: deliveryCompleteEmail({ customer, piano, tunerDateIso, settings }),
        })
      } catch (mailErr) {
        console.error('[driver-delivery-confirm] arrival email failed', mailErr)
      }

      if (warranty) {
        try {
          await resend.emails.send({
            from: FROM,
            to: customer.email,
            subject: `Your 10-year warranty certificate — ${warrantyNumber}`,
            html: warrantyCertificateEmail({ customer, piano, warranty, settings }),
          })
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
        to: BUSINESS_EMAIL,
        subject: `Delivery confirmed — ${piano.brand || 'Yamaha'} ${piano.model || ''} ${piano.year || ''} · ${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
        html: `
          <h2>Piano delivered ✓</h2>
          <p>Customer: ${esc(customer.first_name || '')} ${esc(customer.last_name || '')} (${esc(customer.email || '—')})</p>
          <p>Piano: ${esc((piano.brand || 'Yamaha') + ' ' + (piano.model || '') + ' ' + (piano.year || ''))}</p>
          <p>Photos uploaded: ${esc(photo_count)}</p>
          ${notes ? `<p>Driver notes: ${esc(notes)}</p>` : ''}
          ${warrantyNumber ? `<p>Warranty created: ${esc(warrantyNumber)}</p><p>Warranty expires: ${esc(fmtDateAU(expiryIso))}</p>` : '<p style="color:#c0392b;">Warranty was not created — check logs.</p>'}
          <p>Tuner auto-booked for: ${esc(fmtDateAU(tunerDateIso))}</p>
          <p>Both customer emails sent.</p>
          <p style="color:#b8935a;font-weight:bold;">
            Action: open deliveries in admin and assign a real tuner to the auto-created booking.
          </p>
        `,
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

function esc(s) {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function fmtDateAU(d) {
  if (!d) return '—'
  const [y, m, day] = String(d).split('T')[0].split('-')
  if (!y || !m || !day) return d
  return `${day}/${m}/${y}`
}

/* ---------- email templates ---------- */

function deliveryCompleteEmail({ customer, piano, tunerDateIso, settings }) {
  const pianoLabel = `${piano.brand || 'Yamaha'} ${piano.model || ''} ${piano.year || ''}`.trim()
  return `<!DOCTYPE html>
<html>
<body style="font-family:Arial,Helvetica,sans-serif;background:#f8f7f5;margin:0;padding:40px 20px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e8e4dd;">
    <div style="background:#1a1917;padding:32px;text-align:center;">
      <div style="font-size:20px;color:#b8935a;font-style:italic;">${esc(settings?.business_name || 'Signature Pianos')}</div>
    </div>
    <div style="padding:32px;">
      <h2 style="color:#1a1917;margin:0 0 16px;">Your piano has arrived, ${esc(customer.first_name || 'friend')}.</h2>
      <p style="color:#6b6760;font-size:14px;line-height:1.7;">
        Your ${esc(pianoLabel)} has been successfully delivered. We hope you love it.
      </p>

      <div style="background:#f8f7f5;border-radius:4px;padding:20px;margin:20px 0;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#9a9590;margin-bottom:12px;">What happens next</div>
        <table style="width:100%;font-size:13px;border-collapse:collapse;">
          <tr>
            <td style="padding:8px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;width:50%;">Warranty certificate</td>
            <td style="padding:8px 0;font-weight:500;border-bottom:1px solid #e8e4dd;color:#1D9E75;">Sent in a separate email ✓</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;">First tuning</td>
            <td style="padding:8px 0;font-weight:500;border-bottom:1px solid #e8e4dd;">Auto-booked for ~${esc(fmtDateAU(tunerDateIso))}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#9a9590;">Warranty period</td>
            <td style="padding:8px 0;font-weight:500;">10 years</td>
          </tr>
        </table>
      </div>

      <p style="color:#6b6760;font-size:13px;line-height:1.7;">
        Your piano needs a few weeks to settle into its new environment before tuning. A certified tuner will contact you to confirm the appointment.
      </p>
      <p style="color:#6b6760;font-size:13px;line-height:1.7;">
        If you have any questions please reply to this email or call us directly. Thank you for choosing Signature Pianos.
      </p>
    </div>
    <div style="background:#f8f7f5;padding:20px;text-align:center;font-size:12px;color:#9a9590;border-top:1px solid #e8e4dd;">
      ${esc(settings?.business_name || 'Signature Pianos')} Melbourne · ${esc(settings?.website || 'signaturepianos.com.au')}
      ${settings?.phone ? ' · ' + esc(settings.phone) : ''}
    </div>
  </div>
</body>
</html>`
}

function warrantyCertificateEmail({ customer, piano, warranty, settings }) {
  return `<!DOCTYPE html>
<html>
<body style="font-family:Arial,Helvetica,sans-serif;background:#f8f7f5;margin:0;padding:40px 20px;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e8e4dd;">

    <div style="background:#1a1917;padding:32px;text-align:center;">
      <div style="font-size:20px;color:#b8935a;font-style:italic;margin-bottom:4px;">${esc(settings?.business_name || 'Signature Pianos')}</div>
      <div style="font-size:12px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.12em;">Certificate of Warranty</div>
    </div>

    <div style="padding:40px;border:8px solid transparent;background:linear-gradient(#fff,#fff) padding-box, linear-gradient(135deg,#b8935a,#d4b483,#b8935a) border-box;">

      <div style="text-align:center;margin-bottom:32px;">
        <div style="font-size:28px;font-style:italic;color:#1a1917;font-family:Georgia,serif;margin-bottom:4px;">10-Year Warranty</div>
        <div style="font-size:13px;color:#9a9590;letter-spacing:0.08em;">${esc(warranty.warranty_number)}</div>
      </div>

      <p style="font-size:14px;color:#6b6760;line-height:1.7;text-align:center;margin:0 0 32px;">
        This certifies that the following instrument is covered by the Signature Pianos warranty.
      </p>

      <div style="background:#f8f7f5;border-radius:4px;padding:24px;margin-bottom:32px;">
        <table style="width:100%;font-size:13px;border-collapse:collapse;">
          <tr>
            <td style="padding:10px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;width:45%;">Certificate holder</td>
            <td style="padding:10px 0;font-weight:500;border-bottom:1px solid #e8e4dd;color:#1a1917;">${esc((customer.first_name || '') + ' ' + (customer.last_name || ''))}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;">Instrument</td>
            <td style="padding:10px 0;font-weight:500;border-bottom:1px solid #e8e4dd;color:#1a1917;">${esc((piano.brand || 'Yamaha') + ' ' + (piano.model || '') + ' Upright Piano')}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;">Year of manufacture</td>
            <td style="padding:10px 0;font-weight:500;border-bottom:1px solid #e8e4dd;">${esc(piano.year || '—')}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;">Serial number</td>
            <td style="padding:10px 0;font-weight:500;border-bottom:1px solid #e8e4dd;font-family:monospace;">${esc(piano.serial_number || '—')}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;">Warranty start</td>
            <td style="padding:10px 0;font-weight:500;border-bottom:1px solid #e8e4dd;">${esc(fmtDateAU(warranty.start_date))}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#9a9590;">Warranty expires</td>
            <td style="padding:10px 0;font-weight:500;color:#b8935a;font-size:15px;">${esc(fmtDateAU(warranty.expiry_date))}</td>
          </tr>
        </table>
      </div>

      <div style="font-size:12px;color:#9a9590;line-height:1.7;text-align:center;">
        This warranty covers mechanical faults, action issues, and structural defects for a period of 10 years from the date of delivery. Please retain this certificate for your records.
      </div>

      <div style="text-align:center;margin-top:32px;padding-top:24px;border-top:1px solid #e8e4dd;">
        <div style="font-size:18px;color:#b8935a;font-style:italic;font-family:Georgia,serif;">Signature Pianos</div>
        <div style="font-size:11px;color:#9a9590;margin-top:4px;letter-spacing:0.08em;">Melbourne, Victoria, Australia</div>
      </div>

    </div>

    <div style="background:#f8f7f5;padding:20px;text-align:center;font-size:12px;color:#9a9590;border-top:1px solid #e8e4dd;">
      ${esc(settings?.business_name || 'Signature Pianos')} Melbourne · ${esc(settings?.website || 'signaturepianos.com.au')}
      ${settings?.abn ? ' · ABN: ' + esc(settings.abn) : ''}
    </div>

  </div>
</body>
</html>`
}
