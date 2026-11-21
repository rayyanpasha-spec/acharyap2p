"""CleanRoute demo seed. Idempotent. EVERYTHING here is FICTIONAL / SIMULATED.

Coordinates are plausible demo points around central Bengaluru localities. They are NOT surveyed bin or
route locations: routes are straight polylines between waypoints (not road-snapped) and no corporation or
ward is claimed (city_corporation_code stays null; ward_label is a plain demo label).
"""
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.base import utcnow
from app.models.garbage import BinReading, GarbageBin, GarbageRoute, GarbageVehicle, VehicleLocation
from app.services.garbage_service import RouteGeometry, bin_rate_pct_per_hour

# Each route: code, name, schedule window, demo ward label, waypoints (the loop is closed by repeating the first point).
ROUTES = [
    ("CL-R1", "Malleshwaram - Rajajinagar - Vijayanagar loop (demo)", "06:00-10:00", "Demo zone A (fictional label)", [
        [13.0030, 77.5700],   # Malleshwaram
        [13.0000, 77.5600],
        [12.9910, 77.5520],   # Rajajinagar
        [12.9820, 77.5450],
        [12.9710, 77.5370],   # Vijayanagar
        [12.9800, 77.5560],
        [12.9920, 77.5660],
    ]),
    ("CL-R2", "Shivajinagar - Indiranagar loop (demo)", "07:00-11:00", "Demo zone B (fictional label)", [
        [12.9850, 77.6050],   # Shivajinagar
        [12.9830, 77.6180],
        [12.9790, 77.6300],
        [12.9780, 77.6400],   # Indiranagar
        [12.9720, 77.6520],
        [12.9760, 77.6280],
        [12.9810, 77.6120],
    ]),
    ("CL-R3", "Basavanagudi - Jayanagar - JP Nagar - Koramangala loop (demo)", "06:30-10:30",
     "Demo zone C (fictional label)", [
        [12.9420, 77.5750],   # Basavanagudi
        [12.9340, 77.5850],
        [12.9250, 77.5930],   # Jayanagar
        [12.9070, 77.5850],   # JP Nagar
        [12.9150, 77.6050],
        [12.9350, 77.6240],   # Koramangala
        [12.9400, 77.6000],
    ]),
    ("CL-R4", "Whitefield loop (demo)", "08:00-12:00", "Demo zone D (fictional label)", [
        [12.9700, 77.7500],   # Whitefield
        [12.9750, 77.7420],
        [12.9820, 77.7480],
        [12.9780, 77.7580],
        [12.9680, 77.7620],
        [12.9620, 77.7550],
        [12.9640, 77.7440],
    ]),
]

# code, route code, driver label (fictional), initial progress %
VEHICLES = [
    ("CL-GT-01", "CL-R1", "Worker 024 (fictional)", 5.0),
    ("CL-GT-02", "CL-R2", "Worker 031 (fictional)", 30.0),
    ("CL-GT-03", "CL-R3", "Worker 047 (fictional)", 55.0),
    ("CL-GT-04", "CL-R4", "Worker 052 (fictional)", 80.0),
]

# code, route code, waypoint index, dlat, dlng (offset of ~15-30 m from the waypoint), name, locality, initial fill
BINS = [
    ("CL-BIN-001", "CL-R1", 0, 0.0002, 0.0001, "Demo bin - Malleshwaram market side", "Malleshwaram", 22),
    ("CL-BIN-002", "CL-R1", 2, -0.0002, 0.0002, "Demo bin - Rajajinagar main road", "Rajajinagar", 63),
    ("CL-BIN-003", "CL-R1", 4, 0.0001, -0.0002, "Demo bin - Vijayanagar bus stop", "Vijayanagar", 84),
    ("CL-BIN-004", "CL-R1", 6, 0.0002, 0.0002, "Demo bin - Malleshwaram 18th cross", "Malleshwaram", 41),
    ("CL-BIN-005", "CL-R2", 0, 0.0001, 0.0002, "Demo bin - Shivajinagar bus station", "Shivajinagar", 97),
    ("CL-BIN-006", "CL-R2", 2, -0.0002, -0.0001, "Demo bin - Indiranagar 100 ft road", "Indiranagar", 35),
    ("CL-BIN-007", "CL-R2", 3, 0.0002, -0.0002, "Demo bin - Indiranagar metro side", "Indiranagar", 71),
    ("CL-BIN-008", "CL-R2", 5, -0.0001, 0.0002, "Demo bin - Indiranagar 12th main", "Indiranagar", 12),
    ("CL-BIN-009", "CL-R3", 0, 0.0002, 0.0001, "Demo bin - Basavanagudi park gate", "Basavanagudi", 55),
    ("CL-BIN-010", "CL-R3", 2, -0.0002, -0.0002, "Demo bin - Jayanagar 4th block", "Jayanagar", 90),
    ("CL-BIN-011", "CL-R3", 3, 0.0001, 0.0002, "Demo bin - JP Nagar 2nd phase", "JP Nagar", 30),
    ("CL-BIN-012", "CL-R3", 5, -0.0002, 0.0001, "Demo bin - Koramangala 5th block", "Koramangala", 78),
    ("CL-BIN-013", "CL-R4", 0, 0.0002, -0.0001, "Demo bin - Whitefield main road", "Whitefield", 92),
    ("CL-BIN-014", "CL-R4", 2, -0.0002, 0.0001, "Demo bin - Whitefield station road", "Whitefield", 18),
    ("CL-BIN-015", "CL-R4", 4, 0.0001, -0.0002, "Demo bin - Whitefield market", "Whitefield", 45),
    ("CL-BIN-016", "CL-R4", 5, -0.0001, -0.0002, "Demo bin - Whitefield lake side", "Whitefield", 67),
]


def seed(db: Session) -> None:
    now = utcnow()
    routes: dict[str, GarbageRoute] = {}
    for code, name, window, ward, pts in ROUTES:
        r = db.execute(select(GarbageRoute).where(GarbageRoute.code == code)).scalar_one_or_none()
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
        if b:
            continue
        wp = routes[route_code].waypoints[wi]
        b = GarbageBin(code=code, name=name, latitude=round(wp[0] + dlat, 6), longitude=round(wp[1] + dlng, 6),
                       locality=locality, route_id=routes[route_code].id, capacity_litres=1100, is_simulated=True)
        db.add(b)
        db.flush()
        rate = bin_rate_pct_per_hour(code)  # short simulated history so pickup estimates exist from the start
        for minutes_ago in (20, 10, 0):
            level = max(0.0, min(100.0, fill - rate * minutes_ago / 60.0))
            db.add(BinReading(bin_id=b.id, fill_pct=level, source="simulated",
                              recorded_at=now - timedelta(minutes=minutes_ago)))
    db.commit()
