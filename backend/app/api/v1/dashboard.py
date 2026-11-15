from datetime import date, timedelta

from fastapi import APIRouter
from sqlalchemy import and_, func, or_, select

from app.api.deps import DB, FarmRead
from app.models import Animal, AnimalIdentification, AnimalStatus, AuditLog, HerdGroup, IdentStatus, User
from app.schemas import ActivityOut, CensusPoint, DashboardAlert, DashboardOut

router = APIRouter(prefix="/farms/{farm_id}/dashboard", tags=["dashboard"])


def _month_end(d: date) -> date:
    nxt = (d.replace(day=28) + timedelta(days=4)).replace(day=1)
    return nxt - timedelta(days=1)


@router.get("", response_model=DashboardOut)
def dashboard(ctx: FarmRead, db: DB) -> DashboardOut:
    fid = ctx.farm_id
    alive = and_(Animal.farm_id == fid, Animal.deleted_at.is_(None))
    today = date.today()
    month_start = today.replace(day=1)

    total = db.scalar(select(func.count()).where(alive)) or 0
    active = db.scalar(select(func.count()).where(alive, Animal.status == AnimalStatus.active)) or 0
    births = db.scalar(select(func.count()).where(alive, Animal.birth_date >= month_start)) or 0
    exits_month = (
        db.scalar(
            select(func.count()).where(alive, Animal.status != AnimalStatus.active, Animal.status_date >= month_start)
        )
        or 0
    )
    exits_total = total - active

    by_sex = {
        s.value if hasattr(s, "value") else s: n
        for s, n in db.execute(
            select(Animal.sex, func.count()).where(alive, Animal.status == AnimalStatus.active).group_by(Animal.sex)
        )
    }
    by_group = [
        {"group_id": str(gid) if gid else None, "name": name or "Sin lote", "count": n}
        for gid, name, n in db.execute(
            select(Animal.herd_group_id, HerdGroup.name, func.count())
            .outerjoin(HerdGroup, HerdGroup.id == Animal.herd_group_id)
            .where(alive, Animal.status == AnimalStatus.active)
            .group_by(Animal.herd_group_id, HerdGroup.name)
            .order_by(func.count().desc())
        )
    ]

    # Evolución del censo (12 meses): activos a final de cada mes según fechas de entrada y baja.
    entry = func.coalesce(Animal.entry_date, Animal.birth_date, func.date(Animal.created_at))
    census: list[CensusPoint] = []
    cursor = month_start
    months = []
    for _ in range(12):
        months.append(cursor)
        cursor = (cursor - timedelta(days=1)).replace(day=1)
    for m in reversed(months):
        end = min(_month_end(m), today)
        n = (
            db.scalar(
                select(func.count()).where(
                    alive,
                    entry <= end,
                    or_(Animal.status == AnimalStatus.active, Animal.status_date.is_(None), Animal.status_date > end),
                )
            )
            or 0
        )
        census.append(CensusPoint(month=m.strftime("%Y-%m"), active=n))

    alerts: list[DashboardAlert] = []
    no_photo = (
        db.scalar(
            select(func.count()).where(alive, Animal.status == AnimalStatus.active, Animal.main_photo_id.is_(None))
        )
        or 0
    )
    if no_photo:
        alerts.append(
            DashboardAlert(
                level="info", code="no_photo", count=no_photo, message=f"{no_photo} animales activos sin fotografía"
            )
        )
    no_official = (
        db.scalar(
            select(func.count()).where(
                alive, Animal.status == AnimalStatus.active, Animal.official_id_normalized.is_(None)
            )
        )
        or 0
    )
    if no_official:
        alerts.append(
            DashboardAlert(
                level="warning",
                code="no_official_id",
                count=no_official,
                message=f"{no_official} animales activos sin identificador oficial",
            )
        )
    pending = (
        db.scalar(
            select(func.count()).where(
                AnimalIdentification.farm_id == fid,
                AnimalIdentification.status.in_([IdentStatus.matched, IdentStatus.ambiguous]),
                AnimalIdentification.created_at >= today - timedelta(days=7),
            )
        )
        or 0
    )
    if pending:
        alerts.append(
            DashboardAlert(
                level="info",
                code="pending_identifications",
                count=pending,
                message=f"{pending} identificaciones de la última semana sin confirmar",
            )
        )

    return DashboardOut(
        total_animals=total,
        active_animals=active,
        births_this_month=births,
        exits_this_month=exits_month,
        exits_total=exits_total,
        by_sex=by_sex,
        by_group=by_group,
        census=census,
        alerts=alerts,
    )


activity_router = APIRouter(prefix="/farms/{farm_id}/activity", tags=["dashboard"])

ENTITY_ES = {
    "animal": "Animal",
    "animal_photo": "Foto",
    "identification": "Identificación",
    "herd_group": "Lote",
    "farm": "Explotación",
    "farm_user": "Miembro",
}
ACTION_ES = {
    "create": "alta",
    "update": "modificación",
    "delete": "eliminación",
    "deactivate": "baja",
    "confirm": "confirmada",
    "reject": "rechazada",
}


@activity_router.get("", response_model=list[ActivityOut])
def activity(ctx: FarmRead, db: DB, limit: int = 50) -> list[ActivityOut]:
    """Registro de actividad (auditoría) de la explotación, más reciente primero."""
    rows = db.execute(
        select(AuditLog, User.full_name)
        .outerjoin(User, User.id == AuditLog.user_id)
        .where(AuditLog.farm_id == ctx.farm_id)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(min(max(limit, 1), 200))
    ).all()
    return [
        ActivityOut(
            id=log.id,
            entity=log.entity,
            entity_id=log.entity_id,
            action=log.action,
            user_name=name,
            created_at=log.created_at,
            summary=f"{ENTITY_ES.get(log.entity, log.entity)}: {ACTION_ES.get(log.action, log.action)}",
            changes=log.changes,
        )
        for log, name in rows
    ]
