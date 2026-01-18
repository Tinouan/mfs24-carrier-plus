from pydantic import BaseModel, EmailStr
import uuid

class UserOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    username: str
    is_admin: bool
