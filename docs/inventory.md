# Inventory System - Documentation Technique

> **Version**: V0.9 (Architecture P2P)

## Vue d'ensemble

Le système d'inventaire gère le stockage et le transport des items:
- **3 tables dédiées** (player_inventory, company_inventory, aircraft_inventory)
- **Localisation par aéroport** - Items physiquement localisés
- **Anti-cheat** - Transferts uniquement au même aéroport
- **Transport = Vol** - Inter-aéroport nécessite un avion

**Architecture P2P**: Les données sont stockées localement en SQLite et synchronisées avec les autres joueurs via le NetworkManager.

---

## Tables SQLite

### `player_inventory`

Inventaire personnel du joueur, localisé par aéroport.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | TEXT (UUID) | Clé primaire |
| `player_id` | TEXT | FK → player |
| `item_id` | TEXT | FK → items |
| `qty` | INTEGER | Quantité (≥ 0) |
| `airport_ident` | TEXT | Localisation ICAO |
| `created_at` | TEXT | Date création |
| `updated_at` | TEXT | Dernière modification |

**Contrainte:** `UNIQUE(player_id, item_id, airport_ident)`

### `company_inventory`

Inventaire de la company, localisé par aéroport. Reçoit la production des factories.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | TEXT (UUID) | Clé primaire |
| `company_id` | TEXT | FK → companies |
| `item_id` | TEXT | FK → items |
| `qty` | INTEGER | Quantité (≥ 0) |
| `airport_ident` | TEXT | Localisation ICAO |
| `for_sale` | INTEGER | En vente (0/1) |
| `sale_price` | REAL | Prix de vente unitaire |
| `sale_qty` | INTEGER | Quantité en vente |
| `created_at` | TEXT | Date création |
| `updated_at` | TEXT | Dernière modification |

**Contrainte:** `UNIQUE(company_id, item_id, airport_ident)`

### `aircraft_inventory`

Cargo d'un avion. Pas de `airport_ident` - la position = position de l'avion.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | TEXT (UUID) | Clé primaire |
| `aircraft_id` | TEXT | FK → aircraft |
| `item_id` | TEXT | FK → items |
| `qty` | INTEGER | Quantité (≥ 0) |
| `created_at` | TEXT | Date création |
| `updated_at` | TEXT | Dernière modification |

**Contrainte:** `UNIQUE(aircraft_id, item_id)`

---

## Types de Containers

| Type | Description | Owner |
|------|-------------|-------|
| `player_inventory` | Entrepôt personnel | Player |
| `company_inventory` | Entrepôt company + Production | Company |
| `aircraft_inventory` | Cargo avion (limite poids) | Company/Player |

### Icônes UI

| Type | Icône | Nom affiché |
|------|-------|-------------|
| `player_inventory` | 👤 | Stock Perso - ICAO |
| `company_inventory` | 🏢 | Stock Company - ICAO |
| `aircraft_inventory` | ✈️ | [Immatriculation] |

---

## Services TypeScript

### InventoryService

```typescript
// services/InventoryService.ts

class InventoryServiceClass {
  // Inventaire personnel (tous aéroports)
  async getPlayerInventory(airportIdent?: string): Promise<InventoryItem[]>;

  // Inventaire company
  async getCompanyInventory(airportIdent?: string): Promise<InventoryItem[]>;

  // Cargo d'un avion
  async getAircraftCargo(aircraftId: string): Promise<AircraftCargo>;

  // Charger items dans avion
  async loadCargo(params: {
    aircraft_id: string;
    item_id: string;
    qty: number;
    from_inventory: 'player' | 'company';
  }): Promise<void>;

  // Décharger items de l'avion
  async unloadCargo(params: {
    aircraft_id: string;
    item_id: string;
    qty: number;
    to_inventory: 'player' | 'company';
  }): Promise<void>;

  // Vue globale (player + company)
  async getOverview(): Promise<InventoryOverview>;
}
```

### DataLayer (Abstraction)

```typescript
// En mode solo → SQLite local
DataLayer.setLocalMode();

// En mode multi → Via peer
DataLayer.setNetworkMode({ host: '192.168.1.10', port: 7777 });

// Les services utilisent DataLayer
const inventory = await DataLayer.getInventory('player', playerId);
```

---

## Validations Anti-Cheat

### Règle fondamentale

> **Transport inter-aéroport = Vol obligatoire**

- ❌ Transfert direct LFPG → EGLL bloqué
- ✅ Charger avion → Voler → Décharger

### Load Cargo

```typescript
// InventoryService.loadCargo()
async loadCargo(params: LoadCargoParams): Promise<void> {
  const aircraft = await FleetService.getAircraft(params.aircraft_id);
  const inventory = await this.getInventoryAtAirport(
    params.from_inventory,
    aircraft.current_airport_ident
  );

  // 1. Items doivent être au même aéroport que l'avion
  const item = inventory.find(i => i.item_id === params.item_id);
  if (!item || item.qty < params.qty) {
    throw new Error("Insufficient stock at aircraft location");
  }

  // 2. Vérifier capacité cargo
  const cargo = await this.getAircraftCargo(params.aircraft_id);
  const itemWeight = await this.getItemWeight(params.item_id);
  if (cargo.current_weight_kg + (params.qty * itemWeight) > cargo.capacity_kg) {
    throw new Error("Cargo capacity exceeded");
  }

  // 3. Transférer
  await this.removeFromInventory(params.from_inventory, params.item_id, params.qty);
  await this.addToAircraftCargo(params.aircraft_id, params.item_id, params.qty);
}
```

### Unload Cargo

```typescript
// InventoryService.unloadCargo()
async unloadCargo(params: UnloadCargoParams): Promise<void> {
  const aircraft = await FleetService.getAircraft(params.aircraft_id);

  // Items arrivent à l'aéroport actuel de l'avion
  const destinationAirport = aircraft.current_airport_ident;

  await this.removeFromAircraftCargo(params.aircraft_id, params.item_id, params.qty);
  await this.addToInventory(
    params.to_inventory,
    params.item_id,
    params.qty,
    destinationAirport
  );
}
```

---

## Interface Utilisateur

### Vue Inventaire

```
┌─────────────────────────────────────────────────────┐
│ 📦 INVENTAIRE          👤 5,000$ | 🏢 25,000$       │
│ 72 items | 1,250$ | 3 aéroports                     │
├─────────────────────────────────────────────────────┤
│ 🔍 Rechercher...     [Tous][Perso][Company][EnVente]│
├─────────────────────────────────────────────────────┤
│ ▼ 📍 LFPG                           2 conteneurs    │
│   ┌──────────────────┐  ┌──────────────────┐       │
│   │ 👤 Stock Perso   │  │ ✈️ F-TINO        │       │
│   │ 🌾 Blé x50       │  │ 📦 Vide          │       │
│   │ 170$ [Voir][🔄]  │  │ 0$ [Voir][🔄]    │       │
│   └──────────────────┘  └──────────────────┘       │
│ ▶ 📍 LFML                           1 conteneur     │
└─────────────────────────────────────────────────────┘
```

### Fonctionnalités UI

- **Vue groupée par aéroport** - Conteneurs regroupés avec expand/collapse
- **Recherche temps réel** - Filtrage des items par nom
- **Filtres par type** - Entrepôts perso/company, avions, en vente
- **Modal détail** - Vue table complète du contenu
- **Wallets header** - Affichage wallet perso et company

### Barre Cargo (Avions)

Affichage visuel de la capacité cargo:
- **Vert** - < 70% rempli
- **Orange** - 70-90% rempli
- **Rouge** - > 90% rempli

---

## Système de Vente

### Mise en vente

Les items mis en vente sont **déduits** de l'inventaire normal:

```typescript
// InventoryService.setForSale()
async setForSale(params: {
  item_id: string;
  airport_ident: string;
  sale_price: number;
  sale_qty: number;
}): Promise<void> {
  const inventory = await this.getCompanyInventoryItem(params.item_id, params.airport_ident);

  if (inventory.qty < params.sale_qty) {
    throw new Error("Insufficient quantity");
  }

  // Déduire du stock normal
  inventory.qty -= params.sale_qty;
  inventory.for_sale = true;
  inventory.sale_price = params.sale_price;
  inventory.sale_qty = params.sale_qty;

  await DatabaseManager.saveInventory(inventory);
}
```

### Annulation de vente

```typescript
// InventoryService.cancelSale()
async cancelSale(itemId: string, airportIdent: string): Promise<void> {
  const inventory = await this.getCompanyInventoryItem(itemId, airportIdent);

  // Retourner au stock normal
  inventory.qty += inventory.sale_qty;
  inventory.for_sale = false;
  inventory.sale_price = null;
  inventory.sale_qty = 0;

  await DatabaseManager.saveInventory(inventory);
}
```

### Filtre "En Vente"

| Filtre | Description |
|--------|-------------|
| Tous | Tous les items |
| Perso | player_inventory uniquement |
| Company | company_inventory uniquement |
| Avions | aircraft_inventory uniquement |
| **En Vente** | Items avec `for_sale=true` |

---

## Flux de Transport

### Transport entre aéroports

```
[player/company_inventory LFPG] ──load──→ [aircraft_inventory] ──vol──→ [player/company_inventory KJFK]
                                    ↑                              ↑
                               même aéroport                 même aéroport
```

### Exemple complet

```typescript
// 1. Charger à LFPG
await InventoryService.loadCargo({
  aircraft_id: "uuid",
  item_id: "uuid",
  qty: 100,
  from_inventory: "company"
});

// 2. Vol MSFS (le joueur vole)

// 3. Update position après atterrissage
await FleetService.updateAircraftLocation("uuid", "KJFK");

// 4. Décharger à KJFK
await InventoryService.unloadCargo({
  aircraft_id: "uuid",
  item_id: "uuid",
  qty: 100,
  to_inventory: "player"
});
```

---

## Flux Production → Inventaire

Les factories T1+ écrivent directement dans `company_inventory`:

```
[Factory T1+] ─completeBatch()─→ [company_inventory @ factory.airport_ident]
```

Pas de stockage intermédiaire - les produits arrivent directement dans l'inventaire company.

---

## Sync P2P

### Données synchronisées

| Donnée | Direction | Fréquence |
|--------|-----------|-----------|
| Inventaires par aéroport | Bidirectionnel | 5 sec |
| Items en vente | Bidirectionnel | 5 sec |
| Cargo avions | Local uniquement | - |

### Données locales uniquement

- Position exacte de l'avion (cargo suit)
- Mission en cours
- Préférences UI

---

## Sécurité et Transactions

### Isolation des données

- Toutes les requêtes filtrent par `player_id` ou `company_id`
- Impossible d'accéder aux inventaires d'autres joueurs
- Seul le marché expose des données publiques

### Transactions

- Toutes les opérations sont atomiques
- Rollback en cas d'erreur
- Vérification du stock avant modification

### Contraintes

- `qty` ne peut pas devenir négatif
- `sale_qty` ≤ `qty` disponible
- Un item/location = un seul enregistrement (UNIQUE constraint)

---

## Évolutions futures

- [ ] Capacités de stockage par location
- [ ] Frais de stockage (warehouse rent)
- [ ] Historique des prix du marché
- [ ] Ordres d'achat (buy orders)
