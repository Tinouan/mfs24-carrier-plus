import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Integer, Numeric, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class MarketOrder(Base):
    __tablename__ = "market_orders"
    __table_args__ = {"schema": "game"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("game.companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    side: Mapped[str] = mapped_column(String(8), nullable=False)  # buy / sell (enum in DB)
    item_code: Mapped[str] = mapped_column(String(64), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)

    status: Mapped[str] = mapped_column(String(16), nullable=False, default="open")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
