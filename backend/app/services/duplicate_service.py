"""Duplicate-aware (never duplicate-blocking) matching of a new report against existing incidents.

Spatial: bounding-box SQL prefilter + haversine in Python (portable to SQLite and PostgreSQL, no PostGIS).
Never matches by location alone: a candidate needs a category match or meaningful text similarity.
Privacy: other citizens' matches never carry reporter identity and coordinates are rounded to 4 dp.
"""
from __future__ import annotations

import difflib
import math
import re
import unicodedata
from datetime import timedelta
from typing import Any, Dict, List, Optional, Set

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.core.deps import CurrentUser
from app.models import Complaint, ComplaintFollower, ComplaintSubmission, DuplicateCandidate
from app.models.base import utcnow
from app.services.complaint_view import supporting_count, ticket_number
from app.services.location_service import haversine_m

FOOTPRINT_SUBCATEGORIES = {"flooding", "fallen_tree"}
MAX_MATCHES = 5
MIN_SCORE = 0.30

_STOP = {
    "the", "a", "an", "is", "are", "was", "were", "in", "on", "at", "of", "to", "and", "or", "near", "there", "this",
    "that", "it", "for", "with", "has", "have", "been", "very", "please", "road", "side", "from", "by", "my", "our",
}

# Quick, English-centric keyword guess used only when the client gives no category hint (triage does the real work).
_KEYWORDS = {
    "roads": ("pothole", "potholes", "road", "footpath", "crater", "asphalt"),
    "waste": ("garbage", "trash", "litter", "waste", "dustbin", "dumping", "rubbish"),
    "water": ("water supply", "pipe", "pipeline", "leak", "leaking", "borewell", "tap", "sewage", "sewer"),
    "electricity": ("streetlight", "street light", "electric", "wire", "power", "transformer", "pole", "outage"),
    "trees": ("tree", "branch", "branches", "park"),
    "drainage": ("drain", "drainage", "flood", "flooding", "stormwater", "waterlogging", "manhole"),
}


def guess_category(text: str) -> Optional[str]:
    t = _normalise(text)
    best, best_n = None, 0
    for cat, words in _KEYWORDS.items():
        n = sum(1 for w in words if w in t)
        if n > best_n:
            best, best_n = cat, n
    return best


def _normalise(text: str) -> str:
    return unicodedata.normalize("NFKC", (text or "")).lower()


def _tokens(text: str) -> Set[str]:
    return {t for t in re.findall(r"\w+", _normalise(text), flags=re.UNICODE) if t not in _STOP and len(t) > 1}


def text_similarity(a: str, b: str) -> float:
    """Multilingual-safe: token Jaccard blended with difflib ratio on the normalised strings (0..1)."""
    na, nb = _normalise(a), _normalise(b)
    if not na.strip() or not nb.strip():
        return 0.0
    ta, tb = _tokens(na), _tokens(nb)
    jac = len(ta & tb) / len(ta | tb) if ta and tb else 0.0
    ratio = difflib.SequenceMatcher(None, na[:600], nb[:600]).ratio()
    return max(jac, 0.85 * ratio)


def _bbox(lat: float, lng: float, radius_m: float):
    dlat = radius_m / 111_000.0
    dlng = radius_m / (111_000.0 * max(0.05, math.cos(math.radians(lat))))
    return lat - dlat, lat + dlat, lng - dlng, lng + dlng


def _radius(base: int, category: Optional[str], subcategory: Optional[str]) -> float:
    if (subcategory in FOOTPRINT_SUBCATEGORIES) or (category == "drainage" and subcategory == "flooding"):
        return base * 2.0
    return float(base)


def settings_dict() -> Dict[str, int]:
    return {"same_user_radius_m": settings.SAME_USER_DUPLICATE_RADIUS_METRES,
            "community_radius_m": settings.COMMUNITY_DUPLICATE_RADIUS_METRES,
            "lookback_days": settings.DUPLICATE_LOOKBACK_DAYS}


def find_duplicates(db: Session, user: CurrentUser, *, description: str, latitude: float, longitude: float,
                    category_hint: Optional[str] = None, subcategory_hint: Optional[str] = None,
                    persist: bool = True) -> Dict[str, Any]:
    same_r = settings.SAME_USER_DUPLICATE_RADIUS_METRES
    comm_r = settings.COMMUNITY_DUPLICATE_RADIUS_METRES
    max_r = max(same_r, comm_r) * 2.0
    since = utcnow() - timedelta(days=settings.DUPLICATE_LOOKBACK_DAYS)
    lat_lo, lat_hi, lng_lo, lng_hi = _bbox(latitude, longitude, max_r)

    rows = db.scalars(select(Complaint).where(
        Complaint.latitude.between(lat_lo, lat_hi), Complaint.longitude.between(lng_lo, lng_hi),
        Complaint.created_at >= since, Complaint.status.notin_(("rejected", "duplicate_linked")))
        .limit(400)).all()

    known_cat = category_hint or guess_category(description)
    ids = [c.id for c in rows]
    my_sub_ids: Set[int] = set(db.scalars(select(ComplaintSubmission.complaint_id).where(
        ComplaintSubmission.user_id == user.id, ComplaintSubmission.complaint_id.in_(ids)))) if ids else set()
    following: Set[int] = set(db.scalars(select(ComplaintFollower.complaint_id).where(
        ComplaintFollower.user_id == user.id, ComplaintFollower.complaint_id.in_(ids)))) if ids else set()

    scored: List[Dict[str, Any]] = []
    for c in rows:
        same = c.created_by_user_id == user.id or c.id in my_sub_ids
        base = same_r if same else comm_r
        radius = _radius(base, c.category, c.subcategory or subcategory_hint)
        dist = haversine_m(latitude, longitude, c.latitude, c.longitude)
        if dist > radius:
            continue
        cand_text = " ".join(filter(None, [c.original_description, c.summary, c.translated_description]))
        text_sim = max(text_similarity(description, c.original_description or ""),
                       text_similarity(description, cand_text))
        if known_cat and c.category and known_cat != "other" and c.category != "other":
            cat_score = 1.0 if known_cat == c.category else 0.0
        else:
            cat_score = 0.5
        if cat_score == 0.0 and text_sim < 0.3:
            continue  # category conflict and unrelated wording
        if cat_score < 1.0 and text_sim < 0.25:
            continue  # location alone is never enough
        prox = max(0.0, 1.0 - dist / radius)
        score = 0.40 * text_sim + 0.30 * cat_score + 0.20 * prox + (0.10 if same else 0.0)
        if c.status == "resolved":
            score *= 0.8  # recently resolved: still shown, ranked lower
        score = min(1.0, score)
        if score < MIN_SCORE:
            continue
        scored.append({"c": c, "dist": dist, "same": same, "score": score})

    scored.sort(key=lambda m: m["score"], reverse=True)
    scored = scored[:MAX_MATCHES]

    matches: List[Dict[str, Any]] = []
    for m in scored:
        c: Complaint = m["c"]
        exact = m["same"]
        matches.append({
            "ticket_number": ticket_number(c), "category": c.category, "subcategory": c.subcategory,
            "status": c.status, "distance_m": int(round(m["dist"])), "same_reporter": bool(m["same"]),
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "similarity": round(m["score"], 2),
            "summary": (c.summary or (c.original_description or "")[:140])[:200] if (exact or c.summary) else
            "A similar report has been filed nearby.",
            "locality": c.locality,
            "supporting_count": supporting_count(db, c),
            "i_follow": c.id in following,
            "latitude": c.latitude if exact else round(c.latitude, 4),
            "longitude": c.longitude if exact else round(c.longitude, 4),
        })
        if persist:
            existing = db.scalars(select(DuplicateCandidate).where(
                DuplicateCandidate.user_id == user.id, DuplicateCandidate.candidate_complaint_id == c.id,
                DuplicateCandidate.complaint_id.is_(None), DuplicateCandidate.decision == "shown")).first()
            if existing:
                existing.distance_m, existing.similarity, existing.same_reporter = m["dist"], m["score"], m["same"]
            else:
                db.add(DuplicateCandidate(complaint_id=None, candidate_complaint_id=c.id, user_id=user.id,
                                          distance_m=m["dist"], similarity=m["score"], same_reporter=m["same"],
                                          decision="shown"))
    if persist and matches:
        db.commit()

    if not matches:
        action = "none"
    elif matches[0]["same_reporter"] or matches[0]["similarity"] >= 0.6:
        action = "follow_or_add_evidence"
    else:
        action = "review"
    return {"has_possible_duplicates": bool(matches), "matches": matches, "recommended_action": action,
            "settings": settings_dict()}


def record_decision(db: Session, user_id: str, candidate_complaint_id: int, decision: str,
                    complaint_id: Optional[int] = None) -> None:
    """Update the most recent 'shown' row for this user/candidate (creates one if the check was skipped). No commit."""
    row = db.scalars(select(DuplicateCandidate).where(
        DuplicateCandidate.user_id == user_id, DuplicateCandidate.candidate_complaint_id == candidate_complaint_id,
        DuplicateCandidate.decision == "shown").order_by(DuplicateCandidate.id.desc())).first()
    if row is None:
        row = DuplicateCandidate(candidate_complaint_id=candidate_complaint_id, user_id=user_id, distance_m=0.0,
                                 similarity=0.0, same_reporter=False)
        db.add(row)
    row.decision = decision
    if complaint_id is not None:
        row.complaint_id = complaint_id


def record_continued_new(db: Session, user_id: str, new_complaint_id: int) -> None:
    """The citizen reviewed matches and continued with a new report: mark their recent 'shown' rows `continued_new`."""
    rows = db.scalars(select(DuplicateCandidate).where(
        DuplicateCandidate.user_id == user_id, DuplicateCandidate.decision == "shown",
        DuplicateCandidate.complaint_id.is_(None),
        DuplicateCandidate.created_at >= utcnow() - timedelta(hours=2))).all()
    for r in rows:
        r.decision = "continued_new"
        r.complaint_id = new_complaint_id
