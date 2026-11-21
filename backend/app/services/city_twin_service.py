"""City in Motion (3D map) data layer.

Everything here is a READ-ONLY view over the existing CivicLens tables (complaints, garbage_* tables). Nothing is
invented: the 3D map shows exactly the rows the rest of the product uses. This module deliberately does not import
the complaint / CleanRoute service internals (other agents own them); it only uses the SQLAlchemy models and the
shared constants, so the live feed stays decoupled from the simulator.
"""
from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.core.constants import (ACTIVE_STATUSES, SEVERITIES, STATUS_REJECTED, STATUS_RESOLVED, STAFF_ROLES)
from app.core.user_store import get_user_store
from app.database import SessionLocal
from app.models import (AppSetting, Category, Complaint, ComplaintFollower, ComplaintImage, ComplaintSubmission,
                        Department, ResolutionEvidence, StatusHistory)
from app.models.base import utcnow
from app.models.garbage import (BinReading, CollectionEvent, GarbageBin, GarbageRoute, GarbageVehicle,
                                VehicleLocation)

log = logging.getLogger("civiclens.city_twin")

SIMULATION_LABEL = "DEMO MODE — Vehicle locations and bin readings are simulated."
SIMULATED_SOURCE_LABEL = "DEMO / SIMULATED GPS"
LIVE_SOURCE_LABEL = "GPS device data"
STALE_AFTER_SECONDS = 30
OFFLINE_AFTER_SECONDS = 300
COLLECT_RADIUS_M = 60.0
DEFAULT_THRESHOLDS = {"filling_up": 51.0, "collection_recommended": 81.0, "overflow_risk": 96.0}
MAX_PREDICTION_HOURS = 72.0
EARTH_RADIUS_M = 6_371_000.0

SEVERITY_LABELS = {"critical": "Critical", "high": "High", "medium": "Medium", "low": "Low"}
STATUS_LABELS = {
    "submitted": "Submitted", "ai_review": "AI review", "verified": "Verified", "assigned": "Assigned",
    "in_progress": "In progress", "awaiting_verification": "Awaiting verification", "resolved": "Resolved",
    "reopened": "Reopened",
}
# Statuses that appear on the public map's status filter (rejected never does).
MAP_STATUSES = tuple(ACTIVE_STATUSES) + (STATUS_RESOLVED,)


# ------------------------------------------------------------------------------------------------ helpers
def iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dl = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(a)))


def epoch_ms(dt: Optional[datetime]) -> int:
    if not dt:
        return 0
    return int(dt.replace(tzinfo=timezone.utc).timestamp() * 1000)


@dataclass
class Viewer:
    """Who is looking. Anonymous = all fields None/False."""
    user_id: Optional[str] = None
    role: Optional[str] = None

    @property
    def is_staff(self) -> bool:
        return self.role in STAFF_ROLES

    @property
    def signed_in(self) -> bool:
        return self.user_id is not None

    @property
    def role_view(self) -> str:
        return self.role if self.role in ("officer", "worker", "supervisor", "admin", "citizen") else "public"


def viewer_from(user) -> Viewer:
    if user is None:
        return Viewer()
    return Viewer(user_id=user.id, role=user.role)


def ticket_of(c: Complaint) -> str:
    if c.public_ticket_number:
        return c.public_ticket_number
    year = c.created_at.year if c.created_at else 0
    return f"CL-{year}-{c.id:05d}"


def public_xy(c: Complaint) -> tuple[float, float]:
    """Map-safe coordinates (3 decimal places ~ 110 m)."""
    return round(c.longitude, 3), round(c.latitude, 3)


def parse_dt(value: Optional[str], end_of_day: bool = False) -> Optional[datetime]:
    if not value:
        return None
    try:
        if len(value) == 10:
            d = date.fromisoformat(value)
            return datetime(d.year, d.month, d.day, 23, 59, 59, 999999) if end_of_day else datetime(d.year, d.month, d.day)
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return dt.astimezone(timezone.utc).replace(tzinfo=None) if dt.tzinfo else dt
    except ValueError:
        raise HTTPException(422, f"Invalid date: {value}")


# ------------------------------------------------------------------------------------------------ lookups
@dataclass
class Lookups:
    categories: Dict[str, Category] = field(default_factory=dict)
    departments: Dict[str, str] = field(default_factory=dict)

    def category_name(self, code: Optional[str]) -> Optional[str]:
        c = self.categories.get(code or "")
        return c.name if c else code

    def subcategory_name(self, code: Optional[str], sub: Optional[str]) -> Optional[str]:
        c = self.categories.get(code or "")
        if c and sub:
            for s in (c.subcategories or []):
                if isinstance(s, dict) and s.get("code") == sub:
                    return s.get("name") or sub
        return sub


def load_lookups(db: Session) -> Lookups:
    return Lookups(
        categories={c.code: c for c in db.scalars(select(Category))},
        departments={d.code: d.name for d in db.scalars(select(Department))},
    )


# ------------------------------------------------------------------------------------------------ complaints
def _relations(db: Session, ids: List[int], viewer: Viewer) -> tuple[Dict[int, int], set[int]]:
    """supporting_count per complaint (distinct followers/evidence-adders other than the reporter) and the set of
    complaint ids the viewer owns (reported or added a submission to)."""
    support: Dict[int, set] = {i: set() for i in ids}
    mine: set[int] = set()
    if not ids:
        return {}, mine
    for cid, uid in db.execute(select(ComplaintFollower.complaint_id, ComplaintFollower.user_id)
                               .where(ComplaintFollower.complaint_id.in_(ids))):
        support[cid].add(uid)
    for cid, uid, primary in db.execute(select(ComplaintSubmission.complaint_id, ComplaintSubmission.user_id,
                                               ComplaintSubmission.is_primary)
                                        .where(ComplaintSubmission.complaint_id.in_(ids))):
        if not primary:
            support[cid].add(uid)
        if viewer.user_id and uid == viewer.user_id:
            mine.add(cid)
    return {cid: len(s) for cid, s in support.items()}, mine


def _public_summary(c: Complaint, lk: Lookups) -> str:
    if c.summary:
        return c.summary
    return f"{lk.category_name(c.category) or 'Civic'} issue reported"


def complaint_properties(c: Complaint, lk: Lookups, viewer: Viewer, supporting: int, is_mine: bool) -> Dict[str, Any]:
    """Map-safe properties. Never any reporter data, original_description or internal notes."""
    props = {
        "ticket_id": ticket_of(c),
        "category": c.category,
        "category_name": lk.category_name(c.category),
        "subcategory": c.subcategory,
        "severity": c.severity,
        "status": c.status,
        "priority_score": round(float(c.priority_score or 0.0), 1),
        "public_summary": _public_summary(c, lk),
        "department_code": c.authoritative_department_code,
        "department_name": lk.departments.get(c.authoritative_department_code or ""),
        "locality": c.locality,
        "created_at": iso(c.created_at),
        "updated_at": iso(c.updated_at),
        "resolved_at": iso(c.resolved_at),
        "supporting_count": supporting,
        "is_mine": is_mine,
        "is_demo": bool(c.is_demo),
    }
    if viewer.is_staff:
        props["requires_review"] = bool(c.requires_human_review)
    return props


def _coords_for(c: Complaint, viewer: Viewer, is_mine: bool) -> tuple[float, float]:
    if viewer.is_staff or is_mine:
        return c.longitude, c.latitude
    return public_xy(c)


def complaints_geojson(db: Session, viewer: Viewer, *, severity: Optional[str], category: Optional[str],
                       status: Optional[str], department: Optional[str], date_from: Optional[str],
                       date_to: Optional[str], mine: bool, include_resolved: bool, limit: int) -> Dict[str, Any]:
    q = select(Complaint).where(Complaint.status != STATUS_REJECTED)
    statuses = [s.strip() for s in status.split(",") if s.strip()] if status else []
    statuses = [s for s in statuses if s != STATUS_REJECTED] if statuses else []
    if status and not statuses:
        statuses = ["__none__"]
    if statuses:
        q = q.where(Complaint.status.in_(statuses))
    elif not include_resolved:
        q = q.where(Complaint.status != STATUS_RESOLVED)
    if severity:
        sevs = [s.strip() for s in severity.split(",") if s.strip() in SEVERITIES]
        q = q.where(Complaint.severity.in_(sevs or ["__none__"]))
    if category:
        q = q.where(Complaint.category.in_([s.strip() for s in category.split(",") if s.strip()]))
    if department:
        q = q.where(Complaint.authoritative_department_code.in_([s.strip() for s in department.split(",") if s.strip()]))
    df, dt = parse_dt(date_from), parse_dt(date_to, end_of_day=True)
    if df:
        q = q.where(Complaint.created_at >= df)
    if dt:
        q = q.where(Complaint.created_at <= dt)
    mine_effective = bool(mine and viewer.signed_in)
    if mine_effective:
        sub_ids = select(ComplaintSubmission.complaint_id).where(ComplaintSubmission.user_id == viewer.user_id)
        q = q.where((Complaint.created_by_user_id == viewer.user_id) | (Complaint.id.in_(sub_ids)))
    q = q.order_by(Complaint.priority_score.desc(), Complaint.id.desc()).limit(limit)
    rows = db.scalars(q).all()
    support, mine_ids = _relations(db, [c.id for c in rows], viewer)
    lk = load_lookups(db)
    features = []
    for c in rows:
        is_mine = c.id in mine_ids or (viewer.user_id is not None and c.created_by_user_id == viewer.user_id)
        lng, lat = _coords_for(c, viewer, is_mine)
        features.append({
            "type": "Feature",
            "id": ticket_of(c),
            "geometry": {"type": "Point", "coordinates": [lng, lat]},
            "properties": complaint_properties(c, lk, viewer, support.get(c.id, 0), is_mine),
        })
    return {"type": "FeatureCollection", "features": features}


def get_complaint(db: Session, ticket_id: str) -> Complaint:
    key = (ticket_id or "").strip().upper()
    c = db.scalars(select(Complaint).where(Complaint.public_ticket_number == key)).first() if key else None
    if c is None or c.status == STATUS_REJECTED:
        raise HTTPException(404, "Complaint not found")
    return c


def complaint_detail(db: Session, c: Complaint, viewer: Viewer) -> Dict[str, Any]:
    lk = load_lookups(db)
    support, mine_ids = _relations(db, [c.id], viewer)
    is_mine = c.id in mine_ids or (viewer.user_id is not None and c.created_by_user_id == viewer.user_id)
    lng, lat = _coords_for(c, viewer, is_mine)
    out = complaint_properties(c, lk, viewer, support.get(c.id, 0), is_mine)
    resolved = c.status == STATUS_RESOLVED
    ticket = ticket_of(c)
    out.update({
        "longitude": lng, "latitude": lat, "coordinates_exact": bool(viewer.is_staff or is_mine),
        "subcategory_name": lk.subcategory_name(c.category, c.subcategory),
        "original_language": c.original_language,
        "severity_reason": c.severity_reason,
        "timeline": [{"to_status": h.to_status, "note": h.note, "created_at": iso(h.created_at)}
                     for h in db.scalars(select(StatusHistory).where(
                         StatusHistory.complaint_id == c.id, StatusHistory.citizen_visible.is_(True))
                         .order_by(StatusHistory.created_at, StatusHistory.id))],
        "city_corporation_code": c.city_corporation_code if resolved else None,
        "ward_code": c.ward_code if resolved else None,
        "view_full_report_path": f"/staff/tickets/{ticket}" if viewer.is_staff else f"/app/complaints/{ticket}",
    })
    # --- images (fetched via the authenticated GET /images/{id}; anonymous viewers get none)
    imgs = db.scalars(select(ComplaintImage).where(ComplaintImage.complaint_id == c.id)
                      .order_by(ComplaintImage.id)).all()
    before = next((i.id for i in reversed(imgs) if i.kind == "before"), None)
    after = next((i.id for i in reversed(imgs) if i.kind == "after"), None)
    ev = db.scalars(select(ResolutionEvidence).where(ResolutionEvidence.complaint_id == c.id)
                    .order_by(ResolutionEvidence.id)).all()
    if before is None:
        before = next((e.image_id for e in reversed(ev) if e.kind == "before" and e.image_id), None)
    if after is None:
        after = next((e.image_id for e in reversed(ev) if e.kind == "after" and e.image_id), None)
    verified_at = None
    if resolved:
        stamps = [e.verified_at for e in ev if e.verified and e.verified_at]
        verified_at = max(stamps) if stamps else c.resolved_at
    out["images_require_login"] = not viewer.signed_in
    if not viewer.signed_in:
        out["images"] = []
    else:
        involved = viewer.is_staff or is_mine
        allowed = {"report", "before", "after"} if involved else ({"before", "after"} if resolved else set())
        out["images"] = [{"id": i.id, "kind": i.kind} for i in imgs if i.kind in allowed]
    if resolved:
        out["before_after"] = {"before_image_id": before if viewer.signed_in else None,
                               "after_image_id": after if viewer.signed_in else None,
                               "verified": bool(c.verified_by_user_id) or any(e.verified for e in ev),
                               "verified_at": iso(verified_at)}
    else:
        out["before_after"] = {"before_image_id": None, "after_image_id": None, "verified": False,
                               "verified_at": None}
    if viewer.is_staff:
        worker_name = None
        if c.assigned_worker_id:
            u = get_user_store().get_by_id(c.assigned_worker_id)
            worker_name = u.get("display_name") if u else None
        out.update({"ai_confidence": c.ai_confidence, "review_reasons": c.review_reasons or [],
                    "routing_note": c.routing_note, "sla_due_at": iso(c.sla_due_at),
                    "assigned_worker_name": worker_name})
    return out


# ------------------------------------------------------------------------------------------------ bins
def get_thresholds(db: Session) -> Dict[str, float]:
    t = dict(DEFAULT_THRESHOLDS)
    try:
        row = db.get(AppSetting, "bin_thresholds")
        if row and isinstance(row.value, dict):
            for k in t:
                if isinstance(row.value.get(k), (int, float)):
                    t[k] = float(row.value[k])
    except Exception:  # pragma: no cover - defensive
        log.warning("bin_thresholds unreadable; using defaults")
    return t


def bin_status(fill: float, t: Dict[str, float]) -> str:
    if fill >= t["overflow_risk"]:
        return "overflow_risk"
    if fill >= t["collection_recommended"]:
        return "collection_recommended"
    if fill >= t["filling_up"]:
        return "filling_up"
    return "normal"


def _predict_full_at(rows: List[BinReading]) -> Optional[datetime]:
    """Linear ESTIMATE from recent readings (oldest first), only since the last drop/collection."""
    if not rows:
        return None
    seg = [rows[-1]]
    for prev, cur in zip(reversed(rows[:-1]), reversed(rows[1:])):
        if cur.fill_pct < prev.fill_pct - 10:
            break
        seg.insert(0, prev)
    last = seg[-1]
    if last.fill_pct >= 100:
        return last.recorded_at
    if len(seg) < 2:
        return None
    span = (seg[-1].recorded_at - seg[0].recorded_at).total_seconds()
    gain = seg[-1].fill_pct - seg[0].fill_pct
    if span < 5 or gain <= 0:
        return None
    eta_s = (100.0 - last.fill_pct) / (gain / span)
    if eta_s > MAX_PREDICTION_HOURS * 3600:
        return None
    return last.recorded_at + timedelta(seconds=eta_s)


def _latest_bin_readings(db: Session, bin_ids: Optional[Iterable[int]] = None) -> Dict[int, BinReading]:
    sub = select(func.max(BinReading.id)).group_by(BinReading.bin_id)
    q = select(BinReading).where(BinReading.id.in_(sub))
    if bin_ids is not None:
        q = q.where(BinReading.bin_id.in_(list(bin_ids)))
    return {r.bin_id: r for r in db.scalars(q)}


def _last_collections(db: Session) -> Dict[int, datetime]:
    return {bid: at for bid, at in db.execute(select(CollectionEvent.bin_id, func.max(CollectionEvent.recorded_at))
                                              .group_by(CollectionEvent.bin_id))}


def _bin_item(db: Session, b: GarbageBin, reading: Optional[BinReading], last_collected: Optional[datetime],
              t: Dict[str, float]) -> Dict[str, Any]:
    fill = round(float(reading.fill_pct), 1) if reading else 0.0
    source = reading.source if reading else ("simulated" if b.is_simulated else "worker")
    pred = None
    if reading:
        recent = db.scalars(select(BinReading).where(BinReading.bin_id == b.id)
                            .order_by(BinReading.id.desc()).limit(10)).all()
        pred = _predict_full_at(list(reversed(recent)))
    return {
        "bin_id": b.id, "bin_code": b.code, "public_label": b.name,
        "longitude": b.longitude, "latitude": b.latitude,
        "fill_percentage": fill, "status": bin_status(fill, t), "data_source": source,
        "last_collected_at": iso(last_collected), "last_reading_at": iso(reading.recorded_at) if reading else None,
        "predicted_full_at": iso(pred), "route_id": b.route_id,
    }


def bin_items(db: Session, only_ids: Optional[Iterable[int]] = None) -> List[Dict[str, Any]]:
    t = get_thresholds(db)
    q = select(GarbageBin).order_by(GarbageBin.id)
    ids = list(only_ids) if only_ids is not None else None
    if ids is not None:
        q = q.where(GarbageBin.id.in_(ids))
    bins = db.scalars(q).all()
    latest = _latest_bin_readings(db, ids)
    lc = _last_collections(db)
    return [_bin_item(db, b, latest.get(b.id), lc.get(b.id), t) for b in bins]


def bins_payload(db: Session) -> Dict[str, Any]:
    items = bin_items(db)
    simulated = (not items) or any(i["data_source"] == "simulated" for i in items)
    return {"simulated": simulated, "source_label": SIMULATED_SOURCE_LABEL if simulated else "Sensor / worker readings",
            "thresholds": get_thresholds(db), "items": items}


def find_bin(db: Session, key: str) -> Optional[GarbageBin]:
    if key.isdigit():
        b = db.get(GarbageBin, int(key))
        if b:
            return b
    return db.scalars(select(GarbageBin).where(GarbageBin.code == key)).first()


def bin_detail(db: Session, b: GarbageBin) -> Dict[str, Any]:
    item = bin_items(db, [b.id])[0]
    vcodes = {v.id: v.code for v in db.scalars(select(GarbageVehicle))}
    events = db.scalars(select(CollectionEvent).where(CollectionEvent.bin_id == b.id)
                        .order_by(CollectionEvent.recorded_at.desc(), CollectionEvent.id.desc()).limit(10)).all()
    item["history"] = [{"event_type": "collected", "vehicle_code": vcodes.get(e.vehicle_id),
                        "recorded_at": iso(e.recorded_at), "data_source": e.source} for e in events]
    item["locality"] = b.locality
    return item


# ------------------------------------------------------------------------------------------------ routes
def route_length_m(waypoints: List[List[float]]) -> float:
    return sum(haversine_m(a[0], a[1], b[0], b[1]) for a, b in zip(waypoints, waypoints[1:]))


def _clean_waypoints(raw: Any) -> List[List[float]]:
    out = []
    for p in raw or []:
        if isinstance(p, (list, tuple)) and len(p) >= 2 and all(isinstance(x, (int, float)) for x in p[:2]):
            out.append([float(p[0]), float(p[1])])
    return out


def routes_geojson(db: Session) -> Dict[str, Any]:
    vehicles = db.scalars(select(GarbageVehicle)).all()
    features = []
    for r in db.scalars(select(GarbageRoute).order_by(GarbageRoute.id)):
        wp = _clean_waypoints(r.waypoints)
        if len(wp) < 2:
            continue
        features.append({
            "type": "Feature", "id": r.id,
            "geometry": {"type": "LineString", "coordinates": [[p[1], p[0]] for p in wp]},  # [lat,lng] -> [lng,lat]
            "properties": {"route_id": r.id, "route_code": r.code, "name": r.name,
                           "schedule_window": r.schedule_window, "is_simulated": bool(r.is_simulated),
                           "length_m": round(route_length_m(wp), 1),
                           "vehicle_codes": [v.code for v in vehicles if v.route_id == r.id]},
        })
    return {"type": "FeatureCollection", "features": features}


# ------------------------------------------------------------------------------------------------ vehicles
def simulator_running() -> bool:
    try:
        from app.services import garbage_service
        return bool(garbage_service.is_running())
    except Exception:
        return False


def _latest_locations(db: Session, vehicle_ids: Optional[Iterable[int]] = None) -> Dict[int, VehicleLocation]:
    sub = select(func.max(VehicleLocation.id)).group_by(VehicleLocation.vehicle_id)
    q = select(VehicleLocation).where(VehicleLocation.id.in_(sub))
    if vehicle_ids is not None:
        q = q.where(VehicleLocation.vehicle_id.in_(list(vehicle_ids)))
    return {r.vehicle_id: r for r in db.scalars(q)}


def _vehicle_item(v: GarbageVehicle, route: Optional[GarbageRoute], loc: Optional[VehicleLocation],
                  bins: List[GarbageBin], sim_running: bool, staff: bool, now: datetime) -> Dict[str, Any]:
    data_source = "simulated" if (v.is_simulated or (loc is not None and loc.is_simulated)) else "gps_device"
    age = max(0.0, (now - loc.recorded_at).total_seconds()) if loc else None
    stale = loc is None or age > STALE_AFTER_SECONDS or (data_source == "simulated" and not sim_running)
    progress = loc.route_progress_pct if loc else None
    speed = loc.speed_kmh if loc else None
    # ---- status: never pretend a stale vehicle is moving
    if loc is None or v.status == "offline":
        status = "offline"
    elif v.status == "idle":
        status = "idle"
    elif progress is not None and progress >= 100:
        status = "completed"
    elif speed is not None and speed < 1.0:
        near = any(haversine_m(loc.latitude, loc.longitude, b.latitude, b.longitude) <= COLLECT_RADIUS_M for b in bins)
        status = "collecting" if near else "idle"
    else:
        status = "moving"
    if stale and status in ("moving", "collecting"):
        status = "offline" if (data_source == "simulated" and not sim_running) or (age or 0) > OFFLINE_AFTER_SECONDS \
            else "delayed"
    item = {
        "vehicle_id": v.id, "vehicle_code": v.code, "status": status,
        "longitude": loc.longitude if loc else None, "latitude": loc.latitude if loc else None,
        "heading_degrees": round(loc.heading, 1) if loc and loc.heading is not None else None,
        "route_progress": round(progress, 1) if progress is not None else None,
        "route_id": route.id if route else None, "route_code": route.code if route else None,
        "route_name": route.name if route else None,
        "next_stop": loc.next_stop if loc else None,
        "data_source": data_source,
        "recorded_at": iso(loc.recorded_at) if loc else None,
        "stale": stale, "stale_seconds": int(age) if age is not None else None,
    }
    if staff:  # staff only: driver label, speed and ETA (ETA is a demo estimate)
        item["driver_label"] = v.driver_label
        item["speed_kmh"] = round(speed, 1) if speed is not None else None
        item["eta_minutes"] = round(loc.eta_minutes, 1) if loc and loc.eta_minutes is not None else None
        item["demo_estimate"] = True
    return item


def vehicle_items(db: Session, staff: bool, only_ids: Optional[Iterable[int]] = None,
                  include_without_location: bool = False) -> List[Dict[str, Any]]:
    ids = list(only_ids) if only_ids is not None else None
    q = select(GarbageVehicle).order_by(GarbageVehicle.id)
    if ids is not None:
        q = q.where(GarbageVehicle.id.in_(ids))
    vehicles = db.scalars(q).all()
    routes = {r.id: r for r in db.scalars(select(GarbageRoute))}
    locs = _latest_locations(db, ids)
    bins = db.scalars(select(GarbageBin)).all()
    sim, now = simulator_running(), utcnow()
    out = []
    for v in vehicles:
        loc = locs.get(v.id)
        if loc is None and not include_without_location:
            continue  # nothing to draw
        out.append(_vehicle_item(v, routes.get(v.route_id), loc, bins, sim, staff, now))
    return out


def vehicles_payload(db: Session, viewer: Viewer) -> Dict[str, Any]:
    items = vehicle_items(db, viewer.is_staff)
    simulated = (not items) or any(i["data_source"] == "simulated" for i in items)
    return {"simulated": simulated, "source_label": SIMULATED_SOURCE_LABEL if simulated else LIVE_SOURCE_LABEL,
            "items": items}


def find_vehicle(db: Session, key: str) -> Optional[GarbageVehicle]:
    if key.isdigit():
        v = db.get(GarbageVehicle, int(key))
        if v:
            return v
    return db.scalars(select(GarbageVehicle).where(GarbageVehicle.code == key)).first()


def vehicle_detail(db: Session, v: GarbageVehicle, viewer: Viewer) -> Dict[str, Any]:
    item = vehicle_items(db, viewer.is_staff, [v.id], include_without_location=True)[0]
    route = db.get(GarbageRoute, v.route_id) if v.route_id else None
    summary = None
    if route:
        wp = _clean_waypoints(route.waypoints)
        summary = {"route_id": route.id, "route_code": route.code, "name": route.name,
                   "schedule_window": route.schedule_window, "is_simulated": bool(route.is_simulated),
                   "length_m": round(route_length_m(wp), 1), "waypoint_count": len(wp),
                   "vehicle_codes": [x.code for x in db.scalars(select(GarbageVehicle)
                                                                  .where(GarbageVehicle.route_id == route.id))]}
    simulated = item["data_source"] == "simulated"
    return {**item, "current_task": v.current_task, "route": summary, "simulated": simulated,
            "source_label": SIMULATED_SOURCE_LABEL if simulated else LIVE_SOURCE_LABEL}


# ------------------------------------------------------------------------------------------------ summary / layers
def summary(db: Session, viewer: Viewer) -> Dict[str, Any]:
    active_n = db.scalar(select(func.count(Complaint.id)).where(Complaint.status.in_(ACTIVE_STATUSES))) or 0
    resolved_n = db.scalar(select(func.count(Complaint.id)).where(Complaint.status == STATUS_RESOLVED)) or 0

    def _sev(s: str) -> int:
        return db.scalar(select(func.count(Complaint.id)).where(
            Complaint.status.in_(ACTIVE_STATUSES), Complaint.severity == s)) or 0

    t = get_thresholds(db)
    latest = _latest_bin_readings(db)
    bins_total = db.scalar(select(func.count(GarbageBin.id))) or 0
    overflow = sum(1 for r in latest.values() if bin_status(r.fill_pct, t) == "overflow_risk")
    vehicles_active = db.scalar(select(func.count(GarbageVehicle.id)).where(GarbageVehicle.status == "active")) or 0
    veh_locs = _latest_locations(db)
    bin_sources = {r.source for r in latest.values()}
    vehicle_source = "gps_device" if any(not l.is_simulated for l in veh_locs.values()) else "simulated"
    bin_source = "sensor" if "sensor" in bin_sources else ("worker" if "worker" in bin_sources else "simulated")
    stamps = [x for x in (
        db.scalar(select(func.max(Complaint.updated_at))), db.scalar(select(func.max(VehicleLocation.recorded_at))),
        db.scalar(select(func.max(BinReading.recorded_at)))) if x]
    return {
        "demo_mode": bool(settings.SEED_DEMO_DATA or settings.GARBAGE_TRACKER_MODE == "simulation"),
        "data_sources": {"complaints": "civiclens_database", "vehicles": vehicle_source, "bins": bin_source},
        "counts": {"complaints_active": active_n, "complaints_resolved": resolved_n, "critical": _sev("critical"),
                   "high": _sev("high"), "vehicles_active": vehicles_active, "bins_total": bins_total,
                   "bins_overflow_risk": overflow},
        "role_view": viewer.role_view,
        "map_default": {"center": [settings.DEFAULT_MAP_LONGITUDE, settings.DEFAULT_MAP_LATITUDE],
                        "zoom": settings.DEFAULT_MAP_ZOOM, "pitch": 55, "bearing": -15},
        "simulation_label": SIMULATION_LABEL,
        "last_updated": iso(max(stamps) if stamps else utcnow()),
    }


def layers_config(db: Session) -> Dict[str, Any]:
    layers = [
        {"id": "complaints", "label": "Civic issues", "default": True, "roles": "all"},
        {"id": "resolved", "label": "Resolved issues", "default": False, "roles": "all"},
        {"id": "vehicles", "label": "Collection vehicles", "default": True, "roles": "all"},
        {"id": "routes", "label": "Collection routes", "default": True, "roles": "all"},
        {"id": "bins", "label": "Waste bins", "default": True, "roles": "all"},
        {"id": "buildings", "label": "3D buildings", "default": True, "roles": "all"},
    ]
    cats = db.scalars(select(Category).where(Category.active.is_(True)).order_by(Category.sort_order, Category.code))
    depts = db.scalars(select(Department).where(Department.active.is_(True)).order_by(Department.code))
    legend = [
        {"group": "severity", "id": "critical", "label": "Critical", "color": "#B94A48", "glyph": "!"},
        {"group": "severity", "id": "high", "label": "High", "color": "#C2603A", "glyph": None},
        {"group": "severity", "id": "medium", "label": "Medium", "color": "#2F5F8F", "glyph": None},
        {"group": "severity", "id": "low", "label": "Low", "color": "#7B8A93", "glyph": None},
        {"group": "status", "id": "resolved", "label": "Resolved (verified)", "color": "#397A56", "glyph": "check"},
        {"group": "bin", "id": "normal", "label": "Bin: normal (0-50%)", "color": "#2E6B4F", "glyph": None},
        {"group": "bin", "id": "filling_up", "label": "Bin: filling up (51-80%)", "color": "#D9A441", "glyph": None},
        {"group": "bin", "id": "collection_recommended", "label": "Bin: collection recommended (81-95%)",
         "color": "#C2603A", "glyph": None},
        {"group": "bin", "id": "overflow_risk", "label": "Bin: overflow risk (96-100%)", "color": "#B94A48",
         "glyph": None},
        {"group": "route", "id": "route", "label": "Collection route", "color": "#2F5F8F", "glyph": None},
        {"group": "vehicle", "id": "vehicle", "label": "Collection vehicle (simulated)", "color": "#2E6B4F",
         "glyph": None},
    ]
    return {
        "layers": layers,
        "filters": {
            "severities": [{"code": s, "name": SEVERITY_LABELS[s]} for s in ("critical", "high", "medium", "low")],
            "categories": [{"code": c.code, "name": c.name} for c in cats],
            "statuses": [{"code": s, "name": STATUS_LABELS.get(s, s)} for s in MAP_STATUSES],
            "departments": [{"code": d.code, "name": d.name} for d in depts],
        },
        "legend": legend,
    }


# ------------------------------------------------------------------------------------------------ live feed
@dataclass
class LiveState:
    vehicle_marks: Dict[int, int] = field(default_factory=dict)   # vehicle_id -> latest VehicleLocation.id
    bin_marks: Dict[int, int] = field(default_factory=dict)       # bin_id -> latest BinReading.id
    complaint_cursor: datetime = datetime(1970, 1, 1)             # max Complaint.updated_at already sent
    max_complaint_id: int = 0


def complaint_event_data(c: Complaint, lk: Lookups) -> Dict[str, Any]:
    """Public (3 dp) feed payload. Rejected complaints are retracted without location or text."""
    if c.status == STATUS_REJECTED:
        return {"ticket_id": ticket_of(c), "status": c.status, "severity": c.severity, "category": c.category,
                "longitude": None, "latitude": None, "public_summary": None, "updated_at": iso(c.updated_at)}
    lng, lat = public_xy(c)
    return {"ticket_id": ticket_of(c), "status": c.status, "severity": c.severity, "category": c.category,
            "longitude": lng, "latitude": lat, "public_summary": _public_summary(c, lk),
            "updated_at": iso(c.updated_at)}


def build_snapshot(db: Session) -> tuple[Dict[str, Any], LiveState]:
    state = LiveState()
    state.vehicle_marks = {vid: loc.id for vid, loc in _latest_locations(db).items()}
    state.bin_marks = {bid: r.id for bid, r in _latest_bin_readings(db).items()}
    latest_upd = db.scalar(select(func.max(Complaint.updated_at)))
    state.complaint_cursor = latest_upd or datetime(1970, 1, 1)
    state.max_complaint_id = db.scalar(select(func.max(Complaint.id))) or 0
    snap = {"type": "snapshot", "ts": iso(utcnow()),
            "demo_mode": bool(settings.SEED_DEMO_DATA or settings.GARBAGE_TRACKER_MODE == "simulation"),
            "vehicles": vehicle_items(db, staff=False), "bins": bin_items(db),
            "complaints_version": epoch_ms(latest_upd)}
    return snap, state


def poll_deltas(state: LiveState) -> List[Dict[str, Any]]:
    """One short-lived DB session per poll; returns only what changed since the previous poll."""
    events: List[Dict[str, Any]] = []
    db = SessionLocal()
    try:
        locs = _latest_locations(db)
        changed_v = [vid for vid, loc in locs.items() if state.vehicle_marks.get(vid) != loc.id]
        if changed_v:
            for item in vehicle_items(db, staff=False, only_ids=changed_v):
                events.append({"type": "vehicle.position.updated", "data": item})
            for vid in changed_v:
                state.vehicle_marks[vid] = locs[vid].id
        readings = _latest_bin_readings(db)
        changed_b = [bid for bid, r in readings.items() if state.bin_marks.get(bid) != r.id]
        if changed_b:
            for item in bin_items(db, changed_b):
                events.append({"type": "bin.fill.updated", "data": item})
            for bid in changed_b:
                state.bin_marks[bid] = readings[bid].id
        rows = db.scalars(select(Complaint).where(Complaint.updated_at > state.complaint_cursor)
                          .order_by(Complaint.updated_at, Complaint.id).limit(200)).all()
        if rows:
            lk = load_lookups(db)
            for c in rows:
                kind = "complaint.created" if c.id > state.max_complaint_id else "complaint.status.updated"
                events.append({"type": kind, "data": complaint_event_data(c, lk)})
            state.complaint_cursor = max(c.updated_at for c in rows)
            state.max_complaint_id = max(state.max_complaint_id, max(c.id for c in rows))
    finally:
        db.close()
    return events
