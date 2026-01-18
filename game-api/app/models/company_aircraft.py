from sqlalchemy import Column, String, DateTime, Float, CheckConstraint, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID
from app.core.db import Base


class CompanyAircraft(Base):
    __tablename__ = "company_aircraft"
    __table_args__ = (
        CheckConstraint(
            "status IN ('stored','parked','in_flight','maintenance')",
            name="company_aircraft_status_check",
        ),
        {"schema": "game"},
    )

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    company_id = Column(UUID(as_uuid=True), ForeignKey("game.companies.id", ondelete="CASCADE"), nullable=False)

    aircraft_type = Column(String, nullable=False)
    status = Column(String, nullable=False, server_default=text("'stored'"))
    condition = Column(Float, nullable=False, server_default=text("1.0"))
    hours = Column(Float, nullable=False, server_default=text("0.0"))

    current_airport_ident = Column(String, ForeignKey("public.airports.ident"), nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
