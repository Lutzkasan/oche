# Erzeugt das Logo (icons/logo.svg) und die App-Icons (PNG) aus einer Geometrie. Ausführen: python3 tools/make-icons.py
# Logo „A Turnierscheibe": 20 Segmente mit Drähten, Reihenfolge wie auf der Scheibe im Uhrzeigersinn ab oben.
# Die 20 ist dunkel mit roten Ringen, danach wechseln hell/grün und dunkel/rot.
# Die App zeigt icons/logo.svg (app.js, logo()). SVG und PNG kommen aus derselben Geometrie, damit sie nicht
# auseinanderlaufen.
from math import cos, radians, sin
from pathlib import Path
from PIL import Image, ImageDraw

ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]
# Radien im 200er-Feld: Bull, Outer Bull, Triple innen, Triple außen, Double innen, Double außen, Rand
BULL, OUTER, T_IN, T_OUT, D_IN, D_OUT, RIM = 7, 16, 52, 64, 80, 94, 99
BG, RIM_C, DARK, CREAM, RED, GREEN, WIRE = '#0e1113', '#0a0a0a', '#16191b', '#efe2c2', '#e5484d', '#2fa266', '#c9c9c9'
WIRE_W = 0.5
C = 100
OUT = Path(__file__).resolve().parent.parent / 'icons'


def pt(r, deg):
    # Winkel ab oben im Uhrzeigersinn
    a = radians(deg)
    return C + r * sin(a), C - r * cos(a)


def areas():
    """Alle Flächen in Zeichenreihenfolge: (Art, Daten, Farbe). Art 'seg' = Ringsegment (r1, r2, a1, a2), 'disc' = Kreis (r)."""
    out = []
    for i, _ in enumerate(ORDER):
        a1, a2 = i * 18 - 9, i * 18 + 9
        single, ring = (DARK, RED) if i % 2 == 0 else (CREAM, GREEN)
        out += [('seg', (OUTER, T_IN, a1, a2), single), ('seg', (T_OUT, D_IN, a1, a2), single),
                ('seg', (T_IN, T_OUT, a1, a2), ring), ('seg', (D_IN, D_OUT, a1, a2), ring)]
    out += [('disc', OUTER, GREEN), ('disc', BULL, RED)]
    return out


def f(v):
    return f'{v:.2f}'


def svg():
    parts = [f'<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><circle cx="{C}" cy="{C}" r="{RIM}" fill="{RIM_C}"/>']
    wire = f'stroke="{WIRE}" stroke-width="{WIRE_W}"'
    for kind, g, color in areas():
        if kind == 'disc':
            parts.append(f'<circle cx="{C}" cy="{C}" r="{g}" fill="{color}" {wire}/>')
            continue
        r1, r2, a1, a2 = g
        p1, p2, p3, p4 = pt(r2, a1), pt(r2, a2), pt(r1, a2), pt(r1, a1)
        d = (f'M{f(p1[0])} {f(p1[1])}A{r2} {r2} 0 0 1 {f(p2[0])} {f(p2[1])}'
             f'L{f(p3[0])} {f(p3[1])}A{r1} {r1} 0 0 0 {f(p4[0])} {f(p4[1])}Z')
        parts.append(f'<path d="{d}" fill="{color}" {wire}/>')
    parts.append('</svg>')
    return ''.join(parts)


def png(size, scale):
    # scale: Anteil der Kantenlänge, den die Scheibe einnimmt (Maskable braucht Rand für die Safe Zone)
    s = 4  # Supersampling gegen Treppenkanten
    W = size * s
    img = Image.new('RGB', (W, W), BG)
    d = ImageDraw.Draw(img)
    u = W * scale / (2 * RIM)  # Pixel je Einheit im 200er-Feld
    off = W / 2 - C * u
    tr = lambda p: (off + p[0] * u, off + p[1] * u)
    wire_px = max(1, round(WIRE_W * u))

    def disc(r, color, outline=None):
        b = [tr((C - r, C - r)), tr((C + r, C + r))]
        d.ellipse([b[0][0], b[0][1], b[1][0], b[1][1]], fill=color, outline=outline, width=wire_px if outline else 0)

    disc(RIM, RIM_C)
    for kind, g, color in areas():
        if kind == 'disc':
            disc(g, color, WIRE)
            continue
        r1, r2, a1, a2 = g
        steps = 24
        outer = [tr(pt(r2, a1 + (a2 - a1) * k / steps)) for k in range(steps + 1)]
        inner = [tr(pt(r1, a2 - (a2 - a1) * k / steps)) for k in range(steps + 1)]
        d.polygon(outer + inner, fill=color, outline=WIRE, width=wire_px)
    return img.resize((size, size), Image.LANCZOS)


OUT.mkdir(exist_ok=True)
(OUT / 'logo.svg').write_text(svg(), encoding='utf-8')
png(192, 0.92).save(OUT / 'icon-192.png')
png(512, 0.92).save(OUT / 'icon-512.png')
png(512, 0.72).save(OUT / 'icon-maskable-512.png')
print('Logo und Icons geschrieben nach', OUT)
