"""CleanRoute tests. Everything is simulated; seed is called explicitly (test env has SEED_DEMO_DATA=false)."""
from datetime import datetime, timedelta

import pytest
from sqlalchemy import func, select

from app import seed_garbage
from app.models.garbage import (BinReading, CollectionEvent, GarbageBin, GarbageRoute, GarbageVehicle,
                                VehicleLocation)
from app.services import garbage_service as gs

LABEL = "DEMO / SIMULATED GPS"


def _counts(db):
    return tuple(db.scalar(select(func.count()).select_from(m)) for m in
                 (GarbageRoute, GarbageVehicle, GarbageBin))


@pytest.fixture()
def seeded(client, db):
    seed_garbage.seed(db)
    gs.reset_cache()
    return db


def test_seed_idempotent(client, db):  # `client` fixture creates the tables
    seed_garbage.seed(db)
    first = _counts(db)
    readings = db.scalar(select(func.count()).select_from(BinReading))
    seed_garbage.seed(db)
    assert _counts(db) == first == (4, 4, 16)
    assert db.scalar(select(func.count()).select_from(BinReading)) == readings
    codes = sorted(v.code for v in db.execute(select(GarbageVehicle)).scalars())
    assert codes == ["CL-GT-01", "CL-GT-02", "CL-GT-03", "CL-GT-04"]
    for r in db.execute(select(GarbageRoute)).scalars():
        assert len(r.waypoints) >= 6
        assert r.city_corporation_code is None


def test_vehicles_shape_and_driver_privacy(client, seeded, make_user):
    r = client.get("/api/v1/garbage/vehicles")
    assert r.status_code == 200
    body = r.json()
    assert body["simulated"] is True and body["source_label"] == LABEL
    assert len(body["items"]) == 4
    item = body["items"][0]
    for k in ("id", "code", "status", "current_task", "route", "latitude", "longitude", "speed_kmh", "heading",
              "route_progress_pct", "next_stop", "eta_minutes", "recorded_at", "is_simulated"):
        assert k in item
    assert item["is_simulated"] is True
    assert "driver_label" not in item
    _, citizen = make_user("citizen")
    assert "driver_label" not in client.get("/api/v1/garbage/vehicles", headers=citizen).json()["items"][0]
    _, worker = make_user("worker")
    staff = client.get("/api/v1/garbage/vehicles", headers=worker).json()["items"][0]
    assert "(fictional)" in staff["driver_label"]
    one = client.get(f"/api/v1/garbage/vehicles/{item['id']}")
    assert one.status_code == 200 and one.json()["code"] == item["code"] and one.json()["source_label"] == LABEL
    assert client.get("/api/v1/garbage/vehicles/99999").status_code == 404


def test_routes_bins_summary_shapes(client, seeded):
    routes = client.get("/api/v1/garbage/routes").json()
    assert len(routes) == 4
    for r in routes:
        assert len(r["waypoints"]) >= 6 and r["source_label"] == LABEL and r["vehicle_codes"]
    bins = client.get("/api/v1/garbage/bins").json()
    assert bins["simulated"] is True and bins["source_label"] == LABEL
    assert bins["thresholds"]["overflow_risk"] == 96
    assert len(bins["items"]) == 16
    b = bins["items"][0]
    for k in ("id", "code", "name", "locality", "latitude", "longitude", "fill_pct", "state", "source",
              "recorded_at", "predicted_full_at", "route_id", "is_simulated"):
        assert k in b
    assert 0 <= b["fill_pct"] <= 100
    s = client.get("/api/v1/garbage/summary").json()
    assert s["simulated"] is True and s["source_label"] == LABEL
    assert s["bins_total"] == 16 and s["vehicles_active"] == 4
    for k in ("bins_overflow_risk", "bins_collection_recommended", "collections_today", "last_updated"):
        assert k in s


def test_alerts_office_only(client, seeded, make_user):
    assert client.get("/api/v1/garbage/alerts").status_code == 401
    _, citizen = make_user("citizen")
    assert client.get("/api/v1/garbage/alerts", headers=citizen).status_code == 403
    _, officer = make_user("officer")
    r = client.get("/api/v1/garbage/alerts", headers=officer)
    assert r.status_code == 200
    body = r.json()
    assert "overflow_risk" in body and "missed_collection" in body and body["source_label"] == LABEL
    assert client.get("/api/v1/garbage/collections", headers=officer).status_code == 200
    assert client.get("/api/v1/garbage/collections", headers=citizen).status_code == 403


def test_bin_state_thresholds():
    assert gs.bin_state(0) == "normal"
    assert gs.bin_state(50) == "normal"
    assert gs.bin_state(51) == "filling_up"
    assert gs.bin_state(80) == "filling_up"
    assert gs.bin_state(81) == "collection_recommended"
    assert gs.bin_state(95) == "collection_recommended"
    assert gs.bin_state(96) == "overflow_risk"
    assert gs.bin_state(100) == "overflow_risk"


def test_state_from_app_settings(client, db):
    assert gs.get_thresholds(db)["filling_up"] == 51  # seeded reference setting


def test_geometry_and_prediction_helpers():
    assert gs.haversine_m(12.97, 77.59, 12.97, 77.59) == 0
    d = gs.haversine_m(12.9716, 77.5946, 12.9816, 77.5946)
    assert 1100 < d < 1120
    assert round(gs.bearing_deg(12.0, 77.0, 13.0, 77.0)) in (0, 360)
    g = gs.RouteGeometry([[12.0, 77.0], [12.0, 77.01], [12.01, 77.01]])
    lat, lng = g.position_at(g.length / 2)
    assert 12.0 <= lat <= 12.01 and 77.0 <= lng <= 77.01
    assert g.position_at(g.length) == g.position_at(0) or g.length > 0
    along, perp = g.project(12.0, 77.005)
    assert perp < 1 and 0 < along < g.cum[1]
    t0 = datetime(2026, 1, 1, 8, 0, 0)
    readings = [(t0 + timedelta(minutes=10 * i), 40.0 + 5 * i) for i in range(4)]  # 0.5 pct / minute
    eta = gs.predict_full_at(readings)
    assert eta == readings[-1][0] + timedelta(minutes=(100 - 55) / 0.5)
    assert gs.predict_full_at(readings[:1]) is None
    flat = [(t0, 50.0), (t0 + timedelta(minutes=5), 50.0)]
    assert gs.predict_full_at(flat) is None
    reset = readings + [(t0 + timedelta(minutes=40), 4.0)]
    assert gs.predict_full_at(reset) is None  # only one reading since the collection


def test_step_moves_vehicle_and_changes_bins(seeded):
    db = seeded
    before_v = {v["code"]: (v["latitude"], v["longitude"]) for v in gs.vehicles_payload(db)}
    before_b = {b["code"]: b["fill_pct"] for b in gs.bins_payload(db)[0]}
    locs = db.scalar(select(func.count()).select_from(VehicleLocation))
    tick = gs.step(db, 5.0)
    assert tick["type"] == "tick" and tick["simulated"] is True and tick["source_label"] == LABEL
    assert len(tick["vehicles"]) == 4 and all("driver_label" not in v for v in tick["vehicles"])
    after_v = {v["code"]: (v["latitude"], v["longitude"]) for v in gs.vehicles_payload(db)}
    assert all(after_v[c] != before_v[c] for c in before_v)
    after_b = {b["code"]: b["fill_pct"] for b in gs.bins_payload(db)[0]}
    assert any(after_b[c] != before_b[c] for c in before_b)
    assert db.scalar(select(func.count()).select_from(VehicleLocation)) == locs + 4
    assert all(v["next_stop"] and v["eta_minutes"] is not None for v in tick["vehicles"])


def test_step_collects_full_bin(seeded):
    db = seeded
    b = db.execute(select(GarbageBin).where(GarbageBin.code == "CL-BIN-003")).scalar_one()
    db.add(BinReading(bin_id=b.id, fill_pct=90.0, source="simulated"))
    db.commit()
    before = db.scalar(select(func.count()).select_from(CollectionEvent).where(CollectionEvent.bin_id == b.id))
    got = None
    for _ in range(300):
        tick = gs.step(db, 3.0)
        got = next((e for e in tick["events"] if e["bin_code"] == "CL-BIN-003"), None)
        if got:
            break
    assert got and got["type"] == "collection" and got["vehicle_code"] == "CL-GT-01"
    assert db.scalar(select(func.count()).select_from(CollectionEvent).where(CollectionEvent.bin_id == b.id)) == before + 1
    latest = gs._latest_readings(db)[b.id]
    assert latest.fill_pct < 20


def test_prune_keeps_last_200_locations(seeded):
    db = seeded
    for _ in range(205):
        gs.step(db, 1.0)
    vid = db.execute(select(GarbageVehicle.id).order_by(GarbageVehicle.id)).scalars().first()
    n = db.scalar(select(func.count()).select_from(VehicleLocation).where(VehicleLocation.vehicle_id == vid))
    assert n == 200


def test_manual_collection_resets_bin(client, seeded, make_user):
    db = seeded
    b = db.execute(select(GarbageBin).where(GarbageBin.code == "CL-BIN-005")).scalar_one()
    _, worker = make_user("worker")
    assert client.post(f"/api/v1/garbage/bins/{b.id}/reading", json={"fill_pct": 97, "source": "worker"},
                       headers=worker).status_code == 200
    before = db.scalar(select(func.count()).select_from(CollectionEvent))
    r = client.post("/api/v1/garbage/collections", json={"bin_id": b.id}, headers=worker)
    assert r.status_code == 201
    body = r.json()
    assert body["collection"]["fill_before_pct"] == 97.0 and body["collection"]["is_simulated"] is False
    assert body["bin"]["fill_pct"] < 10 and body["bin"]["state"] == "normal"
    db.expire_all()
    assert db.scalar(select(func.count()).select_from(CollectionEvent)) == before + 1
    assert client.post("/api/v1/garbage/collections", json={"bin_id": 99999}, headers=worker).status_code == 404
    assert client.post("/api/v1/garbage/collections", json={"bin_id": b.id, "vehicle_id": 99999},
                       headers=worker).status_code == 404


def test_reading_role_checks_and_validation(client, seeded, make_user):
    b = seeded.execute(select(GarbageBin).where(GarbageBin.code == "CL-BIN-001")).scalar_one()
    url = f"/api/v1/garbage/bins/{b.id}/reading"
    assert client.post(url, json={"fill_pct": 50, "source": "worker"}).status_code == 401
    _, citizen = make_user("citizen")
    assert client.post(url, json={"fill_pct": 50, "source": "worker"}, headers=citizen).status_code == 403
    _, officer = make_user("officer")
    assert client.post(url, json={"fill_pct": 101, "source": "worker"}, headers=officer).status_code == 422
    assert client.post(url, json={"fill_pct": -1, "source": "worker"}, headers=officer).status_code == 422
    assert client.post(url, json={"fill_pct": 50, "source": "simulated"}, headers=officer).status_code == 422
    r = client.post(url, json={"fill_pct": 82.5, "source": "worker"}, headers=officer)
    assert r.status_code == 200
    out = r.json()
    assert out["fill_pct"] == 82.5 and out["state"] == "collection_recommended"
    assert out["source"] == "worker" and out["is_simulated"] is False
    assert client.post("/api/v1/garbage/bins/99999/reading", json={"fill_pct": 5}, headers=officer).status_code == 404
    for pct, state in ((50, "normal"), (51, "filling_up"), (81, "collection_recommended"), (96, "overflow_risk")):
        got = client.post(url, json={"fill_pct": pct, "source": "sensor"}, headers=officer).json()
        assert got["state"] == state and got["source"] == "sensor"


def test_demo_control_admin_only(client, seeded, make_user):
    _, officer = make_user("officer")
    assert client.get("/api/v1/demo/garbage/status", headers=officer).status_code == 403
    assert client.post("/api/v1/demo/garbage/start", headers=officer).status_code == 403
    _, admin = make_user("admin")
    st = client.get("/api/v1/demo/garbage/status", headers=admin).json()
    assert st["running"] is False and st["source_label"] == LABEL
    try:
        assert client.post("/api/v1/demo/garbage/start", headers=admin).json()["running"] is True
        assert client.get("/api/v1/demo/garbage/status", headers=admin).json()["running"] is True
    finally:
        stopped = client.post("/api/v1/demo/garbage/stop", headers=admin).json()
    assert stopped["running"] is False


def test_websocket_snapshot(client, seeded):
    with client.websocket_connect("/ws/v1/garbage/live") as ws:
        msg = ws.receive_json()
        assert msg["type"] == "snapshot"
        assert msg["simulated"] is True and msg["source_label"] == LABEL
        assert len(msg["vehicles"]) == 4 and len(msg["bins"]) == 16
        assert all("driver_label" not in v for v in msg["vehicles"])
        ws.send_text("ping")
        assert ws.receive_json()["type"] == "pong"
