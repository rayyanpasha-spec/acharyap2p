"""CivicVerse endpoints. Prefix is empty: /games, /achievements, /civic/*."""
from collections import Counter
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_current_user, require_roles
from app.database import get_db
from app.models import Achievement, Category, Complaint, UserAchievement
from app.services import game_service, points_service
from app.services.game_service import GameError

router = APIRouter(tags=["civicverse"])

GOLDEN_TREE_MESSAGE = ("You completed the weekly civic challenge. A small golden tree now grows in your neighbourhood - "
                       "thank you for learning and caring about your community.")
SECRET_TITLE = "Secret achievement"
SECRET_DESCRIPTION = "Keep contributing to your community to discover this one."


class SessionIn(BaseModel):
    game_code: str = Field(min_length=1, max_length=40)


class ScoreIn(BaseModel):
    answers: List[Any] = Field(default_factory=list, max_length=100)
    duration_seconds: Optional[float] = None


def _raise(e: GameError):
    raise HTTPException(e.status, e.detail)


# ---------------------------------------------------------------- games
@router.get("/games")
def games(db: Session = Depends(get_db), user: CurrentUser = Depends(require_roles("citizen"))):
    return game_service.list_games(db, user.id)


@router.post("/games/sessions")
def start_game(body: SessionIn, db: Session = Depends(get_db), user: CurrentUser = Depends(require_roles("citizen"))):
    try:
        out = game_service.start_session(db, user.id, body.game_code)
    except GameError as e:
        _raise(e)
    db.commit()
    return out


@router.post("/games/sessions/{session_id}/score")
def submit_game(session_id: int, body: ScoreIn, db: Session = Depends(get_db),
                user: CurrentUser = Depends(require_roles("citizen"))):
    try:
        out = game_service.submit_score(db, user.id, session_id, body.answers, body.duration_seconds)
    except GameError as e:
        db.rollback()
        _raise(e)
    db.commit()
    return out


# ---------------------------------------------------------------- achievements
@router.get("/achievements")
def achievements(db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)):
    count = points_service.verified_contribution_count(db, user.id)
    earned = {ua.achievement_code: ua.earned_at for ua in db.scalars(
        select(UserAchievement).where(UserAchievement.user_id == user.id))}
    items = []
    for a in db.scalars(select(Achievement).order_by(Achievement.sort_order, Achievement.code)):
        got = a.code in earned
        if a.secret and not got:
            # nothing that identifies the achievement is exposed, including its code
            items.append({"code": f"secret-{a.sort_order}", "title": SECRET_TITLE, "description": SECRET_DESCRIPTION,
                          "earned": False, "earned_at": None, "secret": True})
        else:
            items.append({"code": a.code, "title": a.title, "description": a.description, "earned": got,
                          "earned_at": earned[a.code].isoformat() if got else None, "secret": a.secret})
    return {"points_total": points_service.total_points(db, user.id),
            "level": points_service.level_for(count, db), "achievements": items}


# ---------------------------------------------------------------- civic profile
def _story(complaints: List[Complaint]) -> dict:
    s = {"road_repairs": 0, "streetlights_restored": 0, "water_leaks_fixed": 0,
         "sanitation_resolved": 0, "trees_resolved": 0, "drainage_resolved": 0}
    for c in complaints:
        if c.category == "roads":
            s["road_repairs"] += 1
        elif c.category == "electricity" and c.subcategory == "broken_streetlight":
            s["streetlights_restored"] += 1
        elif c.category == "water" and c.subcategory == "pipe_leak":
            s["water_leaks_fixed"] += 1
        elif c.category == "waste":
            s["sanitation_resolved"] += 1
        elif c.category == "trees":
            s["trees_resolved"] += 1
        elif c.category == "drainage":
            s["drainage_resolved"] += 1
    return s


def _city_item(c: Complaint) -> dict:
    if c.category == "trees":
        kind, label = ("park", "Park") if c.subcategory == "park_maintenance" else ("tree", "Tree")
    elif c.category == "roads":
        kind, label = "road", "Road"
    elif c.category == "electricity" and c.subcategory == "broken_streetlight":
        kind, label = "streetlight", "Streetlight"
    elif c.category == "waste":
        kind, label = "recycling", "Recycling station"
    else:
        kind, label = "community", "Community garden"  # generic item for other verified improvements
    return {"type": kind, "label": label, "ticket_number": c.public_ticket_number}


@router.get("/civic/profile")
def civic_profile(db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)):
    verified = points_service.verified_complaints(db, user.id)
    unlocked_golden = any(r.reason_code == "game_weekly" for r in points_service.history(db, user.id, 1000))
    hist = points_service.history(db, user.id, 20)
    return {
        "points_total": points_service.total_points(db, user.id),
        "level": points_service.level_for(len(verified), db),
        "verified_contributions": len(verified),
        "growing_city": [_city_item(c) for c in verified],
        "history": [{"points": h.points, "reason_code": h.reason_code, "note": h.note,
                     "created_at": h.created_at.isoformat()} for h in hist],
        "neighbourhood_story": _story(verified),
        "golden_tree": {"unlocked": unlocked_golden, "message": GOLDEN_TREE_MESSAGE if unlocked_golden else None},
    }


@router.get("/civic/neighbourhood")
def civic_neighbourhood(db: Session = Depends(get_db), user: CurrentUser = Depends(require_roles("citizen"))):
    """Privacy-safe aggregate counts of verified improvements; no tickets, names or locations."""
    rows = list(db.scalars(select(Complaint).where(
        Complaint.status == "resolved", Complaint.verified_by_user_id.isnot(None))))
    names = {c.code: c.name for c in db.scalars(select(Category))}
    counts = Counter(c.category for c in rows)
    return {
        "total_verified_improvements": len(rows),
        "by_category": [{"category": k, "name": names.get(k, k.replace("_", " ").title()), "count": v}
                        for k, v in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))],
        "story": _story(rows),
        "includes_demo_data": any(c.is_demo for c in rows),
    }
