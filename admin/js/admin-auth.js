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

async function checkAdminAuth() {
  try {
    const { data: { session } } = await adminSupabase.auth.getSession()

    if (!session) {
      window.location.replace('index.html')
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
      window.location.replace('index.html')
      return null
    }

    // Surface the display name in any topbar that uses [data-admin-name].
    document.querySelectorAll('[data-admin-name]').forEach(el => {
      el.textContent = `${adminUser.first_name} ${adminUser.last_name}`
    })

    return adminUser
  } catch (err) {
    console.error('[admin] auth gate threw', err)
    window.location.replace('index.html')
    return null
  }
}

async function adminSignOut() {
  await adminSupabase.auth.signOut()
  window.location.replace('index.html')
}

// Auto-run the gate on every page that loads this script EXCEPT the
// login page itself (index.html). The login page bootstraps from the
// same adminSupabase client but doesn't redirect-on-missing-session.
const _currentAdminPage = window.location.pathname.split('/').pop()
if (_currentAdminPage && _currentAdminPage !== 'index.html' && _currentAdminPage !== '') {
  checkAdminAuth()
}
