# Mfs Carrier+ (MSFS 2024)

Backend modulaire pour **Microsoft Flight Simulator 2024** : Auth, Company, Inventory, Fleet, Market, **Factory System (V0.5)**, Missions.
Stack Docker avec **FastAPI + PostgreSQL + Directus + Nginx**.

> Repo : https://github.com/Tinouan/mfs24-carrier-plus

---

## Objectif

Mfs Carrier+ fournit un socle "game backend" utilisable par :
- une **tablette in-game** (UI intégrée MSFS)
- un **admin panel web**
- des services gameplay (marché, usines de production, missions, logs)

Le backend est **source de vérité** : inventaires, flotte, économie, production, règles, audit.

---

## Architecture

### Services Docker

```
┌─────────────────────────────────────────────────────────┐
│                      Nginx (8080)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ /api/        │  │ /directus/   │  │ /map/        │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘  │
└─────────┼──────────────────┼──────────────────────────┘
          │                  │
          ▼                  ▼
  ┌───────────────┐  ┌───────────────┐
  │  FastAPI      │  │   Directus    │
  │  (game-api)   │  │   (8055)      │
  │  Port 8000    │  │               │
  └───────┬───────┘  └───────┬───────┘
          │                  │
          └──────────┬───────┘
                     ▼
            ┌────────────────┐
            │  PostgreSQL 16 │
            │  Port 5432     │
            └────────────────┘
```

### Base de données PostgreSQL

**2 schémas distincts**:

1. **`public`** - Données monde (Directus)
   - `airports` - Aéroports MSFS (via Directus, pas encore importé)
   - Autres tables Directus

2. **`game`** - Données gameplay (FastAPI)

   **Core** (6 tables):
   - `users` - Comptes joueurs
   - `companies` - Compagnies de transport
   - `company_members` - Membres d'une compagnie
   - `inventory_locations` - Emplacements de stockage
   - `inventory_items` - Inventaire par emplacement
   - `inventory_audits` - Historique des mouvements

   **Fleet & Market** (2 tables):
   - `company_aircraft` - Flotte aérienne
   - `market_orders` - Ordres d'achat/vente

   **World Data** (3 tables):
   - `items` - 93 items T0-T2 (matières premières + produits)
   - `recipes` - 60 recettes T1-T2 (production)
   - `recipe_ingredients` - Ingrédients requis par recette

   **Factory System V0.5** (6 tables):
   - `factories` - Usines de production
   - `workers` - Employés avec XP/tier
   - `engineers` - Ingénieurs (bonus production)
   - `factory_storage` - Stockage local d'usine
   - `production_batches` - Lots de production
   - `factory_transactions` - Audit usine

   **Total : 17 tables**

### FastAPI Routes

**Système** (2 endpoints):
- `GET /health` - Santé de l'API
- `POST /sql/execute` - Exécution SQL (DEV ONLY, à retirer en prod)

**Auth** (3 endpoints):
- `POST /auth/register` - Inscription
- `POST /auth/login` - Connexion (retourne JWT)
- `GET /auth/me` - Info user actuel

**Companies** (CRUD compagnie):
- `POST /company` - Créer compagnie
- `GET /company` - Liste compagnies
- `GET /company/{id}` - Détails
- `PATCH /company/{id}` - Modifier

**Inventory** (CRUD inventaire):
- `GET /inventory` - Liste items
- `POST /inventory/transfer` - Transférer items

**Fleet** (Flotte aérienne):
- `GET /fleet` - Liste avions
- `POST /fleet` - Acheter avion
- `PATCH /fleet/{id}` - Modifier avion

**Market** (Marché):
- `GET /market/orders` - Liste ordres
- `POST /market/orders` - Créer ordre
- `DELETE /market/orders/{id}` - Annuler ordre

**World** (Données publiques):
- `GET /world/items` - Liste items (filtres: tier, tag, is_raw)
- `GET /world/items/{id}` - Détails item
- `GET /world/items/search/{name}` - Recherche item
- `GET /world/recipes` - Liste recettes (filtres: tier)
- `GET /world/recipes/{id}` - Détails recette + ingrédients
- `GET /world/recipes/search/{name}` - Recherche recette
- `GET /world/stats/items` - Stats items
- `GET /world/stats/recipes` - Stats recettes

**Factories** (Système d'usines - EN COURS):
- `GET /factories` - Liste mes usines
- `POST /factories` - Créer usine
- `GET /factories/{id}` - Détails usine
- `PATCH /factories/{id}` - Modifier usine
- `DELETE /factories/{id}` - Détruire usine
- `POST /factories/{id}/workers` - Embaucher worker
- `GET /factories/{id}/workers` - Liste workers
- `DELETE /factories/{id}/workers/{id}` - Licencier worker
- `POST /factories/{id}/engineer` - Embaucher engineer
- `DELETE /factories/{id}/engineer` - Licencier engineer
- `GET /factories/{id}/storage` - Inventaire usine
- `POST /factories/{id}/storage/deposit` - Déposer items
- `POST /factories/{id}/storage/withdraw` - Retirer items
- `POST /factories/{id}/start` - Lancer production
- `POST /factories/{id}/stop` - Arrêter production
- `GET /factories/stats/overview` - Stats globales

---

## État actuel du développement

### ✅ Complété

**Phase 0.1-0.4** (Core système):
- ✅ Auth JWT + users
- ✅ Companies + members
- ✅ Inventory + locations + audits
- ✅ Fleet (aircraft)
- ✅ Market orders
- ✅ Player profiles
- ✅ Company profiles

**Phase 0.5 - Factory System**:
- ✅ **Phase 1**: Items + Recipes
  - 93 items (T0: 33 raw materials, T1-T2: 60 processed)
  - 60 recettes (T1: 30, T2: 30)
  - Endpoints world data fonctionnels
- ✅ **Phase 2 - Partie 1**: Base de données
  - 6 tables factories créées
  - Seed data complet
  - Modèles SQLAlchemy corrigés
- ⏳ **Phase 2 - Partie 2**: Endpoints factories (EN COURS)
  - Router créé avec squelette
  - Besoin d'implémenter la logique métier

### 🔄 En cours

**Tâches prioritaires**:
1. Implémenter endpoints factories CRUD
2. Implémenter gestion workers/engineers
3. Implémenter système de production
4. Tests complets via Swagger UI
5. Déploiement sur NAS (après finition backend)

### 📋 À faire

- Phase 0.6: Missions system
- Phase 0.7: Real-time updates (WebSockets)
- Phase 0.8: Intégration tablette in-game MSFS
- Migration Alembic pour gestion schema
- Import airports data depuis Directus

---

## URLs

**Développement local**:
- API docs : `http://localhost:8080/api/docs`
- API health : `http://localhost:8080/api/health`
- Directus : `http://localhost:8055`
- PostgreSQL : `localhost:5432` (exposé pour DBeaver)

**Production (NAS)**:
- API docs : `http://192.168.1.15:8080/api/docs`
- API health : `http://192.168.1.15:8080/api/health`
- Directus : `http://192.168.1.15:8055`

---

## Démarrage rapide

### Prérequis
- Docker Desktop
- DBeaver (recommandé pour gestion DB)
- Git

### Installation

1. **Cloner le repo**
```bash
git clone https://github.com/Tinouan/mfs24-carrier-plus.git
cd mfs24-carrier-plus
```

2. **Créer le fichier .env**
```bash
cp .env.example .env
# Éditer .env si besoin (ports, passwords)
```

3. **Démarrer les services**
```bash
docker compose up -d
```

4. **Créer le schéma game**
```bash
# Le schéma est créé automatiquement au startup de l'API
# Vérifier que l'API est démarrée
curl http://localhost:8080/api/health
```

5. **Exécuter les scripts SQL**
```bash
# Via l'API (plus simple en local)
docker exec msfs_db psql -U msfs -d msfs < sql/v0_0_init_base_schema_standalone.sql
docker exec msfs_db psql -U msfs -d msfs < sql/v0_5_factories_schema_minimal.sql
docker exec msfs_db psql -U msfs -d msfs < sql/seed_items_t0.sql
docker exec msfs_db psql -U msfs -d msfs < sql/seed_items_t1_t2.sql
docker exec msfs_db psql -U msfs -d msfs < sql/seed_recipes_t1_t2.sql
docker exec msfs_db psql -U msfs -d msfs < sql/v0_5_factories_phase2.sql
```

6. **Vérifier que tout fonctionne**
```bash
# Tester les items
curl http://localhost:8080/api/world/items?tier=0

# Tester les recettes
curl http://localhost:8080/api/world/recipes?tier=1
```

### Connexion à la base de données (DBeaver)

- Host: `localhost`
- Port: `5432`
- Database: `msfs`
- Username: `msfs` (voir .env)
- Password: (voir .env)

---

## Documentation technique

- [SESSION_SUMMARY.md](SESSION_SUMMARY.md) - Résumé de la dernière session
- [NEXT_SESSION.md](NEXT_SESSION.md) - Tâches prioritaires
- [ROADMAP.md](ROADMAP.md) - Feuille de route complète
- [CLEANUP.md](CLEANUP.md) - Fichiers temporaires à nettoyer

---

## Stack technique

- **Backend**: Python 3.11 + FastAPI + SQLAlchemy + Pydantic
- **Database**: PostgreSQL 16
- **CMS**: Directus
- **Proxy**: Nginx
- **Container**: Docker + Docker Compose
- **Auth**: JWT (via python-jose)

---

## License

Voir [LEGAL.md](LEGAL.md)
