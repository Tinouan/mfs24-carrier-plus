# Mfs Carrier+ (MSFS 2024)

Backend modulaire pour **Microsoft Flight Simulator 2024** : Auth, Company, Inventory, Fleet, Market, **Factory System (V0.5)**, **Workers System (V0.6)**, Missions.
Stack Docker avec **FastAPI + PostgreSQL + Directus + Nginx + APScheduler**.

> Repo : https://github.com/Tinouan/mfs24-carrier-plus

---

## Objectif

Mfs Carrier+ fournit un socle "game backend" utilisable par :
- une **tablette in-game** (UI intégrée MSFS)
- un **admin panel web**
- des services gameplay (marché, usines de production, workers, missions, logs)

Le backend est **source de vérité** : inventaires, flotte, économie, production, workers, règles, audit.

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
  │  + Scheduler  │  │               │
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
   - `airports` - **84,000+ aéroports** MSFS (OurAirports data)
     - Champs: ident (ICAO), type, name, lat/long, country, etc.
     - **Factory slots**: `max_factory_slots`, `occupied_slots`
     - Trigger PostgreSQL auto-calcule slots par type d'aéroport

2. **`game`** - Données gameplay (FastAPI) — **21 tables**

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
   - `items` - **94 items** T0-T2 (matières premières + produits)
   - `recipes` - **60 recettes** T1-T2 (production)
   - `recipe_ingredients` - Ingrédients requis par recette

   **Factory System V0.5** (4 tables):
   - `factories` - Usines de production (liées à company_id + airport_ident)
   - `factory_storage` - Stockage local d'usine (ingrédients + produits)
   - `production_batches` - Lots de production (status, workers, temps)
   - `factory_transactions` - Audit usine (consumed, input, output)

   **Workers System V0.6** (4 tables):
   - `workers` - Table **unifiée** workers + engineers (18 colonnes)
   - `country_worker_stats` - **42 pays** avec stats de base
   - `worker_xp_thresholds` - 5 tiers (Novice → Maître)
   - `airport_worker_pools` - **5,201 pools** de recrutement

   **Profiles** (2 tables):
   - `player_profiles` - Profil pilote
   - `company_profiles` - Profil company

---

## FastAPI Routes

### Système (2 endpoints)
- `GET /health` - Santé de l'API
- `POST /sql/execute` - Exécution SQL (DEV ONLY)

### Auth (3 endpoints)
- `POST /auth/register` - Inscription
- `POST /auth/login` - Connexion (retourne JWT)
- `GET /auth/me` - Info user actuel

### Companies (CRUD compagnie)
- `POST /company` - Créer compagnie
- `GET /company` - Liste compagnies
- `GET /company/{id}` - Détails
- `PATCH /company/{id}` - Modifier
- `GET /company/{id}/members` - Membres

### Inventory (CRUD inventaire)
- `GET /inventory` - Liste items
- `POST /inventory/transfer` - Transférer items

### Fleet (Flotte aérienne)
- `GET /fleet` - Liste avions
- `POST /fleet` - Acheter avion
- `PATCH /fleet/{id}` - Modifier avion

### Market (Marché)
- `GET /market/orders` - Liste ordres
- `POST /market/orders` - Créer ordre
- `DELETE /market/orders/{id}` - Annuler ordre

### World (Données publiques)
- `GET /world/items` - Liste items (filtres: tier, tag, is_raw)
- `GET /world/items/{id}` - Détails item
- `GET /world/items/search/{name}` - Recherche item
- `GET /world/recipes` - Liste recettes
- `GET /world/recipes/{id}` - Détails recette + ingrédients
- `GET /world/airports/{ident}/slots` - Slots disponibles
- `GET /world/stats/items` - Stats items
- `GET /world/stats/recipes` - Stats recettes

### Factories (Système d'usines)
- `GET /factories` - Liste mes usines
- `POST /factories` - Créer usine
- `GET /factories/{id}` - Détails usine
- `PATCH /factories/{id}` - Modifier usine
- `DELETE /factories/{id}` - Détruire usine
- `GET /factories/{id}/storage` - Inventaire usine
- `POST /factories/{id}/storage/deposit` - Déposer items
- `POST /factories/{id}/storage/withdraw` - Retirer items
- `POST /factories/{id}/production/start` - Lancer production
- `GET /factories/{id}/batches` - Liste batches
- `POST /factories/{id}/food` - Ajouter nourriture
- `GET /factories/{id}/food/status` - Status nourriture

### Workers V0.6 (15+ endpoints)
- `GET /workers/pools` - Liste pools recrutement
- `GET /workers/pool/{airport}` - Workers disponibles
- `POST /workers/hire/{company_id}` - Embaucher un worker
- `POST /workers/hire-bulk/{company_id}` - Embaucher plusieurs (max 10)
- `POST /workers/{id}/assign` - Assigner à factory
- `POST /workers/{id}/unassign` - Retirer de factory
- `DELETE /workers/{id}` - Licencier (retour au pool)
- `GET /workers/{id}` - Détails worker
- `GET /workers/company/{id}` - Workers d'une company
- `GET /workers/factory/{id}` - Workers d'une factory
- `GET /workers/countries` - Stats par pays (42 pays)
- `GET /workers/country/{code}` - Stats d'un pays
- `POST /workers/admin/generate-pool/{airport}` - [DEV] Générer pool

---

## APScheduler — 7 Jobs Automatiques

| Job | Intervalle | Description |
|-----|------------|-------------|
| `batch_completion` | 1 min | Complète batches de production terminés |
| `t0_auto_production` | 5 min | Production automatique usines NPC T0 |
| `food_and_injuries` | 1h | Consommation food + check blessures |
| `salary_payments` | 1h | Paiement salaires workers |
| `injury_processing` | 1h | Traitement blessures (mort >10 jours) |
| `pool_reset` | 6h | Régénération pools workers aéroports |
| `dead_workers_cleanup` | 24h | Nettoyage workers morts (>30 jours) |

---

## État actuel du développement

### V0.5 Factory System (Complété)

**Phase 1**: Items + Recipes
- 94 items (T0: 34, T1: 30, T2: 30)
- 60 recettes (T1: 30, T2: 30)
- Endpoints world data fonctionnels

**Phase 2**: Factories
- 4 tables factories créées
- Airport slots system (10/5/2/1 selon type)
- Factory CRUD avec validations
- Production avec vérification ingredients/workers
- Factory storage ↔ Company warehouse transfers
- 31 usines T0 NPC en France

### V0.6 Workers System (Complété)

**Tables SQL**:
- `workers` - Table unifiée (workers + engineers via `worker_type`)
- `country_worker_stats` - 42 pays avec stats de base
- `worker_xp_thresholds` - 5 tiers progression XP
- `airport_worker_pools` - 5,201 pools recrutement

**Fonctionnalités**:
- Génération workers par nationalité (stats basées sur `iso_country`)
- Variation ±20% (speed, resistance), ±10% (salaire)
- Capacités: 200/20 (large), 100/10 (medium)
- Système de blessures (>10 jours = mort, -10,000 crédits)
- Consommation food (1 unit/worker/heure)
- Paiement salaires horaires
- Bonus engineer (+10% output par engineer, max 50%)

**Documentation**: [workers.md](workers.md) | [factories.md](factories.md) | [items-recipes.md](items-recipes.md)

### En cours / À venir

- **V0.7**: Missions / Logistics (transport, supply chain)
- **V0.8**: Admin Panel MVP
- **V0.9**: Intégration MSFS 2024

---

## Gameplay Core Loop

### Mécanique principale: Transport aérien

**Concept de base:**
Le joueur est propriétaire d'une compagnie de transport aérien. Le gameplay central consiste à:
1. **Recruter des workers** dans les pools d'aéroports
2. **Produire des items** dans des usines (factories)
3. **Transporter ces items** en avion entre aéroports
4. **Vendre sur le marché** pour générer des profits

### Système d'inventaires

**3 types de stockage:**

1. **Factory Storage** (stockage usine)
   - Local à chaque usine
   - Contient les ingrédients pour production
   - Reçoit les items produits

2. **Company Warehouse** (entrepôt company par aéroport)
   - Un warehouse par aéroport pour chaque company
   - Reçoit items retirés des factories
   - Source pour charger les avions

3. **Aircraft Cargo** (cargo avion) - *À implémenter*
   - Items chargés dans un avion
   - Pendant le vol: statut "in_transit"

### Workers et Engineers (V0.6)

**Workers:**
- Recrutés dans les pools d'aéroports (par nationalité)
- Stats: speed, resistance, tier, xp, hourly_salary
- XP gagnée pendant production (+10 XP × recipe.tier)
- Max workers par factory selon tier (T1=10, T5=50)
- Consomment 1 food/heure

**Engineers:**
- Type spécial de worker (`worker_type = 'engineer'`)
- Salaire x2, XP x2
- Bonus production: +10% output par engineer (max 50%)
- Max engineers par factory selon tier (T1=2, T5=10)

**Système de blessures:**
- Risque base: 0.5%/heure (x2 sans food)
- Resistance réduit le risque
- Blessure >10 jours → mort
- Pénalité mort: -10,000 crédits

### Factory System

**Slots d'usines par aéroport:**
- large_airport: **10 slots**
- medium_airport: **5 slots**
- small_airport: **2 slots**
- seaplane_base/heliport: **1 slot**
- closed/autres: **0 slots**

**Production:**
- Temps = `base_time × (200 / sum(worker.speed))`
- Sans food: -50% vitesse
- Bonus engineer: +10% output par engineer

---

## URLs

**Développement local**:
- API docs : `http://localhost:8080/api/docs`
- API health : `http://localhost:8080/api/health`
- Directus : `http://localhost:8055`
- PostgreSQL : `localhost:5432`

**Production (NAS)**:
- API docs : `http://192.168.1.15:8080/api/docs`
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

4. **Vérifier que l'API est démarrée**
```bash
curl http://localhost:8080/api/health
```

### Connexion à la base de données (DBeaver)

- Host: `localhost`
- Port: `5432`
- Database: `msfs`
- Username: `msfs` (voir .env)
- Password: (voir .env)

---

## Documentation technique

- [company.md](company.md) - Système Company & Membres
- [profile.md](profile.md) - Auth & Player Profile
- [inventory.md](inventory.md) - Système Inventory & Marché
- [workers.md](workers.md) - Système Workers V0.6
- [factories.md](factories.md) - Système Factories V0.5
- [items-recipes.md](items-recipes.md) - Items et Recettes (94 items, 60 recipes)

---

## Stack technique

- **Backend**: Python 3.11 + FastAPI + SQLAlchemy + Pydantic
- **Database**: PostgreSQL 16
- **Scheduler**: APScheduler (BackgroundScheduler)
- **CMS**: Directus
- **Proxy**: Nginx
- **Container**: Docker + Docker Compose
- **Auth**: JWT (via python-jose)

---

## License

Voir [LEGAL.md](../LEGAL.md)
