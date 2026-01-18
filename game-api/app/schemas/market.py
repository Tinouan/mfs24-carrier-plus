from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# ===== Wallet =====

class WalletOut(BaseModel):
    company_id: UUID
    balance: float


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    amount: float
    reason: str
    meta: dict
    created_at: datetime


# ===== Market =====

class MarketOrderCreateIn(BaseModel):
    side: str = Field(pattern="^(buy|sell)$")
    item_code: str = Field(min_length=2, max_length=64)
    quantity: int = Field(gt=0)
    unit_price: float = Field(ge=0)


class MarketOrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    company_id: UUID
    side: str
    item_code: str
    quantity: int
    unit_price: float
    status: str
    created_at: datetime
    updated_at: datetime
