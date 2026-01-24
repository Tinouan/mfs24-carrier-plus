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
from app.models.player_inventory import PlayerInventory
from app.models.company_inventory import CompanyInventory
from app.models.aircraft_inventory import AircraftInventory
from app.models.company_aircraft import CompanyAircraft
from app.schemas.inventory import (
    # Legacy (HV/T0)
    LocationOut,
    WarehouseCreateIn,
    InventoryOut,
    InventoryLineOut,
    AdjustIn,
    MoveIn,
    SetForSaleIn,
    MarketListingOut,
    MarketStatsOut,
    BuyFromMarketIn,
    # V0.7 Unified Legacy
    InventoryOverviewOut,
    AirportInventoryOut,
    ContainerOut,
    InventoryItemOut,
    TransferIn,
    TransferOut,
    PlayerWarehouseCreateIn,
    LocationOutV2,
    # V0.7 Simplified
    AircraftCargoItemOut,
    PlayerInventoryOut,
    CompanyInventoryOut,
    AircraftCargoOut,
    LoadCargoIn,
    UnloadCargoIn,
    CargoOperationOut,
)
from sqlalchemy import func

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

        # Seuls les warehouses peuvent vendre (company ou player)
        allowed_kinds = ("warehouse", "company_warehouse", "player_warehouse")
        if loc.kind not in allowed_kinds:
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

            # Déduire la quantité mise en vente de l'inventaire disponible
            row.qty -= sale_qty
            row.for_sale = True
            row.sale_price = payload.sale_price
            row.sale_qty = sale_qty

            db.add(
                InventoryAudit(
                    location_id=loc.id,
                    item_id=it.id,
                    quantity_delta=-sale_qty,
                    action="set_for_sale",
                    user_id=user.id,
                    notes=f"Price: {row.sale_price}, Qty: {sale_qty}",
                )
            )
        else:
            # Annuler la vente: retourner les items dans l'inventaire
            returned_qty = row.sale_qty
            row.qty += returned_qty
            row.for_sale = False
            row.sale_price = None
            row.sale_qty = 0

            db.add(
                InventoryAudit(
                    location_id=loc.id,
                    item_id=it.id,
                    quantity_delta=returned_qty,
                    action="cancel_sale",
                    user_id=user.id,
                    notes=f"Returned {returned_qty} items from sale",
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


@router.get("/my-listings", response_model=list[MarketListingOut])
def get_my_listings(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Récupérer mes propres items en vente"""
    c, _cm = _get_my_company(db, user.id)
    if not c:
        return []

    rows = (
        db.query(InventoryItem, InventoryLocation, Item)
        .join(InventoryLocation, InventoryLocation.id == InventoryItem.location_id)
        .join(Item, Item.id == InventoryItem.item_id)
        .filter(
            InventoryLocation.company_id == c.id,
            InventoryItem.for_sale == True,
            InventoryItem.sale_qty > 0,
        )
        .all()
    )

    return [
        MarketListingOut(
            location_id=loc.id,
            airport_ident=loc.airport_ident,
            company_id=c.id,
            company_name=c.name,
            item_id=it.id,
            item_code=it.name,
            item_name=it.name,
            item_tier=it.tier,
            item_icon=it.icon,
            sale_price=ii.sale_price,
            sale_qty=ii.sale_qty,
        )
        for (ii, loc, it) in rows
    ]


@router.post("/cancel-sale")
def cancel_sale(
    payload: SetForSaleIn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Annuler une vente et retourner les items dans l'inventaire"""
    # Réutiliser set_for_sale avec for_sale=False
    payload.for_sale = False
    return set_for_sale(payload, db, user)


@router.get("/market", response_model=list[MarketListingOut])
def get_global_market_listings(
    airport: str | None = None,
    item_name: str | None = None,
    tier: int | None = None,
    min_price: float | None = None,
    max_price: float | None = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """
    HV (Hôtel des Ventes) - Liste globale des items en vente.
    Filtres optionnels: airport, item_name (recherche partielle), tier, min_price, max_price
    Pagination: limit (max 500), offset
    """
    query = (
        db.query(InventoryItem, InventoryLocation, Item, Company)
        .join(InventoryLocation, InventoryLocation.id == InventoryItem.location_id)
        .join(Item, Item.id == InventoryItem.item_id)
        .join(Company, Company.id == InventoryLocation.company_id)
        .filter(
            InventoryItem.for_sale == True,
            InventoryItem.sale_qty > 0,
        )
    )

    # Filtres optionnels
    if airport:
        query = query.filter(InventoryLocation.airport_ident == airport.upper())
    if item_name:
        query = query.filter(Item.name.ilike(f"%{item_name}%"))
    if tier is not None:
        query = query.filter(Item.tier == tier)
    if min_price is not None:
        query = query.filter(InventoryItem.sale_price >= min_price)
    if max_price is not None:
        query = query.filter(InventoryItem.sale_price <= max_price)

    # Pagination (max 500)
    limit = min(limit, 500)
    query = query.order_by(Item.name, InventoryItem.sale_price)
    query = query.offset(offset).limit(limit)

    rows = query.all()

    return [
        MarketListingOut(
            location_id=loc.id,
            airport_ident=loc.airport_ident,
            company_id=company.id,
            company_name=company.name,
            item_id=item.id,
            item_code=item.name,
            item_name=item.name,
            item_tier=item.tier,
            item_icon=item.icon,
            sale_price=inv.sale_price,
            sale_qty=inv.sale_qty,
        )
        for (inv, loc, item, company) in rows
    ]


@router.get("/market/stats", response_model=MarketStatsOut)
def get_market_stats(
    db: Session = Depends(get_db),
):
    """HV - Statistiques globales du marché"""
    from sqlalchemy import distinct

    # Base query - items for sale
    base_query = (
        db.query(InventoryItem, InventoryLocation, Item)
        .join(InventoryLocation, InventoryLocation.id == InventoryItem.location_id)
        .join(Item, Item.id == InventoryItem.item_id)
        .filter(
            InventoryItem.for_sale == True,
            InventoryItem.sale_qty > 0,
        )
    )

    rows = base_query.all()

    total_listings = len(rows)
    airports = set()
    total_items = 0
    total_value = Decimal("0")
    tier_counts = {}

    for inv, loc, item in rows:
        airports.add(loc.airport_ident)
        total_items += inv.sale_qty
        total_value += inv.sale_price * inv.sale_qty

        tier_key = f"T{item.tier}"
        tier_counts[tier_key] = tier_counts.get(tier_key, 0) + 1

    return MarketStatsOut(
        total_listings=total_listings,
        total_airports=len(airports),
        total_items_for_sale=total_items,
        total_value=total_value,
        airports_with_listings=sorted(airports),
        tier_distribution=tier_counts,
    )


@router.get("/market/{airport_ident}", response_model=list[MarketListingOut])
def get_market_listings(
    airport_ident: str,
    db: Session = Depends(get_db),
):
    """Liste tous les items en vente à un aéroport (endpoint public - legacy)"""
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
            item_tier=item.tier,
            item_icon=item.icon,
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
    """Acheter des items sur le marché (wallet personnel ou company)"""
    qty = int(payload.qty)
    if qty <= 0:
        raise HTTPException(status_code=400, detail="qty must be > 0")

    buyer_type = payload.buyer_type  # "player" or "company"

    # Get buyer company (needed for company purchases and to check "can't buy from self")
    buyer_company, _cm = _get_my_company(db, user.id)

    if buyer_type == "company" and not buyer_company:
        raise HTTPException(status_code=404, detail="No company")

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

        # Vérifier que ce n'est pas sa propre company (si achat company)
        if buyer_type == "company" and buyer_company and seller_company.id == buyer_company.id:
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

        # Vérifier le solde selon le type d'acheteur
        if buyer_type == "player":
            if user.wallet < total_cost:
                raise HTTPException(status_code=400, detail="Insufficient personal balance")
        else:
            if buyer_company.balance < total_cost:
                raise HTTPException(status_code=400, detail="Insufficient company balance")

        # Créer ou récupérer la location de l'acheteur au même aéroport
        if buyer_type == "player":
            # Achat personnel -> stockage personnel
            buyer_loc = db.query(InventoryLocation).filter(
                InventoryLocation.owner_type == "player",
                InventoryLocation.owner_id == user.id,
                InventoryLocation.airport_ident == seller_loc.airport_ident,
            ).first()

            if not buyer_loc:
                buyer_loc = InventoryLocation(
                    company_id=buyer_company.id if buyer_company else None,
                    kind="player_warehouse",
                    airport_ident=seller_loc.airport_ident,
                    name=f"Personal Storage {seller_loc.airport_ident}",
                    owner_type="player",
                    owner_id=user.id,
                )
                db.add(buyer_loc)
                db.flush()
            buyer_name = user.username
        else:
            # Achat company -> warehouse company
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
                    owner_type="company",
                    owner_id=buyer_company.id,
                )
                db.add(buyer_loc)
                db.flush()
            buyer_name = buyer_company.name

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
        if buyer_type == "player":
            user.wallet -= total_cost
        else:
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
                notes=f"Sold to {buyer_name} for {total_cost}",
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


# ═══════════════════════════════════════════════════════════
# V0.7 SIMPLIFIED INVENTORY SYSTEM (NEW TABLES)
# Uses: player_inventory, company_inventory, aircraft_inventory
# ═══════════════════════════════════════════════════════════

def _get_user_company_v2(db: Session, user_id: uuid.UUID) -> tuple[Company | None, CompanyMember | None]:
    """Get user's company and membership"""
    member = db.query(CompanyMember).filter(CompanyMember.user_id == user_id).first()
    if not member:
        return None, None
    company = db.query(Company).filter(Company.id == member.company_id).first()
    return company, member


def _calculate_aircraft_cargo_weight(db: Session, aircraft_id: uuid.UUID) -> Decimal:
    """Calculate total weight of cargo in an aircraft"""
    result = db.query(
        func.coalesce(func.sum(AircraftInventory.qty * Item.weight_kg), 0)
    ).join(
        Item, Item.id == AircraftInventory.item_id
    ).filter(
        AircraftInventory.aircraft_id == aircraft_id
    ).scalar()
    return Decimal(str(result))


@router.get("/player", response_model=PlayerInventoryOut)
def get_player_inventory(
    airport: str | None = None,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    V0.7 Simplified - Get player's complete inventory.
    Optional: filter by airport_ident
    """
    query = db.query(PlayerInventory, Item).join(
        Item, Item.id == PlayerInventory.item_id
    ).filter(
        PlayerInventory.player_id == user.id,
        PlayerInventory.qty > 0
    )

    if airport:
        query = query.filter(PlayerInventory.airport_ident == airport.upper())

    rows = query.all()

    # Build response
    items = []
    total_value = Decimal("0")
    total_weight = Decimal("0")
    airports = set()

    for inv, item in rows:
        item_total_value = item.base_value * inv.qty
        item_total_weight = item.weight_kg * inv.qty
        total_value += item_total_value
        total_weight += item_total_weight
        airports.add(inv.airport_ident)

        items.append(InventoryItemOut(
            item_id=item.id,
            item_name=item.name,
            tier=item.tier,
            qty=inv.qty,
            airport_ident=inv.airport_ident,
            weight_kg=item.weight_kg,
            total_weight_kg=item_total_weight,
            base_value=item.base_value,
            total_value=item_total_value,
        ))

    return PlayerInventoryOut(
        total_items=sum(i.qty for i in items),
        total_value=total_value,
        total_weight_kg=total_weight,
        airports=sorted(airports),
        items=items,
    )


@router.get("/company", response_model=CompanyInventoryOut)
def get_company_inventory(
    airport: str | None = None,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    V0.7 Simplified - Get company's complete inventory.
    User must be a member of the company.
    Optional: filter by airport_ident
    """
    company, member = _get_user_company_v2(db, user.id)
    if not company:
        raise HTTPException(status_code=404, detail="No company membership")

    query = db.query(CompanyInventory, Item).join(
        Item, Item.id == CompanyInventory.item_id
    ).filter(
        CompanyInventory.company_id == company.id,
        CompanyInventory.qty > 0
    )

    if airport:
        query = query.filter(CompanyInventory.airport_ident == airport.upper())

    rows = query.all()

    items = []
    total_value = Decimal("0")
    total_weight = Decimal("0")
    airports = set()

    for inv, item in rows:
        item_total_value = item.base_value * inv.qty
        item_total_weight = item.weight_kg * inv.qty
        total_value += item_total_value
        total_weight += item_total_weight
        airports.add(inv.airport_ident)

        items.append(InventoryItemOut(
            item_id=item.id,
            item_name=item.name,
            tier=item.tier,
            qty=inv.qty,
            airport_ident=inv.airport_ident,
            weight_kg=item.weight_kg,
            total_weight_kg=item_total_weight,
            base_value=item.base_value,
            total_value=item_total_value,
        ))

    return CompanyInventoryOut(
        company_id=company.id,
        company_name=company.name,
        total_items=sum(i.qty for i in items),
        total_value=total_value,
        total_weight_kg=total_weight,
        airports=sorted(airports),
        items=items,
    )


@router.get("/aircraft/{aircraft_id}", response_model=AircraftCargoOut)
def get_aircraft_cargo(
    aircraft_id: uuid.UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """V0.7 Simplified - Get cargo contents of an aircraft"""
    # Verify user has access to this aircraft
    company, member = _get_user_company_v2(db, user.id)

    aircraft = db.query(CompanyAircraft).filter(CompanyAircraft.id == aircraft_id).first()
    if not aircraft:
        raise HTTPException(status_code=404, detail="Aircraft not found")

    # Check ownership (company or personal)
    if aircraft.owner_type == "company":
        if not company or aircraft.company_id != company.id:
            raise HTTPException(status_code=403, detail="Not authorized to access this aircraft")
    elif aircraft.owner_type == "player":
        if aircraft.user_id != user.id:
            raise HTTPException(status_code=403, detail="Not authorized to access this aircraft")

    # Get cargo
    rows = db.query(AircraftInventory, Item).join(
        Item, Item.id == AircraftInventory.item_id
    ).filter(
        AircraftInventory.aircraft_id == aircraft_id,
        AircraftInventory.qty > 0
    ).all()

    items = []
    current_weight = Decimal("0")

    for inv, item in rows:
        item_weight = item.weight_kg * inv.qty
        current_weight += item_weight

        items.append(AircraftCargoItemOut(
            item_id=item.id,
            item_name=item.name,
            tier=item.tier,
            qty=inv.qty,
            weight_kg=item.weight_kg,
            total_weight_kg=item_weight,
        ))

    return AircraftCargoOut(
        aircraft_id=aircraft.id,
        aircraft_name=aircraft.aircraft_type,
        current_airport=aircraft.current_airport_ident,
        cargo_capacity_kg=Decimal(str(aircraft.cargo_capacity_kg)),
        current_weight_kg=current_weight,
        available_capacity_kg=Decimal(str(aircraft.cargo_capacity_kg)) - current_weight,
        items=items,
    )


@router.post("/load", response_model=CargoOperationOut)
def load_cargo(
    payload: LoadCargoIn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    V0.7 Simplified - Load items from inventory into an aircraft.
    Aircraft must be at the same airport as the items.
    """
    if payload.qty <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be > 0")

    # Get aircraft
    aircraft = db.query(CompanyAircraft).filter(CompanyAircraft.id == payload.aircraft_id).first()
    if not aircraft:
        raise HTTPException(status_code=404, detail="Aircraft not found")

    aircraft_airport = aircraft.current_airport_ident
    if not aircraft_airport:
        raise HTTPException(status_code=400, detail="Aircraft location unknown")

    # Get item
    item = db.query(Item).filter(Item.id == payload.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    # Check source inventory
    if payload.from_inventory == "player":
        source_inv = db.query(PlayerInventory).filter(
            PlayerInventory.player_id == user.id,
            PlayerInventory.item_id == payload.item_id,
            PlayerInventory.airport_ident == aircraft_airport,
        ).first()
    else:
        company, _ = _get_user_company_v2(db, user.id)
        if not company:
            raise HTTPException(status_code=404, detail="No company membership")
        source_inv = db.query(CompanyInventory).filter(
            CompanyInventory.company_id == company.id,
            CompanyInventory.item_id == payload.item_id,
            CompanyInventory.airport_ident == aircraft_airport,
        ).first()

    if not source_inv or source_inv.qty < payload.qty:
        available = source_inv.qty if source_inv else 0
        raise HTTPException(
            status_code=400,
            detail=f"Not enough items at {aircraft_airport} ({available} available)"
        )

    # Check cargo capacity
    added_weight = item.weight_kg * payload.qty
    current_weight = _calculate_aircraft_cargo_weight(db, aircraft.id)

    if current_weight + added_weight > aircraft.cargo_capacity_kg:
        raise HTTPException(
            status_code=400,
            detail=f"Cargo capacity exceeded ({aircraft.cargo_capacity_kg}kg max, {current_weight}kg current, {added_weight}kg to add)"
        )

    try:
        # Remove from source
        source_inv.qty -= payload.qty
        if source_inv.qty == 0:
            db.delete(source_inv)

        # Add to aircraft
        aircraft_inv = db.query(AircraftInventory).filter(
            AircraftInventory.aircraft_id == aircraft.id,
            AircraftInventory.item_id == payload.item_id,
        ).first()

        if not aircraft_inv:
            aircraft_inv = AircraftInventory(
                aircraft_id=aircraft.id,
                item_id=payload.item_id,
                qty=0,
            )
            db.add(aircraft_inv)

        aircraft_inv.qty += payload.qty

        db.commit()

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

    return CargoOperationOut(
        success=True,
        message=f"Loaded {payload.qty} {item.name} into aircraft",
        item_name=item.name,
        qty=payload.qty,
        aircraft_id=aircraft.id,
        airport_ident=aircraft_airport,
    )


@router.post("/unload", response_model=CargoOperationOut)
def unload_cargo(
    payload: UnloadCargoIn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    V0.7 Simplified - Unload items from aircraft to inventory.
    Items will be placed at the aircraft's current location.
    """
    if payload.qty <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be > 0")

    # Get aircraft
    aircraft = db.query(CompanyAircraft).filter(CompanyAircraft.id == payload.aircraft_id).first()
    if not aircraft:
        raise HTTPException(status_code=404, detail="Aircraft not found")

    aircraft_airport = aircraft.current_airport_ident
    if not aircraft_airport:
        raise HTTPException(status_code=400, detail="Aircraft location unknown")

    # Get item
    item = db.query(Item).filter(Item.id == payload.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    # Check aircraft cargo
    aircraft_inv = db.query(AircraftInventory).filter(
        AircraftInventory.aircraft_id == aircraft.id,
        AircraftInventory.item_id == payload.item_id,
    ).first()

    if not aircraft_inv or aircraft_inv.qty < payload.qty:
        available = aircraft_inv.qty if aircraft_inv else 0
        raise HTTPException(
            status_code=400,
            detail=f"Not enough items in aircraft ({available} available)"
        )

    try:
        # Remove from aircraft
        aircraft_inv.qty -= payload.qty
        if aircraft_inv.qty == 0:
            db.delete(aircraft_inv)

        # Add to destination inventory (at aircraft's current location!)
        if payload.to_inventory == "player":
            dest_inv = db.query(PlayerInventory).filter(
                PlayerInventory.player_id == user.id,
                PlayerInventory.item_id == payload.item_id,
                PlayerInventory.airport_ident == aircraft_airport,
            ).first()

            if not dest_inv:
                dest_inv = PlayerInventory(
                    player_id=user.id,
                    item_id=payload.item_id,
                    airport_ident=aircraft_airport,
                    qty=0,
                )
                db.add(dest_inv)

            dest_inv.qty += payload.qty
        else:
            company, _ = _get_user_company_v2(db, user.id)
            if not company:
                raise HTTPException(status_code=404, detail="No company membership")

            dest_inv = db.query(CompanyInventory).filter(
                CompanyInventory.company_id == company.id,
                CompanyInventory.item_id == payload.item_id,
                CompanyInventory.airport_ident == aircraft_airport,
            ).first()

            if not dest_inv:
                dest_inv = CompanyInventory(
                    company_id=company.id,
                    item_id=payload.item_id,
                    airport_ident=aircraft_airport,
                    qty=0,
                )
                db.add(dest_inv)

            dest_inv.qty += payload.qty

        db.commit()

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

    return CargoOperationOut(
        success=True,
        message=f"Unloaded {payload.qty} {item.name} at {aircraft_airport}",
        item_name=item.name,
        qty=payload.qty,
        aircraft_id=aircraft.id,
        airport_ident=aircraft_airport,
    )
