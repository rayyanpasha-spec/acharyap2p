"""GET /images/{image_id}: permission-checked image streaming."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_current_user
from app.database import get_db
from app.models import Complaint, ComplaintImage
from app.services.complaint_view import citizen_can_view_private
from app.services.upload_service import image_path

router = APIRouter(prefix="/images", tags=["images"])

CITIZEN_KINDS = ("report", "evidence", "before", "after")


@router.get("/{image_id}")
def get_image(image_id: int, db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)):
    img = db.get(ComplaintImage, image_id)
    if img is None:
        raise HTTPException(404, "Image not found")
    if not user.is_staff:
        c = db.get(Complaint, img.complaint_id)
        allowed = (img.kind in CITIZEN_KINDS and c is not None
                   and (img.uploaded_by_user_id == user.id or citizen_can_view_private(db, c, user.id)))
        if not allowed:
            raise HTTPException(403, "You do not have permission to view this image")
    path = image_path(img)
    if not path.exists():
        raise HTTPException(404, "Image file is no longer available")
    return FileResponse(path, media_type=img.content_type, headers={"Cache-Control": "private, max-age=300"})
