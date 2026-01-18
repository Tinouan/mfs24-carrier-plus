import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.deps import get_db, get_current_user
from app.models.user import User
from app.models.company import Company
from app.models.company_member import CompanyMember
from app.models.market_order import MarketOrder
from app.models.company_transaction import CompanyTransaction
from app.schemas.market import (
    WalletOut,
    TransactionOut,
    MarketOrderCreateIn,
    MarketOrderOut,
)

router = APIRouter(prefix="/market", tags=["market"])


def _get_my_company(db: Session, user_id):
    cm = db.query(CompanyMember).filter(CompanyMember.user_id == user_id).one_or_none()
    if not cm:
        raise HTTPException(status_code=404, detail="User is not in a company")

    company = db.query(Company).filter(Company.id == cm.company_id).one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    return company, cm


# ===== Wallet =====

@router.get("/wallet", response_model=WalletOut)
def get_wallet(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    company, _ = _get_my_company(db, user.id)
    return WalletOut(company_id=company.id, balance=float(company.balance))


@router.get("/transactions", response_model=list[TransactionOut])
def list_transactions(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    company, _ = _get_my_company(db, user.id)

    txs = (
        db.query(CompanyTransaction)
        .filter(CompanyTransaction.company_id == company.id)
        .order_by(CompanyTransaction.created_at.desc())
        .limit(50)
        .all()
    )
    return txs


# ===== Market Orders =====

@router.get("/orders", response_model=list[MarketOrderOut])
def list_my_orders(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    company, _ = _get_my_company(db, user.id)

    orders = (
        db.query(MarketOrder)
        .filter(MarketOrder.company_id == company.id)
        .order_by(MarketOrder.created_at.desc())
        .limit(100)
        .all()
    )
    return orders


@router.post("/orders", response_model=MarketOrderOut)
def create_order(
    payload: MarketOrderCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    company, cm = _get_my_company(db, user.id)

    if cm.role not in {"owner", "admin"}:
        raise HTTPException(status_code=403, detail="Insufficient role")

    order = MarketOrder(
        id=uuid.uuid4(),
        company_id=company.id,
        side=payload.side,
        item_code=payload.item_code,
        quantity=payload.quantity,
        unit_price=payload.unit_price,
        status="open",
    )

    db.add(order)
    db.commit()
    db.refresh(order)
    return order
