"""Complaint status machine: validation, role rules, history, audit and notifications.

`resolved` is reachable ONLY through verify-resolution (via="verify"). Other internal flows (assignment, classification,
reopen decision, duplicate linking) pass `via=` so they skip the generic PATCH-status role rules but still obey
STATUS_TRANSITIONS.
"""
from typing import Iterable, List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.constants import (
    ROLE_ADMIN, ROLE_OFFICER, ROLE_SUPERVISOR, ROLE_WORKER, STATUS_AWAITING_VERIFICATION, STATUS_DUPLICATE_LINKED,
    STATUS_IN_PROGRESS, STATUS_REOPENED, STATUS_RESOLVED, STATUS_TRANSITIONS, STATUSES,
)
from app.models import Complaint, ComplaintFollower, ResolutionEvidence, StatusHistory
from app.services import audit_service, notification_service

STATUS_LABELS = {
    "submitted": "Submitted", "ai_review": "Under AI review", "verified": "Verified by an officer",
    "assigned": "Assigned to a field team", "in_progress": "Work in progress",
    "awaiting_verification": "Work done, awaiting verification", "resolved": "Resolved", "reopened": "Reopened",
    "rejected": "Closed - not actionable", "duplicate_linked": "Linked to an existing report",
}
WORKER_ALLOWED = {STATUS_IN_PROGRESS, STATUS_AWAITING_VERIFICATION}
VERIFY_MSG = "Resolution must be verified via verify-resolution"


def has_after_evidence(db: Session, complaint: Complaint) -> bool:
    return db.query(ResolutionEvidence).filter(
        ResolutionEvidence.complaint_id == complaint.id, ResolutionEvidence.kind == "after").count() > 0


def allowed_transitions(complaint: Complaint, user) -> List[str]:
    """Statuses `user` may set through PATCH /status right now (resolved is never in this list)."""
    nxt = set(STATUS_TRANSITIONS.get(complaint.status, set()))
    nxt.discard(STATUS_RESOLVED)
    nxt.discard(STATUS_DUPLICATE_LINKED)  # via link-duplicate only
    role = getattr(user, "role", None)
    if role == ROLE_WORKER:
        return sorted(nxt & WORKER_ALLOWED) if complaint.assigned_worker_id == user.id else []
    if role == ROLE_OFFICER:
        nxt.discard(STATUS_REOPENED)  # reopening is a supervisor decision
        return sorted(nxt)
    if role in (ROLE_SUPERVISOR, ROLE_ADMIN):
        return sorted(nxt)
    return []


def check_patch_rules(db: Session, complaint: Complaint, new_status: str, actor, note: Optional[str]) -> None:
    """Rules for the generic PATCH /status endpoint. Raises HTTPException."""
    if new_status not in STATUSES:
        raise HTTPException(422, f"Unknown status '{new_status}'")
    if new_status == STATUS_RESOLVED:
        if actor.role == ROLE_WORKER:
            raise HTTPException(403, "Field workers cannot mark a ticket resolved")
        raise HTTPException(409, VERIFY_MSG)
    if new_status == STATUS_DUPLICATE_LINKED:
        raise HTTPException(409, "Use link-duplicate to mark a report as a duplicate")
    if new_status not in STATUS_TRANSITIONS.get(complaint.status, set()):
        raise HTTPException(409, f"Cannot move a ticket from '{complaint.status}' to '{new_status}'")
    if actor.role == ROLE_WORKER:
        if complaint.assigned_worker_id != actor.id:
            raise HTTPException(404, "Complaint not found")
        if new_status not in WORKER_ALLOWED:
            raise HTTPException(403, "Field workers may only set in_progress or awaiting_verification")
        if new_status == STATUS_AWAITING_VERIFICATION and not (has_after_evidence(db, complaint) or (note or "").strip()):
            raise HTTPException(422, "Add an 'after' photo/evidence or a note before sending work for verification")
    elif actor.role == ROLE_OFFICER and new_status == STATUS_REOPENED:
        raise HTTPException(403, "Only a supervisor or admin can reopen a resolved ticket")
    elif actor.role not in (ROLE_OFFICER, ROLE_SUPERVISOR, ROLE_ADMIN):
        raise HTTPException(403, "You do not have permission for this action")


def recipients(db: Session, complaint: Complaint, exclude: Iterable[Optional[str]] = ()) -> List[str]:
    ids = [complaint.created_by_user_id] + [
        f.user_id for f in db.query(ComplaintFollower).filter(ComplaintFollower.complaint_id == complaint.id)]
    skip = {e for e in exclude if e}
    seen, out = set(), []
    for i in ids:
        if i and i not in skip and i not in seen:
            seen.add(i)
            out.append(i)
    return out


def notify_citizens(db: Session, complaint: Complaint, type_: str, title: str, body: Optional[str] = None,
                    exclude: Iterable[Optional[str]] = ()) -> int:
    ids = recipients(db, complaint, exclude)
    for uid in ids:
        notification_service.notify(db, uid, type_, title, body, complaint_id=complaint.id,
                                    ticket_number=complaint.public_ticket_number)
    return len(ids)


def change_status(db: Session, complaint: Complaint, new_status: str, actor, note: Optional[str] = None,
                  citizen_visible: bool = True, *, via: Optional[str] = None, notify_title: Optional[str] = None,
                  notify_body: Optional[str] = None, audit_action: str = "status.change") -> StatusHistory:
    """Move `complaint` to `new_status`, writing an immutable StatusHistory row, an audit row and in-app notifications
    to the reporter and followers (when citizen_visible). Caller commits.

    via=None  -> PATCH-status role rules apply (workers limited, resolved/duplicate blocked)
    via="verify" is the only way to reach `resolved`.
    """
    old = complaint.status
    if via is None:
        check_patch_rules(db, complaint, new_status, actor, note)
    else:
        if new_status == STATUS_RESOLVED and via != "verify":
            raise HTTPException(409, VERIFY_MSG)
        if new_status not in STATUS_TRANSITIONS.get(old, set()):
            raise HTTPException(409, f"Cannot move a ticket from '{old}' to '{new_status}'")
    complaint.status = new_status
    row = StatusHistory(complaint_id=complaint.id, from_status=old, to_status=new_status,
                        actor_user_id=getattr(actor, "id", None), actor_role=getattr(actor, "role", None),
                        note=(note or None), citizen_visible=citizen_visible)
    db.add(row)
    audit_service.log(db, actor, audit_action, "complaint", complaint.public_ticket_number,
                      before={"status": old}, after={"status": new_status}, reason=note)
    if citizen_visible:
        ticket = complaint.public_ticket_number
        title = notify_title or f"Update on {ticket}: {STATUS_LABELS.get(new_status, new_status)}"
        body = notify_body or (f"Report {ticket} is now '{STATUS_LABELS.get(new_status, new_status)}'."
                               + (f" Note: {note}" if note else ""))
        notify_citizens(db, complaint, "status_update", title, body, exclude=[getattr(actor, "id", None)])
    db.flush()
    return row
