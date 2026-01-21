"""
V0.5 Factory System - FactoryStorage Model (Phase 2)
Per-factory inventory storage
"""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, ForeignKey, func, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class FactoryStorage(Base):
    """
    V0.5 Factory System - Per-factory inventory storage
    One row per (factory, item) combination
    """
    __tablename__ = "factory_storage"
    __table_args__ = (
        CheckConstraint("quantity >= 0", name="chk_storage_quantity"),
        CheckConstraint("max_capacity > 0", name="chk_storage_capacity"),
        {"schema": "game"}
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    factory_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("game.factories.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("game.items.id"), nullable=False, index=True)
    quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_capacity: Mapped[int] = mapped_column(Integer, default=1000, nullable=False, comment="Maximum units of this item")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    def __repr__(self):
        return f"<FactoryStorage(factory_id={self.factory_id}, item_id={self.item_id}, qty={self.quantity}/{self.max_capacity})>"
