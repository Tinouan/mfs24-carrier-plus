"""
MFS Carrier+ - Player Inventory Model V0.7 (Simplified)
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from app.core.db import Base


class PlayerInventory(Base):
    """
    Player's personal inventory.
    Items are localized by airport_ident.
    A player can see ALL their items across all airports.
    """
    __tablename__ = "player_inventory"
    __table_args__ = (
        UniqueConstraint('player_id', 'item_id', 'airport_ident', name='uq_player_item_airport'),
        {"schema": "game"}
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    player_id = Column(UUID(as_uuid=True), ForeignKey("game.users.id", ondelete="CASCADE"), nullable=False)
    item_id = Column(UUID(as_uuid=True), ForeignKey("game.items.id", ondelete="CASCADE"), nullable=False)
    qty = Column(Integer, nullable=False, default=0)
    airport_ident = Column(String(8), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
