"""
Build lib/warranty-assets.js: the fonts and marks the warranty certificate PDF needs.

The certificate is drawn on the server by lib/warranty-pdf.js (pdf-lib), which cannot
reach brand/ at runtime (.vercelignore drops it). This script subsets the brand fonts
to the characters a certificate uses and copies the vector logo and monogram paths
into one JS module the function can require.

  python brand/src/build_warranty_assets.py

Re-run it if the fonts or the logo masters change.
"""
import base64, io, os, re

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FONTS = os.path.join(ROOT, 'brand', 'Fonts')
ASSETS = os.path.join(ROOT, 'brand', 'Brand Assets')
OUT = os.path.join(ROOT, 'lib', 'warranty-assets.js')

LATIN = [(0x20, 0x7E), (0xA0, 0x17F), (0x2010, 0x2027), (0x2030, 0x203A), (0x20AC, 0x20AC)]
VIETNAMESE = [(0x1A0, 0x1B0), (0x300, 0x323), (0x1EA0, 0x1EF9)]

FONT_SPECS = {
    'jostRegular': ('Jost/Static/Jost-Regular.ttf', LATIN),
    'jostMedium': ('Jost/Static/Jost-Medium.ttf', LATIN),
    # Customer names are set in the display face, so it also carries Vietnamese.
    'display': ('Noto Serif Display/Static/NotoSerifDisplay-ExtraCondensedMedium.ttf', LATIN + VIETNAMESE),
    'script': ('Italianno/Italianno-Regular.ttf', [(0x20, 0x7E), (0xA0, 0xFF)]),
}


def subset_font(rel, ranges):
    font = TTFont(os.path.join(FONTS, rel))
    opts = subset.Options()
    opts.hinting = False
    opts.layout_features = ['kern', 'liga']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    opts.drop_tables += ['DSIG']
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=[u for a, b in ranges for u in range(a, b + 1)])
    sub.subset(font)
    buf = io.BytesIO()
    font.save(buf)
    return buf.getvalue()


def svg_mark(rel):
    svg = open(os.path.join(ASSETS, rel), encoding='utf-8').read()
    x, y, w, h = [float(v) for v in re.search(r'viewBox="([^"]+)"', svg).group(1).split()]
    paths = []
    for tag in re.findall(r'<path [^>]*/>', svg):
        d = re.search(r' d="([^"]+)"', tag).group(1)
        stroke = re.search(r'stroke-width="([^"]+)"', tag)
        paths.append({'d': d, 'stroke': float(stroke.group(1)) if stroke else 0})
    return {'viewBox': [x, y, w, h], 'paths': paths}


def js(value):
    import json
    return json.dumps(value, separators=(',', ':'))


def main():
    parts = [
        '/*',
        ' * Signature Pianos — warranty certificate assets (generated, do not edit)',
        ' * -----------------------------------------------------------------------',
        ' * Built by brand/src/build_warranty_assets.py from brand/Fonts and the logo',
        ' * masters in brand/Brand Assets. Fonts are subset to Latin and are under the',
        ' * SIL Open Font License (OFL.txt in each brand/Fonts folder).',
        ' */',
        '',
        'module.exports = {',
        '  fonts: {',
    ]
    for key, (rel, ranges) in FONT_SPECS.items():
        data = subset_font(rel, ranges)
        print(f'{key:12} {len(data) // 1024} KB')
        parts.append(f"    {key}: '{base64.b64encode(data).decode()}',")
    parts += [
        '  },',
        f"  logo: {js(svg_mark('01. Logo/01. Ink/SignaturePianos_Logo_Ink.svg'))},",
        f"  monogram: {js(svg_mark('03. Monogram/01. Ink/SignaturePianos_Monogram_Ink.svg'))}",
        '}',
        '',
    ]
    open(OUT, 'w', encoding='utf-8', newline='\n').write('\n'.join(parts))
    print('wrote', os.path.relpath(OUT, ROOT), os.path.getsize(OUT) // 1024, 'KB')


if __name__ == '__main__':
    main()
