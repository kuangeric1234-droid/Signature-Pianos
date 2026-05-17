# Signature Pianos

Melbourne's piano house — marketing site for a second-hand piano reseller with curated Yamaha listings, AI-powered piano matching, and a verified teacher directory.

> _Find the piano that moves you._

## Stack

- **Static HTML / CSS / vanilla JS** — single `index.html` for the marketing site
- **GSAP 3 + ScrollTrigger** — scroll-driven hero animations (3-act: opening → zoom → playable)
- **Tone.js** — playable piano keyboard (88 keys, A0–C8) on the close-up frame
- **Nano Banana + Seedance (Higgsfield)** — generated keyframes and clip animations

## Running locally

The project includes a tiny Node static server (no dependencies):

```bash
node server.js
# → http://localhost:5173
```

Or use any static server pointed at the project root.

## Project structure

```
/index.html              ← the entire site
/parts/
  frames/                ← 120 webp frames for the hero piano opening
  frames-d/              ← 80 webp frames for the zoom into the keys
  clip-*.mp4             ← original Seedance video clips (source material)
  piano-04-open.png      ← Nano Banana stills (source material)
/server.js               ← local dev server
/SIGNATURE_PIANOS.md     ← project brief
```

## Tuning the playable keys overlay

The 88-key click-target overlay is positioned via CSS variables on `.playable-keys`:

```css
top, bottom, left, right  /* keyboard bounding box, % of stage */
--tilt                    /* Z rotation (twist) */
--depth                   /* X rotation (forward/back) */
--curve                   /* parabolic Y offset for perspective bow */
```

Visit `?debug` in the URL to open a live tuner panel with sliders for all 6 knobs.

## Roadmap

- Inner pages — instruments catalogue, individual piano product, teacher directory, buyer's guide
- CMS for inventory + teacher profiles (Sanity or simple JSON)
- Teacher portal at `portal.signaturepianos.com`
- Admin portal at `app.signaturepianos.com`
- Cart/checkout for digital pianos

---

© 2026 Signature Pianos
