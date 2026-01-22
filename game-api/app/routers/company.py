from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.deps import get_db, get_current_user
from app.models.company import Company, slugify
from app.models.company_member import CompanyMember
from app.models.user import User
from app.schemas.company import CompanyCreateIn, CompanyOut, MemberAddIn, MemberOut

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

    # create default vault location (global company vault)
    from app.models.inventory_location import InventoryLocation
    vault = InventoryLocation(company_id=c.id, kind="vault", airport_ident="", name="Company Vault")
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
    db.commit()

    return MemberOut(
        company_id=cm.company_id,
        user_id=cm.user_id,
        role=cm.role,
        username=target.username,
        email=target.email
    )
