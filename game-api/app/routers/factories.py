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
from app.models.airport import Airport
from app.models.inventory_location import InventoryLocation
from app.models.inventory_item import InventoryItem
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

    factories = db.query(Factory).filter(
        Factory.company_id == c.id,
        Factory.is_active == True
    ).all()

    return [
        FactoryListOut(
            id=f.id,
            name=f.name,
            airport_ident=f.airport_ident,
            factory_type=f.factory_type,
            status=f.status,
            is_active=f.is_active,
        )
        for f in factories
    ]


@router.post("", response_model=FactoryOut, status_code=201)
def create_factory(
    data: FactoryCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a new factory at specified airport."""
    c, _cm = _get_my_company(db, user.id)
    if not c:
        raise HTTPException(status_code=404, detail="No company")

    # Validate airport exists
    airport = db.query(Airport).filter(Airport.ident == data.airport_ident).first()
    if not airport:
        raise HTTPException(status_code=404, detail=f"Airport {data.airport_ident} not found")

    # Check if airport has factory slots available
    if airport.max_factories_slots == 0:
        raise HTTPException(status_code=400, detail=f"Airport {data.airport_ident} does not support factories")

    # Count existing T1+ factories at this airport (T0 NPC factories don't count)
    # For now, all player-owned factories are T1+ (T0 will be NPC-only in future)
    occupied_count = db.query(func.count(Factory.id)).filter(
        Factory.airport_ident == data.airport_ident,
        Factory.is_active == True
    ).scalar()

    if occupied_count >= airport.max_factories_slots:
        raise HTTPException(
            status_code=400,
            detail=f"Airport {data.airport_ident} has no available factory slots ({occupied_count}/{airport.max_factories_slots})"
        )

    # Construction cost - TODO: Define factory construction cost system
    # When implemented, should:
    # 1. Define base cost (e.g., in a config or factory_types table)
    # 2. Check if company balance >= cost
    # 3. Deduct cost from c.balance
    # 4. Log transaction in company_transactions
    # For now, factories are free to build

    # Create factory with defaults
    factory = Factory(
        company_id=c.id,
        airport_ident=data.airport_ident,
        name=data.name,
        status="idle",  # Default status
        is_active=True,
    )
    db.add(factory)
    db.commit()
    db.refresh(factory)

    return FactoryOut(
        id=factory.id,
        company_id=factory.company_id,
        airport_ident=factory.airport_ident,
        name=factory.name,
        factory_type=factory.factory_type,
        status=factory.status,
        current_recipe_id=factory.current_recipe_id,
        is_active=factory.is_active,
        created_at=factory.created_at,
        updated_at=factory.updated_at,
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

    return FactoryOut(
        id=factory.id,
        company_id=factory.company_id,
        airport_ident=factory.airport_ident,
        name=factory.name,
        factory_type=factory.factory_type,
        status=factory.status,
        current_recipe_id=factory.current_recipe_id,
        is_active=factory.is_active,
        created_at=factory.created_at,
        updated_at=factory.updated_at,
    )


@router.patch("/{factory_id}", response_model=FactoryOut)
def update_factory(
    factory_id: uuid.UUID,
    data: FactoryUpdateIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update factory name, recipe, or status."""
    c, _cm = _get_my_company(db, user.id)
    if not c:
        raise HTTPException(status_code=404, detail="No company")

    factory = _get_factory_or_404(db, c.id, factory_id)

    # Update name
    if data.name is not None:
        factory.name = data.name

    # Update current recipe
    if data.current_recipe_id is not None:
        # Verify recipe exists
        recipe = db.query(Recipe).filter(Recipe.id == data.current_recipe_id).first()
        if not recipe:
            raise HTTPException(status_code=404, detail="Recipe not found")
        factory.current_recipe_id = data.current_recipe_id
        # TODO: Factory type will be auto-updated by trigger (when implemented)

    # Update status
    if data.status is not None:
        valid_statuses = ["idle", "producing", "maintenance", "offline"]
        if data.status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}")
        factory.status = data.status

    db.commit()
    db.refresh(factory)

    return FactoryOut(
        id=factory.id,
        company_id=factory.company_id,
        airport_ident=factory.airport_ident,
        name=factory.name,
        factory_type=factory.factory_type,
        status=factory.status,
        current_recipe_id=factory.current_recipe_id,
        is_active=factory.is_active,
        created_at=factory.created_at,
        updated_at=factory.updated_at,
    )


@router.delete("/{factory_id}", status_code=204)
def delete_factory(
    factory_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete factory (soft delete via is_active=false)."""
    c, _cm = _get_my_company(db, user.id)
    if not c:
        raise HTTPException(status_code=404, detail="No company")

    factory = _get_factory_or_404(db, c.id, factory_id)

    # Check if factory has active production
    active_batch = db.query(ProductionBatch).filter(
        ProductionBatch.factory_id == factory.id,
        ProductionBatch.status.in_(["pending", "in_progress"]),
        ProductionBatch.completed_at == None
    ).first()

    if active_batch:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete factory with active production. Stop production first."
        )

    # Return items from factory storage to company inventory
    # TODO: Implement when company inventory system is ready
    # For now, check if storage has items and warn
    storage_items = db.query(FactoryStorage).filter(
        FactoryStorage.factory_id == factory.id,
        FactoryStorage.quantity > 0
    ).count()

    if storage_items > 0:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete factory with items in storage. Withdraw all items first."
        )

    # Release workers (soft delete)
    db.query(Worker).filter(
        Worker.factory_id == factory.id,
        Worker.is_active == True
    ).update({"is_active": False})

    # Refund partial cost - TODO: Define when construction cost system is implemented
    # Should refund a percentage based on factory age/condition

    # Soft delete factory
    factory.is_active = False
    db.commit()


# =====================================================
# PRODUCTION CONTROL
# =====================================================

@router.post("/{factory_id}/production", response_model=ProductionBatchOut, status_code=201)
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
    if factory.status == "producing":
        raise HTTPException(status_code=400, detail="Factory already producing")

    # Check recipe exists
    recipe = db.query(Recipe).filter(Recipe.id == data.recipe_id).first()
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    # Check if factory has enough ingredients in storage
    recipe_ingredients = db.query(RecipeIngredient).filter(
        RecipeIngredient.recipe_id == recipe.id
    ).all()

    for ingredient in recipe_ingredients:
        storage = db.query(FactoryStorage).filter(
            FactoryStorage.factory_id == factory.id,
            FactoryStorage.item_id == ingredient.item_id
        ).first()

        available_qty = storage.quantity if storage else 0
        if available_qty < ingredient.quantity:
            # Get item name for error message
            item = db.query(Item).filter(Item.id == ingredient.item_id).first()
            item_name = item.name if item else str(ingredient.item_id)
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient {item_name} in storage. Required: {ingredient.quantity}, Available: {available_qty}"
            )

    # Check if workers assigned <= available workers in factory
    available_workers = db.query(func.count(Worker.id)).filter(
        Worker.factory_id == factory.id,
        Worker.is_active == True
    ).scalar()

    if data.workers_assigned > available_workers:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot assign {data.workers_assigned} workers. Only {available_workers} available."
        )

    # Check for engineer bonus (1 engineer per factory)
    engineer = db.query(Engineer).filter(
        Engineer.factory_id == factory.id,
        Engineer.is_active == True
    ).first()

    engineer_bonus = engineer is not None

    # Calculate estimated completion
    production_time = float(recipe.production_time_hours)
    # In a real implementation, this would be: now + production_time hours
    estimated_completion = datetime.utcnow()  # Placeholder

    # Consume ingredients from storage
    for ingredient in recipe_ingredients:
        storage = db.query(FactoryStorage).filter(
            FactoryStorage.factory_id == factory.id,
            FactoryStorage.item_id == ingredient.item_id
        ).first()

        storage.quantity -= ingredient.quantity
        if storage.quantity == 0:
            db.delete(storage)

        # Log consumption transaction
        transaction = FactoryTransaction(
            factory_id=factory.id,
            item_id=ingredient.item_id,
            transaction_type="consumed",
            quantity=-ingredient.quantity,
            notes=f"Production batch started: {recipe.name}"
        )
        db.add(transaction)

    # Create production batch
    batch = ProductionBatch(
        factory_id=factory.id,
        recipe_id=data.recipe_id,
        status="pending",
        workers_assigned=data.workers_assigned,
        result_quantity=recipe.result_quantity,
        engineer_bonus_applied=engineer_bonus,
        started_at=datetime.utcnow(),
        estimated_completion=estimated_completion,
    )
    db.add(batch)

    # Update factory
    factory.status = "producing"
    factory.current_recipe_id = data.recipe_id

    db.commit()
    db.refresh(batch)

    return ProductionBatchOut(
        id=batch.id,
        factory_id=batch.factory_id,
        recipe_id=batch.recipe_id,
        status=batch.status,
        started_at=batch.started_at,
        estimated_completion=batch.estimated_completion,
        completed_at=batch.completed_at,
        result_quantity=batch.result_quantity,
        workers_assigned=batch.workers_assigned,
        engineer_bonus_applied=batch.engineer_bonus_applied,
        created_at=batch.created_at,
    )


@router.get("/{factory_id}/production", response_model=list[ProductionBatchOut])
def list_production_batches(
    factory_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List production batches for this factory."""
    c, _cm = _get_my_company(db, user.id)
    if not c:
        raise HTTPException(status_code=404, detail="No company")

    factory = _get_factory_or_404(db, c.id, factory_id)

    batches = db.query(ProductionBatch).filter(
        ProductionBatch.factory_id == factory.id
    ).order_by(ProductionBatch.created_at.desc()).limit(50).all()

    return [
        ProductionBatchOut(
            id=b.id,
            factory_id=b.factory_id,
            recipe_id=b.recipe_id,
            status=b.status,
            started_at=b.started_at,
            estimated_completion=b.estimated_completion,
            completed_at=b.completed_at,
            result_quantity=b.result_quantity,
            workers_assigned=b.workers_assigned,
            engineer_bonus_applied=b.engineer_bonus_applied,
            created_at=b.created_at,
        )
        for b in batches
    ]


@router.post("/{factory_id}/production/stop", status_code=200)
def stop_production(
    factory_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Stop current production."""
    c, _cm = _get_my_company(db, user.id)
    if not c:
        raise HTTPException(status_code=404, detail="No company")

    factory = _get_factory_or_404(db, c.id, factory_id)

    # Update factory status
    factory.status = "idle"

    # Cancel current batch (if any)
    batch = db.query(ProductionBatch).filter(
        ProductionBatch.factory_id == factory.id,
        ProductionBatch.status.in_(["pending", "in_progress"]),
        ProductionBatch.completed_at == None
    ).first()
    if batch:
        batch.status = "cancelled"
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

    # Limit max workers per factory (reasonable limit)
    # TODO: Define this in config or based on factory tier
    MAX_WORKERS_PER_FACTORY = 10

    current_workers = db.query(func.count(Worker.id)).filter(
        Worker.factory_id == factory.id,
        Worker.is_active == True
    ).scalar()

    if current_workers >= MAX_WORKERS_PER_FACTORY:
        raise HTTPException(
            status_code=400,
            detail=f"Factory has reached maximum worker capacity ({MAX_WORKERS_PER_FACTORY})"
        )

    # Check company balance for hiring cost
    # TODO: Define worker hiring cost system (may vary by tier, location, etc.)
    # For now, workers are free to hire
    # When implemented:
    # HIRING_COST = 1000  # Example base cost
    # if c.balance < HIRING_COST:
    #     raise HTTPException(status_code=400, detail="Insufficient funds to hire worker")
    # c.balance -= HIRING_COST

    # Create worker with T0 defaults
    worker = Worker(
        factory_id=factory.id,
        first_name=data.first_name,
        last_name=data.last_name,
        tier=0,  # Starts at T0
        health=100,
        happiness=80,
        xp=0,
        is_active=True,
    )
    db.add(worker)
    db.commit()
    db.refresh(worker)

    return WorkerOut(
        id=worker.id,
        factory_id=worker.factory_id,
        first_name=worker.first_name,
        last_name=worker.last_name,
        tier=worker.tier,
        health=worker.health,
        happiness=worker.happiness,
        xp=worker.xp,
        is_active=worker.is_active,
        created_at=worker.created_at,
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

    workers = db.query(Worker).filter(
        Worker.factory_id == factory.id,
        Worker.is_active == True
    ).all()

    return [
        WorkerOut(
            id=w.id,
            factory_id=w.factory_id,
            first_name=w.first_name,
            last_name=w.last_name,
            tier=w.tier,
            health=w.health,
            happiness=w.happiness,
            xp=w.xp,
            is_active=w.is_active,
            created_at=w.created_at,
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
    """Fire a worker (soft delete)."""
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

    # Soft delete
    worker.is_active = False
    db.commit()


# =====================================================
# ENGINEERS
# =====================================================

@router.post("/engineers", response_model=EngineerOut, status_code=201)
def hire_engineer(
    data: EngineerCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Hire an engineer for a specific factory (1 engineer per factory max)."""
    c, _cm = _get_my_company(db, user.id)
    if not c:
        raise HTTPException(status_code=404, detail="No company")

    # Validate factory exists and belongs to company
    factory = _get_factory_or_404(db, c.id, data.factory_id)

    # Check if factory already has an engineer (1 per factory max)
    existing_engineer = db.query(Engineer).filter(
        Engineer.factory_id == factory.id,
        Engineer.is_active == True
    ).first()

    if existing_engineer:
        raise HTTPException(
            status_code=400,
            detail=f"Factory already has an engineer: {existing_engineer.name}"
        )

    # Check company balance for hiring cost
    # TODO: Define engineer hiring cost system (likely higher than workers)
    # For now, engineers are free to hire
    # When implemented:
    # HIRING_COST = 5000  # Example base cost
    # if c.balance < HIRING_COST:
    #     raise HTTPException(status_code=400, detail="Insufficient funds to hire engineer")
    # c.balance -= HIRING_COST

    # Create engineer
    engineer = Engineer(
        company_id=c.id,
        factory_id=factory.id,
        name=data.name,
        specialization=data.specialization,
        bonus_percentage=10,  # Default 10%
        experience=0,
        is_active=True,
    )
    db.add(engineer)
    db.commit()
    db.refresh(engineer)

    return EngineerOut(
        id=engineer.id,
        company_id=engineer.company_id,
        factory_id=engineer.factory_id,
        name=engineer.name,
        specialization=engineer.specialization,
        bonus_percentage=engineer.bonus_percentage,
        experience=engineer.experience,
        is_active=engineer.is_active,
        created_at=engineer.created_at,
    )


@router.get("/engineers", response_model=list[EngineerOut])
def list_my_engineers(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List all engineers for current company."""
    c, _cm = _get_my_company(db, user.id)
    if not c:
        raise HTTPException(status_code=404, detail="No company")

    engineers = db.query(Engineer).filter(
        Engineer.company_id == c.id,
        Engineer.is_active == True
    ).all()

    return [
        EngineerOut(
            id=e.id,
            company_id=e.company_id,
            factory_id=e.factory_id,
            name=e.name,
            specialization=e.specialization,
            bonus_percentage=e.bonus_percentage,
            experience=e.experience,
            is_active=e.is_active,
            created_at=e.created_at,
        )
        for e in engineers
    ]


@router.delete("/engineers/{engineer_id}", status_code=204)
def fire_engineer(
    engineer_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Fire an engineer (soft delete)."""
    c, _cm = _get_my_company(db, user.id)
    if not c:
        raise HTTPException(status_code=404, detail="No company")

    engineer = db.query(Engineer).filter(
        Engineer.id == engineer_id,
        Engineer.company_id == c.id
    ).first()
    if not engineer:
        raise HTTPException(status_code=404, detail="Engineer not found")

    # Soft delete
    engineer.is_active = False
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

    # Check if item exists in company inventory at factory airport
    warehouse = db.query(InventoryLocation).filter(
        InventoryLocation.company_id == c.id,
        InventoryLocation.kind == "warehouse",
        InventoryLocation.airport_ident == factory.airport_ident
    ).first()

    if not warehouse:
        raise HTTPException(
            status_code=404,
            detail=f"No warehouse found at {factory.airport_ident}"
        )

    inventory = db.query(InventoryItem).filter(
        InventoryItem.location_id == warehouse.id,
        InventoryItem.item_id == data.item_id
    ).first()

    if not inventory or inventory.qty < data.quantity:
        available_qty = inventory.qty if inventory else 0
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient items in warehouse. Available: {available_qty}, Requested: {data.quantity}"
        )

    # Remove from company inventory
    inventory.qty -= data.quantity
    if inventory.qty == 0:
        db.delete(inventory)

    # Add to factory storage
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
        transaction_type="input",
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

    # Add to company inventory at factory airport
    # Find or create warehouse location at factory airport
    warehouse = db.query(InventoryLocation).filter(
        InventoryLocation.company_id == c.id,
        InventoryLocation.kind == "warehouse",
        InventoryLocation.airport_ident == factory.airport_ident
    ).first()

    if not warehouse:
        # Create warehouse location at this airport
        warehouse = InventoryLocation(
            company_id=c.id,
            kind="warehouse",
            airport_ident=factory.airport_ident,
            name=f"Warehouse @ {factory.airport_ident}"
        )
        db.add(warehouse)
        db.flush()  # Get the ID

    # Add items to inventory
    inventory = db.query(InventoryItem).filter(
        InventoryItem.location_id == warehouse.id,
        InventoryItem.item_id == data.item_id
    ).first()

    if inventory:
        inventory.qty += data.quantity
    else:
        inventory = InventoryItem(
            location_id=warehouse.id,
            item_id=data.item_id,
            qty=data.quantity
        )
        db.add(inventory)

    # Log transaction
    transaction = FactoryTransaction(
        factory_id=factory.id,
        item_id=data.item_id,
        transaction_type="output",
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
    total = db.query(Factory).filter(
        Factory.company_id == c.id,
        Factory.is_active == True
    ).count()
    idle = db.query(Factory).filter(
        Factory.company_id == c.id,
        Factory.status == "idle",
        Factory.is_active == True
    ).count()
    producing = db.query(Factory).filter(
        Factory.company_id == c.id,
        Factory.status == "producing",
        Factory.is_active == True
    ).count()
    maintenance = db.query(Factory).filter(
        Factory.company_id == c.id,
        Factory.status == "maintenance",
        Factory.is_active == True
    ).count()
    offline = db.query(Factory).filter(
        Factory.company_id == c.id,
        Factory.status == "offline",
        Factory.is_active == True
    ).count()

    # Count workers and engineers
    factory_ids = [f.id for f in db.query(Factory.id).filter(
        Factory.company_id == c.id,
        Factory.is_active == True
    ).all()]

    total_workers = db.query(Worker).filter(
        Worker.factory_id.in_(factory_ids),
        Worker.is_active == True
    ).count()

    total_engineers = db.query(Engineer).filter(
        Engineer.company_id == c.id,
        Engineer.is_active == True
    ).count()

    # Calculate total production hours from batches
    total_hours = db.query(func.count(ProductionBatch.id)).filter(
        ProductionBatch.factory_id.in_(factory_ids),
        ProductionBatch.status == "completed"
    ).scalar() or 0

    return FactoryStatsOut(
        total_factories=total,
        idle_factories=idle,
        producing_factories=producing,
        paused_factories=maintenance,  # Using maintenance for "paused"
        broken_factories=offline,  # Using offline for "broken"
        total_workers=total_workers,
        total_engineers=total_engineers,
        total_production_hours=total_hours,
    )
