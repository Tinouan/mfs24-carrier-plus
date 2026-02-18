# SPEC - Systeme Missions V2 (Universal GPS)

> Version: 2.0 (Architecture P2P)
> Date: 2026-02-03
> Compatibilite: Tous GPS MSFS 2024 (Garmin Working Title, GPS standards, etc.)

---

## RESUME

### Principe cle
Le joueur cree son plan de vol dans MSFS (EFB natif, LittleNavMap, SimBrief, etc.), puis AeroCorp Online track la progression **sans dependre des SimVars specifiques** qui ne fonctionnent pas avec certains avioniques (Garmin WT notamment).

### Ce qui a change depuis V1
| Element | V1 (Checkpoints) | V2 (Universal GPS) |
|---------|------------------|---------------------|
| Plan de vol | Backend genere des checkpoints lat/lon | Joueur utilise MSFS, on track par distance |
| Stockage | Table `mission_waypoints` avec coordonnees | Juste origine/destination + distance |
| Validation | Passage dans rayon 5nm de chaque CP | Distance parcourue vs distance totale |
| Affichage | Coordonnees a rentrer manuellement | Barre de progression % |
| Compatibilite | GPS standards uniquement | **Tous les GPS** (Garmin WT inclus) |

---

## SIMVARS DISPONIBLES PAR TYPE DE GPS

### GPS Standards (non-Working Title)
| SimVar | Fonctionne | Utilisation |
|--------|------------|-------------|
| `GPS IS ACTIVE FLIGHT PLAN` | OUI | Verifier plan actif |
| `GPS FLIGHT PLAN WP COUNT` | OUI | Nombre waypoints |
| `GPS FLIGHTPLAN TOTAL DISTANCE` | OUI | Distance totale |
| `GPS WP NEXT ID` | OUI | ID waypoint suivant |
| `GPS WP NEXT LAT/LON` | OUI | Position waypoint suivant |
| `GPS WP DISTANCE` | OUI | Distance au waypoint |

### Garmin Working Title (G1000 NXi, G3000, etc.)
| SimVar | Fonctionne | Valeur retournee |
|--------|------------|------------------|
| `GPS IS ACTIVE FLIGHT PLAN` | OUI | 1 (actif) |
| `GPS FLIGHT PLAN WP COUNT` | NON | 0 |
| `GPS FLIGHTPLAN TOTAL DISTANCE` | NON | 0 |
| `GPS WP NEXT ID` | NON | 0 (pas de string) |
| `GPS WP NEXT LAT/LON` | OUI | Coordonnees valides |
| `GPS WP PREV LAT/LON` | OUI | Coordonnees valides |
| `GPS WP DISTANCE` | OUI | Distance en metres |

### Solution: Tracking Universel
On utilise **uniquement** les SimVars qui fonctionnent sur TOUS les GPS:
- `GPS IS ACTIVE FLIGHT PLAN` - Verifier qu'un plan est actif
- `GPS WP NEXT LAT/LON` - Detecter changement de waypoint
- `GPS WP PREV LAT/LON` - Position precedente
- `GPS WP DISTANCE` - Distance au prochain waypoint
- Position avion (`PLANE LATITUDE/LONGITUDE`) - Calculer distance parcourue

---

## FLOW COMPLET

```
+------------------------------------------------------------------+
|                     1. CREATION DE MISSION                        |
+------------------------------------------------------------------+
|                                                                    |
| ETAPE 1: AVION                                                    |
| -> Detection aeroport actuel (auto via position GPS)              |
| -> Selection avion dans dropdown (flotte a cet aeroport)          |
|                                                                    |
| ETAPE 2: CARGO                                                    |
| -> Charger items depuis inventaire aeroport                       |
| -> [VALIDER LE CARGO]                                             |
| -> Applique poids a l'avion (SimVar PAYLOAD STATION WEIGHT)       |
|                                                                    |
| ETAPE 3: PLAN DE VOL                                              |
| -> Joueur cree son plan dans MSFS / LittleNavMap / SimBrief       |
| -> Joueur entre la destination ICAO manuellement                  |
| -> [VALIDER LE PLAN]                                              |
| -> Backend calcule la distance orthodromique origine->destination |
|                                                                    |
| ETAPE 4: MODIFICATEURS (optionnel)                                |
| -> [ ] Vol de nuit (+30% XP)                                      |
| -> [ ] Sans autopilot (+50% XP)                                   |
| -> [ ] Eco carburant (+20% XP)                                    |
|                                                                    |
| [CREER LA MISSION] (vert si etapes 1-3 OK)                        |
|                                                                    |
+------------------------------------------------------------------+
                              |
                              v
+------------------------------------------------------------------+
|           2. SERVICE - MissionService.createMission()             |
+------------------------------------------------------------------+
|                                                                    |
| Parametres:                                                        |
| {                                                                  |
|   aircraft_id: "uuid",                                            |
|   origin_icao: "LFPG",                                            |
|   destination_icao: "LFBO",                                       |
|   cargo_weight_kg: 850,                                           |
|   modifiers_selected: ["night", "no_autopilot"]                   |
| }                                                                  |
|                                                                    |
| Service local:                                                     |
| -> Calcule distance_nm (haversine)                                |
| -> Calcule cargo_multiplier                                       |
| -> Cree mission avec status = "pending" dans SQLite               |
| -> NE GENERE PAS de waypoints/checkpoints                         |
|                                                                    |
| Resultat:                                                          |
| {                                                                  |
|   id: "uuid",                                                      |
|   origin_icao: "LFPG",                                            |
|   destination_icao: "LFBO",                                       |
|   distance_nm: 315.2,                                             |
|   cargo_weight_kg: 850,                                           |
|   cargo_multiplier: 1.2,                                          |
|   modifiers_selected: ["night", "no_autopilot"],                  |
|   status: "pending",                                              |
|   estimated_xp: 1200                                              |
| }                                                                  |
|                                                                    |
+------------------------------------------------------------------+
                              |
                              v
+------------------------------------------------------------------+
|              3. APERCU MISSION (EFB) - En cours                   |
+------------------------------------------------------------------+
|                                                                    |
| +--------------------------------------------------------------+ |
| | MISSION EN COURS                                              | |
| | LFPG -> LFBO                                      EN COURS    | |
| | Distance: 315 nm | Cargo: 850 kg                              | |
| |                                                                | |
| | PROGRESSION                                                    | |
| | [=================>-----------] 62% (195/315 nm)              | |
| |                                                                | |
| | PHASE DE VOL                                                   | |
| | CROISIERE - Avance rapide disponible                          | |
| |                                                                | |
| | AVANCE RAPIDE                                                  | |
| | [x1] [x2] [x4] [x8]    (si AP actif + croisiere)             | |
| |                                                                | |
| | PROCHAIN WAYPOINT                                              | |
| | Distance: 8.1 km | Position: 44.12N, 1.45E                    | |
| |                                                                | |
| | MODIFICATEURS                                                  | |
| | Nuit: En attente (depart a 21h15)                             | |
| | Sans AP: OK (AP non utilise)                                   | |
| |                                                                | |
| | [Annuler la mission]                                          | |
| +--------------------------------------------------------------+ |
|                                                                    |
+------------------------------------------------------------------+
```

---

## TRACKING EN VOL - METHODE UNIVERSELLE

### Variables de tracking (EFB)

```typescript
// === TRACKING UNIVERSEL ===

// Position de depart (enregistree au demarrage mission)
private startPosition = { lat: 0, lon: 0 };

// Distance totale planifiee (calculee par backend)
private totalDistanceNm: number = 0;

// Tracking position precedente du waypoint suivant
private lastNextWpLat: number = 0;
private lastNextWpLon: number = 0;
private waypointChangeCount: number = 0;

// Tracking temps
private realTimeStartMs: number = 0;
private simTimeStartSeconds: number = 0;

// Tracking vol
private maxGForceRecorded: number = 1.0;
private autopilotEverUsed: boolean = false;
private distanceFlownNm: number = 0;
private lastPositionLat: number = 0;
private lastPositionLon: number = 0;

// Phase de vol
private currentPhase: 'departure' | 'cruise' | 'arrival' = 'departure';
```

### Boucle de tracking (toutes les 2 secondes)

```typescript
function trackingLoop() {
    // === 1. LIRE POSITION ACTUELLE ===
    const currentLat = SimVar.GetSimVarValue("PLANE LATITUDE", "degrees");
    const currentLon = SimVar.GetSimVarValue("PLANE LONGITUDE", "degrees");
    const onGround = SimVar.GetSimVarValue("SIM ON GROUND", "bool");
    const vs = SimVar.GetSimVarValue("VERTICAL SPEED", "feet per minute");

    // === 2. CALCULER DISTANCE PARCOURUE ===
    if (this.lastPositionLat !== 0) {
        const segmentNm = haversineDistance(
            this.lastPositionLat, this.lastPositionLon,
            currentLat, currentLon
        );
        this.distanceFlownNm += segmentNm;
    }
    this.lastPositionLat = currentLat;
    this.lastPositionLon = currentLon;

    // === 3. CALCULER PROGRESSION ===
    // Methode 1: Distance parcourue / distance totale
    const progress = Math.min(this.distanceFlownNm / this.totalDistanceNm, 1.0);

    // Methode 2 (alternative): Distance restante vers destination
    // const distToDestNm = haversineDistance(currentLat, currentLon, destLat, destLon);
    // const progress = 1 - (distToDestNm / this.totalDistanceNm);

    // === 4. DETECTER CHANGEMENT DE WAYPOINT (universel) ===
    const nextWpLat = SimVar.GetSimVarValue("GPS WP NEXT LAT", "degrees");
    const nextWpLon = SimVar.GetSimVarValue("GPS WP NEXT LON", "degrees");

    // Si les coordonnees du prochain WP changent significativement -> on a passe un WP
    if (this.lastNextWpLat !== 0) {
        const wpChange = haversineDistance(
            this.lastNextWpLat, this.lastNextWpLon,
            nextWpLat, nextWpLon
        );
        if (wpChange > 1.0) {  // Plus de 1nm de difference = nouveau waypoint
            this.waypointChangeCount++;
            console.log(`[AeroCorpOnline] Waypoint passed! Count: ${this.waypointChangeCount}`);
        }
    }
    this.lastNextWpLat = nextWpLat;
    this.lastNextWpLon = nextWpLon;

    // === 5. DETECTER PHASE DE VOL ===
    this.currentPhase = this.detectFlightPhase(progress, vs, onGround);

    // === 6. VERIFIER SIM RATE AUTORISE ===
    const apMaster = SimVar.GetSimVarValue("AUTOPILOT MASTER", "bool");
    const simRateAllowed = (this.currentPhase === 'cruise' && apMaster);

    if (apMaster) this.autopilotEverUsed = true;

    // === 7. TRACKER G-FORCE MAX ===
    const gforce = SimVar.GetSimVarValue("G FORCE", "GForce");
    if (gforce > this.maxGForceRecorded) {
        this.maxGForceRecorded = gforce;
    }

    // === 8. VERIFIER FIN DE MISSION ===
    this.checkMissionComplete(currentLat, currentLon, onGround);

    // === 9. METTRE A JOUR UI ===
    this.updateProgressUI(progress, this.currentPhase, simRateAllowed);
}
```

### Detection phase de vol

```typescript
function detectFlightPhase(progress: number, vs: number, onGround: boolean): string {
    // Au sol
    if (onGround) return 'departure';

    // MONTEE: VS > 300 fpm ET debut du vol (< 20%)
    if (vs > 300 && progress < 0.20) {
        return 'departure';
    }

    // DESCENTE: VS < -300 fpm ET fin du vol (> 75%)
    if (vs < -300 && progress > 0.75) {
        return 'arrival';
    }

    // APPROCHE FINALE: tres proche de la fin (> 90%)
    if (progress > 0.90) {
        return 'arrival';
    }

    // Sinon = CROISIERE
    return 'cruise';
}
```

### Regles avance rapide

```
PHASE        | CONDITION                      | SIM RATE
-------------+--------------------------------+------------------
DEPARTURE    | Au sol OU                      | x1 uniquement
             | (VS>300 ET progress<20%)       |
-------------+--------------------------------+------------------
CRUISE       | Progress 20-75%                | x2/x4/x8
             | ET VS stable (-300 a +300)     | (si AP actif)
-------------+--------------------------------+------------------
ARRIVAL      | (VS<-300 ET progress>75%)      | x1 uniquement
             | OU progress>90%                |
-------------+--------------------------------+------------------

SCHEMA:
0%        20%                        75%       90%      100%
|----------|========================|---------|--------|
  MONTEE         CROISIERE           DESCENTE  APPROCHE
  (x1)        (x2/x4/x8 + AP)         (x1)      (x1)
```

---

## DETECTION FIN DE MISSION

```typescript
function checkMissionComplete(lat: number, lon: number, onGround: boolean): boolean {
    const groundSpeed = SimVar.GetSimVarValue("GROUND VELOCITY", "knots");
    const engRunning = SimVar.GetSimVarValue("ENG COMBUSTION:1", "bool");

    // Distance a la destination
    const distToDestNm = haversineDistance(lat, lon, this.destLat, this.destLon);

    // Conditions de fin
    const isOnGround = onGround === true;
    const isStopped = groundSpeed < 5;
    const enginesOff = engRunning === false;
    const nearDestination = distToDestNm < 5;  // 5nm de l'aeroport destination

    if (isOnGround && isStopped && nearDestination) {
        // Bonus si moteurs coupes
        this.enginesOffAtEnd = enginesOff;
        this.completeMission();
        return true;
    }

    return false;
}
```

---

## COMPLETION MISSION - POST /api/missions/{id}/complete

```typescript
// Collecter les donnees de vol
const landingVS = SimVar.GetSimVarValue("PLANE TOUCHDOWN NORMAL VELOCITY", "feet per second") * 60;
const fuelRemaining = SimVar.GetSimVarValue("FUEL TOTAL QUANTITY WEIGHT", "pounds");
const fuelCapacity = SimVar.GetSimVarValue("FUEL TOTAL CAPACITY", "gallons");
const fuelPercent = (fuelRemaining / fuelCapacity) * 100;

// Calculer ratio temps reel
const realTimeMs = Date.now() - this.realTimeStartMs;
const simTimeSeconds = SimVar.GetSimVarValue("SIMULATION TIME", "seconds") - this.simTimeStartSeconds;
const realTimeRatio = (realTimeMs / 1000) / simTimeSeconds * 100;

// Request body
const completionData = {
    distance_flown_nm: this.distanceFlownNm,
    waypoints_passed: this.waypointChangeCount,
    real_time_seconds: Math.floor(realTimeMs / 1000),
    sim_time_seconds: Math.floor(simTimeSeconds),
    real_time_ratio: realTimeRatio,
    landing_vs_fpm: landingVS,
    max_gforce: this.maxGForceRecorded,
    fuel_remaining_percent: fuelPercent,
    autopilot_used: this.autopilotEverUsed,
    final_position: {
        latitude: currentLat,
        longitude: currentLon,
        icao: this.detectNearestAirport()
    }
};
```

---

## CALCUL SCORES (Backend)

### Score Atterrissage (40 pts max)

| VS (fpm) | Points |
|----------|--------|
| > 0 (rebond) | 0 |
| -60 a 0 | 40 (butter) |
| -120 a -60 | 37 |
| -180 a -120 | 33 |
| -240 a -180 | 28 |
| -300 a -240 | 22 |
| -400 a -300 | 15 |
| -500 a -400 | 8 |
| -700 a -500 | 3 |
| < -700 | 0 (hard) |

### Score G-Force (20 pts max)

| G-Force Max | Points |
|-------------|--------|
| <= 1.3 | 20 |
| <= 1.5 | 18 |
| <= 1.8 | 15 |
| <= 2.0 | 12 |
| <= 2.5 | 8 |
| <= 3.0 | 4 |
| > 3.0 | 0 |

### Score Destination (20 pts max)

| Situation | Points |
|-----------|--------|
| Destination prevue atteinte | 20 |
| Deroutement ATC | 20 |
| Deroutement urgence | 18 |
| Deroutement meteo | 16 |
| Deroutement choix joueur | 12 |
| Mauvais aeroport (urgence) | 10 |
| Mauvais aeroport (erreur) | 0 |

### Score Carburant (10 pts max)

| Fuel Restant | Points |
|--------------|--------|
| >= 25% | 10 |
| >= 20% | 8 |
| >= 15% | 6 |
| >= 10% | 4 |
| >= 5% | 2 |
| < 5% | 0 |

### Score Distance (10 pts max)
Nouveau score base sur la distance reellement parcourue vs planifiee.

| Ratio distance | Points |
|----------------|--------|
| 95-105% | 10 (optimal) |
| 90-110% | 8 |
| 85-115% | 6 |
| 80-120% | 4 |
| < 80% ou > 120% | 2 |

### Grade

| Score Total | Grade | Multiplicateur XP |
|-------------|-------|-------------------|
| >= 95 | S | x2.0 |
| >= 85 | A | x1.5 |
| >= 75 | B | x1.2 |
| >= 65 | C | x1.0 |
| >= 50 | D | x0.7 |
| >= 35 | E | x0.5 |
| < 35 | F | x0.2 |

### Formule XP

```
base_xp = distance_nm * 2

cargo_multiplier:
  0 kg      -> 1.0
  1-500 kg  -> 1.1
  501-1000  -> 1.2
  1001-2000 -> 1.3
  2001-5000 -> 1.5
  > 5000    -> 1.8

modifiers_bonus (additifs):
  night         -> +0.30
  no_autopilot  -> +0.50
  fuel_saver    -> +0.20

realtime_bonus (base sur ratio temps reel/sim):
  100%    -> +1.00
  90-99%  -> +0.70
  75-89%  -> +0.50
  50-74%  -> +0.30
  25-49%  -> +0.15
  < 25%   -> +0.00

XP_FINAL = base_xp * cargo_mult * (modifiers_bonus + realtime_bonus) * grade_mult

Exemple:
  315nm, 850kg cargo, nuit valide, ratio 87%, grade A
  base = 315 * 2 = 630
  cargo = 630 * 1.2 = 756
  modifiers = 756 * (1.0 + 0.30) = 983
  realtime = 983 * (1 + 0.50) = 1474
  grade = 1474 * 1.5 = 2211 XP
```

---

## ECRAN RECAP (EFB)

```
+--------------------------------------------------------------+
|                  MISSION TERMINEE                             |
|                     GRADE A                                   |
|                                                               |
| LFPG -> LFBO | 315 nm | 1h 45min                            |
+---------------------------------------------------------------+
| SCORES                                              /100      |
| Atterrissage    -95 fpm                       37/40          |
| G-Force         1.4 max                       18/20          |
| Destination     Atteinte                      20/20          |
| Distance        312/315 nm (99%)              10/10          |
| Carburant       22% restant                    8/10          |
| -----------------------------------------------------------  |
|                               TOTAL:          93/100 (A)     |
+---------------------------------------------------------------+
| CALCUL XP                                                    |
| Base: 630 XP (315nm x 2)                                    |
| Cargo (850kg): x1.2                                         |
| Modificateurs:                                               |
|   Vol de nuit: +30%                                         |
|   Sans AP: non valide (AP utilise)                          |
| Temps reel (87%): +50%                                      |
| Grade A: x1.5                                               |
| -----------------------------------------------------------  |
|                              TOTAL: 1,474 XP                 |
+---------------------------------------------------------------+
|                                                               |
|                    [Nouvelle mission]                        |
|                                                               |
+---------------------------------------------------------------+
```

---

## FONCTIONS UTILITAIRES

### Calcul distance Haversine

```typescript
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3440.065;  // Rayon Terre en nm
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function toRad(deg: number): number {
    return deg * Math.PI / 180;
}
```

### Detection aeroport le plus proche

```typescript
// WorldService.findClosestAirport()
function findClosestAirport(lat: number, lon: number): string | null {
    // Recherche dans SQLite local (base aeroports)
    const airports = DatabaseManager.query(
        `SELECT ident FROM airports
         WHERE type != 'closed'
         ORDER BY ((latitude_deg - ?) * (latitude_deg - ?) +
                   (longitude_deg - ?) * (longitude_deg - ?))
         LIMIT 1`,
        [lat, lat, lon, lon]
    );
    return airports[0]?.ident ?? null;
}
```

---

## TABLE SQLITE (Architecture P2P)

### Table `missions` - Simplifiee

```sql
CREATE TABLE IF NOT EXISTS missions (
    id TEXT PRIMARY KEY,

    -- Relations
    player_id TEXT NOT NULL,
    company_id TEXT,
    aircraft_id TEXT,

    -- Aeroports
    origin_icao TEXT NOT NULL,
    destination_icao TEXT NOT NULL,
    actual_arrival_icao TEXT,

    -- Distances
    planned_distance_nm REAL NOT NULL,
    actual_distance_nm REAL,

    -- Status
    status TEXT DEFAULT 'pending',

    -- Cargo
    cargo_weight_kg REAL DEFAULT 0,
    cargo_multiplier REAL DEFAULT 1.0,

    -- Modificateurs
    modifiers_selected TEXT DEFAULT '[]',  -- JSON array
    modifiers_validated TEXT DEFAULT '[]', -- JSON array

    -- Timestamps
    created_at TEXT DEFAULT (datetime('now')),
    started_at TEXT,
    completed_at TEXT,

    -- Donnees de vol (remplies a la completion)
    real_time_seconds INTEGER,
    sim_time_seconds INTEGER,
    real_time_ratio REAL,
    landing_vs_fpm REAL,
    max_gforce REAL,
    fuel_remaining_percent REAL,
    autopilot_used INTEGER DEFAULT 0,
    waypoints_passed INTEGER DEFAULT 0,

    -- Scores
    score_landing INTEGER,
    score_gforce INTEGER,
    score_destination INTEGER,
    score_distance INTEGER,
    score_fuel INTEGER,
    score_total INTEGER,
    grade TEXT,

    -- XP
    xp_earned INTEGER DEFAULT 0,
    xp_breakdown TEXT,  -- JSON object

    updated_at TEXT DEFAULT (datetime('now'))
);
```

### Service MissionService.createMission()

```typescript
// services/MissionService.ts
async createMission(data: MissionCreateParams): Promise<Mission> {
    const player = await DatabaseManager.getPlayer();

    // Calculer distance orthodromique
    const origin = await WorldService.getAirportByIcao(data.origin_icao);
    const destination = await WorldService.getAirportByIcao(data.destination_icao);
    const distanceNm = haversineDistance(
        origin.latitude_deg, origin.longitude_deg,
        destination.latitude_deg, destination.longitude_deg
    );

    // Calculer multiplicateur cargo
    const cargoMult = this.getCargoMultiplier(data.cargo_weight_kg);

    // Creer la mission
    const mission: Mission = {
        id: generateUUID(),
        player_id: player.id,
        company_id: player.company_id,
        aircraft_id: data.aircraft_id,
        origin_icao: data.origin_icao,
        destination_icao: data.destination_icao,
        planned_distance_nm: distanceNm,
        cargo_weight_kg: data.cargo_weight_kg,
        cargo_multiplier: cargoMult,
        modifiers_selected: JSON.stringify(data.modifiers_selected),
        status: "pending",
        created_at: new Date().toISOString()
    };

    await DatabaseManager.put("missions", mission);

    return {
        ...mission,
        estimated_xp: this.calculateEstimatedXp(mission)
    };
}
```

### Service WorldService.findClosestAirport()

```typescript
// services/WorldService.ts
findClosestAirport(lat: number, lon: number): Airport | null {
    // Requete pour trouver l'aeroport le plus proche
    const result = DatabaseManager.query(
        `SELECT * FROM airports
         WHERE type != 'closed'
         ORDER BY ((latitude_deg - ?) * (latitude_deg - ?) +
                   (longitude_deg - ?) * (longitude_deg - ?))
         LIMIT 1`,
        [lat, lat, lon, lon]
    );
    return result[0] ?? null;
}
```

---

## VARIABLES EFB - RESUME

```typescript
// === CREATION MISSION ===
currentAirportIcao: Subject<string>;
selectedAircraftId: Subject<string | null>;
cargoItems: Subject<CargoItem[]>;
cargoTotalWeight: Subject<number>;
cargoValidated: Subject<boolean>;
destinationIcao: Subject<string>;
flightPlanValidated: Subject<boolean>;
modifierNight: Subject<boolean>;
modifierNoAutopilot: Subject<boolean>;
modifierFuelSaver: Subject<boolean>;
canCreateMission: Subject<boolean>;

// === MISSION EN COURS ===
activeMission: Subject<Mission | null>;
missionProgress: Subject<number>;           // 0.0 - 1.0
currentFlightPhase: Subject<'departure' | 'cruise' | 'arrival'>;
simRateAllowed: Subject<boolean>;
distanceFlownNm: Subject<number>;
distanceRemainingNm: Subject<number>;
waypointsPassed: Subject<number>;

// === TRACKING INTERNE ===
private startPosition: { lat: number, lon: number };
private lastPosition: { lat: number, lon: number };
private lastNextWpPosition: { lat: number, lon: number };
private realTimeStartMs: number;
private simTimeStartSeconds: number;
private maxGForceRecorded: number;
private autopilotEverUsed: boolean;
```

---

## FICHIERS TypeScript (Architecture P2P)

### Services
- `services/MissionService.ts` - Creation, tracking, completion
- `services/ScoringService.ts` - Calcul scores et XP
- `services/WorldService.ts` - Recherche aeroports

### Managers
- `managers/DatabaseManager.ts` - Operations SQLite missions
- `managers/LocalScheduler.ts` - Timeout missions

### EFB (AeroCorpOnline.tsx)
- Tracking universel (sans dependance WP COUNT/ID)
- Detection phase par distance
- UI progression
- Completion mission

---

## RESUME

| Aspect | Implementation |
|--------|---------------|
| **Plan de vol** | Joueur utilise MSFS, entre destination ICAO |
| **Distance** | Calculee par backend (orthodromique) |
| **Progression** | Distance parcourue / distance totale |
| **Waypoints** | Detectes par changement GPS WP NEXT LAT/LON |
| **Phases** | Basees sur progression % + vertical speed |
| **Compatibilite** | **Tous GPS** (Garmin WT, standards, etc.) |
| **Scoring** | 5 categories, grade S-F, XP calcule |
