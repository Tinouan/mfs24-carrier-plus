# Inventory System - Documentation Technique

## Vue d'ensemble

Le système d'inventaire gère le stockage et le transport des items:
- **V0.7.1 UI** - Interface groupée par aéroport avec recherche et filtres
- **V0.7 Simplifié** - 3 tables dédiées (player_inventory, company_inventory, aircraft_inventory)
- **Legacy** - Tables originales (inventory_locations, inventory_items) conservées pour T0/NPC et HV
- **Audit** - Historique de tous les mouvements
- **Marché** - Système de vente entre joueurs (utilise tables legacy)
- **Permissions V0.7** - Contrôle d'accès granulaire

---

## V0.7.1 UI - Interface Utilisateur

### Fonctionnalités

L'interface inventaire offre:
- **Vue groupée par aéroport** - Conteneurs regroupés par aéroport avec expand/collapse
- **Recherche temps réel** - Filtrage des items par nom
- **Filtres par type** - Entrepôts perso/company, avions, usines
- **Modal détail** - Vue table complète du contenu d'un conteneur
- **Transfert drag & drop** - Glisser-déposer entre conteneurs (même aéroport)
- **Création warehouse** - Modal pour créer un entrepôt personnel

### Structure UI

```
┌─────────────────────────────────────────────────────┐
│ 📦 INVENTAIRE                      [+ Warehouse]    │
│ 72 items | 1,250$ | 3 aéroports                     │
├─────────────────────────────────────────────────────┤
│ 🔍 Rechercher...              [Type: Tous ▼]        │
├─────────────────────────────────────────────────────┤
│ ▼ 📍 LFPG                           2 conteneurs    │
│   ┌──────────────────┐  ┌──────────────────┐       │
│   │ 🏢 Mon Entrepôt  │  │ ✈️ F-TINO        │       │
│   │ 🌾 Blé x50       │  │ 📦 Vide          │       │
│   │ 170$ [Voir][🔄]  │  │ 0$ [Voir][🔄]    │       │
│   └──────────────────┘  └──────────────────┘       │
│ ▶ 📍 LFML                           1 conteneur     │
└─────────────────────────────────────────────────────┘
```

### Icônes Conteneurs

| Type | Icône | Couleur bordure |
|------|-------|-----------------|
| `player_warehouse` | 🏢 | Bleu (#00aaff) |
| `company_warehouse` | 🏭 | Orange (accent) |
| `factory_storage` | ⚙️ | Vert (success) |
| `aircraft` | ✈️ | Violet (#cc44cc) |

### Barre Cargo (Avions)

Affichage visuel de la capacité cargo:
- **Vert** - < 70% rempli
- **Orange** - 70-90% rempli
- **Rouge** - > 90% rempli

### Fichiers Frontend

| Fichier | Contenu |
|---------|---------|
| `webmap/app.html` | Structure HTML (view-inventory, modals) |
| `webmap/app.js` | Logique JS (renderInventoryAirportGroups, etc.) |
| `webmap/styles.css` | Styles CSS (.inv-airport-group, .inv-container-card)

---

## V0.7 SIMPLIFIÉ - Nouveau Système

### ⚠️ Coexistence avec l'ancien système

Les anciennes tables (`inventory_locations`, `inventory_items`) sont **conservées** pour:
- Factories T0 (NPC) - Production automatique avec vente
- Système HV actuel - Marché entre joueurs

Le nouveau système V0.7 utilise **3 tables dédiées** plus simples.

### Principes

1. **Pas de locations intermédiaires** - Items directement liés à player/company/aircraft
2. **Localisation par aéroport** - `airport_ident` stocké directement dans chaque ligne
3. **Production directe** - Les factories T1+ écrivent dans `company_inventory` (plus de `factory_storage`)
4. **Anti-cheat** - Chargement avion = même aéroport obligatoire

### Tables V0.7 Simplified

#### `game.player_inventory`

Inventaire personnel du joueur, localisé par aéroport.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | Clé primaire |
| `player_id` | UUID | FK → users |
| `item_id` | UUID | FK → items |
| `qty` | INT | Quantité (≥ 0) |
| `airport_ident` | VARCHAR(8) | Localisation ICAO |
| `created_at` | TIMESTAMPTZ | Date création |
| `updated_at` | TIMESTAMPTZ | Dernière modification |

**Contrainte:** `UNIQUE(player_id, item_id, airport_ident)`

#### `game.company_inventory`

Inventaire de la company, localisé par aéroport. Reçoit directement la production des factories T1+.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | Clé primaire |
| `company_id` | UUID | FK → companies |
| `item_id` | UUID | FK → items |
| `qty` | INT | Quantité (≥ 0) |
| `airport_ident` | VARCHAR(8) | Localisation ICAO |
| `created_at` | TIMESTAMPTZ | Date création |
| `updated_at` | TIMESTAMPTZ | Dernière modification |

**Contrainte:** `UNIQUE(company_id, item_id, airport_ident)`

#### `game.aircraft_inventory`

Cargo d'un avion. Pas de `airport_ident` - la position = position de l'avion.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | Clé primaire |
| `aircraft_id` | UUID | FK → company_aircraft |
| `item_id` | UUID | FK → items |
| `qty` | INT | Quantité (≥ 0) |
| `created_at` | TIMESTAMPTZ | Date création |
| `updated_at` | TIMESTAMPTZ | Dernière modification |

**Contrainte:** `UNIQUE(aircraft_id, item_id)`

### Endpoints V0.7 Simplified

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/inventory/player` | Inventaire personnel (tous aéroports) |
| GET | `/inventory/player?airport=LFPG` | Filtrer par aéroport |
| GET | `/inventory/company` | Inventaire company |
| GET | `/inventory/company?airport=LFPG` | Filtrer par aéroport |
| GET | `/inventory/aircraft/{id}` | Cargo d'un avion |
| POST | `/inventory/load` | Charger items dans avion |
| POST | `/inventory/unload` | Décharger items de l'avion |

### Réponses API

#### GET /inventory/player

```json
{
    "total_items": 150,
    "total_value": 25000.00,
    "total_weight_kg": 1500.00,
    "airports": ["LFPG", "EGLL", "KJFK"],
    "items": [
        {
            "item_id": "uuid",
            "item_name": "Steel Ingot",
            "tier": 2,
            "qty": 50,
            "airport_ident": "LFPG",
            "weight_kg": 10.00,
            "total_weight_kg": 500.00,
            "base_value": 150.00,
            "total_value": 7500.00
        }
    ]
}
```

#### GET /inventory/aircraft/{id}

```json
{
    "aircraft_id": "uuid",
    "aircraft_name": "Boeing 737-800",
    "current_airport": "LFPG",
    "cargo_capacity_kg": 20000.00,
    "current_weight_kg": 5000.00,
    "available_capacity_kg": 15000.00,
    "items": [
        {
            "item_id": "uuid",
            "item_name": "Steel Ingot",
            "tier": 2,
            "qty": 100,
            "weight_kg": 10.00,
            "total_weight_kg": 1000.00
        }
    ]
}
```

### Load/Unload Cargo

```bash
# Charger depuis inventaire PLAYER vers avion
POST /inventory/load
{
    "aircraft_id": "uuid",
    "item_id": "uuid",
    "qty": 50,
    "from_inventory": "player"  # ou "company"
}

# Décharger depuis avion vers inventaire COMPANY
POST /inventory/unload
{
    "aircraft_id": "uuid",
    "item_id": "uuid",
    "qty": 50,
    "to_inventory": "company"  # ou "player"
}
```

### Validations Anti-Cheat

1. **Load**: Items doivent être à `aircraft.current_airport_ident`
2. **Unload**: Items arrivent à `aircraft.current_airport_ident`
3. **Cargo capacity**: Poids total ne peut pas dépasser capacité avion

### Flux Production V0.7

```
[Factory T1+] ─complete_batch()─→ [company_inventory @ factory.airport_ident]
```

La fonction `complete_batch()` dans `production_service.py` écrit **directement** dans `company_inventory` au lieu de `factory_storage`.

### Flux Transport Complet

```
[company_inventory LFPG] ──load──→ [aircraft_inventory] ──vol──→ [player_inventory KJFK]
                               ↑                              ↑
                          même aéroport                 même aéroport
```

---

## V0.7 LEGACY - Unified Inventory System (anciennes tables)

> **Note:** Cette section décrit les anciennes tables toujours utilisées pour T0/NPC et le marché HV.

### Principes Anti-Cheat

1. **Localisation physique** - Tous les items sont physiquement à un aéroport
2. **Transferts locaux** - Mouvements uniquement au même aéroport
3. **Transport = Vol** - Inter-aéroport nécessite un avion

### Types de Containers

| Type | Description | Owner |
|------|-------------|-------|
| `player_warehouse` | Entrepôt personnel | Player |
| `company_warehouse` | Entrepôt company | Company |
| `factory_storage` | Stockage usine | Company |
| `aircraft` | Cargo avion | Company/Player |

### Ownership Polymorphe

```sql
-- inventory_locations
owner_type VARCHAR(20)  -- 'company' ou 'player'
owner_id   UUID         -- company_id ou user_id
```

### Permissions V0.7

| Permission | Description |
|------------|-------------|
| `can_withdraw_warehouse` | Retirer du warehouse company |
| `can_deposit_warehouse` | Déposer au warehouse company |
| `can_withdraw_factory` | Retirer du factory storage |
| `can_deposit_factory` | Déposer au factory storage |
| `can_manage_aircraft` | Gérer les avions (acheter, vendre) |
| `can_use_aircraft` | Utiliser les avions (load/unload cargo) |
| `can_sell_market` | Mettre en vente sur le marché |
| `can_buy_market` | Acheter sur le marché |
| `can_manage_workers` | Gérer les workers |
| `can_manage_members` | Gérer les permissions membres |
| `can_manage_factories` | Gérer les usines |
| `is_founder` | Tous les droits (non modifiable) |

### Endpoints V0.7

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/inventory/overview` | Vue globale (player + company) |
| GET | `/inventory/my-locations` | Locations du joueur |
| GET | `/inventory/airport/{icao}` | Inventaire à un aéroport |
| POST | `/inventory/warehouse/player` | Créer warehouse personnel |
| POST | `/inventory/transfer` | Transfert même aéroport |

### Fleet Cargo V0.7

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/fleet/{id}/cargo` | Contenu cargo avion |
| POST | `/fleet/{id}/load` | Charger (validation poids) |
| POST | `/fleet/{id}/unload` | Décharger (même aéroport) |
| PATCH | `/fleet/{id}/location` | Update position après vol |

### Exemple: Transport LFPG → EGLL

```bash
# 1. Charger à LFPG
POST /fleet/{aircraft_id}/load
{"from_location_id": "warehouse-lfpg", "item_id": "uuid", "qty": 100}

# 2. Vol (simulateur MSFS)

# 3. Update position
PATCH /fleet/{aircraft_id}/location
{"airport_ident": "EGLL"}

# 4. Décharger à EGLL
POST /fleet/{aircraft_id}/unload
{"to_location_id": "warehouse-egll", "item_id": "uuid", "qty": 100}
```

### Validation Cross-Airport

```bash
# ❌ BLOQUÉ - Transfert direct entre aéroports
POST /inventory/transfer
{"from_location_id": "lfpg-uuid", "to_location_id": "egll-uuid", ...}
# → 400: "Transfer between airports not allowed. Use aircraft for transport."

# ❌ BLOQUÉ - Décharger vers autre aéroport
POST /fleet/{id}/unload (aircraft à EGLL, destination à LFPG)
# → 400: "Destination (LFPG) must be at same airport as aircraft (EGLL)"
```

---

## Tables SQL

### `game.inventory_locations`

Emplacements de stockage (ownership polymorphe V0.7).

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | Clé primaire |
| `company_id` | UUID | FK → companies (nullable V0.7) |
| `owner_type` | VARCHAR(20) | **V0.7** 'company' ou 'player' |
| `owner_id` | UUID | **V0.7** company_id ou user_id |
| `aircraft_id` | UUID | **V0.7** FK → company_aircraft (si kind=aircraft) |
| `kind` | VARCHAR | player_warehouse, company_warehouse, factory_storage, aircraft |
| `airport_ident` | VARCHAR(8) | Code ICAO |
| `name` | VARCHAR | Nom de l'emplacement |
| `created_at` | TIMESTAMPTZ | Date de création |

**Types de locations V0.7:**

| Kind | Owner Type | Description |
|------|------------|-------------|
| `player_warehouse` | player | Entrepôt personnel |
| `company_warehouse` | company | Entrepôt company |
| `factory_storage` | company | Stockage usine |
| `aircraft` | company/player | Cargo avion |

### `game.company_permissions` (V0.7)

Permissions granulaires par membre de company.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | Clé primaire |
| `company_id` | UUID | FK → companies |
| `user_id` | UUID | FK → users |
| `can_withdraw_warehouse` | BOOLEAN | Retirer du warehouse |
| `can_deposit_warehouse` | BOOLEAN | Déposer au warehouse |
| `can_withdraw_factory` | BOOLEAN | Retirer de factory |
| `can_deposit_factory` | BOOLEAN | Déposer à factory |
| `can_manage_aircraft` | BOOLEAN | Gérer avions |
| `can_use_aircraft` | BOOLEAN | Utiliser avions |
| `can_sell_market` | BOOLEAN | Vendre sur marché |
| `can_buy_market` | BOOLEAN | Acheter sur marché |
| `can_manage_workers` | BOOLEAN | Gérer workers |
| `can_manage_members` | BOOLEAN | Gérer permissions |
| `can_manage_factories` | BOOLEAN | Gérer factories |
| `is_founder` | BOOLEAN | Fondateur (tous droits) |

**Permissions par défaut:**

| Rôle | Permissions |
|------|-------------|
| Founder | Toutes (is_founder=true) |
| Admin | withdraw_*, manage_aircraft, sell_market, manage_workers, manage_factories |
| Member | deposit_*, use_aircraft, buy_market |

### `game.inventory_items`

Items stockés dans une location.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | Clé primaire |
| `location_id` | UUID | FK → inventory_locations |
| `item_id` | UUID | FK → items |
| `qty` | INT | Quantité totale |
| `for_sale` | BOOLEAN | En vente sur le marché |
| `sale_price` | DECIMAL(12,2) | Prix unitaire de vente |
| `sale_qty` | BIGINT | Quantité mise en vente (≤ qty) |
| `updated_at` | TIMESTAMPTZ | Dernière modification |

**Contrainte unique:** `(location_id, item_id)` - Un seul enregistrement par item/location.

### `game.inventory_audits`

Historique des mouvements d'inventaire.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | Clé primaire |
| `location_id` | UUID | FK → inventory_locations |
| `item_id` | UUID | ID de l'item |
| `quantity_delta` | INT | +/- quantité (positif=ajout) |
| `action` | VARCHAR(50) | Type d'action |
| `user_id` | UUID | FK → users (nullable) |
| `notes` | TEXT | Notes additionnelles |
| `created_at` | TIMESTAMPTZ | Date de l'action |

**Actions auditées:**

| Action | Description |
|--------|-------------|
| `deposit` | Ajout manuel d'items |
| `withdraw` | Retrait manuel d'items |
| `move_out` | Transfert sortant |
| `move_in` | Transfert entrant |
| `set_for_sale` | Mise en vente |
| `remove_from_sale` | Retrait de la vente |
| `market_buy` | Achat sur le marché |
| `market_sell` | Vente sur le marché |

---

## API Endpoints

### Locations

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/inventory/locations` | Liste mes emplacements |
| POST | `/inventory/locations/warehouse` | Créer/récupérer warehouse |
| GET | `/inventory/location/{id}` | Inventaire d'un emplacement |

### Opérations

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/inventory/deposit` | Déposer des items |
| POST | `/inventory/withdraw` | Retirer des items |
| POST | `/inventory/move` | Transférer entre locations |

### Marché

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/inventory/set-for-sale` | Mettre en vente |
| GET | `/inventory/market/{airport}` | Items en vente (public) |
| POST | `/inventory/market/buy` | Acheter sur le marché |

---

## Gestion des Locations

### Vault (Stockage Global)

Le vault est créé **automatiquement** au premier accès à `/inventory/locations`.

```json
{
    "id": "uuid",
    "company_id": "uuid",
    "kind": "vault",
    "airport_ident": "",
    "name": "company-slug vault"
}
```

**Caractéristiques:**
- Un seul vault par company
- `airport_ident` = "" (vide)
- Ne peut pas vendre (vente uniquement depuis warehouse)

### Warehouse (Entrepôt Aéroport)

Créé manuellement ou automatiquement lors d'un `withdraw` depuis une factory.

**Endpoint:** `POST /inventory/locations/warehouse`

**Body:**
```json
{
    "airport_ident": "LFPG"
}
```

**Réponse:**
```json
{
    "id": "uuid",
    "company_id": "uuid",
    "kind": "warehouse",
    "airport_ident": "LFPG",
    "name": "Warehouse LFPG"
}
```

**Note:** Si le warehouse existe déjà, retourne l'existant (idempotent).

---

## Opérations d'Inventaire

### Déposer: `POST /inventory/deposit`

Ajoute des items à un emplacement.

**Body:**
```json
{
    "location_id": "uuid",
    "item_code": "Iron Ore",
    "qty": 100
}
```

**Validations:**
- `qty` > 0
- L'item existe dans le catalogue
- La location appartient à ma company

### Retirer: `POST /inventory/withdraw`

Retire des items d'un emplacement.

**Body:**
```json
{
    "location_id": "uuid",
    "item_code": "Iron Ore",
    "qty": 50
}
```

**Validations:**
- `qty` > 0
- Stock suffisant (`qty` disponible)

### Transférer: `POST /inventory/move`

Déplace des items entre deux emplacements de la même company.

**Body:**
```json
{
    "from_location_id": "uuid",
    "to_location_id": "uuid",
    "item_code": "Iron Ore",
    "qty": 25
}
```

**Actions:**
1. Retire de la source
2. Ajoute à la destination
3. Crée 2 audits (move_out + move_in)

---

## Système de Marché

### Mettre en vente: `POST /inventory/set-for-sale`

**Prérequis:** Item dans un **warehouse** (pas vault)

**Body (mise en vente):**
```json
{
    "location_id": "uuid",
    "item_code": "Steel Ingot",
    "for_sale": true,
    "sale_price": 150.00,
    "sale_qty": 50
}
```

**Body (retrait de la vente):**
```json
{
    "location_id": "uuid",
    "item_code": "Steel Ingot",
    "for_sale": false
}
```

**Validations:**
- `sale_price` > 0 (obligatoire si `for_sale` = true)
- `sale_qty` ≤ `qty` disponible (si 0, utilise tout le stock)

### Voir le marché: `GET /inventory/market/{airport}`

Liste tous les items en vente à un aéroport (endpoint **public**).

**Exemple:** `GET /inventory/market/LFPG`

**Réponse:**
```json
[
    {
        "location_id": "uuid",
        "airport_ident": "LFPG",
        "company_id": "uuid",
        "company_name": "Air Cargo Express",
        "item_id": "uuid",
        "item_code": "Steel Ingot",
        "item_name": "Steel Ingot",
        "sale_price": 150.00,
        "sale_qty": 50
    }
]
```

### Acheter: `POST /inventory/market/buy`

**Body:**
```json
{
    "seller_location_id": "uuid",
    "item_code": "Steel Ingot",
    "qty": 10
}
```

**Validations:**
1. Acheteur n'est pas le vendeur
2. Stock en vente suffisant (`sale_qty` ≥ qty demandé)
3. Balance suffisante (acheteur)

**Actions automatiques:**
1. Retrait du vendeur (`qty` et `sale_qty` diminués)
2. Création warehouse acheteur si inexistant (même aéroport)
3. Ajout à l'acheteur
4. Transfert d'argent (balance)
5. Audits côté vendeur (market_sell) et acheteur (market_buy)

**Si `sale_qty` tombe à 0:**
- `for_sale` → false
- `sale_price` → null
- `sale_qty` → 0

---

## Interaction avec Factory System

### V0.7 Simplifié: Production directe

Les factories T1+ écrivent **directement** dans `company_inventory`:

```
[Factory T1+] ─complete_batch()─→ [company_inventory @ airport]
```

**Pas de `factory_storage` intermédiaire** pour les factories T1+.

### Legacy: Factory Storage (T0/NPC uniquement)

Les factories T0 (NPC) utilisent encore le système legacy:

```
[Factory T0] ──auto_produce──→ [inventory_items via inventory_locations]
```

Pour transférer depuis `factory_storage` vers warehouse (legacy):

**Endpoint:** `POST /factories/{id}/storage/withdraw`

**Actions:**
1. Retire de `factory_storage`
2. Crée warehouse si inexistant (même aéroport que la factory)
3. Ajoute à `inventory_items` du warehouse
4. Audit dans `factory_transactions` (type: output)

---

## Flux Typiques

### V0.7 Simplifié: Production et Transport

```bash
# 1. Produire dans une factory T1+
POST /factories/{id}/production/start
{"recipe_id": "uuid"}

# 2. Batch terminé automatiquement
# → Items dans company_inventory @ factory.airport_ident

# 3. Voir l'inventaire company
GET /inventory/company
# → Liste tous les items par aéroport

# 4. Charger dans un avion
POST /inventory/load
{"aircraft_id": "uuid", "item_id": "uuid", "qty": 50, "from_inventory": "company"}

# 5. Vol (simulateur MSFS) + update position
PATCH /fleet/{aircraft_id}/location
{"airport_ident": "KJFK"}

# 6. Décharger à destination
POST /inventory/unload
{"aircraft_id": "uuid", "item_id": "uuid", "qty": 50, "to_inventory": "player"}
```

### Legacy: Production et vente HV

```bash
# 1. Produire (T0 NPC uniquement via scheduler)
# → Automatiquement dans inventory_items

# 2. Mettre en vente
POST /inventory/set-for-sale
{"location_id": "warehouse-uuid", "item_code": "Raw Wheat", "for_sale": true, "sale_price": 10, "sale_qty": 100}

# 3. Un autre joueur achète
POST /inventory/market/buy
{"seller_location_id": "warehouse-uuid", "item_code": "Raw Wheat", "qty": 50}
```

### Transport entre aéroports (V0.7 Simplifié)

```
[company_inventory LFPG] ──load──→ [aircraft_inventory] ──flight──→ [player_inventory KJFK]
```

**Endpoints V0.7 Simplifié:**
- `POST /inventory/load` - Charge depuis player/company inventory (même aéroport que l'avion)
- `PATCH /fleet/{id}/location` - Update position après vol
- `POST /inventory/unload` - Décharge vers player/company inventory (à l'aéroport de l'avion)

---

## Sécurité et Validations

### Isolation des données

- Toutes les requêtes filtrent par `company_id` de l'utilisateur
- Impossible d'accéder aux locations d'autres companies
- Seul le marché expose des données inter-companies

### Transactions

- Toutes les opérations sont **transactionnelles** (rollback en cas d'erreur)
- Vérification du stock **avant** modification
- Double audit pour les mouvements (source + destination)

### Contraintes

- `qty` ne peut pas devenir négatif
- `sale_qty` ≤ `qty` (protégé par validation)
- Un item/location = un seul enregistrement (UNIQUE constraint)

---

## Évolutions futures

- [x] ~~`in_transit` - Cargo aircraft system~~ **V0.7 Complété**
- [x] ~~Player warehouses~~ **V0.7 Complété**
- [x] ~~Permissions granulaires~~ **V0.7 Complété**
- [x] ~~Anti-cheat cross-airport~~ **V0.7 Complété**
- [x] ~~Inventaire simplifié (3 tables dédiées)~~ **V0.7 Simplifié Complété**
- [x] ~~Production directe dans company_inventory~~ **V0.7 Simplifié Complété**
- [x] ~~UI groupée par aéroport avec recherche/filtres~~ **V0.7.1 Complété**
- [ ] Migration HV vers nouvelles tables
- [ ] Capacités de stockage par location
- [ ] Frais de stockage (warehouse rent)
- [ ] Historique des prix du marché
- [ ] Ordres d'achat (buy orders)
- [ ] Enchères / prix dynamiques
- [ ] Missions (transport, supply chain)
