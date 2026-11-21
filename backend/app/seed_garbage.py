"""CleanRoute demo seed. Idempotent. EVERYTHING here is FICTIONAL / SIMULATED.

Coordinates are plausible demo points around central Bengaluru localities. They are NOT surveyed bin or
route locations: routes are snapped to real roads at startup (when routing is reachable) and no corporation or
ward is claimed (city_corporation_code stays null; ward_label is a plain demo label).
"""
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.base import utcnow
from app.models.reference import AppSetting
from app.models.garbage import BinReading, GarbageBin, GarbageRoute, GarbageVehicle, VehicleLocation
from app.services.garbage_service import RouteGeometry, bin_rate_pct_per_hour

# Each route: code, name, schedule window, demo ward label, waypoints (the loop is closed by repeating the first point).
# The waypoints are well-known Bengaluru localities / arterial junctions (approximate coordinates). They are snapped to the real
# road network at startup (see services/route_snapping.py), which gives long, clean loops of roughly 20-35 km.
ROUTES = [
    ("CL-R1", "North-west loop: Malleshwaram - Yeshwanthpur - Rajajinagar - Vijayanagar - Majestic (demo)", "06:00-10:00",
     "Demo zone A (fictional label)", [
        [13.0035, 77.5700],   # 0 Malleshwaram
        [13.0287, 77.5409],   # 1 Yeshwanthpur
        [12.9910, 77.5520],   # 2 Rajajinagar
        [12.9894, 77.5385],   # 3 Basaveshwaranagar
        [12.9719, 77.5370],   # 4 Vijayanagar
        [12.9774, 77.5726],   # 5 Majestic / city centre
        [12.9945, 77.5760],   # 6 Seshadripuram
    ]),
    ("CL-R2", "East loop: Shivajinagar - MG Road - Ulsoor - Indiranagar - CV Raman Nagar (demo)", "07:00-11:00",
     "Demo zone B (fictional label)", [
        [12.9857, 77.6057],   # 0 Shivajinagar
        [12.9756, 77.6068],   # 1 MG Road
        [12.9810, 77.6200],   # 2 Ulsoor
        [12.9784, 77.6408],   # 3 Indiranagar
        [12.9850, 77.6640],   # 4 CV Raman Nagar
        [12.9906, 77.6525],   # 5 Baiyappanahalli
        [12.9930, 77.6130],   # 6 Richards Town
    ]),
    ("CL-R3", "South loop: Basavanagudi - Jayanagar - JP Nagar - BTM - HSR - Koramangala (demo)", "06:30-10:30",
     "Demo zone C (fictional label)", [
        [12.9422, 77.5750],   # 0 Basavanagudi
        [12.9250, 77.5938],   # 1 Jayanagar
        [12.9063, 77.5857],   # 2 JP Nagar
        [12.9166, 77.6101],   # 3 BTM Layout
        [12.9116, 77.6474],   # 4 HSR Layout
        [12.9352, 77.6245],   # 5 Koramangala
        [12.9507, 77.5848],   # 6 Lalbagh
    ]),
    ("CL-R4", "Whitefield loop: Whitefield - ITPL - Mahadevapura - Marathahalli - Varthur (demo)", "08:00-12:00",
     "Demo zone D (fictional label)", [
        [12.9698, 77.7500],   # 0 Whitefield
        [12.9855, 77.7380],   # 1 ITPL
        [12.9910, 77.6960],   # 2 Mahadevapura
        [12.9569, 77.7011],   # 3 Marathahalli
        [12.9400, 77.7470],   # 4 Varthur
        [12.9996, 77.7596],   # 5 Kadugodi
    ]),
]
DESIGN_VERSION = 2   # bump when ROUTES / BINS change: existing databases are upgraded automatically (demo data only)

# code, route code, driver label (fictional), initial progress %
VEHICLES = [
    ("CL-GT-01", "CL-R1", "Worker 024 (fictional)", 5.0),
    ("CL-GT-02", "CL-R2", "Worker 031 (fictional)", 30.0),
    ("CL-GT-03", "CL-R3", "Worker 047 (fictional)", 55.0),
    ("CL-GT-04", "CL-R4", "Worker 052 (fictional)", 80.0),
]

# code, route code, waypoint index, dlat, dlng (offset of ~15-30 m from the waypoint), name, locality, initial fill
# (bins are moved onto the snapped road at startup, so the offsets only matter before snapping)
BINS = [
    ("CL-BIN-001", "CL-R1", 0, 0.0002, 0.0001, "Demo bin - Malleshwaram market side", "Malleshwaram", 22),
    ("CL-BIN-002", "CL-R1", 2, -0.0002, 0.0002, "Demo bin - Rajajinagar main road", "Rajajinagar", 63),
    ("CL-BIN-003", "CL-R1", 4, 0.0001, -0.0002, "Demo bin - Vijayanagar bus stop", "Vijayanagar", 84),
    ("CL-BIN-004", "CL-R1", 1, 0.0002, 0.0002, "Demo bin - Yeshwanthpur circle", "Yeshwanthpur", 41),
    ("CL-BIN-005", "CL-R2", 0, 0.0001, 0.0002, "Demo bin - Shivajinagar bus station", "Shivajinagar", 97),
    ("CL-BIN-006", "CL-R2", 3, -0.0002, -0.0001, "Demo bin - Indiranagar 100 ft road", "Indiranagar", 35),
    ("CL-BIN-007", "CL-R2", 2, 0.0002, -0.0002, "Demo bin - Ulsoor lake side", "Ulsoor", 71),
    ("CL-BIN-008", "CL-R2", 4, -0.0001, 0.0002, "Demo bin - CV Raman Nagar main road", "CV Raman Nagar", 12),
    ("CL-BIN-009", "CL-R3", 0, 0.0002, 0.0001, "Demo bin - Basavanagudi park gate", "Basavanagudi", 55),
    ("CL-BIN-010", "CL-R3", 1, -0.0002, -0.0002, "Demo bin - Jayanagar 4th block", "Jayanagar", 90),
    ("CL-BIN-011", "CL-R3", 2, 0.0001, 0.0002, "Demo bin - JP Nagar 2nd phase", "JP Nagar", 30),
    ("CL-BIN-012", "CL-R3", 5, -0.0002, 0.0001, "Demo bin - Koramangala 5th block", "Koramangala", 78),
    ("CL-BIN-013", "CL-R4", 0, 0.0002, -0.0001, "Demo bin - Whitefield main road", "Whitefield", 92),
    ("CL-BIN-014", "CL-R4", 3, -0.0002, 0.0001, "Demo bin - Marathahalli bridge", "Marathahalli", 18),
    ("CL-BIN-015", "CL-R4", 2, 0.0001, -0.0002, "Demo bin - Mahadevapura junction", "Mahadevapura", 45),
    ("CL-BIN-016", "CL-R4", 4, -0.0001, -0.0002, "Demo bin - Varthur lake side", "Varthur", 67),
]


def seed(db: Session) -> None:
    now = utcnow()
    marker = db.get(AppSetting, "cleanroute_design")
    upgrade = not (marker and isinstance(marker.value, dict) and marker.value.get("v") == DESIGN_VERSION)
    routes: dict[str, GarbageRoute] = {}
    for code, name, window, ward, pts in ROUTES:
        r = db.execute(select(GarbageRoute).where(GarbageRoute.code == code)).scalar_one_or_none()
        if r is not None and upgrade and r.is_simulated:   # old demo design -> new long arterial route (re-snapped at startup)
            r.name, r.schedule_window, r.ward_label, r.waypoints = name, window, ward, pts + [pts[0]]
        if not r:
            r = GarbageRoute(code=code, name=name, waypoints=pts + [pts[0]], schedule_window=window,
                             ward_label=ward, city_corporation_code=None, is_simulated=True)
            db.add(r)
        routes[code] = r
    db.flush()

    for code, route_code, driver, pct in VEHICLES:
        v = db.execute(select(GarbageVehicle).where(GarbageVehicle.code == code)).scalar_one_or_none()
        if not v:
            v = GarbageVehicle(code=code, route_id=routes[route_code].id, driver_label=driver,
                               current_task="Waste collection", status="active", capacity_kg=3000, is_simulated=True)
            db.add(v)
            db.flush()
        has_loc = db.execute(select(VehicleLocation.id).where(VehicleLocation.vehicle_id == v.id).limit(1)).first()
        if not has_loc:
            g = RouteGeometry(routes[route_code].waypoints)
            d = pct / 100.0 * g.length
            lat, lng = g.position_at(d)
            db.add(VehicleLocation(vehicle_id=v.id, latitude=lat, longitude=lng, speed_kmh=18.0,
                                   heading=g.heading_at(d), route_progress_pct=pct, next_stop=None,
                                   eta_minutes=None, is_simulated=True, recorded_at=now))

    for code, route_code, wi, dlat, dlng, name, locality, fill in BINS:
        b = db.execute(select(GarbageBin).where(GarbageBin.code == code)).scalar_one_or_none()
        wp = routes[route_code].waypoints[wi]
        if b:
            if upgrade and b.is_simulated:   # keep its readings, move it to the new design
                b.name, b.locality, b.route_id = name, locality, routes[route_code].id
                b.latitude, b.longitude = round(wp[0] + dlat, 6), round(wp[1] + dlng, 6)
            continue
        b = GarbageBin(code=code, name=name, latitude=round(wp[0] + dlat, 6), longitude=round(wp[1] + dlng, 6),
                       locality=locality, route_id=routes[route_code].id, capacity_litres=1100, is_simulated=True)
        db.add(b)
        db.flush()
        rate = bin_rate_pct_per_hour(code)  # short simulated history so pickup estimates exist from the start
        for minutes_ago in (20, 10, 0):
            level = max(0.0, min(100.0, fill - rate * minutes_ago / 60.0))
            db.add(BinReading(bin_id=b.id, fill_pct=level, source="simulated",
                              recorded_at=now - timedelta(minutes=minutes_ago)))
    if upgrade:
        if marker:
            marker.value = {"v": DESIGN_VERSION}
        else:
            db.add(AppSetting(key="cleanroute_design", value={"v": DESIGN_VERSION}, description="CleanRoute demo design version"))
    db.commit()
