"""Location endpoints (docs/API_CONTRACT.md section 4)."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_current_user
from app.database import get_db
from app.services import location_service

router = APIRouter(prefix="/locations", tags=["locations"])


@router.get("/service-area-check")
def service_area_check(lat: float = Query(..., ge=-90, le=90), lng: float = Query(..., ge=-180, le=180),
                       db: Session = Depends(get_db)):
    return location_service.check_service_area(db, lat, lng).to_dict()


@router.get("/reverse-geocode")
def reverse_geocode(lat: float = Query(..., ge=-90, le=90), lng: float = Query(..., ge=-180, le=180),
                    _user: CurrentUser = Depends(get_current_user)):
    return location_service.reverse_geocode(lat, lng)


@router.get("/search")
def search(q: str = Query(..., min_length=2, max_length=200), _user: CurrentUser = Depends(get_current_user)):
    return location_service.search_places(q)


@router.get("/boundaries")
def boundaries(db: Session = Depends(get_db)):
    return location_service.boundaries_summary(db)
