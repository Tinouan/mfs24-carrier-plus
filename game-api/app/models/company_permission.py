import uuid
from sqlalchemy import Boolean, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.db import Base


class CompanyPermission(Base):
    """
    V0.7 Granular permissions per company member

    Replaces the simple role-based system with fine-grained permissions.
    Founders (is_founder=True) have all permissions regardless of individual flags.

    Permission categories:
    - Warehouse: withdraw/deposit from company warehouses
    - Factory: withdraw/deposit from factory storage
    - Aircraft: manage (buy/sell) and use aircraft
    - Market: buy and sell on the market
    - Management: workers, members, factories
    """
    __tablename__ = "company_permissions"
    __table_args__ = {"schema": "game"}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("game.companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("game.users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    # Warehouse permissions
    can_withdraw_warehouse: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    can_deposit_warehouse: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Factory permissions
    can_withdraw_factory: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    can_deposit_factory: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Aircraft permissions
    can_manage_aircraft: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    can_use_aircraft: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Market permissions
    can_sell_market: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    can_buy_market: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Management permissions
    can_manage_workers: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    can_manage_members: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    can_manage_factories: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Special flags
    is_founder: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[str] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    updated_at: Mapped[str] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )

    # Relationships
    company = relationship("Company", back_populates="permissions")
    user = relationship("User", back_populates="company_permissions")

    def has_permission(self, permission: str) -> bool:
        """
        Check if user has a specific permission.
        Founders always have all permissions.
        """
        if self.is_founder:
            return True
        return getattr(self, permission, False)

    def can_withdraw(self, location_kind: str) -> bool:
        """Check if user can withdraw from a location type."""
        if self.is_founder:
            return True
        if location_kind in ("company_warehouse", "warehouse"):
            return self.can_withdraw_warehouse
        if location_kind == "factory_storage":
            return self.can_withdraw_factory
        return False

    def can_deposit(self, location_kind: str) -> bool:
        """Check if user can deposit to a location type."""
        if self.is_founder:
            return True
        if location_kind in ("company_warehouse", "warehouse"):
            return self.can_deposit_warehouse
        if location_kind == "factory_storage":
            return self.can_deposit_factory
        return False

    @classmethod
    def create_founder_permissions(cls, company_id: uuid.UUID, user_id: uuid.UUID) -> "CompanyPermission":
        """Create full permissions for a company founder."""
        return cls(
            company_id=company_id,
            user_id=user_id,
            can_withdraw_warehouse=True,
            can_deposit_warehouse=True,
            can_withdraw_factory=True,
            can_deposit_factory=True,
            can_manage_aircraft=True,
            can_use_aircraft=True,
            can_sell_market=True,
            can_buy_market=True,
            can_manage_workers=True,
            can_manage_members=True,
            can_manage_factories=True,
            is_founder=True,
        )

    @classmethod
    def create_member_permissions(cls, company_id: uuid.UUID, user_id: uuid.UUID) -> "CompanyPermission":
        """Create default permissions for a new member."""
        return cls(
            company_id=company_id,
            user_id=user_id,
            can_withdraw_warehouse=False,
            can_deposit_warehouse=True,
            can_withdraw_factory=False,
            can_deposit_factory=True,
            can_manage_aircraft=False,
            can_use_aircraft=True,
            can_sell_market=False,
            can_buy_market=True,
            can_manage_workers=False,
            can_manage_members=False,
            can_manage_factories=False,
            is_founder=False,
        )
