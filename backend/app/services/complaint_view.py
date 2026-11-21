"""Builds the shared `ComplaintOut` JSON shape (docs/API_CONTRACT.md section 4) for any viewer.

Privacy rules enforced here (README section 18):
* citizens never receive other people's names / emails / phones;
* a citizen who does not own a complaint gets coordinates rounded to 3 decimals, no address, no description,
  no photos and no AI image observations;
* staff get the reporter's display name only (never email / phone);
* internal comments are never part of this shape.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser
from app.core.user_store import get_user_store
from app.models import (
    Category, Comment, Complaint, ComplaintFollower, ComplaintImage, ComplaintSubmission, Department, StatusHistory,
)


# ---------------------------------------------------------------- identifiers
def ticket_number(c: Complaint) -> str:
    if c.public_ticket_number:
        return c.public_ticket_number
    year = (c.created_at.year if c.created_at else 0)
    return f"CL-{year}-{c.id:05d}"


def get_complaint_by_ticket(db: Session, ticket: str) -> Complaint:
    """Resolve a public ticket number (case-insensitive). 404 if unknown."""
    key = (ticket or "").strip().upper()
    c = db.scalars(select(Complaint).where(Complaint.public_ticket_number == key)).first() if key else None
    if c is None:
        raise HTTPException(404, "Complaint not found")
    return c


# ---------------------------------------------------------------- relationships
def is_owner(db: Session, c: Complaint, user_id: str) -> bool:
    """Reporter of the incident, or a citizen who submitted supporting evidence on it."""
    if c.created_by_user_id == user_id:
        return True
    return db.scalars(select(ComplaintSubmission.id).where(
        ComplaintSubmission.complaint_id == c.id, ComplaintSubmission.user_id == user_id).limit(1)).first() is not None


def is_following(db: Session, c: Complaint, user_id: str) -> bool:
    return db.scalars(select(ComplaintFollower.id).where(
        ComplaintFollower.complaint_id == c.id, ComplaintFollower.user_id == user_id).limit(1)).first() is not None


def followers_count(db: Session, c: Complaint) -> int:
    return db.scalar(select(func.count(ComplaintFollower.id)).where(ComplaintFollower.complaint_id == c.id)) or 0


def supporting_count(db: Session, c: Complaint) -> int:
    """Distinct citizens (other than the original reporter) who follow or added evidence to this incident."""
    ids = set(db.scalars(select(ComplaintFollower.user_id).where(ComplaintFollower.complaint_id == c.id)))
    ids |= set(db.scalars(select(ComplaintSubmission.user_id).where(
        ComplaintSubmission.complaint_id == c.id, ComplaintSubmission.is_primary.is_(False))))
    ids.discard(c.created_by_user_id)
    return len(ids)


def citizen_can_view_private(db: Session, c: Complaint, user_id: str) -> bool:
    """Owner or follower: may see the description, address and photos."""
    return is_owner(db, c, user_id) or is_following(db, c, user_id)


# ---------------------------------------------------------------- builders
def _iso(dt) -> Optional[str]:
    return dt.isoformat() if dt else None


def timeline_rows(db: Session, c: Complaint, viewer: CurrentUser) -> List[Dict[str, Any]]:
    stmt = select(StatusHistory).where(StatusHistory.complaint_id == c.id)
    if not viewer.is_staff:
        stmt = stmt.where(StatusHistory.citizen_visible.is_(True))
    rows = db.scalars(stmt.order_by(StatusHistory.created_at.asc(), StatusHistory.id.asc())).all()
    return [{"id": r.id, "from_status": r.from_status, "to_status": r.to_status, "note": r.note,
             "actor_role": r.actor_role, "created_at": _iso(r.created_at)} for r in rows]


def public_updates(db: Session, c: Complaint) -> List[Dict[str, Any]]:
    rows = db.scalars(select(Comment).where(Comment.complaint_id == c.id, Comment.visibility == "public")
                      .order_by(Comment.created_at.asc(), Comment.id.asc())).all()
    return [{"id": r.id, "author_name": r.author_name, "author_role": r.author_role, "body": r.body,
             "created_at": _iso(r.created_at)} for r in rows]


def complaint_out(db: Session, c: Complaint, viewer: CurrentUser, detail: bool = False) -> Dict[str, Any]:
    staff = viewer.is_staff
    mine = (not staff) and is_owner(db, c, viewer.id)
    following = is_following(db, c, viewer.id)
    related = staff or mine or following  # may see the private parts (description, address, photos)
    exact = staff or (c.created_by_user_id == viewer.id)  # supporters/followers get rounded coordinates

    cat = db.get(Category, c.category)
    sub_name = None
    if cat and c.subcategory:
        sub_name = next((s.get("name") for s in (cat.subcategories or []) if s.get("code") == c.subcategory), None)
    dept = db.get(Department, c.authoritative_department_code) if c.authoritative_department_code else None

    lat, lng = c.latitude, c.longitude
    if not exact:
        lat, lng = round(lat, 3), round(lng, 3)

    images: List[Dict[str, Any]] = []
    if related:
        q = select(ComplaintImage).where(ComplaintImage.complaint_id == c.id)
        if not staff:
            q = q.where(ComplaintImage.kind.in_(("report", "evidence", "before", "after")))
        for im in db.scalars(q.order_by(ComplaintImage.id.asc())):
            images.append({"id": im.id, "kind": im.kind, "created_at": _iso(im.created_at),
                           "ai_observation": im.ai_observation if staff else None})

    out: Dict[str, Any] = {
        "id": c.id,
        "ticket_number": ticket_number(c),
        "status": c.status,
        "category": c.category,
        "category_name": cat.name if cat else c.category,
        "subcategory": c.subcategory,
        "subcategory_name": sub_name,
        "summary": c.summary,
        "original_description": c.original_description if related else None,
        "original_language": c.original_language,
        "translated_description": c.translated_description if related else None,
        "submitted_via": c.submitted_via,
        "severity": c.severity,
        "severity_score": c.severity_score,
        "severity_reason": c.severity_reason,
        "severity_overridden": bool(c.severity_overridden),
        "ai_provider": c.ai_provider,
        "requires_human_review": bool(c.requires_human_review),
        "image_observations": (c.image_observations or []) if related else [],
        "department_code": c.authoritative_department_code,
        "department_name": dept.name if dept else None,
        "agency_kind": c.responsible_agency_kind,
        "location": {
            "latitude": lat, "longitude": lng,
            "accuracy_m": c.location_accuracy_m if exact else None,
            "source": c.location_source,
            "address": c.location_address if related else None,
            "locality": c.locality,
            "captured_at": _iso(c.location_captured_at) if exact else None,
            "city": c.city, "state": c.state,
            "service_area_status": c.service_area_status,
            "city_corporation_code": c.city_corporation_code,
            "division_code": c.division_code,
            "ward_code": c.ward_code,
            "boundary_dataset_version": c.boundary_dataset_version,
        },
        "created_at": _iso(c.created_at),
        "updated_at": _iso(c.updated_at),
        "resolved_at": _iso(c.resolved_at),
        "supporting_count": supporting_count(db, c),
        "followers_count": followers_count(db, c),
        "is_mine": bool(mine),
        "i_follow": bool(following),
        "reopen_requested": bool(c.reopen_requested),
        "images": images,
        "is_demo": bool(c.is_demo),
    }

    if staff:
        store = get_user_store()
        ids = [i for i in (c.created_by_user_id, c.assigned_worker_id) if i]
        users = store.get_many(ids) if ids else {}
        worker = users.get(c.assigned_worker_id) if c.assigned_worker_id else None
        reporter = users.get(c.created_by_user_id)
        out.update({
            "ai_confidence": c.ai_confidence,
            "priority_score": c.priority_score,
            "review_reasons": c.review_reasons or [],
            "routing_note": c.routing_note,
            "sla_due_at": _iso(c.sla_due_at),
            "assigned_worker": ({"id": worker["id"], "name": worker["display_name"]} if worker else None),
            "classification_confirmed": bool(c.classification_confirmed),
            "reporter": {"name": reporter["display_name"] if reporter else "Unknown"},
        })

    if detail:
        out["timeline"] = timeline_rows(db, c, viewer)
        out["public_updates"] = public_updates(db, c)
    return out
