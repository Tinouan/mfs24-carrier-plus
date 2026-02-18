# AeroCorp Online - Systeme Usure, Reparation & Carburant

**Version**: 1.6
**Date**: 2026-02-01
**Statut**: Implemente (Backend + EFB)
**Document pour**: Claude Code (VS Code)

---

## Vue d'ensemble

Systeme de degradation, maintenance et persistance carburant des avions:
- Les heures de vol (usure progressive)
- La qualite du pilotage (atterrissages, G-force, overspeed)
- La surcharge cargo
- **V1.2**: Persistance carburant par avion (anti-triche)
- **V1.5**: Valeurs d'usure doublees (x2) + Sync condition legacy
- **V1.6**: Anti-triche vol sans mission (background tracking)

Les joueurs doivent surveiller l'etat de leurs avions et payer pour les reparations.

---

## Historique des versions

| Version | Date | Changements |
|---------|------|-------------|
| V1.1 | 2026-01-28 | Systeme initial usure & reparation |
| V1.2 | 2026-01-30 | Persistance carburant par avion |
| V1.5 | 2026-02-01 | x2 sur toutes les valeurs d'usure, sync condition legacy |
| V1.6 | 2026-02-01 | Background tracking anti-triche (vol sans mission) |

---

## Statut d'implementation

| Fonctionnalite | Backend | EFB | Notes |
|----------------|---------|-----|-------|
| Tables BDD systemes | OK | - | `aircraft_systems`, logs |
| Endpoints API systemes | OK | - | GET/POST repair, systems |
| Affichage systemes Hangar | - | OK | 6 systemes avec jauges |
| Popup reparation | - | OK | Selection + paiement |
| Usure en vol (mission) | OK | - | Via completeMission |
| Blocage decollage | OK | - | Systemes critiques < 10% |
| **V1.2 Fuel persistence** | OK | OK | Auto-sync + manuel |
| **V1.5 Sync condition legacy** | OK | - | CompanyAircraft.condition sync |
| **V1.6 Background wear** | OK | OK | Vol sans mission |
| **V1.6 Background fuel sync** | - | OK | Sync auto toutes les 2min |

---

## 2. Constantes et configuration (V1.5 x2)

Fichier: `services/WearService.ts` (constantes locales)

### 2.1 Usure par heure de vol (x2 depuis V1.5)

```typescript
const WEAR_PER_HOUR: Record<string, number> = {
  engine: 4.0,           // 25h duree de vie (100/4)
  landing_gear: 1.0,     // 100h
  propeller: 2.0,        // 50h
  electrical: 0.6,       // 166h
  pitot: 0.2,            // 500h
  avionics: 1.0,         // 100h
};
```

### 2.2 Usure atterrissage (x2 depuis V1.5)

```typescript
const LANDING_WEAR = [
  // [min_vs, max_vs, {system: wear%}]
  [0, 200, { landing_gear: 2.0 }],                                              // Normal
  [200, 400, { landing_gear: 6.0 }],                                            // Ferme
  [400, 700, { landing_gear: 20.0, propeller: 10.0 }],                          // Dur
  [700, 1000, { landing_gear: 50.0, propeller: 30.0, engine: 20.0 }],           // Tres dur
  [1000, 9999, { landing_gear: 80.0, propeller: 50.0, engine: 40.0 }],          // Crash landing
];
```

### 2.3 Usure G-Force (x2 depuis V1.5)

```typescript
const GFORCE_WEAR = [
  // [threshold, {system: wear%}]
  [4.0, { engine: 20.0, avionics: 16.0, propeller: 12.0, electrical: 10.0, landing_gear: 10.0, pitot: 6.0 }],
  [3.0, { engine: 10.0, avionics: 8.0, propeller: 6.0 }],
  [2.5, { engine: 6.0, avionics: 4.0 }],
];
```

### 2.4 Usure Overspeed (x2 depuis V1.5)

```typescript
const OVERSPEED_WEAR = { engine: 10.0, propeller: 10.0 };
```

### 2.5 Usure Surcharge (x2 depuis V1.5)

```typescript
const OVERWEIGHT_WEAR_MULTIPLIER: Record<string, number> = {
  landing_gear: 0.10,  // +10% usure par % de surcharge
  engine: 0.04,        // +4% usure par % de surcharge
};
```

### 2.6 Autres constantes (inchangees)

```typescript
const FAILURE_PROBABILITY_PER_HOUR = [
  [50, 101, 0.0],      // Safe (100 inclus)
  [25, 50, 0.02],      // 2% par heure
  [10, 25, 0.10],      // 10% par heure
  [1, 10, 0.25],       // 25% par heure
  [0, 1, 1.0],         // Panne garantie
];

const CRITICAL_SYSTEMS = ["engine", "landing_gear"];
const CRITICAL_THRESHOLD = 10.0;  // %
const WARNING_THRESHOLD = 50.0;   // Afficher warning si condition < 50%

const REPAIR_COST_RATE: Record<string, number> = {
  engine: 0.0015,      // 0.15% du prix de l'avion par % repare
  landing_gear: 0.0010,
  propeller: 0.0008,
  electrical: 0.0005,
  pitot: 0.0002,
  avionics: 0.0012,
};

const ALL_SYSTEMS = ["engine", "landing_gear", "propeller", "electrical", "pitot", "avionics"];

const SYSTEM_NAMES_FR: Record<string, string> = {
  engine: "Moteur",
  landing_gear: "Train",
  propeller: "Helice",
  electrical: "Electrique",
  pitot: "Pitot",
  avionics: "Avionique",
};
```

---

## 3. V1.5 - Sync Condition Legacy

### 3.1 Probleme resolu

Deux sources de donnees existaient:
- `CompanyAircraft.condition` (legacy, 0.0-1.0)
- `AircraftSystems` table (nouveau, 0-100% par systeme)

L'EFB affichait l'ancien champ `condition` qui n'etait jamais mis a jour.

### 3.2 Solution

Dans `WearService.ts`, apres application de l'usure ET apres reparation:

```typescript
// V1.5: Sync aircraft.condition with average of systems (legacy field)
const aircraft = await DatabaseManager.getAircraftById(aircraftId);
if (aircraft) {
  const values = Object.values(newConditions);
  const overallCondition = values.reduce((a, b) => a + b, 0) / values.length / 100.0;
  aircraft.condition = Math.round(overallCondition * 1000) / 1000;
  aircraft.hours += flightData.flight_hours;
  await DatabaseManager.saveAircraft(aircraft);
}
```

Le champ `condition` est maintenant la moyenne des 6 systemes, convertie en echelle 0-1.

---

## 4. V1.6 - Background Tracking Anti-Triche

### 4.1 Probleme resolu

Un joueur pouvait:
1. Voler sans lancer de mission
2. Consommer du carburant (non synchronise)
3. User son avion (usure non appliquee)
4. Atterrir sans aucune consequence

### 4.2 Solution: Background Flight Tracker

Un tracker tourne en arriere-plan dans l'EFB (toutes les 30 secondes):

**Variables trackees:**
```typescript
private bgTrackerInterval: number | null = null;
private bgFlightStartTime: Date | null = null;
private bgFlightMinutes = 0;
private bgMaxGForce = 1.0;
private bgLandingFpm = 0;
private bgHadOverspeed = false;
private bgLastFuelGallons = 0;
private bgWasFlying = false;
private bgLastSyncTime = 0;
private bgCurrentAircraftId: string | null = null;
```

### 4.3 Fonctionnement

```
EFB onOpen()
    |
    v
startBackgroundTracking() -- toutes les 30 sec
    |
    v
backgroundTrackerTick()
    |
    +-- Si mission active? --> RETURN (mission tracker gere)
    |
    +-- Lecture SimVars: engine, altitude, fuel, gforce, IAS
    |
    +-- Detection decollage (engine ON + !onGround)
    |       --> bgWasFlying = true, start timer
    |
    +-- Accumulation temps vol (+0.5 min / tick)
    |
    +-- Track max G-force, overspeed
    |
    +-- Detection atterrissage (bgWasFlying + onGround)
    |       --> Capture landing FPM
    |       --> applyBackgroundWear()
    |
    +-- Sync fuel to DB (si diminue > 0.5 gal ET > 2min depuis dernier sync)
```

### 4.4 Service Local

**FleetService.applyBackgroundWear()**

```typescript
// Appel depuis l'EFB
const result = await FleetService.applyBackgroundWear(aircraftId, {
  flight_minutes: 15.5,
  landing_fpm: 180,
  max_gforce: 1.8,
  had_overspeed: false,
  landing_icao: "LFPG"
});

// Resultat
{
  success: true,
  flight_minutes: 15.5,
  landing_fpm: 180,
  max_gforce: 1.8,
  wear_applied: { engine: 1.03, landing_gear: 2.26, ... },
  new_conditions: { engine: 98.97, landing_gear: 97.74, ... },
  failures_triggered: []
}
```

### 4.5 Prevention des doublons d'usure

**Probleme potentiel:** Vol sans mission -> creation mission en vol -> mission complete = double usure

**Solution:** `resetBackgroundTracking()` est appele:

| Action | Reset? |
|--------|--------|
| Creation mission | Oui |
| Annulation mission | Oui |
| Completion mission | Oui |
| Completion mission V1 | Oui |

```typescript
// V1.6: Reset background tracking to prevent duplicate wear
this.resetBackgroundTracking();
```

### 4.6 Sync Fuel DB vers Sim (et vice-versa)

**DB -> Sim** (quand on charge un avion):
```typescript
private setSimulatorFuel(targetGallons: number, capacityGallons: number): void {
    // Set tous les reservoirs au meme niveau
    for (const tank of fuelTanks) {
        SimVar.SetSimVarValue(tank, "percent over 100", targetLevel);
    }

    // V1.6: Update background tracker baseline
    this.bgLastFuelGallons = targetGallons;
}
```

**Sim -> DB** (pendant le vol sans mission):
```typescript
// Sync fuel to DB if it decreased (every 2 minutes minimum)
if (fuelGallons < this.bgLastFuelGallons - 0.5 && timeSinceLastSync > 120000) {
    await this.syncBackgroundFuelToDb(fuelGallons);
    this.bgLastFuelGallons = fuelGallons;
    this.bgLastSyncTime = now;
}
```

### 4.7 Protection contre les interferences

Quand on fait un DB->Sim sync (chargement avion, ravitaillement), on met aussi a jour `bgLastFuelGallons`:

```typescript
// V1.6: Update background tracker baseline to prevent false "fuel decreased" detection
this.bgLastFuelGallons = targetGallons;
```

Cela evite que le tracker ne pense a tort que le fuel a diminue.

---

## 5. Flux complet Usure & Carburant

### 5.1 Vol AVEC mission

```
Creation mission
    |
    +-- resetBackgroundTracking() (efface donnees pré-vol)
    |
    +-- startFlightTrackingV1() (mission tracker)
    |
    v
Vol en cours (mission tracker actif)
    |
    +-- backgroundTrackerTick() return early (mission active)
    |
    v
Atterrissage + completion mission
    |
    +-- Backend: apply_flight_wear() (usure UNIQUE)
    |
    +-- Backend: sync fuel to DB
    |
    +-- resetBackgroundTracking()
```

### 5.2 Vol SANS mission

```
Vol detecte (engine + !onGround)
    |
    +-- bgWasFlying = true
    |
    +-- Accumulation: bgFlightMinutes, bgMaxGForce, bgHadOverspeed
    |
    +-- Sync fuel toutes les 2 min si diminue
    |
    v
Atterrissage detecte
    |
    +-- Capture bgLandingFpm
    |
    +-- applyBackgroundWear() --> POST /background-wear
    |
    +-- Backend: apply_flight_wear() (usure UNIQUE)
    |
    +-- resetBackgroundTracking()
```

### 5.3 Ravitaillement EFB

```
Joueur ajuste slider fuel
    |
    v
executeRefuel() ou refuelAircraft()
    |
    +-- PATCH /api/fleet/{id}/fuel (sync vers DB)
    |
    +-- setSimulatorFuel() (injection dans sim)
    |       +-- bgLastFuelGallons = targetGallons (update baseline)
    |
    v
Tracker ne detectera pas de "diminution"
```

---

## 6. Tables SQLite (Architecture P2P)

### 6.1 Table `aircraft_systems`

```sql
CREATE TABLE IF NOT EXISTS aircraft_systems (
    id TEXT PRIMARY KEY,
    aircraft_id TEXT NOT NULL,

    -- Condition des systemes (0-100%)
    engine_condition REAL DEFAULT 100.0,
    landing_gear_condition REAL DEFAULT 100.0,
    propeller_condition REAL DEFAULT 100.0,
    electrical_condition REAL DEFAULT 100.0,
    pitot_condition REAL DEFAULT 100.0,
    avionics_condition REAL DEFAULT 100.0,

    -- Heures depuis derniere maintenance (par systeme)
    engine_hours_since_maintenance REAL DEFAULT 0,
    landing_gear_hours_since_maintenance REAL DEFAULT 0,
    propeller_hours_since_maintenance REAL DEFAULT 0,
    electrical_hours_since_maintenance REAL DEFAULT 0,
    pitot_hours_since_maintenance REAL DEFAULT 0,
    avionics_hours_since_maintenance REAL DEFAULT 0,

    -- Pannes actives (1 = en panne)
    engine_failed INTEGER DEFAULT 0,
    landing_gear_failed INTEGER DEFAULT 0,
    propeller_failed INTEGER DEFAULT 0,
    electrical_failed INTEGER DEFAULT 0,
    pitot_failed INTEGER DEFAULT 0,
    avionics_failed INTEGER DEFAULT 0,

    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (aircraft_id) REFERENCES aircraft(id) ON DELETE CASCADE,
    UNIQUE(aircraft_id)
);
```

### 6.2 Table `aircraft` (colonnes fuel V1.2)

```sql
-- V1.2: Fuel persistence (dans la table aircraft)
fuel_gallons REAL DEFAULT 0,
fuel_capacity_gallons REAL DEFAULT 50
```

---

## 7. Services TypeScript (Architecture P2P)

```typescript
// FleetService - Methodes usure & reparation
class FleetServiceClass {
  // Etat des 6 systemes
  async getAircraftSystems(aircraftId: string): Promise<AircraftSystems>;

  // Devis reparation
  async getRepairQuote(aircraftId: string, systems?: string[]): Promise<RepairQuote>;

  // Effectuer reparation
  async repairAircraft(aircraftId: string, systems: string[]): Promise<RepairResult>;

  // Sync carburant (V1.2)
  async updateFuel(aircraftId: string, fuelGallons: number): Promise<void>;

  // Usure vol sans mission (V1.6)
  async applyBackgroundWear(aircraftId: string, data: BackgroundWearData): Promise<WearResult>;

  // Verification decollage
  async canTakeoff(aircraftId: string): Promise<TakeoffCheck>;
}

---

## 8. Resume des versions

### V1.5 (Usure x2 + Sync condition)

| Element | Changement |
|---------|------------|
| WEAR_PER_HOUR | x2 (engine: 2.0 -> 4.0, etc.) |
| LANDING_WEAR | x2 (normal: 1.0 -> 2.0, etc.) |
| GFORCE_WEAR | x2 (4G engine: 10.0 -> 20.0, etc.) |
| OVERSPEED_WEAR | x2 (engine: 5.0 -> 10.0) |
| OVERWEIGHT_WEAR_MULTIPLIER | x2 (landing_gear: 0.05 -> 0.10) |
| CompanyAircraft.condition | Sync avec moyenne des systemes |
| CompanyAircraft.hours | Incremente apres chaque vol |

### V1.6 (Anti-triche background tracking)

| Element | Description |
|---------|-------------|
| Background tracker | Loop 30 sec dans EFB |
| POST /background-wear | Endpoint pour usure sans mission |
| resetBackgroundTracking() | Appele a create/cancel/complete mission |
| bgLastFuelGallons | Mis a jour lors de setSimulatorFuel() |
| Fuel sync auto | Toutes les 2 min si fuel diminue |

---

## 9. Tests recommandes

### Tests V1.5

1. **Test usure x2**: Vol 1h, verifier engine -4%, propeller -2%
2. **Test sync condition**: Apres usure, verifier CompanyAircraft.condition = moyenne

### Tests V1.6

1. **Test vol sans mission**: Decoller, voler 5 min, atterrir -> usure appliquee
2. **Test fuel sync**: Voler sans mission, verifier fuel synce toutes les 2 min
3. **Test pas de doublon**: Voler sans mission -> creer mission en vol -> completer -> UNE seule usure
4. **Test refuel + tracker**: Ravitailler, verifier bgLastFuelGallons mis a jour

---

## 10. Fichiers modifies (V1.5 + V1.6)

### Services TypeScript

| Fichier | Modifications |
|---------|---------------|
| `services/WearService.ts` | Constantes x2, calcul usure |
| `services/FleetService.ts` | applyBackgroundWear(), sync condition legacy |
| `managers/DatabaseManager.ts` | Operations SQLite aircraft_systems |

### Frontend EFB

| Fichier | Modifications |
|---------|---------------|
| `AeroCorpOnline.tsx` | Background tracker variables |
| `AeroCorpOnline.tsx` | startBackgroundTracking(), stopBackgroundTracking() |
| `AeroCorpOnline.tsx` | backgroundTrackerTick() |
| `AeroCorpOnline.tsx` | applyBackgroundWear() |
| `AeroCorpOnline.tsx` | syncBackgroundFuelToDb() |
| `AeroCorpOnline.tsx` | resetBackgroundTracking() appele dans create/cancel/complete |
| `AeroCorpOnline.tsx` | setSimulatorFuel() met a jour bgLastFuelGallons |
