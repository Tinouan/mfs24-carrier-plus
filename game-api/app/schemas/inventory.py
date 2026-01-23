"""
MFS Carrier+ - Inventory Schemas V0.7 (Simplified)
"""
from decimal import Decimal
from pydantic import BaseModel, Field
from uuid import UUID
from typing import Optional


# ═══════════════════════════════════════════════════════════
# V0.7 SIMPLIFIED INVENTORY SCHEMAS
# ═══════════════════════════════════════════════════════════

class InventoryItemOut(BaseModel):
    """Un item dans l'inventaire - V0.7 Simplified (airport_ident optionnel pour compat legacy)"""
    item_id: UUID
    item_name: str
    tier: int
    qty: int
    airport_ident: str = ""  # Optionnel pour compat legacy
    weight_kg: Decimal
    total_weight_kg: Decimal
    base_value: Decimal
    total_value: Decimal

    class Config:
        from_attributes = True


class AircraftCargoItemOut(BaseModel):
    """Un item dans le cargo d'un avion (pas d'airport_ident)"""
    item_id: UUID
    item_name: str
    tier: int
    qty: int
    weight_kg: Decimal
    total_weight_kg: Decimal

    class Config:
        from_attributes = True


# ═══════════════════════════════════════════════════════════
# INVENTAIRE COMPLET
# ═══════════════════════════════════════════════════════════

class PlayerInventoryOut(BaseModel):
    """Inventaire complet d'un joueur"""
    total_items: int
    total_value: Decimal
    total_weight_kg: Decimal
    airports: list[str]  # Liste des aéroports où le joueur a des items
    items: list[InventoryItemOut]


class CompanyInventoryOut(BaseModel):
    """Inventaire complet d'une company"""
    company_id: UUID
    company_name: str
    total_items: int
    total_value: Decimal
    total_weight_kg: Decimal
    airports: list[str]
    items: list[InventoryItemOut]


class AircraftCargoOut(BaseModel):
    """Cargo d'un avion"""
    aircraft_id: UUID
    aircraft_name: str
    current_airport: Optional[str] = None
    cargo_capacity_kg: Decimal
    current_weight_kg: Decimal
    available_capacity_kg: Decimal
    items: list[AircraftCargoItemOut]


# ═══════════════════════════════════════════════════════════
# OPÉRATIONS LOAD/UNLOAD
# ═══════════════════════════════════════════════════════════

class LoadCargoIn(BaseModel):
    """Charger des items dans un avion"""
    aircraft_id: UUID
    item_id: UUID
    qty: int = Field(..., ge=1)
    from_inventory: str = "player"  # "player" ou "company"


class UnloadCargoIn(BaseModel):
    """Décharger des items d'un avion"""
    aircraft_id: UUID
    item_id: UUID
    qty: int = Field(..., ge=1)
    to_inventory: str = "player"  # "player" ou "company"


class CargoOperationOut(BaseModel):
    """Résultat d'une opération de chargement/déchargement"""
    success: bool
    message: str
    item_name: str
    qty: int
    aircraft_id: UUID
    airport_ident: str


# ═══════════════════════════════════════════════════════════
# LEGACY - À garder pour compatibilité HV (T0/NPC)
# ═══════════════════════════════════════════════════════════

class LocationOut(BaseModel):
    id: UUID
    company_id: UUID | None = None
    kind: str
    airport_ident: str
    name: str


class WarehouseCreateIn(BaseModel):
    airport_ident: str = Field(..., min_length=2, max_length=8)


class InventoryLineOut(BaseModel):
    item_id: UUID
    item_code: str
    item_name: str
    qty: int
    for_sale: bool = False
    sale_price: Decimal | None = None
    sale_qty: int = 0


class InventoryOut(BaseModel):
    location_id: UUID
    kind: str
    airport_ident: str
    name: str
    items: list[InventoryLineOut]


class AdjustIn(BaseModel):
    location_id: UUID
    item_code: str = Field(..., min_length=1, max_length=64)
    qty: int = Field(..., ge=1)


class MoveIn(BaseModel):
    from_location_id: UUID
    to_location_id: UUID
    item_code: str = Field(..., min_length=1, max_length=64)
    qty: int = Field(..., ge=1)


class SetForSaleIn(BaseModel):
    """Mettre des items en vente"""
    location_id: UUID
    item_code: str = Field(..., min_length=1, max_length=64)
    for_sale: bool
    sale_price: Decimal | None = Field(None, ge=0, description="Prix unitaire")
    sale_qty: int = Field(0, ge=0, description="Quantité à vendre (0 = tout)")


class MarketListingOut(BaseModel):
    """Item en vente sur le marché"""
    location_id: UUID
    airport_ident: str
    company_id: UUID
    company_name: str
    item_id: UUID
    item_code: str
    item_name: str
    sale_price: Decimal
    sale_qty: int


class BuyFromMarketIn(BaseModel):
    """Acheter sur le marché"""
    seller_location_id: UUID
    item_code: str = Field(..., min_length=1, max_length=64)
    qty: int = Field(..., ge=1)


# ═══════════════════════════════════════════════════════════
# V0.7 UNIFIED INVENTORY LEGACY (keeping for old endpoints)
# ═══════════════════════════════════════════════════════════

class LocationOutV2(BaseModel):
    """V0.7 Location with owner info"""
    id: UUID
    kind: str
    airport_ident: str
    name: str
    owner_type: str
    owner_id: UUID
    company_id: UUID | None = None
    aircraft_id: UUID | None = None


class ContainerOut(BaseModel):
    """A container (warehouse, aircraft) with its items"""
    id: UUID
    type: str  # player_warehouse, company_warehouse, aircraft
    name: str
    owner_name: str | None = None
    aircraft_type: str | None = None
    items: list[InventoryItemOut]
    total_items: int
    total_value: Decimal


class AirportInventoryOut(BaseModel):
    """All inventory at one airport"""
    airport_ident: str
    airport_name: str | None = None
    containers: list[ContainerOut]


class InventoryOverviewOut(BaseModel):
    """V0.7 Global inventory overview for a user"""
    total_items: int
    total_value: Decimal
    locations: list[AirportInventoryOut]


class TransferIn(BaseModel):
    """V0.7 Transfer items between locations (same airport only)"""
    from_location_id: UUID
    to_location_id: UUID
    item_id: UUID
    qty: int = Field(..., ge=1)


class TransferOut(BaseModel):
    """Transfer result"""
    success: bool
    message: str
    from_location_id: UUID
    to_location_id: UUID
    item_id: UUID
    qty: int


class PlayerWarehouseCreateIn(BaseModel):
    """Create a player warehouse at an airport"""
    airport_ident: str = Field(..., min_length=2, max_length=8)
    name: str | None = None


# ═══════════════════════════════════════════════════════════
# V0.7 PERMISSIONS SCHEMAS
# ═══════════════════════════════════════════════════════════

class CompanyPermissionOut(BaseModel):
    """Company member permissions"""
    user_id: UUID
    username: str | None = None
    can_withdraw_warehouse: bool
    can_deposit_warehouse: bool
    can_withdraw_factory: bool
    can_deposit_factory: bool
    can_manage_aircraft: bool
    can_use_aircraft: bool
    can_sell_market: bool
    can_buy_market: bool
    can_manage_workers: bool
    can_manage_members: bool
    can_manage_factories: bool
    is_founder: bool


class CompanyPermissionUpdateIn(BaseModel):
    """Update member permissions"""
    can_withdraw_warehouse: bool | None = None
    can_deposit_warehouse: bool | None = None
    can_withdraw_factory: bool | None = None
    can_deposit_factory: bool | None = None
    can_manage_aircraft: bool | None = None
    can_use_aircraft: bool | None = None
    can_sell_market: bool | None = None
    can_buy_market: bool | None = None
    can_manage_workers: bool | None = None
    can_manage_members: bool | None = None
    can_manage_factories: bool | None = None
