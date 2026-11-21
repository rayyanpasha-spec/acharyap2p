"""Google-created accounts have no password; they can add one (confirmed via Google); normal accounts need the current one."""
import pytest

from app.api.v1 import auth as auth_module
from app.core.google_auth import GoogleAuthError, GoogleIdentity
from app.core.security import NO_PASSWORD_HASH
from app.core.user_store import get_user_store

BAD = "Could not confirm it is you"


def _google_signup(client, monkeypatch, email):
    monkeypatch.setattr(auth_module, "verify_google_id_token", lambda c: GoogleIdentity(sub="s-" + email, email=email, name="G User", picture=None))
    r = client.post("/api/v1/auth/google", json={"credential": "x" * 40})
    assert r.status_code == 200
    return {"Authorization": "Bearer " + r.json()["access_token"]}


def test_google_account_has_explicit_no_password_marker_and_helpful_login_error(client, monkeypatch):
    _google_signup(client, monkeypatch, "pwtest1@example.com")
    assert get_user_store().get_by_email("pwtest1@example.com")["password_hash"] == NO_PASSWORD_HASH
    r = client.post("/api/v1/auth/login", json={"email": "pwtest1@example.com", "password": "anything-at-all"})
    assert r.status_code == 401 and "Google" in r.json()["detail"]
    # same message for a wrong password on a normal account and for an unknown email (no account enumeration)
    unknown = client.post("/api/v1/auth/login", json={"email": "nobody-here@example.com", "password": "x"})
    assert unknown.json()["detail"] == r.json()["detail"]


def test_google_user_can_set_password_with_google_confirmation(client, monkeypatch):
    h = _google_signup(client, monkeypatch, "pwtest2@example.com")
    # no proof -> refused
    assert client.post("/api/v1/users/me/password", headers=h, json={"new_password": "brand-new-pass1"}).status_code == 403
    # someone else's Google identity -> refused
    monkeypatch.setattr(auth_module, "verify_google_id_token", lambda c: GoogleIdentity(sub="other", email="attacker@example.com", name=None, picture=None))
    r = client.post("/api/v1/users/me/password", headers=h, json={"new_password": "brand-new-pass1", "google_credential": "y" * 40})
    assert r.status_code == 403 and BAD in r.json()["detail"]
    # the account's own Google identity -> allowed
    monkeypatch.setattr(auth_module, "verify_google_id_token", lambda c: GoogleIdentity(sub="s", email="pwtest2@example.com", name=None, picture=None))
    ok = client.post("/api/v1/users/me/password", headers=h, json={"new_password": "brand-new-pass1", "google_credential": "y" * 40})
    assert ok.status_code == 200
    assert client.post("/api/v1/auth/login", json={"email": "pwtest2@example.com", "password": "brand-new-pass1"}).status_code == 200


def test_google_credential_failure_is_reported(client, monkeypatch):
    h = _google_signup(client, monkeypatch, "pwtest3@example.com")

    def boom(c):
        raise GoogleAuthError("bad token")
    monkeypatch.setattr(auth_module, "verify_google_id_token", boom)
    assert client.post("/api/v1/users/me/password", headers=h, json={"new_password": "brand-new-pass1", "google_credential": "z" * 40}).status_code == 401


def test_normal_account_needs_current_password(client, make_user):
    u, h = make_user("citizen", email="pwtest4@example.com")           # conftest password is Passw0rd!x
    assert client.post("/api/v1/users/me/password", headers=h, json={"new_password": "another-pass-22"}).status_code == 403
    assert client.post("/api/v1/users/me/password", headers=h, json={"new_password": "another-pass-22", "current_password": "wrong-one"}).status_code == 403
    assert client.post("/api/v1/users/me/password", headers=h, json={"new_password": "short", "current_password": "Passw0rd!x"}).status_code == 422
    ok = client.post("/api/v1/users/me/password", headers=h, json={"new_password": "another-pass-22", "current_password": "Passw0rd!x"})
    assert ok.status_code == 200
    assert client.post("/api/v1/auth/login", json={"email": "pwtest4@example.com", "password": "another-pass-22"}).status_code == 200
    assert client.post("/api/v1/auth/login", json={"email": "pwtest4@example.com", "password": "Passw0rd!x"}).status_code == 401


def test_set_password_requires_login(client):
    assert client.post("/api/v1/users/me/password", json={"new_password": "brand-new-pass1"}).status_code == 401
