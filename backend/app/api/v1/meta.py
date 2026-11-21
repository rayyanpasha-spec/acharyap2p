"""Public metadata the frontend needs to render forms and filters (no auth)."""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.core.constants import (LANGUAGES, LOCATION_SOURCES, SEVERITIES, STATUSES, ACTIVE_STATUSES, CLOSED_STATUSES,
                                ALL_ROLES)
from app.core.demo_accounts import DEMO_ACCOUNTS
from app.database import get_db
from app.models import Agency, Category, Department

router = APIRouter(prefix="/meta", tags=["meta"])


@router.get("/taxonomy")
def taxonomy(db: Session = Depends(get_db)):
    cats = db.scalars(select(Category).where(Category.active == True).order_by(Category.sort_order)).all()  # noqa: E712
    depts = db.scalars(select(Department).where(Department.active == True)).all()  # noqa: E712
    agencies = db.scalars(select(Agency).where(Agency.active == True)).all()  # noqa: E712
    return {
        "categories": [{"code": c.code, "name": c.name, "icon": c.icon, "subcategories": c.subcategories,
                        "default_department_code": c.default_department_code} for c in cats],
        "departments": [{"code": d.code, "name": d.name, "agency_kind": d.agency_kind} for d in depts],
        "agencies": [{"code": a.code, "name": a.name, "kind": a.kind} for a in agencies],
        "severities": list(SEVERITIES),
        "statuses": list(STATUSES),
        "active_statuses": list(ACTIVE_STATUSES),
        "closed_statuses": list(CLOSED_STATUSES),
        "roles": list(ALL_ROLES),
        "languages": [{"code": k, "label": v} for k, v in LANGUAGES.items()],
        "location_sources": list(LOCATION_SOURCES),
        "map": {
            "city_label": f"{settings.DEFAULT_CITY}, {settings.DEFAULT_STATE}",
            "center": [settings.DEFAULT_MAP_LATITUDE, settings.DEFAULT_MAP_LONGITUDE],
            "zoom": settings.DEFAULT_MAP_ZOOM,
            "service_area": settings.SERVICE_AREA_MODE,
            "note": "The map centre is only a starting view. It is never submitted as the issue location.",
        },
        "limits": {
            "max_image_size_mb": settings.MAX_IMAGE_SIZE_MB, "max_images_per_report": settings.MAX_IMAGES_PER_REPORT,
            "max_audio_seconds": settings.MAX_AUDIO_DURATION_SECONDS, "max_audio_size_mb": settings.MAX_AUDIO_SIZE_MB,
        },
        "emergency_notice": "CivicLens is not an emergency service. For immediate danger, contact your local emergency service.",
    }


@router.get("/demo-accounts")
def demo_accounts():
    """Only populated when SEED_DEMO_DATA or SEED_DEMO_ACCOUNTS is true. These are FICTIONAL demo logins (labelled Demo data)."""
    if not (settings.SEED_DEMO_DATA or settings.SEED_DEMO_ACCOUNTS):
        return {"enabled": False, "password": None, "accounts": []}
    return {
        "enabled": True, "password": settings.DEMO_PASSWORD,
        "accounts": [{"email": e, "name": n, "role": r, "department_code": d} for e, n, r, d, _ in DEMO_ACCOUNTS],
    }
