"""
MFS Carrier+ - Company Inventory Model V0.7 (Simplified)
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from app.core.db import Base


class CompanyInventory(Base):
    """
    Company inventory.
    Items produced by T1+ factories go directly here.
    Items are localized by airport_ident (factory's airport).
    """
    __tablename__ = "company_inventory"
    __table_args__ = (
        UniqueConstraint('company_id', 'item_id', 'airport_ident', name='uq_company_item_airport'),
        {"schema": "game"}
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("game.companies.id", ondelete="CASCADE"), nullable=False)
    item_id = Column(UUID(as_uuid=True), ForeignKey("game.items.id", ondelete="CASCADE"), nullable=False)
    qty = Column(Integer, nullable=False, default=0)
    airport_ident = Column(String(8), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
