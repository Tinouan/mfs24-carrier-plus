/**
 * TrackingManager - Flight tracking and checkpoint validation
 * Extracted from AeroCorpOnline.tsx for better maintainability
 *
 * Handles:
 * - Flight tracking (V1.0/V2.0 with waypoints)
 * - Background tracking (anti-cheat)
 * - Checkpoint validation
 * - Progress calculation
 * - Bonus calculations (night, cargo, eco, real-time)
 */

import { Subject } from "@microsoft/msfs-sdk";
import { FLIGHT_TRACKING_INTERVAL_MS } from "../constants";
import { MissionRouter } from "../services";
import { isGameReady } from "../state/GameModeState";
import type { ActiveMission, MissionCheckpoint, MissionAircraftInfo, LandingRating } from "../types";
import { readFullSnapshot, FlightPhase, haversineDistanceNm as sharedHaversine, crossTrackDistanceM } from "../services/SimVarReader";
import { evaluateLightsStatus } from "../helpers/LightsHelper";
import type { TrackingSnapshot, FlightSummary } from "../services/SimVarReader";

// Global MSFS declarations in src/types/msfs-globals.d.ts

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

  // V2: Grade estimation (real-time)
  gradeEstimated: string;
  scoreEstimated: number;
  scoreGforce: number;
  gforceAlert: string;       // "ok" | "warning" | "critical"
  cargoFillPercent: number;

  // V2: ATC Suivi
  atcAssignedAlt: number;
  atcAltDeviation: boolean;
  atcCruiseSpd: number;
  atcSpdDeviation: boolean;

  // V5: Suivi vol
  suiviAtcMode: string;          // 'native' | 'gps_fallback'
  suiviCrossTrackNm: number;
  suiviRouteStatus: string;      // 'ok' | 'warning' | 'error'
  suiviInCruise: boolean;
  suiviAlert: string;

  // V6: Weather
  weatherScore: number; // 0-100

  // V3: Lights tracking
  lightNav: number;       // 0=grey, 1=green, 2=red
  lightStrobe: number;
  lightBeacon: number;
  lightLanding: number;
  lightTaxi: number;
  lightsMissing: number;       // count of required lights that are OFF
  lightsUnnecessary: number;   // count of ON-but-not-required lights
  lightsStatusColor: string;   // "green" | "red" | "orange"
  lightsAlert: string;         // contextual alert message ("" if OK)
}

// BackgroundTrackingState removed — background tracking now handled by FlightTracker

export interface TrackingCallbacks {
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
  getAircraftCargoCapacity: () => number;

  // State updates
  onTrackingStateUpdate: (state: Partial<TrackingState>) => void;
  onCheckpointValidated: (checkpointSeq: number) => void;
  onFlightPhaseChange: (phaseId: string, phaseText: string, phaseColor: string) => void;
  onWaypointPassed: (count: number) => void;
  onCheckpointsUpdate: (checkpoints: MissionCheckpoint[]) => void;

  // V2.0: Mission completion trigger
  onMissionCompleteTrigger: () => void;
  onTouchdown: (fpm: number) => void;

  // UI landing detection (separate from mission touchdown)
  onLandingRatingDetected: (fpm: number, rating: LandingRating) => void;

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

  // V1.0 real-time tracking (airborne only)
  private airborneRealTimeMs = 0;
  private airborneSimTimeSec = 0;
  private lastTickTimeMs = 0;
  private lastSimTimeSec = 0;

  // V1.0 checkpoint tracking
  private nextCheckpointSeq = 1;
  private lastCheckpointCheckMs = 0;

  // V2.3 ATC tracking
  private atcClearedTakeoff = false;
  private atcClearedLanding = false;
  private tookOffWithoutClearance = false;
  private landedWithoutClearance = false;

  // V3: Lights compliance tracking
  private lightsComplianceSum = 0;
  private lightsComplianceTicks = 0;

  // V5: Suivi vol — ATC mode detection
  private atcMode: 'native' | 'gps_fallback' = 'gps_fallback';
  private atcNativeDetected = false;
  private atcClearedTakeoffEver = false;
  private atcClearedLandingEver = false;
  private atcDiffNonZeroConsecutiveTicks = 0;

  // V5: Suivi vol — compliance ticks
  private altComplianceTicks = 0;
  private altComplianceOk = 0;
  private spdComplianceTicks = 0;
  private spdComplianceOk = 0;
  private routeComplianceTicks = 0;
  private routeComplianceOk = 0;

  // V5: Suivi vol — recommended values (GPS fallback)
  private recommendedAlt = 0;

  // V6: Weather difficulty
  private weatherScoreSamples: number[] = [];

  // V7: Flight mode (IFR/VFR)
  private flightMode: 'IFR' | 'VFR' = 'IFR';

  // V4: FlightSummary accumulators
  private tickCount = 0;
  private simRateSamples: number[] = [];
  private nightTickCount = 0;
  private totalTickCount = 0;
  private slewDetected = false;
  private crashDetected = false;
  private unlimitedFuelDetected = false;
  private atcAltDeviations: number[] = [];
  private atcDistDeviations: number[] = [];
  private touchdownVS = 0; // from PLANE TOUCHDOWN NORMAL VELOCITY * 60

  // V2.0 additional tracking state
  private wasOnGround = true;
  private waypointsPassed = 0;
  private currentProgressPercent = 0;
  private payloadVerifiedLbs = 0;
  private cargoExpectedKg = 0;

  // UI landing detection state (separate from mission tracking)
  private uiWasOnGround = true;

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
   * Get landing quality string from FPM (detailed version for mission recap)
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
   * Get landing rating from FPM (simplified version for UI state)
   */
  getLandingRating(fpm: number): LandingRating {
    const absFpm = Math.abs(fpm);
    if (absFpm < 100) return "excellent";
    if (absFpm < 300) return "good";
    if (absFpm < 600) return "acceptable";
    return "hard";
  }

  /**
   * Process landing detection for UI feedback (separate from mission tracking)
   * Called from AeroCorpOnline.readSimVars() on each update
   */
  processUILandingDetection(vs: number, onGround: boolean): void {
    if (!this.callbacks) return;

    // Detect landing transition: was in air, now on ground
    if (!this.uiWasOnGround && onGround) {
      const landingFpm = Math.abs(vs);
      const rating = this.getLandingRating(landingFpm);
      console.log("[TrackingManager] UI Landing detected - FPM:", landingFpm, "Rating:", rating);
      this.callbacks.onLandingRatingDetected(landingFpm, rating);
    }

    this.uiWasOnGround = onGround;
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
   * Get accumulated airborne real-time in milliseconds
   */
  getAirborneRealTimeMs(): number {
    return this.airborneRealTimeMs;
  }

  /**
   * Get accumulated airborne sim-time in seconds
   */
  getAirborneSimTimeSec(): number {
    return this.airborneSimTimeSec;
  }

  /**
   * Get if autopilot was ever used
   */
  getAutopilotEverUsed(): boolean {
    return this.autopilotEverUsed;
  }

  /**
   * Get lights compliance ratio (0.0 to 1.0)
   */
  getLightsCompliance(): number {
    if (this.lightsComplianceTicks <= 0) return 1.0;
    return this.lightsComplianceSum / this.lightsComplianceTicks;
  }

  /**
   * Get recommended cruise altitude based on mission distance and heading (IFR semi-circular rule)
   */
  getRecommendedAltitude(distanceNm: number, headingDeg: number): number {
    let baseAlt: number;
    if (distanceNm < 50)        baseAlt = 3000;
    else if (distanceNm < 100)  baseAlt = 5000;
    else if (distanceNm < 200)  baseAlt = 8000;
    else if (distanceNm < 400)  baseAlt = 15000;
    else if (distanceNm < 800)  baseAlt = 25000;
    else if (distanceNm < 1500) baseAlt = 35000;
    else                        baseAlt = 39000;

    // IFR semi-circular rule: East (0-179°) = odd thousands, West (180-359°) = even thousands
    if (baseAlt >= 3000) {
      const thousands = Math.round(baseAlt / 1000);
      const isEast = headingDeg >= 0 && headingDeg < 180;
      if (isEast) {
        // Odd: 3, 5, 7, 9, 11...
        if (thousands % 2 === 0) return (thousands + 1) * 1000;
      } else {
        // Even: 4, 6, 8, 10, 12...
        if (thousands % 2 !== 0) return (thousands + 1) * 1000;
      }
    }
    return baseAlt;
  }

  /**
   * Get flightpath compliance (weighted: alt×0.35 + spd×0.25 + route×0.40)
   */
  getFlightPathCompliance(): number {
    const alt = this.altComplianceTicks > 0 ? this.altComplianceOk / this.altComplianceTicks : 0;
    const spd = this.spdComplianceTicks > 0 ? this.spdComplianceOk / this.spdComplianceTicks : 0;
    const route = this.routeComplianceTicks > 0 ? this.routeComplianceOk / this.routeComplianceTicks : 0;
    return (alt * 0.35) + (spd * 0.25) + (route * 0.40);
  }

  /**
   * Get touchdown vertical speed (from PLANE TOUCHDOWN NORMAL VELOCITY)
   */
  getTouchdownVS(): number {
    return this.touchdownVS;
  }

  /**
   * Get accumulated flight summary for scoring
   */
  getFlightSummary(): FlightSummary {
    const simRateAvg = this.simRateSamples.length > 0
      ? this.simRateSamples.reduce((a, b) => a + b, 0) / this.simRateSamples.length
      : 1;
    const atcAltAvg = this.atcAltDeviations.length > 0
      ? this.atcAltDeviations.reduce((a, b) => a + b, 0) / this.atcAltDeviations.length
      : 0;
    const atcDistAvg = this.atcDistDeviations.length > 0
      ? this.atcDistDeviations.reduce((a, b) => a + b, 0) / this.atcDistDeviations.length
      : 0;

    const mission = this.callbacks?.getActiveMission();
    const totalDist = this.callbacks?.getMissionDistanceNm() || 0;
    const fuelSnap = readFullSnapshot(this.currentProgressPercent);

    return {
      originIcao: mission?.origin_icao || "",
      destIcao: mission?.destination_icao || "",
      aircraftTitle: fuelSnap.aircraftTitle,
      plannedDistanceNm: totalDist,
      actualDistanceNm: totalDist > 0 ? totalDist * (this.currentProgressPercent / 100) : 0,
      flightStartTime: this.flightStartTime ? this.flightStartTime.getTime() : 0,
      flightEndTime: Date.now(),
      flightDurationSec: Math.floor(this.airborneRealTimeMs / 1000),
      touchdownVS: this.touchdownVS,
      maxGForce: this.maxGForce,
      distanceRatio: totalDist > 0 ? (totalDist * (this.currentProgressPercent / 100)) / totalDist : 1,
      fuelPercentStart: this.fuelStartPercent,
      fuelPercentEnd: fuelSnap.fuelPercent,
      cargoPercent: fuelSnap.cargoPercent,
      isNightFlight: this.totalTickCount > 0 ? (this.nightTickCount / this.totalTickCount) > 0.5 : false,
      simRateAverage: simRateAvg,
      realtimeRatio: Math.min(1 / simRateAvg, 1.0) * 100,
      lightsCompliance: this.getLightsCompliance(),
      slewUsed: this.slewDetected,
      crashOccurred: this.crashDetected,
      unlimitedFuelUsed: this.unlimitedFuelDetected,
      atcAltDeviationAvg: atcAltAvg,
      atcDistDeviationAvg: atcDistAvg,
      // V5: Suivi vol compliance
      atcMode: this.atcMode,
      altCompliance: this.altComplianceTicks > 0 ? this.altComplianceOk / this.altComplianceTicks : 0,
      spdCompliance: this.spdComplianceTicks > 0 ? this.spdComplianceOk / this.spdComplianceTicks : 0,
      routeCompliance: this.routeComplianceTicks > 0 ? this.routeComplianceOk / this.routeComplianceTicks : 0,
      flightPathCompliance: this.getFlightPathCompliance(),
      // V6: Weather difficulty
      weatherDifficulty: this.weatherScoreSamples.length > 0
        ? Math.min(
            (this.weatherScoreSamples.reduce((a, b) => a + b, 0) / this.weatherScoreSamples.length) / 6,
            1.0
          )
        : 0,
      // V7: Flight mode
      flightMode: this.flightMode,
    };
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

    // Initialize airborne time tracking (accumulators, not timestamps)
    this.airborneRealTimeMs = 0;
    this.airborneSimTimeSec = 0;
    this.lastTickTimeMs = Date.now();
    try {
      this.lastSimTimeSec = SimVar.GetSimVarValue("E:ABSOLUTE TIME", "seconds") as number;
    } catch (e) {
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

    // Initialize airborne time tracking (accumulators)
    this.airborneRealTimeMs = 0;
    this.airborneSimTimeSec = 0;
    this.lastTickTimeMs = Date.now();
    try {
      this.lastSimTimeSec = SimVar.GetSimVarValue("E:ABSOLUTE TIME", "seconds") as number;
    } catch (e) { this.lastSimTimeSec = 0; }

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

    // Airborne time tracking reset
    this.airborneRealTimeMs = 0;
    this.airborneSimTimeSec = 0;
    this.lastTickTimeMs = 0;
    this.lastSimTimeSec = 0;

    // Lights compliance reset
    this.lightsComplianceSum = 0;
    this.lightsComplianceTicks = 0;

    // V5: Suivi vol reset
    this.atcMode = 'gps_fallback';
    this.atcNativeDetected = false;
    this.atcClearedTakeoffEver = false;
    this.atcClearedLandingEver = false;
    this.atcDiffNonZeroConsecutiveTicks = 0;
    this.altComplianceTicks = 0;
    this.altComplianceOk = 0;
    this.spdComplianceTicks = 0;
    this.spdComplianceOk = 0;
    this.routeComplianceTicks = 0;
    this.routeComplianceOk = 0;
    this.recommendedAlt = 0;

    // V6: Weather reset
    this.weatherScoreSamples = [];

    // V7: Flight mode reset
    this.flightMode = 'IFR';

    // V4: FlightSummary accumulators reset
    this.tickCount = 0;
    this.simRateSamples = [];
    this.nightTickCount = 0;
    this.totalTickCount = 0;
    this.slewDetected = false;
    this.crashDetected = false;
    this.unlimitedFuelDetected = false;
    this.atcAltDeviations = [];
    this.atcDistDeviations = [];
    this.touchdownVS = 0;

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
   * Set flight mode (IFR/VFR) — affects cross-track calculation
   */
  setFlightMode(mode: 'IFR' | 'VFR'): void {
    this.flightMode = mode;
    console.log(`[TrackingManager] Flight mode set: ${mode}`);
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
   * V4: Full flight tracking with centralized SimVar snapshot
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

      this.tickCount++;

      // ========== CENTRALIZED SIMVAR READ ==========
      const snap = readFullSnapshot(this.currentProgressPercent);

      // ========== V4: ANTI-CHEAT ACCUMULATORS ==========
      if (snap.slewActive) this.slewDetected = true;
      if (snap.crashFlag !== 0) this.crashDetected = true;
      if (snap.unlimitedFuel) this.unlimitedFuelDetected = true;

      // ========== V4: SIMRATE + NIGHT ACCUMULATION ==========
      this.totalTickCount++;
      this.simRateSamples.push(snap.simulationRate);
      if (snap.timeOfDay >= 2) this.nightTickCount++;

      // ========== V4: ATC DEVIATION ACCUMULATION (every 3 ticks ~6s) ==========
      if (this.tickCount % 3 === 0 && !snap.onGround) {
        this.atcAltDeviations.push(Math.abs(snap.atcDiffAlt));
        this.atcDistDeviations.push(Math.abs(snap.atcDiffDist));
      }

      // ========== WAYPOINT TRACKING (V2.0) ==========
      if (snap.gpsWpNextId !== this.lastWpNextId && this.lastWpNextId !== "") {
        this.waypointsPassed++;
        console.log(`[TrackingManager] Waypoint passed! ${this.waypointsPassed}/${this.callbacks.getWaypointsTotal()} - Next: ${snap.gpsWpNextId}`);
        this.callbacks.onWaypointPassed(this.waypointsPassed);
      }
      this.lastWpNextId = snap.gpsWpNextId;

      // ========== PROGRESS CALCULATION ==========
      const totalDist = this.callbacks.getMissionDistanceNm();
      let distanceFlown = 0;

      if (this.destLat !== 0 && this.destLon !== 0) {
        const distanceToDestination = sharedHaversine(snap.lat, snap.lon, this.destLat, this.destLon);
        distanceFlown = Math.max(0, totalDist - distanceToDestination);
      } else if (this.originLat !== 0 && this.originLon !== 0) {
        distanceFlown = sharedHaversine(this.originLat, this.originLon, snap.lat, snap.lon);
      }
      const progressPct = totalDist > 0 ? Math.round((distanceFlown / totalDist) * 100) : 0;
      this.currentProgressPercent = Math.min(Math.max(0, progressPct), 100);

      // ========== FLIGHT PHASE → UI MAPPING ==========
      const fp = snap.flightPhase;
      let phaseId: string = fp;
      let phaseText = this.callbacks.t("missions", "cruising");
      let phaseColor = "#22c55e";

      if (fp === FlightPhase.PARKING || fp === FlightPhase.TAXI_OUT) {
        phaseId = "taxi_out";
        phaseText = this.callbacks.t("missions", "taxiing"); phaseColor = "#22c55e";
      } else if (fp === FlightPhase.TAXI_IN) {
        phaseId = "taxi_in";
        phaseText = this.callbacks.t("missions", "taxiing"); phaseColor = "#22c55e";
      } else if (fp === FlightPhase.TAKEOFF_ROLL || fp === FlightPhase.INITIAL_CLIMB || fp === FlightPhase.CLIMB) {
        phaseId = "climb";
        phaseText = this.callbacks.t("missions", "climbing"); phaseColor = "#f59e0b";
      } else if (fp === FlightPhase.DESCENT || fp === FlightPhase.APPROACH) {
        phaseId = "descent";
        phaseText = this.callbacks.t("missions", "descending"); phaseColor = "#f59e0b";
      } else {
        phaseId = "cruise";
        phaseText = this.callbacks.t("missions", "cruising"); phaseColor = "#22c55e";
      }

      this.callbacks.onFlightPhaseChange(phaseId, phaseText, phaseColor);

      // ========== AUTOPILOT TRACKING ==========
      if (snap.apMaster) {
        this.autopilotEverUsed = true;
      }

      // ========== G-FORCE TRACKING ==========
      // Use MAX G FORCE SimVar (cumulative, more reliable)
      if (snap.gForceMax > this.maxGForce) {
        this.maxGForce = snap.gForceMax;
        console.log("[TrackingManager] New max G-force:", this.maxGForce.toFixed(2));
      }

      // ========== FUEL TRACKING ==========
      const fuelPct = snap.fuelCapacityGallons > 0 ? Math.round((snap.fuelTotalGallons / snap.fuelCapacityGallons) * 100) : 100;
      const fuelUsedPct = Math.max(0, this.fuelStartPercent - fuelPct);
      const fuelUsedKg = (fuelUsedPct / 100) * snap.fuelCapacityGallons * 3.785 * 0.8; // gallons to kg

      // ========== TIME TRACKING (airborne only) ==========
      const now = Date.now();
      const deltaMs = now - this.lastTickTimeMs;
      this.lastTickTimeMs = now;

      const isAirbornePhase = fp === FlightPhase.INITIAL_CLIMB || fp === FlightPhase.CLIMB
        || fp === FlightPhase.CRUISE || fp === FlightPhase.DESCENT || fp === FlightPhase.APPROACH;

      let currentSimTimeSec = 0;
      try {
        currentSimTimeSec = SimVar.GetSimVarValue("E:ABSOLUTE TIME", "seconds") as number;
      } catch (e) { currentSimTimeSec = 0; }
      const deltaSimSec = currentSimTimeSec > 0 && this.lastSimTimeSec > 0
        ? currentSimTimeSec - this.lastSimTimeSec : deltaMs / 1000;
      this.lastSimTimeSec = currentSimTimeSec;

      if (isAirbornePhase) {
        this.airborneRealTimeMs += deltaMs;
        this.airborneSimTimeSec += deltaSimSec;
      }

      const realTimeSeconds = Math.floor(this.airborneRealTimeMs / 1000);
      const simTimeSeconds = Math.floor(this.airborneSimTimeSec);
      const timeRatio = realTimeSeconds > 0 ? Math.round((realTimeSeconds / Math.max(1, simTimeSeconds)) * 100) : 100;

      // ========== BONUS CALCULATIONS ==========
      // Night bonus (from snapshot)
      const localHour = Math.floor(snap.localTimeSeconds / 3600) % 24;
      const bonusNight = (localHour < 6 || localHour >= 20) ? 100 : 0;

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
      this.atcClearedTakeoff = snap.atcClearedTakeoff;
      this.atcClearedLanding = snap.atcClearedLanding;

      if (!snap.onGround && (fp === FlightPhase.CLIMB || fp === FlightPhase.INITIAL_CLIMB) && !this.tookOffWithoutClearance && !this.atcClearedTakeoff) {
        this.tookOffWithoutClearance = true;
        console.log("[TrackingManager] ATC VIOLATION: Took off without clearance!");
      }
      if (snap.onGround && fp === FlightPhase.TAXI_IN && !this.landedWithoutClearance && !this.atcClearedLanding) {
        this.landedWithoutClearance = true;
        console.log("[TrackingManager] ATC VIOLATION: Landed without clearance!");
      }
      if (this.tookOffWithoutClearance) { atcScore -= 50; atcViolations++; }
      if (this.landedWithoutClearance) { atcScore -= 50; atcViolations++; }
      atcScore = Math.max(0, atcScore);

      // ========== V5: SUIVI VOL — ATC MODE DETECTION ==========
      // Update "ever" flags every tick
      if (snap.atcClearedTakeoff) this.atcClearedTakeoffEver = true;
      if (snap.atcClearedLanding) this.atcClearedLandingEver = true;
      if (Math.abs(snap.atcDiffAlt) > 5) this.atcDiffNonZeroConsecutiveTicks++;
      else this.atcDiffNonZeroConsecutiveTicks = 0;

      // Check for native ATC detection every 5 ticks (~10s), lock once detected
      if (!this.atcNativeDetected && this.tickCount % 5 === 0) {
        if (snap.atcClearedIFR || this.atcClearedTakeoffEver || this.atcClearedLandingEver || this.atcDiffNonZeroConsecutiveTicks >= 3) {
          this.atcMode = 'native';
          this.atcNativeDetected = true;
          console.log("[TrackingManager] ATC mode detected: NATIVE");
        }
      }

      // Compute recommended altitude once (on first airborne tick)
      if (this.recommendedAlt === 0 && !snap.onGround && totalDist > 0) {
        const bearing = this.calculateBearing(this.originLat, this.originLon, this.destLat, this.destLon);
        this.recommendedAlt = this.getRecommendedAltitude(totalDist, bearing);
        console.log("[TrackingManager] Recommended altitude:", this.recommendedAlt, "ft (dist:", totalDist, "nm, bearing:", Math.round(bearing), "deg)");
      }

      // ========== V5: SUIVI VOL — COMPLIANCE TRACKING (every 3 ticks ~6s) ==========
      const isCruise = fp === FlightPhase.CRUISE;
      if (this.tickCount % 3 === 0) {
        // Route compliance: always when airborne
        if (!snap.onGround) {
          let crossTrackM: number;
          if (this.flightMode === 'VFR' && this.originLat !== 0 && this.destLat !== 0) {
            crossTrackM = crossTrackDistanceM(snap.lat, snap.lon, this.originLat, this.originLon, this.destLat, this.destLon);
          } else {
            crossTrackM = Math.abs(snap.gpsCrossTrk);
          }
          const crossTrackNm = crossTrackM / 1852;
          this.routeComplianceTicks++;
          if (crossTrackNm <= 1.0) this.routeComplianceOk++;
        }

        // Altitude compliance: CRUISE only
        if (isCruise) {
          this.altComplianceTicks++;
          if (this.atcMode === 'native') {
            // Native: use ATC diff (already in meters), OK if ≤ 91m (~300ft)
            if (Math.abs(snap.atcDiffAlt) <= 91) this.altComplianceOk++;
          } else {
            // GPS fallback: compare altitude to recommended, OK if ≤ 152m (~500ft)
            if (this.recommendedAlt > 0 && Math.abs(snap.altitude - this.recommendedAlt) <= 500) this.altComplianceOk++;
          }
        }

        // Speed compliance: CRUISE only
        if (isCruise && snap.designCruiseSpeed > 0) {
          this.spdComplianceTicks++;
          const spdThreshold = snap.designCruiseSpeed * 0.15;
          if (Math.abs(snap.ias - snap.designCruiseSpeed) <= spdThreshold) this.spdComplianceOk++;
        }
      }

      // ========== V6: WEATHER DIFFICULTY SAMPLING (every 15 ticks ~30s) ==========
      if (this.tickCount % 15 === 0 && !snap.onGround) {
        let wScore = 0;
        // Vent
        if (snap.windSpeed >= 25) wScore += 3;
        else if (snap.windSpeed >= 15) wScore += 2;
        else if (snap.windSpeed >= 8) wScore += 1;
        // Visibilité
        if (snap.visibility < 1600) wScore += 3;
        else if (snap.visibility < 5000) wScore += 2;
        else if (snap.visibility < 8000) wScore += 1;
        // Précipitations (precipState: 2=none, 4=rain, 8=snow)
        if (snap.precipState >= 4) wScore += 2;
        if (snap.precipRate > 5) wScore += 1;
        // Nuages
        if (snap.inCloud) wScore += 1;
        this.weatherScoreSamples.push(wScore);
      }

      // ========== V5: SUIVI VOL — UI VALUES ==========
      let crossTrackMUI: number;
      if (this.flightMode === 'VFR' && this.originLat !== 0 && this.destLat !== 0) {
        crossTrackMUI = crossTrackDistanceM(snap.lat, snap.lon, this.originLat, this.originLon, this.destLat, this.destLon);
      } else {
        crossTrackMUI = Math.abs(snap.gpsCrossTrk);
      }
      const crossTrackNmUI = crossTrackMUI / 1852;
      let suiviRouteStatus = "ok";
      if (crossTrackNmUI > 3) suiviRouteStatus = "error";
      else if (crossTrackNmUI > 1) suiviRouteStatus = "warning";

      // Altitude target: native uses AP lock var, fallback uses recommended
      let suiviAltTarget: number;
      let suiviAltDeviation: boolean;
      if (this.atcMode === 'native') {
        let apAltLock = 0;
        try { apAltLock = SimVar.GetSimVarValue("AUTOPILOT ALTITUDE LOCK VAR", "feet") as number || 0; } catch (e) { /* */ }
        suiviAltTarget = apAltLock;
        suiviAltDeviation = isCruise && apAltLock > 0 && Math.abs(snap.altitude - apAltLock) > 300;
      } else {
        suiviAltTarget = this.recommendedAlt;
        suiviAltDeviation = isCruise && this.recommendedAlt > 0 && Math.abs(snap.altitude - this.recommendedAlt) > 500;
      }

      // Speed deviation for UI
      const suiviSpdDeviation = isCruise && snap.designCruiseSpeed > 0 && Math.abs(snap.ias - snap.designCruiseSpeed) > snap.designCruiseSpeed * 0.15;

      // Suivi vol alert
      let suiviAlertMsg = "";
      if (isCruise) {
        const problems: string[] = [];
        if (suiviAltDeviation) problems.push("Altitude non respectee");
        if (suiviSpdDeviation) problems.push("Vitesse non respectee");
        if (suiviRouteStatus === "error") problems.push("Ecart route important");
        if (problems.length > 0) suiviAlertMsg = problems.join(". ") + ".";
      } else if (suiviRouteStatus === "error") {
        suiviAlertMsg = "Ecart route important.";
      }

      // ========== CAN ACCELERATE ==========
      const canAccel = fp === FlightPhase.CRUISE && snap.apMaster;

      // ========== PAYLOAD VERIFICATION (500ft before landing) ==========
      if (!this.payloadVerificationDone && snap.radioAlt < 500 && !snap.onGround && snap.verticalSpeed < 0) {
        this.payloadVerifiedLbs = this.callbacks.getTotalPayload();
        this.payloadVerificationDone = true;
        console.log("[TrackingManager] Payload verified at 500ft:", this.payloadVerifiedLbs, "lbs");
      }

      // ========== TOUCHDOWN DETECTION ==========
      if (snap.onGround && !this.wasOnGround) {
        // Use PLANE TOUCHDOWN NORMAL VELOCITY (more reliable than instantaneous VS)
        const touchdownFps = SimVar.GetSimVarValue("PLANE TOUCHDOWN NORMAL VELOCITY", "feet per second") as number || 0;
        this.touchdownVS = Math.round(touchdownFps * 60); // fpm
        this.landingFpm = this.touchdownVS;
        console.log("[TrackingManager] TOUCHDOWN DETECTED! FPM:", this.landingFpm);
        this.callbacks.onTouchdown(this.landingFpm);
      }
      this.wasOnGround = snap.onGround;

      // ========== MISSION COMPLETION DETECTION ==========
      const currentAirport = this.callbacks.getClosestAirport();
      if (snap.parkingBrake && snap.onGround && mission) {
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
      if (!snap.parkingBrake) { this.parkingBrakeWarningShown = false; }

      // ========== V2: REAL-TIME GRADE ESTIMATION ==========
      let estScoreGforce: number;
      if (this.maxGForce <= 1.3)      estScoreGforce = 200;
      else if (this.maxGForce <= 1.5) estScoreGforce = 180;
      else if (this.maxGForce <= 1.8) estScoreGforce = 150;
      else if (this.maxGForce <= 2.0) estScoreGforce = 120;
      else if (this.maxGForce <= 2.5) estScoreGforce = 80;
      else if (this.maxGForce <= 3.0) estScoreGforce = 40;
      else                            estScoreGforce = 0;

      let gforceAlert = "ok";
      if (this.maxGForce > 2.0) gforceAlert = "critical";
      else if (this.maxGForce > 1.5) gforceAlert = "warning";

      const estScoreLanding = 450;
      const estScoreDestination = 250;

      let estScoreDistance = 100;
      if (totalDist > 0 && distanceFlown > 0) {
        const ratio = distanceFlown / totalDist;
        if (ratio > 1.20) estScoreDistance = 20;
        else if (ratio > 1.15) estScoreDistance = 40;
        else if (ratio > 1.10) estScoreDistance = 60;
        else if (ratio > 1.05) estScoreDistance = 80;
      }

      const estScoreTotal = estScoreLanding + estScoreGforce + estScoreDestination + estScoreDistance;
      let estGrade: string;
      if (estScoreTotal >= 950) estGrade = "S";
      else if (estScoreTotal >= 850) estGrade = "A";
      else if (estScoreTotal >= 750) estGrade = "B";
      else if (estScoreTotal >= 650) estGrade = "C";
      else if (estScoreTotal >= 500) estGrade = "D";
      else if (estScoreTotal >= 350) estGrade = "E";
      else estGrade = "F";

      // ========== V2: CARGO FILL PERCENT ==========
      const maxCargoKg = this.callbacks.getAircraftCargoCapacity();
      const actualCargoKg = Math.round(this.callbacks.getTotalPayload() * 0.453592);
      const cargoFillPct = maxCargoKg > 0 ? Math.min(100, Math.round((actualCargoKg / maxCargoKg) * 100)) : 0;

      // ========== V2: ATC DEVIATIONS (UI) — now driven by V5 suivi vol ==========
      const atcAssignedAlt = Math.round(suiviAltTarget);
      const atcAltDeviation = suiviAltDeviation;
      const atcSpdDeviation = suiviSpdDeviation;
      const atcCruiseSpdUI = Math.round(snap.designCruiseSpeed);

      // ========== V3: LIGHTS REQUIREMENTS + COMPLIANCE ==========
      const isNightOrDusk = snap.timeOfDay >= 2;
      const isDescendingForLights = snap.verticalSpeed < -300
        || fp === FlightPhase.DESCENT
        || fp === FlightPhase.APPROACH
        || this.currentProgressPercent > 70;

      const lightsResult = evaluateLightsStatus(
        snap.onGround, isNightOrDusk, snap.altitude, isDescendingForLights,
        { nav: snap.lightNav, strobe: snap.lightStrobe, beacon: snap.lightBeacon,
          landing: snap.lightLanding, taxi: snap.lightTaxi }
      );

      const lightNavState = lightsResult.nav;
      const lightStrobeState = lightsResult.strobe;
      const lightBeaconState = lightsResult.beacon;
      const lightLandingState = lightsResult.landing;
      const lightTaxiState = lightsResult.taxi;
      const missingCount = lightsResult.missing;
      const unnecessaryCount = lightsResult.unnecessary;

      // Compliance: correct = grey(0) or green(1), out of 5 total
      const correctCount = allStates.filter(s => s === 0 || s === 1).length;
      this.lightsComplianceSum += correctCount / 5;
      this.lightsComplianceTicks++;

      let lightsAlertMsg = "";
      const lightsStatusColor = missingCount > 0 ? "red" : unnecessaryCount > 0 ? "orange" : "green";

      if (missingCount > 0) {
        const missing: string[] = [];
        if (lightBeaconState === 2) missing.push("BEACON");
        if (lightStrobeState === 2) missing.push("STROBE");
        if (lightNavState === 2) missing.push("NAV");
        if (lightLandingState === 2) missing.push("LANDING");
        if (lightTaxiState === 2) missing.push("TAXI");
        if (isNightOrDusk) {
          lightsAlertMsg = `Vol de nuit: ${missing.join(", ")} requis.`;
        } else if (snap.onGround) {
          lightsAlertMsg = `Au sol: ${missing.join(", ")} requis.`;
        } else {
          lightsAlertMsg = `En vol: ${missing.join(", ")} requis.`;
        }
      } else if (unnecessaryCount > 0) {
        const unnecessary: string[] = [];
        if (lightBeaconState === 3) unnecessary.push("BEACON");
        if (lightStrobeState === 3) unnecessary.push("STROBE");
        if (lightNavState === 3) unnecessary.push("NAV");
        if (lightLandingState === 3) unnecessary.push("LANDING");
        if (lightTaxiState === 3) unnecessary.push("TAXI");
        if (snap.onGround) {
          lightsAlertMsg = `${unnecessary.join(", ")} non necessaire au roulage.`;
        } else {
          lightsAlertMsg = `${unnecessary.join(", ")} non necessaire en vol.`;
        }
      }

      // ========== NOTIFY UI STATE UPDATE ==========
      this.callbacks.onTrackingStateUpdate({
        distanceFlown: Math.round(distanceFlown),
        progressPercent: this.currentProgressPercent,
        currentAltitude: Math.round(snap.altitude),
        fuelPercent: fuelPct,
        simRate: snap.simulationRate,
        canAccelerate: canAccel,
        apActive: snap.apMaster,
        realTime: this.formatTimeHMS(realTimeSeconds),
        simTime: this.formatTimeHMS(simTimeSeconds),
        timeRatio,
        bonusNight,
        bonusCargo,
        bonusEco,
        bonusRealTime,
        cargoExpected: this.cargoExpectedKg,
        cargoActual: actualCargoKg,
        fuelUsed: Math.round(fuelUsedKg),
        fuelMax: Math.round(fuelMaxKg),
        atcCompliance: atcScore,
        atcViolations,
        waypointsPassed: this.waypointsPassed,
        flightPhaseId: phaseId,
        flightPhaseText: phaseText,
        flightPhaseColor: phaseColor,
        // V2 fields
        gradeEstimated: estGrade,
        scoreEstimated: estScoreTotal,
        scoreGforce: estScoreGforce,
        gforceAlert,
        cargoFillPercent: cargoFillPct,
        atcAssignedAlt,
        atcAltDeviation,
        atcCruiseSpd: atcCruiseSpdUI,
        atcSpdDeviation,
        // V5: Suivi vol
        suiviAtcMode: this.atcMode,
        suiviCrossTrackNm: Math.round(crossTrackNmUI * 100) / 100,
        suiviRouteStatus,
        suiviInCruise: isCruise,
        suiviAlert: suiviAlertMsg,
        // V6: Weather
        weatherScore: this.weatherScoreSamples.length > 0
          ? Math.round(Math.min(
              (this.weatherScoreSamples.reduce((a, b) => a + b, 0) / this.weatherScoreSamples.length) / 6,
              1.0
            ) * 100)
          : 0,
        // V3: Lights
        lightNav: lightNavState,
        lightStrobe: lightStrobeState,
        lightBeacon: lightBeaconState,
        lightLanding: lightLandingState,
        lightTaxi: lightTaxiState,
        lightsMissing: missingCount,
        lightsUnnecessary: unnecessaryCount,
        lightsStatusColor,
        lightsAlert: lightsAlertMsg,
      });

      // Check checkpoints (V1.0)
      void this.checkCheckpoints();

    } catch (error) {
      console.error("[TrackingManager] Error in V4 flight tracking:", error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CHECKPOINT VALIDATION (V1.0)
  // ═══════════════════════════════════════════════════════════════════════════

  private async checkCheckpoints(): Promise<void> {
    if (!this.callbacks) return;

    const mission = this.callbacks.getActiveMission();
    if (!mission || !isGameReady()) return;

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
  // Background tracking removed — now handled by FlightTracker
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const trackingManager = new TrackingManager();
