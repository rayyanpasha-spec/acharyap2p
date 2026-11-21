from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

from app.config import settings
from app.core.constants import LANGUAGES, ROLE_CITIZEN
from app.core.deps import CurrentUser, get_current_user
from app.core.rate_limit import rate_limit
from app.core.security import (create_access_token, create_refresh_token, decode_token, hash_password,
                               verify_password)
from app.core.user_store import DuplicateEmailError, create_user_checked, get_user_store, public_user
from app.models.base import utcnow

router = APIRouter(prefix="/auth", tags=["auth"])
users_router = APIRouter(prefix="/users", tags=["users"])


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=2, max_length=120)
    phone: str | None = Field(default=None, max_length=30)
    preferred_language: str = "en"


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class RefreshIn(BaseModel):
    refresh_token: str


class ProfilePatch(BaseModel):
    display_name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = Field(default=None, max_length=30)
    preferred_language: str | None = None


def _token_response(u: dict) -> dict:
    return {
        "access_token": create_access_token(u["id"], u["role"]),
        "refresh_token": create_refresh_token(u["id"], u["role"]),
        "token_type": "bearer",
        "expires_in": settings.JWT_ACCESS_TOKEN_MINUTES * 60,
        "user": public_user(u),
    }


@router.post("/register", status_code=201, dependencies=[Depends(rate_limit("register", 10, 3600))])
def register(body: RegisterIn):
    """Public self-registration ALWAYS creates a `citizen`. Staff accounts are created by an admin (POST /admin/users)."""
    lang = body.preferred_language if body.preferred_language in LANGUAGES else "en"
    try:
        u = create_user_checked(email=body.email, password_hash=hash_password(body.password),
                                display_name=body.display_name.strip(), role=ROLE_CITIZEN,
                                phone=body.phone, preferred_language=lang)
    except DuplicateEmailError:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    return _token_response(u)


@router.post("/login", dependencies=[Depends(rate_limit("login", 20, 300))])
def login(body: LoginIn):
    store = get_user_store()
    u = store.get_by_email(body.email)
    # same error for unknown email / wrong password / disabled (no account enumeration)
    if not u or not verify_password(body.password, u["password_hash"]) or not u.get("is_active", True):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    u = store.update(u["id"], last_login_at=utcnow()) or u
    return _token_response(u)


@router.post("/refresh", dependencies=[Depends(rate_limit("refresh", 60, 300))])
def refresh(body: RefreshIn):
    data = decode_token(body.refresh_token, "refresh")
    if not data:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired refresh token")
    u = get_user_store().get_by_id(data["sub"])
    if not u or not u.get("is_active", True):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account not available")
    return _token_response(u)


@users_router.get("/me")
def me(user: CurrentUser = Depends(get_current_user)):
    return public_user(get_user_store().get_by_id(user.id))


@users_router.patch("/me")
def update_me(body: ProfilePatch, user: CurrentUser = Depends(get_current_user)):
    fields = body.model_dump(exclude_none=True)
    if "preferred_language" in fields and fields["preferred_language"] not in LANGUAGES:
        raise HTTPException(422, "Unsupported language")
    return public_user(get_user_store().update(user.id, **fields))
