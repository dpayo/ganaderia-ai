"""Reconocimiento visual de animales (Fase 3, experimental).

Interfaz desacoplada. La implementación por defecto declara la capacidad como NO disponible:
no se simulan coincidencias. Ver docs/ARCHITECTURE.md §4 para el plan de validación.

Para conectar un modelo real:
  1. Implementar `VisualMatcher` (p. ej. embeddings DINOv2/CLIP almacenados en pgvector).
  2. Indexar las fotos ya confirmadas por humanos (`animal_photos` de animales con identificación confirmada).
  3. Devolver `VisualMatch` con la similitud calibrada como `confidence`.
  4. Seleccionarlo en `get_visual_matcher` mediante configuración.
"""

import uuid
from dataclasses import dataclass
from typing import Protocol


@dataclass
class VisualMatch:
    animal_id: uuid.UUID
    confidence: float


class VisualMatcher(Protocol):
    available: bool

    def index_photo(self, farm_id: uuid.UUID, animal_id: uuid.UUID, image_bytes: bytes) -> None: ...

    def search(self, farm_id: uuid.UUID, image_bytes: bytes, top_k: int = 5) -> list[VisualMatch]: ...


class DisabledVisualMatcher:
    available = False

    def index_photo(self, farm_id: uuid.UUID, animal_id: uuid.UUID, image_bytes: bytes) -> None:
        return None

    def search(self, farm_id: uuid.UUID, image_bytes: bytes, top_k: int = 5) -> list[VisualMatch]:
        return []


def get_visual_matcher() -> VisualMatcher:
    return DisabledVisualMatcher()
