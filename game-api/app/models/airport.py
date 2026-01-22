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
    __tablename__ = "airports"  # Directus collection name (lowercase)
    __table_args__ = {"schema": "public"}

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ident: Mapped[str | None] = mapped_column(String(255), nullable=True)
    type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    latitude_deg: Mapped[float | None] = mapped_column(Numeric(10, 5), nullable=True)
    longitude_deg: Mapped[float | None] = mapped_column(Numeric(10, 5), nullable=True)
    elevation_ft: Mapped[int | None] = mapped_column(Integer, nullable=True)
    continent: Mapped[str | None] = mapped_column(String(255), nullable=True)
    iso_country: Mapped[str | None] = mapped_column(String(255), nullable=True)
    iso_region: Mapped[str | None] = mapped_column(String(255), nullable=True)
    municipality: Mapped[str | None] = mapped_column(String(255), nullable=True)
    schedule_service: Mapped[str | None] = mapped_column(String(255), nullable=True)  # Directus typo
    gps_code: Mapped[str | None] = mapped_column(String(255), nullable=True)
    iata_code: Mapped[str | None] = mapped_column(String(255), nullable=True)
    local_code: Mapped[str | None] = mapped_column(String(255), nullable=True)
    home_link: Mapped[str | None] = mapped_column(String(255), nullable=True)
    wikipedia_link: Mapped[str | None] = mapped_column(String(255), nullable=True)
    keywords: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Factory system columns (Directus typo: max_factories_slots)
    max_factories_slots: Mapped[int | None] = mapped_column(Integer, nullable=True)
    occupied_slots: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Directus management columns
    date_created: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    date_updated: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    user_created: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    user_updated: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
