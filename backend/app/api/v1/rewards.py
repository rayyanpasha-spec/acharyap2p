"""/rewards: a citizen's reward progress, plus the admin view for fulfilling earned rewards."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_current_user, require_roles
from app.core.user_store import get_user_store
from app.database import get_db
from app.models import CivicReward
from app.models.base import utcnow
from app.services import audit_service, notification_service, reward_service

router = APIRouter(prefix="/rewards", tags=["rewards"])


@router.get("/me")
def my_rewards(db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)):
    """Progress towards the next reward and every reward earned so far."""
    return reward_service.progress(db, user.id)


@router.get("")
def list_rewards(status: Optional[str] = Query(None, pattern="^(earned|fulfilled)$"), limit: int = Query(100, ge=1, le=500),
                 db: Session = Depends(get_db), _: CurrentUser = Depends(require_roles("admin"))):
    stmt = select(CivicReward).order_by(CivicReward.created_at.desc(), CivicReward.id.desc()).limit(limit)
    if status:
        stmt = stmt.where(CivicReward.status == status)
    store = get_user_store()
    items = []
    for r in db.scalars(stmt):
        u = store.get_by_id(r.user_id) or {}
        items.append({**reward_service.reward_out(r), "user_id": r.user_id, "user_name": u.get("display_name") or "Unknown",
                      "user_email": u.get("email"), "note": r.fulfilment_note})
    return {"items": items, "pending": sum(1 for i in items if i["status"] == "earned")}


class FulfilBody(BaseModel):
    note: Optional[str] = Field(None, max_length=300)


@router.post("/{reward_id}/fulfil")
def fulfil(reward_id: int, body: FulfilBody, db: Session = Depends(get_db), admin: CurrentUser = Depends(require_roles("admin"))):
    """Admin confirms the reward was paid / issued outside the app."""
    r = db.get(CivicReward, reward_id)
    if r is None:
        raise HTTPException(404, "Reward not found")
    if r.status == "fulfilled":
        raise HTTPException(409, "This reward is already marked as fulfilled")
    r.status, r.fulfilled_at, r.fulfilled_by_user_id = "fulfilled", utcnow(), admin.id
    r.fulfilment_note = (body.note or "").strip() or None
    notification_service.notify(db, r.user_id, "reward_fulfilled", "Your civic reward has been arranged",
                                f"Your {reward_service.money(r.amount, r.currency)} civic reward was marked as given by an administrator.")
    audit_service.log(db, admin, "reward.fulfil", "reward", r.id, after={"user_id": r.user_id, "amount": r.amount, "note": r.fulfilment_note})
    db.commit()
    return reward_service.reward_out(r)
