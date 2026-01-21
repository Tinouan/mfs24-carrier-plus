"""
V0.5 Factory System - Worker Model (Phase 2)
Factory workers with XP/tier progression and health system
"""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, ForeignKey, func, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Worker(Base):
    """
    V0.5 Factory System - Workers with XP/tier progression
    Tier is auto-calculated from XP via trigger
    """
    __tablename__ = "workers"
    __table_args__ = (
        CheckConstraint("tier BETWEEN 0 AND 5", name="chk_worker_tier"),
        CheckConstraint("health BETWEEN 0 AND 100", name="chk_worker_health"),
        CheckConstraint("happiness BETWEEN 0 AND 100", name="chk_worker_happiness"),
        CheckConstraint("xp >= 0", name="chk_worker_xp"),
        {"schema": "game"}
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    factory_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("game.factories.id", ondelete="SET NULL"), index=True)
    first_name: Mapped[str] = mapped_column(String(50), nullable=False)
    last_name: Mapped[str] = mapped_column(String(50), nullable=False)
    tier: Mapped[int] = mapped_column(Integer, default=0, nullable=False, index=True, comment="Auto-calculated: 0-99=T0, 100-249=T1, 250-499=T2, 500-999=T3, 1000-1999=T4, 2000+=T5")
    health: Mapped[int] = mapped_column(Integer, default=100, nullable=False, index=True, comment="Degrades -5/hour during production")
    happiness: Mapped[int] = mapped_column(Integer, default=80, nullable=False, comment="Affects productivity")
    xp: Mapped[int] = mapped_column(Integer, default=0, nullable=False, comment="Gained after batch: recipe.tier * 10 * production_time_hours")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    def __repr__(self):
        return f"<Worker(id={self.id}, name='{self.first_name} {self.last_name}', tier={self.tier}, xp={self.xp}, health={self.health})>"
