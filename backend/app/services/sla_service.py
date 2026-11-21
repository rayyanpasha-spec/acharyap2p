"""SLA helpers for queue / dashboard / analytics.

IMPORTANT: SLA targets in this prototype are SAMPLE configuration (table `sla_policies`, is_sample=true) and are NOT
official municipal commitments. Everything returned from here carries `target_is_sample: True`.
"""
import logging
from datetime import datetime
from typing import Any, Dict, Iterable, Optional

from app.core.constants import ACTIVE_STATUSES
from app.models import Complaint
from app.models.base import utcnow

log = logging.getLogger("civiclens.sla")

# SAMPLE threshold: an active ticket with less than this many hours left on its (sample) SLA is "at risk".
SAMPLE_AT_RISK_HOURS = 8.0


def sla_state(c: Complaint, now: Optional[datetime] = None) -> Dict[str, Any]:
    """{state: overdue|at_risk|on_track|none, remaining_hours, overdue, target_is_sample}."""
    now = now or utcnow()
    out = {"state": "none", "remaining_hours": None, "overdue": False, "target_is_sample": True}
    if c.status not in ACTIVE_STATUSES or c.sla_due_at is None:
        return out
    remaining = (c.sla_due_at - now).total_seconds() / 3600.0
    out["remaining_hours"] = round(remaining, 1)
    if remaining < 0:
        out["state"], out["overdue"] = "overdue", True
    elif remaining <= SAMPLE_AT_RISK_HOURS:
        out["state"] = "at_risk"
    else:
        out["state"] = "on_track"
    return out


def overdue_clause(now: Optional[datetime] = None):
    now = now or utcnow()
    return (Complaint.sla_due_at.isnot(None)) & (Complaint.sla_due_at < now) & (Complaint.status.in_(ACTIVE_STATUSES))


def refresh_priority(db, complaints: Iterable[Complaint]) -> int:
    """Recompute priority_score so ageing/SLA components stay fresh; persists changes (caller commits). Returns #changed."""
    try:
        from app.services import priority_service
    except ImportError:  # pragma: no cover
        return 0
    changed = 0
    for c in complaints:
        if c.status not in ACTIVE_STATUSES:
            continue
        try:
            new = round(float(priority_service.compute_priority(db, c)), 1)
        except Exception:  # never let scoring break an ops screen
            log.exception("priority recompute failed for complaint %s", c.id)
            continue
        if abs((c.priority_score or 0.0) - new) > 0.05:
            c.priority_score = new
            changed += 1
    return changed


def recompute_priority_now(db, c: Complaint) -> None:
    """Recompute priority regardless of status (used right after an officer edit)."""
    try:
        from app.services import priority_service

        c.priority_score = round(float(priority_service.compute_priority(db, c)), 1)
    except Exception:
        log.exception("priority recompute failed for complaint %s", c.id)
