"""AI triage tests. Nothing here touches the network: OpenAI / Ollama paths use fake clients and monkeypatching."""
import json
from datetime import timedelta
from types import SimpleNamespace

import pytest

from app.config import settings
from app.models import AppSetting, RoutingRule
from app.models.base import utcnow
from app.schemas.triage import TriageResult
from app.services import (ollama_service, openai_service, priority_service, routing_service, rules_engine,
                          severity_service, triage_service)
from app.services.classification_service import ModelTriage, ProviderError

# Minimal valid 1x1 PNG header bytes are enough: the AI layer only sniffs magic bytes.
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


@pytest.fixture(autouse=True)
def _app_started(client):
    """The `client` fixture runs the app lifespan (creates tables + seeds reference data) that `db` relies on."""
    yield


# ---------------------------------------------------------------- rules engine: >= 2 complaints per category
RULE_CASES = [
    # (text, language, category, subcategory or None-for-any)
    ("There is a deep pothole near the school gate", "en", "roads", "pothole"),
    ("ರಸ್ತೆಯಲ್ಲಿ ದೊಡ್ಡ ಗುಂಡಿ ಇದೆ", "kn", "roads", "pothole"),
    ("सड़क पर बड़ा गड्ढा है", "hi", "roads", "pothole"),
    ("road mele doddu gadda ide", "kn", "roads", "pothole"),
    ("Garbage bin is overflowing near the market", "en", "waste", "overflowing_bin"),
    ("குப்பைத் தொட்டி நிரம்பி வழிகிறது", "ta", "waste", "overflowing_bin"),
    ("Some litter dumped on the lane", "en", "waste", None),
    ("Water pipe is leaking on the main road since 3 days", "en", "water", "pipe_leak"),
    ("ನೀರಿನ ಪೈಪ್ ಒಡೆದು ನೀರು ಸೋರಿಕೆ ಆಗುತ್ತಿದೆ", "kn", "water", "pipe_leak"),
    ("पानी नहीं आ रहा है दो दिन से", "hi", "water", "water_shortage"),
    ("neer baralla since morning", "kn", "water", "water_shortage"),
    ("Streetlight is not working and the road is dark", "en", "electricity", "broken_streetlight"),
    ("தெரு விளக்கு எரியவில்லை", "ta", "electricity", "broken_streetlight"),
    ("వీధి దీపం వెలగడం లేదు", "te", "electricity", "broken_streetlight"),
    ("Live wire hanging near the bus stop, it is sparking", "en", "electricity", "exposed_wiring"),
    ("current illa since evening, whole street has no power", "kn", "electricity", "power_outage"),
    ("A tree has fallen on the road blocking traffic", "en", "trees", "fallen_tree"),
    ("ಮರ ಬಿದ್ದಿದೆ ರಸ್ತೆಯಲ್ಲಿ", "kn", "trees", "fallen_tree"),
    ("മരം വീണു റോഡിൽ", "ml", "trees", "fallen_tree"),
    ("Dry branch hanging over the footpath may fall", "en", "trees", "dangerous_branch"),
    ("The road is flooded after rain, water standing knee deep", "en", "drainage", "flooding"),
    ("Open manhole on the road without a cover", "en", "drainage", "open_manhole"),
    ("வடிகால் அடைப்பு உள்ளது", "ta", "drainage", "blocked_drain"),
    ("ಚರಂಡಿ ಕಟ್ಟಿಕೊಂಡಿದೆ", "kn", "drainage", "blocked_drain"),
    ("gutter is blocked and overflowing", "en", "drainage", "blocked_drain"),
    ("The bus shelter roof is broken", "en", "public_infrastructure", "bus_shelter"),
    ("पार्क की बेंच टूटी है", "hi", "public_infrastructure", "damaged_bench"),
    ("Public toilet door is broken and very dirty", "en", "public_infrastructure", "public_toilet"),
    ("I want to ask something about my property tax", "en", "other", None),
    ("hello", "en", "other", None),
]


@pytest.mark.parametrize("text,lang,category,sub", RULE_CASES)
def test_rules_engine_classifies_multilingual(text, lang, category, sub):
    r = rules_engine.classify(text, lang)
    assert r.category == category, (text, r.category, r.matched)
    if sub:
        assert r.subcategory == sub, (text, r.subcategory)


def test_rules_cover_every_seeded_subcategory():
    from app.seed_reference import CATEGORIES

    for code, _n, _i, _d, subs in CATEGORIES:
        for sub, _name in subs:
            if code == "other":
                continue
            assert (code, sub) in rules_engine.KEYWORDS, f"no keywords for {code}/{sub}"


def test_language_detection_by_script():
    assert rules_engine.detect_language("ರಸ್ತೆಯಲ್ಲಿ ಗುಂಡಿ ಇದೆ", "en") == "kn"
    assert rules_engine.detect_language("सड़क पर गड्ढा", None) == "hi"
    assert rules_engine.detect_language("சாலையில் குழி", None) == "ta"
    assert rules_engine.detect_language("రోడ్డుపై గుంత", None) == "te"
    assert rules_engine.detect_language("റോഡിൽ കുഴി", None) == "ml"
    assert rules_engine.detect_language("gadda ide", "kn") == "kn"   # transliterated text keeps the selected language
    assert rules_engine.detect_language("pothole", None) == "en"


def test_factor_hints_from_text():
    f, drivers = rules_engine.estimate_factors("Deep pothole near school, many accidents, since 2 weeks", "roads", "pothole")
    base, _ = rules_engine.estimate_factors("pothole", "roads", "pothole")
    assert f["location_sensitivity"] >= 45 and f["safety_risk"] > base["safety_risk"]
    assert f["duration"] >= 50 and f["issue_scale"] > base["issue_scale"]
    assert drivers


def test_danger_detection():
    d, life, _ = rules_engine.detect_danger("exposed live wire sparking on the road")
    assert d and life
    d, life, _ = rules_engine.detect_danger("hanging wire near the pole")
    assert d and not life
    d, _life, terms = rules_engine.detect_danger("open manhole near the bus stop")
    assert d and "open manhole" in terms
    assert rules_engine.detect_danger("small pothole on the lane")[0] is False


# ---------------------------------------------------------------- severity
def test_severity_thresholds_default(db):
    def sev(v, **kw):
        return severity_service.assess(db, {k: v for k in rules_engine.FACTOR_NAMES}, **kw)

    assert sev(0).label == "low"
    assert sev(24).label == "low"
    assert sev(25).label == "medium"
    assert sev(49).label == "medium"
    assert sev(50).label == "high"
    assert sev(74).label == "high"
    assert sev(75).label == "critical"
    assert severity_service.weighted_score(
        {"safety_risk": 100, "public_impact": 0, "issue_scale": 0, "location_sensitivity": 0, "duration": 0},
        severity_service.DEFAULT_WEIGHTS) == 35.0


def test_severity_weights_and_thresholds_read_from_settings(db):
    row = db.get(AppSetting, "severity_weights")
    original = dict(row.value)
    try:
        row.value = {"safety_risk": 1.0, "public_impact": 0.0, "issue_scale": 0.0, "location_sensitivity": 0.0,
                     "duration": 0.0}
        db.commit()
        res = severity_service.assess(db, {"safety_risk": 80, "public_impact": 0, "issue_scale": 0,
                                           "location_sensitivity": 0, "duration": 0})
        assert res.score == 80.0 and res.label == "critical"
    finally:
        row.value = original
        db.commit()


def test_severity_escalation_rules(db):
    zero = {k: 0 for k in rules_engine.FACTOR_NAMES}
    assert severity_service.assess(db, zero).label == "low"
    high = severity_service.assess(db, zero, danger=True)
    assert high.label == "high" and high.score >= 50 and high.requires_review
    crit = severity_service.assess(db, zero, danger=True, life_danger=True)
    assert crit.label == "critical" and crit.score >= 75 and crit.requires_review
    floor = severity_service.assess(db, zero, min_severity="high")
    assert floor.label == "high"
    # an escalation never lowers a label
    assert severity_service.assess(db, {k: 90 for k in rules_engine.FACTOR_NAMES}, danger=True).label == "critical"


def test_exposed_live_wire_is_escalated_and_needs_review(db):
    r = triage_service.run_triage(db, text="Exposed live wire fallen on the road near the bus stop, sparking")
    assert r.category == "electricity" and r.subcategory == "exposed_wiring"
    assert r.severity in ("high", "critical")
    assert r.severity == "critical"
    assert r.requires_human_review is True and r.review_reasons
    assert r.department_code == "bescom_network" and r.agency_kind == "bescom"
    assert r.provider == "rules"


def test_trivial_litter_is_low_or_medium(db):
    r = triage_service.run_triage(db, text="Some litter on the lane")
    assert r.category == "waste"
    assert r.severity in ("low", "medium")
    assert r.requires_human_review is False or r.confidence < 0.6


def test_reason_is_one_line_and_short(db):
    for text in ["Deep pothole near the school since 2 weeks", "ರಸ್ತೆಯಲ್ಲಿ ದೊಡ್ಡ ಗುಂಡಿ ಇದೆ", "hello",
                 "Open manhole on the road", "x" * 3000]:
        r = triage_service.run_triage(db, text=text)
        assert r.reason and "\n" not in r.reason and len(r.reason) <= 160
        assert len(r.summary) <= 200


def test_triage_result_is_complete_and_valid(db):
    r = triage_service.run_triage(db, text="Deep pothole near the school gate since 2 weeks", language="en",
                                  latitude=12.97, longitude=77.59, locality="Indiranagar")
    assert isinstance(r, TriageResult)
    assert r.category == "roads" and r.subcategory == "pothole"
    assert r.department_code == "road_maintenance" and r.agency_kind == "corporation"
    assert r.provider == "rules" and r.photo_analysis == "not_provided"
    assert r.severity in ("medium", "high") and 0 <= r.severity_score <= 100
    TriageResult.model_validate(r.model_dump())


def test_unclear_complaint_goes_to_triage_queue_with_review(db):
    r = triage_service.run_triage(db, text="hello")
    assert r.category == "other" and r.requires_human_review
    assert r.department_code == "municipal_triage"


def test_category_hint_only_fills_gaps(db):
    r = triage_service.run_triage(db, text="please check this", category_hint="waste")
    assert r.category == "waste" and r.requires_human_review
    r2 = triage_service.run_triage(db, text="Deep pothole on the road", category_hint="waste")
    assert r2.category == "roads"  # a clear classification is not overridden by the hint


def test_photos_with_rules_provider_are_marked_unavailable(db):
    r = triage_service.run_triage(db, text="Deep pothole on the road", images=[(PNG, "image/png")])
    assert r.photo_analysis == "unavailable"
    assert any("not analysed" in n for n in r.notes)


# ---------------------------------------------------------------- routing
def test_routing_expected_departments(db):
    r = routing_service.resolve_route(db, "water", "pipe_leak")
    assert (r.department_code, r.agency_kind) == ("bwssb_water_sewerage", "bwssb")
    r = routing_service.resolve_route(db, "electricity", "broken_streetlight")
    assert (r.department_code, r.agency_kind) == ("electrical", "corporation")
    r = routing_service.resolve_route(db, "electricity", "exposed_wiring")
    assert (r.department_code, r.agency_kind) == ("bescom_network", "bescom")
    assert r.requires_human_review and r.min_severity == "high" and r.note
    r = routing_service.resolve_route(db, "drainage", "flooding")
    assert r.department_code == "stormwater_drain"
    r = routing_service.resolve_route(db, "water", "sewage_overflow")
    assert r.department_code == "bwssb_water_sewerage"


def test_routing_category_only_and_unknown(db):
    r = routing_service.resolve_route(db, "roads")
    assert r.department_code == "road_maintenance"
    r = routing_service.resolve_route(db, "electricity", "unknown_sub")  # falls back to the category-only rule
    assert r.department_code == "electrical"
    r = routing_service.resolve_route(db, "not_a_category")
    assert r.department_code == "municipal_triage" and r.requires_human_review
    assert routing_service.resolve_route(db, "other").requires_human_review


def test_routing_most_specific_active_rule_wins(db):
    rule = RoutingRule(category="roads", subcategory="pothole", department_code="public_works",
                       agency_kind="corporation", requires_human_review=False, note="test rule")
    db.add(rule)
    db.commit()
    try:
        assert routing_service.resolve_route(db, "roads", "pothole").department_code == "public_works"
        assert routing_service.resolve_route(db, "roads", "damaged_road").department_code == "road_maintenance"
        rule.active = False
        db.commit()
        assert routing_service.resolve_route(db, "roads", "pothole").department_code == "road_maintenance"
    finally:
        db.delete(rule)
        db.commit()


# ---------------------------------------------------------------- priority / SLA
def _cmp(severity, age_h, due_in_h=None, category="roads"):
    now = utcnow()
    return SimpleNamespace(id=None, severity=severity, category=category, status="submitted",
                           created_at=now - timedelta(hours=age_h), resolved_at=None,
                           sla_due_at=(now + timedelta(hours=due_in_h)) if due_in_h is not None else None)


def test_priority_components_and_ordering(db):
    fresh_high = priority_service.compute_priority(db, _cmp("high", 0, 24))
    fresh_crit = priority_service.compute_priority(db, _cmp("critical", 0, 4))
    fresh_med = priority_service.compute_priority(db, _cmp("medium", 0, 72))
    overdue_med = priority_service.compute_priority(db, _cmp("medium", 240, -100))
    assert fresh_crit > fresh_high > fresh_med
    assert overdue_med > fresh_high            # long-overdue medium outranks a fresh high without being relabelled
    assert overdue_med < priority_service.compute_priority(db, _cmp("critical", 240, -100))
    assert fresh_high == round(fresh_high, 1)
    assert 0 <= overdue_med <= 100


def test_priority_ageing_is_capped_and_sla_grows(db):
    old = priority_service.compute_priority(db, _cmp("low", 24 * 60, None))
    older = priority_service.compute_priority(db, _cmp("low", 24 * 90, None))
    assert old == older                              # ageing capped at 15
    near = priority_service.compute_priority(db, _cmp("high", 20, 1))
    far = priority_service.compute_priority(db, _cmp("high", 20, 200))
    assert near > far


def test_sla_due_for_uses_policy(db):
    from app.models import SlaPolicy

    start = utcnow()
    # category without its own row -> the '*' default (sample targets 4/24/72/168 h); other suites may add rows for
    # real categories, so use a made-up category for the default check
    for sev, hrs in (("critical", 4), ("high", 24), ("medium", 72), ("low", 168)):
        assert priority_service.sla_due_for(db, "no_such_category", sev, start=start) == start + timedelta(hours=hrs)
    assert priority_service.sla_due_for(db, "roads", "nonsense", start=start) is None
    # a category-specific row beats the default
    row = SlaPolicy(category="test_cat_sla", severity="high", target_hours=7, is_sample=True)
    db.add(row)
    db.commit()
    try:
        assert priority_service.sla_due_for(db, "test_cat_sla", "high", start=start) == start + timedelta(hours=7)
        assert priority_service.sla_due_for(db, "test_cat_sla", "low", start=start) == start + timedelta(hours=168)
    finally:
        db.delete(row)
        db.commit()


# ---------------------------------------------------------------- provider chain (fake providers)
def _fake_model(**over):
    data = dict(language="en", category="roads", subcategory="pothole", summary="Pothole near the bus stop.",
                translated_description=None, image_observations=[], reason="Pothole beside a bus stop - fall risk.",
                confidence=0.9, safety_risk=50, public_impact=50, issue_scale=40, location_sensitivity=60, duration=10,
                danger_flag=False)
    data.update(over)
    return ModelTriage.model_validate(data)


def test_provider_fallback_openai_to_ollama_to_rules(db, monkeypatch):
    monkeypatch.setattr(settings, "AI_PROVIDER_ORDER", "openai,ollama,rules")

    def boom(*a, **k):
        raise RuntimeError("openai down")

    monkeypatch.setattr(openai_service, "triage", boom)
    monkeypatch.setattr(ollama_service, "triage", lambda *a, **k: (_fake_model(), "qwen-fake", "not_provided"))
    r = triage_service.run_triage(db, text="Pothole near the bus stop")
    assert r.provider == "ollama" and r.model == "qwen-fake"
    assert any("OpenAI unavailable" in n for n in r.notes)
    assert r.department_code == "road_maintenance"
    assert r.reason.startswith("Pothole beside a bus stop")

    def ollama_boom(*a, **k):
        raise ProviderError("Ollama request failed (ConnectError)")

    monkeypatch.setattr(ollama_service, "triage", ollama_boom)
    r = triage_service.run_triage(db, text="Pothole near the bus stop")
    assert r.provider == "rules" and r.category == "roads"
    assert any("OpenAI unavailable" in n for n in r.notes) and any("Ollama unavailable" in n for n in r.notes)


def test_openai_success_path_wins_when_available(db, monkeypatch):
    monkeypatch.setattr(settings, "AI_PROVIDER_ORDER", "openai,rules")
    monkeypatch.setattr(openai_service, "triage", lambda *a, **k: (_fake_model(), "gpt-fake", "analysed"))
    r = triage_service.run_triage(db, text="Pothole near the bus stop", images=[(PNG, "image/png")])
    assert r.provider == "openai" and r.photo_analysis == "analysed" and not r.notes


def test_out_of_taxonomy_output_is_rejected(db, monkeypatch):
    monkeypatch.setattr(settings, "AI_PROVIDER_ORDER", "ollama,rules")
    monkeypatch.setattr(ollama_service, "triage",
                        lambda *a, **k: (_fake_model(category="spaceship", subcategory="ufo"), "m", "not_provided"))
    r = triage_service.run_triage(db, text="Something odd")
    assert r.category == "other" and r.requires_human_review
    assert any("taxonomy" in x for x in r.review_reasons)
    monkeypatch.setattr(ollama_service, "triage",
                        lambda *a, **k: (_fake_model(subcategory="made_up"), "m", "not_provided"))
    r = triage_service.run_triage(db, text="Pothole near the bus stop")
    assert r.category == "roads" and r.subcategory is None


def test_model_cannot_lower_danger_escalation(db, monkeypatch):
    monkeypatch.setattr(settings, "AI_PROVIDER_ORDER", "ollama,rules")
    monkeypatch.setattr(ollama_service, "triage", lambda *a, **k: (
        _fake_model(category="electricity", subcategory="exposed_wiring", safety_risk=5, public_impact=5,
                    issue_scale=5, location_sensitivity=5, duration=5, danger_flag=False), "m", "not_provided"))
    r = triage_service.run_triage(db, text="live wire sparking near the school")
    assert r.severity == "critical" and r.requires_human_review


def test_low_confidence_model_output_needs_review(db, monkeypatch):
    monkeypatch.setattr(settings, "AI_PROVIDER_ORDER", "ollama,rules")
    monkeypatch.setattr(ollama_service, "triage", lambda *a, **k: (_fake_model(confidence=0.3), "m", "not_provided"))
    r = triage_service.run_triage(db, text="Pothole near the bus stop")
    assert r.requires_human_review and any("confidence" in x.lower() for x in r.review_reasons)


def test_run_triage_never_raises(db, monkeypatch):
    # provider crash
    monkeypatch.setattr(settings, "AI_PROVIDER_ORDER", "openai,ollama,rules")
    monkeypatch.setattr(openai_service, "triage", lambda *a, **k: 1 / 0)
    monkeypatch.setattr(ollama_service, "triage", lambda *a, **k: (_ for _ in ()).throw(KeyError("x")))
    assert isinstance(triage_service.run_triage(db, text="Pothole"), TriageResult)
    # garbage input
    assert isinstance(triage_service.run_triage(db, text=None, images=[("not bytes", None)]), TriageResult)
    # routing crash -> still a TriageResult flagged for review
    monkeypatch.setattr(routing_service, "resolve_route", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("db")))
    r = triage_service.run_triage(db, text="Pothole on the road")
    assert isinstance(r, TriageResult) and r.requires_human_review
    # classifier crash too
    monkeypatch.setattr(rules_engine, "classify", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("x")))
    r = triage_service.run_triage(db, text="Pothole on the road")
    assert isinstance(r, TriageResult) and r.requires_human_review and r.category == "other"


# ---------------------------------------------------------------- OpenAI / Ollama adapters with fakes
class _FakeResponses:
    def __init__(self, text, calls):
        self._text, self._calls = text, calls

    def create(self, **kwargs):
        self._calls.append(kwargs)
        return SimpleNamespace(output_text=self._text)


class _FakeOpenAI:
    def __init__(self, text, calls):
        self.responses = _FakeResponses(text, calls)


MODEL_JSON = json.dumps({
    "language": "en", "category": "roads", "subcategory": "pothole", "summary": "A pothole.", "reason": "Fall risk.",
    "confidence": 85, "safety_risk": 40, "public_impact": 40, "issue_scale": 30, "location_sensitivity": 20,
    "duration": 10, "danger_flag": False, "image_observations": ["Visible road surface damage"], "extra": "ignored",
})


def test_openai_adapter_uses_responses_api_with_data_url(monkeypatch):
    calls = []
    monkeypatch.setattr(openai_service, "get_client", lambda: _FakeOpenAI("```json\n" + MODEL_JSON + "\n```", calls))
    names = {"roads": {"name": "Roads", "subcategories": [{"code": "pothole", "name": "Pothole"}]}}
    mt, model, photo = openai_service.triage("Pothole", "en", [(PNG, "image/png")], names)
    assert model == settings.OPENAI_TRIAGE_MODEL and photo == "analysed"
    assert mt.category == "roads" and mt.confidence == 0.85          # 0-100 answer normalised
    kw = calls[0]
    assert kw["model"] == settings.OPENAI_TRIAGE_MODEL and kw["text"] == {"format": {"type": "json_object"}}
    parts = kw["input"][0]["content"]
    assert parts[0]["type"] == "input_text"
    assert parts[1]["type"] == "input_image" and parts[1]["image_url"].startswith("data:image/png;base64,")
    assert "Do not include reasoning" in kw["instructions"]      # no chain-of-thought is requested


def test_openai_adapter_falls_back_to_chat_completions(monkeypatch):
    class ChatOnly:
        def __init__(self):
            self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))
            self.seen = None

        def _create(self, **kwargs):
            self.seen = kwargs
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=MODEL_JSON))])

    client = ChatOnly()
    monkeypatch.setattr(openai_service, "get_client", lambda: client)
    mt, _model, photo = openai_service.triage("Pothole", "en", None, {"roads": {"name": "Roads", "subcategories": []}})
    assert mt.category == "roads" and photo == "not_provided"
    assert client.seen["response_format"] == {"type": "json_object"}


def test_openai_adapter_without_key_and_with_bad_json(monkeypatch):
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "")
    with pytest.raises(ProviderError):
        openai_service.triage("x", "en", None, {})
    monkeypatch.setattr(openai_service, "get_client", lambda: _FakeOpenAI("not json at all", []))
    with pytest.raises(ProviderError):
        openai_service.triage("x", "en", None, {})
    monkeypatch.setattr(openai_service, "get_client", lambda: _FakeOpenAI('{"subcategory": "pothole"}', []))
    with pytest.raises(ProviderError):  # category missing -> Pydantic validation fails
        openai_service.triage("x", "en", None, {})


class _FakeHttpResponse:
    def __init__(self, content):
        self._content = content

    def raise_for_status(self):
        return None

    def json(self):
        return {"message": {"role": "assistant", "content": self._content}}


def test_ollama_adapter_payload_and_photo_handling(monkeypatch):
    sent = {}

    def fake_post(url, json=None, timeout=None):
        sent.update(url=url, payload=json, timeout=timeout)
        return _FakeHttpResponse(MODEL_JSON)

    monkeypatch.setattr(ollama_service.httpx, "post", fake_post)
    monkeypatch.setattr(settings, "OLLAMA_VISION_MODEL", "")
    mt, model, photo = ollama_service.triage("Pothole", "en", [(PNG, "image/png")], {})
    assert sent["url"].endswith("/api/chat") and sent["payload"]["format"] == "json"
    assert sent["payload"]["stream"] is False and sent["payload"]["model"] == settings.OLLAMA_MODEL
    assert "images" not in sent["payload"]["messages"][-1]
    assert photo == "unavailable" and model == settings.OLLAMA_MODEL and mt.category == "roads"

    monkeypatch.setattr(settings, "OLLAMA_VISION_MODEL", "llava-fake")
    _mt, model, photo = ollama_service.triage("Pothole", "en", [(PNG, "image/png")], {})
    assert photo == "analysed" and model == "llava-fake" and len(sent["payload"]["messages"][-1]["images"]) == 1
    _mt, _m, photo = ollama_service.triage("Pothole", "en", None, {})
    assert photo == "not_provided"


def test_ollama_http_failure_becomes_provider_error(monkeypatch):
    import httpx

    def fail(*a, **k):
        raise httpx.ConnectError("refused")

    monkeypatch.setattr(ollama_service.httpx, "post", fail)
    with pytest.raises(ProviderError):
        ollama_service.triage("x", "en", None, {})


# ---------------------------------------------------------------- /ai endpoints
def test_ai_status_and_preview_endpoints(client, make_user):
    _o, officer = make_user("officer", department_code="road_maintenance")
    _c, citizen = make_user("citizen")
    assert client.get("/api/v1/ai/status").status_code == 401
    assert client.get("/api/v1/ai/status", headers=citizen).status_code == 403
    r = client.get("/api/v1/ai/status", headers=officer)
    assert r.status_code == 200
    body = r.json()
    assert [p["name"] for p in body["providers"]] == ["openai", "ollama", "rules"]
    assert body["order"] == ["rules"] and body["vision"] == {"openai": False, "ollama": False}
    assert body["providers"][0]["configured"] is False
    assert "api_key" not in json.dumps(body).lower()

    assert client.post("/api/v1/ai/preview-triage", json={"text": "pothole"}, headers=citizen).status_code == 403
    r = client.post("/api/v1/ai/preview-triage", json={"text": "Deep pothole near the school", "language": "en"},
                    headers=officer)
    assert r.status_code == 200
    data = r.json()
    assert data["category"] == "roads" and data["provider"] == "rules" and data["department_code"] == "road_maintenance"
    assert client.post("/api/v1/ai/preview-triage", json={"text": "x"}, headers=officer).status_code == 422


def test_openai_responses_input_contains_word_json():
    """Regression: the live OpenAI API rejects json_object mode (HTTP 400) unless the INPUT contains the word 'json'."""
    from app.services import openai_service

    captured = {}

    class _Resp:
        output_text = "{}"

    class _Responses:
        def create(self, **kw):
            captured.update(kw)
            return _Resp()

    class _Client:
        responses = _Responses()

    openai_service._responses_call(_Client(), "system prompt", "A pothole near the bus stop", [])
    inputs = captured["input"][0]["content"]
    assert any("json" in part.get("text", "").lower() for part in inputs if part.get("type") == "input_text")
