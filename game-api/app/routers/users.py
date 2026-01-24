from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.deps import get_current_user, get_db
from app.schemas.user import UserOut
from app.models.company_member import CompanyMember

router = APIRouter(prefix="/users", tags=["users"])

@router.get("/me", response_model=UserOut)
def me(user = Depends(get_current_user), db: Session = Depends(get_db)):
    # Find user's company (if any)
    company_id = None
    membership = db.query(CompanyMember).filter(CompanyMember.user_id == user.id).first()
    if membership:
        company_id = membership.company_id

    return UserOut(
        id=user.id,
        email=user.email,
        username=user.username,
        is_admin=user.is_admin,
        wallet=float(user.wallet) if user.wallet else 0,
        company_id=company_id
    )
