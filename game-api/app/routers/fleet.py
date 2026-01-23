from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from uuid import UUID
from typing import List

from app.deps import get_db, get_current_user
from app.models.company_member import CompanyMember
from app.models.company_permission import CompanyPermission
from app.models.company_aircraft import CompanyAircraft
from app.models.inventory_location import InventoryLocation
from app.models.inventory_item import InventoryItem
from app.models.inventory_audit import InventoryAudit
from app.models.item import Item
from app.schemas.fleet import (
    AircraftOut,
    AircraftCargoOut,
    CargoItemOut,
    LoadCargoIn,
    UnloadCargoIn,
    AircraftLocationUpdateIn,
)

router = APIRouter(prefix="/fleet", tags=["fleet"])


def get_user_company_id(db: Session, user_id) -> UUID:
    cm = db.query(CompanyMember).filter(CompanyMember.user_id == user_id).first()
    if not cm:
        raise HTTPException(status_code=404, detail="No company")
    return cm.company_id


def _can_use_aircraft(db: Session, user_id: UUID, aircraft: CompanyAircraft) -> bool:
    """Check if user can use an aircraft"""
    # Player-owned aircraft
    if aircraft.owner_type == "player":
        return aircraft.user_id == user_id

    # Company-owned aircraft
    if aircraft.owner_type == "company" and aircraft.company_id:
        # Check membership
        membership = db.query(CompanyMember).filter(
            CompanyMember.user_id == user_id,
            CompanyMember.company_id == aircraft.company_id,
        ).first()
        if not membership:
            return False

        # Check permissions
        perms = db.query(CompanyPermission).filter(
            CompanyPermission.user_id == user_id,
            CompanyPermission.company_id == aircraft.company_id,
        ).first()

        if perms and (perms.is_founder or perms.can_use_aircraft):
            return True

        # If no permissions record, allow basic access for members
        return True

    return False


def _get_aircraft_cargo_location(db: Session, aircraft_id: UUID) -> InventoryLocation | None:
    """Get or create cargo location for an aircraft"""
    loc = db.query(InventoryLocation).filter(
        InventoryLocation.aircraft_id == aircraft_id,
        InventoryLocation.kind == "aircraft",
    ).first()

    if not loc:
        # Get aircraft info to create location
        aircraft = db.query(CompanyAircraft).filter(CompanyAircraft.id == aircraft_id).first()
        if not aircraft:
            return None

        loc = InventoryLocation(
            kind="aircraft",
            airport_ident=aircraft.current_airport_ident or "",
            name=f"{aircraft.aircraft_type} Cargo",
            owner_type=aircraft.owner_type,
            owner_id=aircraft.company_id or aircraft.user_id,
            company_id=aircraft.company_id,
            aircraft_id=aircraft_id,
        )
        db.add(loc)
        db.flush()

    return loc


@router.get("", response_model=List[AircraftOut])
def list_my_fleet(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """List all aircraft user has access to (company + personal)"""
    # Get company aircraft
    company_ids = [
        cm.company_id for cm in
        db.query(CompanyMember).filter(CompanyMember.user_id == user.id).all()
    ]

    company_aircraft = []
    if company_ids:
        company_aircraft = (
            db.query(CompanyAircraft)
            .filter(CompanyAircraft.company_id.in_(company_ids))
            .all()
        )

    # Get personal aircraft
    personal_aircraft = (
        db.query(CompanyAircraft)
        .filter(
            CompanyAircraft.owner_type == "player",
            CompanyAircraft.user_id == user.id,
        )
        .all()
    )

    return company_aircraft + personal_aircraft


@router.get("/{aircraft_id}", response_model=AircraftOut)
def get_aircraft(
    aircraft_id: UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    row = db.query(CompanyAircraft).filter(CompanyAircraft.id == aircraft_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Aircraft not found")

    if not _can_use_aircraft(db, user.id, row):
        raise HTTPException(status_code=403, detail="Forbidden")

    return row


# ═══════════════════════════════════════════════════════════
# V0.7 AIRCRAFT CARGO ENDPOINTS
# ═══════════════════════════════════════════════════════════

@router.get("/{aircraft_id}/cargo", response_model=AircraftCargoOut)
def get_aircraft_cargo(
    aircraft_id: UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """V0.7 - Get cargo contents of an aircraft"""
    aircraft = db.query(CompanyAircraft).filter(CompanyAircraft.id == aircraft_id).first()
    if not aircraft:
        raise HTTPException(status_code=404, detail="Aircraft not found")

    if not _can_use_aircraft(db, user.id, aircraft):
        raise HTTPException(status_code=403, detail="Forbidden")

    # Get cargo location
    cargo_loc = _get_aircraft_cargo_location(db, aircraft_id)
    db.commit()

    # Get items
    items = []
    current_weight = Decimal("0")

    if cargo_loc:
        items_query = (
            db.query(InventoryItem, Item)
            .join(Item, Item.id == InventoryItem.item_id)
            .filter(InventoryItem.location_id == cargo_loc.id, InventoryItem.qty > 0)
            .all()
        )

        for inv_item, item in items_query:
            total_weight = item.weight_kg * inv_item.qty
            current_weight += total_weight
            items.append(CargoItemOut(
                item_id=item.id,
                item_name=item.name,
                tier=item.tier,
                qty=inv_item.qty,
                weight_kg=item.weight_kg,
                total_weight_kg=total_weight,
                base_value=item.base_value,
                total_value=item.base_value * inv_item.qty,
            ))

    return AircraftCargoOut(
        aircraft_id=aircraft.id,
        aircraft_type=aircraft.aircraft_type,
        status=aircraft.status,
        current_airport_ident=aircraft.current_airport_ident,
        cargo_capacity_kg=aircraft.cargo_capacity_kg,
        current_cargo_kg=current_weight,
        available_capacity_kg=Decimal(aircraft.cargo_capacity_kg) - current_weight,
        items=items,
    )


@router.post("/{aircraft_id}/load", response_model=AircraftCargoOut)
def load_cargo(
    aircraft_id: UUID,
    payload: LoadCargoIn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """V0.7 - Load items into aircraft cargo"""
    aircraft = db.query(CompanyAircraft).filter(CompanyAircraft.id == aircraft_id).first()
    if not aircraft:
        raise HTTPException(status_code=404, detail="Aircraft not found")

    if not _can_use_aircraft(db, user.id, aircraft):
        raise HTTPException(status_code=403, detail="No permission to use this aircraft")

    # Check aircraft is at an airport
    if not aircraft.current_airport_ident:
        raise HTTPException(status_code=400, detail="Aircraft must be at an airport to load cargo")

    # Get source location
    from_loc = db.query(InventoryLocation).filter(
        InventoryLocation.id == payload.from_location_id
    ).first()
    if not from_loc:
        raise HTTPException(status_code=404, detail="Source location not found")

    # Check same airport
    if from_loc.airport_ident != aircraft.current_airport_ident:
        raise HTTPException(
            status_code=400,
            detail=f"Source location ({from_loc.airport_ident}) must be at same airport as aircraft ({aircraft.current_airport_ident})"
        )

    # Get item
    item = db.query(Item).filter(Item.id == payload.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    # Check source stock
    src_inv = db.query(InventoryItem).filter(
        InventoryItem.location_id == from_loc.id,
        InventoryItem.item_id == payload.item_id,
    ).first()

    if not src_inv or src_inv.qty < payload.qty:
        available = src_inv.qty if src_inv else 0
        raise HTTPException(status_code=400, detail=f"Insufficient stock ({available} available)")

    # Get cargo location
    cargo_loc = _get_aircraft_cargo_location(db, aircraft_id)

    # Check cargo capacity
    current_weight_result = db.execute(text("""
        SELECT COALESCE(SUM(ii.qty * i.weight_kg), 0) as total_weight
        FROM game.inventory_items ii
        JOIN game.items i ON i.id = ii.item_id
        WHERE ii.location_id = :loc_id
    """), {"loc_id": str(cargo_loc.id)}).fetchone()

    current_weight = Decimal(str(current_weight_result[0])) if current_weight_result else Decimal("0")
    added_weight = item.weight_kg * payload.qty

    if current_weight + added_weight > aircraft.cargo_capacity_kg:
        raise HTTPException(
            status_code=400,
            detail=f"Cargo capacity exceeded ({aircraft.cargo_capacity_kg}kg max, {current_weight}kg current, {added_weight}kg to add)"
        )

    try:
        # Transfer items
        src_inv.qty -= payload.qty

        dst_inv = db.query(InventoryItem).filter(
            InventoryItem.location_id == cargo_loc.id,
            InventoryItem.item_id == payload.item_id,
        ).first()

        if not dst_inv:
            dst_inv = InventoryItem(location_id=cargo_loc.id, item_id=payload.item_id, qty=0)
            db.add(dst_inv)
            db.flush()

        dst_inv.qty += payload.qty

        # Audit
        db.add(InventoryAudit(
            location_id=from_loc.id,
            item_id=payload.item_id,
            quantity_delta=-payload.qty,
            action="load_aircraft",
            user_id=user.id,
            notes=f"Loaded into {aircraft.aircraft_type}",
        ))
        db.add(InventoryAudit(
            location_id=cargo_loc.id,
            item_id=payload.item_id,
            quantity_delta=payload.qty,
            action="cargo_loaded",
            user_id=user.id,
            notes=f"Loaded from {from_loc.name}",
        ))

        if src_inv.qty == 0:
            db.delete(src_inv)

        db.commit()

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

    return get_aircraft_cargo(aircraft_id, db, user)


@router.post("/{aircraft_id}/unload", response_model=AircraftCargoOut)
def unload_cargo(
    aircraft_id: UUID,
    payload: UnloadCargoIn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """V0.7 - Unload items from aircraft cargo"""
    aircraft = db.query(CompanyAircraft).filter(CompanyAircraft.id == aircraft_id).first()
    if not aircraft:
        raise HTTPException(status_code=404, detail="Aircraft not found")

    if not _can_use_aircraft(db, user.id, aircraft):
        raise HTTPException(status_code=403, detail="No permission to use this aircraft")

    if not aircraft.current_airport_ident:
        raise HTTPException(status_code=400, detail="Aircraft must be at an airport to unload cargo")

    # Get destination location
    to_loc = db.query(InventoryLocation).filter(
        InventoryLocation.id == payload.to_location_id
    ).first()
    if not to_loc:
        raise HTTPException(status_code=404, detail="Destination location not found")

    # Check same airport
    if to_loc.airport_ident != aircraft.current_airport_ident:
        raise HTTPException(
            status_code=400,
            detail=f"Destination ({to_loc.airport_ident}) must be at same airport as aircraft ({aircraft.current_airport_ident})"
        )

    # Get cargo location
    cargo_loc = _get_aircraft_cargo_location(db, aircraft_id)

    # Get item
    item = db.query(Item).filter(Item.id == payload.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    # Check cargo stock
    src_inv = db.query(InventoryItem).filter(
        InventoryItem.location_id == cargo_loc.id,
        InventoryItem.item_id == payload.item_id,
    ).first()

    if not src_inv or src_inv.qty < payload.qty:
        available = src_inv.qty if src_inv else 0
        raise HTTPException(status_code=400, detail=f"Insufficient cargo ({available} available)")

    try:
        # Transfer items
        src_inv.qty -= payload.qty

        dst_inv = db.query(InventoryItem).filter(
            InventoryItem.location_id == to_loc.id,
            InventoryItem.item_id == payload.item_id,
        ).first()

        if not dst_inv:
            dst_inv = InventoryItem(location_id=to_loc.id, item_id=payload.item_id, qty=0)
            db.add(dst_inv)
            db.flush()

        dst_inv.qty += payload.qty

        # Audit
        db.add(InventoryAudit(
            location_id=cargo_loc.id,
            item_id=payload.item_id,
            quantity_delta=-payload.qty,
            action="cargo_unloaded",
            user_id=user.id,
            notes=f"Unloaded to {to_loc.name}",
        ))
        db.add(InventoryAudit(
            location_id=to_loc.id,
            item_id=payload.item_id,
            quantity_delta=payload.qty,
            action="unload_aircraft",
            user_id=user.id,
            notes=f"Unloaded from {aircraft.aircraft_type}",
        ))

        if src_inv.qty == 0:
            db.delete(src_inv)

        db.commit()

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

    return get_aircraft_cargo(aircraft_id, db, user)


@router.patch("/{aircraft_id}/location")
def update_aircraft_location(
    aircraft_id: UUID,
    payload: AircraftLocationUpdateIn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """V0.7 - Update aircraft location after flight"""
    aircraft = db.query(CompanyAircraft).filter(CompanyAircraft.id == aircraft_id).first()
    if not aircraft:
        raise HTTPException(status_code=404, detail="Aircraft not found")

    if not _can_use_aircraft(db, user.id, aircraft):
        raise HTTPException(status_code=403, detail="No permission to use this aircraft")

    new_ident = payload.airport_ident.strip().upper()

    # Update aircraft location
    aircraft.current_airport_ident = new_ident
    aircraft.status = "parked"

    # Update cargo location
    cargo_loc = db.query(InventoryLocation).filter(
        InventoryLocation.aircraft_id == aircraft_id,
        InventoryLocation.kind == "aircraft",
    ).first()

    if cargo_loc:
        cargo_loc.airport_ident = new_ident

    db.commit()

    return {
        "success": True,
        "aircraft_id": str(aircraft_id),
        "new_location": new_ident,
    }
