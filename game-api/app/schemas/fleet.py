from decimal import Decimal
from pydantic import BaseModel, Field
from uuid import UUID
from typing import Optional
from datetime import datetime


# =====================================================
# Aircraft Catalog Schemas
# =====================================================

class AircraftCatalogOut(BaseModel):
    """Aircraft type in the catalog"""
    id: UUID
    name: str
    icao_type: str
    manufacturer: str
    category: str
    cargo_capacity_kg: int
    cargo_capacity_m3: Optional[float] = None
    max_range_nm: Optional[int] = None
    cruise_speed_kts: Optional[int] = None
    base_price: Decimal
    operating_cost_per_hour: Optional[Decimal] = None
    min_runway_length_m: Optional[int] = None
    required_license: Optional[str] = None

    class Config:
        from_attributes = True


# =====================================================
# Aircraft CRUD Schemas
# =====================================================

class AircraftCreateIn(BaseModel):
    """Create an aircraft from catalog or manually"""
    catalog_id: Optional[UUID] = None  # If purchasing from catalog

    # Or manual creation
    registration: str = Field(..., min_length=2, max_length=10)
    name: Optional[str] = None
    aircraft_type: Optional[str] = None  # Required if no catalog_id
    icao_type: Optional[str] = None
    cargo_capacity_kg: Optional[int] = None
    current_airport: Optional[str] = None  # ICAO code


class AircraftUpdateIn(BaseModel):
    """Update aircraft details"""
    name: Optional[str] = None
    current_airport: Optional[str] = None
    status: Optional[str] = None


# =====================================================
# Aircraft Output Schemas
# =====================================================

class AircraftOut(BaseModel):
    id: UUID
    company_id: Optional[UUID] = None
    user_id: Optional[UUID] = None
    owner_type: str = "company"
    registration: Optional[str] = None
    name: Optional[str] = None
    aircraft_type: str
    icao_type: Optional[str] = None
    status: str
    condition: float
    hours: float
    cargo_capacity_kg: int = 500
    current_airport_ident: Optional[str] = None
    purchase_price: Optional[Decimal] = None
    is_active: bool = True
    created_at: datetime

    class Config:
        from_attributes = True


class AircraftDetailOut(AircraftOut):
    """Detailed aircraft info with cargo summary"""
    current_cargo_kg: Decimal = Decimal("0")
    current_cargo_items: int = 0
    cargo_utilization_percent: float = 0.0


# =====================================================
# Fleet Stats Schema
# =====================================================

class FleetStatsOut(BaseModel):
    """Fleet summary statistics"""
    total_aircraft: int
    available_count: int  # stored or parked
    in_flight_count: int
    maintenance_count: int
    total_cargo_capacity_kg: int
    categories: dict[str, int]  # {"turboprop": 3, "jet_medium": 1}


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


# =====================================================
# V0.8 Mission System - Fleet Available
# =====================================================

class FleetAvailableOut(BaseModel):
    """Aircraft available at airport for mission (V0.8 specs)."""
    id: UUID
    registration: Optional[str] = None
    aircraft_type: str
    aircraft_model: Optional[str] = None  # ICAO type code (C185, C208, etc.)
    current_icao: Optional[str] = None
    cargo_capacity_kg: int
    status: str

    class Config:
        from_attributes = True
