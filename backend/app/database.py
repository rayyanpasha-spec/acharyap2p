"""SQLAlchemy engine/session. Works identically on SQLite (local) and PostgreSQL (Render)."""
from typing import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    pass


_connect_args = {"check_same_thread": False} if settings.is_sqlite else {}
engine = create_engine(
    settings.DATABASE_URL,
    connect_args=_connect_args,
    pool_pre_ping=not settings.is_sqlite,
    future=True,
)

if settings.is_sqlite:

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _):  # pragma: no cover - trivial
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA journal_mode=WAL")
        cur.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_db() -> Iterator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create tables if missing. (Production path is `alembic upgrade head`; this is the local-dev convenience.)"""
    from app import models  # noqa: F401  (registers all tables)

    Base.metadata.create_all(bind=engine)
