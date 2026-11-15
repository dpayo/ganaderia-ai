import uuid
from collections.abc import Callable
from dataclasses import dataclass
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Path, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.db.session import get_db
from app.models import Farm, FarmUser, Role, User

DB = Annotated[Session, Depends(get_db)]
_bearer = HTTPBearer(auto_error=False)

WRITE_ROLES = {Role.owner, Role.manager, Role.worker, Role.vet}
ADMIN_ROLES = {Role.owner, Role.manager}


def get_current_user(db: DB, creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]) -> User:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No autenticado", headers={"WWW-Authenticate": "Bearer"})
    try:
        user_id = decode_token(creds.credentials, "access")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sesión caducada") from None
    except (jwt.InvalidTokenError, ValueError, KeyError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token no válido") from None
    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario no válido")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


@dataclass
class FarmContext:
    farm: Farm
    user: User
    role: Role

    @property
    def farm_id(self) -> uuid.UUID:
        return self.farm.id


def _farm_ctx(allowed: set[Role] | None) -> Callable[..., FarmContext]:
    def dep(db: DB, user: CurrentUser, farm_id: Annotated[uuid.UUID, Path()]) -> FarmContext:
        membership = db.scalar(select(FarmUser).where(FarmUser.farm_id == farm_id, FarmUser.user_id == user.id))
        if membership is None:
            # 404 y no 403: no revelar la existencia de explotaciones ajenas.
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Explotación no encontrada")
        if allowed is not None and membership.role not in allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Permisos insuficientes")
        return FarmContext(farm=membership.farm, user=user, role=membership.role)

    return dep


FarmRead = Annotated[FarmContext, Depends(_farm_ctx(None))]
FarmWrite = Annotated[FarmContext, Depends(_farm_ctx(WRITE_ROLES))]
FarmAdmin = Annotated[FarmContext, Depends(_farm_ctx(ADMIN_ROLES))]
