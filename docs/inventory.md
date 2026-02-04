# Inventory System - Documentation Technique

> **Version**: V1.0 (Architecture P2P - IndexedDB)

## Vue d'ensemble

Le système d'inventaire gère le stockage et le transport des items:
- **Table unifiée `inventory`** avec `location_type` pour différencier les types
- **Localisation par aéroport** - Items physiquement localisés
- **Anti-cheat** - Transferts uniquement au même aéroport
- **Transport = Vol** - Inter-aéroport nécessite un avion

**Architecture P2P**: Les données sont stockées localement en **IndexedDB** et synchronisées avec les autres joueurs via le NetworkManager.

---

## Base de données IndexedDB

### Table `inventory`

Table unifiée pour tous les types d'inventaire.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | string (UUID) | Clé primaire |
| `location_type` | string | Type: "player", "airport", "aircraft" |
| `location_id` | string | ICAO (airport) ou UUID (aircraft) |
| `item_code` | string | Code de l'item (ex: "wheat", "flour") |
| `quantity` | number | Quantité (≥ 0) |

### Valeurs de `location_type`

| Type | Description | Owner | Exemple location_id |
|------|-------------|-------|---------------------|
| `player` | Inventaire personnel | Player | "LFPG" (ICAO) |
| `airport` | Inventaire company | Company | "LFPG" (ICAO) |
| `aircraft` | Cargo avion | Company | UUID de l'avion |

### Logique de stockage

- **Achat market perso** → `location_type: "player"`, `location_id: ICAO`
- **Achat market company** → `location_type: "airport"`, `location_id: ICAO`
- **Production factory** → `location_type: "airport"`, `location_id: factory.airport_ident`
- **Cargo avion** → `location_type: "aircraft"`, `location_id: aircraft.id`

---

## Interface Utilisateur

### Inventaire Personnel (Profile > Inventaire)

Accessible via l'onglet **Profile** puis sous-onglet **Inventaire**.

```
┌─────────────────────────────────────────────────────────┐
│ INVENTAIRE                                               │
├─────────────────────────────────────────────────────────┤
│ [T0] [T1] [T2] [T3] [Tous]                              │
│                                                          │
│ 🔍 Aéroport...     🔍 Nom item...                        │
├─────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────┐  │
│ │ 📍 LFPG                                            │  │
│ │ ├── 🌾 Wheat (T0)              x50    170$        │  │
│ │ └── 🍞 Bread (T1)              x25    500$        │  │
│ ├────────────────────────────────────────────────────┤  │
│ │ 📍 LFML                                            │  │
│ │ └── 🧈 Butter (T1)             x10    350$        │  │
│ └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Inventaire Company (Company > Inventaire)

Accessible via l'onglet **Company** puis sous-onglet **Inventaire**.
Affiche un header avec le nom et la base de la company.

```
┌─────────────────────────────────────────────────────────┐
│ ┌─────────────────────────────────────────────────────┐ │
│ │ 🏢 TitiAirlines                                     │ │
│ │    Base: LFPG                                       │ │
│ └─────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│ INVENTAIRE COMPANY                                       │
├─────────────────────────────────────────────────────────┤
│ [T0] [T1] [T2] [T3] [Tous]                              │
│                                                          │
│ 🔍 Aéroport...     🔍 Nom item...                        │
├─────────────────────────────────────────────────────────┤
│ (Liste des items company groupés par aéroport)          │
└─────────────────────────────────────────────────────────┘
```

### Filtres disponibles

| Filtre | Description | État |
|--------|-------------|------|
| **Tier** | Boutons T0/T1/T2/T3/Tous | Active un seul à la fois |
| **ICAO** | Recherche par code aéroport | Texte libre |
| **Item** | Recherche par nom d'item | Texte libre |

### Affichage des items

- **Groupés par aéroport** - Header avec icône 📍 et code ICAO
- **Couleur par tier** - Vert (T0), Bleu (T1), Violet (T2), Orange (T3)
- **Informations** - Nom, tier, quantité, valeur totale

---

## Services TypeScript

### LocalMarketService

```typescript
// services/LocalMarketService.ts

class LocalMarketServiceClass {
  // Inventaire personnel (location_type: "player")
  async getPlayerInventory(): Promise<InventoryItem[]>;

  // Inventaire company (location_type: "airport" + aircraft cargo)
  async getCompanyInventory(): Promise<InventoryItem[]>;

  // Ajouter à l'inventaire (achat market)
  async addToInventory(
    locationId: string,
    itemCode: string,
    quantity: number,
    locationType: "player" | "airport" | "aircraft"
  ): Promise<void>;
}
```

### DatabaseManager

```typescript
// managers/DatabaseManager.ts

class DatabaseManagerClass {
  // Récupérer inventaire à une location
  async getInventoryAt(
    locationType: string,
    locationId: string
  ): Promise<DbInventoryItem[]>;

  // Ajouter/mettre à jour un item
  async addInventoryItem(
    locationType: string,
    locationId: string,
    itemCode: string,
    quantity: number
  ): Promise<void>;

  // Récupérer tout l'inventaire
  async getAll<T>(store: "inventory"): Promise<T[]>;
}
```

---

## Flux d'Achat Market

### Achat personnel

```
[Market] ─── wallet: "player" ───→ [inventory]
                                    location_type: "player"
                                    location_id: order.airport_ident
```

### Achat company

```
[Market] ─── wallet: "company" ──→ [inventory]
                                    location_type: "airport"
                                    location_id: order.airport_ident
```

### Code d'achat

```typescript
// LocalMarketService.buyFromMarket()
async buyFromMarket(params: BuyParams): Promise<void> {
  const { orderId, quantity, walletType } = params;
  const order = await this.getOrder(orderId);

  // Déterminer le type de location selon le wallet
  const locationType = walletType === "player" ? "player" : "airport";

  // Ajouter à l'inventaire
  await DatabaseManager.addInventoryItem(
    locationType,
    order.airport_ident,
    order.item_code,
    quantity
  );

  // Déduire du wallet
  if (walletType === "player") {
    await this.deductFromPlayerWallet(total);
  } else {
    await this.deductFromCompanyWallet(total);
  }
}
```

---

## État React (MSFS SDK Subjects)

### InventoryState.ts

```typescript
// state/InventoryState.ts

export interface InventoryStateType {
  // Status global
  inventoryStatus: Subject<LoadingStatus>;
  inventoryError: Subject<string | null>;
  inventoryType: Subject<InventoryOwnerType>;

  // Données brutes P2P
  inventoryItems: Subject<LocalInventoryItem[]>;

  // Inventaire Profile (affichage)
  profileInventory: Subject<ProfileInventoryItem[]>;
  profileInventoryLoading: Subject<boolean>;
  profileIcaoFilter: Subject<string>;
  profileItemFilter: Subject<string>;
  profileTierFilter: Subject<number | null>;

  // Inventaire Company (affichage)
  companyInventory: Subject<ProfileInventoryItem[]>;
  companyInventoryLoading: Subject<boolean>;
  companyIcaoFilter: Subject<string>;
  companyItemFilter: Subject<string>;
  companyTierFilter: Subject<number | null>;
}
```

### Type ProfileInventoryItem

```typescript
// types/index.ts

export interface ProfileInventoryItem {
  id: string;
  item_code: string;
  item_name: string;
  tier: number;
  quantity: number;
  unit_price: number;
  total_value: number;
  airport_ident: string;
}
```

---

## Validations Anti-Cheat

### Règle fondamentale

> **Transport inter-aéroport = Vol obligatoire**

- ❌ Transfert direct LFPG → EGLL bloqué
- ✅ Charger avion → Voler → Décharger

### Load Cargo

```typescript
async loadCargo(params: LoadCargoParams): Promise<void> {
  const aircraft = await FleetService.getAircraft(params.aircraft_id);

  // 1. Items doivent être au même aéroport que l'avion
  const inventory = await DatabaseManager.getInventoryAt(
    params.from_inventory,
    aircraft.current_airport_ident
  );

  const item = inventory.find(i => i.item_code === params.item_code);
  if (!item || item.quantity < params.qty) {
    throw new Error("Insufficient stock at aircraft location");
  }

  // 2. Vérifier capacité cargo
  const cargo = await this.getAircraftCargo(params.aircraft_id);
  const itemWeight = await this.getItemWeight(params.item_code);
  if (cargo.current_weight_kg + (params.qty * itemWeight) > cargo.capacity_kg) {
    throw new Error("Cargo capacity exceeded");
  }

  // 3. Transférer
  await DatabaseManager.removeFromInventory(params.from_inventory, params.item_code, params.qty);
  await DatabaseManager.addInventoryItem("aircraft", params.aircraft_id, params.item_code, params.qty);
}
```

---

## Flux de Transport

### Transport entre aéroports

```
[player/airport inventory LFPG] ──load──→ [aircraft inventory] ──vol──→ [player/airport inventory KJFK]
                                     ↑                              ↑
                                même aéroport                  même aéroport
```

---

## Sync P2P

### Données synchronisées

| Donnée | Direction | Stockage |
|--------|-----------|----------|
| Inventaires | Bidirectionnel | IndexedDB |
| Items en vente | Bidirectionnel | IndexedDB |
| Positions avions | Local | IndexedDB |

### NetworkManager

```typescript
// managers/NetworkManager.ts

// Sync inventaire avec les peers
async syncInventory(): Promise<void> {
  const localInventory = await DatabaseManager.getAll("inventory");
  await this.broadcastToPeers({ type: "inventory_sync", data: localInventory });
}
```

---

## Contraintes et Sécurité

### Contraintes

- `quantity` ne peut pas devenir négatif
- Un item/location = agrégation des quantités
- Validation des codes items contre la table `items`

### Isolation

- Mode P2P: données locales uniquement
- Sync manuelle avec les peers connectés

---

## Notes d'implémentation

### Coherent GT (MSFS 2024)

- **Pas de Map()** - Utiliser `Record<string, T>` à la place
- **Keyboard blocking** - `stopPropagation()` + `stopImmediatePropagation()` sur les inputs
- **Subjects MSFS SDK** - État réactif via `Subject.create()` et `.sub()`

### Filtrage côté client

```typescript
// Appliquer les filtres sur profileInventory
const filtered = inventory.filter(item => {
  // Filtre tier
  if (tierFilter !== null && item.tier !== tierFilter) return false;

  // Filtre ICAO
  if (icaoFilter && !item.airport_ident.toLowerCase().includes(icaoFilter.toLowerCase())) return false;

  // Filtre nom item
  if (itemFilter && !item.item_name.toLowerCase().includes(itemFilter.toLowerCase())) return false;

  return true;
});
```

---

## Évolutions futures

- [ ] Capacités de stockage par location
- [ ] Frais de stockage (warehouse rent)
- [ ] Historique des prix du marché
- [ ] Ordres d'achat (buy orders)
- [ ] Chargement/déchargement cargo (UI)
