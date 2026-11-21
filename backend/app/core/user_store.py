"""User storage abstraction.

* MongoUserStore  - used when MONGODB_URI is set (hosted deployment; MongoDB Atlas works).
* SqlUserStore    - used when MONGODB_URI is empty (local dev without mongod). Same interface.

Users are plain dicts with these keys:
  id, email, password_hash, display_name, role, department_code, corporation_code, phone,
  preferred_language, is_active, is_demo, created_at (datetime), last_login_at (datetime|None)
`public_user()` strips the password hash for API output.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional, Protocol

from app.config import settings
from app.models.base import new_id, utcnow

PUBLIC_FIELDS = (
    "id", "email", "display_name", "role", "department_code", "corporation_code", "phone",
    "preferred_language", "is_active", "is_demo", "created_at", "last_login_at",
)
UPDATABLE_FIELDS = (
    "display_name", "role", "department_code", "corporation_code", "phone", "preferred_language",
    "is_active", "password_hash", "last_login_at",
)


def public_user(u: Dict[str, Any]) -> Dict[str, Any]:
    return {k: u.get(k) for k in PUBLIC_FIELDS}


class UserStore(Protocol):
    backend: str

    def get_by_id(self, user_id: str) -> Optional[Dict[str, Any]]: ...
    def get_by_email(self, email: str) -> Optional[Dict[str, Any]]: ...
    def create(self, **fields) -> Dict[str, Any]: ...
    def update(self, user_id: str, **fields) -> Optional[Dict[str, Any]]: ...
    def list(self, role: Optional[str] = None, q: Optional[str] = None, limit: int = 200) -> List[Dict[str, Any]]: ...
    def get_many(self, ids: List[str]) -> Dict[str, Dict[str, Any]]: ...


def _new_user_doc(**f) -> Dict[str, Any]:
    return {
        "id": f.get("id") or new_id(),
        "email": f["email"].strip().lower(),
        "password_hash": f["password_hash"],
        "display_name": f["display_name"],
        "role": f.get("role", "citizen"),
        "department_code": f.get("department_code"),
        "corporation_code": f.get("corporation_code"),
        "phone": f.get("phone"),
        "preferred_language": f.get("preferred_language", "en"),
        "is_active": f.get("is_active", True),
        "is_demo": f.get("is_demo", False),
        "created_at": utcnow(),
        "last_login_at": None,
    }


class MongoUserStore:
    backend = "mongodb"

    def __init__(self, client=None):
        if client is None:
            from pymongo import MongoClient

            client = MongoClient(settings.MONGODB_URI, serverSelectionTimeoutMS=8000, tz_aware=False)
        self.col = client[settings.MONGODB_DB_NAME]["users"]
        self.col.create_index("email", unique=True)
        self.col.create_index("role")

    @staticmethod
    def _out(doc: Optional[dict]) -> Optional[Dict[str, Any]]:
        if not doc:
            return None
        d = dict(doc)
        d["id"] = d.pop("_id")
        return d

    def get_by_id(self, user_id):
        return self._out(self.col.find_one({"_id": user_id}))

    def get_by_email(self, email):
        return self._out(self.col.find_one({"email": email.strip().lower()}))

    def create(self, **fields):
        doc = _new_user_doc(**fields)
        mongo_doc = dict(doc)
        mongo_doc["_id"] = mongo_doc.pop("id")
        self.col.insert_one(mongo_doc)  # raises DuplicateKeyError on duplicate email
        return doc

    def update(self, user_id, **fields):
        upd = {k: v for k, v in fields.items() if k in UPDATABLE_FIELDS}
        if upd:
            self.col.update_one({"_id": user_id}, {"$set": upd})
        return self.get_by_id(user_id)

    def list(self, role=None, q=None, limit=200):
        flt: Dict[str, Any] = {}
        if role:
            flt["role"] = role
        if q:
            import re

            rx = {"$regex": re.escape(q), "$options": "i"}
            flt["$or"] = [{"email": rx}, {"display_name": rx}]
        return [self._out(d) for d in self.col.find(flt).sort("created_at", -1).limit(limit)]

    def get_many(self, ids):
        ids = list({i for i in ids if i})
        if not ids:
            return {}
        return {d["_id"]: self._out(d) for d in self.col.find({"_id": {"$in": ids}})}


class SqlUserStore:
    backend = "sql"

    @staticmethod
    def _session():
        from app.database import SessionLocal

        return SessionLocal()

    @staticmethod
    def _out(row) -> Optional[Dict[str, Any]]:
        if row is None:
            return None
        return {c: getattr(row, c) for c in (*PUBLIC_FIELDS, "password_hash")}

    def get_by_id(self, user_id):
        from app.models import User

        with self._session() as s:
            return self._out(s.get(User, user_id))

    def get_by_email(self, email):
        from sqlalchemy import select

        from app.models import User

        with self._session() as s:
            return self._out(s.scalars(select(User).where(User.email == email.strip().lower())).first())

    def create(self, **fields):
        from app.models import User

        doc = _new_user_doc(**fields)
        with self._session() as s:
            s.add(User(**doc))
            s.commit()  # raises IntegrityError on duplicate email
        return doc

    def update(self, user_id, **fields):
        from app.models import User

        with self._session() as s:
            row = s.get(User, user_id)
            if not row:
                return None
            for k, v in fields.items():
                if k in UPDATABLE_FIELDS:
                    setattr(row, k, v)
            s.commit()
            return self._out(row)

    def list(self, role=None, q=None, limit=200):
        from sqlalchemy import or_, select

        from app.models import User

        stmt = select(User).order_by(User.created_at.desc()).limit(limit)
        if role:
            stmt = stmt.where(User.role == role)
        if q:
            like = f"%{q}%"
            stmt = stmt.where(or_(User.email.ilike(like), User.display_name.ilike(like)))
        with self._session() as s:
            return [self._out(r) for r in s.scalars(stmt)]

    def get_many(self, ids):
        from sqlalchemy import select

        from app.models import User

        ids = list({i for i in ids if i})
        if not ids:
            return {}
        with self._session() as s:
            return {r.id: self._out(r) for r in s.scalars(select(User).where(User.id.in_(ids)))}


class DuplicateEmailError(Exception):
    pass


_store: Optional[UserStore] = None


def get_user_store() -> UserStore:
    global _store
    if _store is None:
        _store = MongoUserStore() if settings.MONGODB_URI else SqlUserStore()
    return _store


def set_user_store(store: Optional[UserStore]) -> None:
    """Tests inject a MongoUserStore(mongomock.MongoClient()) or reset to None."""
    global _store
    _store = store


def create_user_checked(**fields) -> Dict[str, Any]:
    """Create a user, mapping both stores' duplicate-key errors to DuplicateEmailError."""
    store = get_user_store()
    if store.get_by_email(fields["email"]):
        raise DuplicateEmailError(fields["email"])
    try:
        return store.create(**fields)
    except Exception as exc:  # DuplicateKeyError / IntegrityError race
        name = type(exc).__name__
        if name in ("DuplicateKeyError", "IntegrityError"):
            raise DuplicateEmailError(fields["email"]) from exc
        raise
