from pydantic import BaseModel, EmailStr, Field
import uuid


class RegisterIn(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=8, max_length=200)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserInfo(BaseModel):
    """User info returned with token."""
    id: uuid.UUID
    email: str
    username: str
    is_admin: bool = False


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserInfo
