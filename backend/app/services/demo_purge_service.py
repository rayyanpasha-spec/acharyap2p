"""Remove FICTIONAL demo data from a database (demo users, demo complaints + everything attached, simulated CleanRoute data).

* Demo users are DEACTIVATED (they can no longer sign in) rather than deleted: the user store has no delete, and it is
  reversible and safe on both SQL and MongoDB.
* Demo complaints (`is_demo=True`) and all rows that hang off them are deleted, including image / certificate files.
* Real data is never touched: only rows flagged `is_demo` (or `is_simulated` for CleanRoute) are removed.
"""
import logging
from pathlib import Path
from typing import Dict, List

from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from app.config import settings
from app.core.user_store import get_user_store
from app.models import (
    AiAnalysis, Assignment, BinReading, CivicPointsLedger, CollectionEvent, Comment, Complaint, ComplaintFollower,
    ComplaintImage, ComplaintLink, ComplaintSubmission, DuplicateCandidate, GameSession, GarbageBin, GarbageRoute,
    GarbageVehicle, Notification, ResolutionEvidence, StatusHistory, UserAchievement, VehicleLocation,
    VoiceTranscript, Certificate,
)

log = logging.getLogger("civiclens.demo_purge")

_BY_COMPLAINT = (ComplaintSubmission, ComplaintFollower, ComplaintImage, AiAnalysis, StatusHistory, Comment,
                 Assignment, ResolutionEvidence, Notification, Certificate, VoiceTranscript)
_BY_USER = (Notification, CivicPointsLedger, GameSession, UserAchievement)


def _unlink(path: Path) -> None:
    try:
        path.unlink(missing_ok=True)
    except OSError:  # best effort: a missing/locked file must never abort the purge
        pass


def purge_demo_data(db: Session, include_cleanroute: bool = True) -> Dict[str, int]:
    """Commits the database changes itself (before deactivating users). Returns counts of what was removed."""
    counts: Dict[str, int] = {}
    store = get_user_store()

    demo_users: List[dict] = [u for u in store.list(limit=100000) if u.get("is_demo")]
    demo_ids = [u["id"] for u in demo_users]

    # ---- complaints flagged demo, and everything attached to them
    cids = list(db.scalars(select(Complaint.id).where(Complaint.is_demo.is_(True))))
    if cids:
        for name in db.scalars(select(ComplaintImage.storage_name).where(ComplaintImage.complaint_id.in_(cids))):
            _unlink(Path(settings.UPLOAD_DIR) / name)
        for pdf in db.scalars(select(Certificate.pdf_path).where(Certificate.complaint_id.in_(cids))):
            if pdf:
                _unlink(Path(pdf) if Path(pdf).is_absolute() else Path(settings.CERTIFICATE_STORAGE_DIR) / Path(pdf).name)
        for model in _BY_COMPLAINT:
            db.execute(delete(model).where(model.complaint_id.in_(cids)))
        db.execute(delete(DuplicateCandidate).where(or_(DuplicateCandidate.complaint_id.in_(cids),
                                                        DuplicateCandidate.candidate_complaint_id.in_(cids))))
        db.execute(delete(ComplaintLink).where(or_(ComplaintLink.primary_complaint_id.in_(cids),
                                                   ComplaintLink.linked_complaint_id.in_(cids))))
        db.execute(delete(Complaint).where(Complaint.id.in_(cids)))
    counts["complaints"] = len(cids)

    # ---- rows owned by demo users
    if demo_ids:
        for model in _BY_USER:
            db.execute(delete(model).where(model.user_id.in_(demo_ids)))
        db.execute(delete(ComplaintFollower).where(ComplaintFollower.user_id.in_(demo_ids)))
        db.execute(delete(DuplicateCandidate).where(DuplicateCandidate.user_id.in_(demo_ids)))

    # ---- simulated CleanRoute data
    sim = {"vehicles": 0, "bins": 0, "routes": 0}
    if include_cleanroute:
        bin_ids = list(db.scalars(select(GarbageBin.id).where(GarbageBin.is_simulated.is_(True))))
        veh_ids = list(db.scalars(select(GarbageVehicle.id).where(GarbageVehicle.is_simulated.is_(True))))
        if bin_ids:
            db.execute(delete(BinReading).where(BinReading.bin_id.in_(bin_ids)))
            db.execute(delete(CollectionEvent).where(CollectionEvent.bin_id.in_(bin_ids)))
            db.execute(delete(GarbageBin).where(GarbageBin.id.in_(bin_ids)))
        if veh_ids:
            db.execute(delete(CollectionEvent).where(CollectionEvent.vehicle_id.in_(veh_ids)))
            db.execute(delete(VehicleLocation).where(VehicleLocation.vehicle_id.in_(veh_ids)))
            db.execute(delete(GarbageVehicle).where(GarbageVehicle.id.in_(veh_ids)))
        route_ids = list(db.scalars(select(GarbageRoute.id).where(GarbageRoute.is_simulated.is_(True))))
        if route_ids:
            db.execute(delete(GarbageRoute).where(GarbageRoute.id.in_(route_ids)))
        sim = {"vehicles": len(veh_ids), "bins": len(bin_ids), "routes": len(route_ids)}
    counts.update({f"cleanroute_{k}": v for k, v in sim.items()})

    # ---- finally deactivate the demo accounts themselves (done last so a failure above leaves logins intact).
    # The user store writes through its OWN connection, so commit first or SQLite reports 'database is locked'.
    db.commit()
    for u in demo_users:
        store.update(u["id"], is_active=False)
    counts["demo_users_deactivated"] = len(demo_users)
    log.info("demo data purged: %s", counts)
    return counts
