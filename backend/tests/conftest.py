"""Shared pytest fixtures. IMPORTANT: env vars are set BEFORE importing the app so every test run uses an
isolated temporary SQLite database, SQL user store, no network AI, no geocoder and no demo seeding."""
import os
import shutil
import tempfile
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="civiclens_tests_"))
os.environ.update({
    "APP_ENV": "test",
    "DATABASE_URL": f"sqlite:///{(_TMP / 'test.db').as_posix()}",
    "MONGODB_URI": "",
    "OPENAI_API_KEY": "",
    "AI_PROVIDER_ORDER": "rules",
    "OLLAMA_VISION_MODEL": "",
    "GEOCODER_PROVIDER": "none",
    "SEED_DEMO_DATA": "false",
    "SEED_REFERENCE_DATA": "true",
    "GARBAGE_SIMULATION_AUTOSTART": "false",
    "ROUTE_SNAPPING": "false",
    "UPLOAD_DIR": str(_TMP / "uploads"),
    "CERTIFICATE_STORAGE_DIR": str(_TMP / "certs"),
    "BOUNDARY_DATA_DIR": str(_TMP / "no_boundaries"),
})

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.security import create_access_token, hash_password  # noqa: E402
from app.core.user_store import get_user_store  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:   # runs lifespan: creates tables + seeds reference data
        yield c
    shutil.rmtree(_TMP, ignore_errors=True)


@pytest.fixture()
def db():
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


_counter = {"n": 0}


@pytest.fixture()
def make_user(client):
    """make_user(role='citizen', department_code=None) -> (user_dict, auth_headers)"""

    def _make(role="citizen", department_code=None, email=None, name=None, corporation_code=None):
        _counter["n"] += 1
        u = get_user_store().create(
            email=email or f"{role}{_counter['n']}@test.example", password_hash=hash_password("Passw0rd!x"),
            display_name=name or f"Test {role} {_counter['n']}", role=role, department_code=department_code,
            corporation_code=corporation_code,
        )
        return u, {"Authorization": f"Bearer {create_access_token(u['id'], role)}"}

    return _make
