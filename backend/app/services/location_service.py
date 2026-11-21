"""Service-area / jurisdiction lookup, boundary import and geocoding.

* Official boundaries (table `service_boundaries`, imported from GeoJSON by scripts/import_boundaries.py) are used for
  a pure-Python point-in-polygon check (ray casting, holes + MultiPolygon, bbox prefilter).
* If NO dataset has been imported we use a clearly labelled coarse radius fallback and never infer a corporation or
  ward. We never invent boundary data.
* Reverse geocoding / search use Nominatim through httpx with timeouts, caching and throttling. Any failure degrades to
  ok=false / empty results - a failed lookup must never block a complaint.
"""
from __future__ import annotations

import json
import logging
import math
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import ServiceBoundary
from app.models.base import utcnow

log = logging.getLogger("civiclens.location")

LEVELS = ("service_area", "corporation", "zone", "ward")
FALLBACK_NOTICE = (
    "Official Greater Bengaluru boundary data has not been imported yet, so this is only an approximate radius check "
    "around the city centre. The corporation, zone and ward are not resolved and an officer will route this report."
)
OUTSIDE_NOTICE = (
    "This location appears to be outside the Greater Bengaluru pilot service area. Please check or move the pin. "
    "You can still submit, but the report will be flagged for manual routing."
)


# ------------------------------------------------------------------ result type
@dataclass
class ServiceAreaResult:
    service_area: str = "greater_bengaluru"
    inside_service_area: bool = True
    service_area_status: str = "needs_manual_routing"   # in_area | outside_service_area | needs_manual_routing
    city_corporation_code: Optional[str] = None
    division_code: Optional[str] = None
    ward_code: Optional[str] = None
    boundary_dataset_version: Optional[str] = None
    boundary_source: str = "none"                       # official_import | fallback_approximate | none
    notice: Optional[str] = None
    locality: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "service_area": self.service_area,
            "inside_service_area": self.inside_service_area,
            "service_area_status": self.service_area_status,
            "city_corporation_code": self.city_corporation_code,
            "division_code": self.division_code,
            "ward_code": self.ward_code,
            "locality": self.locality,
            "boundary_dataset_version": self.boundary_dataset_version,
            "boundary_source": self.boundary_source,
            "notice": self.notice,
        }


# ------------------------------------------------------------------ geometry helpers
def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def _ring_contains(ring: Sequence[Sequence[float]], x: float, y: float) -> bool:
    """Ray casting; ring is a list of [lng, lat]. Points exactly on an edge count as inside."""
    inside = False
    n = len(ring)
    if n < 3:
        return False
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        # on-edge test (collinear and within segment bounds)
        cross = (x - xi) * (yj - yi) - (y - yi) * (xj - xi)
        if abs(cross) < 1e-12 and min(xi, xj) - 1e-12 <= x <= max(xi, xj) + 1e-12 \
                and min(yi, yj) - 1e-12 <= y <= max(yi, yj) + 1e-12:
            return True
        if (yi > y) != (yj > y):
            xint = (xj - xi) * (y - yi) / (yj - yi) + xi
            if x < xint:
                inside = not inside
        j = i
    return inside


def polygon_contains(rings: Sequence[Sequence[Sequence[float]]], lng: float, lat: float) -> bool:
    """GeoJSON polygon coordinates: [outer, hole, hole...]. Inside outer and outside every hole."""
    if not rings or not _ring_contains(rings[0], lng, lat):
        return False
    return not any(_ring_contains(h, lng, lat) for h in rings[1:])


def geometry_polygons(geometry: Dict[str, Any]) -> List[Any]:
    gtype = (geometry or {}).get("type")
    coords = (geometry or {}).get("coordinates") or []
    if gtype == "Polygon":
        return [coords]
    if gtype == "MultiPolygon":
        return list(coords)
    return []


def geometry_bbox(geometry: Dict[str, Any]) -> Optional[List[float]]:
    xs: List[float] = []
    ys: List[float] = []
    for poly in geometry_polygons(geometry):
        for ring in poly:
            for pt in ring:
                xs.append(pt[0])
                ys.append(pt[1])
    if not xs:
        return None
    return [min(xs), min(ys), max(xs), max(ys)]


def geometry_contains(geometry: Dict[str, Any], lng: float, lat: float, bbox: Optional[List[float]] = None) -> bool:
    bbox = bbox or geometry_bbox(geometry)
    if bbox and not (bbox[0] <= lng <= bbox[2] and bbox[1] <= lat <= bbox[3]):
        return False
    return any(polygon_contains(p, lng, lat) for p in geometry_polygons(geometry))


# ------------------------------------------------------------------ boundary cache
@dataclass
class _Boundary:
    level: str
    code: str
    name: Optional[str]
    parent_code: Optional[str]
    version: str
    source: Optional[str]
    bbox: Optional[List[float]]
    geometry: Dict[str, Any] = field(repr=False, default_factory=dict)


_cache_lock = threading.Lock()
_boundary_cache: Optional[List[_Boundary]] = None


def reload_boundaries() -> None:
    """Drop the in-process cache (call after importing a new dataset)."""
    global _boundary_cache
    with _cache_lock:
        _boundary_cache = None


def _load_boundaries(db: Session) -> List[_Boundary]:
    """Active boundaries, cached in-process. An empty dataset is NOT cached so a later import is picked up."""
    global _boundary_cache
    with _cache_lock:
        if _boundary_cache is not None:
            return _boundary_cache
    rows = db.scalars(select(ServiceBoundary).where(ServiceBoundary.active.is_(True))).all()
    items = [_Boundary(r.level, r.code, r.name, r.parent_code, r.dataset_version, r.source,
                       r.bbox or geometry_bbox(r.geometry), r.geometry) for r in rows]
    if items:
        with _cache_lock:
            _boundary_cache = items
    return items


def _containing(items: List[_Boundary], level: str, lng: float, lat: float) -> Optional[_Boundary]:
    for b in items:
        if b.level == level and geometry_contains(b.geometry, lng, lat, b.bbox):
            return b
    return None


def check_service_area(db: Session, lat: float, lng: float) -> ServiceAreaResult:
    items = _load_boundaries(db)
    if items:
        levels_present = {b.level for b in items}
        version = next((b.version for b in items if b.level in ("corporation", "service_area")), items[0].version)
        corp = _containing(items, "corporation", lng, lat)
        zone = _containing(items, "zone", lng, lat)
        ward = _containing(items, "ward", lng, lat)
        if "service_area" in levels_present:
            inside = _containing(items, "service_area", lng, lat) is not None
        elif "corporation" in levels_present:
            inside = corp is not None
        else:
            inside = (zone or ward) is not None
        if not inside:
            return ServiceAreaResult(
                inside_service_area=False, service_area_status="outside_service_area",
                boundary_dataset_version=version, boundary_source="official_import", notice=OUTSIDE_NOTICE)
        resolved = corp is not None
        return ServiceAreaResult(
            inside_service_area=True,
            service_area_status="in_area" if resolved else "needs_manual_routing",
            city_corporation_code=corp.code if corp else None,
            division_code=zone.code if zone else None,
            ward_code=ward.code if ward else None,
            boundary_dataset_version=version, boundary_source="official_import",
            notice=None if resolved else "Inside the service area, but the City Corporation could not be resolved "
                                         "from the imported data; an officer will route this report.")
    # ---- no official data imported: coarse, clearly-labelled fallback
    dist_km = haversine_m(lat, lng, settings.DEFAULT_MAP_LATITUDE, settings.DEFAULT_MAP_LONGITUDE) / 1000.0
    inside = dist_km <= settings.FALLBACK_SERVICE_AREA_RADIUS_KM
    notice = FALLBACK_NOTICE if inside else FALLBACK_NOTICE + " " + OUTSIDE_NOTICE
    return ServiceAreaResult(
        inside_service_area=inside,
        service_area_status="needs_manual_routing" if inside else "outside_service_area",
        boundary_source="fallback_approximate", notice=notice)


def boundaries_summary(db: Session) -> Dict[str, Any]:
    items = _load_boundaries(db)
    if not items:
        return {"dataset_version": None, "source": "none", "corporations": [], "imported": False}
    corps = sorted({(b.code, b.name or b.code) for b in items if b.level == "corporation"})
    version = next((b.version for b in items if b.level in ("corporation", "service_area")), items[0].version)
    return {"dataset_version": version, "source": "official_import",
            "corporations": [{"code": c, "name": n} for c, n in corps], "imported": True}


# ------------------------------------------------------------------ boundary import
def _prop(props: Dict[str, Any], *names: str) -> Optional[str]:
    lower = {str(k).lower(): v for k, v in (props or {}).items()}
    for n in names:
        v = lower.get(n.lower())
        if v not in (None, ""):
            return str(v).strip()
    return None


def _slug(text: str) -> str:
    return "_".join("".join(ch.lower() if ch.isalnum() else " " for ch in text).split())


def load_boundaries_from_dir(db: Session, directory: Optional[str] = None, *, level: Optional[str] = None,
                             code: Optional[str] = None, dataset_version: Optional[str] = None,
                             source: Optional[str] = None, replace: bool = True) -> Dict[str, Any]:
    """Import every `*.geojson` / `*.json` FeatureCollection in `directory` (default settings.BOUNDARY_DATA_DIR).

    Per feature: `level` from properties.level, else the `level` argument, else the file stem when it is a known level.
    `code` from properties (code / <level>_code / id), else the `code` argument (single-feature files), else a slug of
    the name. Features with no usable code, level or Polygon/MultiPolygon geometry are skipped and counted.
    Previously active rows are deactivated (kept for history) when `replace`.
    """
    folder = Path(directory or settings.BOUNDARY_DATA_DIR)
    summary: Dict[str, Any] = {"directory": str(folder), "files": 0, "imported": 0, "skipped": 0, "by_level": {},
                               "dataset_version": None, "errors": []}
    files = sorted([*folder.glob("*.geojson"), *folder.glob("*.json")]) if folder.is_dir() else []
    if not files:
        summary["errors"].append(f"No .geojson files found in {folder}")
        return summary
    new_rows: List[ServiceBoundary] = []
    for f in files:
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except Exception as exc:
            summary["errors"].append(f"{f.name}: unreadable ({exc.__class__.__name__})")
            continue
        features = data.get("features") if data.get("type") == "FeatureCollection" else (
            [data] if data.get("type") == "Feature" else [])
        summary["files"] += 1
        stem = f.stem.lower()
        file_level = level or (stem if stem in LEVELS else None)
        version = dataset_version or _prop(data.get("properties") or {}, "dataset_version") or (
            f"{f.stem}-{datetime.fromtimestamp(f.stat().st_mtime).strftime('%Y%m%d')}")
        summary["dataset_version"] = summary["dataset_version"] or version
        for feat in features:
            props = feat.get("properties") or {}
            geom = feat.get("geometry") or {}
            lvl = (_prop(props, "level") or file_level or "").lower()
            name = _prop(props, "name", "ward_name", "corporation_name", "zone_name", "label")
            ccode = _prop(props, "code", f"{lvl}_code", "id", "ward_no", "ward_id") or code or (_slug(name) if name else None)
            if lvl not in LEVELS or not ccode or not geometry_polygons(geom):
                summary["skipped"] += 1
                continue
            new_rows.append(ServiceBoundary(
                dataset_version=_prop(props, "dataset_version") or version, level=lvl, code=ccode, name=name,
                parent_code=_prop(props, "parent_code", "corporation_code", "zone_code") if lvl != "corporation" else None,
                geometry=geom, bbox=geometry_bbox(geom),
                source=_prop(props, "source") or source or f.name, imported_at=utcnow(), active=True))
            summary["by_level"][lvl] = summary["by_level"].get(lvl, 0) + 1
    if new_rows:
        if replace:
            for old in db.scalars(select(ServiceBoundary).where(ServiceBoundary.active.is_(True))):
                old.active = False
        db.add_all(new_rows)
        db.commit()
        reload_boundaries()
    summary["imported"] = len(new_rows)
    return summary


# ------------------------------------------------------------------ geocoding (Nominatim)
_geo_lock = threading.Lock()
_last_call = 0.0
_rev_cache: Dict[Tuple[float, float], Dict[str, Any]] = {}
_search_cache: Dict[str, List[Dict[str, Any]]] = {}
_CACHE_MAX = 500


def _geocoder_enabled() -> bool:
    return settings.GEOCODER_PROVIDER.lower() == "nominatim"


def _throttled_get(path: str, params: Dict[str, Any]) -> Any:
    """GET against Nominatim with >=1 s spacing between outbound calls and a 6 s timeout."""
    global _last_call
    with _geo_lock:
        wait = 1.0 - (time.monotonic() - _last_call)
        if wait > 0:
            time.sleep(wait)
        _last_call = time.monotonic()
    r = httpx.get(settings.GEOCODER_BASE_URL.rstrip("/") + path, params=params, timeout=6.0,
                  headers={"User-Agent": settings.GEOCODER_USER_AGENT, "Accept-Language": "en"})
    r.raise_for_status()
    return r.json()


def _trim(cache: dict) -> None:
    if len(cache) > _CACHE_MAX:
        for k in list(cache)[: _CACHE_MAX // 5]:
            cache.pop(k, None)


def reverse_geocode(lat: float, lng: float) -> Dict[str, Any]:
    none = {"address": None, "locality": None, "postcode": None, "provider": "none", "ok": False}
    if not _geocoder_enabled():
        return none
    key = (round(lat, 4), round(lng, 4))
    if key in _rev_cache:
        return dict(_rev_cache[key])
    try:
        data = _throttled_get("/reverse", {"format": "jsonv2", "lat": key[0], "lon": key[1], "zoom": 18,
                                           "addressdetails": 1})
        addr = data.get("address") or {}
        locality = next((addr[k] for k in ("suburb", "neighbourhood", "city_district", "quarter", "village", "town",
                                           "city") if addr.get(k)), None)
        if not data.get("display_name"):
            return {**none, "provider": "nominatim"}
        res = {"address": data.get("display_name"), "locality": locality, "postcode": addr.get("postcode"),
               "provider": "nominatim", "ok": True}
        _rev_cache[key] = res
        _trim(_rev_cache)
        return dict(res)
    except Exception as exc:  # never block a complaint on geocoding
        log.info("reverse geocode failed: %s", exc.__class__.__name__)
        return {**none, "provider": "nominatim"}


def search_places(q: str) -> Dict[str, Any]:
    q = (q or "").strip()
    if not _geocoder_enabled() or len(q) < 2:
        return {"items": []}
    key = q.lower()
    if key in _search_cache:
        return {"items": list(_search_cache[key])}
    try:
        data = _throttled_get("/search", {"format": "jsonv2", "q": q, "viewbox": "77.35,13.20,77.85,12.70",
                                          "bounded": 1, "countrycodes": "in", "limit": 6})
        items = [{"label": d.get("display_name"), "lat": float(d["lat"]), "lng": float(d["lon"])}
                 for d in data if d.get("lat") and d.get("lon")]
        _search_cache[key] = items
        _trim(_search_cache)
        return {"items": list(items)}
    except Exception as exc:
        log.info("place search failed: %s", exc.__class__.__name__)
        return {"items": []}
