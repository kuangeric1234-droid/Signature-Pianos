/*
 * Signature Pianos — calendar link helper
 * ---------------------------------------
 * Builds Google Calendar / Outlook / ICS data: URLs for tuning + delivery
 * appointment emails. Originally lived in api/tuner-booking.js; promoted
 * here so api/tuner-log-date.js (and any future email handlers) can
 * reuse it without duplicating the time-window mapping.
 *
 * Vercel bundles `require()` from sibling directories during deploy so
 * a CommonJS export from /lib/ resolves cleanly from any /api/ file.
 *
 * Args:
 *   title          — short event title
 *   description    — multi-line event details (will be %-encoded)
 *   location       — street address (text)
 *   startDate      — 'YYYY-MM-DD'
 *   startTime      — readable window text; mapped to local hour below
 *   durationHours  — integer (default 2)
 *   uid            — stable id for the event, e.g. `tuning-${booking.id}`.
 *                    Two jobs in the same slot used to share a UID (date +
 *                    hour), so importing the second .ics overwrote the first.
 *                    With the booking id, a re-issued .ics for the same job
 *                    updates its event instead.
 *
 * Returns: { googleUrl, outlookUrl, icsDataUrl }
 *
 * Note on time zones: Google + Outlook URL templates use local naive
 * timestamps when no Z suffix is given. Mail clients render the event
 * in the recipient's local zone. Tuners + customers are all Melbourne
 * for now, so AEST/AEDT renders identically in both inboxes.
 */
const crypto = require('crypto')

function generateCalendarLinks({ title, description, location, startDate, startTime, durationHours, uid }) {
  const t = String(startTime || '').toLowerCase()
  let startHour = 9
  if (t.includes('morning'))                              startHour = 9
  else if (t.includes('afternoon') && t.includes('late')) startHour = 16
  else if (t.includes('afternoon'))                       startHour = 13
  else if (t.includes('evening'))                         startHour = 18
  else if (t.includes('flexible'))                        startHour = 10

  const dur = Number(durationHours) > 0 ? Number(durationHours) : 2
  const dateDigits = String(startDate || '').replace(/-/g, '')
  const pad = (n) => String(n).padStart(2, '0')
  const startStamp = `${dateDigits}T${pad(startHour)}0000`
  const endHour    = startHour + dur
  const endStamp   = `${dateDigits}T${pad(endHour)}0000`

  const outlookStart = `${startDate}T${pad(startHour)}:00:00`
  const outlookEnd   = `${startDate}T${pad(endHour)}:00:00`

  const enc = (s) => encodeURIComponent(s || '')

  const googleUrl =
    `https://calendar.google.com/calendar/render?action=TEMPLATE` +
    `&text=${enc(title)}` +
    `&dates=${startStamp}/${endStamp}` +
    `&details=${enc(description)}` +
    `&location=${enc(location)}`

  const outlookUrl =
    `https://outlook.office.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent` +
    `&subject=${enc(title)}` +
    `&body=${enc(description)}` +
    `&startdt=${enc(outlookStart)}` +
    `&enddt=${enc(outlookEnd)}` +
    `&location=${enc(location)}`

  // RFC 5545 TEXT: escape backslash, semicolon, comma; newlines as \n.
  const icsText = (s) => String(s || '')
    .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
  const uidBase = uid
    ? String(uid).replace(/[^A-Za-z0-9._-]/g, '')
    : `${dateDigits}T${pad(startHour)}0000-${crypto.randomBytes(6).toString('hex')}`
  // DTSTAMP is when this .ics was made, in UTC.
  const dtstamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Signature Pianos//Tuning Booking//EN',
    'BEGIN:VEVENT',
    `UID:${uidBase}@signaturepianos.com.au`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${startStamp}`,
    `DTEND:${endStamp}`,
    `SUMMARY:${icsText(title)}`,
    `DESCRIPTION:${icsText(description)}`,
    `LOCATION:${icsText(location)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  const icsDataUrl = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(icsLines.join('\r\n'))

  return { googleUrl, outlookUrl, icsDataUrl }
}

module.exports = { generateCalendarLinks }
