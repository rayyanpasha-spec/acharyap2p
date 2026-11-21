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
