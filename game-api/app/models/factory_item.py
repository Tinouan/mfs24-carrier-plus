"""
Factory Items Model
Replaces and extends the existing Item model for factory system.
"""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Integer, Numeric, Boolean, func, ARRAY
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class FactoryItem(Base):
    """
    Items for factory production system (T0-T5).
    Replaces simple 'items' table with rich factory data.
    """
    __tablename__ = "items"
    __table_args__ = {"schema": "game"}

    # Primary Key
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    # Core Info
    name: Mapped[str] = mapped_column(
        String(100),
        unique=True,
        nullable=False,
        index=True
    )
    tier: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        index=True,
        comment="0=raw, 1-5=processed"
    )

    # Metadata
    tags: Mapped[list[str]] = mapped_column(
        ARRAY(String),
        nullable=False,
        server_default="{}",
        comment="Ex: ['food', 'baked', 'quality']"
    )
    icon: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
        server_default="📦"
    )
    description: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True
    )

    # Economics
    base_value: Mapped[float] = mapped_column(
        Numeric(10, 2),
        nullable=False,
        comment="Base market value"
    )
    weight_kg: Mapped[float] = mapped_column(
        Numeric(6, 2),
        nullable=False,
        comment="Weight per unit"
    )

    # Production
    is_raw: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default="false",
        comment="True for T0 raw materials"
    )
    stack_size: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default="100",
        comment="Max stack in inventory"
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )

    def __repr__(self):
        return f"<FactoryItem(id={self.id}, name='{self.name}', tier={self.tier})>"
