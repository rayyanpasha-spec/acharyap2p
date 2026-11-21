"""In-app notifications for the current user."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_current_user
from app.database import get_db
from app.models import Notification

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _out(n: Notification) -> dict:
    return {"id": n.id, "type": n.type, "title": n.title, "body": n.body, "ticket_number": n.ticket_number,
            "complaint_id": n.complaint_id, "read": bool(n.read),
            "created_at": n.created_at.isoformat() if n.created_at else None}


def _unread(db: Session, user_id: str) -> int:
    return db.scalar(select(func.count(Notification.id)).where(
        Notification.user_id == user_id, Notification.read.is_(False))) or 0


@router.get("")
def list_notifications(unread_only: bool = False, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
                       db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)):
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        stmt = stmt.where(Notification.read.is_(False))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(Notification.created_at.desc(), Notification.id.desc())
                      .offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": [_out(n) for n in rows], "total": total, "page": page, "page_size": page_size,
            "unread_count": _unread(db, user.id)}


@router.post("/read-all")
def read_all(db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)):
    db.execute(update(Notification).where(Notification.user_id == user.id, Notification.read.is_(False))
               .values(read=True))
    db.commit()
    return {"ok": True, "unread_count": 0}


@router.post("/{notification_id}/read")
def mark_read(notification_id: int, db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)):
    n = db.get(Notification, notification_id)
    if n is None or n.user_id != user.id:
        raise HTTPException(404, "Notification not found")
    n.read = True
    db.commit()
    return {"ok": True, "unread_count": _unread(db, user.id)}
