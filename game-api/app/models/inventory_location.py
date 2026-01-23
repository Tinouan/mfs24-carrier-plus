import uuid
from typing import Optional

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class InventoryLocation(Base):
    """
    V0.7 Unified Inventory Location

    Kinds:
    - player_warehouse: Player's personal warehouse at an airport
    - company_warehouse: Company warehouse at an airport
    - factory_storage: Factory input/output storage (linked via factory)
    - aircraft: Cargo hold of an aircraft

    Owner types:
    - player: Owned by a user (owner_id = user_id)
    - company: Owned by a company (owner_id = company_id)
    """
    __tablename__ = "inventory_locations"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('vault', 'player_warehouse', 'company_warehouse', 'factory_storage', 'aircraft', 'warehouse', 'in_transit')",
            name="inventory_locations_kind_check",
        ),
        CheckConstraint(
            "owner_type IN ('company', 'player')",
            name="check_owner_type",
        ),
        {"schema": "game"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Legacy company_id (kept for backward compatibility, use owner_id instead)
    company_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("game.companies.id", ondelete="CASCADE"),
        nullable=True,
        index=True
    )

    # V0.7 Polymorphic ownership
    owner_type: Mapped[str] = mapped_column(String(20), nullable=False, default="company")
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)

    # Reference to aircraft for kind='aircraft'
    aircraft_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("game.company_aircraft.id", ondelete="CASCADE"),
        nullable=True
    )

    kind: Mapped[str] = mapped_column(String(30), nullable=False)
    airport_ident: Mapped[str] = mapped_column(String(8), nullable=False, default="")
    name: Mapped[str] = mapped_column(String(100), nullable=False)

    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    company = relationship("Company", back_populates="inventory_locations", foreign_keys=[company_id])
    aircraft = relationship("CompanyAircraft", back_populates="cargo_location", foreign_keys=[aircraft_id])
    items = relationship("InventoryItem", back_populates="location", cascade="all, delete-orphan")

    @property
    def is_player_owned(self) -> bool:
        return self.owner_type == "player"

    @property
    def is_company_owned(self) -> bool:
        return self.owner_type == "company"

    @property
    def is_aircraft_cargo(self) -> bool:
        return self.kind == "aircraft"
