import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import api_router, ws_router
from app.config import settings
from app.database import init_db

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("civiclens")


async def _snap_routes_background() -> None:
    """Snap routes to real roads; if the routing service was unreachable, retry a few times with growing pauses."""
    try:
        from app.services import route_snapping

        for attempt in range(6):
            res = await asyncio.to_thread(route_snapping.snap_routes)
            log.info("route snapping (attempt %d): %s", attempt + 1, res)
            if not res["failed"]:
                return
            await asyncio.sleep(60 * (attempt + 1))
    except asyncio.CancelledError:
        raise
    except Exception:
        log.exception("route snapping failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
    Path(settings.CERTIFICATE_STORAGE_DIR).mkdir(parents=True, exist_ok=True)
    init_db()  # create_all is idempotent; production also runs `alembic upgrade head` first
    from app.seed import run_all

    run_all()
    snap_task = None
    if settings.ROUTE_SNAPPING:   # runs in the background so startup / health checks are never delayed by the routing service
        snap_task = asyncio.create_task(_snap_routes_background())
    simulator = None
    try:  # CleanRoute simulator is optional (owned by the CleanRoute module)
        from app.services import garbage_service

        if settings.GARBAGE_TRACKER_MODE == "simulation" and settings.GARBAGE_SIMULATION_AUTOSTART:
            simulator = garbage_service
            await garbage_service.start_simulator()
    except ImportError:
        log.info("garbage_service not installed; CleanRoute simulator disabled")
    yield
    if snap_task is not None and not snap_task.done():
        snap_task.cancel()
    if simulator is not None:
        await simulator.stop_simulator()


app = FastAPI(
    title=f"{settings.APP_NAME} API",
    version="1.0.0",
    description="AI triage for citizen complaints - Bengaluru, Karnataka pilot",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.FRONTEND_ORIGIN_REGEX or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_PREFIX)
app.include_router(ws_router)


@app.get("/health", tags=["meta"])
def health():
    from app.core.user_store import get_user_store

    return {"status": "ok", "app": settings.APP_NAME, "env": settings.APP_ENV,
            "sql_backend": "sqlite" if settings.is_sqlite else "postgresql",
            "user_store": get_user_store().backend}


@app.get("/", tags=["meta"])
def root():
    return {"app": settings.APP_NAME, "docs": "/docs", "health": "/health"}
