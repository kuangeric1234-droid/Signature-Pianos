/*
 * Signature Pianos — shared tuner email templates
 * -----------------------------------------------
 * The day-25 contact-stage emails fired by:
 *   - api/cron-delivery-reminders.js (auto, when trigger_date hits)
 *   - api/tuner-send-contact.js (manual, fired from admin button)
 *
 * The two send the same two-email pair (customer heads-up + tuner
 * action) so the templates live here to avoid drift.
 */

function esc(s) {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/* Customer heads-up — sent on day 25 (or whenever admin manually
 * triggers). Tells the customer their piano is ready for its first
 * tuning and that a tuner will call them directly. */
function customerTuningReadyEmail({ customer, piano, settings }) {
  const pianoLabel = `${piano?.brand || 'Yamaha'} ${piano?.model || ''} ${piano?.year || ''}`.trim()
  return `<!DOCTYPE html>
<html>
<body style="font-family:Arial,Helvetica,sans-serif;background:#f8f7f5;margin:0;padding:40px 20px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e8e4dd;">
    <div style="background:#1a1917;padding:32px;text-align:center;">
      <div style="font-size:20px;color:#b8935a;font-style:italic;">${esc(settings?.business_name || 'Signature Pianos')}</div>
    </div>
    <div style="padding:32px;">
      <h2 style="color:#1a1917;margin:0 0 16px;">Your piano is ready for its first tuning, ${esc(customer?.first_name || 'friend')}.</h2>
      <p style="color:#6b6760;font-size:14px;line-height:1.7;">
        Your ${esc(pianoLabel)} has now had enough time to settle into its new environment. It is ready for its complimentary first tuning.
      </p>
      <div style="background:#f0f9f4;border:1px solid #9fe1cb;border-radius:4px;padding:16px;margin:20px 0;">
        <div style="font-size:14px;font-weight:500;color:#085041;margin-bottom:8px;">What happens next</div>
        <div style="font-size:13px;color:#085041;line-height:1.8;">
          ✓ One of our certified tuners will contact you directly to arrange a convenient time<br>
          ✓ They will call or email you within the next few days<br>
          ✓ You will receive a confirmation email once the date is agreed
        </div>
      </div>
      <p style="color:#6b6760;font-size:13px;line-height:1.7;">
        If you have not heard from a tuner within 3 days please reply to this email and we will follow up.
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

/* Tuner action email — sent at the same time as the customer heads-up.
 * Hands the tuner the customer's name + phone + email + address + the
 * log-date link. Tuner contacts the customer themselves, agrees a date,
 * then opens the link. */
function tunerContactEmail({ tuner, customer, piano, logDateUrl }) {
  const pianoLabel = `${piano?.brand || 'Yamaha'} ${piano?.model || ''} ${piano?.year || ''}`.trim()
  const fullAddress = [
    customer?.address_line1, customer?.address_line2,
    customer?.suburb, customer?.state, customer?.postcode,
  ].filter(Boolean).map(esc).join(', ') || '—'

  return `<!DOCTYPE html>
<html>
<body style="font-family:Arial,Helvetica,sans-serif;background:#f8f7f5;margin:0;padding:40px 20px;">
  <div style="max-width:580px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e8e4dd;">
    <div style="background:#1a1917;padding:32px;text-align:center;">
      <div style="font-size:20px;color:#b8935a;font-style:italic;">Signature Pianos</div>
      <div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:4px;">New tuning job</div>
    </div>
    <div style="padding:32px;">
      <h2 style="color:#1a1917;margin:0 0 8px;">Hi ${esc(tuner?.name || '')},</h2>
      <p style="color:#6b6760;font-size:14px;line-height:1.7;margin:0 0 24px;">
        You have a new tuning job from Signature Pianos. Please contact the customer directly to arrange a convenient time, then log the agreed date using the link below.
      </p>

      <div style="background:#f8f7f5;border-radius:4px;padding:16px;margin-bottom:20px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#9a9590;margin-bottom:10px;">Customer details</div>
        <table style="width:100%;font-size:13px;border-collapse:collapse;">
          <tr><td style="padding:7px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;width:35%;">Name</td><td style="padding:7px 0;font-weight:500;border-bottom:1px solid #e8e4dd;">${esc((customer?.first_name || '') + ' ' + (customer?.last_name || ''))}</td></tr>
          <tr><td style="padding:7px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;">Phone</td><td style="padding:7px 0;border-bottom:1px solid #e8e4dd;"><a href="tel:${esc(customer?.phone || '')}" style="color:#b8935a;font-size:14px;font-weight:500;">${esc(customer?.phone || '—')}</a></td></tr>
          <tr><td style="padding:7px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;">Email</td><td style="padding:7px 0;border-bottom:1px solid #e8e4dd;"><a href="mailto:${esc(customer?.email || '')}" style="color:#b8935a;">${esc(customer?.email || '—')}</a></td></tr>
          <tr><td style="padding:7px 0;color:#9a9590;">Address</td><td style="padding:7px 0;">${fullAddress}</td></tr>
        </table>
      </div>

      <div style="background:#f8f7f5;border-radius:4px;padding:16px;margin-bottom:20px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#9a9590;margin-bottom:10px;">Piano details</div>
        <table style="width:100%;font-size:13px;border-collapse:collapse;">
          <tr><td style="padding:7px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;width:35%;">Piano</td><td style="padding:7px 0;font-weight:500;border-bottom:1px solid #e8e4dd;">${esc(pianoLabel)}</td></tr>
          <tr><td style="padding:7px 0;color:#9a9590;border-bottom:1px solid #e8e4dd;">Serial</td><td style="padding:7px 0;border-bottom:1px solid #e8e4dd;font-family:monospace;">${esc(piano?.serial_number || '—')}</td></tr>
          <tr><td style="padding:7px 0;color:#9a9590;">Condition</td><td style="padding:7px 0;">${esc(piano?.condition || '—')}</td></tr>
        </table>
      </div>

      <div style="background:#f0f9f4;border:1px solid #9fe1cb;border-radius:4px;padding:16px;margin-bottom:24px;">
        <div style="font-size:13px;font-weight:500;color:#085041;margin-bottom:8px;">What to do</div>
        <div style="font-size:13px;color:#085041;line-height:1.8;">
          1. Call or email the customer to arrange a convenient time<br>
          2. Once you have agreed on a date and time use the button below to log it<br>
          3. Both the customer and Signature Pianos will be notified automatically
        </div>
      </div>

      <div style="text-align:center;margin-bottom:20px;">
        <a href="${esc(logDateUrl || '#')}"
           style="display:inline-block;background:#b8935a;color:#000;padding:14px 36px;border-radius:4px;text-decoration:none;font-size:14px;font-weight:500;">
          Log agreed date →
        </a>
        <p style="font-size:12px;color:#9a9590;margin:10px 0 0;">
          Use this link after you have spoken with the customer and agreed on a date and time.
        </p>
      </div>

      <p style="font-size:12px;color:#9a9590;line-height:1.6;border-top:1px solid #e8e4dd;padding-top:16px;">
        Questions? Contact Eric at Signature Pianos. Reply to this email or call directly.
      </p>
    </div>
    <div style="background:#f8f7f5;padding:20px;text-align:center;font-size:12px;color:#9a9590;border-top:1px solid #e8e4dd;">
      Signature Pianos Melbourne · signaturepianos.com.au
    </div>
  </div>
</body>
</html>`
}

module.exports = { customerTuningReadyEmail, tunerContactEmail }
