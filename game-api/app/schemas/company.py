from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# ========= Company =========

class CompanyCreateIn(BaseModel):
    name: str = Field(min_length=3, max_length=80)
    home_airport_ident: str = Field(min_length=3, max_length=8)


class CompanyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    home_airport_ident: str
    balance: float = 0
    created_at: datetime


# ========= Members =========

class MemberAddIn(BaseModel):
    email: str  # Find user by email
    role: str = Field(pattern="^(owner|admin|member)$")


class MemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: UUID
    company_id: UUID
    role: str
    username: str
    email: str
