/*
 * Signature Pianos — single transactional email endpoint
 * ------------------------------------------------------
 * Deployed as a Vercel Node.js serverless function. The browser POSTs
 * JSON of the form { type, ...payload } and this handler fans out to
 * one customer-facing email and one internal notification per `type`.
 *
 * Every email is built with the brand kit in lib/email-brand.js; internal alerts
 * go to lib/notify.js internalRecipients() (info@ plus Eric's Gmail).
 *
 * Required env (configured in the Vercel dashboard):
 *   RESEND_API_KEY  — Resend API key
 *   BUSINESS_EMAIL  — Internal address (e.g. info@signaturepianos.com.au), via lib/notify.js
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — company settings, delivery lookups, auth
 *
 * The forms call this in fire-and-forget mode AFTER the row is safely
 * in Supabase, so any email failure is logged but never blocks the UX.
 *
 * Who may send what
 * -----------------
 * PUBLIC_TYPES come from public forms and need no sign-in, so they are locked
 * down: the customer copy goes only to the one address in the submission, the
 * internal copy only to internalRecipients(), every field is length-capped
 * and escaped, and delivery_preferences_submitted is built from the database
 * (looked up by the customer's preference token), never from the body.
 * Every other type needs an admin session (admin pages attach the bearer
 * automatically) or a server-to-server call (lib/auth.js internalHeaders()).
 * Bank details, ABN and invoice notes always come from company_settings, never
 * the request, and links must be https:// on our own domain (or stripe.com,
 * for payment links).
 *
 * Responses: 200 { success, sent, failed } · 400 bad request or unknown type ·
 * 401/403 not allowed · 502 { error, sent, failed } when an email the caller
 * asked for (not just an internal copy) was refused by Resend.
 */

const { Resend } = require('resend')
const { createClient } = require('@supabase/supabase-js')
const { internalRecipients } = require('../lib/notify')
const { requireAdminOrInternal, sendAuthError } = require('../lib/auth')
const { melbourneDate, addDays } = require('../lib/dates')

const FROM = 'Signature Pianos <info@signaturepianos.com.au>'

// Created on first use: new Resend() throws when RESEND_API_KEY is unset.
let _resend
function resend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY)
  return _resend
}

let _db
function db() {
  if (!_db) {
    _db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  }
  return _db
}

// Types the public site sends without signing in. delivery_preferences_submitted
// is public only with a preference token; without one it's the admin test send.
const PUBLIC_TYPES = new Set(['viewing_booking', 'service_request', 'delivery_preferences_submitted'])

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Vercel's req.body getter throws on malformed JSON.
  let body
  try { body = req.body } catch { body = null }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Expected a JSON body' })
  }

  const { type, ...data } = body
  const handler = typeof type === 'string' && Object.prototype.hasOwnProperty.call(HANDLERS, type)
    ? HANDLERS[type]
    : null
  if (!handler) return res.status(400).json({ error: 'Unknown email type' })

  const isPublic = PUBLIC_TYPES.has(type) &&
    (type !== 'delivery_preferences_submitted' || !!preferenceToken(data))
  if (!isPublic) {
    try {
      await requireAdminOrInternal(req)
    } catch (err) {
      return sendAuthError(res, err)
    }
  }

  const out = outbox()
  try {
    await handler(data, out)
  } catch (err) {
    if (err instanceof BadRequest) return res.status(400).json({ error: err.message })
    console.error('Email error:', err)
    // Say what already went, so nobody resends a customer email that arrived.
    return res.status(500).json({ error: 'Email failed', sent: out.sent.map(s => s.email), failed: out.failed })
  }

  const sent = out.sent.map(s => s.email)
  const primaryFailed = out.failed.filter(f => f.primary)
  if (primaryFailed.length) {
    return res.status(502).json({
      success: false,
      error: `Email failed: ${primaryFailed.map(f => f.email).join(', ')}`,
      sent,
      failed: out.failed
    })
  }
  return res.status(200).json({ success: true, sent, failed: out.failed })
}

/* ===========================================================================
 * One handler per type: (data, out) => validate, build, out.send(...).
 * Validate everything before the first send, so a 400 never follows a
 * half-sent request. `primary: false` marks the internal copies.
 * ======================================================================== */

const HANDLERS = {
  /* ===== PUBLIC: viewing request from the website ===== */
  async viewing_booking(data, out) {
    const email = oneEmail(data.email)
    const v = {
      email,
      first_name:        text(data.first_name, 60),
      last_name:         text(data.last_name, 60),
      phone:             text(data.phone, 40),
      preferred_date:    ymd(data.preferred_date),
      preferred_time:    text(data.preferred_time, 40),
      pianos_interested: textList(data.pianos_interested, 20, 120),
      how_heard:         text(data.how_heard, 80),
      message:           text(data.message, 2000)
    }
    await out.send('customer confirmation', {
      to: email,
      subject: 'Your viewing request — Signature Pianos',
      html: viewingConfirmationEmail(v)
    })
    await out.send('internal copy', {
      to: internalRecipients(),
      subject: subjectLine(`New viewing request — ${v.first_name} ${v.last_name}`),
      html: viewingInternalEmail(v)
    }, { primary: false })
  },

  /* ===== PUBLIC: tuning / service request from the website ===== */
  async service_request(data, out) {
    const email = oneEmail(data.email)
    const v = {
      email,
      first_name:          text(data.first_name, 60),
      last_name:           text(data.last_name, 60),
      phone:               text(data.phone, 40),
      suburb:              text(data.suburb, 80),
      piano_brand:         text(data.piano_brand, 80),
      piano_age:           text(data.piano_age, 40),
      last_tuned:          text(data.last_tuned, 40),
      service_required:    text(data.service_required, 60),
      preferred_timeframe: text(data.preferred_timeframe, 60),
      is_signature_piano:  data.is_signature_piano === true,
      message:             text(data.message, 2000)
    }
    await out.send('customer confirmation', {
      to: email,
      subject: 'Your service request — Signature Pianos',
      html: serviceConfirmationEmail(v)
    })
    await out.send('internal copy', {
      to: internalRecipients(),
      subject: subjectLine(`New service request — ${v.first_name} ${v.last_name}`),
      html: serviceInternalEmail(v)
    }, { primary: false })
  },

  /* ===== PUBLIC (with token): customer chose delivery windows =====
     Public calls send { token } (or the older { preference_token, ...form })
     and the email is built from the deliveries row only. Without a token it
     is the admin "test emails" send, which carries its own sample data. */
  async delivery_preferences_submitted(data, out) {
    const token = preferenceToken(data)
    const d = token ? await deliveryPreferencesFromDb(token) : {
      customer_name:  text(data.customer_name, 120),
      customer_email: text(data.customer_email, 254),
      customer_phone: text(data.customer_phone, 40),
      piano:          text(data.piano, 200),
      order_number:   text(data.order_number, 40),
      invoice_number: text(data.invoice_number, 40),
      pref1:          text(data.pref1, 120),
      pref2:          text(data.pref2, 120),
      pref3:          text(data.pref3, 120),
      address:        text(data.address, 300),
      notes:          text(data.notes, 2000)
    }
    await out.send('internal notification', {
      to: internalRecipients(),
      subject: subjectLine(`Delivery preferences received — ${d.customer_name || 'customer'} · ${d.order_number || ''}`),
      html: deliveryPreferencesEmail(d)
    })
  },

  /* ===== Overdue invoice — admin/orders.html. Customer only. ===== */
  async overdue_reminder(data, out) {
    const email = oneEmail(data.email, 'Customer email')
    await out.send('customer reminder', {
      to: email,
      subject: subjectLine(`Payment reminder — invoice ${text(data.invoice_number, 40)}`),
      html: overdueReminderEmail(data)
    })
  },

  /* ===== Stripe purchase — customer confirmation + delivery-preferences link ===== */
  async purchase_confirmation(data, out) {
    const email = oneEmail(data.email, 'Customer email')
    const preferences_url = safeLink(data.preferences_url, 'Delivery preferences link')
    await out.send('customer confirmation', {
      to: email,
      subject: subjectLine(`Your Signature Pianos purchase — order ${text(data.order_number, 40)}`),
      html: purchaseConfirmationEmail({ ...data, preferences_url })
    })
  },

  /* ===== Stripe sale — Eric-facing. Recipients are never taken from the body. ===== */
  async internal_sale_notification(data, out) {
    await out.send('internal notification', {
      to: internalRecipients(),
      subject: subjectLine(`New ${data.payment_type === 'deposit' ? 'deposit' : 'sale'} — ${text(data.piano_label, 120) || 'piano'} (${text(data.order_number, 40)})`),
      html: internalSaleEmail(data)
    })
  },

  /* ===== Invoice email — manual resend from admin/orders.html, or Stripe ===== */
  async send_invoice(data, out) {
    const customer = obj(data.customer), piano = obj(data.piano), order = obj(data.order)
    const to = oneEmail(customer.email, 'Customer email')
    const settings = await loadSettings()
    await out.send('invoice', {
      to,
      subject: subjectLine(`Invoice ${text(order.invoice_number, 40)} — Signature Pianos`),
      html: generateInvoiceEmailHTML({ customer, piano, order, settings })
    })
    await out.send('internal copy', {
      to: internalRecipients(),
      subject: subjectLine(`Invoice sent — ${text(order.invoice_number, 40)} to ${fullName(customer)}`),
      html: alertEmail({
        title: 'Invoice sent',
        rows: [['Invoice', esc(order.invoice_number), true], ['Sent to', esc(to)]]
      })
    }, { primary: false })
  },

  /* ===== POS sale — acoustic piano. Confirmation + invoice + internal ===== */
  async pos_order_confirmation(data, out) {
    const customer = obj(data.customer), piano = obj(data.piano), order = obj(data.order)
    const to = customer.email ? oneEmail(customer.email, 'Customer email') : ''
    const preferenceUrl = safeLink(data.preferenceUrl, 'Delivery preferences link')
    const settings = await loadSettings()
    if (to) {
      await out.send('customer confirmation', {
        to,
        subject: subjectLine(`Your piano purchase confirmed — Invoice ${text(order.invoice_number, 40)}`),
        html: posOrderConfirmationEmail({ customer, piano, order, settings, preferenceUrl })
      })
      await out.send('invoice', {
        to,
        subject: subjectLine(`Invoice ${text(order.invoice_number, 40)} — Signature Pianos`),
        html: generateInvoiceEmailHTML({ customer, piano, order, settings })
      })
    }
    await out.send('internal copy', {
      to: internalRecipients(),
      subject: subjectLine(`New POS sale — ${text(order.invoice_number, 40)} · ${fullName(customer)}`),
      html: posSaleInternalEmail({ customer, piano, order, isAcoustic: true })
    }, { primary: !to })
  },

  /* ===== POS or Stripe sale — digital piano. Collection note + invoice + internal ===== */
  async digital_order_confirmation(data, out) {
    const customer = obj(data.customer), piano = obj(data.piano), order = obj(data.order)
    const to = customer.email ? oneEmail(customer.email, 'Customer email') : ''
    const settings = await loadSettings()
    if (to) {
      await out.send('customer confirmation', {
        to,
        subject: subjectLine(`Your purchase confirmed — Invoice ${text(order.invoice_number, 40)}`),
        html: digitalOrderConfirmationEmail({ customer, piano, order, settings })
      })
      await out.send('invoice', {
        to,
        subject: subjectLine(`Invoice ${text(order.invoice_number, 40)} — Signature Pianos`),
        html: generateInvoiceEmailHTML({ customer, piano, order, settings })
      })
    }
    await out.send('internal copy', {
      to: internalRecipients(),
      subject: subjectLine(`New digital sale — ${text(order.invoice_number, 40)} · ${fullName(customer)}`),
      html: posSaleInternalEmail({ customer, piano, order, isAcoustic: false })
    }, { primary: !to })
  },

  /* ===== Payment plan — contract sent to customer ===== */
  async payment_plan_contract(data, out) {
    const plan = obj(data.plan), customer = obj(data.customer), piano = obj(data.piano)
    const to = oneEmail(customer.email, 'Customer email')
    const signUrl = safeLink(data.signUrl, 'Signing link')
    const instalments = Array.isArray(data.instalments) ? data.instalments.map(obj) : []
    await out.send('customer contract', {
      to,
      subject: subjectLine(`Payment plan contract — ${text(plan.plan_number, 40)} · Signature Pianos`),
      html: paymentPlanContractEmail({ plan, customer, piano, instalments, signUrl })
    })
    await out.send('internal copy', {
      to: internalRecipients(),
      subject: subjectLine(`Contract sent — ${text(plan.plan_number, 40)} · ${fullName(customer)}`),
      html: alertEmail({
        label: 'Payment plan',
        title: 'Contract sent',
        rows: [
          ['Sent to', esc(to)],
          ['Plan', esc(plan.plan_number || ''), true],
          planSurcharge(plan)
            ? ['Total payable', `${planCurrency(planSurcharge(plan).total)} (incl. card surcharge ${planCurrency(plan.surcharge_amount)})`]
            : ['Total', planCurrency(plan.total_amount)]
        ],
        message: 'Waiting for the customer to sign.'
      })
    }, { primary: false })
  },

  /* ===== Payment plan — overdue instalment reminder ===== */
  async instalment_reminder(data, out) {
    const plan = obj(data.plan), customer = obj(data.customer), piano = obj(data.piano)
    const to = oneEmail(customer.email, 'Customer email')
    const overdueInstalments = Array.isArray(data.overdueInstalments) ? data.overdueInstalments.map(obj) : []
    const settings = await loadSettings()
    await out.send('customer reminder', {
      to,
      subject: subjectLine(`Payment reminder — Plan ${text(plan.plan_number, 40)} · Signature Pianos`),
      html: instalmentReminderEmail({ plan, customer, piano, overdueInstalments, settings })
    })
    await out.send('internal copy', {
      to: internalRecipients(),
      subject: subjectLine(`Reminder sent — ${text(plan.plan_number, 40)} · ${fullName(customer)}`),
      html: alertEmail({
        label: 'Payment plan',
        title: 'Overdue reminder sent',
        rows: [['Sent to', esc(to)], ['Plan', esc(plan.plan_number || ''), true], ['Overdue instalments', String(overdueInstalments.length)]]
      })
    }, { primary: false })
  },

  /* ===== Viewing appointment — admin-created direct booking ===== */
  async viewing_confirmed(data, out) {
    const to = oneEmail(data.email, 'Customer email')
    const { first_name, appointment_date, appointment_time, notes } = data
    await out.send('customer confirmation', {
      to,
      subject: 'Your viewing is confirmed — Signature Pianos',
      html: viewingConfirmedBookingEmail({ first_name, appointment_date, appointment_time, notes })
    })
  },

  /* ===== Viewing reminder — "Send reminder" button, any day ===== */
  async viewing_reminder(data, out) {
    const to = oneEmail(data.email, 'Customer email')
    const { first_name, appointment_date, appointment_time } = data
    await out.send('customer reminder', {
      to,
      subject: subjectLine(`Reminder: your viewing is ${viewingWhen(appointment_date)} — Signature Pianos`),
      html: viewingReminderBookingEmail({ first_name, appointment_date, appointment_time })
    })
  },

  /* ===== Balance reminder — admin pings reserved-piano customer ===== */
  async balance_reminder(data, out) {
    const customer = obj(data.customer), piano = obj(data.piano), order = obj(data.order)
    const to = oneEmail(customer.email, 'Customer email')
    const settings = await loadSettings()
    await out.send('customer reminder', {
      to,
      subject: subjectLine(`Balance payment reminder — ${text(piano.brand, 40) || 'Yamaha'} ${text(piano.model, 40)} ${text(piano.year, 10)}`),
      html: balanceReminderEmail({ customer, piano, order, settings })
    })
  },

  /* ===== Driver assignment — admin assigns a partner, customer
     prefs go out for selection ===== */
  async driver_assignment(data, out) {
    const driver_email = oneEmail(data.driver_email, 'Driver email')
    const customer = obj(data.customer), piano = obj(data.piano), preferences = obj(data.preferences)
    const accept_url = safeLink(data.accept_url, 'Accept link')
    const { driver_name, delivery_address } = data
    const pianoLabel = `${text(piano.brand, 40) || 'Yamaha'} ${text(piano.model, 40)} ${text(piano.year, 10)}`.trim()
    await out.send('driver assignment', {
      to: driver_email,
      subject: subjectLine(`Delivery assignment — ${pianoLabel} · ${fullName(customer)}`),
      html: driverAssignmentEmail({ driver_name, customer, piano, preferences, delivery_address, accept_url })
    })
    await out.send('internal copy', {
      to: internalRecipients(),
      subject: subjectLine(`Driver assigned — ${text(driver_name, 80)} · ${pianoLabel}`),
      html: alertEmail({
        label: 'Delivery',
        title: 'Delivery partner assigned',
        rows: [['Partner', `${esc(driver_name)}<br>${esc(driver_email)}`, true], ['Customer', esc(fullName(customer))]],
        message: 'Waiting for the partner to accept a delivery window.'
      })
    }, { primary: false })
  },

  /* ===== Driver — pickup or delivery photo upload link ===== */
  driver_pickup_link: (data, out) => driverPhotoLink(data, out, true),
  driver_delivery_link: (data, out) => driverPhotoLink(data, out, false),

  /* ===== Delivery date confirmed by admin ===== */
  async delivery_confirmed(data, out) {
    const customer = obj(data.customer), piano = obj(data.piano), delivery = obj(data.delivery)
    const to = oneEmail(customer.email, 'Customer email')
    const fmtDelDate = (d) => {
      if (!d) return '—'
      const [y, m, day] = String(d).split('T')[0].split('-')
      if (!y || !m || !day) return String(d)
      return `${day}/${m}/${y}`
    }
    await out.send('customer confirmation', {
      to,
      subject: 'Your piano delivery is confirmed — Signature Pianos',
      html: deliveryConfirmedEmail({ customer, piano, delivery, formatDate: fmtDelDate })
    })
    await out.send('internal copy', {
      to: internalRecipients(),
      subject: subjectLine(`Delivery confirmed — ${fullName(customer)} · ${fmtDelDate(delivery.scheduled_date)}`),
      html: alertEmail({
        label: 'Delivery',
        title: 'Delivery date sent to the customer',
        rows: [['Sent to', esc(to)], ['Date', `${esc(fmtDelDate(delivery.scheduled_date))} ${esc(delivery.scheduled_time_window || '')}`, true]]
      })
    }, { primary: false })
  }
}

async function driverPhotoLink(data, out, isPickup) {
  const driver_email = oneEmail(data.driver_email, 'Driver email')
  const customer = obj(data.customer), piano = obj(data.piano)
  const tokenUrl = safeLink(isPickup ? data.pickup_url : data.delivery_url, isPickup ? 'Pickup link' : 'Delivery link')
  const { driver_name, scheduled_date, scheduled_time } = data
  const pianoLabel = `${text(piano.brand, 40)} ${text(piano.model, 40)} ${text(piano.year, 10)}`.trim()
  await out.send(isPickup ? 'driver pickup link' : 'driver delivery link', {
    to: driver_email,
    subject: subjectLine(isPickup
      ? `Piano pickup — photos required · ${pianoLabel}`
      : `Piano delivery — photos required · ${pianoLabel}`),
    html: buildDriverLiveEmail({ isPickup, driver_name, customer, piano, tokenUrl, scheduled_date, scheduled_time })
  })
  await out.send('internal copy', {
    to: internalRecipients(),
    subject: subjectLine(isPickup ? `Pickup link sent to ${text(driver_name, 80)}` : `Delivery link sent to ${text(driver_name, 80)}`),
    html: alertEmail({
      label: 'Delivery',
      title: isPickup ? 'Pickup link sent' : 'Delivery link sent',
      rows: [['Partner', `${esc(driver_name)}<br>${esc(driver_email)}`, true], ['Piano', esc(pianoLabel)], ['Customer', esc(fullName(customer))]]
    })
  }, { primary: false })
}

/* ===========================================================================
 * Sending: Resend 3.x never throws, it resolves { data, error }. Every send
 * goes through sendOrThrow, and outbox() records each result so the response
 * says exactly which emails went and which didn't.
 * ======================================================================== */

async function sendOrThrow(payload) {
  const { data, error } = await resend().emails.send({ from: FROM, ...payload })
  if (error) throw new Error(error.message || error.name || 'Resend refused the email')
  return data
}

/* `primary` emails decide the status code. An internal copy failing is
   reported but never hides the customer email's result either way. */
function outbox() {
  const sent = []
  const failed = []
  return {
    sent,
    failed,
    async send(label, payload, { primary = true } = {}) {
      try {
        const data = await sendOrThrow(payload)
        sent.push({ email: label, id: data?.id || null })
      } catch (err) {
        console.error(`[send-email] ${label} failed:`, err.message)
        failed.push({ email: label, primary, error: String(err.message || err).slice(0, 300) })
      }
    }
  }
}

/* ===========================================================================
 * Email templates
 * ===========================================================================
 * Every email here is built from the brand kit in lib/email-brand.js, so the
 * customer confirmations, invoices, payment-plan emails, driver jobs and the
 * alerts to Eric all share one look (brand/BRAND-GUIDELINES.md).
 * ======================================================================== */

const B = require('../lib/email-brand')
const { esc, layout, hello, p, h2, details, note, button, buttonOutline, steps, signOff, visitBlock, BUSINESS, C, TEXT } = B

const ADMIN = `${BUSINESS.siteUrl}/admin`
const link = (href, text) => `<a href="${esc(href)}" style="color:${C.ink};">${text}</a>`
const mailto = (email) => email ? link(`mailto:${email}`, esc(email)) : '—'
const tel = (phone) => phone ? link(`tel:${String(phone).replace(/[^\d+]/g, '')}`, esc(phone)) : '—'
const fullName = (o) => `${o?.first_name || ''} ${o?.last_name || ''}`.trim()
const pianoName = (piano, withYear = true) =>
  `${piano?.brand || ''} ${piano?.model || ''}${withYear && piano?.year ? ' ' + piano.year : ''}`.trim()
const customerNote = (text) => text ? note(`<span style="font-family:${TEXT};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${C.inkSoft};">Their message</span><br>${esc(text)}`) : ''

// Pretty-print enum-ish values back into readable English.
function pretty(value) {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.length ? value.map(esc).join(', ') : '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  const s = String(value).replace(/_/g, ' ')
  return esc(s.charAt(0).toUpperCase() + s.slice(1))
}

function formatTime(value) {
  const map = { morning: 'Morning (9am–12pm)', afternoon: 'Afternoon (12pm–4pm)', late_afternoon: 'Late afternoon (4pm–6pm)' }
  return map[value] || pretty(value)
}

const formatDate = (value) => B.longDate(value)

/* The alert Eric gets for anything that happened without him. */
function alertEmail({ label = 'For Signature Pianos', title, preview, rows = [], message, action }) {
  return layout({
    internal: true,
    preview: preview || title,
    label,
    title,
    body: details(rows) + (message ? note(message) : '') + (action ? button(action.url, action.text) : '')
  })
}

/* ---------- VIEWING REQUEST — customer ---------- */
function viewingConfirmationEmail(data) {
  const body = `
    ${hello(data.first_name)}
    ${p(`Thank you for booking a visit. We have your request and will be in touch within 24 hours to confirm a time.`, { muted: true })}
    ${details([
      ['Preferred day', formatDate(data.preferred_date), true],
      ['Preferred time', formatTime(data.preferred_time), true],
      ['Pianos to play', pretty(data.pianos_interested)]
    ])}
    ${h2('What to expect')}
    ${p(`The pianos you are interested in will be tuned and ready to play when you arrive. Take as long as you need. There is no obligation to buy: we are here to answer questions.`, { muted: true })}
    ${h2('Where to find us')}
    ${visitBlock()}
    ${signOff()}
  `
  return layout({
    preview: `Your visit on ${formatDate(data.preferred_date)}: we'll confirm a time within 24 hours.`,
    label: 'Your visit',
    title: 'Thank you for booking',
    body,
    footnote: 'You received this email because you booked a visit at signaturepianos.com.au.'
  })
}

/* ---------- VIEWING REQUEST — internal ---------- */
function viewingInternalEmail(data) {
  const submittedAt = new Date().toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Australia/Melbourne' })
  const body = `
    ${details([
      ['Customer', esc(`${data.first_name || ''} ${data.last_name || ''}`.trim()), true],
      ['Email', mailto(data.email)],
      ['Phone', tel(data.phone)],
      ['Preferred day', formatDate(data.preferred_date), true],
      ['Preferred time', formatTime(data.preferred_time), true],
      ['Pianos of interest', pretty(data.pianos_interested)],
      ['How they heard', pretty(data.how_heard)],
      ['Submitted', esc(submittedAt)]
    ])}
    ${customerNote(data.message)}
    ${note('Confirm a time with them, then add it under Enquiries → Viewings calendar → New viewing. That sends their confirmation.', 'mist')}
    ${button(`${ADMIN}/enquiries.html`, 'Open in the CRM')}
  `
  return layout({
    internal: true,
    preview: `New viewing request: ${data.first_name} ${data.last_name}, ${formatDate(data.preferred_date)}`,
    label: 'New viewing request',
    title: esc(`${data.first_name || ''} ${data.last_name || ''}`.trim() || 'New request'),
    body
  })
}

/* ---------- SERVICE REQUEST — customer ---------- */
function serviceConfirmationEmail(data) {
  const body = `
    ${hello(data.first_name)}
    ${p(`Thank you for your service request. We have your details and will be in touch within 24 hours to arrange a time.`, { muted: true })}
    ${details([
      ['Piano', `${esc(data.piano_brand || '—')}${data.piano_age ? ' · ' + pretty(data.piano_age) : ''}`],
      ['Last tuned', pretty(data.last_tuned)],
      ['Service', pretty(data.service_required), true],
      ['When', pretty(data.preferred_timeframe)],
      ['Suburb', esc(data.suburb || '—')]
    ])}
    ${p(`If you need us sooner, call ${tel(BUSINESS.phone)}.`, { muted: true })}
    ${signOff()}
  `
  return layout({
    preview: `Service request received: we'll be in touch within 24 hours.`,
    label: 'Tuning and service',
    title: 'We have your request',
    body,
    footnote: 'You received this email because you asked for a piano service at signaturepianos.com.au.'
  })
}

/* ---------- SERVICE REQUEST — internal ---------- */
function serviceInternalEmail(data) {
  const submittedAt = new Date().toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Australia/Melbourne' })
  const isSig = data.is_signature_piano === true
  const body = `
    ${isSig ? note('An existing Signature Pianos customer. Check the piano’s service history before you call.', 'alert') : ''}
    ${details([
      ['Customer', esc(`${data.first_name || ''} ${data.last_name || ''}`.trim()), true],
      ['Email', mailto(data.email)],
      ['Phone', tel(data.phone)],
      ['Suburb', esc(data.suburb || '—')],
      ['Piano brand', esc(data.piano_brand || '—')],
      ['Piano age', pretty(data.piano_age)],
      ['Last tuned', pretty(data.last_tuned)],
      ['Service', pretty(data.service_required), true],
      ['When', pretty(data.preferred_timeframe)],
      ['Our customer', isSig ? 'Yes' : 'No'],
      ['Submitted', esc(submittedAt)]
    ])}
    ${customerNote(data.message)}
    ${button(`${ADMIN}/enquiries.html`, 'Open in the CRM')}
  `
  return layout({
    internal: true,
    preview: `New service request: ${data.first_name} ${data.last_name}${isSig ? ' (existing customer)' : ''}`,
    label: 'New service request',
    title: esc(`${data.first_name || ''} ${data.last_name || ''}`.trim() || 'New request'),
    body
  })
}

/* ---------- OVERDUE PAYMENT REMINDER — customer ---------- */
function overdueReminderEmail(data) {
  const paymentLabels = {
    cash: 'Cash',
    bank_transfer: 'Bank transfer',
    stripe: 'Card (Stripe)',
    card_in_person: 'Card in person',
    deposit_paid_online: 'Deposit paid online'
  }
  const body = `
    ${hello(data.first_name)}
    ${p(`A reminder that the balance for your recent Signature Pianos purchase is still outstanding. If you have paid in the last day or two, please ignore this: bank transfers can take a little time to arrive.`, { muted: true })}
    ${details([
      ['Invoice', esc(data.invoice_number || '—'), true],
      ['Order', esc(data.order_number || '—')],
      ['Issued', data.issued_at ? formatDate(data.issued_at) : '—'],
      ['Amount due', B.money(data.total), true],
      ['Payment method', esc((Object.prototype.hasOwnProperty.call(paymentLabels, data.payment_method) && paymentLabels[data.payment_method]) || data.payment_method || '—')]
    ])}
    ${p(`If you would like to pay another way, or have a question about the invoice, reply to this email and we will sort it out.`, { muted: true })}
    ${signOff()}
  `
  return layout({
    preview: `Payment reminder: invoice ${data.invoice_number || ''} for ${B.money(data.total)}`,
    label: 'Your invoice',
    title: 'A reminder about your balance',
    body
  })
}

/* ---------- PURCHASE CONFIRMATION (Stripe) — customer ---------- */
function purchaseConfirmationEmail(data) {
  const isDeposit = data.payment_type === 'deposit'
  // No link (e.g. a digital-piano deposit: nothing to deliver) means no delivery section.
  const hasPrefs = !!data.preferences_url
  const body = `
    ${hello(data.first_name)}
    ${p(isDeposit
      ? `Your reservation deposit has been received. We have taken your piano off the website and will hold it for you while we arrange the rest of the purchase.`
      : `Your purchase is confirmed. We are getting your piano ready for delivery to your home.`, { muted: true })}
    ${details([
      ['Piano', esc(data.piano_label || '—'), true],
      ['Order', esc(data.order_number || '—')],
      [isDeposit ? 'Deposit paid' : 'Total paid', B.money(data.total), true]
    ])}
    ${hasPrefs ? `
    ${h2('Next: choose your delivery window')}
    ${p(`Share three delivery windows that suit you. We will confirm one of them by email or phone within 48 hours.`, { muted: true })}
    ${button(data.preferences_url, 'Choose delivery windows')}
    ${p(`If the button doesn't work, copy this link into your browser:<br><span style="word-break:break-all;">${esc(data.preferences_url)}</span>`, { small: true, muted: true })}` : ''}
    ${signOff()}
  `
  return layout({
    preview: hasPrefs
      ? (isDeposit ? 'Deposit received: choose your delivery window' : 'Purchase confirmed: choose your delivery window')
      : (isDeposit ? 'Deposit received: your piano is reserved' : 'Purchase confirmed'),
    label: isDeposit ? 'Your reservation' : 'Your purchase',
    title: isDeposit ? 'Your piano is reserved' : 'Thank you for your purchase',
    body
  })
}

/* ---------- SALE (Stripe) — internal ---------- */
function internalSaleEmail(data) {
  const isDeposit = data.payment_type === 'deposit'
  // Treat undefined is_acoustic as acoustic (legacy callers); the Stripe webhook always passes it.
  const isAcoustic = data.is_acoustic === undefined ? true : !!data.is_acoustic
  const body = `
    ${p('A customer has just paid online through Stripe.', { muted: true, first: true })}
    ${details([
      ['Piano', esc(data.piano_label || '—'), true],
      ['Customer', esc(data.customer || '—')],
      ['Email', mailto(data.customer_email)],
      ['Order', esc(data.order_number || '—')],
      [isDeposit ? 'Deposit' : 'Total', B.money(data.total), true],
      ['Type', isDeposit ? 'Reservation deposit' : 'Full purchase'],
      ['Delivery', isAcoustic ? 'Delivery record created; customer sent the delivery-window link' : 'Digital piano: no delivery, collecting from the showroom']
    ])}
    ${note(isAcoustic
      ? 'The order, customer and delivery records were created automatically. Assign a delivery partner once the customer sends their delivery windows.'
      : 'The order and customer records were created automatically. No delivery record: the customer will collect from the showroom.', 'mist')}
    ${button(`${ADMIN}/orders.html`, 'Open orders')}
  `
  return layout({
    internal: true,
    preview: `New ${isDeposit ? 'deposit' : 'sale'}: ${data.piano_label || ''}`,
    label: isDeposit ? 'New deposit' : 'New sale',
    title: esc(data.piano_label || (isDeposit ? 'New deposit' : 'New sale')),
    body
  })
}

/* ---------- DELIVERY PREFERENCES SUBMITTED — internal ---------- */
function deliveryPreferencesEmail(data) {
  const body = `
    ${p(`${esc(data.customer_name || 'The customer')} has chosen their delivery windows.`, { muted: true, first: true })}
    ${h2('Preferred windows')}
    ${details([
      ['1st choice', esc(data.pref1 || '—'), true],
      ['2nd choice', esc(data.pref2 || '—')],
      ['3rd choice', esc(data.pref3 || '—')]
    ])}
    ${h2('Customer and order')}
    ${details([
      ['Customer', esc(data.customer_name || '—'), true],
      ['Email', mailto(data.customer_email)],
      ['Phone', tel(data.customer_phone)],
      ['Delivery address', esc(data.address || '—')],
      ['Piano', esc(data.piano || '—'), true],
      ['Order', esc(data.order_number || '—')],
      ['Invoice', esc(data.invoice_number || '—')]
    ])}
    ${data.notes ? note(`<span style="font-family:${TEXT};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${C.inkSoft};">Special instructions</span><br>${esc(data.notes)}`) : ''}
    ${button(`${ADMIN}/deliveries.html`, 'Assign a delivery partner')}
  `
  return layout({
    internal: true,
    preview: `Delivery windows received: ${data.customer_name || ''}`,
    label: 'Delivery windows received',
    title: esc(data.customer_name || 'Delivery windows'),
    body
  })
}

/* ---------- TAX INVOICE — customer (manual send, POS sales) ---------- */
function generateInvoiceEmailHTML({ customer, piano, order, settings }) {
  const lineItems = Array.isArray(order?.line_items) ? order.line_items : []
  const total = Number(order?.total || 0)
  const gst = total / 11
  const exGST = total - gst
  const discount = Number(order?.discount || 0)
  const s = settings || {}
  const fmtDateAU = (d) => {
    if (!d) return '—'
    try { return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Melbourne' }) } catch { return esc(d) }
  }
  const from = [
    esc(s.business_name || BUSINESS.name),
    esc(s.address_line1 || BUSINESS.address1),
    s.suburb ? esc(`${s.suburb} ${s.state || ''} ${s.postcode || ''}`.trim()) : esc(BUSINESS.address2),
    esc(s.email || BUSINESS.email),
    s.abn ? `ABN ${esc(s.abn)}` : ''
  ].filter(Boolean).join('<br>')
  const billTo = [
    `<strong style="font-weight:500;">${esc(fullName(customer) || '—')}</strong>`,
    customer?.business_name ? esc(customer.business_name) : '',
    customer?.abn ? `ABN ${esc(customer.abn)}` : '',
    [customer?.address_line1, customer?.suburb, customer?.state, customer?.postcode].filter(Boolean).map(esc).join(', '),
    customer?.email ? esc(customer.email) : '',
    customer?.phone ? esc(customer.phone) : ''
  ].filter(Boolean).join('<br>')
  const cell = `padding:11px 0;border-bottom:1px solid ${C.ivoryDeep};font-family:${TEXT};font-size:14px;line-height:20px;color:${C.ink};`
  const head = `padding:0 0 8px;border-bottom:1px solid ${C.ink};font-family:${TEXT};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${C.inkSoft};font-weight:400;`
  const isBank = (order?.payment_method === 'bank_transfer' || order?.payment_method === 'Bank transfer') && s.bank_bsb
  const isStripe = order?.payment_method === 'stripe' || order?.payment_method === 'Stripe'

  const body = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;">
      <tr>
        <td style="vertical-align:top;width:50%;padding-right:12px;font-family:${TEXT};font-size:13px;line-height:20px;color:${C.inkSoft};">
          ${B.label('From')}<div style="margin-top:6px;">${from}</div>
        </td>
        <td style="vertical-align:top;width:50%;padding-left:12px;font-family:${TEXT};font-size:13px;line-height:20px;color:${C.inkSoft};">
          ${B.label('Bill to')}<div style="margin-top:6px;color:${C.ink};">${billTo}</div>
        </td>
      </tr>
    </table>
    ${details([
      ['Invoice', esc(order?.invoice_number || 'Draft'), true],
      ['Date', fmtDateAU(order?.created_at)],
      piano && pianoName(piano) ? ['Piano', esc(pianoName(piano)) + (piano.serial_number ? ` · serial ${esc(piano.serial_number)}` : '')] : null
    ])}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
      <tr>
        <th align="left" style="${head}">Description</th>
        <th align="center" style="${head}width:40px;">Qty</th>
        <th align="right" style="${head}">Ex GST</th>
        <th align="right" style="${head}">Inc GST</th>
      </tr>
      ${lineItems.map(item => `
      <tr>
        <td style="${cell}">${esc(item.description || '')}</td>
        <td align="center" style="${cell}color:${C.inkSoft};">${esc(item.qty || 1)}</td>
        <td align="right" style="${cell}color:${C.inkSoft};">${B.money((Number(item.amount_inc_gst) || 0) / 1.1)}</td>
        <td align="right" style="${cell}">${B.money(Number(item.amount_inc_gst) || 0)}</td>
      </tr>`).join('')}
      ${discount > 0 ? `
      <tr>
        <td colspan="3" style="${cell}">Discount</td>
        <td align="right" style="${cell}">−${B.money(discount)}</td>
      </tr>` : ''}
      <tr><td colspan="3" align="right" style="padding:12px 16px 4px 0;font-family:${TEXT};font-size:13px;color:${C.inkSoft};">Ex GST</td><td align="right" style="padding:12px 0 4px;font-family:${TEXT};font-size:13px;color:${C.inkSoft};">${B.money(exGST)}</td></tr>
      <tr><td colspan="3" align="right" style="padding:4px 16px 12px 0;font-family:${TEXT};font-size:13px;color:${C.inkSoft};">GST (10%)</td><td align="right" style="padding:4px 0 12px;font-family:${TEXT};font-size:13px;color:${C.inkSoft};">${B.money(gst)}</td></tr>
      <tr><td colspan="3" align="right" style="padding:14px 16px 14px 0;border-top:1px solid ${C.ink};font-family:${TEXT};font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${C.ink};">Total inc GST</td><td align="right" style="padding:14px 0;border-top:1px solid ${C.ink};font-family:${B.DISPLAY};font-weight:500;font-size:24px;color:${C.ink};">${B.money(total)}</td></tr>
    </table>
    ${isBank ? note(`${B.label('Payment details')}<div style="margin-top:6px;">Bank: ${esc(s.bank_name || '')}<br>BSB: ${esc(s.bank_bsb)}<br>Account: ${esc(s.bank_account || '')}<br>Account name: ${esc(s.bank_account_name || '')}<br>Reference: ${esc(order.invoice_number || '')}</div>`) : ''}
    ${isStripe ? note('Paid by card through Stripe. Thank you.', 'mist') : ''}
    ${p(esc(s.invoice_notes || 'Thank you for choosing Signature Pianos. This piano is covered by a 10-year warranty.'), { small: true, muted: true })}
  `
  return layout({
    preview: `Tax invoice ${order?.invoice_number || ''} for ${B.money(total)}`,
    label: 'Tax invoice',
    title: esc(order?.invoice_number || 'Tax invoice'),
    body
  })
}

/* ---------- POS SALE (acoustic) — customer ---------- */
function posOrderConfirmationEmail({ customer, piano, order, settings, preferenceUrl }) {
  const body = `
    ${hello(customer?.first_name)}
    ${p('Your purchase is confirmed. Your tax invoice comes in a separate email.', { muted: true })}
    ${details([
      ['Piano', esc(pianoName(piano) || '—'), true],
      ['Invoice', esc(order?.invoice_number || '—')],
      ['Total', B.money(order?.total), true],
      ['Payment', pretty(order?.payment_method)]
    ])}
    ${h2('Next: choose your delivery times')}
    ${p('Tell us three times that suit you and we will arrange delivery of your piano.', { muted: true })}
    ${preferenceUrl ? button(preferenceUrl, 'Choose delivery times') : ''}
    ${note('Your piano comes with white-glove delivery, a 10-year warranty, and its first tuning included three to four weeks after delivery.', 'mist')}
    ${signOff()}
  `
  return layout({
    preview: 'Purchase confirmed: choose your delivery times',
    label: 'Your purchase',
    title: 'Thank you for your purchase',
    body
  })
}

/* ---------- POS SALE (digital) — customer ---------- */
function digitalOrderConfirmationEmail({ customer, piano, order, settings }) {
  const body = `
    ${hello(customer?.first_name)}
    ${p('Your purchase is confirmed. Your tax invoice comes in a separate email.', { muted: true })}
    ${details([
      ['Item', esc(pianoName(piano, false) || '—'), true],
      ['Invoice', esc(order?.invoice_number || '—')],
      ['Total', B.money(order?.total), true],
      ['Payment', pretty(order?.payment_method)]
    ])}
    ${h2('Collecting it')}
    ${p('Your instrument is ready to collect from our showroom. We will be in touch shortly to arrange a pickup time that suits you.', { muted: true })}
    ${visitBlock()}
    ${signOff()}
  `
  return layout({
    preview: 'Purchase confirmed: ready to collect from the showroom',
    label: 'Your purchase',
    title: 'Thank you for your purchase',
    body
  })
}

/* ---------- DELIVERY DATE CONFIRMED — customer ---------- */
function deliveryConfirmedEmail({ customer, piano, delivery, settings, formatDate: fmt }) {
  const body = `
    ${hello(customer?.first_name)}
    ${p(`Your delivery date is set. Here are the details for your ${esc(pianoName(piano) || 'piano')}.`, { muted: true })}
    ${details([
      ['Piano', esc(pianoName(piano) || '—'), true],
      ['Delivery date', delivery?.scheduled_date ? formatDate(delivery.scheduled_date) : esc(fmt ? fmt(delivery?.scheduled_date) : '—'), true],
      delivery?.scheduled_time_window ? ['Time window', esc(delivery.scheduled_time_window), true] : null
    ])}
    ${delivery?.notes ? note(`<span style="font-family:${TEXT};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${C.inkSoft};">Delivery notes</span><br>${esc(delivery.notes)}`) : ''}
    ${h2('What happens next')}
    ${steps([
      'On the morning of delivery we send you a photo of your piano before it leaves our warehouse.',
      'You get a live tracking link once it is on its way to you.',
      'Our movers place it where you choose, and we send a photo once it is in position.'
    ])}
    ${p(`To reschedule, or with any question, reply to this email or call ${tel(BUSINESS.phone)}.`, { muted: true })}
    ${signOff()}
  `
  return layout({
    preview: `Delivery booked for ${delivery?.scheduled_date ? formatDate(delivery.scheduled_date) : 'your piano'}`,
    label: 'Your delivery',
    title: 'Your delivery is booked',
    body
  })
}

/* ---------- PAYMENT PLAN CONTRACT — customer ---------- */
function paymentPlanContractEmail({ plan, customer, piano, instalments, settings, signUrl }) {
  const list = Array.isArray(instalments) ? instalments : []
  const cell = `padding:10px 0;border-bottom:1px solid ${C.ivoryDeep};font-family:${TEXT};font-size:14px;line-height:20px;color:${C.ink};`
  const head = `padding:0 0 8px;border-bottom:1px solid ${C.ink};font-family:${TEXT};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${C.inkSoft};font-weight:400;`
  // Card plans carry a surcharge on the balance, and the instalments include it,
  // so the contract shows price, surcharge and the total actually payable.
  const s = planSurcharge(plan)
  const body = `
    ${hello(customer?.first_name)}
    ${p('Your payment plan is ready. Please check the details below, then sign the contract to confirm it.', { muted: true })}
    ${details([
      ['Plan', esc(plan.plan_number || '—')],
      ['Piano', esc(pianoName(piano) || '—'), true],
      [s ? 'Price' : 'Total price', planCurrency(plan.total_amount), !s],
      s ? [`Card surcharge${s.pct ? ` (${esc(s.pct)}%)` : ''}`, planCurrency(s.amount)] : null,
      s ? ['Total payable', planCurrency(s.total), true] : null,
      ['Deposit', planCurrency(plan.deposit_amount) + (plan.deposit_paid ? ' (paid)' : '')],
      ['Instalments', `${esc(plan.number_of_instalments || '')} × ${planCurrency(plan.instalment_amount)} ${esc(plan.instalment_frequency || '')}`],
      ['Start date', planDateAU(plan.start_date)],
      plan.end_date ? ['Final payment', planDateAU(plan.end_date)] : null
    ])}
    ${list.length ? `${h2('Payment schedule')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;">
      <tr><th align="left" style="${head}width:40px;">No.</th><th align="left" style="${head}">Due</th><th align="right" style="${head}">Amount</th></tr>
      ${list.map(ins => `<tr><td style="${cell}color:${C.inkSoft};">${esc(ins.instalment_number)}</td><td style="${cell}">${planDateAU(ins.due_date)}</td><td align="right" style="${cell}">${planCurrency(ins.amount)}</td></tr>`).join('')}
    </table>` : ''}
    ${signUrl ? button(signUrl, 'Review and sign') : ''}
    ${signUrl ? p('Signing takes less than a minute.', { small: true, muted: true }) : ''}
    ${plan.notes ? note(`Notes: ${esc(plan.notes)}`) : ''}
    ${p('Any question about your payment plan: reply to this email or call us.', { muted: true })}
    ${signOff()}
  `
  return layout({
    preview: `Your payment plan ${plan.plan_number || ''} is ready to sign`,
    label: `Payment plan · ${esc(plan.plan_number || '')}`,
    title: 'Your payment plan is ready',
    body
  })
}

/* ---------- PAYMENT PLAN OVERDUE — customer ---------- */
function instalmentReminderEmail({ plan, customer, piano, overdueInstalments, settings }) {
  const list = Array.isArray(overdueInstalments) ? overdueInstalments : []
  const totalOverdue = list.reduce((s, i) => s + Number(i.amount || 0), 0)
  const s = settings || {}
  const body = `
    ${hello(customer?.first_name)}
    ${p(`A reminder about the payment plan for your ${esc(pianoName(piano) || 'piano')}.`, { muted: true })}
    ${note(`<strong style="font-weight:500;">${list.length} payment${list.length === 1 ? '' : 's'} overdue · ${planCurrency(totalOverdue)} in total</strong>${list.map(ins => `<br>Instalment ${esc(ins.instalment_number)}: ${planCurrency(ins.amount)}, due ${planDateAU(ins.due_date)}`).join('')}`, 'alert')}
    ${h2('Payment details')}
    ${details([
      s.bank_bsb ? ['BSB', esc(s.bank_bsb)] : null,
      s.bank_account ? ['Account', esc(s.bank_account)] : null,
      s.bank_account_name ? ['Account name', esc(s.bank_account_name)] : null,
      ['Reference', esc(plan.plan_number || '—'), true]
    ])}
    ${p('If you have already paid, please ignore this reminder. If payments are difficult at the moment, call us and we can talk about your options.', { muted: true })}
    ${signOff()}
  `
  return layout({
    preview: `Payment reminder for plan ${plan.plan_number || ''}`,
    label: `Payment plan · ${esc(plan.plan_number || '')}`,
    title: 'A payment reminder',
    body
  })
}

/* ---------- DRIVER — pickup or delivery photo link ---------- */
function buildDriverLiveEmail({ isPickup, driver_name, customer, piano, tokenUrl, scheduled_date, scheduled_time }) {
  const fullAddress = [customer?.address_line1, customer?.suburb, customer?.state, customer?.postcode].filter(Boolean).map(esc).join(', ') || '—'
  const body = `
    ${hello(driver_name)}
    ${p(isPickup
      ? 'You have a piano pickup for Signature Pianos. Please photograph the piano thoroughly before you move it.'
      : 'You have a piano delivery for Signature Pianos. Please photograph the piano once it is placed in the customer’s home.', { muted: true })}
    ${details([
      ['Piano', esc(`${piano?.brand || 'Yamaha'} ${piano?.model || ''} ${piano?.year || ''}`.trim()), true],
      ['Serial', esc(piano?.serial_number || '—')],
      [isPickup ? 'Pick up from' : 'Deliver to', fullAddress, true],
      !isPickup ? ['Customer phone', tel(customer?.phone)] : null,
      scheduled_date ? ['Date', formatDate(scheduled_date), true] : null,
      scheduled_time ? ['Time window', esc(scheduled_time)] : null
    ])}
    ${note(isPickup ? 'Do not move the piano until every photo is uploaded.' : 'Do not leave the property until every photo is uploaded.', 'alert')}
    ${button(tokenUrl || BUSINESS.siteUrl, isPickup ? 'Upload pickup photos' : 'Upload delivery photos')}
    ${p('The button opens the upload page, where you can take the photos straight from your phone. This link is unique to this job, so please don’t share it.', { small: true, muted: true })}
  `
  return layout({
    preview: isPickup ? 'Pickup photos needed before you move the piano' : 'Delivery photos needed before you leave',
    label: isPickup ? 'Piano pickup' : 'Piano delivery',
    title: isPickup ? 'Photos before you move it' : 'Photos once it’s placed',
    body
  })
}

/* ---------- DRIVER — new delivery assignment ---------- */
function driverAssignmentEmail({ driver_name, customer, piano, preferences, delivery_address, accept_url, settings }) {
  const fullAddress = delivery_address
    ? esc(delivery_address)
    : [customer?.address_line1, customer?.suburb, customer?.state, customer?.postcode].filter(Boolean).map(esc).join(', ') || '—'
  const body = `
    ${hello(driver_name)}
    ${p('Signature Pianos has a piano delivery for you. Please check the details and accept one of the customer’s preferred windows.', { muted: true })}
    ${h2('Their preferred windows')}
    ${details([
      ['1st choice', esc(preferences?.pref1 || '—'), true],
      ['2nd choice', esc(preferences?.pref2 || '—')],
      ['3rd choice', esc(preferences?.pref3 || '—')]
    ])}
    ${button(accept_url || BUSINESS.siteUrl, 'Accept this delivery')}
    ${p('Accepting lets you confirm which window works for you.', { small: true, muted: true })}
    ${h2('The piano')}
    ${details([
      ['Piano', esc(`${piano?.brand || 'Yamaha'} ${piano?.model || ''} ${piano?.year || ''}`.trim()), true],
      ['Serial', esc(piano?.serial_number || '—')],
      ['Weight', `${esc(piano?.weight_kg || 'about 200')} kg`]
    ])}
    ${h2('Pick up and deliver')}
    ${details([
      ['Pick up from', `Signature Pianos warehouse<br>${BUSINESS.address1}, ${BUSINESS.address2}`],
      ['Deliver to', fullAddress, true],
      ['Customer', esc(fullName(customer) || '—')],
      ['Phone', tel(customer?.phone)]
    ])}
    ${p(`If none of the windows work, call the customer on ${tel(customer?.phone)} to agree another time, then reply to this email with the date.`, { muted: true })}
  `
  return layout({
    preview: `New delivery: ${pianoName(piano)} for ${fullName(customer)}`,
    label: 'Delivery job',
    title: 'A new delivery for you',
    body
  })
}

/* ---------- POS SALE — internal ---------- */
function posSaleInternalEmail({ customer, piano, order, isAcoustic }) {
  return alertEmail({
    label: isAcoustic ? 'New sale in the showroom' : 'New digital sale',
    title: esc(pianoName(piano) || 'New sale'),
    rows: [
      ['Customer', esc(fullName(customer) || '—'), true],
      ['Email', mailto(customer?.email)],
      ['Piano', esc(pianoName(piano)) + (piano?.serial_number ? ` · serial ${esc(piano.serial_number)}` : '')],
      ['Total', B.money(order?.total), true],
      ['Invoice', esc(order?.invoice_number || '—')],
      ['Delivery', isAcoustic ? 'Delivery record created; customer sent the delivery-window link' : 'Digital piano: no delivery, customer collecting']
    ],
    action: { url: `${ADMIN}/orders.html`, text: 'Open orders' }
  })
}

/* ---------- VIEWING BOOKED (admin calendar) — customer ---------- */
function viewingConfirmedBookingEmail({ first_name, appointment_date, appointment_time, notes, settings }) {
  const body = `
    ${hello(first_name)}
    ${p('Your viewing at the showroom is booked. We look forward to seeing you.', { muted: true })}
    ${details([
      ['Date', formatDate(appointment_date), true],
      ['Time', esc(appointment_time || '—'), true]
    ])}
    ${notes ? note(esc(notes)) : ''}
    ${h2('Where to find us')}
    ${visitBlock()}
    ${p('Parking is available on site. Take as long as you like: there is no pressure to buy. If you need to change the time, reply to this email or give us a call.', { muted: true })}
    ${signOff()}
  `
  return layout({
    preview: `Your viewing: ${formatDate(appointment_date)} at ${appointment_time || ''}`,
    label: 'Your viewing',
    title: 'Your viewing is booked',
    body
  })
}

/* ---------- VIEWING REMINDER (manual button, any day) — customer ----------
   Worded from the booking's own date: "today", "tomorrow", or "on Saturday 26 September". */
function viewingReminderBookingEmail({ first_name, appointment_date, appointment_time }) {
  const when = viewingWhen(appointment_date)
  const When = when.charAt(0).toUpperCase() + when.slice(1)
  const body = `
    ${hello(first_name)}
    ${p(`A reminder that we are looking forward to seeing you ${esc(when)}.`, { muted: true })}
    ${details([
      ['Date', formatDate(appointment_date), true],
      ['Time', esc(appointment_time || '—'), true]
    ])}
    ${h2('Where to find us')}
    ${visitBlock()}
    ${p('Parking is available on site. If something has come up, reply to this email or call us and we will find another time.', { muted: true })}
    ${signOff()}
  `
  return layout({
    preview: `${When}${appointment_time ? ` at ${appointment_time}` : ''}: your viewing at Signature Pianos`,
    label: 'Your viewing',
    title: esc(`Your viewing is ${when}`),
    body
  })
}

/* ---------- BALANCE REMINDER (reserved piano) — customer ---------- */
function balanceReminderEmail({ customer, piano, order, settings }) {
  const s = settings || {}
  const total = Number(order?.total)
  const balance = Number(order?.balance)
  const depositPaid = Number.isFinite(total) && Number.isFinite(balance) && total > balance ? total - balance : null
  const body = `
    ${hello(customer?.first_name)}
    ${p(`A reminder that the balance for your ${esc(pianoName(piano) || 'piano')} is still to be paid.`, { muted: true })}
    ${details([
      ['Piano', esc(pianoName(piano) || '—'), true],
      depositPaid !== null ? ['Deposit paid', B.money(depositPaid)] : null,
      ['Balance owing', B.money(order?.balance), true]
    ])}
    ${h2('Paying by bank transfer')}
    ${details([
      s.bank_bsb ? ['BSB', esc(s.bank_bsb)] : null,
      s.bank_account ? ['Account', esc(s.bank_account)] : null,
      s.bank_account_name ? ['Account name', esc(s.bank_account_name)] : null,
      ['Reference', esc(order?.invoice_number || '—'), true]
    ])}
    ${p('Please arrange payment when you can. Any question, just reply to this email.', { muted: true })}
    ${signOff()}
  `
  return layout({
    preview: `Balance reminder: ${B.money(order?.balance)} for your ${pianoName(piano)}`,
    label: 'Your reservation',
    title: 'Your balance payment',
    body
  })
}

/* ============================================================================
 * Data helpers: currency and date formatting for payment plans, and the
 * server-side lookups some emails need.
 * ======================================================================== */

const planCurrency = (v) =>
  '$' + Math.abs(Number(v || 0)).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/* A card plan's surcharge, or null when there isn't one:
   { amount, pct (e.g. '1.5', '' if unknown), total (price + surcharge) }. */
function planSurcharge(plan) {
  const amount = Number(plan?.surcharge_amount)
  if (!Number.isFinite(amount) || amount <= 0) return null
  const pctNum = Number(plan.surcharge_percentage)
  const stated = Number(plan.total_with_surcharge)
  return {
    amount,
    pct: Number.isFinite(pctNum) && pctNum > 0 ? String(Math.round(pctNum * 100) / 100) : '',
    total: Number.isFinite(stated) && stated > 0 ? stated : Number(plan.total_amount || 0) + amount
  }
}

// DD/MM/YYYY, as safe HTML.
const planDateAU = (d) => {
  if (!d) return '—'
  const [y, m, day] = String(d).split('T')[0].split('-')
  if (!y || !m || !day) return esc(d)
  return esc(`${day}/${m}/${y}`)
}

/* company_settings, read server-side with the service role. Bank details, ABN,
   address and invoice notes only ever come from here: a request body can't
   put someone else's bank account into an email from info@. */
async function loadSettings() {
  const { data, error } = await db().from('company_settings').select('*').limit(1).maybeSingle()
  if (error) throw new Error('Could not load company settings: ' + error.message)
  return data || {}
}

/* The delivery-preferences email for a public call, built only from the
 * deliveries row the customer's preference token points at (plus its order,
 * customer and piano, which anon can't read). Nothing from the request body
 * reaches the email. Sent only straight after the customer saves their
 * windows (the save bumps updated_at), so a token can't be replayed to flood
 * the inbox.
 */
const PREFS_FRESH_MS = 15 * 60 * 1000

async function deliveryPreferencesFromDb(token) {
  if (!/^[A-Za-z0-9_-]{12,128}$/.test(token)) throw new BadRequest('Invalid delivery link')
  const { data: row, error } = await db()
    .from('deliveries')
    .select(`
      customer_preference_1, customer_preference_2, customer_preference_3,
      customer_address_confirmed, customer_special_instructions,
      customer_preferences_submitted, updated_at,
      order:order_id (
        order_number,
        invoice_number,
        customer:customer_id ( first_name, last_name, email, phone ),
        piano:piano_id ( brand, model, year, serial_number )
      )
    `)
    .eq('preference_token', token)
    .maybeSingle()
  if (error) throw new Error('Delivery lookup failed: ' + error.message)
  if (!row) throw new BadRequest('Delivery not found')
  if (!row.customer_preferences_submitted) throw new BadRequest('No delivery windows have been saved yet')
  if (Date.now() - new Date(row.updated_at).getTime() > PREFS_FRESH_MS) {
    throw new BadRequest('These delivery windows were already sent')
  }

  const order = row.order || {}
  const c = order.customer || {}
  const pn = order.piano || {}
  // A saved window is { date: 'YYYY-MM-DD', time: 'Morning (9am–12pm)' }.
  const pref = (w) => {
    if (!w || typeof w !== 'object') return '—'
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(w.date || '')) ? B.longDate(w.date) : text(w.date, 40)
    return [date, text(w.time, 60)].filter(Boolean).join(', ') || '—'
  }
  return {
    customer_name:  `${c.first_name || ''} ${c.last_name || ''}`.trim(),
    customer_email: c.email || '',
    customer_phone: c.phone || '',
    order_number:   order.order_number || '',
    invoice_number: order.invoice_number || '',
    piano: [
      `${pn.brand || ''} ${pn.model || ''} ${pn.year || ''}`.trim(),
      pn.serial_number ? `Serial ${pn.serial_number}` : ''
    ].filter(Boolean).join(' — '),
    pref1:   pref(row.customer_preference_1),
    pref2:   pref(row.customer_preference_2),
    pref3:   pref(row.customer_preference_3),
    address: row.customer_address_confirmed || '',
    notes:   row.customer_special_instructions || ''
  }
}

/* ============================================================================
 * Request validation. Anything invalid throws BadRequest (a 400).
 * ======================================================================== */

class BadRequest extends Error {}

// The preference token of a public delivery_preferences_submitted call.
function preferenceToken(data) {
  const t = data.token ?? data.preference_token
  return typeof t === 'string' && t.trim() ? t.trim() : ''
}

// Plain text from the request: strings and numbers only, whitespace collapsed, capped.
function text(value, max = 200) {
  if (typeof value !== 'string' && typeof value !== 'number') return ''
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max)
}

// A list of short strings (e.g. pianos of interest).
function textList(value, maxItems, maxLen) {
  const list = Array.isArray(value) ? value : (value ? [value] : [])
  return list.slice(0, maxItems).map(v => text(v, maxLen)).filter(Boolean)
}

// 'YYYY-MM-DD' or ''.
function ymd(value) {
  const s = text(value, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''
}

// A plain object (nested payloads), so a missing one can't crash a template.
function obj(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

// Exactly one recipient: a string, one valid address, no lists (no , or ;).
const EMAIL_RE = /^[^\s@,;<>"()[\]\\]+@[^\s@,;<>"()[\]\\.]+(\.[^\s@,;<>"()[\]\\.]+)+$/
function oneEmail(value, label = 'Email') {
  if (typeof value !== 'string' || !value.trim()) throw new BadRequest(`${label} missing`)
  const email = value.trim()
  if (email.length > 254 || !EMAIL_RE.test(email)) throw new BadRequest(`${label} is not a valid email address`)
  return email
}

// One line, no line breaks, sensible length.
function subjectLine(s) {
  return String(s).replace(/\s+/g, ' ').trim().slice(0, 200)
}

/* Links in emails: https:// on our own domain (any subdomain, plus this
   deployment's own host for previews), or stripe.com when `stripe` is set
   (payment links). '' when absent; anything else is a 400. */
function ownHosts() {
  const hosts = new Set(['signaturepianos.com.au'])
  for (const v of [process.env.SITE_URL, process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]) {
    if (!v) continue
    try { hosts.add(new URL(v.includes('://') ? v : `https://${v}`).hostname.toLowerCase()) } catch {}
  }
  return [...hosts]
}

function safeLink(value, label, { stripe = false } = {}) {
  if (value === undefined || value === null || value === '') return ''
  let url
  try { url = new URL(String(value)) } catch { throw new BadRequest(`${label} is not a valid link`) }
  const host = url.hostname.toLowerCase()
  const allowed = [...ownHosts(), ...(stripe ? ['stripe.com'] : [])]
  if (url.protocol !== 'https:' || url.username || url.password ||
      !allowed.some(h => host === h || host.endsWith('.' + h))) {
    throw new BadRequest(`${label} must be an https:// link to signaturepianos.com.au${stripe ? ' or stripe.com' : ''}`)
  }
  return url.toString()
}

/* How to say when a viewing is, from its date in Melbourne:
   'today', 'tomorrow', or 'on Saturday 26 September'. */
function viewingWhen(value) {
  const d = String(value || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return 'coming up'
  const today = melbourneDate()
  if (d === today) return 'today'
  if (d === addDays(today, 1)) return 'tomorrow'
  const date = new Date(d + 'T12:00:00Z')
  if (isNaN(date)) return 'coming up'
  return 'on ' + date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Australia/Melbourne' })
}

/* Template functions, exposed for email previews and tests (the default export is the handler). */
module.exports.templates = {
  viewingConfirmationEmail,
  viewingInternalEmail,
  serviceConfirmationEmail,
  serviceInternalEmail,
  overdueReminderEmail,
  purchaseConfirmationEmail,
  internalSaleEmail,
  deliveryPreferencesEmail,
  generateInvoiceEmailHTML,
  posOrderConfirmationEmail,
  digitalOrderConfirmationEmail,
  deliveryConfirmedEmail,
  paymentPlanContractEmail,
  instalmentReminderEmail,
  buildDriverLiveEmail,
  driverAssignmentEmail,
  posSaleInternalEmail,
  viewingConfirmedBookingEmail,
  viewingReminderBookingEmail,
  balanceReminderEmail,
  alertEmail
}
