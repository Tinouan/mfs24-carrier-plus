/**
 * FreeFlightManager - Background career tracking (P2P mode)
 * V2.0: Enhanced with bonus tracking, scoring, and recap data
 *
 * Runs automatically in background when:
 * - Player is logged in
 * - Has a valid aircraft from fleet
 * - No active mission
 *
 * Pauses when mission is active, resumes when mission ends.
 * Tracks: flight time, distance, landings, fuel, bonuses → XP + Score
 */

import { freeFlightState, resetFreeFlightState, type FreeFlightRecapData } from "../state/FreeFlightState";
import { authState } from "../state/AuthState";
import { isOnlineMode, isSoloMode } from "../state/GameModeState";
import { simVarState } from "../state/SimVarState";
import { missionState } from "../state/MissionState";
import { WorldRouter, FreeFlightRouter } from "../services";
import { DatabaseManager } from "./DatabaseManager";

// Global MSFS declarations in src/types/msfs-globals.d.ts

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const FREE_FLIGHT_TRACKING_INTERVAL_MS = 5000; // 5 seconds
const XP_PER_NM = 0.75;                         // V2.0: Base XP per nm (not per minute)
const MIN_LANDING_SPEED_KTS = 5;                // Below this = landed

// V2.0: Minimum flight requirements
const MIN_DISTANCE_NM = 10;                     // Minimum distance for XP
const MIN_FLIGHT_TIME_MIN = 5;                  // Minimum flight time for XP

// V2.0: Bonus multipliers (same as missions)
const BONUS_REAL_TIME = 1.20;
const BONUS_NIGHT = 1.15;
const BONUS_ATC = 1.15;
const BONUS_FUEL_ECO = 1.10;
const BONUS_NO_AUTOPILOT = 1.10;
const BONUS_BAD_WEATHER = 1.15;

// V2.0: Weather thresholds
const BAD_WEATHER_VISIBILITY_NM = 3;
const BAD_WEATHER_WIND_KTS = 20;

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface FreeFlightCallbacks {
  onLandingDetected: (airport: string, totalLandings: number) => void;
  onStatsUpdated: (flightTime: number, distance: number, xp: number) => void;
  onSessionComplete: (recapData: FreeFlightRecapData) => void;  // V2.0: Full recap data
  onError: (error: string) => void;
}

// V2.0: Internal tracking stats for score calculation
interface FreeFlightTrackingStats {
  departureIcao: string;
  arrivalIcao: string;
  distance_nm: number;
  flightTimeMinutes: number;
  landingFpm: number;
  maxGforce: number;
  fuelStartPercent: number;
  fuelEndPercent: number;
  simRateEverChanged: boolean;
  autopilotEverUsed: boolean;
  nightPercent: number;
  atcCompliance: number;
  atcViolations: number;
  weatherVisibility: number;
  weatherWind: number;
  weatherPrecip: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// MANAGER CLASS
// ═══════════════════════════════════════════════════════════════════════════

class FreeFlightManager {
  private callbacks: FreeFlightCallbacks | null = null;
  private initialized = false;
  private trackingInterval: number | null = null;
  private sessionStartTime: Date | null = null;
  private lastLat = 0;
  private lastLon = 0;
  private wasOnGround = true;
  private isPaused = false;
  private currentAircraftId: string | null = null;
  private parkingBrakeTriggered = false; // Avoid spam when parking brake held
  private hasBeenAirborne = false; // Must be airborne before parking brake can end flight

  // Stats for SEED endpoint (Online mode)
  private lastLandingFpm = 0;   // Vertical speed at last landing (negative = descent)
  private maxGForce = 1.0;      // Maximum G-force during flight
  private overspeedCount = 0;   // Number of overspeed events

  // V2.0: Enhanced tracking for scoring
  private simRateEverChanged = false;     // true if sim rate !== 1 at any point
  private autopilotEverUsed = false;      // true if AP was activated
  private nightTimeSeconds = 0;           // Accumulated night flight time
  private totalFlightSeconds = 0;         // Total flight time for percentage calc
  private weatherVisibilityNm = 10;       // Weather at departure
  private weatherWindKts = 0;             // Weather at departure
  private weatherPrecip = false;          // Weather at departure
  private fuelStartPercent = 0;           // Fuel at departure
  private atcViolations = 0;              // ATC violations count

  /**
   * Initialize the manager with callbacks
   */
  initialize(callbacks: FreeFlightCallbacks): void {
    this.callbacks = callbacks;
    this.initialized = true;
    console.log("[FreeFlightManager] Initialized (P2P mode)");
  }

  /**
   * Check if manager is initialized
   */
  isInitialized(): boolean {
    return this.initialized && this.callbacks !== null;
  }

  /**
   * Check if currently tracking
   */
  isTracking(): boolean {
    return freeFlightState.status.get() === "in_flight" && !this.isPaused;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BACKGROUND START/STOP
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Start background tracking (called when aircraft detected + logged in + no mission)
   */
  startBackgroundTracking(aircraftId: string, aircraftReg: string, airport: string): void {
    if (!authState.isLoggedIn.get()) {
      console.log("[FreeFlightManager] Not logged in, skipping");
      return;
    }

    if (freeFlightState.status.get() === "in_flight" && !this.isPaused) {
      console.log("[FreeFlightManager] Already tracking");
      return;
    }

    console.log("[FreeFlightManager] Starting background tracking for", aircraftReg, "at", airport);

    // Initialize state
    this.currentAircraftId = aircraftId;
    this.sessionStartTime = new Date();
    this.isPaused = false;
    this.hasBeenAirborne = false; // Reset - must takeoff before parking brake can end flight
    this.lastLandingFpm = 0;      // Reset landing stats
    this.maxGForce = 1.0;         // Reset max G (1.0 = level flight)
    this.overspeedCount = 0;      // Reset overspeed count

    // V2.0: Reset enhanced tracking
    this.simRateEverChanged = false;
    this.autopilotEverUsed = false;
    this.nightTimeSeconds = 0;
    this.totalFlightSeconds = 0;
    this.atcViolations = 0;

    // Read initial position
    const lat = SimVar.GetSimVarValue("PLANE LATITUDE", "degrees") as number;
    const lon = SimVar.GetSimVarValue("PLANE LONGITUDE", "degrees") as number;
    const fuel = SimVar.GetSimVarValue("FUEL TOTAL QUANTITY", "gallons") as number;
    const fuelCapacity = SimVar.GetSimVarValue("FUEL TOTAL CAPACITY", "gallons") as number;

    this.lastLat = lat;
    this.lastLon = lon;
    this.wasOnGround = true;

    // V2.0: Capture fuel percentage at start
    this.fuelStartPercent = fuelCapacity > 0 ? (fuel / fuelCapacity) * 100 : 100;

    // V2.0: Capture weather at departure
    this.weatherVisibilityNm = SimVar.GetSimVarValue("AMBIENT VISIBILITY", "nautical miles") as number || 10;
    this.weatherWindKts = SimVar.GetSimVarValue("AMBIENT WIND VELOCITY", "knots") as number || 0;
    this.weatherPrecip = (SimVar.GetSimVarValue("AMBIENT PRECIP RATE", "millimeters of water") as number || 0) > 0;

    // Update state
    freeFlightState.status.set("in_flight");
    freeFlightState.departureAirport.set(airport);
    freeFlightState.startLat.set(lat);
    freeFlightState.startLon.set(lon);
    freeFlightState.startFuelGallons.set(fuel);
    freeFlightState.flightTimeMinutes.set(0);
    freeFlightState.distanceFlownNm.set(0);
    freeFlightState.landingsCount.set(0);
    freeFlightState.fuelUsedGallons.set(0);
    freeFlightState.estimatedXp.set(0);

    // V2.0: Update enhanced state (departureAirport already set above)
    freeFlightState.ffFuelStartPercent.set(this.fuelStartPercent);
    freeFlightState.ffBonusBadWeather.set(
      this.weatherVisibilityNm < BAD_WEATHER_VISIBILITY_NM || this.weatherWindKts > BAD_WEATHER_WIND_KTS
    );

    // Start tracking interval
    this.startTracking();

    // P2P: Start local session
    void this.startLocalSession(aircraftId, airport);
  }

  /**
   * Stop background tracking (called when logging out or closing app)
   */
  stopBackgroundTracking(): void {
    if (freeFlightState.status.get() !== "in_flight") {
      return;
    }

    console.log("[FreeFlightManager] Stopping background tracking");
    this.stopTracking();

    // P2P: Save session locally if minimum time met
    const flightTime = freeFlightState.flightTimeMinutes.get();
    if (flightTime >= 2) {
      void this.endLocalSession();
    }

    // Reset state
    freeFlightState.status.set("idle");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAUSE/RESUME FOR MISSIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Pause tracking when mission starts
   */
  pauseForMission(): void {
    if (freeFlightState.status.get() !== "in_flight") return;

    console.log("[FreeFlightManager] Pausing for mission");
    this.isPaused = true;
    this.stopTracking();
    freeFlightState.status.set("paused");

    // P2P: Save partial session locally
    void this.endLocalSession();
  }

  /**
   * Resume tracking when mission ends
   */
  resumeAfterMission(aircraftId: string, aircraftReg: string, airport: string): void {
    console.log("[FreeFlightManager] Resuming after mission");
    this.isPaused = false;

    // Start fresh tracking session
    this.startBackgroundTracking(aircraftId, aircraftReg, airport);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRACKING LOOP
  // ═══════════════════════════════════════════════════════════════════════════

  private startTracking(): void {
    if (this.trackingInterval) {
      window.clearInterval(this.trackingInterval);
    }

    this.trackingInterval = window.setInterval(() => {
      this.trackingTick();
    }, FREE_FLIGHT_TRACKING_INTERVAL_MS);
  }

  private stopTracking(): void {
    if (this.trackingInterval) {
      window.clearInterval(this.trackingInterval);
      this.trackingInterval = null;
    }
  }

  private trackingTick(): void {
    if (this.isPaused || freeFlightState.status.get() !== "in_flight") return;

    // Read SimVars
    const lat = SimVar.GetSimVarValue("PLANE LATITUDE", "degrees") as number;
    const lon = SimVar.GetSimVarValue("PLANE LONGITUDE", "degrees") as number;
    const alt = SimVar.GetSimVarValue("PLANE ALTITUDE", "feet") as number;
    const gs = SimVar.GetSimVarValue("GROUND VELOCITY", "knots") as number;
    const onGround = SimVar.GetSimVarValue("SIM ON GROUND", "boolean") as boolean;
    const currentFuel = SimVar.GetSimVarValue("FUEL TOTAL QUANTITY", "gallons") as number;
    const fuelCapacity = SimVar.GetSimVarValue("FUEL TOTAL CAPACITY", "gallons") as number;
    const parkingBrake = SimVar.GetSimVarValue("BRAKE PARKING POSITION", "boolean") as boolean;
    const verticalSpeed = SimVar.GetSimVarValue("VERTICAL SPEED", "feet per minute") as number;
    const gForce = SimVar.GetSimVarValue("G FORCE", "number") as number;
    const simRate = SimVar.GetSimVarValue("SIMULATION RATE", "number") as number;
    const autopilotMaster = SimVar.GetSimVarValue("AUTOPILOT MASTER", "boolean") as boolean;
    const ambientDarkness = SimVar.GetSimVarValue("AMBIENT DARKNESS", "number") as number;

    // Track max G-force during flight
    if (Math.abs(gForce) > Math.abs(this.maxGForce)) {
      this.maxGForce = gForce;
    }

    // V2.0: Track sim rate (bonus lost if ever changed)
    if (simRate !== 1 && !this.simRateEverChanged) {
      this.simRateEverChanged = true;
      freeFlightState.ffBonusRealTime.set(false);
      console.log("[FreeFlightManager] Sim rate changed - real time bonus lost");
    }

    // V2.0: Track autopilot (bonus lost if ever used)
    if (autopilotMaster && !this.autopilotEverUsed) {
      this.autopilotEverUsed = true;
      freeFlightState.ffBonusNoAutopilot.set(false);
      console.log("[FreeFlightManager] Autopilot used - no AP bonus lost");
    }

    // V2.0: Track night time
    this.totalFlightSeconds += FREE_FLIGHT_TRACKING_INTERVAL_MS / 1000;
    if (ambientDarkness > 0.5) {
      this.nightTimeSeconds += FREE_FLIGHT_TRACKING_INTERVAL_MS / 1000;
    }
    // Update night bonus if >50% of flight in darkness
    const nightPercent = this.totalFlightSeconds > 0
      ? (this.nightTimeSeconds / this.totalFlightSeconds) * 100
      : 0;
    freeFlightState.ffBonusNight.set(nightPercent > 50);

    // Update altitude and speed
    freeFlightState.currentAltitude.set(Math.round(alt));
    freeFlightState.groundSpeed.set(Math.round(gs));
    freeFlightState.isOnGround.set(onGround);

    // Calculate flight time
    if (this.sessionStartTime) {
      const elapsedMs = Date.now() - this.sessionStartTime.getTime();
      const elapsedMinutes = elapsedMs / 60000;
      freeFlightState.flightTimeMinutes.set(elapsedMinutes);
      freeFlightState.ffFlightTimeMin.set(elapsedMinutes);
    }

    // Calculate distance flown (accumulative)
    if (this.lastLat !== 0 && this.lastLon !== 0) {
      const segmentDistance = this.calculateDistanceNm(this.lastLat, this.lastLon, lat, lon);
      if (segmentDistance > 0.01 && segmentDistance < 10) { // Sanity check
        const totalDistance = freeFlightState.distanceFlownNm.get() + segmentDistance;
        freeFlightState.distanceFlownNm.set(totalDistance);
        freeFlightState.ffDistanceNm.set(totalDistance);
      }
    }
    this.lastLat = lat;
    this.lastLon = lon;

    // Calculate fuel used
    const startFuel = freeFlightState.startFuelGallons.get();
    const fuelUsed = Math.max(0, startFuel - currentFuel);
    freeFlightState.fuelUsedGallons.set(fuelUsed);

    // V2.0: Update fuel end percent
    const fuelEndPercent = fuelCapacity > 0 ? (currentFuel / fuelCapacity) * 100 : 0;
    freeFlightState.ffFuelEndPercent.set(fuelEndPercent);

    // Airborne detection - set flag when aircraft leaves ground
    if (!onGround && this.wasOnGround && !this.hasBeenAirborne) {
      this.hasBeenAirborne = true;
      console.log("[FreeFlightManager] Aircraft is now airborne - parking brake can end flight after landing");
    }

    // Landing detection
    if (onGround && !this.wasOnGround && gs < MIN_LANDING_SPEED_KTS) {
      const landings = freeFlightState.landingsCount.get() + 1;
      freeFlightState.landingsCount.set(landings);
      this.lastLandingFpm = verticalSpeed; // Capture FPM at landing
      freeFlightState.ffLandingFpm.set(Math.abs(verticalSpeed));
      console.log(`[FreeFlightManager] Landing detected! Total: ${landings}, FPM: ${Math.round(verticalSpeed)}`);

      // P2P: Try to detect airport using local database
      void this.detectAndSetCurrentAirport(lat, lon);
    }
    this.wasOnGround = onGround;

    // V2.0: Update max G-force in state
    freeFlightState.ffMaxGforce.set(Math.abs(this.maxGForce));

    // Update XP estimate (V2.0: based on distance, not time)
    const distance = freeFlightState.distanceFlownNm.get();
    const estimatedXp = Math.floor(distance * XP_PER_NM);
    freeFlightState.estimatedXp.set(estimatedXp);
    freeFlightState.ffXpEarned.set(estimatedXp);

    // ========== PARKING BRAKE DETECTION (END SESSION) ==========
    // Only trigger if: airborne at least once, now on ground, slow, parking brake set
    const flightTime = freeFlightState.flightTimeMinutes.get();
    if (parkingBrake && onGround && gs < MIN_LANDING_SPEED_KTS && this.hasBeenAirborne && !this.parkingBrakeTriggered) {
      this.parkingBrakeTriggered = true;
      console.log("[FreeFlightManager] PARKING BRAKE SET after flight - Calculating score");

      const departureIcao = freeFlightState.departureAirport.get();
      const arrivalIcao = freeFlightState.currentAirport.get() || departureIcao;

      // V2.0: Check minimum requirements
      if (distance < MIN_DISTANCE_NM || flightTime < MIN_FLIGHT_TIME_MIN) {
        console.log("[FreeFlightManager] Flight too short for XP - showing simple notification");
        freeFlightState.showEndFlightConfirm.set(true);
        // No recap, just confirmation
        return;
      }

      // V2.0: Calculate full recap data
      const recapData = this.calculateFreeFlightResult({
        departureIcao,
        arrivalIcao,
        distance_nm: distance,
        flightTimeMinutes: flightTime,
        landingFpm: Math.abs(this.lastLandingFpm),
        maxGforce: Math.abs(this.maxGForce),
        fuelStartPercent: this.fuelStartPercent,
        fuelEndPercent: fuelEndPercent,
        simRateEverChanged: this.simRateEverChanged,
        autopilotEverUsed: this.autopilotEverUsed,
        nightPercent,
        // TODO [SPEC-FF-XP]: Intégrer le vrai tracking ATC ici
        // Actuellement hardcodé à 100 — le bonus ATC ×1.15 est toujours actif
        // Sera corrigé lors de l'implémentation de spec-freeflight-xp-efb.md
        atcCompliance: 100, // FIXME: hardcoded
        atcViolations: this.atcViolations,
        weatherVisibility: this.weatherVisibilityNm,
        weatherWind: this.weatherWindKts,
        weatherPrecip: this.weatherPrecip,
      });

      // Update state with recap data
      freeFlightState.ffRecapData.set(recapData);
      freeFlightState.ffScore.set(recapData.score_total);
      freeFlightState.ffGrade.set(recapData.grade);
      freeFlightState.ffXpEarned.set(recapData.xp_earned);
      freeFlightState.ffArrivalIcao.set(arrivalIcao);

      // Show recap popup
      freeFlightState.ffShowRecap.set(true);

      // Notify callback
      this.callbacks?.onSessionComplete(recapData);

      console.log(`[FreeFlightManager] Session complete - Grade: ${recapData.grade}, XP: ${recapData.xp_earned}`);
    }
    // Reset trigger when parking brake released
    if (!parkingBrake) {
      this.parkingBrakeTriggered = false;
    }

    // Notify callbacks
    this.callbacks?.onStatsUpdated(flightTime, distance, estimatedXp);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * V2.0: Calculate free flight result with scoring (same system as missions)
   */
  private calculateFreeFlightResult(stats: FreeFlightTrackingStats): FreeFlightRecapData {
    // === BASE XP ===
    const baseXP = Math.floor(stats.distance_nm * XP_PER_NM);

    // === SCORE LANDING (same as missions) ===
    let scoreLanding = 0;
    let landingQuality = "normal";
    if (stats.landingFpm < 50) {
      scoreLanding = 250;
      landingQuality = "butter";
    } else if (stats.landingFpm < 100) {
      scoreLanding = 150;
      landingQuality = "smooth";
    } else if (stats.landingFpm < 200) {
      scoreLanding = 50;
      landingQuality = "normal";
    } else if (stats.landingFpm < 500) {
      scoreLanding = 0;
      landingQuality = "hard";
    } else {
      scoreLanding = -200;
      landingQuality = "crash";
    }

    // === SCORE G-FORCE (same as missions) ===
    let scoreGforce = 0;
    if (stats.maxGforce > 2.5) {
      scoreGforce = -100;
    }

    // === SCORE TOTAL ===
    const scoreTotal = 1000 + scoreLanding + scoreGforce;

    // === GRADE (same scale as missions) ===
    let grade = "F";
    if (scoreTotal >= 1200) grade = "S";
    else if (scoreTotal >= 1000) grade = "A";
    else if (scoreTotal >= 800) grade = "B";
    else if (scoreTotal >= 600) grade = "C";
    else if (scoreTotal >= 400) grade = "D";

    // === SCORE MULTIPLIER ===
    let scoreMultiplier = 1.0;
    if (scoreTotal >= 1200) scoreMultiplier = 1.15;
    else if (scoreTotal >= 1000) scoreMultiplier = 1.0;
    else if (scoreTotal >= 800) scoreMultiplier = 0.9;
    else if (scoreTotal >= 600) scoreMultiplier = 0.75;
    else if (scoreTotal >= 400) scoreMultiplier = 0.6;
    else scoreMultiplier = 0.5;

    // === FUEL EFFICIENCY ===
    const fuelUsedPercent = stats.fuelStartPercent - stats.fuelEndPercent;
    const expectedFuelPercent = stats.distance_nm * 0.05; // ~5%/100nm estimate
    const fuelEfficiency = expectedFuelPercent > 0
      ? Math.min(1.0, expectedFuelPercent / Math.max(fuelUsedPercent, 0.01))
      : 1.0;
    const fuelEcoActive = fuelEfficiency > 0.85;

    // === BONUS MULTIPLIERS ===
    const bonuses = {
      real_time: { active: !stats.simRateEverChanged, multiplier: BONUS_REAL_TIME },
      night: { active: stats.nightPercent > 50, multiplier: BONUS_NIGHT },
      atc: { active: stats.atcCompliance >= 100, multiplier: BONUS_ATC },
      fuel_eco: { active: fuelEcoActive, multiplier: BONUS_FUEL_ECO },
      no_autopilot: { active: !stats.autopilotEverUsed, multiplier: BONUS_NO_AUTOPILOT },
      bad_weather: { active: stats.weatherVisibility < BAD_WEATHER_VISIBILITY_NM || stats.weatherWind > BAD_WEATHER_WIND_KTS, multiplier: BONUS_BAD_WEATHER },
    };

    let bonusMultiplier = 1.0;
    for (const b of Object.values(bonuses)) {
      if (b.active) bonusMultiplier *= b.multiplier;
    }

    // === XP FINAL ===
    const xpEarned = Math.floor(baseXP * scoreMultiplier * bonusMultiplier);

    return {
      departure_icao: stats.departureIcao,
      arrival_icao: stats.arrivalIcao,
      distance_nm: Math.round(stats.distance_nm),
      flight_time_minutes: Math.round(stats.flightTimeMinutes),
      score_landing: scoreLanding,
      score_gforce: scoreGforce,
      score_total: scoreTotal,
      grade,
      landing_fpm: Math.round(stats.landingFpm),
      landing_quality: landingQuality,
      max_gforce: Math.round(stats.maxGforce * 10) / 10,
      bonuses,
      bonus_multiplier_total: Math.round(bonusMultiplier * 100) / 100,
      xp_earned: xpEarned,
      money_earned: 0,
      weather_visibility_nm: stats.weatherVisibility,
      weather_wind_kts: stats.weatherWind,
      weather_precipitation: stats.weatherPrecip,
      fuel_remaining_percent: Math.round(stats.fuelEndPercent),
      atc_compliance: stats.atcCompliance,
      atc_violations: stats.atcViolations,
    };
  }

  /**
   * V2.0: Get landing quality string from FPM
   */
  static getLandingQuality(fpm: number): string {
    if (fpm < 50) return "butter";
    if (fpm < 100) return "smooth";
    if (fpm < 200) return "normal";
    if (fpm < 500) return "hard";
    return "crash";
  }

  /**
   * P2P: Detect current airport using local WorldRouter
   */
  private async detectAndSetCurrentAirport(lat: number, lon: number): Promise<void> {
    try {
      const airport = await WorldRouter.getClosestAirport(lat, lon);
      if (airport?.ident) {
        freeFlightState.currentAirport.set(airport.ident);
        this.callbacks?.onLandingDetected(airport.ident, freeFlightState.landingsCount.get());
      }
    } catch (error) {
      console.warn("[FreeFlightManager] Could not detect airport:", error);
    }
  }

  private calculateDistanceNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3440.065; // Earth radius in nautical miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // P2P LOCAL SESSION MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * P2P: Start a local free flight session
   */
  private async startLocalSession(aircraftId: string, airport: string): Promise<void> {
    try {
      await FreeFlightRouter.startSession(aircraftId, airport);
      console.log("[FreeFlightManager] Local session started");
    } catch (error) {
      console.warn("[FreeFlightManager] Could not start local session:", error);
    }
  }

  /**
   * P2P: End local session and award XP
   * V4.1: Also updates player's current_airport
   */
  private async endLocalSession(): Promise<void> {
    if (!this.currentAircraftId) return;

    const xp = freeFlightState.estimatedXp.get();
    const endAirport = freeFlightState.currentAirport.get() || freeFlightState.departureAirport.get();

    try {
      // End the session
      await FreeFlightRouter.endSession(this.currentAircraftId, endAirport);

      // Get player for XP award and position update
      const player = await DatabaseManager.getPlayer();
      if (player) {
        // V4.1: Update player's current_airport to where they landed
        if (endAirport) {
          player.current_airport = endAirport;
          player.updated_at = new Date().toISOString();
          console.log(`[FreeFlightManager] Player current_airport updated to ${endAirport}`);
        }

        // Award XP (Solo mode only - Online mode XP is handled by SEED)
        if (xp > 0 && isSoloMode()) {
          player.xp += xp;
          console.log(`[FreeFlightManager] Solo session ended, awarded ${xp} XP (total: ${player.xp})`);
        }

        // Save player with updated position and XP
        await DatabaseManager.savePlayer(player);
      }
    } catch (error) {
      console.warn("[FreeFlightManager] Could not end local session:", error);
    }
  }

  /**
   * P2P: Fetch today's stats from local storage (placeholder)
   */
  async fetchTodayStats(): Promise<void> {
    // P2P: Stats are tracked locally - could aggregate from session history
    console.log("[FreeFlightManager] P2P mode - today stats from local storage");
    // For now, just use current session data
    freeFlightState.todayStats.set({
      totalFlightTime: freeFlightState.flightTimeMinutes.get(),
      totalDistanceNm: freeFlightState.distanceFlownNm.get(),
      totalLandings: freeFlightState.landingsCount.get(),
      totalFuelUsed: freeFlightState.fuelUsedGallons.get(),
      sessionsToday: 1,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // USER ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Called when user clicks OK on the end flight confirmation popup.
   * Ends current session, awards XP, and starts a new free flight.
   */
  async confirmSessionEnd(): Promise<void> {
    console.log("[FreeFlightManager] User confirmed session end");

    // Close the popup
    freeFlightState.showEndFlightConfirm.set(false);

    // Save current aircraft info for restart
    const aircraftId = this.currentAircraftId;
    const currentAirport = freeFlightState.currentAirport.get() || freeFlightState.departureAirport.get();

    // End local session (awards XP)
    await this.endLocalSession();

    // Stop tracking
    this.stopTracking();

    // Reset state for new session
    freeFlightState.status.set("idle");
    this.parkingBrakeTriggered = false;
    this.hasBeenAirborne = false;

    // Start new free flight session if conditions are met
    if (aircraftId && authState.isLoggedIn.get()) {
      const aircraftReg = SimVar.GetSimVarValue("ATC ID", "string") as string || "Unknown";
      console.log("[FreeFlightManager] Starting new session at", currentAirport);

      // Small delay to let state reset
      setTimeout(() => {
        this.startBackgroundTracking(aircraftId, aircraftReg, currentAirport);
      }, 500);
    }
  }

  /**
   * Called when user dismisses the popup without confirming (e.g., clicks outside)
   * Keeps the session running.
   */
  dismissEndFlightPopup(): void {
    console.log("[FreeFlightManager] User dismissed end flight popup - continuing session");
    freeFlightState.showEndFlightConfirm.set(false);
    this.parkingBrakeTriggered = false; // Allow re-trigger
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const freeFlightManager = new FreeFlightManager();
