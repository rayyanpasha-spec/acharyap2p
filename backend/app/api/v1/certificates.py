"""/certificates: list, public verify, detail and PDF download."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser, get_current_user
from app.database import get_db
from app.models import Certificate, Complaint
from app.services import certificate_service as cs

router = APIRouter(prefix="/certificates", tags=["certificates"])


def _out(c: Certificate) -> dict:
    return {
        "id": c.id, "code": c.code, "ticket_number": c.ticket_number, "contribution": c.contribution,
        "display_name": c.display_name, "issued_at": c.issued_at.isoformat() if c.issued_at else None,
        "verify_url": cs.verify_url(c.code), "is_demo": c.is_demo, "revoked": c.revoked,
    }


def _get_accessible(db: Session, code: str, user: CurrentUser) -> Certificate:
    cert = db.scalars(select(Certificate).where(Certificate.code == code.strip().upper())).first()
    if cert is None or not (cert.user_id == user.id or user.is_staff):
        raise HTTPException(404, "Certificate not found")  # same answer for 'missing' and 'not yours'
    return cert


@router.get("")
def list_my_certificates(db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)):
    rows = db.scalars(select(Certificate).where(Certificate.user_id == user.id)
                      .order_by(Certificate.issued_at.desc(), Certificate.id.desc()))
    return [_out(c) for c in rows]


# Declared BEFORE "/{code}" so "verify" is never treated as a certificate code.
@router.get("/verify/{code}")
def verify_certificate(code: str, db: Session = Depends(get_db)):
    """Public. Exposes only authenticity and limited approved details: masked name, ticket, category."""
    cert = db.scalars(select(Certificate).where(Certificate.code == code.strip().upper())).first()
    if cert is None or cert.revoked:
        return JSONResponse(status_code=404, content={"valid": False, "detail": "Certificate not found or no longer valid"})
    complaint = db.get(Complaint, cert.complaint_id)
    return {
        "valid": True, "code": cert.code,
        "issued_at": cert.issued_at.isoformat() if cert.issued_at else None,
        "ticket_number": cert.ticket_number,
        "category_name": cs.category_name_for(db, complaint),
        "contribution": cert.contribution,
        "display_name": cs.mask_name(cert.display_name),
        "issuer": cs.ISSUER, "statement": cs.STATEMENT, "is_demo": cert.is_demo,
    }


@router.get("/{code}")
def certificate_detail(code: str, db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)):
    return _out(_get_accessible(db, code, user))


@router.get("/{code}/pdf")
def certificate_pdf(code: str, db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)):
    cert = _get_accessible(db, code, user)
    if cert.revoked:
        raise HTTPException(410, "This certificate has been revoked")
    path = cs.ensure_pdf(db, cert)
    return FileResponse(path, media_type="application/pdf", filename=f"CivicLens-Certificate-{cert.code}.pdf",
                        content_disposition_type="attachment", headers={"Cache-Control": "private, no-store"})
