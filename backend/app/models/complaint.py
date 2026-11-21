"""Complaint domain. `Complaint` is the canonical incident (one municipal work item).
Each citizen's own report of it is a `ComplaintSubmission` (README 'incidents versus submissions')."""
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import JSONType, utcnow


class Complaint(Base):
    __tablename__ = "complaints"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    public_ticket_number: Mapped[Optional[str]] = mapped_column(String(30), unique=True, index=True, nullable=True)  # CL-2026-00001
    created_by_user_id: Mapped[str] = mapped_column(String(36), index=True)

    # --- text / language ---
    original_description: Mapped[str] = mapped_column(Text)          # citizen-approved text, NEVER overwritten
    original_language: Mapped[str] = mapped_column(String(5), default="en")
    translated_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # English helper for officers
    summary: Mapped[Optional[str]] = mapped_column(String(400), nullable=True)
    submitted_via: Mapped[str] = mapped_column(String(10), default="text")  # text | voice

    # --- AI / classification ---
    category: Mapped[str] = mapped_column(String(50), index=True, default="other")
    subcategory: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    severity: Mapped[str] = mapped_column(String(10), index=True, default="medium")
    severity_score: Mapped[float] = mapped_column(Float, default=0.0)       # 0-100
    severity_reason: Mapped[Optional[str]] = mapped_column(String(400), nullable=True)  # the one-line reason
    severity_overridden: Mapped[bool] = mapped_column(Boolean, default=False)
    priority_score: Mapped[float] = mapped_column(Float, default=0.0, index=True)
    ai_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ai_provider: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # openai | ollama | rules
    requires_human_review: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    review_reasons: Mapped[Optional[list]] = mapped_column(JSONType, nullable=True)   # list[str]
    image_observations: Mapped[Optional[list]] = mapped_column(JSONType, nullable=True)  # list[str]
    classification_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)  # officer confirmed AI output

    # --- routing ---
    authoritative_department_code: Mapped[Optional[str]] = mapped_column(String(50), index=True, nullable=True)
    responsible_agency_kind: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # corporation|bwssb|bescom
    routing_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # --- lifecycle ---
    status: Mapped[str] = mapped_column(String(30), index=True, default="submitted")
    assigned_worker_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    sla_due_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, index=True)
    reopened_count: Mapped[int] = mapped_column(Integer, default=0)
    reopen_requested: Mapped[bool] = mapped_column(Boolean, default=False, index=True)  # citizen asked; supervisor decides
    reopen_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reopen_requested_by_user_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    reopen_requested_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)

    # --- location (README section 4 'Suggested location fields') ---
    latitude: Mapped[float] = mapped_column(Float, index=True)
    longitude: Mapped[float] = mapped_column(Float, index=True)
    location_accuracy_m: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    location_source: Mapped[str] = mapped_column(String(20), default="map_pin")  # gps | map_pin | address_search
    location_captured_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    location_address: Mapped[Optional[str]] = mapped_column(String(400), nullable=True)
    locality: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    city: Mapped[str] = mapped_column(String(60), default="Bengaluru")
    state: Mapped[str] = mapped_column(String(60), default="Karnataka")
    country_code: Mapped[str] = mapped_column(String(2), default="IN")
    service_area_code: Mapped[str] = mapped_column(String(40), default="greater_bengaluru")
    service_area_status: Mapped[str] = mapped_column(String(30), default="needs_manual_routing")  # in_area|outside_service_area|needs_manual_routing
    city_corporation_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    division_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    ward_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    boundary_dataset_version: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    verified_by_user_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)

    submissions = relationship("ComplaintSubmission", back_populates="complaint", cascade="all, delete-orphan")
    images = relationship("ComplaintImage", back_populates="complaint", cascade="all, delete-orphan")


class ComplaintSubmission(Base):
    """One citizen's report. The first submission is_primary; later ones are supporters of the same incident."""

    __tablename__ = "complaint_submissions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    complaint_id: Mapped[int] = mapped_column(ForeignKey("complaints.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(String(36), index=True)
    description: Mapped[str] = mapped_column(Text)
    language: Mapped[str] = mapped_column(String(5), default="en")
    via: Mapped[str] = mapped_column(String(10), default="text")  # text | voice
    is_primary: Mapped[bool] = mapped_column(Boolean, default=True)
    duplicate_choice: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)  # new | follow | add_evidence | different
    duplicate_override_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    complaint = relationship("Complaint", back_populates="submissions")


class ComplaintFollower(Base):
    __tablename__ = "complaint_followers"
    __table_args__ = (UniqueConstraint("complaint_id", "user_id", name="uq_follower"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    complaint_id: Mapped[int] = mapped_column(ForeignKey("complaints.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(String(36), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class ComplaintImage(Base):
    """Image metadata. File lives at UPLOAD_DIR/<storage_name> (server generated name). EXIF is stripped on save."""

    __tablename__ = "complaint_images"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    complaint_id: Mapped[int] = mapped_column(ForeignKey("complaints.id", ondelete="CASCADE"), index=True)
    submission_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    uploaded_by_user_id: Mapped[str] = mapped_column(String(36))
    kind: Mapped[str] = mapped_column(String(12), default="report")  # report | evidence | before | after
    storage_name: Mapped[str] = mapped_column(String(100), unique=True)
    content_type: Mapped[str] = mapped_column(String(40))
    size_bytes: Mapped[int] = mapped_column(Integer)
    width: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    height: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ai_observation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # what the vision model saw (with uncertainty)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    complaint = relationship("Complaint", back_populates="images")


class VoiceTranscript(Base):
    """Only citizen-APPROVED transcripts are stored; raw audio is deleted after transcription."""

    __tablename__ = "voice_transcripts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(36), index=True)
    complaint_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    selected_language: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    detected_language: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    original_transcript: Mapped[str] = mapped_column(Text)     # exactly what the model returned
    confirmed_transcript: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # after citizen edits
    model: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    duration_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class AiAnalysis(Base):
    """Audit copy of each AI triage run (concise output only - never hidden reasoning)."""

    __tablename__ = "ai_analyses"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    complaint_id: Mapped[int] = mapped_column(ForeignKey("complaints.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(String(20))
    model: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    prompt_version: Mapped[str] = mapped_column(String(20), default="v1")
    result: Mapped[dict] = mapped_column(JSONType)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class DuplicateCandidate(Base):
    __tablename__ = "duplicate_candidates"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    complaint_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)  # new complaint, if one was created
    candidate_complaint_id: Mapped[int] = mapped_column(Integer, index=True)
    user_id: Mapped[str] = mapped_column(String(36), index=True)  # the citizen who was shown the match
    distance_m: Mapped[float] = mapped_column(Float)
    similarity: Mapped[float] = mapped_column(Float)
    same_reporter: Mapped[bool] = mapped_column(Boolean, default=False)
    decision: Mapped[str] = mapped_column(String(20), default="shown")  # shown | followed | evidence_added | continued_new
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class ComplaintLink(Base):
    """Confirmed duplicate/supporting relationship (confirmed by an officer/supervisor only)."""

    __tablename__ = "complaint_links"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    primary_complaint_id: Mapped[int] = mapped_column(Integer, index=True)
    linked_complaint_id: Mapped[int] = mapped_column(Integer, index=True)
    confirmed_by_user_id: Mapped[str] = mapped_column(String(36))
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class StatusHistory(Base):
    """Immutable: rows are only ever inserted."""

    __tablename__ = "status_history"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    complaint_id: Mapped[int] = mapped_column(ForeignKey("complaints.id", ondelete="CASCADE"), index=True)
    from_status: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    to_status: Mapped[str] = mapped_column(String(30))
    actor_user_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    actor_role: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    citizen_visible: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Comment(Base):
    __tablename__ = "comments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    complaint_id: Mapped[int] = mapped_column(ForeignKey("complaints.id", ondelete="CASCADE"), index=True)
    author_user_id: Mapped[str] = mapped_column(String(36))
    author_role: Mapped[str] = mapped_column(String(20))
    author_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    body: Mapped[str] = mapped_column(Text)
    visibility: Mapped[str] = mapped_column(String(10), default="public")  # public | internal
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Assignment(Base):
    __tablename__ = "assignments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    complaint_id: Mapped[int] = mapped_column(ForeignKey("complaints.id", ondelete="CASCADE"), index=True)
    worker_user_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    department_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    assigned_by_user_id: Mapped[str] = mapped_column(String(36))
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class ResolutionEvidence(Base):
    __tablename__ = "resolution_evidence"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    complaint_id: Mapped[int] = mapped_column(ForeignKey("complaints.id", ondelete="CASCADE"), index=True)
    uploaded_by_user_id: Mapped[str] = mapped_column(String(36))
    kind: Mapped[str] = mapped_column(String(10))  # before | after
    image_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # complaint_images.id
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    verified_by_user_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(36), index=True)
    type: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    complaint_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ticket_number: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class AuditLog(Base):
    """Important officer/admin actions (README section 18). Insert-only."""

    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor_user_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    actor_role: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    action: Mapped[str] = mapped_column(String(60), index=True)  # e.g. classification.override, status.change
    entity_type: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    before: Mapped[Optional[dict]] = mapped_column(JSONType, nullable=True)
    after: Mapped[Optional[dict]] = mapped_column(JSONType, nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
