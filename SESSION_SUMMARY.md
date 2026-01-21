# Session Summary - V0.5 Factory System Phase 2

**Date**: 21 janvier 2026
**Objectif**: Implémenter la Phase 2 du système Factory avec 6 nouvelles tables

---

## ✅ Réalisations

### 1. Base de données - 15 tables créées

**Phase 1 (Items & Recipes)**:
- ✅ `game.items` - 93 items (T0, T1, T2)
- ✅ `game.recipes` - 60 recettes
- ✅ `game.recipe_ingredients` - ~120 ingrédients

**Phase 2 (Factory System)**:
- ✅ `game.factories` - Usines des joueurs
- ✅ `game.workers` - Ouvriers avec système XP/tier
- ✅ `game.engineers` - Ingénieurs avec bonus spécialisés
- ✅ `game.factory_storage` - Stockage par usine
- ✅ `game.production_batches` - Lots de production
- ✅ `game.factory_transactions` - Audit des mouvements

**Base système**:
- ✅ `game.users` - Utilisateurs
- ✅ `game.companies` - Compagnies des joueurs
- ✅ `game.company_members` - Membres des compagnies
- ✅ `game.inventory_locations` - Emplacements d'inventaire
- ✅ `game.inventory_items` - Items en inventaire
- ✅ `game.inventory_audits` - Audit inventaire

### 2. Scripts SQL créés

- ✅ `sql/v0_0_init_base_schema_standalone.sql` - Tables de base
- ✅ `sql/v0_5_factories_schema_minimal.sql` - Items, recipes, ingredients
- ✅ `sql/v0_5_factories_phase2.sql` - 6 tables factory (modifié sans FK airports)
- ✅ `sql/seed_items_t0.sql` - 33 items T0
- ✅ `sql/seed_items_t1_t2.sql` - 60 items T1+T2
- ✅ `sql/seed_recipes_t1_t2.sql` - 60 recettes

### 3. Configuration Docker

- ✅ Projet lancé en local avec Docker Desktop
- ✅ Port PostgreSQL 5432 exposé dans docker-compose.yml
- ✅ 4 containers actifs: msfs_db, msfs_game_api, msfs_directus, msfs_nginx
- ✅ DBeaver connecté à PostgreSQL en local

### 4. API FastAPI

- ✅ Endpoint `/api/health` fonctionnel
- ✅ Endpoint `/api/world/items` fonctionnel (33 items T0 retournés)
- ✅ Swagger UI accessible sur `http://localhost:8080/api/docs`

---

## ⚠️ Problèmes identifiés

### 1. Incohérence noms de colonnes

**Problème**: Le modèle Python Recipe utilise des noms différents du schéma SQL

| Modèle Python (ancien) | Table SQL (réel) |
|------------------------|------------------|
| `base_duration_hours` | `production_time_hours` |
| `base_output_quantity` | `result_quantity` |
| Manque `result_item_id` | Existe |
| `tags` (ARRAY) | N'existe pas |
| `updated_at` | N'existe pas |

**Impact**: Erreur 500 sur `/api/world/recipes`

**Fichiers à corriger**:
- ✅ `game-api/app/models/recipe.py` - CORRIGÉ
- ⏳ `game-api/app/routers/world.py` - À corriger (7 occurrences)
- ⏳ `game-api/app/routers/factories.py` - À corriger
- ⏳ `game-api/app/schemas/factories.py` - À corriger

### 2. Table airports manquante

- La table `public.airports` n'existe pas
- Les FK vers airports ont été retirées temporairement
- À ajouter plus tard quand Directus sera configuré

### 3. Endpoints factories incomplets

- Router `/api/factories` existe mais endpoints non implémentés
- Pydantic schemas à créer pour validation

---

## 📋 Prochaines étapes

### Priorité 1 - Corriger les endpoints existants

1. **Corriger les noms de colonnes Recipe** (30 min)
   - Remplacer `base_duration_hours` → `production_time_hours` dans:
     - `app/routers/world.py`
     - `app/routers/factories.py`
     - `app/schemas/factories.py`
   - Remplacer `base_output_quantity` → `result_quantity`
   - Supprimer `tags` du modèle Recipe

2. **Tester endpoints world** (10 min)
   - `GET /api/world/recipes` doit fonctionner
   - `GET /api/world/recipes?tier=1`
   - `GET /api/world/recipes/{id}`

### Priorité 2 - Implémenter endpoints factories

3. **Créer Pydantic schemas** (1h)
   - `FactoryCreate`, `FactoryUpdate`, `FactoryResponse`
   - `WorkerCreate`, `WorkerUpdate`, `WorkerResponse`
   - `EngineerCreate`, `EngineerUpdate`, `EngineerResponse`
   - `ProductionBatchCreate`, `ProductionBatchResponse`

4. **Implémenter CRUD factories** (2h)
   ```python
   POST   /api/factories          # Créer usine
   GET    /api/factories          # Liste mes usines
   GET    /api/factories/{id}     # Détails usine
   PATCH  /api/factories/{id}     # Modifier usine
   DELETE /api/factories/{id}     # Supprimer (soft delete)
   ```

5. **Endpoints workers/engineers** (1h)
   ```python
   POST /api/factories/{id}/workers      # Embaucher worker
   GET  /api/factories/{id}/workers      # Liste workers
   POST /api/factories/{id}/engineers    # Assigner engineer
   ```

6. **Endpoints production** (2h)
   ```python
   POST /api/factories/{id}/batches      # Lancer production
   GET  /api/factories/{id}/batches      # Liste batches
   GET  /api/batches/{id}                # Détails + progression
   ```

### Priorité 3 - Déploiement NAS

7. **Synchroniser sur le NAS** (30 min)
   - Copier tous les fichiers modifiés
   - Exécuter les scripts SQL sur le NAS
   - Redémarrer les containers
   - Tester via `http://192.168.1.15:8080/api/docs`

---

## 🗂️ Structure finale base de données

```
game schema (15 tables)
├── users                    # Auth système
├── companies                # Compagnies joueurs
├── company_members          # Membres
├── inventory_locations      # Emplacements stockage
├── inventory_items          # Items stockés
├── inventory_audits         # Audit mouvements
├── items                    # Catalogue items (93)
├── recipes                  # Recettes production (60)
├── recipe_ingredients       # Ingrédients (~120)
├── factories               # Usines joueurs
├── workers                 # Ouvriers (XP/tier)
├── engineers               # Ingénieurs (bonus)
├── factory_storage         # Stockage usines
├── production_batches      # Lots production
└── factory_transactions    # Audit usines
```

---

## 📊 Statistiques

- **Temps passé**: ~4h
- **Tables créées**: 15
- **Items insérés**: 93 (33 T0, 30 T1, 30 T2)
- **Recettes insérées**: 60 (30 T1, 30 T2)
- **Scripts SQL**: 7 fichiers
- **Modèles Python**: 15 classes
- **Containers Docker**: 4 actifs

---

## 🚀 Commandes utiles

### Démarrer le projet local
```bash
cd c:\Users\tinou\Documents\mfs24-carrier-plus
docker compose up -d
```

### Vérifier les containers
```bash
docker compose ps
```

### Voir les logs API
```bash
docker logs msfs_game_api --tail 50
```

### Accéder à PostgreSQL
```bash
docker exec -it msfs_db psql -U msfs -d msfs
```

### Redémarrer l'API après modif
```bash
docker restart msfs_game_api
```

### Tester l'API
```bash
curl http://localhost:8080/api/health
curl http://localhost:8080/api/world/items | jq
```

### URLs importantes
- **Swagger UI**: http://localhost:8080/api/docs
- **Directus**: http://localhost:8055
- **PostgreSQL**: localhost:5432 (user: msfs, db: msfs)

---

## 📝 Notes importantes

1. **Ne pas utiliser `Base.metadata.create_all()`** - Tables créées via SQL scripts
2. **Schémas séparés**: `public` pour world data, `game` pour gameplay
3. **Foreign keys airports**: Retirées temporairement, à ajouter plus tard
4. **Modèle Recipe**: Corrigé pour correspondre au SQL
5. **DBeaver**: Connecté en local uniquement (pas au NAS pour l'instant)

---

## 🎯 Objectif final Phase 2

Avoir un système complet de factories fonctionnel:
- ✅ Tables BDD créées
- ⏳ Endpoints CRUD opérationnels
- ⏳ Validation Pydantic
- ⏳ Tests unitaires
- ⏳ Déployé sur NAS

**Progression**: 40% complété
