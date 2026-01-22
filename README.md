# MFS Carrier+

Jeu de gestion de compagnie aérienne cargo pour Microsoft Flight Simulator 2024.

---

## V0.1 — Core (DONE)

- [x] Docker stack : Postgres + Directus + Nginx + FastAPI
- [x] Auth JWT (`/api/auth/*`, `/api/me`)
- [x] Company + members
- [x] Inventory (vault + warehouses)
- [x] Fleet (company_aircraft)
- [x] API docs via `/api/docs`
- [x] **84 000+ airports** importés avec système de slots

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

### 🏭 PHASE 3: Production Logic (À VENIR)

**Statut**: 🔴 Non démarré

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
- [ ] Cron toutes les 5 min: check batches en cours
- [ ] Health degradation workers
- [ ] Auto-completion batches
- [ ] Notifications (batch terminé, worker critique, etc.)

---

### 🤖 PHASE 4: NPC Factories + Market (À VENIR)

**Statut**: 🔴 Non démarré

#### Concept
- Factories gérées par système (non-joueur)
- Production automatique items pour marché mondial
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

### 🎯 État Actuel Projet

**✅ Fonctionnel (2026-01-22)**
- PostgreSQL avec **17 tables game** (Phase 1 + Phase 2)
- **84 000+ airports** importés avec système de slots
- **31 usines T0** (NPC) en France avec mapping produits
- 93 items (T0: 33, T1: 30, T2: 30) insérés
- 60 recettes (T1: 30, T2: 30) insérées
- API FastAPI démarrée (Docker local)
- Auth JWT fonctionnelle
- Docker containers stables

**✅ Frontend Webmap (2026-01-22)**
- Carte Leaflet avec clustering aéroports/usines
- Icônes de production pour usines T0 (food, fuel, mineral, etc.)
- Dashboard Company avec onglets (Aperçu, Usines, Flotte, Employés)
- Vue Profil pilote avec XP, licences, messagerie
- Modal création usine sur slots disponibles
- Affichage membres company avec username/email

**✅ API Endpoints Complets**
- `/api/world/factories` - Liste factories pour carte
- `/api/world/airports/{ident}/slots` - Slots disponibles
- `/api/company/members` - Membres avec infos utilisateur
- `/api/factories/*` - CRUD complet factories
- `/api/factories/{id}/workers` - Gestion workers

**⏳ À venir**
- Implémentation système production complet (Phase 3)
- NPC factories + marché dynamique (Phase 4)
- Items T3-T5 (~300 items total)
- Intégration MSFS 2024

---

## V0.6 — Missions / Logistics

### Objectif
Créer un gameplay “transport / supply chain”.

- [ ] Mission generator
- [ ] Claim/validation vol (takeoff+landing)
- [ ] Inventory in-transit lock
- [ ] Rewards / XP / money

---

## V0.7 — Admin Panel MVP

### Objectif
Outils de modération + monitoring.

- [ ] RBAC admin/mod
- [ ] Audit log viewer
- [ ] Market moderation
- [ ] Review flight_claims
- [ ] Config (taxes, cooldowns, thresholds)
