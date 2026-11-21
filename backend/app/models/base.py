import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime
from sqlalchemy.orm import mapped_column


def utcnow() -> datetime:
    """Naive-UTC timestamps are stored everywhere (works the same on SQLite and PostgreSQL)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def new_id() -> str:
    return uuid.uuid4().hex


def ts_col(**kw):
    return mapped_column(DateTime, default=utcnow, **kw)


# JSON column type that works on SQLite and PostgreSQL
JSONType = JSON
