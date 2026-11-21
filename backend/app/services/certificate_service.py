"""Certificates of Appreciation. Issued ONLY for complaints that are resolved AND verified by an authorised
person (verified_by_user_id set). The certificate recognises that the citizen reported an issue that led to a
verified improvement - it never implies the citizen performed the repair."""
import io
import logging
import re
import secrets
import string
from pathlib import Path
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.core.user_store import get_user_store
from app.models import Category, Certificate, Complaint, ComplaintSubmission
from app.services import achievement_service, points_service
from app.services.notification_service import notify

log = logging.getLogger("civiclens.certificates")

ISSUER = "CivicLens (Bengaluru pilot)"
STATEMENT = ("This certificate recognises a citizen who reported a civic issue that led to a verified improvement. "
             "The repair or service action itself was carried out by the responsible municipal or utility team.")
_CODE_ALPHABET = string.ascii_uppercase + string.digits


# ---------------------------------------------------------------- helpers
def mask_name(name: Optional[str]) -> str:
    """'Asha Rao' -> 'Asha R.'; single names stay as-is; blank -> 'A citizen'."""
    parts = [p for p in re.split(r"\s+", (name or "").strip()) if p]
    if not parts:
        return "A citizen"
    if len(parts) == 1:
        return parts[0]
    return f"{parts[0]} {parts[-1][0].upper()}."


def verify_url(code: str) -> str:
    return f"{settings.PUBLIC_BASE_URL.rstrip('/')}/verify/{code}"


def _new_code(db: Session) -> str:
    for _ in range(20):
        code = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(12))
        if db.scalars(select(Certificate.id).where(Certificate.code == code)).first() is None:
            return code
    raise RuntimeError("could not generate a unique certificate code")


def _uid(user: Any) -> Optional[str]:
    if user is None:
        return None
    return user.get("id") if isinstance(user, dict) else getattr(user, "id", None)


def _category_labels(db: Session, complaint: Complaint) -> tuple[str, str]:
    cat = db.get(Category, complaint.category)
    cat_name = cat.name if cat else (complaint.category or "Civic issue").replace("_", " ").title()
    sub_name = None
    if cat and complaint.subcategory:
        for s in cat.subcategories or []:
            if s.get("code") == complaint.subcategory:
                sub_name = s.get("name")
    return cat_name, sub_name or cat_name


def category_name_for(db: Session, complaint: Optional[Complaint]) -> Optional[str]:
    return _category_labels(db, complaint)[0] if complaint else None


def contribution_text(db: Session, complaint: Complaint) -> str:
    _, sub = _category_labels(db, complaint)
    return f"Reported a civic issue ({sub}) that led to a verified improvement."[:400]


def primary_reporter_id(db: Session, complaint: Complaint) -> str:
    sub = db.scalars(select(ComplaintSubmission).where(
        ComplaintSubmission.complaint_id == complaint.id, ComplaintSubmission.is_primary.is_(True))
        .order_by(ComplaintSubmission.id.asc())).first()
    return sub.user_id if sub else complaint.created_by_user_id


# ---------------------------------------------------------------- PDF
def _latin(text: str) -> str:
    """Built-in PDF fonts are Latin-1 only; drop characters they cannot show instead of printing boxes."""
    cleaned = "".join(ch for ch in (text or "") if ch.isprintable())
    out = cleaned.encode("latin-1", "ignore").decode("latin-1").strip()
    return out or "Valued citizen"


def render_pdf(cert: Certificate) -> bytes:
    """A4 landscape, calm civic-minimal flat design (no gradients). Fixed English text + the citizen's name."""
    import qrcode
    from reportlab.lib.colors import HexColor
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas

    forest, ink, muted, paper, line = (HexColor("#1F4D3A"), HexColor("#1B2420"), HexColor("#5B6B63"),
                                       HexColor("#FBFAF6"), HexColor("#CFD8D2"))
    saffron = HexColor("#B7791F")
    w, h = landscape(A4)
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(w, h))
    c.setTitle("Certificate of Appreciation")
    c.setAuthor("CivicLens")
    c.setFillColor(paper)
    c.rect(0, 0, w, h, stroke=0, fill=1)
    c.setStrokeColor(forest)
    c.setLineWidth(2.5)
    c.rect(28, 28, w - 56, h - 56, stroke=1, fill=0)
    c.setStrokeColor(line)
    c.setLineWidth(0.8)
    c.rect(38, 38, w - 76, h - 76, stroke=1, fill=0)

    cx = w / 2
    c.setFillColor(forest)
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(cx, h - 80, "CIVICLENS  -  BENGALURU, KARNATAKA PILOT")
    c.setStrokeColor(forest)
    c.setLineWidth(1.2)
    c.line(cx - 40, h - 92, cx + 40, h - 92)

    c.setFillColor(ink)
    c.setFont("Times-Bold", 38)
    c.drawCentredString(cx, h - 150, "Certificate of Appreciation")
    c.setFillColor(muted)
    c.setFont("Helvetica", 12)
    c.drawCentredString(cx, h - 180, "is proudly presented to")

    c.setFillColor(forest)
    c.setFont("Times-Bold", 34)
    c.drawCentredString(cx, h - 232, _latin(cert.display_name))
    c.setStrokeColor(line)
    c.setLineWidth(0.8)
    c.line(cx - 200, h - 244, cx + 200, h - 244)

    c.setFillColor(ink)
    c.setFont("Helvetica", 13)
    c.drawCentredString(cx, h - 278, "for caring about their neighbourhood and reporting an issue that led to a verified improvement.")
    c.setFillColor(muted)
    c.setFont("Helvetica", 10.5)
    c.drawCentredString(cx, h - 300, "The repair itself was carried out by the responsible municipal or utility team; "
                                     "this certificate recognises the citizen's report.")
    c.setFillColor(ink)
    c.setFont("Helvetica-Bold", 12)
    c.drawCentredString(cx, h - 332, f"Ticket {cert.ticket_number}")
    c.setFont("Helvetica", 11)
    c.setFillColor(muted)
    c.drawCentredString(cx, h - 350, _latin(cert.contribution))

    # footer: details left, QR right
    base = 78
    c.setFillColor(ink)
    c.setFont("Helvetica", 10)
    issued = cert.issued_at.strftime("%d %B %Y") if cert.issued_at else ""
    c.drawString(70, base + 36, f"Issue date: {issued}")
    c.drawString(70, base + 20, f"Certificate ID: {cert.code}")
    c.setFillColor(muted)
    c.setFont("Helvetica", 9)
    c.drawString(70, base + 4, "Verify authenticity by scanning the QR code or visiting:")
    c.drawString(70, base - 8, verify_url(cert.code))
    if cert.is_demo:
        c.setFillColor(saffron)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(70, base - 28, "DEMO DATA - fictional prototype record")

    qr_img = qrcode.make(verify_url(cert.code))
    qr_buf = io.BytesIO()
    qr_img.save(qr_buf, format="PNG")
    qr_buf.seek(0)
    size = 96
    c.drawImage(ImageReader(qr_buf), w - 70 - size, base - 16, width=size, height=size)
    c.setFillColor(muted)
    c.setFont("Helvetica", 8)
    c.drawCentredString(w - 70 - size / 2, base - 28, "Scan to verify")

    c.setFillColor(muted)
    c.setFont("Helvetica-Oblique", 9)
    c.drawCentredString(cx, 52, "CivicLens is a prototype civic-reporting tool and is not an emergency service.")
    c.showPage()
    c.save()
    return buf.getvalue()


def pdf_file_path(cert: Certificate) -> Path:
    return Path(settings.CERTIFICATE_STORAGE_DIR) / f"{cert.code}.pdf"


def write_pdf(cert: Certificate) -> Path:
    path = pdf_file_path(cert)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(render_pdf(cert))
    return path


def ensure_pdf(db: Session, cert: Certificate) -> Path:
    """Return the stored PDF path, regenerating it from the DB record when the file is missing
    (e.g. ephemeral disk on a free host)."""
    path = pdf_file_path(cert)
    if not path.exists():
        write_pdf(cert)
        cert.pdf_path = str(path)
        db.commit()
    return path


# ---------------------------------------------------------------- issuing
def issue_for_complaint(db: Session, complaint: Complaint, issued_by_user: Any = None) -> Optional[Certificate]:
    """Idempotent. Issues a certificate to the primary reporter when the complaint is resolved AND verified.
    Also awards verified-outcome points to the reporter and to citizens who added supporting evidence.
    Flushes only; the caller commits."""
    if complaint is None or complaint.status != "resolved" or not complaint.verified_by_user_id:
        return None
    db.flush()  # the session has autoflush off: make the caller's pending status changes visible to the queries below

    cert = db.scalars(select(Certificate).where(Certificate.complaint_id == complaint.id)).first()
    created = False
    if cert is None:
        owner_id = primary_reporter_id(db, complaint)
        urec = get_user_store().get_by_id(owner_id) or {}
        cert = Certificate(
            code=_new_code(db), complaint_id=complaint.id, user_id=owner_id,
            display_name=(urec.get("display_name") or "Valued citizen")[:120],
            contribution=contribution_text(db, complaint), ticket_number=complaint.public_ticket_number or f"CL-{complaint.id:05d}",
            issued_by_user_id=_uid(issued_by_user), is_demo=bool(complaint.is_demo),
        )
        try:
            with db.begin_nested():
                db.add(cert)
        except IntegrityError:  # concurrent issue for the same complaint
            cert = db.scalars(select(Certificate).where(Certificate.complaint_id == complaint.id)).first()
        else:
            created = True
        if cert is None:
            return None
        if created:
            try:
                cert.pdf_path = str(write_pdf(cert))
            except Exception:  # PDF can be regenerated on download; never block the resolution
                log.exception("certificate PDF generation failed for %s", cert.code)

    # points (de-duplicated, so safe when re-run)
    pts = points_service.get_points_settings(db)
    ref = complaint.id
    owner = cert.user_id
    points_service.award(db, owner, "verified_first_report", pts["verified_first_report"], "complaint", ref,
                         f"Verified report {cert.ticket_number}")
    points_service.award(db, owner, "verified_resolution", pts["verified_resolution"], "complaint", ref,
                         f"Verified resolution {cert.ticket_number}")
    supporters = {s.user_id for s in db.scalars(select(ComplaintSubmission).where(
        ComplaintSubmission.complaint_id == complaint.id, ComplaintSubmission.is_primary.is_(False)))}
    supporters.discard(owner)
    for uid in supporters:
        points_service.award(db, uid, "verified_evidence", pts["verified_evidence"], "complaint", ref,
                             f"Supporting evidence on verified {cert.ticket_number}")
    db.flush()

    if created:
        notify(db, owner, "certificate_issued", "Certificate of Appreciation issued",
               "Your report led to a verified improvement. Thank you for caring about your community. "
               "You can download your certificate from My certificates.",
               complaint_id=complaint.id, ticket_number=cert.ticket_number)
        for uid in supporters:
            notify(db, uid, "recognition", "Thank you for your supporting evidence",
                   "A report you supported was resolved and verified.",
                   complaint_id=complaint.id, ticket_number=cert.ticket_number)
    for uid in {owner, *supporters}:
        achievement_service.evaluate(db, uid)
    return cert
