"""Startup seeding orchestrator. Each seeder module is optional (owned by a different agent) and idempotent."""
import importlib
import logging

from app.config import settings
from app.database import SessionLocal

log = logging.getLogger("civiclens.seed")

# (module, function, only_when_demo)
SEEDERS = [
    ("app.seed_reference", "seed", False),
    ("app.seed_recognition", "seed", False),   # games + achievements catalogue
    ("app.seed_garbage", "seed", True),        # fictional vehicles, routes, bins (SIMULATED)
    ("app.seed_demo", "seed", True),           # demo users + complaints
]


def ensure_bootstrap_admin() -> None:
    """Create the first REAL admin from BOOTSTRAP_ADMIN_EMAIL/PASSWORD when no active non-demo admin exists.
    Idempotent. Without this, a site with demo data switched off would have no way to create the first staff account."""
    email = (settings.BOOTSTRAP_ADMIN_EMAIL or "").strip().lower()
    password = settings.BOOTSTRAP_ADMIN_PASSWORD or ""
    if not email or not password:
        return
    if len(password) < 10:
        log.warning("BOOTSTRAP_ADMIN_PASSWORD is shorter than 10 characters; bootstrap admin NOT created")
        return
    from app.core.security import hash_password
    from app.core.user_store import create_user_checked, get_user_store

    store = get_user_store()
    if any(u.get("is_active", True) and not u.get("is_demo") for u in store.list(role="admin", limit=1000)):
        return
    if store.get_by_email(email):
        log.warning("BOOTSTRAP_ADMIN_EMAIL belongs to an existing non-admin account; bootstrap admin NOT created")
        return
    create_user_checked(email=email, password_hash=hash_password(password),
                        display_name=settings.BOOTSTRAP_ADMIN_NAME or "Administrator", role="admin")
    log.info("bootstrap admin created: %s", email)


def run_all() -> None:
    for module, func, demo_only in SEEDERS:
        if demo_only and not settings.SEED_DEMO_DATA:
            continue
        if not demo_only and not settings.SEED_REFERENCE_DATA:
            continue
        try:
            mod = importlib.import_module(module)
        except ModuleNotFoundError as exc:
            if exc.name == module:
                log.info("seeder %s not present, skipping", module)
                continue
            raise
        with SessionLocal() as db:
            getattr(mod, func)(db)
        log.info("seeded: %s", module)
    ensure_bootstrap_admin()
