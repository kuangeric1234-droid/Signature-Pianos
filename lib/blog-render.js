/*
 * Signature Pianos — public blog ("The Journal") HTML rendering
 * -------------------------------------------------------------
 * Pure functions, no database access. api/blog.js and api/blog-post.js load
 * rows from Supabase and hand them to renderIndex() / renderPost(), so the
 * pages can also be rendered offline for previews.
 *
 * Styled to the brand (brand/BRAND-GUIDELINES.md): Key Ivory ground, Ink
 * text, condensed display capitals with one Italianno crossing word, Jost
 * for reading, square corners. The topbar, header, footer and mobile bottom
 * bar are the same markup as the static pages (about.html), and the shared
 * /css/signature-theme.css, /js/signature-nav.js and /js/signature-book.js
 * are loaded exactly as they are there.
 */

const SITE_URL = process.env.SITE_URL || 'https://signaturepianos.com.au'
const DEFAULT_AUTHOR = 'Eric Kuang'
const FONTS_URL = 'https://fonts.googleapis.com/css2?family=Italianno&family=Jost:wght@300..500&family=Noto+Serif+Display:wdth,wght@62.5,400..500&display=swap'
const MONOGRAM = '/media/brand/monogram-ink.svg'
const BOOK_URL = '/services/book-a-viewing.html'

function esc(s) {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// "19 September 2026", in Melbourne time so late-evening posts keep their date.
function fmtDate(s) {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d)) return ''
  return d.toLocaleDateString('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Melbourne',
  })
}

function isoDate(s) {
  const d = new Date(s)
  return s && !isNaN(d) ? d.toISOString() : ''
}

// Escape '<' so a string in the data can't break out of the <script> tag.
function jsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c')
}

// The column default is 'Signature Pianos', so treat that (or empty) as unset.
function authorName(post) {
  const a = String((post && post.author) || '').trim()
  return !a || a === 'Signature Pianos' ? DEFAULT_AUTHOR : a
}

function absUrl(u) {
  if (!u) return ''
  if (/^https?:\/\//i.test(u)) return u
  return u.startsWith('/') ? SITE_URL + u : ''
}

const postPath = (p) => `/blog/${encodeURIComponent(p.slug)}`
const tagPath = (t) => `/blog?tag=${encodeURIComponent(t)}`

// Editor notes (<!-- VERIFY: ... -->) stay in the admin, never in public source.
function stripComments(html) {
  return String(html || '').replace(/<!--[\s\S]*?-->/g, '')
}

function wordCount(html) {
  const text = String(html || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ')
  return (text.match(/\S+/g) || []).length
}

function readingMinutes(html) {
  return Math.max(1, Math.round(wordCount(html) / 230))
}

/* ==========================================================================
   Styles. The nav rules are the static pages' own (about.html); the theme
   loads after this block and restyles them, exactly as it does there.
   ========================================================================== */
const CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  html, body {
    margin: 0;
    padding: 0;
    background: var(--bg-1);
    color: var(--text-1);
    font-family: var(--font-body);
    line-height: 1.7;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
    overflow-x: hidden;
  }
  a { color: inherit; text-decoration: none; }
  button { font-family: inherit; }
  img { max-width: 100%; height: auto; }

  /* ============ NAV (as on the static pages, scoped to the header) ============ */
  nav#nav {
    position: fixed;
    inset: 0 0 auto 0;
    z-index: 100;
    padding: 18px 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 32px;
    -webkit-backdrop-filter: blur(12px);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border);
  }
  .logo { flex-shrink: 0; }
  .nav-links { display: flex; align-items: center; gap: 32px; }
  .nav-link-plain {
    font-family: var(--font-body);
    font-size: 12px;
    font-weight: 400;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-2);
    background: transparent;
    border: 0;
    padding: 0;
    cursor: pointer;
  }
  .nav-link-plain.is-active { color: var(--text-1); opacity: 1 !important; }
  .nav-item--dropdown { position: relative; }
  .nav-link-trigger {
    font-family: var(--font-body);
    font-size: 12px;
    font-weight: 400;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-2);
    background: transparent;
    border: 0;
    padding: 6px 0;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .nav-chevron { font-size: 14px; transition: transform 0.4s var(--ease); }
  .nav-item--open .nav-chevron { transform: rotate(180deg); }
  .nav-dropdown {
    position: absolute;
    top: calc(100% + 14px);
    left: 50%;
    transform: translateX(-50%) translateY(-6px);
    padding: 18px;
    display: grid;
    gap: 4px;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition: opacity 0.4s linear, transform 0.4s var(--ease), visibility 0.4s linear;
    z-index: 110;
  }
  .nav-item--open .nav-dropdown {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
    transform: translateX(-50%) translateY(0);
  }
  .nav-dropdown::before { content: ''; position: absolute; top: -14px; left: 0; right: 0; height: 14px; }
  .nav-dropdown--pianos { grid-template-columns: repeat(2, minmax(220px, 1fr)); width: clamp(520px, 38vw, 620px); gap: 6px 12px; }
  .nav-dropdown--services { grid-template-columns: repeat(3, minmax(180px, 1fr)); width: clamp(620px, 44vw, 720px); gap: 6px 8px; }
  .nav-dropdown--teachers { grid-template-columns: 1fr; width: clamp(540px, 40vw, 640px); gap: 0; padding: 14px; }
  .nav-dd-section { padding: 8px 4px; }
  .nav-dd-section + .nav-dd-section { border-top: 1px solid var(--border); margin-top: 6px; padding-top: 16px; }
  .nav-dd-section-label { font-size: 10px; letter-spacing: 0.28em; text-transform: uppercase; color: var(--text-3); margin: 2px 14px 12px; }
  .nav-dd-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
  .nav-dd-item { display: flex; gap: 14px; align-items: flex-start; padding: 14px; color: inherit; transition: background 0.4s linear; }
  .nav-dd-icon { font-size: 20px; margin-top: 2px; flex-shrink: 0; }
  .nav-dd-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .nav-dd-text h4 { font-size: 14px; margin: 0; letter-spacing: 0; line-height: 1.3; }
  .nav-dd-text p { font-size: 12px; margin: 0; line-height: 1.4; }
  .nav-ctas { display: flex; align-items: center; gap: 14px; flex-shrink: 0; }
  .nav-account-trigger {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    border: 1px solid var(--border);
    background: transparent;
    font-size: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
  }
  .nav-dropdown--account { grid-template-columns: 1fr; width: clamp(320px, 26vw, 420px); left: auto; right: 0; transform: translateY(-6px); gap: 2px; }
  .nav-item--open .nav-dropdown--account { transform: translateY(0); }
  .nav-cta { cursor: pointer; }
  .nav-burger { display: none; background: none; border: 0; color: var(--text-1); font-size: 24px; cursor: pointer; }

  /* ============ JOURNAL ============ */
  .bl-skip {
    position: absolute; left: 16px; top: -60px; z-index: 200;
    padding: 12px 18px; background: var(--sp-ink); color: #FFFFFF;
    font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase;
  }
  .bl-skip:focus { top: 16px; }

  .bl-main { padding-top: calc(var(--topbar-h) + 132px); }
  .bl-wrap { max-width: 1240px; margin: 0 auto; padding: 0 clamp(20px, 4vw, 48px); }

  /* Type roles */
  .bl-heading { margin: 0; text-align: center; font-weight: 500; color: var(--sp-ink); }
  .bl-heading .sp-display { font-size: clamp(56px, 8.4vw, 150px); }
  .bl-heading .sp-script { font-size: clamp(64px, 8vw, 138px); }
  .bl-heading--sm .sp-display { font-size: clamp(48px, 6vw, 104px); }
  .bl-heading--sm .sp-script { font-size: clamp(56px, 6.4vw, 112px); }
  .bl-lead { margin: 0; font-size: clamp(17px, 1.35vw, 21px); line-height: 1.65; color: var(--sp-ink-soft); }
  .bl-meta {
    margin: 0;
    font-size: 12px;
    font-weight: 400;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--sp-ink-soft);
  }
  .bl-meta .bl-dot { margin: 0 8px; opacity: 0.5; }
  .bl-meta a { transition: color 0.4s linear; }
  .bl-meta a:hover { color: var(--sp-ink); }
  .bl-section-title {
    margin: 0 0 28px;
    font-weight: 500;
    font-size: clamp(34px, 3.4vw, 48px);
    line-height: 0.95;
    color: var(--sp-ink);
  }
  .bl-label-title {
    margin: 0 0 32px;
    padding-bottom: 18px;
    border-bottom: 1px solid var(--sp-rule);
    font-family: var(--sp-font-text);
    font-stretch: normal;
    font-variation-settings: normal;
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.3em;
    line-height: 1.4;
    color: var(--sp-ink-soft);
  }

  /* The one filled button, and the text link with a hairline that draws in */
  .bl-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 18px 32px 16px;
    font-family: var(--sp-font-text);
    font-size: 12.5px;
    font-weight: 500;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    background: var(--sp-ink);
    color: #FFFFFF;
    border: 1px solid var(--sp-ink);
    transition: background 0.4s linear, color 0.4s linear;
  }
  .bl-button:hover { background: transparent; color: var(--sp-ink); }
  .bl-link {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    font-family: var(--sp-font-text);
    font-size: 12.5px;
    font-weight: 500;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--sp-ink);
    background: linear-gradient(currentColor, currentColor) 0 calc(100% - 2px) / 0 1px no-repeat;
    transition: background-size 0.6s var(--ease);
  }
  .bl-link i { font-size: 16px; transition: transform 0.6s var(--ease); }
  .bl-link:hover { background-size: 100% 1px; }
  .bl-link:hover i { transform: translateX(6px); }
  .bl-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 18px 32px; }

  /* Image frames: the photo, or Ivory Deep with the monogram */
  .bl-media { display: block; position: relative; overflow: hidden; aspect-ratio: 4 / 3; background: var(--sp-ivory-deep); }
  .bl-media img.bl-photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transition: transform 1.2s var(--ease); }
  .bl-ph { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
  .bl-ph img { width: clamp(40px, 16%, 76px); height: auto; opacity: 0.85; }

  /* ---------- Index ---------- */
  .bl-hero { text-align: center; padding-bottom: clamp(40px, 5vw, 64px); }
  .bl-hero .bl-lead { max-width: 52ch; margin: 30px auto 0; }
  .bl-tags {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px 28px;
    margin: 34px 0 0;
    padding: 0;
    list-style: none;
  }
  .bl-tags a {
    display: inline-block;
    padding: 8px 0;
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--sp-ink-soft);
    background: linear-gradient(currentColor, currentColor) 0 calc(100% - 2px) / 0 1px no-repeat;
    transition: color 0.4s linear, background-size 0.6s var(--ease);
  }
  .bl-tags a:hover, .bl-tags a[aria-current] { color: var(--sp-ink); background-size: 100% 1px; }

  .bl-feature {
    display: grid;
    grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
    gap: clamp(32px, 5vw, 72px);
    align-items: center;
    padding: clamp(40px, 5vw, 64px) 0;
    border-top: 1px solid var(--sp-rule);
  }
  .bl-feature .bl-media { aspect-ratio: 3 / 2; }
  .bl-feature .bl-ph img { width: clamp(56px, 12%, 96px); }
  .bl-feature:hover .bl-photo { transform: scale(1.03); }
  .bl-feature-title { margin: 18px 0 18px; font-weight: 500; font-size: clamp(38px, 3.8vw, 64px); line-height: 0.92; }
  .bl-feature-title a { transition: color 0.4s linear; }
  .bl-feature-title a:hover { color: var(--sp-ink-soft); }
  .bl-feature-excerpt { margin: 0 0 26px; max-width: 44ch; font-size: 17px; line-height: 1.7; color: var(--sp-ink-soft); }

  .bl-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 64px clamp(24px, 3vw, 44px); }
  .bl-card { display: flex; flex-direction: column; min-width: 0; }
  .bl-card:hover .bl-photo { transform: scale(1.04); }
  .bl-card-body { flex: 1; display: flex; flex-direction: column; margin-top: 22px; padding-top: 20px; border-top: 1px solid var(--sp-rule); }
  .bl-card-title { margin: 0 0 12px; font-size: 30px; line-height: 1; overflow-wrap: anywhere; }
  .bl-card-title a { transition: color 0.4s linear; }
  .bl-card-title a:hover { color: var(--sp-ink-soft); }
  .bl-card-excerpt {
    margin: 14px 0 12px;
    font-size: 15.5px;
    line-height: 1.65;
    color: var(--sp-ink-soft);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .bl-card .bl-link { margin-top: auto; align-self: flex-start; }
  .bl-grid-section { padding: clamp(48px, 6vw, 88px) 0 clamp(72px, 9vw, 120px); }
  .bl-filter-note { text-align: center; margin: -8px 0 40px; }

  .bl-empty {
    max-width: 640px;
    margin: 0 auto;
    padding: clamp(48px, 6vw, 72px) 0 clamp(56px, 7vw, 96px);
    border-top: 1px solid var(--sp-rule);
    text-align: center;
  }
  .bl-empty-mark { width: 54px; height: auto; margin: 0 auto 28px; display: block; }
  .bl-empty .bl-section-title { margin-bottom: 22px; }
  .bl-empty p { margin: 0 auto 16px; max-width: 48ch; font-size: 17px; line-height: 1.7; color: var(--sp-ink-soft); }
  .bl-empty .bl-actions { margin-top: 34px; }

  /* ---------- Visit band (Mist Light, one crossing heading) ---------- */
  .bl-visit { background: var(--sp-mist-light); padding: clamp(80px, 10vw, 136px) 0; text-align: center; }
  .bl-visit p.bl-lead { max-width: 46ch; margin: 30px auto 36px; color: var(--sp-ink-soft); }
  .bl-visit .bl-meta { margin-top: 40px; }
  .bl-promises { display: flex; flex-wrap: wrap; justify-content: center; row-gap: 6px; }

  /* ---------- Article ---------- */
  .bl-main--article { padding-top: calc(var(--topbar-h) + 118px); }
  .bl-crumbs ol {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 4px 0;
    margin: 0 auto;
    padding: 0;
    list-style: none;
    font-size: 13px;
    letter-spacing: 0.04em;
    color: var(--sp-ink-soft);
  }
  .bl-crumbs li { min-width: 0; }
  .bl-crumbs li + li::before { content: '/'; margin: 0 10px; opacity: 0.5; }
  .bl-crumbs a { text-decoration: underline; text-decoration-color: transparent; text-underline-offset: 4px; transition: text-decoration-color 0.4s linear, color 0.4s linear; }
  .bl-crumbs a:hover { color: var(--sp-ink); text-decoration-color: currentColor; }
  .bl-crumbs [aria-current] { color: var(--sp-ink); }

  .bl-article-head { max-width: 1040px; margin: 0 auto; padding: clamp(36px, 4vw, 56px) 0 0; text-align: center; }
  .bl-title { margin: 20px 0 0; font-weight: 500; font-size: clamp(44px, 6vw, 96px); line-height: 0.9; color: var(--sp-ink); overflow-wrap: break-word; }
  .bl-article-head .bl-lead { max-width: 50ch; margin: 30px auto 0; }
  .bl-byline { margin: 36px 0 0; display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .bl-byline::before { content: ''; width: 32px; height: 2px; margin-bottom: 14px; background: var(--sp-felt); }
  .bl-byline-name { font-size: 15px; font-weight: 500; letter-spacing: 0.04em; color: var(--sp-ink); }

  .bl-hero-figure { max-width: 1160px; margin: clamp(40px, 5vw, 64px) auto 0; }
  .bl-hero-figure .bl-media { aspect-ratio: 16 / 9; }

  .bl-column { max-width: 62ch; margin: 0 auto; }
  .bl-prose { padding-top: clamp(44px, 5vw, 72px); font-size: 17px; line-height: 1.7; color: var(--sp-ink-soft); overflow-wrap: break-word; }
  .bl-prose > :first-child { margin-top: 0; }
  .bl-prose > p:first-child { font-size: clamp(18px, 1.4vw, 20px); line-height: 1.65; color: var(--sp-ink); }
  .bl-prose p { margin: 0 0 1.15em; }
  .bl-prose h2 { margin: 1.7em 0 0.5em; font-weight: 500; font-size: clamp(34px, 3.4vw, 46px); line-height: 0.95; color: var(--sp-ink); }
  .bl-prose h3 { margin: 1.6em 0 0.45em; font-size: 26px; line-height: 1; color: var(--sp-ink); }
  .bl-prose h4 { margin: 1.4em 0 0.4em; font-size: 17px; color: var(--sp-ink); }
  .bl-prose ul, .bl-prose ol { margin: 0 0 1.3em; padding-left: 1.3em; }
  .bl-prose ul { list-style: square; }
  .bl-prose li { margin: 0.5em 0; padding-left: 0.3em; }
  .bl-prose li::marker { color: var(--sp-ink); }
  .bl-prose ol li::marker { font-weight: 500; }
  .bl-prose strong, .bl-prose b { font-weight: 500; color: var(--sp-ink); }
  .bl-prose a {
    color: var(--sp-ink);
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-decoration-color: rgba(22, 34, 46, 0.35);
    text-underline-offset: 4px;
    transition: text-decoration-color 0.4s linear;
  }
  .bl-prose a:hover { text-decoration-color: currentColor; }
  .bl-prose blockquote {
    margin: 1.8em 0;
    padding: 4px 0 4px 26px;
    border-left: 2px solid var(--sp-felt);
    font-size: 19px;
    line-height: 1.6;
    color: var(--sp-ink);
  }
  .bl-prose blockquote p:last-child { margin-bottom: 0; }
  .bl-prose figure { margin: 2em 0; }
  .bl-prose figure img { display: block; width: 100%; }
  .bl-prose figcaption { margin-top: 10px; font-size: 13.5px; line-height: 1.5; color: var(--sp-ink-soft); }
  .bl-prose hr { border: 0; border-top: 1px solid var(--sp-rule); margin: 2.6em 0; }
  .bl-table { margin: 1.8em 0; overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .bl-prose table { width: 100%; border-collapse: collapse; font-size: 15px; line-height: 1.5; }
  .bl-prose th {
    padding: 10px 18px 10px 0;
    border-bottom: 1px solid var(--sp-ink);
    text-align: left;
    vertical-align: bottom;
    font-size: 11.5px;
    font-weight: 500;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--sp-ink);
  }
  .bl-prose td { padding: 12px 18px 12px 0; border-bottom: 1px solid var(--sp-rule); vertical-align: top; }
  .bl-prose td:first-child { color: var(--sp-ink); font-weight: 500; }

  .bl-inline-cta { margin: 2.4em 0; padding: 30px 32px 24px; background: var(--sp-mist-light); }
  .bl-inline-cta .bl-meta { margin-bottom: 10px; }
  .bl-prose .bl-inline-cta p { margin: 0 0 12px; color: var(--sp-ink); }
  .bl-prose .bl-inline-cta a.bl-link { text-decoration: none; }

  .bl-faq { margin-top: clamp(56px, 6vw, 88px); }
  .bl-faq details { border-top: 1px solid var(--sp-rule); }
  .bl-faq details:last-child { border-bottom: 1px solid var(--sp-rule); }
  .bl-faq summary {
    position: relative;
    display: block;
    padding: 20px 44px 20px 0;
    list-style: none;
    cursor: pointer;
    font-size: 17px;
    font-weight: 500;
    line-height: 1.45;
    color: var(--sp-ink);
  }
  .bl-faq summary::-webkit-details-marker { display: none; }
  .bl-faq summary::before,
  .bl-faq summary::after {
    content: '';
    position: absolute;
    right: 6px;
    top: 50%;
    width: 15px;
    height: 1px;
    background: var(--sp-ink);
    transition: transform 0.6s var(--ease);
  }
  .bl-faq summary::before { transform: rotate(90deg); }
  .bl-faq details[open] summary::before { transform: rotate(0deg); }
  .bl-faq-a { padding: 0 0 20px; }
  .bl-faq-a p { margin: 0; font-size: 16.5px; line-height: 1.7; color: var(--sp-ink-soft); }

  .bl-filed { margin-top: 48px; display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px; }
  .bl-filed .bl-meta { margin-right: 6px; }
  .bl-chip {
    display: inline-block;
    padding: 8px 14px 7px;
    border: 1px solid rgba(22, 34, 46, 0.3);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--sp-ink);
    transition: background 0.4s linear, color 0.4s linear, border-color 0.4s linear;
  }
  .bl-chip:hover { background: var(--sp-ink); border-color: var(--sp-ink); color: #FFFFFF; }

  .bl-author {
    display: flex;
    gap: 22px;
    align-items: flex-start;
    margin: 48px 0 clamp(72px, 9vw, 120px);
    padding-top: 32px;
    border-top: 1px solid var(--sp-rule);
  }
  .bl-author img { flex: none; width: 46px; height: auto; margin-top: 4px; }
  .bl-author-name { margin: 0 0 6px; font-size: 15px; font-weight: 500; letter-spacing: 0.04em; color: var(--sp-ink); }
  .bl-author p { margin: 0; font-size: 15.5px; line-height: 1.7; color: var(--sp-ink-soft); }
  .bl-author a { color: var(--sp-ink); text-decoration: underline; text-decoration-color: rgba(22, 34, 46, 0.35); text-underline-offset: 4px; }

  .bl-related { padding: clamp(72px, 9vw, 120px) 0; }
  .bl-related-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 12px 32px; margin-bottom: 40px; }
  .bl-related-head .bl-section-title { margin: 0; }

  /* ---------- Not found ---------- */
  .bl-missing { max-width: 640px; margin: 0 auto; padding: 24px 0 clamp(96px, 12vw, 160px); text-align: center; }
  .bl-missing p { margin: 28px auto 34px; max-width: 44ch; font-size: 17px; line-height: 1.7; color: var(--sp-ink-soft); }

  @media (max-width: 1024px) {
    .bl-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 960px) {
    nav#nav { padding: 14px 22px; }
    .nav-links, .nav-ctas { display: none; }
    .nav-burger { display: inline-flex; }
    .bl-main { padding-top: 104px; }
    .bl-main--article { padding-top: 96px; }
  }
  @media (max-width: 860px) {
    .bl-feature { grid-template-columns: 1fr; }
  }
  @media (max-width: 640px) {
    .bl-grid { grid-template-columns: 1fr; gap: 56px; }
    .bl-heading .sp-display { font-size: 15vw; }
    .bl-heading .sp-script { font-size: 14vw; }
    .bl-heading--sm .sp-display { font-size: 13vw; }
    .bl-heading--sm .sp-script { font-size: 16vw; }
    .bl-card-title { font-size: 28px; }
    .bl-promises { flex-direction: column; align-items: center; }
    .bl-promises .bl-dot { display: none; }
    .bl-inline-cta { padding: 24px 22px 18px; }
    .bl-actions .bl-button { width: 100%; }
    .bl-crumbs li[aria-current] { display: none; }
    .bl-crumbs li:nth-last-child(2)::after { content: ''; }
  }
  @media (prefers-reduced-motion: reduce) {
    html { scroll-behavior: auto; }
    .bl-media img.bl-photo, .bl-link, .bl-link i, .bl-button, .bl-chip, .bl-tags a,
    .bl-faq summary::before, .bl-faq summary::after, .nav-dropdown, .nav-chevron { transition: none; }
    .bl-card:hover .bl-photo, .bl-feature:hover .bl-photo { transform: none; }
  }
`

/* ==========================================================================
   Site chrome: the same topbar, header, footer and bottom bar as about.html.
   Links are root-relative because the journal lives under /blog/.
   ========================================================================== */
const TOPBAR = `
<div class="sp-topbar" role="region" aria-label="Contact details">
  <span>Pianos imported direct from Japan</span>
  <a href="https://www.google.com/maps/dir/?api=1&amp;destination=63+Blackburn+Road+Mount+Waverley+VIC+3149" target="_blank" rel="noopener">63 Blackburn Road, Mount Waverley</a>
  <a class="sp-topbar-phone" href="tel:+61479128955">0479 128 955</a>
</div>`

const NAV = `
<nav id="nav">
  <a href="/" class="logo" aria-label="Signature Pianos home">Signature <span>Pianos</span></a>
  <div class="nav-links">

    <div class="nav-item nav-item--dropdown">
      <button class="nav-link-trigger" type="button" aria-expanded="false" aria-haspopup="true">
        Pianos <i class="ti ti-chevron-down nav-chevron"></i>
      </button>
      <div class="nav-dropdown nav-dropdown--pianos" role="menu">
        <a href="/instruments/index.html?cat=upright" class="nav-dd-item">
          <i class="ti ti-bookmark nav-dd-icon"></i>
          <div class="nav-dd-text"><h4>Used Japanese uprights</h4><p>Hand-selected, imported direct from Japan</p></div>
        </a>
        <a href="/instruments/index.html?cat=grand" class="nav-dd-item">
          <i class="ti ti-crown nav-dd-icon"></i>
          <div class="nav-dd-text"><h4>Used Japanese grands</h4><p>Concert &amp; baby grands, fully restored</p></div>
        </a>
        <a href="/instruments/index.html?cat=digital" class="nav-dd-item">
          <i class="ti ti-music nav-dd-icon"></i>
          <div class="nav-dd-text"><h4>Digital pianos</h4><p>Modern instruments for any space</p></div>
        </a>
        <a href="/instruments/index.html?cat=books" class="nav-dd-item">
          <i class="ti ti-book nav-dd-icon"></i>
          <div class="nav-dd-text"><h4>Sheet music &amp; books</h4><p>For students and teachers alike</p></div>
        </a>
        <a href="/serial-number-lookup.html" class="nav-dd-item nav-dd-item--wide">
          <i class="ti ti-calendar-search nav-dd-icon"></i>
          <div class="nav-dd-text"><h4>How old is my piano?</h4><p>Look up a Yamaha or Kawai serial number</p></div>
        </a>
      </div>
    </div>

    <div class="nav-item nav-item--dropdown">
      <button class="nav-link-trigger" type="button" aria-expanded="false" aria-haspopup="true">
        Services <i class="ti ti-chevron-down nav-chevron"></i>
      </button>
      <div class="nav-dropdown nav-dropdown--services" role="menu">
        <a href="/services/delivery-warranty.html" class="nav-dd-item">
          <i class="ti ti-truck-delivery nav-dd-icon"></i>
          <div class="nav-dd-text"><h4>Delivery &amp; warranty</h4><p>White glove delivery, tracked end to end</p></div>
        </a>
        <a href="/services/book-a-viewing.html" class="nav-dd-item">
          <i class="ti ti-calendar-event nav-dd-icon"></i>
          <div class="nav-dd-text"><h4>Book a viewing</h4><p>Visit our showroom, try before you buy</p></div>
        </a>
        <a href="/services/tuning-servicing.html" class="nav-dd-item">
          <i class="ti ti-tool nav-dd-icon"></i>
          <div class="nav-dd-text"><h4>Tuning &amp; servicing</h4><p>Keep your piano in perfect condition</p></div>
        </a>
      </div>
    </div>

    <div class="nav-item nav-item--dropdown">
      <button class="nav-link-trigger" type="button" aria-expanded="false" aria-haspopup="true">
        Teachers <i class="ti ti-chevron-down nav-chevron"></i>
      </button>
      <div class="nav-dropdown nav-dropdown--teachers" role="menu">
        <div class="nav-dd-section">
          <div class="nav-dd-section-label">For students</div>
          <div class="nav-dd-grid">
            <a href="/teachers.html" class="nav-dd-item">
              <i class="ti ti-search nav-dd-icon"></i>
              <div class="nav-dd-text"><h4>Find a teacher</h4><p>Browse local piano teachers by suburb</p></div>
            </a>
            <a href="/teachers.html?nearby=1" class="nav-dd-item">
              <i class="ti ti-map-pin nav-dd-icon"></i>
              <div class="nav-dd-text"><h4>Teachers near me</h4><p>Use your location to find teachers close by</p></div>
            </a>
          </div>
        </div>
        <div class="nav-dd-section">
          <div class="nav-dd-section-label">For teachers</div>
          <div class="nav-dd-grid">
            <a href="/teachers.html#signup" class="nav-dd-item">
              <i class="ti ti-list-details nav-dd-icon"></i>
              <div class="nav-dd-text"><h4>List your studio</h4><p>Free listing, reach new students instantly</p></div>
            </a>
            <a href="/teachers.html#dashboard" class="nav-dd-item">
              <i class="ti ti-layout-grid nav-dd-icon"></i>
              <div class="nav-dd-text"><h4>Teacher dashboard</h4><p>Manage bookings, students &amp; your schedule</p></div>
            </a>
          </div>
        </div>
      </div>
    </div>

    <a href="/blog" class="nav-link-plain is-active"__CURRENT__>Blog</a>
    <a href="/about.html" class="nav-link-plain">About</a>
  </div>

  <div class="nav-ctas">
    <div class="nav-item nav-item--dropdown nav-item--account">
      <button class="nav-account-trigger" type="button" aria-expanded="false" aria-haspopup="true" aria-label="Account">
        <i class="ti ti-user"></i>
      </button>
      <div class="nav-dropdown nav-dropdown--account" role="menu">
        <a href="#" class="nav-dd-item">
          <i class="ti ti-user nav-dd-icon"></i>
          <div class="nav-dd-text"><h4>Customer portal</h4><p>Track delivery, view purchases, manage warranty</p></div>
        </a>
        <a href="/teachers.html#dashboard" class="nav-dd-item">
          <i class="ti ti-music nav-dd-icon"></i>
          <div class="nav-dd-text"><h4>Teacher dashboard</h4><p>Manage bookings, students &amp; your studio</p></div>
        </a>
      </div>
    </div>
    <a href="/services/book-a-viewing.html" class="nav-cta">Book a visit</a>
  </div>
  <button class="nav-burger" aria-label="Menu"><i class="ti ti-menu-2"></i></button>
  <a class="sp-nav-call" href="tel:+61479128955" aria-label="Call Signature Pianos on 0479 128 955"><i class="ti ti-phone" aria-hidden="true"></i></a>
</nav>`

function footer() {
  return `
<footer class="sp-footer">
  <div class="sp-footer-inner">
    <a href="/" class="sp-footer-logo"><img src="/media/brand/logo-ink.svg" width="1542" height="592" alt="Signature Pianos"></a>
    <p class="sp-footer-tagline">Pre-loved Japanese pianos, hand-picked in Japan and checked in Melbourne.</p>
    <div class="sp-footer-links" role="navigation" aria-label="Footer">
      <a href="/instruments/">Pianos</a>
      <a href="/services/book-a-viewing.html">Book a visit</a>
      <a href="/services/tuning-servicing.html">Tuning</a>
      <a href="/services/delivery-warranty.html">Delivery &amp; warranty</a>
      <a href="/teachers.html">Teachers</a>
      <a href="/blog">Blog</a>
      <a href="/about.html">About</a>
    </div>
    <address class="sp-footer-contact">
      <span class="sp-line"><a href="https://www.google.com/maps/dir/?api=1&amp;destination=63+Blackburn+Road+Mount+Waverley+VIC+3149" target="_blank" rel="noopener">63 Blackburn Road, Mount Waverley VIC 3149</a></span><span class="sp-dot">·</span><span class="sp-line"><a href="tel:+61479128955">0479 128 955</a></span><span class="sp-dot">·</span><span class="sp-line"><a href="mailto:info@signaturepianos.com.au">info@signaturepianos.com.au</a></span>
    </address>
    <div class="sp-footer-socials">
      <a href="#" aria-label="Instagram"><i class="ti ti-brand-instagram" aria-hidden="true"></i></a>
      <a href="#" aria-label="Facebook"><i class="ti ti-brand-facebook" aria-hidden="true"></i></a>
    </div>
  </div>
  <div class="sp-footer-bottom">© ${new Date().getFullYear()} Signature Pianos · <a href="#">Privacy</a> · <a href="#">Terms</a></div>
</footer>`
}

const BOTTOMBAR = `
<div class="sp-bottombar" role="navigation" aria-label="Quick contact">
  <a href="tel:+61479128955"><i class="ti ti-phone" aria-hidden="true"></i>Call</a>
  <a href="https://www.google.com/maps/dir/?api=1&amp;destination=63+Blackburn+Road+Mount+Waverley+VIC+3149" target="_blank" rel="noopener"><i class="ti ti-map-pin" aria-hidden="true"></i>Directions</a>
  <a class="sp-bottombar-book" href="/services/book-a-viewing.html">Book a visit</a>
</div>`

// Header scrolled state + dropdowns, as on the static pages.
const NAV_SCRIPT = `
<script>
  (function setupNav() {
    var nav = document.getElementById('nav');
    if (nav) {
      var onScroll = function () { nav.classList.toggle('scrolled', window.scrollY > 60); };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
    var items = document.querySelectorAll('.nav-item--dropdown');
    var TRIGGER_SEL = '.nav-link-trigger, .nav-account-trigger';
    var closeAll = function (except) {
      items.forEach(function (it) {
        if (it === except) return;
        it.classList.remove('nav-item--open');
        var t = it.querySelector(TRIGGER_SEL);
        if (t) t.setAttribute('aria-expanded', 'false');
      });
    };
    items.forEach(function (item) {
      var trigger = item.querySelector(TRIGGER_SEL);
      if (!trigger) return;
      var open = function () { item.classList.add('nav-item--open'); trigger.setAttribute('aria-expanded', 'true'); closeAll(item); };
      var close = function () { item.classList.remove('nav-item--open'); trigger.setAttribute('aria-expanded', 'false'); };
      item.addEventListener('mouseenter', open);
      item.addEventListener('mouseleave', close);
      trigger.addEventListener('click', function (e) {
        e.stopPropagation();
        item.classList.contains('nav-item--open') ? close() : open();
      });
      item.querySelectorAll('.nav-dd-item').forEach(function (link) { link.addEventListener('click', close); });
    });
    document.addEventListener('click', function () { closeAll(null); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(null); });
  })();
</script>`

/*
 * shell({ title, description, canonical, ogType, image, robots, headExtra, ld, body })
 * — full HTML document with the site chrome around `body`. `ld` is an array
 * of JSON-LD objects.
 */
function shell({ title, description = '', canonical, ogType = 'website', image = '', robots = '', navCurrent = false, headExtra = '', ld = [], body }) {
  const img = absUrl(image)
  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
${robots ? `<meta name="robots" content="${esc(robots)}" />\n` : ''}<link rel="canonical" href="${esc(canonical)}" />
<meta property="og:type" content="${esc(ogType)}" />
<meta property="og:site_name" content="Signature Pianos" />
<meta property="og:locale" content="en_AU" />
<meta property="og:url" content="${esc(canonical)}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
${img ? `<meta property="og:image" content="${esc(img)}" />\n` : ''}<meta name="twitter:card" content="${img ? 'summary_large_image' : 'summary'}" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
${img ? `<meta name="twitter:image" content="${esc(img)}" />\n` : ''}${headExtra}
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="${esc(FONTS_URL)}" rel="stylesheet" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css" />
${ld.filter(Boolean).map((o) => `<script type="application/ld+json">${jsonLd(o)}</script>`).join('\n')}
<style>${CSS}</style>
<link rel="stylesheet" href="/css/signature-theme.css" />
<link rel="icon" href="/media/brand/favicon.svg" type="image/svg+xml" />
<link rel="icon" href="/media/brand/favicon-32.png" sizes="32x32" type="image/png" />
<link rel="apple-touch-icon" href="/media/brand/apple-touch-icon.png" />
</head>
<body class="sp-blog">
<a class="bl-skip" href="#main">Skip to content</a>
${TOPBAR}
${NAV.replace('__CURRENT__', navCurrent ? ' aria-current="page"' : '')}
${body}
${footer()}
${NAV_SCRIPT}
${BOTTOMBAR}
<script src="/js/signature-nav.js" defer></script>
<script src="/js/signature-book.js" defer></script>
</body>
</html>`
}

/* ==========================================================================
   Pieces
   ========================================================================== */

// The photo, or an Ivory Deep frame with the monogram when there isn't one.
function media(p, { eager = false } = {}) {
  if (p.hero_image_url) {
    return `<img class="bl-photo" src="${esc(p.hero_image_url)}" alt="" width="1200" height="900" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`
  }
  return `<span class="bl-ph"><img src="${MONOGRAM}" alt="" width="415" height="551"></span>`
}

function metaLine(p) {
  const bits = []
  if (p.published_at) bits.push(`<time datetime="${esc(isoDate(p.published_at))}">${esc(fmtDate(p.published_at))}</time>`)
  const tag = (p.tags || [])[0]
  if (tag) bits.push(esc(tag))
  return bits.join('<span class="bl-dot" aria-hidden="true">·</span>')
}

function card(p) {
  const href = esc(postPath(p))
  return `
      <article class="bl-card">
        <a class="bl-media" href="${href}" tabindex="-1" aria-hidden="true">${media(p)}</a>
        <div class="bl-card-body">
          <h3 class="bl-card-title"><a href="${href}">${esc(p.title)}</a></h3>
          <p class="bl-meta">${metaLine(p)}</p>
          ${p.excerpt ? `<p class="bl-card-excerpt">${esc(p.excerpt)}</p>` : ''}
          <a class="bl-link" href="${href}" aria-label="Read: ${esc(p.title)}">Read <i class="ti ti-arrow-right" aria-hidden="true"></i></a>
        </div>
      </article>`
}

function feature(p) {
  const href = esc(postPath(p))
  return `
    <article class="bl-feature">
      <a class="bl-media" href="${href}" tabindex="-1" aria-hidden="true">${media(p, { eager: true })}</a>
      <div>
        <p class="bl-meta">Latest<span class="bl-dot" aria-hidden="true">·</span>${metaLine(p)}</p>
        <h2 class="bl-feature-title"><a href="${href}">${esc(p.title)}</a></h2>
        ${p.excerpt ? `<p class="bl-feature-excerpt">${esc(p.excerpt)}</p>` : ''}
        <a class="bl-link" href="${href}" aria-label="Read: ${esc(p.title)}">Read the article <i class="ti ti-arrow-right" aria-hidden="true"></i></a>
      </div>
    </article>`
}

function visitBand() {
  return `
<section class="bl-visit" aria-labelledby="bl-visit-title">
  <div class="bl-wrap">
    <h2 class="bl-heading bl-heading--sm" id="bl-visit-title"><span class="sp-display">Play them</span><span class="sp-script">side by side</span></h2>
    <p class="bl-lead">Every piano in the showroom was hand-picked in Japan and checked in our Mount Waverley workshop. Book a private visit and play as many as you like.</p>
    <div class="bl-actions">
      <a class="bl-button" href="${BOOK_URL}">Book a visit</a>
      <a class="bl-link" href="tel:+61479128955">Or call 0479 128 955 <i class="ti ti-arrow-right" aria-hidden="true"></i></a>
    </div>
    <p class="bl-meta bl-promises"><span>White-glove delivery</span><span class="bl-dot" aria-hidden="true">·</span><span>10-year warranty</span><span class="bl-dot" aria-hidden="true">·</span><span>First tuning included</span></p>
  </div>
</section>`
}

function inlineCta() {
  return `
<aside class="bl-inline-cta" aria-label="Visit the showroom">
  <p class="bl-meta">In the showroom</p>
  <p>Every piano on our floor was hand-picked in Japan and checked in our Mount Waverley workshop. The quickest way to answer most of the questions on this page is to sit down and play.</p>
  <a class="bl-link" href="${BOOK_URL}">Book a visit <i class="ti ti-arrow-right" aria-hidden="true"></i></a>
</aside>
`
}

// Put the showroom note before the middle <h2> of longer articles.
function withInlineCta(html) {
  const starts = []
  const re = /<h2[\s>]/gi
  let m
  while ((m = re.exec(html))) starts.push(m.index)
  if (starts.length < 3) return html
  const at = starts[Math.floor(starts.length / 2)]
  return html.slice(0, at) + inlineCta() + html.slice(at)
}

// Tables scroll inside their own frame on phones instead of widening the page.
function wrapTables(html) {
  return html.replace(/<table[\s>]/gi, (t) => `<div class="bl-table">${t}`).replace(/<\/table>/gi, '</table></div>')
}

/* --------------------------------------------------------------------------
   Body sanitiser. body_html is written by the AI from web pages it researched,
   so a prompt-injected page could try to plant markup in an article, and the
   Journal is served on the same origin as /admin. Only the tags the writing
   rules allow (lib/blog.js FORMAT, plus figure/img/code) survive, each with
   only its safe attributes; links must be http(s), relative (/...) or #;
   images http(s) or relative. Anything else is dropped (text kept), and
   script-like elements are dropped with their content. Comments go too.
   -------------------------------------------------------------------------- */
const BODY_TAGS = {
  p: [], h2: [], h3: [], h4: [], ul: [], ol: ['start'], li: [],
  a: ['href', 'title'], strong: [], b: [], em: [], i: [], blockquote: ['cite'],
  table: [], thead: [], tbody: [], tr: [], th: ['scope', 'colspan', 'rowspan'], td: ['colspan', 'rowspan'],
  figure: [], figcaption: [], img: ['src', 'alt', 'width', 'height'],
  br: [], hr: [], code: [], sup: [], sub: [],
}
const BODY_VOID = new Set(['br', 'hr', 'img'])
// Void ones (embed, frame, input...) need no entry: a tag not in BODY_TAGS is dropped anyway.
const BODY_DROP_WITH_CONTENT = new Set([
  'script', 'style', 'iframe', 'frameset', 'object', 'applet', 'noscript', 'noembed',
  'noframes', 'template', 'svg', 'math', 'textarea', 'select', 'title', 'head', 'xmp', 'plaintext', 'form',
])
// A tag, attribute-aware so a quoted '>' can't end it early.
const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/g
const ATTR_RE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&(colon|tab|newline|quot|apos|lt|gt|nbsp|amp);/gi, (_, n) => ({
      colon: ':', tab: '\t', newline: '\n', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', amp: '&',
    })[n.toLowerCase()])
}
function safeChar(code) {
  return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
}

// The URL as the browser will read it, or '' when it isn't allowed.
function safeBodyUrl(raw, { images = false } = {}) {
  const url = decodeEntities(raw).replace(/[\u0000-\u0020\u007f-\u009f]/g, '')
  if (/^https?:\/\//i.test(url)) return url
  if (/^\/(?![/\\])/.test(url)) return url
  if (!images && /^#[\w-]*$/.test(url)) return url
  return ''
}

function cleanAttrs(tag, attrText) {
  const allowed = BODY_TAGS[tag]
  if (!allowed.length || !attrText) return ''
  const out = []
  const seen = new Set()
  let m
  ATTR_RE.lastIndex = 0
  while ((m = ATTR_RE.exec(attrText))) {
    const name = m[1].toLowerCase()
    if (!allowed.includes(name) || seen.has(name)) continue
    const raw = m[2] ?? m[3] ?? m[4] ?? ''
    let value
    if (name === 'href' || name === 'cite') value = safeBodyUrl(raw)
    else if (name === 'src') value = safeBodyUrl(raw, { images: true })
    else if (['width', 'height', 'colspan', 'rowspan', 'start'].includes(name)) value = /^\d{1,4}$/.test(raw.trim()) ? raw.trim() : ''
    else if (name === 'scope') value = /^(row|col|rowgroup|colgroup)$/i.test(raw.trim()) ? raw.trim().toLowerCase() : ''
    else value = decodeEntities(raw).slice(0, 300)
    if (!value && name !== 'alt') continue
    seen.add(name)
    out.push(` ${name}="${esc(value)}"`)
  }
  return out.join('')
}

function sanitizeBody(html) {
  const src = String(html || '').replace(/<!--[\s\S]*?(?:-->|$)/g, '')
  let out = ''
  let last = 0
  let m
  TAG_RE.lastIndex = 0
  while ((m = TAG_RE.exec(src))) {
    // Text between tags: any '<' or '>' left over isn't a tag we accepted.
    out += src.slice(last, m.index).replace(/</g, '&lt;').replace(/>/g, '&gt;')
    last = TAG_RE.lastIndex
    const closing = m[1] === '/'
    const tag = m[2].toLowerCase()
    if (BODY_DROP_WITH_CONTENT.has(tag)) {
      if (closing) continue
      const end = new RegExp(`</${tag}\\s*>`, 'ig')
      end.lastIndex = last
      const e = end.exec(src)
      last = e ? end.lastIndex : src.length
      TAG_RE.lastIndex = last
      continue
    }
    if (!Object.prototype.hasOwnProperty.call(BODY_TAGS, tag)) continue
    if (closing) {
      if (!BODY_VOID.has(tag)) out += `</${tag}>`
      continue
    }
    const attrs = cleanAttrs(tag, m[3])
    if (tag === 'img' && !/ src="/.test(attrs)) continue   // no usable src: drop the image
    out += `<${tag}${attrs}>`
  }
  out += src.slice(last).replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return out
}

function prepareBody(html) {
  return withInlineCta(wrapTables(sanitizeBody(html)))
}

// Rank candidates by shared tags, then recency.
function pickRelated(post, candidates, n = 3) {
  const tags = new Set((post.tags || []).map((t) => String(t).toLowerCase()))
  return (candidates || [])
    .filter((c) => c && c.slug && c.slug !== post.slug)
    .map((c) => ({ c, score: (c.tags || []).filter((t) => tags.has(String(t).toLowerCase())).length }))
    .sort((a, b) => b.score - a.score || new Date(b.c.published_at || 0) - new Date(a.c.published_at || 0))
    .slice(0, n)
    .map((x) => x.c)
}

function orgRef() {
  return {
    '@type': 'MusicStore',
    '@id': `${SITE_URL}/#store`,
    name: 'Signature Pianos',
    url: `${SITE_URL}/`,
    logo: { '@type': 'ImageObject', url: `${SITE_URL}/media/brand/apple-touch-icon.png`, width: 180, height: 180 },
  }
}

/* ==========================================================================
   Pages
   ========================================================================== */

/*
 * renderIndex(posts, { tag }) — /blog. `posts` are published rows, newest
 * first: { slug, title, excerpt, published_at, tags, hero_image_url }.
 */
function renderIndex(posts, { tag = '' } = {}) {
  posts = (posts || []).filter((p) => p && p.slug && p.title)
  const wanted = String(tag || '').trim().toLowerCase()

  // Tag list from what's published, most-used first.
  const counts = new Map()
  posts.forEach((p) => (p.tags || []).forEach((t) => {
    const key = String(t).trim()
    if (key) counts.set(key, (counts.get(key) || 0) + 1)
  }))
  const tags = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t).slice(0, 8)
  const activeTag = wanted ? ([...counts.keys()].find((t) => t.toLowerCase() === wanted) || String(tag).trim()) : ''
  const shown = activeTag ? posts.filter((p) => (p.tags || []).some((t) => String(t).toLowerCase() === wanted)) : posts

  const tagNav = posts.length && tags.length > 1 ? `
    <nav aria-label="Topics"><ul class="bl-tags">
      <li><a href="/blog"${activeTag ? '' : ' aria-current="page"'}>All</a></li>
      ${tags.map((t) => `<li><a href="${esc(tagPath(t))}"${t === activeTag ? ' aria-current="page"' : ''}>${esc(t)}</a></li>`).join('\n      ')}
    </ul></nav>` : ''

  let content
  if (!posts.length) {
    content = `
    <section class="bl-empty">
      <img class="bl-empty-mark" src="${MONOGRAM}" alt="" width="415" height="551">
      <h2 class="bl-section-title">The first articles are on their way</h2>
      <p>We're writing plain answers to the questions families ask in the showroom: which Yamaha to choose, what to check before you buy, and how to look after a piano through a Melbourne winter.</p>
      <p>Until then, the quickest answers are at the piano. Every piano on our floor was hand-picked in Japan and checked in our Mount Waverley workshop.</p>
      <div class="bl-actions">
        <a class="bl-button" href="${BOOK_URL}">Book a visit</a>
        <a class="bl-link" href="/instruments/">See the pianos <i class="ti ti-arrow-right" aria-hidden="true"></i></a>
      </div>
    </section>`
  } else if (activeTag) {
    content = `
    <section class="bl-grid-section">
      <p class="bl-meta bl-filter-note">${shown.length} ${shown.length === 1 ? 'article' : 'articles'} filed under ${esc(activeTag)}</p>
      ${shown.length ? `<div class="bl-grid">${shown.map(card).join('')}\n      </div>` : `
      <div class="bl-empty"><p>Nothing under this topic yet.</p><a class="bl-link" href="/blog">See all articles <i class="ti ti-arrow-right" aria-hidden="true"></i></a></div>`}
    </section>`
  } else {
    const [latest, ...rest] = shown
    content = `
    ${feature(latest)}
    ${rest.length ? `
    <section class="bl-grid-section" aria-labelledby="bl-more">
      <h2 class="bl-label-title" id="bl-more">Earlier articles</h2>
      <div class="bl-grid">${rest.map(card).join('')}
      </div>
    </section>` : '<div class="bl-grid-section"></div>'}`
  }

  const body = `
<main id="main" class="bl-main">
  <div class="bl-wrap">
    <header class="bl-hero">
      <h1 class="bl-heading"><span class="sp-display">The Journal</span><span class="sp-script">from the showroom</span></h1>
      <p class="bl-lead">Plain answers on choosing, buying and caring for a pre-loved Japanese piano. Every piano we sell is hand-picked in Japan and checked in our Mount Waverley workshop, and these are the questions we're asked most along the way.</p>
      ${tagNav}
    </header>
    ${content}
  </div>
</main>
${posts.length ? visitBand() : ''}`

  const canonical = activeTag ? `${SITE_URL}${tagPath(activeTag)}` : `${SITE_URL}/blog`
  const ld = [
    {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      '@id': `${SITE_URL}/blog#blog`,
      name: 'The Journal',
      description: 'Buying guides and care notes on pre-loved Japanese pianos from Signature Pianos, Mount Waverley.',
      url: `${SITE_URL}/blog`,
      inLanguage: 'en-AU',
      publisher: orgRef(),
      blogPost: shown.slice(0, 20).map((p) => ({
        '@type': 'BlogPosting',
        headline: p.title,
        url: SITE_URL + postPath(p),
        datePublished: isoDate(p.published_at) || undefined,
        author: { '@type': 'Person', name: authorName(p) },
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'Journal', item: `${SITE_URL}/blog` },
      ],
    },
  ]

  return shell({
    title: activeTag ? `${activeTag} | The Journal | Signature Pianos` : 'The Journal: Piano Buying Guides | Signature Pianos Melbourne',
    description: 'Plain answers on buying and caring for a pre-loved Japanese piano, from Signature Pianos in Mount Waverley. Yamaha and Kawai, hand-picked in Japan.',
    canonical,
    robots: activeTag ? 'noindex, follow' : '',
    navCurrent: !activeTag,
    ld,
    body,
  })
}

/*
 * renderPost(post, related) — /blog/:slug. `post` is a full blog_posts row;
 * `related` is up to three published rows (see pickRelated).
 */
function renderPost(post, related = []) {
  const url = SITE_URL + postPath(post)
  const author = authorName(post)
  const isEric = author === DEFAULT_AUTHOR
  const faq = (Array.isArray(post.faq) ? post.faq : []).filter((f) => f && f.question && f.answer)
  const tags = (post.tags || []).filter(Boolean)
  const html = String(post.body_html || '')
  const description = post.meta_description || post.excerpt || ''
  const published = isoDate(post.published_at) || isoDate(post.created_at)
  const modified = isoDate(post.updated_at) || published

  const crumbs = `
    <nav class="bl-crumbs" aria-label="Breadcrumb"><ol>
      <li><a href="/">Home</a></li>
      <li><a href="/blog">Journal</a></li>
      <li aria-current="page">${esc(post.title)}</li>
    </ol></nav>`

  const hero = post.hero_image_url ? `
    <figure class="bl-hero-figure"><div class="bl-media"><img class="bl-photo" src="${esc(post.hero_image_url)}" alt="${esc(post.title)}" width="1600" height="900" fetchpriority="high" decoding="async"></div></figure>` : ''

  const faqHtml = faq.length ? `
      <section class="bl-faq" aria-labelledby="bl-faq-title">
        <h2 class="bl-section-title" id="bl-faq-title">Questions people ask</h2>
        ${faq.map((f) => `
        <details>
          <summary>${esc(f.question)}</summary>
          <div class="bl-faq-a"><p>${esc(f.answer)}</p></div>
        </details>`).join('')}
      </section>` : ''

  const filed = tags.length ? `
      <div class="bl-filed">
        <span class="bl-meta">Filed under</span>
        ${tags.map((t) => `<a class="bl-chip" href="${esc(tagPath(t))}">${esc(t)}</a>`).join('\n        ')}
      </div>` : ''

  const bio = isEric
    ? `<p>Eric runs Signature Pianos from the showroom at 63 Blackburn Road, Mount Waverley. Every piano is chosen in Japan, photographed there before import and checked in the Melbourne workshop before it goes on the floor. <a href="/about.html">More about Signature Pianos</a></p>`
    : `<p>Written for Signature Pianos, Mount Waverley. Every piano we sell is hand-picked in Japan and checked in our Melbourne workshop. <a href="/about.html">More about Signature Pianos</a></p>`

  const relatedHtml = related && related.length ? `
<section class="bl-related" aria-labelledby="bl-related-title">
  <div class="bl-wrap">
    <div class="bl-related-head">
      <h2 class="bl-section-title" id="bl-related-title">Keep reading</h2>
      <a class="bl-link" href="/blog">All articles <i class="ti ti-arrow-right" aria-hidden="true"></i></a>
    </div>
    <div class="bl-grid">${related.map(card).join('')}
    </div>
  </div>
</section>` : ''

  const body = `
<main id="main" class="bl-main bl-main--article">
  <div class="bl-wrap">
    ${crumbs}
    <article class="bl-article">
      <header class="bl-article-head">
        ${tags[0] ? `<p class="bl-meta"><a href="${esc(tagPath(tags[0]))}">${esc(tags[0])}</a></p>` : ''}
        <h1 class="bl-title">${esc(post.title)}</h1>
        ${post.excerpt ? `<p class="bl-lead">${esc(post.excerpt)}</p>` : ''}
        <div class="bl-byline">
          <span class="bl-byline-name">${esc(author)}, Signature Pianos</span>
          <p class="bl-meta">${published ? `<time datetime="${esc(published)}">${esc(fmtDate(published))}</time><span class="bl-dot" aria-hidden="true">·</span>` : ''}${readingMinutes(html)} min read</p>
        </div>
      </header>
      ${hero}
      <div class="bl-column">
        <div class="bl-prose">
${prepareBody(html)}
        </div>
        ${faqHtml}
        ${filed}
        <aside class="bl-author" aria-label="About the author">
          <img src="${MONOGRAM}" alt="" width="415" height="551">
          <div>
            <p class="bl-author-name">Written by ${esc(author)}</p>
            ${bio}
          </div>
        </aside>
      </div>
    </article>
  </div>
</main>
${visitBand()}
${relatedHtml}`

  const image = absUrl(post.hero_image_url)
  const personOrOrg = { '@type': 'Person', name: author, ...(isEric ? { url: `${SITE_URL}/about.html`, worksFor: { '@id': `${SITE_URL}/#store` } } : {}) }
  const ld = [
    {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      '@id': `${url}#article`,
      headline: post.title,
      description,
      ...(image ? { image: [image] } : {}),
      datePublished: published || undefined,
      dateModified: modified || undefined,
      author: personOrOrg,
      publisher: orgRef(),
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      isPartOf: { '@id': `${SITE_URL}/blog#blog` },
      inLanguage: 'en-AU',
      wordCount: wordCount(stripComments(html)),
      ...(tags[0] ? { articleSection: tags[0] } : {}),
      keywords: (post.keywords || []).join(', '),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'Journal', item: `${SITE_URL}/blog` },
        { '@type': 'ListItem', position: 3, name: post.title, item: url },
      ],
    },
    faq.length ? {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faq.map((f) => ({
        '@type': 'Question',
        name: f.question,
        acceptedAnswer: { '@type': 'Answer', text: f.answer },
      })),
    } : null,
  ]

  const headExtra = [
    published ? `<meta property="article:published_time" content="${esc(published)}" />` : '',
    modified ? `<meta property="article:modified_time" content="${esc(modified)}" />` : '',
    `<meta property="article:author" content="${esc(author)}" />`,
    ...tags.map((t) => `<meta property="article:tag" content="${esc(t)}" />`),
  ].filter(Boolean).join('\n')

  return shell({
    title: `${post.title} | Signature Pianos`,
    description,
    canonical: url,
    ogType: 'article',
    image: post.hero_image_url,
    headExtra,
    ld,
    body,
  })
}

function renderNotFound() {
  return shell({
    title: 'Article not found | Signature Pianos',
    description: '',
    canonical: `${SITE_URL}/blog`,
    robots: 'noindex, follow',
    body: `
<main id="main" class="bl-main">
  <div class="bl-wrap">
    <section class="bl-missing">
      <h1 class="bl-heading bl-heading--sm"><span class="sp-display">Not here</span><span class="sp-script">any more</span></h1>
      <p>This article may have moved or been taken down. The rest of the journal is still here, and so are the pianos.</p>
      <div class="bl-actions">
        <a class="bl-button" href="/blog">Back to the journal</a>
        <a class="bl-link" href="/instruments/">See the pianos <i class="ti ti-arrow-right" aria-hidden="true"></i></a>
      </div>
    </section>
  </div>
</main>`,
  })
}

module.exports = {
  SITE_URL,
  DEFAULT_AUTHOR,
  esc,
  fmtDate,
  jsonLd,
  authorName,
  stripComments,
  sanitizeBody,
  pickRelated,
  shell,
  renderIndex,
  renderPost,
  renderNotFound,
}
