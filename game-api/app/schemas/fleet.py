from pydantic import BaseModel
from uuid import UUID
from typing import Optional
from datetime import datetime


class AircraftOut(BaseModel):
    id: UUID
    company_id: UUID
    aircraft_type: str
    status: str
    condition: float
    hours: float
    current_airport_ident: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
