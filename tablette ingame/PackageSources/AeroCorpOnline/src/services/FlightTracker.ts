/**
 * FlightTracker - Unified tracking for non-mission flights
 *
 * Replaces:
 * - TrackingManager background tracking (anti-cheat: wear + fuel)
 * - FreeFlightManager (career: XP + grade + stats)
 *
 * Pre-condition: PositionService.isAtCorrectAirport() === true before starting.
 */
import { PositionService } from "./PositionService";
import { FleetRouter } from "./ServiceRouter";
import { DatabaseManager } from "../managers";
import type { Aircraft } from "../managers/DatabaseManager";
import { positionState } from "../state/positionState";
import { freeFlightState, type FreeFlightRecapData } from "../state/FreeFlightState";
import { isSoloMode } from "../state/GameModeState";
import { authState } from "../state/AuthState";
import { WearTearReaderService } from "./WearTearReaderService";
import { ALL_SYSTEMS_V2 } from "../constants/WearConstants";

// ═══════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════

function haversineDistanceNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065; // Earth radius in nautical miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ═══════════════════════════════════════
// TYPES
// ═══════════════════════════════════════

export interface FlightTrackerCallbacks {
  onSessionComplete: (recapData: FreeFlightRecapData) => void;
  onLandingDetected: (airport: string, fpm: number) => void;
  onError: (error: string) => void;
}

export interface FlightTickData {
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
  altitude: number;
}

// ═══════════════════════════════════════
// FLIGHT TRACKER
// ═══════════════════════════════════════

class FlightTrackerClass {
  private isActive = false;
  private isPausedForMission = false;
  private currentAircraftId: string | null = null;
  private currentAircraftReg = "";
  private callbacks: FlightTrackerCallbacks | null = null;

  // Flight stats
  private wasFlying = false;
  private flightStartTime = 0;
  private flightMinutes = 0;
  private maxGForce = 1.0;
  private landingFpm = 0;
  private hadOverspeed = false;
  private distanceNm = 0;
  private landingsCount = 0;
  private hasBeenAirborne = false;
  private departureIcao = "";
  private touchdownFpm = 0;

  // Fuel tracking
  private lastFuelGallons = 0;
  private lastFuelSyncTime = 0;

  // Position tracking (for distance)
  private lastLat = 0;
  private lastLon = 0;

  // W&T reader — read MSFS state every 30 ticks (~30s at 1s tick interval)
  private wtReadCounter = 0;
  private readonly WT_READ_INTERVAL = 30;

  // Constants
  private readonly FUEL_SYNC_INTERVAL_MS = 120_000;
  private readonly FUEL_DECREASE_THRESHOLD = 0.5;
  private readonly LANDED_GROUNDSPEED_KTS = 5;

  // ═══════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════

  initialize(callbacks: FlightTrackerCallbacks): void {
    this.callbacks = callbacks;
    console.log("[FlightTracker] Initialized");
  }

  /**
   * Arm the tracker for an aircraft.
   * Idempotent: skip if already armed for same aircraft.
   * Status stays "idle" until engine is actually running.
   */
  start(aircraftId: string, aircraftReg: string): void {
    // Already armed for this aircraft — skip
    if (this.isActive && this.currentAircraftId === aircraftId) return;

    // Note: position guard removed from start() — tick() handles blocking via:
    // - freeFlightState.positionBlocked (line 186) for UI feedback
    // - engine start block (line 192) to prevent flight when mismatched

    this.currentAircraftId = aircraftId;
    this.currentAircraftReg = aircraftReg;
    this.isActive = true;
    this.isPausedForMission = false;
    this.resetStats();

    freeFlightState.status.set("idle");

    console.log(`[FlightTracker] Armed for ${aircraftReg}`);
  }

  stop(): void {
    this.isActive = false;
    this.currentAircraftId = null;
    freeFlightState.status.set("idle");
    console.log("[FlightTracker] Stopped");
  }

  pauseForMission(): void {
    if (this.wasFlying && this.flightMinutes > 0) {
      console.log("[FlightTracker] Mission starting — applying partial wear");
      void this.applyPartialWear();
    }
    this.isPausedForMission = true;
    this.resetStats();
    freeFlightState.status.set("paused");
    console.log("[FlightTracker] Paused for mission");
  }

  resumeAfterMission(): void {
    this.isPausedForMission = false;
    this.resetStats();
    freeFlightState.status.set("idle");
    console.log("[FlightTracker] Resumed after mission — waiting for engine start");
  }

  updateFuelBaseline(fuelGallons: number): void {
    this.lastFuelGallons = fuelGallons;
  }

  // ═══════════════════════════════════════
  // TICK — Called by readSimVars() every interval
  // ═══════════════════════════════════════

  tick(simVars: FlightTickData): void {
    if (!this.isActive) return;
    if (this.isPausedForMission) return;
    if (!this.currentAircraftId) return;

    const now = Date.now();

    // ─── LIVE UI UPDATE (always, even on ground) ───
    freeFlightState.isOnGround.set(simVars.onGround);
    freeFlightState.groundSpeed.set(simVars.groundSpeed);
    freeFlightState.currentAltitude.set(simVars.altitude);

    // ─── POSITION CHECK (update blocked status while idle) ───
    if (!this.wasFlying) {
      freeFlightState.positionBlocked.set(!PositionService.isAtCorrectAirport());
    }

    // ─── ENGINE START DETECTION ───
    if (!this.wasFlying && simVars.engineRunning) {
      // Block FreeFlight if not at correct airport
      if (!PositionService.isAtCorrectAirport()) {
        return;
      }
      freeFlightState.positionBlocked.set(false);

      this.wasFlying = true;
      this.flightStartTime = now;
      this.departureIcao = PositionService.getDbPosition();
      this.lastFuelGallons = simVars.fuelGallons;
      this.lastLat = simVars.lat;
      this.lastLon = simVars.lon;

      freeFlightState.status.set("in_flight");
      freeFlightState.departureAirport.set(this.departureIcao);

      console.log(`[FlightTracker] Engine start detected at ${this.departureIcao} — FreeFlight active`);
      return;
    }

    // ─── TRACKING (wasFlying = true) ───
    if (this.wasFlying) {
      // Always update flight time (ground + air)
      this.flightMinutes = (now - this.flightStartTime) / 60_000;

      // Push live stats to UI
      freeFlightState.flightTimeMinutes.set(this.flightMinutes);
      freeFlightState.distanceFlownNm.set(this.distanceNm);
      freeFlightState.landingsCount.set(this.landingsCount);
      freeFlightState.estimatedXp.set(Math.round(this.flightMinutes * 2));

      // ─── AIRBORNE ───
      if (!simVars.onGround) {
        this.hasBeenAirborne = true;

        // G-force max
        if (Math.abs(simVars.gForce) > this.maxGForce) {
          this.maxGForce = Math.abs(simVars.gForce);
        }

        // Distance
        if (this.lastLat !== 0 && this.lastLon !== 0) {
          this.distanceNm += haversineDistanceNm(
            this.lastLat,
            this.lastLon,
            simVars.lat,
            simVars.lon
          );
        }
        this.lastLat = simVars.lat;
        this.lastLon = simVars.lon;

        // ─── W&T MSFS READ (every ~30s) ───
        this.wtReadCounter++;
        if (this.wtReadCounter >= this.WT_READ_INTERVAL) {
          this.wtReadCounter = 0;
          try {
            const msfsState = WearTearReaderService.readMsfsWearState();
            if (Object.keys(msfsState).length > 0) {
              console.log("[FlightTracker] W&T MSFS read:", msfsState);
            }
          } catch {
            // W&T read not critical — ignore errors
          }
        }

        // ─── FUEL SYNC (every 2 min if fuel decreasing) ───
        if (
          simVars.fuelGallons < this.lastFuelGallons - this.FUEL_DECREASE_THRESHOLD &&
          now - this.lastFuelSyncTime > this.FUEL_SYNC_INTERVAL_MS
        ) {
          void FleetRouter.syncFuel(
            this.currentAircraftId!,
            simVars.fuelGallons,
            simVars.fuelCapacity
          );
          this.lastFuelGallons = simVars.fuelGallons;
          this.lastFuelSyncTime = now;
        }

        // Track last VS for touchdown FPM capture
        this.touchdownFpm = Math.abs(simVars.verticalSpeed);

        return;
      }

      // ─── ON GROUND ───

      // Capture touchdown FPM on air→ground transition (before groundSpeed check)
      if (this.hasBeenAirborne && this.touchdownFpm > 0 && this.landingFpm === 0) {
        this.landingFpm = this.touchdownFpm;
        console.log(`[FlightTracker] Touchdown FPM captured: ${this.landingFpm.toFixed(0)}`);
      }

      // LANDING: only after having been airborne
      if (
        this.hasBeenAirborne &&
        simVars.groundSpeed < this.LANDED_GROUNDSPEED_KTS
      ) {
        this.landingsCount++;

        console.log(
          `[FlightTracker] Landing detected — FPM: ${this.landingFpm.toFixed(0)}, GForce max: ${this.maxGForce.toFixed(2)}`
        );

        this.callbacks?.onLandingDetected(
          positionState.simVarAirport.get(),
          this.landingFpm
        );

        void this.finishSession(simVars.fuelGallons, simVars.fuelCapacity);
        return;
      }

      // ENGINE STOP before takeoff = silent reset
      if (!this.hasBeenAirborne && !simVars.engineRunning) {
        console.log("[FlightTracker] Engine stopped before takeoff — reset");
        this.resetStats();
        freeFlightState.status.set("idle");
        return;
      }
    }
  }

  // ═══════════════════════════════════════
  // SESSION COMPLETE — Successful landing
  // ═══════════════════════════════════════

  private async finishSession(currentFuel: number, fuelCapacity: number): Promise<void> {
    if (!this.currentAircraftId) return;

    // 1. POSITION — SimVar at landing time
    const landingAirport = positionState.simVarAirport.get();

    if (landingAirport && landingAirport !== "----" && landingAirport !== "ZZZZ") {
      await PositionService.onSuccessfulLanding(this.currentAircraftId, landingAirport);
    } else {
      console.warn("[FlightTracker] Landing at unknown airport — BDD position unchanged");
    }

    // 2. WEAR — with REAL stats
    try {
      await FleetRouter.applyBackgroundWear(
        this.currentAircraftId,
        this.flightMinutes,
        this.landingFpm,
        this.maxGForce
      );
    } catch (e) {
      console.error("[FlightTracker] Wear application failed:", e);
    }

    // 2b. W&T MSFS — read and merge at landing
    try {
      const msfsState = WearTearReaderService.readMsfsWearState();
      const msfsFailures = WearTearReaderService.checkMsfsFailures();

      if (Object.keys(msfsState).length > 0 || Object.keys(msfsFailures).length > 0) {
        const ac = await DatabaseManager.get<Aircraft>("aircraft", this.currentAircraftId);
        if (ac?.systems && typeof (ac.systems as any).engine_condition === "number") {
          const sys = ac.systems as any;

          // Merge: take worst between BDD and MSFS
          const merged = WearTearReaderService.mergeWithBdd(sys, msfsState);
          for (const key of Object.keys(merged)) {
            if (key.endsWith("_condition")) {
              sys[key] = merged[key];
            }
          }

          // Apply MSFS failures (tire burst, etc.)
          for (const [system, failed] of Object.entries(msfsFailures)) {
            if (failed) {
              sys[`${system}_condition`] = 0;
              sys[`${system}_failed`] = true;
              console.warn(`[FlightTracker] MSFS failure detected: ${system}`);
            }
          }

          // Recalculate overall condition
          const totalCondition = ALL_SYSTEMS_V2.reduce((sum, name) => {
            return sum + ((sys[`${name}_condition`] as number) ?? 100);
          }, 0);
          ac.condition = Math.round(totalCondition / ALL_SYSTEMS_V2.length);

          await DatabaseManager.put("aircraft", ac);
          console.log("[FlightTracker] W&T MSFS merged with BDD at landing");
        }
      }
    } catch (e) {
      console.error("[FlightTracker] W&T MSFS merge failed:", e);
    }

    // 3. FUEL — final sync
    try {
      await FleetRouter.syncFuel(this.currentAircraftId, currentFuel, fuelCapacity);
    } catch (e) {
      console.error("[FlightTracker] Fuel sync failed:", e);
    }

    // 4. XP + CAREER STATS
    const grade = this.calculateGrade();
    const xp = this.calculateXP(grade);

    if (isSoloMode()) {
      try {
        const player = await DatabaseManager.getPlayer();
        if (player) {
          // Award XP
          if (xp > 0) {
            player.xp += xp;
            await DatabaseManager.savePlayer(player);
            DatabaseManager.forceSaveSync();
            console.log(`[FlightTracker] Awarded ${xp} XP (total: ${player.xp})`);
          }

          // Update career stats
          const careerStats = await DatabaseManager.getOrCreatePilotCareerStats(player.id);
          careerStats.total_flight_time_minutes += Math.round(this.flightMinutes);
          careerStats.total_landings += 1;
          careerStats.total_distance_nm += Math.round(this.distanceNm);
          await DatabaseManager.savePilotCareerStats(careerStats);
          console.log(`[FlightTracker] Career stats updated: ${careerStats.total_flight_time_minutes}min, ${careerStats.total_landings} landings`);

          // Refresh authState so profile UI shows updated XP + stats immediately
          const currentUser = authState.currentUser.get();
          if (currentUser) {
            authState.currentUser.set({
              ...currentUser,
              xp: player.xp,
              career_stats: {
                total_missions: careerStats.total_missions,
                total_flight_time_minutes: careerStats.total_flight_time_minutes,
                total_distance_nm: careerStats.total_distance_nm,
                average_grade: careerStats.average_grade,
              },
            });
          }
        }
      } catch (e) {
        console.error("[FlightTracker] XP/career stats save failed:", e);
      }
    }

    // 5. HISTORY — use detected airport (lat/lon fallback when GPS = "----")
    const detectedAirport = PositionService.getDetectedSimAirport();
    const arrivalIcao = detectedAirport || (landingAirport !== "----" ? landingAirport : "????");
    try {
      await DatabaseManager.saveFlightHistory({
        id: `ff_${Date.now()}`,
        type: "freeflight",
        date: Date.now(),
        departure_icao: this.departureIcao,
        arrival_icao: arrivalIcao,
        aircraft_id: this.currentAircraftId,
        aircraft_type: "",
        aircraft_reg: this.currentAircraftReg,
        distance_nm: Math.round(this.distanceNm),
        flight_time_minutes: Math.round(this.flightMinutes),
        score_total: this.calculateScore(),
        grade: grade,
        xp_earned: xp,
        money_earned: 0,
        landing_fpm: this.landingFpm,
        max_gforce: this.maxGForce,
        bonuses: {
          real_time: false,
          night: false,
          atc: false,
          fuel_eco: false,
          no_autopilot: false,
          bad_weather: false,
        },
        weather_visibility_nm: 0,
        weather_wind_kts: 0,
        atc_compliance: 0,
        atc_violations: 0,
      });
    } catch (e) {
      console.error("[FlightTracker] History save failed:", e);
    }

    // 6. CALLBACK — Show recap
    const score = this.calculateScore();
    const recapData: FreeFlightRecapData = {
      departure_icao: this.departureIcao,
      arrival_icao: arrivalIcao,
      distance_nm: Math.round(this.distanceNm),
      flight_time_minutes: Math.round(this.flightMinutes),
      score_landing: this.getLandingScore(),
      score_gforce: this.getGForceScore(),
      score_total: score,
      grade: grade,
      landing_fpm: Math.round(this.landingFpm),
      landing_quality: this.getLandingQuality(),
      max_gforce: Math.round(this.maxGForce * 100) / 100,
      bonuses: {
        real_time: { active: false, multiplier: 1 },
        night: { active: false, multiplier: 1 },
        atc: { active: false, multiplier: 1 },
        fuel_eco: { active: false, multiplier: 1 },
        no_autopilot: { active: false, multiplier: 1 },
        bad_weather: { active: false, multiplier: 1 },
      },
      bonus_multiplier_total: 1,
      xp_earned: xp,
      money_earned: 0,
      weather_visibility_nm: 0,
      weather_wind_kts: 0,
      weather_precipitation: false,
      fuel_remaining_percent: 0,
      atc_compliance: 0,
      atc_violations: 0,
    };

    this.callbacks?.onSessionComplete(recapData);

    // 7. UI — show end flight confirm popup
    freeFlightState.showEndFlightConfirm.set(true);

    // 8. RESET
    this.resetStats();
  }

  private async applyPartialWear(): Promise<void> {
    if (!this.currentAircraftId || this.flightMinutes < 1) return;

    try {
      await FleetRouter.applyBackgroundWear(
        this.currentAircraftId,
        this.flightMinutes,
        0, // No landing
        this.maxGForce
      );
    } catch (e) {
      console.error("[FlightTracker] Partial wear failed:", e);
    }
  }

  // ═══════════════════════════════════════
  // SCORING
  // ═══════════════════════════════════════

  private calculateScore(): number {
    let score = 1000;

    // Landing penalty
    if (this.landingFpm > 500) score -= 200;
    else if (this.landingFpm > 300) score -= 100;
    else if (this.landingFpm > 200) score -= 50;

    // Landing bonus
    if (this.landingFpm < 100) score += 150;
    if (this.landingFpm < 50) score += 100;

    // G-force penalty
    if (this.maxGForce > 2.5) score -= 100;

    // Overspeed penalty
    if (this.hadOverspeed) score -= 100;

    return Math.max(0, score);
  }

  private getLandingScore(): number {
    if (this.landingFpm < 50) return 250;
    if (this.landingFpm < 100) return 200;
    if (this.landingFpm < 200) return 150;
    if (this.landingFpm < 300) return 100;
    if (this.landingFpm < 500) return 50;
    return 0;
  }

  private getGForceScore(): number {
    return this.maxGForce > 2.5 ? -100 : 0;
  }

  private getLandingQuality(): string {
    if (this.landingFpm < 50) return "butter";
    if (this.landingFpm < 100) return "smooth";
    if (this.landingFpm < 200) return "normal";
    if (this.landingFpm < 500) return "hard";
    return "crash";
  }

  private calculateGrade(): string {
    const score = this.calculateScore();
    if (score >= 1200) return "S";
    if (score >= 1000) return "A";
    if (score >= 800) return "B";
    if (score >= 600) return "C";
    if (score >= 400) return "D";
    return "F";
  }

  private calculateXP(grade: string): number {
    const baseXP = Math.floor(this.flightMinutes * 2);
    const gradeMultiplier: Record<string, number> = {
      S: 2.0,
      A: 1.5,
      B: 1.2,
      C: 1.0,
      D: 0.7,
      F: 0.3,
    };
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
    this.hasBeenAirborne = false;
    this.departureIcao = "";
    this.touchdownFpm = 0;
    this.lastLat = 0;
    this.lastLon = 0;

    // Reset UI counters (status stays as-is)
    freeFlightState.flightTimeMinutes.set(0);
    freeFlightState.distanceFlownNm.set(0);
    freeFlightState.landingsCount.set(0);
    freeFlightState.estimatedXp.set(0);
  }

  isTracking(): boolean {
    return this.isActive && this.wasFlying;
  }

  getFlightMinutes(): number {
    return this.flightMinutes;
  }
}

export const FlightTracker = new FlightTrackerClass();
