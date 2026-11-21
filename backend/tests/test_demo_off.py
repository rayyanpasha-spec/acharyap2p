"""Demo data OFF by default, bootstrap admin, and the demo-data purge (isolated user store, network never used)."""
import mongomock
import pytest
from sqlalchemy import select

from app import seed
from app.config import Settings, settings
from app.core.security import create_access_token, hash_password
from app.core.user_store import MongoUserStore, get_user_store, set_user_store
from app.models import Complaint, ComplaintSubmission


@pytest.fixture()
def store(client):
    """A fresh, empty user store for the duration of one test."""
    s = MongoUserStore(client=mongomock.MongoClient())
    set_user_store(s)
    yield s
    set_user_store(None)


def _admin(store, demo=False, email=None):
    u = store.create(email=email or ("demo-admin@x.test" if demo else "real-admin@x.test"), password_hash=hash_password("Passw0rd!x"),
                     display_name="Admin", role="admin", is_demo=demo)
    return u, {"Authorization": f"Bearer {create_access_token(u['id'], 'admin')}"}


def test_demo_data_is_off_by_default_in_code():
    assert Settings.model_fields["SEED_DEMO_DATA"].default is False


def test_demo_accounts_endpoint_hidden_when_off(client):
    assert client.get("/api/v1/meta/demo-accounts").json()["enabled"] is False


def test_bootstrap_admin_created_once(store, monkeypatch):
    monkeypatch.setattr(settings, "BOOTSTRAP_ADMIN_EMAIL", "Owner@Example.com")
    monkeypatch.setattr(settings, "BOOTSTRAP_ADMIN_PASSWORD", "a-long-password-1")
    seed.ensure_bootstrap_admin()
    u = store.get_by_email("owner@example.com")
    assert u and u["role"] == "admin" and u["is_demo"] is False
    seed.ensure_bootstrap_admin()                       # idempotent
    assert len(store.list(role="admin")) == 1


def test_bootstrap_admin_skipped_when_real_admin_exists_or_password_weak(store, monkeypatch):
    monkeypatch.setattr(settings, "BOOTSTRAP_ADMIN_EMAIL", "second@example.com")
    monkeypatch.setattr(settings, "BOOTSTRAP_ADMIN_PASSWORD", "short")
    seed.ensure_bootstrap_admin()
    assert store.get_by_email("second@example.com") is None          # weak password rejected
    _admin(store)
    monkeypatch.setattr(settings, "BOOTSTRAP_ADMIN_PASSWORD", "a-long-password-1")
    seed.ensure_bootstrap_admin()
    assert store.get_by_email("second@example.com") is None          # a real admin already exists


def test_bootstrap_admin_still_created_when_only_a_demo_admin_exists(store, monkeypatch):
    _admin(store, demo=True)
    monkeypatch.setattr(settings, "BOOTSTRAP_ADMIN_EMAIL", "owner2@example.com")
    monkeypatch.setattr(settings, "BOOTSTRAP_ADMIN_PASSWORD", "a-long-password-1")
    seed.ensure_bootstrap_admin()
    assert store.get_by_email("owner2@example.com")["role"] == "admin"


def _complaint(db, owner_id, demo, text):
    c = Complaint(created_by_user_id=owner_id, original_description=text, latitude=12.97, longitude=77.59, is_demo=demo)
    db.add(c)
    db.flush()
    db.add(ComplaintSubmission(complaint_id=c.id, user_id=owner_id, description=text))
    db.commit()
    return c.id


def test_purge_removes_only_demo_data_and_blocks_demo_logins(client, db, store):
    real_admin, h = _admin(store)
    demo_user = store.create(email="citizen@civiclens.demo", password_hash=hash_password("Demo@12345"), display_name="Demo",
                             role="citizen", is_demo=True)
    real_user = store.create(email="real-user@example.com", password_hash=hash_password("Passw0rd!x"), display_name="Real", role="citizen")
    demo_c = _complaint(db, demo_user["id"], True, "DEMO purge-test complaint")
    real_c = _complaint(db, real_user["id"], False, "REAL purge-test complaint")

    assert client.post("/api/v1/auth/login", json={"email": "citizen@civiclens.demo", "password": "Demo@12345"}).status_code == 200

    # safety rails
    assert client.post("/api/v1/admin/demo-data/purge", headers=h, json={"confirm": "yes"}).status_code == 422
    assert client.post("/api/v1/admin/demo-data/purge", headers=_admin(store, demo=True, email="d2@x.test")[1],
                       json={"confirm": "DELETE DEMO DATA"}).status_code == 409
    assert client.post("/api/v1/admin/demo-data/purge", json={"confirm": "DELETE DEMO DATA"}).status_code == 401

    r = client.post("/api/v1/admin/demo-data/purge", headers=h, json={"confirm": "DELETE DEMO DATA", "include_cleanroute": False})
    assert r.status_code == 200, r.text
    removed = r.json()["removed"]
    assert removed["complaints"] >= 1 and removed["demo_users_deactivated"] >= 1

    db.expire_all()
    assert db.get(Complaint, demo_c) is None
    assert db.get(Complaint, real_c) is not None                                    # real data untouched
    assert not db.scalars(select(ComplaintSubmission).where(ComplaintSubmission.complaint_id == demo_c)).first()
    assert client.post("/api/v1/auth/login", json={"email": "citizen@civiclens.demo", "password": "Demo@12345"}).status_code == 401
    assert client.post("/api/v1/auth/login", json={"email": "real-user@example.com", "password": "Passw0rd!x"}).status_code == 200
    assert get_user_store().get_by_id(real_admin["id"])["is_active"] is True      # your own admin survives


def test_purge_requires_admin(client, store):
    officer = store.create(email="off@x.test", password_hash=hash_password("Passw0rd!x"), display_name="O", role="officer")
    h = {"Authorization": f"Bearer {create_access_token(officer['id'], 'officer')}"}
    assert client.post("/api/v1/admin/demo-data/purge", headers=h, json={"confirm": "DELETE DEMO DATA"}).status_code == 403


# ------------------------------------------------------------------ demo logins that work on a deployment too
def test_demo_accounts_flag_is_on_by_default_in_code():
    assert Settings.model_fields["SEED_DEMO_ACCOUNTS"].default is True


def test_demo_accounts_created_without_demo_complaints_and_listed(client, db, store, monkeypatch):
    from app.core.demo_accounts import DEMO_ACCOUNTS
    monkeypatch.setattr(settings, "SEED_DEMO_ACCOUNTS", True)
    before = db.query(Complaint).count()
    seed.ensure_demo_accounts()
    seed.ensure_demo_accounts()                                              # idempotent
    for email, _n, role, _d, _l in DEMO_ACCOUNTS:
        u = store.get_by_email(email)
        assert u and u["role"] == role and u["is_demo"] is True
    assert store.get_by_email("neighbour1@civiclens.demo") is None            # only the listed accounts, not the extra residents
    db.expire_all()
    assert db.query(Complaint).count() == before                              # logins only: no demo complaints
    body = client.get("/api/v1/meta/demo-accounts").json()
    assert body["enabled"] is True and body["password"] == settings.DEMO_PASSWORD
    assert {a["role"] for a in body["accounts"]} == {"citizen", "officer", "worker", "supervisor", "admin"}
    r = client.post("/api/v1/auth/login", json={"email": "admin@civiclens.demo", "password": settings.DEMO_PASSWORD})
    assert r.status_code == 200 and r.json()["user"]["role"] == "admin"


def test_bootstrap_promotes_an_existing_google_account_and_sets_its_password(store, monkeypatch):
    from app.core.security import NO_PASSWORD_HASH, verify_password
    store.create(email="owner3@example.com", password_hash=NO_PASSWORD_HASH, display_name="Owner", role="citizen")
    monkeypatch.setattr(settings, "BOOTSTRAP_ADMIN_EMAIL", "Owner3@Example.com")
    monkeypatch.setattr(settings, "BOOTSTRAP_ADMIN_PASSWORD", "a-long-password-1")
    seed.ensure_bootstrap_admin()
    u = store.get_by_email("owner3@example.com")
    assert u["role"] == "admin" and verify_password("a-long-password-1", u["password_hash"])
    seed.ensure_bootstrap_admin()                                              # idempotent
    assert len(store.list(role="admin")) == 1


def test_bootstrap_never_overwrites_an_existing_password(store, monkeypatch):
    from app.core.security import verify_password
    store.create(email="owner4@example.com", password_hash=hash_password("My-own-password-9"), display_name="Owner", role="citizen")
    monkeypatch.setattr(settings, "BOOTSTRAP_ADMIN_EMAIL", "owner4@example.com")
    monkeypatch.setattr(settings, "BOOTSTRAP_ADMIN_PASSWORD", "a-long-password-1")
    seed.ensure_bootstrap_admin()
    u = store.get_by_email("owner4@example.com")
    assert u["role"] == "admin" and verify_password("My-own-password-9", u["password_hash"])
    assert not verify_password("a-long-password-1", u["password_hash"])
