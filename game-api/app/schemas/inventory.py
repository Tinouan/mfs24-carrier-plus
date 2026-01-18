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
    item_code: str
    item_name: str
    qty: int


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
