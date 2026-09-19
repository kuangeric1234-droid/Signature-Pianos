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
 *   BUSINESS_EMAIL  — Internal address (e.g. info@signaturepianos.com.au)
 *
 * The forms call this in fire-and-forget mode AFTER the row is safely
 * in Supabase, so any email failure is logged but never blocks the UX.
 */

const { Resend } = require('resend')
const { internalRecipients } = require('../lib/notify')

const resend = new Resend(process.env.RESEND_API_KEY)
const BUSINESS_EMAIL = process.env.BUSINESS_EMAIL
const FROM = 'Signature Pianos <info@signaturepianos.com.au>'

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { type, ...data } = req.body || {}

  try {
    if (type === 'viewing_booking') {
      // Customer confirmation
      await resend.emails.send({
        from: FROM,
        to: data.email,
        subject: 'Your viewing request — Signature Pianos',
        html: viewingConfirmationEmail(data)
      })
      // Internal notification
      await resend.emails.send({
        from: FROM,
        to: internalRecipients(),
        subject: `New viewing request — ${data.first_name} ${data.last_name}`,
        html: viewingInternalEmail(data)
      })
    }

    if (type === 'service_request') {
      await resend.emails.send({
        from: FROM,
        to: data.email,
        subject: 'Your service request — Signature Pianos',
        html: serviceConfirmationEmail(data)
      })
      await resend.emails.send({
        from: FROM,
        to: internalRecipients(),
        subject: `New service request — ${data.first_name} ${data.last_name}`,
        html: serviceInternalEmail(data)
      })
    }

    if (type === 'overdue_reminder') {
      // Customer-facing reminder only — no internal copy needed since admin triggered it.
      await resend.emails.send({
        from: FROM,
        to: data.email,
        subject: `Payment reminder — invoice ${data.invoice_number || ''}`.trim(),
        html: overdueReminderEmail(data)
      })
    }

    if (type === 'purchase_confirmation') {
      // Customer confirmation + delivery-preferences link, fired by the Stripe webhook.
      await resend.emails.send({
        from: FROM,
        to: data.email,
        subject: `Your Signature Pianos purchase — order ${data.order_number || ''}`.trim(),
        html: purchaseConfirmationEmail(data)
      })
    }

    if (type === 'internal_sale_notification') {
      // Eric-facing notification for every Stripe sale.
      await resend.emails.send({
        from: FROM,
        to: internalRecipients(data.email),
        subject: `New ${data.payment_type === 'deposit' ? 'deposit' : 'sale'} — ${data.piano_label || 'piano'} (${data.order_number || ''})`,
        html: internalSaleEmail(data)
      })
    }

    if (type === 'delivery_preferences_submitted') {
      // The client only sends preference_token + the form fields (anon
      // can't read orders/customers/pianos through RLS, so client-side
      // joins were returning null and the email was rendering as
      // dashes). We resolve the full record server-side via service
      // role, then hand the flattened payload to the template.
      const enriched = await enrichDeliveryPreferencesPayload(data)
      await resend.emails.send({
        from: FROM,
        to: internalRecipients(),
        subject: `Delivery preferences received — ${enriched.customer_name || 'customer'} · ${enriched.order_number || ''}`,
        html: deliveryPreferencesEmail(enriched)
      })
    }

    /* ===== Invoice email — manual resend from admin/orders.html ===== */
    if (type === 'send_invoice') {
      const { customer, piano, order, settings } = data
      if (!customer?.email) {
        return res.status(400).json({ error: 'Customer email missing' })
      }
      await resend.emails.send({
        from: FROM,
        to: customer.email,
        subject: `Invoice ${order.invoice_number} — Signature Pianos`,
        html: generateInvoiceEmailHTML({ customer, piano, order, settings })
      })
      await resend.emails.send({
        from: FROM,
        to: internalRecipients(),
        subject: `Invoice sent — ${order.invoice_number} to ${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
        html: alertEmail({
          title: 'Invoice sent',
          rows: [['Invoice', esc(order.invoice_number), true], ['Sent to', esc(customer.email)]]
        })
      })
    }

    /* ===== POS sale — acoustic piano. Confirmation + invoice + internal ===== */
    if (type === 'pos_order_confirmation') {
      const { customer, piano, order, settings, preferenceUrl } = data
      if (customer?.email) {
        await resend.emails.send({
          from: FROM,
          to: customer.email,
          subject: `Your piano purchase confirmed — Invoice ${order.invoice_number}`,
          html: posOrderConfirmationEmail({ customer, piano, order, settings, preferenceUrl })
        })
        await resend.emails.send({
          from: FROM,
          to: customer.email,
          subject: `Invoice ${order.invoice_number} — Signature Pianos`,
          html: generateInvoiceEmailHTML({ customer, piano, order, settings })
        })
      }
      await resend.emails.send({
        from: FROM,
        to: internalRecipients(),
        subject: `New POS sale — ${order.invoice_number} · ${customer?.first_name || ''} ${customer?.last_name || ''}`.trim(),
        html: posSaleInternalEmail({ customer, piano, order, isAcoustic: true })
      })
    }

    /* ===== POS sale — digital piano. Collection note + invoice + internal ===== */
    if (type === 'digital_order_confirmation') {
      const { customer, piano, order, settings } = data
      if (customer?.email) {
        await resend.emails.send({
          from: FROM,
          to: customer.email,
          subject: `Your purchase confirmed — Invoice ${order.invoice_number}`,
          html: digitalOrderConfirmationEmail({ customer, piano, order, settings })
        })
        await resend.emails.send({
          from: FROM,
          to: customer.email,
          subject: `Invoice ${order.invoice_number} — Signature Pianos`,
          html: generateInvoiceEmailHTML({ customer, piano, order, settings })
        })
      }
      await resend.emails.send({
        from: FROM,
        to: internalRecipients(),
        subject: `New digital sale — ${order.invoice_number} · ${customer?.first_name || ''} ${customer?.last_name || ''}`.trim(),
        html: posSaleInternalEmail({ customer, piano, order, isAcoustic: false })
      })
    }

    /* ===== Payment plan — contract sent to customer ===== */
    if (type === 'payment_plan_contract') {
      const { plan, customer, piano, instalments, settings, signUrl } = data
      if (!customer?.email) {
        return res.status(400).json({ error: 'Customer email missing' })
      }
      await resend.emails.send({
        from: FROM,
        to: customer.email,
        subject: `Payment plan contract — ${plan.plan_number} · Signature Pianos`,
        html: paymentPlanContractEmail({ plan, customer, piano, instalments, settings, signUrl })
      })
      await resend.emails.send({
        from: FROM,
        to: internalRecipients(),
        subject: `Contract sent — ${plan.plan_number} · ${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
        html: alertEmail({
          label: 'Payment plan',
          title: 'Contract sent',
          rows: [['Sent to', esc(customer.email)], ['Plan', esc(plan.plan_number || ''), true], ['Total', planCurrency(plan.total_amount)]],
          message: 'Waiting for the customer to sign.'
        })
      })
    }

    /* ===== Payment plan — customer has signed (fired by api/sign-contract.js) ===== */
    if (type === 'payment_plan_signed') {
      const { plan, customer, piano, signed_at, full_name, contract_url } = data
      // Pull settings for the email footer; non-fatal if missing.
      let settings = {}
      try {
        const { data: s } = await pickSettings()
        if (s) settings = s
      } catch {}
      if (customer?.email) {
        await resend.emails.send({
          from: FROM,
          to: customer.email,
          subject: `Contract signed — Payment plan ${plan.plan_number} · Signature Pianos`,
          html: paymentPlanSignedCustomerEmail({ plan, customer, piano, signed_at, settings })
        })
      }
      await resend.emails.send({
        from: FROM,
        to: internalRecipients(),
        subject: `Contract signed — ${plan.plan_number} · ${customer?.first_name || ''} ${customer?.last_name || ''}`.trim(),
        html: alertEmail({
          label: 'Payment plan',
          title: 'Contract signed',
          rows: [
            ['Customer', `${esc((customer?.first_name || '') + ' ' + (customer?.last_name || ''))}<br>${esc(customer?.email || '')}`, true],
            ['Plan', esc(plan.plan_number || '')],
            ['Piano', esc((piano?.brand || '') + ' ' + (piano?.model || '') + ' ' + (piano?.year || ''))],
            ['Total', planCurrency(plan.total_amount)],
            ['Signed at', esc(signed_at || '')],
            ['Name confirmed', esc(full_name || '')],
            ['Signature file', esc(contract_url || 'Not saved')],
            ['Plan status', 'Active']
          ]
        })
      })
    }

    /* ===== Payment plan — overdue instalment reminder ===== */
    if (type === 'instalment_reminder') {
      const { plan, customer, piano, overdueInstalments, settings } = data
      if (!customer?.email) {
        return res.status(400).json({ error: 'Customer email missing' })
      }
      await resend.emails.send({
        from: FROM,
        to: customer.email,
        subject: `Payment reminder — Plan ${plan.plan_number} · Signature Pianos`,
        html: instalmentReminderEmail({ plan, customer, piano, overdueInstalments, settings })
      })
      await resend.emails.send({
        from: FROM,
        to: internalRecipients(),
        subject: `Reminder sent — ${plan.plan_number} · ${customer.first_name || ''} ${customer.last_name || ''}`.trim(),
        html: alertEmail({
          label: 'Payment plan',
          title: 'Overdue reminder sent',
          rows: [['Sent to', esc(customer.email)], ['Plan', esc(plan.plan_number || ''), true], ['Overdue instalments', String(overdueInstalments?.length || 0)]]
        })
      })
    }

    /* ===== Viewing appointment — admin-created direct booking ===== */
    if (type === 'viewing_confirmed') {
      const { first_name, email, appointment_date, appointment_time, notes, settings } = data
      if (!email) return res.status(400).json({ error: 'Customer email missing' })
      await resend.emails.send({
        from: FROM,
        to: email,
        subject: 'Your viewing is confirmed — Signature Pianos',
        html: viewingConfirmedBookingEmail({ first_name, appointment_date, appointment_time, notes, settings })
      })
    }

    if (type === 'viewing_reminder') {
      const { first_name, email, appointment_date, appointment_time, settings } = data
      if (!email) return res.status(400).json({ error: 'Customer email missing' })
      await resend.emails.send({
        from: FROM,
        to: email,
        subject: 'Reminder: Your viewing is tomorrow — Signature Pianos',
        html: viewingReminderBookingEmail({ first_name, appointment_date, appointment_time, settings })
      })
    }

    /* ===== Balance reminder — admin pings reserved-piano customer ===== */
    if (type === 'balance_reminder') {
      const { customer, piano, order, settings } = data
      if (!customer?.email) return res.status(400).json({ error: 'Customer email missing' })
      await resend.emails.send({
        from: FROM,
        to: customer.email,
        subject: `Balance payment reminder — ${piano?.brand || 'Yamaha'} ${piano?.model || ''} ${piano?.year || ''}`.trim(),
        html: balanceReminderEmail({ customer, piano, order, settings })
      })
    }

    /* ===== Driver assignment — admin assigns a partner, customer
       prefs go out for selection ===== */
    if (type === 'driver_assignment') {
      const { driver_name, driver_email, customer, piano,
              preferences, delivery_address, accept_url, settings } = data
      if (!driver_email) {
        return res.status(400).json({ error: 'Driver email missing' })
      }
      const pianoLabel = `${piano?.brand || 'Yamaha'} ${piano?.model || ''} ${piano?.year || ''}`.trim()
      await resend.emails.send({
        from: FROM,
        to: driver_email,
        subject: `Delivery assignment — ${pianoLabel} · ${customer?.first_name || ''} ${customer?.last_name || ''}`.trim(),
        html: driverAssignmentEmail({ driver_name, customer, piano, preferences, delivery_address, accept_url, settings })
      })
      await resend.emails.send({
        from: FROM,
        to: internalRecipients(),
        subject: `Driver assigned — ${driver_name} · ${pianoLabel}`.trim(),
        html: alertEmail({
          label: 'Delivery',
          title: 'Delivery partner assigned',
          rows: [['Partner', `${esc(driver_name)}<br>${esc(driver_email)}`, true], ['Customer', esc((customer?.first_name || '') + ' ' + (customer?.last_name || ''))]],
          message: 'Waiting for the partner to accept a delivery window.'
        })
      })
    }

    /* ===== Driver — pickup or delivery photo upload link ===== */
    if (type === 'driver_pickup_link' || type === 'driver_delivery_link') {
      const isPickup = type === 'driver_pickup_link'
      const { driver_name, driver_email, customer, piano,
              pickup_url, delivery_url, scheduled_date, scheduled_time } = data
      if (!driver_email) {
        return res.status(400).json({ error: 'Driver email missing' })
      }
      const pianoLabel = `${piano?.brand || ''} ${piano?.model || ''} ${piano?.year || ''}`.trim()
      await resend.emails.send({
        from: FROM,
        to: driver_email,
        subject: isPickup
          ? `Piano pickup — photos required · ${pianoLabel}`
          : `Piano delivery — photos required · ${pianoLabel}`,
        html: buildDriverLiveEmail({
          isPickup, driver_name, customer, piano,
          tokenUrl: isPickup ? pickup_url : delivery_url,
          scheduled_date, scheduled_time,
        })
      })
      await resend.emails.send({
        from: FROM,
        to: internalRecipients(),
        subject: isPickup ? `Pickup link sent to ${driver_name}` : `Delivery link sent to ${driver_name}`,
        html: alertEmail({
          label: 'Delivery',
          title: isPickup ? 'Pickup link sent' : 'Delivery link sent',
          rows: [['Partner', `${esc(driver_name)}<br>${esc(driver_email)}`, true], ['Piano', esc(pianoLabel)], ['Customer', esc((customer?.first_name || '') + ' ' + (customer?.last_name || ''))]]
        })
      })
    }

    /* ===== Delivery date confirmed by admin ===== */
    if (type === 'delivery_confirmed') {
      const { customer, piano, delivery, settings } = data
      if (!customer?.email) {
        return res.status(400).json({ error: 'Customer email missing' })
      }
      const fmtDelDate = (d) => {
        if (!d) return '—'
        const [y, m, day] = String(d).split('T')[0].split('-')
        if (!y || !m || !day) return d
        return `${day}/${m}/${y}`
      }
      await resend.emails.send({
        from: FROM,
        to: customer.email,
        subject: 'Your piano delivery is confirmed — Signature Pianos',
        html: deliveryConfirmedEmail({ customer, piano, delivery, settings, formatDate: fmtDelDate })
      })
      await resend.emails.send({
        from: FROM,
        to: internalRecipients(),
        subject: `Delivery confirmed — ${customer.first_name || ''} ${customer.last_name || ''} · ${fmtDelDate(delivery.scheduled_date)}`.trim(),
        html: alertEmail({
          label: 'Delivery',
          title: 'Delivery date sent to the customer',
          rows: [['Sent to', esc(customer.email)], ['Date', `${esc(fmtDelDate(delivery.scheduled_date))} ${esc(delivery.scheduled_time_window || '')}`, true]]
        })
      })
    }

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('Email error:', err)
    return res.status(500).json({ error: 'Email failed' })
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
      ['Payment method', esc(paymentLabels[data.payment_method] || data.payment_method || '—')]
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
    ${h2('Next: choose your delivery window')}
    ${p(`Share three delivery windows that suit you. We will confirm one of them by email or phone within 48 hours.`, { muted: true })}
    ${data.preferences_url ? button(data.preferences_url, 'Choose delivery windows') : ''}
    ${data.preferences_url ? p(`If the button doesn't work, copy this link into your browser:<br><span style="word-break:break-all;">${esc(data.preferences_url)}</span>`, { small: true, muted: true }) : ''}
    ${signOff()}
  `
  return layout({
    preview: isDeposit ? 'Deposit received: choose your delivery window' : 'Purchase confirmed: choose your delivery window',
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
  const body = `
    ${hello(customer?.first_name)}
    ${p('Your payment plan is ready. Please check the details below, then sign the contract to confirm it.', { muted: true })}
    ${details([
      ['Plan', esc(plan.plan_number || '—')],
      ['Piano', esc(pianoName(piano) || '—'), true],
      ['Total price', planCurrency(plan.total_amount), true],
      ['Deposit', planCurrency(plan.deposit_amount) + (plan.deposit_paid ? ' (paid)' : '')],
      ['Instalments', `${esc(plan.number_of_instalments || '')} × ${planCurrency(plan.instalment_amount)} ${esc(plan.instalment_frequency || '')}`],
      ['Start date', planDateAU(plan.start_date)]
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

/* ---------- PAYMENT PLAN SIGNED — customer ---------- */
function paymentPlanSignedCustomerEmail({ plan, customer, piano, signed_at, settings }) {
  const body = `
    ${hello(customer?.first_name)}
    ${p('Thank you for signing your payment plan contract. It has been saved and your plan is now active.', { muted: true })}
    ${details([
      ['Plan', esc(plan.plan_number || '—')],
      ['Piano', esc(pianoName(piano) || '—'), true],
      ['Total', planCurrency(plan.total_amount), true],
      ['Instalments', `${esc(plan.number_of_instalments || '')} × ${planCurrency(plan.instalment_amount)} ${esc(plan.instalment_frequency || '')}`],
      ['Signed', planDateAU(signed_at)]
    ])}
    ${p('We will be in touch to arrange delivery of your piano. Any question, just reply to this email.', { muted: true })}
    ${signOff()}
  `
  return layout({
    preview: `Contract signed: payment plan ${plan.plan_number || ''} is active`,
    label: `Payment plan · ${esc(plan.plan_number || '')}`,
    title: 'Your contract is signed',
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

/* ---------- VIEWING REMINDER (manual button) — customer ---------- */
function viewingReminderBookingEmail({ first_name, appointment_date, appointment_time, settings }) {
  const body = `
    ${hello(first_name)}
    ${p('A reminder that we are looking forward to seeing you tomorrow.', { muted: true })}
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
    preview: `Tomorrow at ${appointment_time || ''}: your viewing at Signature Pianos`,
    label: 'Your viewing',
    title: 'Your viewing is tomorrow',
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

const planDateAU = (d) => {
  if (!d) return '—'
  const [y, m, day] = String(d).split('T')[0].split('-')
  if (!y || !m || !day) return d
  return `${day}/${m}/${y}`
}

/* Server-side resolver for the delivery preferences email.
 *
 * The public delivery-preferences.html page can only read the deliveries
 * table (anon RLS by preference_token). The orders / customers / pianos
 * tables have no anon SELECT policy, so client-side joins returned null
 * and the resulting email payload was all dashes. This helper does the
 * lookup under the service role so the email can fully populate from a
 * single source of truth: the preference_token the customer just used.
 *
 * Returns a flat payload matching what deliveryPreferencesEmail expects:
 *   customer_name / customer_email / customer_phone / piano / order_number
 *   / invoice_number / pref1 / pref2 / pref3 / address / notes
 */
async function enrichDeliveryPreferencesPayload(data) {
  const out = {
    customer_name:  '',
    customer_email: '',
    customer_phone: '',
    piano:          '',
    order_number:   '',
    invoice_number: '',
    pref1:          data?.pref1   || '—',
    pref2:          data?.pref2   || '—',
    pref3:          data?.pref3   || '—',
    address:        data?.address || '',
    notes:          data?.notes   || '',
  }

  const token = data?.preference_token
  if (!token) {
    // Fall back to the legacy direct-payload shape for any old callers.
    return Object.assign(out, {
      customer_name:  data?.customer_name  || out.customer_name,
      customer_email: data?.customer_email || out.customer_email,
      customer_phone: data?.customer_phone || out.customer_phone,
      piano:          data?.piano          || out.piano,
      order_number:   data?.order_number   || out.order_number,
      invoice_number: data?.invoice_number || out.invoice_number,
    })
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return out
  }
  try {
    const { createClient } = require('@supabase/supabase-js')
    const supa = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: row, error } = await supa
      .from('deliveries')
      .select(`
        id,
        order:order_id (
          order_number,
          invoice_number,
          customer:customer_id ( first_name, last_name, email, phone ),
          piano:piano_id ( brand, model, year, serial_number )
        )
      `)
      .eq('preference_token', token)
      .maybeSingle()
    if (error || !row?.order) return out
    const c = row.order.customer || {}
    const p = row.order.piano    || {}
    out.customer_name  = `${c.first_name || ''} ${c.last_name || ''}`.trim()
    out.customer_email = c.email || ''
    out.customer_phone = c.phone || ''
    out.order_number   = row.order.order_number || ''
    out.invoice_number = row.order.invoice_number || ''
    out.piano = [
      `${p.brand || ''} ${p.model || ''} ${p.year || ''}`.trim(),
      p.serial_number ? `Serial ${p.serial_number}` : '',
    ].filter(Boolean).join(' — ')
  } catch (err) {
    console.error('[send-email] enrichDeliveryPreferencesPayload failed', err)
  }
  return out
}

// Lazy company_settings fetch — only loaded when payment_plan_signed fires,
// since the other endpoints already pass `settings` in the payload.
async function pickSettings() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { data: null }
  }
  const { createClient } = require('@supabase/supabase-js')
  const supa = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  return supa.from('company_settings').select('*').limit(1).maybeSingle()
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
  paymentPlanSignedCustomerEmail,
  instalmentReminderEmail,
  buildDriverLiveEmail,
  driverAssignmentEmail,
  posSaleInternalEmail,
  viewingConfirmedBookingEmail,
  viewingReminderBookingEmail,
  balanceReminderEmail,
  alertEmail
}
