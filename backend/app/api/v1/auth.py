import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

from app.config import settings
from app.core.constants import LANGUAGES, ROLE_CITIZEN
from app.core.deps import CurrentUser, get_current_user
from app.core.google_auth import GoogleAuthError, verify_google_id_token
from app.core.rate_limit import rate_limit
from app.core.security import (NO_PASSWORD_HASH, create_access_token, create_refresh_token, decode_token, has_password,
                               hash_password, verify_password)
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


class PasswordIn(BaseModel):
    new_password: str = Field(min_length=8, max_length=128)
    current_password: str | None = Field(default=None, max_length=128)
    google_credential: str | None = Field(default=None, min_length=20, max_length=8192)


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


class GoogleIn(BaseModel):
    credential: str = Field(min_length=20, max_length=8192)
    preferred_language: str | None = None


@router.get("/config")
def auth_config():
    """Public client configuration for the sign-in screen (the Google client id is public by design)."""
    return {"google_enabled": bool(settings.GOOGLE_CLIENT_ID), "google_client_id": settings.GOOGLE_CLIENT_ID or None}


@router.post("/google", dependencies=[Depends(rate_limit("google", 30, 300))])
def google_sign_in(body: GoogleIn):
    """Google sign-in AND sign-up in one call. An existing account with the same verified email is signed in (any role);
    otherwise a new CITIZEN account is created. Staff roles can never be created through this endpoint."""
    try:
        ident = verify_google_id_token(body.credential)
    except GoogleAuthError as exc:
        raise HTTPException(exc.status, str(exc))
    store = get_user_store()
    u = store.get_by_email(ident.email)
    is_new = False
    if u is None:
        lang = body.preferred_language if body.preferred_language in LANGUAGES else "en"
        name = (ident.name or ident.email.split("@")[0]).strip()[:120] or "Citizen"
        try:
            # random, unusable password: this account signs in with Google (password login stays impossible)
            u = create_user_checked(email=ident.email, password_hash=NO_PASSWORD_HASH,
                                    display_name=name, role=ROLE_CITIZEN, preferred_language=lang)
            is_new = True
        except DuplicateEmailError:  # lost a race with a parallel request
            u = store.get_by_email(ident.email)
    if not u or not u.get("is_active", True):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "This account is not available")
    u = store.update(u["id"], last_login_at=utcnow()) or u
    out = _token_response(u)
    out["is_new"] = is_new
    return out


@router.post("/login", dependencies=[Depends(rate_limit("login", 20, 300))])
def login(body: LoginIn):
    store = get_user_store()
    u = store.get_by_email(body.email)
    # same error for unknown email / wrong password / disabled (no account enumeration)
    if not u or not verify_password(body.password, u["password_hash"]) or not u.get("is_active", True):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED,
                            "Incorrect email or password. If you signed up with Google, use the \"Sign in with Google\" button "
                            "(you can add a password later in your profile).")
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


@users_router.post("/me/password", dependencies=[Depends(rate_limit("setpw", 10, 300))])
def set_password(body: PasswordIn, user: CurrentUser = Depends(get_current_user)):
    """Set or change YOUR password. Proof of identity is either the current password, or a fresh Google sign-in for the
    same email (the only option for accounts created with Google, which have no password yet)."""
    store = get_user_store()
    u = store.get_by_id(user.id)
    if not u:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account not available")
    proven = False
    if body.current_password and has_password(u.get("password_hash", "")):
        proven = verify_password(body.current_password, u["password_hash"])
    elif body.google_credential:
        try:
            proven = verify_google_id_token(body.google_credential).email == u["email"].strip().lower()
        except GoogleAuthError as exc:
            raise HTTPException(exc.status, str(exc))
    if not proven:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Could not confirm it is you. Enter your current password, or confirm with Google.")
    store.update(user.id, password_hash=hash_password(body.new_password))
    return {"ok": True}


@users_router.patch("/me")
def update_me(body: ProfilePatch, user: CurrentUser = Depends(get_current_user)):
    fields = body.model_dump(exclude_none=True)
    if "preferred_language" in fields and fields["preferred_language"] not in LANGUAGES:
        raise HTTPException(422, "Unsupported language")
    return public_user(get_user_store().update(user.id, **fields))
