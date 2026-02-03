/**
 * TrackingManager - Flight tracking and checkpoint validation
 * Extracted from CarrierPlus.tsx for better maintainability
 *
 * Handles:
 * - Flight tracking (V1.0/V2.0 with waypoints)
 * - Background tracking (anti-cheat)
 * - Checkpoint validation
 * - Progress calculation
 * - Bonus calculations (night, cargo, eco, real-time)
 */

import { Subject } from "@microsoft/msfs-sdk";
import { FLIGHT_TRACKING_INTERVAL_MS, BACKGROUND_TRACKING_INTERVAL_MS } from "../constants";
import { MissionRouter } from "../services";
import { authState } from "../state/AuthState";
import type { ActiveMission, MissionCheckpoint, MissionAircraftInfo } from "../types";

// Declare SimVar for TypeScript
declare const SimVar: {
  GetSimVarValue(name: string, unit: string): number | boolean | string;
  SetSimVarValue(name: string, unit: string, value: number): void;
};

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface TrackingState {
  // Progress
  distanceFlown: number;
  progressPercent: number;
  currentAltitude: number;
  fuelPercent: number;

  // Time
  simRate: number;
  canAccelerate: boolean;
  apActive: boolean;
  realTime: string;
  simTime: string;
  timeRatio: number;

  // Bonuses
  bonusNight: number;
  bonusCargo: number;
  bonusEco: number;
  bonusRealTime: number;
  bonusLanding: string;

  // Cargo
  cargoExpected: number;
  cargoActual: number;
  fuelUsed: number;
  fuelMax: number;

  // ATC
  atcCompliance: number;
  atcViolations: number;

  // Waypoints
  waypointsPassed: number;

  // Phase
  flightPhaseId: string;
  flightPhaseText: string;
  flightPhaseColor: string;
}

export interface BackgroundTrackingState {
  flightStartTime: Date | null;
  flightMinutes: number;
  maxGForce: number;
  landingFpm: number;
  hadOverspeed: boolean;
  wasFlying: boolean;
  lastFuelGallons: number;
  currentAircraftId: string | null;
  lastSyncTime: number;
}

export interface TrackingCallbacks {
  getAuthToken: () => string | null;
  getActiveMission: () => ActiveMission | null;
  getMissionCheckpoints: () => MissionCheckpoint[];
  getMissionAircraft: () => MissionAircraftInfo | null;
  getAircraftCargoWeight: () => number;
  getWaypointsTotal: () => number;
  getMissionDistanceNm: () => number;

  // V2.0: Additional getters for flight tracking
  getWaypointsPassed: () => number;
  getClosestAirport: () => string;
  getTotalPayload: () => number;

  // State updates
  onTrackingStateUpdate: (state: Partial<TrackingState>) => void;
  onCheckpointValidated: (checkpointSeq: number) => void;
  onFlightPhaseChange: (phaseId: string, phaseText: string, phaseColor: string) => void;
  onWaypointPassed: (count: number) => void;
  onCheckpointsUpdate: (checkpoints: MissionCheckpoint[]) => void;

  // V2.0: Mission completion trigger
  onMissionCompleteTrigger: () => void;
  onTouchdown: (fpm: number) => void;

  // Background tracking
  onBackgroundWearApply: (aircraftId: string, flightMinutes: number, avgAltitude: number, avgSpeed: number) => Promise<void>;
  onBackgroundFuelSync: (aircraftId: string, fuelGallons: number, fuelCapacity: number) => Promise<void>;

  // Translation
  t: (section: string, key: string) => string;
}

// ═══════════════════════════════════════════════════════════════════════════
// TRACKING MANAGER CLASS
// ═══════════════════════════════════════════════════════════════════════════

class TrackingManager {
  // Flight tracking state
  private flightTrackingActive = false;
  private flightTrackingInterval: number | null = null;
  private flightStartTime: Date | null = null;

  // V1.0 flight data
  private maxGForce = 1.0;
  private landingFpm = 0;
  private payloadVerificationDone = false;
  private parkingBrakeWarningShown = false;
  private engineShutdownWarningShown = false;

  // V2.0 waypoint tracking
  private lastWpNextId = "";
  private autopilotEverUsed = false;

  // V2.1 progress tracking
  private originLat = 0;
  private originLon = 0;
  private destLat = 0;
  private destLon = 0;
  private fuelStartPercent = 0;

  // V1.0 real-time tracking
  private realTimeStartMs = 0;
  private simTimeStartSec = 0;
  private lastSimTimeSec = 0;

  // V1.0 checkpoint tracking
  private nextCheckpointSeq = 1;
  private lastCheckpointCheckMs = 0;

  // V2.3 ATC tracking
  private atcClearedTakeoff = false;
  private atcClearedLanding = false;
  private tookOffWithoutClearance = false;
  private landedWithoutClearance = false;

  // V2.0 additional tracking state
  private wasOnGround = true;
  private waypointsPassed = 0;
  private currentProgressPercent = 0;
  private payloadVerifiedLbs = 0;
  private cargoExpectedKg = 0;

  // Background tracking state
  private bgTrackerInterval: number | null = null;
  private bgFlightStartTime: Date | null = null;
  private bgFlightMinutes = 0;
  private bgMaxGForce = 1.0;
  private bgLandingFpm = 0;
  private bgHadOverspeed = false;
  private bgWasFlying = false;
  private bgLastFuelGallons = 0;
  private bgCurrentAircraftId: string | null = null;
  private bgLastSyncTime = 0;
  private bgAvgAltitude = 0;
  private bgAvgSpeed = 0;
  private bgAltitudeSum = 0;
  private bgSpeedSum = 0;
  private bgSampleCount = 0;

  // Callbacks
  private callbacks: TrackingCallbacks | null = null;

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  initialize(callbacks: TrackingCallbacks): void {
    this.callbacks = callbacks;
    console.log("[TrackingManager] Initialized");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITY FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Calculate distance between two points in nautical miles (Haversine formula)
   */
  haversineDistanceNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3440.065; // Earth radius in nautical miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Format decimal coordinate to GPS format (N49deg15.2 E002deg25.6)
   */
  formatCoordinate(decimal: number, isLat: boolean): string {
    const direction = isLat
      ? (decimal >= 0 ? 'N' : 'S')
      : (decimal >= 0 ? 'E' : 'W');
    const abs = Math.abs(decimal);
    const degrees = Math.floor(abs);
    const minutes = (abs - degrees) * 60;
    return `${direction}${degrees}deg${minutes.toFixed(1)}`;
  }

  /**
   * Calculate bearing between two points
   */
  calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (deg: number) => deg * Math.PI / 180;
    const toDeg = (rad: number) => rad * 180 / Math.PI;
    const dLon = toRad(lon2 - lon1);
    const lat1Rad = toRad(lat1);
    const lat2Rad = toRad(lat2);
    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
              Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
    let bearing = toDeg(Math.atan2(y, x));
    return (bearing + 360) % 360;
  }

  /**
   * Get landing quality string from FPM
   */
  getLandingQuality(fpm: number): string {
    const absFpm = Math.abs(fpm);
    if (absFpm <= 60) return "Butter";
    if (absFpm <= 120) return "Smooth";
    if (absFpm <= 200) return "Good";
    if (absFpm <= 300) return "Firm";
    if (absFpm <= 400) return "Hard";
    if (absFpm <= 600) return "Rough";
    if (absFpm <= 1000) return "Very Hard";
    return "Crash";
  }

  /**
   * Format time in HH:MM:SS
   */
  formatTimeHMS(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FLIGHT TRACKING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if flight tracking is active
   */
  isFlightTrackingActive(): boolean {
    return this.flightTrackingActive;
  }

  /**
   * Get current max G-force recorded
   */
  getMaxGForce(): number {
    return this.maxGForce;
  }

  /**
   * Get landing FPM
   */
  getLandingFpm(): number {
    return this.landingFpm;
  }

  /**
   * Get flight start time
   */
  getFlightStartTime(): Date | null {
    return this.flightStartTime;
  }

  /**
   * Get real-time start milliseconds
   */
  getRealTimeStartMs(): number {
    return this.realTimeStartMs;
  }

  /**
   * Get sim time start seconds
   */
  getSimTimeStartSec(): number {
    return this.simTimeStartSec;
  }

  /**
   * Get if autopilot was ever used
   */
  getAutopilotEverUsed(): boolean {
    return this.autopilotEverUsed;
  }

  /**
   * Set landing FPM (called when landing detected)
   */
  setLandingFpm(fpm: number): void {
    this.landingFpm = fpm;
  }

  /**
   * Start V1.0/V2.0 flight tracking with waypoint-based progression
   */
  startFlightTrackingV1(): void {
    if (!this.callbacks) {
      console.error("[TrackingManager] Not initialized - call initialize() first");
      return;
    }

    // Stop any existing tracking first
    this.stopFlightTracking();

    // Reset all tracking variables
    this.resetTrackingVariables();

    console.log("[TrackingManager] Starting V2.0 flight tracking (waypoint-based)");
    this.flightTrackingActive = true;
    this.payloadVerificationDone = false;
    this.parkingBrakeWarningShown = false;
    this.engineShutdownWarningShown = false;
    this.maxGForce = 1.0;
    this.landingFpm = 0;
    this.flightStartTime = new Date();

    // V2.0: Initialize waypoint tracking
    this.lastWpNextId = "";
    this.autopilotEverUsed = false;

    // Get waypoints total from callback
    const waypointsTotal = this.callbacks.getWaypointsTotal();
    console.log("[TrackingManager] V2.0: Tracking mission with", waypointsTotal, "waypoints");

    // Initialize with current GPS WP NEXT ID
    try {
      this.lastWpNextId = SimVar.GetSimVarValue("GPS WP NEXT ID", "string") as string || "";
      console.log("[TrackingManager] V2.0: Initial GPS WP NEXT ID:", this.lastWpNextId);
    } catch (e) {
      this.lastWpNextId = "";
    }

    // Store origin coordinates for progress calculation
    try {
      this.originLat = SimVar.GetSimVarValue("PLANE LATITUDE", "degrees") as number;
      this.originLon = SimVar.GetSimVarValue("PLANE LONGITUDE", "degrees") as number;
      console.log("[TrackingManager] Origin coordinates:", this.originLat, this.originLon);
    } catch (e) {
      this.originLat = 0;
      this.originLon = 0;
    }

    // Store initial fuel percentage
    try {
      const fuelCapacity = SimVar.GetSimVarValue("FUEL TOTAL CAPACITY", "gallons") as number;
      const fuelQuantity = SimVar.GetSimVarValue("FUEL TOTAL QUANTITY", "gallons") as number;
      this.fuelStartPercent = fuelCapacity > 0 ? Math.round((fuelQuantity / fuelCapacity) * 100) : 100;
      console.log("[TrackingManager] Initial fuel:", this.fuelStartPercent, "%");
    } catch (e) {
      this.fuelStartPercent = 100;
    }

    // Store expected cargo weight
    const expectedCargo = this.callbacks.getAircraftCargoWeight();
    console.log("[TrackingManager] Expected cargo:", expectedCargo, "kg");

    // Initialize real-time tracking
    this.realTimeStartMs = Date.now();
    try {
      this.simTimeStartSec = SimVar.GetSimVarValue("E:ABSOLUTE TIME", "seconds") as number;
      this.lastSimTimeSec = this.simTimeStartSec;
    } catch (e) {
      this.simTimeStartSec = 0;
      this.lastSimTimeSec = 0;
    }

    // Poll at configured interval
    this.flightTrackingInterval = window.setInterval(() => {
      this.trackFlightV1();
    }, FLIGHT_TRACKING_INTERVAL_MS);
  }

  /**
   * Start V2.0 flight tracking with full state tracking
   */
  startFlightTracking(): void {
    if (this.flightTrackingActive) return;

    console.log("[TrackingManager] Starting V2.0 flight tracking");
    this.flightTrackingActive = true;
    this.payloadVerificationDone = false;
    this.parkingBrakeWarningShown = false;
    this.engineShutdownWarningShown = false;
    this.maxGForce = 1.0;
    this.landingFpm = 0;
    this.flightStartTime = new Date();

    // V2.0 initialization
    this.waypointsPassed = 0;
    this.wasOnGround = true;
    this.currentProgressPercent = 0;
    this.payloadVerifiedLbs = 0;
    this.autopilotEverUsed = false;

    // Initialize GPS waypoint ID
    try {
      this.lastWpNextId = SimVar.GetSimVarValue("GPS WP NEXT ID", "string") as string || "";
    } catch (e) { this.lastWpNextId = ""; }

    // Store origin coordinates
    try {
      this.originLat = SimVar.GetSimVarValue("PLANE LATITUDE", "degrees") as number;
      this.originLon = SimVar.GetSimVarValue("PLANE LONGITUDE", "degrees") as number;
    } catch (e) { this.originLat = 0; this.originLon = 0; }

    // Store initial fuel
    try {
      const fuelCap = SimVar.GetSimVarValue("FUEL TOTAL CAPACITY", "gallons") as number;
      const fuelQty = SimVar.GetSimVarValue("FUEL TOTAL QUANTITY", "gallons") as number;
      this.fuelStartPercent = fuelCap > 0 ? Math.round((fuelQty / fuelCap) * 100) : 100;
    } catch (e) { this.fuelStartPercent = 100; }

    // Initialize time tracking
    this.realTimeStartMs = Date.now();
    try {
      this.simTimeStartSec = SimVar.GetSimVarValue("E:ABSOLUTE TIME", "seconds") as number;
    } catch (e) { this.simTimeStartSec = 0; }

    // Store expected cargo weight
    if (this.callbacks) {
      this.cargoExpectedKg = this.callbacks.getAircraftCargoWeight();
    }

    // ATC tracking reset
    this.atcClearedTakeoff = false;
    this.atcClearedLanding = false;
    this.tookOffWithoutClearance = false;
    this.landedWithoutClearance = false;

    // Poll at configured interval - use V1 full tracking
    this.flightTrackingInterval = window.setInterval(() => {
      this.trackFlightV1();
    }, FLIGHT_TRACKING_INTERVAL_MS);
  }

  /**
   * Stop flight tracking
   */
  stopFlightTracking(): void {
    if (!this.flightTrackingActive) return;

    console.log("[TrackingManager] Stopping flight tracking");
    this.flightTrackingActive = false;

    if (this.flightTrackingInterval) {
      window.clearInterval(this.flightTrackingInterval);
      this.flightTrackingInterval = null;
    }
  }

  /**
   * Reset all tracking variables to initial state
   */
  resetTrackingVariables(): void {
    console.log("[TrackingManager] Resetting tracking variables");

    this.maxGForce = 1.0;
    this.autopilotEverUsed = false;
    this.fuelStartPercent = 0;
    this.originLat = 0;
    this.originLon = 0;
    this.destLat = 0;
    this.destLon = 0;

    // ATC tracking reset
    this.atcClearedTakeoff = false;
    this.atcClearedLanding = false;
    this.tookOffWithoutClearance = false;
    this.landedWithoutClearance = false;

    // Notify UI to reset
    if (this.callbacks) {
      this.callbacks.onTrackingStateUpdate({
        distanceFlown: 0,
        progressPercent: 0,
        currentAltitude: 0,
        fuelPercent: 100,
        simRate: 1,
        canAccelerate: false,
        apActive: false,
        realTime: "0:00:00",
        simTime: "0:00:00",
        timeRatio: 100,
        bonusNight: 0,
        bonusCargo: 100,
        bonusEco: 100,
        cargoExpected: 0,
        cargoActual: 0,
        fuelUsed: 0,
        fuelMax: 0,
        atcCompliance: 100,
        atcViolations: 0,
        bonusRealTime: 100,
        bonusLanding: "--",
        waypointsPassed: 0,
        flightPhaseId: "none",
        flightPhaseText: this.callbacks.t("missions", "waiting"),
        flightPhaseColor: "#9ca3af",
      });
    }
  }

  /**
   * Set destination coordinates (called after fetching from API)
   */
  setDestinationCoordinates(lat: number, lon: number): void {
    this.destLat = lat;
    this.destLon = lon;
    console.log("[TrackingManager] Destination coordinates set:", lat, lon);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FLIGHT TRACKING TICK (V1.0/V2.0)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * V2.0: Full flight tracking with phase detection, waypoints, ATC, cargo, mission completion
   */
  private trackFlightV1(): void {
    if (!this.flightTrackingActive || !this.callbacks) {
      return;
    }

    try {
      const mission = this.callbacks.getActiveMission();
      if (!mission) {
        console.log("[TrackingManager] No active mission - stopping tracking");
        this.stopFlightTracking();
        return;
      }

      // ========== READ SIMVARS ==========
      const lat = SimVar.GetSimVarValue("PLANE LATITUDE", "degrees") as number;
      const lon = SimVar.GetSimVarValue("PLANE LONGITUDE", "degrees") as number;
      const altitude = SimVar.GetSimVarValue("PLANE ALTITUDE", "feet") as number;
      const vs = SimVar.GetSimVarValue("VERTICAL SPEED", "feet per minute") as number;
      const onGround = SimVar.GetSimVarValue("SIM ON GROUND", "boolean") as boolean;
      const gForce = SimVar.GetSimVarValue("G FORCE", "GForce") as number;
      const apMaster = SimVar.GetSimVarValue("AUTOPILOT MASTER", "boolean") as boolean;
      const simRate = SimVar.GetSimVarValue("SIMULATION RATE", "number") as number || 1;
      const fuelCapacity = SimVar.GetSimVarValue("FUEL TOTAL CAPACITY", "gallons") as number;
      const fuelQuantity = SimVar.GetSimVarValue("FUEL TOTAL QUANTITY", "gallons") as number;
      const radioAlt = SimVar.GetSimVarValue("RADIO HEIGHT", "feet") as number;
      const parkingBrake = SimVar.GetSimVarValue("BRAKE PARKING POSITION", "boolean") as boolean;
      const engineRunning = SimVar.GetSimVarValue("ENG COMBUSTION:1", "boolean") as boolean;

      // ========== WAYPOINT TRACKING (V2.0) ==========
      const currentWpNextId = SimVar.GetSimVarValue("GPS WP NEXT ID", "string") as string || "";
      if (currentWpNextId !== this.lastWpNextId && this.lastWpNextId !== "") {
        this.waypointsPassed++;
        console.log(`[TrackingManager] Waypoint passed! ${this.waypointsPassed}/${this.callbacks.getWaypointsTotal()} - Next: ${currentWpNextId}`);
        this.callbacks.onWaypointPassed(this.waypointsPassed);
      }
      this.lastWpNextId = currentWpNextId;

      // ========== PROGRESS CALCULATION ==========
      const totalDist = this.callbacks.getMissionDistanceNm();
      let distanceFlown = 0;

      if (this.destLat !== 0 && this.destLon !== 0) {
        const distanceToDestination = this.haversineDistanceNm(lat, lon, this.destLat, this.destLon);
        distanceFlown = Math.max(0, totalDist - distanceToDestination);
      } else if (this.originLat !== 0 && this.originLon !== 0) {
        distanceFlown = this.haversineDistanceNm(this.originLat, this.originLon, lat, lon);
      }
      const progressPct = totalDist > 0 ? Math.round((distanceFlown / totalDist) * 100) : 0;
      this.currentProgressPercent = Math.min(Math.max(0, progressPct), 100);

      // ========== FLIGHT PHASE DETECTION (V2.2) ==========
      let phase: "taxi_out" | "climb" | "cruise" | "descent" | "taxi_in" = "cruise";
      let phaseIcon = "✈️";
      let phaseText = this.callbacks.t("missions", "cruising");
      let phaseColor = "#22c55e";

      if (onGround && this.currentProgressPercent < 10) {
        phase = "taxi_out"; phaseIcon = "🛫";
        phaseText = this.callbacks.t("missions", "taxiing"); phaseColor = "#22c55e";
      } else if (onGround && this.currentProgressPercent >= 10) {
        phase = "taxi_in"; phaseIcon = "🛬";
        phaseText = this.callbacks.t("missions", "taxiing"); phaseColor = "#22c55e";
      } else if (vs > 300 && this.currentProgressPercent < 30) {
        phase = "climb"; phaseIcon = "🛫";
        phaseText = this.callbacks.t("missions", "climbing"); phaseColor = "#f59e0b";
      } else if (vs < -300 && this.currentProgressPercent > 70) {
        phase = "descent"; phaseIcon = "🛬";
        phaseText = this.callbacks.t("missions", "descending"); phaseColor = "#f59e0b";
      } else if (this.currentProgressPercent > 90) {
        phase = "descent"; phaseIcon = "🛬";
        phaseText = this.callbacks.t("missions", "descending"); phaseColor = "#f59e0b";
      }

      this.callbacks.onFlightPhaseChange(phase, phaseText, phaseColor);

      // ========== AUTOPILOT TRACKING ==========
      if (apMaster) {
        this.autopilotEverUsed = true;
      }

      // ========== G-FORCE TRACKING ==========
      if (Math.abs(gForce) > this.maxGForce) {
        this.maxGForce = Math.abs(gForce);
        console.log("[TrackingManager] New max G-force:", this.maxGForce.toFixed(2));
      }

      // ========== FUEL TRACKING ==========
      const fuelPct = fuelCapacity > 0 ? Math.round((fuelQuantity / fuelCapacity) * 100) : 100;
      const fuelUsedPct = Math.max(0, this.fuelStartPercent - fuelPct);
      const fuelUsedKg = (fuelUsedPct / 100) * fuelCapacity * 3.785 * 0.8; // gallons to kg

      // ========== TIME TRACKING ==========
      const realTimeMs = Date.now() - this.realTimeStartMs;
      const realTimeSeconds = Math.floor(realTimeMs / 1000);
      let simTimeSeconds = 0;
      try {
        const currentSimTime = SimVar.GetSimVarValue("E:ABSOLUTE TIME", "seconds") as number;
        simTimeSeconds = Math.floor(currentSimTime - this.simTimeStartSec);
      } catch (e) { simTimeSeconds = realTimeSeconds; }
      const timeRatio = realTimeSeconds > 0 ? Math.round((realTimeSeconds / Math.max(1, simTimeSeconds)) * 100) : 100;

      // ========== BONUS CALCULATIONS ==========
      // Night bonus
      let bonusNight = 0;
      try {
        const localTimeSeconds = SimVar.GetSimVarValue("E:LOCAL TIME", "seconds") as number;
        const localHour = Math.floor(localTimeSeconds / 3600) % 24;
        bonusNight = (localHour < 6 || localHour >= 20) ? 100 : 0;
      } catch (e) { bonusNight = 0; }

      // Cargo bonus
      let bonusCargo = 100;
      try {
        const expectedCargoKg = this.cargoExpectedKg;
        const actualCargoLbs = this.callbacks.getTotalPayload();
        const actualCargoKg = actualCargoLbs * 0.453592;
        if (expectedCargoKg > 0) {
          const tolerance = expectedCargoKg * 0.10;
          const diff = Math.abs(actualCargoKg - expectedCargoKg);
          if (diff <= tolerance) {
            bonusCargo = 100;
          } else {
            const penalty = Math.min(100, (diff / expectedCargoKg) * 100);
            bonusCargo = Math.max(0, Math.round(100 - penalty));
          }
        }
      } catch (e) { bonusCargo = 0; }

      // Eco bonus
      const fuelMaxKg = totalDist * 5;
      const bonusEco = fuelMaxKg > 0 ? Math.round(Math.max(0, 100 - (fuelUsedKg / fuelMaxKg) * 100)) : 100;

      // Real-time bonus
      let bonusRealTime = 0;
      if (timeRatio >= 100) bonusRealTime = 100;
      else if (timeRatio >= 90) bonusRealTime = 70;
      else if (timeRatio >= 75) bonusRealTime = 50;
      else if (timeRatio >= 50) bonusRealTime = 30;
      else if (timeRatio >= 25) bonusRealTime = 15;

      // ========== ATC COMPLIANCE TRACKING (V2.3) ==========
      let atcScore = 100;
      let atcViolations = 0;
      try {
        const atcClearedTakeoffNow = SimVar.GetSimVarValue("ATC CLEARED TAKEOFF", "boolean") as boolean;
        const atcClearedLandingNow = SimVar.GetSimVarValue("ATC CLEARED LANDING", "boolean") as boolean;
        this.atcClearedTakeoff = atcClearedTakeoffNow;
        this.atcClearedLanding = atcClearedLandingNow;

        if (!onGround && phase === "climb" && !this.tookOffWithoutClearance && !this.atcClearedTakeoff) {
          this.tookOffWithoutClearance = true;
          console.log("[TrackingManager] ATC VIOLATION: Took off without clearance!");
        }
        if (onGround && phase === "taxi_in" && !this.landedWithoutClearance && !this.atcClearedLanding) {
          this.landedWithoutClearance = true;
          console.log("[TrackingManager] ATC VIOLATION: Landed without clearance!");
        }
        if (this.tookOffWithoutClearance) { atcScore -= 50; atcViolations++; }
        if (this.landedWithoutClearance) { atcScore -= 50; atcViolations++; }
        atcScore = Math.max(0, atcScore);
      } catch (e) { /* ATC SimVars not available */ }

      // ========== CAN ACCELERATE ==========
      const canAccel = phase === "cruise" && apMaster;

      // ========== PAYLOAD VERIFICATION (500ft before landing) ==========
      if (!this.payloadVerificationDone && radioAlt < 500 && !onGround && vs < 0) {
        this.payloadVerifiedLbs = this.callbacks.getTotalPayload();
        this.payloadVerificationDone = true;
        console.log("[TrackingManager] Payload verified at 500ft:", this.payloadVerifiedLbs, "lbs");
      }

      // ========== TOUCHDOWN DETECTION ==========
      if (onGround && !this.wasOnGround) {
        this.landingFpm = Math.round(vs);
        console.log("[TrackingManager] TOUCHDOWN DETECTED! FPM:", this.landingFpm);
        this.callbacks.onTouchdown(this.landingFpm);
      }
      this.wasOnGround = onGround;

      // ========== MISSION COMPLETION DETECTION ==========
      const currentAirport = this.callbacks.getClosestAirport();
      if (parkingBrake && onGround && mission) {
        let atDestination = false;
        let detectionMethod = "";

        if (currentAirport !== "----") {
          atDestination = currentAirport.toUpperCase() === mission.destination_icao.toUpperCase();
          detectionMethod = `SimVar (${currentAirport})`;
        }
        if (!atDestination && this.currentProgressPercent >= 90) {
          atDestination = true;
          detectionMethod = `Progress (${this.currentProgressPercent}%)`;
        }

        if (atDestination) {
          console.log(`[TrackingManager] PARKING BRAKE SET at destination (${detectionMethod}) - Completing mission!`);
          this.callbacks.onMissionCompleteTrigger();
        } else if (!this.parkingBrakeWarningShown) {
          console.log(`[TrackingManager] Parking brake set at ${currentAirport}, but dest is ${mission.destination_icao}`);
          this.parkingBrakeWarningShown = true;
        }
      }
      if (!parkingBrake) { this.parkingBrakeWarningShown = false; }

      // ========== NOTIFY UI STATE UPDATE ==========
      this.callbacks.onTrackingStateUpdate({
        distanceFlown: Math.round(distanceFlown),
        progressPercent: this.currentProgressPercent,
        currentAltitude: Math.round(altitude),
        fuelPercent: fuelPct,
        simRate,
        canAccelerate: canAccel,
        apActive: apMaster,
        realTime: this.formatTimeHMS(realTimeSeconds),
        simTime: this.formatTimeHMS(simTimeSeconds),
        timeRatio,
        bonusNight,
        bonusCargo,
        bonusEco,
        bonusRealTime,
        cargoExpected: this.cargoExpectedKg,
        cargoActual: Math.round(this.callbacks.getTotalPayload() * 0.453592),
        fuelUsed: Math.round(fuelUsedKg),
        fuelMax: Math.round(fuelMaxKg),
        atcCompliance: atcScore,
        atcViolations,
        waypointsPassed: this.waypointsPassed,
        flightPhaseId: phase,
        flightPhaseText: phaseText,
        flightPhaseColor: phaseColor,
      });

      // Check checkpoints (V1.0)
      void this.checkCheckpoints();

    } catch (error) {
      console.error("[TrackingManager] Error in V2.0 flight tracking:", error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CHECKPOINT VALIDATION (V1.0)
  // ═══════════════════════════════════════════════════════════════════════════

  private async checkCheckpoints(): Promise<void> {
    if (!this.callbacks) return;

    const mission = this.callbacks.getActiveMission();
    const token = this.callbacks.getAuthToken();
    // P2P mode doesn't require token
    if (!mission || (!authState.isP2PMode.get() && !token)) return;

    const checkpoints = this.callbacks.getMissionCheckpoints();
    if (!checkpoints || checkpoints.length === 0) return;

    // Find next unvalidated checkpoint
    const nextCp = checkpoints.find(cp => !cp.validated);
    if (!nextCp) return;

    try {
      const lat = SimVar.GetSimVarValue("PLANE LATITUDE", "degrees") as number;
      const lon = SimVar.GetSimVarValue("PLANE LONGITUDE", "degrees") as number;
      const altitude = SimVar.GetSimVarValue("PLANE ALTITUDE", "feet") as number;
      const groundSpeed = SimVar.GetSimVarValue("GROUND VELOCITY", "knots") as number;

      // Calculate distance to checkpoint
      const distToCheckpoint = this.haversineDistanceNm(lat, lon, nextCp.latitude, nextCp.longitude);

      // Check if we're within the checkpoint radius
      if (distToCheckpoint <= nextCp.radius_nm) {
        console.log("[TrackingManager] Within checkpoint", nextCp.sequence, "radius - validating...");

        // Validate with backend (or local service in P2P mode)
        try {
          const result = await MissionRouter.validateCheckpoint(mission.id, {
            latitude: lat,
            longitude: lon,
            altitude_ft: altitude,
            groundspeed_kts: groundSpeed,
          });

          if (result.validated) {
            console.log("[TrackingManager] Checkpoint validated:", result);

            // Notify parent
            this.callbacks.onCheckpointValidated(nextCp.sequence);

            // Update local checkpoint state
            const updatedCheckpoints = checkpoints.map(cp =>
              cp.sequence === nextCp.sequence ? { ...cp, validated: true, validated_at: new Date().toISOString() } : cp
            );
            this.callbacks.onCheckpointsUpdate(updatedCheckpoints);
          }
        } catch (e) {
          console.warn("[TrackingManager] Checkpoint validation failed:", e);
        }
      }
    } catch (error) {
      console.error("[TrackingManager] Error checking checkpoint:", error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BACKGROUND TRACKING (Anti-cheat V1.6)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Start background tracking - runs even without active mission
   */
  startBackgroundTracking(): void {
    if (this.bgTrackerInterval) return; // Already running

    console.log("[TrackingManager] Starting background flight tracking");

    // Reset background tracking state
    this.bgFlightStartTime = null;
    this.bgFlightMinutes = 0;
    this.bgMaxGForce = 1.0;
    this.bgLandingFpm = 0;
    this.bgHadOverspeed = false;
    this.bgWasFlying = false;
    this.bgLastSyncTime = Date.now();
    this.bgAltitudeSum = 0;
    this.bgSpeedSum = 0;
    this.bgSampleCount = 0;

    // Get current aircraft ID
    if (this.callbacks) {
      const aircraft = this.callbacks.getMissionAircraft();
      this.bgCurrentAircraftId = aircraft?.id || null;
    }

    // Get initial fuel
    try {
      this.bgLastFuelGallons = SimVar.GetSimVarValue("FUEL TOTAL QUANTITY", "gallons") as number || 0;
    } catch (e) {
      this.bgLastFuelGallons = 0;
    }

    // Run at configured interval
    this.bgTrackerInterval = window.setInterval(() => {
      this.backgroundTrackerTick();
    }, BACKGROUND_TRACKING_INTERVAL_MS);

    // Also run immediately
    this.backgroundTrackerTick();
  }

  /**
   * Stop background tracking
   */
  stopBackgroundTracking(): void {
    if (this.bgTrackerInterval) {
      window.clearInterval(this.bgTrackerInterval);
      this.bgTrackerInterval = null;
    }
    console.log("[TrackingManager] Background tracking stopped");
  }

  /**
   * Reset background tracking state
   */
  resetBackgroundTracking(): void {
    this.bgFlightStartTime = null;
    this.bgFlightMinutes = 0;
    this.bgMaxGForce = 1.0;
    this.bgLandingFpm = 0;
    this.bgHadOverspeed = false;
    this.bgWasFlying = false;
  }

  /**
   * Background tracker tick - called at regular intervals
   */
  private backgroundTrackerTick(): void {
    // Don't track if there's an active mission (mission tracker handles it)
    if (!this.callbacks) return;

    const mission = this.callbacks.getActiveMission();
    if (mission) return;

    const token = this.callbacks.getAuthToken();
    // P2P mode doesn't require token
    if (!authState.isP2PMode.get() && !token) return;

    try {
      // Read SimVars
      const engineRunning = SimVar.GetSimVarValue("ENG COMBUSTION:1", "boolean") as boolean;
      const onGround = SimVar.GetSimVarValue("SIM ON GROUND", "boolean") as boolean;
      const altitude = SimVar.GetSimVarValue("PLANE ALTITUDE", "feet") as number || 0;
      const gForce = SimVar.GetSimVarValue("G FORCE", "GForce") as number || 1;
      const ias = SimVar.GetSimVarValue("AIRSPEED INDICATED", "knots") as number || 0;
      const touchdownVelocity = SimVar.GetSimVarValue("PLANE TOUCHDOWN NORMAL VELOCITY", "feet per second") as number || 0;

      // Get current aircraft
      const aircraft = this.callbacks.getMissionAircraft();
      if (aircraft) {
        this.bgCurrentAircraftId = aircraft.id;
      }

      // Only track G-force/overspeed when engine is running
      if (engineRunning) {
        if (Math.abs(gForce) > this.bgMaxGForce) {
          this.bgMaxGForce = Math.abs(gForce);
        }

        // Detect overspeed
        if ((altitude < 10000 && ias > 250) || (altitude >= 10000 && ias > 400)) {
          this.bgHadOverspeed = true;
        }
      }

      // Detect flight start
      if (engineRunning && !onGround && !this.bgWasFlying) {
        console.log("[TrackingManager] Background - Flight detected");
        this.bgFlightStartTime = new Date();
        this.bgWasFlying = true;
      }

      // Accumulate flight time and stats
      if (this.bgWasFlying && !onGround) {
        this.bgFlightMinutes += 0.5; // 30 seconds = 0.5 minutes
        this.bgAltitudeSum += altitude;
        this.bgSpeedSum += ias;
        this.bgSampleCount++;
      }

      // Detect landing
      if (this.bgWasFlying && onGround && altitude < 500) {
        const landingFpm = Math.abs(touchdownVelocity * 60);
        if (landingFpm > 50 && this.bgLandingFpm === 0) {
          this.bgLandingFpm = landingFpm;
          console.log("[TrackingManager] Background - Landing detected, FPM:", this.bgLandingFpm);
        }

        // Apply wear if we've flown enough
        if (this.bgFlightMinutes >= 1 && this.bgCurrentAircraftId) {
          const avgAlt = this.bgSampleCount > 0 ? this.bgAltitudeSum / this.bgSampleCount : 0;
          const avgSpd = this.bgSampleCount > 0 ? this.bgSpeedSum / this.bgSampleCount : 0;

          void this.callbacks.onBackgroundWearApply(
            this.bgCurrentAircraftId,
            this.bgFlightMinutes,
            avgAlt,
            avgSpd
          );

          // Reset after applying
          this.resetBackgroundTracking();
        }
      }
    } catch (error) {
      console.error("[TrackingManager] Error in background tracking:", error);
    }
  }

  /**
   * Get background tracking state
   */
  getBackgroundTrackingState(): BackgroundTrackingState {
    return {
      flightStartTime: this.bgFlightStartTime,
      flightMinutes: this.bgFlightMinutes,
      maxGForce: this.bgMaxGForce,
      landingFpm: this.bgLandingFpm,
      hadOverspeed: this.bgHadOverspeed,
      wasFlying: this.bgWasFlying,
      lastFuelGallons: this.bgLastFuelGallons,
      currentAircraftId: this.bgCurrentAircraftId,
      lastSyncTime: this.bgLastSyncTime,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const trackingManager = new TrackingManager();
