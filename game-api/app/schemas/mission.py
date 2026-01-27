"""
V0.8 Mission System - Pydantic Schemas
"""
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Any
import uuid


# =====================================================
# CARGO ITEMS
# =====================================================

class MissionCargoItemIn(BaseModel):
    """Cargo item to load on mission."""
    inventory_item_id: uuid.UUID
    quantity: int = Field(..., ge=1)


class MissionCargoItemOut(BaseModel):
    """Cargo item in mission snapshot."""
    item_id: uuid.UUID
    item_name: str
    item_icon: str | None = None
    quantity: int
    weight_kg: float


# =====================================================
# MISSION CREATE
# =====================================================

class MissionCreateIn(BaseModel):
    """Create a new mission (status: pending).
    Cargo is automatically captured from aircraft inventory (loaded via fleet/load endpoint).
    """
    origin_icao: str = Field(..., min_length=3, max_length=4)
    destination_icao: str = Field(..., min_length=3, max_length=4)
    aircraft_id: uuid.UUID


# =====================================================
# MISSION START
# =====================================================

class MissionStartIn(BaseModel):
    """Start a mission (optional - can be empty)."""
    pass


# =====================================================
# MISSION COMPLETE
# =====================================================

class MissionCompleteIn(BaseModel):
    """Complete a mission with flight data."""
    landing_fpm: int = Field(..., description="Landing vertical speed (negative)")
    max_gforce: float = Field(..., ge=0, description="Maximum G-force during flight")
    final_icao: str = Field(..., min_length=3, max_length=4, description="Actual landing airport")
    flight_time_minutes: int = Field(..., ge=0, description="Total flight duration")
    fuel_used_percent: float = Field(..., ge=0, le=100, description="Fuel used as percentage")

    # Anti-cheat payload verification
    payload_start_lbs: float = Field(0, ge=0, description="Payload weight at mission start (lbs)")
    payload_verified_lbs: float = Field(0, ge=0, description="Payload verified at 500ft (lbs)")
    cheated: bool = Field(False, description="Client-detected payload tampering")


# =====================================================
# MISSION FAIL
# =====================================================

class MissionFailIn(BaseModel):
    """Fail/cancel a mission."""
    reason: str = Field(..., pattern="^(crash|timeout|cancelled)$")


# =====================================================
# MISSION OUTPUT
# =====================================================

class MissionOut(BaseModel):
    """Full mission output."""
    id: uuid.UUID
    company_id: uuid.UUID
    pilot_user_id: uuid.UUID
    aircraft_id: uuid.UUID | None

    # Route
    origin_icao: str
    destination_icao: str
    distance_nm: float | None

    # Status
    status: str

    # Cargo
    cargo_snapshot: dict[str, Any] | None = None
    pax_count: int
    cargo_weight_kg: float

    # Timing
    started_at: datetime | None
    completed_at: datetime | None

    # Flight data
    landing_fpm: int | None
    max_gforce: float | None
    final_icao: str | None
    flight_time_minutes: int | None
    fuel_used_percent: float | None

    # Scoring
    score_landing: int | None
    score_gforce: int | None
    score_destination: int | None
    score_time: int | None
    score_fuel: int | None
    score_total: int | None
    grade: str | None
    xp_earned: int

    # Failure
    failure_reason: str | None

    # Anti-cheat
    payload_start_lbs: float | None = None
    payload_verified_lbs: float | None = None
    cheated: bool = False
    cheat_penalty_percent: int = 0

    # Timestamps
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MissionListOut(BaseModel):
    """Simplified mission for lists."""
    id: uuid.UUID
    origin_icao: str
    destination_icao: str
    distance_nm: float | None
    status: str
    grade: str | None
    xp_earned: int
    cargo_weight_kg: float
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime

    class Config:
        from_attributes = True


class MissionScoreOut(BaseModel):
    """Mission scoring breakdown."""
    score_landing: int
    score_gforce: int
    score_destination: int
    score_time: int
    score_fuel: int
    score_total: int
    grade: str
    xp_earned: int


# =====================================================
# ACTIVE MISSION
# =====================================================

class ActiveMissionOut(BaseModel):
    """Active mission with additional details for EFB display."""
    id: uuid.UUID
    origin_icao: str
    origin_name: str | None = None
    destination_icao: str
    destination_name: str | None = None
    distance_nm: float | None
    status: str
    cargo_weight_kg: float
    pax_count: int
    started_at: datetime | None
    aircraft_registration: str | None = None
    aircraft_type: str | None = None

    class Config:
        from_attributes = True


# =====================================================
# MISSION HISTORY
# =====================================================

class MissionHistoryOut(BaseModel):
    """Mission history entry."""
    id: uuid.UUID
    origin_icao: str
    destination_icao: str
    distance_nm: float | None
    status: str
    grade: str | None
    xp_earned: int
    score_total: int | None
    cargo_weight_kg: float
    flight_time_minutes: int | None
    completed_at: datetime | None
    created_at: datetime

    class Config:
        from_attributes = True


class MissionHistoryListOut(BaseModel):
    """Paginated mission history."""
    missions: list[MissionHistoryOut]
    total: int
    page: int
    page_size: int


# =====================================================
# AVAILABLE AIRCRAFT
# =====================================================

class AvailableAircraftOut(BaseModel):
    """Aircraft available at current airport for mission."""
    id: uuid.UUID
    registration: str | None
    name: str | None
    aircraft_type: str
    icao_type: str | None
    cargo_capacity_kg: int
    current_airport_ident: str | None
    status: str

    class Config:
        from_attributes = True
