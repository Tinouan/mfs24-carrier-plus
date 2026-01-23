import uuid
import re
from datetime import datetime
from typing import TYPE_CHECKING, List

from sqlalchemy import String, Boolean, DateTime, Numeric, Integer, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from .inventory_location import InventoryLocation
    from .company_aircraft import CompanyAircraft
    from .company_permission import CompanyPermission


def slugify(text: str) -> str:
    """Convert text to URL-friendly slug."""
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_-]+', '-', text)
    return text[:50]


class Company(Base):
    __tablename__ = "companies"
    __table_args__ = {"schema": "game"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # World (default 1)
    world_id: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")

    # Core
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    slug: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)

    # Owner (optional, tracked via company_members)
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    # IMPORTANT: Some older rows may still be NULL; we backfilled it earlier.
    home_airport_ident: Mapped[str] = mapped_column(String(8), nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # V0.3 Company Profile
    display_name: Mapped[str | None] = mapped_column(String(48), nullable=True)
    description: Mapped[str | None] = mapped_column(String(400), nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String(300), nullable=True)

    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    settings: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # V0.4 Wallet
    balance: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, server_default="0")

    # V0.7 Relationships
    inventory_locations: Mapped[List["InventoryLocation"]] = relationship(
        "InventoryLocation",
        back_populates="company",
        foreign_keys="InventoryLocation.company_id"
    )
    aircraft: Mapped[List["CompanyAircraft"]] = relationship(
        "CompanyAircraft",
        back_populates="company",
        foreign_keys="CompanyAircraft.company_id"
    )
    permissions: Mapped[List["CompanyPermission"]] = relationship(
        "CompanyPermission",
        back_populates="company",
        cascade="all, delete-orphan"
    )

