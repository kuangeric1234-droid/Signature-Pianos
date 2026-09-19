"""Build the Signature Pianos marks as outlined vector SVGs.

The lockup reproduces the website header (css/signature-theme.css, nav#nav .logo):
"Signature" in Italianno over "PIANOS" in Jost Regular, tracked 0.6em, at a
descriptor-to-script size ratio of 10:58. Text is shaped with HarfBuzz so the
script's joins and kerning match what a browser draws, then converted to paths
so the files need no fonts installed.

Run from the repo root:  python brand/src/build_logo.py
Then:                    python brand/src/export_marks.py   (PNG + PDF)
"""
import os
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # brand/
FONTS = os.path.join(ROOT, 'Fonts')
ASSETS = os.path.join(ROOT, 'Brand Assets')

SCRIPT_TTF = os.path.join(FONTS, 'Italianno', 'Italianno-Regular.ttf')
SANS_TTF = os.path.join(FONTS, 'Jost', 'Static', 'Jost-Regular.ttf')

COLOURS = {
    'Ink': '#16222E',
    'Ivory': '#F3F0E9',
    'Black': '#000000',
    'White': '#FFFFFF',
}

S = 580.0              # script size in SVG units (the site's 58px, x10)
DESC = S * 10 / 58     # descriptor size, the site's 10px
TRACK = 0.6            # descriptor tracking, em
GAP = 0.332 * S        # script baseline to descriptor cap top, measured off the site


class Face:
    def __init__(self, path):
        self.path = path
        self.tt = TTFont(path)
        self.glyphs = self.tt.getGlyphSet()
        self.order = self.tt.getGlyphOrder()
        self.upem = self.tt['head'].unitsPerEm
        blob = hb.Blob.from_file_path(path)
        self.hbfont = hb.Font(hb.Face(blob))

    def shape(self, text, size, tracking_em=0.0, features=None):
        """Return (list of (glyphname, x, y) in SVG units with y down, advance width)."""
        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()
        hb.shape(self.hbfont, buf, features or {'kern': True, 'liga': True, 'calt': True})
        k = size / self.upem
        x = 0.0
        out = []
        n = len(buf.glyph_infos)
        for i, (info, pos) in enumerate(zip(buf.glyph_infos, buf.glyph_positions)):
            out.append((self.order[info.codepoint], x + pos.x_offset * k, -pos.y_offset * k))
            x += pos.x_advance * k
            if i < n - 1:
                x += tracking_em * size
        return out, x, k

    def outline(self, placed, k, dx, baseline):
        """SVG path data and ink bounds for shaped glyphs at (dx, baseline)."""
        d = []
        xmin = ymin = float('inf')
        xmax = ymax = float('-inf')
        for name, gx, gy in placed:
            g = self.glyphs[name]
            # font units (y up) -> SVG units (y down)
            t = (k, 0, 0, -k, dx + gx, baseline + gy)
            pen = SVGPathPen(self.glyphs, ntos=lambda v: ('%.2f' % v).rstrip('0').rstrip('.'))
            g.draw(TransformPen(pen, t))
            cmds = pen.getCommands()
            if cmds:
                d.append(cmds)
            bp = BoundsPen(self.glyphs)
            g.draw(TransformPen(bp, t))
            if bp.bounds:
                a, b, c, e = bp.bounds
                xmin, ymin, xmax, ymax = min(xmin, a), min(ymin, b), max(xmax, c), max(ymax, e)
        return ''.join(d), (xmin, ymin, xmax, ymax)


def svg(paths, box, colour, title, pad=0.0):
    x0, y0, x1, y1 = box
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad
    w, h = x1 - x0, y1 - y0
    body = ''.join(f'<path d="{p}"/>' for p in paths if p)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0:.2f} {y0:.2f} {w:.2f} {h:.2f}" '
            f'width="{w:.0f}" height="{h:.0f}" role="img" aria-label="{title}">'
            f'<title>{title}</title><g fill="{colour}">{body}</g></svg>\n')


def union(*boxes):
    return (min(b[0] for b in boxes), min(b[1] for b in boxes),
            max(b[2] for b in boxes), max(b[3] for b in boxes))


def build():
    script = Face(SCRIPT_TTF)
    sans = Face(SANS_TTF)

    # Script: "Signature", baseline at y = 0
    placed, adv, k = script.shape('Signature', S)
    script_d, script_box = script.outline(placed, k, 0, 0)

    # Descriptor: "PIANOS", centred on the script's advance width like the site's flex column
    dplaced, dadv, dk = sans.shape('PIANOS', DESC, TRACK)
    cap_h = sans.tt['OS/2'].sCapHeight * dk
    d_base = GAP + cap_h
    desc_d, desc_box = sans.outline(dplaced, dk, (adv - dadv) / 2, d_base)

    lockup_box = union(script_box, desc_box)
    # the marks carry the whole brand name for screen readers
    marks = {
        'Logo': ([script_d, desc_d], lockup_box, 'Signature Pianos'),
        'Wordmark': ([script_d], script_box, 'Signature'),
    }

    # Monogram: the script S set inside the arch, the site's framing device
    s_placed, s_adv, sk = script.shape('S', S)
    s_d, s_box = script.outline(s_placed, sk, 0, 0)
    marks['Monogram'] = monogram(s_d, s_box)

    folders = {'Logo': '01. Logo', 'Wordmark': '02. Wordmark', 'Monogram': '03. Monogram'}
    written = []
    for kind, spec in marks.items():
        for i, (cname, hexv) in enumerate(COLOURS.items(), 1):
            folder = os.path.join(ASSETS, folders[kind], f'0{i}. {cname}')
            os.makedirs(folder, exist_ok=True)
            fn = os.path.join(folder, f'SignaturePianos_{kind}_{cname}.svg')
            if kind == 'Monogram':
                content = spec(hexv, cname)
            else:
                paths, box, title = spec
                content = svg(paths, box, hexv, title)
            with open(fn, 'w', encoding='utf-8') as f:
                f.write(content)
            written.append(fn)

    # Tiles for favicon, app icon and social avatars: the arch knocked out of a solid square
    tiles = os.path.join(ASSETS, '03. Monogram', '05. Tiles')
    os.makedirs(tiles, exist_ok=True)
    for name, ground, mark in (('Ink', '#16222E', '#F3F0E9'), ('Felt', '#4A1520', '#F3F0E9'), ('Ivory', '#F3F0E9', '#16222E')):
        fn = os.path.join(tiles, f'SignaturePianos_Tile_{name}.svg')
        with open(fn, 'w', encoding='utf-8') as f:
            f.write(tile(s_d, s_box, ground, mark))
        written.append(fn)

    print(f'script advance {adv:.1f}, ink {script_box}, descriptor adv {dadv:.1f}')
    for w in written:
        print('wrote', os.path.relpath(w, ROOT))


def monogram(s_d, s_box):
    """Arch outline with the script S centred in it. Returns a function of colour."""
    sx0, sy0, sx1, sy1 = s_box
    sw, sh = sx1 - sx0, sy1 - sy0
    # Arch: width W, straight sides, a semicircular top. Proportion 3:4 like the site's arch panels.
    W = sh * 1.18
    H = W * 4 / 3
    r = W / 2
    stroke = W * 0.016
    cx = (sx0 + sx1) / 2
    # centre the S optically: a little below the arch's centre of area
    top = (sy0 + sy1) / 2 - H * 0.56
    left = cx - W / 2
    bottom = top + H
    arch = (f'M{left:.2f},{bottom:.2f} V{top + r:.2f} '
            f'A{r:.2f},{r:.2f} 0 0 1 {left + W:.2f},{top + r:.2f} V{bottom:.2f} Z')
    pad = stroke / 2 + 0.5
    vb = (left - pad, top - pad, W + 2 * pad, H + 2 * pad)

    def draw(colour, cname):
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb[0]:.2f} {vb[1]:.2f} {vb[2]:.2f} {vb[3]:.2f}" '
                f'width="{vb[2]:.0f}" height="{vb[3]:.0f}" role="img" aria-label="Signature Pianos">'
                f'<title>Signature Pianos</title>'
                f'<path d="{arch}" fill="none" stroke="{colour}" stroke-width="{stroke:.2f}"/>'
                f'<path d="{s_d}" fill="{colour}"/></svg>\n')
    return draw


def tile(s_d, s_box, ground, mark):
    """Square tile: a solid arch in the mark colour, the S knocked back in the ground colour.
    The S gets a hairline stroke so it survives at 32 px."""
    sx0, sy0, sx1, sy1 = s_box
    sh = sy1 - sy0
    W = sh * 1.12
    H = W * 4 / 3
    r = W / 2
    cx = (sx0 + sx1) / 2
    top = (sy0 + sy1) / 2 - H * 0.56
    left = cx - W / 2
    bottom = top + H
    side = H * 1.24
    ox = cx - side / 2
    oy = top - (side - H) / 2 - H * 0.02
    arch = (f'M{left:.2f},{bottom:.2f} V{top + r:.2f} '
            f'A{r:.2f},{r:.2f} 0 0 1 {left + W:.2f},{top + r:.2f} V{bottom:.2f} Z')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{ox:.2f} {oy:.2f} {side:.2f} {side:.2f}" '
            f'width="512" height="512" role="img" aria-label="Signature Pianos">'
            f'<title>Signature Pianos</title>'
            f'<rect x="{ox:.2f}" y="{oy:.2f}" width="{side:.2f}" height="{side:.2f}" fill="{ground}"/>'
            f'<path d="{arch}" fill="{mark}"/>'
            f'<path d="{s_d}" fill="{ground}" stroke="{ground}" stroke-width="{W * 0.012:.2f}" stroke-linejoin="round"/></svg>\n')


if __name__ == '__main__':
    build()
