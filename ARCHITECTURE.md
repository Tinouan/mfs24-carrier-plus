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
   - `airports` - Aéroports MSFS (OurAirports data, 28,000+ airports)
     - Champs: ident (ICAO), type, name, lat/long, country, etc.
     - **Factory slots**: `max_factory_slots`, `occupied_slots`
     - Trigger PostgreSQL auto-calcule slots par type d'aéroport
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
   - `factories` - Usines de production (liées à company_id + airport_ident)
   - `workers` - Employés avec XP/tier (0-5), assignés à une factory
   - `engineers` - Workers améliorés (1 per factory max, bonus +10-50%)
   - `factory_storage` - Stockage local d'usine (ingrédients + produits)
   - `production_batches` - Lots de production (status, workers, temps)
   - `factory_transactions` - Audit usine (consumed, input, output)

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
- ✅ Inventory + locations + audits (warehouse par aéroport pour chaque company)
- ✅ Fleet (aircraft) - **Pas encore implémenté les vols**
- ✅ Market orders
- ✅ Player profiles
- ✅ Company profiles

**Phase 0.5 - Factory System**:
- ✅ **Phase 1**: Items + Recipes
  - 93 items (T0: 33 raw materials, T1-T2: 60 processed)
  - 60 recettes (T1: 30, T2: 30)
  - Endpoints world data fonctionnels
- ✅ **Phase 2A**: Base de données
  - 6 tables factories créées
  - Seed data complet
  - Modèles SQLAlchemy corrigés
- ✅ **Phase 2B**: Endpoints factories + Validations
  - 18 endpoints implémentés avec logique métier complète
  - ✅ Airport slots system (12/6/3/1 selon type)
  - ✅ Factory CRUD avec validations
  - ✅ Worker/Engineer hiring et gestion
  - ✅ Production avec vérification ingredients/workers/engineer bonus
  - ✅ Factory storage ↔ Company warehouse transfers
  - ✅ Engineer model corrigé (factory-based, 1 per factory)

### 🔄 En cours

**Tâches prioritaires**:
1. Tests complets des endpoints factories via Swagger UI
2. Import airports data (OurAirports) dans Directus/PostgreSQL
3. Phase 0.6: Aircraft & Flight system (vols, cargo, passagers)

### 📋 À faire

**Court terme**:
- ✅ Factory system Phase 2B (TERMINÉ)
- 🔄 Tests factories endpoints
- 🔄 Import airports data
- Phase 0.6: **Aircraft & Flight System**
  - Aircraft management (déjà partiellement existant)
  - Flight planning & execution
  - Aircraft cargo system (charger items au parking, moteur éteint)
  - Aircraft passengers (workers/engineers transport entre aéroports)
  - Flight status tracking (en vol, parking, etc.)

**Moyen terme**:
- Phase 0.7: Missions system
- Phase 0.8: Real-time updates (WebSockets)
- Phase 0.9: Intégration tablette in-game MSFS
- Migration Alembic pour gestion schema

**Long terme**:
- NPC T0 factories system (usines de base non-joueur)
- Advanced factory mechanics (maintenance, upgrades, etc.)
- Economic simulation & balancing

---

## Gameplay Core Loop

### 🎮 Mécanique principale: Transport aérien

**Concept de base:**
Le joueur est propriétaire d'une compagnie de transport aérien. Le gameplay central consiste à:
1. **Produire des items** dans des usines (factories)
2. **Transporter ces items** en avion entre aéroports
3. **Vendre sur le marché** pour générer des profits

### 📦 Système d'inventaires

**3 types de stockage:**

1. **Factory Storage** (stockage usine)
   - Local à chaque usine
   - Contient les ingrédients pour production
   - Reçoit les items produits

2. **Company Warehouse** (entrepôt company par aéroport)
   - Un warehouse par aéroport pour chaque company
   - Reçoit items retirés des factories
   - Source pour charger les avions
   - Destination après déchargement avions

3. **Aircraft Cargo** (cargo avion) - *À implémenter*
   - Items chargés dans un avion
   - Pendant le vol: statut "in_transit"
   - Déchargés à l'atterrissage

**Flow typique:**
```
Factory Production → Factory Storage
                           ↓
                   [Player withdraw]
                           ↓
                   Company Warehouse
                           ↓
                   [Player load aircraft]
                           ↓
                   Aircraft Cargo (in flight)
                           ↓
                   [Aircraft lands]
                           ↓
                   Company Warehouse (destination)
```

### 👷 Workers et Engineers

**Workers:**
- Employés assignés à une factory
- Système de tiers (T0-T5) basé sur XP
- XP gagnée pendant la production
- Max 10 workers par factory
- **Peuvent voyager en avion** (avions passagers)

**Engineers:**
- Version améliorée des workers
- **1 seul engineer par factory**
- Fournit bonus de production (+10-50%)
- **Peuvent voyager en avion** (avions passagers)
- Assignés à une factory spécifique

### ✈️ Système de transport (À implémenter)

**Chargement avion:**
- Avion doit être au **parking**
- Moteurs **éteints**
- Bouton "Charger" pour transférer items/passagers
- Items: Warehouse → Aircraft cargo
- Passagers: Workers/Engineers peuvent embarquer

**Vol:**
- Items/passagers en statut "in_transit"
- Position trackée en temps réel (future phase)

**Déchargement:**
- À l'atterrissage/parking destination
- Aircraft cargo → Warehouse destination
- Passagers débarquent et peuvent être réassignés

### 🏭 Factory System (Complété)

**Slots d'usines par aéroport:**
- Large airports (scheduled service): **12 slots**
- Medium airports: **6 slots**
- Small airports: **3 slots**
- Heliports/Seaplanes: **1 slot**
- Autres types: **0 slots** (pas d'usines)
- **Note**: Les usines T0 NPC (futures) ne comptent pas dans ces limites

**Production:**
- Nécessite ingrédients en factory storage
- Nécessite workers assignés
- Bonus si engineer présent
- Consomme ingrédients au démarrage
- Produit items après délai (production_time_hours)

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
