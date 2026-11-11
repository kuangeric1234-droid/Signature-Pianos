/*
 * POST /api/blog-preview: a Journal post drawn for the office's editor (lib/blog-preview.js says what and for whom).
 * The body is read here as it came, to its limit and no further, never through the platform's own parser.
 */
const { answer, MOST } = require('../lib/blog-preview')

function readRaw(req) {
  return new Promise((resolve) => {
    if (Number(req.headers['content-length'] || 0) > MOST) { req.resume(); return resolve(null) }
    const chunks = []
    let size = 0
    let over = false
    req.on('data', (c) => {
      if (over) return
      size += c.length
      if (size > MOST) { over = true; chunks.length = 0 } else chunks.push(c)
    })
    req.on('end', () => resolve(over ? null : Buffer.concat(chunks).toString('utf8')))
    req.on('error', () => resolve(''))
  })
}

module.exports = async (req, res) => {
  const raw = req.method === 'POST' ? await readRaw(req) : ''
  const a = answer({ method: req.method, origin: req.headers.origin, contentType: req.headers['content-type'], raw })
  for (const [k, v] of Object.entries(a.headers)) res.setHeader(k, v)
  if (!a.json) return res.status(a.status).end()
  return res.status(a.status).json(a.json)
}
