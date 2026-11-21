"""Safe image handling shared by intake (report photos / extra evidence) and operations (before/after evidence).
Validates by CONTENT (Pillow), enforces size + dimension limits, strips EXIF (incl. GPS) by re-encoding,
and stores under a server-generated filename. Never trusts the uploaded filename or declared content type."""
import io
import uuid
from pathlib import Path
from typing import Optional, Tuple

from fastapi import HTTPException, UploadFile
from PIL import Image, ImageOps
from sqlalchemy.orm import Session

from app.config import settings
from app.models import ComplaintImage

ALLOWED_FORMATS = {"JPEG": ("image/jpeg", "jpg"), "PNG": ("image/png", "png"), "WEBP": ("image/webp", "webp")}
MAX_DIMENSION = 2000  # px, longest side after resize


def upload_dir() -> Path:
    p = Path(settings.UPLOAD_DIR)
    p.mkdir(parents=True, exist_ok=True)
    return p


def sanitize_image_bytes(raw: bytes) -> Tuple[bytes, str, str, int, int]:
    """Return (clean_bytes, content_type, extension, width, height) or raise HTTPException(400/413)."""
    if len(raw) > settings.MAX_IMAGE_SIZE_MB * 1024 * 1024:
        raise HTTPException(413, f"Image is larger than {settings.MAX_IMAGE_SIZE_MB} MB")
    try:
        probe = Image.open(io.BytesIO(raw))
        probe.verify()  # structural check
        img = Image.open(io.BytesIO(raw))
        fmt = (img.format or "").upper()
        if fmt not in ALLOWED_FORMATS:
            raise HTTPException(400, "Only JPEG, PNG and WebP images are accepted")
        img = ImageOps.exif_transpose(img)  # honour orientation BEFORE dropping EXIF
        img.thumbnail((MAX_DIMENSION, MAX_DIMENSION))
        if fmt == "JPEG" and img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        out = io.BytesIO()
        ctype, ext = ALLOWED_FORMATS[fmt]
        save_kwargs = {"quality": 88} if fmt in ("JPEG", "WEBP") else {}
        img.save(out, format=fmt, **save_kwargs)  # re-encode => no EXIF/GPS metadata survives
        return out.getvalue(), ctype, ext, img.width, img.height
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(400, "That file is not a valid image")


async def save_image_upload(db: Session, *, complaint_id: int, user_id: str, kind: str, upload: UploadFile,
                            submission_id: Optional[int] = None) -> ComplaintImage:
    """Persist one uploaded image + its DB row (flushed, NOT committed). kind: report|evidence|before|after."""
    raw = await upload.read(settings.MAX_IMAGE_SIZE_MB * 1024 * 1024 + 1)
    return save_image_bytes(db, raw, complaint_id=complaint_id, user_id=user_id, kind=kind, submission_id=submission_id)


def save_image_bytes(db: Session, raw: bytes, *, complaint_id: int, user_id: str, kind: str,
                     submission_id: Optional[int] = None) -> ComplaintImage:
    clean, ctype, ext, w, h = sanitize_image_bytes(raw)
    name = f"{uuid.uuid4().hex}.{ext}"
    (upload_dir() / name).write_bytes(clean)
    row = ComplaintImage(complaint_id=complaint_id, submission_id=submission_id, uploaded_by_user_id=user_id, kind=kind,
                         storage_name=name, content_type=ctype, size_bytes=len(clean), width=w, height=h)
    db.add(row)
    db.flush()
    return row


def image_path(row: ComplaintImage) -> Path:
    return upload_dir() / row.storage_name
