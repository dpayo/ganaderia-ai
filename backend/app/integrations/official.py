"""Integración futura con registros oficiales (SITRAN, sistemas autonómicos).

NO hay implementación: requiere alta y credenciales otorgadas por la administración
competente. Esta interfaz permite añadir un adaptador por comunidad autónoma sin tocar
la lógica de negocio. Ganadería AI no sustituye a los sistemas oficiales.
"""

from dataclasses import dataclass
from datetime import date
from typing import Protocol


@dataclass
class OfficialAnimalRecord:
    official_id: str
    species: str
    sex: str | None
    birth_date: date | None
    rega_code: str


@dataclass
class OfficialMovementNotice:
    official_id: str
    origin_rega: str
    destination_rega: str
    moved_at: date
    document_ref: str | None = None


class OfficialRegistryClient(Protocol):
    def fetch_census(self, rega_code: str) -> list[OfficialAnimalRecord]: ...

    def notify_movement(self, notice: OfficialMovementNotice) -> str: ...


class NotConfiguredOfficialRegistry:
    def fetch_census(self, rega_code: str) -> list[OfficialAnimalRecord]:
        raise NotImplementedError("Integración oficial no configurada")

    def notify_movement(self, notice: OfficialMovementNotice) -> str:
        raise NotImplementedError("Integración oficial no configurada")
