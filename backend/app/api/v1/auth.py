import jwt
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from app.api.deps import DB, CurrentUser
from app.core.security import create_token, decode_token, hash_password, verify_password
from app.models import User
from app.schemas import LoginIn, RefreshIn, RegisterIn, TokenOut, UserOut
from app.services.audit import audit

router = APIRouter(prefix="/auth", tags=["auth"])


def _tokens(user: User) -> TokenOut:
    return TokenOut(access_token=create_token(user.id, "access"), refresh_token=create_token(user.id, "refresh"))


@router.post("/register", response_model=TokenOut, status_code=201)
def register(body: RegisterIn, db: DB) -> TokenOut:
    email = body.email.lower()
    if db.scalar(select(User).where(func.lower(User.email) == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe una cuenta con ese email")
    user = User(email=email, password_hash=hash_password(body.password), full_name=body.full_name)
    db.add(user)
    db.flush()
    audit(db, farm_id=None, user_id=user.id, entity="user", entity_id=user.id, action="create")
    db.commit()
    return _tokens(user)


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: DB) -> TokenOut:
    user = db.scalar(select(User).where(func.lower(User.email) == body.email.lower()))
    if not user or not verify_password(body.password, user.password_hash) or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Email o contraseña incorrectos")
    return _tokens(user)


@router.post("/refresh", response_model=TokenOut)
def refresh(body: RefreshIn, db: DB) -> TokenOut:
    try:
        user_id = decode_token(body.refresh_token, "refresh")
    except (jwt.InvalidTokenError, ValueError, KeyError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sesión caducada, vuelve a iniciar sesión") from None
    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario no válido")
    return _tokens(user)


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> User:
    return user
