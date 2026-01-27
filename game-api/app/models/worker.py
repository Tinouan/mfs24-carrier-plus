"""
V0.8.1 Workers System - Item-based Worker Model (V2 Only)
Individual worker instances with stats and progression
"""
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Integer, String, ForeignKey, Numeric, func, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


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


# ═══════════════════════════════════════════════════════════
# WORKERS V2 - Item-based workers with individual stats
# ═══════════════════════════════════════════════════════════

class WorkerInstance(Base):
    """
    Workers V2: Individual worker instances with unique stats.
    Workers are items (Worker-FR, Worker-CN, etc.) stored in inventory.
    Each instance has randomized stats based on country.
    """
    __tablename__ = "worker_instances"
    __table_args__ = (
        CheckConstraint("speed BETWEEN 1 AND 100", name="worker_instances_speed_check"),
        CheckConstraint("resistance BETWEEN 1 AND 100", name="worker_instances_resistance_check"),
        CheckConstraint("xp >= 0", name="worker_instances_xp_check"),
        CheckConstraint("tier BETWEEN 1 AND 5", name="worker_instances_tier_check"),
        CheckConstraint("hourly_salary > 0", name="worker_instances_salary_check"),
        CheckConstraint("status IN ('available', 'working', 'injured', 'dead')", name="worker_instances_status_check"),
        {"schema": "game"}
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Ownership (company OR player, one must be set for owned workers)
    owner_company_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("game.companies.id", ondelete="CASCADE"),
        nullable=True,
        index=True
    )
    owner_player_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("game.users.id", ondelete="CASCADE"),
        nullable=True,
        index=True
    )

    # Item type (references Worker-XX item)
    item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("game.items.id"),
        nullable=False
    )

    # Location (airport where worker is stored/available)
    airport_ident: Mapped[str] = mapped_column(String(8), nullable=False, index=True)

    # Worker stats (generated from country base ±20%)
    country_code: Mapped[str] = mapped_column(String(2), nullable=False)
    speed: Mapped[int] = mapped_column(Integer, nullable=False, comment="Work speed (1-100)")
    resistance: Mapped[int] = mapped_column(Integer, nullable=False, comment="Injury resistance (1-100)")
    xp: Mapped[int] = mapped_column(Integer, nullable=False, default=0, comment="Experience points")
    tier: Mapped[int] = mapped_column(Integer, nullable=False, default=1, comment="T1-T5, calculated from XP")
    hourly_salary: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, comment="Hourly wage")

    # Status and assignment
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="available", index=True)
    factory_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("game.factories.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )

    # HV (Hôtel des Ventes) - for selling on market
    for_sale: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    sale_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)

    # Timestamps
    injured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    @property
    def is_available(self) -> bool:
        """Worker can be assigned to a factory."""
        return self.status == "available" and self.factory_id is None

    @property
    def is_working(self) -> bool:
        """Worker is assigned to a factory."""
        return self.status == "working" and self.factory_id is not None

    @property
    def is_injured(self) -> bool:
        return self.status == "injured"

    @property
    def is_owned(self) -> bool:
        """Worker has an owner (company or player)."""
        return self.owner_company_id is not None or self.owner_player_id is not None

    def __repr__(self):
        owner = f"company={self.owner_company_id}" if self.owner_company_id else f"player={self.owner_player_id}"
        return f"<WorkerInstance(id={self.id}, country={self.country_code}, speed={self.speed}, status={self.status}, {owner})>"
