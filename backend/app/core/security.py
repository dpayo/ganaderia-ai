import uuid
from datetime import UTC, datetime, timedelta
from typing import Literal

import bcrypt
import jwt

from app.core.config import get_settings

TokenType = Literal["access", "refresh"]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def create_token(user_id: uuid.UUID, token_type: TokenType) -> str:
    s = get_settings()
    now = datetime.now(UTC)
    delta = (
        timedelta(minutes=s.access_token_minutes) if token_type == "access" else timedelta(days=s.refresh_token_days)
    )
    payload = {
        "sub": str(user_id),
        "type": token_type,
        "iat": int(now.timestamp()),
        "exp": int((now + delta).timestamp()),
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(payload, s.jwt_secret, algorithm=s.jwt_algorithm)


def decode_token(token: str, expected_type: TokenType) -> uuid.UUID:
    """Devuelve el user_id o lanza jwt.InvalidTokenError."""
    s = get_settings()
    payload = jwt.decode(token, s.jwt_secret, algorithms=[s.jwt_algorithm])
    if payload.get("type") != expected_type:
        raise jwt.InvalidTokenError("Tipo de token incorrecto")
    return uuid.UUID(payload["sub"])
