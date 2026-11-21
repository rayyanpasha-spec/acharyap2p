"""Recognition: certificates, points, achievements, civic games."""
import itertools
import uuid
from datetime import timedelta
from pathlib import Path

import pytest
from sqlalchemy import select

from app.config import settings
from app.models import (AppSetting, Certificate, CivicPointsLedger, Complaint, ComplaintSubmission, GameSession,
                        Notification, UserAchievement)
from app.models.base import utcnow
from app.services import achievement_service, certificate_service, game_service, points_service
from app.services.quiz_bank import QUIZ_BANK

_n = itertools.count(1)


def _mk_complaint(db, user, status="resolved", verified_by="sup-1", category="roads", subcategory="pothole",
                  via="text", created_at=None, **kw):
    n = next(_n)
    c = Complaint(
        created_by_user_id=user["id"], original_description="Test report", category=category, subcategory=subcategory,
        status=status, verified_by_user_id=verified_by, submitted_via=via, latitude=12.97, longitude=77.59,
        public_ticket_number=f"CL-RT-{uuid.uuid4().hex[:8].upper()}", resolved_at=utcnow() if status == "resolved" else None, **kw)
    if created_at:
        c.created_at = created_at
    db.add(c)
    db.flush()
    db.add(ComplaintSubmission(complaint_id=c.id, user_id=user["id"], description="Test report", via=via, is_primary=True))
    db.commit()
    return c


def _ledger(db, user_id):
    return list(db.scalars(select(CivicPointsLedger).where(CivicPointsLedger.user_id == user_id)))


@pytest.fixture(autouse=True)
def _no_server_speed_check(monkeypatch):
    monkeypatch.setattr(game_service, "MIN_SERVER_ELAPSED_SECONDS", 0.0)


# ------------------------------------------------------------------ certificates
def test_no_certificate_before_resolution_or_verification(db, make_user):
    citizen, _ = make_user(name="Asha Rao")
    unresolved = _mk_complaint(db, citizen, status="in_progress", verified_by=None)
    unverified = _mk_complaint(db, citizen, status="resolved", verified_by=None)
    assert certificate_service.issue_for_complaint(db, unresolved, None) is None
    assert certificate_service.issue_for_complaint(db, unverified, None) is None
    db.commit()
    assert db.scalars(select(Certificate).where(Certificate.user_id == citizen["id"])).first() is None
    assert _ledger(db, citizen["id"]) == []


def test_no_points_for_submitting_complaints(db, make_user):
    citizen, _ = make_user()
    _mk_complaint(db, citizen, status="submitted", verified_by=None)
    _mk_complaint(db, citizen, status="in_progress", verified_by=None)
    assert _ledger(db, citizen["id"]) == []
    assert points_service.total_points(db, citizen["id"]) == 0
    assert points_service.verified_contribution_count(db, citizen["id"]) == 0


def test_certificate_issued_once_with_pdf_points_and_notification(db, make_user):
    citizen, _ = make_user(name="Asha Rao")
    supervisor, _ = make_user("supervisor")
    c = _mk_complaint(db, citizen, verified_by=supervisor["id"])
    cert = certificate_service.issue_for_complaint(db, c, supervisor)
    again = certificate_service.issue_for_complaint(db, c, supervisor)
    db.commit()
    assert cert is not None and again.id == cert.id
    assert db.scalars(select(Certificate).where(Certificate.complaint_id == c.id)).all().__len__() == 1
    assert len(cert.code) == 12 and cert.code == cert.code.upper()
    assert cert.user_id == citizen["id"] and cert.display_name == "Asha Rao"
    pdf = Path(settings.CERTIFICATE_STORAGE_DIR) / f"{cert.code}.pdf"
    assert pdf.exists() and pdf.read_bytes().startswith(b"%PDF")
    assert "led to a verified improvement" in cert.contribution

    ledger = {r.reason_code: r.points for r in _ledger(db, citizen["id"])}
    assert ledger["verified_first_report"] == 10 and ledger["verified_resolution"] == 30
    assert points_service.total_points(db, citizen["id"]) == 40
    notes = db.scalars(select(Notification).where(Notification.user_id == citizen["id"],
                                                  Notification.type == "certificate_issued")).all()
    assert len(notes) == 1
    assert points_service.verified_contribution_count(db, citizen["id"]) == 1


def test_supporter_gets_evidence_points_only(db, make_user):
    owner, _ = make_user(name="Ravi Kumar")
    helper, _ = make_user(name="Meena S")
    follower, _ = make_user()
    sup, _ = make_user("supervisor")
    c = _mk_complaint(db, owner, verified_by=sup["id"])
    db.add(ComplaintSubmission(complaint_id=c.id, user_id=helper["id"], description="Also seen", is_primary=False,
                               duplicate_choice="add_evidence"))
    db.commit()
    certificate_service.issue_for_complaint(db, c, sup)
    db.commit()
    assert {r.reason_code for r in _ledger(db, helper["id"])} == {"verified_evidence"}
    assert points_service.total_points(db, helper["id"]) == 10
    assert _ledger(db, follower["id"]) == []
    assert db.scalars(select(Certificate).where(Certificate.user_id == helper["id"])).first() is None
    got = {u.achievement_code for u in db.scalars(select(UserAchievement).where(UserAchievement.user_id == helper["id"]))}
    assert "neighbourhood_watch" in got


def test_points_award_is_deduplicated(db, make_user):
    u, _ = make_user()
    assert points_service.award(db, u["id"], "verified_evidence", 10, "complaint", 5) is not None
    assert points_service.award(db, u["id"], "verified_evidence", 10, "complaint", 5) is None
    assert points_service.award(db, u["id"], "verified_evidence", 10, "complaint", 6) is not None
    db.commit()
    assert points_service.total_points(db, u["id"]) == 20


def test_public_verify_masks_name_and_hides_private_data(client, db, make_user):
    citizen, _ = make_user(name="Asha Rao", email="asha.private@test.example")
    sup, _ = make_user("supervisor")
    c = _mk_complaint(db, citizen, verified_by=sup["id"])
    cert = certificate_service.issue_for_complaint(db, c, sup)
    db.commit()
    r = client.get(f"/api/v1/certificates/verify/{cert.code}")  # no auth header
    assert r.status_code == 200
    body = r.json()
    assert body["valid"] is True and body["display_name"] == "Asha R."
    assert body["ticket_number"] == c.public_ticket_number and body["category_name"] == "Roads"
    text = r.text
    assert "asha.private" not in text and "@" not in text and "Rao" not in text
    for key in ("email", "phone", "latitude", "longitude", "user_id"):
        assert key not in body
    assert client.get("/api/v1/certificates/verify/NOSUCHCODE12").status_code == 404
    assert client.get("/api/v1/certificates/verify/NOSUCHCODE12").json()["valid"] is False


def test_pdf_download_owner_or_staff_only(client, db, make_user):
    owner, h_owner = make_user(name="Asha Rao")
    _, h_other = make_user()
    officer, h_officer = make_user("officer", department_code="road_maintenance")
    sup, _ = make_user("supervisor")
    c = _mk_complaint(db, owner, verified_by=sup["id"])
    cert = certificate_service.issue_for_complaint(db, c, sup)
    db.commit()
    url = f"/api/v1/certificates/{cert.code}/pdf"
    r = client.get(url, headers=h_owner)
    assert r.status_code == 200 and r.content.startswith(b"%PDF")
    assert r.headers["content-type"] == "application/pdf"
    assert "attachment" in r.headers["content-disposition"]
    assert client.get(url, headers=h_other).status_code in (403, 404)
    assert client.get(url).status_code == 401
    assert client.get(url, headers=h_officer).status_code == 200
    assert client.get(f"/api/v1/certificates/{cert.code}", headers=h_other).status_code in (403, 404)
    mine = client.get("/api/v1/certificates", headers=h_owner).json()
    assert [m["code"] for m in mine] == [cert.code] and mine[0]["verify_url"].endswith(f"/verify/{cert.code}")
    assert client.get("/api/v1/certificates", headers=h_other).json() == []


def test_pdf_regenerated_when_file_missing(client, db, make_user):
    owner, h = make_user(name="Asha Rao")
    sup, _ = make_user("supervisor")
    c = _mk_complaint(db, owner, verified_by=sup["id"])
    cert = certificate_service.issue_for_complaint(db, c, sup)
    db.commit()
    certificate_service.pdf_file_path(cert).unlink()
    assert client.get(f"/api/v1/certificates/{cert.code}/pdf", headers=h).content.startswith(b"%PDF")


# ------------------------------------------------------------------ levels
def test_level_progression(db):
    assert points_service.level_for(0, db)["code"] == "none"
    assert points_service.level_for(1, db)["title"] == "Civic Observer"
    lv = points_service.level_for(4, db)
    assert lv["title"] == "Civic Observer" and lv["next_title"] == "Neighbourhood Helper" and lv["next_threshold"] == 5
    assert points_service.level_for(5, db)["title"] == "Neighbourhood Helper"
    assert points_service.level_for(15, db)["title"] == "Community Guardian"
    assert points_service.level_for(30, db)["title"] == "Civic Champion"
    top = points_service.level_for(80, db)
    assert top["title"] == "City Ambassador" and top["next_title"] is None and top["next_threshold"] is None


# ------------------------------------------------------------------ games
def _play(client, h, code):
    r = client.post("/api/v1/games/sessions", json={"game_code": code}, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def _perfect_answers(db, session_id):
    db.expire_all()
    sess = db.get(GameSession, session_id)
    out = []
    for qid, truth in sess.payload["answers"].items():
        out.append({"id": qid, "answer": truth["bin"] if "bin" in truth else truth["answer"]})
    return out


def test_game_data_sizes():
    assert len(QUIZ_BANK) >= 30
    assert len(game_service.CLEAN_CITY_ITEMS) >= 30
    assert all(len(q["options"]) == 4 and q["explanation"] for q in QUIZ_BANK)


def test_session_start_hides_answers(client, make_user):
    _, h = make_user()
    cc = _play(client, h, "clean_city")
    assert len(cc["config"]["items"]) == 12
    assert {b["code"] for b in cc["config"]["bins"]} == {"wet", "dry", "recyclable", "e_waste", "hazardous"}
    cq = _play(client, h, "civic_quiz")
    assert len(cq["config"]["questions"]) == 8
    for payload in (cc, cq):
        txt = str(payload)
        assert "explanation" not in txt and "'answer'" not in txt and "'bin'" not in txt and "correct" not in txt
    assert all(set(q) == {"id", "text", "options"} and len(q["options"]) == 4 for q in cq["config"]["questions"])
    assert client.post("/api/v1/games/sessions", json={"game_code": "nope"}, headers=h).status_code == 404


def test_perfect_score_forged_score_ignored_and_second_submit_409(client, db, make_user):
    _, h = make_user()
    s = _play(client, h, "civic_quiz")
    sid = s["session_id"]
    # forged client score is ignored; wrong answers score 0
    wrong = [{"id": q["id"], "answer": 99} for q in s["config"]["questions"]]
    s2 = _play(client, h, "civic_quiz")
    r = client.post(f"/api/v1/games/sessions/{s2['session_id']}/score",
                    json={"answers": wrong, "duration_seconds": 40, "score": 100, "client_score": 100}, headers=h)
    assert r.status_code == 200 and r.json()["score"] == 0 and r.json()["correct"] == 0
    # perfect answers -> max score
    r = client.post(f"/api/v1/games/sessions/{sid}/score",
                    json={"answers": _perfect_answers(db, sid), "duration_seconds": 40}, headers=h)
    body = r.json()
    assert r.status_code == 200 and body["score"] == body["max_score"] == 100 and body["correct"] == 8
    assert len(body["review"]) == 8 and all(x["correct"] and x["explanation"] for x in body["review"])
    # duplicate completion
    r = client.post(f"/api/v1/games/sessions/{sid}/score",
                    json={"answers": _perfect_answers(db, sid), "duration_seconds": 40}, headers=h)
    assert r.status_code == 409


def test_wrong_owner_and_too_fast_rejected(client, db, make_user, monkeypatch):
    _, h1 = make_user()
    _, h2 = make_user()
    s = _play(client, h1, "clean_city")
    sid = s["session_id"]
    answers = _perfect_answers(db, sid)
    assert client.post(f"/api/v1/games/sessions/{sid}/score", json={"answers": answers, "duration_seconds": 30},
                       headers=h2).status_code in (403, 404)
    # client-declared duration under 3 s
    assert client.post(f"/api/v1/games/sessions/{sid}/score", json={"answers": answers, "duration_seconds": 1},
                       headers=h1).status_code == 400
    # server-measured elapsed time too short (real check re-enabled)
    monkeypatch.setattr(game_service, "MIN_SERVER_ELAPSED_SECONDS", 60.0)
    assert client.post(f"/api/v1/games/sessions/{sid}/score", json={"answers": answers, "duration_seconds": 30},
                       headers=h1).status_code == 400
    # rejected attempts do not consume the session
    monkeypatch.setattr(game_service, "MIN_SERVER_ELAPSED_SECONDS", 0.0)
    r = client.post(f"/api/v1/games/sessions/{sid}/score", json={"answers": answers, "duration_seconds": 30}, headers=h1)
    assert r.status_code == 200 and r.json()["score"] == 100


def test_daily_points_once_per_game_and_weekly_challenge(client, db, make_user):
    u, h = make_user()
    pts = lambda: points_service.total_points(db, u["id"])  # noqa: E731

    def finish(code):
        s = _play(client, h, code)
        r = client.post(f"/api/v1/games/sessions/{s['session_id']}/score",
                        json={"answers": _perfect_answers(db, s["session_id"]), "duration_seconds": 30}, headers=h)
        assert r.status_code == 200, r.text
        return r.json()

    first = finish("civic_quiz")
    assert first["points_awarded"] == 5 and pts() == 5
    again = finish("civic_quiz")           # same game, same day: no more daily points
    assert again["points_awarded"] == 0 and pts() == 5
    second = finish("clean_city")          # second game completes the weekly challenge: 5 daily + 25 weekly
    assert second["points_awarded"] == 30 and pts() == 35
    assert second["weekly_challenge_completed"] is True
    again2 = finish("clean_city")
    assert again2["points_awarded"] == 0 and pts() == 35
    reasons = sorted(r.reason_code for r in _ledger(db, u["id"]))
    assert reasons == ["game_daily", "game_daily", "game_weekly"]

    games = {g["code"]: g for g in client.get("/api/v1/games", headers=h).json()}
    assert games["civic_quiz"]["played_today"] and games["civic_quiz"]["best_score"] == 100
    prof = client.get("/api/v1/civic/profile", headers=h).json()
    assert prof["golden_tree"]["unlocked"] is True and prof["golden_tree"]["message"]
    assert prof["points_total"] == 35
    ach = {a["code"]: a for a in client.get("/api/v1/achievements", headers=h).json()["achievements"]}
    assert ach["quiz_whiz"]["earned"] and ach["tidy_citizen"]["earned"] and ach["golden_tree"]["earned"]


def test_daily_cap_respected(client, db, make_user):
    row = db.get(AppSetting, "points")
    original = dict(row.value)
    row.value = {**original, "daily_game_cap": 5}
    db.commit()
    try:
        u, h = make_user()
        results = []
        for code in ("civic_quiz", "clean_city"):
            s = _play(client, h, code)
            r = client.post(f"/api/v1/games/sessions/{s['session_id']}/score",
                            json={"answers": _perfect_answers(db, s["session_id"]), "duration_seconds": 30}, headers=h)
            results.append(r.json())
        assert results[0]["points_awarded"] == 5 and results[0]["daily_cap_reached"] is False
        daily_total = sum(r.points for r in _ledger(db, u["id"]) if r.reason_code == "game_daily")
        assert daily_total == 5                       # cap held
        assert results[1]["daily_cap_reached"] is True
        assert results[1]["points_awarded"] == 25     # only the weekly challenge, which is outside the daily cap
    finally:
        db.expire_all()
        row = db.get(AppSetting, "points")
        row.value = original
        db.commit()


# ------------------------------------------------------------------ achievements and profile
def test_secret_achievements_hidden_until_earned(client, db, make_user):
    citizen, h = make_user(name="Meena S")
    sup, _ = make_user("supervisor")
    before = client.get("/api/v1/achievements", headers=h)
    assert before.status_code == 200
    items = before.json()["achievements"]
    secret = [a for a in items if a["secret"]]
    assert secret and all(a["title"] == "Secret achievement" and not a["earned"] for a in secret)
    assert "Water Guardian" not in before.text and "water_guardian" not in before.text and "Night Owl" not in before.text
    assert any(a["title"] == "Quiz Whiz" for a in items)

    c = _mk_complaint(db, citizen, verified_by=sup["id"], category="water", subcategory="pipe_leak", via="voice")
    certificate_service.issue_for_complaint(db, c, sup)
    db.commit()
    after = client.get("/api/v1/achievements", headers=h).json()
    by = {a["code"]: a for a in after["achievements"]}
    assert by["water_guardian"]["earned"] and by["water_guardian"]["title"] == "Water Guardian"
    assert by["first_voice"]["earned"] and by["civic_observer"]["earned"]
    assert "night_owl" not in by and "Night Owl" not in str(after)  # still secret and unearned: identity not exposed
    assert sum(1 for a in after["achievements"] if a["secret"] and not a["earned"]) == 4
    assert after["level"]["code"] == "civic_observer" and after["level"]["verified_contributions"] == 1
    assert after["points_total"] == 40


def test_night_owl_uses_ist_hours(db, make_user):
    citizen, _ = make_user()
    sup, _ = make_user("supervisor")
    # 14:30 UTC = 20:00 IST -> night; 06:00 UTC = 11:30 IST -> not night
    night = _mk_complaint(db, citizen, verified_by=sup["id"], category="electricity", subcategory="broken_streetlight",
                          created_at=utcnow().replace(hour=14, minute=30))
    unlocked = achievement_service.evaluate(db, citizen["id"])
    db.commit()
    assert "night_owl" in {u["code"] for u in unlocked}
    other, _ = make_user()
    day = _mk_complaint(db, other, verified_by=sup["id"], category="electricity", subcategory="broken_streetlight",
                        created_at=utcnow().replace(hour=6, minute=0))
    assert "night_owl" not in {u["code"] for u in achievement_service.evaluate(db, other["id"])}
    assert night.id != day.id


def test_civic_profile_growing_city_and_story(client, db, make_user):
    citizen, h = make_user()
    sup, _ = make_user("supervisor")
    _mk_complaint(db, citizen, verified_by=sup["id"], category="roads", subcategory="pothole")
    _mk_complaint(db, citizen, verified_by=sup["id"], category="trees", subcategory="fallen_tree")
    _mk_complaint(db, citizen, verified_by=sup["id"], category="waste", subcategory="overflowing_bin")
    _mk_complaint(db, citizen, verified_by=sup["id"], category="electricity", subcategory="broken_streetlight")
    _mk_complaint(db, citizen, verified_by=sup["id"], category="drainage", subcategory="blocked_drain")
    _mk_complaint(db, citizen, status="in_progress", verified_by=None, category="roads")  # not counted
    r = client.get("/api/v1/civic/profile", headers=h).json()
    assert r["verified_contributions"] == 5 and r["level"]["title"] == "Neighbourhood Helper"
    assert {i["type"] for i in r["growing_city"]} == {"road", "tree", "recycling", "streetlight", "community"}
    assert r["neighbourhood_story"]["road_repairs"] == 1 and r["neighbourhood_story"]["trees_resolved"] == 1
    assert r["neighbourhood_story"]["streetlights_restored"] == 1 and r["neighbourhood_story"]["sanitation_resolved"] == 1
    assert r["neighbourhood_story"]["drainage_resolved"] == 1
    assert r["golden_tree"] == {"unlocked": False, "message": None}
    assert r["history"] == []

    agg = client.get("/api/v1/civic/neighbourhood", headers=h).json()
    assert agg["total_verified_improvements"] >= 5
    assert "ticket_number" not in str(agg) and "display_name" not in str(agg)


def test_issue_sees_unflushed_status_change_like_verify_resolution(db, make_user):
    """verify-resolution sets status/verified_by and calls issue_for_complaint before committing."""
    citizen, _ = make_user(name="Asha Rao")
    sup, _ = make_user("supervisor")
    c = _mk_complaint(db, citizen, status="awaiting_verification", verified_by=None)
    c.status, c.verified_by_user_id, c.resolved_at = "resolved", sup["id"], utcnow()   # not flushed or committed
    cert = certificate_service.issue_for_complaint(db, c, sup)
    db.commit()
    assert cert is not None
    got = {u.achievement_code for u in db.scalars(select(UserAchievement).where(UserAchievement.user_id == citizen["id"]))}
    assert "civic_observer" in got
