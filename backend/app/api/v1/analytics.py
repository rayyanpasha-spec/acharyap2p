"""Operations analytics. Aggregates only: no names, emails, phones or free-text complaint content.
Portable SQL (SQLite + PostgreSQL): plain GROUP BY / column selects; dates bucketed and medians computed in Python."""
from datetime import datetime, time, timedelta
from statistics import median
from typing import Dict, List

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.constants import ACTIVE_STATUSES, SEVERITIES, STATUS_DUPLICATE_LINKED, STATUS_RESOLVED
from app.core.deps import CurrentUser, require_office
from app.database import get_db
from app.models import Category, Complaint, Department
from app.models.base import utcnow
from app.services import sla_service
from app.services.scope_service import visible_filter

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _median_hours(pairs) -> object:
    hrs = [(r - c).total_seconds() / 3600.0 for c, r in pairs if c and r]
    return round(median(hrs), 1) if hrs else None


@router.get("/overview")
def overview(user: CurrentUser = Depends(require_office), db: Session = Depends(get_db)):
    scope = visible_filter(user)  # officers: own department; supervisor/admin: everything
    now = utcnow()

    cat_names = {c.code: c.name for c in db.query(Category).all()}
    by_category = [{"category": cat, "name": cat_names.get(cat, cat), "count": n}
                   for cat, n in db.query(Complaint.category, func.count(Complaint.id)).filter(scope)
                   .group_by(Complaint.category).order_by(func.count(Complaint.id).desc()).all()]

    by_severity = {s: 0 for s in SEVERITIES}
    for sev, n in db.query(Complaint.severity, func.count(Complaint.id)).filter(scope).group_by(Complaint.severity).all():
        by_severity[sev] = n

    dept_names = {d.code: d.name for d in db.query(Department).all()}
    depts: Dict[str, dict] = {}
    for dept, status, created, resolved in db.query(
            Complaint.authoritative_department_code, Complaint.status, Complaint.created_at, Complaint.resolved_at).filter(scope):
        key = dept or "unrouted"
        d = depts.setdefault(key, {"total": 0, "open": 0, "resolved": 0, "pairs": []})
        d["total"] += 1
        if status in ACTIVE_STATUSES:
            d["open"] += 1
        if status == STATUS_RESOLVED:
            d["resolved"] += 1
            d["pairs"].append((created, resolved))
    by_department = [{"department_code": k, "name": dept_names.get(k, "Unrouted"), "total": v["total"], "open": v["open"],
                      "resolved": v["resolved"], "median_resolution_hours": _median_hours(v["pairs"])}
                     for k, v in sorted(depts.items())]

    # 30 calendar days (UTC), oldest first, zero-filled
    today = now.date()
    start = today - timedelta(days=29)
    counts: Dict[str, int] = {}
    for (created,) in db.query(Complaint.created_at).filter(scope, Complaint.created_at >= datetime.combine(start, time.min)):
        if created:
            counts[created.date().isoformat()] = counts.get(created.date().isoformat(), 0) + 1
    daily = [{"date": (start + timedelta(days=i)).isoformat(),
              "count": counts.get((start + timedelta(days=i)).isoformat(), 0)} for i in range(30)]

    # SLA state of ACTIVE tickets that have a (SAMPLE) SLA target
    sla = {"overdue": 0, "at_risk": 0, "on_track": 0, "target_is_sample": True}
    for c in db.query(Complaint).filter(scope, Complaint.status.in_(ACTIVE_STATUSES), Complaint.sla_due_at.isnot(None)):
        st = sla_service.sla_state(c, now)["state"]
        if st in ("overdue", "at_risk", "on_track"):
            sla[st] += 1

    total = db.query(func.count(Complaint.id)).filter(scope).scalar() or 0
    reopened = db.query(func.count(Complaint.id)).filter(scope, Complaint.reopened_count > 0).scalar() or 0
    dups = db.query(func.count(Complaint.id)).filter(scope, Complaint.status == STATUS_DUPLICATE_LINKED).scalar() or 0

    points: List[dict] = [
        {"ticket_number": t, "latitude": round(lat, 5), "longitude": round(lng, 5), "severity": sev, "category": cat,
         "status": st}
        for t, lat, lng, sev, cat, st in db.query(
            Complaint.public_ticket_number, Complaint.latitude, Complaint.longitude, Complaint.severity,
            Complaint.category, Complaint.status)
        .filter(scope, Complaint.status.in_(ACTIVE_STATUSES))
        .order_by(Complaint.priority_score.desc(), Complaint.id.desc()).limit(500)]

    return {
        "by_category": by_category, "by_severity": by_severity, "by_department": by_department,
        "daily_volume": daily, "sla": sla,
        "reopened_rate": round(reopened / total, 4) if total else 0.0,
        "duplicate_rate": round(dups / total, 4) if total else 0.0,
        "map_points": points,
        "scope": {"role": user.role, "department_code": user.department_code if user.role == "officer" else None},
        "sla_note": "SLA targets are SAMPLE configuration, not official commitments.",
    }
