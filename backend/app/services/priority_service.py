"""Operational priority (separate from severity) and SLA due dates (README section 5/7).

priority = severity_component (0-60) + ageing (0-15) + public_impact (0-15) + sla (0-10), rounded to 1 dp.
SLA targets in `sla_policies` are SAMPLE values, not official municipal commitments."""
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.constants import CLOSED_STATUSES
from app.models import ComplaintFollower, ComplaintSubmission, SlaPolicy
from app.models.base import utcnow

SEVERITY_COMPONENT = {"low": 0.0, "medium": 20.0, "high": 40.0, "critical": 60.0}
CATEGORY_IMPACT = {"roads": 5.0, "water": 5.0, "electricity": 5.0, "drainage": 5.0, "waste": 3.0, "trees": 3.0,
                   "public_infrastructure": 3.0, "other": 1.0}
AGEING_HOURS_PER_POINT = 6.0
AGEING_CAP = 15.0
IMPACT_CAP = 15.0
SLA_CAP = 10.0


def _naive_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is not None and dt.tzinfo is not None:
        from datetime import timezone
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _supporting_count(db: Session, complaint) -> int:
    given = getattr(complaint, "supporting_count", None)
    if isinstance(given, int):
        return given
    cid = getattr(complaint, "id", None)
    if cid is None:
        return 0
    try:
        subs = db.scalar(select(func.count()).select_from(ComplaintSubmission)
                         .where(ComplaintSubmission.complaint_id == cid)) or 0
        followers = db.scalar(select(func.count()).select_from(ComplaintFollower)
                              .where(ComplaintFollower.complaint_id == cid)) or 0
        return max(0, int(subs) - 1) + int(followers)
    except Exception:
        return 0


def compute_priority(db: Session, complaint) -> float:
    """Higher = more urgent. A function of the complaint and the current time only; does not commit."""
    now = utcnow()
    sev = SEVERITY_COMPONENT.get(getattr(complaint, "severity", None) or "medium", 20.0)

    created = _naive_utc(getattr(complaint, "created_at", None)) or now
    end = now
    if getattr(complaint, "status", None) in CLOSED_STATUSES and getattr(complaint, "resolved_at", None):
        end = _naive_utc(complaint.resolved_at) or now
    hours = max(0.0, (end - created).total_seconds() / 3600.0)
    ageing = min(AGEING_CAP, hours / AGEING_HOURS_PER_POINT)

    impact = CATEGORY_IMPACT.get(getattr(complaint, "category", None) or "other", 2.0)
    impact = min(IMPACT_CAP, impact + min(10.0, 2.0 * _supporting_count(db, complaint)))

    sla = 0.0
    due = _naive_utc(getattr(complaint, "sla_due_at", None))
    if due is not None:
        if now >= due:
            sla = SLA_CAP
        else:
            window = (due - created).total_seconds()
            if window > 0:
                elapsed = max(0.0, min(1.0, (now - created).total_seconds() / window))
                sla = round(elapsed * (SLA_CAP - 1.0), 2)  # reaches 9 just before the deadline, 10 once overdue
    return round(sev + ageing + impact + sla, 1)


def sla_due_for(db: Session, category: str, severity: str, department_code: Optional[str] = None,
                start: Optional[datetime] = None) -> Optional[datetime]:
    """start + sample target hours from `sla_policies` (category-specific row, else the '*' default). None if no policy."""
    row = db.scalars(select(SlaPolicy).where(SlaPolicy.category == category, SlaPolicy.severity == severity)).first()
    if row is None:
        row = db.scalars(select(SlaPolicy).where(SlaPolicy.category == "*", SlaPolicy.severity == severity)).first()
    if row is None:
        return None
    return (_naive_utc(start) or utcnow()) + timedelta(hours=row.target_hours)
