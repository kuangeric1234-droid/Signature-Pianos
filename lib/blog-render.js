/*
 * Signature Pianos — public blog HTML rendering
 * ---------------------------------------------
 * Server-rendered (crawlable) HTML for the public blog, served by
 * api/blog.js (index) and api/blog-post.js (single post). Self-contained
 * shell that reuses the site's colour tokens + fonts so it looks native,
 * with a simple nav back to the main site.
 */

const SITE_URL = process.env.SITE_URL || 'https://signaturepianos.com.au'

function esc(s) {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function fmtDate(s) {
  if (!s) return ''
  return new Date(s).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
}

/*
 * shell({ title, description, canonical, headExtra, body }) — full HTML doc.
 */
function shell({ title, description, canonical, headExtra = '', body }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description || '')}" />
<link rel="canonical" href="${esc(canonical)}" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description || '')}" />
<meta property="og:url" content="${esc(canonical)}" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
${headExtra}
<style>
  :root{--bg-1:#0e0e0d;--bg-2:#1a1a18;--bg-3:#242422;--gold:#b8935a;--gold-light:#d4b483;--text-1:#f5f0e8;--text-2:#9a9590;--text-3:#6b6760;--border:rgba(184,147,90,0.15);--max:760px;}
  *,*::before,*::after{box-sizing:border-box;}
  html,body{margin:0;padding:0;background:var(--bg-1);color:var(--text-1);font-family:'DM Sans',sans-serif;font-weight:300;line-height:1.75;-webkit-font-smoothing:antialiased;}
  a{color:var(--gold-light);text-decoration:none;}
  a:hover{color:var(--gold);}
  nav{display:flex;align-items:center;justify-content:space-between;padding:18px 32px;border-bottom:1px solid var(--border);background:rgba(14,14,13,0.96);position:sticky;top:0;z-index:10;}
  .logo{font-family:'Cormorant Garamond',serif;font-size:24px;color:var(--text-1);}
  .logo span{color:var(--gold);font-style:italic;}
  .nav-links a{margin-left:26px;color:var(--text-2);font-size:14px;}
  .nav-links a:hover{color:var(--text-1);}
  .wrap{max-width:var(--max);margin:0 auto;padding:56px 24px 96px;}
  h1{font-family:'Cormorant Garamond',serif;font-weight:400;font-size:42px;line-height:1.15;margin:0 0 14px;color:var(--text-1);}
  h2{font-family:'Cormorant Garamond',serif;font-weight:400;font-size:28px;margin:40px 0 12px;color:var(--gold-light);}
  h3{font-size:19px;font-weight:500;margin:28px 0 8px;color:var(--text-1);}
  p,li{color:var(--text-1);font-size:17px;}
  .meta{color:var(--text-3);font-size:14px;margin-bottom:36px;}
  .article a{text-decoration:underline;text-underline-offset:2px;}
  .tag{display:inline-block;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:var(--gold);border:1px solid var(--border);border-radius:999px;padding:3px 10px;margin:0 6px 6px 0;}
  .card{display:block;border:1px solid var(--border);border-radius:10px;padding:24px;margin-bottom:18px;transition:border-color .2s,transform .2s;background:var(--bg-2);}
  .card:hover{border-color:var(--gold);transform:translateY(-2px);}
  .card h2{margin:0 0 8px;font-size:24px;color:var(--text-1);}
  .card p{color:var(--text-2);font-size:15px;margin:0;}
  .card .meta{margin:10px 0 0;}
  .faq{margin-top:48px;border-top:1px solid var(--border);padding-top:8px;}
  .faq details{border-bottom:1px solid var(--border);padding:16px 0;}
  .faq summary{cursor:pointer;font-weight:500;font-size:17px;color:var(--text-1);}
  .faq p{color:var(--text-2);margin:10px 0 0;}
  .back{display:inline-block;margin-bottom:28px;color:var(--text-2);font-size:14px;}
  footer{border-top:1px solid var(--border);padding:32px;text-align:center;color:var(--text-3);font-size:13px;}
  .empty{color:var(--text-2);text-align:center;padding:60px 0;}
  @media(max-width:600px){h1{font-size:32px;}.wrap{padding:36px 20px 72px;}}
</style>
</head>
<body>
<nav>
  <a href="/" class="logo">Signature <span>Pianos</span></a>
  <div class="nav-links">
    <a href="/instruments.html">Pianos</a>
    <a href="/teachers.html">Teachers</a>
    <a href="/blog">Blog</a>
    <a href="/about.html">About</a>
  </div>
</nav>
${body}
<footer>© ${new Date().getFullYear()} Signature Pianos, Melbourne · <a href="/">signaturepianos.com.au</a></footer>
</body>
</html>`
}

module.exports = { shell, esc, fmtDate, SITE_URL }
