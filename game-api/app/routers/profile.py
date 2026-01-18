from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.deps import get_db, get_current_user
from app.models.player_profile import PlayerProfile
from app.schemas.profile import PlayerProfileOut, PlayerProfileUpdateIn

router = APIRouter(prefix="/profile", tags=["Profile"])


@router.get("/me", response_model=PlayerProfileOut)
def get_my_profile(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    profile = db.query(PlayerProfile).filter(PlayerProfile.user_id == user.id).first()
    if not profile:
        profile = PlayerProfile(user_id=user.id)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


@router.patch("/me", response_model=PlayerProfileOut)
def update_my_profile(
    payload: PlayerProfileUpdateIn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    profile = db.query(PlayerProfile).filter(PlayerProfile.user_id == user.id).first()
    if not profile:
        profile = PlayerProfile(user_id=user.id)
        db.add(profile)
        db.flush()

    if payload.display_name is not None:
        val = payload.display_name.strip()
        profile.display_name = val if val else None

    db.commit()
    db.refresh(profile)
    return profile
