"""
Factories router - Player-owned factory management.
"""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.deps import get_db, get_current_user
from app.models.user import User
from app.models.company_member import CompanyMember
from app.models.company import Company
from app.models.factory import Factory
from app.models.item import Item
from app.models.recipe import Recipe, RecipeIngredient
from app.models.worker import WorkerInstance
from app.models.factory_storage import FactoryStorage
from app.models.production_batch import ProductionBatch
from app.models.factory_transaction import FactoryTransaction
from app.models.airport import Airport
from app.models.inventory_location import InventoryLocation
from app.models.inventory_item import InventoryItem
from app.models.company_inventory import CompanyInventory
from app.schemas.factories import (
    FactoryOut,
    FactoryListOut,
    FactoryCreateIn,
    FactoryUpdateIn,
    FactoryStorageOut,
    FactoryStorageLineOut,
    StorageDepositIn,
    StorageWithdrawIn,
    ProductionBatchOut,
    StartProductionIn,
    FactoryTransactionOut,
    FactoryStatsOut,
    FoodDepositIn,
    FoodStatusOut,
)
from app.schemas.workers import (
    WorkerInstanceListOut,
    FactoryWorkersV2Out,
)
from app.services.production_service import calculate_production_time

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


def _build_factory_out(db: Session, factory: Factory) -> FactoryOut:
    """Build FactoryOut with food item info (V0.8.1)."""
    food_item_name = None
    food_item_icon = None

    if factory.food_item_id:
        food_item = db.query(Item).filter(Item.id == factory.food_item_id).first()
        if food_item:
            food_item_name = food_item.name
            food_item_icon = food_item.icon

    return FactoryOut(
        id=factory.id,
        company_id=factory.company_id,
        airport_ident=factory.airport_ident,
        name=factory.name,
        tier=factory.tier,
        factory_type=factory.factory_type,
        status=factory.status,
        current_recipe_id=factory.current_recipe_id,
        is_active=factory.is_active,
        max_workers=factory.max_workers,
        max_engineers=factory.max_engineers,
        food_item_id=factory.food_item_id,
        food_item_name=food_item_name,
        food_item_icon=food_item_icon,
        food_tier=factory.food_tier,
        food_stock=factory.food_stock,
        food_capacity=factory.food_capacity,
        food_consumption_per_hour=float(factory.food_consumption_per_hour),
        created_at=factory.created_at,
        updated_at=factory.updated_at,
    )


# V0.8.1: Food tier bonus mapping
FOOD_TIER_BONUS = {
    0: 0,   # T0: +0%
    1: 15,  # T1: +15%
    2: 30,  # T2: +30%
    3: 45,  # T3: +45%
    4: 60,  # T4: +60%
    5: 75,  # T5: +75%
}


# =====================================================
# FACTORIES CRUD
# =====================================================

@router.get("", response_model=list[FactoryListOut])
def list_my_factories(
    airport_ident: str | None = Query(None, description="Filter by airport ICAO code"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List all factories owned by current company. Optionally filter by airport."""
    c, _cm = _get_my_company(db, user.id)
    if not c:
        raise HTTPException(status_code=404, detail="No company")

    query = db.query(Factory).filter(
        Factory.company_id == c.id,
        Factory.is_active == True
    )

    # Debug: show all factories before filter
    all_factories = query.all()
    print(f"[DEBUG] All my factories: {[(f.name, f.airport_ident) for f in all_factories]}")

    if airport_ident:
        print(f"[DEBUG] Filtering by airport_ident: '{airport_ident}'")
        query = db.query(Factory).filter(
            Factory.company_id == c.id,
            Factory.is_active == True,
            Factory.airport_ident == airport_ident
        )

    factories = query.all()
    print(f"[DEBUG] After filter: {len(factories)} factories")

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

    return _build_factory_out(db, factory)


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

    return _build_factory_out(db, factory)


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

    return _build_factory_out(db, factory)


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

    # Release workers (V2 - unassign from factory)
    db.query(WorkerInstance).filter(
        WorkerInstance.factory_id == factory.id
    ).update({"factory_id": None, "status": "available"})

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
    """
    Start production batch (V2).
    Consumes ingredients directly from company_inventory at factory's airport.
    """
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

    # V2: Check if company has enough ingredients in company_inventory at factory's airport
    recipe_ingredients = db.query(RecipeIngredient).filter(
        RecipeIngredient.recipe_id == recipe.id
    ).all()

    # V2.1: Calculate total ingredients needed for requested batches
    batches_requested = data.quantity or 1

    for ingredient in recipe_ingredients:
        inv_item = db.query(CompanyInventory).filter(
            CompanyInventory.company_id == c.id,
            CompanyInventory.item_id == ingredient.item_id,
            CompanyInventory.airport_ident == factory.airport_ident
        ).first()

        available_qty = inv_item.qty if inv_item else 0
        total_required = ingredient.quantity * batches_requested
        if available_qty < total_required:
            # Get item name for error message
            item = db.query(Item).filter(Item.id == ingredient.item_id).first()
            item_name = item.name if item else str(ingredient.item_id)
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient {item_name} in inventory at {factory.airport_ident}. Required: {total_required}, Available: {available_qty}"
            )

    # Get workers assigned to this factory (V2)
    workers = db.query(WorkerInstance).filter(
        WorkerInstance.factory_id == factory.id,
        WorkerInstance.status == "working"
    ).all()
    workers_count = len(workers)

    if workers_count == 0:
        raise HTTPException(
            status_code=400,
            detail="No workers assigned to this factory"
        )

    # V2: No separate engineer model - could add bonus based on worker tier later
    engineer_bonus = False

    # V0.8.1: Check food status for production time calculation
    has_food = factory.food_stock > 0

    # Calculate estimated completion using worker speed and food modifier
    # Formula: base_time × (200 / sum(workers.speed)), sans food = 30% efficacité
    production_time_per_batch = calculate_production_time(
        base_hours=float(recipe.production_time_hours),
        workers=workers,
        has_food=has_food
    )
    total_production_time = production_time_per_batch * batches_requested
    from datetime import timedelta
    estimated_completion = datetime.utcnow() + timedelta(hours=total_production_time)

    # V2.1: Consume ingredients from company_inventory (multiply by batches)
    for ingredient in recipe_ingredients:
        inv_item = db.query(CompanyInventory).filter(
            CompanyInventory.company_id == c.id,
            CompanyInventory.item_id == ingredient.item_id,
            CompanyInventory.airport_ident == factory.airport_ident
        ).first()

        total_consumed = ingredient.quantity * batches_requested
        inv_item.qty -= total_consumed
        if inv_item.qty <= 0:
            db.delete(inv_item)

        # Log consumption transaction (input with negative = consumed)
        transaction = FactoryTransaction(
            factory_id=factory.id,
            item_id=ingredient.item_id,
            transaction_type="input",
            quantity=-total_consumed,
            notes=f"Production: {batches_requested}x {recipe.name}"
        )
        db.add(transaction)

    # Create production batch (V2.1: result = batches * output_per_batch)
    total_output = recipe.result_quantity * batches_requested
    batch = ProductionBatch(
        factory_id=factory.id,
        recipe_id=data.recipe_id,
        status="pending",
        workers_assigned=workers_count,
        result_quantity=total_output,
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
# WORKERS (V0.6 - Use /workers endpoints for full management)
# =====================================================

@router.get("/{factory_id}/workers", response_model=FactoryWorkersV2Out)
def list_factory_workers(
    factory_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List all workers assigned to this factory (V2).

    For full worker management, use /workers/v2 endpoints.
    """
    c, _cm = _get_my_company(db, user.id)
    if not c:
        raise HTTPException(status_code=404, detail="No company")

    factory = _get_factory_or_404(db, c.id, factory_id)

    # Get workers assigned to this factory (V2)
    from app.models.item import Item
    workers_query = db.query(WorkerInstance, Item.name.label("item_name")).join(
        Item, WorkerInstance.item_id == Item.id
    ).filter(
        WorkerInstance.factory_id == factory.id
    ).all()

    workers = [
        WorkerInstanceListOut(
            id=w.id,
            item_name=item_name,
            country_code=w.country_code,
            speed=w.speed,
            resistance=w.resistance,
            tier=w.tier,
            hourly_salary=float(w.hourly_salary),
            status=w.status,
            airport_ident=w.airport_ident,
            factory_id=w.factory_id
        )
        for w, item_name in workers_query
    ]

    return FactoryWorkersV2Out(
        factory_id=factory.id,
        factory_name=factory.name,
        max_workers=factory.max_workers,
        current_workers=len(workers),
        workers=workers
    )


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
        InventoryLocation.kind.in_(["warehouse", "company_warehouse"]),
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

    # Count workers (V2 - WorkerInstance)
    factory_ids = [f.id for f in db.query(Factory.id).filter(
        Factory.company_id == c.id,
        Factory.is_active == True
    ).all()]

    total_workers = db.query(WorkerInstance).filter(
        WorkerInstance.factory_id.in_(factory_ids),
        WorkerInstance.status == "working"
    ).count()

    # Engineers are now just workers - count all company workers
    total_engineers = 0  # V2: No separate engineer model

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


# =====================================================
# FOOD SYSTEM (V0.8.1)
# =====================================================

@router.get("/{factory_id}/food", response_model=FoodStatusOut)
def get_food_status(
    factory_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get factory food status (V0.8.1)."""
    c, _cm = _get_my_company(db, user.id)
    if not c:
        raise HTTPException(status_code=404, detail="No company")

    factory = _get_factory_or_404(db, c.id, factory_id)

    # Get food item info if set
    food_item_name = None
    food_item_icon = None
    if factory.food_item_id:
        food_item = db.query(Item).filter(Item.id == factory.food_item_id).first()
        if food_item:
            food_item_name = food_item.name
            food_item_icon = food_item.icon

    # Count workers
    workers_count = db.query(func.count(WorkerInstance.id)).filter(
        WorkerInstance.factory_id == factory.id,
        WorkerInstance.status == "working"
    ).scalar() or 0

    # Calculate hours until empty
    consumption = float(factory.food_consumption_per_hour)
    hours_until_empty = None
    if consumption > 0 and factory.food_stock > 0:
        hours_until_empty = factory.food_stock / consumption

    # Get food tier bonus
    food_bonus = FOOD_TIER_BONUS.get(factory.food_tier, 0)

    return FoodStatusOut(
        factory_id=factory.id,
        food_item_id=factory.food_item_id,
        food_item_name=food_item_name,
        food_item_icon=food_item_icon,
        food_tier=factory.food_tier,
        food_bonus_percent=food_bonus,
        food_stock=factory.food_stock,
        food_capacity=factory.food_capacity,
        food_consumption_per_hour=consumption,
        hours_until_empty=hours_until_empty,
        workers_count=workers_count,
    )


@router.post("/{factory_id}/food", response_model=FoodStatusOut)
def deposit_food(
    factory_id: uuid.UUID,
    data: FoodDepositIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Deposit food into factory (V0.8.1).

    Rules:
    - Only items with 'food' or 'consumable' tag allowed
    - Only one food type at a time per factory
    - To change food type, factory must be empty (food_stock=0)
    - Consumption: 1 unit/worker/hour
    - Bonus: T0=0%, T1=15%, T2=30%, T3=45%, T4=60%, T5=75%
    """
    c, _cm = _get_my_company(db, user.id)
    if not c:
        raise HTTPException(status_code=404, detail="No company")

    factory = _get_factory_or_404(db, c.id, factory_id)

    # Get the food item
    food_item = db.query(Item).filter(Item.id == data.item_id).first()
    if not food_item:
        raise HTTPException(status_code=404, detail="Item not found")

    # Validate item has food or consumable tag
    item_tags = food_item.tags or []
    if 'food' not in item_tags and 'consumable' not in item_tags:
        raise HTTPException(
            status_code=400,
            detail=f"Item '{food_item.name}' is not a food item (missing 'food' or 'consumable' tag)"
        )

    # V0.8.1: If factory has different food type, swap automatically (return old food to inventory)
    if factory.food_item_id and factory.food_item_id != data.item_id and factory.food_stock > 0:
        # Return old food to company_inventory
        old_inv = db.query(CompanyInventory).filter(
            CompanyInventory.company_id == c.id,
            CompanyInventory.item_id == factory.food_item_id,
            CompanyInventory.airport_ident == factory.airport_ident
        ).first()

        if old_inv:
            old_inv.qty += factory.food_stock
        else:
            old_inv = CompanyInventory(
                company_id=c.id,
                item_id=factory.food_item_id,
                airport_ident=factory.airport_ident,
                qty=factory.food_stock
            )
            db.add(old_inv)

        # Reset factory food stock before loading new type
        factory.food_stock = 0

    # Check company inventory at factory's airport
    inv_item = db.query(CompanyInventory).filter(
        CompanyInventory.company_id == c.id,
        CompanyInventory.item_id == data.item_id,
        CompanyInventory.airport_ident == factory.airport_ident
    ).first()

    if not inv_item or inv_item.qty < data.quantity:
        available = inv_item.qty if inv_item else 0
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient {food_item.name} in inventory at {factory.airport_ident}. Available: {available}, Requested: {data.quantity}"
        )

    # Check capacity (factory.food_stock is now 0 if we swapped)
    new_stock = factory.food_stock + data.quantity
    if new_stock > factory.food_capacity:
        raise HTTPException(
            status_code=400,
            detail=f"Would exceed food capacity. Current: {factory.food_stock}, Adding: {data.quantity}, Capacity: {factory.food_capacity}"
        )

    # Deduct from company inventory
    inv_item.qty -= data.quantity
    if inv_item.qty <= 0:
        db.delete(inv_item)

    # Update factory food
    factory.food_item_id = data.item_id
    factory.food_tier = food_item.tier
    factory.food_stock = new_stock

    # Calculate consumption (1 per worker per hour)
    workers_count = db.query(func.count(WorkerInstance.id)).filter(
        WorkerInstance.factory_id == factory.id,
        WorkerInstance.status == "working"
    ).scalar() or 0
    factory.food_consumption_per_hour = workers_count

    db.commit()
    db.refresh(factory)

    # Calculate hours until empty
    consumption = float(factory.food_consumption_per_hour)
    hours_until_empty = None
    if consumption > 0 and factory.food_stock > 0:
        hours_until_empty = factory.food_stock / consumption

    # Get food tier bonus
    food_bonus = FOOD_TIER_BONUS.get(factory.food_tier, 0)

    return FoodStatusOut(
        factory_id=factory.id,
        food_item_id=factory.food_item_id,
        food_item_name=food_item.name,
        food_item_icon=food_item.icon,
        food_tier=factory.food_tier,
        food_bonus_percent=food_bonus,
        food_stock=factory.food_stock,
        food_capacity=factory.food_capacity,
        food_consumption_per_hour=consumption,
        hours_until_empty=hours_until_empty,
        workers_count=workers_count,
    )
