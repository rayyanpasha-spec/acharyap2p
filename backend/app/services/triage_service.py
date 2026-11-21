"""AI triage orchestrator: provider chain (OpenAI -> Ollama -> deterministic rules), Pydantic validation, taxonomy
validation against the DB `categories` table, then DETERMINISTIC severity + routing + review flags.

`run_triage` NEVER raises. It never logs complaint text, photos or model output (only exception class names)."""
import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Set, Tuple

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Category
from app.schemas.triage import TriageResult
from app.services import (image_analysis_service, ollama_service, openai_service, rules_engine, routing_service,
                          severity_service)
from app.services.classification_service import ProviderError, validate_taxonomy

log = logging.getLogger("civiclens.triage")

KNOWN_PROVIDERS = ("openai", "ollama", "rules")
LOW_CONFIDENCE = 0.6
RULES_LOW_CERTAINTY = 0.5


@dataclass
class _Proposal:
    provider: str
    model: Optional[str]
    category: str
    subcategory: Optional[str]
    summary: str
    translated: Optional[str]
    observations: List[str]
    model_reason: str
    confidence: float
    factors: Dict[str, float]
    danger: bool
    conflict: bool
    photo_analysis: str
    problems: List[str] = field(default_factory=list)
    drivers: List[str] = field(default_factory=list)
    rules_certainty: Optional[float] = None


def _provider_order() -> List[str]:
    order: List[str] = []
    for p in (settings.AI_PROVIDER_ORDER or "").split(","):
        p = p.strip().lower()
        if p in KNOWN_PROVIDERS and p not in order:
            order.append(p)
    if "rules" not in order:
        order.append("rules")  # the offline classifier is always the last resort
    return order


def _load_taxonomy(db: Session) -> Tuple[Dict[str, Set[str]], Dict[str, Dict]]:
    """(category -> subcategory codes, category -> {name, subcategories}) from active DB categories."""
    tax: Dict[str, Set[str]] = {}
    names: Dict[str, Dict] = {}
    try:
        rows = db.scalars(select(Category).where(Category.active.is_(True)).order_by(Category.sort_order)).all()
    except Exception:
        rows = []
    for c in rows:
        subs = [s for s in (c.subcategories or []) if isinstance(s, dict) and s.get("code")]
        tax[c.code] = {s["code"] for s in subs}
        names[c.code] = {"name": c.name, "subcategories": subs}
    if not tax:  # empty / unreadable table -> seed taxonomy
        from app.seed_reference import CATEGORIES

        for code, name, _icon, _dept, subs in CATEGORIES:
            tax[code] = {s for s, _ in subs}
            names[code] = {"name": name, "subcategories": [{"code": s, "name": n} for s, n in subs]}
    return tax, names


def _sub_name(names: Dict[str, Dict], category: str, sub: Optional[str]) -> Optional[str]:
    for s in names.get(category, {}).get("subcategories", []):
        if s.get("code") == sub:
            return s.get("name")
    return None


def _short(text: str, limit: int = 200) -> str:
    s = " ".join((text or "").split())
    return s if len(s) <= limit else s[: limit - 1].rstrip() + "…"


def _failure_note(name: str, exc: Exception) -> str:
    detail = str(exc) if isinstance(exc, ProviderError) else type(exc).__name__
    return f"{name} unavailable ({detail[:120]})"


def _rules_proposal(text: str, lang: str, rules: rules_engine.RulesResult, tax: Dict[str, Set[str]],
                    has_photos: bool) -> _Proposal:
    cat, sub = rules.category, rules.subcategory
    problems: List[str] = []
    if cat not in tax:
        cat, sub = "other", None
    elif sub is not None and sub not in tax[cat]:
        sub = None
    return _Proposal(
        provider="rules", model="keyword-rules-v1", category=cat, subcategory=sub, summary=_short(text),
        translated=None, observations=[], model_reason="", confidence=rules.certainty, factors=dict(rules.factors),
        danger=rules.danger, conflict=False, photo_analysis="unavailable" if has_photos else "not_provided",
        problems=problems, drivers=list(rules.drivers), rules_certainty=rules.certainty,
    )


def _model_proposal(mt, model: str, photo: str, provider: str, tax: Dict[str, Set[str]],
                    rules: rules_engine.RulesResult) -> _Proposal:
    category, sub, problems = validate_taxonomy(mt, tax)
    factors = mt.factors()
    if not any(factors.values()):
        factors = dict(rules.factors)
    return _Proposal(
        provider=provider, model=model, category=category, subcategory=sub, summary=mt.summary,
        translated=mt.translated_description, observations=list(mt.image_observations), model_reason=mt.reason,
        confidence=mt.confidence, factors=factors, danger=mt.danger_flag, conflict=mt.photo_text_conflict,
        photo_analysis=photo, problems=problems, drivers=list(rules.drivers),
    )


def _run(db: Session, *, text: str, language: str, images, latitude, longitude, locality, category_hint,
         order: Sequence[str]) -> TriageResult:
    notes: List[str] = []
    clean = " ".join((text or "").split())[:4000]
    lang = rules_engine.detect_language(clean, language)
    tax, names = _load_taxonomy(db)
    rules = rules_engine.classify(clean, lang)
    photos = image_analysis_service.usable_images(images)

    proposal: Optional[_Proposal] = None
    previous: Optional[str] = None
    for name in order:
        if name == "rules":
            proposal = _rules_proposal(clean, lang, rules, tax, bool(photos))
            break
        service = openai_service if name == "openai" else ollama_service
        label = "OpenAI" if name == "openai" else "Ollama"
        try:
            mt, model, photo = service.triage(clean, lang, images, names, locality, category_hint)
            proposal = _model_proposal(mt, model, photo, name, tax, rules)
            break
        except Exception as exc:  # any provider failure -> next provider
            log.warning("triage provider %s failed: %s", name, type(exc).__name__)
            notes.append(_failure_note(label, exc))
            previous = label
    if proposal is None:  # defensive: order always ends with rules
        proposal = _rules_proposal(clean, lang, rules, tax, bool(photos))
    if previous and proposal.provider != "rules":
        notes[-1] = notes[-1] + f" -> {'Ollama' if proposal.provider == 'ollama' else proposal.provider} used"
    elif previous:
        notes.append("Fell back to offline keyword rules")

    # --- photo notes
    if photos and proposal.photo_analysis == "unavailable":
        if proposal.provider == "ollama":
            notes.append("Ollama has no vision model configured (OLLAMA_VISION_MODEL); photos were not analysed")
        else:
            notes.append("Photos were not analysed (no vision-capable AI provider answered)")
    if lang != "en" and proposal.provider == "rules":
        notes.append("Offline rules cannot translate; officers should read the original text")
    if proposal.problems:
        notes.extend(proposal.problems)

    category, sub = proposal.category, proposal.subcategory
    # Citizen's tapped category only fills a gap (never overrides a classification)
    hint_used = False
    if category == "other" and category_hint and category_hint in tax and category_hint != "other":
        category = category_hint
        sub = rules.subcategory if rules.category == category_hint and rules.subcategory in tax[category] else None
        proposal.confidence = min(proposal.confidence, 0.5)
        hint_used = True
        notes.append("Category taken from the citizen's selection (the text alone was unclear)")

    # --- deterministic danger scan on the text, regardless of provider
    danger = bool(proposal.danger or rules.danger)
    life = bool(rules.life_danger)

    route = routing_service.resolve_route(db, category, sub)
    sev = severity_service.assess(db, proposal.factors, danger=danger, life_danger=life,
                                  min_severity=route.min_severity)

    # --- review flags
    reasons: List[str] = []
    if proposal.provider == "rules":
        if (proposal.rules_certainty or 0.0) < RULES_LOW_CERTAINTY:
            reasons.append("Low keyword certainty (offline rules)")
    elif proposal.confidence < LOW_CONFIDENCE:
        reasons.append(f"Low AI confidence ({proposal.confidence:.2f})")
    if hint_used:
        reasons.append("Category uncertain - taken from the citizen's selection")
    if category == "other":
        reasons.append("Category could not be determined")
    for p in proposal.problems:
        if "category outside" in p:
            reasons.append("AI returned a category outside the configured taxonomy")
    if proposal.conflict:
        reasons.append("Photo and text may not match - verify on site")
    reasons.extend(sev.review_reasons)
    if route.requires_human_review:
        reasons.append("Routing rule requires human review" + (f": {route.note}" if route.note else ""))
    reasons = list(dict.fromkeys(r[:240] for r in reasons))

    # --- one-line reason (English)
    if proposal.model_reason and not sev.escalated_by:
        reason = severity_service.one_line(proposal.model_reason)
    else:
        reason = severity_service.build_reason(category, sub, _sub_name(names, category, sub), sev.label,
                                               proposal.drivers, sev.escalated_by)

    translated = proposal.translated if lang != "en" else None
    return TriageResult(
        language=lang, category=category, subcategory=sub,
        summary=_short(proposal.summary) or _short(clean), translated_description=translated,
        severity=sev.label, severity_score=sev.score, reason=reason,
        department_code=route.department_code, agency_kind=route.agency_kind, routing_note=route.note,
        confidence=round(max(0.0, min(1.0, proposal.confidence)), 2),
        image_observations=proposal.observations if proposal.photo_analysis == "analysed" else [],
        requires_human_review=bool(reasons), review_reasons=reasons, provider=proposal.provider,
        model=proposal.model, photo_analysis=proposal.photo_analysis if photos else "not_provided", notes=notes,
    )


def run_triage(db: Session, *, text: str, language: str = "en",
               images: Optional[List[Tuple[bytes, str]]] = None,
               latitude: Optional[float] = None, longitude: Optional[float] = None,
               locality: Optional[str] = None, category_hint: Optional[str] = None) -> TriageResult:
    """images = list of (raw_bytes, content_type). NEVER raises: on any failure a rules-based result is returned."""
    kwargs = dict(text=text, language=language, images=images, latitude=latitude, longitude=longitude,
                  locality=locality, category_hint=category_hint)
    try:
        return _run(db, order=_provider_order(), **kwargs)
    except Exception as exc:
        log.warning("triage failed, using rules: %s", type(exc).__name__)
        try:
            res = _run(db, order=["rules"], **kwargs)
            res.notes.append(f"AI triage error ({type(exc).__name__}); used offline rules")
            res.requires_human_review = True
            if "AI triage error - please review" not in res.review_reasons:
                res.review_reasons.append("AI triage error - please review")
            return res
        except Exception as exc2:
            log.warning("rules triage failed: %s", type(exc2).__name__)
            return TriageResult(
                language=language if language in rules_engine.SUPPORTED_LANGS else "en", category="other",
                subcategory=None, summary=_short(text or ""), severity="medium", severity_score=40.0,
                reason="Automatic triage failed - needs manual review.", department_code="municipal_triage",
                agency_kind="corporation", confidence=0.0, requires_human_review=True,
                review_reasons=["Automatic triage failed"], provider="rules",
                notes=[f"Triage error ({type(exc2).__name__})"],
            )
