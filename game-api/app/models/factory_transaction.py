"""
V0.5 Factory System - FactoryTransaction Model (Phase 2)
Audit trail for all factory inventory movements
"""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, String, ForeignKey, func, CheckConstraint, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class FactoryTransaction(Base):
    """
    V0.5 Factory System - Transaction audit trail
    Records all inventory movements (input, output, transfers)
    """
    __tablename__ = "factory_transactions"
    __table_args__ = (
        CheckConstraint("quantity != 0", name="chk_transaction_quantity"),
        {"schema": "game"}
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    factory_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("game.factories.id", ondelete="CASCADE"), nullable=False, index=True)
    transaction_type: Mapped[str] = mapped_column(String(20), nullable=False, comment="input, output, waste, transfer_in, transfer_out")
    item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("game.items.id"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, comment="Can be negative for consumption")
    batch_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("game.production_batches.id"), index=True)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    def __repr__(self):
        return f"<FactoryTransaction(id={self.id}, type={self.transaction_type}, item_id={self.item_id}, qty={self.quantity})>"
