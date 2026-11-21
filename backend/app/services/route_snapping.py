"""Snap the SIMULATED CleanRoute routes to the REAL road network.

The seed data only has a handful of waypoints per route (well-known Bengaluru localities). This asks a routing engine
(OSRM, using OpenStreetMap road data) for the driving path through those waypoints, removes dead-end spurs, stores the dense
road geometry as the route, and moves each demo bin onto the nearest point of that road. The simulator then drives the trucks
along real streets. If routing is unreachable nothing is changed and the straight demo lines stay (clearly flagged by
`road_snapped=false` in the API); the caller retries later.

The vehicles, bins and positions are still SIMULATED; only the path geometry comes from real map data."""
import logging
from typing import List, Optional, Sequence

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models import GarbageBin, GarbageRoute
from app.services.garbage_service import MIN_SNAPPED_POINTS, RouteGeometry, haversine_m, is_snapped

log = logging.getLogger("civiclens.route_snapping")

MIN_GAP_M = 6.0           # drop road points closer than this to the previous one (keeps the polyline light)
MAX_FROM_CENTRE_KM = 90   # sanity check: a snapped path must stay in the Bengaluru region
SPUR_TOLERANCE_M = 14.0
SPUR_MAX_POINTS = 160     # longest out-and-back detour (in road points) that is treated as a dead-end spur
ATTEMPTS_PER_SERVER = 2


def _thin(points: List[List[float]], min_gap_m: float = MIN_GAP_M) -> List[List[float]]:
    if len(points) <= 2:
        return points
    out = [points[0]]
    for p in points[1:-1]:
        if haversine_m(out[-1][0], out[-1][1], p[0], p[1]) >= min_gap_m:
            out.append(p)
    out.append(points[-1])
    return out


def remove_spurs(points: List[List[float]], tol_m: float = SPUR_TOLERANCE_M, max_points: int = SPUR_MAX_POINTS) -> List[List[float]]:
    """Remove out-and-back detours (the truck drives into a dead end and back out along the same street), which is what the
    router produces when a waypoint snaps to a side street. A spur is a stretch that returns to the point it left from while
    retracing its own path. Genuine loops (around a block) are not retraced and are kept."""
    n = len(points)
    if n < 8:
        return points
    deg = tol_m / 111_000.0                      # cheap pre-filter in degrees before the exact distance check
    out: List[List[float]] = []
    i = 0
    while i < n:
        if not out or haversine_m(out[-1][0], out[-1][1], points[i][0], points[i][1]) > 0.5:
            out.append(points[i])
        jump = None
        hi = min(n - 1, i + max_points)
        for j in range(hi, i + 3, -1):           # prefer the longest spur starting here
            if abs(points[j][0] - points[i][0]) > deg or abs(points[j][1] - points[i][1]) > deg * 1.1:
                continue
            if haversine_m(points[i][0], points[i][1], points[j][0], points[j][1]) > tol_m:
                continue
            half = (j - i) // 2
            if half >= 2 and all(haversine_m(points[i + k][0], points[i + k][1], points[j - k][0], points[j - k][1]) <= tol_m * 2
                                 for k in range(1, half + 1)):
                jump = j
                break
        i = jump if jump is not None else i + 1
    return out


def _bases() -> List[str]:
    return [b.strip().rstrip("/") for b in (settings.OSRM_BASE_URL or "").split(",") if b.strip()]


def fetch_road_path(waypoints: Sequence[Sequence[float]]) -> Optional[List[List[float]]]:
    """Driving path through `waypoints` ([lat, lng] each) as a clean dense [[lat, lng], ...] list, or None on any problem.
    Tries each configured routing server (with a retry each) before giving up."""
    if len(waypoints) < 2:
        return None
    coords = ";".join(f"{float(p[1]):.6f},{float(p[0]):.6f}" for p in waypoints)  # OSRM wants lng,lat
    timeout = httpx.Timeout(settings.OSRM_TIMEOUT_SECONDS, connect=6.0)
    for base in _bases():
        for attempt in range(ATTEMPTS_PER_SERVER):
            try:
                resp = httpx.get(f"{base}/route/v1/driving/{coords}", timeout=timeout,
                                 params={"overview": "full", "geometries": "geojson", "steps": "false", "continue_straight": "true"},
                                 headers={"User-Agent": settings.GEOCODER_USER_AGENT})
                if resp.status_code != 200:
                    continue
                data = resp.json()
                if data.get("code") != "Ok" or not data.get("routes"):
                    break                          # the server answered but cannot route this: try the next server
                pts = [[float(lat), float(lng)] for lng, lat in data["routes"][0]["geometry"]["coordinates"]]
                pts = _thin(remove_spurs(_thin(pts)))
                if len(pts) < MIN_SNAPPED_POINTS:
                    break
                if any(haversine_m(lat, lng, settings.DEFAULT_MAP_LATITUDE, settings.DEFAULT_MAP_LONGITUDE) > MAX_FROM_CENTRE_KM * 1000
                       for lat, lng in pts[:: max(1, len(pts) // 50)]):
                    break
                return pts
            except Exception as exc:
                log.warning("routing server %s attempt %d failed: %s", base, attempt + 1, type(exc).__name__)
    return None


def snap_routes(db: Optional[Session] = None, codes: Optional[Sequence[str]] = None) -> dict:
    """Snap every simulated, not-yet-snapped route (optionally only `codes`). Idempotent. Never raises."""
    own = db is None
    db = db or SessionLocal()
    result = {"snapped": [], "failed": [], "already_snapped": 0}
    try:
        stmt = select(GarbageRoute).where(GarbageRoute.is_simulated.is_(True)).order_by(GarbageRoute.id)
        for route in db.scalars(stmt).all():
            if codes is not None and route.code not in codes:
                continue
            if is_snapped(route.waypoints):
                result["already_snapped"] += 1
                continue
            try:
                path = fetch_road_path(route.waypoints or [])
            except Exception as exc:
                log.warning("road routing failed for %s: %s", route.code, type(exc).__name__)
                path = None
            if not path:
                result["failed"].append(route.code)
                continue
            route.waypoints = path                      # a NEW list, so the JSON column change is detected
            geom = RouteGeometry(path)
            for b in db.scalars(select(GarbageBin).where(GarbageBin.route_id == route.id)).all():
                along, _ = geom.project(b.latitude, b.longitude)
                b.latitude, b.longitude = geom.position_at(along)   # demo bins now sit ON the road
            db.commit()
            result["snapped"].append(route.code)
            log.info("route %s snapped to %d road points (%.1f km)", route.code, len(path), geom.length / 1000)
    except Exception:
        log.exception("route snapping aborted")
        db.rollback()
    finally:
        if own:
            db.close()
    return result
