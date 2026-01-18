from fastapi import APIRouter, Depends
from app.deps import get_current_user
from app.schemas.user import UserOut

router = APIRouter(tags=["users"])

@router.get("/me", response_model=UserOut)
def me(user = Depends(get_current_user)):
    return UserOut(id=user.id, email=user.email, username=user.username, is_admin=user.is_admin)
