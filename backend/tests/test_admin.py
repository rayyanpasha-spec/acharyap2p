"""Admin console API tests (users, departments, categories, routing rules, SAMPLE SLA, settings, audit, system)."""
import itertools

from app.core.security import verify_password
from app.core.user_store import get_user_store
from app.models import AuditLog, RoutingRule

P = "/api/v1/admin"
_n = itertools.count(1)


def _email(prefix="new"):
    return f"{prefix}{next(_n)}.adm@test.example"


def test_non_admin_forbidden(client, make_user):
    for role in ("citizen", "officer", "worker", "supervisor"):
        _, h = make_user(role)
        for path in ("/users", "/departments", "/categories", "/routing-rules", "/sla", "/settings", "/audit-logs", "/system"):
            assert client.get(P + path, headers=h).status_code == 403, (role, path)
        assert client.post(P + "/users", headers=h, json={"email": _email(), "display_name": "X", "role": "worker",
                                                           "password": "Passw0rd!x"}).status_code == 403
    assert client.get(P + "/users").status_code == 401


def test_create_list_patch_user(client, db, make_user):
    admin, h = make_user("admin")
    email = _email()
    r = client.post(P + "/users", headers=h, json={"email": email.upper(), "display_name": "Ravi Officer", "role": "officer",
                                                    "password": "Temp@12345", "department_code": "sanitation"})
    assert r.status_code == 201, r.text
    u = r.json()
    assert u["role"] == "officer" and u["department_code"] == "sanitation" and u["email"] == email
    assert "password_hash" not in u and "password" not in u
    stored = get_user_store().get_by_id(u["id"])
    assert verify_password("Temp@12345", stored["password_hash"])
    # duplicates / validation
    assert client.post(P + "/users", headers=h, json={"email": email, "display_name": "Dup", "role": "worker", "password": "Temp@12345"}).status_code == 409
    assert client.post(P + "/users", headers=h, json={"email": _email(), "display_name": "A", "role": "emperor", "password": "Temp@12345"}).status_code == 422
    assert client.post(P + "/users", headers=h, json={"email": _email(), "display_name": "A", "role": "worker", "password": "short"}).status_code == 422
    assert client.post(P + "/users", headers=h, json={"email": _email(), "display_name": "A", "role": "worker", "password": "Temp@12345",
                                                       "department_code": "no_such_dept"}).status_code == 422
    assert client.post(P + "/users", headers=h, json={"email": "not-an-email", "display_name": "A", "role": "worker", "password": "Temp@12345"}).status_code == 422
    # list with filters never leaks hashes
    lst = client.get(P + "/users?role=officer&q=Ravi", headers=h).json()
    assert [x["id"] for x in lst] == [u["id"]] and all("password_hash" not in x for x in lst)
    assert client.get(P + "/users?role=emperor", headers=h).status_code == 422
    # patch
    r = client.patch(f"{P}/users/{u['id']}", headers=h, json={"role": "supervisor", "department_code": None, "is_active": False,
                                                              "display_name": "Ravi S"})
    assert r.status_code == 200
    out = r.json()
    assert out["role"] == "supervisor" and out["department_code"] is None and out["is_active"] is False and out["display_name"] == "Ravi S"
    assert client.patch(f"{P}/users/{u['id']}", headers=h, json={"role": "bogus"}).status_code == 422
    assert client.patch(f"{P}/users/{u['id']}", headers=h, json={"department_code": "nope"}).status_code == 422
    assert client.patch(f"{P}/users/{u['id']}", headers=h, json={}).status_code == 422
    assert client.patch(f"{P}/users/doesnotexist", headers=h, json={"is_active": True}).status_code == 404
    # audit rows with before/after
    row = db.query(AuditLog).filter_by(action="user.update", entity_id=u["id"]).one()
    assert row.before["role"] == "officer" and row.after["role"] == "supervisor" and row.actor_user_id == admin["id"]
    assert "password_hash" not in str(row.before) + str(row.after)
    assert db.query(AuditLog).filter_by(action="user.create", entity_id=u["id"]).count() == 1


def test_admin_cannot_demote_or_deactivate_self(client, make_user):
    admin, h = make_user("admin")
    assert client.patch(f"{P}/users/{admin['id']}", headers=h, json={"role": "officer"}).status_code == 400
    assert client.patch(f"{P}/users/{admin['id']}", headers=h, json={"is_active": False}).status_code == 400
    assert get_user_store().get_by_id(admin["id"])["role"] == "admin"
    assert get_user_store().get_by_id(admin["id"])["is_active"] is True
    # harmless self edit still works
    assert client.patch(f"{P}/users/{admin['id']}", headers=h, json={"display_name": "Renamed Admin"}).json()["display_name"] == "Renamed Admin"


def test_reset_password(client, db, make_user):
    _, h = make_user("admin")
    target, _ = make_user("worker")
    assert client.post(f"{P}/users/{target['id']}/reset-password", headers=h, json={"new_password": "short"}).status_code == 422
    assert client.post(f"{P}/users/nobody/reset-password", headers=h, json={"new_password": "Another@123"}).status_code == 404
    r = client.post(f"{P}/users/{target['id']}/reset-password", headers=h, json={"new_password": "Another@123"})
    assert r.status_code == 200 and r.json() == {"ok": True}
    assert verify_password("Another@123", get_user_store().get_by_id(target["id"])["password_hash"])
    log = db.query(AuditLog).filter_by(action="user.reset_password", entity_id=target["id"]).one()
    assert "Another@123" not in str(log.before) + str(log.after) + str(log.reason)
    # the user can now log in with the new password
    login = client.post("/api/v1/auth/login", json={"email": target["email"], "password": "Another@123"})
    assert login.status_code == 200


def test_departments_and_categories(client, db, make_user):
    _, h = make_user("admin")
    depts = client.get(P + "/departments", headers=h).json()
    assert any(d["code"] == "sanitation" for d in depts)
    r = client.patch(P + "/departments/public_works", headers=h, json={"name": "Public Works (edited)", "active": False})
    assert r.status_code == 200 and r.json()["active"] is False
    client.patch(P + "/departments/public_works", headers=h, json={"name": "Public Works / Assets", "active": True})
    assert client.patch(P + "/departments/nothere", headers=h, json={"active": False}).status_code == 404
    assert db.query(AuditLog).filter_by(action="department.update", entity_id="public_works").count() == 2

    cats = client.get(P + "/categories", headers=h).json()
    other = next(c for c in cats if c["code"] == "other")
    assert other["subcategories"]
    r = client.patch(P + "/categories/other", headers=h, json={"subcategories": [{"code": "other", "name": "Other"}, {"code": "misc", "name": "Misc"}]})
    assert r.status_code == 200 and len(r.json()["subcategories"]) == 2
    assert client.patch(P + "/categories/other", headers=h, json={"default_department_code": "nope"}).status_code == 422
    assert client.patch(P + "/categories/other", headers=h, json={"subcategories": [{"code": "a", "name": "A"}, {"code": "a", "name": "B"}]}).status_code == 422
    client.patch(P + "/categories/other", headers=h, json={"subcategories": [{"code": "other", "name": "Other"}]})


def test_routing_rules_crud(client, db, make_user):
    _, h = make_user("admin")
    n0 = len(client.get(P + "/routing-rules", headers=h).json())
    body = {"category": "waste", "subcategory": "litter", "department_code": "sanitation", "agency_kind": "corporation",
            "requires_human_review": True, "min_severity": "medium", "note": "Test rule"}
    r = client.post(P + "/routing-rules", headers=h, json=body)
    assert r.status_code == 201, r.text
    rid = r.json()["id"]
    assert len(client.get(P + "/routing-rules", headers=h).json()) == n0 + 1
    assert client.post(P + "/routing-rules", headers=h, json={**body, "category": "nope"}).status_code == 422
    assert client.post(P + "/routing-rules", headers=h, json={**body, "subcategory": "pothole"}).status_code == 422
    assert client.post(P + "/routing-rules", headers=h, json={**body, "agency_kind": "mars"}).status_code == 422
    assert client.post(P + "/routing-rules", headers=h, json={**body, "min_severity": "extreme"}).status_code == 422
    r = client.patch(f"{P}/routing-rules/{rid}", headers=h, json={"active": False, "min_severity": None, "note": "Edited"})
    assert r.status_code == 200 and r.json()["active"] is False and r.json()["min_severity"] is None and r.json()["note"] == "Edited"
    assert client.patch(f"{P}/routing-rules/{rid}", headers=h, json={"department_code": "ghost"}).status_code == 422
    assert client.delete(f"{P}/routing-rules/{rid}", headers=h).json() == {"ok": True}
    assert client.delete(f"{P}/routing-rules/{rid}", headers=h).status_code == 404
    assert db.query(RoutingRule).filter_by(id=rid).count() == 0
    actions = [a.action for a in db.query(AuditLog).filter_by(entity_id=str(rid)).order_by(AuditLog.id)]
    assert actions == ["routing_rule.create", "routing_rule.update", "routing_rule.delete"]


def test_sla_is_labelled_sample_and_upserts(client, db, make_user):
    _, h = make_user("admin")
    g = client.get(P + "/sla", headers=h).json()
    assert g["is_sample"] is True and "SAMPLE" in g["label"] and g["items"]
    r = client.put(P + "/sla", headers=h, json=[{"category": "*", "severity": "critical", "target_hours": 6},
                                                 {"category": "roads", "severity": "high", "target_hours": 20}])
    assert r.status_code == 200
    items = {(i["category"], i["severity"]): i["target_hours"] for i in r.json()["items"]}
    assert items[("*", "critical")] == 6 and items[("roads", "high")] == 20
    client.put(P + "/sla", headers=h, json=[{"category": "*", "severity": "critical", "target_hours": 4}])
    assert client.put(P + "/sla", headers=h, json=[{"category": "*", "severity": "nuclear", "target_hours": 4}]).status_code == 422
    assert client.put(P + "/sla", headers=h, json=[{"category": "ghost", "severity": "low", "target_hours": 4}]).status_code == 422
    assert client.put(P + "/sla", headers=h, json=[{"category": "*", "severity": "low", "target_hours": 0}]).status_code == 422
    assert client.put(P + "/sla", headers=h, json=[]).status_code == 422
    assert db.query(AuditLog).filter_by(action="sla.update").count() >= 2


def test_settings_and_audit_log_listing(client, db, make_user):
    admin, h = make_user("admin")
    keys = {s["key"] for s in client.get(P + "/settings", headers=h).json()}
    assert {"severity_weights", "points"} <= keys
    old = next(s for s in client.get(P + "/settings", headers=h).json() if s["key"] == "bin_thresholds")["value"]
    r = client.put(P + "/settings/bin_thresholds", headers=h, json={"value": {**old, "overflow_risk": 97}})
    assert r.status_code == 200 and r.json()["value"]["overflow_risk"] == 97
    assert client.put(P + "/settings/bin_thresholds", headers=h, json={"value": {"overflow_risk": "high"}}).status_code == 422
    assert client.put(P + "/settings/not_a_key", headers=h, json={"value": {"a": 1}}).status_code == 404
    client.put(P + "/settings/bin_thresholds", headers=h, json={"value": old})

    page = client.get(P + "/audit-logs?action=setting&entity=bin_thresholds&page=1&page_size=10", headers=h).json()
    assert page["total"] >= 2 and page["page"] == 1 and page["page_size"] == 10
    first = page["items"][0]
    assert first["actor_name"] == admin["display_name"] and first["actor_role"] == "admin"
    assert {"id", "created_at", "action", "entity_type", "entity_id", "before", "after", "reason"} <= set(first)
    assert page["items"][0]["id"] > page["items"][1]["id"]  # newest first
    by_actor = client.get(P + f"/audit-logs?actor={admin['id']}", headers=h).json()
    assert by_actor["total"] >= 2 and all(i["actor_user_id"] == admin["id"] for i in by_actor["items"])
    assert client.get(P + "/audit-logs?action=zzz_nothing", headers=h).json()["total"] == 0
    assert client.get(P + "/audit-logs?page_size=500", headers=h).status_code == 422


def test_system_overview(client, make_user):
    _, h = make_user("admin")
    s = client.get(P + "/system", headers=h).json()
    assert s["sql_backend"] == "sqlite" and s["user_store"] == "sql" and s["demo_mode"] is False
    assert {"users", "complaints", "audit_logs"} <= set(s["counts"]) and s["counts"]["users"] >= 1
    assert "provider_order" in s["ai"] and s["ai"]["openai_configured"] is False
    assert "api_key" not in str(s).lower()
