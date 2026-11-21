"""Road snapping of simulated CleanRoute routes (the routing service is always mocked: no network)."""
import math

import pytest

from app.models import GarbageBin, GarbageRoute
from app.services import garbage_service as gs
from app.services import route_snapping as rs

CODE = "SNAPTEST-R1"


def _road(n=80):
    """A fake, dense 'road' running east-west near Bengaluru centre (lat, lng)."""
    return [[12.9700 + 0.0002 * math.sin(i / 6), 77.5900 + i * 0.0004] for i in range(n)]


@pytest.fixture()
def route(client, db):
    r = GarbageRoute(code=CODE, name="snap test", waypoints=[[12.97, 77.59], [12.9705, 77.60], [12.971, 77.61], [12.97, 77.59]],
                     is_simulated=True)
    db.add(r)
    db.flush()
    bins = [GarbageBin(code=f"SNAPTEST-B{i}", name="b", latitude=12.9712 + i * 0.0003, longitude=77.592 + i * 0.006, route_id=r.id,
                       is_simulated=True) for i in range(3)]       # ~150-300 m off the road
    db.add_all(bins)
    db.commit()
    yield r
    db.query(GarbageBin).filter(GarbageBin.code.like("SNAPTEST-%")).delete(synchronize_session=False)
    db.query(GarbageRoute).filter(GarbageRoute.code == CODE).delete(synchronize_session=False)
    db.commit()


def test_is_snapped_threshold():
    assert not gs.is_snapped([[1, 1]] * 8)
    assert gs.is_snapped([[1, 1]] * gs.MIN_SNAPPED_POINTS)


def test_snaps_route_and_puts_bins_on_the_road(db, route, monkeypatch):
    road = _road()
    monkeypatch.setattr(rs, "fetch_road_path", lambda wps: road)
    res = rs.snap_routes(db, codes=[CODE])
    assert res["snapped"] == [CODE] and res["failed"] == []
    db.expire_all()
    r = db.query(GarbageRoute).filter(GarbageRoute.code == CODE).one()
    assert len(r.waypoints) == len(road) and gs.is_snapped(r.waypoints)
    geom = gs.RouteGeometry(r.waypoints)
    for b in db.query(GarbageBin).filter(GarbageBin.code.like("SNAPTEST-%")):
        assert geom.project(b.latitude, b.longitude)[1] < 1.0        # within 1 m of the road polyline


def test_snapping_is_idempotent_and_reports_flag(client, db, route, monkeypatch):
    monkeypatch.setattr(rs, "fetch_road_path", lambda wps: _road())
    rs.snap_routes(db, codes=[CODE])
    calls = []
    monkeypatch.setattr(rs, "fetch_road_path", lambda wps: calls.append(1) or _road())
    again = rs.snap_routes(db, codes=[CODE])
    assert again["already_snapped"] == 1 and again["snapped"] == [] and not calls
    item = next(x for x in client.get("/api/v1/garbage/routes").json() if x["code"] == CODE)
    assert item["road_snapped"] is True and "real roads" in item["path_note"]


def test_failure_keeps_the_straight_demo_route(db, route, monkeypatch):
    def boom(wps):
        raise RuntimeError("routing service down")
    monkeypatch.setattr(rs, "fetch_road_path", boom)
    res = rs.snap_routes(db, codes=[CODE])
    assert res["failed"] == [CODE] and res["snapped"] == []
    db.expire_all()
    assert len(db.query(GarbageRoute).filter(GarbageRoute.code == CODE).one().waypoints) == 4


def test_fetch_road_path_parses_osrm_response_and_swaps_lng_lat(monkeypatch):
    coords = [[77.59 + i * 0.0004, 12.97] for i in range(60)]           # OSRM returns [lng, lat]
    captured = {}

    class R:
        status_code = 200

        def json(self):
            return {"code": "Ok", "routes": [{"geometry": {"coordinates": coords}}]}

    def fake_get(url, **kw):
        captured["url"] = url
        return R()
    monkeypatch.setattr(rs.httpx, "get", fake_get)
    out = rs.fetch_road_path([[12.97, 77.59], [12.97, 77.61]])
    assert "77.590000,12.970000;77.610000,12.970000" in captured["url"]   # request is lng,lat
    assert out[0][0] == pytest.approx(12.97) and out[0][1] == pytest.approx(77.59)  # result is lat,lng
    assert len(out) >= gs.MIN_SNAPPED_POINTS


def test_fetch_rejects_bad_answers(monkeypatch):
    class Bad:
        status_code = 200

        def json(self):
            return {"code": "NoRoute", "routes": []}
    monkeypatch.setattr(rs.httpx, "get", lambda *a, **k: Bad())
    assert rs.fetch_road_path([[12.97, 77.59], [12.97, 77.61]]) is None

    far = [[-122.0 + i * 0.001, 37.0] for i in range(60)]                 # not Bengaluru: must be rejected

    class Far:
        status_code = 200

        def json(self):
            return {"code": "Ok", "routes": [{"geometry": {"coordinates": far}}]}
    monkeypatch.setattr(rs.httpx, "get", lambda *a, **k: Far())
    assert rs.fetch_road_path([[12.97, 77.59], [12.97, 77.61]]) is None


def test_admin_snap_endpoint_requires_admin(client, make_user, monkeypatch):
    monkeypatch.setattr(rs, "snap_routes", lambda *a, **k: {"snapped": [], "failed": [], "already_snapped": 0})
    _, citizen = make_user("citizen")
    _, admin = make_user("admin")
    assert client.post("/api/v1/demo/garbage/snap-routes", headers=citizen).status_code == 403
    assert client.post("/api/v1/demo/garbage/snap-routes").status_code == 401
    r = client.post("/api/v1/demo/garbage/snap-routes", headers=admin)
    assert r.status_code == 200 and r.json()["simulated"] is True


def test_remove_spurs_cuts_out_and_back_detours_but_keeps_real_loops():
    straight = [[12.97, 77.59 + i * 0.0003] for i in range(20)]                 # eastbound road
    spur_out = [[12.97 + k * 0.0003, straight[10][1]] for k in range(1, 7)]    # dead-end street going north from index 10
    path = straight[:11] + spur_out + spur_out[::-1][1:] + [straight[10]] + straight[11:]
    cleaned = rs.remove_spurs(path)
    assert len(cleaned) < len(path)
    assert max(p[0] for p in cleaned) < 12.9701                                 # the northern spur is gone
    assert cleaned[0] == straight[0] and cleaned[-1] == straight[-1]
    # a block loop (not retraced) must survive untouched
    loop = [[12.97, 77.59], [12.9703, 77.59], [12.9703, 77.5903], [12.97, 77.5903], [12.97, 77.5906], [12.97, 77.5909],
            [12.97, 77.5912], [12.97, 77.5915], [12.97, 77.5918]]
    assert rs.remove_spurs(loop) == loop


def test_fetch_falls_back_to_the_second_routing_server(monkeypatch):
    monkeypatch.setattr(rs.settings, "OSRM_BASE_URL", "https://down.example,https://up.example")
    coords = [[77.59 + i * 0.0004, 12.97] for i in range(60)]
    seen = []

    class Ok:
        status_code = 200

        def json(self):
            return {"code": "Ok", "routes": [{"geometry": {"coordinates": coords}}]}

    def fake_get(url, **kw):
        seen.append(url.split("/route/")[0])
        if "down.example" in url:
            raise rs.httpx.ConnectTimeout("slow")
        return Ok()
    monkeypatch.setattr(rs.httpx, "get", fake_get)
    out = rs.fetch_road_path([[12.97, 77.59], [12.97, 77.61]])
    assert out and seen[-1] == "https://up.example"
    assert seen.count("https://down.example") == rs.ATTEMPTS_PER_SERVER          # retried before falling back


def test_seed_upgrades_an_old_design_database(client, db):
    """A database seeded with the old coarse routes is upgraded to the new design (and re-snapped later)."""
    from app import seed_garbage
    from app.models import AppSetting

    seed_garbage.seed(db)
    r = db.query(GarbageRoute).filter(GarbageRoute.code == "CL-R1").one()
    b = db.query(GarbageBin).filter(GarbageBin.code == "CL-BIN-004").one()
    # simulate an OLD database: old name, 7 straight waypoints, old marker
    r.name, r.waypoints = "Malleshwaram - Rajajinagar - Vijayanagar loop (demo)", [[13.0, 77.57]] * 8
    b.name, b.locality = "Demo bin - Malleshwaram 18th cross", "Malleshwaram"
    db.merge(AppSetting(key="cleanroute_design", value={"v": 1}))
    db.commit()

    seed_garbage.seed(db)
    db.expire_all()
    r = db.query(GarbageRoute).filter(GarbageRoute.code == "CL-R1").one()
    b = db.query(GarbageBin).filter(GarbageBin.code == "CL-BIN-004").one()
    assert r.name.startswith("North-west loop") and len(r.waypoints) == 8 and not gs.is_snapped(r.waypoints)
    assert b.locality == "Yeshwanthpur"
    assert db.get(AppSetting, "cleanroute_design").value == {"v": seed_garbage.DESIGN_VERSION}
    seed_garbage.seed(db)                                   # idempotent: no change on the second run
    db.expire_all()
    assert db.query(GarbageRoute).filter(GarbageRoute.code == "CL-R1").one().name.startswith("North-west loop")
