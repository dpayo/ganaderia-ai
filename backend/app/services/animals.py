import uuid
from datetime import UTC, date, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.orm.exc import StaleDataError

from app.ai.tag_parser import TagCandidate, hamming, normalize_free_id, normalize_official_id, parse_tag_text
from app.core.config import get_settings
from app.models import Animal, AnimalPhoto, AnimalStatus, HerdGroup, Sex
from app.schemas import AnimalCreate, AnimalDetail, AnimalOut, AnimalRef, AnimalUpdate, MatchOut, PhotoOut
from app.services.audit import audit


def photo_urls(farm_id: uuid.UUID, photo_id: uuid.UUID) -> tuple[str, str]:
    base = f"{get_settings().api_prefix}/farms/{farm_id}/photos/{photo_id}/file"
    return base, f"{base}?thumb=true"


def to_photo_out(p: AnimalPhoto) -> PhotoOut:
    url, thumb = photo_urls(p.farm_id, p.id)
    out = PhotoOut.model_validate(p)
    out.url, out.thumb_url = url, thumb
    return out


def to_out(a: Animal) -> AnimalOut:
    out = AnimalOut.model_validate(a)
    out.herd_group_name = a.herd_group.name if a.herd_group else None
    if a.main_photo_id:
        out.main_photo_thumb_url = photo_urls(a.farm_id, a.main_photo_id)[1]
    return out


def to_detail(db: Session, a: Animal) -> AnimalDetail:
    base = to_out(a).model_dump()
    parents = {
        p.id: p for p in db.scalars(select(Animal).where(Animal.id.in_([x for x in (a.mother_id, a.father_id) if x])))
    }
    return AnimalDetail(
        **base,
        mother=AnimalRef.model_validate(parents[a.mother_id]) if a.mother_id in parents else None,
        father=AnimalRef.model_validate(parents[a.father_id]) if a.father_id in parents else None,
        photos=[to_photo_out(p) for p in a.photos],
    )


def get_animal(db: Session, farm_id: uuid.UUID, animal_id: uuid.UUID, include_deleted: bool = False) -> Animal:
    q = select(Animal).where(Animal.id == animal_id, Animal.farm_id == farm_id).options(selectinload(Animal.photos))
    if not include_deleted:
        q = q.where(Animal.deleted_at.is_(None))
    a = db.scalar(q)
    if a is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Animal no encontrado")
    return a


def _validate_refs(db: Session, farm_id: uuid.UUID, data: dict[str, Any], self_id: uuid.UUID | None) -> None:
    for field, expected_sex, label in (
        ("mother_id", Sex.female, "La madre"),
        ("father_id", Sex.male, "El padre"),
    ):
        pid = data.get(field)
        if pid is None:
            continue
        if pid == self_id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"{label} no puede ser el propio animal")
        parent = db.scalar(select(Animal).where(Animal.id == pid, Animal.farm_id == farm_id))
        if parent is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"{label} no existe en esta explotación")
        if parent.sex not in (expected_sex, Sex.unknown):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"{label} tiene un sexo incompatible")
    gid = data.get("herd_group_id")
    if gid is not None:
        g = db.scalar(select(HerdGroup).where(HerdGroup.id == gid, HerdGroup.farm_id == farm_id))
        if g is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "El lote no existe en esta explotación")


def _apply_ids(data: dict[str, Any]) -> None:
    if "official_id" in data:
        raw = data["official_id"]
        norm = normalize_official_id(raw) if raw else None
        data["official_id_normalized"] = norm
        if norm:
            # Formato de presentación: ES 0123 4567 8901
            d = norm[2:]
            data["official_id"] = f"ES {d[:4]} {d[4:8]} {d[8:]}"
    if data.get("internal_id"):
        data["internal_id"] = normalize_free_id(data["internal_id"])


def _raise_integrity(db: Session, e: IntegrityError) -> None:
    db.rollback()
    msg = str(e.orig)
    if "uq_animals_farm_official" in msg:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe un animal con ese identificador oficial") from None
    if "uq_animals_farm_internal" in msg:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe un animal con ese identificador interno") from None
    if "ck_animals_has_identifier" in msg:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "Indica al menos el identificador oficial o el interno"
        ) from None
    raise e


def _commit_unique(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError as e:
        _raise_integrity(db, e)


def create_animal(
    db: Session, farm_id: uuid.UUID, user_id: uuid.UUID, payload: AnimalCreate, default_species: str
) -> Animal:
    data = payload.model_dump(exclude={"from_identification_id"}, exclude_none=True)
    _apply_ids(data)
    if not data.get("official_id_normalized") and not data.get("internal_id"):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "Indica al menos el identificador oficial o el interno"
        )
    _validate_refs(db, farm_id, data, None)
    data.setdefault("species", default_species)
    data.setdefault("entry_date", data.get("birth_date") or date.today())
    a = Animal(farm_id=farm_id, **data)
    db.add(a)
    try:
        db.flush()
    except IntegrityError as e:
        _raise_integrity(db, e)
    audit(db, farm_id=farm_id, user_id=user_id, entity="animal", entity_id=a.id, action="create", changes=data)
    _commit_unique(db)
    db.refresh(a)
    return a


def update_animal(db: Session, a: Animal, user_id: uuid.UUID, payload: AnimalUpdate) -> Animal:
    expected = payload.expected_version
    data = payload.model_dump(exclude_unset=True, exclude={"expected_version"})
    if expected is not None and expected != a.version:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "El animal se ha modificado desde otro dispositivo. Recarga la ficha antes de guardar.",
        )
    _apply_ids(data)
    _validate_refs(db, a.farm_id, data, a.id)
    changes: dict[str, Any] = {}
    for k, v in data.items():
        if getattr(a, k) != v:
            changes[k] = v
            setattr(a, k, v)
    if (a.official_id_normalized or a.internal_id) is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "Indica al menos el identificador oficial o el interno"
        )
    if changes:
        audit(db, farm_id=a.farm_id, user_id=user_id, entity="animal", entity_id=a.id, action="update", changes=changes)
        try:
            _commit_unique(db)
        except StaleDataError:
            db.rollback()
            raise HTTPException(status.HTTP_409_CONFLICT, "Conflicto de versión, recarga la ficha") from None
        db.refresh(a)
    return a


def deactivate_animal(
    db: Session, a: Animal, user_id: uuid.UUID, new_status: str, on: date, reason: str | None
) -> Animal:
    if a.status != AnimalStatus.active:
        raise HTTPException(status.HTTP_409_CONFLICT, "El animal ya está dado de baja")
    a.status = AnimalStatus(new_status)
    a.status_date = on
    a.status_reason = reason
    audit(
        db,
        farm_id=a.farm_id,
        user_id=user_id,
        entity="animal",
        entity_id=a.id,
        action="deactivate",
        changes={"status": new_status, "date": on, "reason": reason},
    )
    db.commit()
    db.refresh(a)
    return a


def soft_delete_animal(db: Session, a: Animal, user_id: uuid.UUID) -> None:
    """Eliminación lógica (registros erróneos). Las bajas reales usan deactivate_animal."""
    a.deleted_at = datetime.now(UTC)
    audit(db, farm_id=a.farm_id, user_id=user_id, entity="animal", entity_id=a.id, action="delete")
    db.commit()


def list_query(
    farm_id: uuid.UUID,
    q: str | None,
    status_: AnimalStatus | None,
    group_id: uuid.UUID | None,
    sex: Sex | None,
    sort: str,
) -> Select:
    stmt = select(Animal).where(Animal.farm_id == farm_id, Animal.deleted_at.is_(None))
    if status_:
        stmt = stmt.where(Animal.status == status_)
    if group_id:
        stmt = stmt.where(Animal.herd_group_id == group_id)
    if sex:
        stmt = stmt.where(Animal.sex == sex)
    if q:
        term = q.strip()
        compact = normalize_free_id(term)
        conds = [
            Animal.official_id_normalized.ilike(f"%{compact}%"),
            Animal.internal_id.ilike(f"%{compact}%"),
            Animal.name.ilike(f"%{term}%"),
            Animal.breed.ilike(f"%{term}%"),
        ]
        stmt = stmt.where(or_(*conds))
    order = {
        "recent": Animal.created_at.desc(),
        "official_id": Animal.official_id_normalized.asc().nulls_last(),
        "birth_date": Animal.birth_date.desc().nulls_last(),
        "name": Animal.name.asc().nulls_last(),
    }.get(sort, Animal.created_at.desc())
    return stmt.order_by(order, Animal.id)


# ---------- Identificación por identificador (OCR o manual) ----------


def match_candidates(
    db: Session, farm_id: uuid.UUID, candidates: list[TagCandidate], ocr_conf: float | None
) -> list[MatchOut]:
    """Busca animales activos de la explotación para cada candidato.

    Orden de preferencia: oficial exacto > interno exacto > oficial con 1 dígito distinto > sufijo de manejo.
    """
    factor = ocr_conf if ocr_conf is not None else 1.0
    factor = max(0.3, min(1.0, factor))
    base = select(Animal).where(Animal.farm_id == farm_id, Animal.deleted_at.is_(None))
    results: dict[uuid.UUID, MatchOut] = {}

    def put(a: Animal, conf: float, by: str, val: str) -> None:
        conf = round(min(0.99, conf), 3)
        cur = results.get(a.id)
        if cur is None or cur.confidence < conf:
            results[a.id] = MatchOut(animal=to_out(a), confidence=conf, matched_by=by, matched_value=val)  # type: ignore[arg-type]

    officials = [c for c in candidates if c.value.startswith("ES")]
    managements = [c for c in candidates if c.kind == "management"]

    if officials:
        values = [c.value for c in officials]
        for a in db.scalars(base.where(Animal.official_id_normalized.in_(values))):
            c = next(c for c in officials if c.value == a.official_id_normalized)
            put(a, c.confidence * factor + 0.04, "official_exact", c.value)
        if not results:
            # Tolerancia a un dígito mal leído: comparar con animales que comparten los 4 últimos dígitos
            # o los 8 primeros.
            for c in officials:
                d = c.value
                near = db.scalars(
                    base.where(
                        or_(
                            func.right(Animal.official_id_normalized, 4) == d[-4:],
                            func.left(Animal.official_id_normalized, 10) == d[:10],
                        )
                    )
                )
                for a in near:
                    if a.official_id_normalized and hamming(a.official_id_normalized, d) == 1:
                        put(a, c.confidence * factor * 0.6, "official_fuzzy", c.value)

    if not any(m.matched_by == "official_exact" for m in results.values()):
        values = [normalize_free_id(c.value) for c in candidates if not c.value.startswith("ES")]
        if values:
            for a in db.scalars(base.where(Animal.internal_id.in_(values))):
                put(a, 0.85 * factor, "internal_id", a.internal_id or "")
        for c in managements:
            suffix_conds = and_(
                Animal.official_id_normalized.is_not(None),
                func.right(Animal.official_id_normalized, len(c.value)) == c.value,
            )
            hits = list(db.scalars(base.where(suffix_conds).limit(20)))
            for a in hits:
                # Penaliza si el sufijo es ambiguo
                put(a, (0.7 if len(hits) == 1 else 0.45) * factor, "management_suffix", c.value)

    ordered = sorted(results.values(), key=lambda m: (-m.confidence, m.animal.official_id or ""))
    # Activos primero
    ordered.sort(key=lambda m: m.animal.status != AnimalStatus.active)
    return ordered


def lookup_by_text(db: Session, farm_id: uuid.UUID, text: str) -> tuple[list[TagCandidate], list[MatchOut]]:
    candidates = parse_tag_text(text, min_management_len=1, max_management_len=12)
    norm = normalize_free_id(text)
    if norm and not any(c.value == norm for c in candidates):
        # Texto libre (p. ej. "245" o "VACA-12"): se prueba como nº de manejo e identificador interno.
        candidates.append(TagCandidate(norm, "management" if norm.isdigit() else "internal", 0.9))
    return candidates, match_candidates(db, farm_id, candidates, None)
