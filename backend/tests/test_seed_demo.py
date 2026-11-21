"""Demo seeder tests. SEED_DEMO_DATA is false in the test env, so we call seed_demo.seed(db) directly.
The module-scoped fixture removes every demo row afterwards so other test modules that share the same temporary
database never see demo complaints/users."""
from collections import Counter

import pytest
from sqlalchemy import delete, func, select

from app import seed_demo
from app.config import settings
from app.core.constants import CATEGORIES, SEVERITIES
from app.core.demo_accounts import DEMO_ACCOUNTS
from app.core.user_store import get_user_store
from app.models import (
    AiAnalysis, Assignment, Certificate, CivicPointsLedger, Comment, Complaint, ComplaintFollower, ComplaintImage,
    ComplaintSubmission, DuplicateCandidate, Notification, ResolutionEvidence, StatusHistory, User, UserAchievement,
    VoiceTranscript,
)


def _counts(db):
    return {
        "complaints": db.scalar(select(func.count()).select_from(Complaint).where(Complaint.is_demo == True)),  # noqa: E712
        "submissions": db.scalar(select(func.count()).select_from(ComplaintSubmission)),
        "history": db.scalar(select(func.count()).select_from(StatusHistory)),
        "comments": db.scalar(select(func.count()).select_from(Comment)),
        "evidence": db.scalar(select(func.count()).select_from(ResolutionEvidence)),
        "images": db.scalar(select(func.count()).select_from(ComplaintImage)),
        "notifications": db.scalar(select(func.count()).select_from(Notification)),
        "followers": db.scalar(select(func.count()).select_from(ComplaintFollower)),
        "users": len(get_user_store().list(limit=1000)),
    }


def _wipe(db):
    ids = list(db.scalars(select(Complaint.id).where(Complaint.is_demo == True)))  # noqa: E712
    uids = list(db.scalars(select(User.id).where(User.is_demo == True)))  # noqa: E712
    if ids:
        for model in (Notification, VoiceTranscript):
            col = model.complaint_id
            db.execute(delete(model).where(col.in_(ids)))
        db.execute(delete(DuplicateCandidate).where(DuplicateCandidate.candidate_complaint_id.in_(ids)))
        db.execute(delete(Certificate).where(Certificate.complaint_id.in_(ids)))
        for model in (StatusHistory, Comment, Assignment, ResolutionEvidence, ComplaintImage, ComplaintFollower,
                      ComplaintSubmission, AiAnalysis):
            db.execute(delete(model).where(model.complaint_id.in_(ids)))
        db.execute(delete(Complaint).where(Complaint.id.in_(ids)))
    if uids:
        db.execute(delete(Notification).where(Notification.user_id.in_(uids)))
        db.execute(delete(CivicPointsLedger).where(CivicPointsLedger.user_id.in_(uids)))
        db.execute(delete(UserAchievement).where(UserAchievement.user_id.in_(uids)))
        db.execute(delete(User).where(User.id.in_(uids)))
    db.commit()


@pytest.fixture(scope="module")
def seeded(client):
    from app.database import SessionLocal

    with SessionLocal() as db:
        seed_demo.seed(db)
        first = _counts(db)
        seed_demo.seed(db)   # second run must change nothing
        second = _counts(db)
    yield first, second
    with SessionLocal() as db:
        _wipe(db)


def test_seed_is_idempotent(seeded):
    first, second = seeded
    assert first == second
    assert first["complaints"] >= 24
    assert first["complaints"] <= 28


def test_all_demo_flagged_and_no_invented_boundaries(seeded, db):
    rows = db.scalars(select(Complaint).where(Complaint.is_demo == True)).all()  # noqa: E712
    assert rows
    for c in rows:
        assert c.service_area_status == "needs_manual_routing"
        assert c.city_corporation_code is None and c.ward_code is None and c.division_code is None
        assert c.boundary_dataset_version is None
        assert c.public_ticket_number == f"CL-{c.created_at.year}-{c.id:05d}"
        assert c.ai_provider == "rules"
        assert c.image_observations == []
        assert c.severity_reason and c.summary


def test_categories_severities_languages_statuses_covered(seeded, db):
    rows = db.scalars(select(Complaint).where(Complaint.is_demo == True)).all()  # noqa: E712
    cats = {c.category for c in rows}
    assert cats >= set(CATEGORIES) - {"other"}
    assert {c.severity for c in rows} == set(SEVERITIES)
    subs = {c.subcategory for c in rows}
    assert {"exposed_wiring", "broken_streetlight", "open_manhole", "flooding"} <= subs
    assert {c.original_language for c in rows} == {"en", "kn", "hi", "ta", "te", "ml"}
    for c in rows:
        if c.original_language != "en":
            assert c.translated_description
    st = Counter(c.status for c in rows)
    assert st["resolved"] == 3
    for needed in ("submitted", "ai_review", "verified", "assigned", "in_progress", "awaiting_verification"):
        assert st[needed] >= 1, needed
    assert st["submitted"] + st["ai_review"] >= 4


def test_routing_follows_reference_rules(seeded, db):
    def dept(sub):
        return db.scalars(select(Complaint).where(Complaint.is_demo == True, Complaint.subcategory == sub)).first()  # noqa: E712

    assert dept("exposed_wiring").authoritative_department_code == "bescom_network"
    assert dept("exposed_wiring").responsible_agency_kind == "bescom"
    assert dept("exposed_wiring").requires_human_review is True
    assert dept("broken_streetlight").authoritative_department_code == "electrical"
    assert dept("pipe_leak").authoritative_department_code == "bwssb_water_sewerage"
    assert dept("flooding").authoritative_department_code == "stormwater_drain"
    assert dept("open_manhole").authoritative_department_code == "stormwater_drain"


def test_every_complaint_has_submission_and_consistent_history(seeded, db):
    rows = db.scalars(select(Complaint).where(Complaint.is_demo == True)).all()  # noqa: E712
    for c in rows:
        subs = db.scalars(select(ComplaintSubmission).where(ComplaintSubmission.complaint_id == c.id)).all()
        assert subs, c.public_ticket_number
        assert sum(1 for s in subs if s.is_primary) == 1
        hist = db.scalars(select(StatusHistory).where(StatusHistory.complaint_id == c.id)
                          .order_by(StatusHistory.created_at, StatusHistory.id)).all()
        assert hist and hist[0].from_status is None and hist[0].to_status == "submitted"
        assert hist[-1].to_status == c.status
        for a, b in zip(hist, hist[1:]):
            assert b.from_status == a.to_status
        assert c.status != "resolved" or (c.resolved_at and c.verified_by_user_id)
        if c.status in ("assigned", "in_progress", "awaiting_verification", "resolved"):
            assert c.assigned_worker_id


def test_assigned_workers_and_supervisor_verification(seeded, db):
    store = get_user_store()
    w1, w2 = store.get_by_email("worker1@civiclens.demo"), store.get_by_email("worker2@civiclens.demo")
    sup = store.get_by_email("supervisor@civiclens.demo")
    rows = db.scalars(select(Complaint).where(Complaint.is_demo == True)).all()  # noqa: E712
    assert {c.assigned_worker_id for c in rows if c.assigned_worker_id} == {w1["id"], w2["id"]}
    resolved = [c for c in rows if c.status == "resolved"]
    assert len(resolved) == 3
    assert all(c.verified_by_user_id == sup["id"] for c in resolved)


def test_same_user_nearby_duplicates(seeded, db):
    citizen = get_user_store().get_by_email("citizen@civiclens.demo")
    mine = db.scalars(select(Complaint).where(Complaint.is_demo == True,  # noqa: E712
                                              Complaint.created_by_user_id == citizen["id"],
                                              Complaint.status.in_(("submitted", "ai_review", "verified")))).all()
    pairs = []
    for i, a in enumerate(mine):
        for b in mine[i + 1:]:
            d = seed_demo._haversine_m(a.latitude, a.longitude, b.latitude, b.longitude)
            if a.category == b.category and d <= 100:
                assert 50 <= d <= 95, d
                assert a.original_description != b.original_description
                pairs.append((a, b))
    assert len(pairs) >= 2
    assert db.scalar(select(func.count()).select_from(DuplicateCandidate).where(DuplicateCandidate.same_reporter == True)) >= 2  # noqa: E712


def test_community_incident_with_three_supporters(seeded, db):
    rows = db.scalars(select(Complaint).where(Complaint.is_demo == True)).all()  # noqa: E712
    found = None
    for c in rows:
        supporters = db.scalars(select(ComplaintSubmission).where(ComplaintSubmission.complaint_id == c.id,
                                                                  ComplaintSubmission.is_primary == False)).all()  # noqa: E712
        if len(supporters) >= 3:
            found = (c, supporters)
    assert found, "no community incident"
    c, supporters = found
    assert len({s.user_id for s in supporters}) >= 3
    assert c.created_by_user_id not in {s.user_id for s in supporters}
    assert all(s.duplicate_choice == "add_evidence" for s in supporters)
    followers = db.scalars(select(ComplaintFollower).where(ComplaintFollower.complaint_id == c.id)).all()
    assert len(followers) >= 2


def test_before_after_evidence_and_images(seeded, db):
    # scope to DEMO complaints only: other test modules share this DB and create evidence rows without images
    demo_ids = list(db.scalars(select(Complaint.id).where(Complaint.is_demo == True)))  # noqa: E712
    ev = db.scalars(select(ResolutionEvidence).where(ResolutionEvidence.complaint_id.in_(demo_ids))).all()
    kinds = Counter(e.kind for e in ev)
    assert kinds["before"] >= 3 and kinds["after"] >= 3
    for e in ev:
        img = db.get(ComplaintImage, e.image_id)
        assert img is not None and img.kind == e.kind
        assert img.content_type == "image/png"
        from app.services.upload_service import image_path
        assert image_path(img).exists()
    verified_after = [e for e in ev if e.kind == "after" and e.verified]
    assert len(verified_after) == 3


def test_certificate_attempt_does_not_break_and_notifications_exist(seeded, db):
    citizen = get_user_store().get_by_email("citizen@civiclens.demo")
    notes = db.scalars(select(Notification).where(Notification.user_id == citizen["id"])).all()
    assert len(notes) >= 5
    assert any(not n.read for n in notes) and any(n.read for n in notes)
    # certificate is only present when the recognition service is implemented; if it is, it must belong to the citizen
    demo_ids = list(db.scalars(select(Complaint.id).where(Complaint.is_demo == True)))  # noqa: E712
    cert = db.scalars(select(Certificate).where(Certificate.complaint_id.in_(demo_ids))).first()
    if cert is not None:
        assert cert.user_id == citizen["id"]


def test_demo_users_exist_and_can_log_in(seeded, client):
    store = get_user_store()
    for email, _name, role, dept, _lang in DEMO_ACCOUNTS:
        u = store.get_by_email(email)
        assert u and u["is_demo"] is True and u["role"] == role and u["department_code"] == dept
    for email in ("citizen@civiclens.demo", "worker1@civiclens.demo", "supervisor@civiclens.demo",
                  "admin@civiclens.demo", "neighbour1@civiclens.demo"):
        r = client.post("/api/v1/auth/login", json={"email": email, "password": settings.DEMO_PASSWORD})
        assert r.status_code == 200, (email, r.text)
        assert r.json()["user"]["email"] == email
    assert client.post("/api/v1/auth/login",
                       json={"email": "citizen@civiclens.demo", "password": "wrong-password"}).status_code in (400, 401)
