# Erzeugt die App-Icons (Dartscheiben-Logo wie in app.js). Ausführen: python3 tools/make-icons.py
from pathlib import Path
from PIL import Image, ImageDraw

BG, DARK, RED, GREEN, CREAM = '#0e1113', '#111111', '#e5484d', '#2fa266', '#efe2c2'
OUT = Path(__file__).resolve().parent.parent / 'icons'


def logo(size, scale):
    # scale: Anteil der Kantenlänge, den die Scheibe einnimmt (Maskable braucht Rand für die Safe Zone)
    s = 4  # Supersampling gegen Treppenkanten
    W = size * s
    img = Image.new('RGB', (W, W), BG)
    d = ImageDraw.Draw(img)
    c = W / 2
    u = W * scale / 44  # Logo-Einheiten aus dem 48er-SVG, Scheibe r=22

    def ring(r, width, color):
        d.ellipse([c - r * u, c - r * u, c + r * u, c + r * u], outline=color, width=round(width * u))

    def disc(r, color):
        d.ellipse([c - r * u, c - r * u, c + r * u, c + r * u], fill=color)

    disc(22, DARK)
    ring(17 + 1.5, 3, RED)
    ring(10.5 + 1.5, 3, GREEN)
    disc(4, RED)
    disc(1.6, CREAM)
    return img.resize((size, size), Image.LANCZOS)


OUT.mkdir(exist_ok=True)
logo(192, 0.92).save(OUT / 'icon-192.png')
logo(512, 0.92).save(OUT / 'icon-512.png')
logo(512, 0.72).save(OUT / 'icon-maskable-512.png')
print('Icons geschrieben nach', OUT)
