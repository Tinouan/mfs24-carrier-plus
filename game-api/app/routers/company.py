from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.deps import get_db, get_current_user
from app.models.company import Company, slugify
from app.models.company_member import CompanyMember
from app.models.company_permission import CompanyPermission
from app.models.user import User
from app.schemas.company import CompanyCreateIn, CompanyOut, MemberAddIn, MemberOut
from app.schemas.inventory import CompanyPermissionOut, CompanyPermissionUpdateIn

router = APIRouter(prefix="/company", tags=["company"])

ALLOWED_ROLES = {"owner", "admin", "member"}

def get_my_company(db: Session, user_id):
    cm = db.query(CompanyMember).filter(CompanyMember.user_id == user_id).first()
    if not cm:
        return None, None
    c = db.query(Company).filter(Company.id == cm.company_id).first()
    return c, cm

@router.post("", response_model=CompanyOut)
def create_company(
    payload: CompanyCreateIn,
    db: Session = Depends(get_db),
    user = Depends(get_current_user),
):
    # One company per user for now
    existing_member = db.query(CompanyMember).filter(CompanyMember.user_id == user.id).first()
    if existing_member:
        raise HTTPException(status_code=400, detail="User already in a company")

    # Require home airport (forced by schema, but keep a safe guard)
    home_ident = (payload.home_airport_ident or "").strip().upper()
    if not home_ident:
        raise HTTPException(status_code=400, detail="home_airport_ident is required")

    # Validate airport exists in world table (public.airports)
    airport_exists = db.execute(
        text("SELECT 1 FROM public.airports WHERE ident = :ident LIMIT 1"),
        {"ident": home_ident},
    ).first()
    if not airport_exists:
        raise HTTPException(status_code=400, detail="Invalid home_airport_ident")

    # Generate unique slug
    base_slug = slugify(payload.name)
    slug = base_slug
    counter = 1
    while db.query(Company).filter(Company.slug == slug).first():
        slug = f"{base_slug[:45]}-{counter}"
        counter += 1

    c = Company(
        name=payload.name,
        slug=slug,
        home_airport_ident=home_ident,
        owner_user_id=user.id,
    )
    db.add(c)
    db.flush()  # get c.id

    # add owner membership
    cm = CompanyMember(company_id=c.id, user_id=user.id, role="owner")
    db.add(cm)

    # V0.7: Create founder permissions
    founder_perms = CompanyPermission.create_founder_permissions(c.id, user.id)
    db.add(founder_perms)

    # create default vault location (global company vault)
    from app.models.inventory_location import InventoryLocation
    vault = InventoryLocation(
        company_id=c.id,
        kind="company_warehouse",
        airport_ident=home_ident,
        name="Main Warehouse",
        owner_type="company",
        owner_id=c.id,
    )
    db.add(vault)

    db.commit()
    db.refresh(c)

    return CompanyOut(
        id=c.id,
        name=c.name,
        home_airport_ident=c.home_airport_ident,
        created_at=c.created_at,
    )

@router.get("/me", response_model=CompanyOut)
def company_me(
    db: Session = Depends(get_db),
    user = Depends(get_current_user),
):
    c, _cm = get_my_company(db, user.id)
    if not c:
        raise HTTPException(status_code=404, detail="No company")

    return CompanyOut(
        id=c.id,
        name=c.name,
        home_airport_ident=c.home_airport_ident,
        created_at=c.created_at,
    )

@router.get("/members", response_model=list[MemberOut])
def list_members(
    db: Session = Depends(get_db),
    user = Depends(get_current_user),
):
    c, _cm = get_my_company(db, user.id)
    if not c:
        raise HTTPException(status_code=404, detail="No company")

    rows = db.query(CompanyMember, User).join(
        User, CompanyMember.user_id == User.id
    ).filter(CompanyMember.company_id == c.id).all()

    return [
        MemberOut(
            company_id=member.company_id,
            user_id=member.user_id,
            role=member.role,
            username=u.username,
            email=u.email
        )
        for member, u in rows
    ]

@router.post("/members/add", response_model=MemberOut)
def add_member(
    payload: MemberAddIn,
    db: Session = Depends(get_db),
    user = Depends(get_current_user),
):
    c, my_member = get_my_company(db, user.id)
    if not c or not my_member:
        raise HTTPException(status_code=404, detail="No company")

    if my_member.role not in {"owner", "admin"}:
        raise HTTPException(status_code=403, detail="Not allowed")

    role = payload.role.lower().strip()
    if role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")

    target = db.query(User).filter(User.email == payload.email.lower()).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    existing = db.query(CompanyMember).filter(
        CompanyMember.company_id == c.id,
        CompanyMember.user_id == target.id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Already a member")

    # prevent adding someone already in another company (for MVP)
    other = db.query(CompanyMember).filter(CompanyMember.user_id == target.id).first()
    if other:
        raise HTTPException(status_code=400, detail="User already in a company")

    cm = CompanyMember(company_id=c.id, user_id=target.id, role=role)
    db.add(cm)

    # V0.7: Create permissions based on role
    if role == "owner":
        perms = CompanyPermission.create_founder_permissions(c.id, target.id)
    else:
        perms = CompanyPermission.create_member_permissions(c.id, target.id)
        # Admins get more permissions
        if role == "admin":
            perms.can_withdraw_warehouse = True
            perms.can_withdraw_factory = True
            perms.can_manage_aircraft = True
            perms.can_sell_market = True
            perms.can_manage_workers = True
            perms.can_manage_factories = True
    db.add(perms)

    db.commit()

    return MemberOut(
        company_id=cm.company_id,
        user_id=cm.user_id,
        role=cm.role,
        username=target.username,
        email=target.email
    )


# ═══════════════════════════════════════════════════════════
# V0.7 PERMISSIONS ENDPOINTS
# ═══════════════════════════════════════════════════════════

@router.get("/permissions", response_model=list[CompanyPermissionOut])
def list_company_permissions(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """V0.7 - List all member permissions for my company"""
    c, my_member = get_my_company(db, user.id)
    if not c or not my_member:
        raise HTTPException(status_code=404, detail="No company")

    # Only owners/admins can see all permissions
    if my_member.role not in {"owner", "admin"}:
        # Regular members can only see their own
        perms = db.query(CompanyPermission).filter(
            CompanyPermission.company_id == c.id,
            CompanyPermission.user_id == user.id,
        ).first()
        if not perms:
            return []

        u = db.query(User).filter(User.id == user.id).first()
        return [CompanyPermissionOut(
            user_id=perms.user_id,
            username=u.username if u else None,
            can_withdraw_warehouse=perms.can_withdraw_warehouse,
            can_deposit_warehouse=perms.can_deposit_warehouse,
            can_withdraw_factory=perms.can_withdraw_factory,
            can_deposit_factory=perms.can_deposit_factory,
            can_manage_aircraft=perms.can_manage_aircraft,
            can_use_aircraft=perms.can_use_aircraft,
            can_sell_market=perms.can_sell_market,
            can_buy_market=perms.can_buy_market,
            can_manage_workers=perms.can_manage_workers,
            can_manage_members=perms.can_manage_members,
            can_manage_factories=perms.can_manage_factories,
            is_founder=perms.is_founder,
        )]

    # Get all permissions with usernames
    rows = db.query(CompanyPermission, User).join(
        User, CompanyPermission.user_id == User.id
    ).filter(CompanyPermission.company_id == c.id).all()

    return [
        CompanyPermissionOut(
            user_id=perms.user_id,
            username=u.username,
            can_withdraw_warehouse=perms.can_withdraw_warehouse,
            can_deposit_warehouse=perms.can_deposit_warehouse,
            can_withdraw_factory=perms.can_withdraw_factory,
            can_deposit_factory=perms.can_deposit_factory,
            can_manage_aircraft=perms.can_manage_aircraft,
            can_use_aircraft=perms.can_use_aircraft,
            can_sell_market=perms.can_sell_market,
            can_buy_market=perms.can_buy_market,
            can_manage_workers=perms.can_manage_workers,
            can_manage_members=perms.can_manage_members,
            can_manage_factories=perms.can_manage_factories,
            is_founder=perms.is_founder,
        )
        for perms, u in rows
    ]


@router.get("/permissions/{user_id}", response_model=CompanyPermissionOut)
def get_member_permissions(
    user_id: UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """V0.7 - Get permissions for a specific member"""
    c, my_member = get_my_company(db, user.id)
    if not c or not my_member:
        raise HTTPException(status_code=404, detail="No company")

    # Can only view own permissions unless owner/admin
    if my_member.role not in {"owner", "admin"} and user_id != user.id:
        raise HTTPException(status_code=403, detail="Not allowed")

    perms = db.query(CompanyPermission).filter(
        CompanyPermission.company_id == c.id,
        CompanyPermission.user_id == user_id,
    ).first()

    if not perms:
        raise HTTPException(status_code=404, detail="Permissions not found")

    target_user = db.query(User).filter(User.id == user_id).first()

    return CompanyPermissionOut(
        user_id=perms.user_id,
        username=target_user.username if target_user else None,
        can_withdraw_warehouse=perms.can_withdraw_warehouse,
        can_deposit_warehouse=perms.can_deposit_warehouse,
        can_withdraw_factory=perms.can_withdraw_factory,
        can_deposit_factory=perms.can_deposit_factory,
        can_manage_aircraft=perms.can_manage_aircraft,
        can_use_aircraft=perms.can_use_aircraft,
        can_sell_market=perms.can_sell_market,
        can_buy_market=perms.can_buy_market,
        can_manage_workers=perms.can_manage_workers,
        can_manage_members=perms.can_manage_members,
        can_manage_factories=perms.can_manage_factories,
        is_founder=perms.is_founder,
    )


@router.patch("/permissions/{user_id}", response_model=CompanyPermissionOut)
def update_member_permissions(
    user_id: UUID,
    payload: CompanyPermissionUpdateIn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """V0.7 - Update permissions for a member (owner/admin only)"""
    c, my_member = get_my_company(db, user.id)
    if not c or not my_member:
        raise HTTPException(status_code=404, detail="No company")

    # Check caller has permission to manage members
    my_perms = db.query(CompanyPermission).filter(
        CompanyPermission.company_id == c.id,
        CompanyPermission.user_id == user.id,
    ).first()

    if not my_perms or not (my_perms.is_founder or my_perms.can_manage_members):
        raise HTTPException(status_code=403, detail="No permission to manage members")

    # Get target permissions
    target_perms = db.query(CompanyPermission).filter(
        CompanyPermission.company_id == c.id,
        CompanyPermission.user_id == user_id,
    ).first()

    if not target_perms:
        raise HTTPException(status_code=404, detail="Member permissions not found")

    # Cannot modify founder permissions unless you are the founder
    if target_perms.is_founder and not my_perms.is_founder:
        raise HTTPException(status_code=403, detail="Cannot modify founder permissions")

    # Update only provided fields
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if value is not None:
            setattr(target_perms, field, value)

    db.commit()
    db.refresh(target_perms)

    target_user = db.query(User).filter(User.id == user_id).first()

    return CompanyPermissionOut(
        user_id=target_perms.user_id,
        username=target_user.username if target_user else None,
        can_withdraw_warehouse=target_perms.can_withdraw_warehouse,
        can_deposit_warehouse=target_perms.can_deposit_warehouse,
        can_withdraw_factory=target_perms.can_withdraw_factory,
        can_deposit_factory=target_perms.can_deposit_factory,
        can_manage_aircraft=target_perms.can_manage_aircraft,
        can_use_aircraft=target_perms.can_use_aircraft,
        can_sell_market=target_perms.can_sell_market,
        can_buy_market=target_perms.can_buy_market,
        can_manage_workers=target_perms.can_manage_workers,
        can_manage_members=target_perms.can_manage_members,
        can_manage_factories=target_perms.can_manage_factories,
        is_founder=target_perms.is_founder,
    )
