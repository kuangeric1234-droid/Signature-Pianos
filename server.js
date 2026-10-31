const http = require('http');
const fs = require('fs');
const path = require('path');

// Local static preview only (no api/ functions). Bound to loopback so the
// working tree (.env.local included) is never reachable from the network.
const PORT = 5173;
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
};

http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0]);
  } catch {
    res.writeHead(400); return res.end('Bad request');
  }
  if (urlPath === '/') urlPath = '/index.html';
  // as vercel.json's rewrites do
  if (urlPath === '/piano-rental') urlPath = '/piano-rental/index.html';
  else if (/^\/piano-rental\/[a-z0-9-]+$/.test(urlPath)) urlPath += '.html';

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
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}).listen(PORT, HOST, () => {
  console.log(`Signature Pianos → http://${HOST}:${PORT}`);
});
