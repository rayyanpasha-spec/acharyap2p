"""Civic reward: a citizen earns a cash-value reward (default INR 500) for every 10 of their OWN reports that were
resolved AND verified by an authorised person (the same bar as a Certificate of Appreciation).

* Reports that are still open, rejected or linked as duplicates do not count; reports can never count twice (each block of
  10 uses the next 10 resolved reports in resolution order).
* The app only records the entitlement ("earned"). An admin marks it "fulfilled" after paying or issuing it outside the app:
  no money moves inside CivicLens.
* Evaluation is idempotent (UNIQUE user + milestone) and runs whenever a resolution is verified (see certificate_service)."""
import logging
from typing import Any, Dict, List, Optional

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import AppSetting, CivicReward, Complaint
from app.models.base import utcnow
from app.services.notification_service import notify

log = logging.getLogger("civiclens.rewards")

DEFAULTS = {"enabled": True, "reports_required": 10, "amount": 500, "currency": "INR"}
SYMBOLS = {"INR": "₹", "USD": "$", "EUR": "€", "GBP": "£"}


def get_settings(db: Session) -> Dict[str, Any]:
    out = dict(DEFAULTS)
    row = db.get(AppSetting, "rewards")
    if row and isinstance(row.value, dict):
        v = row.value
        if isinstance(v.get("enabled"), bool):
            out["enabled"] = v["enabled"]
        for k in ("reports_required", "amount"):
            if isinstance(v.get(k), (int, float)) and int(v[k]) > 0:
                out[k] = int(v[k])
        if isinstance(v.get("currency"), str) and len(v["currency"].strip()) == 3:
            out["currency"] = v["currency"].strip().upper()
    return out


def money(amount: int, currency: str) -> str:
    return f"{SYMBOLS.get(currency, currency + ' ')}{amount:,}"


def resolved_reports(db: Session, user_id: str) -> List[Complaint]:
    """The citizen's own reports that are resolved AND verified, oldest resolution first."""
    stmt = select(Complaint).where(
        Complaint.created_by_user_id == user_id, Complaint.status == "resolved",
        Complaint.verified_by_user_id.isnot(None),
    ).order_by(Complaint.resolved_at.asc(), Complaint.id.asc())
    return list(db.scalars(stmt))


def reward_out(r: CivicReward, cfg: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    return {
        "id": r.id, "milestone": r.milestone, "amount": r.amount, "currency": r.currency,
        "display": money(r.amount, r.currency), "status": r.status, "is_demo": bool(r.is_demo),
        "reports_counted": len(r.complaint_ids or []),
        "earned_at": r.created_at.isoformat() if r.created_at else None,
        "fulfilled_at": r.fulfilled_at.isoformat() if r.fulfilled_at else None,
    }


def progress(db: Session, user_id: str) -> Dict[str, Any]:
    cfg = get_settings(db)
    need = cfg["reports_required"]
    resolved = len(resolved_reports(db, user_id))
    total = db.scalar(select(func.count(Complaint.id)).where(Complaint.created_by_user_id == user_id)) or 0
    open_reports = db.scalar(select(func.count(Complaint.id)).where(
        Complaint.created_by_user_id == user_id,
        Complaint.status.notin_(("resolved", "rejected", "duplicate_linked")))) or 0
    earned = db.scalars(select(CivicReward).where(CivicReward.user_id == user_id)
                        .order_by(CivicReward.milestone.asc())).all()
    in_block = resolved % need
    return {
        "enabled": cfg["enabled"], "reports_required": need, "amount": cfg["amount"], "currency": cfg["currency"],
        "reward_display": money(cfg["amount"], cfg["currency"]),
        "resolved_count": resolved, "submitted_count": int(total), "open_count": int(open_reports),
        "progress_in_block": in_block, "remaining": need - in_block,
        "rewards_earned": len(earned), "total_earned": sum(r.amount for r in earned),
        "total_display": money(sum(r.amount for r in earned), cfg["currency"]),
        "rewards": [reward_out(r) for r in earned],
        "rule": (f"Get {money(cfg['amount'], cfg['currency'])} for every {need} of your own reports that are resolved and "
                 "verified. Reports that are still open, rejected or duplicates do not count."),
    }


def evaluate(db: Session, user_id: str) -> List[CivicReward]:
    """Grant any reward the citizen has now earned. Flushes only; the caller commits. Never raises."""
    try:
        cfg = get_settings(db)
        if not cfg["enabled"] or not user_id:
            return []
        db.flush()   # autoflush is off: make the caller's status changes visible
        need = cfg["reports_required"]
        reports = resolved_reports(db, user_id)
        due = len(reports) // need
        have = {m for (m,) in db.execute(select(CivicReward.milestone).where(CivicReward.user_id == user_id))}
        granted: List[CivicReward] = []
        for m in range(1, due + 1):
            if m in have:
                continue
            block = reports[(m - 1) * need: m * need]
            row = CivicReward(user_id=user_id, milestone=m, amount=cfg["amount"], currency=cfg["currency"], status="earned",
                              complaint_ids=[c.id for c in block], is_demo=all(bool(c.is_demo) for c in block),
                              created_at=utcnow())
            try:
                with db.begin_nested():
                    db.add(row)
            except IntegrityError:   # a concurrent evaluation already granted it
                continue
            granted.append(row)
            notify(db, user_id, "reward_earned", f"You earned a {money(row.amount, row.currency)} civic reward",
                   f"{need} of your reports have been resolved and verified. Thank you for improving your neighbourhood. "
                   "An administrator will arrange your reward; you can see it under Achievements.")
        if granted:
            db.flush()
        return granted
    except Exception:   # a reward problem must never block a resolution
        log.exception("reward evaluation failed")
        return []
