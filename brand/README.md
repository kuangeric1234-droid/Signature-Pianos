# Signature Pianos, Brand kit

Created 19 September 2026. Laid out like the 20-80 Solutions kit (`2080 Solutions/brand/`) so the two can be
found the same way. The rules are in `BRAND-GUIDELINES.md`; the designed version is the PDF in `00. Brand guidelines`.

```
BRAND-GUIDELINES.md          The rules in plain text: logo, colour, type, photography, voice, stationery
tokens.css                   Every colour, type size and motion value as CSS variables, plus .sp-display / .sp-script / .sp-button
Brand Assets/
  00. Brand guidelines/      SignaturePianos_Brand Guidelines_19-09-26.pdf  (16 pages, A4 landscape)
                             src/: guidelines.html, assets/, previews/ (one PNG per page)
  01. Logo/                  The lockup: "Signature" script over "PIANOS"
    01. Ink / 02. Ivory / 03. Black / 04. White     each as .svg, .png (3000 px, transparent), .pdf (vector)
  02. Wordmark/              "Signature" alone, same colours and formats
  03. Monogram/              The script S in the arch, same colours and formats
    05. Tiles/               Ink, Felt and Ivory square tiles (.svg) and 1080 px avatars
      Icons/                 favicon.svg, favicon-16/32/48.png, apple-touch-icon.png, icon-192.png, icon-512.png
Communication assets/
  Letterhead/                SignaturePianos_Letterhead.pdf (sample letter + blank sheet), .docx (Word), src/
  Business card/             SignaturePianos_Business Card_90x55_bleed.pdf (front + back, 3 mm bleed), src/
  Email signature/           signature.html, signature-logo@2x.png, preview.png
  Buyer guide/               The Yamaha buyer's guide (33-page A4 PDF), its source, drawings and sourced research
Fonts/
  Italianno/                 Script. The original TTF, Web/ woff2, OFL.txt
  Noto Serif Display/        Display. Variable originals; Static/ and Web/ hold the ExtraCondensed (width 62.5) Regular and Medium
  Jost/                      Text. Variable originals; Static/ and Web/ hold Light, Regular, Medium, Italic
src/                         The scripts that rebuild everything (see below)
```

## Things to know

- **The logo is the website header, outlined.** There was no logo file anywhere: the site set "Signature
  Pianos" as live text in Italianno and Jost. `src/build_logo.py` shapes the same text with HarfBuzz at the
  site's proportions (PIANOS at 10 : 58, tracked 0.6 em) and converts it to paths, so the files need no fonts
  and match the header exactly.
- **The monogram is new.** The script S inside the arch, the shape the homepage uses to frame photographs.
  It is the only element this kit invented; everything else is taken from the site. If the owners want a
  different mark, it is one function in `build_logo.py`.
- **Colours and type come from the homepage** (`index.html`, `body.home` tokens). Other pages still load the
  older theme layer (`css/signature-theme.css`: porcelain, steel, Josefin Sans) and the admin uses DM Sans.
  Those are listed as retired in the guidelines. Move them to `tokens.css` as pages are touched.
- **Fonts are free.** Italianno, Noto Serif Display and Jost are all SIL Open Font License: install, embed and
  send to printers. Install `Fonts/Jost/Static/*.ttf` before typing into the Word letterhead.
- **No CMYK masters.** Everything is RGB; SVG and PDF are vector and scale to any size. CMYK values in the
  guidelines are conversions, so the printer should proof against the RGB master.
- **Still missing:** the ABN (letterhead and invoices), licence records for the hall and stage photographs,
  and staff names and roles for more business cards (the sample card is Eric's).
- **This folder is not deployed.** `.vercelignore` keeps `brand/` off the website. The one file the site
  needs, the email-signature logo, is copied to `images/brand/signature-logo@2x.png`.

## Rebuilding

From the repo root, with Python 3.12 and `pip install fonttools uharfbuzz python-docx pillow playwright`:

```
python brand/src/build_logo.py      # SVG marks from the fonts
python brand/src/export_marks.py    # PNG, PDF, icons, and the PNGs the stationery embeds
python brand/src/build_docx.py      # the Word letterhead
python brand/src/render_docs.py     # letterhead, card, signature preview and guidelines PDFs
```

To change the guidelines, edit `Brand Assets/00. Brand guidelines/src/guidelines.html` and run
`python brand/src/render_docs.py guidelines`. Its `assets/` folder holds copies of the marks, fonts and
photos so the page also works on its own (it is published as a private Artifact).

## The Claude skill

`.claude/skills/signature-pianos-brand/SKILL.md` loads these rules into any Claude Code session in this repo
that is designing, writing or producing something for Signature Pianos. It points back here for detail.
