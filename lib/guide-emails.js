/*
 * Signature Pianos — buyer's guide emails
 * ---------------------------------------
 * Sent by api/buyer-guide.js when someone asks for the guide on the homepage:
 *   guideEmail()          the customer's copy, in the brand (brand/BRAND-GUIDELINES.md)
 *   guideInternalEmail()  the heads-up to BUSINESS_EMAIL
 *
 * Email clients ignore most web fonts, so the display face falls back through
 * Bodoni and Didot to Georgia, and Jost falls back to Helvetica Neue / Arial.
 * Layout is tables with inline styles so it holds up in Gmail and Outlook.
 */

const INK = '#16222E'
const INK_SOFT = '#3A4855'
const IVORY = '#F3F0E9'
const IVORY_DEEP = '#E9E5DB'
const FELT = '#4A1520'
const DISPLAY = "'Noto Serif Display','Bodoni 72','Didot','Bodoni MT',Georgia,'Times New Roman',serif"
const TEXT = "Jost,'Helvetica Neue',Helvetica,Arial,sans-serif"

function esc(s) {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const label = (text, color = INK_SOFT) =>
  `<div style="font-family:${TEXT};font-size:11px;line-height:16px;letter-spacing:3px;text-transform:uppercase;color:${color};">${text}</div>`

function insideRow(title, body, last) {
  return `
    <tr>
      <td style="padding:14px 0;${last ? '' : `border-bottom:1px solid ${IVORY_DEEP};`}">
        <div style="font-family:${DISPLAY};font-size:17px;line-height:20px;font-weight:500;letter-spacing:.5px;text-transform:uppercase;color:${INK};">${title}</div>
        <div style="font-family:${TEXT};font-size:14px;line-height:22px;color:${INK_SOFT};padding-top:4px;">${body}</div>
      </td>
    </tr>`
}

/* The customer's email: the guide, what is in it, and an invitation to play. */
function guideEmail({ firstName, guideUrl, coverUrl, logoUrl, siteUrl }) {
  const name = esc(firstName || 'there')
  const visitUrl = `${siteUrl}/services/book-a-viewing.html`
  const subject = 'Your Yamaha buyer\'s guide from Signature Pianos'
  const preheader = 'Every Yamaha upright and grand from 1970 to today, in one guide.'

  const html = `<!DOCTYPE html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${esc(subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500&family=Noto+Serif+Display:wdth,wght@62.5,500&display=swap" rel="stylesheet">
<style>
  @media (max-width:620px) {
    .sp-card { padding:32px 24px !important; }
    .sp-h1 { font-size:34px !important; line-height:34px !important; }
  }
  a { color:${INK}; }
</style>
</head>
<body style="margin:0;padding:0;background:${IVORY};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${IVORY};">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${IVORY};">
  <tr>
    <td align="center" style="padding:36px 16px 48px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">

        <!-- the lockup, centred like the website header, with the felt rule under it -->
        <tr>
          <td align="center" style="padding:0 0 18px;">
            <a href="${siteUrl}/" style="text-decoration:none;"><img src="${logoUrl}" width="150" alt="Signature Pianos" style="display:block;width:150px;height:auto;border:0;"></a>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 0 30px;">
            <div style="width:36px;height:2px;background:${FELT};line-height:2px;font-size:0;">&nbsp;</div>
          </td>
        </tr>

        <tr>
          <td class="sp-card" style="background:#FFFFFF;padding:44px 48px 40px;">

            ${label('The Signature buyer\'s guide')}
            <h1 class="sp-h1" style="margin:14px 0 0;font-family:${DISPLAY};font-weight:500;font-size:42px;line-height:40px;letter-spacing:-.5px;text-transform:uppercase;color:${INK};">Your Yamaha<br>buyer's guide</h1>

            <p style="margin:26px 0 0;font-family:${TEXT};font-size:16px;line-height:26px;color:${INK};">Hi ${name},</p>
            <p style="margin:12px 0 0;font-family:${TEXT};font-size:16px;line-height:26px;color:${INK_SOFT};">Thank you for asking for our guide. It covers every Yamaha upright and grand you are likely to meet as a Japanese import, from 1970 to today: what each model is, what changed from one to the next, and which one suits your home.</p>

            <!-- the cover, then the one action -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:30px;">
              <tr>
                <td align="center" style="background:${IVORY};padding:28px 0;">
                  <a href="${guideUrl}" style="text-decoration:none;"><img src="${coverUrl}" width="220" alt="The Yamaha buyer's guide from Signature Pianos, cover" style="display:block;width:220px;height:auto;border:1px solid ${IVORY_DEEP};"></a>
                </td>
              </tr>
            </table>

            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:28px auto 0;">
              <tr>
                <td align="center" bgcolor="${INK}" style="background:${INK};">
                  <a href="${guideUrl}" style="display:inline-block;padding:17px 34px 15px;font-family:${TEXT};font-size:13px;line-height:16px;font-weight:500;letter-spacing:3px;text-transform:uppercase;color:#FFFFFF;text-decoration:none;">Download the guide</a>
                </td>
              </tr>
            </table>
            <p style="margin:12px 0 0;text-align:center;font-family:${TEXT};font-size:12px;line-height:18px;color:${INK_SOFT};">PDF · 33 pages · 2.5 MB</p>

            <!-- what is inside -->
            <div style="margin-top:36px;">${label('Inside')}</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;border-top:1px solid ${IVORY_DEEP};">
              ${insideRow('Which Yamaha is which', 'The U1 and U3, the X series, YU10 to YU33, YUS1 to YUS5, and the G, C and CX grands, generation by generation.')}
              ${insideRow('How to date a piano', 'Reading the model name and the serial number, with Yamaha\'s own year-by-year chart.')}
              ${insideRow('Choosing well', 'Room sizes, a ten-point viewing checklist, and what to budget for each era.', true)}
            </table>

            <!-- a word from Eric -->
            <p style="margin:34px 0 0;font-family:${TEXT};font-size:16px;line-height:26px;color:${INK_SOFT};">Every piano in the guide sounds different in person. When you are ready, come and play as many as you like at our Mount Waverley showroom. Reply to this email or call me on <a href="tel:+61479128955" style="color:${INK};text-decoration:none;">0479&nbsp;128&nbsp;955</a> with any question the guide doesn't answer.</p>
            <p style="margin:22px 0 0;font-family:${DISPLAY};font-style:italic;font-size:24px;line-height:28px;color:${INK};">Eric Kuang</p>
            <p style="margin:2px 0 0;font-family:${TEXT};font-size:13px;line-height:20px;color:${INK_SOFT};">Founder, Signature Pianos</p>

            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
              <tr>
                <td style="border:1px solid ${INK};">
                  <a href="${visitUrl}" style="display:inline-block;padding:14px 26px 12px;font-family:${TEXT};font-size:12px;line-height:16px;font-weight:500;letter-spacing:3px;text-transform:uppercase;color:${INK};text-decoration:none;">Book a visit</a>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- footer -->
        <tr>
          <td align="center" style="padding:30px 12px 0;font-family:${TEXT};font-size:11px;line-height:20px;letter-spacing:2px;text-transform:uppercase;color:${INK_SOFT};">
            63 Blackburn Road, Mount Waverley VIC 3149<br>
            <a href="tel:+61479128955" style="color:${INK_SOFT};text-decoration:none;">0479 128 955</a> &nbsp;·&nbsp; <a href="mailto:info@signaturepianos.com.au" style="color:${INK_SOFT};text-decoration:none;">info@signaturepianos.com.au</a><br>
            <a href="${siteUrl}/" style="color:${INK_SOFT};text-decoration:none;">signaturepianos.com.au</a>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:16px 12px 0;font-family:${TEXT};font-size:11px;line-height:16px;letter-spacing:3px;text-transform:uppercase;color:${FELT};">Hand-picked in Japan &nbsp;·&nbsp; Checked in Melbourne</td>
        </tr>
        <tr>
          <td align="center" style="padding:18px 24px 0;font-family:${TEXT};font-size:12px;line-height:18px;color:${INK_SOFT};">You received this email because you asked for the guide at signaturepianos.com.au.</td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`

  const text = `Hi ${firstName || 'there'},

Thank you for asking for our Yamaha buyer's guide. It covers every Yamaha upright and grand you are likely to meet as a Japanese import, from 1970 to today: what each model is, what changed from one to the next, and which one suits your home.

Download the guide (PDF, 33 pages, 2.5 MB):
${guideUrl}

Inside:
- Which Yamaha is which: the U1 and U3, the X series, YU10 to YU33, YUS1 to YUS5, and the G, C and CX grands.
- How to date a piano: reading the model name and serial number.
- Choosing well: room sizes, a ten-point viewing checklist, and what to budget.

Every piano in the guide sounds different in person. When you are ready, come and play as many as you like at our Mount Waverley showroom. Reply to this email or call me on 0479 128 955.

Eric Kuang
Founder, Signature Pianos

Book a visit: ${visitUrl}

63 Blackburn Road, Mount Waverley VIC 3149 · 0479 128 955 · info@signaturepianos.com.au
You received this email because you asked for the guide at signaturepianos.com.au.`

  return { subject, html, text }
}

/* The heads-up to the business, with everything needed to follow up. */
function guideInternalEmail({ lead, isRepeat, requestCount, adminUrl, crmSaved, customerEmailed }) {
  const fullName = `${lead.first_name || ''} ${lead.last_name || ''}`.trim()
  const utm = Object.entries(lead.utm || {}).map(([k, v]) => `${esc(k)}=${esc(v)}`).join(' · ')
  const row = (k, v) => `
    <tr>
      <td style="padding:8px 16px 8px 0;border-bottom:1px solid ${IVORY_DEEP};font-family:${TEXT};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${INK_SOFT};white-space:nowrap;vertical-align:top;">${k}</td>
      <td style="padding:8px 0;border-bottom:1px solid ${IVORY_DEEP};font-family:${TEXT};font-size:14px;color:${INK};">${v}</td>
    </tr>`
  const warn = []
  if (!crmSaved) warn.push('Could not save this lead to the CRM. The details below are the only copy: please add them by hand.')
  if (!customerEmailed) warn.push('The guide email to the customer did not send. Please send them the guide link.')

  const subject = `Buyer's guide request${isRepeat ? ' (again)' : ''}: ${fullName || lead.email}`
  const html = `<!DOCTYPE html>
<html lang="en-AU"><body style="margin:0;padding:32px 16px;background:${IVORY};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#FFFFFF;">
  <tr><td style="padding:32px 36px;">
    ${label('Buyer\'s guide request', FELT)}
    <div style="margin:10px 0 0;font-family:${DISPLAY};font-weight:500;font-size:28px;line-height:30px;text-transform:uppercase;color:${INK};">${esc(fullName || 'New lead')}</div>
    ${warn.map(w => `<p style="margin:16px 0 0;padding:12px 14px;border-left:3px solid ${FELT};background:${IVORY};font-family:${TEXT};font-size:14px;line-height:21px;color:${INK};">${esc(w)}</p>`).join('')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;border-top:1px solid ${IVORY_DEEP};">
      ${row('Email', `<a href="mailto:${esc(lead.email)}" style="color:${INK};">${esc(lead.email)}</a>`)}
      ${row('Phone', lead.phone ? `<a href="tel:${esc(lead.phone.replace(/[^\d+]/g, ''))}" style="color:${INK};">${esc(lead.phone)}</a>` : '—')}
      ${row('Requests', isRepeat ? `${requestCount} (asked before)` : 'First request')}
      ${row('Guide email', customerEmailed ? 'Sent' : 'Not sent')}
      ${row('Page', esc(lead.source_page || '—'))}
      ${utm ? row('Campaign', utm) : ''}
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;"><tr>
      <td bgcolor="${INK}" style="background:${INK};"><a href="${adminUrl}" style="display:inline-block;padding:13px 24px 11px;font-family:${TEXT};font-size:12px;font-weight:500;letter-spacing:3px;text-transform:uppercase;color:#FFFFFF;text-decoration:none;">Open in the CRM</a></td>
    </tr></table>
  </td></tr>
</table>
</td></tr></table>
</body></html>`
  return { subject, html }
}

module.exports = { guideEmail, guideInternalEmail }
