"""
V0.8 Mission System - Missions Router
"""
import uuid
from datetime import datetime, timedelta
from math import radians, sin, cos, sqrt, atan2

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.deps import get_db, get_current_user
from app.models.user import User
from app.models.company import Company
from app.models.company_member import CompanyMember
from app.models.company_aircraft import CompanyAircraft
from app.models.mission import Mission
from app.models.airport import Airport
from app.models.inventory_location import InventoryLocation
from app.models.inventory_item import InventoryItem
from app.models.item import Item
from app.models.company_inventory import CompanyInventory
from app.schemas.mission import (
    MissionCreateIn,
    MissionStartIn,
    MissionCompleteIn,
    MissionFailIn,
    MissionOut,
    MissionListOut,
    ActiveMissionOut,
    MissionHistoryOut,
    MissionHistoryListOut,
    AvailableAircraftOut,
)

router = APIRouter(prefix="/missions", tags=["missions"])


# =====================================================
# HELPER FUNCTIONS
# =====================================================

def _get_my_company(db: Session, user_id: uuid.UUID):
    """Get current user's company."""
    cm = db.query(CompanyMember).filter(CompanyMember.user_id == user_id).first()
    if not cm:
        return None, None
    c = db.query(Company).filter(Company.id == cm.company_id).first()
    return c, cm


def _haversine_distance_nm(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two coordinates in nautical miles."""
    R = 3440.065  # Earth radius in nautical miles

    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))

    return R * c


def _get_airport_coords(db: Session, icao: str) -> tuple[float, float] | None:
    """Get airport coordinates."""
    airport = db.query(Airport).filter(Airport.ident == icao).first()
    if airport and airport.latitude_deg and airport.longitude_deg:
        return float(airport.latitude_deg), float(airport.longitude_deg)
    return None


def _calculate_expected_flight_time(distance_nm: float, cruise_speed_kts: int = 150) -> int:
    """Calculate expected flight time in minutes."""
    if cruise_speed_kts <= 0:
        cruise_speed_kts = 150
    return int((distance_nm / cruise_speed_kts) * 60)


# =====================================================
# AVAILABLE AIRCRAFT
# =====================================================

@router.get("/available-aircraft", response_model=list[AvailableAircraftOut])
def get_available_aircraft(
    icao: str = Query(..., min_length=3, max_length=4, description="Airport ICAO code"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Get aircraft available at a specific airport for mission.
    Returns company aircraft positioned at this airport.
    """
    company, _ = _get_my_company(db, user.id)
    if not company:
        raise HTTPException(status_code=404, detail="No company found")

    icao = icao.upper()

    # Get aircraft at this airport
    aircraft_list = db.query(CompanyAircraft).filter(
        CompanyAircraft.company_id == company.id,
        CompanyAircraft.is_active == True,
        CompanyAircraft.current_airport_ident == icao,
        CompanyAircraft.status.in_(["stored", "parked"]),  # Not in flight or maintenance
    ).all()

    return aircraft_list


# =====================================================
# MISSION CRUD
# =====================================================

@router.post("", response_model=MissionOut)
def create_mission(
    payload: MissionCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Create a new mission (status: pending).
    Origin is deduced from aircraft's current location.
    """
    company, _ = _get_my_company(db, user.id)
    if not company:
        raise HTTPException(status_code=404, detail="No company found")

    # Check no active mission for this user
    active = db.query(Mission).filter(
        Mission.pilot_user_id == user.id,
        Mission.status.in_(["pending", "in_progress"]),
    ).first()
    if active:
        raise HTTPException(
            status_code=400,
            detail="You already have an active mission. Complete or cancel it first."
        )

    # Get aircraft
    aircraft = db.query(CompanyAircraft).filter(
        CompanyAircraft.id == payload.aircraft_id,
        CompanyAircraft.is_active == True,
    ).first()
    if not aircraft:
        raise HTTPException(status_code=404, detail="Aircraft not found")

    # Check aircraft belongs to company
    if aircraft.company_id != company.id:
        raise HTTPException(status_code=403, detail="Aircraft does not belong to your company")

    # Check aircraft status
    if aircraft.status not in ["stored", "parked"]:
        raise HTTPException(status_code=400, detail=f"Aircraft is {aircraft.status}, not available")

    # Verify origin matches aircraft location (anti-cheat)
    origin_icao = payload.origin_icao.upper()
    if not aircraft.current_airport_ident:
        raise HTTPException(status_code=400, detail="Aircraft has no current location")

    if aircraft.current_airport_ident.upper() != origin_icao:
        raise HTTPException(
            status_code=400,
            detail=f"Aircraft is at {aircraft.current_airport_ident}, not {origin_icao}"
        )

    destination_icao = payload.destination_icao.upper()

    # Validate destination exists
    dest_airport = db.query(Airport).filter(Airport.ident == destination_icao).first()
    if not dest_airport:
        raise HTTPException(status_code=404, detail=f"Destination airport {destination_icao} not found")

    # Calculate distance
    origin_coords = _get_airport_coords(db, origin_icao)
    dest_coords = _get_airport_coords(db, destination_icao)
    distance_nm = None
    if origin_coords and dest_coords:
        distance_nm = _haversine_distance_nm(
            origin_coords[0], origin_coords[1],
            dest_coords[0], dest_coords[1]
        )

    # Get cargo from aircraft's inventory location (already loaded via fleet/load)
    cargo_snapshot = {"items": []}
    total_weight = 0.0
    pax_count = 0

    # Find aircraft inventory location
    aircraft_loc = db.query(InventoryLocation).filter(
        InventoryLocation.aircraft_id == aircraft.id,
        InventoryLocation.kind == "aircraft",
    ).first()

    if aircraft_loc:
        # Get all items in aircraft cargo
        cargo_items = (
            db.query(InventoryItem, Item)
            .join(Item, Item.id == InventoryItem.item_id)
            .filter(
                InventoryItem.location_id == aircraft_loc.id,
                InventoryItem.qty > 0,
            )
            .all()
        )

        for inv_item, item in cargo_items:
            item_weight = float(item.weight_kg) * inv_item.qty
            total_weight += item_weight

            # Check if it's a passenger item
            if "pax" in (item.tags or []):
                pax_count += inv_item.qty

            cargo_snapshot["items"].append({
                "item_id": str(item.id),
                "item_name": item.name,
                "item_icon": item.icon,
                "quantity": inv_item.qty,
                "weight_kg": item_weight,
            })

    # Check weight capacity
    if total_weight > aircraft.cargo_capacity_kg:
        raise HTTPException(
            status_code=400,
            detail=f"Cargo too heavy ({total_weight:.1f}kg) for aircraft capacity ({aircraft.cargo_capacity_kg}kg)"
        )

    # Create mission (auto-start: status = in_progress)
    mission = Mission(
        company_id=company.id,
        pilot_user_id=user.id,
        aircraft_id=aircraft.id,
        origin_icao=origin_icao,
        destination_icao=destination_icao,
        distance_nm=distance_nm,
        status="in_progress",  # Auto-start
        cargo_snapshot=cargo_snapshot,
        pax_count=pax_count,
        cargo_weight_kg=total_weight,
        started_at=datetime.utcnow(),  # Record start time
    )

    db.add(mission)

    # Set aircraft to in_flight
    aircraft.status = "in_flight"

    db.commit()
    db.refresh(mission)

    return mission


@router.post("/{mission_id}/start", response_model=MissionOut)
def start_mission(
    mission_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Start a pending mission (pending -> in_progress).
    Locks cargo items and sets aircraft to in_flight.
    """
    mission = db.query(Mission).filter(
        Mission.id == mission_id,
        Mission.pilot_user_id == user.id,
    ).first()

    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")

    if mission.status != "pending":
        raise HTTPException(status_code=400, detail=f"Mission is {mission.status}, not pending")

    company, _ = _get_my_company(db, user.id)
    if not company or mission.company_id != company.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Lock cargo items (deduct from inventory)
    if mission.cargo_snapshot and mission.cargo_snapshot.get("items"):
        for cargo in mission.cargo_snapshot["items"]:
            inv_item = db.query(CompanyInventory).filter(
                CompanyInventory.id == uuid.UUID(cargo["inventory_item_id"]),
                CompanyInventory.company_id == company.id,
            ).first()

            if inv_item:
                if inv_item.quantity < cargo["quantity"]:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Insufficient stock for {cargo['item_name']} (cargo may have been modified)"
                    )
                inv_item.quantity -= cargo["quantity"]

    # Update aircraft status
    if mission.aircraft_id:
        aircraft = db.query(CompanyAircraft).filter(
            CompanyAircraft.id == mission.aircraft_id
        ).first()
        if aircraft:
            aircraft.status = "in_flight"

    # Update mission
    mission.status = "in_progress"
    mission.started_at = datetime.utcnow()

    db.commit()
    db.refresh(mission)

    return mission


@router.post("/{mission_id}/complete", response_model=MissionOut)
def complete_mission(
    mission_id: uuid.UUID,
    payload: MissionCompleteIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Complete a mission with flight data.
    Calculates score, transfers cargo, updates aircraft location.
    """
    mission = db.query(Mission).filter(
        Mission.id == mission_id,
        Mission.pilot_user_id == user.id,
    ).first()

    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")

    if mission.status != "in_progress":
        raise HTTPException(status_code=400, detail=f"Mission is {mission.status}, not in_progress")

    company, _ = _get_my_company(db, user.id)
    if not company or mission.company_id != company.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    final_icao = payload.final_icao.upper()

    # Store flight data
    mission.landing_fpm = payload.landing_fpm
    mission.max_gforce = payload.max_gforce
    mission.final_icao = final_icao
    mission.flight_time_minutes = payload.flight_time_minutes
    mission.fuel_used_percent = payload.fuel_used_percent

    # Store anti-cheat payload data
    mission.payload_start_lbs = payload.payload_start_lbs
    mission.payload_verified_lbs = payload.payload_verified_lbs

    # Detect cheating (server-side verification)
    cheated = payload.cheated or Mission.detect_cheating(
        payload.payload_start_lbs,
        payload.payload_verified_lbs
    )
    mission.cheated = cheated
    mission.cheat_penalty_percent = 50 if cheated else 0

    # Calculate scores
    mission.score_landing = Mission.calculate_landing_score(payload.landing_fpm)
    mission.score_gforce = Mission.calculate_gforce_score(payload.max_gforce)
    mission.score_destination = Mission.calculate_destination_score(final_icao, mission.destination_icao)

    # Time score (based on expected flight time)
    expected_time = _calculate_expected_flight_time(mission.distance_nm or 0)
    mission.score_time = Mission.calculate_time_score(payload.flight_time_minutes, expected_time)

    # Fuel score
    fuel_remaining = 100 - payload.fuel_used_percent
    mission.score_fuel = Mission.calculate_fuel_score(fuel_remaining)

    # Total score and grade
    mission.score_total = (
        mission.score_landing +
        mission.score_gforce +
        mission.score_destination +
        mission.score_time +
        mission.score_fuel
    )
    mission.grade = Mission.calculate_grade(mission.score_total)

    # Calculate XP (with cheat penalty if detected)
    mission.xp_earned = Mission.calculate_xp(
        mission.distance_nm or 0,
        mission.grade,
        mission.cargo_weight_kg,
        cheated=cheated
    )

    # Transfer cargo to destination
    if mission.cargo_snapshot and mission.cargo_snapshot.get("items"):
        for cargo in mission.cargo_snapshot["items"]:
            # Find or create inventory at destination
            dest_inv = db.query(CompanyInventory).filter(
                CompanyInventory.company_id == company.id,
                CompanyInventory.item_id == uuid.UUID(cargo["item_id"]),
                CompanyInventory.airport_ident == final_icao,
            ).first()

            if dest_inv:
                dest_inv.quantity += cargo["quantity"]
            else:
                dest_inv = CompanyInventory(
                    company_id=company.id,
                    item_id=uuid.UUID(cargo["item_id"]),
                    airport_ident=final_icao,
                    quantity=cargo["quantity"],
                )
                db.add(dest_inv)

    # Update aircraft location
    if mission.aircraft_id:
        aircraft = db.query(CompanyAircraft).filter(
            CompanyAircraft.id == mission.aircraft_id
        ).first()
        if aircraft:
            aircraft.current_airport_ident = final_icao
            aircraft.status = "parked"

    # Update user XP (if user has xp field)
    # user.xp = (user.xp or 0) + mission.xp_earned

    # Complete mission
    mission.status = "completed"
    mission.completed_at = datetime.utcnow()

    db.commit()
    db.refresh(mission)

    return mission


@router.post("/{mission_id}/fail", response_model=MissionOut)
def fail_mission(
    mission_id: uuid.UUID,
    payload: MissionFailIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Fail or cancel a mission.
    Returns cargo to origin airport.
    """
    mission = db.query(Mission).filter(
        Mission.id == mission_id,
        Mission.pilot_user_id == user.id,
    ).first()

    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")

    if mission.status not in ["pending", "in_progress"]:
        raise HTTPException(status_code=400, detail=f"Mission is {mission.status}, cannot fail")

    company, _ = _get_my_company(db, user.id)
    if not company or mission.company_id != company.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Return cargo to origin (only if in_progress - cargo was already deducted)
    if mission.status == "in_progress" and mission.cargo_snapshot and mission.cargo_snapshot.get("items"):
        for cargo in mission.cargo_snapshot["items"]:
            # Find or create inventory at origin
            origin_inv = db.query(CompanyInventory).filter(
                CompanyInventory.company_id == company.id,
                CompanyInventory.item_id == uuid.UUID(cargo["item_id"]),
                CompanyInventory.airport_ident == mission.origin_icao,
            ).first()

            if origin_inv:
                origin_inv.quantity += cargo["quantity"]
            else:
                origin_inv = CompanyInventory(
                    company_id=company.id,
                    item_id=uuid.UUID(cargo["item_id"]),
                    airport_ident=mission.origin_icao,
                    quantity=cargo["quantity"],
                )
                db.add(origin_inv)

    # Update aircraft status (back to parked at origin)
    if mission.aircraft_id:
        aircraft = db.query(CompanyAircraft).filter(
            CompanyAircraft.id == mission.aircraft_id
        ).first()
        if aircraft:
            aircraft.status = "parked"
            # Keep at origin (don't update location)

    # Update mission
    mission.status = "failed"
    mission.failure_reason = payload.reason
    mission.completed_at = datetime.utcnow()
    mission.xp_earned = 0

    db.commit()
    db.refresh(mission)

    return mission


# =====================================================
# MISSION QUERIES
# =====================================================

@router.get("/active", response_model=ActiveMissionOut | None)
def get_active_mission(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get user's active mission (pending or in_progress)."""
    mission = db.query(Mission).filter(
        Mission.pilot_user_id == user.id,
        Mission.status.in_(["pending", "in_progress"]),
    ).first()

    if not mission:
        return None

    # Get airport names
    origin = db.query(Airport).filter(Airport.ident == mission.origin_icao).first()
    dest = db.query(Airport).filter(Airport.ident == mission.destination_icao).first()
    aircraft = None
    if mission.aircraft_id:
        aircraft = db.query(CompanyAircraft).filter(
            CompanyAircraft.id == mission.aircraft_id
        ).first()

    return ActiveMissionOut(
        id=mission.id,
        origin_icao=mission.origin_icao,
        origin_name=origin.name if origin else None,
        destination_icao=mission.destination_icao,
        destination_name=dest.name if dest else None,
        distance_nm=mission.distance_nm,
        status=mission.status,
        cargo_weight_kg=mission.cargo_weight_kg,
        pax_count=mission.pax_count,
        started_at=mission.started_at,
        aircraft_registration=aircraft.registration if aircraft else None,
        aircraft_type=aircraft.aircraft_type if aircraft else None,
    )


@router.get("/history", response_model=MissionHistoryListOut)
def get_mission_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get user's mission history (completed and failed)."""
    query = db.query(Mission).filter(
        Mission.pilot_user_id == user.id,
        Mission.status.in_(["completed", "failed"]),
    ).order_by(Mission.completed_at.desc())

    total = query.count()
    missions = query.offset((page - 1) * page_size).limit(page_size).all()

    return MissionHistoryListOut(
        missions=[MissionHistoryOut.model_validate(m) for m in missions],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{mission_id}", response_model=MissionOut)
def get_mission(
    mission_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get mission details."""
    mission = db.query(Mission).filter(
        Mission.id == mission_id,
        Mission.pilot_user_id == user.id,
    ).first()

    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")

    return mission
