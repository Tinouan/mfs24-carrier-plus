from decimal import Decimal
from pydantic import BaseModel, Field
from uuid import UUID
from typing import Optional
from datetime import datetime


class AircraftOut(BaseModel):
    id: UUID
    company_id: Optional[UUID] = None
    user_id: Optional[UUID] = None
    owner_type: str = "company"
    aircraft_type: str
    status: str
    condition: float
    hours: float
    cargo_capacity_kg: int = 500
    current_airport_ident: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# V0.7 Aircraft Cargo Schemas

class CargoItemOut(BaseModel):
    """Item in aircraft cargo"""
    item_id: UUID
    item_name: str
    tier: int
    qty: int
    weight_kg: Decimal
    total_weight_kg: Decimal
    base_value: Decimal
    total_value: Decimal


class AircraftCargoOut(BaseModel):
    """Aircraft cargo summary"""
    aircraft_id: UUID
    aircraft_type: str
    status: str
    current_airport_ident: Optional[str] = None
    cargo_capacity_kg: int
    current_cargo_kg: Decimal
    available_capacity_kg: Decimal
    items: list[CargoItemOut]


class LoadCargoIn(BaseModel):
    """Load cargo into aircraft"""
    from_location_id: UUID
    item_id: UUID
    qty: int = Field(..., ge=1)


class UnloadCargoIn(BaseModel):
    """Unload cargo from aircraft"""
    to_location_id: UUID
    item_id: UUID
    qty: int = Field(..., ge=1)


class AircraftLocationUpdateIn(BaseModel):
    """Update aircraft location after flight"""
    airport_ident: str = Field(..., min_length=2, max_length=8)
