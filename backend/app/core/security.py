from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from jose import JWTError, jwt

from app.config import settings


def hash_password(password: str) -> str:
    # bcrypt only uses the first 72 bytes; truncate explicitly so long passwords never raise.
    return bcrypt.hashpw(password.encode("utf-8")[:72], bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8")[:72], hashed.encode("utf-8"))
    except ValueError:
        return False


def _make_token(sub: str, role: str, kind: str, expires: timedelta) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": sub, "role": role, "type": kind, "iat": now, "exp": now + expires}
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_access_token(user_id: str, role: str) -> str:
    return _make_token(user_id, role, "access", timedelta(minutes=settings.JWT_ACCESS_TOKEN_MINUTES))


def create_refresh_token(user_id: str, role: str) -> str:
    return _make_token(user_id, role, "refresh", timedelta(days=settings.JWT_REFRESH_TOKEN_DAYS))


def decode_token(token: str, expected_type: str = "access") -> Optional[dict]:
    try:
        data = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return None
    if data.get("type") != expected_type:
        return None
    return data
