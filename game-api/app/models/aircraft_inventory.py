"""
MFS Carrier+ - Aircraft Inventory Model V0.7 (Simplified)
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, Integer, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from app.core.db import Base


class AircraftInventory(Base):
    """
    Aircraft cargo inventory.
    Items in aircraft don't have airport_ident -
    location = aircraft's current_airport_ident.
    """
    __tablename__ = "aircraft_inventory"
    __table_args__ = (
        UniqueConstraint('aircraft_id', 'item_id', name='uq_aircraft_item'),
        {"schema": "game"}
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    aircraft_id = Column(UUID(as_uuid=True), ForeignKey("game.company_aircraft.id", ondelete="CASCADE"), nullable=False)
    item_id = Column(UUID(as_uuid=True), ForeignKey("game.items.id", ondelete="CASCADE"), nullable=False)
    qty = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
