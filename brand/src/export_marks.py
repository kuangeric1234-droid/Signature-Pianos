"""Export every SVG mark to PNG (3000 px on the long side, transparent) and vector PDF,
plus the favicon / app icon / avatar set and the small PNGs the letterhead and email
signature embed. Chromium (Playwright) does the rendering so the output matches a browser.

Run from the repo root after build_logo.py:  python brand/src/export_marks.py
"""
import glob
import os
import re
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # brand/
ASSETS = os.path.join(ROOT, 'Brand Assets')
COMMS = os.path.join(ROOT, 'Communication assets')
LONG = 3000


def size_of(svg_text):
    w, h = re.search(r'viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"', svg_text).groups()
    return float(w), float(h)


def page_for(svg_text, w, h, bg='transparent'):
    return (f'<html><head><style>html,body{{margin:0;padding:0;background:{bg}}}'
            f'svg{{display:block;width:{w}px;height:{h}px}}@page{{size:{w}px {h}px;margin:0}}</style></head>'
            f'<body>{svg_text}</body></html>')


def main():
    svgs = sorted(glob.glob(os.path.join(ASSETS, '0[1-3]. *', '0[1-4]. *', '*.svg')))
    tiles = sorted(glob.glob(os.path.join(ASSETS, '03. Monogram', '05. Tiles', '*.svg')))
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for path in svgs:
            src = open(path, encoding='utf-8').read()
            vw, vh = size_of(src)
            k = LONG / max(vw, vh)
            w, h = round(vw * k), round(vh * k)
            pg = browser.new_page(viewport={'width': w, 'height': h})
            pg.set_content(page_for(src, w, h))
            pg.screenshot(path=path[:-4] + '.png', omit_background=True)
            # PDF at a sensible physical size (the long side = 200 mm); vectors are kept
            pw, ph = (200, 200 * vh / vw) if vw >= vh else (200 * vw / vh, 200)
            pg.set_content(page_for(src, f'{pw:.2f}', f'{ph:.2f}').replace('px', 'mm'))
            pg.pdf(path=path[:-4] + '.pdf', width=f'{pw:.2f}mm', height=f'{ph:.2f}mm',
                   print_background=False, page_ranges='1')
            pg.close()
            print('exported', os.path.relpath(path, ROOT)[:-4], '.png .pdf')

        # Tiles: favicon, app icons, social avatar
        fav = os.path.join(ASSETS, '03. Monogram', '05. Tiles', 'Icons')
        os.makedirs(fav, exist_ok=True)
        for path in tiles:
            src = open(path, encoding='utf-8').read()
            name = os.path.basename(path)[:-4]
            for px in ((1080,) if 'Ink' not in name else (16, 32, 48, 180, 192, 512, 1080)):
                pg = browser.new_page(viewport={'width': px, 'height': px})
                pg.set_content(page_for(src, px, px))
                label = {16: 'favicon-16', 32: 'favicon-32', 48: 'favicon-48', 180: 'apple-touch-icon',
                         192: 'icon-192', 512: 'icon-512'}.get(px)
                out = os.path.join(fav, f'{label}.png') if label else path[:-4] + '_Avatar_1080.png'
                pg.screenshot(path=out)
                pg.close()
            print('exported', name, 'tiles')
        # favicon.svg is the ink tile as-is
        with open(os.path.join(fav, 'favicon.svg'), 'w', encoding='utf-8') as f:
            f.write(open(os.path.join(ASSETS, '03. Monogram', '05. Tiles', 'SignaturePianos_Tile_Ink.svg'),
                         encoding='utf-8').read())

        # Small PNGs that documents embed
        logo_ink = open(os.path.join(ASSETS, '01. Logo', '01. Ink', 'SignaturePianos_Logo_Ink.svg'), encoding='utf-8').read()
        vw, vh = size_of(logo_ink)
        for folder, fname, width in ((os.path.join(COMMS, 'Email signature'), 'signature-logo@2x.png', 360),
                                     (os.path.join(COMMS, 'Letterhead', 'src'), 'letterhead-logo.png', 1200)):
            os.makedirs(folder, exist_ok=True)
            h = round(width * vh / vw)
            pg = browser.new_page(viewport={'width': width, 'height': h})
            pg.set_content(page_for(logo_ink, width, h))
            pg.screenshot(path=os.path.join(folder, fname), omit_background=True)
            pg.close()
            print('exported', fname)
        browser.close()


if __name__ == '__main__':
    main()
