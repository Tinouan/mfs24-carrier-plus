"""
V0.5 Factory System - Factory Model (Phase 2)
Company-owned production facilities with auto-detected type
"""
import uuid
from datetime import datetime

from decimal import Decimal

from sqlalchemy import Boolean, DateTime, String, Integer, ForeignKey, Numeric, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Factory(Base):
    """
    V0.5 Factory System - Company-owned production facilities
    Type is auto-detected from recipe tags via trigger
    """
    __tablename__ = "factories"
    __table_args__ = {"schema": "game"}

    # Primary Key
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    # Foreign Keys
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("game.companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    current_recipe_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("game.recipes.id"),
        nullable=True
    )

    # Core Fields
    airport_ident: Mapped[str] = mapped_column(
        String(4),
        nullable=False,
        index=True,
        comment="Airport ICAO code (no FK for now)"
    )
    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False
    )
    tier: Mapped[int] = mapped_column(
        Integer,
        server_default="1",
        nullable=False,
        comment="T0=NPC raw materials, T1-T5=Player factories"
    )
    factory_type: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        comment="Auto-detected: food_processing, metal_smelting, etc."
    )
    status: Mapped[str] = mapped_column(
        String(20),
        server_default="idle",
        nullable=False,
        index=True,
        comment="idle, producing, maintenance, offline"
    )

    # Status Flags
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        server_default="true",
        nullable=False
    )

    # V0.6 Worker Capacity
    max_workers: Mapped[int] = mapped_column(
        Integer,
        server_default="10",
        nullable=False,
        comment="Max workers based on tier (T1=10, T5=50)"
    )
    max_engineers: Mapped[int] = mapped_column(
        Integer,
        server_default="2",
        nullable=False,
        comment="Max engineers based on tier (T1=2, T5=10)"
    )

    # V0.6 Food System
    food_item_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("game.items.id"),
        nullable=True,
        comment="Item used as food (default: Rations)"
    )
    food_stock: Mapped[int] = mapped_column(
        Integer,
        server_default="0",
        nullable=False,
        comment="Current food units in storage"
    )
    food_capacity: Mapped[int] = mapped_column(
        Integer,
        server_default="100",
        nullable=False,
        comment="Max food storage capacity"
    )
    food_consumption_per_hour: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        server_default="0",
        nullable=False,
        comment="Food consumed per hour (based on workers)"
    )
    food_tier: Mapped[int] = mapped_column(
        Integer,
        server_default="0",
        nullable=False,
        comment="Tier of loaded food for bonus calculation (0-5)"
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
        nullable=False
    )

    def __repr__(self):
        return f"<Factory(id={self.id}, name='{self.name}', type={self.factory_type}, status={self.status})>"
