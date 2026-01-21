# Prochaine session - Tâches prioritaires

## 🔴 URGENT - Corriger erreurs existantes

### Tâche 1: Corriger modèle Recipe et routers (30 min)

**Problème**: Incohérence entre modèle Python et table SQL

**Fichiers à modifier**:

1. ✅ `game-api/app/models/recipe.py` - DÉJÀ CORRIGÉ

2. ⏳ `game-api/app/routers/world.py` - Remplacer:
   ```python
   # Chercher et remplacer TOUS:
   base_duration_hours → production_time_hours
   base_output_quantity → result_quantity
   recipe.tags → (retirer - n'existe pas)
   ```

3. ⏳ `game-api/app/routers/factories.py` - Même chose

4. ⏳ `game-api/app/schemas/factories.py` - Modifier schemas Pydantic:
   ```python
   class RecipeListOut(BaseModel):
       id: uuid.UUID
       name: str
       tier: int
       production_time_hours: float  # ← ancien: base_duration_hours
       result_quantity: int          # ← ancien: base_output_quantity
   ```

**Test de validation**:
```bash
docker restart msfs_game_api
curl http://localhost:8080/api/world/recipes?tier=1
# Doit retourner JSON, pas "Internal Server Error"
```

---

## 🟡 Implémenter endpoints factories

### Tâche 2: Créer schemas Pydantic (1h)

**Créer fichier**: `game-api/app/schemas/factories_v2.py`

```python
from pydantic import BaseModel, Field
from datetime import datetime
import uuid

# ============= FACTORIES =============

class FactoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    airport_ident: str = Field(..., min_length=3, max_length=4)

class FactoryUpdate(BaseModel):
    name: str | None = None
    status: str | None = Field(None, pattern="^(idle|producing|maintenance|offline)$")

class FactoryResponse(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    airport_ident: str
    name: str
    factory_type: str | None
    status: str
    current_recipe_id: uuid.UUID | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# ============= WORKERS =============

class WorkerCreate(BaseModel):
    factory_id: uuid.UUID | None = None
    first_name: str = Field(..., min_length=1, max_length=50)
    last_name: str = Field(..., min_length=1, max_length=50)

class WorkerResponse(BaseModel):
    id: uuid.UUID
    factory_id: uuid.UUID | None
    first_name: str
    last_name: str
    tier: int
    health: int
    happiness: int
    xp: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

# ============= ENGINEERS =============

class EngineerCreate(BaseModel):
    airport_ident: str = Field(..., min_length=3, max_length=4)
    name: str = Field(..., min_length=1, max_length=100)
    specialization: str = Field(..., pattern="^(food_processing|metal_smelting|chemical_refining|construction|electronics|medical|fuel_production|general)$")

class EngineerResponse(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    airport_ident: str
    name: str
    specialization: str
    bonus_percentage: int
    experience: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

# ============= PRODUCTION BATCHES =============

class ProductionBatchCreate(BaseModel):
    recipe_id: uuid.UUID
    workers_assigned: int = Field(..., ge=1, le=100)

class ProductionBatchResponse(BaseModel):
    id: uuid.UUID
    factory_id: uuid.UUID
    recipe_id: uuid.UUID
    status: str
    started_at: datetime | None
    estimated_completion: datetime | None
    completed_at: datetime | None
    result_quantity: int | None
    workers_assigned: int | None
    engineer_bonus_applied: bool
    created_at: datetime

    class Config:
        from_attributes = True
```

### Tâche 3: Implémenter router factories (2h)

**Modifier fichier**: `game-api/app/routers/factories.py`

Structure attendue:
```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.deps import get_db, get_current_user
from app.models.factory import Factory
from app.models.worker import Worker
from app.models.engineer import Engineer
from app.models.production_batch import ProductionBatch
from app.schemas.factories_v2 import *

router = APIRouter(prefix="/factories", tags=["factories"])

# ============= FACTORIES CRUD =============

@router.post("", response_model=FactoryResponse)
def create_factory(
    payload: FactoryCreate,
    db: Session = Depends(get_db),
    user = Depends(get_current_user),
):
    """Créer une nouvelle usine"""
    # 1. Vérifier que user a une company
    # 2. Vérifier limits (max factories par airport)
    # 3. Créer la factory
    # 4. Retourner response
    pass

@router.get("", response_model=list[FactoryResponse])
def list_my_factories(
    db: Session = Depends(get_db),
    user = Depends(get_current_user),
):
    """Liste toutes mes usines"""
    pass

@router.get("/{factory_id}", response_model=FactoryResponse)
def get_factory_details(
    factory_id: uuid.UUID,
    db: Session = Depends(get_db),
    user = Depends(get_current_user),
):
    """Détails d'une usine"""
    # Vérifier ownership
    pass

@router.patch("/{factory_id}", response_model=FactoryResponse)
def update_factory(
    factory_id: uuid.UUID,
    payload: FactoryUpdate,
    db: Session = Depends(get_db),
    user = Depends(get_current_user),
):
    """Modifier une usine"""
    pass

@router.delete("/{factory_id}")
def delete_factory(
    factory_id: uuid.UUID,
    db: Session = Depends(get_db),
    user = Depends(get_current_user),
):
    """Supprimer (soft delete) une usine"""
    # is_active = False
    pass

# ============= WORKERS =============

@router.post("/{factory_id}/workers", response_model=WorkerResponse)
def hire_worker(
    factory_id: uuid.UUID,
    payload: WorkerCreate,
    db: Session = Depends(get_db),
    user = Depends(get_current_user),
):
    """Embaucher un worker pour cette usine"""
    pass

@router.get("/{factory_id}/workers", response_model=list[WorkerResponse])
def list_factory_workers(
    factory_id: uuid.UUID,
    db: Session = Depends(get_db),
    user = Depends(get_current_user),
):
    """Liste les workers de cette usine"""
    pass

# ============= PRODUCTION =============

@router.post("/{factory_id}/batches", response_model=ProductionBatchResponse)
def start_production(
    factory_id: uuid.UUID,
    payload: ProductionBatchCreate,
    db: Session = Depends(get_db),
    user = Depends(get_current_user),
):
    """Lancer un nouveau batch de production"""
    # 1. Vérifier recipe existe
    # 2. Vérifier workers disponibles
    # 3. Vérifier ingrédients en storage
    # 4. Créer batch
    # 5. Calculer estimated_completion
    pass

@router.get("/{factory_id}/batches", response_model=list[ProductionBatchResponse])
def list_production_batches(
    factory_id: uuid.UUID,
    db: Session = Depends(get_db),
    user = Depends(get_current_user),
):
    """Liste tous les batches (en cours + historique)"""
    pass
```

### Tâche 4: Tester via Swagger UI (30 min)

1. Redémarrer API: `docker restart msfs_game_api`
2. Ouvrir: http://localhost:8080/api/docs
3. Créer un user de test
4. Créer une company de test
5. Créer une factory
6. Embaucher des workers
7. Lancer un batch de production

---

## 🟢 Déploiement NAS

### Tâche 5: Synchroniser sur NAS (30 min)

**Prérequis**: Tous les endpoints doivent fonctionner en local d'abord!

```bash
# 1. Copier fichiers modifiés
scp game-api/app/models/recipe.py admin@192.168.1.15:/volume1/docker/msfs-directus/game-api/app/models/
scp game-api/app/routers/world.py admin@192.168.1.15:/volume1/docker/msfs-directus/game-api/app/routers/
scp game-api/app/routers/factories.py admin@192.168.1.15:/volume1/docker/msfs-directus/game-api/app/routers/
scp game-api/app/schemas/factories_v2.py admin@192.168.1.15:/volume1/docker/msfs-directus/game-api/app/schemas/

# 2. Copier scripts SQL
scp sql/v0_0_init_base_schema_standalone.sql admin@192.168.1.15:/volume1/docker/msfs-directus/sql/
scp sql/v0_5_factories_schema_minimal.sql admin@192.168.1.15:/volume1/docker/msfs-directus/sql/
scp sql/v0_5_factories_phase2.sql admin@192.168.1.15:/volume1/docker/msfs-directus/sql/
scp sql/seed_items_t0.sql admin@192.168.1.15:/volume1/docker/msfs-directus/sql/
scp sql/seed_items_t1_t2.sql admin@192.168.1.15:/volume1/docker/msfs-directus/sql/
scp sql/seed_recipes_t1_t2.sql admin@192.168.1.15:/volume1/docker/msfs-directus/sql/

# 3. Se connecter au NAS
ssh admin@192.168.1.15
cd /volume1/docker/msfs-directus

# 4. Exécuter scripts SQL (si pas déjà fait)
docker compose exec -T msfs_db psql -U msfs -d msfs < sql/v0_0_init_base_schema_standalone.sql
docker compose exec -T msfs_db psql -U msfs -d msfs < sql/v0_5_factories_schema_minimal.sql
docker compose exec -T msfs_db psql -U msfs -d msfs < sql/seed_items_t0.sql
docker compose exec -T msfs_db psql -U msfs -d msfs < sql/seed_items_t1_t2.sql
docker compose exec -T msfs_db psql -U msfs -d msfs < sql/seed_recipes_t1_t2.sql
docker compose exec -T msfs_db psql -U msfs -d msfs < sql/v0_5_factories_phase2.sql

# 5. Redémarrer API
docker compose restart msfs_game_api

# 6. Tester
curl http://192.168.1.15:8080/api/health
curl http://192.168.1.15:8080/api/world/items
```

---

## ✅ Checklist de validation

Avant de considérer la Phase 2 comme terminée:

- [ ] Endpoint `/api/world/recipes` fonctionne
- [ ] Endpoint `/api/world/recipes?tier=1` retourne 30 recettes T1
- [ ] Endpoint `/api/world/items` retourne 93 items
- [ ] Endpoint `POST /api/factories` crée une usine
- [ ] Endpoint `GET /api/factories` liste mes usines
- [ ] Endpoint `POST /api/factories/{id}/workers` embauche un worker
- [ ] Endpoint `POST /api/factories/{id}/batches` lance production
- [ ] Tout fonctionne en local (Docker Desktop)
- [ ] Tout fonctionne sur le NAS
- [ ] Documentation mise à jour

---

## 📁 Fichiers à garder

**Code**:
- `game-api/app/models/*.py`
- `game-api/app/routers/*.py`
- `game-api/app/schemas/*.py`
- `docker-compose.yml`

**SQL**:
- `sql/v0_0_init_base_schema_standalone.sql`
- `sql/v0_5_factories_schema_minimal.sql`
- `sql/v0_5_factories_phase2.sql`
- `sql/seed_items_t0.sql`
- `sql/seed_items_t1_t2.sql`
- `sql/seed_recipes_t1_t2.sql`

**Documentation**:
- `SESSION_SUMMARY.md`
- `NEXT_SESSION.md`
- `ROADMAP.md`
- `README.md`

---

## 🗑️ Fichiers à supprimer

Voir fichier `CLEANUP.md` pour la liste complète.
