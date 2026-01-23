from decimal import Decimal
from pydantic import BaseModel, Field
import uuid


class LocationOut(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    kind: str
    airport_ident: str
    name: str


class WarehouseCreateIn(BaseModel):
    airport_ident: str = Field(..., min_length=2, max_length=8)


class InventoryLineOut(BaseModel):
    item_id: uuid.UUID
    item_code: str
    item_name: str
    qty: int
    for_sale: bool = False
    sale_price: Decimal | None = None
    sale_qty: int = 0


class InventoryOut(BaseModel):
    location_id: uuid.UUID
    kind: str
    airport_ident: str
    name: str
    items: list[InventoryLineOut]


class AdjustIn(BaseModel):
    location_id: uuid.UUID
    item_code: str = Field(..., min_length=1, max_length=64)
    qty: int = Field(..., ge=1)


class MoveIn(BaseModel):
    from_location_id: uuid.UUID
    to_location_id: uuid.UUID
    item_code: str = Field(..., min_length=1, max_length=64)
    qty: int = Field(..., ge=1)


# ═══════════════════════════════════════════════════════════
# SCHEMAS VENTE / MARCHÉ
# ═══════════════════════════════════════════════════════════

class SetForSaleIn(BaseModel):
    """Mettre des items en vente"""
    location_id: uuid.UUID
    item_code: str = Field(..., min_length=1, max_length=64)
    for_sale: bool
    sale_price: Decimal | None = Field(None, ge=0, description="Prix unitaire")
    sale_qty: int = Field(0, ge=0, description="Quantité à vendre (0 = tout)")


class MarketListingOut(BaseModel):
    """Item en vente sur le marché"""
    location_id: uuid.UUID
    airport_ident: str
    company_id: uuid.UUID
    company_name: str
    item_id: uuid.UUID
    item_code: str
    item_name: str
    sale_price: Decimal
    sale_qty: int


class BuyFromMarketIn(BaseModel):
    """Acheter sur le marché"""
    seller_location_id: uuid.UUID
    item_code: str = Field(..., min_length=1, max_length=64)
    qty: int = Field(..., ge=1)


# ═══════════════════════════════════════════════════════════
# V0.7 UNIFIED INVENTORY SCHEMAS
# ═══════════════════════════════════════════════════════════

class LocationOutV2(BaseModel):
    """V0.7 Location with owner info"""
    id: uuid.UUID
    kind: str
    airport_ident: str
    name: str
    owner_type: str
    owner_id: uuid.UUID
    company_id: uuid.UUID | None = None
    aircraft_id: uuid.UUID | None = None


class InventoryItemOut(BaseModel):
    """Single inventory item"""
    item_id: uuid.UUID
    item_name: str
    tier: int
    qty: int
    weight_kg: Decimal
    total_weight_kg: Decimal
    base_value: Decimal
    total_value: Decimal


class ContainerOut(BaseModel):
    """A container (warehouse, aircraft) with its items"""
    id: uuid.UUID
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
    from_location_id: uuid.UUID
    to_location_id: uuid.UUID
    item_id: uuid.UUID
    qty: int = Field(..., ge=1)


class TransferOut(BaseModel):
    """Transfer result"""
    success: bool
    message: str
    from_location_id: uuid.UUID
    to_location_id: uuid.UUID
    item_id: uuid.UUID
    qty: int


class PlayerWarehouseCreateIn(BaseModel):
    """Create a player warehouse at an airport"""
    airport_ident: str = Field(..., min_length=2, max_length=8)
    name: str | None = None


# ═══════════════════════════════════════════════════════════
# V0.7 AIRCRAFT CARGO SCHEMAS
# ═══════════════════════════════════════════════════════════

class AircraftOut(BaseModel):
    """Aircraft with cargo info"""
    id: uuid.UUID
    aircraft_type: str
    status: str
    owner_type: str
    owner_id: uuid.UUID
    owner_name: str | None = None
    current_airport_ident: str | None = None
    cargo_capacity_kg: int
    current_cargo_kg: Decimal
    available_capacity_kg: Decimal
    condition: float
    hours: float


class AircraftCargoOut(BaseModel):
    """Aircraft cargo contents"""
    aircraft_id: uuid.UUID
    aircraft_type: str
    current_airport_ident: str | None = None
    cargo_capacity_kg: int
    current_cargo_kg: Decimal
    available_capacity_kg: Decimal
    items: list[InventoryItemOut]


class LoadCargoIn(BaseModel):
    """Load items into aircraft"""
    from_location_id: uuid.UUID
    item_id: uuid.UUID
    qty: int = Field(..., ge=1)


class UnloadCargoIn(BaseModel):
    """Unload items from aircraft"""
    to_location_id: uuid.UUID
    item_id: uuid.UUID
    qty: int = Field(..., ge=1)


# ═══════════════════════════════════════════════════════════
# V0.7 PERMISSIONS SCHEMAS
# ═══════════════════════════════════════════════════════════

class CompanyPermissionOut(BaseModel):
    """Company member permissions"""
    user_id: uuid.UUID
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
