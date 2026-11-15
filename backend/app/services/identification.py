import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.ocr import OcrError, get_ocr_provider
from app.ai.tag_parser import TagCandidate, parse_tag_text
from app.ai.visual import get_visual_matcher
from app.media.images import InvalidImage, process_upload
from app.media.storage import get_storage
from app.models import Animal, AnimalIdentification, AnimalPhoto, IdentMethod, IdentStatus, PhotoKind
from app.schemas import IdentificationOut, MatchOut
from app.services.animals import match_candidates, photo_urls
from app.services.audit import audit

MESSAGES = {
    IdentStatus.matched: "Animal identificado. Confirma que es correcto.",
    IdentStatus.ambiguous: "Hay varias coincidencias. Elige el animal correcto.",
    IdentStatus.not_found: "Crotal leído, pero no hay ningún animal registrado con ese identificador.",
    IdentStatus.unreadable: "No se ha podido leer el crotal.",
}


def store_photo(
    db: Session, farm_id: uuid.UUID, user_id: uuid.UUID, raw: bytes, kind: PhotoKind, animal_id: uuid.UUID | None
) -> tuple[AnimalPhoto, bytes]:
    try:
        img = process_upload(raw)
    except InvalidImage as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(e)) from None
    pid = uuid.uuid4()
    key = f"farms/{farm_id}/photos/{pid}.jpg"
    tkey = f"farms/{farm_id}/photos/{pid}_thumb.jpg"
    st = get_storage()
    st.put(key, img.data, "image/jpeg")
    st.put(tkey, img.thumb, "image/jpeg")
    p = AnimalPhoto(
        id=pid,
        farm_id=farm_id,
        animal_id=animal_id,
        storage_key=key,
        thumb_key=tkey,
        width=img.width,
        height=img.height,
        size_bytes=len(img.data),
        sha256=img.sha256,
        kind=kind,
        uploaded_by=user_id,
    )
    db.add(p)
    db.flush()
    return p, img.data


def _merge(cands: dict[str, tuple[TagCandidate, float]], new: list[TagCandidate], conf: float | None) -> None:
    c_ocr = conf if conf is not None else 0.7
    for c in new:
        score = c.confidence * (0.5 + 0.5 * c_ocr)
        prev = cands.get(c.value)
        if prev is None or prev[1] < score:
            cands[c.value] = (c, score)


def identify_image(db: Session, farm_id: uuid.UUID, user_id: uuid.UUID, raw: bytes) -> IdentificationOut:
    photo, normalized = store_photo(db, farm_id, user_id, raw, PhotoKind.tag, None)
    provider = get_ocr_provider()
    merged: dict[str, tuple[TagCandidate, float]] = {}
    raw_text = None
    elapsed = None
    error_msg = None
    best_conf: float | None = None
    if provider.available:
        try:
            res = provider.read(normalized)
            elapsed = res.elapsed_ms
            raw_text = "\n---\n".join(dict.fromkeys(r.text for r in res.reads if r.text)) or None
            for r in res.reads:
                _merge(merged, parse_tag_text(r.text), r.confidence)
                if r.confidence is not None:
                    best_conf = max(best_conf or 0, r.confidence)
        except OcrError as e:
            error_msg = str(e)

    candidates = [
        TagCandidate(c.value, c.kind, round(score, 3)) for c, score in sorted(merged.values(), key=lambda x: -x[1])
    ][:10]
    # La confianza OCR ya está incorporada en cada candidato.
    matches: list[MatchOut] = match_candidates(db, farm_id, candidates, None) if candidates else []

    if not candidates:
        st = IdentStatus.unreadable
    elif not matches:
        st = IdentStatus.not_found
    elif len(matches) == 1 or (matches[0].confidence - matches[1].confidence) > 0.3:
        st = IdentStatus.matched
    else:
        st = IdentStatus.ambiguous

    ident = AnimalIdentification(
        farm_id=farm_id,
        photo_id=photo.id,
        method=IdentMethod.ocr,
        ocr_provider=provider.name,
        raw_text=raw_text,
        candidates=[c.as_dict() for c in candidates],
        matches=[
            {"animal_id": str(m.animal.id), "confidence": m.confidence, "matched_by": m.matched_by} for m in matches
        ],
        confidence=matches[0].confidence if matches else None,
        status=st,
        processing_ms=elapsed,
        created_by=user_id,
    )
    db.add(ident)
    db.commit()

    message = MESSAGES[st]
    if not provider.available:
        message = "El OCR no está disponible en el servidor. Introduce el identificador manualmente."
    elif error_msg:
        message = f"Error de OCR: {error_msg}. Repite la foto o introduce el identificador."
    return IdentificationOut(
        id=ident.id,
        status=st,
        ocr_provider=provider.name,
        ocr_available=provider.available,
        raw_text=raw_text,
        candidates=[c.as_dict() for c in candidates],
        matches=matches,
        photo_id=photo.id,
        photo_url=photo_urls(farm_id, photo.id)[0],
        processing_ms=elapsed,
        visual_search_available=get_visual_matcher().available,
        message=message,
    )


def _get_ident(db: Session, farm_id: uuid.UUID, ident_id: uuid.UUID) -> AnimalIdentification:
    ident = db.scalar(
        select(AnimalIdentification).where(AnimalIdentification.id == ident_id, AnimalIdentification.farm_id == farm_id)
    )
    if ident is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Identificación no encontrada")
    return ident


def attach_identification_photo(
    db: Session,
    farm_id: uuid.UUID,
    user_id: uuid.UUID,
    ident_id: uuid.UUID,
    animal: Animal,
    set_as_main: bool,
    attach_photo: bool = True,
) -> AnimalIdentification:
    """Confirmación humana: vincula el intento (y su foto) al animal elegido por el usuario."""
    ident = _get_ident(db, farm_id, ident_id)
    if ident.status in (IdentStatus.confirmed, IdentStatus.rejected):
        raise HTTPException(status.HTTP_409_CONFLICT, "Esta identificación ya se resolvió")
    ident.animal_id = animal.id
    ident.status = IdentStatus.confirmed
    ident.confirmed_by = user_id
    ident.resolved_at = datetime.now(UTC)
    if attach_photo and ident.photo_id:
        photo = db.get(AnimalPhoto, ident.photo_id)
        if photo is not None:
            photo.animal_id = animal.id
            if set_as_main or animal.main_photo_id is None:
                animal.main_photo_id = photo.id
    audit(
        db,
        farm_id=farm_id,
        user_id=user_id,
        entity="identification",
        entity_id=ident.id,
        action="confirm",
        changes={"animal_id": animal.id, "attach_photo": attach_photo},
    )
    db.commit()
    return ident


def reject_identification(db: Session, farm_id: uuid.UUID, user_id: uuid.UUID, ident_id: uuid.UUID) -> None:
    ident = _get_ident(db, farm_id, ident_id)
    if ident.status in (IdentStatus.confirmed, IdentStatus.rejected):
        raise HTTPException(status.HTTP_409_CONFLICT, "Esta identificación ya se resolvió")
    ident.status = IdentStatus.rejected
    ident.resolved_at = datetime.now(UTC)
    ident.confirmed_by = user_id
    audit(db, farm_id=farm_id, user_id=user_id, entity="identification", entity_id=ident.id, action="reject")
    db.commit()
