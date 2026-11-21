"""Deterministic severity: weighted factor score -> label, then escalation rules (README section 5).
The model/rules only PROPOSE the 0-100 factors; this module owns the arithmetic, thresholds and escalation."""
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from app.core.constants import SEVERITY_ORDER, SEVERITY_THRESHOLDS
from app.models import AppSetting
from app.services.rules_engine import FACTOR_NAMES, RISK_BLURB

DEFAULT_WEIGHTS: Dict[str, float] = {
    "safety_risk": 0.35, "public_impact": 0.25, "issue_scale": 0.20, "location_sensitivity": 0.10, "duration": 0.10,
}
DEFAULT_THRESHOLDS: Dict[str, float] = {label: float(lo) for lo, label in SEVERITY_THRESHOLDS}

# Score floors used so the stored score stays consistent with an escalated label.
_LABEL_FLOOR_FALLBACK = {"critical": 75.0, "high": 50.0, "medium": 25.0, "low": 0.0}


@dataclass
class SeverityResult:
    label: str
    score: float
    base_label: str
    base_score: float
    escalated_by: List[str] = field(default_factory=list)
    review_reasons: List[str] = field(default_factory=list)
    requires_review: bool = False


def _get_setting(db: Optional[Session], key: str) -> Optional[dict]:
    if db is None:
        return None
    try:
        row = db.get(AppSetting, key)
        return dict(row.value) if row is not None and isinstance(row.value, dict) else None
    except Exception:
        return None


def load_weights(db: Optional[Session]) -> Dict[str, float]:
    raw = _get_setting(db, "severity_weights") or {}
    weights = dict(DEFAULT_WEIGHTS)
    for k in DEFAULT_WEIGHTS:
        try:
            v = float(raw[k])
            if v >= 0:
                weights[k] = v
        except (KeyError, TypeError, ValueError):
            pass
    if sum(weights.values()) <= 0:
        return dict(DEFAULT_WEIGHTS)
    return weights


def load_thresholds(db: Optional[Session]) -> Dict[str, float]:
    raw = _get_setting(db, "severity_thresholds") or {}
    out = dict(DEFAULT_THRESHOLDS)
    for k in out:
        try:
            out[k] = float(raw[k])
        except (KeyError, TypeError, ValueError):
            pass
    return out


def clamp_factor(v) -> float:
    try:
        return max(0.0, min(100.0, float(v)))
    except (TypeError, ValueError):
        return 0.0


def weighted_score(factors: Dict[str, float], weights: Dict[str, float]) -> float:
    total_w = sum(weights.values()) or 1.0
    s = sum(weights[k] * clamp_factor(factors.get(k, 0.0)) for k in FACTOR_NAMES)
    return round(max(0.0, min(100.0, s / total_w)), 1)


def label_for(score: float, thresholds: Dict[str, float]) -> str:
    for label in ("critical", "high", "medium"):
        if score >= thresholds.get(label, _LABEL_FLOOR_FALLBACK[label]):
            return label
    return "low"


def _max_label(a: str, b: str) -> str:
    return a if SEVERITY_ORDER.get(a, 1) >= SEVERITY_ORDER.get(b, 1) else b


def assess(db: Optional[Session], factors: Dict[str, float], *, danger: bool = False, life_danger: bool = False,
           min_severity: Optional[str] = None) -> SeverityResult:
    """Return the final severity. `danger` -> at least high; `life_danger` -> critical; `min_severity` is the
    routing-rule floor. A floor/escalation never lowers a label and lifts the stored score to the label's threshold."""
    weights = load_weights(db)
    thresholds = load_thresholds(db)
    base_score = weighted_score(factors, weights)
    base_label = label_for(base_score, thresholds)
    label, score = base_label, base_score
    escalated: List[str] = []
    review: List[str] = []

    def raise_to(target: str, why: str) -> None:
        nonlocal label, score
        if SEVERITY_ORDER[target] > SEVERITY_ORDER[label]:
            label = target
            score = max(score, thresholds.get(target, _LABEL_FLOOR_FALLBACK[target]))
            escalated.append(why)

    if life_danger:
        raise_to("critical", "explicit danger to life")
    elif danger:
        raise_to("high", "credible immediate danger")
    if min_severity in SEVERITY_ORDER:
        raise_to(min_severity, f"routing rule floor ({min_severity})")

    if danger or life_danger:
        review.append("Possible immediate danger - needs human review")
    if label == "critical":
        review.append("Critical severity - needs human review")
    return SeverityResult(label=label, score=round(score, 1), base_label=base_label, base_score=base_score,
                          escalated_by=escalated, review_reasons=review, requires_review=bool(review))


def one_line(text: Optional[str], limit: int = 160) -> str:
    """Collapse to a single line and cap at `limit` characters."""
    s = " ".join((text or "").split())
    if len(s) <= limit:
        return s
    return s[: limit - 1].rstrip() + "…"


def build_reason(category: str, subcategory: Optional[str], subcategory_name: Optional[str], label: str,
                 drivers: List[str], escalated_by: List[str]) -> str:
    """Deterministic one-line English reason, <=160 chars."""
    blurb = RISK_BLURB.get((category, subcategory or ""), RISK_BLURB[("other", "other")])
    name = subcategory_name or (subcategory or category).replace("_", " ").capitalize()
    extras = [d for d in drivers if d != "possible immediate danger"][:2]
    head = name + (f" ({', '.join(extras)})" if extras else "")
    tail = blurb
    if any("danger" in e for e in escalated_by):
        tail = "possible immediate danger - escalated for urgent human review"
    return one_line(f"{head} - {tail}.")
