"""Citizen complaint API (docs/API_CONTRACT.md section 4).

Static routes are declared BEFORE the `/{ticket_id}` routes. Browser-supplied category / severity / department are
never read: all of that comes from the triage + routing services.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.config import settings
from app.core.constants import CLOSED_STATUSES, LANGUAGES, LOCATION_SOURCES
from app.core.deps import CurrentUser, get_current_user, require_office
from app.core.rate_limit import rate_limit
from app.database import get_db
from app.models import (
    AiAnalysis, Category, Comment, Complaint, ComplaintFollower, ComplaintImage, ComplaintSubmission, Department,
    StatusHistory, VoiceTranscript,
)
from app.models.base import utcnow
from app.schemas.triage import TriageResult
from app.services import (
    duplicate_service, location_service, notification_service, priority_service, routing_service, triage_service,
)
from app.services.complaint_view import (
    citizen_can_view_private, complaint_out, followers_count, get_complaint_by_ticket, is_following, is_owner,
    public_updates, supporting_count, ticket_number, timeline_rows,
)
from app.services.upload_service import image_path, sanitize_image_bytes, save_image_bytes

router = APIRouter(prefix="/complaints", tags=["complaints"])

STAFF_DETAIL = ("Staff accounts cannot use this citizen action. Use the staff console "
                "(/api/v1/officer/queue) to work with complaints.")


# ------------------------------------------------------------------ dependencies / helpers
def citizen_user(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if user.role != "citizen":
        raise HTTPException(403, STAFF_DETAIL)
    return user


def _staff_in_scope(user: CurrentUser, c: Complaint) -> bool:
    if user.role == "worker":
        return c.assigned_worker_id == user.id
    if user.role == "officer" and user.department_code:
        return c.authoritative_department_code == user.department_code
    return True


def _load_visible(db: Session, ticket_id: str, user: CurrentUser) -> Complaint:
    c = get_complaint_by_ticket(db, ticket_id)
    if user.is_staff and not _staff_in_scope(user, c):
        raise HTTPException(404, "Complaint not found")
    return c


def _clean_description(text: str) -> str:
    t = (text or "").strip()
    if len(t) < 5 or len(t) > 4000:
        raise HTTPException(422, "Description must be between 5 and 4000 characters")
    return t


def _validate_location(lat: float, lng: float) -> None:
    if not (math.isfinite(lat) and math.isfinite(lng)) or not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise HTTPException(422, "Latitude/longitude are out of range")
    if abs(lat) < 1e-6 and abs(lng) < 1e-6:
        raise HTTPException(422, "A location of 0,0 is not valid. Please choose the actual issue location on the map.")


def _parse_captured(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(422, "location_captured_at must be an ISO datetime")
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


class _Img:
    __slots__ = ("raw", "clean", "ctype")

    def __init__(self, raw: bytes, clean: bytes, ctype: str):
        self.raw, self.clean, self.ctype = raw, clean, ctype


async def _read_images(files: Optional[List[UploadFile]]) -> List[_Img]:
    """Read + validate (content, size, format) every upload BEFORE anything is persisted."""
    out: List[_Img] = []
    limit = settings.MAX_IMAGE_SIZE_MB * 1024 * 1024 + 1
    real = [f for f in (files or []) if f is not None and (f.filename or "") != ""]
    if len(real) > settings.MAX_IMAGES_PER_REPORT:
        raise HTTPException(400, f"At most {settings.MAX_IMAGES_PER_REPORT} images are allowed")
    for f in real:
        raw = await f.read(limit)
        clean, ctype, _ext, _w, _h = sanitize_image_bytes(raw)  # raises 400/413
        out.append(_Img(raw, clean, ctype))
    return out


def _delete_files(rows: List[ComplaintImage]) -> None:
    for r in rows:
        try:
            Path(image_path(r)).unlink(missing_ok=True)
        except OSError:
            pass


def _run_triage(db: Session, *, text: str, language: str, imgs: List[_Img], lat: float, lng: float,
                locality: Optional[str], category_hint: Optional[str] = None) -> TriageResult:
    try:
        return triage_service.run_triage(
            db, text=text, language=language, images=[(i.clean, i.ctype) for i in imgs] or None,
            latitude=lat, longitude=lng, locality=locality, category_hint=category_hint)
    except Exception:  # run_triage must never raise; be defensive anyway
        return TriageResult(language=language, summary=text[:200], reason="Automatic triage was unavailable",
                            requires_human_review=True, review_reasons=["triage_unavailable"])


PHOTO_MISMATCH_MSG = "The photo does not match your description."


def _photo_mismatch_detail(t: TriageResult) -> str:
    why = (t.photo_mismatch_reason or "").strip().rstrip(".")
    return (f"{PHOTO_MISMATCH_MSG} {why + '. ' if why else ''}Please attach a photo of the problem you described, "
            "or remove the photo, and try again.")


def _guard_photo(t: TriageResult) -> None:
    """Refuse the submission when the AI saw the photo(s) and they clearly are not the described issue."""
    if settings.BLOCK_PHOTO_TEXT_MISMATCH and t.photo_mismatch:
        raise HTTPException(422, _photo_mismatch_detail(t))


def _resolve_department(db: Session, t: TriageResult) -> Tuple[Optional[str], Optional[str], Optional[str], bool]:
    """-> (department_code, agency_kind, routing_note, route_requires_review)"""
    if t.department_code:
        return t.department_code, t.agency_kind, t.routing_note, False
    route = routing_service.resolve_route(db, t.category, t.subcategory)
    return route.department_code, route.agency_kind, route.note, bool(route.requires_human_review)


def _name_of_category(db: Session, code: str, sub: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    cat = db.get(Category, code)
    if not cat:
        return code, sub
    sname = next((s.get("name") for s in (cat.subcategories or []) if s.get("code") == sub), None) if sub else None
    return cat.name, sname


def _add_follower(db: Session, complaint_id: int, user_id: str) -> bool:
    exists = db.scalars(select(ComplaintFollower.id).where(
        ComplaintFollower.complaint_id == complaint_id, ComplaintFollower.user_id == user_id)).first()
    if exists:
        return False
    db.add(ComplaintFollower(complaint_id=complaint_id, user_id=user_id))
    return True


def _paged(items: List[Any], total: int, page: int, page_size: int) -> Dict[str, Any]:
    return {"items": items, "total": total, "page": page, "page_size": page_size}


# ------------------------------------------------------------------ duplicate check
class DuplicateCheckBody(BaseModel):
    description: str = Field(..., min_length=3, max_length=4000)
    language: Optional[str] = None
    latitude: float
    longitude: float
    location_address: Optional[str] = None
    location_accuracy_m: Optional[float] = None
    location_source: Optional[str] = None
    category_hint: Optional[str] = None
    subcategory_hint: Optional[str] = None


@router.post("/duplicate-check", dependencies=[Depends(rate_limit("duplicate_check", 60, 3600))])
def duplicate_check(body: DuplicateCheckBody, db: Session = Depends(get_db), user: CurrentUser = Depends(citizen_user)):
    _validate_location(body.latitude, body.longitude)
    return duplicate_service.find_duplicates(
        db, user, description=body.description, latitude=body.latitude, longitude=body.longitude,
        category_hint=body.category_hint, subcategory_hint=body.subcategory_hint)


# ------------------------------------------------------------------ preview
@router.post("/preview", dependencies=[Depends(rate_limit("complaint_preview", 30, 3600))])
async def preview(
    description: str = Form(...), original_language: str = Form("en"), latitude: float = Form(...),
    longitude: float = Form(...), location_accuracy_m: Optional[float] = Form(None),
    location_source: str = Form("map_pin"), location_captured_at: Optional[str] = Form(None),
    location_address: Optional[str] = Form(None), locality: Optional[str] = Form(None), via: str = Form("text"),
    voice_transcript_id: Optional[int] = Form(None), category_hint: Optional[str] = Form(None),
    images: List[UploadFile] = File(default=[]),
    db: Session = Depends(get_db), user: CurrentUser = Depends(citizen_user),
):
    text = _clean_description(description)
    _validate_location(latitude, longitude)
    if original_language not in LANGUAGES:
        raise HTTPException(422, "Unsupported language")
    imgs = await _read_images(images)

    def work():
        t = _run_triage(db, text=text, language=original_language, imgs=imgs, lat=latitude, lng=longitude,
                        locality=locality, category_hint=category_hint if category_hint else None)
        area = location_service.check_service_area(db, latitude, longitude)
        dept_code, _kind, _note, _rev = _resolve_department(db, t)
        dept = db.get(Department, dept_code) if dept_code else None
        cat_name, sub_name = _name_of_category(db, t.category, t.subcategory)
        return {"triage": t.model_dump(), "service_area": area.to_dict(),
                "department_name": dept.name if dept else None, "category_name": cat_name,
                "subcategory_name": sub_name}

    return await run_in_threadpool(work)


# ------------------------------------------------------------------ create
@router.post("", status_code=201, dependencies=[Depends(rate_limit("complaint_create", 20, 3600))])
async def create_complaint(
    description: str = Form(...), original_language: str = Form("en"), latitude: float = Form(...),
    longitude: float = Form(...), location_accuracy_m: Optional[float] = Form(None),
    location_source: str = Form("map_pin"), location_captured_at: Optional[str] = Form(None),
    location_address: Optional[str] = Form(None), locality: Optional[str] = Form(None), via: str = Form("text"),
    voice_transcript_id: Optional[int] = Form(None), existing_incident_action: Optional[str] = Form(None),
    existing_ticket_id: Optional[str] = Form(None), duplicate_override_reason: Optional[str] = Form(None),
    images: List[UploadFile] = File(default=[]),
    db: Session = Depends(get_db), user: CurrentUser = Depends(citizen_user),
):
    # ---- validate everything first: nothing is persisted when any input is bad
    text = _clean_description(description)
    _validate_location(latitude, longitude)
    if original_language not in LANGUAGES:
        raise HTTPException(422, "Unsupported language")
    if location_source not in LOCATION_SOURCES:
        raise HTTPException(422, "location_source must be one of: " + ", ".join(LOCATION_SOURCES))
    if via not in ("text", "voice"):
        raise HTTPException(422, "via must be 'text' or 'voice'")
    if existing_incident_action not in (None, "", "follow", "add_evidence"):
        raise HTTPException(422, "existing_incident_action must be 'follow' or 'add_evidence'")
    if existing_incident_action and not existing_ticket_id:
        raise HTTPException(422, "existing_ticket_id is required with existing_incident_action")
    captured = _parse_captured(location_captured_at)
    imgs = await _read_images(images)

    def work() -> Dict[str, Any]:
        written: List[ComplaintImage] = []
        try:
            result = _create_sync(
                db, user, text=text, language=original_language, lat=latitude, lng=longitude,
                accuracy=location_accuracy_m, source=location_source, captured=captured, address=location_address,
                locality=locality, via=via, voice_transcript_id=voice_transcript_id,
                action=existing_incident_action or None, existing_ticket=existing_ticket_id,
                override_reason=(duplicate_override_reason or "").strip() or None, imgs=imgs, written=written)
            db.commit()
            return result
        except Exception:
            db.rollback()
            _delete_files(written)
            raise

    return await run_in_threadpool(work)


def _create_sync(db: Session, user: CurrentUser, *, text: str, language: str, lat: float, lng: float,
                 accuracy: Optional[float], source: str, captured: Optional[datetime], address: Optional[str],
                 locality: Optional[str], via: str, voice_transcript_id: Optional[int], action: Optional[str],
                 existing_ticket: Optional[str], override_reason: Optional[str], imgs: List[_Img],
                 written: List[ComplaintImage]) -> Dict[str, Any]:
    # ---------------- follow / add_evidence on an existing incident: no new ticket
    if action:
        existing = get_complaint_by_ticket(db, existing_ticket or "")
        if existing.status in ("rejected", "duplicate_linked"):
            raise HTTPException(409, "That report is closed and cannot be followed or extended")
        if action == "add_evidence" and imgs:   # the new photos must show the same issue as the existing report
            _guard_photo(_run_triage(db, text=f"{existing.original_description}\n{text}".strip(), language=language, imgs=imgs,
                                     lat=existing.latitude, lng=existing.longitude, locality=existing.locality))
        tn = ticket_number(existing)
        if action == "follow":
            if existing.created_by_user_id != user.id:
                _add_follower(db, existing.id, user.id)
            duplicate_service.record_decision(db, user.id, existing.id, "followed")
            notification_service.notify(db, user.id, "following", "You are following a report",
                                        f"You will get updates on {tn}.", existing.id, tn)
            db.flush()
            return {"action": "followed", "ticket_number": tn, "complaint": complaint_out(db, existing, user)}
        sub = ComplaintSubmission(complaint_id=existing.id, user_id=user.id, description=text, language=language,
                                  via=via, is_primary=False, duplicate_choice="add_evidence")
        db.add(sub)
        db.flush()
        for im in imgs:
            written.append(save_image_bytes(db, im.raw, complaint_id=existing.id, user_id=user.id, kind="evidence",
                                            submission_id=sub.id))
        existing.updated_at = utcnow()
        duplicate_service.record_decision(db, user.id, existing.id, "evidence_added")
        if existing.created_by_user_id != user.id:
            notification_service.notify(db, existing.created_by_user_id, "evidence_added",
                                        "New evidence added to your report",
                                        f"Another resident added supporting information to {tn}.", existing.id, tn)
        notification_service.notify(db, user.id, "evidence_added", "Evidence added",
                                    f"Your information was added to {tn}.", existing.id, tn)
        db.flush()
        return {"action": "evidence_added", "ticket_number": tn, "complaint": complaint_out(db, existing, user)}

    # ---------------- new complaint (single transaction; caller commits)
    # Triage first: a report whose photo does not match its text is refused BEFORE anything (or a ticket number) is created.
    t = _run_triage(db, text=text, language=language, imgs=imgs, lat=lat, lng=lng, locality=locality)
    _guard_photo(t)
    now = utcnow()
    c = Complaint(
        created_by_user_id=user.id, original_description=text, original_language=language, submitted_via=via,
        latitude=lat, longitude=lng, location_accuracy_m=accuracy, location_source=source, location_captured_at=captured,
        location_address=(address or None) and address[:400], locality=(locality or None) and locality[:120],
        city=settings.DEFAULT_CITY, state=settings.DEFAULT_STATE, country_code=settings.DEFAULT_COUNTRY_CODE,
        status="submitted", created_at=now, updated_at=now,
    )
    db.add(c)
    db.flush()
    c.public_ticket_number = f"CL-{now.year}-{c.id:05d}"
    sub = ComplaintSubmission(complaint_id=c.id, user_id=user.id, description=text, language=language, via=via,
                              is_primary=True, duplicate_choice="different" if override_reason else "new",
                              duplicate_override_reason=override_reason)
    db.add(sub)
    db.flush()
    for im in imgs:
        written.append(save_image_bytes(db, im.raw, complaint_id=c.id, user_id=user.id, kind="report",
                                        submission_id=sub.id))

    db.add(AiAnalysis(complaint_id=c.id, provider=t.provider, model=t.model, result=t.model_dump()))
    dept_code, agency_kind, route_note, route_review = _resolve_department(db, t)
    c.category, c.subcategory = t.category, t.subcategory
    c.summary = (t.summary or text)[:400]
    c.translated_description = t.translated_description
    c.severity, c.severity_score, c.severity_reason = t.severity, t.severity_score, (t.reason or None)
    c.ai_confidence, c.ai_provider = t.confidence, t.provider
    c.image_observations = list(t.image_observations or [])
    c.authoritative_department_code, c.responsible_agency_kind, c.routing_note = dept_code, agency_kind, route_note

    area = location_service.check_service_area(db, lat, lng)
    c.service_area_code = area.service_area
    c.service_area_status = area.service_area_status
    c.city_corporation_code, c.division_code, c.ward_code = (
        area.city_corporation_code, area.division_code, area.ward_code)
    c.boundary_dataset_version = area.boundary_dataset_version

    reasons = list(t.review_reasons or [])
    review = bool(t.requires_human_review or route_review)
    if not area.inside_service_area:
        review = True
        reasons.append("Location is outside the Greater Bengaluru pilot service area - manual routing needed")
    c.requires_human_review, c.review_reasons = review, reasons

    # status timeline: submitted -> ai_review (always; humans decide the rest)
    db.add(StatusHistory(complaint_id=c.id, from_status=None, to_status="submitted", actor_user_id=user.id,
                         actor_role="citizen", note="Report submitted", citizen_visible=True))
    db.add(StatusHistory(complaint_id=c.id, from_status="submitted", to_status="ai_review", actor_user_id=None,
                         actor_role="system", note="AI triage completed", citizen_visible=True))
    c.status = "ai_review"
    db.flush()
    c.priority_score = priority_service.compute_priority(db, c)
    c.sla_due_at = priority_service.sla_due_for(db, c.category, c.severity, c.authoritative_department_code)

    if voice_transcript_id:
        vt = db.get(VoiceTranscript, voice_transcript_id)
        if vt and vt.user_id == user.id:
            vt.complaint_id = c.id
            vt.confirmed_transcript = vt.confirmed_transcript or text
            vt.selected_language = vt.selected_language or language
    duplicate_service.record_continued_new(db, user.id, c.id)
    tn = c.public_ticket_number
    notification_service.notify(db, user.id, "complaint_submitted", "Report submitted",
                                f"Your report {tn} was received and is being reviewed.", c.id, tn)
    db.flush()
    return {"action": "created", "ticket_number": tn, "complaint": complaint_out(db, c, user),
            "triage": t.model_dump()}


# ------------------------------------------------------------------ lists
def _mine_ids_query(user_id: str):
    return select(Complaint.id).where(or_(
        Complaint.created_by_user_id == user_id,
        Complaint.id.in_(select(ComplaintSubmission.complaint_id).where(ComplaintSubmission.user_id == user_id))))


def _following_ids_query(user_id: str):
    return select(ComplaintFollower.complaint_id).where(ComplaintFollower.user_id == user_id)


@router.get("")
def list_complaints(scope: str = Query("all", pattern="^(mine|following|all)$"), status: Optional[str] = None,
                    q: Optional[str] = Query(None, max_length=200), page: int = Query(1, ge=1),
                    page_size: int = Query(25, ge=1, le=100), db: Session = Depends(get_db),
                    user: CurrentUser = Depends(citizen_user)):
    mine, foll = _mine_ids_query(user.id), _following_ids_query(user.id)
    cond = {"mine": Complaint.id.in_(mine), "following": Complaint.id.in_(foll),
            "all": or_(Complaint.id.in_(mine), Complaint.id.in_(foll))}[scope]
    stmt = select(Complaint).where(cond)
    if status:
        stmt = stmt.where(Complaint.status == status)
    if q and q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Complaint.summary.ilike(like), Complaint.original_description.ilike(like),
                              Complaint.public_ticket_number.ilike(like), Complaint.locality.ilike(like)))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(Complaint.created_at.desc(), Complaint.id.desc())
                      .offset((page - 1) * page_size).limit(page_size)).all()
    return _paged([complaint_out(db, c, user) for c in rows], total, page, page_size)


@router.get("/public-feed")
def public_feed(db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)):
    rows = db.scalars(select(Complaint).where(Complaint.status.notin_(("rejected", "duplicate_linked")))
                      .order_by(Complaint.created_at.desc(), Complaint.id.desc()).limit(30)).all()
    return {"items": [{
        "ticket_number": ticket_number(c), "category": c.category, "subcategory": c.subcategory, "status": c.status,
        "severity": c.severity, "locality": c.locality, "latitude": round(c.latitude, 3),
        "longitude": round(c.longitude, 3), "created_at": c.created_at.isoformat() if c.created_at else None,
        "supporting_count": supporting_count(db, c)} for c in rows]}


@router.get("/summary")
def summary(db: Session = Depends(get_db), user: CurrentUser = Depends(citizen_user)):
    mine = Complaint.id.in_(_mine_ids_query(user.id))
    total = db.scalar(select(func.count(Complaint.id)).where(mine)) or 0
    resolved = db.scalar(select(func.count(Complaint.id)).where(mine, Complaint.status == "resolved")) or 0
    unresolved = db.scalar(select(func.count(Complaint.id)).where(mine, Complaint.status.notin_(CLOSED_STATUSES))) or 0
    following = db.scalar(select(func.count(ComplaintFollower.id)).where(ComplaintFollower.user_id == user.id)) or 0
    # "awaiting my confirmation": my reports resolved in the last 14 days where I have not asked for a reopen
    awaiting = db.scalar(select(func.count(Complaint.id)).where(
        mine, Complaint.status == "resolved", Complaint.reopen_requested.is_(False),
        Complaint.resolved_at >= utcnow() - timedelta(days=14))) or 0
    recent = db.scalars(select(Complaint).where(mine).order_by(Complaint.created_at.desc(), Complaint.id.desc())
                        .limit(5)).all()
    return {"total": total, "unresolved": unresolved, "resolved": resolved, "following": following,
            "awaiting_my_confirmation": awaiting, "recent": [complaint_out(db, c, user) for c in recent]}


# ------------------------------------------------------------------ one complaint
@router.get("/{ticket_id}")
def get_complaint(ticket_id: str, db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)):
    c = _load_visible(db, ticket_id, user)
    return complaint_out(db, c, user, detail=True)


@router.get("/{ticket_id}/timeline")
def get_timeline(ticket_id: str, db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)):
    c = _load_visible(db, ticket_id, user)
    return timeline_rows(db, c, user)


@router.post("/{ticket_id}/follow")
def follow(ticket_id: str, db: Session = Depends(get_db), user: CurrentUser = Depends(citizen_user)):
    c = get_complaint_by_ticket(db, ticket_id)
    if c.created_by_user_id != user.id:
        _add_follower(db, c.id, user.id)
        db.commit()
    return {"following": True}


@router.delete("/{ticket_id}/follow")
def unfollow(ticket_id: str, db: Session = Depends(get_db), user: CurrentUser = Depends(citizen_user)):
    c = get_complaint_by_ticket(db, ticket_id)
    row = db.scalars(select(ComplaintFollower).where(
        ComplaintFollower.complaint_id == c.id, ComplaintFollower.user_id == user.id)).first()
    if row:
        db.delete(row)
        db.commit()
    return {"following": False}


@router.post("/{ticket_id}/evidence")
async def add_evidence(ticket_id: str, note: Optional[str] = Form(None), images: List[UploadFile] = File(default=[]),
                       db: Session = Depends(get_db), user: CurrentUser = Depends(citizen_user)):
    c = get_complaint_by_ticket(db, ticket_id)
    if c.status in ("rejected", "duplicate_linked"):
        raise HTTPException(409, "That report is closed and cannot receive more evidence")
    text = (note or "").strip()
    if len(text) > 4000:
        raise HTTPException(422, "Note is too long")
    imgs = await _read_images(images)
    if not text and not imgs:
        raise HTTPException(400, "Add a note or at least one photo")

    def work():
        written: List[ComplaintImage] = []
        try:
            if imgs:   # new photos must show the same issue as the report they are added to
                _guard_photo(_run_triage(db, text=f"{c.original_description}\n{text}".strip(), language=c.original_language,
                                         imgs=imgs, lat=c.latitude, lng=c.longitude, locality=c.locality))
            sub = ComplaintSubmission(
                complaint_id=c.id, user_id=user.id, description=text or "Additional photo evidence",
                language=user.preferred_language if user.preferred_language in LANGUAGES else "en", via="text",
                is_primary=False, duplicate_choice="add_evidence")
            db.add(sub)
            db.flush()
            for im in imgs:
                written.append(save_image_bytes(db, im.raw, complaint_id=c.id, user_id=user.id, kind="evidence",
                                                submission_id=sub.id))
            c.updated_at = utcnow()
            db.commit()
            return complaint_out(db, c, user)
        except Exception:
            db.rollback()
            _delete_files(written)
            raise

    return await run_in_threadpool(work)


class ReopenBody(BaseModel):
    reason: str = Field(..., min_length=5, max_length=2000)


@router.post("/{ticket_id}/reopen-request")
def reopen_request(ticket_id: str, body: ReopenBody, db: Session = Depends(get_db),
                   user: CurrentUser = Depends(citizen_user)):
    c = get_complaint_by_ticket(db, ticket_id)
    if not citizen_can_view_private(db, c, user.id):
        raise HTTPException(403, "Only the reporter or a follower can ask for a report to be reopened")
    if c.status != "resolved":
        raise HTTPException(409, "Only resolved reports can be reopened")
    if c.reopen_requested:
        raise HTTPException(409, "A reopen request is already waiting for a supervisor")
    reason = body.reason.strip()
    c.reopen_requested = True
    c.reopen_reason = reason
    c.reopen_requested_by_user_id = user.id
    c.reopen_requested_at = utcnow()
    db.add(Comment(complaint_id=c.id, author_user_id=user.id, author_role="citizen", author_name=user.display_name,
                   body=f"Reopen requested: {reason}", visibility="internal"))
    notification_service.notify(db, user.id, "reopen_requested", "Reopen request sent",
                                f"A supervisor will review your request for {ticket_number(c)}.", c.id,
                                ticket_number(c))
    db.commit()
    return {"ok": True}


@router.post("/{ticket_id}/analyze")
def analyze(ticket_id: str, apply: bool = Query(False), db: Session = Depends(get_db),
            user: CurrentUser = Depends(require_office)):
    c = _load_visible(db, ticket_id, user)
    imgs: List[_Img] = []
    for im in db.scalars(select(ComplaintImage).where(ComplaintImage.complaint_id == c.id,
                                                        ComplaintImage.kind.in_(("report", "evidence")))
                         .order_by(ComplaintImage.id.asc()).limit(settings.MAX_IMAGES_PER_REPORT)):
        try:
            data = image_path(im).read_bytes()
            imgs.append(_Img(data, data, im.content_type))
        except OSError:
            continue
    t = _run_triage(db, text=c.original_description, language=c.original_language, imgs=imgs, lat=c.latitude,
                    lng=c.longitude, locality=c.locality)
    db.add(AiAnalysis(complaint_id=c.id, provider=t.provider, model=t.model, result=t.model_dump()))
    applied = False
    if apply and not c.classification_confirmed:
        dept_code, agency_kind, route_note, route_review = _resolve_department(db, t)
        c.category, c.subcategory = t.category, t.subcategory
        c.summary = (t.summary or c.summary or "")[:400]
        c.translated_description = t.translated_description
        if not c.severity_overridden:
            c.severity, c.severity_score, c.severity_reason = t.severity, t.severity_score, (t.reason or None)
        c.ai_confidence, c.ai_provider = t.confidence, t.provider
        c.image_observations = list(t.image_observations or [])
        c.authoritative_department_code, c.responsible_agency_kind, c.routing_note = dept_code, agency_kind, route_note
        c.requires_human_review = bool(t.requires_human_review or route_review)
        c.review_reasons = list(t.review_reasons or [])
        c.priority_score = priority_service.compute_priority(db, c)
        applied = True
    db.commit()
    return {"triage": t.model_dump(), "applied": applied}
