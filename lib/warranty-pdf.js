/*
 * Signature Pianos — warranty certificate PDF
 * -------------------------------------------
 * buildWarrantyPdf({ customer, piano, order, warranty, signature }) → Uint8Array
 *
 * Two A4 pages in the brand: the certificate (holder, piano, dates, Eric's
 * signature) and the warranty terms with the Australian Consumer Law wording a
 * warranty against defects must carry. Drawn with pdf-lib, so it runs in a
 * Vercel function with no browser. Fonts and marks come from
 * lib/warranty-assets.js (built by brand/src/build_warranty_assets.py).
 *
 * Eric's signature is his name set in the script face (Italianno). To use a
 * handwritten one instead, put a transparent PNG in private Supabase Storage
 * (never in this public repo) and set SIGNATURE_STORAGE_PATH to
 * "<bucket>/<path>"; loadSignature(supabase) then fetches it.
 *
 * The terms below are the promises on services/delivery-warranty.html. Change
 * them there and here together.
 */

const { PDFDocument, rgb, setCharacterSpacing } = require('pdf-lib')
const fontkit = require('@pdf-lib/fontkit')
const assets = require('./warranty-assets')

const BUSINESS = {
  name: 'Signature Pianos',
  address: '63 Blackburn Road, Mount Waverley VIC 3149',
  phone: '0479 128 955',
  email: 'info@signaturepianos.com.au',
  site: 'signaturepianos.com.au',
  signatory: 'Eric Kuang',
  role: 'Founder, Signature Pianos'
}

const W = 595.28
const H = 841.89
const M = 64 // text margin
const hex = h => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255)
const C = {
  ink: hex('#16222E'),
  inkSoft: hex('#3A4855'),
  ivory: hex('#F3F0E9'),
  mistLight: hex('#DCE6ED'),
  felt: hex('#4A1520')
}

/* ---------- the words ---------- */

function terms(years) {
  return [
    {
      title: 'What’s covered',
      paras: [
        `For ${years} years from delivery, we cover faults in the materials and workmanship of every structural and mechanical part of your piano: the soundboard, frame, pin block, action, hammers, dampers, keys, pedals and case.`,
        'Damage that happens during our delivery is covered from day one.',
        'If a covered part fails in normal home use, we will repair it or replace the part.'
      ]
    },
    {
      title: 'What isn’t covered',
      bullets: [
        'Normal wear from regular playing.',
        'Damage from accidents, misuse or neglect, including exposure to extreme humidity or sudden changes in temperature.',
        'Tuning and regulation. Every piano needs these from time to time as routine care. Your first tuning after delivery is included.',
        'Damage from moving the piano, unless the move is done by Signature Pianos or by movers we have approved.'
      ]
    },
    {
      title: 'Making a claim',
      paras: [
        `Call ${BUSINESS.phone} or email ${BUSINESS.email} with your certificate number and a short description of the problem. A photo helps.`,
        'Signature Pianos, or a technician we authorise, will inspect the piano and repair it or replace the faulty part. There is no charge to make a claim or for a covered repair.'
      ]
    },
    {
      title: 'If you sell the piano',
      paras: [
        `The warranty stays with the piano. If you sell it, the new owner is covered for the rest of the ${years} years. Let us know their name and contact details so we can update our records.`
      ]
    },
    {
      title: 'Looking after your piano',
      paras: [
        'We recommend a tuning at least once a year and routine care by a qualified piano technician. Keep the piano away from heaters, air-conditioning vents and direct sun, in a room where the humidity stays steady.'
      ]
    }
  ]
}

const ACL = [
  `This warranty is given by ${BUSINESS.name}, ${BUSINESS.address} (${BUSINESS.phone}, ${BUSINESS.email}). The benefits it gives you are in addition to other rights and remedies you have under a law in relation to the piano.`,
  'Our goods come with guarantees that cannot be excluded under the Australian Consumer Law. You are entitled to a replacement or refund for a major failure and compensation for any other reasonably foreseeable loss or damage. You are also entitled to have the goods repaired or replaced if the goods fail to be of acceptable quality and the failure does not amount to a major failure.'
]

/* ---------- formatting ---------- */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/* "19 September 2026". Plain dates (YYYY-MM-DD) are taken as written; timestamps are read in Melbourne time. */
function longDate(value) {
  if (!value) return ''
  const s = String(value)
  let y, m, d
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    [y, m, d] = s.split('-').map(Number)
  } else {
    const dt = new Date(s)
    if (isNaN(dt)) return s
    const parts = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(dt)
    const get = t => Number(parts.find(p => p.type === t).value)
    y = get('year'); m = get('month'); d = get('day')
  }
  return `${d} ${MONTHS[m - 1]} ${y}`
}

function titleCase(s) {
  return String(s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function pianoName(piano) {
  return [piano.brand || 'Yamaha', piano.model].filter(Boolean).join(' ')
}

function pianoFacts(piano) {
  return [
    piano.type ? titleCase(piano.type) : '',
    piano.year ? String(piano.year) : '',
    piano.serial_number ? `Serial ${piano.serial_number}` : '',
    titleCase(piano.finish || piano.colour || '')
  ].filter(Boolean).join('  ·  ')
}

function warrantyFilename(warranty) {
  return `Signature-Pianos-Warranty-${String(warranty.warranty_number || 'certificate').replace(/[^A-Za-z0-9-]/g, '')}.pdf`
}

/* ---------- drawing helpers ---------- */

/* Keep only characters the font can draw: accents fall back to the bare letter, anything else is dropped. */
function fit(text, font) {
  const set = font.__chars || (font.__chars = new Set(font.getCharacterSet()))
  let out = ''
  for (const ch of String(text == null ? '' : text).normalize('NFC').replace(/\s+/g, ' ')) {
    if (set.has(ch.codePointAt(0))) { out += ch; continue }
    const base = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    if (base && [...base].every(b => set.has(b.codePointAt(0)))) out += base
  }
  return out.trim()
}

function widthOf(text, font, size, tracking = 0) {
  return font.widthOfTextAtSize(text, size) + tracking * size * Math.max(0, [...text].length - 1)
}

/* Draw one line. top = distance of the baseline from the top of the page; tracking in em. */
function line(page, text, { x, top, font, size, color = C.ink, tracking = 0, align = 'left', opacity }) {
  const t = fit(text, font)
  if (!t) return 0
  const w = widthOf(t, font, size, tracking)
  const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x
  if (tracking) page.pushOperators(setCharacterSpacing(tracking * size))
  page.drawText(t, { x: left, y: H - top, font, size, color, opacity })
  if (tracking) page.pushOperators(setCharacterSpacing(0))
  return w
}

/* The largest size (down to min) at which the text fits the width. */
function fitSize(text, font, size, width, min, tracking = 0) {
  const t = fit(text, font)
  while (size > min && widthOf(t, font, size, tracking) > width) size -= 0.5
  return size
}

function wrap(text, font, size, width) {
  const words = fit(text, font).split(' ')
  const lines = []
  let cur = ''
  for (const word of words) {
    const next = cur ? cur + ' ' + word : word
    if (cur && font.widthOfTextAtSize(next, size) > width) { lines.push(cur); cur = word } else cur = next
  }
  if (cur) lines.push(cur)
  return lines
}

/* A wrapped paragraph from a first baseline; returns the baseline after the last line. */
function paragraph(page, text, { x, top, width, font, size, leading, color = C.inkSoft, align = 'left' }) {
  for (const l of wrap(text, font, size, width)) {
    line(page, l, { x: align === 'center' ? x + width / 2 : x, top, font, size, color, align })
    top += leading
  }
  return top
}

function rule(page, x1, x2, top, { color = C.ink, opacity = 0.22, thickness = 0.5 } = {}) {
  page.drawLine({ start: { x: x1, y: H - top }, end: { x: x2, y: H - top }, thickness, color, opacity })
}

/* A brand mark from lib/warranty-assets.js, scaled to a width, top edge at `top`. */
function mark(page, m, { cx, top, width, color = C.ink }) {
  const [vx, vy, vw] = m.viewBox
  const s = width / vw
  const x = cx - width / 2 - vx * s
  const y = H - top + vy * s // svg y grows down; pdf-lib flips it
  for (const p of m.paths) {
    if (p.stroke) page.drawSvgPath(p.d, { x, y, scale: s, borderColor: color, borderWidth: p.stroke })
    else page.drawSvgPath(p.d, { x, y, scale: s, color })
  }
  return m.viewBox[3] * s
}

/* The brand arch: a round top on straight sides. */
function arch(page, { cx, top, width, bottom, color = C.mistLight }) {
  const r = width / 2
  const d = `M ${-r} ${bottom - top} L ${-r} ${r} A ${r} ${r} 0 0 1 ${r} ${r} L ${r} ${bottom - top} Z`
  page.drawSvgPath(d, { x: cx, y: H - top, color })
}

function frame(page) {
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.ivory })
  page.drawRectangle({ x: 22, y: 22, width: W - 44, height: H - 44, borderColor: C.ink, borderWidth: 0.8, borderOpacity: 0.85 })
  page.drawRectangle({ x: 27, y: 27, width: W - 54, height: H - 54, borderColor: C.ink, borderWidth: 0.35, borderOpacity: 0.45 })
}

function footer(page, f) {
  line(page, `${BUSINESS.address}   ·   ${BUSINESS.phone}   ·   ${BUSINESS.email}   ·   ${BUSINESS.site}`,
    { x: W / 2, top: 796, font: f.text, size: 6.2, color: C.inkSoft, tracking: 0.16, align: 'center' })
}

/* ---------- the certificate ---------- */

async function buildWarrantyPdf({ customer = {}, piano = {}, order = {}, warranty = {}, signature = null }) {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  // Ligatures off: pdf-lib gives ligature glyphs the wrong advance (Italianno's "fi" opens a gap).
  const embed = b64 => doc.embedFont(Buffer.from(b64, 'base64'), { subset: false, features: { liga: false, clig: false, dlig: false, calt: false } })
  const f = {
    text: await embed(assets.fonts.jostRegular),
    medium: await embed(assets.fonts.jostMedium),
    display: await embed(assets.fonts.display),
    script: await embed(assets.fonts.script)
  }

  const years = Number(warranty.years) || 10
  const number = warranty.warranty_number || ''
  const holder = [customer.first_name, customer.last_name].filter(Boolean).join(' ') || customer.name || ''
  const startDate = warranty.start_date || new Date().toISOString().slice(0, 10)
  const dates = {
    purchased: longDate(order.created_at || order.paid_at || startDate),
    delivered: longDate(startDate),
    until: longDate(warranty.expiry_date) || ''
  }

  doc.setTitle(`Warranty certificate ${number}`.trim())
  doc.setAuthor(BUSINESS.name)
  doc.setSubject(`${years}-year warranty for a ${pianoName(piano)}${holder ? `, issued to ${holder}` : ''}`)
  doc.setCreator(BUSINESS.name)
  doc.setProducer(BUSINESS.name)
  doc.setLanguage('en-AU')
  doc.setCreationDate(new Date())

  /* Page 1: the certificate */
  const p1 = doc.addPage([W, H])
  frame(p1)
  mark(p1, assets.logo, { cx: W / 2, top: 66, width: 156 })
  p1.drawRectangle({ x: W / 2 - 14, y: H - 147, width: 28, height: 1.4, color: C.felt })
  line(p1, number ? `Certificate No. ${number}` : 'Certificate of warranty', { x: W / 2, top: 174, font: f.medium, size: 7.2, color: C.inkSoft, tracking: 0.3, align: 'center' })
  line(p1, `${years}-YEAR WARRANTY`, { x: W / 2, top: 230, font: f.display, size: 54, align: 'center' })
  line(p1, 'Certificate', { x: W / 2, top: 262, font: f.script, size: 66, align: 'center' })
  paragraph(p1, `This certifies that the piano below, sold by ${BUSINESS.name}, is covered by our ${years}-year warranty from the day it was delivered.`,
    { x: W / 2 - 170, top: 298, width: 340, font: f.text, size: 10, leading: 15.5, color: C.inkSoft, align: 'center' })

  // The arch frames who it belongs to and what it covers.
  arch(p1, { cx: W / 2, top: 338, width: 372, bottom: 592 })
  mark(p1, assets.monogram, { cx: W / 2, top: 366, width: 30 })
  line(p1, 'Presented to', { x: W / 2, top: 430, font: f.medium, size: 7.2, color: C.inkSoft, tracking: 0.3, align: 'center' })
  // A long name goes onto two lines rather than shrinking out of the arch.
  const name = fit(holder.toLocaleUpperCase('en-AU'), f.display)
  let nameLines = [name]
  if (widthOf(name, f.display, 26) > 300 && name.includes(' ')) {
    const words = name.split(' ')
    let best = 1
    for (let i = 1; i < words.length; i++) {
      const d = i => Math.abs(widthOf(words.slice(0, i).join(' '), f.display, 26) - widthOf(words.slice(i).join(' '), f.display, 26))
      if (d(i) < d(best)) best = i
    }
    nameLines = [words.slice(0, best).join(' '), words.slice(best).join(' ')]
  }
  const nameSize = Math.min(...nameLines.map(l => fitSize(l, f.display, nameLines.length > 1 ? 26 : 34, 300, 16)))
  const nameTop = nameLines.length > 1 ? 462 : 470
  const nameGap = nameSize * 1.16 // room for Vietnamese accents above and below
  nameLines.forEach((l, i) => line(p1, l, { x: W / 2, top: nameTop + i * nameGap, font: f.display, size: nameSize, align: 'center' }))
  const shift = nameTop + (nameLines.length - 1) * nameGap - 470
  p1.drawRectangle({ x: W / 2 - 10, y: H - 492 - shift, width: 20, height: 1.1, color: C.felt })
  const pname = pianoName(piano).toLocaleUpperCase('en-AU')
  line(p1, pname, { x: W / 2, top: 526 + shift, font: f.display, size: fitSize(pname, f.display, 24, 320, 14), align: 'center' })
  const facts = pianoFacts(piano)
  line(p1, facts, { x: W / 2, top: 548 + shift, font: f.text, size: fitSize(facts, f.text, 9.5, 330, 7), color: C.inkSoft, align: 'center' })

  // Dates
  const colW = (W - 2 * M) / 3
  rule(p1, M, W - M, 610)
  rule(p1, M, W - M, 668)
  ;[['Purchased', dates.purchased], ['Delivered · cover starts', dates.delivered], ['Covered until', dates.until]].forEach(([k, v], i) => {
    const cx = M + colW * i + colW / 2
    if (i) p1.drawLine({ start: { x: M + colW * i, y: H - 620 }, end: { x: M + colW * i, y: H - 658 }, thickness: 0.5, color: C.ink, opacity: 0.22 })
    line(p1, k, { x: cx, top: 631, font: f.medium, size: 6.6, color: C.inkSoft, tracking: 0.26, align: 'center' })
    line(p1, v.toLocaleUpperCase('en-AU'), { x: cx, top: 654, font: f.display, size: 16, align: 'center' })
  })

  // Signature, seal, date
  const sigLine = 740
  const sigX = M
  let drawn = false
  if (signature) {
    try {
      const bytes = Buffer.isBuffer(signature) ? signature : Buffer.from(signature)
      const img = bytes[0] === 0xff ? await doc.embedJpg(bytes) : await doc.embedPng(bytes)
      const h = 52
      const w = img.width * (h / img.height)
      p1.drawImage(img, { x: sigX + 2, y: H - sigLine - 7, width: Math.min(w, 178), height: h })
      drawn = true
    } catch (err) {
      console.warn('[warranty-pdf] signature image unusable, using the typeset name', err?.message || err)
    }
  }
  if (!drawn) line(p1, BUSINESS.signatory, { x: sigX + 6, top: sigLine - 8, font: f.script, size: 36 })
  rule(p1, M, M + 180, sigLine, { opacity: 0.55 })
  line(p1, BUSINESS.signatory, { x: M, top: sigLine + 15, font: f.medium, size: 8.4 })
  line(p1, BUSINESS.role, { x: M, top: sigLine + 27, font: f.text, size: 7.6, color: C.inkSoft })

  p1.drawCircle({ x: W / 2, y: H - (sigLine - 16), size: 23, color: C.felt })
  mark(p1, assets.monogram, { cx: W / 2, top: sigLine - 32, width: 18, color: C.ivory })

  line(p1, dates.delivered, { x: W - M, top: sigLine - 8, font: f.text, size: 11, align: 'right' })
  rule(p1, W - M - 180, W - M, sigLine, { opacity: 0.55 })
  line(p1, 'Date', { x: W - M, top: sigLine + 15, font: f.medium, size: 8.4, align: 'right' })
  line(p1, 'Terms of this warranty overleaf', { x: W - M, top: sigLine + 27, font: f.text, size: 7.6, color: C.inkSoft, align: 'right' })
  footer(p1, f)

  /* Page 2: the terms */
  const p2 = doc.addPage([W, H])
  frame(p2)
  mark(p2, assets.logo, { cx: W / 2, top: 54, width: 108 })
  p2.drawRectangle({ x: W / 2 - 12, y: H - 110, width: 24, height: 1.2, color: C.felt })
  line(p2, number ? `Certificate No. ${number}` : 'Warranty terms', { x: W / 2, top: 134, font: f.medium, size: 7.2, color: C.inkSoft, tracking: 0.3, align: 'center' })
  line(p2, 'HOW YOUR WARRANTY', { x: W / 2, top: 176, font: f.display, size: 36, align: 'center' })
  line(p2, 'works', { x: W / 2, top: 200, font: f.script, size: 46, align: 'center' })

  const gutter = 26
  const cw = (W - 2 * M - gutter) / 2
  const size = 8.7
  const leading = 13.4
  const drawSection = (s, i, x, top) => {
    line(p2, String(i + 1).padStart(2, '0'), { x, top, font: f.display, size: 15, color: C.felt })
    line(p2, s.title.toUpperCase(), { x: x + 24, top: top - 1, font: f.medium, size: 7.4, tracking: 0.2 })
    top += 17
    for (const para of s.paras || []) top = paragraph(p2, para, { x, top, width: cw, font: f.text, size, leading }) + 4
    for (const b of s.bullets || []) {
      p2.drawRectangle({ x, y: H - top + 2.4, width: 2.6, height: 2.6, color: C.felt })
      top = paragraph(p2, b, { x: x + 11, top, width: cw - 11, font: f.text, size, leading }) + 4
    }
    return top + 16
  }
  const list = terms(years)
  let left = 244
  let right = 244
  list.slice(0, 2).forEach((s, i) => { left = drawSection(s, i, M, left) })
  list.slice(2).forEach((s, i) => { right = drawSection(s, i + 2, M + cw + gutter, right) })

  // Australian Consumer Law, in a mist panel under the longer column.
  const aclTop = Math.max(left, right) + 4
  const aclW = W - 2 * M
  const pad = 22
  const aclLines = ACL.map(t => wrap(t, f.text, 8.3, aclW - 2 * pad))
  const aclH = 30 + aclLines.reduce((n, ls) => n + ls.length * 12.6 + 6, 0) + 12
  p2.drawRectangle({ x: M, y: H - aclTop - aclH, width: aclW, height: aclH, color: C.mistLight })
  line(p2, 'YOUR RIGHTS UNDER AUSTRALIAN CONSUMER LAW', { x: M + pad, top: aclTop + 26, font: f.medium, size: 7.4, tracking: 0.2 })
  let at = aclTop + 44
  for (const ls of aclLines) {
    for (const l of ls) { line(p2, l, { x: M + pad, top: at, font: f.text, size: 8.3, color: C.inkSoft }); at += 12.6 }
    at += 6
  }

  const issued = [number && `Certificate No. ${number}`, holder && `Issued to ${holder}`, `${pianoName(piano)}${piano.serial_number ? `, serial ${piano.serial_number}` : ''}`].filter(Boolean).join('   ·   ')
  line(p2, issued, { x: W / 2, top: 772, font: f.text, size: fitSize(issued, f.text, 7.6, W - 2 * M, 6), color: C.inkSoft, align: 'center' })
  footer(p2, f)

  return doc.save()
}

/* A handwritten signature image, only when SIGNATURE_STORAGE_PATH is set; otherwise null and the name is typeset. */
let signatureCache = null
async function loadSignature(supabase) {
  if (!process.env.SIGNATURE_STORAGE_PATH) return null
  if (signatureCache) return signatureCache
  const [bucket, ...rest] = String(process.env.SIGNATURE_STORAGE_PATH).split('/')
  try {
    const { data, error } = await supabase.storage.from(bucket).download(rest.join('/'))
    if (error || !data) throw error || new Error('empty file')
    signatureCache = Buffer.from(await data.arrayBuffer())
  } catch (err) {
    console.warn('[warranty-pdf] signature not loaded, using the typeset name:', err?.message || err)
  }
  return signatureCache
}

module.exports = { buildWarrantyPdf, loadSignature, warrantyFilename }
