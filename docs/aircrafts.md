# MFS World of Aircraft - Systeme Fleet (Avions)

**Version**: 2.3
**Date**: 2026-01-30
**Statut**: Implemente

---

## Vue d'ensemble

Le systeme Fleet permet aux joueurs de gerer une flotte d'avions cargo pour transporter des marchandises entre aeroports. Il comprend:

- **Catalogue d'avions** - Types d'avions predefinies avec specs et prix
- **Gestion de flotte** - Achat, modification, suppression d'avions
- **Integration cargo** - Chaque avion a un emplacement d'inventaire pour le cargo
- **Statistiques** - Vue d'ensemble de la flotte

---

## Base de donnees SQLite (Architecture P2P)

### Table `aircraft_catalog`

Catalogue des types d'avions disponibles a l'achat.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | TEXT (UUID) | Identifiant unique |
| `name` | TEXT | Nom complet (ex: "Cessna 208 Caravan") |
| `icao_type` | TEXT | Code ICAO (ex: "C208") |
| `manufacturer` | TEXT | Constructeur |
| `category` | TEXT | Categorie (turboprop, jet_small, jet_medium, jet_large, helicopter) |
| `cargo_capacity_kg` | INTEGER | Capacite cargo en kg |
| `cargo_capacity_m3` | REAL | Capacite cargo en m3 (optionnel) |
| `max_range_nm` | INTEGER | Autonomie en NM |
| `cruise_speed_kts` | INTEGER | Vitesse de croisiere en noeuds |
| `base_price` | REAL | Prix d'achat |
| `operating_cost_per_hour` | REAL | Cout operationnel horaire |
| `min_runway_length_m` | INTEGER | Longueur piste minimale |
| `required_license` | TEXT | Licence requise (PPL, CPL, ATPL) |
| `msfs_aircraft_id` | TEXT | ID MSFS (pour integration) |
| `is_active` | INTEGER | Actif dans le catalogue (0/1) |

### Collection `aircraft`

Avions possedes par les companies ou joueurs.

| Champ | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Identifiant unique |
| `registration` | string | Immatriculation unique (F-XXXX, N12345) |
| `name` | string? | Surnom de l'avion (optionnel) |
| `type_code` | string | Code ICAO du type (ex: "C172", "TBM9") |
| `company_id` | string \| null | Company proprietaire (null si personnel) |
| `owner_id` | string \| null | Joueur proprietaire (null si company) |
| `owner_type` | "player" \| "company" | Type de proprietaire |
| `location_icao` | string | Position actuelle (ICAO) |
| `status` | string | Statut: parked, in_flight, maintenance, stored |
| `fuel_gallons` | number | Carburant actuel en gallons |
| `condition` | number | Etat global 0-100 |
| `flight_hours` | number | Heures de vol totales |
| `cycles` | number? | Nombre de vols (optionnel) |
| `cargo_capacity_kg` | number | Capacite cargo en kg |
| `purchase_price` | number? | Prix d'achat |
| `for_sale` | boolean? | En vente ou non |
| `is_active` | boolean? | Actif (soft delete) |
| `created_at` | string | Date creation ISO |
| `updated_at` | string? | Date modification ISO |
| `systems` | object? | Systemes embarques (voir AircraftSystemsInline) |

---

## Catalogue d'avions (Seed)

### Turboprops (Starter)

| Nom | ICAO | Capacite | Prix | Autonomie |
|-----|------|----------|------|-----------|
| Cessna 208 Caravan | C208 | 1,360 kg | $250,000 | 900 NM |
| Pilatus PC-12 | PC12 | 1,200 kg | $450,000 | 1,800 NM |
| Beechcraft King Air 350 | BE35 | 1,800 kg | $700,000 | 1,500 NM |
| DHC-6 Twin Otter | DHC6 | 1,800 kg | $350,000 | 800 NM |
| ATR 72-600F | AT76 | 8,500 kg | $2,500,000 | 900 NM |
| Cessna 408 SkyCourier | C408 | 2,700 kg | $600,000 | 900 NM |

### Jets Petits

| Nom | ICAO | Capacite | Prix | Autonomie |
|-----|------|----------|------|-----------|
| Embraer Phenom 300 | E55P | 800 kg | $1,200,000 | 2,000 NM |
| Cessna Citation CJ4 | C25C | 700 kg | $1,100,000 | 2,000 NM |

### Jets Moyens (Cargo)

| Nom | ICAO | Capacite | Prix | Autonomie |
|-----|------|----------|------|-----------|
| Boeing 737-800BCF | B738 | 23,000 kg | $15,000,000 | 2,500 NM |
| Airbus A320P2F | A320 | 21,000 kg | $14,000,000 | 2,500 NM |

### Gros Porteurs

| Nom | ICAO | Capacite | Prix | Autonomie |
|-----|------|----------|------|-----------|
| Boeing 747-8F | B748 | 137,000 kg | $80,000,000 | 4,500 NM |
| Boeing 777F | B77F | 102,000 kg | $65,000,000 | 5,000 NM |

### Helicopteres

| Nom | ICAO | Capacite | Prix | Autonomie |
|-----|------|----------|------|-----------|
| Airbus H125 | EC30 | 600 kg | $350,000 | 350 NM |
| Sikorsky S-76 | S76 | 1,200 kg | $800,000 | 400 NM |

---

## Services TypeScript (Architecture P2P)

### CatalogService

```typescript
// services/CatalogService.ts

class CatalogServiceClass {
  // Liste le catalogue d'avions
  async getCatalog(filters?: { category?: string; maxPrice?: number }): Promise<AircraftCatalogItem[]>;

  // Details d'un type d'avion
  async getCatalogItem(id: string): Promise<AircraftCatalogItem | null>;
}
```

### FleetService

```typescript
// services/FleetService.ts

class FleetServiceClass {
  // Liste mes avions (personnels + company)
  async getMyAircraft(): Promise<Aircraft[]>;

  // Statistiques de la flotte
  async getFleetStats(): Promise<FleetStats>;

  // Details d'un avion
  async getAircraftById(id: string): Promise<Aircraft | null>;

  // Details avec cargo
  async getAircraftWithCargo(id: string): Promise<AircraftWithCargo>;

  // Acheter un avion
  async purchaseAircraft(params: PurchaseParams): Promise<Aircraft>;

  // Modifier un avion
  async updateAircraft(id: string, params: UpdateParams): Promise<Aircraft>;

  // Supprimer un avion (soft delete)
  async deleteAircraft(id: string): Promise<void>;

  // Mettre a jour la position
  async updateLocation(id: string, icao: string): Promise<void>;
}
```

### InventoryService (Cargo)

```typescript
// services/InventoryService.ts (partie cargo)

class InventoryServiceClass {
  // Voir le cargo d'un avion
  async getAircraftCargo(aircraftId: string): Promise<AircraftCargo>;

  // Charger du cargo
  async loadCargo(params: LoadCargoParams): Promise<void>;

  // Decharger du cargo
  async unloadCargo(params: UnloadCargoParams): Promise<void>;
}

---

## Types TypeScript

### AircraftCatalogItem
```typescript
interface AircraftCatalogItem {
  id: string;
  name: string;
  icao_type: string;
  manufacturer: string;
  category: string;
  cargo_capacity_kg: number;
  cargo_capacity_m3?: number;
  max_range_nm?: number;
  cruise_speed_kts?: number;
  base_price: number;
  operating_cost_per_hour?: number;
  min_runway_length_m?: number;
  required_license?: string;
}
```

### PurchaseParams
```typescript
interface PurchaseParams {
  catalog_id?: string;        // Achat depuis catalogue
  registration: string;       // Immatriculation (obligatoire)
  name?: string;              // Surnom
  aircraft_type?: string;     // Requis si pas de catalog_id
  icao_type?: string;
  cargo_capacity_kg?: number;
  current_airport?: string;   // ICAO
}
```

### Aircraft
```typescript
interface Aircraft {
  id: string;
  registration: string;
  name?: string;                 // Surnom de l'avion (optionnel)
  type_code: string;             // Code ICAO du type (ex: "C172", "TBM9")
  company_id: string | null;     // null si avion personnel
  owner_id: string | null;       // ID joueur si personnel, null si company
  owner_type: "player" | "company";  // Type de proprietaire
  location_icao: string;         // Position actuelle (code ICAO)
  status: "parked" | "in_flight" | "maintenance" | "stored";
  fuel_gallons: number;          // Carburant actuel en gallons
  condition: number;             // Etat global 0-100
  flight_hours: number;          // Heures de vol totales
  cycles?: number;               // Nombre de vols
  cargo_capacity_kg: number;     // Capacite cargo depuis catalogue
  purchase_price?: number;
  for_sale?: boolean;
  sale_price?: number;
  is_active?: boolean;           // Soft delete flag
  created_at: string;
  updated_at?: string;
  systems?: AircraftSystemsInline;  // Systemes embarques
}
```

### FleetStats
```typescript
interface FleetStats {
  total_aircraft: number;
  available_count: number;
  in_flight_count: number;
  maintenance_count: number;
  total_cargo_capacity_kg: number;
  categories: Record<string, number>;  // {"turboprop": 3, "jet_medium": 1}
}

---

## Logique metier

### Achat d'avion (depuis catalogue)

1. Verifier que l'utilisateur a une company
2. Verifier les permissions (`is_founder` ou `can_manage_aircraft`)
3. Verifier l'unicite de l'immatriculation
4. Verifier le solde de la company >= prix
5. Deduire le prix du solde
6. Creer l'avion avec les specs du catalogue
7. Creer l'emplacement d'inventaire pour le cargo

### Ajout manuel (gratuit)

Pour les tests ou l'import d'avions existants:
- Pas de deduction de solde
- `aircraft_type` obligatoire
- Capacite cargo par defaut: 500 kg

### Suppression d'avion

1. Verifier les permissions
2. Verifier que le cargo est vide
3. Soft delete (`is_active = false`)

### Systeme de cargo

Chaque avion a un `InventoryLocation` associe:
- `kind = "aircraft"`
- `aircraft_id` = ID de l'avion
- Position = `current_airport_ident` de l'avion

Contraintes:
- Chargement/dechargement uniquement au meme aeroport
- Validation du poids (ne peut pas depasser `cargo_capacity_kg`)
- Audit trail des operations

---

## Frontend

### Modal Ajouter Avion

Deux onglets:
1. **Catalogue** - Selectionner un avion, entrer immatriculation, acheter
2. **Manuel** - Creer un avion personnalise (gratuit)

### Modal Details Avion

Affiche:
- Immatriculation et type
- Statut (parked, in_flight, etc.)
- Position actuelle
- Capacite et utilisation cargo
- Heures de vol et usure
- Prix d'achat
- Bouton de suppression

### Liste Flotte (Company Tab)

Cartes cliquables avec:
- Icone selon categorie
- Immatriculation
- Type d'avion
- Position
- Capacite
- Statut

---

## Permissions

| Permission | Description |
|------------|-------------|
| `is_founder` | Tous les droits |
| `can_manage_aircraft` | Acheter/vendre des avions |
| `can_use_aircraft` | Charger/decharger cargo, mettre a jour position |

---

## Stockage localStorage (Architecture P2P)

Les donnees sont stockees dans localStorage avec le prefixe `carrier_plus_`.

### Collection `aircraft_catalog`
Catalogue des types d'avions disponibles (charge depuis `data/aircraft.json`).

```typescript
interface AircraftCatalog {
  id: string;                 // Ex: "c172"
  name: string;               // Ex: "Cessna 172 Skyhawk"
  icaoType: string;           // Ex: "C172"
  manufacturer: string;
  category: string;           // light, high_performance, twin, turboprop, etc.
  cargoCapacityKg: number;
  maxRangeNm: number;
  cruiseSpeedKts: number;
  basePrice: number;
  operatingCostPerHour: number;
  minRunwayLengthM: number;
  requiredLicense: string;    // PPL, CPL, ATPL
  msfsAircraftId: string;
}
```

### Collection `aircraft`
Avions possedes par les joueurs ou companies.

```typescript
interface Aircraft {
  id: string;                 // UUID
  registration: string;       // Ex: "F-ABCD"
  name?: string;              // Surnom
  type_code: string;          // Code ICAO (ex: "C172")
  company_id: string | null;
  owner_id: string | null;
  owner_type: "player" | "company";
  location_icao: string;      // Position ICAO
  status: "parked" | "in_flight" | "maintenance" | "stored";
  fuel_gallons: number;
  condition: number;          // 0-100
  flight_hours: number;
  cycles?: number;
  cargo_capacity_kg: number;
  purchase_price?: number;
  for_sale?: boolean;
  is_active?: boolean;
  created_at: string;
  updated_at?: string;
  systems?: AircraftSystemsInline;
}
```

---

## Fichiers TypeScript (Architecture P2P)

### Services
- `services/CatalogService.ts` - Gestion catalogue avions
- `services/FleetService.ts` - Gestion flotte (achat, update, suppression)
- `services/InventoryService.ts` - Gestion cargo avions

### Managers
- `managers/DatabaseManager.ts` - Operations SQLite
- `managers/PersistenceManager.ts` - Sync States ↔ SQLite

### Types
- `types/aircraft.ts` - Types TypeScript pour Aircraft, AircraftCatalogItem, etc.

---

## Hangar Tab EFB (V2.3)

L'onglet **Hangar** dans l'app EFB permet de voir tous les avions accessibles par le pilote.

### Caracteristiques

- **Liste complete**: Affiche les avions personnels ET company
- **Distinction visuelle**: Badge colore selon le type de propriete
  - `PERSO` (vert #10b981) - Avions du joueur
  - `COMPANY` (violet #6366f1) - Avions de la company
- **Details**: Panel avec carburant, cargo, position, systemes

### Service utilise

```typescript
// FleetService.getMyAircraft()
const aircraft = await FleetService.getMyAircraft();
```

Retourne tous les avions que le joueur peut utiliser:
- Avions ou `owner_type = "player"` ET `owner_id = current_player`
- Avions ou `owner_type = "company"` ET company appartient au joueur

### Response

```typescript
// Aircraft[]
[
  {
    id: "uuid",
    registration: "F-ABCD",
    aircraft_type: "Cessna 208 Caravan",
    icao_type: "C208",
    current_airport_ident: "LFPG",
    status: "parked",
    owner_type: "player",
    condition: 0.95,
    hours: 124.5,
    cargo_capacity_kg: 1360
  },
  {
    id: "uuid2",
    registration: "F-COMP",
    aircraft_type: "ATR 72-600F",
    icao_type: "AT76",
    current_airport_ident: "LFBO",
    status: "parked",
    owner_type: "company",
    condition: 0.88,
    hours: 856.2,
    cargo_capacity_kg: 8500
  }
]
```

### Implementation Frontend

Fichier: `tablette ingame/PackageSources/WorldOfAircraft/src/WorldOfAircraft.tsx`

```tsx
// State
private hangarAircraftList = Subject.create<Aircraft[]>([]);
private hangarListRef = FSComponent.createRef<HTMLDivElement>();

// Fetch via service local
private async fetchHangarAircraftList(): Promise<void> {
  const aircraft = await FleetService.getMyAircraft();
  this.hangarAircraftList.set(aircraft);
  this.renderHangarList();
}

// Render (pattern FSComponent)
private renderHangarList(): void {
  const listEl = this.hangarListRef.getOrDefault();
  const aircraft = this.hangarAircraftList.get();

  listEl.innerHTML = aircraft.map(ac => `
    <div class="hangar-aircraft-item" data-aircraft-id="${ac.id}">
      <span>${ac.registration}</span>
      <span style="background: ${ac.owner_type === 'player' ? '#10b981' : '#6366f1'}">
        ${ac.owner_type === 'player' ? 'PERSO' : 'COMPANY'}
      </span>
    </div>
  `).join("");
}
