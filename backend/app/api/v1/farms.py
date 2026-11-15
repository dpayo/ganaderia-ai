import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.api.deps import DB, CurrentUser, FarmAdmin, FarmRead, FarmWrite
from app.models import Animal, Farm, FarmUser, HerdGroup, Role, User
from app.schemas import FarmIn, FarmOut, FarmUpdate, GroupIn, GroupOut, MemberIn, MemberOut
from app.services.audit import audit

router = APIRouter(prefix="/farms", tags=["farms"])


def _farm_out(farm: Farm, role: Role) -> FarmOut:
    out = FarmOut.model_validate(farm)
    out.role = role
    return out


@router.get("", response_model=list[FarmOut])
def list_farms(db: DB, user: CurrentUser) -> list[FarmOut]:
    rows = db.execute(
        select(Farm, FarmUser.role).join(FarmUser).where(FarmUser.user_id == user.id).order_by(Farm.name)
    ).all()
    return [_farm_out(f, r) for f, r in rows]


@router.post("", response_model=FarmOut, status_code=201)
def create_farm(body: FarmIn, db: DB, user: CurrentUser) -> FarmOut:
    farm = Farm(**body.model_dump())
    db.add(farm)
    db.flush()
    db.add(FarmUser(farm_id=farm.id, user_id=user.id, role=Role.owner))
    audit(
        db,
        farm_id=farm.id,
        user_id=user.id,
        entity="farm",
        entity_id=farm.id,
        action="create",
        changes=body.model_dump(),
    )
    db.commit()
    return _farm_out(farm, Role.owner)


@router.get("/{farm_id}", response_model=FarmOut)
def get_farm(ctx: FarmRead) -> FarmOut:
    return _farm_out(ctx.farm, ctx.role)


@router.patch("/{farm_id}", response_model=FarmOut)
def update_farm(body: FarmUpdate, ctx: FarmAdmin, db: DB) -> FarmOut:
    changes = body.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(ctx.farm, k, v)
    audit(
        db,
        farm_id=ctx.farm_id,
        user_id=ctx.user.id,
        entity="farm",
        entity_id=ctx.farm_id,
        action="update",
        changes=changes,
    )
    db.commit()
    return _farm_out(ctx.farm, ctx.role)


# ---------- Miembros ----------
@router.get("/{farm_id}/members", response_model=list[MemberOut])
def list_members(ctx: FarmRead, db: DB) -> list[MemberOut]:
    rows = db.execute(select(FarmUser, User).join(User).where(FarmUser.farm_id == ctx.farm_id)).all()
    return [MemberOut(user_id=u.id, email=u.email, full_name=u.full_name, role=m.role) for m, u in rows]


@router.post("/{farm_id}/members", response_model=MemberOut, status_code=201)
def add_member(body: MemberIn, ctx: FarmAdmin, db: DB) -> MemberOut:
    if body.role == Role.owner and ctx.role != Role.owner:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo el titular puede añadir otros titulares")
    user = db.scalar(select(User).where(func.lower(User.email) == body.email.lower()))
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "El usuario debe registrarse antes en la app")
    db.add(FarmUser(farm_id=ctx.farm_id, user_id=user.id, role=body.role))
    audit(
        db,
        farm_id=ctx.farm_id,
        user_id=ctx.user.id,
        entity="farm_user",
        entity_id=user.id,
        action="create",
        changes={"role": body.role},
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "El usuario ya es miembro") from None
    return MemberOut(user_id=user.id, email=user.email, full_name=user.full_name, role=body.role)


# ---------- Lotes ----------
@router.get("/{farm_id}/groups", response_model=list[GroupOut])
def list_groups(ctx: FarmRead, db: DB) -> list[GroupOut]:
    counts = dict(
        db.execute(
            select(Animal.herd_group_id, func.count())
            .where(Animal.farm_id == ctx.farm_id, Animal.deleted_at.is_(None), Animal.status == "active")
            .group_by(Animal.herd_group_id)
        ).all()
    )
    groups = db.scalars(select(HerdGroup).where(HerdGroup.farm_id == ctx.farm_id).order_by(HerdGroup.name))
    out = []
    for g in groups:
        o = GroupOut.model_validate(g)
        o.animal_count = counts.get(g.id, 0)
        out.append(o)
    return out


@router.post("/{farm_id}/groups", response_model=GroupOut, status_code=201)
def create_group(body: GroupIn, ctx: FarmWrite, db: DB) -> HerdGroup:
    g = HerdGroup(farm_id=ctx.farm_id, **body.model_dump())
    db.add(g)
    try:
        db.flush()
        audit(
            db,
            farm_id=ctx.farm_id,
            user_id=ctx.user.id,
            entity="herd_group",
            entity_id=g.id,
            action="create",
            changes=body.model_dump(),
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe un lote con ese nombre") from None
    return g


@router.patch("/{farm_id}/groups/{group_id}", response_model=GroupOut)
def update_group(group_id: uuid.UUID, body: GroupIn, ctx: FarmWrite, db: DB) -> HerdGroup:
    g = db.scalar(select(HerdGroup).where(HerdGroup.id == group_id, HerdGroup.farm_id == ctx.farm_id))
    if g is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lote no encontrado")
    g.name, g.description = body.name, body.description
    audit(
        db,
        farm_id=ctx.farm_id,
        user_id=ctx.user.id,
        entity="herd_group",
        entity_id=g.id,
        action="update",
        changes=body.model_dump(),
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe un lote con ese nombre") from None
    return g


@router.delete("/{farm_id}/groups/{group_id}", status_code=204)
def delete_group(group_id: uuid.UUID, ctx: FarmAdmin, db: DB) -> None:
    g = db.scalar(select(HerdGroup).where(HerdGroup.id == group_id, HerdGroup.farm_id == ctx.farm_id))
    if g is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lote no encontrado")
    db.delete(g)  # los animales quedan sin lote (ON DELETE SET NULL)
    audit(db, farm_id=ctx.farm_id, user_id=ctx.user.id, entity="herd_group", entity_id=group_id, action="delete")
    db.commit()
