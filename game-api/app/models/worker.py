"""
V0.6 Workers System - Unified Worker Model
Combines workers and engineers with nationality, stats, and injury system
"""
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Integer, String, ForeignKey, Numeric, func, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Worker(Base):
    """
    V0.6 Workers System - Unified workers/engineers model
    - Nationality with country-based stats
    - Speed/Resistance stats
    - Injury system with 10-day recovery limit
    - Pool recruitment from airports
    """
    __tablename__ = "workers"
    __table_args__ = (
        CheckConstraint("tier BETWEEN 1 AND 5", name="workers_tier_check"),
        CheckConstraint("speed BETWEEN 1 AND 100", name="workers_speed_check"),
        CheckConstraint("resistance BETWEEN 1 AND 100", name="workers_resistance_check"),
        CheckConstraint("xp >= 0", name="workers_xp_check"),
        CheckConstraint("status IN ('available', 'working', 'injured', 'dead')", name="workers_status_check"),
        CheckConstraint("location_type IN ('airport', 'factory')", name="workers_location_check"),
        CheckConstraint("worker_type IN ('worker', 'engineer')", name="workers_type_check"),
        {"schema": "game"}
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Identity
    first_name: Mapped[str] = mapped_column(String(50), nullable=False)
    last_name: Mapped[str] = mapped_column(String(50), nullable=False)
    country_code: Mapped[str] = mapped_column(String(2), nullable=False)

    # Type: 'worker' or 'engineer'
    worker_type: Mapped[str] = mapped_column(String(20), nullable=False, default="worker")

    # Stats (1-100)
    speed: Mapped[int] = mapped_column(Integer, nullable=False, default=50, comment="Work speed (affects production rate)")
    resistance: Mapped[int] = mapped_column(Integer, nullable=False, default=50, comment="Injury resistance")

    # Progression
    tier: Mapped[int] = mapped_column(Integer, nullable=False, default=1, index=True, comment="T1-T5, auto-calculated from XP")
    xp: Mapped[int] = mapped_column(Integer, nullable=False, default=0, comment="Experience points")

    # Economy
    hourly_salary: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, comment="Hourly wage")

    # Status
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="available", index=True)
    injured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, comment="Injury timestamp (10 days max)")

    # Location
    location_type: Mapped[str] = mapped_column(String(20), nullable=False, default="airport")
    airport_ident: Mapped[str | None] = mapped_column(String(10), nullable=True, index=True)
    factory_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("game.factories.id", ondelete="SET NULL"), nullable=True, index=True)
    company_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("game.companies.id", ondelete="SET NULL"), nullable=True, index=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"

    @property
    def is_engineer(self) -> bool:
        return self.worker_type == "engineer"

    @property
    def is_available(self) -> bool:
        return self.status == "available"

    @property
    def is_injured(self) -> bool:
        return self.status == "injured"

    def __repr__(self):
        return f"<Worker(id={self.id}, name='{self.full_name}', type={self.worker_type}, tier=T{self.tier}, status={self.status})>"


class CountryWorkerStats(Base):
    """Base stats by nationality for worker generation"""
    __tablename__ = "country_worker_stats"
    __table_args__ = {"schema": "game"}

    country_code: Mapped[str] = mapped_column(String(2), primary_key=True)
    country_name: Mapped[str] = mapped_column(String(100), nullable=False)
    base_speed: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    base_resistance: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    base_hourly_salary: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=10.00)

    def __repr__(self):
        return f"<CountryWorkerStats(code={self.country_code}, name='{self.country_name}')>"


class WorkerXpThreshold(Base):
    """XP thresholds for tier promotion"""
    __tablename__ = "worker_xp_thresholds"
    __table_args__ = {"schema": "game"}

    tier: Mapped[int] = mapped_column(Integer, primary_key=True)
    xp_required: Mapped[int] = mapped_column(Integer, nullable=False)
    tier_name: Mapped[str] = mapped_column(String(20), nullable=False)
    icon_color: Mapped[str] = mapped_column(String(20), nullable=False)

    def __repr__(self):
        return f"<WorkerXpThreshold(tier={self.tier}, xp={self.xp_required}, name='{self.tier_name}')>"


class AirportWorkerPool(Base):
    """Worker recruitment pools at airports"""
    __tablename__ = "airport_worker_pools"
    __table_args__ = {"schema": "game"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    airport_ident: Mapped[str] = mapped_column(String(10), nullable=False, unique=True)
    airport_type: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Capacity
    max_workers: Mapped[int] = mapped_column(Integer, nullable=False, default=200)
    max_engineers: Mapped[int] = mapped_column(Integer, nullable=False, default=20)

    # Current counts (updated when workers hired/fired)
    current_workers: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    current_engineers: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Reset schedule
    last_reset_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now())
    next_reset_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self):
        return f"<AirportWorkerPool(airport={self.airport_ident}, workers={self.current_workers}/{self.max_workers}, engineers={self.current_engineers}/{self.max_engineers})>"
