"""
V0.5 Factory System - ProductionBatch Model (Phase 2)
Tracks ongoing and completed production runs
"""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, ForeignKey, func, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class ProductionBatch(Base):
    """
    V0.5 Factory System - Production batch tracking
    Represents one production run of a recipe
    """
    __tablename__ = "production_batches"
    __table_args__ = (
        CheckConstraint("result_quantity > 0", name="chk_batch_result_qty"),
        CheckConstraint("workers_assigned > 0", name="chk_batch_workers"),
        {"schema": "game"}
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    factory_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("game.factories.id", ondelete="CASCADE"), nullable=False, index=True)
    recipe_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("game.recipes.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False, index=True, comment="pending, in_progress, completed, failed, cancelled")
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    estimated_completion: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    result_quantity: Mapped[int | None] = mapped_column(Integer)
    workers_assigned: Mapped[int | None] = mapped_column(Integer)
    engineer_bonus_applied: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, comment="TRUE if engineer bonus applied")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    def __repr__(self):
        return f"<ProductionBatch(id={self.id}, recipe_id={self.recipe_id}, status={self.status}, workers={self.workers_assigned})>"
