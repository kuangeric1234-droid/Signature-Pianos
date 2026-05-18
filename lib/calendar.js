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
 *
 * Returns: { googleUrl, outlookUrl, icsDataUrl }
 *
 * Note on time zones: Google + Outlook URL templates use local naive
 * timestamps when no Z suffix is given. Mail clients render the event
 * in the recipient's local zone. Tuners + customers are all Melbourne
 * for now, so AEST/AEDT renders identically in both inboxes.
 */
function generateCalendarLinks({ title, description, location, startDate, startTime, durationHours }) {
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

  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Signature Pianos//Tuning Booking//EN',
    'BEGIN:VEVENT',
    `UID:${dateDigits}T${pad(startHour)}0000@signaturepianos.com.au`,
    `DTSTAMP:${dateDigits}T${pad(startHour)}0000`,
    `DTSTART:${startStamp}`,
    `DTEND:${endStamp}`,
    `SUMMARY:${(title || '').replace(/\n/g, '\\n')}`,
    `DESCRIPTION:${(description || '').replace(/\n/g, '\\n')}`,
    `LOCATION:${(location || '').replace(/\n/g, '\\n')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  const icsDataUrl = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(icsLines.join('\r\n'))

  return { googleUrl, outlookUrl, icsDataUrl }
}

module.exports = { generateCalendarLinks }
