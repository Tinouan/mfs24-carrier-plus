"""
Service de production automatique
- Complétion des batches de production T1+
- Production automatique des usines T0 (NPC)
"""
import logging
from datetime import datetime
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.core.db import SessionLocal
from app.models.factory import Factory
from app.models.production_batch import ProductionBatch
from app.models.factory_storage import FactoryStorage
from app.models.factory_transaction import FactoryTransaction
from app.models.company_inventory import CompanyInventory
from app.models.recipe import Recipe
from app.models.worker import Worker
from app.models.inventory_location import InventoryLocation
from app.models.inventory_item import InventoryItem

# Configuration
T0_STOCK_LIMIT = 1000  # Stock max par produit T0
T0_PRODUCTION_RATE = 50  # Items produits par cycle pour T0
NPC_COMPANY_ID = "00000000-0000-0000-0000-000000000001"

# Mapping factory name keywords -> item names pour T0
T0_FACTORY_ITEM_MAPPING = {
    "céréal": "Raw Wheat",
    "agricole": "Raw Wheat",
    "élevage": "Raw Meat",
    "boucherie": "Raw Meat",
    "laiterie": "Raw Milk",
    "laitière": "Raw Milk",
    "fromagerie": "Raw Milk",
    "verger": "Raw Fruits",
    "fruits": "Raw Fruits",
    "maraîcher": "Raw Vegetables",
    "légumes": "Raw Vegetables",
    "pêcherie": "Raw Fish",
    "criée": "Raw Fish",
    "poisson": "Raw Fish",
    "raffinerie": "Crude Oil",
    "biocarburant": "Crude Oil",
    "gisement": "Natural Gas",
    "carrière": "Raw Stone",
    "mine": "Iron Ore",
    "minier": "Coal",
    "bois": "Raw Wood",
    "forêt": "Raw Wood",
    "eaux": "Raw Water",
    "source": "Raw Water",
    "sel": "Raw Salt",
    "sucre": "Raw Sugar",
}


def get_db_session() -> Session:
    """Crée une nouvelle session DB"""
    return SessionLocal()


def complete_pending_batches():
    """
    Vérifie les batches dont estimated_completion est passé
    et les marque comme completed.
    """
    db = get_db_session()
    try:
        now = datetime.utcnow()
        logger.info(f"[Production] {now.isoformat()} - Vérification batches...")

        # Trouver les batches à compléter
        batches = db.query(ProductionBatch).filter(
            ProductionBatch.status.in_(["pending", "in_progress"]),
            ProductionBatch.estimated_completion <= now
        ).all()

        if not batches:
            logger.debug("[Production] Aucun batch à compléter")
            return

        for batch in batches:
            try:
                complete_batch(db, batch)
                logger.info(f"[Production] Batch {batch.id} complété")
            except Exception as e:
                logger.error(f"[Production] Erreur batch {batch.id}: {e}")
                db.rollback()

    except Exception as e:
        logger.error(f"[Production] Erreur globale: {e}")
    finally:
        db.close()


def complete_batch(db: Session, batch: ProductionBatch):
    """Complète un batch de production (V0.6)"""
    # Récupérer la recette
    recipe = db.query(Recipe).filter(Recipe.id == batch.recipe_id).first()
    if not recipe:
        batch.status = "failed"
        db.commit()
        return

    factory = db.query(Factory).filter(Factory.id == batch.factory_id).first()
    if not factory:
        batch.status = "failed"
        db.commit()
        return

    # Récupérer les workers actifs
    workers = db.query(Worker).filter(
        Worker.factory_id == batch.factory_id,
        Worker.worker_type == "worker",
        Worker.status == "working"
    ).all()

    engineers = db.query(Worker).filter(
        Worker.factory_id == batch.factory_id,
        Worker.worker_type == "engineer",
        Worker.status == "working"
    ).all()

    # Calculer la quantité finale (avec bonus engineer si applicable)
    result_qty = batch.result_quantity
    if engineers and batch.engineer_bonus_applied:
        engineer_bonus = 1.0 + (len(engineers) * 0.1)  # +10% par engineer
        result_qty = int(result_qty * min(engineer_bonus, 1.5))  # Max 50% bonus

    # V0.7: Ajouter directement à company_inventory (au lieu de factory_storage)
    company_inv = db.query(CompanyInventory).filter(
        CompanyInventory.company_id == factory.company_id,
        CompanyInventory.item_id == recipe.result_item_id,
        CompanyInventory.airport_ident == factory.airport_ident,
    ).first()

    if not company_inv:
        company_inv = CompanyInventory(
            company_id=factory.company_id,
            item_id=recipe.result_item_id,
            airport_ident=factory.airport_ident,
            qty=0,
        )
        db.add(company_inv)
        db.flush()

    company_inv.qty += result_qty

    # Log la transaction
    transaction = FactoryTransaction(
        factory_id=batch.factory_id,
        item_id=recipe.result_item_id,
        transaction_type="produced",
        quantity=result_qty,
        batch_id=batch.id,
        notes=f"Production completed: {recipe.name}"
    )
    db.add(transaction)

    # V0.6: Donner de l'XP aux workers avec tier-based bonus
    xp_per_worker = recipe.tier * 10  # 10 XP par tier
    for worker in workers:
        worker.xp += xp_per_worker

    for engineer in engineers:
        engineer.xp += xp_per_worker * 2  # Engineers get double XP

    # Mettre à jour le batch
    batch.status = "completed"
    batch.completed_at = datetime.utcnow()

    # Remettre la factory en idle
    factory.status = "idle"

    db.commit()


def calculate_worker_tier(xp: int) -> int:
    """Calcule le tier d'un worker basé sur son XP (V0.6 thresholds)"""
    if xp >= 15000:
        return 5  # Maître
    elif xp >= 7000:
        return 4  # Expert
    elif xp >= 3000:
        return 3  # Confirmé
    elif xp >= 1000:
        return 2  # Apprenti
    return 1  # Novice


# =====================================================
# V0.6 FOOD & INJURY SYSTEM
# =====================================================

def calculate_production_time(base_hours: float, workers: list[Worker], has_food: bool) -> float:
    """
    Calcule le temps de production basé sur la vitesse des workers.
    Formula: base_time * (200 / sum(worker.speed))
    Sans food: vitesse réduite de 50%
    """
    if not workers:
        return base_hours * 4  # Penalty if no workers

    total_speed = sum(w.speed for w in workers)

    # Sans food: 50% speed penalty
    if not has_food:
        total_speed = total_speed * 0.5

    # Minimum 10 total speed to avoid division issues
    total_speed = max(total_speed, 10)

    time_multiplier = 200 / total_speed
    return base_hours * time_multiplier


def process_food_consumption(db: Session, factory: Factory, hours_elapsed: float = 1.0):
    """
    Consomme la nourriture de la factory.
    Retourne True si les workers sont nourris, False sinon.
    """
    workers = db.query(Worker).filter(
        Worker.factory_id == factory.id,
        Worker.status == "working"
    ).all()

    if not workers:
        return True  # No workers, no food needed

    # Food consumption: 1 unit per worker per hour
    food_needed = int(len(workers) * hours_elapsed)

    if factory.food_stock >= food_needed:
        factory.food_stock -= food_needed
        return True
    else:
        # Consume what's available
        factory.food_stock = 0
        return False


def check_worker_injuries(db: Session, factory: Factory, has_food: bool):
    """
    V0.6: Vérifie et applique les blessures aux workers.
    Sans food: risque de blessure x2
    """
    import random
    from datetime import timedelta

    workers = db.query(Worker).filter(
        Worker.factory_id == factory.id,
        Worker.status == "working"
    ).all()

    base_injury_chance = 0.005  # 0.5% base chance per hour

    if not has_food:
        base_injury_chance *= 2  # Double risk without food

    for worker in workers:
        # Resistance reduces injury chance
        injury_chance = base_injury_chance * (100 - worker.resistance) / 100

        if random.random() < injury_chance:
            worker.status = "injured"
            worker.injured_at = datetime.utcnow()
            logger.warning(f"[Injury] Worker {worker.id} injured at factory {factory.id}")


def process_injured_workers():
    """
    V0.6: Traite les workers blessés (job scheduler).
    - ≤10 jours: récupération possible
    - >10 jours: mort
    """
    from app.models.company import Company

    db = get_db_session()
    try:
        now = datetime.utcnow()
        max_injury_days = 10
        logger.info(f"[V0.6] {now.isoformat()} - Processing injured workers...")

        injured_workers = db.query(Worker).filter(
            Worker.status == "injured",
            Worker.injured_at.isnot(None)
        ).all()

        deaths = 0
        for worker in injured_workers:
            days_injured = (now - worker.injured_at).days

            if days_injured > max_injury_days:
                # Worker dies
                worker.status = "dead"
                deaths += 1
                logger.error(f"[Death] Worker {worker.id} died after {days_injured} days injured")

                # Death penalty for company (if employed)
                if worker.company_id:
                    company = db.query(Company).filter(Company.id == worker.company_id).first()
                    if company:
                        # Penalty: lose 10000 credits
                        company.balance = max(0, company.balance - 10000)
                        logger.warning(f"[Death Penalty] Company {company.id} penalized 10000 for worker death")

                # Remove from company/factory
                worker.company_id = None
                worker.factory_id = None

        db.commit()

        if deaths > 0:
            logger.info(f"[V0.6] {deaths} workers died from injuries")
        else:
            logger.debug("[V0.6] No worker deaths")

    except Exception as e:
        logger.error(f"[V0.6] Error processing injured workers: {e}")
        db.rollback()
    finally:
        db.close()


def process_salary_payments():
    """
    V0.6: Paye les salaires des workers (job scheduler).
    Salaire payé même sans food (les workers continuent de travailler).
    """
    from app.models.company import Company

    db = get_db_session()
    try:
        now = datetime.utcnow()
        logger.info(f"[V0.6] {now.isoformat()} - Processing salary payments...")

        # Get all employed workers
        workers = db.query(Worker).filter(
            Worker.company_id.isnot(None),
            Worker.status.in_(["working", "available"])
        ).all()

        # Group by company (1 hour of salary)
        company_salaries = {}
        for worker in workers:
            if worker.company_id not in company_salaries:
                company_salaries[worker.company_id] = 0
            company_salaries[worker.company_id] += float(worker.hourly_salary)

        # Deduct from company balance
        total_paid = 0
        for company_id, total_salary in company_salaries.items():
            company = db.query(Company).filter(Company.id == company_id).first()
            if company:
                company.balance = max(0, company.balance - total_salary)
                total_paid += total_salary

        db.commit()
        logger.info(f"[V0.6] Paid {total_paid:.2f} credits in salaries to {len(company_salaries)} companies")

    except Exception as e:
        logger.error(f"[V0.6] Error processing salary payments: {e}")
        db.rollback()
    finally:
        db.close()


def process_t0_factories():
    """
    Production automatique des usines T0 (NPC).
    Les items sont mis en vente directement à l'aéroport.
    """
    db = get_db_session()
    try:
        now = datetime.utcnow()
        logger.info(f"[T0 Production] {now.isoformat()} - Cycle de production...")

        # Récupérer toutes les factories T0 actives
        factories = db.query(Factory).filter(
            Factory.tier == 0,
            Factory.is_active == True,
            Factory.status == "producing"
        ).all()

        if not factories:
            logger.debug("[T0 Production] Aucune factory T0 active")
            return

        # Importer Item ici pour éviter les imports circulaires
        from app.models.item import Item

        for factory in factories:
            try:
                # Déterminer l'item à produire basé sur le nom
                item_name = get_t0_item_from_factory_name(factory.name)
                if not item_name:
                    continue

                # Trouver l'item
                item = db.query(Item).filter(Item.name == item_name).first()
                if not item:
                    logger.warning(f"[T0] Item '{item_name}' non trouvé pour {factory.name}")
                    continue

                # Trouver ou créer le warehouse NPC à cet aéroport
                warehouse = get_or_create_npc_warehouse(db, factory.airport_ident)

                # Vérifier le stock actuel
                inventory = db.query(InventoryItem).filter(
                    InventoryItem.location_id == warehouse.id,
                    InventoryItem.item_id == item.id
                ).first()

                current_stock = inventory.qty if inventory else 0

                # Ne pas produire si stock >= limite
                if current_stock >= T0_STOCK_LIMIT:
                    continue

                # Calculer combien produire (sans dépasser la limite)
                can_produce = min(T0_PRODUCTION_RATE, T0_STOCK_LIMIT - current_stock)

                if can_produce <= 0:
                    continue

                # Ajouter au stock
                if not inventory:
                    inventory = InventoryItem(
                        location_id=warehouse.id,
                        item_id=item.id,
                        qty=0,
                        for_sale=True,
                        sale_price=item.base_value,
                        sale_qty=0
                    )
                    db.add(inventory)
                    db.flush()

                inventory.qty += can_produce
                inventory.for_sale = True
                inventory.sale_price = item.base_value
                inventory.sale_qty = inventory.qty  # Tout en vente

                logger.info(f"[T0] {factory.name} @ {factory.airport_ident}: +{can_produce} {item_name}")

            except Exception as e:
                logger.error(f"[T0] Erreur factory {factory.name}: {e}")

        db.commit()
        logger.info("[T0 Production] Cycle terminé")

    except Exception as e:
        logger.error(f"[T0 Production] Erreur globale: {e}")
        db.rollback()
    finally:
        db.close()


def get_t0_item_from_factory_name(factory_name: str) -> str | None:
    """Détermine l'item produit par une factory T0 basé sur son nom"""
    name_lower = factory_name.lower()
    for keyword, item_name in T0_FACTORY_ITEM_MAPPING.items():
        if keyword in name_lower:
            return item_name
    return None


def get_or_create_npc_warehouse(db: Session, airport_ident: str) -> InventoryLocation:
    """Récupère ou crée un warehouse NPC à un aéroport"""
    from uuid import UUID

    npc_company_id = UUID(NPC_COMPANY_ID)

    warehouse = db.query(InventoryLocation).filter(
        InventoryLocation.company_id == npc_company_id,
        InventoryLocation.airport_ident == airport_ident,
        InventoryLocation.kind == "warehouse"
    ).first()

    if not warehouse:
        warehouse = InventoryLocation(
            company_id=npc_company_id,
            kind="warehouse",
            airport_ident=airport_ident,
            name=f"NPC Warehouse {airport_ident}"
        )
        db.add(warehouse)
        db.flush()

    return warehouse
