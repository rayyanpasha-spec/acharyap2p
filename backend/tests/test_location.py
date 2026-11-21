"""Service-area check, point-in-polygon, boundary import and geocoder (network always monkeypatched)."""
import json

import pytest
from sqlalchemy import delete

from app.config import settings
from app.models import ServiceBoundary
from app.services import location_service as ls

API = "/api/v1"

# --- TEST FIXTURE ONLY: a tiny hand-made square (and a hole). This is NOT real boundary data. ---
SQUARE = {"type": "Polygon", "coordinates": [[[77.0, 12.0], [77.1, 12.0], [77.1, 12.1], [77.0, 12.1], [77.0, 12.0]]]}
SQUARE_WITH_HOLE = {"type": "Polygon", "coordinates": [
    [[77.0, 12.0], [77.1, 12.0], [77.1, 12.1], [77.0, 12.1], [77.0, 12.0]],
    [[77.04, 12.04], [77.06, 12.04], [77.06, 12.06], [77.04, 12.06], [77.04, 12.04]]]}
MULTI = {"type": "MultiPolygon", "coordinates": [SQUARE["coordinates"],
                                                 [[[78.0, 13.0], [78.1, 13.0], [78.1, 13.1], [78.0, 13.1], [78.0, 13.0]]]]}


def test_point_in_polygon_square_hole_and_multipolygon():
    assert ls.geometry_contains(SQUARE, 77.05, 12.05)
    assert not ls.geometry_contains(SQUARE, 77.2, 12.05)        # outside (bbox prefilter)
    assert not ls.geometry_contains(SQUARE, 77.05, 11.99)
    assert ls.geometry_contains(SQUARE, 77.0, 12.05)            # on an edge counts as inside
    assert not ls.geometry_contains(SQUARE_WITH_HOLE, 77.05, 12.05)   # inside the hole
    assert ls.geometry_contains(SQUARE_WITH_HOLE, 77.02, 12.02)
    assert ls.geometry_contains(MULTI, 78.05, 13.05) and ls.geometry_contains(MULTI, 77.05, 12.05)
    assert not ls.geometry_contains(MULTI, 77.5, 12.5)
    assert ls.geometry_bbox(MULTI) == [77.0, 12.0, 78.1, 13.1]
    assert not ls.geometry_contains({"type": "Point", "coordinates": [1, 2]}, 1, 2)


def test_haversine_sanity():
    assert ls.haversine_m(12.97, 77.59, 12.97, 77.59) == 0
    assert 110_000 < ls.haversine_m(12.0, 77.0, 13.0, 77.0) < 112_500


@pytest.fixture()
def fixture_boundaries(db):
    """Insert a fake corporation square + ward square (test fixtures), restore the table afterwards."""
    db.execute(delete(ServiceBoundary))
    db.add_all([
        ServiceBoundary(dataset_version="TEST-FIXTURE", level="corporation", code="test_corp", name="Test Corp",
                        geometry=SQUARE, bbox=ls.geometry_bbox(SQUARE), source="unit test"),
        ServiceBoundary(dataset_version="TEST-FIXTURE", level="ward", code="W1", name="Ward 1", parent_code="test_corp",
                        geometry=SQUARE_WITH_HOLE, bbox=ls.geometry_bbox(SQUARE_WITH_HOLE), source="unit test"),
    ])
    db.commit()
    ls.reload_boundaries()
    yield
    db.execute(delete(ServiceBoundary))
    db.commit()
    ls.reload_boundaries()


def test_check_service_area_with_official_boundaries(client, db, fixture_boundaries):
    inside = ls.check_service_area(db, 12.02, 77.02)
    assert inside.inside_service_area and inside.service_area_status == "in_area"
    assert inside.city_corporation_code == "test_corp" and inside.ward_code == "W1"
    assert inside.boundary_source == "official_import" and inside.boundary_dataset_version == "TEST-FIXTURE"
    in_hole = ls.check_service_area(db, 12.05, 77.05)       # inside corporation, inside the ward's hole
    assert in_hole.city_corporation_code == "test_corp" and in_hole.ward_code is None
    out = ls.check_service_area(db, 12.5, 77.5)
    assert not out.inside_service_area and out.service_area_status == "outside_service_area" and out.notice
    assert out.city_corporation_code is None
    j = client.get(f"{API}/locations/service-area-check", params={"lat": 12.02, "lng": 77.02}).json()
    assert j["city_corporation_code"] == "test_corp" and j["boundary_source"] == "official_import"
    b = client.get(f"{API}/locations/boundaries").json()
    assert b["imported"] is True and b["dataset_version"] == "TEST-FIXTURE"
    assert b["corporations"] == [{"code": "test_corp", "name": "Test Corp"}]


def test_fallback_when_no_boundaries(client, db):
    db.execute(delete(ServiceBoundary))
    db.commit()
    ls.reload_boundaries()
    near = ls.check_service_area(db, settings.DEFAULT_MAP_LATITUDE, settings.DEFAULT_MAP_LONGITUDE)
    assert near.boundary_source == "fallback_approximate" and near.service_area_status == "needs_manual_routing"
    assert near.inside_service_area and near.city_corporation_code is None and near.ward_code is None and near.notice
    far = ls.check_service_area(db, 28.6139, 77.2090)
    assert far.service_area_status == "outside_service_area" and not far.inside_service_area
    b = client.get(f"{API}/locations/boundaries").json()
    assert b["imported"] is False and b["dataset_version"] is None and b["source"] == "none"


def test_service_area_check_validates_ranges(client):
    assert client.get(f"{API}/locations/service-area-check", params={"lat": 120, "lng": 77}).status_code == 422
    assert client.get(f"{API}/locations/service-area-check", params={"lat": 12}).status_code == 422


def test_import_boundaries_from_dir(db, tmp_path):
    (tmp_path / "corporation.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"code": "c_one", "name": "Fixture One"}, "geometry": SQUARE},
        {"type": "Feature", "properties": {"name": "Fixture Two"}, "geometry": MULTI},
        {"type": "Feature", "properties": {"code": "bad"}, "geometry": {"type": "Point", "coordinates": [1, 1]}},
    ]}), encoding="utf-8")
    try:
        s = ls.load_boundaries_from_dir(db, str(tmp_path), dataset_version="fixture-v1", source="unit test")
        assert s["imported"] == 2 and s["skipped"] == 1 and s["by_level"] == {"corporation": 2}
        rows = db.query(ServiceBoundary).filter(ServiceBoundary.active.is_(True)).all()
        assert {r.code for r in rows} == {"c_one", "fixture_two"}
        assert all(r.dataset_version == "fixture-v1" and r.source == "unit test" and r.imported_at for r in rows)
        assert ls.check_service_area(db, 12.05, 77.05).city_corporation_code == "c_one"
        empty = ls.load_boundaries_from_dir(db, str(tmp_path / "missing"))
        assert empty["imported"] == 0 and empty["errors"]
    finally:
        db.execute(delete(ServiceBoundary))
        db.commit()
        ls.reload_boundaries()


# ------------------------------------------------------------------ geocoder (httpx monkeypatched)
class _Resp:
    def __init__(self, data, status=200):
        self._d, self.status_code = data, status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError("http error")

    def json(self):
        return self._d


@pytest.fixture()
def geocoder_on(monkeypatch):
    monkeypatch.setattr(settings, "GEOCODER_PROVIDER", "nominatim")
    monkeypatch.setattr(ls.time, "sleep", lambda s: None)
    ls._rev_cache.clear()
    ls._search_cache.clear()


def test_reverse_geocode_ok_cached_and_failure(geocoder_on, monkeypatch):
    calls = []

    def fake_get(url, params=None, timeout=None, headers=None):
        calls.append((url, params, timeout, headers))
        return _Resp({"display_name": "1, Test Road, Indiranagar, Bengaluru", "address": {"suburb": "Indiranagar",
                                                                                          "postcode": "560038"}})

    monkeypatch.setattr(ls.httpx, "get", fake_get)
    r = ls.reverse_geocode(12.97861, 77.64083)
    assert r == {"address": "1, Test Road, Indiranagar, Bengaluru", "locality": "Indiranagar", "postcode": "560038",
                 "provider": "nominatim", "ok": True}
    ls.reverse_geocode(12.97862, 77.64084)       # same 4-dp key -> cached
    assert len(calls) == 1
    assert calls[0][2] == 6.0 and calls[0][3]["User-Agent"] == settings.GEOCODER_USER_AGENT
    assert calls[0][0].endswith("/reverse")

    def boom(*a, **k):
        raise TimeoutError("slow")

    monkeypatch.setattr(ls.httpx, "get", boom)
    bad = ls.reverse_geocode(13.5, 77.5)
    assert bad["ok"] is False and bad["address"] is None


def test_search_places_and_failure(geocoder_on, monkeypatch):
    seen = {}

    def fake_get(url, params=None, timeout=None, headers=None):
        seen.update(params)
        return _Resp([{"display_name": "Indiranagar, Bengaluru", "lat": "12.97", "lon": "77.64"}, {"display_name": "x"}])

    monkeypatch.setattr(ls.httpx, "get", fake_get)
    out = ls.search_places("Indiranagar")
    assert out == {"items": [{"label": "Indiranagar, Bengaluru", "lat": 12.97, "lng": 77.64}]}
    assert seen["viewbox"] == "77.35,13.20,77.85,12.70" and seen["bounded"] == 1 and seen["limit"] == 6
    assert seen["countrycodes"] == "in"
    monkeypatch.setattr(ls.httpx, "get", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("down")))
    assert ls.search_places("another place") == {"items": []}


def test_geocode_endpoints_auth_and_provider_none(client, make_user):
    _u, h = make_user()
    assert client.get(f"{API}/locations/reverse-geocode", params={"lat": 12.9, "lng": 77.5}).status_code == 401
    r = client.get(f"{API}/locations/reverse-geocode", params={"lat": 12.9, "lng": 77.5}, headers=h)
    assert r.status_code == 200 and r.json()["ok"] is False and r.json()["provider"] == "none"
    assert client.get(f"{API}/locations/reverse-geocode", params={"lat": 912.9, "lng": 77.5}, headers=h).status_code == 422
    s = client.get(f"{API}/locations/search", params={"q": "Koramangala"}, headers=h)
    assert s.status_code == 200 and s.json() == {"items": []}
    assert client.get(f"{API}/locations/search", params={"q": "Koramangala"}).status_code == 401
