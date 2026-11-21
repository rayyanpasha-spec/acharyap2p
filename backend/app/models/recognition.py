"""Certificates, civic points, games and achievements (README sections 9-11)."""
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import JSONType, utcnow


class Certificate(Base):
    __tablename__ = "certificates"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(40), unique=True, index=True)  # public verification code
    complaint_id: Mapped[int] = mapped_column(Integer, unique=True)  # one certificate per verified incident per reporter
    user_id: Mapped[str] = mapped_column(String(36), index=True)
    display_name: Mapped[str] = mapped_column(String(120))
    contribution: Mapped[str] = mapped_column(String(400))
    ticket_number: Mapped[str] = mapped_column(String(30))
    pdf_path: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    issued_by_user_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    issued_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class CivicPointsLedger(Base):
    """Auditable, append-only points ledger. Points are NEVER given merely for submitting complaints."""

    __tablename__ = "civic_points_ledger"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(36), index=True)
    points: Mapped[int] = mapped_column(Integer)
    reason_code: Mapped[str] = mapped_column(String(40))  # verified_first_report | verified_evidence | verified_resolution | game_daily | game_weekly ...
    ref_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # complaint | game_session | quiz
    ref_id: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    note: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class Game(Base):
    __tablename__ = "games"
    code: Mapped[str] = mapped_column(String(40), primary_key=True)  # clean_city | civic_quiz | ...
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text)
    max_score: Mapped[int] = mapped_column(Integer, default=100)
    daily_points: Mapped[int] = mapped_column(Integer, default=5)  # points for the first completion per day (capped)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class GameSession(Base):
    __tablename__ = "game_sessions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(36), index=True)
    game_code: Mapped[str] = mapped_column(String(40), index=True)
    seed: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)  # server-side puzzle seed / question ids
    payload: Mapped[Optional[dict]] = mapped_column(JSONType, nullable=True)  # server-held answers etc. (never sent to client)
    submitted_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    validated_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    points_awarded: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class Achievement(Base):
    __tablename__ = "achievements"
    code: Mapped[str] = mapped_column(String(50), primary_key=True)
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(String(300))
    secret: Mapped[bool] = mapped_column(Boolean, default=False)  # secret ones are hidden until earned
    criteria: Mapped[Optional[dict]] = mapped_column(JSONType, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class UserAchievement(Base):
    __tablename__ = "user_achievements"
    __table_args__ = (UniqueConstraint("user_id", "achievement_code", name="uq_user_ach"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(36), index=True)
    achievement_code: Mapped[str] = mapped_column(String(50))
    earned_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
