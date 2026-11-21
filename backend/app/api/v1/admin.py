"""Admin console API: users, departments, categories, routing rules, SAMPLE SLA targets, settings, audit logs, system.
Every route requires role `admin`; every mutation writes an audit row. Password hashes are never returned."""
import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.config import settings as app_settings
from app.core.constants import ALL_ROLES, SEVERITIES
from app.core.deps import CurrentUser, require_admin
from app.core.security import hash_password
from app.core.user_store import DuplicateEmailError, create_user_checked, get_user_store, public_user
from app.database import get_db
from app.models import (
    AppSetting, AuditLog, Category, Certificate, Complaint, Department, Notification, RoutingRule, SlaPolicy,
)
from app.services import audit_service, demo_purge_service

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])

class PurgeDemoIn(BaseModel):
    confirm: str = Field(description='Must be exactly "DELETE DEMO DATA"')
    include_cleanroute: bool = True


@router.post("/demo-data/purge")
def purge_demo_data(body: PurgeDemoIn, db: Session = Depends(get_db), admin: CurrentUser = Depends(require_admin)):
    """Remove fictional demo data (demo users are deactivated). Refused when called by a demo admin, so you cannot lock
    yourself out: sign in with your OWN admin account first (see BOOTSTRAP_ADMIN_EMAIL / POST /admin/users)."""
    if body.confirm != "DELETE DEMO DATA":
        raise HTTPException(422, 'confirm must be exactly "DELETE DEMO DATA"')
    me = get_user_store().get_by_id(admin.id) or {}
    if me.get("is_demo"):
        raise HTTPException(409, "You are signed in with a DEMO admin account. Sign in with your own admin account first, "
                                 "otherwise purging would lock you out.")
    counts = demo_purge_service.purge_demo_data(db, include_cleanroute=body.include_cleanroute)
    audit_service.log(db, admin, "demo.purge", "system", None, after=counts)
    db.commit()
    return {"ok": True, "removed": counts}


EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
AGENCY_KINDS = ("corporation", "bwssb", "bescom")


def _iso(d):
    return d.isoformat() if d else None


def _user_out(u: Dict[str, Any]) -> Dict[str, Any]:
    out = public_user(u)
    out["created_at"] = _iso(out.get("created_at"))
    out["last_login_at"] = _iso(out.get("last_login_at"))
    return out


def _check_department(db: Session, code: Optional[str]) -> None:
    if code and db.get(Department, code) is None:
        raise HTTPException(422, f"Unknown department_code '{code}'")


# ============================================================================ users
class UserCreate(BaseModel):
    email: str = Field(max_length=255)
    display_name: str = Field(min_length=1, max_length=120)
    role: str
    password: str = Field(min_length=8, max_length=128)  # temporary password
    department_code: Optional[str] = None
    corporation_code: Optional[str] = None
    phone: Optional[str] = Field(None, max_length=30)
    preferred_language: str = "en"


class UserPatch(BaseModel):
    display_name: Optional[str] = Field(None, min_length=1, max_length=120)
    role: Optional[str] = None
    department_code: Optional[str] = None
    corporation_code: Optional[str] = None
    phone: Optional[str] = Field(None, max_length=30)
    is_active: Optional[bool] = None


class PasswordReset(BaseModel):
    new_password: str = Field(min_length=8, max_length=128)


@router.get("/users")
def list_users(role: Optional[str] = None, q: Optional[str] = None, limit: int = Query(200, ge=1, le=500)):
    if role and role not in ALL_ROLES:
        raise HTTPException(422, f"role must be one of {', '.join(ALL_ROLES)}")
    return [_user_out(u) for u in get_user_store().list(role=role, q=(q or None), limit=limit)]


@router.post("/users", status_code=201)
def create_user(body: UserCreate, admin: CurrentUser = Depends(require_admin), db: Session = Depends(get_db)):
    if body.role not in ALL_ROLES:
        raise HTTPException(422, f"role must be one of {', '.join(ALL_ROLES)}")
    if not EMAIL_RE.match(body.email.strip()):
        raise HTTPException(422, "A valid email is required")
    _check_department(db, body.department_code)
    try:
        u = create_user_checked(
            email=body.email.strip().lower(), password_hash=hash_password(body.password),
            display_name=body.display_name.strip(), role=body.role, department_code=body.department_code or None,
            corporation_code=body.corporation_code or None, phone=body.phone,
            preferred_language=body.preferred_language or "en")
    except DuplicateEmailError:
        raise HTTPException(409, "A user with this email already exists")
    audit_service.log(db, admin, "user.create", "user", u["id"], after=_user_out(u))
    db.commit()
    return _user_out(u)


@router.patch("/users/{user_id}")
def patch_user(user_id: str, body: UserPatch, admin: CurrentUser = Depends(require_admin), db: Session = Depends(get_db)):
    store = get_user_store()
    target = store.get_by_id(user_id)
    if not target:
        raise HTTPException(404, "User not found")
    fields = body.model_fields_set
    if user_id == admin.id:
        if "is_active" in fields and body.is_active is False:
            raise HTTPException(400, "You cannot deactivate your own account")
        if "role" in fields and body.role != target["role"]:
            raise HTTPException(400, "You cannot change your own role")
    upd: Dict[str, Any] = {}
    if "role" in fields:
        if body.role not in ALL_ROLES:
            raise HTTPException(422, f"role must be one of {', '.join(ALL_ROLES)}")
        upd["role"] = body.role
    if "department_code" in fields:
        _check_department(db, body.department_code)
        upd["department_code"] = body.department_code or None
    if "display_name" in fields and body.display_name:
        upd["display_name"] = body.display_name.strip()
    for k in ("corporation_code", "phone"):
        if k in fields:
            upd[k] = getattr(body, k) or None
    if "is_active" in fields and body.is_active is not None:
        upd["is_active"] = body.is_active
    if not upd:
        raise HTTPException(422, "No changes supplied")
    before = _user_out(target)
    new = store.update(user_id, **upd)
    audit_service.log(db, admin, "user.update", "user", user_id, before=before, after=_user_out(new))
    db.commit()
    return _user_out(new)


@router.post("/users/{user_id}/reset-password")
def reset_password(user_id: str, body: PasswordReset, admin: CurrentUser = Depends(require_admin),
                   db: Session = Depends(get_db)):
    store = get_user_store()
    if not store.get_by_id(user_id):
        raise HTTPException(404, "User not found")
    store.update(user_id, password_hash=hash_password(body.new_password))
    audit_service.log(db, admin, "user.reset_password", "user", user_id, reason="Password reset by admin")  # never log the password
    db.commit()
    return {"ok": True}


# ============================================================================ departments
class DepartmentPatch(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    active: Optional[bool] = None


def _dept_out(d: Department) -> Dict[str, Any]:
    return {"code": d.code, "name": d.name, "agency_kind": d.agency_kind, "description": d.description, "active": d.active}


@router.get("/departments")
def list_departments(db: Session = Depends(get_db)):
    return [_dept_out(d) for d in db.query(Department).order_by(Department.code)]


@router.patch("/departments/{code}")
def patch_department(code: str, body: DepartmentPatch, admin: CurrentUser = Depends(require_admin), db: Session = Depends(get_db)):
    d = db.get(Department, code)
    if not d:
        raise HTTPException(404, "Department not found")
    if not body.model_fields_set:
        raise HTTPException(422, "No changes supplied")
    before = _dept_out(d)
    for k in body.model_fields_set:
        v = getattr(body, k)
        if k == "active" and v is None:
            continue
        setattr(d, k, v)
    audit_service.log(db, admin, "department.update", "department", code, before=before, after=_dept_out(d))
    db.commit()
    return _dept_out(d)


# ============================================================================ categories
class SubcategoryIn(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=120)


class CategoryPatch(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    default_department_code: Optional[str] = None
    active: Optional[bool] = None
    subcategories: Optional[List[SubcategoryIn]] = None


def _cat_out(c: Category) -> Dict[str, Any]:
    return {"code": c.code, "name": c.name, "icon": c.icon, "subcategories": c.subcategories or [],
            "default_department_code": c.default_department_code, "active": c.active, "sort_order": c.sort_order}


@router.get("/categories")
def list_categories(db: Session = Depends(get_db)):
    return [_cat_out(c) for c in db.query(Category).order_by(Category.sort_order, Category.code)]


@router.patch("/categories/{code}")
def patch_category(code: str, body: CategoryPatch, admin: CurrentUser = Depends(require_admin), db: Session = Depends(get_db)):
    c = db.get(Category, code)
    if not c:
        raise HTTPException(404, "Category not found")
    fields = body.model_fields_set
    if not fields:
        raise HTTPException(422, "No changes supplied")
    before = _cat_out(c)
    if "name" in fields and body.name:
        c.name = body.name
    if "default_department_code" in fields and body.default_department_code:
        _check_department(db, body.default_department_code)
        c.default_department_code = body.default_department_code
    if "active" in fields and body.active is not None:
        c.active = body.active
    if "subcategories" in fields and body.subcategories is not None:
        codes = [s.code for s in body.subcategories]
        if len(set(codes)) != len(codes):
            raise HTTPException(422, "Subcategory codes must be unique")
        c.subcategories = [{"code": s.code, "name": s.name} for s in body.subcategories]
    audit_service.log(db, admin, "category.update", "category", code, before=before, after=_cat_out(c))
    db.commit()
    return _cat_out(c)


# ============================================================================ routing rules
class RoutingRuleIn(BaseModel):
    category: str
    subcategory: Optional[str] = None
    department_code: str
    agency_kind: str
    requires_human_review: bool = False
    min_severity: Optional[str] = None
    note: Optional[str] = None
    source: Optional[str] = Field(None, max_length=300)
    active: bool = True


class RoutingRulePatch(BaseModel):
    category: Optional[str] = None
    subcategory: Optional[str] = None
    department_code: Optional[str] = None
    agency_kind: Optional[str] = None
    requires_human_review: Optional[bool] = None
    min_severity: Optional[str] = None
    note: Optional[str] = None
    source: Optional[str] = Field(None, max_length=300)
    active: Optional[bool] = None


def _rule_out(r: RoutingRule) -> Dict[str, Any]:
    return {"id": r.id, "category": r.category, "subcategory": r.subcategory, "department_code": r.department_code,
            "agency_kind": r.agency_kind, "requires_human_review": r.requires_human_review,
            "min_severity": r.min_severity, "note": r.note, "source": r.source, "active": r.active,
            "effective_from": _iso(r.effective_from)}


def _validate_rule(db: Session, category: str, subcategory: Optional[str], department_code: str, agency_kind: str,
                   min_severity: Optional[str]) -> None:
    cat = db.get(Category, category)
    if not cat:
        raise HTTPException(422, f"Unknown category '{category}'")
    if subcategory and subcategory not in {s.get("code") for s in (cat.subcategories or [])}:
        raise HTTPException(422, f"Unknown subcategory '{subcategory}' for category '{category}'")
    _check_department(db, department_code)
    if agency_kind not in AGENCY_KINDS:
        raise HTTPException(422, f"agency_kind must be one of {', '.join(AGENCY_KINDS)}")
    if min_severity and min_severity not in SEVERITIES:
        raise HTTPException(422, f"min_severity must be one of {', '.join(SEVERITIES)}")


@router.get("/routing-rules")
def list_rules(db: Session = Depends(get_db)):
    return [_rule_out(r) for r in db.query(RoutingRule).order_by(RoutingRule.category, RoutingRule.subcategory, RoutingRule.id)]


@router.post("/routing-rules", status_code=201)
def create_rule(body: RoutingRuleIn, admin: CurrentUser = Depends(require_admin), db: Session = Depends(get_db)):
    _validate_rule(db, body.category, body.subcategory or None, body.department_code, body.agency_kind, body.min_severity)
    r = RoutingRule(category=body.category, subcategory=body.subcategory or None, department_code=body.department_code,
                    agency_kind=body.agency_kind, requires_human_review=body.requires_human_review,
                    min_severity=body.min_severity or None, note=body.note, source=body.source, active=body.active)
    db.add(r)
    db.flush()
    audit_service.log(db, admin, "routing_rule.create", "routing_rule", r.id, after=_rule_out(r))
    db.commit()
    return _rule_out(r)


@router.patch("/routing-rules/{rule_id}")
def patch_rule(rule_id: int, body: RoutingRulePatch, admin: CurrentUser = Depends(require_admin), db: Session = Depends(get_db)):
    r = db.get(RoutingRule, rule_id)
    if not r:
        raise HTTPException(404, "Routing rule not found")
    fields = body.model_fields_set
    if not fields:
        raise HTTPException(422, "No changes supplied")
    before = _rule_out(r)
    vals = {k: getattr(r, k) for k in ("category", "subcategory", "department_code", "agency_kind", "min_severity")}
    for k in vals:
        if k in fields:
            vals[k] = getattr(body, k) or None
    _validate_rule(db, vals["category"], vals["subcategory"], vals["department_code"], vals["agency_kind"], vals["min_severity"])
    for k, v in vals.items():
        setattr(r, k, v)
    for k in ("requires_human_review", "active"):
        if k in fields and getattr(body, k) is not None:
            setattr(r, k, getattr(body, k))
    for k in ("note", "source"):
        if k in fields:
            setattr(r, k, getattr(body, k))
    audit_service.log(db, admin, "routing_rule.update", "routing_rule", rule_id, before=before, after=_rule_out(r))
    db.commit()
    return _rule_out(r)


@router.delete("/routing-rules/{rule_id}")
def delete_rule(rule_id: int, admin: CurrentUser = Depends(require_admin), db: Session = Depends(get_db)):
    r = db.get(RoutingRule, rule_id)
    if not r:
        raise HTTPException(404, "Routing rule not found")
    audit_service.log(db, admin, "routing_rule.delete", "routing_rule", rule_id, before=_rule_out(r))
    db.delete(r)
    db.commit()
    return {"ok": True}


# ============================================================================ SLA (SAMPLE targets)
class SlaItem(BaseModel):
    category: str = Field(min_length=1, max_length=50)  # category code or "*" for the default
    severity: str
    target_hours: int = Field(ge=1, le=24 * 365)


def _sla_list(db: Session) -> Dict[str, Any]:
    return {
        "label": "SAMPLE targets for the prototype - not official municipal commitments",
        "is_sample": True,
        "items": [{"id": s.id, "category": s.category, "severity": s.severity, "target_hours": s.target_hours,
                   "is_sample": s.is_sample} for s in db.query(SlaPolicy).order_by(SlaPolicy.category, SlaPolicy.id)],
    }


@router.get("/sla")
def get_sla(db: Session = Depends(get_db)):
    return _sla_list(db)


@router.put("/sla")
def put_sla(items: List[SlaItem], admin: CurrentUser = Depends(require_admin), db: Session = Depends(get_db)):
    if not items:
        raise HTTPException(422, "Provide at least one {category, severity, target_hours}")
    cats = {c.code for c in db.query(Category).all()}
    before = _sla_list(db)["items"]
    for it in items:
        if it.severity not in SEVERITIES:
            raise HTTPException(422, f"severity must be one of {', '.join(SEVERITIES)}")
        if it.category != "*" and it.category not in cats:
            raise HTTPException(422, f"Unknown category '{it.category}'")
        row = db.query(SlaPolicy).filter(SlaPolicy.category == it.category, SlaPolicy.severity == it.severity).first()
        if row:
            row.target_hours = it.target_hours
        else:
            db.add(SlaPolicy(category=it.category, severity=it.severity, target_hours=it.target_hours, is_sample=True))
        db.flush()
    after = _sla_list(db)
    audit_service.log(db, admin, "sla.update", "sla_policy", None, before={"items": before}, after={"items": after["items"]},
                      reason="SAMPLE SLA targets edited")
    db.commit()
    return after


# ============================================================================ settings
class SettingIn(BaseModel):
    value: Dict[str, Any]


def _setting_out(s: AppSetting) -> Dict[str, Any]:
    return {"key": s.key, "value": s.value, "description": s.description, "updated_at": _iso(s.updated_at)}


@router.get("/settings")
def list_settings(db: Session = Depends(get_db)):
    return [_setting_out(s) for s in db.query(AppSetting).order_by(AppSetting.key)]


@router.put("/settings/{key}")
def put_setting(key: str, body: SettingIn, admin: CurrentUser = Depends(require_admin), db: Session = Depends(get_db)):
    s = db.get(AppSetting, key)
    if not s:
        raise HTTPException(404, "Unknown setting key")
    for k, v in body.value.items():
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            raise HTTPException(422, f"Setting value '{k}' must be a number")
        if v < 0:
            raise HTTPException(422, f"Setting value '{k}' cannot be negative")
    before = _setting_out(s)
    s.value = dict(body.value)
    audit_service.log(db, admin, "setting.update", "app_setting", key, before={"value": before["value"]},
                      after={"value": s.value})
    db.commit()
    return _setting_out(s)


# ============================================================================ audit logs
@router.get("/audit-logs")
def audit_logs(action: Optional[str] = None, actor: Optional[str] = None, entity: Optional[str] = None,
               page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100), db: Session = Depends(get_db)):
    """`action` = prefix match (e.g. 'classification'); `actor` = user id, or part of the actor's name/email;
    `entity` = entity type or entity id (e.g. a ticket number)."""
    q = db.query(AuditLog)
    if action:
        q = q.filter(AuditLog.action.ilike(f"{action}%"))
    if actor:
        ids = {actor} | {u["id"] for u in get_user_store().list(q=actor, limit=200)}
        q = q.filter(AuditLog.actor_user_id.in_(ids))
    if entity:
        q = q.filter(or_(AuditLog.entity_type == entity, AuditLog.entity_id == entity))
    total = q.count()
    rows = q.order_by(AuditLog.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    names = {uid: u.get("display_name") for uid, u in get_user_store().get_many([r.actor_user_id for r in rows]).items()}
    return {
        "items": [{"id": r.id, "created_at": _iso(r.created_at), "actor_user_id": r.actor_user_id,
                   "actor_name": names.get(r.actor_user_id), "actor_role": r.actor_role, "action": r.action,
                   "entity_type": r.entity_type, "entity_id": r.entity_id, "before": r.before, "after": r.after,
                   "reason": r.reason} for r in rows],
        "total": total, "page": page, "page_size": page_size,
    }


# ============================================================================ system
@router.get("/system")
def system(db: Session = Depends(get_db)):
    store = get_user_store()
    s = app_settings
    return {
        "sql_backend": "sqlite" if s.is_sqlite else "postgresql",
        "user_store": store.backend,
        "ai": {
            "provider_order": [p.strip() for p in s.AI_PROVIDER_ORDER.split(",") if p.strip()],
            "openai_configured": bool(s.OPENAI_API_KEY), "openai_model": s.OPENAI_TRIAGE_MODEL,
            "ollama_model": s.OLLAMA_MODEL, "ollama_vision_model": s.OLLAMA_VISION_MODEL or None,
        },
        "counts": {
            "users": len(store.list(limit=100000)),
            "complaints": db.query(func.count(Complaint.id)).scalar() or 0,
            "audit_logs": db.query(func.count(AuditLog.id)).scalar() or 0,
            "notifications": db.query(func.count(Notification.id)).scalar() or 0,
            "certificates": db.query(func.count(Certificate.id)).scalar() or 0,
        },
        "demo_mode": bool(s.SEED_DEMO_DATA),
        "env": s.APP_ENV,
    }
