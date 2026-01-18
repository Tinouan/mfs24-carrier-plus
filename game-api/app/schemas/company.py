from pydantic import BaseModel, Field
import uuid

class CompanyCreateIn(BaseModel):
    name: str = Field(min_length=2, max_length=64)
    slug: str = Field(min_length=2, max_length=64)
    home_airport_ident: str = Field(min_length=3, max_length=8)  # ex: LFPG, LFRK, KJFK

class CompanyOut(BaseModel):
    id: uuid.UUID
    world_id: int
    name: str
    slug: str
    owner_user_id: uuid.UUID
    home_airport_ident: str  # NEW

class MemberAddIn(BaseModel):
    email: str
    role: str = "member"  # owner/admin/member

class MemberOut(BaseModel):
    company_id: uuid.UUID
    user_id: uuid.UUID
    role: str
