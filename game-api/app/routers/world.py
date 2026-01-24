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
from app.models.airport import Airport
from app.models.factory import Factory
from app.schemas.factories import (
    ItemOut,
    ItemListOut,
    RecipeOut,
    RecipeListOut,
    RecipeIngredientOut,
    RecipeWithInputsOut,
    AirportSlotOut,
    AirportOut,
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

@router.get("/recipes", response_model=list[RecipeWithInputsOut])
def list_recipes(
    tier: int | None = Query(None, ge=1, le=10, description="Filter by tier (1-10)"),
    tag: str | None = Query(None, description="Filter by tag (food, construction, etc.)"),
    limit: int = Query(100, ge=1, le=500, description="Max results"),
    db: Session = Depends(get_db),
):
    """List all recipes with inputs (V2.1 - for recipe detection)."""
    query = db.query(Recipe)

    if tier is not None:
        query = query.filter(Recipe.tier == tier)

    recipes = query.order_by(Recipe.tier, Recipe.name).limit(limit).all()

    result = []
    for recipe in recipes:
        # Get output item
        output_item = db.query(Item).filter(Item.id == recipe.result_item_id).first()
        output_name = output_item.name if output_item else recipe.name
        output_icon = output_item.icon if output_item else None

        # Get inputs with item details
        ingredients_data = db.query(RecipeIngredient, Item).join(
            Item, RecipeIngredient.item_id == Item.id
        ).filter(
            RecipeIngredient.recipe_id == recipe.id
        ).all()

        inputs = [
            RecipeIngredientOut(
                item_id=ingredient.item_id,
                item_name=item.name,
                item_icon=item.icon,
                quantity_required=ingredient.quantity,
            )
            for ingredient, item in ingredients_data
        ]

        result.append(RecipeWithInputsOut(
            id=recipe.id,
            name=recipe.name,
            tier=recipe.tier,
            production_time_hours=float(recipe.production_time_hours),
            base_time_seconds=int(recipe.production_time_hours * 3600),
            result_quantity=recipe.result_quantity,
            output_item_name=output_name,
            output_item_icon=output_icon,
            inputs=inputs,
        ))

    return result


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

@router.get("/airports", response_model=list[AirportOut])
def list_airports(
    country: str | None = Query(None, description="Filter by ISO country code (FR, DE, US, etc.)"),
    type: str | None = Query(None, description="Filter by airport type (large_airport, medium_airport, small_airport, heliport, seaplane_base)"),
    min_lat: float | None = Query(None, description="Minimum latitude (bounding box)"),
    max_lat: float | None = Query(None, description="Maximum latitude (bounding box)"),
    min_lon: float | None = Query(None, description="Minimum longitude (bounding box)"),
    max_lon: float | None = Query(None, description="Maximum longitude (bounding box)"),
    limit: int = Query(2000, ge=1, le=10000, description="Max results"),
    db: Session = Depends(get_db),
):
    """
    List airports from database.
    Returns airports with their coordinates for map display.
    Use bounding box params (min_lat, max_lat, min_lon, max_lon) for viewport filtering.
    """
    query = db.query(Airport)

    # Filter by bounding box (viewport)
    if min_lat is not None and max_lat is not None and min_lon is not None and max_lon is not None:
        query = query.filter(
            Airport.latitude_deg >= min_lat,
            Airport.latitude_deg <= max_lat,
            Airport.longitude_deg >= min_lon,
            Airport.longitude_deg <= max_lon
        )

    # Filter by country
    if country:
        query = query.filter(Airport.iso_country == country)

    # Filter by type
    if type:
        query = query.filter(Airport.type == type)

    # Exclude closed airports
    query = query.filter(Airport.type != 'closed')

    # Order by type (large first) then name
    airports = query.order_by(Airport.type, Airport.name).limit(limit).all()

    return airports


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
    # - max_factories_slots (calculated by trigger)
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
                max_factories_slots=12,
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
# FACTORIES (Public map view)
# =====================================================

# T0 factory name to product/type mapping for map icons
T0_FACTORY_PRODUCTS = {
    # Food - Cereals
    "Exploitation Céréalière Beauce": ("wheat", "food", "Blé"),
    "Coopérative Agricole Île-de-France": ("wheat", "food", "Blé"),
    "Ferme Céréalière du Nord": ("wheat", "food", "Blé"),
    # Food - Meat
    "Élevage Breton": ("meat", "food", "Viande"),
    "Boucherie Lyonnaise": ("meat", "food", "Viande"),
    "Ferme Normande": ("meat", "food", "Viande"),
    # Food - Dairy
    "Laiterie Normande": ("milk", "food", "Lait"),
    "Fromagerie Alpine": ("milk", "food", "Lait"),
    # Food - Fruits/Vegetables
    "Vergers de Provence": ("fruits", "food", "Fruits"),
    "Fruits du Sud-Ouest": ("fruits", "food", "Fruits"),
    "Potager de Provence": ("vegetables", "food", "Légumes"),
    "Maraîchage Loire": ("vegetables", "food", "Légumes"),
    # Food - Fish
    "Criée de Bretagne": ("fish", "food", "Poisson"),
    "Pêcherie Méditerranée": ("fish", "food", "Poisson"),
    # Food - Water
    "Source Volvic": ("water", "food", "Eau"),
    "Eaux des Alpes": ("water", "food", "Eau"),
    # Food - Salt
    "Salines de Guérande": ("salt", "food", "Sel"),
    "Salines de Camargue": ("salt", "food", "Sel"),
    # Fuel
    "Raffinerie de Fos": ("crude_oil", "fuel", "Pétrole Brut"),
    "Raffinerie de Donges": ("crude_oil", "fuel", "Pétrole Brut"),
    "Gisement de Lacq": ("natural_gas", "fuel", "Gaz Naturel"),
    "Biocarburants Occitanie": ("crude_oil", "fuel", "Biocarburant"),
    # Minerals
    "Mine de Lorraine": ("iron_ore", "mineral", "Minerai de Fer"),
    "Bassin Minier du Nord": ("coal", "mineral", "Charbon"),
    "Carrières d'Alsace": ("iron_ore", "mineral", "Minerai"),
    "Carrières du Rhône": ("iron_ore", "mineral", "Minerai"),
    # Construction
    "Forêt des Landes": ("wood", "construction", "Bois"),
    "Bois du Massif Central": ("wood", "construction", "Bois"),
    "Scierie des Vosges": ("wood", "construction", "Bois"),
}


def _get_t0_product_info(factory_name: str) -> tuple[str, str, str]:
    """Get product info for T0 factory based on name."""
    if factory_name in T0_FACTORY_PRODUCTS:
        return T0_FACTORY_PRODUCTS[factory_name]
    # Fallback based on keywords in name
    name_lower = factory_name.lower()
    if any(w in name_lower for w in ["céréal", "blé", "ferme", "agricole", "coopérative"]):
        return ("wheat", "food", "Blé")
    if any(w in name_lower for w in ["élevage", "boucherie", "viande"]):
        return ("meat", "food", "Viande")
    if any(w in name_lower for w in ["lait", "fromage"]):
        return ("milk", "food", "Lait")
    if any(w in name_lower for w in ["verger", "fruit"]):
        return ("fruits", "food", "Fruits")
    if any(w in name_lower for w in ["potager", "maraîch", "légume"]):
        return ("vegetables", "food", "Légumes")
    if any(w in name_lower for w in ["criée", "pêche", "poisson"]):
        return ("fish", "food", "Poisson")
    if any(w in name_lower for w in ["source", "eau"]):
        return ("water", "food", "Eau")
    if any(w in name_lower for w in ["saline", "sel"]):
        return ("salt", "food", "Sel")
    if any(w in name_lower for w in ["raffinerie", "pétrole", "biocarburant"]):
        return ("crude_oil", "fuel", "Pétrole")
    if any(w in name_lower for w in ["gisement", "gaz"]):
        return ("natural_gas", "fuel", "Gaz")
    if any(w in name_lower for w in ["mine", "minier", "charbon"]):
        return ("coal", "mineral", "Charbon")
    if any(w in name_lower for w in ["carrière", "minerai"]):
        return ("iron_ore", "mineral", "Minerai")
    if any(w in name_lower for w in ["forêt", "bois", "scierie"]):
        return ("wood", "construction", "Bois")
    # Default
    return ("wheat", "food", "Ressource")


@router.get("/factories")
def list_factories_for_map(
    country: str | None = Query(None, description="Filter by country (uses airport's iso_country)"),
    tier: int | None = Query(None, ge=0, le=5, description="Filter by tier (0=NPC, 1-5=player)"),
    min_lat: float | None = Query(None, description="Minimum latitude (bounding box)"),
    max_lat: float | None = Query(None, description="Maximum latitude (bounding box)"),
    min_lon: float | None = Query(None, description="Minimum longitude (bounding box)"),
    max_lon: float | None = Query(None, description="Maximum longitude (bounding box)"),
    limit: int = Query(500, ge=1, le=2000, description="Max results"),
    db: Session = Depends(get_db),
):
    """
    List all factories for map display.
    Returns factories with airport coordinates for map markers.
    Includes both T0 (NPC) and player-owned factories.
    """
    from app.models.company import Company

    # Join factories with airports to get coordinates
    query = db.query(Factory, Airport).join(
        Airport, Factory.airport_ident == Airport.ident
    ).filter(Factory.is_active == True)

    # Filter by tier
    if tier is not None:
        query = query.filter(Factory.tier == tier)

    # Filter by country (via airport)
    if country:
        query = query.filter(Airport.iso_country == country)

    # Filter by bounding box
    if min_lat is not None and max_lat is not None and min_lon is not None and max_lon is not None:
        query = query.filter(
            Airport.latitude_deg >= min_lat,
            Airport.latitude_deg <= max_lat,
            Airport.longitude_deg >= min_lon,
            Airport.longitude_deg <= max_lon
        )

    results = query.limit(limit).all()

    factories_out = []
    for factory, airport in results:
        # Get company name
        company = db.query(Company).filter(Company.id == factory.company_id).first()
        company_name = company.name if company else "Unknown"

        # Get product info for T0 factories
        if factory.tier == 0:
            product, prod_type, product_name = _get_t0_product_info(factory.name)
        else:
            # For player factories, use factory_type or default
            product = None
            prod_type = factory.factory_type or "production"
            product_name = None

        factories_out.append({
            "id": str(factory.id),
            "name": factory.name,
            "airport_ident": factory.airport_ident,
            "airport_name": airport.name,
            "tier": factory.tier,
            "type": prod_type,  # For frontend compatibility
            "product": product,
            "product_name": product_name,
            "factory_type": factory.factory_type,
            "status": factory.status,
            "company_id": str(factory.company_id),
            "company_name": company_name,
            "latitude": airport.latitude_deg,
            "longitude": airport.longitude_deg,
        })

    return factories_out


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
