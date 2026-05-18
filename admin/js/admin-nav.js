/*
 * Signature Pianos — Admin shared UI helpers
 * ------------------------------------------
 * Sets the active sidebar nav item, loads the enquiries badge count,
 * wires the mobile hamburger, and exposes a handful of small format
 * helpers (timeAgo, fmtDate, fmtMoney, esc, statusPillClass) that
 * every page renders with.
 */

/* ---------- Sidebar active-state + mobile burger ---------- */
(function () {
  const file = window.location.pathname.split('/').pop().replace('.html', '')
  document.querySelectorAll('.admin-nav-item').forEach(item => {
    if (item.dataset.page === file) item.classList.add('active')
  })

  // Hamburger button toggles the sidebar on mobile.
  const burger = document.querySelector('.admin-burger')
  const sidebar = document.querySelector('.admin-sidebar')
  if (burger && sidebar) {
    burger.addEventListener('click', (e) => {
      e.stopPropagation()
      sidebar.classList.toggle('is-open')
    })
    document.addEventListener('click', (e) => {
      if (sidebar.classList.contains('is-open') && !sidebar.contains(e.target)) {
        sidebar.classList.remove('is-open')
      }
    })
  }
})()

/* ---------- Pending-enquiries badge ---------- */
async function loadEnquiriesBadge() {
  const badge = document.getElementById('enquiriesBadge')
  if (!badge) return
  try {
    const [{ count: vCount }, { count: sCount }] = await Promise.all([
      adminSupabase.from('viewing_bookings').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      adminSupabase.from('service_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending')
    ])
    const total = (vCount || 0) + (sCount || 0)
    if (total > 0) {
      badge.textContent = total
      badge.style.display = 'inline-block'
    }
  } catch (err) {
    console.error('[admin] badge load failed', err)
  }
}
// The login page loads this script too but has no admin_users JWT yet,
// so skip the badge fetch there.
if (typeof adminSupabase !== 'undefined' &&
    window.location.pathname.split('/').pop() !== 'index.html') {
  loadEnquiriesBadge()
}

/* ---------- Format helpers ---------- */
function esc(s) {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function fmtDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtMoney(n) {
  if (n == null || n === '') return '$0'
  return '$' + Number(n).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function timeAgo(s) {
  if (!s) return '—'
  const ms = Date.now() - new Date(s).getTime()
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day === 1) return 'Yesterday'
  if (day < 30) return `${day}d ago`
  return fmtDate(s)
}

/* Map a Supabase enum value to a colour token used by `.pill--<colour>`. */
function statusPillClass(status) {
  const map = {
    pending: 'amber', confirmed: 'green', completed: 'blue', cancelled: 'red',
    available: 'green', reserved: 'amber', sold: 'grey',
    paid: 'green', delivering: 'gold', delivered: 'green', complete: 'green',
    scheduled: 'blue', pickup_pending: 'amber', picked_up: 'amber',
    in_transit: 'gold', failed: 'red',
    active: 'green', paused: 'grey', hidden: 'grey',
    listing_only: 'grey', full_saas: 'gold',
  }
  return `pill pill--${map[status] || 'grey'}`
}

function readablePreferredTime(v) {
  return ({ morning: 'Morning', afternoon: 'Afternoon', late_afternoon: 'Late afternoon' })[v] || (v || '—')
}

function readableHowHeard(v) {
  return ({
    google: 'Google', instagram: 'Instagram', facebook: 'Facebook',
    word_of_mouth: 'Word of mouth', drove_past: 'Drove past', other: 'Other'
  })[v] || (v || '—')
}

function readableEnum(v) {
  if (!v) return '—'
  return String(v).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

/* ---------- Slide-panel open/close ---------- */
function openSlidePanel(panelId) {
  const panel = document.getElementById(panelId)
  const overlay = document.getElementById(panelId + 'Overlay')
  if (panel) panel.classList.add('is-open')
  if (overlay) overlay.classList.add('is-open')
}
function closeSlidePanel(panelId) {
  const panel = document.getElementById(panelId)
  const overlay = document.getElementById(panelId + 'Overlay')
  if (panel) panel.classList.remove('is-open')
  if (overlay) overlay.classList.remove('is-open')
}
