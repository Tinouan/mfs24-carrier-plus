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


class RecipeWithInputsOut(BaseModel):
    """Recipe with inputs for detection (V2.1)."""
    id: uuid.UUID
    name: str
    tier: int
    production_time_hours: float
    base_time_seconds: int  # For frontend display
    result_quantity: int
    output_item_name: str
    output_item_icon: str | None = None
    inputs: list[RecipeIngredientOut]


# =====================================================
# WORKERS (V0.6 Unified System)
# =====================================================

class WorkerOut(BaseModel):
    """Worker/Engineer output (unified model)."""
    id: uuid.UUID
    first_name: str
    last_name: str
    country_code: str
    worker_type: str  # 'worker' or 'engineer'
    speed: int
    resistance: int
    tier: int
    xp: int
    hourly_salary: float
    status: str  # 'available', 'working', 'injured', 'dead'
    injured_at: datetime | None = None
    location_type: str  # 'airport' or 'factory'
    airport_ident: str | None = None
    factory_id: uuid.UUID | None = None
    company_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class WorkerListOut(BaseModel):
    """Simplified worker for lists."""
    id: uuid.UUID
    first_name: str
    last_name: str
    country_code: str
    worker_type: str
    tier: int
    speed: int
    status: str
    hourly_salary: float

    class Config:
        from_attributes = True


class WorkerHireIn(BaseModel):
    """Hire worker from airport pool."""
    worker_id: uuid.UUID


class WorkerHireBulkIn(BaseModel):
    """Hire multiple workers from airport pool."""
    worker_ids: list[uuid.UUID] = Field(..., min_length=1, max_length=10)


class WorkerAssignIn(BaseModel):
    """Assign worker to factory."""
    factory_id: uuid.UUID


class WorkerFireIn(BaseModel):
    """Fire worker (returns to airport pool or removes if injured/dead)."""
    worker_id: uuid.UUID


# =====================================================
# AIRPORT WORKER POOLS
# =====================================================

class AirportWorkerPoolOut(BaseModel):
    """Airport worker pool info."""
    airport_ident: str
    max_workers: int
    max_engineers: int
    current_workers: int
    current_engineers: int
    last_refresh: datetime | None = None

    class Config:
        from_attributes = True


class PoolWorkerOut(BaseModel):
    """Worker available in airport pool (for hiring)."""
    id: uuid.UUID
    first_name: str
    last_name: str
    country_code: str
    worker_type: str
    tier: int
    speed: int
    resistance: int
    hourly_salary: float

    class Config:
        from_attributes = True


# =====================================================
# COUNTRY WORKER STATS
# =====================================================

class CountryWorkerStatsOut(BaseModel):
    """Country worker statistics."""
    country_code: str
    country_name: str
    base_speed: int
    base_resistance: int
    base_hourly_salary: float

    class Config:
        from_attributes = True


# =====================================================
# ENGINEERS (Deprecated - use WorkerOut with worker_type='engineer')
# =====================================================

# EngineerOut is now just an alias for WorkerOut
EngineerOut = WorkerOut


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
    tier: int = 0
    factory_type: str | None = None
    status: str
    current_recipe_id: uuid.UUID | None = None
    is_active: bool
    # V0.6 Workers capacity
    max_workers: int = 10
    max_engineers: int = 2
    # V0.8.1 Food system (enhanced)
    food_item_id: uuid.UUID | None = None
    food_item_name: str | None = None
    food_item_icon: str | None = None
    food_tier: int = 0
    food_stock: int = 0
    food_capacity: int = 100
    food_consumption_per_hour: float = 0.0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class FactoryListOut(BaseModel):
    """Simplified factory for lists."""
    id: uuid.UUID
    name: str
    airport_ident: str
    tier: int = 0
    factory_type: str | None = None
    status: str
    is_active: bool
    # Worker counts
    worker_count: int = 0
    engineer_count: int = 0

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
# FACTORY FOOD SYSTEM V0.8.1
# =====================================================

class FoodDepositIn(BaseModel):
    """Deposit food into factory (V0.8.1 - item-based)."""
    item_id: uuid.UUID = Field(..., description="Food item ID from company inventory")
    quantity: int = Field(..., ge=1, description="Amount of food to deposit")


class FoodStatusOut(BaseModel):
    """Factory food status (V0.8.1 - includes item info and tier bonus)."""
    factory_id: uuid.UUID
    food_item_id: uuid.UUID | None = None
    food_item_name: str | None = None
    food_item_icon: str | None = None
    food_tier: int = 0
    food_bonus_percent: int = 0  # 0, 15, 30, 45, 60, 75
    food_stock: int
    food_capacity: int
    food_consumption_per_hour: float
    hours_until_empty: float | None = None
    workers_count: int = 0


# =====================================================
# FACTORY WORKERS MANAGEMENT
# =====================================================

class FactoryWorkersOut(BaseModel):
    """Workers assigned to a factory."""
    factory_id: uuid.UUID
    factory_name: str
    max_workers: int
    max_engineers: int
    workers: list["WorkerListOut"]
    engineers: list["WorkerListOut"]


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
    """Start production input (V2.1). Recipe + quantity (number of batches)."""
    recipe_id: uuid.UUID
    # V2.1: Number of batches to produce (default 1)
    quantity: int = Field(default=1, ge=1, le=1000)
    # V2: workers_assigned is now optional - backend uses workers assigned to factory
    workers_assigned: int | None = Field(default=None, ge=1, le=100)


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
    max_factories_slots: int
    occupied_slots: int
    available_slots: int


class AirportOut(BaseModel):
    """Airport output for map display."""
    ident: str
    name: str | None
    type: str | None
    latitude_deg: float | None
    longitude_deg: float | None
    iso_country: str | None
    municipality: str | None
    iata_code: str | None
    max_factories_slots: int | None

    class Config:
        from_attributes = True


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
