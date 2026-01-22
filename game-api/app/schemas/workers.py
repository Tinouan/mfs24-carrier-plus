"""
Pydantic schemas for V0.6 Workers System.

Workers and Engineers are unified in a single model.
Engineers are workers with worker_type='engineer'.
"""
from pydantic import BaseModel, Field
from datetime import datetime
import uuid


# =====================================================
# WORKER OUTPUT SCHEMAS
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
    resistance: int
    status: str
    hourly_salary: float

    class Config:
        from_attributes = True


# =====================================================
# WORKER INPUT SCHEMAS
# =====================================================

class WorkerHireIn(BaseModel):
    """Hire worker from airport pool."""
    worker_id: uuid.UUID


class WorkerHireBulkIn(BaseModel):
    """Hire multiple workers from airport pool."""
    worker_ids: list[uuid.UUID] = Field(..., min_length=1, max_length=10)


class WorkerAssignIn(BaseModel):
    """Assign worker to factory."""
    factory_id: uuid.UUID


class WorkerUnassignIn(BaseModel):
    """Unassign worker from factory (back to company but not at factory)."""
    pass  # No params needed, just POST to endpoint


class WorkerFireIn(BaseModel):
    """Fire worker (returns to airport pool)."""
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
    last_reset_at: datetime | None = None

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


class AirportPoolDetailOut(BaseModel):
    """Detailed airport pool with available workers."""
    airport_ident: str
    airport_name: str | None = None
    max_workers: int
    max_engineers: int
    available_workers: list[PoolWorkerOut]
    available_engineers: list[PoolWorkerOut]


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
# COMPANY WORKERS
# =====================================================

class CompanyWorkersOut(BaseModel):
    """All workers owned by a company."""
    company_id: uuid.UUID
    total_workers: int
    total_engineers: int
    workers: list[WorkerListOut]
    engineers: list[WorkerListOut]


class FactoryWorkersOut(BaseModel):
    """Workers assigned to a specific factory."""
    factory_id: uuid.UUID
    factory_name: str
    max_workers: int
    max_engineers: int
    current_workers: int
    current_engineers: int
    workers: list[WorkerListOut]
    engineers: list[WorkerListOut]


# =====================================================
# WORKER XP & TIER
# =====================================================

class WorkerXpThresholdOut(BaseModel):
    """XP threshold for tier progression."""
    tier: int
    xp_required: int
    speed_bonus: int
    resistance_bonus: int
    salary_multiplier: float

    class Config:
        from_attributes = True


# =====================================================
# BACKWARD COMPATIBILITY
# =====================================================

# EngineerOut is now just an alias for WorkerOut
EngineerOut = WorkerOut
