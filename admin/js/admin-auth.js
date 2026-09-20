/*
 * Signature Pianos — Admin auth gate
 * ----------------------------------
 * Included on every admin page EXCEPT index.html (the login page also
 * loads it because it needs `adminSupabase` for the sign-in call, but
 * does NOT auto-run the gate — see below).
 *
 * Requires /js/config.js to have loaded first (provides _supabase plus
 * the SUPABASE_URL / SUPABASE_ANON_KEY consts). We reuse the same
 * client so the session lives in one place.
 */

// Reuse the shared Supabase client from /js/config.js. Aliased so admin
// code can read as a discrete "adminSupabase" without spinning up a
// second auth state.
const adminSupabase = _supabase

// Always send people to the login page by absolute path. On
// admin.signaturepianos.com.au a relative 'index.html' resolves to the
// public homepage (Vercel serves real root files before rewrites).
const ADMIN_LOGIN = '/admin/index.html'
function goToAdminLogin(keepPlace) {
  const here = window.location.pathname + window.location.search
  const url = keepPlace && here.startsWith('/admin/') && !here.startsWith(ADMIN_LOGIN)
    ? `${ADMIN_LOGIN}?redirect=${encodeURIComponent(here)}`
    : ADMIN_LOGIN
  window.location.replace(url)
}

// Every same-origin /api/ call from an admin page carries the admin's
// Supabase access token, so the API routes can check who is calling.
;(function attachAdminTokenToApiCalls() {
  const nativeFetch = window.fetch.bind(window)
  window.fetch = async function (input, init) {
    try {
      const raw = typeof input === 'string' ? input : (input && input.url) || ''
      const url = new URL(raw, window.location.href)
      if (url.origin === window.location.origin && url.pathname.startsWith('/api/')) {
        const headers = new Headers((init && init.headers) || (typeof input !== 'string' && input && input.headers) || undefined)
        if (!headers.has('Authorization')) {
          const { data: { session } } = await adminSupabase.auth.getSession()
          if (session) headers.set('Authorization', `Bearer ${session.access_token}`)
        }
        init = { ...(init || {}), headers }
      }
    } catch (_) { /* fall through to a plain fetch */ }
    return nativeFetch(input, init)
  }
})()

async function checkAdminAuth() {
  try {
    const { data: { session } } = await adminSupabase.auth.getSession()

    if (!session) {
      goToAdminLogin(true)
      return null
    }

    // Verify the signed-in user is in admin_users and active.
    const { data: adminUser, error } = await adminSupabase
      .from('admin_users')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('active', true)
      .single()

    if (error || !adminUser) {
      console.error('[admin] auth check failed', error)
      await adminSupabase.auth.signOut()
      goToAdminLogin(false)
      return null
    }

    // Surface the display name in any topbar that uses [data-admin-name].
    document.querySelectorAll('[data-admin-name]').forEach(el => {
      el.textContent = `${adminUser.first_name} ${adminUser.last_name}`
    })

    return adminUser
  } catch (err) {
    console.error('[admin] auth gate threw', err)
    goToAdminLogin(true)
    return null
  }
}

async function adminSignOut() {
  await adminSupabase.auth.signOut()
  goToAdminLogin(false)
}

// Auto-run the gate on every page that loads this script EXCEPT the
// login page itself (index.html). The login page bootstraps from the
// same adminSupabase client but doesn't redirect-on-missing-session.
const _currentAdminPage = window.location.pathname.split('/').pop()
if (_currentAdminPage && _currentAdminPage !== 'index.html' && _currentAdminPage !== '') {
  checkAdminAuth()
}
