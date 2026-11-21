"""Verify a Google Identity Services ID token (the `credential` returned by Google Sign-In).

We call Google's tokeninfo endpoint, which validates the signature and expiry for us, and then enforce the checks
that matter to this application: audience == our client id, trusted issuer, and a verified email address.
Only the PUBLIC client id is needed; no client secret is used or stored."""
import logging
from dataclasses import dataclass
from typing import Optional

import httpx

from app.config import settings

log = logging.getLogger("civiclens.google")
_ISSUERS = ("accounts.google.com", "https://accounts.google.com")


class GoogleAuthError(Exception):
    def __init__(self, message: str, status: int = 401):
        super().__init__(message)
        self.status = status


@dataclass
class GoogleIdentity:
    sub: str
    email: str
    name: Optional[str]
    picture: Optional[str]


def verify_google_id_token(credential: str) -> GoogleIdentity:
    if not settings.GOOGLE_CLIENT_ID:
        raise GoogleAuthError("Google sign-in is not configured on the server", 503)
    try:
        r = httpx.get(settings.GOOGLE_TOKENINFO_URL, params={"id_token": credential}, timeout=8.0)
    except httpx.HTTPError:
        raise GoogleAuthError("Could not reach Google to verify the sign-in. Please try again.", 503)
    if r.status_code != 200:
        raise GoogleAuthError("Google sign-in could not be verified")
    data = r.json()
    if data.get("aud") != settings.GOOGLE_CLIENT_ID:
        log.warning("google token rejected: audience mismatch")
        raise GoogleAuthError("This Google sign-in was issued for a different application")
    if data.get("iss") not in _ISSUERS:
        raise GoogleAuthError("Untrusted Google token issuer")
    if str(data.get("email_verified")).lower() != "true":
        raise GoogleAuthError("Your Google email address is not verified")
    email = (data.get("email") or "").strip().lower()
    if not email or not data.get("sub"):
        raise GoogleAuthError("Google did not return an email address")
    return GoogleIdentity(sub=data["sub"], email=email, name=data.get("name"), picture=data.get("picture"))
