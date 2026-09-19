/*
 * Signature Pianos — who receives the internal notifications
 * ----------------------------------------------------------
 * Every "heads-up" email to the business (new viewing request, new guide
 * request, sale, delivery, tuner updates…) goes to the business inbox AND to
 * Eric's own Gmail, so nothing waits in an inbox he doesn't check.
 *
 *   internalRecipients()            -> ['info@signaturepianos.com.au', 'kuangeric1234@gmail.com']
 *   internalRecipients(someAddress) -> someAddress plus the same extra recipients
 *
 * Change the list without touching code: set NOTIFY_EMAILS in Vercel to a
 * comma-separated list (it replaces the Gmail default), or OWNER_EMAIL to
 * swap just the Gmail address. BUSINESS_EMAIL stays the primary inbox.
 * Customer-facing emails are not affected.
 */

const BUSINESS_EMAIL = process.env.BUSINESS_EMAIL || 'info@signaturepianos.com.au'
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'kuangeric1234@gmail.com'

function internalRecipients(primary) {
  const extra = (process.env.NOTIFY_EMAILS || OWNER_EMAIL).split(',')
  const all = [primary || BUSINESS_EMAIL, ...extra]
    .map(e => String(e || '').trim())
    .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
  const seen = new Set()
  return all.filter(e => {
    const key = e.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

module.exports = { internalRecipients }
