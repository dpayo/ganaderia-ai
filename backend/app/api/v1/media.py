import uuid
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy import select

from app.api.deps import DB, FarmRead, FarmWrite
from app.media.storage import StorageError, get_storage
from app.models import AnimalPhoto, PhotoKind
from app.schemas import ConfirmIn, IdentificationOut, PhotoOut
from app.services import animals as svc
from app.services import identification as ident_svc
from app.services.audit import audit

router = APIRouter(prefix="/farms/{farm_id}", tags=["photos & identification"])


async def _read(file: UploadFile) -> bytes:
    data = await file.read()
    if not data:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Archivo vacío")
    return data


@router.post("/animals/{animal_id}/photos", response_model=PhotoOut, status_code=201)
async def upload_photo(
    animal_id: uuid.UUID,
    ctx: FarmWrite,
    db: DB,
    file: Annotated[UploadFile, File()],
    kind: Annotated[PhotoKind, Form()] = PhotoKind.body,
    set_as_main: Annotated[bool, Form()] = False,
) -> PhotoOut:
    a = svc.get_animal(db, ctx.farm_id, animal_id)
    photo, _ = ident_svc.store_photo(db, ctx.farm_id, ctx.user.id, await _read(file), kind, a.id)
    if set_as_main or a.main_photo_id is None:
        a.main_photo_id = photo.id
    audit(
        db,
        farm_id=ctx.farm_id,
        user_id=ctx.user.id,
        entity="animal_photo",
        entity_id=photo.id,
        action="create",
        changes={"animal_id": a.id, "kind": kind},
    )
    db.commit()
    return svc.to_photo_out(photo)


@router.get("/photos/{photo_id}/file")
def get_photo_file(photo_id: uuid.UUID, ctx: FarmRead, db: DB, thumb: bool = False) -> Response:
    p = db.scalar(select(AnimalPhoto).where(AnimalPhoto.id == photo_id, AnimalPhoto.farm_id == ctx.farm_id))
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Foto no encontrada")
    try:
        data = get_storage().get(p.thumb_key if thumb else p.storage_key)
    except StorageError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Archivo no disponible") from None
    return Response(content=data, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=86400"})


@router.delete("/photos/{photo_id}", status_code=204)
def delete_photo(photo_id: uuid.UUID, ctx: FarmWrite, db: DB) -> None:
    p = db.scalar(select(AnimalPhoto).where(AnimalPhoto.id == photo_id, AnimalPhoto.farm_id == ctx.farm_id))
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Foto no encontrada")
    if p.animal is not None and p.animal.main_photo_id == p.id:
        p.animal.main_photo_id = None
    keys = (p.storage_key, p.thumb_key)
    db.delete(p)
    audit(db, farm_id=ctx.farm_id, user_id=ctx.user.id, entity="animal_photo", entity_id=photo_id, action="delete")
    db.commit()
    st = get_storage()
    for k in keys:
        st.delete(k)


@router.post("/identify", response_model=IdentificationOut)
async def identify(ctx: FarmWrite, db: DB, file: Annotated[UploadFile, File()]) -> IdentificationOut:
    """Identifica un animal a partir de una foto del crotal (OCR). No modifica ningún animal:
    el resultado debe confirmarse con /identifications/{id}/confirm."""
    return ident_svc.identify_image(db, ctx.farm_id, ctx.user.id, await _read(file))


@router.post("/identifications/{ident_id}/confirm", status_code=204)
def confirm(ident_id: uuid.UUID, body: ConfirmIn, ctx: FarmWrite, db: DB) -> None:
    a = svc.get_animal(db, ctx.farm_id, body.animal_id)
    ident_svc.attach_identification_photo(
        db, ctx.farm_id, ctx.user.id, ident_id, a, body.set_as_main, body.attach_photo
    )


@router.post("/identifications/{ident_id}/reject", status_code=204)
def reject(ident_id: uuid.UUID, ctx: FarmWrite, db: DB) -> None:
    ident_svc.reject_identification(db, ctx.farm_id, ctx.user.id, ident_id)
