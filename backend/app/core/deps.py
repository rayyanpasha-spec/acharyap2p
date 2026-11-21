"""FastAPI dependencies: current user + role based access control."""
from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.constants import OFFICE_ROLES, ROLE_ADMIN, ROLE_SUPERVISOR, STAFF_ROLES
from app.core.security import decode_token
from app.core.user_store import get_user_store

_bearer = HTTPBearer(auto_error=False)


@dataclass
class CurrentUser:
    id: str
    email: str
    display_name: str
    role: str
    department_code: Optional[str]
    corporation_code: Optional[str]
    preferred_language: str

    @property
    def is_staff(self) -> bool:
        return self.role in STAFF_ROLES

    @property
    def is_office(self) -> bool:  # officer / supervisor / admin
        return self.role in OFFICE_ROLES

    @property
    def sees_all_departments(self) -> bool:
        return self.role in (ROLE_ADMIN, ROLE_SUPERVISOR)


def _load_user(token: str) -> Optional[CurrentUser]:
    data = decode_token(token, "access")
    if not data:
        return None
    u = get_user_store().get_by_id(data["sub"])
    if not u or not u.get("is_active", True):
        return None
    return CurrentUser(
        id=u["id"], email=u["email"], display_name=u["display_name"], role=u["role"],
        department_code=u.get("department_code"), corporation_code=u.get("corporation_code"),
        preferred_language=u.get("preferred_language") or "en",
    )


def get_current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer)) -> CurrentUser:
    if not creds:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated", headers={"WWW-Authenticate": "Bearer"})
    user = _load_user(creds.credentials)
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token", headers={"WWW-Authenticate": "Bearer"})
    return user


def get_optional_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer)) -> Optional[CurrentUser]:
    return _load_user(creds.credentials) if creds else None


def require_roles(*roles: str):
    """Dependency factory: `Depends(require_roles('officer','supervisor','admin'))`."""

    def checker(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have permission for this action")
        return user

    return checker


require_staff = require_roles(*STAFF_ROLES)
require_office = require_roles(*OFFICE_ROLES)
require_admin = require_roles(ROLE_ADMIN)
require_supervisor = require_roles(ROLE_SUPERVISOR, ROLE_ADMIN)
