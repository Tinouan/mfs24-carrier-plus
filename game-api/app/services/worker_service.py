"""
V0.6 Worker Service
- Food consumption and injury management
- Worker pool reset
- Salary processing
"""
import logging
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.db import SessionLocal
from app.models.factory import Factory
from app.models.worker import Worker
from app.services.production_service import (
    process_food_consumption,
    check_worker_injuries,
)

logger = logging.getLogger(__name__)


def get_db_session() -> Session:
    """Crée une nouvelle session DB"""
    return SessionLocal()


def process_food_and_injuries():
    """
    Job horaire: consomme la nourriture et vérifie les blessures
    pour toutes les factories actives.
    """
    db = get_db_session()
    try:
        now = datetime.utcnow()
        logger.info(f"[V0.6] {now.isoformat()} - Processing food & injuries...")

        # Get all active factories with workers
        factories = db.query(Factory).filter(
            Factory.is_active == True,
            Factory.tier > 0  # T1+ only, T0 are NPC
        ).all()

        for factory in factories:
            try:
                # Check if factory has workers
                worker_count = db.query(Worker).filter(
                    Worker.factory_id == factory.id,
                    Worker.status == "working"
                ).count()

                if worker_count == 0:
                    continue

                # Process food consumption (1 hour elapsed)
                has_food = process_food_consumption(db, factory, hours_elapsed=1.0)

                # Check for injuries
                check_worker_injuries(db, factory, has_food)

                # Update food consumption rate
                factory.food_consumption_per_hour = worker_count

                if not has_food:
                    logger.warning(f"[V0.6] Factory {factory.name} has no food! Workers at risk.")

            except Exception as e:
                logger.error(f"[V0.6] Error processing factory {factory.id}: {e}")

        db.commit()
        logger.info("[V0.6] Food & injuries processing complete")

    except Exception as e:
        logger.error(f"[V0.6] Global error: {e}")
        db.rollback()
    finally:
        db.close()


def reset_airport_pools():
    """
    V0.6: Reset airport worker pools periodically.
    Generates new workers for pools that need refreshing.
    """
    from app.models.worker import AirportWorkerPool
    from datetime import timedelta

    db = get_db_session()
    try:
        now = datetime.utcnow()
        logger.info(f"[V0.6] {now.isoformat()} - Checking airport pools for reset...")

        # Find pools needing reset
        pools = db.query(AirportWorkerPool).filter(
            AirportWorkerPool.next_reset_at <= now
        ).all()

        for pool in pools:
            try:
                # Generate new workers for the pool
                generate_pool_workers(db, pool)

                # Schedule next reset (24 hours)
                pool.last_reset_at = now
                pool.next_reset_at = now + timedelta(hours=24)

                logger.info(f"[V0.6] Reset pool at {pool.airport_ident}")

            except Exception as e:
                logger.error(f"[V0.6] Error resetting pool {pool.airport_ident}: {e}")

        db.commit()
        logger.info("[V0.6] Pool reset complete")

    except Exception as e:
        logger.error(f"[V0.6] Pool reset error: {e}")
        db.rollback()
    finally:
        db.close()


def generate_pool_workers(db: Session, pool):
    """
    Génère des workers pour un pool d'aéroport.
    Called during pool reset.
    """
    from app.models.worker import Worker, CountryWorkerStats
    import random

    # Get the airport's country
    from app.models.airport import Airport
    airport = db.query(Airport).filter(Airport.ident == pool.airport_ident).first()

    if not airport:
        logger.warning(f"[V0.6] Airport not found: {pool.airport_ident}")
        return

    country_code = airport.iso_country or "US"  # Default to US

    # Get country stats (or use defaults)
    country_stats = db.query(CountryWorkerStats).filter(
        CountryWorkerStats.country_code == country_code
    ).first()

    if not country_stats:
        # Use default stats
        base_speed = 50
        base_resistance = 50
        base_salary = 10.0
    else:
        base_speed = country_stats.base_speed
        base_resistance = country_stats.base_resistance
        base_salary = float(country_stats.base_hourly_salary)

    # Remove old unemployed workers in the pool
    db.query(Worker).filter(
        Worker.airport_ident == pool.airport_ident,
        Worker.company_id.is_(None),
        Worker.status == "available"
    ).delete()

    # Generate new workers (up to max capacity)
    workers_to_generate = pool.max_workers
    engineers_to_generate = pool.max_engineers

    # Worker first names and last names by region
    first_names = ["Jean", "Pierre", "Marie", "Sophie", "François", "Michel", "André", "Jacques", "Philippe", "Nicolas"]
    last_names = ["Martin", "Bernard", "Dubois", "Thomas", "Robert", "Richard", "Petit", "Durand", "Moreau", "Simon"]

    # Generate workers
    for _ in range(workers_to_generate):
        # Randomize stats with ±20% variation
        speed = max(1, min(100, int(base_speed * random.uniform(0.8, 1.2))))
        resistance = max(1, min(100, int(base_resistance * random.uniform(0.8, 1.2))))
        salary = round(base_salary * random.uniform(0.9, 1.1), 2)

        worker = Worker(
            first_name=random.choice(first_names),
            last_name=random.choice(last_names),
            country_code=country_code,
            worker_type="worker",
            speed=speed,
            resistance=resistance,
            tier=1,
            xp=0,
            hourly_salary=salary,
            status="available",
            location_type="airport",
            airport_ident=pool.airport_ident,
        )
        db.add(worker)

    # Generate engineers
    for _ in range(engineers_to_generate):
        speed = max(1, min(100, int(base_speed * random.uniform(0.9, 1.3))))  # Engineers slightly better
        resistance = max(1, min(100, int(base_resistance * random.uniform(0.9, 1.3))))
        salary = round(base_salary * 2.0 * random.uniform(0.9, 1.1), 2)  # Engineers cost 2x

        engineer = Worker(
            first_name=random.choice(first_names),
            last_name=random.choice(last_names),
            country_code=country_code,
            worker_type="engineer",
            speed=speed,
            resistance=resistance,
            tier=1,
            xp=0,
            hourly_salary=salary,
            status="available",
            location_type="airport",
            airport_ident=pool.airport_ident,
        )
        db.add(engineer)

    # Update pool counts
    pool.current_workers = workers_to_generate
    pool.current_engineers = engineers_to_generate

    db.flush()
    logger.info(f"[V0.6] Generated {workers_to_generate} workers + {engineers_to_generate} engineers at {pool.airport_ident}")


def cleanup_dead_workers():
    """
    V0.6: Nettoie les workers morts (soft delete après 30 jours).
    """
    from datetime import timedelta

    db = get_db_session()
    try:
        cutoff = datetime.utcnow() - timedelta(days=30)

        # Delete workers who died more than 30 days ago
        deleted = db.query(Worker).filter(
            Worker.status == "dead",
            Worker.updated_at < cutoff
        ).delete()

        db.commit()

        if deleted > 0:
            logger.info(f"[V0.6] Cleaned up {deleted} dead workers")

    except Exception as e:
        logger.error(f"[V0.6] Cleanup error: {e}")
        db.rollback()
    finally:
        db.close()
