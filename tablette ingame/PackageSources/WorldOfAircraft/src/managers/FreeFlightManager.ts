/**
 * FreeFlightManager - Background career tracking (P2P mode)
 *
 * Runs automatically in background when:
 * - Player is logged in
 * - Has a valid aircraft from fleet
 * - No active mission
 *
 * Pauses when mission is active, resumes when mission ends.
 * Tracks: flight time, distance, landings, fuel → XP
 */

import { freeFlightState, resetFreeFlightState } from "../state/FreeFlightState";
import { authState } from "../state/AuthState";
import { WorldRouter, FreeFlightRouter, PlayerRouter } from "../services";

// Declare SimVar for TypeScript
declare const SimVar: {
  GetSimVarValue(name: string, unit: string): number | boolean | string;
};

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const FREE_FLIGHT_TRACKING_INTERVAL_MS = 5000; // 5 seconds
const XP_PER_MINUTE = 2;                        // Base XP per minute of flight
const XP_PER_LANDING = 50;                      // Bonus XP per landing
const XP_PER_100NM = 25;                        // Bonus XP per 100nm flown
const MIN_LANDING_SPEED_KTS = 5;                // Below this = landed

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface FreeFlightCallbacks {
  onLandingDetected: (airport: string, totalLandings: number) => void;
  onStatsUpdated: (flightTime: number, distance: number, xp: number) => void;
  onSessionComplete: (xpEarned: number, flightTime: number, distance: number, landings: number) => void;
  onError: (error: string) => void;
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

    // Read initial position
    const lat = SimVar.GetSimVarValue("PLANE LATITUDE", "degrees") as number;
    const lon = SimVar.GetSimVarValue("PLANE LONGITUDE", "degrees") as number;
    const fuel = SimVar.GetSimVarValue("FUEL TOTAL QUANTITY", "gallons") as number;

    this.lastLat = lat;
    this.lastLon = lon;
    this.wasOnGround = true;

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
    const parkingBrake = SimVar.GetSimVarValue("BRAKE PARKING POSITION", "boolean") as boolean;

    // Update altitude and speed
    freeFlightState.currentAltitude.set(Math.round(alt));
    freeFlightState.groundSpeed.set(Math.round(gs));
    freeFlightState.isOnGround.set(onGround);

    // Calculate flight time
    if (this.sessionStartTime) {
      const elapsedMs = Date.now() - this.sessionStartTime.getTime();
      const elapsedMinutes = elapsedMs / 60000;
      freeFlightState.flightTimeMinutes.set(elapsedMinutes);
    }

    // Calculate distance flown (accumulative)
    if (this.lastLat !== 0 && this.lastLon !== 0) {
      const segmentDistance = this.calculateDistanceNm(this.lastLat, this.lastLon, lat, lon);
      if (segmentDistance > 0.01 && segmentDistance < 10) { // Sanity check
        const totalDistance = freeFlightState.distanceFlownNm.get() + segmentDistance;
        freeFlightState.distanceFlownNm.set(totalDistance);
      }
    }
    this.lastLat = lat;
    this.lastLon = lon;

    // Calculate fuel used
    const startFuel = freeFlightState.startFuelGallons.get();
    const fuelUsed = Math.max(0, startFuel - currentFuel);
    freeFlightState.fuelUsedGallons.set(fuelUsed);

    // Landing detection
    if (onGround && !this.wasOnGround && gs < MIN_LANDING_SPEED_KTS) {
      const landings = freeFlightState.landingsCount.get() + 1;
      freeFlightState.landingsCount.set(landings);
      console.log("[FreeFlightManager] Landing detected! Total:", landings);

      // P2P: Try to detect airport using local database
      void this.detectAndSetCurrentAirport(lat, lon);
    }
    this.wasOnGround = onGround;

    // Update XP estimate
    const flightTime = freeFlightState.flightTimeMinutes.get();
    const landings = freeFlightState.landingsCount.get();
    const distance = freeFlightState.distanceFlownNm.get();
    const estimatedXp = Math.floor(flightTime) * XP_PER_MINUTE
                      + landings * XP_PER_LANDING
                      + Math.floor(distance / 100) * XP_PER_100NM;
    freeFlightState.estimatedXp.set(estimatedXp);

    // ========== PARKING BRAKE DETECTION (END SESSION) ==========
    if (parkingBrake && onGround && gs < MIN_LANDING_SPEED_KTS && !this.parkingBrakeTriggered) {
      this.parkingBrakeTriggered = true;
      console.log("[FreeFlightManager] PARKING BRAKE SET - Triggering session complete popup");

      // Show confirmation popup with stats
      freeFlightState.showEndFlightConfirm.set(true);
      this.callbacks?.onSessionComplete(estimatedXp, flightTime, distance, landings);
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
   */
  private async endLocalSession(): Promise<void> {
    if (!this.currentAircraftId) return;

    const xp = freeFlightState.estimatedXp.get();
    const endAirport = freeFlightState.currentAirport.get() || freeFlightState.departureAirport.get();

    try {
      // End the session
      await FreeFlightRouter.endSession(this.currentAircraftId, endAirport);

      // Award XP to player
      if (xp > 0) {
        await PlayerRouter.updateXP(xp);
        console.log(`[FreeFlightManager] Session ended, awarded ${xp} XP`);
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
