"""
V0.5 Factory System - Engineer Model (Phase 2)
Specialized engineers providing production bonuses
"""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, ForeignKey, func, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Engineer(Base):
    """
    V0.5 Factory System - Engineers (enhanced workers)
    Engineers are assigned to a specific factory (1 per factory max)
    They belong to the company, like regular workers
    """
    __tablename__ = "engineers"
    __table_args__ = (
        CheckConstraint("bonus_percentage BETWEEN 0 AND 50", name="chk_engineer_bonus"),
        CheckConstraint("experience >= 0", name="chk_engineer_experience"),
        {"schema": "game"}
    )

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
    factory_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("game.factories.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="Factory where engineer is assigned (1 per factory)"
    )

    # Core Fields
    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False
    )
    specialization: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        comment="Specialization type (for future use)"
    )
    bonus_percentage: Mapped[int] = mapped_column(
        Integer,
        server_default="10",
        nullable=False,
        comment="+10-50% production bonus"
    )
    experience: Mapped[int] = mapped_column(
        Integer,
        server_default="0",
        nullable=False,
        comment="Increases bonus over time"
    )

    # Status Flags
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        server_default="true",
        nullable=False,
        index=True
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    def __repr__(self):
        return f"<Engineer(id={self.id}, name='{self.name}', spec={self.specialization}, bonus={self.bonus_percentage}%)>"
