"""Achievement evaluation. Achievements are earned only from verified outcomes or completed (server-scored) games."""
from datetime import timedelta
from typing import Dict, List

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Achievement, ComplaintSubmission, GameSession, UserAchievement
from app.models.base import utcnow
from app.services import points_service
from app.services.notification_service import notify

LEVEL_CODES = ("civic_observer", "neighbourhood_helper", "community_guardian", "civic_champion", "city_ambassador")


def _is_night_ist(complaint) -> bool:
    """Reported between 19:00 and 05:00 IST."""
    created = complaint.created_at
    if created is None:
        return False
    hour = (created + timedelta(hours=5, minutes=30)).hour
    return hour >= 19 or hour < 5


def _best_score(db: Session, user_id: str, game_code: str) -> int:
    rows = db.scalars(select(GameSession.validated_score).where(
        GameSession.user_id == user_id, GameSession.game_code == game_code,
        GameSession.completed_at.isnot(None)))
    return max([r for r in rows if r is not None] or [0])


def _earned_codes(db: Session, user_id: str) -> set:
    return set(db.scalars(select(UserAchievement.achievement_code).where(UserAchievement.user_id == user_id)))


def evaluate(db: Session, user_id: str) -> List[Dict[str, str]]:
    """Unlock any achievements the user now qualifies for. Returns [{code,title}] newly unlocked.
    Flushes only; the caller commits."""
    db.flush()
    catalogue = {a.code: a for a in db.scalars(select(Achievement))}
    if not catalogue:
        return []
    earned = _earned_codes(db, user_id)
    verified = points_service.verified_complaints(db, user_id)
    count = len(verified)

    own = [c for c in verified if c.created_by_user_id == user_id]
    sub_complaint_ids = {s.complaint_id for s in db.scalars(select(ComplaintSubmission).where(
        ComplaintSubmission.user_id == user_id))}
    supported = [c for c in verified if c.created_by_user_id != user_id and c.id in sub_complaint_ids]

    thresholds = {code: n for code, _t, n in points_service.levels_table(db)}
    checks = {
        "first_voice": lambda: any(c.submitted_via == "voice" for c in own),
        "water_guardian": lambda: any(c.category == "water" for c in verified),
        "night_owl": lambda: any(c.category == "electricity" and c.subcategory == "broken_streetlight"
                                 and _is_night_ist(c) for c in own),
        "clean_sweep": lambda: any(c.category == "waste" for c in verified),
        "neighbourhood_watch": lambda: bool(supported),
        "quiz_whiz": lambda: _best_score(db, user_id, "civic_quiz") >= 80,
        "tidy_citizen": lambda: _best_score(db, user_id, "clean_city") >= 80,
        "golden_tree": lambda: _weekly_done(db, user_id),
    }
    for lc in LEVEL_CODES:
        checks[lc] = (lambda lc=lc: lc in thresholds and count >= thresholds[lc])

    unlocked: List[Dict[str, str]] = []
    for code, ach in catalogue.items():
        if code in earned or code not in checks:
            continue
        try:
            ok = checks[code]()
        except Exception:  # an evaluator bug must never break resolution or game completion
            ok = False
        if ok:
            db.add(UserAchievement(user_id=user_id, achievement_code=code, earned_at=utcnow()))
            notify(db, user_id, "achievement", f"Achievement unlocked: {ach.title}", ach.description)
            unlocked.append({"code": code, "title": ach.title})
    if unlocked:
        db.flush()
    return unlocked


def _weekly_done(db: Session, user_id: str) -> bool:
    from app.models import CivicPointsLedger

    return db.scalars(select(CivicPointsLedger.id).where(
        CivicPointsLedger.user_id == user_id, CivicPointsLedger.reason_code == "game_weekly").limit(1)).first() is not None
