# Signature Pianos · Brand guidelines

Version 1, 19 September 2026. The designed version of this document is
`Brand Assets/00. Brand guidelines/SignaturePianos_Brand Guidelines_19-09-26.pdf` (16 pages, A4 landscape).
This file has the same rules in plain text, for anyone building a page, writing a letter or briefing a printer.

Each element is marked **[site]** when it was taken from the live website, or **[new]** when this kit added it.

---

## 1. The brand

**Brand line:** Hand-picked in Japan. Checked in Melbourne.

Signature Pianos sells new and pre-loved Japanese acoustic pianos (Yamaha and Kawai, with the occasional
European piano through the same buyers) from a showroom at 63 Blackburn Road, Mount Waverley. Every piano
is chosen in Japan, photographed there before import, imported direct and checked in the Melbourne
workshop before it goes on the floor. Digital pianos come later and stay out of the brand's front door
until they are in stock.

**Who it is for**

| Audience | What they need from us |
|---|---|
| Parents buying for a child who has started lessons (the largest group; mostly on phones, often at night) | Reassurance, a clear recommendation, one easy next step, no jargon |
| Adults coming back to the piano | Quality signals, honest detail, no pressure |
| Serious students | Exact specs: maker, model, year, finish, condition |
| Gift buyers | Guidance and a sense of occasion |

**How it should feel:** light, quiet, unhurried. Like a concert hall in daylight before anyone arrives:
pale walls, one instrument, room to look at it. The pianos do the talking; the page stays out of their way.
Not the black-and-gold showroom (the old site), not a music shop, not an agency showreel.

**The one rule:** lead with Japan. Whatever a page, letter or post says first, the fact that each piano is
chosen in Japan and checked in Melbourne is never more than a line away. When a question is not answered
here, go lighter, quieter and simpler.

---

## 2. Logo

### The lockup [site]

"Signature" in Italianno over "PIANOS" in Jost Regular, tracked 0.6 em, centred. The descriptor is set at
10 : 58 of the script size, and its capitals sit 0.33 × the script size below the script baseline, clear of
the tail of the g. This is the website header drawn as vector outlines (HarfBuzz-shaped, so the joins match
the browser), so it needs no fonts installed. **Never retype it.** Use the master files.

Files: `Brand Assets/01. Logo/{01. Ink, 02. Ivory, 03. Black, 04. White}/SignaturePianos_Logo_*.{svg,png,pdf}`
(PNG is 3000 px wide, transparent; PDF is vector, 200 mm wide).

| Version | Use on |
|---|---|
| Ink #16222E | Key Ivory, White, Mist, Mist Light |
| Key Ivory #F3F0E9 | Ink, Hammer Felt |
| White | Photographs, always with a scrim of at least 35% Ink behind it |
| Black | Single-colour print only: stamps, engraving, newspaper |

**Clear space:** x = the height of the capitals in PIANOS. Keep 2x clear on every side, measured from the
outermost ink (including the g's tail).

**Minimum size:** 120 px wide on screen, 30 mm in print. Below 150 px the website sets PIANOS at 9 px so it
stays readable (see the mobile header in `css/signature-theme.css`). Smaller than that, use the monogram.

### Wordmark [site]

"Signature" alone, for places that already say "pianos" nearby: a fallboard decal, a piano cover, the hero of
a page about pianos. Never the only mark on a letterhead, card or invoice; those carry the full lockup.
Files: `Brand Assets/02. Wordmark/`.

### Monogram [new]

The Italianno S inside an arch (3 : 4, semicircular top, hairline 1.6% of the arch width). The arch is the
shape the website uses to frame photographs. Use it for the favicon, social avatars, the foot of the
letterhead, the card back, stamps and seals. Files: `Brand Assets/03. Monogram/`.

**Tiles** (`03. Monogram/05. Tiles/`): a solid arch on a square with the S knocked out, with a hairline stroke
added to the S so it survives at 32 px.
- Ink tile: favicon, app icon, Google Business Profile. `Icons/` holds favicon.svg, favicon-16/32/48.png,
  apple-touch-icon.png (180), icon-192.png, icon-512.png.
- Felt tile: Instagram and Facebook avatars (1080 px PNG).
- Ivory tile: where the surrounding ground is already dark.

### Misuse: never

1. Retype the logo in another script or sans.
2. Recolour it, gold above all. Only Ink, Key Ivory, White or Black.
3. Stretch or squash it.
4. Move, enlarge or reset PIANOS.
5. Add a shadow, glow, outline, bevel or gradient.
6. Put it on a busy photograph without a scrim.
7. Set it in a pale colour that cannot be read (Mist on Key Ivory is 1.4 : 1).
8. Rotate it, set it on a curve or animate it letter by letter.

---

## 3. Colour [site]

Taken from the piano: Ink is the lacquer, Key Ivory the keys, Mist the light in a hall, Hammer Felt the strip
of red felt under the fallboard. One accent. **There is no gold.**

| Name | Hex | RGB | CMYK (conversion) | Role | Never |
|---|---|---|---|---|---|
| Ink | #16222E | 22 34 46 | 52 26 0 82 | Logo, headlines, buttons. Our black. | Pure #000000 on screen |
| Ink Soft | #3A4855 | 58 72 85 | 32 15 0 67 | Body text, labels, captions | The logo or buttons |
| Key Ivory | #F3F0E9 | 243 240 233 | 0 1 4 5 | The page ground | Swapped for a cool white |
| Ivory Deep | #E9E5DB | 233 229 219 | 0 2 6 9 | Panels, image frames while photos load | Text |
| Mist | #BCCEDA | 188 206 218 | 14 6 0 15 | One large shape per page: the arch, a band | Text or the logo |
| Mist Light | #DCE6ED | 220 230 237 | 7 3 0 7 | Alternate section ground, the top bar | Two Mist sections in a row |
| Hammer Felt | #4A1520 | 74 21 32 | 0 72 57 71 | The accent: a block, a map pin, a short rule, the card back, one short label line | Buttons, links, body text |
| White | #FFFFFF | 255 255 255 | 0 0 0 0 | Type and logo over photos, button labels, letter paper | A page ground on screen |

CMYK values are straight conversions. Have the printer proof against the RGB master.

**Proportion** (by area of flat colour; photographs sit on top): 60 Key Ivory · 20 Mist Light · 5 Mist ·
10 Ink · 5 Hammer Felt.

**Contrast** (WCAG): Ink on Key Ivory 14.2 : 1 · Ink on White 16.1 · Ink on Mist 10.0 · Ink on Mist Light
12.7 · Ink Soft on Key Ivory 8.2 · Ink Soft on Mist Light 7.4 · Key Ivory on Hammer Felt 13.0 · Key Ivory on
Ink 14.2. Every text pairing passes AAA. Mist on Key Ivory is 1.4 : 1, so it never carries text.

**Retired, replace on sight:** gold #B8935A and #D4B483 (use Ink for buttons, Felt for accents) · studio
black #0E0E0D (pages are Key Ivory) · porcelain #FAFBFB (becomes Key Ivory) · steel #2D628C and slate
#5E6F80 from the interim theme layer (become Ink and Ink Soft).

---

## 4. Typography [site]

Three faces, three jobs. All three are SIL Open Font License: free to install, embed and send to printers.
Files, with licences, in `Fonts/` (variable originals, `Static/` TTFs for Word and printers, `Web/` woff2).

| Role | Face | Weight | Case | Leading | Tracking | Use | Fallback |
|---|---|---|---|---|---|---|---|
| Script | Italianno | 400 | As written, never capitals | 100% | 0 | The wordmark, and one crossing word or phrase (three words at most) per heading. Smallest 40 px on screen, 24 pt in print. | Snell Roundhand, Apple Chancery, cursive |
| Display | Noto Serif Display at width 62.5 (ExtraCondensed) | Medium 500 | Always capitals | 86–90% | −0.5% | Headlines, piano names on cards, big numbers | Bodoni Moda, Didot, Georgia, serif |
| Text | Jost | 400 reading, 500 buttons and names, 300 print body | Sentence case; labels in capitals | 170% on screen, 155% in print | 0; labels 0.3 em; buttons 0.2 em; links 0.18 em | Everything read | Helvetica Neue, Arial, sans-serif |

**Retired faces:** Cormorant Garamond (the old dark theme), Josefin Sans (interim theme layer), DM Sans
(admin). Replace them with Jost or the display face as pages are touched.

### The crossing heading

The website's one typographic device. Condensed capitals state the thing; a script word crosses underneath
to say how ("UPRIGHT PIANOS / hand-picked", "FIND A TEACHER / who fits"). Script and capitals are about the
same size, and the script is pulled up by 0.32 em so it overlaps. One per section, never two on one screen
at the same size.

### Sizes

| Role | Screen | Print |
|---|---|---|
| Hero capitals | clamp(56px, 8.4vw, 152px), leading 90% | 60–80 pt |
| Section capitals | clamp(56px, 8.4vw, 150px), leading 86% | 34–48 pt |
| Crossing script | clamp(64px, 8vw, 138px), margin-top −0.32 em | Same size as the capitals |
| Card title | 30 px capitals | 14–18 pt |
| Body | 17 px, leading 170%, 44–60 characters a line | 9.5–10 pt, leading 155% |
| Lead paragraph | 17–21 px | 11–12 pt |
| Label | 12 px capitals, 0.3 em | 6.4 pt capitals, 0.2–0.3 em |
| Button | 12.5 px Jost Medium capitals, 0.2 em | n/a |

---

## 5. Photography

People trust a real photo of a real piano more than a beautiful photo of a different one.

| Pillar | Subjects | Tonality |
|---|---|---|
| **The piano itself** (most important) | The actual serial-numbered piano for sale, photographed in Japan before import: straight on, whole instrument, lid closed, keys visible | Shot where it stands, natural light, no retouching beyond exposure |
| **The craft** | Action, hammers, strings, pedals, the felt | Close, sharp, warm natural light |
| **The hall** | One piano in a large calm room | Heroes and section openers only, and only with a confirmed licence |
| **The hands** | Someone playing, a lesson, a first try in the showroom | Real customers and teachers, with written permission |

**Never:** stock families smiling at a keyboard · a piano shown as ours that is not in stock · gold light
leaks, lens flare, heavy filters · the black studio backdrop of the old site · AI-generated pianos presented
as real · watermarks, phone-flash glare, clutter left in frame.

---

## 6. Voice

We sound like a good piano technician explaining things to a parent: patient, exact, never selling.

| Rule | Say | Not |
|---|---|---|
| 1. Lead with Japan | "Hand-picked in Japan, checked in our Mount Waverley workshop." | "Melbourne's best piano store." |
| 2. Name the piano | "Yamaha YUS5, 2008, walnut. In the showroom now." | "Stunning premium upright in amazing condition!" |
| 3. Explain once, simply | "A silent system lets you play with headphones, so the house stays quiet." | "Features SH2 silent technology with CFX binaural sampling." |
| 4. Reassure with facts | "10-year warranty. First tuning included, three to four weeks after delivery." | "Total peace of mind, guaranteed." |
| 5. Real people, real reviews | A Google review quoted word for word, with the reviewer's name as it appears there | Invented testimonials, or reviews rewritten to sound better. Australian Consumer Law treats both as misleading. |
| 6. One next step | "Book a visit." One primary action per page, repeated at the end. | Three competing buttons in the hero |

**Words we use:** pre-loved · hand-picked · imported direct · checked in our workshop · showroom · play it ·
book a visit · first tuning included · white-glove delivery.

**Words we avoid:** used · second-hand · cheap · bargain · best · world-class · unbeatable · stunning ·
amazing · exclamation marks · "Buy now".

**House style:** Australian spelling (colour, centre, licence). Prices as $8,900 with no cents; "Price on
request" while a piano is in the workshop. Dates as 19 September 2026, times as 10 am, the phone as
0479 128 955. Pianos as maker, model, year, finish: Yamaha U3H, 1981, polished ebony.

**Promises we can make** (from the website): white-glove delivery, a 10-year warranty emailed on delivery,
the first tuning included three to four weeks after delivery, delivery booked and tracked in the customer
portal. Nothing beyond these without checking with the brand guardian.

---

## 7. Design in use

### Website

- **Ground:** Key Ivory. Mist Light for alternating sections. One large Mist shape per page.
- **Corners:** square everywhere (radius 0). The only curves are the arch (`border-radius: 100vw 100vw 0 0`)
  and the circle.
- **Header:** links left, the lockup centred, account and one Ink button right. Over the hero photograph
  everything turns white and the button turns white with Ink text.
- **Buttons:** filled Ink, Jost Medium 12.5 px capitals, 0.2 em, padding 18 × 32 px. On hover the fill fades
  to an outline over 0.4 s linear. One filled button per screen.
- **Text links:** capitals, 0.18 em, an arrow. On hover a hairline draws in underneath (0.6 s) and the arrow
  moves 6 px right.
- **The ring:** a 132 px circle with its label set around the edge, turning once every 22 s. Once per page,
  in the hero.
- **The arch:** a frame with a semicircular top for feature photos and the Mist shape that rises out of the
  hero. At most two per screen.
- **Cards:** no box. Photo, a hairline, the name in display capitals, one line of facts, one action.
- **Motion:** `cubic-bezier(.4, 0, .1, 1)` for movement, 0.4 s linear for colour and opacity. Headlines rise
  line by line; photos grow to full bleed. Never bounce, parallax on text, autoplay sound, or anything that
  ignores `prefers-reduced-motion`.
- **Tokens:** `brand/tokens.css` has every value above as a CSS variable.

### Stationery

| Item | Spec | Files |
|---|---|---|
| Letterhead | A4. Lockup 50 mm wide, 17 mm from the top, a 10 × 0.5 mm Hammer Felt rule under it. Body Jost 9.8 pt on 15 pt, Ink Soft, 28 mm side margins, text from 62 mm. Monogram (5 mm) and the address in 6.4 pt tracked capitals at the foot. | `Communication assets/Letterhead/` PDF, DOCX, `src/letterhead.html` |
| Business card | 90 × 55 mm with 3 mm bleed. Front: lockup on Key Ivory. Back: Key Ivory on Hammer Felt, the monogram, the brand line, name and contact. 400 gsm or heavier, uncoated. | `Communication assets/Business card/` |
| Email signature | Lockup at 150 px, name, contact, a hairline, the brand line in tracked Felt capitals. The logo loads from `https://signaturepianos.com.au/images/brand/signature-logo@2x.png`. | `Communication assets/Email signature/signature.html` |
| Paper | Uncoated white or natural ivory, 100–120 gsm for letters. | |

The Word letterhead needs Jost installed (`Fonts/Jost/Static/`) or Word substitutes its default face.

---

## 8. Guardians

Anything new that carries the logo is checked before it goes out.

- **Brand guardian:** Eric, eric@signaturepianos.com.au, 0479 128 955
- **Showroom:** 63 Blackburn Road, Mount Waverley VIC 3149 · info@signaturepianos.com.au · signaturepianos.com.au

**Still to add:** the ABN (for letterhead and invoices), and the licence records for the hall and stage
photographs used on the homepage.
