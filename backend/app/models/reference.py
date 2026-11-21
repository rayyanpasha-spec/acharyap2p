"""Reference / configuration tables. Seeded by app/seed_reference.py; editable by admins."""
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import JSONType, utcnow


class User(Base):
    """SQL fallback user store. Used ONLY when MONGODB_URI is empty (see app/core/user_store.py).
    `id` is a 32-char hex uuid, identical in format to the Mongo `_id` string, so other tables
    reference users by plain string id (no FK) regardless of which store is active."""

    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(20), index=True)
    department_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    corporation_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    preferred_language: Mapped[str] = mapped_column(String(5), default="en")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class Agency(Base):
    """public_agencies: GBA, five City Corporations, BWSSB, BESCOM (README section 1)."""

    __tablename__ = "public_agencies"
    code: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(20))  # authority | corporation | utility
    website: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    source: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Department(Base):
    __tablename__ = "departments"
    code: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    agency_kind: Mapped[str] = mapped_column(String(20))  # corporation | bwssb | bescom  (who owns this dept)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Category(Base):
    """Configurable taxonomy (README section 5)."""

    __tablename__ = "categories"
    code: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    icon: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)  # lucide icon name
    subcategories: Mapped[list] = mapped_column(JSONType, default=list)  # [{"code","name"}]
    default_department_code: Mapped[str] = mapped_column(String(50))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class RoutingRule(Base):
    """authority_routing_rules: category(+subcategory) -> department/agency (README 'Bengaluru civic-agency routing').
    The most specific active rule wins (subcategory match beats category-only)."""

    __tablename__ = "authority_routing_rules"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    category: Mapped[str] = mapped_column(String(50), index=True)
    subcategory: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    department_code: Mapped[str] = mapped_column(String(50))
    agency_kind: Mapped[str] = mapped_column(String(20))  # corporation | bwssb | bescom
    requires_human_review: Mapped[bool] = mapped_column(Boolean, default=False)
    min_severity: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # escalation floor
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # qualification shown to officers
    source: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    effective_from: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class SlaPolicy(Base):
    """SAMPLE SLA targets (README section 7) - not official municipal commitments."""

    __tablename__ = "sla_policies"
    __table_args__ = (UniqueConstraint("category", "severity", name="uq_sla_cat_sev"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    category: Mapped[str] = mapped_column(String(50))  # category code or "*" for default
    severity: Mapped[str] = mapped_column(String(10))
    target_hours: Mapped[int] = mapped_column(Integer)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=True)


class AppSetting(Base):
    """Key/value configuration editable by admins (thresholds, weights, point values ...)."""

    __tablename__ = "app_settings"
    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[dict] = mapped_column(JSONType)
    description: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class ServiceBoundary(Base):
    """Versioned imported boundary polygons (corporation / ward / pilot service area). Empty until
    an official GeoJSON dataset is imported - we NEVER invent boundaries."""

    __tablename__ = "service_boundaries"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    dataset_version: Mapped[str] = mapped_column(String(80), index=True)
    level: Mapped[str] = mapped_column(String(20))  # service_area | corporation | zone | ward
    code: Mapped[str] = mapped_column(String(80))
    name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    parent_code: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    geometry: Mapped[dict] = mapped_column(JSONType)  # GeoJSON Polygon / MultiPolygon
    bbox: Mapped[Optional[list]] = mapped_column(JSONType, nullable=True)  # [min_lng,min_lat,max_lng,max_lat]
    source: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    imported_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
