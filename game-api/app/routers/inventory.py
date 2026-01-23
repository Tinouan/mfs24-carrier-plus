import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.deps import get_db, get_current_user
from app.models.company_member import CompanyMember
from app.models.company import Company
from app.models.company_permission import CompanyPermission
from app.models.item import Item
from app.models.inventory_location import InventoryLocation
from app.models.inventory_item import InventoryItem
from app.models.inventory_audit import InventoryAudit
from app.models.user import User
from app.schemas.inventory import (
    LocationOut,
    WarehouseCreateIn,
    InventoryOut,
    InventoryLineOut,
    AdjustIn,
    MoveIn,
    SetForSaleIn,
    MarketListingOut,
    BuyFromMarketIn,
    # V0.7
    InventoryOverviewOut,
    AirportInventoryOut,
    ContainerOut,
    InventoryItemOut,
    TransferIn,
    TransferOut,
    PlayerWarehouseCreateIn,
    LocationOutV2,
)

router = APIRouter(prefix="/inventory", tags=["inventory"])

ALLOWED_KINDS = {"vault", "warehouse", "in_transit"}


def _get_my_company(db: Session, user_id):
    cm = db.query(CompanyMember).filter(CompanyMember.user_id == user_id).first()
    if not cm:
        return None, None
    c = db.query(Company).filter(Company.id == cm.company_id).first()
    return c, cm


def _ensure_vault(db: Session, company_id, company_slug: str):
    loc = db.query(InventoryLocation).filter(
        InventoryLocation.company_id == company_id,
        InventoryLocation.kind == "vault",
        InventoryLocation.airport_ident == "",
    ).first()
    if loc:
        return loc

    loc = InventoryLocation(
        company_id=company_id,
        kind="vault",
        airport_ident="",
        name=f"{company_slug} vault",
    )
    db.add(loc)
    db.flush()
    return loc


def _get_location_or_404(db: Session, company_id, location_id: uuid.UUID):
    loc = db.query(InventoryLocation).filter(
        InventoryLocation.id == location_id,
        InventoryLocation.company_id == company_id,
    ).first()
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    return loc


def _get_item_by_name(db: Session, item_name: str):
    """Récupère un item par son nom (case-insensitive)"""
    name = item_name.strip()
    it = db.query(Item).filter(Item.name.ilike(name)).first()
    if not it:
        raise HTTPException(status_code=404, detail=f"Item '{name}' not found in catalog")
    return it


@router.get("/locations", response_model=list[LocationOut])
def list_locations(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    c, _cm = _get_my_company(db, user.id)
    if not c:
        raise HTTPException(status_code=404, detail="No company")

    _ensure_vault(db, c.id, c.slug)
    db.commit()

    rows = db.query(InventoryLocation).filter(InventoryLocation.company_id == c.id).all()
    return [
        LocationOut(
            id=r.id,
            company_id=r.company_id,
            kind=r.kind,
            airport_ident=r.airport_ident,
            name=r.name,
        )
        for r in rows
    ]


@router.post("/locations/warehouse", response_model=LocationOut)
def create_or_get_warehouse(
    payload: WarehouseCreateIn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    c, _cm = _get_my_company(db, user.id)
    if not c:
        raise HTTPException(status_code=404, detail="No company")

    ident = payload.airport_ident.strip().upper()

    loc = db.query(InventoryLocation).filter(
        InventoryLocation.company_id == c.id,
        InventoryLocation.kind == "warehouse",
        InventoryLocation.airport_ident == ident,
    ).first()
    if loc:
        return LocationOut(
            id=loc.id,
            company_id=loc.company_id,
            kind=loc.kind,
            airport_ident=loc.airport_ident,
            name=loc.name,
        )

    loc = InventoryLocation(
        company_id=c.id,
        kind="warehouse",
        airport_ident=ident,
        name=f"Warehouse {ident}",
    )
    db.add(loc)
    db.commit()
    db.refresh(loc)

    return LocationOut(
        id=loc.id,
        company_id=loc.company_id,
        kind=loc.kind,
        airport_ident=loc.airport_ident,
        name=loc.name,
    )


@router.get("/location/{location_id}", response_model=InventoryOut)
def get_inventory(
    location_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    c, _cm = _get_my_company(db, user.id)
    if not c:
        raise HTTPException(status_code=404, detail="No company")

    loc = _get_location_or_404(db, c.id, location_id)

    rows = (
        db.query(InventoryItem, Item)
        .join(Item, Item.id == InventoryItem.item_id)
        .filter(InventoryItem.location_id == loc.id)
        .all()
    )

    items = [
        InventoryLineOut(
            item_id=i.id,
            item_code=i.name,
            item_name=i.name,
            qty=ii.qty,
            for_sale=ii.for_sale,
            sale_price=ii.sale_price,
            sale_qty=ii.sale_qty,
        )
        for (ii, i) in rows
    ]

    return InventoryOut(
        location_id=loc.id,
        kind=loc.kind,
        airport_ident=loc.airport_ident,
        name=loc.name,
        items=items,
    )


@router.post("/deposit", response_model=InventoryOut)
def deposit(
    payload: AdjustIn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    c, _cm = _get_my_company(db, user.id)
    if not c:
        raise HTTPException(status_code=404, detail="No company")

    qty = int(payload.qty)
    if qty <= 0:
        raise HTTPException(status_code=400, detail="qty must be > 0")

    loc = None
    try:
        loc = _get_location_or_404(db, c.id, payload.location_id)
        it = _get_item_by_name(db, payload.item_code)

        row = db.query(InventoryItem).filter(
            InventoryItem.location_id == loc.id,
            InventoryItem.item_id == it.id,
        ).first()
        if not row:
            row = InventoryItem(location_id=loc.id, item_id=it.id, qty=0)
            db.add(row)
            db.flush()

        row.qty += qty

        db.add(
            InventoryAudit(
                location_id=loc.id,
                item_id=it.id,
                quantity_delta=qty,
                action="deposit",
                user_id=user.id,
            )
        )

        db.commit()

    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise

    return get_inventory(loc.id, db, user)


@router.post("/withdraw", response_model=InventoryOut)
def withdraw(
    payload: AdjustIn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    c, _cm = _get_my_company(db, user.id)
    if not c:
        raise HTTPException(status_code=404, detail="No company")

    qty = int(payload.qty)
    if qty <= 0:
        raise HTTPException(status_code=400, detail="qty must be > 0")

    loc = None
    try:
        loc = _get_location_or_404(db, c.id, payload.location_id)
        it = _get_item_by_name(db, payload.item_code)

        row = db.query(InventoryItem).filter(
            InventoryItem.location_id == loc.id,
            InventoryItem.item_id == it.id,
        ).first()
        if not row or row.qty < qty:
            raise HTTPException(status_code=400, detail="Not enough stock")

        row.qty -= qty

        db.add(
            InventoryAudit(
                location_id=loc.id,
                item_id=it.id,
                quantity_delta=-qty,
                action="withdraw",
                user_id=user.id,
            )
        )

        db.commit()

    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise

    return get_inventory(loc.id, db, user)


@router.post("/move", response_model=InventoryOut)
def move(
    payload: MoveIn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    c, _cm = _get_my_company(db, user.id)
    if not c:
        raise HTTPException(status_code=404, detail="No company")

    qty = int(payload.qty)
    if qty <= 0:
        raise HTTPException(status_code=400, detail="qty must be > 0")

    to_loc = None
    try:
        from_loc = _get_location_or_404(db, c.id, payload.from_location_id)
        to_loc = _get_location_or_404(db, c.id, payload.to_location_id)
        it = _get_item_by_name(db, payload.item_code)

        src = db.query(InventoryItem).filter(
            InventoryItem.location_id == from_loc.id,
            InventoryItem.item_id == it.id,
        ).first()
        if not src or src.qty < qty:
            raise HTTPException(status_code=400, detail="Not enough stock")

        dst = db.query(InventoryItem).filter(
            InventoryItem.location_id == to_loc.id,
            InventoryItem.item_id == it.id,
        ).first()
        if not dst:
            dst = InventoryItem(location_id=to_loc.id, item_id=it.id, qty=0)
            db.add(dst)
            db.flush()

        src.qty -= qty
        dst.qty += qty

        # Audit: retrait de la source
        db.add(
            InventoryAudit(
                location_id=from_loc.id,
                item_id=it.id,
                quantity_delta=-qty,
                action="move_out",
                user_id=user.id,
                notes=f"To {to_loc.airport_ident or 'vault'}",
            )
        )
        # Audit: ajout à la destination
        db.add(
            InventoryAudit(
                location_id=to_loc.id,
                item_id=it.id,
                quantity_delta=qty,
                action="move_in",
                user_id=user.id,
                notes=f"From {from_loc.airport_ident or 'vault'}",
            )
        )

        db.commit()

    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise

    # Return destination inventory by default
    return get_inventory(to_loc.id, db, user)


# ═══════════════════════════════════════════════════════════
# VENTE / MARCHÉ
# ═══════════════════════════════════════════════════════════

@router.post("/set-for-sale", response_model=InventoryOut)
def set_for_sale(
    payload: SetForSaleIn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Mettre des items en vente ou les retirer de la vente"""
    c, _cm = _get_my_company(db, user.id)
    if not c:
        raise HTTPException(status_code=404, detail="No company")

    try:
        loc = _get_location_or_404(db, c.id, payload.location_id)

        # Seuls les warehouses peuvent vendre
        if loc.kind != "warehouse":
            raise HTTPException(status_code=400, detail="Can only sell from warehouses")

        it = _get_item_by_name(db, payload.item_code)

        row = db.query(InventoryItem).filter(
            InventoryItem.location_id == loc.id,
            InventoryItem.item_id == it.id,
        ).first()

        if not row:
            raise HTTPException(status_code=404, detail="Item not found in this location")

        if payload.for_sale:
            if payload.sale_price is None or payload.sale_price <= 0:
                raise HTTPException(status_code=400, detail="sale_price required and must be > 0")

            sale_qty = payload.sale_qty if payload.sale_qty > 0 else row.qty
            if sale_qty > row.qty:
                raise HTTPException(status_code=400, detail="sale_qty cannot exceed available qty")

            row.for_sale = True
            row.sale_price = payload.sale_price
            row.sale_qty = sale_qty
        else:
            row.for_sale = False
            row.sale_price = None
            row.sale_qty = 0

        db.add(
            InventoryAudit(
                location_id=loc.id,
                item_id=it.id,
                quantity_delta=0,  # Pas de changement de quantité, juste statut vente
                action="set_for_sale" if payload.for_sale else "remove_from_sale",
                user_id=user.id,
                notes=f"Price: {row.sale_price}, Qty: {row.sale_qty}" if payload.for_sale else None,
            )
        )

        db.commit()

    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise

    return get_inventory(loc.id, db, user)


@router.get("/market/{airport_ident}", response_model=list[MarketListingOut])
def get_market_listings(
    airport_ident: str,
    db: Session = Depends(get_db),
):
    """Liste tous les items en vente à un aéroport (endpoint public)"""
    ident = airport_ident.strip().upper()

    rows = (
        db.query(InventoryItem, InventoryLocation, Item, Company)
        .join(InventoryLocation, InventoryLocation.id == InventoryItem.location_id)
        .join(Item, Item.id == InventoryItem.item_id)
        .join(Company, Company.id == InventoryLocation.company_id)
        .filter(
            InventoryLocation.airport_ident == ident,
            InventoryItem.for_sale == True,
            InventoryItem.sale_qty > 0,
        )
        .all()
    )

    return [
        MarketListingOut(
            location_id=loc.id,
            airport_ident=loc.airport_ident,
            company_id=company.id,
            company_name=company.name,
            item_id=item.id,
            item_code=item.name,
            item_name=item.name,
            sale_price=inv.sale_price,
            sale_qty=inv.sale_qty,
        )
        for (inv, loc, item, company) in rows
    ]


@router.post("/market/buy", response_model=InventoryOut)
def buy_from_market(
    payload: BuyFromMarketIn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Acheter des items sur le marché"""
    buyer_company, _cm = _get_my_company(db, user.id)
    if not buyer_company:
        raise HTTPException(status_code=404, detail="No company")

    qty = int(payload.qty)
    if qty <= 0:
        raise HTTPException(status_code=400, detail="qty must be > 0")

    try:
        # Trouver la location du vendeur
        seller_loc = db.query(InventoryLocation).filter(
            InventoryLocation.id == payload.seller_location_id
        ).first()
        if not seller_loc:
            raise HTTPException(status_code=404, detail="Seller location not found")

        seller_company = db.query(Company).filter(Company.id == seller_loc.company_id).first()
        if not seller_company:
            raise HTTPException(status_code=404, detail="Seller company not found")

        # Vérifier que ce n'est pas sa propre company
        if seller_company.id == buyer_company.id:
            raise HTTPException(status_code=400, detail="Cannot buy from yourself")

        it = _get_item_by_name(db, payload.item_code)

        # Trouver l'item en vente
        seller_item = db.query(InventoryItem).filter(
            InventoryItem.location_id == seller_loc.id,
            InventoryItem.item_id == it.id,
            InventoryItem.for_sale == True,
        ).first()

        if not seller_item or seller_item.sale_qty < qty:
            raise HTTPException(status_code=400, detail="Not enough items for sale")

        # Calculer le coût total
        total_cost = seller_item.sale_price * qty

        # Vérifier le solde de l'acheteur
        if buyer_company.balance < total_cost:
            raise HTTPException(status_code=400, detail="Insufficient balance")

        # Créer ou récupérer le warehouse de l'acheteur au même aéroport
        buyer_loc = db.query(InventoryLocation).filter(
            InventoryLocation.company_id == buyer_company.id,
            InventoryLocation.kind == "warehouse",
            InventoryLocation.airport_ident == seller_loc.airport_ident,
        ).first()

        if not buyer_loc:
            buyer_loc = InventoryLocation(
                company_id=buyer_company.id,
                kind="warehouse",
                airport_ident=seller_loc.airport_ident,
                name=f"Warehouse {seller_loc.airport_ident}",
            )
            db.add(buyer_loc)
            db.flush()

        # Effectuer la transaction
        # 1. Retirer du vendeur
        seller_item.qty -= qty
        seller_item.sale_qty -= qty
        if seller_item.sale_qty <= 0:
            seller_item.for_sale = False
            seller_item.sale_price = None
            seller_item.sale_qty = 0

        # 2. Ajouter à l'acheteur
        buyer_item = db.query(InventoryItem).filter(
            InventoryItem.location_id == buyer_loc.id,
            InventoryItem.item_id == it.id,
        ).first()

        if not buyer_item:
            buyer_item = InventoryItem(location_id=buyer_loc.id, item_id=it.id, qty=0)
            db.add(buyer_item)
            db.flush()

        buyer_item.qty += qty

        # 3. Transférer l'argent
        buyer_company.balance -= total_cost
        seller_company.balance += total_cost

        # 4. Audit - côté vendeur (retrait)
        db.add(
            InventoryAudit(
                location_id=seller_loc.id,
                item_id=it.id,
                quantity_delta=-qty,
                action="market_sell",
                user_id=user.id,
                notes=f"Sold to {buyer_company.name} for {total_cost}",
            )
        )

        # Audit - côté acheteur (ajout)
        db.add(
            InventoryAudit(
                location_id=buyer_loc.id,
                item_id=it.id,
                quantity_delta=qty,
                action="market_buy",
                user_id=user.id,
                notes=f"Bought from {seller_company.name} for {total_cost}",
            )
        )

        db.commit()

    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise

    return get_inventory(buyer_loc.id, db, user)


# ═══════════════════════════════════════════════════════════
# V0.7 UNIFIED INVENTORY SYSTEM
# ═══════════════════════════════════════════════════════════

def _get_user_permissions(db: Session, user_id: uuid.UUID, company_id: uuid.UUID) -> CompanyPermission | None:
    """Get user's permissions for a company"""
    return db.query(CompanyPermission).filter(
        CompanyPermission.user_id == user_id,
        CompanyPermission.company_id == company_id,
    ).first()


def _can_access_location(db: Session, user_id: uuid.UUID, location: InventoryLocation) -> tuple[bool, CompanyPermission | None]:
    """Check if user can access a location"""
    if location.owner_type == "player":
        return location.owner_id == user_id, None

    if location.owner_type == "company":
        # Check membership
        membership = db.query(CompanyMember).filter(
            CompanyMember.user_id == user_id,
            CompanyMember.company_id == location.owner_id,
        ).first()
        if not membership:
            return False, None

        perms = _get_user_permissions(db, user_id, location.owner_id)
        return True, perms

    return False, None


def _can_withdraw_from_location(db: Session, user_id: uuid.UUID, location: InventoryLocation) -> bool:
    """Check if user can withdraw from a location"""
    has_access, perms = _can_access_location(db, user_id, location)
    if not has_access:
        return False

    if location.owner_type == "player":
        return True

    # Company location - check permissions
    if not perms:
        return False

    if perms.is_founder:
        return True

    if location.kind in ("company_warehouse", "warehouse"):
        return perms.can_withdraw_warehouse
    if location.kind == "factory_storage":
        return perms.can_withdraw_factory
    if location.kind == "aircraft":
        return perms.can_use_aircraft

    return False


def _can_deposit_to_location(db: Session, user_id: uuid.UUID, location: InventoryLocation) -> bool:
    """Check if user can deposit to a location"""
    has_access, perms = _can_access_location(db, user_id, location)
    if not has_access:
        return False

    if location.owner_type == "player":
        return True

    # Company location - check permissions
    if not perms:
        return False

    if perms.is_founder:
        return True

    if location.kind in ("company_warehouse", "warehouse"):
        return perms.can_deposit_warehouse
    if location.kind == "factory_storage":
        return perms.can_deposit_factory
    if location.kind == "aircraft":
        return perms.can_use_aircraft

    return False


@router.get("/overview", response_model=InventoryOverviewOut)
def get_inventory_overview(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """V0.7 - Get complete inventory overview for current user (personal + company)"""

    # Get all locations user has access to
    # 1. Player's own locations
    player_locations = db.query(InventoryLocation).filter(
        InventoryLocation.owner_type == "player",
        InventoryLocation.owner_id == user.id,
    ).all()

    # 2. Company locations (for companies user is member of)
    company_ids = db.query(CompanyMember.company_id).filter(
        CompanyMember.user_id == user.id
    ).subquery()

    company_locations = db.query(InventoryLocation).filter(
        InventoryLocation.owner_type == "company",
        InventoryLocation.owner_id.in_(company_ids),
    ).all()

    all_locations = player_locations + company_locations

    # Group by airport
    airports_data: dict[str, list[InventoryLocation]] = {}
    for loc in all_locations:
        airport = loc.airport_ident or "GLOBAL"
        if airport not in airports_data:
            airports_data[airport] = []
        airports_data[airport].append(loc)

    # Build response
    total_items = 0
    total_value = Decimal("0")
    locations_out = []

    for airport_ident, locs in airports_data.items():
        containers = []

        for loc in locs:
            # Get items in this location
            items_query = (
                db.query(InventoryItem, Item)
                .join(Item, Item.id == InventoryItem.item_id)
                .filter(InventoryItem.location_id == loc.id, InventoryItem.qty > 0)
                .all()
            )

            items_out = []
            container_total = Decimal("0")
            container_items = 0

            for inv_item, item in items_query:
                item_total_value = item.base_value * inv_item.qty
                item_total_weight = item.weight_kg * inv_item.qty
                container_total += item_total_value
                container_items += inv_item.qty

                items_out.append(InventoryItemOut(
                    item_id=item.id,
                    item_name=item.name,
                    tier=item.tier,
                    qty=inv_item.qty,
                    weight_kg=item.weight_kg,
                    total_weight_kg=item_total_weight,
                    base_value=item.base_value,
                    total_value=item_total_value,
                ))

            total_items += container_items
            total_value += container_total

            # Get owner name
            owner_name = None
            if loc.owner_type == "company":
                company = db.query(Company).filter(Company.id == loc.owner_id).first()
                owner_name = company.name if company else None
            else:
                owner_name = "Personal"

            containers.append(ContainerOut(
                id=loc.id,
                type=loc.kind,
                name=loc.name,
                owner_name=owner_name,
                items=items_out,
                total_items=container_items,
                total_value=container_total,
            ))

        # Get airport name (simple lookup)
        airport_name = airport_ident if airport_ident != "GLOBAL" else "Global Storage"

        locations_out.append(AirportInventoryOut(
            airport_ident=airport_ident,
            airport_name=airport_name,
            containers=containers,
        ))

    return InventoryOverviewOut(
        total_items=total_items,
        total_value=total_value,
        locations=locations_out,
    )


@router.post("/transfer", response_model=TransferOut)
def transfer_items(
    payload: TransferIn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """V0.7 - Transfer items between locations (same airport only)"""

    # Get locations
    from_loc = db.query(InventoryLocation).filter(
        InventoryLocation.id == payload.from_location_id
    ).first()
    if not from_loc:
        raise HTTPException(status_code=404, detail="Source location not found")

    to_loc = db.query(InventoryLocation).filter(
        InventoryLocation.id == payload.to_location_id
    ).first()
    if not to_loc:
        raise HTTPException(status_code=404, detail="Destination location not found")

    # Check same airport
    if from_loc.airport_ident != to_loc.airport_ident:
        raise HTTPException(
            status_code=400,
            detail="Transfer between airports not allowed. Use aircraft for transport."
        )

    # Check permissions
    if not _can_withdraw_from_location(db, user.id, from_loc):
        raise HTTPException(status_code=403, detail="No permission to withdraw from source location")

    if not _can_deposit_to_location(db, user.id, to_loc):
        raise HTTPException(status_code=403, detail="No permission to deposit to destination location")

    # Get item
    item = db.query(Item).filter(Item.id == payload.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    # Check stock
    src_inv = db.query(InventoryItem).filter(
        InventoryItem.location_id == from_loc.id,
        InventoryItem.item_id == payload.item_id,
    ).first()

    if not src_inv or src_inv.qty < payload.qty:
        available = src_inv.qty if src_inv else 0
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient stock ({available} available, {payload.qty} requested)"
        )

    # If destination is aircraft, check cargo capacity
    if to_loc.kind == "aircraft" and to_loc.aircraft_id:
        from app.models.company_aircraft import CompanyAircraft

        aircraft = db.query(CompanyAircraft).filter(
            CompanyAircraft.id == to_loc.aircraft_id
        ).first()

        if aircraft:
            # Calculate current cargo weight
            current_weight_result = db.execute(text("""
                SELECT COALESCE(SUM(ii.qty * i.weight_kg), 0) as total_weight
                FROM game.inventory_items ii
                JOIN game.items i ON i.id = ii.item_id
                WHERE ii.location_id = :loc_id
            """), {"loc_id": str(to_loc.id)}).fetchone()

            current_weight = Decimal(str(current_weight_result[0])) if current_weight_result else Decimal("0")
            added_weight = item.weight_kg * payload.qty

            if current_weight + added_weight > aircraft.cargo_capacity_kg:
                raise HTTPException(
                    status_code=400,
                    detail=f"Cargo capacity exceeded ({aircraft.cargo_capacity_kg}kg max, {current_weight}kg current, {added_weight}kg to add)"
                )

    try:
        # Decrease from source
        src_inv.qty -= payload.qty

        # Increase at destination
        dst_inv = db.query(InventoryItem).filter(
            InventoryItem.location_id == to_loc.id,
            InventoryItem.item_id == payload.item_id,
        ).first()

        if not dst_inv:
            dst_inv = InventoryItem(
                location_id=to_loc.id,
                item_id=payload.item_id,
                qty=0,
            )
            db.add(dst_inv)
            db.flush()

        dst_inv.qty += payload.qty

        # Audit logs
        db.add(InventoryAudit(
            location_id=from_loc.id,
            item_id=payload.item_id,
            quantity_delta=-payload.qty,
            action="transfer_out",
            user_id=user.id,
            notes=f"Transfer to {to_loc.name}",
        ))

        db.add(InventoryAudit(
            location_id=to_loc.id,
            item_id=payload.item_id,
            quantity_delta=payload.qty,
            action="transfer_in",
            user_id=user.id,
            notes=f"Transfer from {from_loc.name}",
        ))

        # Clean up zero quantity rows
        if src_inv.qty == 0:
            db.delete(src_inv)

        db.commit()

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

    return TransferOut(
        success=True,
        message=f"Transferred {payload.qty} {item.name} successfully",
        from_location_id=from_loc.id,
        to_location_id=to_loc.id,
        item_id=payload.item_id,
        qty=payload.qty,
    )


@router.get("/my-locations", response_model=list[LocationOutV2])
def get_my_locations(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """V0.7 - Get all locations owned by current player"""
    locs = db.query(InventoryLocation).filter(
        InventoryLocation.owner_type == "player",
        InventoryLocation.owner_id == user.id,
    ).all()

    return [
        LocationOutV2(
            id=loc.id,
            kind=loc.kind,
            airport_ident=loc.airport_ident,
            name=loc.name,
            owner_type=loc.owner_type,
            owner_id=loc.owner_id,
            company_id=loc.company_id,
            aircraft_id=loc.aircraft_id,
        )
        for loc in locs
    ]


@router.post("/warehouse/player", response_model=LocationOutV2)
def create_player_warehouse(
    payload: PlayerWarehouseCreateIn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """V0.7 - Create a player-owned warehouse at an airport"""
    ident = payload.airport_ident.strip().upper()

    # Check if already exists
    existing = db.query(InventoryLocation).filter(
        InventoryLocation.owner_type == "player",
        InventoryLocation.owner_id == user.id,
        InventoryLocation.kind == "player_warehouse",
        InventoryLocation.airport_ident == ident,
    ).first()

    if existing:
        return LocationOutV2(
            id=existing.id,
            kind=existing.kind,
            airport_ident=existing.airport_ident,
            name=existing.name,
            owner_type=existing.owner_type,
            owner_id=existing.owner_id,
            company_id=existing.company_id,
            aircraft_id=existing.aircraft_id,
        )

    # Create new warehouse
    name = payload.name or f"My Warehouse {ident}"
    loc = InventoryLocation(
        kind="player_warehouse",
        airport_ident=ident,
        name=name,
        owner_type="player",
        owner_id=user.id,
        company_id=None,
    )
    db.add(loc)
    db.commit()
    db.refresh(loc)

    return LocationOutV2(
        id=loc.id,
        kind=loc.kind,
        airport_ident=loc.airport_ident,
        name=loc.name,
        owner_type=loc.owner_type,
        owner_id=loc.owner_id,
        company_id=loc.company_id,
        aircraft_id=loc.aircraft_id,
    )


@router.get("/airport/{icao}", response_model=AirportInventoryOut)
def get_inventory_at_airport(
    icao: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """V0.7 - Get all user's inventory at a specific airport"""
    ident = icao.strip().upper()

    # Get company IDs user is member of
    company_ids = [
        cm.company_id for cm in
        db.query(CompanyMember).filter(CompanyMember.user_id == user.id).all()
    ]

    # Get all locations at this airport user can access
    locations = db.query(InventoryLocation).filter(
        InventoryLocation.airport_ident == ident,
    ).filter(
        (
            (InventoryLocation.owner_type == "player") &
            (InventoryLocation.owner_id == user.id)
        ) | (
            (InventoryLocation.owner_type == "company") &
            (InventoryLocation.owner_id.in_(company_ids))
        )
    ).all()

    containers = []
    for loc in locations:
        items_query = (
            db.query(InventoryItem, Item)
            .join(Item, Item.id == InventoryItem.item_id)
            .filter(InventoryItem.location_id == loc.id, InventoryItem.qty > 0)
            .all()
        )

        items_out = []
        container_total = Decimal("0")
        container_items = 0

        for inv_item, item in items_query:
            item_total_value = item.base_value * inv_item.qty
            item_total_weight = item.weight_kg * inv_item.qty
            container_total += item_total_value
            container_items += inv_item.qty

            items_out.append(InventoryItemOut(
                item_id=item.id,
                item_name=item.name,
                tier=item.tier,
                qty=inv_item.qty,
                weight_kg=item.weight_kg,
                total_weight_kg=item_total_weight,
                base_value=item.base_value,
                total_value=item_total_value,
            ))

        owner_name = None
        if loc.owner_type == "company":
            company = db.query(Company).filter(Company.id == loc.owner_id).first()
            owner_name = company.name if company else None
        else:
            owner_name = "Personal"

        containers.append(ContainerOut(
            id=loc.id,
            type=loc.kind,
            name=loc.name,
            owner_name=owner_name,
            items=items_out,
            total_items=container_items,
            total_value=container_total,
        ))

    return AirportInventoryOut(
        airport_ident=ident,
        airport_name=ident,
        containers=containers,
    )
