from pydantic import BaseModel, EmailStr
from typing import Optional
import uuid

class UserOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    username: str
    is_admin: bool
    wallet: float = 0
    company_id: Optional[uuid.UUID] = None
