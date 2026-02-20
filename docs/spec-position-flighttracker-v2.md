# SPEC — Extraction PositionService + FlightTracker (V2)

**Version**: 2.0
**Date**: 2026-02-19
**Statut**: A implémenter
**Document pour**: Claude Code (VS Code)
**Remplace**: spec-position-flighttracker.md V1

---

## Principe fondamental — Position

```
BDD = SEULE source de vérité pour la position du pilote/avion.
SimVar = CONFIRMATION que le joueur est au bon endroit.
```

**La position en BDD ne change que dans 3 cas :**

| Événement | Écriture BDD |
|-----------|-------------|
| 1ère connexion (création pilote) | Aéroport choisi par le joueur |
| Atterrissage réussi (mission ou free flight) | Aéroport d'atterrissage |
| Transfert pilote payant | Aéroport de destination |

**Jamais rien d'autre ne modifie la position en BDD.** Pas de sync périodique, pas de fallback lat/lon, pas de mise à jour au sol automatique.

**Règle de connexion** : Si le SimVar `GPS CLOSEST AIRPORT ID` ne correspond pas à la position BDD → **aucun vol possible** (ni mission, ni free flight). Le joueur doit se repositionner dans MSFS à l'aéroport de sa BDD, ou payer un transfert.

---

## Architecture cible

```
AeroCorpOnline.tsx (~orchestrateur)
  │
  ├── services/
  │   ├── PositionService.ts     ← NOUVEAU : logique position stricte
  │   └── FlightTracker.ts       ← NOUVEAU : tracking unifié hors-mission
  │
  ├── managers/
  │   ├── TrackingManager.ts     ← EXISTE : garde UNIQUEMENT tracking mission (2 sec)
  │   └── FreeFlightManager.ts   ← A SUPPRIMER : absorbé par FlightTracker
  │
  ├── controllers/
  │   ├── HangarController.ts    ← setSimulatorFuel() reste ici
  │   └── MissionController.ts   ← completeMissionV1() reste ici
  │
  └── state/
      └── positionState.ts       ← NOUVEAU : état réactif position
```

---

## 1. PositionService.ts

### Rôle

Répondre à 2 questions :
- **Où est le pilote selon la BDD ?** → `getDbPosition()`
- **Le joueur est-il bien au bon endroit dans le sim ?** → `isAtCorrectAirport()`

### Interface

```typescript
// services/PositionService.ts

class PositionServiceClass {

  // === État interne ===
  private dbAirport: string = "";          // Position BDD (source de vérité)
  private simVarAirport: string = "----";  // SimVar brut (confirmation)

  // ═══════════════════════════════════════
  // LECTURE — Où est le pilote ?
  // ═══════════════════════════════════════

  /**
   * Position officielle du pilote selon la BDD.
   * C'est LA référence pour tout le reste du code.
   */
  getDbPosition(): string {
    return this.dbAirport;
  }

  /**
   * Le joueur dans le sim est-il au même aéroport que la BDD ?
   * Utilisé avant chaque vol (mission ou free flight).
   * 
   * Retourne :
   * - true  : SimVar confirme la position BDD, ou SimVar = "----" (bénéfice du doute)
   * - false : SimVar dit un aéroport DIFFÉRENT de la BDD → BLOQUÉ
   */
  isAtCorrectAirport(): boolean {
    // SimVar pas dispo → bénéfice du doute
    if (this.simVarAirport === "----" || this.simVarAirport === "") {
      return true;
    }
    // SimVar correspond à la BDD → OK
    return this.simVarAirport === this.dbAirport;
  }

  /**
   * Message d'erreur si le joueur n'est pas au bon endroit.
   */
  getPositionMismatchMessage(t: TranslateFunc): string {
    return t("position", "mismatch")
      .replace("{db}", this.dbAirport)
      .replace("{sim}", this.simVarAirport);
    // Ex: "Votre pilote est à LFPG, mais vous êtes à LFBO. Déplacez-vous ou payez un transfert."
  }

  // ═══════════════════════════════════════
  // MISE À JOUR — SimVar (lecture seule, ne modifie pas la BDD)
  // ═══════════════════════════════════════

  /**
   * Appelé par readSimVars() à chaque tick.
   * Met à jour la variable SimVar locale, JAMAIS la BDD.
   */
  updateSimVar(rawClosestAirport: string): void {
    this.simVarAirport = rawClosestAirport || "----";
    positionState.simVarAirport.set(this.simVarAirport);
    positionState.isAtCorrectAirport.set(this.isAtCorrectAirport());
  }

  // ═══════════════════════════════════════
  // ÉCRITURE BDD — 3 cas UNIQUEMENT
  // ═══════════════════════════════════════

  /**
   * Cas 1 : Première connexion — Le joueur choisit son aéroport.
   * Appelé par completeFirstLaunchSetup().
   */
  async setInitialPosition(playerId: string, aircraftId: string, icao: string): Promise<void> {
    await DatabaseManager.updatePlayerAirport(playerId, icao);
    await DatabaseManager.updateAircraftAirport(aircraftId, icao);
    this.dbAirport = icao;
    positionState.dbAirport.set(icao);
    console.log(`[Position] Initial position set: ${icao}`);
  }

  /**
   * Cas 2 : Atterrissage réussi — Position mise à jour.
   * Appelé par FlightTracker.finishSession() et MissionController.completeMissionV1().
   * 
   * IMPORTANT : icao doit être un aéroport détecté par SimVar au moment de l'atterrissage.
   * Si SimVar = "----" au moment de l'atterrissage, ne PAS appeler cette méthode
   * (le pilote reste à sa position BDD précédente).
   */
  async onSuccessfulLanding(playerId: string, aircraftId: string, icao: string): Promise<void> {
    if (!icao || icao === "----" || icao === "ZZZZ") {
      console.warn(`[Position] Landing ignored — invalid ICAO: ${icao}`);
      return;  // Sécurité : on ne sauvegarde jamais un ICAO invalide
    }
    await DatabaseManager.updatePlayerAirport(playerId, icao);
    await DatabaseManager.updateAircraftAirport(aircraftId, icao);
    this.dbAirport = icao;
    positionState.dbAirport.set(icao);
    console.log(`[Position] Landing recorded: ${icao}`);
  }

  /**
   * Cas 3 : Transfert pilote payant.
   * Appelé par MapController.confirmPilotTransfer().
   */
  async onPaidTransfer(playerId: string, aircraftId: string, destinationIcao: string): Promise<void> {
    await DatabaseManager.updatePlayerAirport(playerId, destinationIcao);
    await DatabaseManager.updateAircraftAirport(aircraftId, destinationIcao);
    this.dbAirport = destinationIcao;
    positionState.dbAirport.set(destinationIcao);
    console.log(`[Position] Paid transfer to: ${destinationIcao}`);
  }

  // ═══════════════════════════════════════
  // CHARGEMENT — Au démarrage / onResume
  // ═══════════════════════════════════════

  /**
   * Charge la position depuis la BDD au démarrage ou onResume.
   * La BDD est la vérité — on ne fait que la lire.
   */
  async loadFromDb(playerId: string): Promise<string> {
    const player = await DatabaseManager.getPlayer();
    const airport = player?.current_airport || player?.preferred_airport || "";
    this.dbAirport = airport;
    positionState.dbAirport.set(airport);
    console.log(`[Position] Loaded from DB: ${airport}`);
    return airport;
  }
}

export const PositionService = new PositionServiceClass();
```

### State réactif

```typescript
// state/positionState.ts

import { Subject } from "@microsoft/msfs-sdk";

export const positionState = {
  dbAirport: Subject.create<string>(""),           // Position BDD (vérité)
  simVarAirport: Subject.create<string>("----"),   // SimVar brut
  isAtCorrectAirport: Subject.create<boolean>(true), // SimVar confirme BDD ?
};
```

### Intégration dans AeroCorpOnline.tsx

```typescript
// readSimVars() — UNE seule ligne pour la position
const airport = SimVar.GetSimVarValue("GPS CLOSEST AIRPORT ID", "string") as string;
PositionService.updateSimVar(airport);  // Met à jour SimVar local, jamais la BDD

// onResume() — UNE seule ligne
await PositionService.loadFromDb(playerId);

// completeFirstLaunchSetup() — UNE seule ligne
await PositionService.setInitialPosition(playerId, aircraftId, startingAirport);
```

### Vérification avant vol (mission ET free flight)

```typescript
// Avant de créer une mission OU de démarrer un free flight :
if (!PositionService.isAtCorrectAirport()) {
  const msg = PositionService.getPositionMismatchMessage(t);
  popupState.popupNotification.set(msg);
  return;  // BLOQUÉ — pas de vol possible
}
```

---

## 2. FlightTracker.ts

### Rôle

**Un seul système de tracking pour les vols hors-mission.** Remplace :
- Le background tracking du `trackingManager` (anti-triche : usure + fuel)
- Le `freeFlightManager` (carrière : XP + grade + stats)

Le `trackingManager` existant garde UNIQUEMENT le tracking mission (intervalle 2 sec, waypoints, scoring).

### Pré-condition de démarrage

FlightTracker ne démarre que si `PositionService.isAtCorrectAirport() === true`. Si le joueur n'est pas au bon endroit → pas de tracking → pas de vol libre → pas d'usure → pas d'XP.

### Interface

```typescript
// services/FlightTracker.ts

import { PositionService } from "./PositionService";
import { FleetRouter } from "./FleetRouter";

interface FlightTrackerCallbacks {
  onSessionComplete: (recapData: FreeFlightRecapData) => void;
  onLandingDetected: (airport: string, fpm: number) => void;
  onError: (error: string) => void;
  t: (section: string, key: string) => string;
}

class FlightTrackerClass {

  // === État ===
  private isActive: boolean = false;
  private isPausedForMission: boolean = false;
  private currentAircraftId: string | null = null;
  private currentAircraftReg: string = "";
  private callbacks: FlightTrackerCallbacks | null = null;

  // === Stats vol en cours ===
  private wasFlying: boolean = false;
  private flightStartTime: number = 0;
  private flightMinutes: number = 0;
  private maxGForce: number = 1.0;
  private landingFpm: number = 0;
  private hadOverspeed: boolean = false;
  private distanceNm: number = 0;
  private landingsCount: number = 0;
  private departureIcao: string = "";

  // === Fuel tracking ===
  private lastFuelGallons: number = 0;
  private lastFuelSyncTime: number = 0;

  // === Position tracking (pour distance) ===
  private lastLat: number = 0;
  private lastLon: number = 0;

  // === Constantes ===
  private readonly FUEL_SYNC_INTERVAL_MS = 120_000;    // 2 min
  private readonly FUEL_DECREASE_THRESHOLD = 0.5;      // gallons
  private readonly TAKEOFF_AIRSPEED_KTS = 50;
  private readonly LANDED_GROUNDSPEED_KTS = 5;

  // ═══════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════

  initialize(callbacks: FlightTrackerCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Démarre le tracking pour un avion.
   * PRÉ-CONDITION : PositionService.isAtCorrectAirport() === true
   */
  start(aircraftId: string, aircraftReg: string): void {
    if (!PositionService.isAtCorrectAirport()) {
      console.warn("[FlightTracker] Cannot start — not at correct airport");
      return;
    }
    this.currentAircraftId = aircraftId;
    this.currentAircraftReg = aircraftReg;
    this.isActive = true;
    this.resetStats();
    console.log(`[FlightTracker] Started for ${aircraftReg} at ${PositionService.getDbPosition()}`);
  }

  stop(): void {
    this.isActive = false;
    this.currentAircraftId = null;
    console.log("[FlightTracker] Stopped");
  }

  pauseForMission(): void {
    // Si un vol libre était en cours, terminer la session d'abord
    if (this.wasFlying && this.flightMinutes > 0) {
      console.log("[FlightTracker] Mission starting — saving current free flight session");
      // On ne fait PAS finishSession ici car pas d'atterrissage
      // On applique juste l'usure horaire accumulée
      void this.applyPartialWear();
    }
    this.isPausedForMission = true;
    this.resetStats();
    console.log("[FlightTracker] Paused for mission");
  }

  resumeAfterMission(): void {
    this.isPausedForMission = false;
    this.resetStats();
    console.log("[FlightTracker] Resumed after mission");
  }

  /**
   * Mettre à jour la baseline fuel après un refuel EFB.
   * Évite que le tracker ne détecte une "diminution" fictive.
   */
  updateFuelBaseline(fuelGallons: number): void {
    this.lastFuelGallons = fuelGallons;
  }

  // ═══════════════════════════════════════
  // TICK — Appelé par readSimVars() toutes les SIMVAR_UPDATE_INTERVAL_MS
  // ═══════════════════════════════════════

  /**
   * Note : le tick est appelé au même rythme que readSimVars()
   * (toutes les 1-2 sec), mais le tracking n'accumule du temps
   * que quand wasFlying = true.
   */
  tick(simVars: {
    onGround: boolean;
    airspeed: number;
    groundSpeed: number;
    gForce: number;
    verticalSpeed: number;
    fuelGallons: number;
    fuelCapacity: number;
    lat: number;
    lon: number;
    engineRunning: boolean;
  }): void {

    // Conditions de sortie
    if (!this.isActive) return;
    if (this.isPausedForMission) return;
    if (!this.currentAircraftId) return;

    const now = Date.now();

    // ─── DÉTECTION DÉCOLLAGE ───
    if (!this.wasFlying
        && simVars.engineRunning
        && !simVars.onGround
        && simVars.airspeed > this.TAKEOFF_AIRSPEED_KTS) {

      this.wasFlying = true;
      this.flightStartTime = now;
      this.departureIcao = PositionService.getDbPosition();
      this.lastFuelGallons = simVars.fuelGallons;  // Baseline fuel
      this.lastLat = simVars.lat;
      this.lastLon = simVars.lon;

      console.log(`[FlightTracker] Takeoff detected from ${this.departureIcao}`);
      return;
    }

    // ─── EN VOL ───
    if (this.wasFlying && !simVars.onGround) {

      // Accumuler temps de vol
      // On calcule le vrai delta depuis le dernier tick au lieu d'un +0.5 fixe
      const deltaMinutes = (now - this.flightStartTime) / 60_000;
      this.flightMinutes = deltaMinutes;

      // G-force max
      if (simVars.gForce > this.maxGForce) {
        this.maxGForce = simVars.gForce;
      }

      // Overspeed (simplifié — à raffiner si on a accès à Vne)
      // Pour l'instant on garde la même logique que l'ancien tracker
      // TODO: lire VNE depuis les données avion si possible

      // Distance parcourue
      if (this.lastLat !== 0 && this.lastLon !== 0) {
        this.distanceNm += haversineDistance(
          this.lastLat, this.lastLon,
          simVars.lat, simVars.lon
        );
      }
      this.lastLat = simVars.lat;
      this.lastLon = simVars.lon;

      // ─── FUEL SYNC (toutes les 2 min si fuel diminue) ───
      if (simVars.fuelGallons < this.lastFuelGallons - this.FUEL_DECREASE_THRESHOLD
          && now - this.lastFuelSyncTime > this.FUEL_SYNC_INTERVAL_MS) {

        void FleetRouter.syncFuel(
          this.currentAircraftId!,
          simVars.fuelGallons,
          simVars.fuelCapacity
        );
        this.lastFuelGallons = simVars.fuelGallons;
        this.lastFuelSyncTime = now;
      }

      return;
    }

    // ─── DÉTECTION ATTERRISSAGE ───
    if (this.wasFlying
        && simVars.onGround
        && simVars.groundSpeed < this.LANDED_GROUNDSPEED_KTS) {

      // Capturer FPM au moment du touchdown
      this.landingFpm = Math.abs(simVars.verticalSpeed);
      this.landingsCount++;

      console.log(`[FlightTracker] Landing detected — FPM: ${this.landingFpm}, GForce max: ${this.maxGForce}`);

      // Terminer la session
      void this.finishSession(simVars.fuelGallons, simVars.fuelCapacity);
    }
  }

  // ═══════════════════════════════════════
  // SESSION TERMINÉE — Atterrissage réussi
  // ═══════════════════════════════════════

  private async finishSession(currentFuel: number, fuelCapacity: number): Promise<void> {
    if (!this.currentAircraftId) return;

    const playerId = authState.currentUser.get()?.id;
    if (!playerId) return;

    // 1. POSITION — SimVar au moment de l'atterrissage
    const landingAirport = positionState.simVarAirport.get();

    // Mettre à jour la BDD UNIQUEMENT si on a un ICAO valide
    if (landingAirport && landingAirport !== "----" && landingAirport !== "ZZZZ") {
      await PositionService.onSuccessfulLanding(
        playerId,
        this.currentAircraftId,
        landingAirport
      );
    } else {
      console.warn(`[FlightTracker] Landing at unknown airport — position BDD inchangée`);
      // Le pilote reste à sa position BDD précédente.
      // L'avion aussi. Le joueur devra peut-être se repositionner.
    }

    // 2. USURE — avec les VRAIES STATS (plus jamais 0, 0)
    try {
      await FleetRouter.applyBackgroundWear(this.currentAircraftId, {
        flight_minutes: this.flightMinutes,
        landing_fpm: this.landingFpm,         // ← VALEUR RÉELLE
        max_gforce: this.maxGForce,           // ← VALEUR RÉELLE
        had_overspeed: this.hadOverspeed,
        landing_icao: landingAirport !== "----" ? landingAirport : this.departureIcao,
      });
    } catch (e) {
      console.error("[FlightTracker] Wear application failed:", e);
    }

    // 3. FUEL — sync final vers BDD
    try {
      await FleetRouter.syncFuel(this.currentAircraftId, currentFuel, fuelCapacity);
    } catch (e) {
      console.error("[FlightTracker] Fuel sync failed:", e);
    }

    // 4. XP + GRADE (logique reprise de FreeFlightManager)
    const grade = this.calculateGrade();
    const xp = this.calculateXP(grade);

    try {
      await PlayerRouter.addXP(playerId, xp);
    } catch (e) {
      console.error("[FlightTracker] XP save failed:", e);
    }

    // 5. HISTORIQUE
    const arrivalIcao = landingAirport !== "----" ? landingAirport : "????";
    try {
      await DatabaseManager.addFlightHistory({
        type: "freeflight",
        departure_icao: this.departureIcao,
        arrival_icao: arrivalIcao,
        flight_time_minutes: Math.round(this.flightMinutes),
        grade: grade,
        xp_earned: xp,
        money_earned: 0,
      });
    } catch (e) {
      console.error("[FlightTracker] History save failed:", e);
    }

    // 6. CALLBACK — Afficher le récap
    const recapData: FreeFlightRecapData = {
      departure_icao: this.departureIcao,
      arrival_icao: arrivalIcao,
      flight_time_minutes: Math.round(this.flightMinutes),
      distance_nm: Math.round(this.distanceNm),
      landings: this.landingsCount,
      best_landing_fpm: this.landingFpm,
      max_gforce: this.maxGForce,
      grade: grade,
      xp_earned: xp,
    };

    this.callbacks?.onSessionComplete(recapData);

    // 7. RESET — prêt pour le prochain vol
    this.resetStats();
  }

  /**
   * Usure partielle quand on passe en mode mission SANS avoir atterri.
   * Applique uniquement l'usure horaire (pas de landing wear car pas d'atterrissage).
   */
  private async applyPartialWear(): Promise<void> {
    if (!this.currentAircraftId || this.flightMinutes < 1) return;

    try {
      await FleetRouter.applyBackgroundWear(this.currentAircraftId, {
        flight_minutes: this.flightMinutes,
        landing_fpm: 0,           // Pas d'atterrissage
        max_gforce: this.maxGForce,
        had_overspeed: this.hadOverspeed,
        landing_icao: "",         // Pas posé
      });
    } catch (e) {
      console.error("[FlightTracker] Partial wear failed:", e);
    }
  }

  // ═══════════════════════════════════════
  // CALCULS XP / GRADE (repris de FreeFlightManager)
  // ═══════════════════════════════════════

  private calculateGrade(): string {
    // Basé sur le FPM d'atterrissage et la G-force max
    let score = 100;

    // Pénalité atterrissage
    if (this.landingFpm > 600) score -= 40;
    else if (this.landingFpm > 400) score -= 25;
    else if (this.landingFpm > 200) score -= 10;

    // Pénalité G-force
    if (this.maxGForce > 3.0) score -= 30;
    else if (this.maxGForce > 2.5) score -= 15;

    // Pénalité overspeed
    if (this.hadOverspeed) score -= 15;

    if (score >= 90) return "A";
    if (score >= 75) return "B";
    if (score >= 50) return "C";
    return "D";
  }

  private calculateXP(grade: string): number {
    // XP basé sur le temps de vol + bonus grade
    const baseXP = Math.floor(this.flightMinutes * 2);  // 2 XP par minute
    const gradeMultiplier: Record<string, number> = { A: 1.5, B: 1.2, C: 1.0, D: 0.7 };
    return Math.floor(baseXP * (gradeMultiplier[grade] || 1.0));
  }

  // ═══════════════════════════════════════
  // UTILS
  // ═══════════════════════════════════════

  private resetStats(): void {
    this.wasFlying = false;
    this.flightStartTime = 0;
    this.flightMinutes = 0;
    this.maxGForce = 1.0;
    this.landingFpm = 0;
    this.hadOverspeed = false;
    this.distanceNm = 0;
    this.landingsCount = 0;
    this.departureIcao = "";
    this.lastLat = 0;
    this.lastLon = 0;
  }

  isTracking(): boolean {
    return this.isActive && this.wasFlying;
  }

  getFlightMinutes(): number {
    return this.flightMinutes;
  }
}

export const FlightTracker = new FlightTrackerClass();
```

---

## 3. Ce qui change dans AeroCorpOnline.tsx

### SUPPRIMER

| Bloc | Lignes environ | Raison |
|------|---------------|--------|
| `trackingManager.startBackgroundTracking()` | 443 | Remplacé par FlightTracker |
| `onBackgroundWearApply` callback | 1132-1134 | Dans FlightTracker.finishSession() |
| `onBackgroundFuelSync` callback | 1135-1137 | Dans FlightTracker.tick() |
| `initializeFreeFlightManager()` | 1194-1276 | Remplacé par FlightTracker |
| `checkAndStartFreeFlight()` | 1318-1332 | Remplacé par FlightTracker.start() |
| 3 subscriptions freeFlightManager | 1231-1255 | Remplacé par 2 subscriptions simples |
| Logique position dans `onResume()` | 1419-1427 | Remplacé par PositionService.loadFromDb() |
| Import `freeFlightManager` | 37 | Fichier supprimé |

### REMPLACER PAR

```typescript
// ═══════════════════════════════════════
// onOpen() — Initialisation
// ═══════════════════════════════════════

// Position : charger depuis BDD
await PositionService.loadFromDb(playerId);

// FlightTracker : initialiser callbacks
FlightTracker.initialize({
  onSessionComplete: (recap) => {
    freeFlightState.ffRecapData.set(recap);
    freeFlightState.ffShowRecap.set(true);
  },
  onLandingDetected: (airport, fpm) => {
    simVarState.lastLandingRate.set(fpm);
  },
  onError: (err) => console.warn("[FlightTracker]", err),
  t: (s, k) => this.t(s as any, k),
});

// ═══════════════════════════════════════
// readSimVars() — 2 lignes ajoutées
// ═══════════════════════════════════════

// Position : mettre à jour SimVar (JAMAIS la BDD)
PositionService.updateSimVar(airport);

// FlightTracker : tick
FlightTracker.tick({
  onGround: currentOnGround,
  airspeed,
  groundSpeed,
  gForce,
  verticalSpeed: vs,
  fuelGallons: fuelQuantity,
  fuelCapacity: /* depuis BDD avion */,
  lat, lon,
  engineRunning: /* SimVar ENGINE ON */,
});

// ═══════════════════════════════════════
// Subscriptions — 2 au lieu de 5
// ═══════════════════════════════════════

// Quand avion sélectionné + logged in + pas de mission → démarrer tracker
this.stateSubscriptions.push(missionState.selectedAircraftId.sub((aircraftId) => {
  if (aircraftId && isGameReady() && !missionState.activeMission.get()) {
    const reg = simVarState.currentSimAircraftReg.get();
    FlightTracker.start(aircraftId, reg || "Unknown");
  }
}));

// Quand mission change → pause/resume
this.stateSubscriptions.push(missionState.activeMission.sub((mission) => {
  if (mission) {
    FlightTracker.pauseForMission();
  } else {
    FlightTracker.resumeAfterMission();
    // Redémarrer si avion disponible
    const aircraftId = missionState.selectedAircraftId.get();
    const reg = simVarState.currentSimAircraftReg.get();
    if (aircraftId) FlightTracker.start(aircraftId, reg || "Unknown");
  }
}));

// ═══════════════════════════════════════
// onResume() — Simplifié
// ═══════════════════════════════════════

const playerId = authState.currentUser.get()?.id;
if (playerId) {
  await PositionService.loadFromDb(playerId);
}
```

---

## 4. Nettoyage TrackingManager

### GARDER (mode mission uniquement)

- `initialize()` avec callbacks mission
- `startMissionTracking()` / `stopMissionTracking()` — intervalle 2 sec
- `processUILandingDetection()` — touchdowns en mission
- Tout le tracking waypoints, progression, scoring, phases de vol

### SUPPRIMER

- `startBackgroundTracking()` et tout le code background
- Variables `bg*` (bgWasFlying, bgFlightMinutes, bgMaxGForce, etc.)
- `backgroundTrackerTick()`
- `resetBackgroundTracking()`
- Callbacks `onBackgroundWearApply` et `onBackgroundFuelSync`

---

## 5. Suppression de FreeFlightManager

Supprimer le fichier `managers/FreeFlightManager.ts` entièrement.

Toute sa logique est maintenant dans `FlightTracker.ts` :

| FreeFlightManager (supprimé) | FlightTracker (nouveau) |
|------------------------------|------------------------|
| `startBackgroundTracking()` | `start()` |
| `stopBackgroundTracking()` | `stop()` |
| `pauseForMission()` | `pauseForMission()` |
| `endLocalSession()` | `finishSession()` |
| XP + grade calculation | `calculateGrade()` + `calculateXP()` |
| Flight history save | Dans `finishSession()` |

---

## 6. Corrections fuel (dans HangarController.ts)

### 6.1 Réservoirs réduits

```typescript
// AVANT : 11 réservoirs (certains n'existent pas sur l'avion)
// APRÈS : 3 réservoirs principaux
private setSimulatorFuel(targetGallons: number, capacityGallons: number): void {
  const targetLevel = Math.min(1.0, Math.max(0.0, targetGallons / capacityGallons));

  const mainTanks = [
    "FUEL TANK LEFT MAIN LEVEL",
    "FUEL TANK RIGHT MAIN LEVEL",
    "FUEL TANK CENTER LEVEL",
  ];

  for (const tank of mainTanks) {
    SimVar.SetSimVarValue(tank, "percent over 100", targetLevel);
  }

  // Notifier le tracker du nouveau baseline
  FlightTracker.updateFuelBaseline(targetGallons);
  this.lastFuelInjectionTime = Date.now();
}
```

### 6.2 Anti-triche fuel assoupli

```typescript
private lastFuelInjectionTime = 0;

checkFuelAntiCheat(simFuel: number, dbFuel: number, capacity: number): void {
  // Cooldown 5 sec après injection
  if (Date.now() - this.lastFuelInjectionTime < 5000) return;

  const tolerance = Math.max(3.0, capacity * 0.05);  // 3 gal ou 5%

  if (simFuel > dbFuel + tolerance) {
    console.warn(`[ANTI-CHEAT] Fuel: sim=${simFuel.toFixed(1)}, db=${dbFuel.toFixed(1)}, tol=${tolerance.toFixed(1)}`);
    this.setSimulatorFuel(dbFuel, capacity);
  }
}
```

### 6.3 Debounce autoSync

```typescript
private lastAutoSyncTime = 0;

async autoSyncCurrentAircraft(): Promise<void> {
  if (Date.now() - this.lastAutoSyncTime < 5000) return;
  this.lastAutoSyncTime = Date.now();
  // ... logique existante ...
}
```

### 6.4 Refuel au sol uniquement

```typescript
// Dans openRefuelPopup() ou executeRefuel()
if (!simVarState.onGround.get()) {
  popupState.popupNotification.set(this.t("hangar", "refuel_must_be_on_ground"));
  return;
}
```

---

## 7. Flux complet final

### Connexion joueur

```
Joueur lance MSFS → ouvre EFB
    │
    ├── PositionService.loadFromDb(playerId)
    │     → dbAirport = "LFPG"
    │
    ├── readSimVars() → PositionService.updateSimVar("LFPG")
    │     → isAtCorrectAirport = true ✅
    │
    └── FlightTracker.start(aircraftId, reg)
          → OK, le joueur peut voler
```

### Connexion au mauvais aéroport

```
Joueur lance MSFS → spawn à LFBO → ouvre EFB
    │
    ├── PositionService.loadFromDb(playerId)
    │     → dbAirport = "LFPG"
    │
    ├── readSimVars() → PositionService.updateSimVar("LFBO")
    │     → isAtCorrectAirport = false ❌
    │
    └── FlightTracker.start() → REFUSÉ
        Mission → REFUSÉE
        Message : "Votre pilote est à LFPG, vous êtes à LFBO."
        Options : repositionnez-vous OU payez un transfert
```

### Free flight

```
FlightTracker.start(aircraftId, reg) — position vérifiée ✅
    │
    ├── tick() à chaque readSimVars()
    │
    ├── Décollage détecté
    │     → departureIcao = PositionService.getDbPosition() = "LFPG"
    │
    ├── En vol : stats accumulées, fuel sync /2min
    │
    ├── Atterrissage détecté à LFBO
    │     → finishSession()
    │         ├── SimVar = "LFBO" → PositionService.onSuccessfulLanding("LFBO")
    │         │     → BDD mise à jour : pilote + avion = LFBO
    │         ├── Usure avec fpm=180, gforce=1.8 (VRAIES valeurs)
    │         ├── Fuel sync final
    │         ├── XP + grade calculés
    │         └── Popup récap affiché
    │
    └── Prochain vol : FlightTracker vérifie position → "LFBO" en BDD et sim → OK ✅
```

### Mission

```
FlightTracker actif (free flight)
    │
    ├── Joueur crée mission LFPG → LFBO
    │     → Vérification : PositionService.isAtCorrectAirport() ✅
    │     → FlightTracker.pauseForMission()
    │     → trackingManager.startMissionTracking()
    │
    ├── Vol mission (trackingManager, 2 sec)
    │
    ├── Atterrissage + completion
    │     → MissionController appelle PositionService.onSuccessfulLanding("LFBO")
    │     → Usure + fuel + XP + grade (logique mission)
    │     → trackingManager.stopMissionTracking()
    │
    └── FlightTracker.resumeAfterMission()
          → isActive = true, stats reset
          → Prêt pour le prochain free flight
```

---

## 8. Ordre d'implémentation

| Étape | Fichier | Action | Test |
|-------|---------|--------|------|
| 1 | `state/positionState.ts` | Créer | Build |
| 2 | `services/PositionService.ts` | Créer | Vérifier dbAirport chargé au boot |
| 3 | `AeroCorpOnline.tsx` | Brancher PositionService dans readSimVars() et onResume() | Position correcte affichée |
| 4 | `services/FlightTracker.ts` | Créer | Build |
| 5 | `AeroCorpOnline.tsx` | Brancher FlightTracker, supprimer callbacks bg | Free flight fonctionne |
| 6 | `managers/TrackingManager.ts` | Supprimer code background | Mission fonctionne toujours |
| 7 | `managers/FreeFlightManager.ts` | Supprimer fichier | Build clean |
| 8 | `controllers/HangarController.ts` | Fix fuel (3 tanks, tolérance, debounce, au sol) | Pas de faux anti-cheat |
| 9 | Test complet | — | Tous scénarios ci-dessous |

---

## 9. Tests

### Position

| Scénario | Résultat attendu |
|----------|-----------------|
| Boot au bon aéroport | `isAtCorrectAirport` = true, vol possible |
| Boot au mauvais aéroport | `isAtCorrectAirport` = false, BLOQUÉ |
| SimVar = "----" | `isAtCorrectAirport` = true (bénéfice du doute) |
| Atterrissage à LFBO (SimVar OK) | BDD mise à jour → LFBO |
| Atterrissage (SimVar = "----") | BDD PAS mise à jour, reste ancienne position |
| Transfert payant vers EHAM | BDD mise à jour → EHAM |
| onResume après pause | Position rechargée depuis BDD |

### FlightTracker

| Scénario | Résultat attendu |
|----------|-----------------|
| Décollage sans mission | Stats accumulées, `wasFlying = true` |
| Atterrissage dur (500 fpm) | Usure avec fpm=500 (pas 0) |
| G-force 2.8 en vol | Usure avec gforce=2.8 (pas 0) |
| Free flight → mission en vol | Pause tracker, usure partielle appliquée |
| Mission finie → free flight | Tracker reprend, stats reset |
| Pas au bon aéroport | FlightTracker.start() refusé |

### Fuel

| Scénario | Résultat attendu |
|----------|-----------------|
| Refuel EFB | Pas de faux anti-cheat (cooldown 5 sec) |
| Ajout fuel panneau MSFS | Détecté après cooldown, reset |
| autoSync 3x en 2 sec | Exécuté 1 seule fois |
| Refuel en vol | Bloqué |
