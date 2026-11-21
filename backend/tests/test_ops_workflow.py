"""Operations workflow tests. Complaints are created DIRECTLY with SQLAlchemy models (not via POST /complaints)."""
import io
import itertools
from datetime import timedelta

import pytest
from PIL import Image

from app.models import (
    AuditLog, Complaint, ComplaintFollower, ComplaintLink, ComplaintSubmission, Notification, ResolutionEvidence,
    StatusHistory,
)
from app.models.base import utcnow
from app.services import priority_service

P = "/api/v1"
_n = itertools.count(1)


def mk_complaint(db, reporter_id, dept="road_maintenance", status="ai_review", severity="medium", category="roads",
                 subcategory="pothole", worker_id=None, **kw):
    """Insert a Complaint + primary submission + the ai_review history row, with a unique ticket number."""
    n = next(_n)
    c = Complaint(
        created_by_user_id=reporter_id, original_description=f"Test complaint {n}: big pothole near the school gate",
        original_language="en", summary=f"Test complaint {n}", category=category, subcategory=subcategory,
        severity=severity, severity_score=40.0, ai_confidence=kw.pop("ai_confidence", 0.8), ai_provider="rules",
        authoritative_department_code=dept, responsible_agency_kind="corporation", status=status,
        assigned_worker_id=worker_id, latitude=12.97 + n * 0.0001, longitude=77.59, locality="Test Locality",
        sla_due_at=kw.pop("sla_due_at", utcnow() + timedelta(hours=48)), **kw)
    db.add(c)
    db.flush()
    c.public_ticket_number = f"CL-2026-{90000 + n:05d}"
    db.add(ComplaintSubmission(complaint_id=c.id, user_id=reporter_id, description=c.original_description, is_primary=True))
    db.add(StatusHistory(complaint_id=c.id, from_status="submitted", to_status=status, note="AI triage completed"))
    c.priority_score = priority_service.compute_priority(db, c)
    db.commit()
    return c


def png_bytes():
    buf = io.BytesIO()
    Image.new("RGB", (40, 30), (120, 160, 90)).save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture()
def cast(make_user):
    reporter, h_rep = make_user("citizen")
    officer, h_off = make_user("officer", department_code="road_maintenance")
    worker, h_wrk = make_user("worker", department_code="road_maintenance")
    sup, h_sup = make_user("supervisor")
    admin, h_adm = make_user("admin")
    return {"reporter": reporter, "h_rep": h_rep, "officer": officer, "h_off": h_off, "worker": worker, "h_wrk": h_wrk,
            "sup": sup, "h_sup": h_sup, "admin": admin, "h_adm": h_adm}


# --------------------------------------------------------------------------- full workflow
def test_full_workflow_to_resolved(client, db, cast, monkeypatch):
    from app.services import certificate_service

    calls = []
    monkeypatch.setattr(certificate_service, "issue_for_complaint", lambda d, c, u: calls.append((c.public_ticket_number, u.id)))
    follower, _ = None, None
    c = mk_complaint(db, cast["reporter"]["id"], status="ai_review", severity="high")
    t = c.public_ticket_number
    db.add(ComplaintFollower(complaint_id=c.id, user_id=cast["admin"]["id"]))  # any follower gets notified
    db.commit()

    # officer confirms classification -> verified
    r = client.patch(f"{P}/complaints/{t}/classification", headers=cast["h_off"],
                     json={"reason": "Confirmed on review", "confirm": True})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "verified"
    # assign worker -> assigned
    r = client.patch(f"{P}/complaints/{t}/assignment", headers=cast["h_off"],
                     json={"worker_id": cast["worker"]["id"], "note": "Please repair"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "assigned"
    # worker starts work
    r = client.patch(f"{P}/complaints/{t}/status", headers=cast["h_wrk"], json={"status": "in_progress"})
    assert r.status_code == 200, r.text
    # worker cannot ask for verification without evidence/note
    r = client.patch(f"{P}/complaints/{t}/status", headers=cast["h_wrk"], json={"status": "awaiting_verification"})
    assert r.status_code == 422
    # worker uploads an 'after' photo (multipart)
    r = client.post(f"{P}/complaints/{t}/resolution-evidence", headers=cast["h_wrk"], data={"kind": "after", "notes": "Filled"},
                    files={"image": ("after.png", png_bytes(), "image/png")})
    assert r.status_code == 201, r.text
    assert r.json()["image_id"] is not None
    r = client.patch(f"{P}/complaints/{t}/status", headers=cast["h_wrk"], json={"status": "awaiting_verification"})
    assert r.status_code == 200, r.text
    # an officer cannot verify; a supervisor can
    assert client.post(f"{P}/complaints/{t}/verify-resolution", headers=cast["h_off"], json={}).status_code == 403
    assert client.post(f"{P}/complaints/{t}/verify-resolution", headers=cast["h_wrk"], json={}).status_code == 403
    r = client.post(f"{P}/complaints/{t}/verify-resolution", headers=cast["h_sup"], json={"note": "Checked photo"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "resolved"
    assert calls == [(t, cast["sup"]["id"])]  # certificate_service called exactly once, with the verifier

    db.expire_all()
    row = db.get(Complaint, c.id)
    assert row.resolved_at is not None and row.verified_by_user_id == cast["sup"]["id"]
    hist = [(h.from_status, h.to_status) for h in
            db.query(StatusHistory).filter(StatusHistory.complaint_id == c.id).order_by(StatusHistory.id)]
    assert ("ai_review", "verified") in hist and ("verified", "assigned") in hist
    assert ("assigned", "in_progress") in hist and ("in_progress", "awaiting_verification") in hist
    assert ("awaiting_verification", "resolved") in hist
    actions = {a.action for a in db.query(AuditLog).filter(AuditLog.entity_id == t)}
    assert {"classification.update", "assignment.update", "status.change", "resolution.verify", "resolution.evidence"} <= actions
    assert all(e.verified for e in db.query(ResolutionEvidence).filter(ResolutionEvidence.complaint_id == c.id))
    notes = db.query(Notification).filter(Notification.complaint_id == c.id).all()
    assert any(n.user_id == cast["reporter"]["id"] and t in (n.title + (n.body or "")) for n in notes)
    assert any(n.user_id == cast["admin"]["id"] for n in notes)  # follower notified
    assert any(n.user_id == cast["worker"]["id"] for n in notes)  # worker notified of the assignment

    # staff detail reflects the history and role capabilities
    d = client.get(f"{P}/officer/complaints/{t}", headers=cast["h_sup"]).json()
    assert d["status"] == "resolved" and len(d["timeline"]) >= 6 and d["assignments"][0]["worker_name"]
    assert d["allowed_transitions"] == ["reopened"] and d["can"]["verify"] is False
    assert d["resolution_evidence"][0]["verified"] is True


def test_certificate_service_none_result_is_safe(client, db, cast, monkeypatch):
    """The stub returns None; verification must still succeed."""
    c = mk_complaint(db, cast["reporter"]["id"], status="awaiting_verification", worker_id=cast["worker"]["id"])
    r = client.post(f"{P}/complaints/{c.public_ticket_number}/verify-resolution", headers=cast["h_sup"], json={"note": "ok"})
    assert r.status_code == 200 and r.json()["status"] == "resolved"


def test_verify_requires_evidence_or_note_and_right_state(client, db, cast):
    c = mk_complaint(db, cast["reporter"]["id"], status="awaiting_verification")
    assert client.post(f"{P}/complaints/{c.public_ticket_number}/verify-resolution", headers=cast["h_sup"], json={}).status_code == 422
    c2 = mk_complaint(db, cast["reporter"]["id"], status="in_progress")
    assert client.post(f"{P}/complaints/{c2.public_ticket_number}/verify-resolution", headers=cast["h_sup"],
                       json={"note": "x"}).status_code == 409


# --------------------------------------------------------------------------- permissions / scope
def test_worker_scope_and_limits(client, db, cast, make_user):
    other_worker, h_other = make_user("worker", department_code="road_maintenance")
    c = mk_complaint(db, cast["reporter"]["id"], status="assigned", worker_id=cast["worker"]["id"])
    t = c.public_ticket_number
    # someone else's worker gets 404 on every touch point
    assert client.patch(f"{P}/complaints/{t}/status", headers=h_other, json={"status": "in_progress"}).status_code == 404
    assert client.get(f"{P}/officer/complaints/{t}", headers=h_other).status_code == 404
    assert client.post(f"{P}/complaints/{t}/notes", headers=h_other, json={"body": "hi", "visibility": "internal"}).status_code == 404
    # assigned worker may not resolve, nor use statuses outside in_progress/awaiting_verification
    assert client.patch(f"{P}/complaints/{t}/status", headers=cast["h_wrk"], json={"status": "resolved"}).status_code in (403, 409)
    assert client.patch(f"{P}/complaints/{t}/status", headers=cast["h_wrk"], json={"status": "verified"}).status_code == 403
    # worker queue only contains their own tickets
    items = client.get(f"{P}/officer/queue", headers=cast["h_wrk"]).json()["items"]
    assert items and all(i["assigned_worker"]["id"] == cast["worker"]["id"] for i in items)
    assert t in [i["ticket_number"] for i in items]
    assert client.get(f"{P}/officer/queue", headers=h_other).json()["total"] == 0
    # workers cannot classify / assign
    assert client.patch(f"{P}/complaints/{t}/classification", headers=cast["h_wrk"], json={"severity": "low", "reason": "because"}).status_code == 403
    assert client.patch(f"{P}/complaints/{t}/assignment", headers=cast["h_wrk"], json={"worker_id": other_worker["id"]}).status_code == 403


def test_officer_cannot_see_other_department(client, db, cast, make_user):
    _, h_water = make_user("officer", department_code="bwssb_water_sewerage")
    c = mk_complaint(db, cast["reporter"]["id"], dept="road_maintenance")
    t = c.public_ticket_number
    assert client.get(f"{P}/officer/complaints/{t}", headers=h_water).status_code == 404
    assert client.patch(f"{P}/complaints/{t}/status", headers=h_water, json={"status": "verified"}).status_code == 404
    assert client.patch(f"{P}/complaints/{t}/classification", headers=h_water, json={"severity": "low", "reason": "no access"}).status_code == 404
    assert t not in [i["ticket_number"] for i in client.get(f"{P}/officer/queue?page_size=100", headers=h_water).json()["items"]]
    assert client.get(f"{P}/officer/complaints/{t}", headers=cast["h_off"]).status_code == 200
    assert client.get(f"{P}/officer/complaints/{t}", headers=cast["h_sup"]).status_code == 200


def test_citizen_forbidden_everywhere(client, db, cast):
    c = mk_complaint(db, cast["reporter"]["id"])
    t, h = c.public_ticket_number, cast["h_rep"]
    calls = [
        ("get", "/officer/queue", None), ("get", "/officer/dashboard", None), ("get", "/officer/workers", None),
        ("get", f"/officer/complaints/{t}", None),
        ("patch", f"/complaints/{t}/classification", {"severity": "low", "reason": "citizen try"}),
        ("patch", f"/complaints/{t}/assignment", {"department_code": "sanitation"}),
        ("patch", f"/complaints/{t}/status", {"status": "verified"}),
        ("post", f"/complaints/{t}/notes", {"body": "x", "visibility": "public"}),
        ("post", f"/complaints/{t}/verify-resolution", {}),
        ("post", f"/complaints/{t}/reopen-decision", {"approve": True}),
        ("post", f"/complaints/{t}/link-duplicate", {"primary_ticket_number": "CL-2026-00001", "reason": "citizen try"}),
        ("get", "/analytics/overview", None), ("get", "/admin/users", None), ("get", "/admin/system", None),
    ]
    for method, path, body in calls:
        r = getattr(client, method)(P + path, headers=h, **({"json": body} if body is not None else {}))
        assert r.status_code == 403, (method, path, r.status_code)
    assert client.post(f"{P}/complaints/{t}/resolution-evidence", headers=h, data={"kind": "after", "notes": "x"}).status_code == 403
    assert client.get(f"{P}/officer/queue").status_code == 401


# --------------------------------------------------------------------------- status rules
def test_invalid_transition_and_resolved_only_via_verify(client, db, cast):
    c = mk_complaint(db, cast["reporter"]["id"], status="submitted")
    t = c.public_ticket_number
    r = client.patch(f"{P}/complaints/{t}/status", headers=cast["h_off"], json={"status": "awaiting_verification"})
    assert r.status_code == 409
    assert client.patch(f"{P}/complaints/{t}/status", headers=cast["h_off"], json={"status": "nonsense"}).status_code == 422
    c2 = mk_complaint(db, cast["reporter"]["id"], status="awaiting_verification")
    for h in (cast["h_off"], cast["h_sup"], cast["h_adm"]):
        r = client.patch(f"{P}/complaints/{c2.public_ticket_number}/status", headers=h, json={"status": "resolved"})
        assert r.status_code == 409 and "verify-resolution" in r.json()["detail"]
    db.expire_all()
    assert db.get(Complaint, c2.id).status == "awaiting_verification"
    # a valid transition by an officer writes a history row + notification mentioning the ticket
    r = client.patch(f"{P}/complaints/{t}/status", headers=cast["h_off"], json={"status": "verified", "note": "Looks real"})
    assert r.status_code == 200
    db.expire_all()
    assert db.query(StatusHistory).filter_by(complaint_id=c.id, to_status="verified").count() == 1
    n = db.query(Notification).filter_by(complaint_id=c.id, user_id=cast["reporter"]["id"], type="status_update").first()
    assert n and t in n.title and t in n.body


def test_internal_status_change_not_notified(client, db, cast):
    c = mk_complaint(db, cast["reporter"]["id"], status="submitted")
    client.patch(f"{P}/complaints/{c.public_ticket_number}/status", headers=cast["h_off"],
                 json={"status": "verified", "citizen_visible": False})
    assert db.query(Notification).filter_by(complaint_id=c.id).count() == 0
    h = db.query(StatusHistory).filter_by(complaint_id=c.id, to_status="verified").one()
    assert h.citizen_visible is False


# --------------------------------------------------------------------------- classification
def test_classification_requires_reason_and_audits_override(client, db, cast):
    c = mk_complaint(db, cast["reporter"]["id"], severity="medium", status="verified")
    t = c.public_ticket_number
    assert client.patch(f"{P}/complaints/{t}/classification", headers=cast["h_off"], json={"severity": "critical"}).status_code == 422
    assert client.patch(f"{P}/complaints/{t}/classification", headers=cast["h_off"],
                        json={"severity": "critical", "reason": "abc"}).status_code == 422
    assert client.patch(f"{P}/complaints/{t}/classification", headers=cast["h_off"],
                        json={"severity": "urgent", "reason": "not a level"}).status_code == 422
    r = client.patch(f"{P}/complaints/{t}/classification", headers=cast["h_off"],
                     json={"severity": "critical", "reason": "Next to a school entrance"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["severity"] == "critical" and body["severity_overridden"] is True
    log = db.query(AuditLog).filter(AuditLog.entity_id == t, AuditLog.action == "classification.override").one()
    assert log.before["severity"] == "medium" and log.after["severity"] == "critical"
    assert log.reason == "Next to a school entrance" and log.actor_user_id == cast["officer"]["id"]
    assert db.query(StatusHistory).filter_by(complaint_id=c.id, citizen_visible=False).count() >= 1


def test_classification_category_change_notifies_and_validates(client, db, cast):
    c = mk_complaint(db, cast["reporter"]["id"], status="ai_review", category="roads", subcategory="pothole")
    t = c.public_ticket_number
    assert client.patch(f"{P}/complaints/{t}/classification", headers=cast["h_sup"],
                        json={"category": "waste", "subcategory": "pothole", "reason": "wrong sub"}).status_code == 422
    r = client.patch(f"{P}/complaints/{t}/classification", headers=cast["h_sup"],
                     json={"category": "waste", "subcategory": "litter", "department_code": "sanitation", "reason": "It is litter"})
    assert r.status_code == 200
    assert r.json()["category"] == "waste" and r.json()["department_code"] == "sanitation"
    assert db.query(Notification).filter_by(complaint_id=c.id, user_id=cast["reporter"]["id"], type="classification_update").count() == 1


# --------------------------------------------------------------------------- notes / evidence
def test_notes_visibility_and_notifications(client, db, cast):
    c = mk_complaint(db, cast["reporter"]["id"])
    t = c.public_ticket_number
    assert client.post(f"{P}/complaints/{t}/notes", headers=cast["h_off"], json={"body": "internal only", "visibility": "internal"}).status_code == 201
    assert db.query(Notification).filter_by(complaint_id=c.id).count() == 0
    assert client.post(f"{P}/complaints/{t}/notes", headers=cast["h_off"], json={"body": "Crew visiting", "visibility": "public"}).status_code == 201
    assert db.query(Notification).filter_by(complaint_id=c.id, user_id=cast["reporter"]["id"]).count() == 1
    assert client.post(f"{P}/complaints/{t}/notes", headers=cast["h_off"], json={"body": "x", "visibility": "secret"}).status_code == 422
    d = client.get(f"{P}/officer/complaints/{t}", headers=cast["h_off"]).json()
    assert {m["visibility"] for m in d["comments"]} == {"internal", "public"}


def test_evidence_validation(client, db, cast):
    c = mk_complaint(db, cast["reporter"]["id"], status="in_progress", worker_id=cast["worker"]["id"])
    t = c.public_ticket_number
    assert client.post(f"{P}/complaints/{t}/resolution-evidence", headers=cast["h_wrk"], data={"kind": "during", "notes": "x"}).status_code == 422
    assert client.post(f"{P}/complaints/{t}/resolution-evidence", headers=cast["h_wrk"], data={"kind": "before"}).status_code == 422
    r = client.post(f"{P}/complaints/{t}/resolution-evidence", headers=cast["h_wrk"], data={"kind": "before", "notes": "Pothole 20cm"})
    assert r.status_code == 201 and r.json()["image_id"] is None
    bad = client.post(f"{P}/complaints/{t}/resolution-evidence", headers=cast["h_wrk"], data={"kind": "after"},
                      files={"image": ("x.png", b"not an image", "image/png")})
    assert bad.status_code == 400


# --------------------------------------------------------------------------- assignment
def test_assignment_validates_worker_and_closes_prior(client, db, cast, make_user):
    w2, _ = make_user("worker", department_code="road_maintenance")
    c = mk_complaint(db, cast["reporter"]["id"], status="verified")
    t = c.public_ticket_number
    assert client.patch(f"{P}/complaints/{t}/assignment", headers=cast["h_off"], json={"worker_id": cast["officer"]["id"]}).status_code == 422
    assert client.patch(f"{P}/complaints/{t}/assignment", headers=cast["h_off"], json={"worker_id": "nope"}).status_code == 422
    assert client.patch(f"{P}/complaints/{t}/assignment", headers=cast["h_off"], json={}).status_code == 422
    client.patch(f"{P}/complaints/{t}/assignment", headers=cast["h_off"], json={"worker_id": cast["worker"]["id"]})
    client.patch(f"{P}/complaints/{t}/assignment", headers=cast["h_off"], json={"worker_id": w2["id"]})
    d = client.get(f"{P}/officer/complaints/{t}", headers=cast["h_off"]).json()
    assert [a["active"] for a in d["assignments"]] == [False, True]
    assert d["assigned_worker"]["id"] == w2["id"] and d["status"] == "assigned"
    ws = client.get(f"{P}/officer/workers", headers=cast["h_off"]).json()
    assert {"id", "name", "department_code", "open_tasks"} <= set(ws[0])
    assert next(w for w in ws if w["id"] == w2["id"])["open_tasks"] == 1
    assert client.get(f"{P}/officer/workers", headers=cast["h_wrk"]).status_code == 403


# --------------------------------------------------------------------------- queue / dashboard
def test_queue_sorting_filters_and_paging(client, db, make_user):
    rep, _ = make_user("citizen")
    dept = "zz_queue_dept"  # isolated pseudo-department so other tests' data does not interfere
    off, h = make_user("officer", department_code=dept)
    low = mk_complaint(db, rep["id"], dept=dept, severity="low", category="waste", subcategory="litter")
    crit = mk_complaint(db, rep["id"], dept=dept, severity="critical", ai_confidence=0.3, requires_human_review=True,
                        sla_due_at=utcnow() - timedelta(hours=3))
    med = mk_complaint(db, rep["id"], dept=dept, severity="medium", worker_id=off["id"])
    done = mk_complaint(db, rep["id"], dept=dept, severity="high", status="resolved")

    r = client.get(f"{P}/officer/queue", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert {"items", "total", "page", "page_size"} <= set(body) and body["total"] == 3  # closed hidden by default
    scores = [i["priority_score"] for i in body["items"]]
    assert scores == sorted(scores, reverse=True)
    assert body["items"][0]["ticket_number"] == crit.public_ticket_number
    assert body["items"][0]["sla"]["overdue"] is True and body["items"][0]["sla"]["target_is_sample"] is True

    def tickets(qs):
        return [i["ticket_number"] for i in client.get(f"{P}/officer/queue?{qs}", headers=h).json()["items"]]

    assert tickets("severity=low") == [low.public_ticket_number]
    assert tickets("category=waste") == [low.public_ticket_number]
    assert tickets("review=true") == [crit.public_ticket_number]
    assert tickets("overdue=true") == [crit.public_ticket_number]
    assert tickets("assigned=me") == [med.public_ticket_number]
    assert set(tickets("assigned=unassigned")) == {low.public_ticket_number, crit.public_ticket_number}
    assert tickets("status=resolved") == [done.public_ticket_number]
    assert tickets("max_confidence=0.5") == [crit.public_ticket_number]
    assert tickets(f"q={low.public_ticket_number}") == [low.public_ticket_number]
    assert tickets("include_closed=true&page_size=100").count(done.public_ticket_number) == 1
    assert tickets("date_from=2999-01-01") == []
    p2 = client.get(f"{P}/officer/queue?page=2&page_size=2", headers=h).json()
    assert p2["page"] == 2 and p2["page_size"] == 2 and len(p2["items"]) == 1 and p2["total"] == 3
    assert client.get(f"{P}/officer/queue?page_size=1000", headers=h).status_code == 422
    assert client.get(f"{P}/officer/queue?assigned=bogus", headers=h).status_code == 422


def test_dashboard_shape_and_scope(client, db, make_user):
    rep, _ = make_user("citizen")
    dept = "zz_dash_dept"
    off, h = make_user("officer", department_code=dept)
    mk_complaint(db, rep["id"], dept=dept, severity="critical")
    mk_complaint(db, rep["id"], dept=dept, severity="high", status="in_progress", worker_id=off["id"])
    mk_complaint(db, rep["id"], dept=dept, status="resolved", resolved_at=utcnow(), reopen_requested=True)
    d = client.get(f"{P}/officer/dashboard", headers=h).json()
    assert d["scope"] == {"role": "officer", "department_code": dept}
    t = d["totals"]
    assert t["total"] == 3 and t["critical"] == 1 and t["high"] == 1 and t["in_progress"] == 1
    assert t["resolved"] == 1 and t["reopen_requests"] == 1 and t["unassigned"] == 1
    assert set(t) >= {"awaiting_verification", "overdue", "needs_review"}
    assert d["by_status"]["in_progress"] == 1 and d["by_status"]["resolved"] == 1 and "rejected" in d["by_status"]
    assert d["resolution_rate_by_department"] == [
        {"department_code": dept, "department_name": "Unrouted", "total": 3, "resolved": 1, "rate": 0.333}]
    assert d["median_resolution_hours"] is not None
    assert len(d["top_priority"]) == 2 and d["top_priority"][0]["severity"] == "critical"


# --------------------------------------------------------------------------- reopen + duplicate
def test_reopen_decision_flow(client, db, cast):
    c = mk_complaint(db, cast["reporter"]["id"], status="resolved", resolved_at=utcnow(), reopen_requested=True,
                     reopen_reason="Hole is back", reopen_requested_by_user_id=cast["reporter"]["id"])
    t = c.public_ticket_number
    assert client.post(f"{P}/complaints/{t}/reopen-decision", headers=cast["h_off"], json={"approve": True}).status_code == 403
    d = client.get(f"{P}/officer/complaints/{t}", headers=cast["h_sup"]).json()
    assert d["can"]["reopen_decision"] is True
    r = client.post(f"{P}/complaints/{t}/reopen-decision", headers=cast["h_sup"], json={"approve": True, "note": "Confirmed on site"})
    assert r.status_code == 200 and r.json()["status"] == "reopened"
    db.expire_all()
    row = db.get(Complaint, c.id)
    assert row.reopened_count == 1 and row.reopen_requested is False and row.resolved_at is None
    assert db.query(StatusHistory).filter_by(complaint_id=c.id, from_status="resolved", to_status="reopened").count() == 1
    assert db.query(AuditLog).filter_by(entity_id=t, action="reopen.approve").count() == 1
    # no pending request any more -> 409
    assert client.post(f"{P}/complaints/{t}/reopen-decision", headers=cast["h_sup"], json={"approve": True}).status_code == 409


def test_reopen_rejection_keeps_status_and_comments(client, db, cast):
    c = mk_complaint(db, cast["reporter"]["id"], status="resolved", resolved_at=utcnow(), reopen_requested=True,
                     reopen_requested_by_user_id=cast["reporter"]["id"])
    t = c.public_ticket_number
    r = client.post(f"{P}/complaints/{t}/reopen-decision", headers=cast["h_adm"], json={"approve": False, "note": "Different issue"})
    assert r.status_code == 200 and r.json()["status"] == "resolved"
    db.expire_all()
    assert db.get(Complaint, c.id).reopen_requested is False
    d = client.get(f"{P}/officer/complaints/{t}", headers=cast["h_adm"]).json()
    assert any(m["visibility"] == "public" and "Different issue" in m["body"] for m in d["comments"])
    assert db.query(Notification).filter_by(complaint_id=c.id, type="reopen_decision").count() >= 1


def test_link_duplicate_preserves_original(client, db, cast, make_user):
    rep2, _ = make_user("citizen")
    primary = mk_complaint(db, cast["reporter"]["id"], status="verified")
    dup = mk_complaint(db, rep2["id"], status="ai_review")
    original_text = dup.original_description
    t, pt = dup.public_ticket_number, primary.public_ticket_number
    assert client.post(f"{P}/complaints/{t}/link-duplicate", headers=cast["h_off"],
                       json={"primary_ticket_number": t, "reason": "same ticket"}).status_code == 422
    assert client.post(f"{P}/complaints/{t}/link-duplicate", headers=cast["h_off"],
                       json={"primary_ticket_number": "CL-2026-77777", "reason": "does not exist"}).status_code == 404
    assert client.post(f"{P}/complaints/{t}/link-duplicate", headers=cast["h_off"],
                       json={"primary_ticket_number": pt, "reason": "x"}).status_code == 422
    r = client.post(f"{P}/complaints/{t}/link-duplicate", headers=cast["h_off"],
                    json={"primary_ticket_number": pt, "reason": "Same pothole, same street"})
    assert r.status_code == 200, r.text
    db.expire_all()
    d = db.get(Complaint, dup.id)
    assert d.status == "duplicate_linked" and d.original_description == original_text
    assert db.query(ComplaintSubmission).filter_by(complaint_id=dup.id).count() == 1  # original submission kept
    assert db.query(ComplaintLink).filter_by(primary_complaint_id=primary.id, linked_complaint_id=dup.id).count() == 1
    assert db.query(ComplaintFollower).filter_by(complaint_id=primary.id, user_id=rep2["id"]).count() == 1
    assert db.query(AuditLog).filter_by(entity_id=t, action="duplicate.link").count() == 1
    detail = client.get(f"{P}/officer/complaints/{t}", headers=cast["h_off"]).json()
    assert detail["links"] == [{"ticket_number": pt, "direction": "primary"}]
    # a closed duplicate cannot be used as a primary
    third = mk_complaint(db, cast["reporter"]["id"], status="ai_review")
    assert client.post(f"{P}/complaints/{third.public_ticket_number}/link-duplicate", headers=cast["h_off"],
                       json={"primary_ticket_number": t, "reason": "chain of dups"}).status_code == 409
