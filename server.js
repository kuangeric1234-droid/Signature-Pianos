const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const zlib = require('zlib');

// Local preview. Bound to loopback so the working tree (.env.local included) is
// never reachable from the network. It answers as vercel.json does for the pages
// people see: the redirects, the redesigned pages through api/site.js (home, the
// collection, a piano's page, the 404), and the static files. The other api/
// functions don't run here.
//   PORT           the port (5173 by default; other sessions often hold it)
//   OFFICE_ORIGIN  the office to read and send to (a local office for a test run);
//                  unset, js/office-config.js and the feed use the live office
const PORT = Number(process.env.PORT) || 5173;
const HOST = '127.0.0.1';
const ROOT = __dirname;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

const site = require('./api/site');
const CATS = 'uprights|grands|yamaha|kawai';

/** vercel.json's redirects, the ones a visitor meets */
function redirectFor(u) {
  const p = u.pathname, q = u.searchParams;
  if (p === '/piano.html') return q.get('slug') ? '/pianos/' + encodeURIComponent(q.get('slug')) : '/pianos/';
  if (p === '/instruments' || p === '/instruments/' || p === '/instruments/index.html' || p === '/instruments.html') {
    const cat = q.get('cat');
    return cat === 'upright' ? '/pianos/uprights/' : cat === 'grand' ? '/pianos/grands/' : '/pianos/';
  }
  if (p === '/index.html') return '/';
  if (p === '/pianos') return '/pianos/';
  const m = p.match(new RegExp('^/pianos/(' + CATS + ')$'));
  if (m) return '/pianos/' + m[1] + '/';
  const s = p.match(/^\/pianos\/([a-z0-9-]+)\/$/);
  if (s && !new RegExp('^(' + CATS + ')$').test(s[1])) return '/pianos/' + s[1];
  return null;
}

/** vercel.json's rewrites to api/site.js */
function pageFor(p) {
  if (p === '/') return { page: 'home' };
  if (p === '/pianos/') return { page: 'collection' };
  const c = p.match(new RegExp('^/pianos/(' + CATS + ')/$'));
  if (c) return { page: 'collection', cat: c[1] };
  const s = p.match(/^\/pianos\/([^/]+)$/);
  if (s) return { page: 'piano', slug: decodeURIComponent(s[1]) };
  return null;
}

/** a Vercel function called the way Vercel calls it */
function runSite(req, res, query) {
  const out = {
    statusCode: 200, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    send(body) {
      const h = Object.assign({}, this.headers, { 'Cache-Control': 'no-store' });
      if (/gzip/.test(req.headers['accept-encoding'] || '')) { h['Content-Encoding'] = 'gzip'; body = zlib.gzipSync(body); }
      res.writeHead(this.statusCode, h); res.end(body);
    },
  };
  req.query = query;
  Promise.resolve(site(req, out)).catch((err) => { console.error(err); res.writeHead(500); res.end('Server error'); });
}

/** an api/ function that answers JSON, called the way Vercel calls it */
function runApi(fn, req, res) {
  const out = {
    statusCode: 200, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(v) { res.writeHead(this.statusCode, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, this.headers)); res.end(JSON.stringify(v)); },
    end() { res.writeHead(this.statusCode, this.headers); res.end(); },
  };
  Promise.resolve(fn(req, out)).catch((err) => { console.error(err); res.writeHead(500); res.end('Server error'); });
}

http.createServer((req, res) => {
  let u;
  try {
    u = new URL(req.url, 'http://' + HOST);
    decodeURIComponent(u.pathname);
  } catch {
    res.writeHead(400); return res.end('Bad request');
  }
  const to = redirectFor(u);
  if (to) { res.writeHead(301, { Location: to }); return res.end(); }

  // Vercel's image service: here, the original (the office's own address, or a file of this site)
  if (u.pathname === '/_vercel/image') {
    const src = u.searchParams.get('url') || '';
    if (/^https:\/\/portal\.signaturepianos\.com\.au\/public\//.test(src) || (process.env.OFFICE_ORIGIN && src.indexOf(process.env.OFFICE_ORIGIN + '/public/') === 0) || /^\/[a-z0-9/_.-]+$/i.test(src)) {
      res.writeHead(302, { Location: src }); return res.end();
    }
    res.writeHead(400); return res.end('Bad image address');
  }

  // the office editor's preview of a post (api/blog-preview.js); PREVIEW_ORIGINS names a local office's address
  if (u.pathname === '/api/blog-preview') return runApi(require('./api/blog-preview'), req, res);

  const pg = pageFor(u.pathname);
  if (pg) return runSite(req, res, pg);

  let urlPath = decodeURIComponent(u.pathname);
  if (urlPath === '/piano-rental') urlPath = '/piano-rental/index.html';
  else if (/^\/piano-rental\/[a-z0-9-]+$/.test(urlPath)) urlPath += '.html';
  else if (urlPath === '/privacy') urlPath = '/privacy.html';
  else if (urlPath === '/guide') urlPath = '/guide.html';
  else if (urlPath === '/portal') urlPath = '/portal/index.html';

  // A local run against a local office (S3.4): OFFICE_ORIGIN, and TURNSTILE_SITE_KEY for its bot check, answer
  // js/office-config.js in place of the file, so the switch is never edited to try it. Unset, the file as it is.
  if (urlPath === '/js/office-config.js' && process.env.OFFICE_ORIGIN) {
    res.writeHead(200, { 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-store' });
    return res.end('window.SP_OFFICE_CONFIG = Object.freeze(' + JSON.stringify({
      origin: process.env.OFFICE_ORIGIN,
      turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || ''
    }) + ');\n');
  }

  const filePath = path.join(ROOT, urlPath);

  // Must stay inside ROOT (path.relative, so /repo-evil can't pass as /repo),
  // and never serve dot-files/dot-dirs (.env.local, .git, .claude) or node_modules.
  const rel = path.relative(ROOT, filePath);
  const parts = rel.split(path.sep);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel) ||
      urlPath.includes('\0') ||
      parts.some(p => p.startsWith('.') || p === 'node_modules')) {
    res.writeHead(403); return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return runSite(req, res, { page: '404' });
    const ext = path.extname(filePath).toLowerCase();
    const zip = /^\.(html|css|js|json|svg|txt|xml)$/.test(ext) && /gzip/.test(req.headers['accept-encoding'] || '');
    res.writeHead(200, Object.assign({
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    }, zip ? { 'Content-Encoding': 'gzip' } : {}));
    const stream = fs.createReadStream(filePath);
    (zip ? stream.pipe(zlib.createGzip()) : stream).pipe(res);
  });
}).listen(PORT, HOST, () => {
  console.log(`Signature Pianos → http://${HOST}:${PORT}`);
});
