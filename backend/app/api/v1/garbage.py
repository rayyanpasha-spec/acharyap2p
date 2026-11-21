"""CleanRoute REST + demo control + WebSocket. All data is SIMULATED and labelled so."""
import asyncio
import logging
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.core.constants import OFFICE_ROLES, ROLE_WORKER
from app.core.deps import CurrentUser, get_optional_user, require_admin, require_roles
from app.database import get_db
from app.models.garbage import CollectionEvent, GarbageBin, GarbageVehicle
from app.services import garbage_service as gs

log = logging.getLogger("civiclens.garbage")

router = APIRouter(prefix="/garbage", tags=["cleanroute"])
demo_router = APIRouter(prefix="/demo/garbage", tags=["cleanroute"])
ws_router = APIRouter(tags=["cleanroute"])

_label = {"simulated": True, "source_label": gs.SOURCE_LABEL}
_office = require_roles(*OFFICE_ROLES)
_recorders = require_roles(ROLE_WORKER, *OFFICE_ROLES)


def _sees_driver(user: Optional[CurrentUser]) -> bool:
    return bool(user and user.is_staff)


class ReadingIn(BaseModel):
    fill_pct: float = Field(ge=0, le=100)
    source: Literal["worker", "sensor"] = "worker"


class CollectionIn(BaseModel):
    bin_id: int
    vehicle_id: Optional[int] = None


def _bin_or_404(db: Session, bin_id: int) -> GarbageBin:
    b = db.get(GarbageBin, bin_id)
    if not b:
        raise HTTPException(404, "Bin not found")
    return b


def _bin_out(db: Session, b: GarbageBin) -> dict:
    latest = gs._latest_readings(db).get(b.id)
    return {**gs.bin_dict(db, b, latest, gs.get_thresholds(db)), **_label}


@router.get("/vehicles")
def list_vehicles(db: Session = Depends(get_db), user: Optional[CurrentUser] = Depends(get_optional_user)):
    items = gs.vehicles_payload(db, include_driver=_sees_driver(user))
    times = [i["recorded_at"] for i in items if i["recorded_at"]]
    return {**_label, "updated_at": max(times) if times else None, "items": items}


@router.get("/vehicles/{vehicle_id}")
def get_vehicle(vehicle_id: int, db: Session = Depends(get_db),
                user: Optional[CurrentUser] = Depends(get_optional_user)):
    item = gs.vehicle_payload(db, vehicle_id, include_driver=_sees_driver(user))
    if not item:
        raise HTTPException(404, "Vehicle not found")
    return {**_label, **item}


@router.get("/routes")
def list_routes(db: Session = Depends(get_db)):
    return gs.routes_payload(db)


@router.get("/bins")
def list_bins(db: Session = Depends(get_db)):
    items, thresholds = gs.bins_payload(db)
    return {**_label, "thresholds": thresholds, "items": items}


@router.get("/summary")
def get_summary(db: Session = Depends(get_db)):
    return gs.summary(db)


@router.get("/alerts")
def get_alerts(db: Session = Depends(get_db), user: CurrentUser = Depends(_office)):
    return gs.alerts(db)


@router.post("/bins/{bin_id}/reading")
def post_reading(bin_id: int, body: ReadingIn, db: Session = Depends(get_db),
                 user: CurrentUser = Depends(_recorders)):
    b = _bin_or_404(db, bin_id)
    gs.record_reading(db, b, body.fill_pct, body.source, user.id)
    db.commit()
    return _bin_out(db, b)


@router.post("/collections", status_code=201)
def post_collection(body: CollectionIn, db: Session = Depends(get_db), user: CurrentUser = Depends(_recorders)):
    b = _bin_or_404(db, body.bin_id)
    if body.vehicle_id is not None and not db.get(GarbageVehicle, body.vehicle_id):
        raise HTTPException(404, "Vehicle not found")
    ev = gs.record_collection(db, b, body.vehicle_id, user.id, source="worker")
    db.commit()
    return {**_label, "collection": _collection_item(db, ev, b), "bin": _bin_out(db, b)}


def _collection_item(db: Session, ev: CollectionEvent, b: Optional[GarbageBin] = None) -> dict:
    b = b or db.get(GarbageBin, ev.bin_id)
    v = db.get(GarbageVehicle, ev.vehicle_id) if ev.vehicle_id else None
    return {"id": ev.id, "bin_id": ev.bin_id, "bin_code": b.code if b else None, "bin_name": b.name if b else None,
            "vehicle_id": ev.vehicle_id, "vehicle_code": v.code if v else None,
            "fill_before_pct": round(ev.fill_before_pct, 1) if ev.fill_before_pct is not None else None,
            "source": ev.source, "is_simulated": ev.source == "simulated", "recorded_at": ev.recorded_at.isoformat()}


@router.get("/collections")
def list_collections(limit: int = Query(50, ge=1, le=200), db: Session = Depends(get_db),
                     user: CurrentUser = Depends(_office)):
    rows = db.execute(select(CollectionEvent).order_by(CollectionEvent.id.desc()).limit(limit)).scalars().all()
    return {**_label, "items": [_collection_item(db, ev) for ev in rows]}


# ------------------------------------------------------------------------------------------- demo control
def _status() -> dict:
    return {**_label, "running": gs.is_running(), "mode": settings.GARBAGE_TRACKER_MODE,
            "interval_seconds": settings.GARBAGE_SIMULATION_INTERVAL_SECONDS, "ws_clients": len(gs.manager.clients)}


@demo_router.post("/start")
async def demo_start(user: CurrentUser = Depends(require_admin)):
    started = await gs.start_simulator()
    return {**_status(), "started": started}


@demo_router.post("/stop")
async def demo_stop(user: CurrentUser = Depends(require_admin)):
    stopped = await gs.stop_simulator()
    return {**_status(), "stopped": stopped}


@demo_router.post("/snap-routes")
async def demo_snap_routes(user: CurrentUser = Depends(require_admin)):
    """Snap the simulated routes to REAL roads now (OSRM / OpenStreetMap). Also runs automatically at startup. Idempotent."""
    from fastapi.concurrency import run_in_threadpool

    from app.services import route_snapping

    result = await run_in_threadpool(route_snapping.snap_routes)
    return {**_label, **result}


@demo_router.get("/status")
async def demo_status(user: CurrentUser = Depends(require_admin)):
    return _status()


# ------------------------------------------------------------------------------------------- websocket
@ws_router.websocket("/ws/v1/garbage/live")
async def garbage_live(ws: WebSocket):
    """Public, read-only live feed (no driver data). Client messages are ignored except keepalive pings."""
    await gs.manager.connect(ws)
    try:
        await ws.send_json(await asyncio.to_thread(gs.snapshot_sync, False))
        while True:
            msg = await ws.receive_text()
            if msg.strip().lower() == "ping":
                await ws.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    except Exception:
        log.debug("garbage websocket closed", exc_info=True)
    finally:
        gs.manager.disconnect(ws)
