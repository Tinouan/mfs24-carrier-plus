import uuid
from datetime import datetime

from sqlalchemy import String, Boolean, DateTime, Numeric, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Company(Base):
    __tablename__ = "companies"
    __table_args__ = {"schema": "game"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Core
    name: Mapped[str] = mapped_column(String(80), nullable=False)

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

