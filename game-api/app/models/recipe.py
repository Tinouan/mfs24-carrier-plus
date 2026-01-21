"""
Recipe Models
Defines production recipes and their ingredients.
"""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Integer, Numeric, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class Recipe(Base):
    """
    Production recipes (how to make items).
    """
    __tablename__ = "recipes"
    __table_args__ = {"schema": "game"}

    # Primary Key
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    # Core Info
    name: Mapped[str] = mapped_column(
        String(100),
        unique=True,
        nullable=False,
        index=True
    )
    tier: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        index=True,
        comment="1-5 (recipe tier)"
    )

    # Result
    result_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("game.items.id"),
        nullable=False,
        index=True
    )
    result_quantity: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="Output quantity per batch"
    )

    # Production Parameters
    production_time_hours: Mapped[float] = mapped_column(
        Numeric(5, 2),
        nullable=False,
        comment="Time to produce 1 batch"
    )
    base_workers_required: Mapped[int | None] = mapped_column(
        Integer,
        server_default="10",
        comment="Minimum workers needed"
    )

    # Metadata
    description: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True
    )
    unlock_requirements: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True
    )

    # Timestamps
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )

    # Relationships
    ingredients: Mapped[list["RecipeIngredient"]] = relationship(
        "RecipeIngredient",
        back_populates="recipe",
        cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<Recipe(id={self.id}, name='{self.name}', tier={self.tier})>"


class RecipeIngredient(Base):
    """
    Ingredients required for a recipe (junction table).
    """
    __tablename__ = "recipe_ingredients"
    __table_args__ = {"schema": "game"}

    # Primary Key
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    # Foreign Keys
    recipe_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("game.recipes.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("game.items.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    # Quantity
    quantity: Mapped[int] = mapped_column(
        "quantity",
        Integer,
        nullable=False,
        comment="Quantity needed per batch"
    )

    # Position
    position: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="Display order (0-3)"
    )

    # Relationships
    recipe: Mapped["Recipe"] = relationship(
        "Recipe",
        back_populates="ingredients"
    )

    def __repr__(self):
        return f"<RecipeIngredient(recipe_id={self.recipe_id}, item_id={self.item_id}, qty={self.quantity})>"
