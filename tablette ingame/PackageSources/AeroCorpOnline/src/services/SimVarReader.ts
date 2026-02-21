/**
 * SimVarReader - Centralized SimVar reading module
 *
 * Single source of truth for all simulator variable reads.
 * Provides:
 * - CriticalSnapshot: fast reads (500ms) for UI state
 * - TrackingSnapshot: full reads (2s) for mission/flight tracking
 * - FlightPhase enum + detection logic
 * - FlightSummary: accumulated data for end-of-flight scoring
 * - haversineDistanceNm: shared utility
 */

// Global MSFS declarations in src/types/msfs-globals.d.ts

// =============================================================================
// ENUMS
// =============================================================================

export enum FlightPhase {
  PARKING = "parking",
  TAXI_OUT = "taxi_out",
  TAKEOFF_ROLL = "takeoff_roll",
  INITIAL_CLIMB = "initial_climb",
  CLIMB = "climb",
  CRUISE = "cruise",
  DESCENT = "descent",
  APPROACH = "approach",
  TAXI_IN = "taxi_in",
}

// =============================================================================
// TYPES
// =============================================================================

/** Fast subset read every 500ms for SimVarState + UI */
export interface CriticalSnapshot {
  lat: number;
  lon: number;
  altitude: number;
  heading: number;
  groundSpeed: number;
  verticalSpeed: number; // fpm
  airspeed: number; // IAS knots
  gForce: number;
  fuelQuantity: number; // gallons
  fuelCapacity: number; // gallons
  touchdownVelocity: number; // feet/sec (raw)
  onGround: boolean;
  closestAirport: string;
  atcId: string;
  engineRunning: boolean;
}

/** Full snapshot read every 2s for tracking */
export interface TrackingSnapshot {
  // Timestamp
  timestamp: number;

  // Position
  lat: number;
  lon: number;
  altitude: number;
  altitudeAGL: number;
  heading: number;
  onGround: boolean;
  onRunway: boolean;

  // Speeds
  ias: number;
  tas: number;
  groundSpeed: number;
  verticalSpeed: number; // fpm
  mach: number;

  // G-Force
  gForce: number;
  gForceMax: number;
  gForceMin: number;

  // Aircraft limits
  vne: number;
  vle: number;
  vfe: number;
  flapOverspeed: boolean;
  overspeedWarning: boolean;
  stallWarning: boolean;
  designCruiseSpeed: number; // knots

  // Gear & Flaps
  gearDown: boolean;
  flapsIndex: number;

  // Fuel
  fuelTotalGallons: number;
  fuelCapacityGallons: number;
  fuelPercent: number; // derived
  fuelWeightLbs: number;
  unlimitedFuel: boolean;

  // Weights
  totalWeightLbs: number;
  emptyWeightLbs: number;
  maxGrossWeightLbs: number;
  payloadLbs: number; // derived
  cargoPercent: number; // derived

  // Lights
  lightNav: boolean;
  lightStrobe: boolean;
  lightBeacon: boolean;
  lightLanding: boolean;
  lightTaxi: boolean;

  // Environment
  timeOfDay: number; // 0=dawn 1=day 2=dusk 3=night
  localTimeSeconds: number;
  simulationRate: number;
  windDirection: number;
  windSpeed: number;
  visibility: number; // meters
  precipState: number; // 2=none 4=rain 8=snow
  inCloud: boolean;
  precipRate: number; // mm/h (AMBIENT PRECIP RATE)
  temperature: number; // celsius

  // ATC
  atcDiffAlt: number; // meters
  atcDiffDist: number; // meters
  atcDiffHeading: number; // degrees
  atcClearedLanding: boolean;
  atcClearedTakeoff: boolean;
  atcClearedTaxi: boolean;
  atcClearedIFR: boolean;
  atcRunwaySelected: boolean;
  atcRunwayDistance: number; // meters

  // GPS / Flight Plan
  gpsFlightplanDistance: number; // meters
  gpsWpDistance: number; // meters
  gpsETA: number; // seconds
  gpsETE: number; // seconds
  gpsCrossTrk: number; // meters
  gpsWpNextId: string;
  gpsWpCount: number;
  gpsWpIndex: number;

  // Anti-cheat
  slewActive: boolean;
  crashFlag: number;

  // Aircraft
  aircraftTitle: string;
  aircraftCategory: string;

  // Flight phase (computed)
  flightPhase: FlightPhase;

  // Wear & Tear
  wearLevel: number; // 0-1
  wearLowest: number; // 0-1

  // Extra (from existing codebase)
  parkingBrake: boolean;
  engineRunning: boolean;
  apMaster: boolean;
  radioAlt: number;
  atcId: string;
}

/** Accumulated flight data for end-of-flight scoring */
export interface FlightSummary {
  // Identity
  originIcao: string;
  destIcao: string;
  aircraftTitle: string;

  // Distances
  plannedDistanceNm: number;
  actualDistanceNm: number;

  // Time
  flightStartTime: number;
  flightEndTime: number;
  flightDurationSec: number;

  // Scoring inputs
  touchdownVS: number; // fpm (PLANE TOUCHDOWN NORMAL VELOCITY * 60)
  maxGForce: number; // MAX G FORCE final
  distanceRatio: number; // actual / planned

  // Fuel
  fuelPercentStart: number;
  fuelPercentEnd: number;

  // Cargo
  cargoPercent: number;

  // Night
  isNightFlight: boolean; // TIME OF DAY >= 2 for >50% of flight

  // Real-time
  simRateAverage: number;
  realtimeRatio: number; // min(1/simRateAvg, 1.0) * 100

  // Lights
  lightsCompliance: number; // 0.0 to 1.0

  // Anti-cheat
  slewUsed: boolean;
  crashOccurred: boolean;
  unlimitedFuelUsed: boolean;

  // ATC (display, not scored yet)
  atcAltDeviationAvg: number; // meters
  atcDistDeviationAvg: number; // meters

  // Suivi vol compliance (V5)
  atcMode: 'native' | 'gps_fallback';
  altCompliance: number;        // 0.0 to 1.0
  spdCompliance: number;        // 0.0 to 1.0
  routeCompliance: number;      // 0.0 to 1.0
  flightPathCompliance: number; // weighted: alt×0.35 + spd×0.25 + route×0.40

  // Weather difficulty (V6)
  weatherDifficulty: number; // 0.0 to 1.0 (normalized avg score / 6)

  // Flight mode (V7)
  flightMode: 'IFR' | 'VFR';
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/** Haversine distance between two points in nautical miles */
export function haversineDistanceNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

/** Cross-track distance from point C to the great circle path A→B, in meters */
export function crossTrackDistanceM(
  cLat: number, cLon: number,
  aLat: number, aLon: number,
  bLat: number, bLon: number
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (d: number): number => d * Math.PI / 180;
  const dAC = haversineDistanceM(aLat, aLon, cLat, cLon);
  const bearingAC = initialBearing(aLat, aLon, cLat, cLon);
  const bearingAB = initialBearing(aLat, aLon, bLat, bLon);
  return Math.abs(Math.asin(Math.sin(dAC / R) * Math.sin(toRad(bearingAC - bearingAB))) * R);
}

function haversineDistanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number): number => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function initialBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number): number => d * Math.PI / 180;
  const toDeg = (r: number): number => r * 180 / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// =============================================================================
// CRITICAL SIMVAR READS (500ms — for SimVarState + UI)
// =============================================================================

/** Fast read of ~15 critical SimVars for UI state updates */
export function readCriticalSimVars(): CriticalSnapshot {
  return {
    lat: (SimVar.GetSimVarValue("PLANE LATITUDE", "degrees") as number) || 0,
    lon: (SimVar.GetSimVarValue("PLANE LONGITUDE", "degrees") as number) || 0,
    altitude: (SimVar.GetSimVarValue("PLANE ALTITUDE", "feet") as number) || 0,
    heading: (SimVar.GetSimVarValue("PLANE HEADING DEGREES TRUE", "degrees") as number) || 0,
    groundSpeed: (SimVar.GetSimVarValue("GROUND VELOCITY", "knots") as number) || 0,
    airspeed: (SimVar.GetSimVarValue("AIRSPEED INDICATED", "knots") as number) || 0,
    verticalSpeed: (SimVar.GetSimVarValue("VERTICAL SPEED", "feet per minute") as number) || 0,
    gForce: (SimVar.GetSimVarValue("G FORCE", "GForce") as number) || 1,
    fuelQuantity: (SimVar.GetSimVarValue("FUEL TOTAL QUANTITY", "gallons") as number) || 0,
    fuelCapacity: (SimVar.GetSimVarValue("FUEL TOTAL CAPACITY", "gallons") as number) || 0,
    touchdownVelocity: (SimVar.GetSimVarValue("PLANE TOUCHDOWN NORMAL VELOCITY", "feet per second") as number) || 0,
    onGround: SimVar.GetSimVarValue("SIM ON GROUND", "bool") as boolean,
    closestAirport: safeReadString("GPS CLOSEST AIRPORT ID", "string", "----"),
    atcId: ((SimVar.GetSimVarValue("ATC ID", "string") as string) || "").toUpperCase(),
    engineRunning: SimVar.GetSimVarValue("ENG COMBUSTION:1", "boolean") as boolean,
  };
}

// =============================================================================
// FULL SNAPSHOT READS (2s — for tracking)
// =============================================================================

/** Full read of all tracked SimVars for mission/flight tracking */
export function readFullSnapshot(progressPercent: number): TrackingSnapshot {
  const snapshot: TrackingSnapshot = {
    timestamp: Date.now(),

    // Position
    lat: (SimVar.GetSimVarValue("PLANE LATITUDE", "degrees") as number) || 0,
    lon: (SimVar.GetSimVarValue("PLANE LONGITUDE", "degrees") as number) || 0,
    altitude: (SimVar.GetSimVarValue("PLANE ALTITUDE", "feet") as number) || 0,
    altitudeAGL: (SimVar.GetSimVarValue("PLANE ALT ABOVE GROUND", "feet") as number) || 0,
    heading: (SimVar.GetSimVarValue("PLANE HEADING DEGREES MAGNETIC", "degrees") as number) || 0,
    onGround: SimVar.GetSimVarValue("SIM ON GROUND", "bool") as boolean,
    onRunway: SimVar.GetSimVarValue("ON ANY RUNWAY", "bool") as boolean,

    // Speeds
    ias: (SimVar.GetSimVarValue("AIRSPEED INDICATED", "knots") as number) || 0,
    tas: (SimVar.GetSimVarValue("AIRSPEED TRUE", "knots") as number) || 0,
    groundSpeed: (SimVar.GetSimVarValue("GROUND VELOCITY", "knots") as number) || 0,
    verticalSpeed: ((SimVar.GetSimVarValue("VERTICAL SPEED", "feet per second") as number) || 0) * 60, // fpm
    mach: (SimVar.GetSimVarValue("AIRSPEED MACH", "mach") as number) || 0,

    // G-Force
    gForce: (SimVar.GetSimVarValue("G FORCE", "GForce") as number) || 1,
    gForceMax: (SimVar.GetSimVarValue("MAX G FORCE", "GForce") as number) || 1,
    gForceMin: (SimVar.GetSimVarValue("MIN G FORCE", "GForce") as number) || 1,

    // Aircraft limits
    vne: (SimVar.GetSimVarValue("REFERENCE SPEED MAX IAS", "knots") as number) || 0,
    vle: (SimVar.GetSimVarValue("REFERENCE SPEED MAX IAS GEAR DOWN", "knots") as number) || 0,
    vfe: (SimVar.GetSimVarValue("FLAPS CURRENT SPEED LIMITATION", "knots") as number) || 0,
    flapOverspeed: SimVar.GetSimVarValue("FLAP SPEED EXCEEDED", "bool") as boolean,
    overspeedWarning: SimVar.GetSimVarValue("OVERSPEED WARNING", "bool") as boolean,
    stallWarning: SimVar.GetSimVarValue("STALL WARNING", "bool") as boolean,
    designCruiseSpeed: ((SimVar.GetSimVarValue("DESIGN SPEED VC", "feet per second") as number) || 0) / 1.68781,

    // Gear & Flaps
    gearDown: SimVar.GetSimVarValue("GEAR HANDLE POSITION", "bool") as boolean,
    flapsIndex: (SimVar.GetSimVarValue("FLAPS HANDLE INDEX", "number") as number) || 0,

    // Fuel
    fuelTotalGallons: (SimVar.GetSimVarValue("FUEL TOTAL QUANTITY", "gallons") as number) || 0,
    fuelCapacityGallons: (SimVar.GetSimVarValue("FUEL TOTAL CAPACITY", "gallons") as number) || 0,
    fuelPercent: 0, // computed below
    fuelWeightLbs: (SimVar.GetSimVarValue("FUEL TOTAL QUANTITY WEIGHT", "pounds") as number) || 0,
    unlimitedFuel: SimVar.GetSimVarValue("UNLIMITED FUEL", "bool") as boolean,

    // Weights
    totalWeightLbs: (SimVar.GetSimVarValue("TOTAL WEIGHT", "pounds") as number) || 0,
    emptyWeightLbs: (SimVar.GetSimVarValue("EMPTY WEIGHT", "pounds") as number) || 0,
    maxGrossWeightLbs: (SimVar.GetSimVarValue("MAX GROSS WEIGHT", "pounds") as number) || 0,
    payloadLbs: 0, // computed below
    cargoPercent: 0, // computed below

    // Lights
    lightNav: !!SimVar.GetSimVarValue("LIGHT NAV", "bool"),
    lightStrobe: !!SimVar.GetSimVarValue("LIGHT STROBE", "bool"),
    lightBeacon: !!SimVar.GetSimVarValue("LIGHT BEACON", "bool"),
    lightLanding: !!SimVar.GetSimVarValue("LIGHT LANDING", "bool"),
    lightTaxi: !!SimVar.GetSimVarValue("LIGHT TAXI", "bool"),

    // Environment
    timeOfDay: safeReadNumber("E:TIME OF DAY", "number", 1),
    localTimeSeconds: safeReadNumber("E:LOCAL TIME", "seconds", 0),
    simulationRate: safeReadNumber("E:SIMULATION RATE", "number", 1),
    windDirection: (SimVar.GetSimVarValue("AMBIENT WIND DIRECTION", "degrees") as number) || 0,
    windSpeed: (SimVar.GetSimVarValue("AMBIENT WIND VELOCITY", "knots") as number) || 0,
    visibility: (SimVar.GetSimVarValue("AMBIENT VISIBILITY", "meters") as number) || 9999,
    precipState: (SimVar.GetSimVarValue("AMBIENT PRECIP STATE", "number") as number) || 2,
    inCloud: SimVar.GetSimVarValue("AMBIENT IN CLOUD", "bool") as boolean,
    precipRate: (SimVar.GetSimVarValue("AMBIENT PRECIP RATE", "millimeters of water") as number) || 0,
    temperature: (SimVar.GetSimVarValue("AMBIENT TEMPERATURE", "celsius") as number) || 15,

    // ATC
    atcDiffAlt: safeReadNumber("ATC FLIGHTPLAN DIFF ALT", "meters", 0),
    atcDiffDist: safeReadNumber("ATC FLIGHTPLAN DIFF DISTANCE", "meters", 0),
    atcDiffHeading: safeReadNumber("ATC FLIGHTPLAN DIFF HEADING", "degrees", 0),
    atcClearedLanding: safeReadBool("ATC CLEARED LANDING"),
    atcClearedTakeoff: safeReadBool("ATC CLEARED TAKEOFF"),
    atcClearedTaxi: safeReadBool("ATC CLEARED TAXI"),
    atcClearedIFR: safeReadBool("ATC CLEARED IFR"),
    atcRunwaySelected: safeReadBool("ATC RUNWAY SELECTED"),
    atcRunwayDistance: safeReadNumber("ATC RUNWAY DISTANCE", "meters", 0),

    // GPS
    gpsFlightplanDistance: (SimVar.GetSimVarValue("GPS FLIGHTPLAN TOTAL DISTANCE", "meters") as number) || 0,
    gpsWpDistance: (SimVar.GetSimVarValue("GPS WP DISTANCE", "meters") as number) || 0,
    gpsETA: (SimVar.GetSimVarValue("GPS ETA", "seconds") as number) || 0,
    gpsETE: (SimVar.GetSimVarValue("GPS ETE", "seconds") as number) || 0,
    gpsCrossTrk: (SimVar.GetSimVarValue("GPS WP CROSS TRK", "meters") as number) || 0,
    gpsWpNextId: (SimVar.GetSimVarValue("GPS WP NEXT ID", "string") as string) || "",
    gpsWpCount: (SimVar.GetSimVarValue("GPS FLIGHT PLAN WP COUNT", "number") as number) || 0,
    gpsWpIndex: (SimVar.GetSimVarValue("GPS FLIGHT PLAN WP INDEX", "number") as number) || 0,

    // Anti-cheat
    slewActive: SimVar.GetSimVarValue("IS SLEW ACTIVE", "bool") as boolean,
    crashFlag: (SimVar.GetSimVarValue("CRASH FLAG", "number") as number) || 0,

    // Aircraft
    aircraftTitle: (SimVar.GetSimVarValue("TITLE", "string") as string) || "",
    aircraftCategory: (SimVar.GetSimVarValue("AIRCRAFT CATEGORY", "string") as string) || "",

    // Phase (computed below)
    flightPhase: FlightPhase.PARKING,

    // Wear & Tear
    wearLevel: (SimVar.GetSimVarValue("WEAR AND TEAR EXPOSED PARTS LEVEL", "percent over 100") as number) || 0,
    wearLowest: (SimVar.GetSimVarValue("WEAR AND TEAR EXPOSED PARTS LOWEST LEVEL", "percent over 100") as number) || 0,

    // Extra
    parkingBrake: SimVar.GetSimVarValue("BRAKE PARKING POSITION", "boolean") as boolean,
    engineRunning: SimVar.GetSimVarValue("ENG COMBUSTION:1", "boolean") as boolean,
    apMaster: SimVar.GetSimVarValue("AUTOPILOT MASTER", "boolean") as boolean,
    radioAlt: (SimVar.GetSimVarValue("RADIO HEIGHT", "feet") as number) || 0,
    atcId: ((SimVar.GetSimVarValue("ATC ID", "string") as string) || "").toUpperCase(),
  };

  // Derived calculations
  snapshot.fuelPercent =
    snapshot.fuelCapacityGallons > 0
      ? (snapshot.fuelTotalGallons / snapshot.fuelCapacityGallons) * 100
      : 0;

  snapshot.payloadLbs = snapshot.totalWeightLbs - snapshot.emptyWeightLbs - snapshot.fuelWeightLbs;

  const maxPayload = snapshot.maxGrossWeightLbs - snapshot.emptyWeightLbs;
  snapshot.cargoPercent =
    maxPayload > 0 ? Math.min((snapshot.payloadLbs / maxPayload) * 100, 100) : 0;

  snapshot.flightPhase = detectFlightPhase(snapshot, progressPercent);

  return snapshot;
}

// =============================================================================
// FLIGHT PHASE DETECTION
// =============================================================================

/** Detect the current flight phase from snapshot data */
export function detectFlightPhase(snap: TrackingSnapshot, progressPercent: number): FlightPhase {
  if (snap.onGround) {
    if (snap.groundSpeed < 5) return FlightPhase.PARKING;
    if (snap.onRunway) {
      return progressPercent < 10 ? FlightPhase.TAKEOFF_ROLL : FlightPhase.TAXI_IN;
    }
    return progressPercent < 10 ? FlightPhase.TAXI_OUT : FlightPhase.TAXI_IN;
  }

  // Airborne
  if (snap.altitudeAGL < 1500 && snap.verticalSpeed > 300) return FlightPhase.INITIAL_CLIMB;
  if (snap.altitudeAGL < 3000 && snap.verticalSpeed < -300) return FlightPhase.APPROACH;
  if (snap.verticalSpeed > 500) return FlightPhase.CLIMB;
  if (snap.verticalSpeed < -500) return FlightPhase.DESCENT;
  return FlightPhase.CRUISE;
}

// =============================================================================
// SAFE READ HELPERS (for SimVars that may not be available)
// =============================================================================

function safeReadNumber(name: string, unit: string, fallback: number): number {
  try {
    return (SimVar.GetSimVarValue(name, unit) as number) || fallback;
  } catch {
    return fallback;
  }
}

function safeReadBool(name: string): boolean {
  try {
    return SimVar.GetSimVarValue(name, "boolean") as boolean;
  } catch {
    return false;
  }
}

function safeReadString(name: string, unit: string, fallback: string): string {
  try {
    return (SimVar.GetSimVarValue(name, unit) as string) || fallback;
  } catch {
    return fallback;
  }
}
