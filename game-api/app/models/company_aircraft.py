from sqlalchemy import Column, String, DateTime, Float, Integer, Numeric, Boolean, CheckConstraint, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.db import Base


class AircraftCatalog(Base):
    """
    Catalogue d'avions disponibles à l'achat.
    Types prédéfinis avec specs et prix.
    """
    __tablename__ = "aircraft_catalog"
    __table_args__ = {"schema": "game"}

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))

    # Identity
    name = Column(String(100), nullable=False)  # "Cessna 208 Caravan"
    icao_type = Column(String(10), nullable=False)  # "C208"
    manufacturer = Column(String(50), nullable=False)  # "Cessna"

    # Category: single_prop, twin_prop, turboprop, jet_small, jet_medium, jet_large, helicopter
    category = Column(String(30), nullable=False)

    # Specs
    cargo_capacity_kg = Column(Integer, nullable=False)
    cargo_capacity_m3 = Column(Float, nullable=True)
    max_range_nm = Column(Integer, nullable=True)
    cruise_speed_kts = Column(Integer, nullable=True)

    # Economics
    base_price = Column(Numeric(14, 2), nullable=False)
    operating_cost_per_hour = Column(Numeric(10, 2), nullable=True)

    # Requirements
    min_runway_length_m = Column(Integer, nullable=True)
    required_license = Column(String(20), nullable=True)  # PPL, CPL, ATPL

    # MSFS integration
    msfs_aircraft_id = Column(String(100), nullable=True)

    is_active = Column(Boolean, nullable=False, server_default=text("true"))


class CompanyAircraft(Base):
    """
    V0.7 Aircraft with flexible ownership (company OR player)

    Owner types:
    - company: Owned by a company (company_id set, user_id null)
    - player: Owned by a player (user_id set, company_id null)

    Status values:
    - stored: In hangar, not active
    - parked: At airport, ready for use
    - in_flight: Currently flying
    - maintenance: Under repair
    """
    __tablename__ = "company_aircraft"
    __table_args__ = (
        CheckConstraint(
            "status IN ('stored','parked','in_flight','maintenance')",
            name="company_aircraft_status_check",
        ),
        CheckConstraint(
            "(owner_type = 'company' AND company_id IS NOT NULL AND user_id IS NULL) OR "
            "(owner_type = 'player' AND user_id IS NOT NULL AND company_id IS NULL)",
            name="check_aircraft_owner",
        ),
        {"schema": "game"},
    )

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))

    # V0.7: company_id now nullable for player-owned aircraft
    company_id = Column(UUID(as_uuid=True), ForeignKey("game.companies.id", ondelete="CASCADE"), nullable=True)

    # V0.7: Flexible ownership
    owner_type = Column(String(20), nullable=False, server_default=text("'company'"))
    user_id = Column(UUID(as_uuid=True), ForeignKey("game.users.id", ondelete="CASCADE"), nullable=True)

    # V0.7.1: Registration and identity
    registration = Column(String(10), nullable=True, unique=True)  # N-number, F-XXXX, etc.
    name = Column(String(100), nullable=True)  # Nickname
    icao_type = Column(String(10), nullable=True)  # "C208"

    aircraft_type = Column(String, nullable=False)
    status = Column(String, nullable=False, server_default=text("'stored'"))
    condition = Column(Float, nullable=False, server_default=text("1.0"))
    hours = Column(Float, nullable=False, server_default=text("0.0"))

    # V0.7: Cargo capacity for inventory system
    cargo_capacity_kg = Column(Integer, nullable=False, server_default=text("500"))

    current_airport_ident = Column(String, ForeignKey("public.airports.ident"), nullable=True)

    # V0.7.1: Economics
    purchase_price = Column(Numeric(14, 2), nullable=True)

    # V0.7.1: Active flag for soft delete
    is_active = Column(Boolean, nullable=False, server_default=text("true"))

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), nullable=True, server_default=text("now()"))

    # Relationships
    company = relationship("Company", back_populates="aircraft", foreign_keys=[company_id])
    owner_user = relationship("User", back_populates="aircraft", foreign_keys=[user_id])
    cargo_location = relationship("InventoryLocation", back_populates="aircraft", uselist=False)

    @property
    def is_player_owned(self) -> bool:
        return self.owner_type == "player"

    @property
    def is_company_owned(self) -> bool:
        return self.owner_type == "company"

    @property
    def owner_id(self):
        """Returns the owner UUID regardless of owner type."""
        return self.user_id if self.is_player_owned else self.company_id
