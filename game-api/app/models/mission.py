"""
V0.8 Mission System - Mission Model
Tracks cargo transport missions from origin to destination with scoring.
"""
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean, DateTime, String, Integer, Float, ForeignKey,
    Numeric, Text, CheckConstraint, func, text
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class Mission(Base):
    """
    V0.8 Mission System - Cargo transport mission

    Status flow:
    - pending: Created, not started yet
    - in_progress: Started, aircraft in flight
    - completed: Successfully landed at destination
    - failed: Crashed, timeout, or cancelled
    """
    __tablename__ = "missions"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')",
            name="mission_status_check"
        ),
        CheckConstraint(
            "grade IS NULL OR grade IN ('S', 'A', 'B', 'C', 'D', 'E', 'F')",
            name="mission_grade_check"
        ),
        {"schema": "game"}
    )

    # Primary Key
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()")
    )

    # Foreign Keys
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("game.companies.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    pilot_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("game.users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    aircraft_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("game.company_aircraft.id", ondelete="SET NULL"),
        nullable=True
    )

    # Route
    origin_icao: Mapped[str] = mapped_column(
        String(4),
        nullable=False,
        index=True,
        comment="Departure airport ICAO"
    )
    destination_icao: Mapped[str] = mapped_column(
        String(4),
        nullable=False,
        index=True,
        comment="Arrival airport ICAO"
    )
    distance_nm: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
        comment="Calculated distance in nautical miles"
    )

    # Status
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        server_default="pending",
        index=True
    )

    # Cargo snapshot (copy at mission start for audit)
    cargo_snapshot: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
        comment="JSON snapshot of cargo items at mission start"
    )
    pax_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default="0",
        comment="Number of passengers"
    )
    cargo_weight_kg: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        server_default="0",
        comment="Total cargo weight in kg"
    )

    # Timing
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Takeoff timestamp"
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="Landing timestamp"
    )

    # Flight data (captured on completion)
    landing_fpm: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="Landing vertical speed in feet per minute"
    )
    max_gforce: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
        comment="Maximum G-force during flight"
    )
    final_icao: Mapped[str | None] = mapped_column(
        String(4),
        nullable=True,
        comment="Actual landing airport ICAO"
    )
    flight_time_minutes: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="Total flight time in minutes"
    )
    fuel_used_percent: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
        comment="Fuel used as percentage of capacity"
    )

    # Scoring (0-100 total)
    score_landing: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="Landing score /40"
    )
    score_gforce: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="G-force score /20"
    )
    score_destination: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="Correct destination score /20"
    )
    score_time: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="Time efficiency score /10"
    )
    score_fuel: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="Fuel efficiency score /10"
    )
    score_total: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="Total score /100"
    )
    grade: Mapped[str | None] = mapped_column(
        String(1),
        nullable=True,
        comment="Grade: S, A, B, C, D, E, F"
    )

    # Rewards
    xp_earned: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default="0",
        comment="XP earned by pilot"
    )

    # Failure reason (if failed)
    failure_reason: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        comment="crash, timeout, cancelled"
    )

    # Anti-cheat payload verification
    payload_start_lbs: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
        comment="Payload weight at mission start (lbs)"
    )
    payload_verified_lbs: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
        comment="Payload weight verified at 500ft before landing (lbs)"
    )
    cheated: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default="false",
        comment="True if payload tampering detected"
    )
    cheat_penalty_percent: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default="0",
        comment="XP penalty percentage (50 if cheated)"
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )

    # Relationships
    company = relationship("Company", backref="missions")
    pilot = relationship("User", backref="missions")
    aircraft = relationship("CompanyAircraft", backref="missions")

    def __repr__(self):
        return f"<Mission(id={self.id}, {self.origin_icao}->{self.destination_icao}, status={self.status})>"

    @staticmethod
    def calculate_landing_score(fpm: int) -> int:
        """Calculate landing score based on vertical speed (FPM)."""
        fpm = abs(fpm)  # Use absolute value
        if fpm <= 100:
            return 40  # Butter landing
        elif fpm <= 200:
            return 35
        elif fpm <= 300:
            return 25
        elif fpm <= 500:
            return 15
        elif fpm <= 700:
            return 5
        else:
            return 0  # Hard landing

    @staticmethod
    def calculate_gforce_score(max_g: float) -> int:
        """Calculate G-force score based on max G during flight."""
        if max_g < 1.5:
            return 20  # Smooth flight
        elif max_g < 2.0:
            return 15
        elif max_g < 2.5:
            return 10
        elif max_g < 3.0:
            return 5
        else:
            return 0  # Rough flight

    @staticmethod
    def calculate_destination_score(final_icao: str, destination_icao: str) -> int:
        """Calculate destination score - 20 if correct, 0 otherwise."""
        return 20 if final_icao == destination_icao else 0

    @staticmethod
    def calculate_time_score(actual_minutes: int, expected_minutes: int) -> int:
        """Calculate time efficiency score."""
        if expected_minutes <= 0:
            return 10  # Default if no expected time
        deviation = abs(actual_minutes - expected_minutes) / expected_minutes
        if deviation <= 0.10:
            return 10
        elif deviation <= 0.25:
            return 7
        elif deviation <= 0.50:
            return 4
        else:
            return 0

    @staticmethod
    def calculate_fuel_score(fuel_remaining_percent: float) -> int:
        """Calculate fuel efficiency score based on remaining fuel."""
        if fuel_remaining_percent >= 20:
            return 10
        elif fuel_remaining_percent >= 10:
            return 7
        elif fuel_remaining_percent >= 5:
            return 4
        else:
            return 0

    @staticmethod
    def calculate_grade(total_score: int) -> str:
        """Calculate grade from total score."""
        if total_score >= 95:
            return "S"
        elif total_score >= 85:
            return "A"
        elif total_score >= 70:
            return "B"
        elif total_score >= 55:
            return "C"
        elif total_score >= 40:
            return "D"
        elif total_score >= 25:
            return "E"
        else:
            return "F"

    @staticmethod
    def calculate_xp(distance_nm: float, grade: str, cargo_weight_kg: float, cheated: bool = False) -> int:
        """Calculate XP earned from mission. Halved if cheating detected."""
        grade_multipliers = {
            "S": 2.0, "A": 1.5, "B": 1.2, "C": 1.0,
            "D": 0.7, "E": 0.5, "F": 0.2
        }
        base_xp = distance_nm * 2
        multiplier = grade_multipliers.get(grade, 1.0)
        cargo_bonus = (cargo_weight_kg / 100) * 5
        total_xp = int((base_xp * multiplier) + cargo_bonus)

        # Apply 50% penalty if cheating detected
        if cheated:
            total_xp = total_xp // 2

        return total_xp

    @staticmethod
    def detect_cheating(payload_start: float, payload_verified: float, tolerance: float = 0.05) -> bool:
        """Detect payload tampering. Returns True if payload changed by more than tolerance (5%)."""
        if payload_start <= 0:
            return False
        diff_percent = abs(payload_verified - payload_start) / payload_start
        return diff_percent > tolerance
