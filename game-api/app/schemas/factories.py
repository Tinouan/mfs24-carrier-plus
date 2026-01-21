"""
Pydantic schemas for factory system.
"""
from pydantic import BaseModel, Field
from datetime import datetime
import uuid


# =====================================================
# ITEMS
# =====================================================

class ItemOut(BaseModel):
    """Item output schema (for lists and details)."""
    id: uuid.UUID
    name: str
    tier: int
    tags: list[str]
    icon: str
    base_value: float
    weight_kg: float
    is_raw: bool
    stack_size: int
    description: str | None = None


class ItemListOut(BaseModel):
    """Simplified item for lists."""
    id: uuid.UUID
    name: str
    tier: int
    icon: str
    tags: list[str]


# =====================================================
# RECIPES
# =====================================================

class RecipeIngredientOut(BaseModel):
    """Recipe ingredient detail."""
    item_id: uuid.UUID
    item_name: str
    item_icon: str
    quantity_required: int


class RecipeOut(BaseModel):
    """Recipe output with ingredients."""
    id: uuid.UUID
    name: str
    tier: int
    production_time_hours: float
    result_quantity: int
    description: str | None = None
    ingredients: list[RecipeIngredientOut]


class RecipeListOut(BaseModel):
    """Simplified recipe for lists."""
    id: uuid.UUID
    name: str
    tier: int
    production_time_hours: float
    result_quantity: int


# =====================================================
# WORKERS
# =====================================================

class WorkerOut(BaseModel):
    """Worker output."""
    id: uuid.UUID
    factory_id: uuid.UUID | None = None
    first_name: str
    last_name: str
    tier: int
    health: int
    happiness: int
    xp: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class WorkerCreateIn(BaseModel):
    """Create worker input."""
    first_name: str = Field(..., min_length=1, max_length=50)
    last_name: str = Field(..., min_length=1, max_length=50)


class WorkerUpdateIn(BaseModel):
    """Update worker input."""
    is_active: bool | None = None
    factory_id: uuid.UUID | None = None


# =====================================================
# ENGINEERS
# =====================================================

class EngineerOut(BaseModel):
    """Engineer output."""
    id: uuid.UUID
    company_id: uuid.UUID
    factory_id: uuid.UUID | None
    name: str
    specialization: str
    bonus_percentage: int
    experience: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class EngineerCreateIn(BaseModel):
    """Create engineer input (hired for a specific factory)."""
    factory_id: uuid.UUID
    name: str = Field(..., min_length=1, max_length=100)
    specialization: str = Field(..., pattern="^(food_processing|metal_smelting|chemical_refining|construction|electronics|medical|fuel_production|general)$")


# =====================================================
# FACTORY STORAGE
# =====================================================

class FactoryStorageLineOut(BaseModel):
    """Storage item line."""
    item_id: uuid.UUID
    item_name: str
    item_icon: str
    quantity: int


class FactoryStorageOut(BaseModel):
    """Factory storage inventory."""
    factory_id: uuid.UUID
    items: list[FactoryStorageLineOut]


class StorageDepositIn(BaseModel):
    """Deposit items into factory storage."""
    item_id: uuid.UUID
    quantity: int = Field(..., ge=1)


class StorageWithdrawIn(BaseModel):
    """Withdraw items from factory storage."""
    item_id: uuid.UUID
    quantity: int = Field(..., ge=1)


# =====================================================
# FACTORIES
# =====================================================

class FactoryOut(BaseModel):
    """Factory output (detailed)."""
    id: uuid.UUID
    company_id: uuid.UUID
    airport_ident: str
    name: str
    factory_type: str | None = None
    status: str
    current_recipe_id: uuid.UUID | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class FactoryListOut(BaseModel):
    """Simplified factory for lists."""
    id: uuid.UUID
    name: str
    airport_ident: str
    factory_type: str | None = None
    status: str
    is_active: bool

    class Config:
        from_attributes = True


class FactoryCreateIn(BaseModel):
    """Create factory input."""
    airport_ident: str = Field(..., min_length=3, max_length=4)
    name: str = Field(..., min_length=1, max_length=100)


class FactoryUpdateIn(BaseModel):
    """Update factory input."""
    name: str | None = Field(None, min_length=1, max_length=100)
    current_recipe_id: uuid.UUID | None = None
    status: str | None = Field(None, pattern="^(idle|producing|maintenance|offline)$")


# =====================================================
# PRODUCTION
# =====================================================

class ProductionBatchOut(BaseModel):
    """Production batch output."""
    id: uuid.UUID
    factory_id: uuid.UUID
    recipe_id: uuid.UUID
    status: str
    started_at: datetime | None = None
    estimated_completion: datetime | None = None
    completed_at: datetime | None = None
    result_quantity: int | None = None
    workers_assigned: int | None = None
    engineer_bonus_applied: bool
    created_at: datetime

    class Config:
        from_attributes = True


class StartProductionIn(BaseModel):
    """Start production input."""
    recipe_id: uuid.UUID
    workers_assigned: int = Field(..., ge=1, le=100)


# =====================================================
# TRANSACTIONS
# =====================================================

class FactoryTransactionOut(BaseModel):
    """Factory transaction output."""
    id: uuid.UUID
    factory_id: uuid.UUID
    item_id: uuid.UUID
    item_name: str
    transaction_type: str
    quantity: int
    batch_id: uuid.UUID | None = None
    notes: str | None = None
    created_at: datetime


# =====================================================
# WORLD DATA
# =====================================================

class AirportSlotOut(BaseModel):
    """Airport slot information."""
    airport_ident: str
    airport_name: str
    airport_type: str
    max_factory_slots: int
    occupied_slots: int
    available_slots: int


class FactoryStatsOut(BaseModel):
    """Factory statistics for dashboard."""
    total_factories: int
    idle_factories: int
    producing_factories: int
    paused_factories: int
    broken_factories: int
    total_workers: int
    total_engineers: int
    total_production_hours: int
