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
    from app.core.security import has_password, hash_password
    from app.core.user_store import create_user_checked, get_user_store

    store = get_user_store()
    existing = store.get_by_email(email)
    if existing:
        # The owner configured this address as the admin: make sure the account is an active admin. A password is only set
        # when the account has none (e.g. it was created through Google sign-in); an existing password is never overwritten.
        changes = {}
        if existing.get("role") != "admin":
            changes["role"] = "admin"
        if not existing.get("is_active", True):
            changes["is_active"] = True
        if not has_password(existing.get("password_hash") or ""):
            changes["password_hash"] = hash_password(password)
        if changes:
            store.update(existing["id"], **changes)
            log.info("bootstrap admin account updated: %s (%s)", email, ", ".join(sorted(k for k in changes if k != "password_hash")) or "password set")
        return
    if any(u.get("is_active", True) and not u.get("is_demo") for u in store.list(role="admin", limit=1000)):
        return
    create_user_checked(email=email, password_hash=hash_password(password),
                        display_name=settings.BOOTSTRAP_ADMIN_NAME or "Administrator", role="admin")
    log.info("bootstrap admin created: %s", email)


def ensure_demo_accounts() -> None:
    """Demo logins for every role, WITHOUT demo complaints (see SEED_DEMO_ACCOUNTS). Idempotent; never touches passwords."""
    from app import seed_demo

    seed_demo.seed_accounts()


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
    if settings.SEED_DEMO_ACCOUNTS and not settings.SEED_DEMO_DATA:    # (the full demo seeder creates them too)
        try:
            ensure_demo_accounts()
        except Exception:
            log.exception("demo accounts could not be created")
    ensure_bootstrap_admin()
