"""CleanRoute tables (README section 8). Prototype data is SIMULATED and must always be labelled so."""
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import JSONType, utcnow


class GarbageRoute(Base):
    __tablename__ = "garbage_routes"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(30), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    waypoints: Mapped[list] = mapped_column(JSONType)  # [[lat, lng], ...] in driving order
    city_corporation_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    ward_label: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)  # free-text demo label only
    schedule_window: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)  # e.g. "06:00-10:00"
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=True)


class GarbageVehicle(Base):
    __tablename__ = "garbage_vehicles"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(30), unique=True)  # e.g. CL-GT-04
    route_id: Mapped[Optional[int]] = mapped_column(ForeignKey("garbage_routes.id"), nullable=True)
    driver_label: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)  # fictional "Worker 024"; officers only
    current_task: Mapped[str] = mapped_column(String(60), default="Waste collection")
    status: Mapped[str] = mapped_column(String(20), default="active")  # active | idle | offline
    capacity_kg: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=True)


class VehicleLocation(Base):
    __tablename__ = "vehicle_locations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("garbage_vehicles.id", ondelete="CASCADE"), index=True)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    speed_kmh: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    heading: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    route_progress_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    next_stop: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    eta_minutes: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class GarbageBin(Base):
    __tablename__ = "garbage_bins"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(30), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    locality: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    route_id: Mapped[Optional[int]] = mapped_column(ForeignKey("garbage_routes.id"), nullable=True)
    capacity_litres: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=True)


class BinReading(Base):
    __tablename__ = "bin_readings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    bin_id: Mapped[int] = mapped_column(ForeignKey("garbage_bins.id", ondelete="CASCADE"), index=True)
    fill_pct: Mapped[float] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(12), default="simulated")  # simulated | worker | sensor
    recorded_by_user_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class CollectionEvent(Base):
    __tablename__ = "collection_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    bin_id: Mapped[int] = mapped_column(ForeignKey("garbage_bins.id", ondelete="CASCADE"), index=True)
    vehicle_id: Mapped[Optional[int]] = mapped_column(ForeignKey("garbage_vehicles.id"), nullable=True)
    fill_before_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    source: Mapped[str] = mapped_column(String(12), default="simulated")
    recorded_by_user_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
