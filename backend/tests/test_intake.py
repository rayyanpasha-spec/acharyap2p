"""Citizen intake: create / follow / evidence / privacy / images / reopen / notifications."""
import io
import itertools

import pytest
from PIL import Image
from sqlalchemy import func, select

from app.config import settings
from app.models import (
    Comment, Complaint, ComplaintFollower, ComplaintImage, ComplaintSubmission, StatusHistory,
)
from app.services.upload_service import image_path

API = "/api/v1"
_spot = itertools.count(1)


def unique_spot():
    """A location >1 km from every other test's (inside the fallback radius) so duplicate detection never crosses tests."""
    n = next(_spot)
    return 12.80 + n * 0.012, 77.45 + (n % 7) * 0.02


def form(lat, lng, desc="Small pothole near the park gate, cars slow down here", **extra):
    d = {"description": desc, "original_language": "en", "latitude": str(lat), "longitude": str(lng),
         "location_source": "map_pin"}
    d.update(extra)
    return d


def jpeg_bytes(with_exif=False, size=(64, 48)):
    img = Image.new("RGB", size, (120, 80, 60))
    buf = io.BytesIO()
    if with_exif:
        exif = Image.Exif()
        exif[0x010F] = "TestCameraMaker"
        exif[0x8825] = {1: "N", 2: (12.0, 58.0, 18.0), 3: "E", 4: (77.0, 35.0, 40.0)}  # GPS IFD
        img.save(buf, format="JPEG", exif=exif)
    else:
        img.save(buf, format="JPEG")
    return buf.getvalue()


def create(client, headers, lat, lng, files=None, **extra):
    return client.post(f"{API}/complaints", data=form(lat, lng, **extra), headers=headers, files=files or None)


def ticket_row(db, ticket):
    return db.scalars(select(Complaint).where(Complaint.public_ticket_number == ticket)).one()


# ------------------------------------------------------------------ create
def test_create_text_only_complaint(client, make_user, db):
    user, h = make_user()
    lat, lng = unique_spot()
    r = create(client, h, lat, lng)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["action"] == "created"
    tn = body["ticket_number"]
    import re
    assert re.fullmatch(r"CL-\d{4}-\d{5}", tn)
    c = body["complaint"]
    assert c["status"] == "ai_review" and c["ticket_number"] == tn and c["is_mine"] is True
    assert c["location"]["latitude"] == pytest.approx(lat)
    assert "triage" in body and "category" in body["triage"]
    # citizen shape: no staff-only fields
    for k in ("ai_confidence", "priority_score", "review_reasons", "routing_note", "sla_due_at", "assigned_worker",
              "reporter"):
        assert k not in c
    row = ticket_row(db, tn)
    hist = db.scalars(select(StatusHistory).where(StatusHistory.complaint_id == row.id)
                      .order_by(StatusHistory.id)).all()
    assert [h_.to_status for h_ in hist] == ["submitted", "ai_review"]
    subs = db.scalars(select(ComplaintSubmission).where(ComplaintSubmission.complaint_id == row.id)).all()
    assert len(subs) == 1 and subs[0].is_primary and subs[0].duplicate_choice == "new"
    assert row.priority_score is not None and row.sla_due_at is not None
    n = client.get(f"{API}/notifications", headers=h).json()
    assert n["unread_count"] >= 1 and any(i["ticket_number"] == tn for i in n["items"])


def test_staff_cannot_create(client, make_user):
    _o, oh = make_user("officer")
    lat, lng = unique_spot()
    r = create(client, oh, lat, lng)
    assert r.status_code == 403 and "staff" in r.json()["detail"].lower()


def test_browser_supplied_triage_fields_are_ignored(client, make_user):
    _u, h = make_user()
    lat, lng = unique_spot()
    r = create(client, h, lat, lng, category="water", subcategory="pipe_burst", severity="critical",
               department_code="bwssb_water", priority_score="99")
    assert r.status_code == 201, r.text
    c = r.json()["complaint"]
    assert c["category"] != "water"
    assert c["department_code"] != "bwssb_water"
    assert c["severity"] in ("low", "medium", "high", "critical")


def test_invalid_coordinates_rejected(client, make_user, db):
    u, h = make_user()
    before = db.scalar(select(func.count(Complaint.id)).where(Complaint.created_by_user_id == u["id"]))
    assert create(client, h, 0, 0).status_code == 422
    assert create(client, h, 95, 77).status_code == 422
    assert create(client, h, 12.9, 200).status_code == 422
    assert create(client, h, 12.9, 77.5, desc="hey").status_code == 422
    after = db.scalar(select(func.count(Complaint.id)).where(Complaint.created_by_user_id == u["id"]))
    assert before == after == 0


def test_exif_is_stripped_from_stored_photo(client, make_user, db):
    _u, h = make_user()
    lat, lng = unique_spot()
    raw = jpeg_bytes(with_exif=True)
    assert Image.open(io.BytesIO(raw)).getexif().get_ifd(0x8825)  # fixture really carries GPS
    r = create(client, h, lat, lng, files=[("images", ("photo.jpg", raw, "image/jpeg"))])
    assert r.status_code == 201, r.text
    row = ticket_row(db, r.json()["ticket_number"])
    img = db.scalars(select(ComplaintImage).where(ComplaintImage.complaint_id == row.id)).one()
    assert img.kind == "report"
    stored = Image.open(image_path(img))
    exif = stored.getexif()
    assert not exif.get_ifd(0x8825) and 0x010F not in exif
    assert len(r.json()["complaint"]["images"]) == 1


def test_non_image_and_oversized_rejected_without_ticket(client, make_user, db, monkeypatch):
    u, h = make_user()
    lat, lng = unique_spot()
    r = create(client, h, lat, lng, files=[("images", ("x.jpg", b"this is not an image", "image/jpeg"))])
    assert r.status_code == 400
    monkeypatch.setattr(settings, "MAX_IMAGE_SIZE_MB", 1)
    big = b"\xff\xd8\xff" + b"0" * (1024 * 1024 + 10)
    r = create(client, h, lat, lng, files=[("images", ("big.jpg", big, "image/jpeg"))])
    assert r.status_code == 413
    assert db.scalar(select(func.count(Complaint.id)).where(Complaint.created_by_user_id == u["id"])) == 0


def test_too_many_images_rejected(client, make_user):
    _u, h = make_user()
    lat, lng = unique_spot()
    files = [("images", (f"{i}.jpg", jpeg_bytes(), "image/jpeg")) for i in range(settings.MAX_IMAGES_PER_REPORT + 1)]
    assert create(client, h, lat, lng, files=files).status_code == 400


def test_outside_service_area_is_flagged(client, make_user):
    _u, h = make_user()
    r = create(client, h, 28.6139, 77.2090)  # New Delhi, clearly outside any Bengaluru area
    assert r.status_code == 201, r.text
    c = r.json()["complaint"]
    assert c["location"]["service_area_status"] == "outside_service_area"
    assert c["location"]["city_corporation_code"] is None
    assert c["requires_human_review"] is True


def test_fallback_notice_when_no_boundaries(client, make_user):
    _u, h = make_user()
    r = client.get(f"{API}/locations/service-area-check", params={"lat": 12.9716, "lng": 77.5946})
    assert r.status_code == 200
    j = r.json()
    if j["boundary_source"] == "fallback_approximate":  # no official dataset imported in the test DB
        assert j["service_area_status"] == "needs_manual_routing"
        assert j["notice"] and j["city_corporation_code"] is None and j["ward_code"] is None
    lat, lng = unique_spot()
    c = create(client, h, lat, lng).json()["complaint"]
    assert c["location"]["service_area_status"] in ("needs_manual_routing", "in_area")


def test_preview_does_not_persist(client, make_user, db):
    u, h = make_user()
    lat, lng = unique_spot()
    r = client.post(f"{API}/complaints/preview", data=form(lat, lng), headers=h)
    assert r.status_code == 200, r.text
    j = r.json()
    assert {"triage", "service_area", "department_name", "category_name", "subcategory_name"} <= set(j)
    assert "category" in j["triage"] and "boundary_source" in j["service_area"]
    assert db.scalar(select(func.count(Complaint.id)).where(Complaint.created_by_user_id == u["id"])) == 0


# ------------------------------------------------------------------ follow / evidence
def _make_complaint(client, headers, lat, lng, **kw):
    r = create(client, headers, lat, lng, **kw)
    assert r.status_code == 201, r.text
    return r.json()["ticket_number"]


def test_follow_action_creates_no_new_complaint(client, make_user, db):
    _a, ha = make_user()
    b, hb = make_user()
    lat, lng = unique_spot()
    tn = _make_complaint(client, ha, lat, lng)
    total = db.scalar(select(func.count(Complaint.id)))
    r = create(client, hb, lat, lng, existing_incident_action="follow", existing_ticket_id=tn)
    assert r.status_code == 201, r.text
    assert r.json()["action"] == "followed" and r.json()["ticket_number"] == tn
    assert db.scalar(select(func.count(Complaint.id))) == total
    # idempotent
    create(client, hb, lat, lng, existing_incident_action="follow", existing_ticket_id=tn)
    row = ticket_row(db, tn)
    assert db.scalar(select(func.count(ComplaintFollower.id)).where(
        ComplaintFollower.complaint_id == row.id, ComplaintFollower.user_id == b["id"])) == 1
    detail = client.get(f"{API}/complaints/{tn}", headers=hb).json()
    assert detail["i_follow"] is True
    assert any(i["ticket_number"] == tn for i in client.get(f"{API}/complaints?scope=following", headers=hb).json()["items"])
    # explicit follow / unfollow endpoints
    assert client.delete(f"{API}/complaints/{tn}/follow", headers=hb).json() == {"following": False}
    assert client.post(f"{API}/complaints/{tn}/follow", headers=hb).json() == {"following": True}


def test_add_evidence_action(client, make_user, db):
    _a, ha = make_user()
    b, hb = make_user()
    lat, lng = unique_spot()
    tn = _make_complaint(client, ha, lat, lng)
    total = db.scalar(select(func.count(Complaint.id)))
    r = create(client, hb, lat, lng, desc="Same pothole, more photos attached", existing_incident_action="add_evidence",
               existing_ticket_id=tn, files=[("images", ("e.jpg", jpeg_bytes(), "image/jpeg"))])
    assert r.status_code == 201, r.text
    assert r.json()["action"] == "evidence_added"
    assert db.scalar(select(func.count(Complaint.id))) == total
    row = ticket_row(db, tn)
    subs = db.scalars(select(ComplaintSubmission).where(ComplaintSubmission.complaint_id == row.id)).all()
    assert len(subs) == 2 and sum(1 for s in subs if not s.is_primary) == 1
    assert [s for s in subs if not s.is_primary][0].duplicate_choice == "add_evidence"
    imgs = db.scalars(select(ComplaintImage).where(ComplaintImage.complaint_id == row.id)).all()
    assert [i.kind for i in imgs] == ["evidence"]
    # reporter was notified without identity
    notes = client.get(f"{API}/notifications", headers=ha).json()["items"]
    assert any(n["type"] == "evidence_added" and b["display_name"] not in (n["body"] or "") for n in notes)
    # evidence endpoint
    r2 = client.post(f"{API}/complaints/{tn}/evidence", data={"note": "Still there today"}, headers=hb)
    assert r2.status_code == 200 and r2.json()["ticket_number"] == tn
    assert client.post(f"{API}/complaints/{tn}/evidence", headers=hb).status_code == 400


def test_unknown_ticket_404(client, make_user):
    _u, h = make_user()
    assert client.get(f"{API}/complaints/CL-2000-99999", headers=h).status_code == 404
    lat, lng = unique_spot()
    r = create(client, h, lat, lng, existing_incident_action="follow", existing_ticket_id="CL-2000-99999")
    assert r.status_code == 404


# ------------------------------------------------------------------ privacy
def test_citizen_privacy_and_internal_comments(client, make_user, db):
    owner, ho = make_user(name="Owner Person")
    _s, hs = make_user(name="Stranger Person")
    off, hoff = make_user("officer")
    lat, lng = unique_spot()
    lat += 0.003456
    tn = _make_complaint(client, ho, lat, lng, files=[("images", ("p.jpg", jpeg_bytes(), "image/jpeg"))])
    row = ticket_row(db, tn)
    db.add(Comment(complaint_id=row.id, author_user_id=off["id"], author_role="officer", author_name="Off",
                   body="INTERNAL-SECRET-NOTE", visibility="internal"))
    db.add(Comment(complaint_id=row.id, author_user_id=off["id"], author_role="officer", author_name="Off",
                   body="Public update text", visibility="public"))
    db.add(StatusHistory(complaint_id=row.id, from_status="ai_review", to_status="ai_review", note="INTERNAL-STATUS",
                         citizen_visible=False))
    db.commit()

    own = client.get(f"{API}/complaints/{tn}", headers=ho)
    assert own.status_code == 200
    ot = own.text
    assert "INTERNAL-SECRET-NOTE" not in ot and "INTERNAL-STATUS" not in ot
    assert "Public update text" in ot
    assert own.json()["location"]["latitude"] == pytest.approx(lat)
    assert own.json()["original_description"]

    stranger = client.get(f"{API}/complaints/{tn}", headers=hs)
    assert stranger.status_code == 200
    s = stranger.json()
    assert "INTERNAL" not in stranger.text and owner["email"] not in stranger.text and "Owner Person" not in stranger.text
    assert s["location"]["latitude"] == round(lat, 3) and s["location"]["longitude"] == round(lng, 3)
    assert s["original_description"] is None and s["images"] == [] and s["is_mine"] is False
    assert "reporter" not in s and "ai_confidence" not in s
    assert client.get(f"{API}/complaints/{tn}/timeline", headers=hs).json()
    assert "INTERNAL-STATUS" not in client.get(f"{API}/complaints/{tn}/timeline", headers=hs).text

    staff = client.get(f"{API}/complaints/{tn}", headers=hoff).json()
    assert staff["reporter"] == {"name": "Owner Person"}
    assert owner["email"] not in str(staff)
    assert "priority_score" in staff and "ai_confidence" in staff

    # public feed: privacy-safe
    feed = client.get(f"{API}/complaints/public-feed", headers=hs).json()["items"]
    mine = [i for i in feed if i["ticket_number"] == tn][0]
    assert mine["latitude"] == round(lat, 3) and "user" not in str(mine).lower()


def test_list_and_summary(client, make_user):
    _u, h = make_user()
    lat, lng = unique_spot()
    tn = _make_complaint(client, h, lat, lng)
    lst = client.get(f"{API}/complaints", headers=h).json()
    assert lst["total"] == 1 and lst["items"][0]["ticket_number"] == tn and lst["page"] == 1
    assert client.get(f"{API}/complaints?q=park", headers=h).json()["total"] == 1
    assert client.get(f"{API}/complaints?q=zzzzqq", headers=h).json()["total"] == 0
    sm = client.get(f"{API}/complaints/summary", headers=h).json()
    assert sm["total"] == 1 and sm["unresolved"] == 1 and sm["resolved"] == 0 and len(sm["recent"]) == 1
    _o, ho = make_user("officer")
    r = client.get(f"{API}/complaints", headers=ho)
    assert r.status_code == 403 and "officer/queue" in r.json()["detail"]


# ------------------------------------------------------------------ images
def test_image_endpoint_permissions(client, make_user):
    _o, ho = make_user()
    _s, hs = make_user()
    _f, hf = make_user()
    _off, hoff = make_user("officer")
    lat, lng = unique_spot()
    tn = _make_complaint(client, ho, lat, lng, files=[("images", ("p.jpg", jpeg_bytes(), "image/jpeg"))])
    iid = client.get(f"{API}/complaints/{tn}", headers=ho).json()["images"][0]["id"]
    ok = client.get(f"{API}/images/{iid}", headers=ho)
    assert ok.status_code == 200 and ok.headers["content-type"] == "image/jpeg"
    assert "private" in ok.headers["cache-control"]
    assert client.get(f"{API}/images/{iid}", headers=hs).status_code == 403
    assert client.get(f"{API}/images/{iid}", headers=hoff).status_code == 200
    assert client.get(f"{API}/images/{iid}").status_code == 401
    assert client.get(f"{API}/images/999999", headers=ho).status_code == 404
    client.post(f"{API}/complaints/{tn}/follow", headers=hf)
    assert client.get(f"{API}/images/{iid}", headers=hf).status_code == 200


# ------------------------------------------------------------------ reopen
def test_reopen_request_only_when_resolved(client, make_user, db):
    _o, ho = make_user()
    _s, hs = make_user()
    lat, lng = unique_spot()
    tn = _make_complaint(client, ho, lat, lng)
    url = f"{API}/complaints/{tn}/reopen-request"
    assert client.post(url, json={"reason": "It is still broken"}, headers=ho).status_code == 409
    row = ticket_row(db, tn)
    row.status = "resolved"
    db.commit()
    assert client.post(url, json={"reason": "It is still broken"}, headers=hs).status_code == 403
    assert client.post(url, json={"reason": "no"}, headers=ho).status_code == 422
    assert client.post(url, json={"reason": "It is still broken"}, headers=ho).json() == {"ok": True}
    db.expire_all()
    row = ticket_row(db, tn)
    assert row.reopen_requested and row.reopen_reason == "It is still broken" and row.status == "resolved"
    assert row.reopen_requested_by_user_id
    c = db.scalars(select(Comment).where(Comment.complaint_id == row.id)).one()
    assert c.visibility == "internal" and c.body.startswith("Reopen requested")
    assert client.post(url, json={"reason": "Again please"}, headers=ho).status_code == 409


# ------------------------------------------------------------------ notifications
def test_notifications_read_flow(client, make_user):
    _u, h = make_user()
    lat, lng = unique_spot()
    _make_complaint(client, h, lat, lng)
    _make_complaint(client, h, lat + 0.05, lng)
    n = client.get(f"{API}/notifications", headers=h).json()
    assert n["unread_count"] == 2 and n["total"] == 2 and not n["items"][0]["read"]
    nid = n["items"][0]["id"]
    assert client.post(f"{API}/notifications/{nid}/read", headers=h).json()["unread_count"] == 1
    assert len(client.get(f"{API}/notifications?unread_only=true", headers=h).json()["items"]) == 1
    _o, ho = make_user()
    assert client.post(f"{API}/notifications/{nid}/read", headers=ho).status_code == 404
    assert client.post(f"{API}/notifications/read-all", headers=h).status_code == 200
    assert client.get(f"{API}/notifications", headers=h).json()["unread_count"] == 0
    assert client.get(f"{API}/notifications").status_code == 401


# ------------------------------------------------------------------ analyze (staff)
def test_analyze_staff_only(client, make_user):
    _u, h = make_user()
    _o, ho = make_user("officer")
    lat, lng = unique_spot()
    tn = _make_complaint(client, h, lat, lng)
    assert client.post(f"{API}/complaints/{tn}/analyze", headers=h).status_code == 403
    r = client.post(f"{API}/complaints/{tn}/analyze", headers=ho)
    assert r.status_code == 200 and r.json()["applied"] is False and "category" in r.json()["triage"]
