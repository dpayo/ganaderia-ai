"""Normalización de imágenes subidas: orientación EXIF, eliminación de metadatos (incluido GPS),
redimensionado y miniatura."""

import hashlib
import io
from dataclasses import dataclass

from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.config import get_settings

# HEIC no se acepta en servidor: la app convierte a JPEG antes de subir.
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}


class InvalidImage(ValueError):
    pass


@dataclass
class ProcessedImage:
    data: bytes
    thumb: bytes
    width: int
    height: int
    sha256: str


def process_upload(raw: bytes) -> ProcessedImage:
    s = get_settings()
    if len(raw) > s.max_upload_mb * 1024 * 1024:
        raise InvalidImage(f"La imagen supera {s.max_upload_mb} MB")
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
    except (UnidentifiedImageError, OSError) as e:
        raise InvalidImage("Formato de imagen no soportado") from e

    img = ImageOps.exif_transpose(img).convert("RGB")  # aplica rotación y descarta EXIF/GPS
    img.thumbnail((s.image_max_side, s.image_max_side), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85, optimize=True)
    data = buf.getvalue()

    th = img.copy()
    th.thumbnail((s.thumb_max_side, s.thumb_max_side), Image.Resampling.LANCZOS)
    tbuf = io.BytesIO()
    th.save(tbuf, format="JPEG", quality=75, optimize=True)

    return ProcessedImage(
        data=data,
        thumb=tbuf.getvalue(),
        width=img.width,
        height=img.height,
        sha256=hashlib.sha256(data).hexdigest(),
    )
