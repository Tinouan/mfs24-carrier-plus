# MFS Carrier+

Jeu de gestion de compagnie aérienne cargo pour Microsoft Flight Simulator 2024.

---

## V0.1 — Core (DONE)

- [x] Docker stack : Postgres + Directus + Nginx + FastAPI
- [x] Auth JWT (`/api/auth/*`, `/api/me`)
- [x] Company + members
- [x] Inventory (vault + warehouses + marché)
- [x] Fleet (company_aircraft)
- [x] API docs via `/api/docs`
- [x] **84 000+ airports** importés avec système de slots

---

## Inventory System (DONE)

### Vue d'ensemble
Système d'inventaire localisé par aéroport avec mise en vente sur place.

### Tables

| Table | Description |
|-------|-------------|
| `game.inventory_locations` | Locations (vault, warehouse, aircraft, in_transit) |
| `game.inventory_items` | Items par location avec système de vente |
| `game.inventory_audits` | Historique des mouvements |

### Structure `inventory_items`
```sql
id UUID PRIMARY KEY
location_id UUID REFERENCES inventory_locations(id)
item_id UUID REFERENCES items(id)
qty INT                    -- Quantité en stock
for_sale BOOLEAN           -- En vente ?
sale_price NUMERIC(12,2)   -- Prix unitaire
sale_qty BIGINT            -- Quantité à vendre
```

### API Endpoints

| Méthode | Endpoint | Auth | Description |
|---------|----------|------|-------------|
| GET | `/api/inventory/locations` | Oui | Liste des locations (vault + warehouses) |
| POST | `/api/inventory/locations/warehouse` | Oui | Créer un warehouse à un aéroport |
| GET | `/api/inventory/location/{id}` | Oui | Contenu d'une location |
| POST | `/api/inventory/deposit` | Oui | Ajouter du stock |
| POST | `/api/inventory/withdraw` | Oui | Retirer du stock |
| POST | `/api/inventory/move` | Oui | Déplacer entre locations |
| POST | `/api/inventory/set-for-sale` | Oui | Mettre en vente / retirer |
| GET | `/api/inventory/market/{icao}` | Non | Items en vente à un aéroport (public) |
| POST | `/api/inventory/market/buy` | Oui | Acheter sur le marché |

### Fonctionnalités vente

- **Vente partielle** : Choisir la quantité à vendre (sale_qty ≤ qty)
- **Restriction** : Vente uniquement depuis les warehouses
- **Transaction complète** : Débit acheteur + crédit vendeur
- **Création auto** : Warehouse acheteur créé automatiquement
- **Protection** : Impossible d'acheter à soi-même
- **Audit trail** : Toutes les actions tracées (market_buy, market_sell, etc.)

### Exemple de flux

```bash
# 1. Créer un warehouse
POST /api/inventory/locations/warehouse
{"airport_ident": "LFPG"}

# 2. Déposer des items
POST /api/inventory/deposit
{"location_id": "...", "item_code": "Raw Fish", "qty": 100}

# 3. Mettre en vente
POST /api/inventory/set-for-sale
{"location_id": "...", "item_code": "Raw Fish", "for_sale": true, "sale_price": 15.50, "sale_qty": 50}

# 4. Voir le marché (endpoint public)
GET /api/inventory/market/LFPG

# 5. Acheter (autre company)
POST /api/inventory/market/buy
{"seller_location_id": "...", "item_code": "Raw Fish", "qty": 10}
```

---

## V0.2 — Player Profile (EN COURS)

### Objectif
Créer un profil joueur persistant (préférences + progression minimale).

### Frontend ✅
- [x] Vue Profil avec header (avatar, username, email, date inscription)
- [x] Système XP/Niveau pilote avec barre de progression
- [x] Onglets: Aperçu, Licences, Messagerie, Transactions
- [x] Cartes de licences avion (PPL, CPL, ATPL)
- [x] Statistiques: vols, heures de vol, cargo livré, gains

### DB
- [ ] Table `game.player_profiles`

### API
- [ ] `GET /api/profile/me`
- [ ] `PATCH /api/profile/me`

---

## V0.3 — Company Dashboard (EN COURS)

### Objectif
Donner une identité et des paramètres à la company.

### Frontend ✅
- [x] Dashboard Company avec header (nom, home airport, date création, solde)
- [x] Onglets: Aperçu, Usines, Flotte, Employés
- [x] Statistiques: usines, avions, membres, ouvriers
- [x] Liste des usines de la company
- [x] Liste des membres avec username/email
- [x] Actions: créer usine, ajouter avion, inviter membre

### API ✅
- [x] `GET /api/company/members` - Retourne username + email des membres
- [x] `POST /api/company/members/add` - Ajouter un membre

---

## V0.4 — Market / HV

### Objectif
Mettre en place un hôtel des ventes central.

- [x] Tables : market_orders, market_wallet
- [ ] market_trades, wallet_transactions
- [ ] Money model : wallet + taxes + fees
- [ ] Pagination + filtres
- [ ] Anti-abus : price bands, cooldowns, rate limiting
- [ ] Admin actions : freeze/cancel (limité)

---

## V0.5 — Factory System (PRODUCTION INDUSTRIELLE) 🏭

### 📊 Vue d'ensemble
Système complet de production industrielle permettant aux joueurs de transformer matières premières (T0) en produits finis (T1-T5) via des usines avec workers, engineers et mécanique de production complexe.

---

### ✅ PHASE 1: Items & Recipes (COMPLETED)

**Statut**: ✅ 100% Terminé

#### Base de données
- ✅ **3 tables créées** ([game.items](sql/v0_5_factories_schema_minimal.sql), game.recipes, game.recipe_ingredients)
- ✅ **93 items** au total:
  - 33 matières premières T0 (raw materials) - [seed_items_t0.sql](sql/seed_items_t0.sql)
  - 30 produits simples T1
  - 30 produits intermédiaires T2 - [seed_items_t1_t2.sql](sql/seed_items_t1_t2.sql)
- ✅ **60 recettes** de production (30 T1 + 30 T2) - [seed_recipes_t1_t2.sql](sql/seed_recipes_t1_t2.sql)
- ✅ ~120 ingrédients de recettes

#### Modèles SQLAlchemy
- ✅ [Item](game-api/app/models/item.py) model avec 11 colonnes (tier, tags, base_value, weight_kg, etc.)
- ✅ Recipe model avec ingredients relationship
- ✅ RecipeIngredient model avec position ordering

#### API Endpoints (testés via Swagger UI)
- ✅ `GET /api/world/items` - Liste tous les items
- ✅ `GET /api/world/items/tier/{tier}` - Items par tier
- ✅ `GET /api/world/items/raw` - Matières premières uniquement
- ✅ `GET /api/world/recipes` - Toutes les recettes
- ✅ `GET /api/world/recipes/tier/{tier}` - Recettes par tier
- ✅ 11 endpoints [world router](game-api/app/routers/world.py) fonctionnels

#### Problèmes résolus
- ✅ Conflit Item vs FactoryItem models
- ✅ Mauvais noms de colonnes (production_time_hours, result_quantity)
- ✅ Container crash loop (Base.metadata.create_all désactivé dans [main.py](game-api/app/main.py))
- ✅ Import conflicts dans routers

---

### ✅ PHASE 2: Factories Base System (DONE)

**Statut**: ✅ 100% Terminé

#### Base de données (6 tables) ✅ CRÉÉES

**2.1 Table `game.factories`**
```sql
CREATE TABLE game.factories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES game.companies(id),
    airport_ident VARCHAR(4) NOT NULL REFERENCES public.airports(ident),
    name VARCHAR(100),
    factory_type VARCHAR(50), -- Auto-détecté via trigger
    status VARCHAR(20) DEFAULT 'idle', -- 'idle', 'producing', 'maintenance'
    current_recipe_id UUID REFERENCES game.recipes(id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```
- **Détection automatique du type**: Trigger analyse les tags de la recette
- **Types**: food_processing, metal_smelting, chemical_refining, construction, electronics, medical, fuel_production, general

**2.2 Table `game.workers`**
```sql
CREATE TABLE game.workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factory_id UUID REFERENCES game.factories(id),
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    tier INT CHECK (tier BETWEEN 0 AND 5), -- Auto-calculé via XP
    health INT DEFAULT 100 CHECK (health BETWEEN 0 AND 100),
    happiness INT DEFAULT 80 CHECK (happiness BETWEEN 0 AND 100),
    xp INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```
- **Système XP**: 0-99→T0, 100-249→T1, 250-499→T2, 500-999→T3, 1000-1999→T4, 2000+→T5
- **Health**: Dégradation -5/heure production, récupération +10/heure repos

**2.3 Table `game.engineers`**
```sql
CREATE TABLE game.engineers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES game.companies(id),
    airport_ident VARCHAR(4) REFERENCES public.airports(ident),
    name VARCHAR(100),
    specialization VARCHAR(50), -- Type de factory (food_processing, metal_smelting, etc.)
    bonus_percentage INT DEFAULT 10 CHECK (bonus_percentage BETWEEN 0 AND 50),
    experience INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```
- **Bonus**: +10-50% output si spécialisation match avec factory_type

**2.4 Table `game.factory_storage`**
```sql
CREATE TABLE game.factory_storage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factory_id UUID REFERENCES game.factories(id),
    item_id UUID REFERENCES game.items(id),
    quantity INT DEFAULT 0 CHECK (quantity >= 0),
    max_capacity INT DEFAULT 1000,
    UNIQUE(factory_id, item_id)
);
```

**2.5 Table `game.production_batches`**
```sql
CREATE TABLE game.production_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factory_id UUID REFERENCES game.factories(id),
    recipe_id UUID REFERENCES game.recipes(id),
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'failed', 'cancelled'
    started_at TIMESTAMPTZ,
    estimated_completion TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    result_quantity INT,
    workers_assigned INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**2.6 Table `game.factory_transactions`**
```sql
CREATE TABLE game.factory_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factory_id UUID REFERENCES game.factories(id),
    transaction_type VARCHAR(20), -- 'input', 'output', 'waste'
    item_id UUID REFERENCES game.items(id),
    quantity INT NOT NULL,
    batch_id UUID REFERENCES game.production_batches(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Modèles SQLAlchemy ✅ TOUS VÉRIFIÉS
- ✅ [Factory](game-api/app/models/factory.py) - Corrigé FK game.companies
- ✅ [Worker](game-api/app/models/worker.py) - 100% conforme
- ✅ [Engineer](game-api/app/models/engineer.py) - Corrigé FK game.companies
- ✅ [FactoryStorage](game-api/app/models/factory_storage.py) - 100% conforme
- ✅ [ProductionBatch](game-api/app/models/production_batch.py) - 100% conforme
- ✅ [FactoryTransaction](game-api/app/models/factory_transaction.py) - 100% conforme

#### Triggers & Functions
- [ ] `update_factory_type()` - Détection auto du type via tags recette
- [ ] `update_worker_tier()` - Calcul tier basé sur XP
- [ ] `calculate_max_slots()` - Slots factory selon taille airport (large=10, medium=5, small=2)

#### API Endpoints Phase 2A ✅
- ✅ `POST /api/factories` - Créer une factory
- ✅ `GET /api/factories` - Liste mes factories
- ✅ `GET /api/factories/{id}` - Détails factory
- ✅ `PATCH /api/factories/{id}` - Modifier factory
- ✅ `DELETE /api/factories/{id}` - Supprimer factory
- ✅ `GET /api/factories/{id}/storage` - Inventaire factory
- ✅ `POST /api/factories/{id}/workers` - Embaucher workers
- ✅ `GET /api/factories/{id}/workers` - Liste workers

#### API Endpoints Phase 2B ✅
- ✅ `GET /api/world/factories` - Liste factories pour la carte (T0 + joueurs)
- ✅ `GET /api/world/airports/{ident}/slots` - Slots disponibles par aéroport
- ✅ Mapping T0 factories → produit/type pour icônes carte

#### Validations métier ✅
- ✅ Limites factories par airport (max_factory_slots selon type)
- ✅ Ownership check (company_id = user's company)
- ✅ Slot index unique par aéroport
- [ ] Worker tier <= Recipe tier
- [ ] Storage capacity limits

---

### 🏭 PHASE 3: Production Logic (EN COURS)

**Statut**: 🟡 Partiellement implémenté

#### ✅ Background Jobs (APScheduler)

**Fichiers créés:**
- [scheduler.py](game-api/app/core/scheduler.py) - Configuration APScheduler
- [production_service.py](game-api/app/services/production_service.py) - Logique de production

**Jobs planifiés:**
| Job | Intervalle | Description |
|-----|------------|-------------|
| `batch_completion` | 1 min | Complète les batches T1+ dont `estimated_completion` est passé |
| `t0_auto_production` | 5 min | Produit automatiquement les items des usines T0 (NPC) |

**Fonctionnalités implémentées:**
- ✅ Auto-complétion des batches T1+ (status → completed)
- ✅ Ajout items produits au `factory_storage`
- ✅ Gain XP workers (tier * 10 XP par batch)
- ✅ Auto-promotion tier workers basée sur XP
- ✅ Bonus engineer (+20% si applicable)
- ✅ Logging complet des opérations
- ✅ Production T0 → warehouse NPC → marché (for_sale=true)

#### Mécanique de production

**3.1 Démarrage batch**
```
POST /api/factories/{factory_id}/batches
{
    "recipe_id": "uuid",
    "workers_assigned": 12
}
```

**Validations**:
1. Factory appartient au joueur
2. Recipe tier compatible avec workers tier
3. Ingrédients disponibles en storage
4. Workers disponibles (non assignés)
5. Workers.tier >= Recipe.tier

**Calculs**:
- Base duration: `recipe.production_time_hours`
- Bonus engineer: +10-50% output si spécialisation match
- `estimated_completion = NOW() + production_time_hours`

**3.2 Consommation ingrédients**
- Déduction immédiate du storage au démarrage
- Enregistrement `factory_transactions` (type='input')

**3.3 Progression du batch**
- Background task (cron toutes les 5 min)
- Vérifier `NOW() >= estimated_completion`
- Calcul health degradation workers (-5/heure)

**3.4 Système santé workers**
- Chaque heure production: -5 health
- Health < 20: worker "fatigué" (malus production)
- Health = 0: worker meurt → batch échoue
- Récupération: +10/heure repos, +20 si nourriture consommée

**3.5 Gain XP**
- XP gagné = `recipe.tier * 10 * production_time_hours`
- Exemple: T2 recette, 4h → 2 * 10 * 4 = 80 XP/worker
- Auto-promotion tier quand seuils atteints

**3.6 Production résultat**
- Calcul `result_quantity` (base recette)
- Application bonus engineer si applicable
- Ajout au factory_storage
- Transaction (type='output')
- Batch status = 'completed', workers libérés

#### API Endpoints Phase 3
- [ ] `POST /api/factories/{id}/batches` - Lancer production
- [ ] `GET /api/factories/{id}/batches` - Liste batches
- [ ] `GET /api/batches/{id}` - Détails batch + progression
- [ ] `POST /api/batches/{id}/cancel` - Annuler batch
- [ ] `GET /api/factories/{id}/transactions` - Historique
- [ ] `POST /api/workers/{id}/feed` - Nourrir worker (+20 health)
- [ ] `POST /api/workers/{id}/rest` - Mettre au repos

#### Background Tasks
- [x] APScheduler intégré (BackgroundScheduler)
- [x] Cron toutes les 1 min: check batches en cours
- [x] Cron toutes les 5 min: production T0 automatique
- [x] Auto-completion batches T1+
- [ ] Health degradation workers
- [ ] Notifications (batch terminé, worker critique, etc.)

---

### 🤖 PHASE 4: NPC Factories + Market (EN COURS)

**Statut**: 🟡 Partiellement implémenté

#### ✅ Implémenté
- ✅ 31 usines T0 (NPC) en France avec mapping produits
- ✅ Production automatique toutes les 5 min (50 items/cycle)
- ✅ Items stockés dans warehouse NPC @ aéroport
- ✅ Items mis en vente automatiquement (`for_sale=true`)
- ✅ Stock limit T0: 1000 items max par produit

#### Concept (restant)
- Prix dynamiques basés offre/demande
- Intégration avec `game.market_wallet` existante

#### Tables

**4.1 `game.npc_factories`**
```sql
CREATE TABLE game.npc_factories (
    id UUID PRIMARY KEY,
    airport_ident VARCHAR(4) REFERENCES public.airports(ident),
    factory_type VARCHAR(50),
    recipe_id UUID REFERENCES game.recipes(id),
    production_rate_per_hour DECIMAL(8,2),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**4.2 `game.market_inventory`**
```sql
CREATE TABLE game.market_inventory (
    id UUID PRIMARY KEY,
    item_id UUID REFERENCES game.items(id) UNIQUE,
    quantity INT DEFAULT 0,
    base_price DECIMAL(10,2), -- items.base_value
    current_price DECIMAL(10,2), -- Prix dynamique
    price_modifier DECIMAL(5,2) DEFAULT 1.0,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);
```

#### Logique prix dynamique
```python
if quantity < 100:
    price_modifier = 1.5  # +50% si stock critique
elif quantity < 500:
    price_modifier = 1.2  # +20% si stock bas
else:
    price_modifier = 1.0  # Prix normal

current_price = base_price * price_modifier
```

#### Production automatique
- Background task horaire
- Pour chaque NPC factory active:
  - Générer `production_rate_per_hour` unités
  - Ajouter au `market_inventory`
  - Recalculer `current_price` selon nouveau stock

#### API Endpoints Phase 4
- [ ] `GET /api/market/items` - Catalogue marché avec prix
- [ ] `GET /api/market/items/{id}` - Prix + stock item
- [ ] `POST /api/market/buy` - Acheter items (débit wallet)
- [ ] `POST /api/market/sell` - Vendre items (crédit wallet)
- [ ] `GET /api/market/history` - Historique prix/transactions

#### Intégration wallet
- Utiliser `game.market_wallet` existante
- Débit lors achat: `wallet.balance -= total_price`
- Crédit lors vente: `wallet.balance += total_price`

---

### 🔬 PHASE 5: Items T3-T5 (EXPANSION)

**Statut**: 🔴 Non démarré

#### Objectif
Étendre catalogue de 93 items → ~300 items avec recettes complexes

#### Items à créer

**Tier 3 (60 items)** - Produits avancés
- Électronique: PCB Assembly, Microchips, Batteries
- Construction: Reinforced Panels, Composite Materials
- Chimie: Polymers, Advanced Fuel, Pharmaceuticals
- Aéronautique: Landing Gear, Turbine Blades, Avionics

**Tier 4 (50 items)** - Composants spécialisés
- Aircraft Components: Engines, Wings, Fuselage Sections
- High-tech: Advanced Sensors, Navigation Systems
- Materials science: Carbon Fiber, Titanium Alloys

**Tier 5 (30 items)** - Produits ultra-avancés
- Complete Aircraft Parts: Full Engines, Cockpit Modules
- Experimental: Advanced Propulsion, AI Systems

#### Recettes complexes
- T3: 3-4 ingrédients, 6-12h, 15-20 workers
- T4: 4 ingrédients, 12-24h, 25-30 workers
- T5: 4 ingrédients, 24-48h, 35-40 workers

#### Scripts SQL à créer
- [ ] `seed_items_t3.sql` - 60 items T3
- [ ] `seed_items_t4.sql` - 50 items T4
- [ ] `seed_items_t5.sql` - 30 items T5
- [ ] `seed_recipes_t3.sql` - 60 recettes T3
- [ ] `seed_recipes_t4.sql` - 50 recettes T4
- [ ] `seed_recipes_t5.sql` - 30 recettes T5

---

### 📍 PHASE 6: Intégration Airports

**Statut**: 🟡 Partiellement préparé

#### Schéma
```sql
ALTER TABLE public.airports
    ADD COLUMN max_factory_slots INT DEFAULT 0,
    ADD COLUMN occupied_slots INT DEFAULT 0;
```

#### Trigger calcul slots
```sql
CREATE FUNCTION calculate_max_slots() RETURNS TRIGGER AS $$
BEGIN
    NEW.max_factory_slots = CASE
        WHEN NEW.type = 'large_airport' THEN 10
        WHEN NEW.type = 'medium_airport' THEN 5
        WHEN NEW.type = 'small_airport' THEN 2
        WHEN NEW.type IN ('seaplane_base', 'heliport') THEN 1
        ELSE 0
    END;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

#### API Endpoints
- [ ] `GET /api/airports/{ident}/factories` - Factories sur airport
- [ ] `GET /api/airports/{ident}/slots` - Slots utilisés/disponibles
- [ ] `GET /api/airports/available` - Airports avec slots libres

#### Validations
- [ ] Empêcher création si `occupied_slots >= max_factory_slots`
- [ ] Incrémenter `occupied_slots` à création
- [ ] Décrémenter à suppression

---

### 🧪 PHASE 7: Tests & Validation

**Statut**: 🔴 Non démarré

#### Tests unitaires
- [ ] Models (Item, Recipe, Factory, Worker, Engineer)
- [ ] CRUD operations
- [ ] Relationships & constraints

#### Tests d'intégration
- [ ] Flow complet: créer factory → embaucher workers → lancer batch → production réussie
- [ ] Production T0→T1→T2 (chaîne complète)
- [ ] Système santé workers (dégradation + récupération)
- [ ] XP progression + tier auto-promotion
- [ ] Bonus engineer application

#### Tests performance
- [ ] 100 factories simultanées
- [ ] 1000 workers actifs
- [ ] Background tasks avec 500 batches
- [ ] Requêtes market avec 10k items

#### Scripts de test SQL
- [ ] `test_production_flow.sql` - Flow complet
- [ ] `test_worker_health.sql` - Dégradation santé
- [ ] `test_npc_factories.sql` - Production NPC
- [ ] `test_market_prices.sql` - Prix dynamiques

---

### 🚀 PHASE 8+: Features Avancées

**Statut**: 🔴 Non démarré

#### Tech Tree
- Recherche pour débloquer recettes T3-T5
- Coût en $ + items spécifiques
- Prérequis entre technologies

#### Upgrades Factory
- Amélioration vitesse (-10% time)
- Augmentation storage capacity
- Réduction consommation ressources

#### Automatisation
- Auto-restart batches (production infinie)
- Auto-feed workers (health < 30)
- Auto-sell production au market

#### Événements aléatoires
- Panne machine (batch retardé)
- Grève workers (production stoppée)
- Découverte bonus (double output)

#### Compétition PvP
- Classement production totale
- Marché P2P (vente directe joueurs)
- Sabotage factories (PvP optionnel)

---

### 📊 Métriques de Succès

#### Phase 1 ✅
- ✅ 93 items catalogués
- ✅ 60 recettes fonctionnelles
- ✅ API endpoints testés (Swagger UI)
- ✅ 0 erreurs logs FastAPI

#### Phase 2 (Objectif)
- [ ] 7 nouvelles tables créées
- [ ] CRUD complet factories
- [ ] 100% coverage tests unitaires
- [ ] < 200ms temps réponse API

#### Phase 3 (Objectif)
- [ ] Production batch end-to-end fonctionnelle
- [ ] Système santé workers opérationnel
- [ ] XP + tier progression testés
- [ ] Background tasks stables (0 crash)

#### Phase 4 (Objectif)
- [ ] 50+ NPC factories actives
- [ ] Prix dynamiques fonctionnels
- [ ] 10k+ transactions marché/jour
- [ ] Wallet intégration complète

---

### 🗓️ Priorisation

**Priorité 1 (IMMEDIATE)**
1. ✅ Phase 1 - Items & Recipes (DONE)
2. 🔄 Phase 2 - Tables factories + workers + engineers
3. 🔄 Phase 3 - Logique production de base

**Priorité 2 (COURT TERME)**
4. Phase 6 - Intégration airports (slots)
5. Phase 4 - NPC factories + market
6. Phase 7 - Tests complets

**Priorité 3 (MOYEN TERME)**
7. Phase 5 - Items T3-T5 (expansion)
8. Phase 8 - Features avancées (tech tree, upgrades)

**Priorité 4 (LONG TERME)**
9. Frontend UI (dépend stack choisie)
10. PvP + événements aléatoires
11. Documentation complète

---

### 📝 Notes d'Implémentation

#### Patterns utilisés
- **UUID primary keys** partout (pas d'auto-increment)
- **Soft delete** via `is_active` flags
- **Audit trails** via `created_at`, `updated_at`
- **JSONB** pour données flexibles (unlock_requirements)

#### Conventions nommage
- Tables: snake_case pluriel (`factories`, `workers`)
- Colonnes: snake_case (`production_time_hours`)
- Enums: lowercase string (`'pending'`, `'in_progress'`)
- Foreign keys: `{table}_id` (`factory_id`, `recipe_id`)

#### Performance
- Index sur colonnes filtrées (tier, is_raw, status)
- GIN index sur arrays (tags)
- Éviter N+1 queries (joins/eager loading)
- Pagination (limit/offset)

#### Sécurité
- Toujours vérifier `company_id = current_user.company_id`
- Validation Pydantic sur inputs
- Secrets hors git (.env)
- Rate limiting endpoints market

---

### Etat Actuel Projet

**Fonctionnel (2026-01-23)**
- PostgreSQL avec **22 tables game** (V0.5 Factories + V0.6 Workers + V0.7.1 Fleet)
- **84 000+ airports** importes avec systeme de slots
- **31 usines T0** (NPC) en France avec mapping produits
- **34 items T0** (raw materials) - incluant Raw Water ajoute
- 93 items total (T0: 34, T1: 30, T2: 30)
- 60 recettes (T1: 30, T2: 30) inserees
- **14 types d'avions** dans le catalogue (turboprops, jets, helicopteres)
- API FastAPI demarree (Docker local)
- Auth JWT fonctionnelle
- Docker containers stables
- **APScheduler** avec 7 jobs automatiques

**✅ V0.6 Workers System (2026-01-22)**
- Table `workers` unifiée (workers + engineers)
- **42 pays** avec stats de base configurés
- **5201 pools** de recrutement aux aéroports
- Système de blessures et mort (>10 jours)
- Consommation food (1/worker/heure)
- Paiement salaires horaires
- Génération workers par nationalité

**✅ Frontend Webmap**
- Carte Leaflet avec clustering aéroports/usines
- Icônes de production pour usines T0 (food, fuel, mineral, etc.)
- Dashboard Company avec onglets (Aperçu, Usines, Flotte, Employés)
- Vue Profil pilote avec XP, licences, messagerie
- Modal création usine sur slots disponibles
- Affichage membres company avec username/email

**✅ API Endpoints Complets**
- `/api/world/*` - Items, recettes, factories carte
- `/api/factories/*` - CRUD factories + storage + production
- `/api/workers/*` - 15+ endpoints gestion workers
- `/api/company/*` - Membres, profil company
- `/api/inventory/*` - Inventaire + marché

**A venir**
- Prix dynamiques marche (Phase 4)
- Items T3-T5 (~300 items total)
- Missions / Logistics (V0.8)
- Integration MSFS 2024

---

## V0.6 — Workers System (DONE) 👷

### Vue d'ensemble
Système unifié workers/engineers avec nationalité, stats, pool de recrutement et système de blessures.

**Documentation complète:** [docs/workers.md](docs/workers.md) | [docs/factories.md](docs/factories.md)

### Fonctionnalités implémentées

#### Tables SQL
- ✅ `game.workers` - Table unifiée (workers + engineers)
- ✅ `game.country_worker_stats` - 42 pays avec stats de base
- ✅ `game.worker_xp_thresholds` - 5 tiers (Novice → Maître)
- ✅ `game.airport_worker_pools` - 5201 pools de recrutement
- ✅ Colonnes food ajoutées à `factories`

#### Modèles SQLAlchemy
- ✅ [Worker](game-api/app/models/worker.py) - Modèle unifié avec 18 colonnes
- ✅ [CountryWorkerStats](game-api/app/models/worker.py) - Stats par nationalité
- ✅ [AirportWorkerPool](game-api/app/models/worker.py) - Pools recrutement
- ✅ [Factory](game-api/app/models/factory.py) - Ajout max_workers, food_*

#### API Endpoints
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/workers/pools` | Liste pools recrutement |
| GET | `/workers/pool/{airport}` | Workers disponibles |
| POST | `/workers/hire/{company_id}` | Embaucher un worker |
| POST | `/workers/hire-bulk/{company_id}` | Embaucher plusieurs |
| POST | `/workers/{id}/assign` | Assigner à factory |
| POST | `/workers/{id}/unassign` | Retirer de factory |
| DELETE | `/workers/{id}` | Licencier |
| GET | `/workers/company/{id}` | Workers d'une company |
| GET | `/workers/factory/{id}` | Workers d'une factory |
| GET | `/workers/countries` | Stats par pays |

#### Système de Production
- ✅ Temps = `base_time * (200 / sum(speed))`
- ✅ Food: 1 unit/worker/heure
- ✅ Sans food: -50% vitesse, x2 risque blessure
- ✅ Bonus engineer: +10% output par engineer (max 50%)
- ✅ XP: `recipe.tier * 10` par batch

#### Système de Blessures
- ✅ Risque base: 0.5%/heure (x2 sans food)
- ✅ Resistance réduit le risque
- ✅ Blessure >10 jours → mort
- ✅ Pénalité mort: -10,000 crédits

#### Scheduler Jobs (7 jobs)
| Job | Intervalle | Description |
|-----|------------|-------------|
| `batch_completion` | 1 min | Complète batches terminés |
| `t0_auto_production` | 5 min | Production NPC T0 |
| `food_and_injuries` | 1h | Consommation food + blessures |
| `salary_payments` | 1h | Paiement salaires |
| `injury_processing` | 1h | Traitement blessures/morts |
| `pool_reset` | 6h | Régénération pools aéroports |
| `dead_workers_cleanup` | 24h | Nettoyage workers morts |

#### Génération Workers par Nationalité
- ✅ Stats basées sur `iso_country` de l'aéroport
- ✅ Variation ±20% (speed, resistance)
- ✅ Variation ±10% (salaire)
- ✅ 200 workers / 20 engineers par large_airport
- ✅ 100 workers / 10 engineers par medium_airport

---

## V0.7 — Inventory Simplifie + Fleet System (DONE)

### V0.7.0 - Inventaire Unifie
- [x] Systeme d'inventaire simplifie avec InventoryLocation + InventoryItem
- [x] Support ownership flexible (company ou player)
- [x] Integration cargo avions
- [x] Anti-cheat: items localises par aeroport

### V0.7.1 - Fleet System (2026-01-23)

**Documentation complete:** [docs/aircrafts.md](docs/aircrafts.md)

#### Fonctionnalites implementees

**Base de donnees**
- [x] Table `game.aircraft_catalog` - 14 types d'avions (turboprops, jets, helicopteres)
- [x] Colonnes ajoutees a `company_aircraft`: registration, name, icao_type, purchase_price, is_active

**API Endpoints**
| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/fleet/catalog` | Catalogue d'avions (filtrable) |
| GET | `/api/fleet/stats` | Statistiques flotte |
| POST | `/api/fleet` | Acheter/ajouter avion |
| GET | `/api/fleet/{id}/details` | Details avec cargo |
| PATCH | `/api/fleet/{id}` | Modifier avion |
| DELETE | `/api/fleet/{id}` | Retirer avion |

**Frontend**
- [x] Modal "Ajouter Avion" avec onglets Catalogue/Manuel
- [x] Modal "Details Avion" avec stats et cargo
- [x] Liste flotte amelioree dans Company > Flotte
- [x] Achat depuis catalogue avec deduction solde

**Catalogue d'avions**
| Categorie | Exemples | Prix |
|-----------|----------|------|
| Turboprop | Cessna 208, PC-12, Twin Otter | $250K - $2.5M |
| Jet Small | Phenom 300, Citation CJ4 | $1.1M - $1.2M |
| Jet Medium | 737-800BCF, A320P2F | $14M - $15M |
| Jet Large | 747-8F, 777F | $65M - $80M |
| Helicopter | H125, S-76 | $350K - $800K |

---

## V0.8 — Missions / Logistics

### Objectif
Creer un gameplay "transport / supply chain".

- [ ] Mission generator
- [ ] Claim/validation vol (takeoff+landing)
- [ ] Inventory in-transit lock
- [ ] Rewards / XP / money

---

## V0.9 — Admin Panel MVP

### Objectif
Outils de moderation + monitoring.

- [ ] RBAC admin/mod
- [ ] Audit log viewer
- [ ] Market moderation
- [ ] Review flight_claims
- [ ] Config (taxes, cooldowns, thresholds)
