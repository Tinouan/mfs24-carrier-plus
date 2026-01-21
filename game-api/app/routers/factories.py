"""
Factories router - Player-owned factory management.
"""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.deps import get_db, get_current_user
from app.models.user import User
from app.models.company_member import CompanyMember
from app.models.company import Company
from app.models.factory import Factory
from app.models.item import Item
from app.models.recipe import Recipe, RecipeIngredient
from app.models.worker import Worker
from app.models.engineer import Engineer
from app.models.factory_storage import FactoryStorage
from app.models.production_batch import ProductionBatch
from app.models.factory_transaction import FactoryTransaction
from app.schemas.factories import (
    FactoryOut,
    FactoryListOut,
    FactoryCreateIn,
    FactoryUpdateIn,
    WorkerOut,
    WorkerCreateIn,
    WorkerUpdateIn,
    EngineerOut,
    EngineerCreateIn,
    FactoryStorageOut,
    FactoryStorageLineOut,
    StorageDepositIn,
    StorageWithdrawIn,
    ProductionBatchOut,
    StartProductionIn,
    FactoryTransactionOut,
    FactoryStatsOut,
)

router = APIRouter(prefix="/factories", tags=["factories"])


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


def _get_factory_or_404(db: Session, company_id: uuid.UUID, factory_id: uuid.UUID):
    """Get factory or raise 404."""
    factory = db.query(Factory).filter(
        Factory.id == factory_id,
        Factory.company_id == company_id,
    ).first()
    if not factory:
        raise HTTPException(status_code=404, detail="Factory not found")
    return factory


def _check_slot_available(db: Session, airport_ident: str, slot_index: int):
    """Check if slot is available."""
    existing = db.query(Factory).filter(
        Factory.airport_ident == airport_ident,
        Factory.slot_index == slot_index,
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Slot {slot_index} at {airport_ident} is already occupied"
        )


# =====================================================
# FACTORIES CRUD
# =====================================================

@router.get("", response_model=list[FactoryListOut])
def list_my_factories(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List all factories owned by current company."""
    c, _cm = _get_my_company(db, user.id)
    if not c:
        raise HTTPException(status_code=404, detail="No company")

    factories = db.query(Factory).filter(Factory.company_id == c.id).all()

    result = []
    for f in factories:
        # Get active recipe name
        recipe_name = None
        if f.active_recipe_id:
            recipe = db.query(Recipe).filter(Recipe.id == f.active_recipe_id).first()
            if recipe:
                recipe_name = recipe.name

        # Count workers
        worker_count = db.query(Worker).filter(
            Worker.factory_id == f.id,
            Worker.is_active == True
        ).count()

        result.append(
            FactoryListOut(
                id=f.id,
                airport_ident=f.airport_ident,
                slot_index=f.slot_index,
                factory_type=f.factory_type.value,
                factory_icon=f.factory_icon,
                status=f.status.value,
                health=f.health,
                active_recipe_name=recipe_name,
                worker_count=worker_count,
                has_engineer=f.has_engineer,
            )
        )

    return result


@router.post("", response_model=FactoryOut, status_code=201)
def create_factory(
    data: FactoryCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a new factory at specified airport/slot."""
    c, _cm = _get_my_company(db, user.id)
    if not c:
        raise HTTPException(status_code=404, detail="No company")

    # Check slot availability
    _check_slot_available(db, data.airport_ident, data.slot_index)

    # TODO: Check if airport exists and has available slots
    # TODO: Deduct construction cost from company balance

    # Create factory
    factory = Factory(
        company_id=c.id,
        airport_ident=data.airport_ident,
        slot_index=data.slot_index,
        status=FactoryStatus.IDLE,
        factory_type=FactoryType.NONE,
        health=100,
        has_engineer=False,
        food_buff_percent=0,
        total_production_hours=0,
    )
    db.add(factory)
    db.commit()
    db.refresh(factory)

    return FactoryOut(
        id=factory.id,
        company_id=factory.company_id,
        airport_ident=factory.airport_ident,
        slot_index=factory.slot_index,
        active_recipe_id=None,
        active_recipe_name=None,
        factory_type=factory.factory_type.value,
        factory_icon=factory.factory_icon,
        status=factory.status.value,
        health=factory.health,
        has_engineer=factory.has_engineer,
        last_tick_at=factory.last_tick_at,
        total_production_hours=factory.total_production_hours,
        food_buff_percent=factory.food_buff_percent,
        created_at=factory.created_at,
        updated_at=factory.updated_at,
        workers=[],
        engineer=None,
    )


@router.get("/{factory_id}", response_model=FactoryOut)
def get_factory_details(
    factory_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get detailed factory information."""
    c, _cm = _get_my_company(db, user.id)
    if not c:
        raise HTTPException(status_code=404, detail="No company")

    factory = _get_factory_or_404(db, c.id, factory_id)

    # Get active recipe name
    recipe_name = None
    if factory.active_recipe_id:
        recipe = db.query(Recipe).filter(Recipe.id == factory.active_recipe_id).first()
        if recipe:
            recipe_name = recipe.name

    # Get workers
    workers = db.query(Worker).filter(Worker.factory_id == factory.id).all()
    workers_out = [
        WorkerOut(
            id=w.id,
            factory_id=w.factory_id,
            name=w.name,
            xp=w.xp,
            tier=w.tier,
            hourly_salary=w.hourly_salary,
            unpaid_hours=w.unpaid_hours,
            is_active=w.is_active,
            hired_at=w.hired_at,
            last_worked_at=w.last_worked_at,
        )
        for w in workers
    ]

    # Get engineer
    engineer = db.query(Engineer).filter(Engineer.factory_id == factory.id).first()
    engineer_out = None
    if engineer:
        engineer_out = EngineerOut(
            id=engineer.id,
            factory_id=engineer.factory_id,
            name=engineer.name,
            hourly_salary=engineer.hourly_salary,
            unpaid_hours=engineer.unpaid_hours,
            is_active=engineer.is_active,
            hired_at=engineer.hired_at,
            last_worked_at=engineer.last_worked_at,
        )

    return FactoryOut(
        id=factory.id,
        company_id=factory.company_id,
        airport_ident=factory.airport_ident,
        slot_index=factory.slot_index,
        active_recipe_id=factory.active_recipe_id,
        active_recipe_name=recipe_name,
        factory_type=factory.factory_type.value,
        factory_icon=factory.factory_icon,
        status=factory.status.value,
        health=factory.health,
        has_engineer=factory.has_engineer,
        last_tick_at=factory.last_tick_at,
        total_production_hours=factory.total_production_hours,
        food_buff_percent=factory.food_buff_percent,
        created_at=factory.created_at,
        updated_at=factory.updated_at,
        workers=workers_out,
        engineer=engineer_out,
    )


@router.patch("/{factory_id}", response_model=FactoryOut)
def update_factory(
    factory_id: uuid.UUID,
    data: FactoryUpdateIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update factory (set recipe or status)."""
    c, _cm = _get_my_company(db, user.id)
    if not c:
        raise HTTPException(status_code=404, detail="No company")

    factory = _get_factory_or_404(db, c.id, factory_id)

    # Update active recipe
    if data.active_recipe_id is not None:
        # Verify recipe exists
        recipe = db.query(Recipe).filter(Recipe.id == data.active_recipe_id).first()
        if not recipe:
            raise HTTPException(status_code=404, detail="Recipe not found")
        factory.active_recipe_id = data.active_recipe_id
        # Factory type will be auto-updated by trigger

    # Update status
    if data.status is not None:
        factory.status = FactoryStatus(data.status)

    db.commit()
    db.refresh(factory)

    # Return updated factory (same as get_factory_details)
    return get_factory_details(factory_id, db, user)


@router.delete("/{factory_id}", status_code=204)
def delete_factory(
    factory_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Destroy factory (with cascading delete of workers, storage, etc.)."""
    c, _cm = _get_my_company(db, user.id)
    if not c:
        raise HTTPException(status_code=404, detail="No company")

    factory = _get_factory_or_404(db, c.id, factory_id)

    # TODO: Refund partial cost to company balance
    # TODO: Return items from factory storage to company inventory

    db.delete(factory)
    db.commit()


# =====================================================
# PRODUCTION CONTROL
# =====================================================

@router.post("/{factory_id}/start", response_model=ProductionBatchOut, status_code=201)
def start_production(
    factory_id: uuid.UUID,
    data: StartProductionIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Start production batch."""
    c, _cm = _get_my_company(db, user.id)
    if not c:
        raise HTTPException(status_code=404, detail="No company")

    factory = _get_factory_or_404(db, c.id, factory_id)

    # Check factory status
    if factory.status == FactoryStatus.PRODUCING:
        raise HTTPException(status_code=400, detail="Factory already producing")

    # Check recipe exists
    recipe = db.query(Recipe).filter(Recipe.id == data.recipe_id).first()
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    # TODO: Check if factory has enough inputs in storage
    # TODO: Calculate production rate multiplier (workers, engineer, health, food buff)

    # Create production batch
    batch = ProductionBatch(
        factory_id=factory.id,
        recipe_id=data.recipe_id,
        quantity_to_produce=data.quantity_to_produce,
        quantity_produced=0,
        progress_percent=0.0,
        hours_elapsed=0.0,
        hours_required=float(recipe.production_time_hours) * data.quantity_to_produce,
        production_rate_multiplier=1.0,  # TODO: Calculate
        started_at=datetime.utcnow(),
    )
    db.add(batch)

    # Update factory
    factory.status = FactoryStatus.PRODUCING
    factory.active_recipe_id = data.recipe_id
    factory.last_tick_at = datetime.utcnow()

    db.commit()
    db.refresh(batch)

    return ProductionBatchOut(
        id=batch.id,
        factory_id=batch.factory_id,
        recipe_id=batch.recipe_id,
        recipe_name=recipe.name,
        quantity_to_produce=batch.quantity_to_produce,
        quantity_produced=batch.quantity_produced,
        progress_percent=float(batch.progress_percent),
        hours_elapsed=float(batch.hours_elapsed),
        hours_required=float(batch.hours_required),
        production_rate_multiplier=float(batch.production_rate_multiplier),
        started_at=batch.started_at,
        completed_at=batch.completed_at,
    )


@router.post("/{factory_id}/stop", status_code=200)
def stop_production(
    factory_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Stop production."""
    c, _cm = _get_my_company(db, user.id)
    if not c:
        raise HTTPException(status_code=404, detail="No company")

    factory = _get_factory_or_404(db, c.id, factory_id)

    # Update factory status
    factory.status = FactoryStatus.IDLE

    # Complete current batch (if any)
    batch = db.query(ProductionBatch).filter(
        ProductionBatch.factory_id == factory.id,
        ProductionBatch.completed_at == None
    ).first()
    if batch:
        batch.completed_at = datetime.utcnow()

    db.commit()

    return {"message": "Production stopped"}


# =====================================================
# WORKERS
# =====================================================

@router.post("/{factory_id}/workers", response_model=WorkerOut, status_code=201)
def hire_worker(
    factory_id: uuid.UUID,
    data: WorkerCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Hire a worker for this factory."""
    c, _cm = _get_my_company(db, user.id)
    if not c:
        raise HTTPException(status_code=404, detail="No company")

    factory = _get_factory_or_404(db, c.id, factory_id)

    # TODO: Check company balance for hiring cost
    # TODO: Limit max workers per factory

    worker = Worker(
        factory_id=factory.id,
        name=data.name,
        xp=0,
        tier=1,
        hourly_salary=data.hourly_salary,
        unpaid_hours=0,
        is_active=True,
        hired_at=datetime.utcnow(),
    )
    db.add(worker)
    db.commit()
    db.refresh(worker)

    return WorkerOut(
        id=worker.id,
        factory_id=worker.factory_id,
        name=worker.name,
        xp=worker.xp,
        tier=worker.tier,
        hourly_salary=worker.hourly_salary,
        unpaid_hours=worker.unpaid_hours,
        is_active=worker.is_active,
        hired_at=worker.hired_at,
        last_worked_at=worker.last_worked_at,
    )


@router.get("/{factory_id}/workers", response_model=list[WorkerOut])
def list_workers(
    factory_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List all workers in this factory."""
    c, _cm = _get_my_company(db, user.id)
    if not c:
        raise HTTPException(status_code=404, detail="No company")

    factory = _get_factory_or_404(db, c.id, factory_id)

    workers = db.query(Worker).filter(Worker.factory_id == factory.id).all()

    return [
        WorkerOut(
            id=w.id,
            factory_id=w.factory_id,
            name=w.name,
            xp=w.xp,
            tier=w.tier,
            hourly_salary=w.hourly_salary,
            unpaid_hours=w.unpaid_hours,
            is_active=w.is_active,
            hired_at=w.hired_at,
            last_worked_at=w.last_worked_at,
        )
        for w in workers
    ]


@router.delete("/{factory_id}/workers/{worker_id}", status_code=204)
def fire_worker(
    factory_id: uuid.UUID,
    worker_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Fire a worker."""
    c, _cm = _get_my_company(db, user.id)
    if not c:
        raise HTTPException(status_code=404, detail="No company")

    factory = _get_factory_or_404(db, c.id, factory_id)

    worker = db.query(Worker).filter(
        Worker.id == worker_id,
        Worker.factory_id == factory.id
    ).first()
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")

    # TODO: Pay unpaid salary before firing

    db.delete(worker)
    db.commit()


# =====================================================
# ENGINEER
# =====================================================

@router.post("/{factory_id}/engineer", response_model=EngineerOut, status_code=201)
def hire_engineer(
    factory_id: uuid.UUID,
    data: EngineerCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Hire an engineer for this factory (max 1 per factory)."""
    c, _cm = _get_my_company(db, user.id)
    if not c:
        raise HTTPException(status_code=404, detail="No company")

    factory = _get_factory_or_404(db, c.id, factory_id)

    # Check if engineer already exists
    existing = db.query(Engineer).filter(Engineer.factory_id == factory.id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Factory already has an engineer")

    # TODO: Check company balance for hiring cost

    engineer = Engineer(
        factory_id=factory.id,
        name=data.name,
        hourly_salary=data.hourly_salary,
        unpaid_hours=0,
        is_active=True,
        hired_at=datetime.utcnow(),
    )
    db.add(engineer)

    factory.has_engineer = True

    db.commit()
    db.refresh(engineer)

    return EngineerOut(
        id=engineer.id,
        factory_id=engineer.factory_id,
        name=engineer.name,
        hourly_salary=engineer.hourly_salary,
        unpaid_hours=engineer.unpaid_hours,
        is_active=engineer.is_active,
        hired_at=engineer.hired_at,
        last_worked_at=engineer.last_worked_at,
    )


@router.delete("/{factory_id}/engineer", status_code=204)
def fire_engineer(
    factory_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Fire the factory engineer."""
    c, _cm = _get_my_company(db, user.id)
    if not c:
        raise HTTPException(status_code=404, detail="No company")

    factory = _get_factory_or_404(db, c.id, factory_id)

    engineer = db.query(Engineer).filter(Engineer.factory_id == factory.id).first()
    if not engineer:
        raise HTTPException(status_code=404, detail="No engineer found")

    # TODO: Pay unpaid salary before firing

    db.delete(engineer)
    factory.has_engineer = False
    db.commit()


# =====================================================
# STORAGE
# =====================================================

@router.get("/{factory_id}/storage", response_model=FactoryStorageOut)
def get_factory_storage(
    factory_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get factory storage inventory."""
    c, _cm = _get_my_company(db, user.id)
    if not c:
        raise HTTPException(status_code=404, detail="No company")

    factory = _get_factory_or_404(db, c.id, factory_id)

    storage_items = db.query(FactoryStorage, Item).join(
        Item, FactoryStorage.item_id == Item.id
    ).filter(
        FactoryStorage.factory_id == factory.id
    ).all()

    items_out = [
        FactoryStorageLineOut(
            item_id=storage.item_id,
            item_name=item.name,
            item_icon=item.icon,
            quantity=storage.quantity,
        )
        for storage, item in storage_items
    ]

    return FactoryStorageOut(
        factory_id=factory.id,
        items=items_out,
    )


@router.post("/{factory_id}/storage/deposit", status_code=200)
def deposit_to_storage(
    factory_id: uuid.UUID,
    data: StorageDepositIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Deposit items from company inventory to factory storage."""
    c, _cm = _get_my_company(db, user.id)
    if not c:
        raise HTTPException(status_code=404, detail="No company")

    factory = _get_factory_or_404(db, c.id, factory_id)

    # TODO: Check if item exists in company inventory at factory airport
    # TODO: Remove from company inventory
    # TODO: Add to factory storage

    # For now, just add to factory storage
    storage = db.query(FactoryStorage).filter(
        FactoryStorage.factory_id == factory.id,
        FactoryStorage.item_id == data.item_id
    ).first()

    if storage:
        storage.quantity += data.quantity
    else:
        storage = FactoryStorage(
            factory_id=factory.id,
            item_id=data.item_id,
            quantity=data.quantity
        )
        db.add(storage)

    # Log transaction
    transaction = FactoryTransaction(
        factory_id=factory.id,
        item_id=data.item_id,
        transaction_type=TransactionType.DEPOSIT,
        quantity=data.quantity,
        notes="Manual deposit"
    )
    db.add(transaction)

    db.commit()

    return {"message": f"Deposited {data.quantity} items"}


@router.post("/{factory_id}/storage/withdraw", status_code=200)
def withdraw_from_storage(
    factory_id: uuid.UUID,
    data: StorageWithdrawIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Withdraw items from factory storage to company inventory."""
    c, _cm = _get_my_company(db, user.id)
    if not c:
        raise HTTPException(status_code=404, detail="No company")

    factory = _get_factory_or_404(db, c.id, factory_id)

    # Check storage
    storage = db.query(FactoryStorage).filter(
        FactoryStorage.factory_id == factory.id,
        FactoryStorage.item_id == data.item_id
    ).first()

    if not storage or storage.quantity < data.quantity:
        raise HTTPException(status_code=400, detail="Insufficient items in storage")

    # Remove from storage
    storage.quantity -= data.quantity
    if storage.quantity == 0:
        db.delete(storage)

    # TODO: Add to company inventory at factory airport

    # Log transaction
    transaction = FactoryTransaction(
        factory_id=factory.id,
        item_id=data.item_id,
        transaction_type=TransactionType.WITHDRAW,
        quantity=-data.quantity,
        notes="Manual withdrawal"
    )
    db.add(transaction)

    db.commit()

    return {"message": f"Withdrew {data.quantity} items"}


# =====================================================
# STATS
# =====================================================

@router.get("/stats/overview", response_model=FactoryStatsOut)
def get_factory_stats(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get factory statistics for current company."""
    c, _cm = _get_my_company(db, user.id)
    if not c:
        raise HTTPException(status_code=404, detail="No company")

    # Count factories by status
    total = db.query(Factory).filter(Factory.company_id == c.id).count()
    idle = db.query(Factory).filter(
        Factory.company_id == c.id,
        Factory.status == FactoryStatus.IDLE
    ).count()
    producing = db.query(Factory).filter(
        Factory.company_id == c.id,
        Factory.status == FactoryStatus.PRODUCING
    ).count()
    paused = db.query(Factory).filter(
        Factory.company_id == c.id,
        Factory.status == FactoryStatus.PAUSED
    ).count()
    broken = db.query(Factory).filter(
        Factory.company_id == c.id,
        Factory.status == FactoryStatus.BROKEN
    ).count()

    # Count workers and engineers
    factory_ids = [f.id for f in db.query(Factory.id).filter(Factory.company_id == c.id).all()]
    total_workers = db.query(Worker).filter(
        Worker.factory_id.in_(factory_ids),
        Worker.is_active == True
    ).count()
    total_engineers = db.query(Engineer).filter(
        Engineer.factory_id.in_(factory_ids),
        Engineer.is_active == True
    ).count()

    # Sum production hours
    total_hours = db.query(func.sum(Factory.total_production_hours)).filter(
        Factory.company_id == c.id
    ).scalar() or 0

    return FactoryStatsOut(
        total_factories=total,
        idle_factories=idle,
        producing_factories=producing,
        paused_factories=paused,
        broken_factories=broken,
        total_workers=total_workers,
        total_engineers=total_engineers,
        total_production_hours=int(total_hours),
    )
