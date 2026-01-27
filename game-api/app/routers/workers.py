"""
V0.8.1 Workers System - API Endpoints (V2 Only)
Item-based workers management
"""
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_
from sqlalchemy.orm import Session

from app.deps import get_db, get_current_user
from app.models.factory import Factory
from app.models.company import Company
from app.models.worker import WorkerInstance
from app.models.item import Item
from app.models.user import User
from app.schemas.workers import (
    WorkerInstanceOut,
    WorkerInstanceListOut,
    WorkerInstanceAssignIn,
    FactoryWorkersV2Out,
    InventoryWorkersOut,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workers", tags=["workers"])


# ═══════════════════════════════════════════════════════════
# WORKERS V2 - Item-based workers system
# ═══════════════════════════════════════════════════════════

def _get_my_company(db: Session, user_id: uuid.UUID):
    """Get company owned by user."""
    company = db.execute(
        select(Company).where(Company.owner_user_id == user_id)
    ).scalar_one_or_none()
    return company


@router.get("/v2/all", response_model=list[WorkerInstanceListOut])
def get_all_company_workers_v2(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    [V2] Get ALL workers owned by company (all airports, all statuses).
    For inventory display.
    """
    company = _get_my_company(db, user.id)
    if not company:
        raise HTTPException(status_code=404, detail="No company found")

    # Get all workers owned by company
    query = select(WorkerInstance, Item.name.label("item_name")).join(
        Item, WorkerInstance.item_id == Item.id
    ).where(
        WorkerInstance.owner_company_id == company.id
    ).order_by(WorkerInstance.airport_ident, WorkerInstance.country_code)

    results = db.execute(query).all()

    workers = []
    for worker, item_name in results:
        workers.append(WorkerInstanceListOut(
            id=worker.id,
            item_name=item_name,
            country_code=worker.country_code,
            speed=worker.speed,
            resistance=worker.resistance,
            tier=worker.tier,
            hourly_salary=float(worker.hourly_salary),
            status=worker.status,
            airport_ident=worker.airport_ident,
            factory_id=worker.factory_id
        ))

    return workers


@router.get("/v2/inventory", response_model=InventoryWorkersOut)
def get_inventory_workers_v2(
    airport: str = Query(..., description="Airport ICAO code"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    [V2] Get workers available in company inventory at an airport.
    These are workers that can be assigned to factories.
    """
    company = _get_my_company(db, user.id)
    if not company:
        raise HTTPException(status_code=404, detail="No company found")

    airport_ident = airport.upper()

    # Get available workers owned by company at this airport
    query = select(WorkerInstance, Item.name.label("item_name")).join(
        Item, WorkerInstance.item_id == Item.id
    ).where(
        and_(
            WorkerInstance.owner_company_id == company.id,
            WorkerInstance.airport_ident == airport_ident,
            WorkerInstance.status == "available",
            WorkerInstance.factory_id.is_(None)
        )
    )

    results = db.execute(query).all()

    workers = []
    for worker, item_name in results:
        workers.append(WorkerInstanceListOut(
            id=worker.id,
            item_name=item_name,
            country_code=worker.country_code,
            speed=worker.speed,
            resistance=worker.resistance,
            tier=worker.tier,
            hourly_salary=float(worker.hourly_salary),
            status=worker.status,
            airport_ident=worker.airport_ident,
            factory_id=worker.factory_id
        ))

    return InventoryWorkersOut(
        airport_ident=airport_ident,
        company_id=company.id,
        total_workers=len(workers),
        workers=workers
    )


@router.get("/v2/{instance_id}", response_model=WorkerInstanceOut)
def get_worker_instance_v2(
    instance_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """[V2] Get a specific worker instance's details."""
    company = _get_my_company(db, user.id)

    query = select(WorkerInstance, Item.name.label("item_name")).join(
        Item, WorkerInstance.item_id == Item.id
    ).where(WorkerInstance.id == instance_id)

    result = db.execute(query).first()

    if not result:
        raise HTTPException(status_code=404, detail="Worker instance not found")

    worker, item_name = result

    # Check ownership (company or player)
    if company and worker.owner_company_id != company.id:
        if worker.owner_player_id != user.id:
            raise HTTPException(status_code=403, detail="Not your worker")

    return WorkerInstanceOut(
        id=worker.id,
        item_id=worker.item_id,
        item_name=item_name,
        country_code=worker.country_code,
        speed=worker.speed,
        resistance=worker.resistance,
        tier=worker.tier,
        xp=worker.xp,
        hourly_salary=float(worker.hourly_salary),
        status=worker.status,
        airport_ident=worker.airport_ident,
        factory_id=worker.factory_id,
        owner_company_id=worker.owner_company_id,
        owner_player_id=worker.owner_player_id,
        for_sale=worker.for_sale,
        sale_price=float(worker.sale_price) if worker.sale_price else None,
        injured_at=worker.injured_at,
        created_at=worker.created_at
    )


@router.post("/v2/{instance_id}/assign", response_model=WorkerInstanceOut)
def assign_worker_instance_v2(
    instance_id: uuid.UUID,
    assign_data: WorkerInstanceAssignIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """[V2] Assign a worker instance to a factory."""
    company = _get_my_company(db, user.id)
    if not company:
        raise HTTPException(status_code=404, detail="No company found")

    # Get worker instance
    worker = db.execute(
        select(WorkerInstance).where(WorkerInstance.id == instance_id)
    ).scalar_one_or_none()

    if not worker:
        raise HTTPException(status_code=404, detail="Worker instance not found")

    # Verify ownership
    if worker.owner_company_id != company.id:
        raise HTTPException(status_code=403, detail="Not your worker")

    if worker.status != "available":
        raise HTTPException(status_code=400, detail=f"Worker not available (status: {worker.status})")

    if worker.factory_id is not None:
        raise HTTPException(status_code=400, detail="Worker already assigned to a factory")

    # Get factory
    factory = db.execute(
        select(Factory).where(Factory.id == assign_data.factory_id)
    ).scalar_one_or_none()

    if not factory:
        raise HTTPException(status_code=404, detail="Factory not found")

    # Verify factory ownership
    if factory.company_id != company.id:
        raise HTTPException(status_code=403, detail="Not your factory")

    # Verify factory is at same airport as worker
    if factory.airport_ident != worker.airport_ident:
        raise HTTPException(
            status_code=400,
            detail=f"Worker at {worker.airport_ident}, factory at {factory.airport_ident}"
        )

    # Check capacity
    current_count = db.execute(
        select(func.count(WorkerInstance.id)).where(
            WorkerInstance.factory_id == factory.id
        )
    ).scalar() or 0

    if current_count >= factory.max_workers:
        raise HTTPException(
            status_code=400,
            detail=f"Factory at worker capacity ({current_count}/{factory.max_workers})"
        )

    # Assign worker
    worker.factory_id = factory.id
    worker.status = "working"

    db.commit()
    db.refresh(worker)

    # Get item name for response
    item = db.execute(select(Item).where(Item.id == worker.item_id)).scalar_one()

    logger.info(f"[Workers V2] Assigned worker {instance_id} to factory {factory.id}")

    return WorkerInstanceOut(
        id=worker.id,
        item_id=worker.item_id,
        item_name=item.name,
        country_code=worker.country_code,
        speed=worker.speed,
        resistance=worker.resistance,
        tier=worker.tier,
        xp=worker.xp,
        hourly_salary=float(worker.hourly_salary),
        status=worker.status,
        airport_ident=worker.airport_ident,
        factory_id=worker.factory_id,
        owner_company_id=worker.owner_company_id,
        owner_player_id=worker.owner_player_id,
        for_sale=worker.for_sale,
        sale_price=float(worker.sale_price) if worker.sale_price else None,
        injured_at=worker.injured_at,
        created_at=worker.created_at
    )


@router.post("/v2/{instance_id}/unassign", response_model=WorkerInstanceOut)
def unassign_worker_instance_v2(
    instance_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """[V2] Unassign a worker instance from factory (returns to inventory)."""
    company = _get_my_company(db, user.id)
    if not company:
        raise HTTPException(status_code=404, detail="No company found")

    # Get worker instance
    worker = db.execute(
        select(WorkerInstance).where(WorkerInstance.id == instance_id)
    ).scalar_one_or_none()

    if not worker:
        raise HTTPException(status_code=404, detail="Worker instance not found")

    # Verify ownership
    if worker.owner_company_id != company.id:
        raise HTTPException(status_code=403, detail="Not your worker")

    if worker.factory_id is None:
        raise HTTPException(status_code=400, detail="Worker not assigned to any factory")

    factory_id = worker.factory_id

    # Unassign worker
    worker.factory_id = None
    worker.status = "available"

    db.commit()
    db.refresh(worker)

    # Get item name for response
    item = db.execute(select(Item).where(Item.id == worker.item_id)).scalar_one()

    logger.info(f"[Workers V2] Unassigned worker {instance_id} from factory {factory_id}")

    return WorkerInstanceOut(
        id=worker.id,
        item_id=worker.item_id,
        item_name=item.name,
        country_code=worker.country_code,
        speed=worker.speed,
        resistance=worker.resistance,
        tier=worker.tier,
        xp=worker.xp,
        hourly_salary=float(worker.hourly_salary),
        status=worker.status,
        airport_ident=worker.airport_ident,
        factory_id=worker.factory_id,
        owner_company_id=worker.owner_company_id,
        owner_player_id=worker.owner_player_id,
        for_sale=worker.for_sale,
        sale_price=float(worker.sale_price) if worker.sale_price else None,
        injured_at=worker.injured_at,
        created_at=worker.created_at
    )


@router.get("/v2/factory/{factory_id}", response_model=FactoryWorkersV2Out)
def get_factory_workers_v2(
    factory_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """[V2] Get workers assigned to a factory."""
    company = _get_my_company(db, user.id)
    if not company:
        raise HTTPException(status_code=404, detail="No company found")

    # Get factory
    factory = db.execute(
        select(Factory).where(Factory.id == factory_id)
    ).scalar_one_or_none()

    if not factory:
        raise HTTPException(status_code=404, detail="Factory not found")

    # Verify ownership
    if factory.company_id != company.id:
        raise HTTPException(status_code=403, detail="Not your factory")

    # Get workers assigned to this factory
    query = select(WorkerInstance, Item.name.label("item_name")).join(
        Item, WorkerInstance.item_id == Item.id
    ).where(WorkerInstance.factory_id == factory_id)

    results = db.execute(query).all()

    workers = []
    for worker, item_name in results:
        workers.append(WorkerInstanceListOut(
            id=worker.id,
            item_name=item_name,
            country_code=worker.country_code,
            speed=worker.speed,
            resistance=worker.resistance,
            tier=worker.tier,
            hourly_salary=float(worker.hourly_salary),
            status=worker.status,
            airport_ident=worker.airport_ident,
            factory_id=worker.factory_id
        ))

    return FactoryWorkersV2Out(
        factory_id=factory_id,
        factory_name=factory.name,
        max_workers=factory.max_workers,
        current_workers=len(workers),
        workers=workers
    )
