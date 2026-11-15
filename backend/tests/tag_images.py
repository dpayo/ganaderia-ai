"""Genera imágenes sintéticas de crotales para tests de integración del OCR.

No sustituyen a fotos reales (ver docs/TESTING_REAL_PHOTOS.md), pero verifican
el pipeline completo imagen → preprocesado → Tesseract → parser → BD.
"""

import io
import os
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
]


def _font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default(size=size)


def make_tag_image(
    official: str = "ES040812345678", rotate: float = 4.0, noise: bool = True, blank: bool = False
) -> bytes:
    """Crotal amarillo: 'ES' + 8 dígitos pequeños en una línea y los 4 últimos grandes debajo."""
    w, h = 900, 700
    bg = Image.new("RGB", (w + 200, h + 200), (90, 110, 70))  # fondo "pelaje/campo"
    tag = Image.new("RGB", (w, h), (238, 196, 40))
    d = ImageDraw.Draw(tag)
    d.ellipse((w // 2 - 50, 25, w // 2 + 50, 125), fill=(200, 160, 30))
    if not blank:
        digits = official[2:]
        d.text((70, 170), f"ES {digits[:4]} {digits[4:8]}", font=_font(96), fill=(15, 15, 15))
        d.text((170, 330), digits[8:], font=_font(260), fill=(10, 10, 10))
    bg.paste(tag, (100, 100))
    img = bg.rotate(rotate, expand=True, fillcolor=(90, 110, 70))
    if noise:
        img = img.filter(ImageFilter.GaussianBlur(1.2))
        px = img.load()
        rnd = random.Random(42)
        for _ in range(6000):
            x, y = rnd.randrange(img.width), rnd.randrange(img.height)
            px[x, y] = tuple(min(255, max(0, c + rnd.randint(-60, 60))) for c in px[x, y])
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=82)
    return buf.getvalue()
