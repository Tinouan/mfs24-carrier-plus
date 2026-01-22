"""
APScheduler pour les tâches automatiques
- Production automatique des usines T0 (NPC)
- Complétion des batches de production T1+
"""
import logging
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)

# Instance globale du scheduler
scheduler = BackgroundScheduler()

# Configuration
T0_PRODUCTION_INTERVAL_MINUTES = 5  # Production T0 toutes les 5 min
BATCH_CHECK_INTERVAL_MINUTES = 1    # Vérification batches toutes les minutes
HOURLY_JOBS_INTERVAL_MINUTES = 60   # Jobs horaires (salaires, injuries)
POOL_RESET_INTERVAL_HOURS = 6       # Reset pools toutes les 6 heures


def setup_jobs():
    """Configure tous les jobs planifiés"""
    from app.services.production_service import (
        process_t0_factories,
        complete_pending_batches,
        process_injured_workers,
        process_salary_payments,
    )
    from app.services.worker_service import (
        process_food_and_injuries,
        reset_airport_pools,
        cleanup_dead_workers,
    )

    # Job 1: Production automatique T0 (toutes les 5 min)
    scheduler.add_job(
        process_t0_factories,
        trigger=IntervalTrigger(minutes=T0_PRODUCTION_INTERVAL_MINUTES),
        id="t0_auto_production",
        name="Production automatique usines T0",
        replace_existing=True,
    )

    # Job 2: Complétion des batches T1+ (toutes les minutes)
    scheduler.add_job(
        complete_pending_batches,
        trigger=IntervalTrigger(minutes=BATCH_CHECK_INTERVAL_MINUTES),
        id="batch_completion",
        name="Complétion batches de production",
        replace_existing=True,
    )

    # Job 3: V0.6 - Food consumption & injury checks (toutes les heures)
    scheduler.add_job(
        process_food_and_injuries,
        trigger=IntervalTrigger(minutes=HOURLY_JOBS_INTERVAL_MINUTES),
        id="food_and_injuries",
        name="V0.6 Food consumption et blessures",
        replace_existing=True,
    )

    # Job 4: V0.6 - Salary payments (toutes les heures)
    scheduler.add_job(
        process_salary_payments,
        trigger=IntervalTrigger(minutes=HOURLY_JOBS_INTERVAL_MINUTES),
        id="salary_payments",
        name="V0.6 Paiement des salaires",
        replace_existing=True,
    )

    # Job 5: V0.6 - Injured workers processing (toutes les heures)
    scheduler.add_job(
        process_injured_workers,
        trigger=IntervalTrigger(minutes=HOURLY_JOBS_INTERVAL_MINUTES),
        id="injury_processing",
        name="V0.6 Traitement blessures workers",
        replace_existing=True,
    )

    # Job 6: V0.6 - Reset airport worker pools (toutes les 6 heures)
    scheduler.add_job(
        reset_airport_pools,
        trigger=IntervalTrigger(hours=POOL_RESET_INTERVAL_HOURS),
        id="pool_reset",
        name="V0.6 Reset pools workers aéroports",
        replace_existing=True,
    )

    # Job 7: V0.6 - Cleanup dead workers (tous les jours)
    scheduler.add_job(
        cleanup_dead_workers,
        trigger=IntervalTrigger(hours=24),
        id="dead_workers_cleanup",
        name="V0.6 Nettoyage workers morts",
        replace_existing=True,
    )

    logger.info("[Scheduler] Jobs configurés (7 jobs)")


def start_scheduler():
    """Démarre le scheduler au lancement de l'app"""
    if not scheduler.running:
        setup_jobs()
        scheduler.start()
        logger.info("[Scheduler] Démarré")


def stop_scheduler():
    """Arrête proprement le scheduler"""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("[Scheduler] Arrêté")
