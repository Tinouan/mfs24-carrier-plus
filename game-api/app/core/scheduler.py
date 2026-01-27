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
MISSION_TIMEOUT_CHECK_MINUTES = 15  # V0.8 Check mission timeouts every 15 min
MISSION_TIMEOUT_HOURS = 24  # Missions expire after 24 hours


def check_mission_timeouts():
    """
    V0.8 - Check for missions that have timed out (in_progress > 24 hours).
    Returns cargo to origin, marks mission as failed.
    """
    from datetime import datetime, timedelta
    from sqlalchemy.orm import Session
    from app.core.db import SessionLocal
    from app.models.mission import Mission
    from app.models.company_aircraft import CompanyAircraft
    from app.models.company_inventory import CompanyInventory
    import uuid

    db: Session = SessionLocal()
    try:
        cutoff = datetime.utcnow() - timedelta(hours=MISSION_TIMEOUT_HOURS)

        # Find expired missions
        expired_missions = db.query(Mission).filter(
            Mission.status == "in_progress",
            Mission.started_at < cutoff,
        ).all()

        for mission in expired_missions:
            logger.info(f"[Scheduler] Mission {mission.id} timed out after 24h")

            # Return cargo to origin
            if mission.cargo_snapshot and mission.cargo_snapshot.get("items"):
                for cargo in mission.cargo_snapshot["items"]:
                    try:
                        item_id = uuid.UUID(cargo["item_id"])
                        # Find or create inventory at origin
                        origin_inv = db.query(CompanyInventory).filter(
                            CompanyInventory.company_id == mission.company_id,
                            CompanyInventory.item_id == item_id,
                            CompanyInventory.airport_ident == mission.origin_icao,
                        ).first()

                        if origin_inv:
                            origin_inv.quantity += cargo["quantity"]
                        else:
                            origin_inv = CompanyInventory(
                                company_id=mission.company_id,
                                item_id=item_id,
                                airport_ident=mission.origin_icao,
                                quantity=cargo["quantity"],
                            )
                            db.add(origin_inv)
                    except Exception as e:
                        logger.error(f"[Scheduler] Error returning cargo: {e}")

            # Reset aircraft to parked at origin
            if mission.aircraft_id:
                aircraft = db.query(CompanyAircraft).filter(
                    CompanyAircraft.id == mission.aircraft_id
                ).first()
                if aircraft:
                    aircraft.status = "parked"
                    # Keep at origin (don't change location)

            # Mark mission as failed
            mission.status = "failed"
            mission.failure_reason = "timeout"
            mission.completed_at = datetime.utcnow()
            mission.xp_earned = 0

        if expired_missions:
            db.commit()
            logger.info(f"[Scheduler] Processed {len(expired_missions)} timed out missions")

    except Exception as e:
        db.rollback()
        logger.error(f"[Scheduler] Error in check_mission_timeouts: {e}")
    finally:
        db.close()


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

    # Job 6: V2 - Cleanup dead workers (tous les jours)
    scheduler.add_job(
        cleanup_dead_workers,
        trigger=IntervalTrigger(hours=24),
        id="dead_workers_cleanup",
        name="V2 Nettoyage workers morts",
        replace_existing=True,
    )

    # Job 7: V0.8 - Mission timeout check (toutes les 15 min)
    scheduler.add_job(
        check_mission_timeouts,
        trigger=IntervalTrigger(minutes=MISSION_TIMEOUT_CHECK_MINUTES),
        id="mission_timeout_check",
        name="V0.8 Mission timeout check",
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
