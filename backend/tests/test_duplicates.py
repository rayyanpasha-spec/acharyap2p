"""Duplicate detection: radii, privacy, text/category rules, persistence."""
import itertools

from sqlalchemy import select

from app.models import Complaint, DuplicateCandidate
from app.services.duplicate_service import text_similarity

API = "/api/v1"
_spot = itertools.count(1)
POTHOLE = "Large pothole in the middle of the main road near the bus stop, two wheelers are falling"


def spot():
    n = next(_spot)
    return 12.80 + n * 0.012, 77.70 + (n % 5) * 0.02   # inside the fallback radius, away from test_intake spots


def post_complaint(client, h, lat, lng, desc=POTHOLE, **extra):
    d = {"description": desc, "original_language": "en", "latitude": str(lat), "longitude": str(lng),
         "location_source": "map_pin", **extra}
    r = client.post(f"{API}/complaints", data=d, headers=h)
    assert r.status_code == 201, r.text
    return r.json()["ticket_number"]


def check(client, h, lat, lng, desc=POTHOLE, **extra):
    body = {"description": desc, "latitude": lat, "longitude": lng, **extra}
    r = client.post(f"{API}/complaints/duplicate-check", json=body, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def test_same_user_flagged_within_150m_not_at_400m(client, make_user):
    _u, h = make_user()
    lat, lng = spot()
    tn = post_complaint(client, h, lat, lng)
    near = check(client, h, lat + 0.0012, lng)            # ~133 m
    assert near["has_possible_duplicates"] is True
    m = near["matches"][0]
    assert m["ticket_number"] == tn and m["same_reporter"] is True and 100 < m["distance_m"] <= 150
    assert near["recommended_action"] == "follow_or_add_evidence"
    assert near["settings"] == {"same_user_radius_m": 150, "community_radius_m": 100, "lookback_days": 180}
    assert m["latitude"] == lat   # own report: exact coordinates
    far = check(client, h, lat + 0.0036, lng)             # ~400 m
    assert far["has_possible_duplicates"] is False and far["matches"] == [] and far["recommended_action"] == "none"


def test_other_user_flagged_within_100m_without_identity_leak(client, make_user):
    owner, ho = make_user(name="Priya Secret Name")
    _o, hother = make_user()
    lat, lng = spot()
    lat += 0.00012345
    tn = post_complaint(client, ho, lat, lng)
    res = check(client, hother, lat + 0.0007, lng)         # ~78 m
    assert res["has_possible_duplicates"] and res["matches"][0]["ticket_number"] == tn
    m = res["matches"][0]
    assert m["same_reporter"] is False and m["i_follow"] is False
    text = str(res)
    assert owner["id"] not in text and owner["email"] not in text and "Priya" not in text
    assert "reporter" not in m and "user" not in " ".join(m.keys())
    assert m["latitude"] == round(lat, 4) and m["longitude"] == round(lng, 4)
    outside = check(client, hother, lat + 0.0011, lng)     # ~122 m > 100 m community radius
    assert outside["has_possible_duplicates"] is False


def test_unrelated_text_and_conflicting_category_not_matched(client, make_user):
    _u, h = make_user()
    lat, lng = spot()
    post_complaint(client, h, lat, lng)
    r = check(client, h, lat + 0.0002, lng, desc="Streetlight not working for three nights, area is dark",
              category_hint="electricity")
    assert r["has_possible_duplicates"] is False            # same place, different issue: location alone is not enough
    r2 = check(client, h, lat + 0.0002, lng, desc="Overflowing garbage bin, plastic everywhere", category_hint="waste")
    assert r2["has_possible_duplicates"] is False


def test_duplicate_candidates_persisted_as_shown(client, make_user, db):
    u, h = make_user()
    lat, lng = spot()
    tn = post_complaint(client, h, lat, lng)
    _o, h2 = make_user()
    check(client, h2, lat, lng + 0.0004)
    check(client, h2, lat, lng + 0.0004)       # repeated checks do not pile up rows
    cid = db.scalars(select(Complaint.id).where(Complaint.public_ticket_number == tn)).one()
    rows = db.scalars(select(DuplicateCandidate).where(DuplicateCandidate.candidate_complaint_id == cid)).all()
    assert len(rows) == 1 and rows[0].decision == "shown" and rows[0].same_reporter is False
    assert rows[0].distance_m < 100


def test_decision_recorded_when_following_and_continuing(client, make_user, db):
    _a, ha = make_user()
    b, hb = make_user()
    lat, lng = spot()
    tn = post_complaint(client, ha, lat, lng)
    check(client, hb, lat, lng + 0.0004)
    r = client.post(f"{API}/complaints", headers=hb, data={
        "description": POTHOLE, "latitude": str(lat), "longitude": str(lng + 0.0004), "existing_incident_action": "follow",
        "existing_ticket_id": tn})
    assert r.status_code == 201
    cid = db.scalars(select(Complaint.id).where(Complaint.public_ticket_number == tn)).one()
    db.expire_all()
    row = db.scalars(select(DuplicateCandidate).where(DuplicateCandidate.candidate_complaint_id == cid,
                                                      DuplicateCandidate.user_id == b["id"])).one()
    assert row.decision == "followed"
    # now the same citizen insists it is a different issue -> continued_new + submission marked "different"
    check(client, hb, lat, lng + 0.0004)
    tn2 = post_complaint(client, hb, lat, lng + 0.0004, duplicate_override_reason="Different pothole on the other lane")
    db.expire_all()
    rows = db.scalars(select(DuplicateCandidate).where(DuplicateCandidate.user_id == b["id"])).all()
    assert any(x.decision == "continued_new" and x.complaint_id for x in rows)
    from app.models import ComplaintSubmission
    cid2 = db.scalars(select(Complaint.id).where(Complaint.public_ticket_number == tn2)).one()
    sub = db.scalars(select(ComplaintSubmission).where(ComplaintSubmission.complaint_id == cid2)).one()
    assert sub.duplicate_choice == "different" and sub.duplicate_override_reason.startswith("Different")


def test_footprint_categories_use_double_radius(client, make_user, db):
    _a, ha = make_user()
    _b, hb = make_user()
    lat, lng = spot()
    tn = post_complaint(client, ha, lat, lng, desc="Road flooding after rain, water over the whole junction")
    row = db.scalars(select(Complaint).where(Complaint.public_ticket_number == tn)).one()
    row.category, row.subcategory = "drainage", "flooding"      # force the footprint-larger category
    db.commit()
    r = check(client, hb, lat + 0.0016, lng,       # ~178 m: only inside the 2x radius
              desc="Road flooding after rain, water over the whole junction")
    assert r["has_possible_duplicates"] and r["matches"][0]["ticket_number"] == tn


def test_rejected_and_old_complaints_ignored(client, make_user, db):
    _a, ha = make_user()
    tn = post_complaint(client, ha, *spot())
    row = db.scalars(select(Complaint).where(Complaint.public_ticket_number == tn)).one()
    lat, lng = row.latitude, row.longitude
    row.status = "rejected"
    db.commit()
    assert check(client, ha, lat, lng)["has_possible_duplicates"] is False
    row.status = "resolved"
    db.commit()
    res = check(client, ha, lat, lng)
    assert res["has_possible_duplicates"] and res["matches"][0]["status"] == "resolved"
    from datetime import timedelta
    row.created_at = row.created_at - timedelta(days=400)
    db.commit()
    assert check(client, ha, lat, lng)["has_possible_duplicates"] is False


def test_validation_and_roles(client, make_user):
    _u, h = make_user()
    _o, ho = make_user("officer")
    body = {"description": POTHOLE, "latitude": 0, "longitude": 0}
    assert client.post(f"{API}/complaints/duplicate-check", json=body, headers=h).status_code == 422
    body = {"description": POTHOLE, "latitude": 12.9, "longitude": 77.5}
    assert client.post(f"{API}/complaints/duplicate-check", json=body, headers=ho).status_code == 403
    assert client.post(f"{API}/complaints/duplicate-check", json=body).status_code == 401


def test_text_similarity_multilingual():
    assert text_similarity(POTHOLE, POTHOLE) > 0.95
    assert text_similarity("ರಸ್ತೆಯಲ್ಲಿ ದೊಡ್ಡ ಗುಂಡಿ ಇದೆ", "ರಸ್ತೆಯಲ್ಲಿ ದೊಡ್ಡ ಗುಂಡಿ ಇದೆ ಬಸ್ ನಿಲ್ದಾಣ ಹತ್ತಿರ") > 0.5
    assert text_similarity("pothole on road", "streetlight is broken at night") < 0.3
    assert text_similarity("", "anything") == 0.0
