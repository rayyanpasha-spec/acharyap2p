"""Who may see which complaint (API contract section 6).

officer    -> complaints routed to the officer's own department (all departments if the officer has none)
supervisor -> everything          admin -> everything
worker     -> only complaints assigned to that worker
Anything out of scope behaves as "not found" (404) so ticket numbers do not leak across departments.
"""
from typing import Any, Dict, Optional

from fastapi import HTTPException
from sqlalchemy import false, true
from sqlalchemy.orm import Session

from app.core.constants import ROLE_ADMIN, ROLE_OFFICER, ROLE_SUPERVISOR, ROLE_WORKER
from app.models import Complaint


def visible_filter(user):
    """SQLAlchemy boolean condition limiting `Complaint` rows to what `user` may see."""
    role = getattr(user, "role", None)
    if role in (ROLE_ADMIN, ROLE_SUPERVISOR):
        return true()
    if role == ROLE_OFFICER:
        dept = getattr(user, "department_code", None)
        return (Complaint.authoritative_department_code == dept) if dept else true()
    if role == ROLE_WORKER:
        return Complaint.assigned_worker_id == user.id
    return false()


def get_scoped_complaint_or_404(db: Session, user, ticket: str) -> Complaint:
    c = (
        db.query(Complaint)
        .filter(Complaint.public_ticket_number == ticket, visible_filter(user))
        .first()
    )
    if c is None:
        raise HTTPException(404, "Complaint not found")
    return c


def user_names(ids) -> Dict[str, str]:
    """id -> display name from the user store (names only, never email/phone)."""
    from app.core.user_store import get_user_store

    ids = [i for i in set(ids) if i]
    if not ids:
        return {}
    return {uid: (u or {}).get("display_name") or "Unknown" for uid, u in get_user_store().get_many(ids).items()}


def _iso(d) -> Optional[str]:
    return d.isoformat() if d else None


def _fallback_complaint_out(db: Session, c: Complaint, viewer) -> Dict[str, Any]:
    """Minimal staff-shaped ComplaintOut used only until services/complaint_view.py (INTAKE) exists."""
    from app.models import Category, ComplaintFollower, ComplaintSubmission, Department

    cat = db.get(Category, c.category)
    sub_name = None
    if cat and c.subcategory:
        sub_name = next((s.get("name") for s in (cat.subcategories or []) if s.get("code") == c.subcategory), None)
    dept = db.get(Department, c.authoritative_department_code) if c.authoritative_department_code else None
    names = user_names([c.created_by_user_id, c.assigned_worker_id])
    support = db.query(ComplaintSubmission).filter(ComplaintSubmission.complaint_id == c.id).count()
    followers = db.query(ComplaintFollower).filter(ComplaintFollower.complaint_id == c.id).count()
    return {
        "id": c.id, "ticket_number": c.public_ticket_number, "status": c.status,
        "category": c.category, "category_name": cat.name if cat else c.category,
        "subcategory": c.subcategory, "subcategory_name": sub_name,
        "summary": c.summary, "original_description": c.original_description,
        "original_language": c.original_language, "translated_description": c.translated_description,
        "submitted_via": c.submitted_via,
        "severity": c.severity, "severity_score": c.severity_score, "severity_reason": c.severity_reason,
        "severity_overridden": c.severity_overridden, "ai_confidence": c.ai_confidence, "ai_provider": c.ai_provider,
        "requires_human_review": c.requires_human_review, "image_observations": c.image_observations or [],
        "department_code": c.authoritative_department_code, "department_name": dept.name if dept else None,
        "agency_kind": c.responsible_agency_kind,
        "location": {
            "latitude": c.latitude, "longitude": c.longitude, "accuracy_m": c.location_accuracy_m,
            "source": c.location_source, "address": c.location_address, "locality": c.locality,
            "captured_at": _iso(c.location_captured_at),
            "city": c.city, "state": c.state, "service_area_status": c.service_area_status,
            "city_corporation_code": c.city_corporation_code, "division_code": c.division_code,
            "ward_code": c.ward_code, "boundary_dataset_version": c.boundary_dataset_version,
        },
        "created_at": _iso(c.created_at), "updated_at": _iso(c.updated_at), "resolved_at": _iso(c.resolved_at),
        "supporting_count": max(support - 1, 0), "followers_count": followers,
        "is_mine": False, "i_follow": False, "reopen_requested": c.reopen_requested,
        "images": [{"id": i.id, "kind": i.kind, "created_at": _iso(i.created_at),
                    "ai_observation": i.ai_observation} for i in c.images],
        "is_demo": c.is_demo,
        "priority_score": c.priority_score, "review_reasons": c.review_reasons or [], "routing_note": c.routing_note,
        "sla_due_at": _iso(c.sla_due_at),
        "assigned_worker": ({"id": c.assigned_worker_id, "name": names.get(c.assigned_worker_id)}
                            if c.assigned_worker_id else None),
        "classification_confirmed": c.classification_confirmed,
        "reporter": {"name": names.get(c.created_by_user_id)},
    }


def serialize_complaint(db: Session, c: Complaint, viewer, detail: bool = False) -> Dict[str, Any]:
    """ComplaintOut via INTAKE's complaint_view when present, else the minimal local serializer."""
    try:
        from app.services.complaint_view import complaint_out
    except ImportError:
        return _fallback_complaint_out(db, c, viewer)
    return complaint_out(db, c, viewer, detail=detail)


def find_complaint_by_ticket(db: Session, ticket: str) -> Optional[Complaint]:
    return db.query(Complaint).filter(Complaint.public_ticket_number == ticket).first()
