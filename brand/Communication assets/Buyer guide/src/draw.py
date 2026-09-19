"""Scale drawings for the Signature Pianos buyer's guide, written as inline SVG.

All geometry is in millimetres of the real piano, so every drawing of the same kind can share
one scale and be compared by eye. Colours are the brand palette; the hammer felt is drawn in
Hammer Felt because that is where the colour comes from.

Run from the repo root:  python "brand/Communication assets/Buyer guide/src/draw.py"
Writes src/drawings/*.svg, which build.py inlines into the guide.
"""
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'drawings')
INK, INK2, IVORY, IVORY2, MIST, MIST2, FELT = '#16222E', '#3A4855', '#F3F0E9', '#E9E5DB', '#BCCEDA', '#DCE6ED', '#4A1520'

KEYBOARD = 1225   # 88 keys, mm
KEY_TOP = 745     # floor to top of the white keys on a Yamaha upright, approx.


def keys_front(x0, y0, width, depth, sw, black_at='top'):
    """A keyboard seen from slightly above: white keys with the black-key pattern.
    black_at is the edge of the strip where the black keys sit (the back of the keys)."""
    out = [f'<rect x="{x0:.1f}" y="{y0:.1f}" width="{width:.1f}" height="{depth:.1f}" fill="#fff" stroke="{INK}" stroke-width="{sw}"/>']
    white = width / 52
    # black keys follow the 2-3 pattern; the first is the lone A# at the bass end
    pattern = [1] + [1, 1, 0, 1, 1, 1, 0] * 7 + [1, 1, 0]
    x = x0 + white
    for i, has in enumerate(pattern[:51]):
        if has and i not in (1,):
            by = y0 if black_at == 'top' else y0 + depth * 0.38
            out.append(f'<rect x="{x - white * 0.3:.1f}" y="{by:.1f}" width="{white * 0.6:.1f}" height="{depth * 0.62:.1f}" fill="{INK}"/>')
        x += white
    return ''.join(out)


def upright(height, width=1530, label=None, show_dims=True, sw=4):
    """Front elevation of an upright piano, floor at y = height."""
    H, W = height, width
    kt = H - KEY_TOP                 # y of the key tops
    cheek = 70
    kx0 = (W - KEYBOARD) / 2
    parts = []
    # top board and upper panel
    parts.append(f'<rect x="-12" y="0" width="{W + 24}" height="28" fill="{IVORY2}" stroke="{INK}" stroke-width="{sw}"/>')
    parts.append(f'<rect x="0" y="28" width="{W}" height="{kt - 150 - 28:.1f}" fill="#fff" stroke="{INK}" stroke-width="{sw}"/>')
    # a quiet inner panel line on the upper door
    parts.append(f'<rect x="90" y="70" width="{W - 180}" height="{kt - 150 - 110:.1f}" fill="none" stroke="{INK}" stroke-width="{sw * 0.5}" opacity=".5"/>')
    # fallboard, with the maker's name as a short line
    parts.append(f'<rect x="{cheek}" y="{kt - 150:.1f}" width="{W - 2 * cheek}" height="120" fill="#fff" stroke="{INK}" stroke-width="{sw}"/>')
    parts.append(f'<rect x="{W / 2 - 60:.1f}" y="{kt - 95:.1f}" width="120" height="7" fill="{INK2}"/>')
    # side arms (key cheeks)
    for x in (0, W - cheek):
        parts.append(f'<rect x="{x}" y="{kt - 150:.1f}" width="{cheek}" height="210" fill="{IVORY2}" stroke="{INK}" stroke-width="{sw}"/>')
    # keys and key slip
    parts.append(keys_front(kx0, kt - 30, KEYBOARD, 60, sw * 0.6))
    parts.append(f'<rect x="{cheek}" y="{kt + 30:.1f}" width="{W - 2 * cheek}" height="45" fill="#fff" stroke="{INK}" stroke-width="{sw}"/>')
    # legs down to the toe blocks
    for x in (18, W - 18 - 70):
        parts.append(f'<rect x="{x}" y="{kt + 75:.1f}" width="70" height="{H - kt - 75 - 70:.1f}" fill="{IVORY2}" stroke="{INK}" stroke-width="{sw}"/>')
        parts.append(f'<rect x="{x - 12}" y="{H - 70}" width="94" height="58" fill="{IVORY2}" stroke="{INK}" stroke-width="{sw}"/>')
        parts.append(f'<circle cx="{x + 35}" cy="{H - 7}" r="7" fill="{INK}"/>')
    # lower panel
    parts.append(f'<rect x="100" y="{kt + 75:.1f}" width="{W - 200}" height="{H - kt - 75 - 95:.1f}" fill="#fff" stroke="{INK}" stroke-width="{sw}"/>')
    # bottom board and three pedals
    parts.append(f'<rect x="100" y="{H - 95}" width="{W - 200}" height="55" fill="{IVORY2}" stroke="{INK}" stroke-width="{sw}"/>')
    for dx in (-110, 0, 110):
        parts.append(f'<path d="M{W / 2 + dx - 26:.1f},{H - 58} h52 l10,42 h-72 z" fill="{INK2}"/>')
    # floor
    parts.append(f'<line x1="-120" y1="{H}" x2="{W + 120}" y2="{H}" stroke="{INK}" stroke-width="{sw * 0.6}"/>')
    dims = ''
    if show_dims:
        # height dimension on the right, width underneath
        x = W + 90
        dims += (f'<g stroke="{INK2}" stroke-width="{sw * 0.6}" fill="none">'
                 f'<line x1="{x}" y1="0" x2="{x}" y2="{H}"/><line x1="{x - 25}" y1="0" x2="{x + 25}" y2="0"/><line x1="{x - 25}" y1="{H}" x2="{x + 25}" y2="{H}"/>'
                 f'<line x1="0" y1="{H + 80}" x2="{W}" y2="{H + 80}"/><line x1="0" y1="{H + 55}" x2="0" y2="{H + 105}"/><line x1="{W}" y1="{H + 55}" x2="{W}" y2="{H + 105}"/></g>'
                 f'<text x="{x + 30}" y="{H / 2}" font-family="Jost" font-size="64" fill="{INK}" transform="rotate(-90 {x + 30} {H / 2})" text-anchor="middle" dy="50">{H / 10:g} cm</text>'
                 f'<text x="{W / 2}" y="{H + 170}" font-family="Jost" font-size="64" fill="{INK}" text-anchor="middle">{W / 10:g} cm</text>')
    vb = (-140, -20, W + 330, H + (210 if show_dims else 40))
    title = f'<title>{label or "Upright piano"}, front view, {H / 10:g} cm tall</title>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb[0]} {vb[1]} {vb[2]} {vb[3]}" role="img">{title}'
            + ''.join(parts) + dims + '</svg>')


def grand_plan(length, width=1490, label=None, sw=5, show_dims=True):
    """Plan view of a grand piano from above, keyboard at the top. Length includes the keys."""
    L, W = length, width
    k = 150  # depth of the keyboard in plan
    cheek = 70
    body = (f'M{cheek},{k} H{W} V{k + 0.26 * (L - k):.1f} '
            f'C{W},{k + 0.55 * (L - k):.1f} {0.62 * W:.1f},{k + 0.60 * (L - k):.1f} {0.42 * W:.1f},{k + 0.86 * (L - k):.1f} '
            f'C{0.30 * W:.1f},{L + 6:.1f} {0.02 * W:.1f},{L:.1f} 0,{k + 0.86 * (L - k):.1f} V{k} Z')
    # the rim, drawn as the outer case and a thin inner line (the plate edge)
    parts = [f'<path d="{body}" fill="#fff" stroke="{INK}" stroke-width="{sw}"/>']
    parts.append(f'<path d="{body}" fill="none" stroke="{INK}" stroke-width="{sw * 0.45}" opacity=".45" transform="translate({W * 0.5:.1f} {(k + L) * 0.5:.1f}) scale(0.9 0.93) translate({-W * 0.5:.1f} {-(k + L) * 0.5:.1f})"/>')
    # cheeks and keys
    parts.append(f'<rect x="0" y="0" width="{cheek}" height="{k}" fill="{IVORY2}" stroke="{INK}" stroke-width="{sw}"/>')
    parts.append(f'<rect x="{W - cheek}" y="0" width="{cheek}" height="{k}" fill="{IVORY2}" stroke="{INK}" stroke-width="{sw}"/>')
    parts.append(keys_front((W - KEYBOARD) / 2, 0, KEYBOARD, k, sw * 0.6, black_at='bottom'))
    # makers draw grands keyboard-down with the straight side on the left: flip top to bottom
    parts = [f'<g transform="translate(0 {L}) scale(1 -1)">' + ''.join(parts) + '</g>']
    dims = ''
    if show_dims:
        x = W + 80
        dims = (f'<g stroke="{INK2}" stroke-width="{sw * 0.6}" fill="none"><line x1="{x}" y1="0" x2="{x}" y2="{L}"/>'
                f'<line x1="{x - 25}" y1="0" x2="{x + 25}" y2="0"/><line x1="{x - 25}" y1="{L}" x2="{x + 25}" y2="{L}"/></g>'
                f'<text x="{x + 40}" y="{L / 2}" font-family="Jost" font-size="70" fill="{INK}" dominant-baseline="middle">{L / 10:g} cm</text>')
    title = f'<title>{label or "Grand piano"}, seen from above, {L / 10:g} cm long</title>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 {W + 420} {L + 50}" role="img">{title}'
            + ''.join(parts) + dims + '</svg>')


def grand_lineup(models, sw=6):
    """Several grands side by side at one scale, each with its model and length underneath."""
    Wmax, gap = 1550, 330
    cells = []
    models = [m if len(m) == 3 else (m[0], m[1], 1490) for m in models]
    maxL = max(L for _, L, _ in models)
    for i, (name, L, W) in enumerate(models):
        x = i * (Wmax + gap) + (Wmax - W) / 2
        inner = grand_plan(L, W, name, sw, show_dims=False)
        inner = inner[inner.index('>') + 1:inner.rindex('</svg>')]
        inner = inner[inner.index('</title>') + 8:]
        cells.append(f'<g transform="translate({x} 0)"><g transform="translate(0 {maxL - L})">{inner}</g>'
                     f'<text x="{W / 2}" y="{maxL + 290}" font-family="SP Display" font-weight="500" font-size="290" fill="{INK}" text-anchor="middle">{name}</text>'
                     f'<text x="{W / 2}" y="{maxL + 520}" font-family="Jost" font-size="190" fill="{INK2}" text-anchor="middle">{L / 10:g} cm</text></g>')
    total = len(models) * (Wmax + gap) - gap
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 {total + 40} {maxL + 590}" role="img">'
            f'<title>Yamaha grand pianos compared at one scale: ' + ', '.join(f'{n} {L / 10:g} cm' for n, L, _ in models) + '</title>'
            + ''.join(cells) + '</svg>')


def upright_lineup(models, sw=5):
    """Uprights side by side at one scale, with a 1 m rule so height reads at a glance."""
    W, gap = 1530, 220
    cells = []
    maxH = max(H for _, H in models)
    for i, (name, H) in enumerate(models):
        x = i * (W + gap)
        inner = upright(H, W, name, show_dims=False, sw=sw)
        inner = inner[inner.index('</title>') + 8:inner.rindex('</svg>')]
        cells.append(f'<g transform="translate({x} {maxH - H})">{inner}</g>'
                     f'<text x="{x + W / 2}" y="{maxH + 150}" font-family="SP Display" font-weight="500" font-size="140" fill="{INK}" text-anchor="middle">{name}</text>'
                     f'<text x="{x + W / 2}" y="{maxH + 245}" font-family="Jost" font-size="80" fill="{INK2}" text-anchor="middle">{H / 10:g} cm tall</text>')
    total = len(models) * (W + gap) - gap
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-160 -40 {total + 320} {maxH + 320}" role="img">'
            f'<title>Upright heights compared: ' + ', '.join(f'{n} {H / 10:g} cm' for n, H in models) + '</title>'
            + ''.join(cells) + '</svg>')


def upright_section():
    """Side section of an upright, front to the right. Numbered to match the legend in the guide."""
    H, D = 1310, 650
    kt = H - KEY_TOP
    sw = 4
    p = []
    fill_wood = IVORY2
    # 14 back posts and the back frame
    p.append(f'<rect x="0" y="40" width="70" height="{H - 110}" fill="{fill_wood}" stroke="{INK}" stroke-width="{sw}"/>')
    # 13 soundboard
    p.append(f'<rect x="72" y="150" width="12" height="{H - 360}" fill="{MIST}" stroke="{INK}" stroke-width="{sw * 0.6}"/>')
    # 12 bridge
    p.append(f'<rect x="84" y="{H * 0.42:.0f}" width="16" height="{H * 0.36:.0f}" fill="{fill_wood}" stroke="{INK}" stroke-width="{sw * 0.6}"/>')
    # 11 iron frame (plate), with the pin block behind the tuning pins at the top
    p.append(f'<path d="M100,70 H150 V{H - 230} H100 Z" fill="none" stroke="{INK2}" stroke-width="{sw * 2.2}" stroke-linejoin="round"/>')
    p.append(f'<rect x="70" y="60" width="48" height="150" fill="{fill_wood}" stroke="{INK}" stroke-width="{sw}"/>')
    # 10 tuning pins
    for y in (95, 130, 165):
        p.append(f'<line x1="118" y1="{y}" x2="150" y2="{y - 6}" stroke="{INK}" stroke-width="{sw * 1.6}" stroke-linecap="round"/>')
    # 9 strings
    p.append(f'<line x1="126" y1="120" x2="104" y2="{H - 250}" stroke="{INK}" stroke-width="{sw * 0.7}"/>')
    # action: 7 hammer, 8 damper, 6 action body
    hy = kt - 250
    p.append(f'<rect x="126" y="{hy - 26}" width="34" height="52" rx="14" fill="{FELT}"/>')
    p.append(f'<line x1="160" y1="{hy}" x2="270" y2="{hy + 90}" stroke="{INK}" stroke-width="{sw * 1.2}"/>')
    p.append(f'<rect x="120" y="{hy - 130}" width="22" height="46" fill="#fff" stroke="{INK}" stroke-width="{sw * 0.8}"/>')
    p.append(f'<line x1="142" y1="{hy - 108}" x2="235" y2="{hy - 30}" stroke="{INK}" stroke-width="{sw * 0.9}"/>')
    p.append(f'<rect x="215" y="{hy + 60:.0f}" width="140" height="{kt - hy - 84:.0f}" fill="#fff" stroke="{INK}" stroke-width="{sw}"/>')
    p.append(f'<line x1="235" y1="{hy + 90:.0f}" x2="335" y2="{kt - 40:.0f}" stroke="{INK}" stroke-width="{sw * 0.7}" opacity=".6"/>')
    # 4 keys on the key bed, 5 key slip
    p.append(f'<rect x="220" y="{kt - 22:.0f}" width="{D - 220 - 25}" height="22" fill="#fff" stroke="{INK}" stroke-width="{sw}"/>')
    p.append(f'<rect x="160" y="{kt:.0f}" width="{D - 150}" height="55" fill="{fill_wood}" stroke="{INK}" stroke-width="{sw}"/>')
    p.append(f'<rect x="{D - 25}" y="{kt - 12:.0f}" width="20" height="70" fill="{fill_wood}" stroke="{INK}" stroke-width="{sw}"/>')
    # cabinet: 1 top lid, 2 music desk and upper panel, 3 fallboard
    p.append(f'<rect x="-10" y="0" width="{D - 170}" height="40" fill="{fill_wood}" stroke="{INK}" stroke-width="{sw}"/>')
    p.append(f'<rect x="{D - 230}" y="40" width="22" height="{kt - 240:.0f}" fill="{fill_wood}" stroke="{INK}" stroke-width="{sw}"/>')
    p.append(f'<path d="M{D - 208},{kt - 200:.0f} h70 v16 h-70 z" fill="{fill_wood}" stroke="{INK}" stroke-width="{sw}"/>')
    p.append(f'<path d="M{D - 230},{kt - 180:.0f} C{D - 120},{kt - 170:.0f} {D - 60},{kt - 110:.0f} {D - 40},{kt - 26:.0f}" fill="none" stroke="{INK}" stroke-width="{sw * 2}"/>')
    # 17 lower panel
    p.append(f'<rect x="{D - 245}" y="{kt + 55:.0f}" width="20" height="{H - kt - 55 - 110:.0f}" fill="{fill_wood}" stroke="{INK}" stroke-width="{sw}"/>')
    # 18 leg and toe block, 19 caster
    p.append(f'<rect x="{D - 60}" y="{kt + 55:.0f}" width="50" height="{H - kt - 55 - 60:.0f}" fill="{fill_wood}" stroke="{INK}" stroke-width="{sw}" opacity=".85"/>')
    p.append(f'<rect x="60" y="{H - 60}" width="{D - 60}" height="50" fill="{fill_wood}" stroke="{INK}" stroke-width="{sw}"/>')
    for cx in (110, D - 40):
        p.append(f'<circle cx="{cx}" cy="{H - 5}" r="9" fill="{INK}"/>')
    # 15 pedals and 16 pedal rods (trapwork)
    p.append(f'<path d="M{D - 250},{H - 80} L{D - 110},{H - 95} L{D - 106},{H - 80} L{D - 250},{H - 70} Z" fill="{INK2}"/>')
    p.append(f'<line x1="300" y1="{H - 85}" x2="300" y2="{kt + 60:.0f}" stroke="{INK}" stroke-width="{sw * 0.9}" stroke-dasharray="14 10"/>')
    p.append(f'<line x1="300" y1="{H - 85}" x2="{D - 250}" y2="{H - 78}" stroke="{INK}" stroke-width="{sw * 0.9}"/>')
    # floor
    p.append(f'<line x1="-40" y1="{H + 4}" x2="{D + 60}" y2="{H + 4}" stroke="{INK}" stroke-width="{sw * 0.6}"/>')
    # numbered markers: (number, x, y) placed on each part
    marks = [(1, 180, 20), (2, D - 170, kt - 192), (3, D - 95, kt - 110), (4, 440, kt - 11), (5, D - 15, kt + 25),
             (6, 285, hy + 150), (7, 143, hy), (8, 131, hy - 107), (9, 115, H * 0.62), (10, 150, 95),
             (11, 150, H * 0.52), (12, 92, H * 0.72), (13, 78, 260), (14, 35, H * 0.5), (15, D - 180, H - 82),
             (16, 300, kt + 250), (17, D - 235, kt + 330), (18, D - 35, kt + 200), (19, D - 40, H - 5)]
    for n, x, y in marks:
        p.append(f'<g><circle cx="{x}" cy="{y:.0f}" r="26" fill="{INK}"/><text x="{x}" y="{y:.0f}" dy="10" font-family="Jost" font-weight="500" font-size="30" fill="#fff" text-anchor="middle">{n}</text></g>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-60 -30 {D + 140} {H + 60}" role="img">'
            f'<title>Cut-away of an upright piano, seen from the side, with 19 numbered parts</title>' + ''.join(p) + '</svg>')


def write(name, svg):
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, name + '.svg'), 'w', encoding='utf-8') as f:
        f.write(svg)
    print('wrote drawings/' + name + '.svg')


if __name__ == '__main__':
    write('upright-121', upright(1210, 1530, 'A 121 cm upright'))
    write('upright-131', upright(1310, 1530, 'A 131 cm upright'))
    write('upright-lineup', upright_lineup([('121 cm', 1210), ('131 cm', 1310)]))
    write('upright-section', upright_section())
    write('grand-c3', grand_plan(1860, 1490, 'Yamaha C3'))


# ---------------------------------------------------------------- family tree
# Production months from Yamaha Japan's model list (research/vintage-uprights.md, modern-uprights.md).
def ym(y, m):
    return y + (m - 1) / 12


NOW = 2026.9
LANES = [
    ('121 cm', [('U1F', ym(1970, 3), ym(1971, 3)), ('U1G', ym(1971, 3), ym(1972, 5)), ('U1H', ym(1972, 5), ym(1980, 9)),
                ('U1M', ym(1980, 9), ym(1982, 12)), ('U1A', ym(1982, 12), ym(1987, 3)), ('U10Bl', ym(1987, 4), ym(1989, 9)),
                ('U10A', ym(1989, 10), ym(1994, 3)), ('U100', ym(1994, 3), ym(1997, 8)), ('YU1', ym(1997, 8), ym(2001, 7)),
                ('YU10', ym(2001, 8), ym(2006, 9)), ('YU11', ym(2006, 9), NOW)]),
    ('131 cm', [('U3F', ym(1970, 3), ym(1971, 3)), ('U3G', ym(1971, 3), ym(1972, 4)), ('U3H', ym(1972, 4), ym(1980, 9)),
                ('U3M', ym(1980, 9), ym(1982, 12)), ('U3A', ym(1982, 12), ym(1987, 2)), ('U30Bl', ym(1987, 4), ym(1989, 9)),
                ('U30A', ym(1989, 10), ym(1994, 3)), ('U300', ym(1994, 3), ym(1997, 8)), ('YU3', ym(1997, 9), ym(2001, 7)),
                ('YU30', ym(2001, 8), ym(2006, 9)), ('YU33', ym(2006, 9), NOW)]),
    ('121 cm, higher', [('YUS', ym(1980, 9), ym(1982, 12)), ('UX1', ym(1982, 12), ym(1988, 3)), ('UX10Bl', ym(1988, 4), ym(1990, 3)),
                                 ('UX10A', ym(1990, 4), ym(1994, 3)), ('UX100', ym(1994, 3), ym(1997, 8)), ('YUS1', ym(2006, 9), NOW)]),
    ('131 cm, higher', [('UX', ym(1975, 5), ym(1980, 9)), ('YUX', ym(1980, 9), ym(1982, 12)), ('UX3', ym(1982, 12), ym(1988, 3)),
                                 ('UX30Bl', ym(1988, 4), ym(1990, 3)), ('UX30A', ym(1990, 4), ym(1994, 3)), ('UX300', ym(1994, 3), ym(1997, 8)),
                                 ('YUS3', ym(2006, 9), NOW)]),
    ('Top of range', [('YUA', ym(1978, 9), ym(1982, 12)), ('UX5', ym(1982, 12), ym(1988, 3)), ('UX50Bl', ym(1988, 4), ym(1990, 3)),
                          ('UX50A', ym(1990, 4), ym(1994, 3)), ('UX500', ym(1994, 3), ym(1997, 8)), ('YU5', ym(1997, 8), ym(2001, 7)),
                          ('YU50', ym(2001, 8), ym(2006, 9)), ('YUS5', ym(2006, 9), NOW)]),
]


def family_tree(width=176, height=184):
    """Every Yamaha upright of the U, UX, YU and YUS lines, 1970 to today, one lane per size and grade (units: mm)."""
    axis, top, gap = 11, 13, 1.6
    y0, y1 = 1970.0, 2027.2
    k = (height - top - 2) / (y1 - y0)
    lane_w = (width - axis - gap * (len(LANES) - 1)) / len(LANES)
    Y = lambda y: top + (y - y0) * k
    out = []
    # year grid every five years
    for yr in range(1970, 2030, 5):
        yy = Y(yr)
        out.append(f'<line x1="{axis - 1.5}" y1="{yy:.2f}" x2="{width}" y2="{yy:.2f}" stroke="{INK}" stroke-width=".12" opacity=".35"/>')
        out.append(f'<text x="0" y="{yy + 0.9:.2f}" font-family="Jost" font-size="2.3" fill="{INK2}">{yr}</text>')
    # August 1997: the Japanese uprights are renamed
    yy = Y(ym(1997, 8))
    out.append(f'<line x1="{axis - 1.5}" y1="{yy:.2f}" x2="{width}" y2="{yy:.2f}" stroke="{FELT}" stroke-width=".3" stroke-dasharray="1.2 .8"/>')
    for i, (title, models) in enumerate(LANES):
        x = axis + i * (lane_w + gap)
        out.append(f'<text x="{x}" y="4.2" font-family="Jost" font-size="2.05" letter-spacing=".45" fill="{INK2}">{title.upper()}</text>')
        out.append(f'<line x1="{x}" y1="6.4" x2="{x + lane_w}" y2="6.4" stroke="{INK}" stroke-width=".25"/>')
        for name, a, b in models:
            ya, yb = Y(a), Y(b)
            h = yb - ya - 0.35
            modern = name.startswith('Y') and a >= 1997
            fill = MIST2 if modern else '#fff'
            current = b >= NOW
            out.append(f'<rect x="{x:.2f}" y="{ya:.2f}" width="{lane_w:.2f}" height="{h:.2f}" fill="{fill}" stroke="{INK}" stroke-width=".22"/>')
            fs = 2.6 if h >= 4.2 else 2.1
            if h >= 7.5:
                end = 'today' if current else f'{int(b)}'
                out.append(f'<text x="{x + 1.8:.2f}" y="{ya + 3.6:.2f}" font-family="SP Display" font-weight="500" font-size="{fs + .6}" fill="{INK}">{name}</text>')
                out.append(f'<text x="{x + 1.8:.2f}" y="{ya + 6.4:.2f}" font-family="Jost" font-size="1.9" fill="{INK2}">{int(a)}–{end}</text>')
            else:
                out.append(f'<text x="{x + 1.8:.2f}" y="{ya + h / 2 + fs * 0.36:.2f}" font-family="SP Display" font-weight="500" font-size="{fs}" fill="{INK}">{name}</text>')
    lx = axis + 2 * (lane_w + gap) + 1.5
    out.append(f'<text x="{lx:.2f}" y="{Y(ym(1997, 8)) + 3.2:.2f}" font-family="Jost" font-size="1.9" fill="{FELT}">August 1997: Japanese</text>')
    out.append(f'<text x="{lx:.2f}" y="{Y(ym(1997, 8)) + 5.6:.2f}" font-family="Jost" font-size="1.9" fill="{FELT}">models renamed YU</text>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img">'
            f'<title>Family tree of Yamaha upright pianos from 1970 to today, in five lanes by size and grade</title>'
            + ''.join(out) + '</svg>')
