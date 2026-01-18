from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.deps import get_db, get_current_user
from app.models.user import User
from app.models.company import Company
from app.models.company_member import CompanyMember
from app.schemas.company_profile import CompanyProfileOut, CompanyProfilePatchIn

router = APIRouter(prefix="/company-profile", tags=["company-profile"])

EDIT_ROLES = {"owner", "admin"}


def _get_my_company(db: Session, user_id):
    cm = db.query(CompanyMember).filter(CompanyMember.user_id == user_id).one_or_none()
    if not cm:
        raise HTTPException(status_code=404, detail="User is not in a company")

    company = db.query(Company).filter(Company.id == cm.company_id).one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    return company, cm


@router.get("/me", response_model=CompanyProfileOut)
def get_my_company_profile(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    company, _ = _get_my_company(db, user.id)
    return company


@router.patch("/me", response_model=CompanyProfileOut)
def patch_my_company_profile(
    payload: CompanyProfilePatchIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    company, cm = _get_my_company(db, user.id)

    if cm.role not in EDIT_ROLES:
        raise HTTPException(status_code=403, detail="Insufficient role")

    if payload.display_name is not None:
        company.display_name = payload.display_name

    if payload.description is not None:
        company.description = payload.description

    if payload.logo_url is not None:
        company.logo_url = payload.logo_url

    if payload.is_public is not None:
        company.is_public = payload.is_public

    if payload.settings is not None:
        if not isinstance(payload.settings, dict):
            raise HTTPException(status_code=422, detail="settings must be an object")
        company.settings = payload.settings

    db.add(company)
    db.commit()
    db.refresh(company)
    return company
