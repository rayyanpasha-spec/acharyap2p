"""Civic points ledger, verified-contribution counting and recognition levels.

Rules (docs/SPECIFICATION.md section 9): points are NEVER given for merely submitting complaints. Real-world
points come only from verified outcomes (see certificate_service); game points are small and capped per day.
The ledger is append-only and de-duplicated by (user, reason, ref)."""
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import AppSetting, Complaint, ComplaintSubmission, CivicPointsLedger
from app.models.base import utcnow

IST = timezone(timedelta(hours=5, minutes=30))

DEFAULT_POINTS = {
    "verified_first_report": 10, "verified_evidence": 10, "verified_resolution": 30,
    "game_daily": 5, "game_weekly": 25, "daily_game_cap": 15,
}
DEFAULT_LEVELS = {
    "civic_observer": 1, "neighbourhood_helper": 5, "community_guardian": 15,
    "civic_champion": 30, "city_ambassador": 50,
}


def get_points_settings(db: Session) -> Dict[str, int]:
    row = db.get(AppSetting, "points")
    out = dict(DEFAULT_POINTS)
    if row and isinstance(row.value, dict):
        for k, v in row.value.items():
            if isinstance(v, (int, float)):
                out[k] = int(v)
    return out


def levels_table(db: Optional[Session] = None) -> List[Tuple[str, str, int]]:
    """[(code, title, threshold)] sorted by threshold ascending."""
    values = dict(DEFAULT_LEVELS)
    if db is not None:
        row = db.get(AppSetting, "recognition_levels")
        if row and isinstance(row.value, dict):
            values = {k: int(v) for k, v in row.value.items() if isinstance(v, (int, float))} or values
    items = [(code, code.replace("_", " ").title(), n) for code, n in values.items()]
    return sorted(items, key=lambda x: x[2])


def level_for(count: int, db: Optional[Session] = None) -> Dict[str, Any]:
    """Level for a number of verified contributions. Below the first threshold: code 'none'."""
    table = levels_table(db)
    current = None
    nxt = None
    for code, title, threshold in table:
        if count >= threshold:
            current = (code, title)
        elif nxt is None:
            nxt = (title, threshold)
    return {
        "code": current[0] if current else "none",
        "title": current[1] if current else "Getting started",
        "verified_contributions": int(count),
        "next_title": nxt[0] if nxt else None,
        "next_threshold": nxt[1] if nxt else None,
    }


# ---------------------------------------------------------------- time helpers (IST days)
def ist_date(dt: Optional[datetime] = None) -> date:
    """Calendar date in IST for a naive-UTC datetime (default: now)."""
    dt = dt or utcnow()
    return (dt.replace(tzinfo=timezone.utc).astimezone(IST)).date()


def ist_day_bounds_utc(d: Optional[date] = None) -> Tuple[datetime, datetime]:
    d = d or ist_date()
    start_ist = datetime(d.year, d.month, d.day, tzinfo=IST)
    start = start_ist.astimezone(timezone.utc).replace(tzinfo=None)
    return start, start + timedelta(days=1)


# ---------------------------------------------------------------- ledger
def award(db: Session, user_id: str, reason_code: str, points: int, ref_type: Optional[str] = None,
          ref_id: Optional[Any] = None, note: Optional[str] = None) -> Optional[CivicPointsLedger]:
    """Append a ledger row (caller commits). Returns None when a row for the same (user, reason, ref) already exists
    or points <= 0, so awarding is idempotent."""
    if not user_id or points <= 0:
        return None
    ref = None if ref_id is None else str(ref_id)
    stmt = select(CivicPointsLedger.id).where(
        CivicPointsLedger.user_id == user_id, CivicPointsLedger.reason_code == reason_code,
        CivicPointsLedger.ref_type.is_(ref_type) if ref_type is None else CivicPointsLedger.ref_type == ref_type,
        CivicPointsLedger.ref_id.is_(None) if ref is None else CivicPointsLedger.ref_id == ref,
    )
    if db.scalars(stmt.limit(1)).first() is not None:
        return None
    row = CivicPointsLedger(user_id=user_id, points=int(points), reason_code=reason_code,
                            ref_type=ref_type, ref_id=ref, note=(note or None) and note[:200])
    db.add(row)
    db.flush()
    return row


def total_points(db: Session, user_id: str) -> int:
    return int(db.scalar(select(func.coalesce(func.sum(CivicPointsLedger.points), 0))
                         .where(CivicPointsLedger.user_id == user_id)) or 0)


def game_points_today(db: Session, user_id: str) -> int:
    start, end = ist_day_bounds_utc()
    return int(db.scalar(select(func.coalesce(func.sum(CivicPointsLedger.points), 0)).where(
        CivicPointsLedger.user_id == user_id, CivicPointsLedger.reason_code == "game_daily",
        CivicPointsLedger.created_at >= start, CivicPointsLedger.created_at < end)) or 0)


def daily_game_cap_remaining(db: Session, user_id: str) -> int:
    cap = get_points_settings(db).get("daily_game_cap", 15)
    return max(0, cap - game_points_today(db, user_id))


def history(db: Session, user_id: str, limit: int = 20) -> List[CivicPointsLedger]:
    return list(db.scalars(select(CivicPointsLedger).where(CivicPointsLedger.user_id == user_id)
                           .order_by(CivicPointsLedger.created_at.desc(), CivicPointsLedger.id.desc()).limit(limit)))


# ---------------------------------------------------------------- verified contributions
def verified_complaints(db: Session, user_id: str) -> List[Complaint]:
    """Resolved AND verified complaints the user reported or supplied evidence for."""
    sub_ids = select(ComplaintSubmission.complaint_id).where(ComplaintSubmission.user_id == user_id)
    stmt = select(Complaint).where(
        Complaint.status == "resolved", Complaint.verified_by_user_id.isnot(None),
        or_(Complaint.created_by_user_id == user_id, Complaint.id.in_(sub_ids)),
    ).order_by(Complaint.resolved_at.asc(), Complaint.id.asc())
    return list(db.scalars(stmt))


def verified_contribution_count(db: Session, user_id: str) -> int:
    return len(verified_complaints(db, user_id))
