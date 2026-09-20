/*
 * Melbourne calendar dates for api/ code.
 *
 * Vercel runs in UTC, and the crons fire at 22:00/23:00 UTC, which is already
 * the next morning in Melbourne. Anything that means "today", "tomorrow" or
 * "in 3 days" for a customer must be worked out in Australia/Melbourne.
 * All values are plain 'YYYY-MM-DD' strings.
 */

const TZ = 'Australia/Melbourne'

// 'YYYY-MM-DD' for the Melbourne calendar day containing `at` (default now).
function melbourneDate(at = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
}

// 'YYYY-MM-DD' shifted by n calendar days (pure date arithmetic, no timezone).
function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return dt.toISOString().slice(0, 10)
}

module.exports = { TZ, melbourneDate, addDays }
