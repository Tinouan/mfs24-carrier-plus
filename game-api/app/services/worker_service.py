"""
V0.8.1 Worker Service (V2)
- Food consumption and injury management
- Salary processing
"""
import logging
from datetime import datetime

from sqlalchemy.orm import Session

from app.core.db import SessionLocal
from app.models.factory import Factory
from app.models.worker import WorkerInstance
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
        logger.info(f"[V2] {now.isoformat()} - Processing food & injuries...")

        # Get all active factories with workers
        factories = db.query(Factory).filter(
            Factory.is_active == True,
            Factory.tier > 0  # T1+ only, T0 are NPC
        ).all()

        for factory in factories:
            try:
                # Check if factory has workers (V2)
                worker_count = db.query(WorkerInstance).filter(
                    WorkerInstance.factory_id == factory.id,
                    WorkerInstance.status == "working"
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
                    logger.warning(f"[V2] Factory {factory.name} has no food! Workers at risk.")

            except Exception as e:
                logger.error(f"[V2] Error processing factory {factory.id}: {e}")

        db.commit()
        logger.info("[V2] Food & injuries processing complete")

    except Exception as e:
        logger.error(f"[V2] Global error: {e}")
        db.rollback()
    finally:
        db.close()


def cleanup_dead_workers():
    """
    V2: Nettoie les workers morts (soft delete après 30 jours).
    """
    from datetime import timedelta

    db = get_db_session()
    try:
        cutoff = datetime.utcnow() - timedelta(days=30)

        # Delete workers who died more than 30 days ago
        deleted = db.query(WorkerInstance).filter(
            WorkerInstance.status == "dead",
            WorkerInstance.updated_at < cutoff
        ).delete()

        db.commit()

        if deleted > 0:
            logger.info(f"[V2] Cleaned up {deleted} dead workers")

    except Exception as e:
        logger.error(f"[V2] Cleanup error: {e}")
        db.rollback()
    finally:
        db.close()
