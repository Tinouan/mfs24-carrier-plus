import uuid
from typing import TYPE_CHECKING, List
from sqlalchemy import String, Boolean, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.db import Base

if TYPE_CHECKING:
    from .company_aircraft import CompanyAircraft
    from .company_permission import CompanyPermission


class User(Base):
    __tablename__ = "users"
    __table_args__ = {"schema": "game"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    username: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # V0.7 Relationships
    aircraft: Mapped[List["CompanyAircraft"]] = relationship(
        "CompanyAircraft",
        back_populates="owner_user",
        foreign_keys="CompanyAircraft.user_id"
    )
    company_permissions: Mapped[List["CompanyPermission"]] = relationship(
        "CompanyPermission",
        back_populates="user"
    )
