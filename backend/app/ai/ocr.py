"""Proveedores OCR intercambiables.

  * TesseractOcr  — autoalojado, por defecto. Preprocesado OpenCV + varias rotaciones.
  * GoogleVisionOcr — Cloud Vision TEXT_DETECTION (requiere GOOGLE_VISION_API_KEY).
  * DisabledOcr   — cuando OCR_PROVIDER=none: la app ofrece solo entrada manual.

Para añadir otro proveedor (AWS Textract, Azure, modelo propio…) basta con implementar
el protocolo `OcrProvider` y registrarlo en `get_ocr_provider`.
"""

import base64
import logging
import time
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Protocol

import cv2
import httpx
import numpy as np

from app.ai.tag_parser import parse_tag_text
from app.core.config import get_settings

log = logging.getLogger(__name__)


class OcrError(RuntimeError):
    pass


@dataclass
class OcrRead:
    text: str
    confidence: float | None  # 0..1
    variant: str


@dataclass
class OcrResult:
    provider: str
    reads: list[OcrRead] = field(default_factory=list)
    elapsed_ms: int = 0

    @property
    def best_text(self) -> str:
        return max(self.reads, key=lambda r: r.confidence or 0, default=OcrRead("", None, "")).text


class OcrProvider(Protocol):
    name: str
    available: bool

    def read(self, image_bytes: bytes) -> OcrResult: ...


def _decode(image_bytes: bytes) -> np.ndarray:
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise OcrError("No se pudo decodificar la imagen")
    return img


def preprocess_variants(img: np.ndarray) -> list[tuple[str, np.ndarray]]:
    """Genera variantes en escala de grises pensadas para crotales (fondo amarillo/naranja, tinta negra)."""
    h, w = img.shape[:2]
    target = 1600
    scale = target / max(h, w)
    if scale < 1 or max(h, w) < 900:
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8)).apply(gray)
    blur = cv2.GaussianBlur(clahe, (3, 3), 0)
    _, otsu = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    adaptive = cv2.adaptiveThreshold(blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 41, 15)
    return [("clahe", clahe), ("otsu", otsu), ("adaptive", adaptive)]


def _rotate(img: np.ndarray, deg: int) -> np.ndarray:
    if deg == 90:
        return cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
    if deg == 180:
        return cv2.rotate(img, cv2.ROTATE_180)
    if deg == 270:
        return cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)
    return img


class TesseractOcr:
    name = "tesseract"

    def __init__(self, cmd: str | None = None) -> None:
        import pytesseract

        self._pt = pytesseract
        if cmd:
            pytesseract.pytesseract.tesseract_cmd = cmd
        try:
            pytesseract.get_tesseract_version()
            self.available = True
        except Exception:  # binario no instalado
            log.warning("Tesseract no disponible en el sistema")
            self.available = False

    def _ocr(self, img: np.ndarray, psm: int) -> OcrRead:
        config = f"--oem 1 --psm {psm} -c tessedit_char_whitelist=ES0123456789"
        data = self._pt.image_to_data(img, lang="eng", config=config, output_type=self._pt.Output.DICT)
        lines: dict[tuple[int, int, int], list[str]] = {}
        confs: list[float] = []
        for i, word in enumerate(data["text"]):
            word = word.strip()
            if not word:
                continue
            key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
            lines.setdefault(key, []).append(word)
            c = float(data["conf"][i])
            if c >= 0:
                confs.append(c / 100)
        text = "\n".join(" ".join(ws) for _, ws in sorted(lines.items()))
        conf = sum(confs) / len(confs) if confs else None
        return OcrRead(text=text, confidence=conf, variant=f"psm{psm}")

    def read(self, image_bytes: bytes) -> OcrResult:
        if not self.available:
            raise OcrError("Tesseract no está instalado")
        t0 = time.perf_counter()
        deadline = t0 + get_settings().ocr_timeout_seconds
        result = OcrResult(provider=self.name)
        variants = preprocess_variants(_decode(image_bytes))
        for deg in (0, 90, 270, 180):
            for vname, vimg in variants:
                for psm in (11, 6):
                    if time.perf_counter() > deadline:
                        break
                    r = self._ocr(_rotate(vimg, deg), psm)
                    r.variant = f"rot{deg}-{vname}-{r.variant}"
                    if r.text:
                        result.reads.append(r)
                    cands = parse_tag_text(r.text)
                    if any(c.kind in ("official", "electronic") for c in cands):
                        result.elapsed_ms = int((time.perf_counter() - t0) * 1000)
                        return result
        result.elapsed_ms = int((time.perf_counter() - t0) * 1000)
        return result


class GoogleVisionOcr:
    name = "google_vision"
    URL = "https://vision.googleapis.com/v1/images:annotate"

    def __init__(self, api_key: str | None) -> None:
        self.api_key = api_key
        self.available = bool(api_key)

    def read(self, image_bytes: bytes) -> OcrResult:
        if not self.available:
            raise OcrError("GOOGLE_VISION_API_KEY no configurada")
        t0 = time.perf_counter()
        body = {
            "requests": [
                {
                    "image": {"content": base64.b64encode(image_bytes).decode()},
                    "features": [{"type": "TEXT_DETECTION"}],
                    "imageContext": {"languageHints": ["es", "en"]},
                }
            ]
        }
        try:
            resp = httpx.post(
                self.URL,
                params={"key": self.api_key},
                json=body,
                timeout=get_settings().ocr_timeout_seconds,
            )
            resp.raise_for_status()
        except httpx.HTTPError as e:
            raise OcrError(f"Error en Google Vision: {e}") from e
        r0 = resp.json().get("responses", [{}])[0]
        if "error" in r0:
            raise OcrError(r0["error"].get("message", "Error en Google Vision"))
        full = r0.get("fullTextAnnotation") or {}
        pages = full.get("pages") or []
        confs = [p["confidence"] for p in pages if "confidence" in p]
        read = OcrRead(
            text=full.get("text", ""),
            confidence=(sum(confs) / len(confs)) if confs else None,
            variant="text_detection",
        )
        return OcrResult(
            provider=self.name, reads=[read] if read.text else [], elapsed_ms=int((time.perf_counter() - t0) * 1000)
        )


class DisabledOcr:
    name = "none"
    available = False

    def read(self, image_bytes: bytes) -> OcrResult:
        raise OcrError("OCR desactivado (OCR_PROVIDER=none)")


@lru_cache
def get_ocr_provider() -> OcrProvider:
    s = get_settings()
    if s.ocr_provider == "google_vision":
        return GoogleVisionOcr(s.google_vision_api_key)
    if s.ocr_provider == "tesseract":
        return TesseractOcr(s.tesseract_cmd)
    return DisabledOcr()
