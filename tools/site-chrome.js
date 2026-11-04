#!/usr/bin/env node
/*
 * Signature Pianos · the shared header and footer, written into the static pages
 * ------------------------------------------------------------------------------
 *   node tools/site-chrome.js          write them
 *   node tools/site-chrome.js --check  say which pages are out of date, change nothing (exit 1 if any)
 *
 * The header and footer are lib/site/render.js's header() and footer(), the same
 * ones the redesigned pages render. Each static page holds them between
 * <!-- sp:header --> and <!-- /sp:header --> (and sp:footer), so running this
 * again after a change to the menu rewrites them in place. The first run
 * replaces the old top bar, nav and footer. It also writes 404.html.
 *
 * In each page's head it also puts the fonts (served from this site, in place
 * of Google Fonts), css/chrome.css and js/analytics.js, and in place of the old
 * phone-menu script it loads js/chrome.js. The page's own content and styles
 * are left as they are. Run it from the repo root.
 */
const fs = require('fs')
const path = require('path')
const { header, footer, FONT_PRELOADS, notFound, stock } = require('../lib/site/render')

const PAGES = [
  'about.html', 'checkout-success.html', 'privacy.html', 'serial-number-lookup.html',
  'services/book-a-viewing.html', 'services/delivery-warranty.html', 'services/tuning-servicing.html',
  'teacher.html', 'teachers-match.html', 'teachers.html',
  'piano-rental/index.html', 'piano-rental/prices.html', 'piano-rental/short-term.html',
  'piano-rental/start.html', 'piano-rental/terms.html', 'piano-rental/yamaha-u1-u3.html',
]
// pages with no header of their own that still count leads
const ANALYTICS_ONLY = ['guide.html']

const ROOT = path.join(__dirname, '..')
const check = process.argv.includes('--check')
const HEAD = `<!-- sp:head -->\n${FONT_PRELOADS}\n<link rel="stylesheet" href="/css/chrome.css">\n<script src="/js/analytics.js"></script>\n<!-- /sp:head -->`
const HEADER = `<!-- sp:header -->\n${header()}\n<!-- /sp:header -->`
const FOOTER = `<!-- sp:footer -->\n<footer class="spc-footer">\n${footer()}\n</footer>\n<!-- /sp:footer -->`
const GOOGLE_FONTS = /[ \t]*<link[^>]+(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*>\s*\n?/g

function between(s, a, b, put) {
  const i = s.indexOf(a), j = s.indexOf(b, i)
  if (i < 0 || j < 0) return null
  return s.slice(0, i) + put + s.slice(j + b.length)
}

function headOnly(s, file) {
  s = s.replace(GOOGLE_FONTS, '')
  const marked = between(s, '<!-- sp:head -->', '<!-- /sp:head -->', HEAD)
  if (marked != null) return marked
  const m = s.match(/<meta[^>]+name="viewport"[^>]*>\s*\n?/)
  if (!m) throw new Error(file + ': no viewport meta to follow')
  return s.slice(0, m.index + m[0].length) + HEAD + '\n' + s.slice(m.index + m[0].length)
}

function chrome(s, file) {
  s = headOnly(s, file)
  // the header: the marked block, else the old top bar and nav
  let h = between(s, '<!-- sp:header -->', '<!-- /sp:header -->', HEADER)
  if (h == null) {
    const a = s.indexOf('<div class="sp-topbar"')
    const n = s.indexOf('<nav id="nav"', a)
    const e = s.indexOf('</nav>', n)
    if (a < 0 || n < 0 || e < 0) throw new Error(file + ': old header not found')
    if (s.slice(n + 4, e).includes('<nav')) throw new Error(file + ': a nav inside the nav')
    h = s.slice(0, a) + HEADER + s.slice(e + '</nav>'.length)
  }
  s = h
  // the footer
  let f = between(s, '<!-- sp:footer -->', '<!-- /sp:footer -->', FOOTER)
  if (f == null) {
    const a = s.indexOf('<footer class="sp-footer"')
    const e = s.indexOf('</footer>', a)
    if (a < 0 || e < 0) throw new Error(file + ': old footer not found')
    f = s.slice(0, a) + FOOTER + s.slice(e + '</footer>'.length)
  }
  s = f
  // the menus' script in place of the old phone menu
  s = s.replace('<script src="/js/signature-nav.js" defer></script>', '<script src="/js/chrome.js" defer></script>')
  if (!s.includes('/js/chrome.js')) s = s.replace('</body>', '<script src="/js/chrome.js" defer></script>\n</body>')
  return s
}

let stale = 0
for (const rel of PAGES.concat(ANALYTICS_ONLY)) {
  const file = path.join(ROOT, rel)
  const was = fs.readFileSync(file, 'utf8')
  const now = PAGES.includes(rel) ? chrome(was, rel) : headOnly(was, rel)
  if (now === was) continue
  stale++
  if (check) console.log('out of date:', rel)
  else { fs.writeFileSync(file, now); console.log('written:', rel) }
}
// the 404 Vercel serves for an address with no page: the redesigned one, without the day's pianos (a page for a
// piano address that isn't there is made fresh by api/site.js, with them)
{
  const file = path.join(ROOT, '404.html')
  const now = notFound(stock([]))
  const was = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  if (now !== was) {
    stale++
    if (check) console.log('out of date: 404.html')
    else { fs.writeFileSync(file, now); console.log('written: 404.html') }
  }
}
if (check && stale) process.exit(1)
if (!stale) console.log('every page is up to date')
