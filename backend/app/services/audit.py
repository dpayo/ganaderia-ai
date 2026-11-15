import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditLog


def _jsonable(v: Any) -> Any:
    if isinstance(v, (uuid.UUID, Decimal)):
        return str(v)
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    if isinstance(v, Enum):
        return v.value
    return v


def audit(
    db: Session,
    *,
    farm_id: uuid.UUID | None,
    user_id: uuid.UUID | None,
    entity: str,
    entity_id: uuid.UUID | str,
    action: str,
    changes: dict[str, Any] | None = None,
) -> None:
    db.add(
        AuditLog(
            farm_id=farm_id,
            user_id=user_id,
            entity=entity,
            entity_id=str(entity_id),
            action=action,
            changes={k: _jsonable(v) for k, v in (changes or {}).items()} or None,
        )
    )
