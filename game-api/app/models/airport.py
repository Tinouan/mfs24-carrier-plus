"""
Airport model - Public schema (Directus-managed world data)
"""
import uuid
from datetime import datetime

from sqlalchemy import String, Integer, Numeric, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Airport(Base):
    """Airport from OurAirports data, managed by Directus."""
    __tablename__ = "airports"
    __table_args__ = {"schema": "public"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ident: Mapped[str] = mapped_column(String(10), unique=True, nullable=False)
    type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    name: Mapped[str | None] = mapped_column(nullable=True)
    latitude_deg: Mapped[float | None] = mapped_column(Numeric(10, 8), nullable=True)
    longitude_deg: Mapped[float | None] = mapped_column(Numeric(11, 8), nullable=True)
    elevation_ft: Mapped[int | None] = mapped_column(Integer, nullable=True)
    continent: Mapped[str | None] = mapped_column(String(2), nullable=True)
    iso_country: Mapped[str | None] = mapped_column(String(2), nullable=True)
    iso_region: Mapped[str | None] = mapped_column(String(10), nullable=True)
    municipality: Mapped[str | None] = mapped_column(nullable=True)
    scheduled_service: Mapped[str | None] = mapped_column(String(3), nullable=True)
    gps_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    iata_code: Mapped[str | None] = mapped_column(String(3), nullable=True)
    local_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    home_link: Mapped[str | None] = mapped_column(nullable=True)
    wikipedia_link: Mapped[str | None] = mapped_column(nullable=True)
    keywords: Mapped[str | None] = mapped_column(nullable=True)

    # Factory system columns
    max_factory_slots: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    occupied_slots: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    # Directus management columns
    date_created: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    date_updated: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    user_created: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    user_updated: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
