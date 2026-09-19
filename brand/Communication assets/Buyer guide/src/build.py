"""Build the Signature Pianos Yamaha buyer's guide.

guide.src.html is the hand-written page. Every <!--draw:NAME--> in it is replaced with an inline
SVG from draw.py (inline, so the drawings use the page's own fonts), giving guide.html, which is
then printed to PDF with Chromium.

Run from the repo root:  python "brand/Communication assets/Buyer guide/src/build.py"
"""
import re
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

SRC = Path(__file__).resolve().parent
OUT_PDF = SRC.parent / 'SignaturePianos_Yamaha Buyers Guide_2026.pdf'
sys.path.insert(0, str(SRC))
import draw  # noqa: E402

# Heights and lengths in mm, from the research notes in ../research/
DRAWINGS = {
    'section': lambda: draw.upright_section(),
    'u121': lambda: draw.upright(1210, 1530, 'A 121 cm Yamaha upright'),
    'u131': lambda: draw.upright(1310, 1530, 'A 131 cm Yamaha upright'),
    'grand-c3': lambda: draw.grand_plan(1860, 1490, 'A Yamaha C3 grand'),
    'lineup-yu': lambda: draw.upright_lineup([('YU1', 1210), ('YU3 · YU5', 1310)]),
    'family': lambda: draw.family_tree(),
    'u1-vintage': lambda: draw.upright(1210, 1500, 'A 1970s–90s Yamaha U1-line upright'),
    'u3-vintage': lambda: draw.upright(1310, 1540, 'A 1970s–80s Yamaha U3-line upright'),
    'lineup-all': lambda: draw.upright_lineup([('U1 · YU11', 1210), ('U3 · YU33', 1310)]),
    'u131-wide': lambda: draw.upright(1310, 1560, 'A Yamaha UX50A or UX500'),
    'grand-lineup': lambda: draw.grand_lineup([('GB1K', 1510, 1460), ('C1 · G1', 1610, 1490), ('C2', 1730, 1490), ('C3', 1860, 1490), ('C5', 2000, 1490), ('C6', 2120, 1540), ('C7', 2270, 1550)]),
}


def register(name, fn):
    DRAWINGS[name] = fn


def inline(html):
    def sub(m):
        name = m.group(1)
        if name not in DRAWINGS:
            raise KeyError(f'no drawing called {name}')
        return DRAWINGS[name]()
    return re.sub(r'<!--draw:([\w-]+)-->', sub, html)


def web_pdf():
    """The print PDF carries full-size photos (about 20 MB). The web edition resamples them to 150 dpi
    (about 2.5 MB) and is the copy the website serves and the guide email links to:
    media/guides/signature-pianos-yamaha-buyers-guide.pdf. Its cover goes in the email as a JPEG."""
    import pymupdf
    from PIL import Image
    web = OUT_PDF.with_name(OUT_PDF.stem + '_web.pdf')
    doc = pymupdf.open(OUT_PDF)
    doc.rewrite_images(dpi_threshold=160, dpi_target=150, quality=78)
    doc.save(web, garbage=4, deflate=True, deflate_fonts=True)
    site = SRC.parents[3] / 'media' / 'guides'
    site.mkdir(parents=True, exist_ok=True)
    (site / 'signature-pianos-yamaha-buyers-guide.pdf').write_bytes(web.read_bytes())
    cover = site / 'buyers-guide-cover.jpg'
    doc[0].get_pixmap(dpi=96).save(str(cover.with_suffix('.png')))
    img = Image.open(cover.with_suffix('.png')).convert('RGB')
    img.thumbnail((560, 800))
    img.save(cover, quality=84, optimize=True, progressive=True)
    cover.with_suffix('.png').unlink()
    print(f'wrote {web.name} ({web.stat().st_size / 1e6:.1f} MB) and media/guides/ for the website')


def main(pdf=True):
    html = inline((SRC / 'guide.src.html').read_text(encoding='utf-8'))
    (SRC / 'guide.html').write_text(html, encoding='utf-8')
    print('wrote guide.html')
    if not pdf:
        return
    prev = SRC / 'previews'
    prev.mkdir(exist_ok=True)
    for old in prev.glob('page-*.png'):
        old.unlink()
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(device_scale_factor=2, viewport={'width': 794, 'height': 1123})
        pg.goto((SRC / 'guide.html').as_uri())
        pg.wait_for_load_state('networkidle')
        pg.evaluate('document.fonts.ready')
        pg.wait_for_timeout(400)
        pg.pdf(path=str(OUT_PDF), width='210mm', height='297mm', print_background=True, prefer_css_page_size=True)
        print('wrote', OUT_PDF.name)
        web_pdf()
        # flag any page whose content runs past its bottom edge
        over = pg.evaluate('''Array.from(document.querySelectorAll('section.page')).map((s,i)=>{
            const r=s.getBoundingClientRect(); let worst=0;
            s.querySelectorAll('*').forEach(e=>{const b=e.getBoundingClientRect(); if(b.height&&getComputedStyle(e).position!=='absolute') worst=Math.max(worst,b.bottom-r.bottom);});
            return worst>1?[i+1,Math.round(worst)]:null}).filter(Boolean)''')
        if over:
            print('OVERFLOW (page, px past the edge):', over)
        for i, el in enumerate(pg.query_selector_all('section.page'), 1):
            el.screenshot(path=str(prev / f'page-{i:02d}.png'))
        print('previews:', i)
        b.close()


if __name__ == '__main__':
    main(pdf='--html' not in sys.argv)
