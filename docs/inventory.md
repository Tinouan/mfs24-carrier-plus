# Inventory System - Documentation Technique

## Vue d'ensemble

Le système d'inventaire gère le stockage et le transport des items pour les compagnies:
- **Locations** - Emplacements de stockage (vault, warehouse, in_transit)
- **Items** - Quantités d'items par emplacement
- **Audit** - Historique de tous les mouvements
- **Marché** - Système de vente entre joueurs

---

## Tables SQL

### `game.inventory_locations`

Emplacements de stockage d'une compagnie.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | Clé primaire |
| `company_id` | UUID | FK → companies |
| `kind` | VARCHAR | vault, warehouse, in_transit |
| `airport_ident` | VARCHAR(8) | Code ICAO ("" pour vault) |
| `name` | VARCHAR | Nom de l'emplacement |
| `created_at` | TIMESTAMPTZ | Date de création |

**Types de locations:**

| Kind | Description | Création |
|------|-------------|----------|
| `vault` | Stockage global company | Auto (1er accès) |
| `warehouse` | Entrepôt par aéroport | Manuel ou auto (withdraw) |
| `in_transit` | Cargo avion | Futur (lors du chargement) |

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

### Factory Storage → Warehouse

Les factories ont leur propre stockage (`factory_storage`). Pour transférer:

```
[Factory Storage] ──withdraw──→ [Company Warehouse]
```

**Endpoint:** `POST /factories/{id}/storage/withdraw`

**Actions:**
1. Retire de `factory_storage`
2. Crée warehouse si inexistant (même aéroport que la factory)
3. Ajoute à `inventory_items` du warehouse
4. Audit dans `factory_transactions` (type: output)

### Warehouse → Factory Storage

**Endpoint:** `POST /factories/{id}/storage/deposit`

**Actions:**
1. Retire du warehouse
2. Ajoute à `factory_storage`
3. Audit dans `factory_transactions` (type: input)

---

## Flux Typiques

### Production et vente

```bash
# 1. Produire dans une factory
POST /factories/{id}/production/start
{"recipe_id": "uuid"}

# 2. Récupérer les produits (batch terminé)
# → Automatiquement dans factory_storage

# 3. Retirer vers warehouse
POST /factories/{id}/storage/withdraw
{"item_code": "Steel Ingot", "qty": 100}

# 4. Mettre en vente
POST /inventory/set-for-sale
{"location_id": "warehouse-uuid", "item_code": "Steel Ingot", "for_sale": true, "sale_price": 150, "sale_qty": 100}

# 5. Un autre joueur achète
POST /inventory/market/buy
{"seller_location_id": "warehouse-uuid", "item_code": "Steel Ingot", "qty": 50}
```

### Transport entre aéroports (futur)

```
[Warehouse LFPG] ──load──→ [Aircraft Cargo] ──flight──→ [Warehouse KJFK]
                            (in_transit)
```

**Note:** Le système `in_transit` sera implémenté avec le système de missions (V0.7).

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

- [ ] `in_transit` - Cargo aircraft system
- [ ] Capacités de stockage par location
- [ ] Frais de stockage (warehouse rent)
- [ ] Historique des prix du marché
- [ ] Ordres d'achat (buy orders)
- [ ] Enchères / prix dynamiques
- [ ] Export/import entre aéroports (missions)
