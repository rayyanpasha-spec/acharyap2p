"""Operations: municipal command centre endpoints (API contract section 6). Router prefix is empty on purpose."""
import logging
from datetime import datetime, timedelta
from statistics import median
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.core.constants import (
    ACTIVE_STATUSES, CLOSED_STATUSES, ROLE_ADMIN, ROLE_OFFICER, ROLE_SUPERVISOR, ROLE_WORKER, SEVERITIES,
    STATUS_AI_REVIEW, STATUS_ASSIGNED, STATUS_AWAITING_VERIFICATION, STATUS_DUPLICATE_LINKED, STATUS_IN_PROGRESS,
    STATUS_REOPENED, STATUS_RESOLVED, STATUS_SUBMITTED, STATUS_VERIFIED, STATUSES, VIS_INTERNAL, VIS_PUBLIC,
)
from app.core.deps import CurrentUser, require_office, require_roles, require_staff, require_supervisor
from app.core.user_store import get_user_store
from app.database import get_db
from app.models import (
    AiAnalysis, Assignment, Category, Comment, Complaint, ComplaintFollower, ComplaintLink, ComplaintSubmission,
    Department, DuplicateCandidate, ResolutionEvidence, StatusHistory,
)
from app.models.base import utcnow
from app.services import audit_service, notification_service, sla_service, status_service
from app.services.scope_service import (
    find_complaint_by_ticket, get_scoped_complaint_or_404, serialize_complaint, user_names, visible_filter,
)
from app.services.upload_service import save_image_upload

log = logging.getLogger("civiclens.officer")
router = APIRouter(tags=["officer"])

require_classifier = require_roles(ROLE_OFFICER, ROLE_SUPERVISOR, ROLE_ADMIN)
EVIDENCE_ROLES = require_roles(ROLE_WORKER, ROLE_OFFICER, ROLE_SUPERVISOR, ROLE_ADMIN)
# Statuses from which an assignment moves the ticket to "assigned" (contract: submitted|ai_review|verified; reopened too).
ASSIGNABLE_FROM = {STATUS_SUBMITTED, STATUS_AI_REVIEW, STATUS_VERIFIED, STATUS_REOPENED}


# ----------------------------------------------------------------------------- helpers
def _iso(d: Optional[datetime]) -> Optional[str]:
    return d.isoformat() if d else None


def _snapshot(c: Complaint) -> Dict[str, Any]:
    return {
        "category": c.category, "subcategory": c.subcategory, "severity": c.severity,
        "department_code": c.authoritative_department_code, "classification_confirmed": c.classification_confirmed,
        "severity_overridden": c.severity_overridden, "status": c.status, "assigned_worker_id": c.assigned_worker_id,
    }


def _staff_item(db: Session, c: Complaint, user: CurrentUser) -> Dict[str, Any]:
    out = serialize_complaint(db, c, user, detail=False)
    out["sla"] = sla_service.sla_state(c)
    return out


def _parse_dt(value: Optional[str], name: str, end_of_day: bool = False) -> Optional[datetime]:
    if not value:
        return None
    try:
        d = datetime.fromisoformat(value.strip())
    except ValueError:
        raise HTTPException(422, f"{name} must be an ISO date (YYYY-MM-DD)")
    if d.tzinfo is not None:
        d = d.replace(tzinfo=None)
    if end_of_day and len(value.strip()) <= 10:
        d = d + timedelta(days=1) - timedelta(microseconds=1)
    return d


def _csv(value: Optional[str]) -> List[str]:
    return [v.strip() for v in (value or "").split(",") if v.strip()]


def _can_flags(user: CurrentUser, c: Complaint) -> Dict[str, bool]:
    role = user.role
    active = c.status in ACTIVE_STATUSES
    return {
        "classify": role in (ROLE_OFFICER, ROLE_SUPERVISOR, ROLE_ADMIN) and active,
        "assign": role in (ROLE_OFFICER, ROLE_SUPERVISOR, ROLE_ADMIN) and active,
        "status": bool(status_service.allowed_transitions(c, user)),
        "note": True,
        "verify": role in (ROLE_SUPERVISOR, ROLE_ADMIN) and c.status == STATUS_AWAITING_VERIFICATION,
        "reopen_decision": role in (ROLE_SUPERVISOR, ROLE_ADMIN) and bool(c.reopen_requested) and c.status == STATUS_RESOLVED,
    }


# ----------------------------------------------------------------------------- queue
@router.get("/officer/queue")
def queue(
    severity: Optional[str] = None, status: Optional[str] = None, category: Optional[str] = None,
    subcategory: Optional[str] = None, department: Optional[str] = None, assigned: Optional[str] = None,
    review: Optional[bool] = None, overdue: Optional[bool] = None, q: Optional[str] = None,
    date_from: Optional[str] = None, date_to: Optional[str] = None,
    min_confidence: Optional[float] = Query(None, ge=0, le=1), max_confidence: Optional[float] = Query(None, ge=0, le=1),
    zone: Optional[str] = None, corporation: Optional[str] = None, include_closed: bool = False,
    page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
    user: CurrentUser = Depends(require_staff), db: Session = Depends(get_db),
):
    """Prioritised work queue. Sort: priority desc, SLA due asc (nulls last), created asc.
    Choice: when no `status` filter is given, closed tickets (resolved/rejected/duplicate_linked) are hidden unless
    `include_closed=true`, so the queue shows work still to do."""
    conds = [visible_filter(user)]
    if severity:
        conds.append(Complaint.severity.in_(_csv(severity)))
    statuses = _csv(status)
    if statuses:
        conds.append(Complaint.status.in_(statuses))
    elif not include_closed:
        conds.append(Complaint.status.in_(ACTIVE_STATUSES))
    if category:
        conds.append(Complaint.category.in_(_csv(category)))
    if subcategory:
        conds.append(Complaint.subcategory.in_(_csv(subcategory)))
    if department:
        conds.append(Complaint.authoritative_department_code == department)
    if assigned == "me":
        conds.append(Complaint.assigned_worker_id == user.id)
    elif assigned == "unassigned":
        conds.append(Complaint.assigned_worker_id.is_(None))
    elif assigned not in (None, "", "any"):
        raise HTTPException(422, "assigned must be me, unassigned or any")
    if review:
        conds.append(Complaint.requires_human_review.is_(True))
    if overdue:
        conds.append(sla_service.overdue_clause())
    if q and q.strip():
        like = f"%{q.strip()}%"
        conds.append(or_(Complaint.public_ticket_number.ilike(like), Complaint.summary.ilike(like),
                         Complaint.original_description.ilike(like), Complaint.locality.ilike(like),
                         Complaint.location_address.ilike(like)))
    d_from, d_to = _parse_dt(date_from, "date_from"), _parse_dt(date_to, "date_to", end_of_day=True)
    if d_from:
        conds.append(Complaint.created_at >= d_from)
    if d_to:
        conds.append(Complaint.created_at <= d_to)
    if min_confidence is not None:
        conds.append(Complaint.ai_confidence >= min_confidence)
    if max_confidence is not None:
        conds.append(Complaint.ai_confidence <= max_confidence)
    if zone:
        conds.append(Complaint.division_code == zone)
    if corporation:
        conds.append(Complaint.city_corporation_code == corporation)

    where = and_(*conds)
    total = db.query(func.count(Complaint.id)).filter(where).scalar() or 0
    rows = (
        db.query(Complaint).filter(where)
        .order_by(Complaint.priority_score.desc(), Complaint.sla_due_at.is_(None), Complaint.sla_due_at.asc(),
                  Complaint.created_at.asc(), Complaint.id.asc())
        .offset((page - 1) * page_size).limit(page_size).all()
    )
    if sla_service.refresh_priority(db, rows):
        db.commit()
    return {"items": [_staff_item(db, c, user) for c in rows], "total": total, "page": page, "page_size": page_size}


# ----------------------------------------------------------------------------- dashboard
@router.get("/officer/dashboard")
def dashboard(user: CurrentUser = Depends(require_staff), db: Session = Depends(get_db)):
    scope = visible_filter(user)
    base = db.query(Complaint).filter(scope)

    def count(*extra) -> int:
        return base.filter(*extra).count() if extra else base.count()

    active = Complaint.status.in_(ACTIVE_STATUSES)
    totals = {
        "total": count(),
        "critical": count(Complaint.severity == "critical", active),
        "high": count(Complaint.severity == "high", active),
        "unassigned": count(Complaint.assigned_worker_id.is_(None), active),
        "in_progress": count(Complaint.status == STATUS_IN_PROGRESS),
        "awaiting_verification": count(Complaint.status == STATUS_AWAITING_VERIFICATION),
        "resolved": count(Complaint.status == STATUS_RESOLVED),
        "overdue": count(sla_service.overdue_clause()),
        "needs_review": count(Complaint.requires_human_review.is_(True), Complaint.classification_confirmed.is_(False), active),
        "reopen_requests": count(Complaint.reopen_requested.is_(True)),
    }
    by_status = {s: 0 for s in STATUSES}
    for st, n in db.query(Complaint.status, func.count(Complaint.id)).filter(scope).group_by(Complaint.status).all():
        by_status[st] = n
    res = db.query(Complaint.created_at, Complaint.resolved_at).filter(
        scope, Complaint.status == STATUS_RESOLVED, Complaint.resolved_at.isnot(None)).all()
    hours = [(r - c).total_seconds() / 3600.0 for c, r in res if c and r]
    dept_names = {d.code: d.name for d in db.query(Department).all()}
    per_dept: Dict[str, Dict[str, int]] = {}
    for dept, st, n in (db.query(Complaint.authoritative_department_code, Complaint.status, func.count(Complaint.id))
                        .filter(scope).group_by(Complaint.authoritative_department_code, Complaint.status).all()):
        key = dept or "unrouted"
        d = per_dept.setdefault(key, {"total": 0, "resolved": 0})
        d["total"] += n
        if st == STATUS_RESOLVED:
            d["resolved"] += n
    rates = [{"department_code": k, "department_name": dept_names.get(k, "Unrouted"), "total": v["total"],
              "resolved": v["resolved"], "rate": round(v["resolved"] / v["total"], 3) if v["total"] else 0.0}
             for k, v in sorted(per_dept.items())]
    top = (base.filter(active).order_by(Complaint.priority_score.desc(), Complaint.sla_due_at.is_(None),
                                        Complaint.sla_due_at.asc(), Complaint.created_at.asc()).limit(5).all())
    if sla_service.refresh_priority(db, top):
        db.commit()
    return {
        "scope": {"role": user.role, "department_code": user.department_code if user.role == ROLE_OFFICER else None},
        "totals": totals,
        "median_resolution_hours": round(median(hours), 1) if hours else None,
        "by_status": by_status,
        "resolution_rate_by_department": rates,
        "top_priority": [_staff_item(db, c, user) for c in top],
        "sla_note": "SLA targets are SAMPLE configuration, not official commitments.",
    }


# ----------------------------------------------------------------------------- workers
@router.get("/officer/workers")
def workers(department: Optional[str] = None, user: CurrentUser = Depends(require_office), db: Session = Depends(get_db)):
    dept = department or (user.department_code if user.role == ROLE_OFFICER else None)
    people = [u for u in get_user_store().list(role=ROLE_WORKER, limit=500)
              if u.get("is_active", True) and (not dept or u.get("department_code") == dept)]
    open_by = dict(
        db.query(Complaint.assigned_worker_id, func.count(Complaint.id))
        .filter(Complaint.assigned_worker_id.isnot(None), Complaint.status.in_(ACTIVE_STATUSES))
        .group_by(Complaint.assigned_worker_id).all())
    return [{"id": u["id"], "name": u["display_name"], "department_code": u.get("department_code"),
             "open_tasks": int(open_by.get(u["id"], 0))} for u in people]


# ----------------------------------------------------------------------------- detail
@router.get("/officer/complaints/{ticket_id}")
def complaint_detail(ticket_id: str, user: CurrentUser = Depends(require_staff), db: Session = Depends(get_db)):
    c = get_scoped_complaint_or_404(db, user, ticket_id)
    out = serialize_complaint(db, c, user, detail=True)
    out["sla"] = sla_service.sla_state(c)

    subs = db.query(ComplaintSubmission).filter(ComplaintSubmission.complaint_id == c.id).order_by(ComplaintSubmission.id).all()
    comments = db.query(Comment).filter(Comment.complaint_id == c.id).order_by(Comment.id).all()
    hist = db.query(StatusHistory).filter(StatusHistory.complaint_id == c.id).order_by(StatusHistory.id).all()
    dups = db.query(DuplicateCandidate).filter(DuplicateCandidate.complaint_id == c.id).order_by(DuplicateCandidate.id).all()
    evidence = db.query(ResolutionEvidence).filter(ResolutionEvidence.complaint_id == c.id).order_by(ResolutionEvidence.id).all()
    assigns = db.query(Assignment).filter(Assignment.complaint_id == c.id).order_by(Assignment.id).all()
    ai = db.query(AiAnalysis).filter(AiAnalysis.complaint_id == c.id).order_by(AiAnalysis.id.desc()).first()

    names = user_names([s.user_id for s in subs] + [h.actor_user_id for h in hist]
                       + [a.worker_user_id for a in assigns] + [a.assigned_by_user_id for a in assigns])
    cand_ids = [d.candidate_complaint_id for d in dups]
    link_rows = db.query(ComplaintLink).filter(
        or_(ComplaintLink.primary_complaint_id == c.id, ComplaintLink.linked_complaint_id == c.id)).all()
    other_ids = set(cand_ids) | {r.primary_complaint_id for r in link_rows} | {r.linked_complaint_id for r in link_rows}
    tickets = {x.id: x.public_ticket_number for x in db.query(Complaint).filter(Complaint.id.in_(other_ids)).all()} if other_ids else {}

    out.update({
        "submissions": [{"id": s.id, "description": s.description, "language": s.language, "via": s.via,
                         "is_primary": s.is_primary, "duplicate_choice": s.duplicate_choice,
                         "created_at": _iso(s.created_at), "reporter_name": names.get(s.user_id)} for s in subs],
        "comments": [{"id": m.id, "author_name": m.author_name, "author_role": m.author_role, "body": m.body,
                      "visibility": m.visibility, "created_at": _iso(m.created_at)} for m in comments],
        "timeline": [{"id": h.id, "from_status": h.from_status, "to_status": h.to_status, "note": h.note,
                      "actor_role": h.actor_role, "actor_name": names.get(h.actor_user_id),
                      "citizen_visible": h.citizen_visible, "created_at": _iso(h.created_at)} for h in hist],
        "duplicates": [{"candidate_ticket": tickets.get(d.candidate_complaint_id), "distance_m": d.distance_m,
                        "similarity": d.similarity, "same_reporter": d.same_reporter, "decision": d.decision} for d in dups],
        # direction "primary": the listed ticket is the primary of THIS (duplicate) ticket;
        # direction "duplicate": the listed ticket was linked into THIS (primary) ticket.
        "links": [{"ticket_number": tickets.get(r.primary_complaint_id if r.linked_complaint_id == c.id else r.linked_complaint_id),
                   "direction": "primary" if r.linked_complaint_id == c.id else "duplicate"} for r in link_rows],
        "resolution_evidence": [{"id": e.id, "kind": e.kind, "image_id": e.image_id, "notes": e.notes,
                                 "verified": e.verified, "created_at": _iso(e.created_at)} for e in evidence],
        "assignments": [{"worker_name": names.get(a.worker_user_id), "assigned_by": names.get(a.assigned_by_user_id),
                         "note": a.note, "created_at": _iso(a.created_at), "active": a.active,
                         "department_code": a.department_code} for a in assigns],
        "ai_analysis": ({"provider": ai.provider, "model": ai.model, "created_at": _iso(ai.created_at), "result": ai.result}
                        if ai else None),
        "allowed_transitions": status_service.allowed_transitions(c, user),
        "can": _can_flags(user, c),
    })
    return out


# ----------------------------------------------------------------------------- classification
class ClassificationIn(BaseModel):
    category: Optional[str] = None
    subcategory: Optional[str] = None
    severity: Optional[str] = None
    department_code: Optional[str] = None
    reason: str = Field(min_length=5, max_length=1000)
    confirm: bool = False


@router.patch("/complaints/{ticket_id}/classification")
def update_classification(ticket_id: str, body: ClassificationIn, user: CurrentUser = Depends(require_classifier),
                          db: Session = Depends(get_db)):
    c = get_scoped_complaint_or_404(db, user, ticket_id)
    if c.status not in ACTIVE_STATUSES:
        raise HTTPException(409, "A closed ticket cannot be reclassified")
    reason = body.reason.strip()
    if len(reason) < 5:
        raise HTTPException(422, "A reason of at least 5 characters is required")
    if not any([body.category, body.subcategory, body.severity, body.department_code, body.confirm]):
        raise HTTPException(422, "Nothing to change: give category, subcategory, severity, department_code or confirm")
    before = _snapshot(c)

    cat_code = body.category or c.category
    cat = db.get(Category, cat_code)
    if cat is None:
        raise HTTPException(422, f"Unknown category '{cat_code}'")
    if body.category and body.category != c.category:
        c.category = body.category
        c.subcategory = None  # old subcategory belongs to the old category unless a new one is given
    if body.subcategory is not None:
        if body.subcategory not in {s.get("code") for s in (cat.subcategories or [])}:
            raise HTTPException(422, f"Unknown subcategory '{body.subcategory}' for category '{cat_code}'")
        c.subcategory = body.subcategory
    if body.severity:
        if body.severity not in SEVERITIES:
            raise HTTPException(422, f"severity must be one of {', '.join(SEVERITIES)}")
        if body.severity != c.severity:
            c.severity = body.severity
            c.severity_overridden = True  # score stays as the AI computed it; label is the officer's decision
    routing_changed = False
    if body.department_code:
        dept = db.get(Department, body.department_code)
        if dept is None:
            raise HTTPException(422, f"Unknown department '{body.department_code}'")
        if dept.code != c.authoritative_department_code:
            routing_changed = True
        c.authoritative_department_code = dept.code
        c.responsible_agency_kind = dept.agency_kind
    if body.confirm:
        c.classification_confirmed = True
        c.requires_human_review = False
    sla_service.recompute_priority_now(db, c)

    after = _snapshot(c)
    changed = {k: v for k, v in after.items() if before.get(k) != v}
    action = "classification.override" if "severity" in changed else "classification.update"
    audit_service.log(db, user, action, "complaint", c.public_ticket_number, before=before, after=after, reason=reason)

    moved_to_verified = body.confirm and c.status in (STATUS_SUBMITTED, STATUS_AI_REVIEW)
    if moved_to_verified:
        status_service.change_status(db, c, STATUS_VERIFIED, user, f"Classification confirmed by officer: {reason}",
                                     True, via="classification", audit_action="status.change",
                                     notify_title=f"{c.public_ticket_number}: an officer verified your report",
                                     notify_body=f"An officer verified report {c.public_ticket_number}.")
    else:
        db.add(StatusHistory(complaint_id=c.id, from_status=c.status, to_status=c.status, actor_user_id=user.id,
                             actor_role=user.role, citizen_visible=False,
                             note=f"Classification updated ({', '.join(sorted(changed)) or 'confirmed'}): {reason}"))
        if ("category" in changed or "department_code" in changed) and not moved_to_verified:
            status_service.notify_citizens(
                db, c, "classification_update", f"{c.public_ticket_number}: an officer reclassified your report",
                f"An officer reviewed report {c.public_ticket_number} and updated its category or department.",
                exclude=[user.id])
    db.commit()
    return _staff_item(db, c, user)


# ----------------------------------------------------------------------------- assignment
class AssignmentIn(BaseModel):
    department_code: Optional[str] = None
    worker_id: Optional[str] = None
    note: Optional[str] = Field(None, max_length=1000)


@router.patch("/complaints/{ticket_id}/assignment")
def update_assignment(ticket_id: str, body: AssignmentIn, user: CurrentUser = Depends(require_classifier),
                      db: Session = Depends(get_db)):
    c = get_scoped_complaint_or_404(db, user, ticket_id)
    if c.status not in ACTIVE_STATUSES:
        raise HTTPException(409, "A closed ticket cannot be reassigned")
    if not body.department_code and not body.worker_id:
        raise HTTPException(422, "Give a department_code and/or a worker_id")
    before = _snapshot(c)
    dept = None
    if body.department_code:
        dept = db.get(Department, body.department_code)
        if dept is None:
            raise HTTPException(422, f"Unknown department '{body.department_code}'")
    worker = None
    if body.worker_id:
        worker = get_user_store().get_by_id(body.worker_id)
        if not worker or worker.get("role") != ROLE_WORKER or not worker.get("is_active", True):
            raise HTTPException(422, "worker_id must be an active user with the worker role")
    if dept:
        c.authoritative_department_code = dept.code
        c.responsible_agency_kind = dept.agency_kind
    if worker:
        db.query(Assignment).filter(Assignment.complaint_id == c.id, Assignment.active.is_(True)).update({"active": False})
        db.add(Assignment(complaint_id=c.id, worker_user_id=worker["id"], department_code=c.authoritative_department_code,
                          assigned_by_user_id=user.id, note=body.note, active=True))
        c.assigned_worker_id = worker["id"]
    elif dept:
        db.add(Assignment(complaint_id=c.id, worker_user_id=None, department_code=dept.code,
                          assigned_by_user_id=user.id, note=body.note, active=True))
    if worker and c.status in ASSIGNABLE_FROM:
        status_service.change_status(db, c, STATUS_ASSIGNED, user, body.note or "A field team has been assigned", True,
                                     via="assignment",
                                     notify_title=f"{c.public_ticket_number}: a field team has been assigned",
                                     notify_body=f"A field team has been assigned to report {c.public_ticket_number}.")
    elif dept and not worker and before["department_code"] != c.authoritative_department_code:
        status_service.notify_citizens(
            db, c, "assignment", f"{c.public_ticket_number}: routed to {dept.name}",
            f"Report {c.public_ticket_number} was routed to {dept.name}.", exclude=[user.id])
    if worker:
        notification_service.notify(db, worker["id"], "assignment", f"New task {c.public_ticket_number}",
                                    f"You were assigned ticket {c.public_ticket_number}.", complaint_id=c.id,
                                    ticket_number=c.public_ticket_number)
    audit_service.log(db, user, "assignment.update", "complaint", c.public_ticket_number, before=before,
                      after=_snapshot(c), reason=body.note)
    sla_service.recompute_priority_now(db, c)
    db.commit()
    return _staff_item(db, c, user)


# ----------------------------------------------------------------------------- status
class StatusIn(BaseModel):
    status: str
    note: Optional[str] = Field(None, max_length=2000)
    citizen_visible: bool = True


@router.patch("/complaints/{ticket_id}/status")
def update_status(ticket_id: str, body: StatusIn, user: CurrentUser = Depends(require_staff), db: Session = Depends(get_db)):
    c = get_scoped_complaint_or_404(db, user, ticket_id)
    status_service.change_status(db, c, body.status, user, body.note, body.citizen_visible)
    sla_service.recompute_priority_now(db, c)
    db.commit()
    return _staff_item(db, c, user)


# ----------------------------------------------------------------------------- notes
class NoteIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    visibility: str = Field(VIS_INTERNAL, pattern="^(public|internal)$")


@router.post("/complaints/{ticket_id}/notes", status_code=201)
def add_note(ticket_id: str, body: NoteIn, user: CurrentUser = Depends(require_staff), db: Session = Depends(get_db)):
    c = get_scoped_complaint_or_404(db, user, ticket_id)
    text = body.body.strip()
    if not text:
        raise HTTPException(422, "Note cannot be empty")
    m = Comment(complaint_id=c.id, author_user_id=user.id, author_role=user.role, author_name=user.display_name,
                body=text, visibility=body.visibility)
    db.add(m)
    audit_service.log(db, user, "note.add", "complaint", c.public_ticket_number,
                      after={"visibility": body.visibility, "length": len(text)})
    if body.visibility == VIS_PUBLIC:
        status_service.notify_citizens(db, c, "public_update", f"New update on {c.public_ticket_number}", text[:300],
                                       exclude=[user.id])
    db.commit()
    return {"id": m.id, "author_name": m.author_name, "author_role": m.author_role, "body": m.body,
            "visibility": m.visibility, "created_at": _iso(m.created_at)}


# ----------------------------------------------------------------------------- resolution evidence
@router.post("/complaints/{ticket_id}/resolution-evidence", status_code=201)
async def add_resolution_evidence(
    ticket_id: str, kind: str = Form(...), notes: Optional[str] = Form(None), image: Optional[UploadFile] = File(None),
    user: CurrentUser = Depends(EVIDENCE_ROLES), db: Session = Depends(get_db),
):
    c = get_scoped_complaint_or_404(db, user, ticket_id)
    if kind not in ("before", "after"):
        raise HTTPException(422, "kind must be 'before' or 'after'")
    if c.status not in ACTIVE_STATUSES:
        raise HTTPException(409, "Evidence cannot be added to a closed ticket")
    has_image = bool(image is not None and getattr(image, "filename", ""))
    if not has_image and not (notes or "").strip():
        raise HTTPException(422, "Provide an image and/or notes")
    img = None
    if has_image:
        img = await save_image_upload(db, complaint_id=c.id, user_id=user.id, kind=kind, upload=image)
    ev = ResolutionEvidence(complaint_id=c.id, uploaded_by_user_id=user.id, kind=kind, image_id=img.id if img else None,
                            notes=(notes or "").strip() or None)
    db.add(ev)
    audit_service.log(db, user, "resolution.evidence", "complaint", c.public_ticket_number,
                      after={"kind": kind, "image_id": img.id if img else None})
    if kind == "after":
        status_service.notify_citizens(db, c, "evidence_uploaded", f"New evidence on {c.public_ticket_number}",
                                       f"New 'after' evidence was uploaded for report {c.public_ticket_number}.",
                                       exclude=[user.id])
    db.commit()
    return {"id": ev.id, "kind": ev.kind, "image_id": ev.image_id, "notes": ev.notes, "verified": ev.verified,
            "created_at": _iso(ev.created_at)}


# ----------------------------------------------------------------------------- verify resolution
class VerifyIn(BaseModel):
    note: Optional[str] = Field(None, max_length=2000)


@router.post("/complaints/{ticket_id}/verify-resolution")
def verify_resolution(ticket_id: str, body: Optional[VerifyIn] = None, user: CurrentUser = Depends(require_supervisor),
                      db: Session = Depends(get_db)):
    note = ((body.note if body else None) or "").strip() or None
    c = get_scoped_complaint_or_404(db, user, ticket_id)
    if c.status != STATUS_AWAITING_VERIFICATION:
        raise HTTPException(409, "Only a ticket that is awaiting verification can be verified")
    if not (status_service.has_after_evidence(db, c) or note):
        raise HTTPException(422, "Attach 'after' evidence or give a note before verifying")
    now = utcnow()
    c.resolved_at = now
    c.verified_by_user_id = user.id
    status_service.change_status(
        db, c, STATUS_RESOLVED, user, note or "Resolution verified by supervisor", True, via="verify",
        audit_action="resolution.verify",
        notify_title=f"{c.public_ticket_number}: your report was resolved",
        notify_body=f"Your report {c.public_ticket_number} was resolved. Thank you for helping improve your neighbourhood.")
    for ev in db.query(ResolutionEvidence).filter(ResolutionEvidence.complaint_id == c.id).all():
        ev.verified, ev.verified_by_user_id, ev.verified_at = True, user.id, now
    c.reopen_requested = False
    db.flush()
    # Certificate + points are issued ONLY through certificate_service (it awards points itself). Must be safe if None.
    from app.services import certificate_service

    try:
        with db.begin_nested():
            certificate_service.issue_for_complaint(db, c, user)
    except Exception:  # a recognition problem must never undo a verified resolution
        log.exception("certificate issuing failed for %s", c.public_ticket_number)
    db.commit()
    return _staff_item(db, c, user)


# ----------------------------------------------------------------------------- reopen decision
class ReopenDecisionIn(BaseModel):
    approve: bool
    note: Optional[str] = Field(None, max_length=2000)


@router.post("/complaints/{ticket_id}/reopen-decision")
def reopen_decision(ticket_id: str, body: ReopenDecisionIn, user: CurrentUser = Depends(require_supervisor),
                    db: Session = Depends(get_db)):
    c = get_scoped_complaint_or_404(db, user, ticket_id)
    if not c.reopen_requested:
        raise HTTPException(409, "There is no pending reopen request on this ticket")
    if c.status != STATUS_RESOLVED:
        raise HTTPException(409, "Only a resolved ticket can be reopened")
    note = (body.note or "").strip() or None
    requester = c.reopen_requested_by_user_id
    before = {"status": c.status, "reopen_requested": True, "reopened_count": c.reopened_count}
    if body.approve:
        status_service.change_status(
            db, c, STATUS_REOPENED, user, note or "Reopen request approved", True, via="reopen",
            audit_action="reopen.approve",
            notify_title=f"{c.public_ticket_number}: your report was reopened",
            notify_body=f"Your reopen request for {c.public_ticket_number} was approved; the issue is back in the queue.")
        c.reopened_count = (c.reopened_count or 0) + 1
        c.resolved_at = None
        c.verified_by_user_id = None
        c.reopen_requested = False
        c.reopen_reason = None
        c.reopen_requested_by_user_id = None
        c.reopen_requested_at = None
        sla_service.recompute_priority_now(db, c)
    else:
        c.reopen_requested = False
        text = note or "The reopen request was reviewed and not approved."
        db.add(Comment(complaint_id=c.id, author_user_id=user.id, author_role=user.role, author_name=user.display_name,
                       body=text, visibility=VIS_PUBLIC))
        audit_service.log(db, user, "reopen.reject", "complaint", c.public_ticket_number, before=before,
                          after={"status": c.status, "reopen_requested": False}, reason=note)
        ids = {requester} if requester else set()
        ids |= set(status_service.recipients(db, c))
        for uid in ids:
            notification_service.notify(db, uid, "reopen_decision", f"{c.public_ticket_number}: reopen request reviewed",
                                        f"Your reopen request for report {c.public_ticket_number} was not approved. {text}",
                                        complaint_id=c.id, ticket_number=c.public_ticket_number)
    db.commit()
    return _staff_item(db, c, user)


# ----------------------------------------------------------------------------- link duplicate
class LinkDuplicateIn(BaseModel):
    primary_ticket_number: str = Field(min_length=3, max_length=30)
    reason: str = Field(min_length=5, max_length=1000)


@router.post("/complaints/{ticket_id}/link-duplicate")
def link_duplicate(ticket_id: str, body: LinkDuplicateIn, user: CurrentUser = Depends(require_office),
                   db: Session = Depends(get_db)):
    c = get_scoped_complaint_or_404(db, user, ticket_id)
    if body.primary_ticket_number == c.public_ticket_number:
        raise HTTPException(422, "A ticket cannot be a duplicate of itself")
    primary = get_scoped_complaint_or_404(db, user, body.primary_ticket_number)
    if primary.status in (STATUS_DUPLICATE_LINKED, "rejected"):
        raise HTTPException(409, "The primary ticket is itself closed as a duplicate/rejected; pick the real primary")
    reason = body.reason.strip()
    # Collect everyone who reported/followed this ticket BEFORE the status change (original rows are kept untouched).
    people = {c.created_by_user_id}
    people |= {s.user_id for s in db.query(ComplaintSubmission).filter(ComplaintSubmission.complaint_id == c.id)}
    people |= {f.user_id for f in db.query(ComplaintFollower).filter(ComplaintFollower.complaint_id == c.id)}
    status_service.change_status(
        db, c, STATUS_DUPLICATE_LINKED, user, f"Linked to {primary.public_ticket_number}: {reason}", True, via="duplicate",
        audit_action="duplicate.link",
        notify_title=f"{c.public_ticket_number}: linked to an existing report",
        notify_body=f"Your report {c.public_ticket_number} was linked to {primary.public_ticket_number}, which is already "
                    f"being handled. You will receive updates on it.")
    db.add(ComplaintLink(primary_complaint_id=primary.id, linked_complaint_id=c.id, confirmed_by_user_id=user.id, reason=reason))
    existing = {f.user_id for f in db.query(ComplaintFollower).filter(ComplaintFollower.complaint_id == primary.id)}
    existing.add(primary.created_by_user_id)
    for uid in people:
        if uid and uid not in existing:
            db.add(ComplaintFollower(complaint_id=primary.id, user_id=uid))
    c.reopen_requested = False
    db.commit()
    return {"ok": True, "ticket_number": c.public_ticket_number, "status": c.status,
            "primary_ticket_number": primary.public_ticket_number, "followers_moved": len([u for u in people if u not in existing])}
