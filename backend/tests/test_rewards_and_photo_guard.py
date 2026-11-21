"""Civic reward (every 10 resolved + verified reports) and the photo-vs-text mismatch guard."""
import uuid

import pytest
from sqlalchemy import select

from app.config import settings
from app.models import AppSetting, CivicReward, Complaint, ComplaintSubmission, Notification
from app.models.base import utcnow
from app.schemas.triage import TriageResult
from app.services import certificate_service, reward_service
from tests.test_intake import API, create, form, jpeg_bytes, unique_spot


# ------------------------------------------------------------------ rewards
def _report(db, user, status="resolved", verified_by="sup-1"):
    c = Complaint(created_by_user_id=user["id"], original_description="Test report", category="roads", subcategory="pothole",
                  status=status, verified_by_user_id=verified_by, submitted_via="text", latitude=12.97, longitude=77.59,
                  public_ticket_number=f"CL-RW-{uuid.uuid4().hex[:8].upper()}",
                  resolved_at=utcnow() if status == "resolved" else None)
    db.add(c)
    db.flush()
    db.add(ComplaintSubmission(complaint_id=c.id, user_id=user["id"], description="Test report", via="text", is_primary=True))
    db.commit()
    return c


def _verify(db, c, sup):
    certificate_service.issue_for_complaint(db, c, sup)
    db.commit()


def test_nine_resolved_reports_earn_nothing_tenth_earns_500(db, make_user):
    citizen, _ = make_user("citizen")
    sup, _ = make_user("supervisor")
    for _i in range(9):
        _verify(db, _report(db, citizen, verified_by=sup["id"]), sup)
    assert db.scalars(select(CivicReward).where(CivicReward.user_id == citizen["id"])).all() == []
    p = reward_service.progress(db, citizen["id"])
    assert p["resolved_count"] == 9 and p["remaining"] == 1 and p["rewards_earned"] == 0

    _verify(db, _report(db, citizen, verified_by=sup["id"]), sup)
    rows = db.scalars(select(CivicReward).where(CivicReward.user_id == citizen["id"])).all()
    assert len(rows) == 1 and rows[0].amount == 500 and rows[0].currency == "INR" and rows[0].status == "earned"
    assert len(rows[0].complaint_ids) == 10
    note = db.scalars(select(Notification).where(Notification.user_id == citizen["id"], Notification.type == "reward_earned")).all()
    assert len(note) == 1 and "500" in note[0].title


def test_only_resolved_and_verified_reports_count(db, make_user):
    citizen, _ = make_user("citizen")
    sup, _ = make_user("supervisor")
    for _i in range(10):                      # ten reports, but none of them resolved
        _report(db, citizen, status="in_progress", verified_by=None)
    _report(db, citizen, status="resolved", verified_by=None)   # resolved but never verified by a supervisor
    assert reward_service.evaluate(db, citizen["id"]) == []
    db.commit()
    assert reward_service.progress(db, citizen["id"])["resolved_count"] == 0
    # resolving 9 of the open ones is still not enough; the reward needs 10 resolved
    for c in db.scalars(select(Complaint).where(Complaint.created_by_user_id == citizen["id"], Complaint.status == "in_progress")).all()[:9]:
        c.status, c.verified_by_user_id, c.resolved_at = "resolved", sup["id"], utcnow()
    db.commit()
    assert reward_service.evaluate(db, citizen["id"]) == []


def test_reward_is_granted_once_and_second_block_needs_ten_more(db, make_user):
    citizen, _ = make_user("citizen")
    sup, _ = make_user("supervisor")
    for _i in range(10):
        _report(db, citizen, verified_by=sup["id"])
    assert len(reward_service.evaluate(db, citizen["id"])) == 1
    db.commit()
    assert reward_service.evaluate(db, citizen["id"]) == []            # idempotent
    for _i in range(9):
        _report(db, citizen, verified_by=sup["id"])
    assert reward_service.evaluate(db, citizen["id"]) == []            # 19 resolved: still one reward
    _report(db, citizen, verified_by=sup["id"])
    got = reward_service.evaluate(db, citizen["id"])
    db.commit()
    assert [r.milestone for r in got] == [2]
    assert reward_service.progress(db, citizen["id"])["total_earned"] == 1000


def test_supporting_someone_elses_report_does_not_count(db, make_user):
    owner, _ = make_user("citizen")
    helper, _ = make_user("citizen")
    sup, _ = make_user("supervisor")
    for _i in range(10):
        c = _report(db, owner, verified_by=sup["id"])
        db.add(ComplaintSubmission(complaint_id=c.id, user_id=helper["id"], description="me too", via="text", is_primary=False))
    db.commit()
    assert reward_service.evaluate(db, helper["id"]) == []
    assert len(reward_service.evaluate(db, owner["id"])) == 1


def test_amount_and_threshold_are_configurable_and_can_be_disabled(db, make_user):
    citizen, _ = make_user("citizen")
    sup, _ = make_user("supervisor")
    db.merge(AppSetting(key="rewards", value={"enabled": False}))
    db.commit()
    for _i in range(10):
        _report(db, citizen, verified_by=sup["id"])
    assert reward_service.evaluate(db, citizen["id"]) == []
    db.merge(AppSetting(key="rewards", value={"enabled": True, "reports_required": 5, "amount": 250, "currency": "inr"}))
    db.commit()
    got = reward_service.evaluate(db, citizen["id"])
    db.commit()
    assert [(r.milestone, r.amount, r.currency) for r in got] == [(1, 250, "INR"), (2, 250, "INR")]
    db.merge(AppSetting(key="rewards", value=dict(reward_service.DEFAULTS)))
    db.commit()


def test_rewards_api_progress_and_admin_fulfil(client, db, make_user):
    citizen, ch = make_user("citizen")
    sup, _ = make_user("supervisor")
    _, ah = make_user("admin")
    for _i in range(10):
        _verify(db, _report(db, citizen, verified_by=sup["id"]), sup)
    me = client.get(f"{API}/rewards/me", headers=ch).json()
    assert me["resolved_count"] == 10 and me["rewards_earned"] == 1 and me["total_earned"] == 500
    assert me["rewards"][0]["status"] == "earned" and me["rewards"][0]["display"].endswith("500")

    assert client.get(f"{API}/rewards", headers=ch).status_code == 403          # admin only
    lst = client.get(f"{API}/rewards", headers=ah, params={"status": "earned"}).json()
    row = next(i for i in lst["items"] if i["user_id"] == citizen["id"])
    assert row["user_email"] == citizen["email"]
    assert client.post(f"{API}/rewards/{row['id']}/fulfil", json={"note": "UPI ref 123"}, headers=ch).status_code == 403
    ok = client.post(f"{API}/rewards/{row['id']}/fulfil", json={"note": "UPI ref 123"}, headers=ah)
    assert ok.status_code == 200 and ok.json()["status"] == "fulfilled"
    assert client.post(f"{API}/rewards/{row['id']}/fulfil", json={}, headers=ah).status_code == 409
    assert client.get(f"{API}/rewards/me", headers=ch).json()["rewards"][0]["status"] == "fulfilled"


# ------------------------------------------------------------------ photo vs text mismatch
def _mismatch(reason="The photo shows a cat indoors, not a pothole."):
    return TriageResult(category="roads", subcategory="pothole", summary="x", photo_analysis="analysed",
                        photo_mismatch=True, photo_mismatch_reason=reason)


def _match():
    return TriageResult(category="roads", subcategory="pothole", summary="x", photo_analysis="analysed")


def test_mismatched_photo_is_refused_and_creates_no_ticket(client, db, make_user, monkeypatch):
    _, h = make_user("citizen")
    lat, lng = unique_spot()
    monkeypatch.setattr("app.services.triage_service.run_triage", lambda *a, **k: _mismatch())
    before = db.query(Complaint).count()
    r = create(client, h, lat, lng, files=[("images", ("cat.jpg", jpeg_bytes(), "image/jpeg"))])
    assert r.status_code == 422
    assert "does not match your description" in r.json()["detail"] and "cat" in r.json()["detail"]
    db.expire_all()
    assert db.query(Complaint).count() == before


def test_matching_photo_is_accepted_and_guard_can_be_switched_off(client, db, make_user, monkeypatch):
    _, h = make_user("citizen")
    monkeypatch.setattr("app.services.triage_service.run_triage", lambda *a, **k: _match())
    lat, lng = unique_spot()
    assert create(client, h, lat, lng, files=[("images", ("ok.jpg", jpeg_bytes(), "image/jpeg"))]).status_code == 201
    monkeypatch.setattr("app.services.triage_service.run_triage", lambda *a, **k: _mismatch())
    monkeypatch.setattr(settings, "BLOCK_PHOTO_TEXT_MISMATCH", False)
    lat, lng = unique_spot()
    assert create(client, h, lat, lng, files=[("images", ("x.jpg", jpeg_bytes(), "image/jpeg"))]).status_code == 201


def test_preview_reports_the_mismatch_so_the_ui_can_block(client, make_user, monkeypatch):
    _, h = make_user("citizen")
    monkeypatch.setattr("app.services.triage_service.run_triage", lambda *a, **k: _mismatch())
    lat, lng = unique_spot()
    r = client.post(f"{API}/complaints/preview", data=form(lat, lng), headers=h,
                    files=[("images", ("cat.jpg", jpeg_bytes(), "image/jpeg"))])
    assert r.status_code == 200
    t = r.json()["triage"]
    assert t["photo_mismatch"] is True and "cat" in t["photo_mismatch_reason"]


def test_mismatched_evidence_photo_is_refused(client, make_user, monkeypatch):
    _, h = make_user("citizen")
    lat, lng = unique_spot()
    monkeypatch.setattr("app.services.triage_service.run_triage", lambda *a, **k: _match())
    tn = create(client, h, lat, lng).json()["ticket_number"]
    monkeypatch.setattr("app.services.triage_service.run_triage", lambda *a, **k: _mismatch())
    r = client.post(f"{API}/complaints/{tn}/evidence", data={"note": "more"}, headers=h,
                    files=[("images", ("cat.jpg", jpeg_bytes(), "image/jpeg"))])
    assert r.status_code == 422 and "does not match" in r.json()["detail"]
    assert client.post(f"{API}/complaints/{tn}/evidence", data={"note": "just words"}, headers=h).status_code == 200  # text-only is fine


def test_only_a_real_vision_analysis_can_flag_a_mismatch(db):
    """The deterministic path (no vision AI) must never claim a mismatch."""
    from app.services import triage_service
    res = triage_service.run_triage(db, text="Big pothole on the main road", images=[(jpeg_bytes(), "image/jpeg")])
    assert res.photo_mismatch is False and res.photo_analysis == "unavailable"


def test_model_json_conflict_becomes_mismatch(db, monkeypatch):
    """A vision model that answers photo_text_conflict=true produces a refused-able result with its reason."""
    from app.services import openai_service, triage_service
    from app.services.classification_service import parse_model_json

    mt = parse_model_json('{"category":"roads","subcategory":"pothole","summary":"pothole","confidence":0.9,'
                          '"photo_text_conflict":true,"photo_mismatch_reason":"Photo shows a plate of food."}')
    monkeypatch.setattr(openai_service, "triage", lambda *a, **k: (mt, "gpt-test", "analysed"))
    monkeypatch.setattr(settings, "AI_PROVIDER_ORDER", "openai,rules")
    res = triage_service.run_triage(db, text="Big pothole on the main road", images=[(jpeg_bytes(), "image/jpeg")])
    assert res.photo_mismatch is True and res.photo_mismatch_reason == "Photo shows a plate of food."
    # no photo attached -> a "conflict" from the model is meaningless and must not block
    res2 = triage_service.run_triage(db, text="Big pothole on the main road")
    assert res2.photo_mismatch is False


# ------------------------------------------------------------------ dedicated photo check (OpenAI)
class _FakeResp:
    def __init__(self, text):
        self.output_text = text


class _FakeClient:
    def __init__(self, text=None, boom=False):
        self.text, self.boom = text, boom
        self.responses = self

    def create(self, **kw):
        if self.boom:
            raise RuntimeError("api down")
        assert "json" in kw["input"][0]["content"][0]["text"].lower()       # JSON mode needs the word in the input
        assert any(c["type"] == "input_image" for c in kw["input"][0]["content"])
        return _FakeResp(self.text)


def _photo_match(monkeypatch, client):
    from app.services import openai_service
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(openai_service, "get_client", lambda: client)
    return openai_service.photo_match("Big pothole on the road", [(jpeg_bytes(), "image/jpeg")])


def test_photo_match_parses_a_mismatch_and_a_match(monkeypatch):
    bad = _photo_match(monkeypatch, _FakeClient('{"shows":"A plate of food","matches":false,"reason":"Food, not a pothole."}'))
    assert bad == (False, "A plate of food", "Food, not a pothole.")
    good = _photo_match(monkeypatch, _FakeClient('```json\n{"shows":"A road hole","matches":true,"reason":null}\n```'))
    assert good == (True, "A road hole", None)
    assert _photo_match(monkeypatch, _FakeClient('{"matches":"false","shows":"x"}'))[0] is False   # "false" as a string


def test_photo_match_failures_are_unknown_never_a_mismatch(monkeypatch):
    assert _photo_match(monkeypatch, _FakeClient(boom=True)) is None
    assert _photo_match(monkeypatch, _FakeClient("not json at all")) is None
    assert _photo_match(monkeypatch, _FakeClient('{"shows":"x"}')) is None          # no verdict -> unknown
    from app.services import openai_service
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "")
    assert openai_service.photo_match("text", [(jpeg_bytes(), "image/jpeg")]) is None


def test_triage_uses_the_dedicated_check_and_only_when_openai_analysed(db, monkeypatch):
    from app.services import openai_service, triage_service
    from app.services.classification_service import parse_model_json

    mt = parse_model_json('{"category":"roads","subcategory":"pothole","summary":"pothole","confidence":0.9}')   # no flag from the big call
    monkeypatch.setattr(openai_service, "triage", lambda *a, **k: (mt, "gpt-test", "analysed"))
    monkeypatch.setattr(settings, "AI_PROVIDER_ORDER", "openai,rules")
    calls = []
    monkeypatch.setattr(openai_service, "photo_match",
                        lambda text, images: calls.append(1) or (False, "A plate of food", "The photo shows food, not a pothole."))
    res = triage_service.run_triage(db, text="Big pothole on the main road", images=[(jpeg_bytes(), "image/jpeg")])
    assert res.photo_mismatch is True and res.photo_mismatch_reason == "The photo shows food, not a pothole." and calls == [1]
    # no photo -> the check is not even called
    calls.clear()
    assert triage_service.run_triage(db, text="Big pothole on the main road").photo_mismatch is False and calls == []
    # the check says it matches -> accepted, and "unknown" (None) is accepted too
    monkeypatch.setattr(openai_service, "photo_match", lambda text, images: (True, "A road hole", None))
    assert triage_service.run_triage(db, text="Big pothole", images=[(jpeg_bytes(), "image/jpeg")]).photo_mismatch is False
    monkeypatch.setattr(openai_service, "photo_match", lambda text, images: None)
    assert triage_service.run_triage(db, text="Big pothole", images=[(jpeg_bytes(), "image/jpeg")]).photo_mismatch is False
