/*
 * Signature Pianos — tuner test email
 * -----------------------------------
 * POST /api/send-tuner-test  body: { test_email }
 *
 * Fires a realistic tuner-booking email — same shape as the live
 * api/tuner-booking.js template — to the supplied address, with a
 * "TEST EMAIL" banner across the top so it can't be mistaken for a
 * live booking. Triggered by the "Send test emails" button in
 * admin/deliveries.html.
 *
 * Admin only: without the check this sent info@ mail to any address
 * anyone posted.
 */

const { Resend } = require('resend')
const { requireAdmin, sendAuthError } = require('../lib/auth')
const { layout, hello, p, h2, details, note, button, divider, signOff } = require('../lib/email-brand')
const { parts, sendEmail, errText } = require('../lib/tuner-emails')

const resend   = new Resend(process.env.RESEND_API_KEY)
const SITE_URL = process.env.SITE_URL || 'https://signaturepianos.com.au'
const FROM     = 'Signature Pianos <info@signaturepianos.com.au>'

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try { await requireAdmin(req) } catch (e) { return sendAuthError(res, e) }

  const { test_email } = req.body || {}
  if (!test_email) {
    return res.status(400).json({ error: 'Missing test_email' })
  }
  if (typeof test_email !== 'string' || !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(test_email.trim())) {
    return res.status(400).json({ error: 'test_email must be one email address' })
  }

  const tuner = {
    name: 'Eric Kuang (Test)',
    email: test_email,
    phone: '+61400000000',
  }
  const customer = {
    first_name: 'Jane',
    last_name:  'Smith',
    email:      'jane.smith@example.com',
    phone:      '+61411222333',
    address_line1: '456 Piano Street',
    address_line2: null,
    suburb:        'South Yarra',
    state:         'VIC',
    postcode:      '3141',
  }
  const piano = {
    model: 'U3A',
    year: 1983,
    serial_number: '3843471',
    condition: 'B+',
  }
  const booking = {
    proposed_date: '2026-06-25',
    proposed_time: 'Morning (9am–12pm)',
  }
  const confirmUrl  = `${SITE_URL}/api/tuner-confirm?token=TEST_TOKEN_EXAMPLE`
  const completeUrl = `${SITE_URL}/api/tuner-complete?token=TEST_TOKEN_EXAMPLE`

  const err = await sendEmail(resend, {
    from: FROM,
    to: test_email.trim(),
    subject: `[TEST] Piano tuning request — Jane Smith · Yamaha U3A 1983`,
    html: buildTunerTestEmail({ tuner, customer, piano, booking, confirmUrl, completeUrl }),
  })
  if (err) {
    console.error('[send-tuner-test] failed', err)
    return res.status(502).json({ error: errText(err) || 'Test email failed' })
  }
  return res.status(200).json({ success: true })
}

function escapeHtml(s) {
  if (s == null) return ''
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function formatDate(d) {
  if (!d) return 'TBC'
  try {
    return new Date(d).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return d
  }
}

/* The sample tuner email, built with the brand kit (lib/email-brand.js). */
function buildTunerTestEmail({ tuner, customer, piano, booking, confirmUrl, completeUrl }) {
  const fullAddress = [
    customer.address_line1, customer.suburb, customer.state, customer.postcode,
  ].filter(Boolean).join(', ')

  return layout({
    preview: 'Test email: this is what your tuners will receive. No booking has been made.',
    label: 'Tuning request',
    title: 'Can you take this tuning?',
    body:
      note('<strong style="font-weight:500;">Test email.</strong> This is what your tuners will receive. The links below use a test token and will not change any booking.', 'alert') +
      hello(tuner.name) +
      p('You have a new piano tuning booking request from Signature Pianos.') +
      parts.appointment('Proposed date', escapeHtml(formatDate(booking.proposed_date)), escapeHtml(booking.proposed_time)) +
      h2('Customer') +
      details([
        ['Name', `${escapeHtml(customer.first_name)} ${escapeHtml(customer.last_name)}`, true],
        ['Phone', parts.phoneLink(customer.phone)],
        ['Email', parts.emailLink(customer.email)],
        ['Address', parts.addressBlock(fullAddress)],
      ]) +
      h2('Piano') +
      details([
        ['Piano', `Yamaha ${escapeHtml(piano.model)} ${escapeHtml(piano.year)}`, true],
        ['Serial number', escapeHtml(piano.serial_number)],
        ['Condition', escapeHtml(piano.condition)],
      ]) +
      h2('Please confirm or suggest another time') +
      p('Contact the customer directly if you need to arrange a different time before confirming.', { small: true, muted: true }) +
      button(confirmUrl, 'Confirm this booking') +
      parts.linkRow([
        [`mailto:${customer.email}`, 'Email customer'],
        [`tel:${customer.phone}`, 'Call customer'],
      ]) +
      divider() +
      p(`Once tuning is complete, use this link to mark it done and notify the customer:<br>${parts.textLink(completeUrl, 'Mark tuning complete')}`, { small: true, muted: true }) +
      signOff(),
  })
}

module.exports.templates = { buildTunerTestEmail }
