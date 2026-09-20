/*
 * Shared auth checks for api/ routes.
 *
 * requireAdmin(req)            caller must send `Authorization: Bearer <supabase access token>`
 *                              of an active admin_users row. Admin pages attach it automatically
 *                              (admin/js/admin-auth.js wraps fetch for /api/ calls).
 * isInternal(req)              true when another api/ route calls us server-to-server with
 *                              `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`.
 * requireAdminOrInternal(req)  either of the above.
 *
 * All throw { status, message } on failure; use sendAuthError(res, err) in the catch.
 */

const crypto = require('crypto')
const { createClient } = require('@supabase/supabase-js')

let _client
function supabaseAdmin() {
  if (!_client) {
    _client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })
  }
  return _client
}

function bearer(req) {
  const h = req.headers.authorization || req.headers.Authorization || ''
  return h.startsWith('Bearer ') ? h.slice(7).trim() : ''
}

function isInternal(req) {
  const token = bearer(req)
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!token || !key || token.length !== key.length) return false
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(key))
}

async function requireAdmin(req) {
  const token = bearer(req)
  if (!token) throw { status: 401, message: 'Not signed in' }

  const { data: userData, error: userErr } = await supabaseAdmin().auth.getUser(token)
  if (userErr || !userData?.user) throw { status: 401, message: 'Invalid session' }

  const { data: adminRow, error: rowErr } = await supabaseAdmin()
    .from('admin_users')
    .select('*')
    .eq('user_id', userData.user.id)
    .eq('active', true)
    .single()
  if (rowErr || !adminRow) throw { status: 403, message: 'Not authorised for admin' }

  return adminRow
}

async function requireAdminOrInternal(req) {
  if (isInternal(req)) return { internal: true }
  return requireAdmin(req)
}

// Headers for one api/ route calling another server-side.
function internalHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
  }
}

function sendAuthError(res, err) {
  const status = err && err.status ? err.status : 500
  return res.status(status).json({ error: (err && err.message) || 'Auth check failed' })
}

module.exports = { requireAdmin, requireAdminOrInternal, isInternal, internalHeaders, sendAuthError }
