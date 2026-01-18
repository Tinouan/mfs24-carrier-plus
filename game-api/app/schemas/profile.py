import re
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict, field_validator


_DISPLAY_NAME_RE = re.compile(r"^[a-zA-Z0-9 _\-]{3,24}$")


class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    display_name: str | None
    created_at: datetime
    updated_at: datetime


class ProfilePatchIn(BaseModel):
    # None = not provided, "" rejected by validator
    display_name: str | None = Field(
        default=None,
        description="Public display name (3-24 chars). Allowed: letters, numbers, space, underscore, dash.",
        max_length=24,
    )

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, v: str | None) -> str | None:
        if v is None:
            return None

        v = v.strip()

        if v == "":
            raise ValueError("display_name cannot be empty")

        if len(v) < 3 or len(v) > 24:
            raise ValueError("display_name must be 3 to 24 characters")

        if not _DISPLAY_NAME_RE.match(v):
            raise ValueError("display_name contains invalid characters")

        return v
