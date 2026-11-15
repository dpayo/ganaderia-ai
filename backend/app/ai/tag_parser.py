"""Extracción de identificadores de crotales españoles a partir de texto OCR.

Reconoce:
  * Código oficial: "ES" + 12 dígitos (bovino, ovino, caprino).
  * Electrónico ISO 11784: "724" + 12 dígitos → se normaliza a "ES" + 12 dígitos.
  * Número de manejo: grupos aislados de 4-6 dígitos (impresos en grande en el crotal).

Las confusiones típicas del OCR (O→0, I→1, S→5…) se corrigen SOLO en la parte numérica.
La misma lógica está replicada en mobile/src/lib/tagParser.ts (mantener sincronizadas).
"""

from dataclasses import dataclass
from typing import Literal

CandidateKind = Literal["official", "electronic", "official_no_prefix", "management", "internal"]

OFFICIAL_DIGITS = 12
SPAIN_NUMERIC = "724"

_CONFUSABLES = {
    "O": "0",
    "Q": "0",
    "D": "0",
    "U": "0",
    "I": "1",
    "L": "1",
    "|": "1",
    "!": "1",
    "T": "1",
    "Z": "2",
    "S": "5",
    "G": "6",
    "b": "6",
    "B": "8",
    "g": "9",
}
_SEPARATORS = set(" \t-._·:/")
_BASE_CONFIDENCE: dict[CandidateKind, float] = {
    "official": 0.95,
    "electronic": 0.9,
    "official_no_prefix": 0.75,
    "management": 0.5,
    "internal": 0.5,
}


@dataclass(frozen=True)
class TagCandidate:
    value: str  # normalizado: "ES012345678901" o dígitos de manejo
    kind: CandidateKind
    confidence: float

    def as_dict(self) -> dict:
        return {"value": self.value, "kind": self.kind, "confidence": round(self.confidence, 3)}


def normalize_official_id(raw: str) -> str | None:
    """Normaliza un identificador oficial introducido por el usuario o leído por OCR.

    Devuelve "ES" + 12 dígitos, o None si no tiene ese formato.
    """
    if not raw:
        return None
    s = "".join(ch for ch in raw.upper() if ch not in _SEPARATORS and ch not in "\r\n")
    if s.startswith("ES"):
        digits = _to_digits(s[2:])
        if digits is not None and len(digits) == OFFICIAL_DIGITS:
            return "ES" + digits
        return None
    digits = _to_digits(s)
    if digits is None:
        return None
    if len(digits) == 15 and digits.startswith(SPAIN_NUMERIC):
        return "ES" + digits[3:]
    if len(digits) == OFFICIAL_DIGITS:
        return "ES" + digits
    return None


def normalize_free_id(raw: str) -> str:
    """Normalización laxa para identificadores internos (sin espacios, mayúsculas)."""
    return "".join(ch for ch in raw.upper() if ch not in _SEPARATORS and not ch.isspace())


def _to_digits(s: str) -> str | None:
    out = []
    for ch in s:
        if ch.isdigit():
            out.append(ch)
        elif ch in _CONFUSABLES:
            out.append(_CONFUSABLES[ch])
        elif ch.upper() in _CONFUSABLES:
            out.append(_CONFUSABLES[ch.upper()])
        else:
            return None
    return "".join(out)


def _digit_like(ch: str) -> bool:
    return ch.isdigit() or ch in _CONFUSABLES or ch.upper() in _CONFUSABLES


def _collect_digits(text: str, start: int, needed: int) -> tuple[str, int] | None:
    """Recoge `needed` dígitos desde `start` saltando separadores y saltos de línea."""
    digits: list[str] = []
    i = start
    n = len(text)
    while i < n and len(digits) < needed:
        ch = text[i]
        if ch.isdigit():
            digits.append(ch)
        elif ch in _SEPARATORS or ch in "\r\n":
            pass
        elif _digit_like(ch):
            # Letra confundible dentro de la parte numérica → se corrige a dígito.
            digits.append(_CONFUSABLES.get(ch, _CONFUSABLES.get(ch.upper(), ch)))
        else:
            break
        i += 1
    if len(digits) == needed:
        return "".join(digits), i
    return None


def _digit_groups(text: str) -> list[str]:
    groups: list[str] = []
    cur: list[str] = []
    for ch in text:
        if ch.isdigit():
            cur.append(ch)
        else:
            if cur:
                groups.append("".join(cur))
            cur = []
    if cur:
        groups.append("".join(cur))
    return groups


def parse_tag_text(text: str, min_management_len: int = 4, max_management_len: int = 6) -> list[TagCandidate]:
    """Devuelve candidatos ordenados por confianza descendente (sin duplicados)."""
    if not text:
        return []
    upper = text.upper()
    found: dict[str, TagCandidate] = {}

    def add(value: str, kind: CandidateKind) -> None:
        conf = _BASE_CONFIDENCE[kind]
        prev = found.get(value)
        if prev is None or prev.confidence < conf:
            found[value] = TagCandidate(value, kind, conf)

    # 1) Prefijo ES (tolerando "E5" y "E S").
    for prefix in ("ES", "E5", "E S", "E 5"):
        start = 0
        while (idx := upper.find(prefix, start)) != -1:
            got = _collect_digits(upper, idx + len(prefix), OFFICIAL_DIGITS)
            if got:
                add("ES" + got[0], "official")
            start = idx + 1

    # 2) Flujo de dígitos (permitiendo separadores) para 724+12 y 12 dígitos sin prefijo.
    compact_lines = []
    for line in upper.splitlines() or [upper]:
        compact_lines.append("".join(ch for ch in line if ch.isdigit() or ch in " -."))
    all_digits_by_line = ["".join(ch for ch in line if ch.isdigit()) for line in compact_lines]
    joined = "".join(all_digits_by_line)
    for stream in [*all_digits_by_line, joined]:
        pos = 0
        while (idx := stream.find(SPAIN_NUMERIC, pos)) != -1:
            if len(stream) - idx >= 15:
                add("ES" + stream[idx + 3 : idx + 15], "electronic")
            pos = idx + 1
        if len(stream) == OFFICIAL_DIGITS:
            value = "ES" + stream
            if value not in found:
                add(value, "official_no_prefix")

    # 3) Números de manejo: grupos aislados.
    official_digits = {c.value[2:] for c in found.values() if c.value.startswith("ES")}
    for g in _digit_groups(upper):
        if min_management_len <= len(g) <= max_management_len:
            # Si forma parte de un oficial ya detectado, igualmente es útil como sufijo,
            # pero con menor prioridad que el oficial completo.
            add(g, "management")
    # Último bloque del oficial también como nº de manejo (sufijo de 4).
    for d in official_digits:
        add(d[-4:], "management")

    return sorted(found.values(), key=lambda c: (-c.confidence, c.value))


def hamming(a: str, b: str) -> int:
    if len(a) != len(b):
        return max(len(a), len(b))
    return sum(1 for x, y in zip(a, b, strict=True) if x != y)
