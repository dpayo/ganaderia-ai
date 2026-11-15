"""Modelos SQLAlchemy de la Fase 1.

Las entidades de fases posteriores (sanidad, nacimientos, movimientos, alimentación…)
están diseñadas en docs/ARCHITECTURE.md §3 y se añadirán con su propia migración.
"""

import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


def _enum(e: type[enum.Enum], name: str) -> Enum:
    # VARCHAR + CHECK en lugar de ENUM nativo: migraciones más sencillas al añadir valores.
    return Enum(e, name=name, native_enum=False, length=20, values_callable=lambda x: [m.value for m in x])


class Role(str, enum.Enum):
    owner = "owner"
    manager = "manager"
    worker = "worker"
    vet = "vet"
    viewer = "viewer"


class Sex(str, enum.Enum):
    male = "male"
    female = "female"
    unknown = "unknown"


class AnimalStatus(str, enum.Enum):
    active = "active"
    sold = "sold"
    dead = "dead"
    transferred = "transferred"


class HealthStatus(str, enum.Enum):
    healthy = "healthy"
    observation = "observation"
    sick = "sick"
    treatment = "treatment"
    unknown = "unknown"


class PhotoKind(str, enum.Enum):
    tag = "tag"
    body = "body"
    face = "face"
    other = "other"


class IdentMethod(str, enum.Enum):
    ocr = "ocr"
    manual = "manual"
    search = "search"
    visual = "visual"


class IdentStatus(str, enum.Enum):
    matched = "matched"
    ambiguous = "ambiguous"
    not_found = "not_found"
    unreadable = "unreadable"
    confirmed = "confirmed"
    rejected = "rejected"


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class User(TimestampMixin, Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(100))
    full_name: Mapped[str] = mapped_column(String(120))
    is_active: Mapped[bool] = mapped_column(default=True)

    memberships: Mapped[list["FarmUser"]] = relationship(back_populates="user")


class Farm(TimestampMixin, Base):
    __tablename__ = "farms"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120))
    rega_code: Mapped[str | None] = mapped_column(String(20))
    species_default: Mapped[str] = mapped_column(String(30), default="bovino")
    province: Mapped[str | None] = mapped_column(String(60))
    municipality: Mapped[str | None] = mapped_column(String(80))

    members: Mapped[list["FarmUser"]] = relationship(back_populates="farm", cascade="all, delete-orphan")


class FarmUser(Base):
    __tablename__ = "farm_users"
    __table_args__ = (UniqueConstraint("farm_id", "user_id", name="uq_farm_users_farm_user"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    farm_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[Role] = mapped_column(_enum(Role, "farm_role"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    farm: Mapped[Farm] = relationship(back_populates="members")
    user: Mapped[User] = relationship(back_populates="memberships")


class HerdGroup(TimestampMixin, Base):
    __tablename__ = "herd_groups"
    __table_args__ = (UniqueConstraint("farm_id", "name", name="uq_herd_groups_farm_name"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    farm_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str | None] = mapped_column(Text)


class Animal(TimestampMixin, Base):
    __tablename__ = "animals"
    __table_args__ = (
        Index(
            "uq_animals_farm_official",
            "farm_id",
            "official_id_normalized",
            unique=True,
            postgresql_where=text("deleted_at IS NULL AND official_id_normalized IS NOT NULL"),
        ),
        Index(
            "uq_animals_farm_internal",
            "farm_id",
            "internal_id",
            unique=True,
            postgresql_where=text("deleted_at IS NULL AND internal_id IS NOT NULL"),
        ),
        Index("ix_animals_official_suffix", "farm_id", text("right(official_id_normalized, 4)")),
        Index("ix_animals_farm_status", "farm_id", "status"),
        Index("ix_animals_farm_updated", "farm_id", "updated_at"),
        CheckConstraint("mother_id IS NULL OR mother_id <> id", name="ck_animals_mother_not_self"),
        CheckConstraint("father_id IS NULL OR father_id <> id", name="ck_animals_father_not_self"),
        CheckConstraint("weight_kg IS NULL OR weight_kg > 0", name="ck_animals_weight_positive"),
        CheckConstraint(
            "official_id_normalized IS NOT NULL OR internal_id IS NOT NULL",
            name="ck_animals_has_identifier",
        ),
    )
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    farm_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"))
    official_id: Mapped[str | None] = mapped_column(String(32))
    official_id_normalized: Mapped[str | None] = mapped_column(String(32))
    internal_id: Mapped[str | None] = mapped_column(String(32))
    name: Mapped[str | None] = mapped_column(String(60))
    species: Mapped[str] = mapped_column(String(30), default="bovino")
    breed: Mapped[str | None] = mapped_column(String(60))
    sex: Mapped[Sex] = mapped_column(_enum(Sex, "animal_sex"), default=Sex.unknown)
    birth_date: Mapped[date | None] = mapped_column(Date)
    entry_date: Mapped[date | None] = mapped_column(Date)
    weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    mother_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("animals.id", ondelete="SET NULL"))
    father_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("animals.id", ondelete="SET NULL"))
    herd_group_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("herd_groups.id", ondelete="SET NULL"), index=True
    )
    status: Mapped[AnimalStatus] = mapped_column(_enum(AnimalStatus, "animal_status"), default=AnimalStatus.active)
    status_date: Mapped[date | None] = mapped_column(Date)
    status_reason: Mapped[str | None] = mapped_column(String(200))
    health_status: Mapped[HealthStatus] = mapped_column(
        _enum(HealthStatus, "health_status"), default=HealthStatus.unknown
    )
    main_photo_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("animal_photos.id", ondelete="SET NULL", use_alter=True, name="fk_animals_main_photo")
    )
    notes: Mapped[str | None] = mapped_column(Text)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(Integer, default=1)

    herd_group: Mapped[HerdGroup | None] = relationship(lazy="joined")
    photos: Mapped[list["AnimalPhoto"]] = relationship(
        back_populates="animal",
        foreign_keys="AnimalPhoto.animal_id",
        order_by="AnimalPhoto.created_at.desc()",
    )

    __mapper_args__ = {"version_id_col": version}


class AnimalPhoto(Base):
    __tablename__ = "animal_photos"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    farm_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"), index=True)
    animal_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("animals.id", ondelete="CASCADE"), index=True)
    storage_key: Mapped[str] = mapped_column(String(300))
    thumb_key: Mapped[str] = mapped_column(String(300))
    content_type: Mapped[str] = mapped_column(String(50), default="image/jpeg")
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    size_bytes: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    kind: Mapped[PhotoKind] = mapped_column(_enum(PhotoKind, "photo_kind"), default=PhotoKind.other)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    animal: Mapped[Animal | None] = relationship(back_populates="photos", foreign_keys=[animal_id])


class AnimalIdentification(Base):
    __tablename__ = "animal_identifications"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    farm_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"), index=True)
    animal_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("animals.id", ondelete="SET NULL"))
    photo_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("animal_photos.id", ondelete="SET NULL"))
    method: Mapped[IdentMethod] = mapped_column(_enum(IdentMethod, "ident_method"))
    ocr_provider: Mapped[str | None] = mapped_column(String(30))
    raw_text: Mapped[str | None] = mapped_column(Text)
    candidates: Mapped[list | None] = mapped_column(JSON)
    matches: Mapped[list | None] = mapped_column(JSON)
    confidence: Mapped[float | None] = mapped_column(Float)
    status: Mapped[IdentStatus] = mapped_column(_enum(IdentStatus, "ident_status"))
    processing_ms: Mapped[int | None] = mapped_column(Integer)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    confirmed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_farm_created", "farm_id", "created_at"),)
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    farm_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    entity: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[str] = mapped_column(String(40))
    action: Mapped[str] = mapped_column(String(20))
    changes: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
