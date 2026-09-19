# The Yamaha buyer's guide

A 33-page A4 booklet for customers: every Yamaha upright and grand likely to arrive as a Japanese import, from
1970 to today, typeset in the Signature Pianos brand. It replaces the unbranded "Classic Pianos" guide
(`Downloads/Classic Piano Buyer guide.pdf`), whose model years and dimensions were partly wrong (see
`research/vintage-uprights.md`, "Corrections to the old Classic Pianos guide").

```
SignaturePianos_Yamaha Buyers Guide_2026.pdf   the guide, A4 portrait, print-ready (no bleed)
src/guide.src.html                             the pages, hand-written; edit this
src/build.py                                   inlines the drawings and prints guide.html to the PDF
src/draw.py                                    scale drawings: uprights, grands, the cut-away, the family tree
src/assets/                                    fonts, logos and the real stock photos the pages use
src/previews/                                  one PNG per page, rebuilt each time
research/                                      the sourced facts behind every page, with URLs
```

## Rebuild

From the repo root: `python "brand/Communication assets/Buyer guide/src/build.py"`. It prints a warning if
any page's content runs past the bottom edge. Page numbers, the contents list and every "see page N"
reference are worked out when it builds, so pages can be added or moved freely.

## Keeping it true

- Production dates come from Yamaha Japan's own model lists; dimensions of discontinued models come from
  Japanese dealer listings. The research files say which is which and mark anything unverified.
- The price ranges on "What to budget" are indicative, drawn from Victorian and NSW asking prices in September
  2026 and the old guide's prices. Review them before each print run.
- The only Signature services the guide promises are the ones on the website: white-glove delivery, the
  10-year warranty, the first tuning 3–4 weeks after delivery, and delivery booked in the customer portal.
- Photos are our own stock photographed in Japan (`media/home/unit-*.webp`, `grand-c3x.webp`). Every other
  illustration is drawn by `draw.py`; no Yamaha press images are used.
