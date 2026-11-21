"""Reference data: agencies, departments, taxonomy, routing rules, SAMPLE SLA targets, settings.
Idempotent (safe to run on every start). Mappings are STARTING rules from the README, editable by admins in DB;
they are not a guarantee of legal asset ownership."""
from sqlalchemy.orm import Session

from app.models import Agency, AppSetting, Category, Department, RoutingRule, SlaPolicy

AGENCIES = [
    ("gba", "Greater Bengaluru Authority", "authority", "https://www.bbmp.gov.in/", "Greater Bengaluru Governance Act, 2024"),
    ("bengaluru_central", "Bengaluru Central City Corporation", "corporation", None, "Notified Sept 2025 (see README section 1)"),
    ("bengaluru_east", "Bengaluru East City Corporation", "corporation", None, "Notified Sept 2025 (see README section 1)"),
    ("bengaluru_north", "Bengaluru North City Corporation", "corporation", None, "Notified Sept 2025 (see README section 1)"),
    ("bengaluru_south", "Bengaluru South City Corporation", "corporation", None, "Notified Sept 2025 (see README section 1)"),
    ("bengaluru_west", "Bengaluru West City Corporation", "corporation", "https://bengaluruwest.karnataka.gov.in/about-gba", "Notified Sept 2025 (see README section 1)"),
    ("bwssb", "Bengaluru Water Supply and Sewerage Board (BWSSB)", "utility", "https://mybwssb.org/content/about-bwssb-0", "BWSSB functions page"),
    ("bescom", "Bangalore Electricity Supply Company Limited (BESCOM)", "utility", "https://www.bescom.co.in/", "BESCOM portal"),
]

DEPARTMENTS = [
    ("road_maintenance", "Road Maintenance (Engineering)", "corporation", "Potholes, damaged roads and footpaths"),
    ("sanitation", "Solid Waste & Sanitation", "corporation", "Public bins, litter, missed collection"),
    ("electrical", "Electrical (Streetlights)", "corporation", "Municipal streetlight fixtures and poles"),
    ("parks_horticulture", "Parks and Horticulture", "corporation", "Fallen trees, dangerous branches, parks"),
    ("stormwater_drain", "Stormwater Drain / Engineering", "corporation", "Blocked storm drains, road flooding, open drains"),
    ("public_works", "Public Works / Assets", "corporation", "Bus shelters, benches, public toilets and other assets"),
    ("bwssb_water_sewerage", "BWSSB - Water & Sewerage", "bwssb", "Water supply leaks/shortage, sewer network"),
    ("bescom_network", "BESCOM - Electricity Network", "bescom", "Power outage, exposed wires, distribution assets"),
    ("municipal_triage", "Municipal Triage Queue", "corporation", "Unclear category / manual routing required"),
]

# (code, name, icon, default_department, [(sub_code, sub_name)])
CATEGORIES = [
    ("roads", "Roads", "Construction", "road_maintenance",
     [("pothole", "Pothole"), ("damaged_road", "Damaged road"), ("broken_footpath", "Broken footpath")]),
    ("waste", "Waste", "Trash2", "sanitation",
     [("overflowing_bin", "Overflowing bin"), ("litter", "Litter / dumping"), ("missed_collection", "Missed collection")]),
    ("water", "Water & Sewerage", "Droplets", "bwssb_water_sewerage",
     [("pipe_leak", "Pipe leak"), ("water_shortage", "Water shortage"), ("contaminated_supply", "Contaminated supply"),
      ("sewage_overflow", "Sewage overflow"), ("sewer_blockage", "Sewer blockage")]),
    ("electricity", "Electricity", "Zap", "electrical",
     [("broken_streetlight", "Broken streetlight"), ("exposed_wiring", "Exposed / fallen wire"),
      ("power_outage", "Power outage"), ("damaged_electric_asset", "Damaged electrical asset")]),
    ("trees", "Trees & Parks", "TreePine", "parks_horticulture",
     [("fallen_tree", "Fallen tree"), ("dangerous_branch", "Dangerous branch"), ("park_maintenance", "Park maintenance")]),
    ("drainage", "Drainage", "Waves", "stormwater_drain",
     [("blocked_drain", "Blocked storm drain"), ("flooding", "Road flooding"), ("open_drain", "Open roadside drain"),
      ("open_manhole", "Open manhole")]),
    ("public_infrastructure", "Public infrastructure", "Building2", "public_works",
     [("damaged_bench", "Damaged bench"), ("bus_shelter", "Bus shelter"), ("public_toilet", "Public toilet"),
      ("other_asset", "Other public asset")]),
    ("other", "Other / unclear", "HelpCircle", "municipal_triage", [("other", "Other")]),
]

SRC_README = "README section 1 'Bengaluru civic-agency routing' (starting rule; verify before real deployment)"

# (category, subcategory|None, department, agency_kind, requires_review, min_severity, note)
ROUTING_RULES = [
    ("roads", None, "road_maintenance", "corporation", False, None,
     "Road may belong to another authority (state/national highway or agency). Check road/asset ownership; otherwise municipal triage."),
    ("waste", None, "sanitation", "corporation", False, None, "Resolve corporation / zone / ward from boundary data."),
    ("water", None, "bwssb_water_sewerage", "bwssb", False, None,
     "Water/sewer NETWORK issues go to BWSSB. Stormwater drains and surface flooding are a corporation matter."),
    ("electricity", None, "electrical", "corporation", False, None,
     "Streetlight fixtures/poles are municipal. Live wires or supply outages must go to BESCOM / emergency handling."),
    ("electricity", "broken_streetlight", "electrical", "corporation", False, None, "Municipal streetlight fixture or pole."),
    ("electricity", "exposed_wiring", "bescom_network", "bescom", True, "high",
     "Possible live-wire hazard: urgent human escalation to BESCOM / emergency handling. CivicLens is not an emergency service."),
    ("electricity", "power_outage", "bescom_network", "bescom", False, None, "Distribution supply outage - BESCOM service area."),
    ("electricity", "damaged_electric_asset", "bescom_network", "bescom", True, None, "Damaged electricity-network asset - confirm ownership."),
    ("trees", None, "parks_horticulture", "corporation", False, None,
     "Tree on another agency's land may need a different authority; check land/road/park owner."),
    ("drainage", None, "stormwater_drain", "corporation", False, None,
     "If it is actually a SEWER line or sewer overflow, route to BWSSB (human review)."),
    ("drainage", "open_manhole", "stormwater_drain", "corporation", True, "high",
     "Open manhole is a safety hazard; could be sewer (BWSSB) or storm drain - human review."),
    ("public_infrastructure", None, "public_works", "corporation", False, None, "Resolve the actual asset owner."),
    ("other", None, "municipal_triage", "corporation", True, None, "Unclear category - manual routing."),
]

# Sample SLA targets in hours (NOT official municipal commitments)
SLA = {"critical": 4, "high": 24, "medium": 72, "low": 168}

SETTINGS = {
    "severity_weights": ({"safety_risk": 0.35, "public_impact": 0.25, "issue_scale": 0.20,
                          "location_sensitivity": 0.10, "duration": 0.10}, "README section 5 prototype weights"),
    "severity_thresholds": ({"critical": 75, "high": 50, "medium": 25, "low": 0}, "Score -> label (prototype)"),
    "points": ({"verified_first_report": 10, "verified_evidence": 10, "verified_resolution": 30,
                "game_daily": 5, "game_weekly": 25, "daily_game_cap": 15}, "Civic points (configurable)"),
    "bin_thresholds": ({"filling_up": 51, "collection_recommended": 81, "overflow_risk": 96}, "Bin display thresholds (prototype)"),
    "recognition_levels": ({"civic_observer": 1, "neighbourhood_helper": 5, "community_guardian": 15,
                            "civic_champion": 30, "city_ambassador": 50}, "Verified contributions needed"),
}


def seed(db: Session) -> None:
    for code, name, kind, site, src in AGENCIES:
        if not db.get(Agency, code):
            db.add(Agency(code=code, name=name, kind=kind, website=site, source=src))
    for code, name, kind, desc in DEPARTMENTS:
        if not db.get(Department, code):
            db.add(Department(code=code, name=name, agency_kind=kind, description=desc))
    for i, (code, name, icon, dept, subs) in enumerate(CATEGORIES):
        if not db.get(Category, code):
            db.add(Category(code=code, name=name, icon=icon, default_department_code=dept, sort_order=i,
                            subcategories=[{"code": c, "name": n} for c, n in subs]))
    if db.query(RoutingRule).count() == 0:
        for cat, sub, dept, kind, review, minsev, note in ROUTING_RULES:
            db.add(RoutingRule(category=cat, subcategory=sub, department_code=dept, agency_kind=kind,
                               requires_human_review=review, min_severity=minsev, note=note, source=SRC_README))
    if db.query(SlaPolicy).count() == 0:
        for sev, hrs in SLA.items():
            db.add(SlaPolicy(category="*", severity=sev, target_hours=hrs, is_sample=True))
    for key, (val, desc) in SETTINGS.items():
        if not db.get(AppSetting, key):
            db.add(AppSetting(key=key, value=val, description=desc))
    db.commit()
