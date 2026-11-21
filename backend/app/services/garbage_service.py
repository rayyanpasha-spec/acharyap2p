"""CleanRoute simulation service (SIMULATED data only - never presented as real municipal data).

* Pure helpers: haversine, bearing, polyline interpolation / projection by distance.
* `step(db, dt_seconds)`: synchronous simulation step (used by the background task and by tests).
  State lives in the database (VehicleLocation, BinReading, CollectionEvent); the in-memory progress
  cache is only a convenience and is rebuilt from the latest VehicleLocation rows when missing.
* `start_simulator()/stop_simulator()/is_running()` manage the asyncio background task.
* `ConnectionManager` fans snapshot/tick messages out to WebSocket clients.

Time scaling: the simulation deliberately runs faster than wall-clock time so a demo shows movement
(MOVE_SCALE for vehicles, FILL_SCALE for bin fill). All values stay labelled simulated.
"""
from __future__ import annotations

import asyncio
import logging
import math
import random
import threading
import zlib
from collections import deque
from datetime import datetime, timedelta
from typing import Any, Optional

from fastapi import WebSocket
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models.base import utcnow
from app.models.garbage import (BinReading, CollectionEvent, GarbageBin, GarbageRoute, GarbageVehicle,
                                VehicleLocation)
from app.models.reference import AppSetting

log = logging.getLogger("civiclens.garbage")

SOURCE_LABEL = "DEMO / SIMULATED GPS"
EARTH_RADIUS_M = 6_371_000.0

DEFAULT_THRESHOLDS = {"filling_up": 51, "collection_recommended": 81, "overflow_risk": 96}
MOVE_SCALE = 10.0           # simulated seconds of vehicle travel per wall-clock second
FILL_SCALE = 60.0           # simulated seconds of bin filling per wall-clock second
SPEED_MIN_KMH, SPEED_MAX_KMH = 12.0, 28.0
COLLECT_MIN_FILL = 50.0     # a passing vehicle collects bins at or above this fill level
COLLECT_RADIUS_M = 60.0     # bin must lie within this distance of the route polyline (design target ~40 m)
KEEP_LOCATIONS_PER_VEHICLE = 200
KEEP_READINGS_PER_BIN = 300
MISSED_AFTER_MINUTES = 20   # demo rule for "missed collection" alerts
MAX_PREDICTION_HOURS = 72.0

_STEP_LOCK = threading.Lock()
_progress: dict[int, dict[str, float]] = {}     # vehicle_id -> {"d": metres along route, "speed": km/h}
_last_bins: dict[int, tuple] = {}               # bin_id -> (fill rounded, source) last broadcast
_alerts: deque = deque(maxlen=50)               # in-memory overflow-crossing alerts (no complaint is created)
_step_counter = {"n": 0}


# ---------------------------------------------------------------------------- pure geometry helpers
def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dl = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(a)))


def bearing_deg(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lng2 - lng1)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0


MIN_SNAPPED_POINTS = 40   # a route with at least this many points came from road routing (seed routes have ~8)


def is_snapped(waypoints) -> bool:
    return len(waypoints or []) >= MIN_SNAPPED_POINTS


class RouteGeometry:
    """A polyline (list of [lat, lng]) with cumulative distances. Straight segments between points; the points
    follow real roads once the route has been snapped (see route_snapping)."""

    def __init__(self, waypoints: list):
        self.points: list[tuple[float, float]] = [(float(p[0]), float(p[1])) for p in waypoints]
        self.cum: list[float] = [0.0]
        for a, b in zip(self.points, self.points[1:]):
            self.cum.append(self.cum[-1] + haversine_m(a[0], a[1], b[0], b[1]))
        self.length: float = self.cum[-1] if len(self.points) > 1 else 0.0

    def valid(self) -> bool:
        return len(self.points) >= 2 and self.length > 0

    def position_at(self, d: float) -> tuple[float, float]:
        """Interpolate a position `d` metres along the polyline (wraps around for loops)."""
        if not self.valid():
            return self.points[0] if self.points else (0.0, 0.0)
        d = d % self.length
        lo, hi = 0, len(self.cum) - 1
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if self.cum[mid] <= d:
                lo = mid
            else:
                hi = mid
        seg = self.cum[lo + 1] - self.cum[lo]
        t = 0.0 if seg <= 0 else (d - self.cum[lo]) / seg
        a, b = self.points[lo], self.points[lo + 1]
        return a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t

    def heading_at(self, d: float) -> float:
        a = self.position_at(d)
        b = self.position_at(d + 25.0)
        return bearing_deg(a[0], a[1], b[0], b[1])

    def project(self, lat: float, lng: float) -> tuple[float, float]:
        """Return (distance along polyline in metres, perpendicular distance in metres) for a point."""
        best = (0.0, float("inf"))
        for i in range(len(self.points) - 1):
            a, b = self.points[i], self.points[i + 1]
            kx = math.cos(math.radians(a[0])) * 111_320.0
            ky = 110_574.0
            ax, ay = 0.0, 0.0
            bx, by = (b[1] - a[1]) * kx, (b[0] - a[0]) * ky
            px, py = (lng - a[1]) * kx, (lat - a[0]) * ky
            seg2 = bx * bx + by * by
            t = 0.0 if seg2 <= 0 else max(0.0, min(1.0, ((px - ax) * bx + (py - ay) * by) / seg2))
            dist = math.hypot(px - t * bx, py - t * by)
            if dist < best[1]:
                best = (self.cum[i] + t * (self.cum[i + 1] - self.cum[i]), dist)
        return best


# ---------------------------------------------------------------------------- bins / thresholds
def get_thresholds(db: Session) -> dict[str, float]:
    t = dict(DEFAULT_THRESHOLDS)
    try:
        row = db.get(AppSetting, "bin_thresholds")
        if row and isinstance(row.value, dict):
            for k in t:
                if isinstance(row.value.get(k), (int, float)):
                    t[k] = float(row.value[k])
    except Exception:  # fall back to constants on any DB/shape problem
        log.warning("bin_thresholds setting unreadable; using defaults")
    return t


def bin_state(fill_pct: float, thresholds: Optional[dict] = None) -> str:
    t = thresholds or DEFAULT_THRESHOLDS
    if fill_pct >= t["overflow_risk"]:
        return "overflow_risk"
    if fill_pct >= t["collection_recommended"]:
        return "collection_recommended"
    if fill_pct >= t["filling_up"]:
        return "filling_up"
    return "normal"


def bin_rate_pct_per_hour(code: str) -> float:
    """Deterministic per-bin simulated fill rate (6-20 % per simulated hour)."""
    return 6.0 + (zlib.crc32(code.encode()) % 15)


def predict_full_at(readings: list[tuple[datetime, float]]) -> Optional[datetime]:
    """Linear ESTIMATE of when a bin reaches 100 % from recent (recorded_at, fill) readings, oldest first.
    Only the segment since the last collection/reset is used. Returns None when there is no usable trend."""
    if not readings:
        return None
    seg = [readings[-1]]
    for prev, cur in zip(reversed(readings[:-1]), reversed(readings[1:])):
        if cur[1] < prev[1] - 10:  # a drop of >10 points means a collection/reset happened
            break
        seg.insert(0, prev)
    last_t, last_f = seg[-1]
    if last_f >= 100:
        return last_t
    if len(seg) < 2:
        return None
    span = (seg[-1][0] - seg[0][0]).total_seconds()
    gain = seg[-1][1] - seg[0][1]
    if span < 5 or gain <= 0:
        return None
    rate = gain / span  # percentage points per second
    eta_s = (100.0 - last_f) / rate
    if eta_s > MAX_PREDICTION_HOURS * 3600:
        return None
    return last_t + timedelta(seconds=eta_s)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


def _latest_readings(db: Session) -> dict[int, BinReading]:
    sub = select(func.max(BinReading.id)).group_by(BinReading.bin_id)
    rows = db.execute(select(BinReading).where(BinReading.id.in_(sub))).scalars().all()
    return {r.bin_id: r for r in rows}


def _latest_locations(db: Session) -> dict[int, VehicleLocation]:
    sub = select(func.max(VehicleLocation.id)).group_by(VehicleLocation.vehicle_id)
    rows = db.execute(select(VehicleLocation).where(VehicleLocation.id.in_(sub))).scalars().all()
    return {r.vehicle_id: r for r in rows}


def _prediction_for(db: Session, bin_id: int) -> Optional[datetime]:
    rows = db.execute(select(BinReading).where(BinReading.bin_id == bin_id)
                      .order_by(BinReading.id.desc()).limit(10)).scalars().all()
    return predict_full_at([(r.recorded_at, r.fill_pct) for r in reversed(rows)])


def bin_dict(db: Session, b: GarbageBin, reading: Optional[BinReading], thresholds: dict,
             with_prediction: bool = True) -> dict[str, Any]:
    fill = round(float(reading.fill_pct), 1) if reading else 0.0
    source = reading.source if reading else "simulated"
    pred = _prediction_for(db, b.id) if (with_prediction and reading) else None
    return {
        "id": b.id, "code": b.code, "name": b.name, "locality": b.locality,
        "latitude": b.latitude, "longitude": b.longitude,
        "fill_pct": fill, "state": bin_state(fill, thresholds), "source": source,
        "recorded_at": _iso(reading.recorded_at) if reading else None,
        "predicted_full_at": _iso(pred),
        "prediction_label": "Estimate from recent readings (linear), not sensor-accurate" if pred else None,
        "route_id": b.route_id, "is_simulated": source == "simulated",
    }


def bins_payload(db: Session) -> tuple[list[dict], dict]:
    thresholds = get_thresholds(db)
    latest = _latest_readings(db)
    bins = db.execute(select(GarbageBin).order_by(GarbageBin.id)).scalars().all()
    return [bin_dict(db, b, latest.get(b.id), thresholds) for b in bins], thresholds


# ---------------------------------------------------------------------------- vehicles
def _vehicle_item(v: GarbageVehicle, route: Optional[GarbageRoute], loc: Optional[VehicleLocation],
                  include_driver: bool) -> dict[str, Any]:
    item = {
        "id": v.id, "code": v.code, "status": v.status, "current_task": v.current_task,
        "route": ({"id": route.id, "code": route.code, "name": route.name, "schedule_window": route.schedule_window}
                  if route else None),
        "latitude": loc.latitude if loc else None, "longitude": loc.longitude if loc else None,
        "speed_kmh": round(loc.speed_kmh, 1) if loc and loc.speed_kmh is not None else None,
        "heading": round(loc.heading, 0) if loc and loc.heading is not None else None,
        "route_progress_pct": round(loc.route_progress_pct, 1) if loc and loc.route_progress_pct is not None else None,
        "next_stop": loc.next_stop if loc else None,
        "eta_minutes": round(loc.eta_minutes, 1) if loc and loc.eta_minutes is not None else None,
        "recorded_at": _iso(loc.recorded_at) if loc else None,
        "is_simulated": bool(v.is_simulated),
    }
    if include_driver:
        item["driver_label"] = v.driver_label
    return item


def vehicles_payload(db: Session, include_driver: bool = False) -> list[dict]:
    routes = {r.id: r for r in db.execute(select(GarbageRoute)).scalars().all()}
    locs = _latest_locations(db)
    vehicles = db.execute(select(GarbageVehicle).order_by(GarbageVehicle.id)).scalars().all()
    return [_vehicle_item(v, routes.get(v.route_id), locs.get(v.id), include_driver) for v in vehicles]


def vehicle_payload(db: Session, vehicle_id: int, include_driver: bool = False) -> Optional[dict]:
    v = db.get(GarbageVehicle, vehicle_id)
    if not v:
        return None
    route = db.get(GarbageRoute, v.route_id) if v.route_id else None
    loc = db.execute(select(VehicleLocation).where(VehicleLocation.vehicle_id == v.id)
                     .order_by(VehicleLocation.id.desc()).limit(1)).scalars().first()
    return _vehicle_item(v, route, loc, include_driver)


def routes_payload(db: Session) -> list[dict]:
    vehicles = db.execute(select(GarbageVehicle)).scalars().all()
    out = []
    for r in db.execute(select(GarbageRoute).order_by(GarbageRoute.id)).scalars().all():
        out.append({
            "id": r.id, "code": r.code, "name": r.name, "waypoints": r.waypoints,
            "schedule_window": r.schedule_window, "ward_label": r.ward_label,
            "vehicle_codes": [v.code for v in vehicles if v.route_id == r.id],
            "simulated": True, "source_label": SOURCE_LABEL,
            "road_snapped": is_snapped(r.waypoints),
            "path_note": ("Follows real roads (OpenStreetMap routing); vehicle positions are simulated."
                          if is_snapped(r.waypoints) else "Straight lines between demo waypoints; road routing unavailable."),
        })
    return out


def snapshot(db: Session, include_driver: bool = False) -> dict[str, Any]:
    bins, _ = bins_payload(db)
    return {"type": "snapshot", "simulated": True, "source_label": SOURCE_LABEL, "ts": _iso(utcnow()),
            "vehicles": vehicles_payload(db, include_driver), "bins": bins}


def summary(db: Session) -> dict[str, Any]:
    thresholds = get_thresholds(db)
    latest = _latest_readings(db)
    states = [bin_state(r.fill_pct, thresholds) for r in latest.values()]
    total_bins = db.scalar(select(func.count(GarbageBin.id))) or 0
    active = db.scalar(select(func.count(GarbageVehicle.id)).where(GarbageVehicle.status == "active")) or 0
    midnight = utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today = db.scalar(select(func.count(CollectionEvent.id)).where(CollectionEvent.recorded_at >= midnight)) or 0
    last = db.scalar(select(func.max(VehicleLocation.recorded_at)))
    last_r = db.scalar(select(func.max(BinReading.recorded_at)))
    last_updated = max([x for x in (last, last_r) if x], default=None)
    return {
        "simulated": True, "source_label": SOURCE_LABEL,
        "vehicles_active": active, "bins_total": total_bins,
        "bins_overflow_risk": states.count("overflow_risk"),
        "bins_collection_recommended": states.count("collection_recommended"),
        "collections_today": today, "last_updated": _iso(last_updated),
    }


def alerts(db: Session) -> dict[str, Any]:
    thresholds = get_thresholds(db)
    latest = _latest_readings(db)
    bins = {b.id: b for b in db.execute(select(GarbageBin)).scalars().all()}
    now = utcnow()
    overflow, missed = [], []
    for bid, reading in latest.items():
        b = bins.get(bid)
        if not b:
            continue
        state = bin_state(reading.fill_pct, thresholds)
        if state == "overflow_risk":
            overflow.append(bin_dict(db, b, reading, thresholds))
        if reading.fill_pct >= thresholds["collection_recommended"]:
            # when did the current >=threshold streak start? (bounded look-back)
            rows = db.execute(select(BinReading).where(BinReading.bin_id == bid)
                              .order_by(BinReading.id.desc()).limit(60)).scalars().all()
            streak_start = reading.recorded_at
            for r in rows:
                if r.fill_pct >= thresholds["collection_recommended"]:
                    streak_start = r.recorded_at
                else:
                    break
            last_col = db.scalar(select(func.max(CollectionEvent.recorded_at)).where(CollectionEvent.bin_id == bid))
            ref = max([x for x in (streak_start, last_col) if x])
            if now - ref >= timedelta(minutes=MISSED_AFTER_MINUTES):
                item = bin_dict(db, b, reading, thresholds)
                item["reason"] = (f"Fill at or above {int(thresholds['collection_recommended'])}% for "
                                  f"{int((now - ref).total_seconds() // 60)} min with no recorded collection "
                                  f"(demo rule: {MISSED_AFTER_MINUTES} min)")
                missed.append(item)
    return {"simulated": True, "source_label": SOURCE_LABEL, "overflow_risk": overflow, "missed_collection": missed,
            "recent_overflow_crossings": list(_alerts)}


# ---------------------------------------------------------------------------- manual (worker) actions
def record_reading(db: Session, b: GarbageBin, fill_pct: float, source: str, user_id: Optional[str]) -> BinReading:
    r = BinReading(bin_id=b.id, fill_pct=float(fill_pct), source=source, recorded_by_user_id=user_id,
                   recorded_at=utcnow())
    db.add(r)
    return r


def record_collection(db: Session, b: GarbageBin, vehicle_id: Optional[int], user_id: Optional[str],
                      source: str = "worker") -> CollectionEvent:
    latest = _latest_readings(db).get(b.id)
    before = float(latest.fill_pct) if latest else None
    ev = CollectionEvent(bin_id=b.id, vehicle_id=vehicle_id, fill_before_pct=before, source=source,
                         recorded_by_user_id=user_id, recorded_at=utcnow())
    db.add(ev)
    record_reading(db, b, 3.0, source, user_id)  # emptied bin: low residual level
    db.flush()
    return ev


# ---------------------------------------------------------------------------- simulation step
def reset_cache() -> None:
    _progress.clear()
    _last_bins.clear()
    _alerts.clear()
    _step_counter["n"] = 0


def _prune(db: Session, vehicle_ids: list[int], bin_ids: list[int], readings: bool) -> None:
    for vid in vehicle_ids:
        cutoff = db.scalar(select(VehicleLocation.id).where(VehicleLocation.vehicle_id == vid)
                           .order_by(VehicleLocation.id.desc()).offset(KEEP_LOCATIONS_PER_VEHICLE - 1).limit(1))
        if cutoff:
            db.execute(delete(VehicleLocation).where(VehicleLocation.vehicle_id == vid, VehicleLocation.id < cutoff))
    if readings:
        for bid in bin_ids:
            cutoff = db.scalar(select(BinReading.id).where(BinReading.bin_id == bid)
                               .order_by(BinReading.id.desc()).offset(KEEP_READINGS_PER_BIN - 1).limit(1))
            if cutoff:
                db.execute(delete(BinReading).where(BinReading.bin_id == bid, BinReading.id < cutoff))


def step(db: Session, dt_seconds: float = 3.0, rng: Optional[random.Random] = None) -> dict[str, Any]:
    """Advance the simulation by `dt_seconds` of wall time. Commits. Returns the broadcastable tick message."""
    rng = rng or random
    with _STEP_LOCK:
        now = utcnow()
        thresholds = get_thresholds(db)
        routes = {r.id: r for r in db.execute(select(GarbageRoute)).scalars().all()}
        geoms = {rid: RouteGeometry(r.waypoints or []) for rid, r in routes.items()}
        vehicles = db.execute(select(GarbageVehicle).order_by(GarbageVehicle.id)).scalars().all()
        bins = db.execute(select(GarbageBin).order_by(GarbageBin.id)).scalars().all()
        latest_loc = _latest_locations(db)
        latest_read = _latest_readings(db)

        # --- bin fill levels
        fills: dict[int, float] = {}
        for b in bins:
            prev = latest_read.get(b.id)
            fill = float(prev.fill_pct) if prev else 10.0
            rate = bin_rate_pct_per_hour(b.code) * rng.uniform(0.8, 1.2)
            new_fill = min(100.0, fill + rate * dt_seconds * FILL_SCALE / 3600.0)
            fills[b.id] = new_fill
            if fill < thresholds["overflow_risk"] <= new_fill:
                _alerts.append({"bin_code": b.code, "bin_name": b.name, "fill_pct": round(new_fill, 1),
                                "at": _iso(now), "note": "Simulated overflow-risk crossing (no complaint created)"})

        # --- bins projected on their routes (along-route distance, perpendicular distance)
        bin_proj: dict[int, tuple[float, float]] = {}
        route_bins: dict[int, list[GarbageBin]] = {}
        for b in bins:
            g = geoms.get(b.route_id)
            if g and g.valid():
                bin_proj[b.id] = g.project(b.latitude, b.longitude)
                route_bins.setdefault(b.route_id, []).append(b)

        # --- vehicles
        events: list[dict] = []
        collected_ids: set[int] = set()
        vehicle_msgs: list[dict] = []
        for v in vehicles:
            route = routes.get(v.route_id)
            g = geoms.get(v.route_id)
            if v.status != "active" or not route or not g or not g.valid():
                continue
            st = _progress.get(v.id)
            if st is None:
                loc = latest_loc.get(v.id)
                pct = loc.route_progress_pct if loc and loc.route_progress_pct is not None else 0.0
                st = {"d": pct / 100.0 * g.length, "speed": rng.uniform(SPEED_MIN_KMH, SPEED_MAX_KMH)}
                _progress[v.id] = st
            speed = max(SPEED_MIN_KMH, min(SPEED_MAX_KMH, st["speed"] + rng.uniform(-2.0, 2.0)))
            move = speed / 3.6 * dt_seconds * MOVE_SCALE
            d0 = st["d"]
            d1 = (d0 + move) % g.length
            st["d"], st["speed"] = d1, speed
            lat, lng = g.position_at(d1)

            # collection: passed a qualifying bin of this route during this step
            for b in route_bins.get(v.route_id, []):
                along, perp = bin_proj[b.id]
                rel = (along - d0) % g.length
                if 0 < rel <= move and perp <= COLLECT_RADIUS_M and fills[b.id] >= COLLECT_MIN_FILL \
                        and b.id not in collected_ids:
                    before = fills[b.id]
                    db.add(CollectionEvent(bin_id=b.id, vehicle_id=v.id, fill_before_pct=before,
                                           source="simulated", recorded_at=now))
                    fills[b.id] = rng.uniform(2.0, 8.0)
                    collected_ids.add(b.id)
                    events.append({"type": "collection", "bin_code": b.code, "vehicle_code": v.code,
                                   "fill_before_pct": round(before, 1)})

            # next stop = next bin ahead on the loop
            ahead = sorted(((((bin_proj[b.id][0] - d1) % g.length), b) for b in route_bins.get(v.route_id, [])),
                           key=lambda x: x[0])
            next_stop, eta = None, None
            if ahead:
                dist_ahead, nb = ahead[0]
                next_stop = nb.name
                eta = (dist_ahead / 1000.0) / speed * 60.0
            loc_row = VehicleLocation(vehicle_id=v.id, latitude=lat, longitude=lng, speed_kmh=speed,
                                      heading=g.heading_at(d1), route_progress_pct=d1 / g.length * 100.0,
                                      next_stop=next_stop, eta_minutes=eta, is_simulated=True, recorded_at=now)
            db.add(loc_row)
            vehicle_msgs.append(_vehicle_item(v, route, loc_row, include_driver=False))

        # --- bin readings
        new_readings: dict[int, BinReading] = {}
        for b in bins:
            rd = BinReading(bin_id=b.id, fill_pct=fills[b.id], source="simulated", recorded_at=now)
            db.add(rd)
            new_readings[b.id] = rd
        db.flush()

        _step_counter["n"] += 1
        _prune(db, [v.id for v in vehicles], [b.id for b in bins], readings=_step_counter["n"] % 10 == 0)
        db.commit()

        # --- changed bins only
        changed: list[dict] = []
        for b in bins:
            key = (round(fills[b.id], 1), "simulated")
            if _last_bins.get(b.id) != key:
                _last_bins[b.id] = key
                changed.append(bin_dict(db, b, new_readings[b.id], thresholds))
        return {"type": "tick", "ts": _iso(now), "simulated": True, "source_label": SOURCE_LABEL,
                "vehicles": vehicle_msgs, "bins": changed, "events": events}


# ---------------------------------------------------------------------------- websocket manager
class ConnectionManager:
    def __init__(self) -> None:
        self.clients: set[WebSocket] = set()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.clients.add(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self.clients.discard(ws)

    async def broadcast(self, message: dict) -> None:
        dead = []
        for ws in list(self.clients):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()
_task: Optional[asyncio.Task] = None


def _tick_sync(dt: float) -> dict:
    with SessionLocal() as db:
        try:
            return step(db, dt)
        except Exception:
            db.rollback()
            raise


def snapshot_sync(include_driver: bool = False) -> dict:
    with SessionLocal() as db:
        return snapshot(db, include_driver)


async def _run_loop() -> None:
    interval = max(0.2, float(settings.GARBAGE_SIMULATION_INTERVAL_SECONDS))
    log.info("CleanRoute simulator started (interval %.1fs, SIMULATED data)", interval)
    while True:
        try:
            msg = await asyncio.to_thread(_tick_sync, interval)
            if manager.clients:
                await manager.broadcast(msg)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("CleanRoute simulator tick failed; continuing")
        await asyncio.sleep(interval)


def is_running() -> bool:
    return _task is not None and not _task.done()


async def start_simulator() -> bool:
    """Start the background task. Returns False when it was already running."""
    global _task
    if is_running():
        return False
    _task = asyncio.get_running_loop().create_task(_run_loop(), name="cleanroute-simulator")
    return True


async def stop_simulator() -> bool:
    global _task
    if not is_running():
        _task = None
        return False
    _task.cancel()
    try:
        await _task
    except (asyncio.CancelledError, Exception):
        pass
    _task = None
    log.info("CleanRoute simulator stopped")
    return True
