from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text, func
from uuid import UUID
from typing import List, Optional

from app.deps import get_db, get_current_user
from app.models.company_member import CompanyMember
from app.models.company_permission import CompanyPermission
from app.models.company import Company
from app.models.company_aircraft import CompanyAircraft, AircraftCatalog
from app.models.inventory_location import InventoryLocation
from app.models.inventory_item import InventoryItem
from app.models.inventory_audit import InventoryAudit
from app.models.item import Item
from app.schemas.fleet import (
    AircraftOut,
    AircraftDetailOut,
    AircraftCargoOut,
    CargoItemOut,
    LoadCargoIn,
    UnloadCargoIn,
    AircraftLocationUpdateIn,
    AircraftCatalogOut,
    AircraftCreateIn,
    AircraftUpdateIn,
    FleetStatsOut,
)

router = APIRouter(prefix="/fleet", tags=["fleet"])


def _get_my_company(db: Session, user_id) -> Company | None:
    """Get user's company"""
    cm = db.query(CompanyMember).filter(CompanyMember.user_id == user_id).first()
    if not cm:
        return None
    return db.query(Company).filter(Company.id == cm.company_id).first()


def _guess_category(type_str: str) -> str:
    """Guess aircraft category from type string"""
    if not type_str:
        return "unknown"
    t = type_str.upper()
    if any(x in t for x in ["747", "777", "A380", "A350"]):
        return "jet_large"
    if any(x in t for x in ["737", "A320", "A319", "A321", "757"]):
        return "jet_medium"
    if any(x in t for x in ["CJ", "CITATION", "PHENOM", "LEARJET"]):
        return "jet_small"
    if any(x in t for x in ["ATR", "DASH", "CARAVAN", "PC12", "KING AIR", "TWIN OTTER"]):
        return "turboprop"
    if any(x in t for x in ["H125", "H145", "S76", "HELICOPTER"]):
        return "helicopter"
    return "other"


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


# ═══════════════════════════════════════════════════════════
# CATALOGUE (Public endpoints)
# ═══════════════════════════════════════════════════════════

@router.get("/catalog", response_model=List[AircraftCatalogOut])
def list_aircraft_catalog(
    category: Optional[str] = Query(None, description="Filter by category"),
    max_price: Optional[float] = Query(None, description="Max price filter"),
    db: Session = Depends(get_db),
):
    """List available aircraft types in the catalog"""
    query = db.query(AircraftCatalog).filter(AircraftCatalog.is_active == True)

    if category:
        query = query.filter(AircraftCatalog.category == category)

    if max_price:
        query = query.filter(AircraftCatalog.base_price <= max_price)

    return query.order_by(AircraftCatalog.base_price).all()


@router.get("/catalog/{catalog_id}", response_model=AircraftCatalogOut)
def get_catalog_aircraft(
    catalog_id: UUID,
    db: Session = Depends(get_db),
):
    """Get details of a specific aircraft type from catalog"""
    aircraft = db.query(AircraftCatalog).filter(
        AircraftCatalog.id == catalog_id,
        AircraftCatalog.is_active == True
    ).first()

    if not aircraft:
        raise HTTPException(status_code=404, detail="Aircraft not found in catalog")

    return aircraft


# ═══════════════════════════════════════════════════════════
# FLEET STATS
# ═══════════════════════════════════════════════════════════

@router.get("/stats", response_model=FleetStatsOut)
def get_fleet_stats(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Get fleet statistics"""
    company = _get_my_company(db, user.id)
    if not company:
        raise HTTPException(status_code=404, detail="No company")

    aircraft_list = db.query(CompanyAircraft).filter(
        CompanyAircraft.company_id == company.id,
        CompanyAircraft.is_active == True
    ).all()

    # Count by status
    available = sum(1 for a in aircraft_list if a.status in ("stored", "parked"))
    in_flight = sum(1 for a in aircraft_list if a.status == "in_flight")
    maintenance = sum(1 for a in aircraft_list if a.status == "maintenance")

    # Total capacity
    total_capacity = sum(a.cargo_capacity_kg for a in aircraft_list)

    # By category
    categories = {}
    for a in aircraft_list:
        cat = _guess_category(a.icao_type or a.aircraft_type)
        categories[cat] = categories.get(cat, 0) + 1

    return FleetStatsOut(
        total_aircraft=len(aircraft_list),
        available_count=available,
        in_flight_count=in_flight,
        maintenance_count=maintenance,
        total_cargo_capacity_kg=total_capacity,
        categories=categories
    )


# ═══════════════════════════════════════════════════════════
# FLEET LISTING
# ═══════════════════════════════════════════════════════════

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
# AIRCRAFT MANAGEMENT (Create, Update, Delete)
# ═══════════════════════════════════════════════════════════

@router.post("", response_model=AircraftOut)
def add_aircraft(
    payload: AircraftCreateIn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Add a new aircraft to the company fleet"""
    company = _get_my_company(db, user.id)
    if not company:
        raise HTTPException(status_code=404, detail="No company")

    # Check permission
    perms = db.query(CompanyPermission).filter(
        CompanyPermission.user_id == user.id,
        CompanyPermission.company_id == company.id,
    ).first()

    if perms and not (perms.is_founder or perms.can_manage_aircraft):
        raise HTTPException(status_code=403, detail="No permission to manage aircraft")

    # Check registration uniqueness
    if payload.registration:
        existing = db.query(CompanyAircraft).filter(
            CompanyAircraft.registration == payload.registration.upper()
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Registration already exists")

    # If from catalog, get specs and deduct price
    if payload.catalog_id:
        catalog = db.query(AircraftCatalog).filter(
            AircraftCatalog.id == payload.catalog_id,
            AircraftCatalog.is_active == True
        ).first()

        if not catalog:
            raise HTTPException(status_code=404, detail="Catalog aircraft not found")

        # Check balance
        if company.balance < catalog.base_price:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient balance. Need {catalog.base_price}, have {company.balance}"
            )

        # Deduct price
        company.balance = float(company.balance) - float(catalog.base_price)

        aircraft = CompanyAircraft(
            company_id=company.id,
            owner_type="company",
            registration=payload.registration.upper() if payload.registration else None,
            name=payload.name or catalog.name,
            aircraft_type=catalog.name,
            icao_type=catalog.icao_type,
            cargo_capacity_kg=catalog.cargo_capacity_kg,
            current_airport_ident=payload.current_airport.upper() if payload.current_airport else company.home_airport_ident,
            purchase_price=catalog.base_price,
            status="parked"
        )
    else:
        # Manual creation (free, for testing or imported aircraft)
        if not payload.aircraft_type:
            raise HTTPException(status_code=400, detail="aircraft_type required if not using catalog")

        aircraft = CompanyAircraft(
            company_id=company.id,
            owner_type="company",
            registration=payload.registration.upper() if payload.registration else None,
            name=payload.name,
            aircraft_type=payload.aircraft_type,
            icao_type=payload.icao_type,
            cargo_capacity_kg=payload.cargo_capacity_kg or 500,
            current_airport_ident=payload.current_airport.upper() if payload.current_airport else company.home_airport_ident,
            status="parked"
        )

    db.add(aircraft)
    db.flush()

    # Create inventory location for aircraft cargo
    cargo_location = InventoryLocation(
        kind="aircraft",
        airport_ident=aircraft.current_airport_ident or "",
        name=f"Cargo {aircraft.registration or aircraft.aircraft_type}",
        owner_type="company",
        owner_id=company.id,
        company_id=company.id,
        aircraft_id=aircraft.id
    )
    db.add(cargo_location)

    db.commit()
    db.refresh(aircraft)

    return aircraft


@router.get("/{aircraft_id}/details", response_model=AircraftDetailOut)
def get_aircraft_details(
    aircraft_id: UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Get aircraft details with cargo summary"""
    company = _get_my_company(db, user.id)
    if not company:
        raise HTTPException(status_code=404, detail="No company")

    aircraft = db.query(CompanyAircraft).filter(
        CompanyAircraft.id == aircraft_id,
        CompanyAircraft.company_id == company.id,
        CompanyAircraft.is_active == True
    ).first()

    if not aircraft:
        raise HTTPException(status_code=404, detail="Aircraft not found")

    # Get cargo from inventory_location
    cargo_location = db.query(InventoryLocation).filter(
        InventoryLocation.aircraft_id == aircraft_id,
        InventoryLocation.kind == "aircraft"
    ).first()

    current_cargo_kg = Decimal("0")
    current_cargo_items = 0

    if cargo_location:
        # Sum cargo weight
        cargo_data = db.execute(text("""
            SELECT COALESCE(SUM(ii.qty * i.weight_kg), 0) as total_weight,
                   COALESCE(SUM(ii.qty), 0) as total_items
            FROM game.inventory_items ii
            JOIN game.items i ON i.id = ii.item_id
            WHERE ii.location_id = :loc_id
        """), {"loc_id": str(cargo_location.id)}).fetchone()

        if cargo_data:
            current_cargo_kg = Decimal(str(cargo_data[0]))
            current_cargo_items = int(cargo_data[1])

    utilization = 0.0
    if aircraft.cargo_capacity_kg > 0:
        utilization = float(current_cargo_kg / aircraft.cargo_capacity_kg * 100)

    return AircraftDetailOut(
        id=aircraft.id,
        company_id=aircraft.company_id,
        user_id=aircraft.user_id,
        owner_type=aircraft.owner_type,
        registration=aircraft.registration,
        name=aircraft.name,
        aircraft_type=aircraft.aircraft_type,
        icao_type=aircraft.icao_type,
        status=aircraft.status,
        condition=aircraft.condition,
        hours=aircraft.hours,
        cargo_capacity_kg=aircraft.cargo_capacity_kg,
        current_airport_ident=aircraft.current_airport_ident,
        purchase_price=aircraft.purchase_price,
        is_active=aircraft.is_active,
        created_at=aircraft.created_at,
        current_cargo_kg=current_cargo_kg,
        current_cargo_items=current_cargo_items,
        cargo_utilization_percent=round(utilization, 1)
    )


@router.patch("/{aircraft_id}", response_model=AircraftOut)
def update_aircraft(
    aircraft_id: UUID,
    payload: AircraftUpdateIn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Update aircraft details"""
    company = _get_my_company(db, user.id)
    if not company:
        raise HTTPException(status_code=404, detail="No company")

    aircraft = db.query(CompanyAircraft).filter(
        CompanyAircraft.id == aircraft_id,
        CompanyAircraft.company_id == company.id,
        CompanyAircraft.is_active == True
    ).first()

    if not aircraft:
        raise HTTPException(status_code=404, detail="Aircraft not found")

    # Update fields
    if payload.name is not None:
        aircraft.name = payload.name

    if payload.current_airport is not None:
        new_airport = payload.current_airport.upper() if payload.current_airport else None
        aircraft.current_airport_ident = new_airport
        # Update cargo location too
        cargo_loc = db.query(InventoryLocation).filter(
            InventoryLocation.aircraft_id == aircraft_id
        ).first()
        if cargo_loc:
            cargo_loc.airport_ident = new_airport or ""

    if payload.status is not None:
        valid_statuses = ["stored", "parked", "in_flight", "maintenance"]
        if payload.status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
        aircraft.status = payload.status

    db.commit()
    db.refresh(aircraft)

    return aircraft


@router.delete("/{aircraft_id}")
def remove_aircraft(
    aircraft_id: UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Remove an aircraft from the fleet (soft delete)"""
    company = _get_my_company(db, user.id)
    if not company:
        raise HTTPException(status_code=404, detail="No company")

    # Check permission
    perms = db.query(CompanyPermission).filter(
        CompanyPermission.user_id == user.id,
        CompanyPermission.company_id == company.id,
    ).first()

    if perms and not (perms.is_founder or perms.can_manage_aircraft):
        raise HTTPException(status_code=403, detail="No permission to manage aircraft")

    aircraft = db.query(CompanyAircraft).filter(
        CompanyAircraft.id == aircraft_id,
        CompanyAircraft.company_id == company.id,
        CompanyAircraft.is_active == True
    ).first()

    if not aircraft:
        raise HTTPException(status_code=404, detail="Aircraft not found")

    # Check if cargo is empty
    cargo_loc = db.query(InventoryLocation).filter(
        InventoryLocation.aircraft_id == aircraft_id
    ).first()

    if cargo_loc:
        cargo_count = db.query(func.sum(InventoryItem.qty)).filter(
            InventoryItem.location_id == cargo_loc.id
        ).scalar() or 0

        if cargo_count > 0:
            raise HTTPException(
                status_code=400,
                detail="Cannot remove aircraft with cargo. Unload first."
            )

    # Soft delete
    aircraft.is_active = False
    db.commit()

    return {"message": f"Aircraft {aircraft.registration or aircraft.aircraft_type} removed from fleet"}


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
