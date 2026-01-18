import re
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


_DISPLAY_NAME_RE = re.compile(r"^[a-zA-Z0-9 _\-]{3,48}$")


class CompanyProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    home_airport_ident: str

    display_name: str | None
    description: str | None
    logo_url: str | None

    is_public: bool
    settings: dict

    created_at: datetime
    updated_at: datetime


class CompanyProfilePatchIn(BaseModel):
    display_name: str | None = Field(default=None, max_length=48)
    description: str | None = Field(default=None, max_length=400)
    logo_url: str | None = Field(default=None, max_length=300)
    is_public: bool | None = None
    settings: dict | None = None

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if v == "":
            raise ValueError("display_name cannot be empty")
        if not _DISPLAY_NAME_RE.match(v):
            raise ValueError("display_name contains invalid characters")
        return v

    @field_validator("description")
    @classmethod
    def validate_description(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if v == "":
            return None
        if len(v) > 400:
            raise ValueError("description too long")
        return v

    @field_validator("logo_url")
    @classmethod
    def validate_logo_url(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if v == "":
            return None
        if not (v.startswith("http://") or v.startswith("https://")):
            raise ValueError("logo_url must start with http:// or https://")
        return v
