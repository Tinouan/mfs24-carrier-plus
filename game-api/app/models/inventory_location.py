import uuid

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class InventoryLocation(Base):
    __tablename__ = "inventory_locations"
    __table_args__ = {"schema": "game"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("game.companies.id", ondelete="CASCADE"), nullable=False, index=True)

    kind: Mapped[str] = mapped_column(String, nullable=False)  # vault|warehouse|in_transit
    airport_ident: Mapped[str] = mapped_column(String, nullable=False, default="")  # "" for vault
    name: Mapped[str] = mapped_column(String, nullable=False)

    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
