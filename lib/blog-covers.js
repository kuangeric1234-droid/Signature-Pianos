/*
 * Cover images for Journal posts. Every post needs one to be published (the
 * blog_posts_published_needs_image constraint), so both writers, the admin
 * "Generate draft" / auto-writer (lib/blog.js) and the SEO engine
 * (lib/seo-engine.js), attach one when they save a draft.
 *
 * The library is the site's own photography. `about` is what's in the frame,
 * used to match a photo to a post's title and keywords. Keep this list in
 * step with SITE_COVERS in admin/marketing.html.
 */

const COVERS = [
  { url: '/media/blog/brand-new-yamaha-u3-australia.jpg', about: 'black yamaha upright piano new u3 u1 buying' },
  { url: '/media/blog/yamaha-u1-vs-u3.jpg', about: 'young pianist playing yamaha upright piano student lessons practice compare' },
  { url: '/media/blog/second-hand-piano-checklist-melbourne.jpg', about: 'inside piano interior strings hammers inspection checklist second hand used condition' },
  { url: '/media/blog/grey-market-yamaha-pianos.jpg', about: 'wooden yamaha upright piano import grey market japan used' },
  { url: '/media/home/grand-c3x.webp', about: 'yamaha c3x grand piano black' },
  { url: '/media/home/grand-shigeru-kawai.webp', about: 'shigeru kawai grand piano' },
  { url: '/media/home/grand-bosendorfer.webp', about: 'bosendorfer grand piano european luxury' },
  { url: '/media/home/stage-cfx.webp', about: 'yamaha cfx concert grand piano stage performance' },
  { url: '/media/home/stage-cf.webp', about: 'concert grand piano stage performance recital' },
  { url: '/media/home/hall-japan.webp', about: 'japan piano hall showroom import factory' },
  { url: '/media/home/hall-stage.webp', about: 'concert hall stage performance' },
  { url: '/media/home/hands.webp', about: 'hands playing piano keys learning lessons touch' },
  { url: '/media/home/strings.webp', about: 'piano strings tuning pins tuner tuning soundboard humidity' },
  { url: '/media/home/detail-action.webp', about: 'piano action mechanism regulation service repair maintenance' },
  { url: '/media/home/detail-hammers.webp', about: 'piano hammers felt voicing tone repair restoration' },
  { url: '/media/home/detail-keys-ebony.webp', about: 'piano keys black ebony keyboard' },
  { url: '/media/home/detail-keys-walnut.webp', about: 'piano keys walnut wood cabinet timber care humidity' },
  { url: '/media/home/detail-pedals.webp', about: 'piano pedals brass moving delivery' },
  { url: '/media/home/unit-u3h.webp', about: 'yamaha u3h upright piano used vintage u3 u3m compare' },
  { url: '/media/home/unit-yu33.webp', about: 'yamaha yu33 upright piano used price' },
  { url: '/media/home/unit-ux30a.webp', about: 'yamaha ux30a upright piano used x-support' },
  { url: '/media/home/unit-b121.webp', about: 'yamaha b121 upright piano entry beginner budget' },
  { url: '/media/home/unit-w3a-mahogany.webp', about: 'yamaha w3a mahogany upright piano furniture wood' },
  { url: '/media/home/unit-yus5-walnut.webp', about: 'yamaha yus5 walnut upright piano premium' },
  { url: '/media/home/unit-bosendorfer-130.webp', about: 'bosendorfer 130 upright piano european' },
]

const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'in', 'to', 'for', 'is', 'it', 'how', 'what', 'much', 'does', 'do', 'your', 'you', 'vs', 'piano', 'pianos', 'australia', 'melbourne', 'cost', 'need'])
const words = (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w))

// Uploaded covers live in the public blog-images bucket.
function isBucketUrl(url) {
  const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
  return !!base && url.startsWith(`${base}/storage/v1/object/public/blog-images/`)
}

// A cover a writer may set: one from the library or an uploaded one.
function isKnownCover(url) {
  const u = String(url || '').trim()
  return COVERS.some((c) => c.url === u) || isBucketUrl(u)
}

/*
 * pickCover(post, usedUrls) — the library photo that best fits the post's
 * title, keywords and tags, preferring photos no other post uses yet.
 */
function pickCover({ title, keywords, tags } = {}, usedUrls = []) {
  const want = new Set(words([title, ...(keywords || []), ...(tags || [])].join(' ')))
  const used = new Map()
  for (const u of usedUrls) if (u) used.set(u, (used.get(u) || 0) + 1)
  let best = null
  for (const [i, c] of COVERS.entries()) {
    const match = words(c.about).filter((w) => want.has(w)).length
    // A match outweighs reuse, but an unused photo wins a tie, then list order.
    const score = match * 10 - (used.get(c.url) || 0) * 6 - i * 0.01
    if (!best || score > best.score) best = { url: c.url, score }
  }
  return best.url
}

module.exports = { COVERS, pickCover, isKnownCover }
