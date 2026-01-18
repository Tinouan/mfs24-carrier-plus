from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict


class PlayerProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    display_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class PlayerProfileUpdateIn(BaseModel):
    display_name: Optional[str] = Field(default=None, max_length=64)
