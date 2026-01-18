from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.deps import get_db, get_current_user
from app.models.user import User
from app.models.player_profile import PlayerProfile
from app.schemas.profile import ProfileOut, ProfilePatchIn

router = APIRouter(prefix="/profile", tags=["profile"])


def _get_or_create_profile(db: Session, user_id) -> PlayerProfile:
    profile = db.query(PlayerProfile).filter(PlayerProfile.user_id == user_id).one_or_none()
    if profile:
        return profile

    profile = PlayerProfile(user_id=user_id)
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


@router.get("/me", response_model=ProfileOut)
def get_my_profile(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return _get_or_create_profile(db, user.id)


@router.patch("/me", response_model=ProfileOut)
def patch_my_profile(
    payload: ProfilePatchIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    profile = _get_or_create_profile(db, user.id)

    # Only update fields that are provided
    if payload.display_name is not None:
        profile.display_name = payload.display_name

    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile
