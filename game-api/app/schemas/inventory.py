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
