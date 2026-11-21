"""Google sign-in: token verification rules and the sign-in/sign-up endpoint (network is always mocked)."""
import pytest

from app.api.v1 import auth as auth_module
from app.config import settings
from app.core import google_auth
from app.core.google_auth import GoogleAuthError, GoogleIdentity

CID = "test-client-id.apps.googleusercontent.com"


@pytest.fixture(autouse=True)
def _client_id(monkeypatch, client):
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", CID)


class _Resp:
    def __init__(self, status=200, data=None):
        self.status_code, self._d = status, data or {}

    def json(self):
        return self._d


def _good(**over):
    d = {"aud": CID, "iss": "https://accounts.google.com", "email_verified": "true", "email": "Jane@Example.com",
         "sub": "1234567890", "name": "Jane Doe", "picture": "https://x/y.png"}
    d.update(over)
    return d


def test_verify_accepts_valid_token(monkeypatch):
    monkeypatch.setattr(google_auth.httpx, "get", lambda *a, **k: _Resp(200, _good()))
    ident = google_auth.verify_google_id_token("x" * 40)
    assert ident.email == "jane@example.com" and ident.sub == "1234567890"


@pytest.mark.parametrize("over,why", [
    ({"aud": "someone-elses-client"}, "audience"),
    ({"iss": "https://evil.example"}, "issuer"),
    ({"email_verified": "false"}, "unverified email"),
    ({"email": ""}, "no email"),
])
def test_verify_rejects_bad_tokens(monkeypatch, over, why):
    monkeypatch.setattr(google_auth.httpx, "get", lambda *a, **k: _Resp(200, _good(**over)))
    with pytest.raises(GoogleAuthError):
        google_auth.verify_google_id_token("x" * 40)


def test_verify_rejects_google_error_status(monkeypatch):
    monkeypatch.setattr(google_auth.httpx, "get", lambda *a, **k: _Resp(400, {"error": "invalid_token"}))
    with pytest.raises(GoogleAuthError):
        google_auth.verify_google_id_token("x" * 40)


def test_verify_requires_configuration(monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "")
    with pytest.raises(GoogleAuthError) as e:
        google_auth.verify_google_id_token("x" * 40)
    assert e.value.status == 503


def test_config_endpoint(client):
    j = client.get("/api/v1/auth/config").json()
    assert j == {"google_enabled": True, "google_client_id": CID}


def test_signup_creates_citizen_then_signin_reuses(client, monkeypatch):
    monkeypatch.setattr(auth_module, "verify_google_id_token",
                        lambda c: GoogleIdentity(sub="s1", email="newgoogle@example.com", name="New Google", picture=None))
    r = client.post("/api/v1/auth/google", json={"credential": "x" * 40, "preferred_language": "kn"})
    assert r.status_code == 200
    j = r.json()
    assert j["is_new"] is True and j["user"]["role"] == "citizen" and j["user"]["preferred_language"] == "kn"
    assert client.get("/api/v1/users/me", headers={"Authorization": "Bearer " + j["access_token"]}).status_code == 200
    j2 = client.post("/api/v1/auth/google", json={"credential": "x" * 40}).json()
    assert j2["is_new"] is False and j2["user"]["id"] == j["user"]["id"]


def test_google_account_cannot_password_login(client, monkeypatch):
    monkeypatch.setattr(auth_module, "verify_google_id_token",
                        lambda c: GoogleIdentity(sub="s2", email="nopw@example.com", name=None, picture=None))
    client.post("/api/v1/auth/google", json={"credential": "x" * 40})
    for pw in ("", "password", "Passw0rd!x"):
        assert client.post("/api/v1/auth/login", json={"email": "nopw@example.com", "password": pw or "x"}).status_code == 401


def test_existing_staff_email_signs_in_with_own_role_never_escalates(client, make_user, monkeypatch):
    staff, _ = make_user("officer", "road_maintenance", email="gofficer@example.com")
    monkeypatch.setattr(auth_module, "verify_google_id_token",
                        lambda c: GoogleIdentity(sub="s3", email="gofficer@example.com", name="X", picture=None))
    j = client.post("/api/v1/auth/google", json={"credential": "x" * 40}).json()
    assert j["user"]["id"] == staff["id"] and j["user"]["role"] == "officer" and j["is_new"] is False


def test_invalid_token_is_401(client, monkeypatch):
    def boom(c):
        raise GoogleAuthError("bad")
    monkeypatch.setattr(auth_module, "verify_google_id_token", boom)
    assert client.post("/api/v1/auth/google", json={"credential": "x" * 40}).status_code == 401
