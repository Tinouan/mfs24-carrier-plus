import uuid
from decimal import Decimal

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, Numeric, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class InventoryItem(Base):
    __tablename__ = "inventory_items"
    __table_args__ = (
        UniqueConstraint('location_id', 'item_id', name='inventory_items_location_id_item_id_key'),
        {"schema": "game"}
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    location_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("game.inventory_locations.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("game.items.id"), nullable=False, index=True)

    qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Système de vente
    for_sale: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sale_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)  # Prix unitaire si en vente
    sale_qty: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)  # Quantité mise en vente (≤ qty)

    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
