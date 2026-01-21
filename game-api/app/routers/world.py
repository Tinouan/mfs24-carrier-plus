"""
World router - Public world data (items, recipes, airports).
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.deps import get_db
from app.models.item import Item
from app.models.recipe import Recipe, RecipeIngredient
# from app.models.factory import Factory  # Commented - table doesn't exist yet
from app.schemas.factories import (
    ItemOut,
    ItemListOut,
    RecipeOut,
    RecipeListOut,
    RecipeIngredientOut,
    AirportSlotOut,
)

router = APIRouter(prefix="/world", tags=["world"])


# =====================================================
# ITEMS
# =====================================================

@router.get("/items", response_model=list[ItemListOut])
def list_items(
    tier: int | None = Query(None, ge=0, le=5, description="Filter by tier (0-5)"),
    tag: str | None = Query(None, description="Filter by tag (food, construction, etc.)"),
    is_raw: bool | None = Query(None, description="Filter raw materials only"),
    limit: int = Query(100, ge=1, le=500, description="Max results"),
    db: Session = Depends(get_db),
):
    """List all items (with filters)."""
    query = db.query(Item)

    if tier is not None:
        query = query.filter(Item.tier == tier)

    if tag is not None:
        query = query.filter(Item.tags.contains([tag]))

    if is_raw is not None:
        query = query.filter(Item.is_raw == is_raw)

    items = query.order_by(Item.tier, Item.name).limit(limit).all()

    return [
        ItemListOut(
            id=item.id,
            name=item.name,
            tier=item.tier,
            icon=item.icon,
            tags=item.tags,
        )
        for item in items
    ]


@router.get("/items/{item_id}", response_model=ItemOut)
def get_item_details(
    item_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Get detailed item information."""
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    return ItemOut(
        id=item.id,
        name=item.name,
        tier=item.tier,
        tags=item.tags,
        icon=item.icon,
        base_value=float(item.base_value),
        weight_kg=float(item.weight_kg),
        is_raw=item.is_raw,
        stack_size=item.stack_size,
        description=item.description,
    )


@router.get("/items/search/{name}", response_model=list[ItemListOut])
def search_items_by_name(
    name: str,
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Search items by name (case-insensitive)."""
    items = db.query(Item).filter(
        Item.name.ilike(f"%{name}%")
    ).order_by(Item.tier, Item.name).limit(limit).all()

    return [
        ItemListOut(
            id=item.id,
            name=item.name,
            tier=item.tier,
            icon=item.icon,
            tags=item.tags,
        )
        for item in items
    ]


# =====================================================
# RECIPES
# =====================================================

@router.get("/recipes", response_model=list[RecipeListOut])
def list_recipes(
    tier: int | None = Query(None, ge=1, le=5, description="Filter by tier (1-5)"),
    tag: str | None = Query(None, description="Filter by tag (food, construction, etc.)"),
    limit: int = Query(100, ge=1, le=500, description="Max results"),
    db: Session = Depends(get_db),
):
    """List all recipes (with filters)."""
    query = db.query(Recipe)

    if tier is not None:
        query = query.filter(Recipe.tier == tier)

    # Note: tags filter removed - Recipe model no longer has tags field
    # if tag is not None:
    #     query = query.filter(Recipe.tags.contains([tag]))

    recipes = query.order_by(Recipe.tier, Recipe.name).limit(limit).all()

    return [
        RecipeListOut(
            id=recipe.id,
            name=recipe.name,
            tier=recipe.tier,
            production_time_hours=float(recipe.production_time_hours),
            result_quantity=recipe.result_quantity,
        )
        for recipe in recipes
    ]


@router.get("/recipes/{recipe_id}", response_model=RecipeOut)
def get_recipe_details(
    recipe_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Get detailed recipe information with ingredients."""
    recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    # Get ingredients with item details
    ingredients_data = db.query(RecipeIngredient, Item).join(
        Item, RecipeIngredient.item_id == Item.id
    ).filter(
        RecipeIngredient.recipe_id == recipe.id
    ).all()

    ingredients_out = [
        RecipeIngredientOut(
            item_id=ingredient.item_id,
            item_name=item.name,
            item_icon=item.icon,
            quantity_required=ingredient.quantity,
        )
        for ingredient, item in ingredients_data
    ]

    return RecipeOut(
        id=recipe.id,
        name=recipe.name,
        tier=recipe.tier,
        production_time_hours=float(recipe.production_time_hours),
        result_quantity=recipe.result_quantity,
        description=recipe.description,
        ingredients=ingredients_out,
    )


@router.get("/recipes/search/{name}", response_model=list[RecipeListOut])
def search_recipes_by_name(
    name: str,
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Search recipes by name (case-insensitive)."""
    recipes = db.query(Recipe).filter(
        Recipe.name.ilike(f"%{name}%")
    ).order_by(Recipe.tier, Recipe.name).limit(limit).all()

    return [
        RecipeListOut(
            id=recipe.id,
            name=recipe.name,
            tier=recipe.tier,
            production_time_hours=float(recipe.production_time_hours),
            result_quantity=recipe.result_quantity,
        )
        for recipe in recipes
    ]


# =====================================================
# AIRPORTS / SLOTS
# =====================================================

@router.get("/airports/slots", response_model=list[AirportSlotOut])
def list_airport_slots(
    airport_ident: str | None = Query(None, description="Filter by airport ICAO code"),
    has_slots: bool = Query(True, description="Show only airports with available slots"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """
    List airports with factory slot information.

    Note: This requires airports table in public schema (from Directus).
    For now, returns mock data. Implement once airports table is ready.
    """
    # TODO: Implement once public.airports table is available with columns:
    # - ident (ICAO code)
    # - name
    # - type (large_airport, medium_airport, small_airport)
    # - max_factory_slots (calculated by trigger)
    # - occupied_slots (updated when factories created/destroyed)

    # Mock response for now
    if airport_ident:
        # Get occupied slots for specific airport
        occupied = db.query(func.count(Factory.id)).filter(
            Factory.airport_ident == airport_ident
        ).scalar() or 0

        return [
            AirportSlotOut(
                airport_ident=airport_ident,
                airport_name="Airport Name (TODO)",
                airport_type="large_airport",
                max_factory_slots=12,
                occupied_slots=occupied,
                available_slots=12 - occupied,
            )
        ]

    # Return empty for now
    return []


@router.get("/airports/{airport_ident}/available-slots", response_model=dict)
def get_airport_available_slots(
    airport_ident: str,
    db: Session = Depends(get_db),
):
    """
    Get available slot indices for a specific airport.
    Returns list of free slot numbers.
    """
    # Get all occupied slots
    occupied_slots = db.query(Factory.slot_index).filter(
        Factory.airport_ident == airport_ident
    ).all()
    occupied_indices = {slot[0] for slot in occupied_slots}

    # TODO: Get max_slots from airports table
    max_slots = 12  # Default for now

    available_indices = [i for i in range(max_slots) if i not in occupied_indices]

    return {
        "airport_ident": airport_ident,
        "max_slots": max_slots,
        "occupied_slots": len(occupied_indices),
        "available_slots": len(available_indices),
        "available_slot_indices": available_indices,
    }


# =====================================================
# STATISTICS
# =====================================================

@router.get("/stats/items", response_model=dict)
def get_item_statistics(db: Session = Depends(get_db)):
    """Get item statistics (count by tier, category, etc.)."""
    # Count by tier
    tier_counts = db.query(
        Item.tier,
        func.count(Item.id).label("count")
    ).group_by(Item.tier).order_by(Item.tier).all()

    # Count raw vs processed
    raw_count = db.query(func.count(Item.id)).filter(
        Item.is_raw == True
    ).scalar() or 0

    processed_count = db.query(func.count(Item.id)).filter(
        Item.is_raw == False
    ).scalar() or 0

    return {
        "total_items": raw_count + processed_count,
        "raw_materials": raw_count,
        "processed_items": processed_count,
        "by_tier": {
            tier: count for tier, count in tier_counts
        }
    }


@router.get("/stats/recipes", response_model=dict)
def get_recipe_statistics(db: Session = Depends(get_db)):
    """Get recipe statistics (count by tier, avg duration, etc.)."""
    # Count by tier
    tier_counts = db.query(
        Recipe.tier,
        func.count(Recipe.id).label("count")
    ).group_by(Recipe.tier).order_by(Recipe.tier).all()

    # Average duration by tier
    avg_durations = db.query(
        Recipe.tier,
        func.avg(Recipe.production_time_hours).label("avg_duration")
    ).group_by(Recipe.tier).order_by(Recipe.tier).all()

    total_recipes = db.query(func.count(Recipe.id)).scalar() or 0

    return {
        "total_recipes": total_recipes,
        "by_tier": {
            tier: count for tier, count in tier_counts
        },
        "avg_duration_by_tier": {
            tier: float(avg_dur) for tier, avg_dur in avg_durations
        }
    }
