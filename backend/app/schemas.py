import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, field_validator

from app.ai.tag_parser import normalize_official_id
from app.models import AnimalStatus, HealthStatus, IdentStatus, PhotoKind, Role, Sex

Str60 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
Str120 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- Auth ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: Annotated[str, StringConstraints(min_length=8, max_length=128)]
    full_name: Str120


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class RefreshIn(BaseModel):
    refresh_token: str


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"


class UserOut(ORM):
    id: uuid.UUID
    email: EmailStr
    full_name: str


# ---------- Farms ----------
class FarmIn(BaseModel):
    name: Str120
    rega_code: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=20)] = None
    species_default: Str60 = "bovino"
    province: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=60)] = None
    municipality: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=80)] = None


class FarmUpdate(BaseModel):
    name: Str120 | None = None
    rega_code: str | None = None
    species_default: Str60 | None = None
    province: str | None = None
    municipality: str | None = None


class FarmOut(ORM):
    id: uuid.UUID
    name: str
    rega_code: str | None
    species_default: str
    province: str | None
    municipality: str | None
    role: Role | None = None


class MemberIn(BaseModel):
    email: EmailStr
    role: Role


class MemberOut(BaseModel):
    user_id: uuid.UUID
    email: str
    full_name: str
    role: Role


# ---------- Groups ----------
class GroupIn(BaseModel):
    name: Str60
    description: str | None = None


class GroupOut(ORM):
    id: uuid.UUID
    name: str
    description: str | None
    animal_count: int = 0


# ---------- Animals ----------
class AnimalBase(BaseModel):
    official_id: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=32)] = None
    internal_id: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=32)] = None
    name: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=60)] = None
    species: Str60 | None = None
    breed: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=60)] = None
    sex: Sex | None = None
    birth_date: date | None = None
    entry_date: date | None = None
    weight_kg: Annotated[Decimal | None, Field(gt=0, lt=5000, decimal_places=2)] = None
    mother_id: uuid.UUID | None = None
    father_id: uuid.UUID | None = None
    herd_group_id: uuid.UUID | None = None
    health_status: HealthStatus | None = None
    notes: Annotated[str | None, StringConstraints(max_length=4000)] = None

    @field_validator("official_id")
    @classmethod
    def _official(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        if normalize_official_id(v) is None:
            raise ValueError("Identificador oficial no válido: se espera ES + 12 dígitos (o 724 + 12)")
        return v

    @field_validator("birth_date", "entry_date")
    @classmethod
    def _not_future(cls, v: date | None) -> date | None:
        if v and v > date.today():
            raise ValueError("La fecha no puede ser futura")
        return v


class AnimalCreate(AnimalBase):
    from_identification_id: uuid.UUID | None = Field(
        default=None, description="Asocia la foto de un intento de identificación al nuevo animal"
    )


class AnimalUpdate(AnimalBase):
    expected_version: int | None = Field(default=None, description="Bloqueo optimista (sincronización offline)")


class AnimalDeactivate(BaseModel):
    status: Literal["sold", "dead", "transferred"]
    date: date
    reason: Annotated[str | None, StringConstraints(max_length=200)] = None


class AnimalRef(ORM):
    id: uuid.UUID
    official_id: str | None
    internal_id: str | None
    name: str | None


class PhotoOut(ORM):
    id: uuid.UUID
    animal_id: uuid.UUID | None
    kind: PhotoKind
    width: int
    height: int
    created_at: datetime
    url: str = ""
    thumb_url: str = ""


class AnimalOut(ORM):
    id: uuid.UUID
    farm_id: uuid.UUID
    official_id: str | None
    official_id_normalized: str | None
    internal_id: str | None
    name: str | None
    species: str
    breed: str | None
    sex: Sex
    birth_date: date | None
    entry_date: date | None
    weight_kg: Decimal | None
    mother_id: uuid.UUID | None
    father_id: uuid.UUID | None
    herd_group_id: uuid.UUID | None
    herd_group_name: str | None = None
    status: AnimalStatus
    status_date: date | None
    status_reason: str | None
    health_status: HealthStatus
    main_photo_id: uuid.UUID | None
    main_photo_thumb_url: str | None = None
    notes: str | None
    version: int
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None


class AnimalDetail(AnimalOut):
    mother: AnimalRef | None = None
    father: AnimalRef | None = None
    photos: list[PhotoOut] = []


class AnimalPage(BaseModel):
    items: list[AnimalOut]
    total: int
    limit: int
    offset: int


class SyncPage(BaseModel):
    items: list[AnimalOut]
    server_time: datetime


# ---------- Identification ----------
class CandidateOut(BaseModel):
    value: str
    kind: str
    confidence: float


class MatchOut(BaseModel):
    animal: AnimalOut
    confidence: float
    matched_by: Literal["official_exact", "official_fuzzy", "management_suffix", "internal_id"]
    matched_value: str


class IdentificationOut(BaseModel):
    id: uuid.UUID | None
    status: IdentStatus
    ocr_provider: str | None
    ocr_available: bool
    raw_text: str | None
    candidates: list[CandidateOut]
    matches: list[MatchOut]
    photo_id: uuid.UUID | None
    photo_url: str | None = None
    processing_ms: int | None
    visual_search_available: bool
    message: str


class ConfirmIn(BaseModel):
    animal_id: uuid.UUID
    attach_photo: bool = True
    set_as_main: bool = False


# ---------- Dashboard ----------
class CensusPoint(BaseModel):
    month: str  # YYYY-MM
    active: int


class DashboardAlert(BaseModel):
    level: Literal["info", "warning", "critical"]
    code: str
    message: str
    count: int


class DashboardOut(BaseModel):
    total_animals: int
    active_animals: int
    births_this_month: int
    exits_this_month: int
    exits_total: int
    by_sex: dict[str, int]
    by_group: list[dict]
    census: list[CensusPoint]
    alerts: list[DashboardAlert]
    pending_treatments: int | None = Field(None, description="Disponible en Fase 2")
    upcoming_vaccinations: int | None = Field(None, description="Disponible en Fase 2")


class ImportReport(BaseModel):
    dry_run: bool
    total_rows: int
    created: int
    errors: list[dict]


class ActivityOut(BaseModel):
    id: int
    entity: str
    entity_id: str
    action: str
    summary: str
    user_name: str | None
    created_at: datetime
    changes: dict | None
