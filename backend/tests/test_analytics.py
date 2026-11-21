"""Analytics overview tests (department scoping, zero-filled volume, no personal data)."""
from datetime import timedelta

from app.models.base import utcnow
from tests.test_ops_workflow import mk_complaint

URL = "/api/v1/analytics/overview"


def test_overview_shape_for_scoped_officer(client, db, make_user):
    rep, _ = make_user("citizen", name="Private Reporter Name")
    dept = "zz_analytics_dept"
    off, h = make_user("officer", department_code=dept)
    mk_complaint(db, rep["id"], dept=dept, severity="critical", category="roads")
    mk_complaint(db, rep["id"], dept=dept, severity="high", category="waste", subcategory="litter",
                 sla_due_at=utcnow() - timedelta(hours=2))
    mk_complaint(db, rep["id"], dept=dept, severity="low", status="in_progress", sla_due_at=utcnow() + timedelta(hours=3))
    mk_complaint(db, rep["id"], dept=dept, severity="medium", status="resolved", resolved_at=utcnow() + timedelta(hours=10),
                 created_at=utcnow() - timedelta(days=2), reopened_count=1)
    mk_complaint(db, rep["id"], dept=dept, status="duplicate_linked")
    mk_complaint(db, rep["id"], dept="some_other_dept", severity="critical")  # must NOT be counted for this officer

    r = client.get(URL, headers=h)
    assert r.status_code == 200, r.text
    d = r.json()
    assert {"by_category", "by_severity", "by_department", "daily_volume", "sla", "reopened_rate", "duplicate_rate", "map_points"} <= set(d)
    assert sum(c["count"] for c in d["by_category"]) == 5
    assert {"category", "name", "count"} == set(d["by_category"][0])
    assert d["by_severity"]["critical"] == 1 and d["by_severity"]["high"] == 1 and set(d["by_severity"]) >= {"low", "medium", "high", "critical"}
    assert len(d["by_department"]) == 1
    dep = d["by_department"][0]
    assert dep["department_code"] == dept and dep["total"] == 5 and dep["resolved"] == 1 and dep["open"] == 3
    assert dep["median_resolution_hours"] is not None and 55 < dep["median_resolution_hours"] < 60  # 2 days + 10h = 58h
    assert d["sla"]["overdue"] == 1 and d["sla"]["at_risk"] == 1 and d["sla"]["on_track"] == 1
    assert d["reopened_rate"] == 0.2 and d["duplicate_rate"] == 0.2
    # active tickets only (resolved + duplicate_linked excluded), exact keys, no personal data
    assert len(d["map_points"]) == 3
    assert set(d["map_points"][0]) == {"ticket_number", "latitude", "longitude", "severity", "category", "status"}
    blob = r.text
    assert "Private Reporter Name" not in blob and rep["email"] not in blob and rep["id"] not in blob


def test_daily_volume_is_30_days_zero_filled(client, db, make_user):
    rep, _ = make_user("citizen")
    dept = "zz_analytics_daily"
    _, h = make_user("officer", department_code=dept)
    mk_complaint(db, rep["id"], dept=dept)
    mk_complaint(db, rep["id"], dept=dept)
    mk_complaint(db, rep["id"], dept=dept, created_at=utcnow() - timedelta(days=5))
    mk_complaint(db, rep["id"], dept=dept, created_at=utcnow() - timedelta(days=45))  # outside the window
    vol = client.get(URL, headers=h).json()["daily_volume"]
    assert len(vol) == 30
    dates = [v["date"] for v in vol]
    assert dates == sorted(dates) and len(set(dates)) == 30 and dates[-1] == utcnow().date().isoformat()
    assert sum(v["count"] for v in vol) == 3 and vol[-1]["count"] == 2
    assert vol[-6]["count"] == 1 and sum(1 for v in vol if v["count"] == 0) == 28


def test_overview_scope_by_role_and_empty(client, db, make_user):
    rep, _ = make_user("citizen")
    _, h_empty = make_user("officer", department_code="zz_empty_dept")
    d = client.get(URL, headers=h_empty).json()
    assert d["by_category"] == [] and d["by_department"] == [] and d["map_points"] == []
    assert d["reopened_rate"] == 0.0 and d["duplicate_rate"] == 0.0 and len(d["daily_volume"]) == 30
    assert d["sla"] == {"overdue": 0, "at_risk": 0, "on_track": 0, "target_is_sample": True}
    c = mk_complaint(db, rep["id"], dept="zz_scope_a")
    for role in ("supervisor", "admin"):
        _, h = make_user(role)
        full = client.get(URL, headers=h).json()
        assert any(p["ticket_number"] == c.public_ticket_number for p in full["map_points"]) or len(full["map_points"]) == 500
        assert any(x["department_code"] == "zz_scope_a" for x in full["by_department"])
    _, h_other = make_user("officer", department_code="zz_scope_b")
    assert client.get(URL, headers=h_other).json()["by_department"] == []


def test_analytics_forbidden_for_citizen_and_worker(client, make_user):
    for role in ("citizen", "worker"):
        _, h = make_user(role)
        assert client.get(URL, headers=h).status_code == 403
    assert client.get(URL).status_code == 401
