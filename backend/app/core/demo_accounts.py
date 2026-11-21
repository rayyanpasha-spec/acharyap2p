"""Fixed DEMO account list (fictional people). Password = settings.DEMO_PASSWORD.
Created by app/seed_demo.py when SEED_DEMO_DATA=true; shown on the login page via GET /api/v1/meta/demo-accounts."""

# (email, display_name, role, department_code, preferred_language)
DEMO_ACCOUNTS = [
    ("citizen@civiclens.demo", "Asha Rao (demo citizen)", "citizen", None, "en"),
    ("citizen2@civiclens.demo", "Kiran Gowda (demo citizen)", "citizen", None, "kn"),
    ("officer.roads@civiclens.demo", "Roads Officer (demo)", "officer", "road_maintenance", "en"),
    ("officer.waste@civiclens.demo", "Sanitation Officer (demo)", "officer", "sanitation", "en"),
    ("officer.water@civiclens.demo", "BWSSB Officer (demo)", "officer", "bwssb_water_sewerage", "en"),
    ("officer.electric@civiclens.demo", "Electrical Officer (demo)", "officer", "electrical", "en"),
    ("officer.bescom@civiclens.demo", "BESCOM Officer (demo)", "officer", "bescom_network", "en"),
    ("worker1@civiclens.demo", "Field Worker 024 (demo)", "worker", "road_maintenance", "kn"),
    ("worker2@civiclens.demo", "Field Worker 031 (demo)", "worker", "sanitation", "kn"),
    ("supervisor@civiclens.demo", "Supervisor (demo)", "supervisor", None, "en"),
    ("admin@civiclens.demo", "Administrator (demo)", "admin", None, "en"),
]
