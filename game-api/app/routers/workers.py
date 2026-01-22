"""
V0.6 Workers System - API Endpoints
Unified workers and engineers management
"""
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_
from sqlalchemy.orm import Session

from app.deps import get_db
from app.models.worker import Worker, AirportWorkerPool, CountryWorkerStats
from app.models.factory import Factory
from app.models.company import Company
from app.schemas.workers import (
    WorkerOut,
    WorkerListOut,
    WorkerHireIn,
    WorkerHireBulkIn,
    WorkerAssignIn,
    AirportWorkerPoolOut,
    PoolWorkerOut,
    AirportPoolDetailOut,
    CompanyWorkersOut,
    FactoryWorkersOut,
    CountryWorkerStatsOut,
    WorkerXpThresholdOut,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workers", tags=["workers"])


# =====================================================
# AIRPORT WORKER POOLS
# =====================================================

@router.get("/pools", response_model=list[AirportWorkerPoolOut])
def list_airport_pools(
    airport_type: Optional[str] = Query(None, description="Filter by airport type (large_airport, medium_airport)"),
    has_workers: bool = Query(False, description="Only show pools with available workers"),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db)
):
    """List all airport worker pools."""
    query = select(AirportWorkerPool)

    if airport_type:
        query = query.where(AirportWorkerPool.airport_type == airport_type)

    if has_workers:
        query = query.where(
            (AirportWorkerPool.current_workers > 0) |
            (AirportWorkerPool.current_engineers > 0)
        )

    query = query.limit(limit)
    pools = db.execute(query).scalars().all()
    return pools


@router.get("/pool/{airport_ident}", response_model=AirportPoolDetailOut)
def get_airport_pool(airport_ident: str, db: Session = Depends(get_db)):
    """Get airport worker pool with available workers."""
    # Get pool info
    pool = db.execute(
        select(AirportWorkerPool).where(AirportWorkerPool.airport_ident == airport_ident.upper())
    ).scalar_one_or_none()

    if not pool:
        raise HTTPException(status_code=404, detail=f"Airport pool not found: {airport_ident}")

    # Get available workers in pool
    workers_query = select(Worker).where(
        and_(
            Worker.airport_ident == airport_ident.upper(),
            Worker.location_type == "airport",
            Worker.company_id.is_(None),
            Worker.status == "available",
            Worker.worker_type == "worker"
        )
    )
    workers = db.execute(workers_query).scalars().all()

    # Get available engineers in pool
    engineers_query = select(Worker).where(
        and_(
            Worker.airport_ident == airport_ident.upper(),
            Worker.location_type == "airport",
            Worker.company_id.is_(None),
            Worker.status == "available",
            Worker.worker_type == "engineer"
        )
    )
    engineers = db.execute(engineers_query).scalars().all()

    return AirportPoolDetailOut(
        airport_ident=pool.airport_ident,
        airport_name=None,  # Could join with airports table
        max_workers=pool.max_workers,
        max_engineers=pool.max_engineers,
        available_workers=[PoolWorkerOut.model_validate(w) for w in workers],
        available_engineers=[PoolWorkerOut.model_validate(e) for e in engineers]
    )


# =====================================================
# HIRING WORKERS
# =====================================================

@router.post("/hire/{company_id}", response_model=WorkerOut)
def hire_worker(
    company_id: uuid.UUID,
    hire_data: WorkerHireIn,
    db: Session = Depends(get_db)
):
    """Hire a worker from airport pool to company."""
    # Verify company exists
    company = db.execute(
        select(Company).where(Company.id == company_id)
    ).scalar_one_or_none()

    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # Get worker
    worker = db.execute(
        select(Worker).where(Worker.id == hire_data.worker_id)
    ).scalar_one_or_none()

    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")

    # Verify worker is available in pool
    if worker.company_id is not None:
        raise HTTPException(status_code=400, detail="Worker already employed")

    if worker.status != "available":
        raise HTTPException(status_code=400, detail=f"Worker not available (status: {worker.status})")

    if worker.location_type != "airport":
        raise HTTPException(status_code=400, detail="Worker not in airport pool")

    # Hire worker
    worker.company_id = company_id
    worker.status = "available"  # Available for assignment to factory

    # Update pool count
    pool = db.execute(
        select(AirportWorkerPool).where(AirportWorkerPool.airport_ident == worker.airport_ident)
    ).scalar_one_or_none()

    if pool:
        if worker.worker_type == "engineer":
            pool.current_engineers = max(0, pool.current_engineers - 1)
        else:
            pool.current_workers = max(0, pool.current_workers - 1)

    db.commit()
    db.refresh(worker)

    logger.info(f"[Workers] Hired {worker.worker_type} {worker.id} to company {company_id}")
    return worker


@router.post("/hire-bulk/{company_id}", response_model=list[WorkerOut])
def hire_workers_bulk(
    company_id: uuid.UUID,
    hire_data: WorkerHireBulkIn,
    db: Session = Depends(get_db)
):
    """Hire multiple workers from airport pool."""
    # Verify company exists
    company = db.execute(
        select(Company).where(Company.id == company_id)
    ).scalar_one_or_none()

    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    hired_workers = []

    for worker_id in hire_data.worker_ids:
        worker = db.execute(
            select(Worker).where(Worker.id == worker_id)
        ).scalar_one_or_none()

        if not worker:
            continue  # Skip invalid workers

        if worker.company_id is not None or worker.status != "available":
            continue  # Skip unavailable workers

        # Hire worker
        worker.company_id = company_id

        # Update pool count
        pool = db.execute(
            select(AirportWorkerPool).where(AirportWorkerPool.airport_ident == worker.airport_ident)
        ).scalar_one_or_none()

        if pool:
            if worker.worker_type == "engineer":
                pool.current_engineers = max(0, pool.current_engineers - 1)
            else:
                pool.current_workers = max(0, pool.current_workers - 1)

        hired_workers.append(worker)

    db.commit()

    for w in hired_workers:
        db.refresh(w)

    logger.info(f"[Workers] Bulk hired {len(hired_workers)} workers to company {company_id}")
    return hired_workers


# =====================================================
# ASSIGNING WORKERS TO FACTORIES
# =====================================================

@router.post("/{worker_id}/assign", response_model=WorkerOut)
def assign_worker_to_factory(
    worker_id: uuid.UUID,
    assign_data: WorkerAssignIn,
    db: Session = Depends(get_db)
):
    """Assign a company worker to a factory."""
    worker = db.execute(
        select(Worker).where(Worker.id == worker_id)
    ).scalar_one_or_none()

    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")

    if worker.company_id is None:
        raise HTTPException(status_code=400, detail="Worker not employed by any company")

    if worker.status != "available":
        raise HTTPException(status_code=400, detail=f"Worker not available (status: {worker.status})")

    # Get factory
    factory = db.execute(
        select(Factory).where(Factory.id == assign_data.factory_id)
    ).scalar_one_or_none()

    if not factory:
        raise HTTPException(status_code=404, detail="Factory not found")

    # Verify factory belongs to same company
    if factory.company_id != worker.company_id:
        raise HTTPException(status_code=403, detail="Factory belongs to different company")

    # Check capacity
    current_count = db.execute(
        select(func.count(Worker.id)).where(
            and_(
                Worker.factory_id == factory.id,
                Worker.worker_type == worker.worker_type
            )
        )
    ).scalar()

    max_capacity = factory.max_engineers if worker.worker_type == "engineer" else factory.max_workers

    if current_count >= max_capacity:
        raise HTTPException(
            status_code=400,
            detail=f"Factory at {worker.worker_type} capacity ({current_count}/{max_capacity})"
        )

    # Assign worker
    worker.factory_id = factory.id
    worker.location_type = "factory"
    worker.status = "working"

    db.commit()
    db.refresh(worker)

    logger.info(f"[Workers] Assigned {worker.worker_type} {worker_id} to factory {factory.id}")
    return worker


@router.post("/{worker_id}/unassign", response_model=WorkerOut)
def unassign_worker_from_factory(
    worker_id: uuid.UUID,
    db: Session = Depends(get_db)
):
    """Remove worker from factory (stays with company)."""
    worker = db.execute(
        select(Worker).where(Worker.id == worker_id)
    ).scalar_one_or_none()

    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")

    if worker.factory_id is None:
        raise HTTPException(status_code=400, detail="Worker not assigned to any factory")

    factory_id = worker.factory_id

    # Unassign
    worker.factory_id = None
    worker.location_type = "airport"  # Returns to company's airport
    worker.status = "available"

    db.commit()
    db.refresh(worker)

    logger.info(f"[Workers] Unassigned {worker.worker_type} {worker_id} from factory {factory_id}")
    return worker


# =====================================================
# FIRING WORKERS
# =====================================================

@router.delete("/{worker_id}", response_model=dict)
def fire_worker(
    worker_id: uuid.UUID,
    db: Session = Depends(get_db)
):
    """Fire a worker (returns to airport pool)."""
    worker = db.execute(
        select(Worker).where(Worker.id == worker_id)
    ).scalar_one_or_none()

    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")

    if worker.company_id is None:
        raise HTTPException(status_code=400, detail="Worker not employed")

    company_id = worker.company_id
    airport_ident = worker.airport_ident

    # Fire worker - return to pool
    worker.company_id = None
    worker.factory_id = None
    worker.location_type = "airport"
    worker.status = "available"

    # Update pool count
    pool = db.execute(
        select(AirportWorkerPool).where(AirportWorkerPool.airport_ident == airport_ident)
    ).scalar_one_or_none()

    if pool:
        if worker.worker_type == "engineer":
            pool.current_engineers = min(pool.max_engineers, pool.current_engineers + 1)
        else:
            pool.current_workers = min(pool.max_workers, pool.current_workers + 1)

    db.commit()

    logger.info(f"[Workers] Fired {worker.worker_type} {worker_id} from company {company_id}")
    return {"success": True, "message": f"Worker {worker_id} returned to pool at {airport_ident}"}


# =====================================================
# COMPANY WORKERS
# =====================================================

@router.get("/company/{company_id}", response_model=CompanyWorkersOut)
def get_company_workers(company_id: uuid.UUID, db: Session = Depends(get_db)):
    """Get all workers owned by a company."""
    # Verify company exists
    company = db.execute(
        select(Company).where(Company.id == company_id)
    ).scalar_one_or_none()

    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # Get workers
    workers = db.execute(
        select(Worker).where(
            and_(Worker.company_id == company_id, Worker.worker_type == "worker")
        )
    ).scalars().all()

    # Get engineers
    engineers = db.execute(
        select(Worker).where(
            and_(Worker.company_id == company_id, Worker.worker_type == "engineer")
        )
    ).scalars().all()

    return CompanyWorkersOut(
        company_id=company_id,
        total_workers=len(workers),
        total_engineers=len(engineers),
        workers=[WorkerListOut.model_validate(w) for w in workers],
        engineers=[WorkerListOut.model_validate(e) for e in engineers]
    )


# =====================================================
# FACTORY WORKERS
# =====================================================

@router.get("/factory/{factory_id}", response_model=FactoryWorkersOut)
def get_factory_workers(factory_id: uuid.UUID, db: Session = Depends(get_db)):
    """Get workers assigned to a factory."""
    factory = db.execute(
        select(Factory).where(Factory.id == factory_id)
    ).scalar_one_or_none()

    if not factory:
        raise HTTPException(status_code=404, detail="Factory not found")

    # Get workers
    workers = db.execute(
        select(Worker).where(
            and_(Worker.factory_id == factory_id, Worker.worker_type == "worker")
        )
    ).scalars().all()

    # Get engineers
    engineers = db.execute(
        select(Worker).where(
            and_(Worker.factory_id == factory_id, Worker.worker_type == "engineer")
        )
    ).scalars().all()

    return FactoryWorkersOut(
        factory_id=factory_id,
        factory_name=factory.name,
        max_workers=factory.max_workers,
        max_engineers=factory.max_engineers,
        current_workers=len(workers),
        current_engineers=len(engineers),
        workers=[WorkerListOut.model_validate(w) for w in workers],
        engineers=[WorkerListOut.model_validate(e) for e in engineers]
    )


# =====================================================
# REFERENCE DATA
# =====================================================

@router.get("/countries", response_model=list[CountryWorkerStatsOut])
def list_country_stats(db: Session = Depends(get_db)):
    """List all country worker statistics."""
    countries = db.execute(select(CountryWorkerStats)).scalars().all()
    return countries


@router.get("/country/{country_code}", response_model=CountryWorkerStatsOut)
def get_country_stats(country_code: str, db: Session = Depends(get_db)):
    """Get worker statistics for a specific country."""
    stats = db.execute(
        select(CountryWorkerStats).where(CountryWorkerStats.country_code == country_code.upper())
    ).scalar_one_or_none()

    if not stats:
        raise HTTPException(status_code=404, detail=f"Country not found: {country_code}")

    return stats


# =====================================================
# SINGLE WORKER
# =====================================================

@router.get("/{worker_id}", response_model=WorkerOut)
def get_worker(worker_id: uuid.UUID, db: Session = Depends(get_db)):
    """Get a specific worker's details."""
    worker = db.execute(
        select(Worker).where(Worker.id == worker_id)
    ).scalar_one_or_none()

    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")

    return worker


# =====================================================
# ADMIN/DEV ENDPOINTS
# =====================================================

@router.post("/admin/generate-pool/{airport_ident}", response_model=dict)
def admin_generate_pool_workers(airport_ident: str, db: Session = Depends(get_db)):
    """[DEV] Manually generate workers for an airport pool."""
    from app.services.worker_service import generate_pool_workers

    pool = db.execute(
        select(AirportWorkerPool).where(AirportWorkerPool.airport_ident == airport_ident.upper())
    ).scalar_one_or_none()

    if not pool:
        raise HTTPException(status_code=404, detail=f"Pool not found: {airport_ident}")

    generate_pool_workers(db, pool)
    db.commit()

    return {
        "success": True,
        "airport_ident": airport_ident.upper(),
        "workers_generated": pool.current_workers,
        "engineers_generated": pool.current_engineers
    }
