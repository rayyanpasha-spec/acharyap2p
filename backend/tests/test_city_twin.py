"""City in Motion (3D map) API tests. The shared test DB persists across test modules, so every assertion filters on
rows this module created (unique ticket / vehicle / bin / route codes)."""
import itertools
import queue
import threading
import time
from datetime import timedelta

import pytest

from app.api.v1 import city_twin
from app.models import Complaint, ComplaintImage, ComplaintSubmission, StatusHistory
from app.models.base import utcnow
from app.models.garbage import (BinReading, CollectionEvent, GarbageBin, GarbageRoute, GarbageVehicle,
                                VehicleLocation)

API = "/api/v1/city-twin"
_n = itertools.count(1)

PROPS_PUBLIC = {
    "ticket_id", "category", "category_name", "subcategory", "severity", "status", "priority_score", "public_summary",
    "department_code", "department_name", "locality", "created_at", "updated_at", "resolved_at", "supporting_count",
    "is_mine", "is_demo",
}
PII_WORDS = ("email", "phone", "reporter", "created_by", "user_id", "display_name", "original_description",
             "internal", "password", "address", "worker_id")


def mk_complaint(db, *, owner="owner-x", severity="medium", category="roads", status="in_progress", priority=10.0,
                 lat=12.97163, lng=77.59467, summary="Public summary", **kw):
    i = next(_n)
    c = Complaint(
        public_ticket_number=f"CT-{i:06d}", created_by_user_id=owner,
        original_description="PRIVATE original text: call me on 9999999999", original_language="en",
        summary=summary, category=category, subcategory="pothole", severity=severity, severity_reason="Because.",
        priority_score=priority, status=status, latitude=lat, longitude=lng, locality="Indiranagar",
        authoritative_department_code="road_maintenance", ai_confidence=0.77, review_reasons=["low confidence"],
        routing_note="internal routing note", requires_human_review=True, **kw)
    db.add(c)
    db.commit()
    db.add(ComplaintSubmission(complaint_id=c.id, user_id=owner, description="PRIVATE", is_primary=True))
    db.commit()
    return c


@pytest.fixture(autouse=True)
def _cleanup(client):
    """The test DB is shared with other modules (e.g. test_garbage counts rows): remove everything created here."""
    yield
    from sqlalchemy import delete, select

    from app.database import SessionLocal
    db = SessionLocal()
    try:
        vids = list(db.scalars(select(GarbageVehicle.id).where(GarbageVehicle.code.like("CT-%"))))
        bids = list(db.scalars(select(GarbageBin.id).where(GarbageBin.code.like("CT-%"))))
        rids = list(db.scalars(select(GarbageRoute.id).where(GarbageRoute.code.like("CT-%"))))
        db.execute(delete(CollectionEvent).where(CollectionEvent.bin_id.in_(bids)))
        db.execute(delete(BinReading).where(BinReading.bin_id.in_(bids)))
        db.execute(delete(VehicleLocation).where(VehicleLocation.vehicle_id.in_(vids)))
        db.execute(delete(GarbageVehicle).where(GarbageVehicle.id.in_(vids)))
        db.execute(delete(GarbageBin).where(GarbageBin.id.in_(bids)))
        db.execute(delete(GarbageRoute).where(GarbageRoute.id.in_(rids)))
        for c in db.scalars(select(Complaint).where(Complaint.public_ticket_number.like("CT-%"))):
            db.delete(c)
        db.commit()
    finally:
        db.close()


def feats(client, qs="", headers=None):
    r = client.get(f"{API}/complaints{qs}", headers=headers or {})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["type"] == "FeatureCollection"
    return {f["properties"]["ticket_id"]: f for f in body["features"]}


# ------------------------------------------------------------------------------------------ complaints
def test_public_features_privacy_and_rounding(client, db):
    c = mk_complaint(db)
    f = feats(client)[c.public_ticket_number]
    assert set(f["properties"]) == PROPS_PUBLIC
    assert f["geometry"] == {"type": "Point", "coordinates": [77.595, 12.972]}  # [lng, lat], 3 dp
    assert f["properties"]["public_summary"] == "Public summary"
    assert f["properties"]["is_mine"] is False
    blob = str(f).lower()
    assert "private original" not in blob and "9999999999" not in blob and "owner-x" not in blob
    assert "internal routing note" not in blob
    for k in f["properties"]:
        assert not any(w in k for w in PII_WORDS), k


def test_owner_exact_other_citizen_rounded_staff_exact(client, db, make_user):
    owner, h_owner = make_user("citizen")
    other, h_other = make_user("citizen")
    _, h_staff = make_user("officer", department_code="road_maintenance")
    c = mk_complaint(db, owner=owner["id"])
    t = c.public_ticket_number
    fo = feats(client, headers=h_owner)[t]
    assert fo["geometry"]["coordinates"] == [77.59467, 12.97163] and fo["properties"]["is_mine"] is True
    assert set(fo["properties"]) == PROPS_PUBLIC
    fx = feats(client, headers=h_other)[t]
    assert fx["geometry"]["coordinates"] == [77.595, 12.972] and fx["properties"]["is_mine"] is False
    assert set(fx["properties"]) == PROPS_PUBLIC
    fs = feats(client, headers=h_staff)[t]
    assert fs["geometry"]["coordinates"] == [77.59467, 12.97163]
    assert set(fs["properties"]) == PROPS_PUBLIC | {"requires_review"}
    assert fs["properties"]["requires_review"] is True
    # invalid token behaves as anonymous
    bad = feats(client, headers={"Authorization": "Bearer nope"})[t]
    assert bad["geometry"]["coordinates"] == [77.595, 12.972]


def test_filters_status_visibility_mine_and_sort(client, db, make_user):
    me, h_me = make_user("citizen")
    a = mk_complaint(db, owner=me["id"], severity="critical", category="water", priority=90, status="assigned")
    b = mk_complaint(db, severity="low", category="trees", priority=5, status="submitted")
    r = mk_complaint(db, severity="high", category="water", priority=50, status="resolved", resolved_at=utcnow())
    x = mk_complaint(db, status="rejected", category="water")
    ta, tb, tr, tx = (c.public_ticket_number for c in (a, b, r, x))

    base = feats(client)
    assert ta in base and tb in base
    assert tr not in base and tx not in base                       # resolved hidden by default, rejected always
    inc = feats(client, "?include_resolved=true")
    assert tr in inc and tx not in inc
    assert tr in feats(client, "?status=resolved")                  # explicit status filter shows resolved
    assert tx not in feats(client, "?status=rejected&include_resolved=true")

    only = feats(client, "?severity=critical&category=water")
    assert ta in only and tb not in only
    assert tb in feats(client, "?severity=low,medium&category=trees")
    assert ta not in feats(client, "?status=submitted")
    assert ta in feats(client, "?status=assigned&department=road_maintenance")
    assert ta not in feats(client, "?department=nope")

    # mine: anonymous ignored (still the whole city), signed-in restricts to own
    assert tb in feats(client, "?mine=true")
    mine = feats(client, "?mine=true", headers=h_me)
    assert set(mine) & {ta, tb} == {ta}

    # date filters
    assert ta in feats(client, f"?date_from={(utcnow() - timedelta(days=1)).date().isoformat()}")
    assert ta not in feats(client, f"?date_to={(utcnow() - timedelta(days=2)).date().isoformat()}")
    assert client.get(f"{API}/complaints?date_from=garbage").status_code == 422

    # priority desc ordering and limit
    order = [f["properties"]["ticket_id"] for f in client.get(f"{API}/complaints").json()["features"]]
    assert order.index(ta) < order.index(tb)
    assert len(client.get(f"{API}/complaints?limit=1").json()["features"]) == 1
    assert client.get(f"{API}/complaints?limit=1001").status_code == 422


def test_complaint_detail_public_and_roles(client, db, make_user):
    owner, h_owner = make_user("citizen")
    _, h_other = make_user("citizen")
    sup, h_sup = make_user("supervisor")
    wk, _ = make_user("worker", name="Field Worker One")
    c = mk_complaint(db, owner=owner["id"], status="resolved", resolved_at=utcnow(), verified_by_user_id=sup["id"],
                     assigned_worker_id=wk["id"], city_corporation_code="corp_x", ward_code="w1")
    t = c.public_ticket_number
    db.add_all([
        StatusHistory(complaint_id=c.id, from_status=None, to_status="submitted", note="Report received",
                      citizen_visible=True),
        StatusHistory(complaint_id=c.id, from_status="submitted", to_status="assigned",
                      note="SECRET internal triage", citizen_visible=False),
        StatusHistory(complaint_id=c.id, from_status="assigned", to_status="resolved", note="Verified fix",
                      citizen_visible=True),
        ComplaintImage(complaint_id=c.id, uploaded_by_user_id=owner["id"], kind="report", storage_name=f"r{t}",
                       content_type="image/jpeg", size_bytes=1),
        ComplaintImage(complaint_id=c.id, uploaded_by_user_id=owner["id"], kind="before", storage_name=f"b{t}",
                       content_type="image/jpeg", size_bytes=1),
        ComplaintImage(complaint_id=c.id, uploaded_by_user_id=owner["id"], kind="after", storage_name=f"a{t}",
                       content_type="image/jpeg", size_bytes=1),
        ComplaintImage(complaint_id=c.id, uploaded_by_user_id=owner["id"], kind="evidence", storage_name=f"e{t}",
                       content_type="image/jpeg", size_bytes=1),
    ])
    db.commit()

    # --- anonymous
    d = client.get(f"{API}/complaints/{t}").json()
    assert d["ticket_id"] == t and d["images"] == [] and d["images_require_login"] is True
    assert d["longitude"] == 77.595 and d["latitude"] == 12.972 and d["coordinates_exact"] is False
    assert [x["to_status"] for x in d["timeline"]] == ["submitted", "resolved"]   # internal row absent
    assert set(d["timeline"][0]) == {"to_status", "note", "created_at"}
    assert d["before_after"]["verified"] is True and d["before_after"]["before_image_id"] is None
    assert d["view_full_report_path"] == f"/app/complaints/{t}"
    assert d["original_language"] == "en" and d["severity_reason"] == "Because."
    assert d["ward_code"] == "w1" and d["city_corporation_code"] == "corp_x"      # resolved -> shown
    for k in ("ai_confidence", "review_reasons", "routing_note", "sla_due_at", "assigned_worker_name",
              "requires_review", "original_description"):
        assert k not in d
    blob = str(d).lower()
    assert "secret internal" not in blob and "private original" not in blob and owner["id"] not in blob
    assert wk["id"] not in blob and "field worker" not in blob

    # --- owner: exact coords, own images, before/after ids
    do = client.get(f"{API}/complaints/{t}", headers=h_owner).json()
    assert do["coordinates_exact"] is True and do["longitude"] == 77.59467
    assert {i["kind"] for i in do["images"]} == {"report", "before", "after"}
    assert do["images_require_login"] is False
    assert do["before_after"]["before_image_id"] and do["before_after"]["after_image_id"]
    # --- other citizen: only before/after of a resolved ticket
    dx = client.get(f"{API}/complaints/{t}", headers=h_other).json()
    assert {i["kind"] for i in dx["images"]} == {"before", "after"} and dx["coordinates_exact"] is False
    # --- staff extras
    ds = client.get(f"{API}/complaints/{t}", headers=h_sup).json()
    assert ds["view_full_report_path"] == f"/staff/tickets/{t}"
    assert ds["ai_confidence"] == 0.77 and ds["review_reasons"] == ["low confidence"]
    assert ds["routing_note"] == "internal routing note" and "sla_due_at" in ds
    assert ds["assigned_worker_name"] == "Field Worker One" and ds["requires_review"] is True
    assert ds["longitude"] == 77.59467

    # --- unresolved: before/after empty, ward hidden
    u = mk_complaint(db, status="in_progress", city_corporation_code="corp_x", ward_code="w1")
    du = client.get(f"{API}/complaints/{u.public_ticket_number}").json()
    assert du["before_after"] == {"before_image_id": None, "after_image_id": None, "verified": False,
                                  "verified_at": None}
    assert du["ward_code"] is None and du["city_corporation_code"] is None


def test_complaint_detail_404_unknown_and_rejected(client, db):
    assert client.get(f"{API}/complaints/CL-0000-99999").status_code == 404
    rej = mk_complaint(db, status="rejected")
    assert client.get(f"{API}/complaints/{rej.public_ticket_number}").status_code == 404
    ok = mk_complaint(db)
    assert client.get(f"{API}/complaints/{ok.public_ticket_number.lower()}").status_code == 200


# ------------------------------------------------------------------------------------------ routes
def test_routes_swap_lat_lng_and_length(client, db):
    n = next(_n)
    r = GarbageRoute(code=f"CT-RT-{n}", name="Test route", schedule_window="06:00-10:00", is_simulated=True,
                     waypoints=[[12.90, 77.50], [12.91, 77.50], [12.91, 77.51]])
    short = GarbageRoute(code=f"CT-RT-{n}b", name="One point", waypoints=[[12.9, 77.5]])
    db.add_all([r, short])
    db.commit()
    db.add(GarbageVehicle(code=f"CT-V-{n}r", route_id=r.id))
    db.commit()
    body = client.get(f"{API}/routes").json()
    assert body["type"] == "FeatureCollection"
    by = {f["properties"]["route_code"]: f for f in body["features"]}
    assert short.code not in by
    f = by[r.code]
    assert f["geometry"]["type"] == "LineString"
    assert f["geometry"]["coordinates"] == [[77.50, 12.90], [77.50, 12.91], [77.51, 12.91]]   # [lng, lat]
    p = f["properties"]
    assert set(p) == {"route_id", "route_code", "name", "schedule_window", "is_simulated", "length_m",
                      "vehicle_codes"}
    assert p["vehicle_codes"] == [f"CT-V-{n}r"] and p["is_simulated"] is True
    # ~1111 m (0.01 deg lat) + ~1085 m (0.01 deg lng at 12.91 N)
    assert 2100 < p["length_m"] < 2300


# ------------------------------------------------------------------------------------------ bins
def _bin(db, code, fill, source="sensor", route_id=None):
    b = GarbageBin(code=code, name=f"Label {code}", latitude=12.95, longitude=77.55, locality="Jayanagar",
                   route_id=route_id)
    db.add(b)
    db.commit()
    if fill is not None:
        db.add(BinReading(bin_id=b.id, fill_pct=fill, source=source))
        db.commit()
    return b


def test_bins_status_thresholds_and_detail(client, db):
    n = next(_n)
    cases = {50: "normal", 51: "filling_up", 80: "filling_up", 81: "collection_recommended",
             95: "collection_recommended", 96: "overflow_risk", 100: "overflow_risk"}
    made = {fill: _bin(db, f"CT-B{n}-{fill}", fill) for fill in cases}
    empty = _bin(db, f"CT-B{n}-none", None)
    body = client.get(f"{API}/bins").json()
    assert body["thresholds"] == {"filling_up": 51.0, "collection_recommended": 81.0, "overflow_risk": 96.0}
    assert "simulated" in body and "source_label" in body
    items = {i["bin_code"]: i for i in body["items"]}
    for fill, status in cases.items():
        i = items[made[fill].code]
        assert i["status"] == status and i["fill_percentage"] == float(fill), fill
        assert set(i) == {"bin_id", "bin_code", "public_label", "longitude", "latitude", "fill_percentage",
                          "status", "data_source", "last_collected_at", "last_reading_at", "predicted_full_at",
                          "route_id"}
        assert i["data_source"] == "sensor" and i["last_reading_at"]
    assert items[empty.code]["status"] == "normal" and items[empty.code]["last_reading_at"] is None

    # detail by id and by code, with collection history (last 10, newest first)
    v = GarbageVehicle(code=f"CT-V{n}-b")
    db.add(v)
    db.commit()
    b = made[96]
    t0 = utcnow() - timedelta(hours=3)
    for k in range(12):
        db.add(CollectionEvent(bin_id=b.id, vehicle_id=v.id, source="simulated", recorded_at=t0 + timedelta(minutes=k)))
    db.commit()
    d = client.get(f"{API}/bins/{b.code}").json()
    assert d["bin_code"] == b.code and len(d["history"]) == 10
    assert d["history"][0] == {"event_type": "collected", "vehicle_code": v.code,
                               "recorded_at": (t0 + timedelta(minutes=11)).isoformat(), "data_source": "simulated"}
    assert d["last_collected_at"] == (t0 + timedelta(minutes=11)).isoformat()
    assert client.get(f"{API}/bins/{b.id}").json()["bin_code"] == b.code
    assert client.get(f"{API}/bins/CT-NOPE").status_code == 404


def test_bin_prediction_is_estimate_from_trend(client, db):
    b = _bin(db, f"CT-BP-{next(_n)}", None, source="worker")
    t0 = utcnow() - timedelta(hours=2)
    for k, fill in enumerate((20, 30, 40, 50)):
        db.add(BinReading(bin_id=b.id, fill_pct=fill, source="worker", recorded_at=t0 + timedelta(minutes=30 * k)))
    db.commit()
    d = client.get(f"{API}/bins/{b.code}").json()
    assert d["predicted_full_at"] is not None and d["data_source"] == "worker"


# ------------------------------------------------------------------------------------------ vehicles
def test_vehicles_stale_flags_status_and_driver_privacy(client, db, make_user):
    n = next(_n)
    r = GarbageRoute(code=f"CT-RV-{n}", name="Veh route", waypoints=[[12.9, 77.5], [12.91, 77.5]])
    db.add(r)
    db.commit()
    now = utcnow()

    def veh(code, *, simulated, age_s, speed=15.0, progress=40.0, status="active", driver="Worker 007 (fictional)",
            lat=12.9005, lng=77.5002):
        v = GarbageVehicle(code=code, route_id=r.id, driver_label=driver, status=status, is_simulated=simulated)
        db.add(v)
        db.commit()
        db.add(VehicleLocation(vehicle_id=v.id, latitude=lat, longitude=lng, speed_kmh=speed, heading=90.0,
                               route_progress_pct=progress, next_stop="Stop X", eta_minutes=7.0,
                               is_simulated=simulated, recorded_at=now - timedelta(seconds=age_s)))
        db.commit()
        return v

    fresh = veh(f"CT-VF-{n}", simulated=False, age_s=5)
    old = veh(f"CT-VO-{n}", simulated=False, age_s=60)
    gone = veh(f"CT-VG-{n}", simulated=False, age_s=900)
    sim = veh(f"CT-VS-{n}", simulated=True, age_s=1)            # simulator is not running in tests
    done = veh(f"CT-VD-{n}", simulated=False, age_s=2, progress=100.0)
    idle = veh(f"CT-VI-{n}", simulated=False, age_s=2, status="idle")
    stopped = veh(f"CT-VP-{n}", simulated=False, age_s=2, speed=0.0, lat=12.99, lng=77.99)  # stopped, far from any bin
    nolocation = GarbageVehicle(code=f"CT-VN-{n}", route_id=r.id)
    db.add(nolocation)
    db.commit()
    near_bin = _bin(db, f"CT-BV-{n}", 60)
    near_bin.latitude, near_bin.longitude = 12.9005, 77.5002
    db.commit()
    collecting = veh(f"CT-VC-{n}", simulated=False, age_s=2, speed=0.0)

    body = client.get(f"{API}/vehicles").json()
    items = {i["vehicle_code"]: i for i in body["items"]}
    assert nolocation.code not in items
    assert body["simulated"] is True and body["source_label"]
    f = items[fresh.code]
    assert f["stale"] is False and f["status"] == "moving" and f["data_source"] == "gps_device"
    assert f["longitude"] == 77.5002 and f["latitude"] == 12.9005 and f["heading_degrees"] == 90.0
    assert f["route_progress"] == 40.0 and f["route_code"] == r.code and f["route_name"] == "Veh route"
    assert f["route_id"] == r.id and f["next_stop"] == "Stop X" and f["recorded_at"]
    assert set(f) == {"vehicle_id", "vehicle_code", "status", "longitude", "latitude", "heading_degrees",
                      "route_progress", "route_id", "route_code", "route_name", "next_stop", "data_source",
                      "recorded_at", "stale", "stale_seconds"}               # no driver / speed / eta for the public
    assert items[old.code]["stale"] is True and items[old.code]["status"] == "delayed"
    assert 55 <= items[old.code]["stale_seconds"] <= 120
    assert items[gone.code]["stale"] is True and items[gone.code]["status"] == "offline"
    s = items[sim.code]
    assert s["data_source"] == "simulated" and s["stale"] is True and s["status"] == "offline"  # sim not running
    assert items[done.code]["status"] == "completed"
    assert items[idle.code]["status"] == "idle"
    assert items[stopped.code]["status"] == "idle"
    assert items[collecting.code]["status"] == "collecting"
    assert "Worker 007" not in str(body)

    # citizens: still no driver; staff: driver, speed, labelled estimate
    _, h_cit = make_user("citizen")
    cit = {i["vehicle_code"]: i for i in client.get(f"{API}/vehicles", headers=h_cit).json()["items"]}
    assert "driver_label" not in cit[fresh.code] and "speed_kmh" not in cit[fresh.code]
    _, h_wk = make_user("worker")
    st = {i["vehicle_code"]: i for i in client.get(f"{API}/vehicles", headers=h_wk).json()["items"]}
    assert st[fresh.code]["driver_label"] == "Worker 007 (fictional)"
    assert st[fresh.code]["speed_kmh"] == 15.0 and st[fresh.code]["eta_minutes"] == 7.0
    assert st[fresh.code]["demo_estimate"] is True

    # detail by id and by code, includes a route summary
    d = client.get(f"{API}/vehicles/{fresh.code}").json()
    assert d["vehicle_code"] == fresh.code and d["route"]["route_code"] == r.code
    assert d["route"]["length_m"] > 1000 and "driver_label" not in d
    assert client.get(f"{API}/vehicles/{fresh.id}").json()["vehicle_code"] == fresh.code
    assert client.get(f"{API}/vehicles/{fresh.id}", headers=h_wk).json()["driver_label"].startswith("Worker 007")
    assert client.get(f"{API}/vehicles/{nolocation.code}").json()["status"] == "offline"
    assert client.get(f"{API}/vehicles/NOPE").status_code == 404


# ------------------------------------------------------------------------------------------ summary / layers
def test_summary_and_layers_config(client, db, make_user):
    mk_complaint(db, severity="critical", status="submitted")
    mk_complaint(db, severity="high", status="resolved", resolved_at=utcnow())
    s = client.get(f"{API}/summary").json()
    assert set(s) == {"demo_mode", "data_sources", "counts", "role_view", "map_default", "simulation_label",
                      "last_updated"}
    assert s["role_view"] == "public" and s["data_sources"]["complaints"] == "civiclens_database"
    assert s["data_sources"]["vehicles"] in ("simulated", "gps_device", "manual")
    assert set(s["counts"]) == {"complaints_active", "complaints_resolved", "critical", "high", "vehicles_active",
                                "bins_total", "bins_overflow_risk"}
    assert s["counts"]["complaints_active"] >= 1 and s["counts"]["complaints_resolved"] >= 1
    assert s["counts"]["critical"] >= 1
    assert s["map_default"] == {"center": [77.5946, 12.9716], "zoom": 12, "pitch": 55, "bearing": -15}
    assert s["simulation_label"] == "DEMO MODE — Vehicle locations and bin readings are simulated."
    _, h = make_user("supervisor")
    assert client.get(f"{API}/summary", headers=h).json()["role_view"] == "supervisor"
    _, hc = make_user("citizen")
    assert client.get(f"{API}/summary", headers=hc).json()["role_view"] == "citizen"

    cfg = client.get(f"{API}/layers/config").json()
    ids = {l["id"]: l for l in cfg["layers"]}
    assert set(ids) == {"complaints", "resolved", "vehicles", "routes", "bins", "buildings"}
    assert ids["resolved"]["default"] is False and ids["complaints"]["default"] is True
    assert {"roads", "waste"} <= {c["code"] for c in cfg["filters"]["categories"]}      # from DB
    assert {"critical", "high", "medium", "low"} == {x["code"] for x in cfg["filters"]["severities"]}
    assert "rejected" not in {x["code"] for x in cfg["filters"]["statuses"]}
    assert cfg["filters"]["departments"] and cfg["legend"]


# ------------------------------------------------------------------------------------------ WebSocket
def _collector(ws):
    q: "queue.Queue" = queue.Queue()

    def run():
        try:
            while True:
                q.put(ws.receive_json())
        except Exception:
            q.put(None)

    threading.Thread(target=run, daemon=True).start()
    return q


def _wait_for(q, pred, timeout=8.0):
    deadline = time.time() + timeout
    seen = []
    while time.time() < deadline:
        try:
            m = q.get(timeout=max(0.05, deadline - time.time()))
        except queue.Empty:
            break
        if m is None:
            break
        seen.append(m)
        if pred(m):
            return m, seen
    raise AssertionError(f"expected message not received; saw {[m.get('type') for m in seen]}")


def test_websocket_snapshot_and_deltas(client, db, monkeypatch):
    monkeypatch.setattr(city_twin, "LIVE_INTERVAL_SECONDS", 0.2)
    n = next(_n)
    c = mk_complaint(db, status="submitted")
    b = _bin(db, f"CT-BW-{n}", 10)
    v = GarbageVehicle(code=f"CT-VW-{n}", is_simulated=False, driver_label="Worker 099 (fictional)")
    db.add(v)
    db.commit()
    db.add(VehicleLocation(vehicle_id=v.id, latitude=12.9, longitude=77.5, is_simulated=False, heading=10.0))
    db.commit()

    with client.websocket_connect("/ws/v1/city-twin/live") as ws:
        snap = ws.receive_json()
        assert snap["type"] == "snapshot" and snap["ts"] and isinstance(snap["complaints_version"], int)
        assert "demo_mode" in snap
        assert any(i["vehicle_code"] == v.code for i in snap["vehicles"])
        assert any(i["bin_code"] == b.code for i in snap["bins"])
        assert "driver_label" not in str(snap["vehicles"])
        q = _collector(ws)

        # complaint status change straight in the DB
        c.status = "in_progress"
        db.commit()
        m, _ = _wait_for(q, lambda m: m["type"] == "complaint.status.updated"
                         and m["data"]["ticket_id"] == c.public_ticket_number)
        assert set(m["data"]) == {"ticket_id", "status", "severity", "category", "longitude", "latitude",
                                  "public_summary", "updated_at"}
        assert m["data"]["status"] == "in_progress"
        assert m["data"]["longitude"] == 77.595 and m["data"]["latitude"] == 12.972    # public 3 dp

        # new complaint -> complaint.created
        c2 = mk_complaint(db)
        m, _ = _wait_for(q, lambda m: m["type"] == "complaint.created"
                         and m["data"]["ticket_id"] == c2.public_ticket_number)
        assert m["data"]["public_summary"] == "Public summary"

        # simulator-style writes: a new vehicle location and a new bin reading
        db.add(VehicleLocation(vehicle_id=v.id, latitude=12.91, longitude=77.51, is_simulated=False, heading=20.0))
        db.add(BinReading(bin_id=b.id, fill_pct=97.0, source="sensor"))
        db.commit()
        mv, _ = _wait_for(q, lambda m: m["type"] == "vehicle.position.updated"
                          and m["data"]["vehicle_code"] == v.code)
        assert mv["data"]["latitude"] == 12.91 and mv["data"]["heading_degrees"] == 20.0
        assert "driver_label" not in mv["data"]
        mb, _ = _wait_for(q, lambda m: m["type"] == "bin.fill.updated" and m["data"]["bin_code"] == b.code)
        assert mb["data"]["fill_percentage"] == 97.0 and mb["data"]["status"] == "overflow_risk"

        # a rejected complaint is retracted without location or text
        c.status = "rejected"
        db.commit()
        mr, _ = _wait_for(q, lambda m: m["type"] == "complaint.status.updated"
                          and m["data"]["ticket_id"] == c.public_ticket_number and m["data"]["status"] == "rejected")
        assert mr["data"]["latitude"] is None and mr["data"]["public_summary"] is None

        # nothing changes -> no repeated deltas for the same complaint
        with pytest.raises(AssertionError):
            _wait_for(q, lambda m: m["type"] in ("vehicle.position.updated", "bin.fill.updated"), timeout=0.8)


def test_websocket_ping_pong(client):
    with client.websocket_connect("/ws/v1/city-twin/live") as ws:
        assert ws.receive_json()["type"] == "snapshot"
        ws.send_text("ping")
        assert ws.receive_text() == "pong"
