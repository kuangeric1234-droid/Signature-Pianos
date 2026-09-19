"""Render the HTML sources in the kit to PDF (and PNG previews) with Chromium.

Run from the repo root:  python brand/src/render_docs.py [letterhead|card|signature|guidelines ...]
With no arguments every document is rendered. Pages are loaded over file:// so the
relative font and image paths in each src/ folder resolve.
"""
import os
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent  # brand/
COMMS = ROOT / 'Communication assets'
GUIDE = ROOT / 'Brand Assets' / '00. Brand guidelines'
DATE = '19-09-26'


def pdf(page, src, out, w, h):
    page.goto(src.as_uri())
    page.wait_for_load_state('networkidle')
    page.evaluate('document.fonts.ready')
    page.wait_for_timeout(300)
    page.pdf(path=str(out), width=w, height=h, print_background=True, prefer_css_page_size=True)
    print('wrote', out.relative_to(ROOT))


def shots(page, src, sel, out_pattern, scale_note=''):
    page.goto(src.as_uri())
    page.wait_for_load_state('networkidle')
    page.evaluate('document.fonts.ready')
    page.wait_for_timeout(300)
    for i, el in enumerate(page.query_selector_all(sel), 1):
        out = Path(str(out_pattern).format(i=i))
        el.screenshot(path=str(out))
        print('wrote', out.relative_to(ROOT), scale_note)


def main(which):
    with sync_playwright() as p:
        b = p.chromium.launch()
        if 'letterhead' in which:
            d = COMMS / 'Letterhead'
            pg = b.new_page(device_scale_factor=2, viewport={'width': 794, 'height': 1123})
            pdf(pg, d / 'src' / 'letterhead.html', d / 'SignaturePianos_Letterhead.pdf', '210mm', '297mm')
            shots(pg, d / 'src' / 'letterhead.html', '.sheet', d / 'src' / 'preview-{i}.png')
            pg.close()
        if 'card' in which:
            d = COMMS / 'Business card'
            pg = b.new_page(device_scale_factor=4, viewport={'width': 400, 'height': 300})
            pdf(pg, d / 'src' / 'business-card.html', d / 'SignaturePianos_Business Card_90x55_bleed.pdf', '96mm', '61mm')
            shots(pg, d / 'src' / 'business-card.html', '.card', d / 'src' / 'preview-{i}.png')
            pg.close()
        if 'signature' in which:
            d = COMMS / 'Email signature'
            html = (d / 'signature.html').read_text(encoding='utf-8')
            # preview with the logo loaded from disk, since the site copy is not deployed yet
            html = html.replace('https://signaturepianos.com.au/images/brand/signature-logo@2x.png', 'signature-logo@2x.png')
            tmp = d / '_preview.html'
            tmp.write_text('<body style="margin:0;padding:28px;background:#fff">' + html + '</body>', encoding='utf-8')
            pg = b.new_page(device_scale_factor=2, viewport={'width': 560, 'height': 260})
            pg.goto(tmp.as_uri()); pg.wait_for_timeout(300)
            pg.screenshot(path=str(d / 'preview.png'))
            print('wrote', (d / 'preview.png').relative_to(ROOT))
            pg.close(); tmp.unlink()
        if 'guidelines' in which:
            src = GUIDE / 'src' / 'guidelines.html'
            pg = b.new_page(device_scale_factor=2, viewport={'width': 1123, 'height': 794})
            pdf(pg, src, GUIDE / f'SignaturePianos_Brand Guidelines_{DATE}.pdf', '297mm', '210mm')
            prev = GUIDE / 'src' / 'previews'
            prev.mkdir(exist_ok=True)
            shots(pg, src, 'section.page', prev / 'page-{i:02d}.png')
            pg.close()
        b.close()


if __name__ == '__main__':
    args = sys.argv[1:] or ['letterhead', 'card', 'signature', 'guidelines']
    main(args)
