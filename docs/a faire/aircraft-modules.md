# Système d'Aménagement Avion (Aircraft Configuration)

> Version: 1.0 (Architecture P2P)
> Date: 2026-02-03
> Status: DRAFT - À valider avant implémentation

---

## Résumé

Permet aux joueurs de convertir leurs avions entre configuration **PAX** (passagers) et **CARGO** (fret) en utilisant des kits de conversion réutilisables.

---

## Règles de base

| Aspect | Décision |
|--------|----------|
| Configurations | 2 par avion : PAX (défaut) / CARGO |
| Catégories avions | 4 : Light, Small, Medium, Large |
| Kit | Générique par catégorie, réutilisable |
| Réversibilité | Gratuite si kit présent au même aéroport |
| Lieu conversion | Avion + Kit doivent être au même aéroport |
| Consommation kit | Non consommé, reste dans l'inventaire |
| Obtention kit | Achat Market (cher/rare) OU Craft usine (long) |

---

## Catégories d'avions

| Catégorie | Capacité PAX | Temps conversion |
|-----------|--------------|------------------|
| Light | < 5 places | 15 min |
| Small | 5-12 places | 15 min |
| Medium | 12-50 places | 30 min |
| Large | 50+ places | 1 h |

---

## Items - Kits de conversion

| Item | Code | Tier | Prix Market | Temps Craft | Stock Market |
|------|------|------|-------------|-------------|--------------|
| Conversion Kit Light | `CONV_KIT_LIGHT` | T3 | 50,000 | 4h | Très limité |
| Conversion Kit Small | `CONV_KIT_SMALL` | T3 | 100,000 | 8h | Très limité |
| Conversion Kit Medium | `CONV_KIT_MEDIUM` | T4 | 250,000 | 16h | Très limité |
| Conversion Kit Large | `CONV_KIT_LARGE` | T5 | 500,000 | 32h | Très limité |

---

## Exemples de configurations par avion

### Light (< 5 places)

| Avion | Config PAX | Config CARGO |
|-------|------------|--------------|
| Cirrus SR22 | 3 pax / 50kg | 0 pax / 200kg |
| Diamond DA62 | 4 pax / 80kg | 0 pax / 350kg |
| Cessna 172 | 3 pax / 40kg | 0 pax / 150kg |

### Small (5-12 places)

| Avion | Config PAX | Config CARGO |
|-------|------------|--------------|
| Pilatus PC-12 | 9 pax / 200kg | 0 pax / 1,200kg |
| Cessna 208 Caravan | 9 pax / 150kg | 0 pax / 1,500kg |
| King Air 350 | 11 pax / 300kg | 0 pax / 2,000kg |
| Beech 1900 | 12 pax / 250kg | 0 pax / 2,500kg |

### Medium (12-50 places)

| Avion | Config PAX | Config CARGO |
|-------|------------|--------------|
| ATR 42 | 48 pax / 400kg | 0 pax / 5,500kg |
| ATR 72 | 70 pax / 500kg | 0 pax / 8,000kg |
| Dash 8 Q400 | 78 pax / 600kg | 0 pax / 8,500kg |
| CRJ 700 | 70 pax / 500kg | 0 pax / 7,000kg |

### Large (50+ places)

| Avion | Config PAX | Config CARGO |
|-------|------------|--------------|
| A320 | 180 pax / 2,000kg | 0 pax / 20,000kg |
| B737-800 | 189 pax / 2,500kg | 0 pax / 23,000kg |
| A330 | 300 pax / 5,000kg | 0 pax / 70,000kg |
| B747 | 400 pax / 10,000kg | 0 pax / 120,000kg |

---

## Flow joueur

### Conversion PAX → CARGO

```
PRÉREQUIS:
- Avion en config PAX à l'aéroport X
- Kit de conversion (catégorie correspondante) à l'aéroport X

ÉTAPES:
1. Aller dans Fleet UI → Sélectionner l'avion
2. Section "Configuration" affiche l'état actuel
3. Bouton "Convertir en CARGO" visible (kit détecté)
4. Click → Conversion démarre
5. Timer affiché (15/30/60 min selon catégorie)
6. Avion indisponible pendant la conversion
7. Fin → Avion en config CARGO
8. Le kit reste dans l'inventaire (non consommé)
```

### Conversion CARGO → PAX

```
PRÉREQUIS:
- Avion en config CARGO à l'aéroport X
- Kit de conversion présent à l'aéroport X (même kit)

ÉTAPES:
1. Même flow que ci-dessus
2. Bouton "Revenir en PAX"
3. Même temps de conversion
```

### Cas particuliers

```
SI kit absent:
- Bouton grisé
- Message: "Kit requis: Conversion Kit [catégorie]"
- Indication où trouver le kit le plus proche (optionnel)

SI avion en vol:
- Pas de conversion possible
- Message: "L'avion doit être au sol"

SI conversion en cours:
- Avion non sélectionnable pour mission
- Timer affiché
- Option d'annulation (optionnel)
```

---

## Tables SQLite (Architecture P2P)

### Nouvelles tables

#### `aircraft_categories`

```sql
CREATE TABLE IF NOT EXISTS aircraft_categories (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,               -- 'LIGHT', 'SMALL', 'MEDIUM', 'LARGE'
    name TEXT NOT NULL,                      -- 'Light Aircraft'
    min_pax INTEGER NOT NULL,                -- 0
    max_pax INTEGER NOT NULL,                -- 4, 12, 50, 999
    conversion_kit_item_id TEXT,             -- FK → items
    conversion_time_minutes INTEGER NOT NULL, -- 15, 15, 30, 60
    created_at TEXT DEFAULT (datetime('now'))
);
```

#### `aircraft_types`

```sql
CREATE TABLE IF NOT EXISTS aircraft_types (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,               -- 'PC-12', 'C208', 'ATR72'
    name TEXT NOT NULL,                      -- 'Pilatus PC-12'
    manufacturer TEXT,                       -- 'Pilatus'
    category_id TEXT NOT NULL,               -- FK → aircraft_categories

    -- Config PAX (défaut)
    pax_capacity INTEGER NOT NULL,           -- 9
    pax_cargo_kg REAL NOT NULL,              -- 200

    -- Config CARGO
    cargo_pax_capacity INTEGER DEFAULT 0,    -- 0 (ou 1 si copilote)
    cargo_cargo_kg REAL NOT NULL,            -- 1200

    -- Métadonnées
    icao_code TEXT,                          -- Code ICAO si applicable
    image_url TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);
```

#### Modification `aircraft`

```sql
-- Colonnes ajoutées à la table aircraft
aircraft_type_id TEXT,                       -- FK → aircraft_types
current_config TEXT DEFAULT 'PAX',           -- 'PAX' ou 'CARGO'
conversion_started_at TEXT,
conversion_ends_at TEXT
```

### Services TypeScript (Architecture P2P)

```typescript
// services/AircraftConfigService.ts

class AircraftConfigServiceClass {
  // Liste tous les types d'avions
  async getAircraftTypes(): Promise<AircraftType[]>;

  // Détail d'un type avec configs
  async getAircraftTypeById(id: string): Promise<AircraftType | null>;

  // Liste les catégories
  async getAircraftCategories(): Promise<AircraftCategory[]>;

  // Config actuelle + options disponibles
  async getConfigStatus(aircraftId: string): Promise<AircraftConfigStatus>;

  // Lancer une conversion
  async startConversion(aircraftId: string, targetConfig: string): Promise<ConversionResult>;

  // Temps restant si en cours
  async getConversionStatus(aircraftId: string): Promise<ConversionStatus | null>;

  // Annuler conversion (optionnel)
  async cancelConversion(aircraftId: string): Promise<void>;
}
```

### Types TypeScript

```typescript
interface AircraftConfigStatus {
  aircraft_id: string;
  aircraft_type: string;
  category: string;
  current_config: "PAX" | "CARGO";

  // Capacités actuelles
  current_pax_capacity: number;
  current_cargo_capacity_kg: number;

  // Conversion possible ?
  can_convert: boolean;
  conversion_available: "PAX" | "CARGO" | null;
  kit_required: string | null;
  kit_available_at_location: boolean;
  conversion_time_minutes: number | null;

  // Si conversion en cours
  conversion_in_progress: boolean;
  conversion_ends_at: string | null;
  conversion_remaining_seconds: number | null;
}

interface ConversionResult {
  success: boolean;
  message: string;
  conversion_ends_at: string;
  new_config: string;
}
```

### Logique métier

```typescript
// AircraftConfigService.startConversion()
async startConversion(aircraftId: string, targetConfig: string): Promise<ConversionResult> {
  // 1. Vérifier que l'avion appartient au joueur/company
  const aircraft = await FleetService.getAircraftById(aircraftId);

  // 2. Vérifier que l'avion n'est pas en vol
  if (aircraft.status === 'in_flight') {
    throw new Error("L'avion doit être au sol");
  }

  // 3. Vérifier que la config cible est différente
  if (aircraft.current_config === targetConfig) {
    throw new Error("L'avion est déjà en cette configuration");
  }

  // 4. Vérifier que pas de conversion en cours
  if (aircraft.conversion_ends_at && new Date(aircraft.conversion_ends_at) > new Date()) {
    throw new Error("Conversion déjà en cours");
  }

  // 5. Récupérer le kit requis
  const aircraftType = await this.getAircraftTypeById(aircraft.aircraft_type_id);
  const category = await this.getCategoryById(aircraftType.category_id);
  const kitItemId = category.conversion_kit_item_id;

  // 6. Vérifier que le kit est présent au même aéroport
  const kitPresent = await InventoryService.hasItemAtAirport(
    kitItemId,
    aircraft.current_airport_ident
  );

  if (!kitPresent) {
    throw new Error(`Kit requis non présent à ${aircraft.current_airport_ident}`);
  }

  // 7. Lancer la conversion
  const conversionTimeMs = category.conversion_time_minutes * 60 * 1000;
  const endsAt = new Date(Date.now() + conversionTimeMs).toISOString();

  aircraft.conversion_started_at = new Date().toISOString();
  aircraft.conversion_ends_at = endsAt;
  await DatabaseManager.saveAircraft(aircraft);

  // 8. Scheduler la fin de conversion (LocalScheduler)
  LocalScheduler.scheduleConversionComplete(aircraftId, targetConfig, endsAt);

  return {
    success: true,
    message: `Conversion vers ${targetConfig} lancée`,
    conversion_ends_at: endsAt,
    new_config: targetConfig
  };
}
```

---

## Frontend

### UI Fleet - Section Configuration

```
┌─────────────────────────────────────────────────────────────┐
│ CONFIGURATION                                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Config actuelle: PAX                                       │
│  ├─ Passagers: 9                                            │
│  └─ Cargo: 200 kg                                           │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ CONVERTIR EN CARGO                                    │  │
│  │                                                       │  │
│  │ Nouvelle capacité:                                    │  │
│  │ ├─ Passagers: 0                                       │  │
│  │ └─ Cargo: 1,200 kg                                    │  │
│  │                                                       │  │
│  │ Kit requis: Conversion Kit Small                      │  │
│  │ Status: ✅ Disponible à LFPG                          │  │
│  │ Durée: 15 minutes                                     │  │
│  │                                                       │  │
│  │ [Lancer la conversion]                                │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### UI Fleet - Conversion en cours

```
┌─────────────────────────────────────────────────────────────┐
│ CONFIGURATION                                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ⏳ CONVERSION EN COURS                                     │
│                                                             │
│  PAX → CARGO                                                │
│                                                             │
│  [████████████░░░░░░░░] 62%                                 │
│                                                             │
│  Temps restant: 5:42                                        │
│  Fin prévue: 14:32                                          │
│                                                             │
│  [Annuler la conversion]                                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### UI Fleet - Kit absent

```
┌─────────────────────────────────────────────────────────────┐
│ CONFIGURATION                                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Config actuelle: PAX                                       │
│  ├─ Passagers: 9                                            │
│  └─ Cargo: 200 kg                                           │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ CONVERTIR EN CARGO                                    │  │
│  │                                                       │  │
│  │ Kit requis: Conversion Kit Small                      │  │
│  │ Status: ❌ Non disponible à LFPG                      │  │
│  │                                                       │  │
│  │ Kit le plus proche: LFBO (315 nm)                     │  │
│  │                                                       │  │
│  │ [Lancer la conversion] (grisé)                        │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Seed Data

### Categories

```sql
INSERT INTO aircraft_categories (code, name, min_pax, max_pax, conversion_time_minutes) VALUES
('LIGHT', 'Light Aircraft', 0, 4, 15),
('SMALL', 'Small Aircraft', 5, 12, 15),
('MEDIUM', 'Medium Aircraft', 13, 50, 30),
('LARGE', 'Large Aircraft', 51, 999, 60);
```

### Items (Kits)

```sql
INSERT INTO items (code, name, tier, category, base_price, stackable) VALUES
('CONV_KIT_LIGHT', 'Conversion Kit - Light', 3, 'equipment', 50000, false),
('CONV_KIT_SMALL', 'Conversion Kit - Small', 3, 'equipment', 100000, false),
('CONV_KIT_MEDIUM', 'Conversion Kit - Medium', 4, 'equipment', 250000, false),
('CONV_KIT_LARGE', 'Conversion Kit - Large', 5, 'equipment', 500000, false);
```

### Recettes (Craft)

```sql
INSERT INTO recipes (output_item_id, tier, craft_time_seconds) VALUES
((SELECT id FROM items WHERE code = 'CONV_KIT_LIGHT'), 3, 14400),   -- 4h
((SELECT id FROM items WHERE code = 'CONV_KIT_SMALL'), 3, 28800),   -- 8h
((SELECT id FROM items WHERE code = 'CONV_KIT_MEDIUM'), 4, 57600),  -- 16h
((SELECT id FROM items WHERE code = 'CONV_KIT_LARGE'), 5, 115200);  -- 32h
```

---

## Questions ouvertes (à trancher avant implémentation)

1. **Annulation conversion** : Possible ? Pénalité (temps perdu) ?

2. **Avion en conversion** : Visible dans la liste Fleet avec badge spécial ?

3. **Notification** : Notifier le joueur quand conversion terminée ?

4. **Historique** : Logger les conversions dans `company_transactions` ?

5. **Copilote en CARGO** : 0 pax strict ou 1 pax (copilote) autorisé ?

6. **Recettes craft** : Quels ingrédients pour fabriquer les kits ?

---

## Changelog

| Date | Version | Modification |
|------|---------|--------------|
| 2026-01-30 | 1.0 | Création spec initiale |
