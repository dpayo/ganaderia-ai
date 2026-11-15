import csv
import io
import uuid
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Annotated, Literal

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import ValidationError
from sqlalchemy import func, select

from app.api.deps import DB, FarmAdmin, FarmRead, FarmWrite
from app.models import Animal, AnimalStatus, HerdGroup, Sex
from app.schemas import (
    AnimalCreate,
    AnimalDeactivate,
    AnimalDetail,
    AnimalOut,
    AnimalPage,
    AnimalUpdate,
    IdentificationOut,
    ImportReport,
    SyncPage,
)
from app.services import animals as svc
from app.services.identification import attach_identification_photo

router = APIRouter(prefix="/farms/{farm_id}/animals", tags=["animals"])

EXPORT_COLUMNS = [
    ("official_id", "identificador_oficial"),
    ("internal_id", "identificador_interno"),
    ("name", "nombre"),
    ("species", "especie"),
    ("breed", "raza"),
    ("sex", "sexo"),
    ("birth_date", "fecha_nacimiento"),
    ("entry_date", "fecha_entrada"),
    ("weight_kg", "peso_kg"),
    ("herd_group_name", "lote"),
    ("status", "estado"),
    ("health_status", "estado_sanitario"),
    ("notes", "observaciones"),
]
SEX_ES = {"macho": "male", "m": "male", "hembra": "female", "h": "female", "f": "female", "": "unknown"}


@router.get("", response_model=AnimalPage)
def list_animals(
    ctx: FarmRead,
    db: DB,
    q: str | None = None,
    status_: Annotated[AnimalStatus | None, Query(alias="status")] = None,
    group_id: uuid.UUID | None = None,
    sex: Sex | None = None,
    sort: Literal["recent", "official_id", "birth_date", "name"] = "recent",
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> AnimalPage:
    stmt = svc.list_query(ctx.farm_id, q, status_, group_id, sex, sort)
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    items = db.scalars(stmt.limit(limit).offset(offset)).unique().all()
    return AnimalPage(items=[svc.to_out(a) for a in items], total=total, limit=limit, offset=offset)


@router.get("/sync", response_model=SyncPage)
def sync_animals(ctx: FarmRead, db: DB, since: datetime | None = None) -> SyncPage:
    """Cambios desde `since` (incluye eliminados) para la caché offline del móvil."""
    server_time = db.scalar(select(func.now()))
    stmt = select(Animal).where(Animal.farm_id == ctx.farm_id)
    if since:
        stmt = stmt.where(Animal.updated_at > since)
    else:
        stmt = stmt.where(Animal.deleted_at.is_(None))
    items = db.scalars(stmt.order_by(Animal.updated_at)).unique().all()
    return SyncPage(items=[svc.to_out(a) for a in items], server_time=server_time)


@router.get("/lookup", response_model=IdentificationOut)
def lookup(ctx: FarmRead, db: DB, code: Annotated[str, Query(min_length=1, max_length=40)]) -> IdentificationOut:
    """Búsqueda por identificador introducido a mano (oficial, nº de manejo o interno)."""
    candidates, matches = svc.lookup_by_text(db, ctx.farm_id, code)
    st = "matched" if len(matches) == 1 else "ambiguous" if matches else "not_found"
    return IdentificationOut(
        id=None,
        status=st,
        ocr_provider=None,
        ocr_available=True,
        raw_text=code,
        candidates=[c.as_dict() for c in candidates],
        matches=matches,
        photo_id=None,
        processing_ms=None,
        visual_search_available=False,
        message={
            "matched": "Animal encontrado",
            "ambiguous": "Varias coincidencias",
            "not_found": "No hay ningún animal con ese identificador",
        }[st],
    )


@router.post("", response_model=AnimalDetail, status_code=201)
def create_animal(body: AnimalCreate, ctx: FarmWrite, db: DB) -> AnimalDetail:
    a = svc.create_animal(db, ctx.farm_id, ctx.user.id, body, ctx.farm.species_default)
    if body.from_identification_id:
        attach_identification_photo(db, ctx.farm_id, ctx.user.id, body.from_identification_id, a, set_as_main=True)
        db.refresh(a)
    return svc.to_detail(db, svc.get_animal(db, ctx.farm_id, a.id))


@router.get("/export")
def export_animals(
    ctx: FarmRead, db: DB, format: Literal["csv", "xlsx"] = "csv", include_inactive: bool = True
) -> StreamingResponse:
    stmt = select(Animal).where(Animal.farm_id == ctx.farm_id, Animal.deleted_at.is_(None))
    if not include_inactive:
        stmt = stmt.where(Animal.status == AnimalStatus.active)
    rows = []
    for a in db.scalars(stmt.order_by(Animal.official_id_normalized)).unique():
        o = svc.to_out(a).model_dump()
        rows.append([_cell(o.get(k)) for k, _ in EXPORT_COLUMNS])
    headers = [h for _, h in EXPORT_COLUMNS]
    stamp = date.today().isoformat()
    if format == "csv":
        buf = io.StringIO()
        w = csv.writer(buf, delimiter=";")
        w.writerow(headers)
        w.writerows(rows)
        data = ("﻿" + buf.getvalue()).encode("utf-8")  # BOM para Excel en español
        media, ext = "text/csv; charset=utf-8", "csv"
    else:
        from openpyxl import Workbook

        wb = Workbook()
        ws = wb.active
        ws.title = "Animales"
        ws.append(headers)
        for r in rows:
            ws.append(r)
        out = io.BytesIO()
        wb.save(out)
        data = out.getvalue()
        media, ext = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"
    return StreamingResponse(
        iter([data]),
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="animales_{stamp}.{ext}"'},
    )


def _cell(v: object) -> object:
    if v is None:
        return ""
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return float(v)
    if hasattr(v, "value"):
        return v.value  # Enum
    return v


@router.post("/import", response_model=ImportReport)
async def import_animals(
    ctx: FarmAdmin, db: DB, file: Annotated[UploadFile, File()], dry_run: bool = True
) -> ImportReport:
    """Importa CSV (separador ; o ,) o XLSX con las mismas columnas que la exportación.

    Por defecto `dry_run=true`: valida y devuelve el informe sin guardar nada.
    """
    raw = await file.read()
    name = (file.filename or "").lower()
    try:
        records = _read_xlsx(raw) if name.endswith((".xlsx", ".xlsm")) else _read_csv(raw)
    except Exception as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"No se pudo leer el archivo: {e}") from None
    groups = {g.name.lower(): g.id for g in db.scalars(select(HerdGroup).where(HerdGroup.farm_id == ctx.farm_id))}
    errors: list[dict] = []
    created = 0
    for i, rec in enumerate(records, start=2):  # fila 1 = cabecera
        try:
            payload = _record_to_payload(rec, groups)
        except (ValidationError, ValueError, InvalidOperation) as e:
            errors.append({"row": i, "error": _err_text(e)})
            continue
        if dry_run:
            norm = svc.normalize_official_id(payload.official_id) if payload.official_id else None
            if norm and db.scalar(
                select(Animal.id).where(
                    Animal.farm_id == ctx.farm_id, Animal.official_id_normalized == norm, Animal.deleted_at.is_(None)
                )
            ):
                errors.append({"row": i, "error": "Ya existe un animal con ese identificador oficial"})
                continue
            created += 1
            continue
        try:
            svc.create_animal(db, ctx.farm_id, ctx.user.id, payload, ctx.farm.species_default)
            created += 1
        except HTTPException as e:
            errors.append({"row": i, "error": e.detail})
    return ImportReport(dry_run=dry_run, total_rows=len(records), created=created, errors=errors)


def _err_text(e: Exception) -> str:
    if isinstance(e, ValidationError):
        return "; ".join(f"{'.'.join(map(str, x['loc']))}: {x['msg']}" for x in e.errors())
    return str(e)


def _read_csv(raw: bytes) -> list[dict]:
    text = raw.decode("utf-8-sig", errors="replace")
    dialect = csv.Sniffer().sniff(text.splitlines()[0], delimiters=";,")
    return [
        {(k or "").strip().lower(): (v or "").strip() for k, v in r.items()}
        for r in csv.DictReader(io.StringIO(text), dialect=dialect)
    ]


def _read_xlsx(raw: bytes) -> list[dict]:
    from openpyxl import load_workbook

    ws = load_workbook(io.BytesIO(raw), read_only=True, data_only=True).active
    it = ws.iter_rows(values_only=True)
    header = [str(h or "").strip().lower() for h in next(it)]
    out = []
    for row in it:
        if row is None or all(c in (None, "") for c in row):
            continue
        out.append(
            {
                header[j]: (
                    "" if c is None else (c.isoformat()[:10] if isinstance(c, (date, datetime)) else str(c)).strip()
                )
                for j, c in enumerate(row)
                if j < len(header)
            }
        )
    return out


def _record_to_payload(rec: dict, groups: dict[str, uuid.UUID]) -> AnimalCreate:
    g = rec.get("lote", "")
    if g and g.lower() not in groups:
        raise ValueError(f"El lote '{g}' no existe; créalo antes de importar")
    sex_raw = rec.get("sexo", "").lower()
    sex = SEX_ES.get(sex_raw, sex_raw or "unknown")
    weight = rec.get("peso_kg", "").replace(",", ".")
    return AnimalCreate(
        official_id=rec.get("identificador_oficial") or None,
        internal_id=rec.get("identificador_interno") or None,
        name=rec.get("nombre") or None,
        species=rec.get("especie") or None,
        breed=rec.get("raza") or None,
        sex=sex,  # type: ignore[arg-type]
        birth_date=rec.get("fecha_nacimiento") or None,  # type: ignore[arg-type]
        entry_date=rec.get("fecha_entrada") or None,  # type: ignore[arg-type]
        weight_kg=Decimal(weight) if weight else None,
        herd_group_id=groups.get(g.lower()) if g else None,
        notes=rec.get("observaciones") or None,
    )


@router.get("/{animal_id}", response_model=AnimalDetail)
def get_animal(animal_id: uuid.UUID, ctx: FarmRead, db: DB) -> AnimalDetail:
    return svc.to_detail(db, svc.get_animal(db, ctx.farm_id, animal_id))


@router.patch("/{animal_id}", response_model=AnimalDetail)
def update_animal(animal_id: uuid.UUID, body: AnimalUpdate, ctx: FarmWrite, db: DB) -> AnimalDetail:
    a = svc.update_animal(db, svc.get_animal(db, ctx.farm_id, animal_id), ctx.user.id, body)
    return svc.to_detail(db, svc.get_animal(db, ctx.farm_id, a.id))


@router.post("/{animal_id}/deactivate", response_model=AnimalOut)
def deactivate(animal_id: uuid.UUID, body: AnimalDeactivate, ctx: FarmWrite, db: DB) -> AnimalOut:
    a = svc.deactivate_animal(
        db, svc.get_animal(db, ctx.farm_id, animal_id), ctx.user.id, body.status, body.date, body.reason
    )
    return svc.to_out(a)


@router.delete("/{animal_id}", status_code=204)
def delete_animal(animal_id: uuid.UUID, ctx: FarmAdmin, db: DB) -> None:
    svc.soft_delete_animal(db, svc.get_animal(db, ctx.farm_id, animal_id), ctx.user.id)
