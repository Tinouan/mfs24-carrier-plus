"""
Pydantic schemas for V0.8.1 Workers System (V2 Only).
Item-based workers with individual stats.
"""
from pydantic import BaseModel
from datetime import datetime
import uuid


# =====================================================
# WORKERS V2 - Item-based workers with individual stats
# =====================================================

class WorkerInstanceOut(BaseModel):
    """Worker instance output (V2 item-based system)."""
    id: uuid.UUID
    item_id: uuid.UUID
    item_name: str | None = None  # Worker-FR, Worker-CN, etc.
    country_code: str
    speed: int
    resistance: int
    tier: int
    xp: int
    hourly_salary: float
    status: str  # 'available', 'working', 'injured', 'dead'
    airport_ident: str
    factory_id: uuid.UUID | None = None
    owner_company_id: uuid.UUID | None = None
    owner_player_id: uuid.UUID | None = None
    for_sale: bool = False
    sale_price: float | None = None
    injured_at: datetime | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class WorkerInstanceListOut(BaseModel):
    """Simplified worker instance for lists."""
    id: uuid.UUID
    item_name: str | None = None
    country_code: str
    speed: int
    resistance: int
    tier: int
    hourly_salary: float
    status: str
    airport_ident: str
    factory_id: uuid.UUID | None = None

    class Config:
        from_attributes = True


class WorkerInstanceAssignIn(BaseModel):
    """Assign worker instance to factory (V2)."""
    factory_id: uuid.UUID


class FactoryWorkersV2Out(BaseModel):
    """Workers assigned to a factory (V2)."""
    factory_id: uuid.UUID
    factory_name: str
    max_workers: int
    current_workers: int
    workers: list[WorkerInstanceListOut]


class InventoryWorkersOut(BaseModel):
    """Workers available in inventory at an airport (V2)."""
    airport_ident: str
    company_id: uuid.UUID | None = None
    total_workers: int
    workers: list[WorkerInstanceListOut]
