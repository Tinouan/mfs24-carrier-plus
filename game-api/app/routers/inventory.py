import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.deps import get_db, get_current_user
from app.models.company_member import CompanyMember
from app.models.company import Company
from app.models.item import Item
from app.models.inventory_location import InventoryLocation
from app.models.inventory_item import InventoryItem
from app.models.inventory_audit import InventoryAudit
from app.schemas.inventory import (
    LocationOut,
    WarehouseCreateIn,
    InventoryOut,
    InventoryLineOut,
    AdjustIn,
    MoveIn,
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


def _get_or_create_item(db: Session, code: str):
    code = code.strip().lower()
    it = db.query(Item).filter(Item.code == code).first()
    if it:
        return it
    it = Item(code=code, name=code)
    db.add(it)
    db.flush()
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

    items = [InventoryLineOut(item_code=i.code, item_name=i.name, qty=ii.qty) for (ii, i) in rows]

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
        it = _get_or_create_item(db, payload.item_code)

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
                company_id=c.id,
                user_id=user.id,
                action="deposit",
                from_loc=None,
                to_loc=loc.id,
                item_id=it.id,
                qty=qty,
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
        it = _get_or_create_item(db, payload.item_code)

        row = db.query(InventoryItem).filter(
            InventoryItem.location_id == loc.id,
            InventoryItem.item_id == it.id,
        ).first()
        if not row or row.qty < qty:
            raise HTTPException(status_code=400, detail="Not enough stock")

        row.qty -= qty

        db.add(
            InventoryAudit(
                company_id=c.id,
                user_id=user.id,
                action="withdraw",
                from_loc=loc.id,
                to_loc=None,
                item_id=it.id,
                qty=qty,
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
        it = _get_or_create_item(db, payload.item_code)

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

        db.add(
            InventoryAudit(
                company_id=c.id,
                user_id=user.id,
                action="move",
                from_loc=from_loc.id,
                to_loc=to_loc.id,
                item_id=it.id,
                qty=qty,
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
