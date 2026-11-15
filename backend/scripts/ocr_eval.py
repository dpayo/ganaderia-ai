"""Evalúa el OCR sobre una carpeta de fotos REALES de crotales.

Nombra cada foto con el identificador esperado, p. ej.:
    fotos/ES040812345678.jpg
    fotos/ES040812345678_2.jpg   (varias fotos del mismo animal)

Uso:
    python -m scripts.ocr_eval ./fotos [--provider tesseract|google_vision]

Muestra, por foto, el texto leído y si el identificador correcto aparece como
primer candidato (top-1) o entre los candidatos (top-5). Úsalo para decidir
qué proveedor OCR activar en producción con tus propios crotales.
"""

import argparse
import os
import sys
from pathlib import Path

from app.ai.ocr import GoogleVisionOcr, TesseractOcr
from app.ai.tag_parser import normalize_official_id, parse_tag_text
from app.media.images import process_upload


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("--provider", default="tesseract", choices=["tesseract", "google_vision"])
    args = ap.parse_args()
    provider = TesseractOcr() if args.provider == "tesseract" else GoogleVisionOcr(os.getenv("GOOGLE_VISION_API_KEY"))
    if not provider.available:
        print(f"Proveedor {args.provider} no disponible", file=sys.stderr)
        return 1

    files = sorted(p for p in Path(args.folder).iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"})
    top1 = top5 = 0
    total_ms = 0
    for f in files:
        expected = normalize_official_id(f.stem.split("_")[0])
        img = process_upload(f.read_bytes()).data
        res = provider.read(img)
        total_ms += res.elapsed_ms
        cands: list[str] = []
        for r in res.reads:
            for c in parse_tag_text(r.text):
                if c.value not in cands:
                    cands.append(c.value)
        ok1 = bool(cands) and cands[0] == expected
        ok5 = expected in cands[:5]
        top1 += ok1
        top5 += ok5
        flag = "OK " if ok1 else ("~  " if ok5 else "ERR")
        print(f"{flag} {f.name:40s} esperado={expected} leído={cands[:3]} ({res.elapsed_ms} ms)")
    n = len(files) or 1
    print(f"\nFotos: {len(files)} · top-1: {top1 / n:.0%} · top-5: {top5 / n:.0%} · media {total_ms / n:.0f} ms")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
