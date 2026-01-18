import uuid
from sqlalchemy import String, Integer, DateTime, func, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.core.db import Base

class Company(Base):
    __tablename__ = "companies"
    __table_args__ = (
        UniqueConstraint("world_id", "slug", name="uq_companies_world_slug"),
        {"schema": "game"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    world_id: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    name: Mapped[str] = mapped_column(String, nullable=False)
    slug: Mapped[str] = mapped_column(String, nullable=False)

    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("game.users.id"),
        nullable=False
    )

    # NEW: airport "maison" obligatoire côté gameplay
    home_airport_ident: Mapped[str] = mapped_column(
        String,
        ForeignKey("public.airports.ident"),
        nullable=True,  # on passera en NOT NULL après backfill si besoin
    )

    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
