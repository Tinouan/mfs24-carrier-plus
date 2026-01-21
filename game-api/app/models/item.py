import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Integer, Numeric, String, func, ARRAY
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Item(Base):
    """
    V0.5 Factory System - Items catalog (raw materials + processed goods)
    Tiers: 0=raw, 1-5=processed
    """
    __tablename__ = "items"
    __table_args__ = {"schema": "game"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    tier: Mapped[int] = mapped_column(Integer, nullable=False, index=True, comment="0=raw, 1-5=processed")
    tags: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, server_default="{}")
    icon: Mapped[str | None] = mapped_column(String(10))
    base_value: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    weight_kg: Mapped[Decimal] = mapped_column(Numeric(8, 3), nullable=False)
    is_raw: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    stack_size: Mapped[int] = mapped_column(Integer, default=100)
    description: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
