def test_health(client):
    assert client.get("/health").json()["status"] == "ok"


def test_register_login_me(client):
    r = client.post("/api/v1/auth/register", json={"email": "f1@x.com", "password": "Passw0rd!x", "display_name": "F One"})
    assert r.status_code == 201 and r.json()["user"]["role"] == "citizen"
    assert client.post("/api/v1/auth/register", json={"email": "F1@x.com", "password": "Passw0rd!x", "display_name": "Dup"}).status_code == 409
    tok = client.post("/api/v1/auth/login", json={"email": "f1@x.com", "password": "Passw0rd!x"}).json()["access_token"]
    assert client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {tok}"}).json()["email"] == "f1@x.com"
    assert client.get("/api/v1/users/me").status_code == 401


def test_register_cannot_choose_role(client):
    r = client.post("/api/v1/auth/register", json={"email": "f2@x.com", "password": "Passw0rd!x", "display_name": "F Two", "role": "admin"})
    assert r.json()["user"]["role"] == "citizen"


def test_mongo_user_store_with_mongomock():
    import mongomock
    from app.core.user_store import MongoUserStore
    s = MongoUserStore(client=mongomock.MongoClient())
    u = s.create(email="M@x.com", password_hash="h", display_name="Mongo U", role="officer", department_code="sanitation")
    assert s.get_by_email("m@x.com")["id"] == u["id"] and s.get_by_id(u["id"])["role"] == "officer"
    assert s.update(u["id"], display_name="New")["display_name"] == "New"
    assert [x["id"] for x in s.list(role="officer")] == [u["id"]]


def test_taxonomy(client):
    t = client.get("/api/v1/meta/taxonomy").json()
    assert {c["code"] for c in t["categories"]} >= {"roads", "waste", "water", "electricity", "trees", "drainage"}
