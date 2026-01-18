from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID
from typing import List

from app.deps import get_db, get_current_user
from app.models.company_member import CompanyMember
from app.models.company_aircraft import CompanyAircraft
from app.schemas.fleet import AircraftOut

router = APIRouter(prefix="/fleet", tags=["fleet"])


def get_user_company_id(db: Session, user_id) -> UUID:
    cm = db.query(CompanyMember).filter(CompanyMember.user_id == user_id).first()
    if not cm:
        raise HTTPException(status_code=404, detail="No company")
    return cm.company_id


@router.get("", response_model=List[AircraftOut])
def list_my_fleet(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    company_id = get_user_company_id(db, user.id)
    rows = (
        db.query(CompanyAircraft)
        .filter(CompanyAircraft.company_id == company_id)
        .order_by(CompanyAircraft.created_at.desc())
        .all()
    )
    return rows


@router.get("/{aircraft_id}", response_model=AircraftOut)
def get_aircraft(
    aircraft_id: UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    company_id = get_user_company_id(db, user.id)

    row = db.query(CompanyAircraft).filter(CompanyAircraft.id == aircraft_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Aircraft not found")
    if row.company_id != company_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    return row
