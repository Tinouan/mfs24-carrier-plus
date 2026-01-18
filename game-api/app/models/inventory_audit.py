import uuid

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class InventoryAudit(Base):
    __tablename__ = "inventory_audit"
    __table_args__ = {"schema": "game"}

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    ts: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)

    action: Mapped[str] = mapped_column(String, nullable=False)  # deposit|withdraw|move

    from_loc: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    to_loc: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("game.items.id"), nullable=False)
    qty: Mapped[int] = mapped_column(BigInteger, nullable=False)
