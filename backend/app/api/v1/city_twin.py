"""City in Motion API (3D map data). Read-only views over the existing complaint / CleanRoute tables.

Anonymous access is allowed everywhere (`get_optional_user`); exact coordinates only for the owner and staff.
Officer/admin actions are NOT here - the UI reuses the existing garbage / complaint endpoints.
"""
import asyncio
import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_optional_user
from app.database import SessionLocal, get_db
from app.services import city_twin_service as svc

log = logging.getLogger("civiclens.city_twin")

router = APIRouter(prefix="/city-twin", tags=["city-twin"])
ws_router = APIRouter(tags=["city-twin"])

# Seconds between DB polls of each live WebSocket connection (tests monkeypatch this).
LIVE_INTERVAL_SECONDS = 2.0


@router.get("/summary")
def summary(user: Optional[CurrentUser] = Depends(get_optional_user), db: Session = Depends(get_db)):
    return svc.summary(db, svc.viewer_from(user))


@router.get("/layers/config")
def layers_config(db: Session = Depends(get_db)):
    return svc.layers_config(db)


@router.get("/complaints")
def complaints(
    severity: Optional[str] = None,
    category: Optional[str] = None,
    status: Optional[str] = None,
    department: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    mine: bool = False,
    include_resolved: bool = False,
    limit: int = Query(500, ge=1, le=1000),
    user: Optional[CurrentUser] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    return svc.complaints_geojson(
        db, svc.viewer_from(user), severity=severity, category=category, status=status, department=department,
        date_from=date_from, date_to=date_to, mine=mine, include_resolved=include_resolved, limit=limit)


@router.get("/complaints/{ticket_id}")
def complaint_detail(ticket_id: str, user: Optional[CurrentUser] = Depends(get_optional_user),
                     db: Session = Depends(get_db)):
    c = svc.get_complaint(db, ticket_id)
    return svc.complaint_detail(db, c, svc.viewer_from(user))


@router.get("/vehicles")
def vehicles(user: Optional[CurrentUser] = Depends(get_optional_user), db: Session = Depends(get_db)):
    return svc.vehicles_payload(db, svc.viewer_from(user))


@router.get("/vehicles/{vehicle_id}")
def vehicle_detail(vehicle_id: str, user: Optional[CurrentUser] = Depends(get_optional_user),
                   db: Session = Depends(get_db)):
    v = svc.find_vehicle(db, vehicle_id)
    if v is None:
        raise HTTPException(404, "Vehicle not found")
    return svc.vehicle_detail(db, v, svc.viewer_from(user))


@router.get("/routes")
def routes(db: Session = Depends(get_db)):
    return svc.routes_geojson(db)


@router.get("/bins")
def bins(db: Session = Depends(get_db)):
    return svc.bins_payload(db)


@router.get("/bins/{bin_id}")
def bin_detail(bin_id: str, db: Session = Depends(get_db)):
    b = svc.find_bin(db, bin_id)
    if b is None:
        raise HTTPException(404, "Bin not found")
    return svc.bin_detail(db, b)


# ---------------------------------------------------------------------------------------------- WebSocket
def _snapshot_sync():
    db = SessionLocal()
    try:
        return svc.build_snapshot(db)
    finally:
        db.close()


async def _delta_loop(ws: WebSocket, state: svc.LiveState, lock: asyncio.Lock) -> None:
    while True:
        await asyncio.sleep(LIVE_INTERVAL_SECONDS)
        try:
            events = await asyncio.to_thread(svc.poll_deltas, state)
        except Exception:  # a failed poll must not kill the feed
            log.exception("city-twin live poll failed; retrying")
            continue
        for ev in events:
            async with lock:
                await ws.send_json(ev)


@ws_router.websocket("/ws/v1/city-twin/live")
async def live(ws: WebSocket):
    """Public, read-only. Snapshot on connect, then per-connection 2 s DB-polling deltas. Client `ping` -> `pong`."""
    await ws.accept()
    lock = asyncio.Lock()
    task: Optional[asyncio.Task] = None
    try:
        snapshot, state = await asyncio.to_thread(_snapshot_sync)
        async with lock:
            await ws.send_json(snapshot)
        task = asyncio.create_task(_delta_loop(ws, state, lock))
        while True:
            text = await ws.receive_text()
            reply: Optional[str] = None
            if text.strip().lower() == "ping":
                reply = "pong"
            else:
                try:
                    if json.loads(text).get("type") == "ping":
                        reply = json.dumps({"type": "pong"})
                except (ValueError, AttributeError):
                    pass
            if reply is not None:
                async with lock:
                    await ws.send_text(reply)
            if task.done():  # sender died (e.g. broken pipe): stop serving
                break
    except WebSocketDisconnect:
        pass
    except asyncio.CancelledError:  # server shutdown
        try:
            await ws.close(code=1001)
        except Exception:
            pass
        raise
    except Exception:
        log.exception("city-twin live connection error")
    finally:
        if task is not None:
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
