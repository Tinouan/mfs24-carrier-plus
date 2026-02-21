/**
 * FreeFlightState - State management for free flight (career mode)
 * V2.0: Enhanced with bonus tracking, scoring, and recap data
 */
import { Subject } from "@microsoft/msfs-sdk";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type FreeFlightStatus = "idle" | "preparing" | "in_flight" | "paused" | "completed";

export interface FreeFlightSession {
  id: string;
  aircraft_id: string;
  aircraft_registration: string;
  aircraft_type: string;
  start_airport: string;
  start_time: Date;
  end_airport?: string;
  end_time?: Date;
  flight_time_minutes: number;
  landings_count: number;
  fuel_used_gallons: number;
  distance_flown_nm: number;
  xp_earned: number;
}

export interface FreeFlightStats {
  totalFlightTime: number;      // Minutes
  totalLandings: number;
  totalDistanceNm: number;
  totalFuelUsed: number;        // Gallons
  sessionsToday: number;
}

// V2.0: Bonus structure for free flight recap
export interface FreeFlightBonus {
  active: boolean;
  multiplier: number;
}

// V2.0: Complete recap data for free flight
export interface FreeFlightRecapData {
  departure_icao: string;
  arrival_icao: string;
  distance_nm: number;
  flight_time_minutes: number;

  // Scoring (same system as missions)
  score_landing: number;        // Points landing (0-250)
  score_gforce: number;         // Points G-force (0 or -100)
  score_total: number;          // Score total (base 1000 + bonus - penalties)
  grade: string;                // S/A/B/C/D/F
  landing_fpm: number;
  landing_quality: string;      // "butter" / "smooth" / "normal" / "hard" / "crash"
  max_gforce: number;

  // Bonus details (for display in recap)
  bonuses: {
    real_time: FreeFlightBonus;     // ×1.20
    night: FreeFlightBonus;         // ×1.15
    atc: FreeFlightBonus;           // ×1.15
    fuel_eco: FreeFlightBonus;      // ×1.10
    no_autopilot: FreeFlightBonus;  // ×1.10
    bad_weather: FreeFlightBonus;   // ×1.15
  };
  bonus_multiplier_total: number;   // Product of all active bonuses

  // Final result
  xp_earned: number;
  money_earned: 0;              // ALWAYS 0

  // Weather at departure (for display)
  weather_visibility_nm: number;
  weather_wind_kts: number;
  weather_precipitation: boolean;

  fuel_remaining_percent: number;
  atc_compliance: number;
  atc_violations: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

export const freeFlightState = {
  // Current session
  status: Subject.create<FreeFlightStatus>("idle"),
  currentSession: Subject.create<FreeFlightSession | null>(null),

  // Session tracking for persistence
  sessionId: Subject.create<string>(""),
  isTracking: Subject.create<boolean>(false),

  // Flight tracking (real-time)
  flightTimeMinutes: Subject.create<number>(0),
  distanceFlownNm: Subject.create<number>(0),
  fuelUsedGallons: Subject.create<number>(0),
  landingsCount: Subject.create<number>(0),
  currentAltitude: Subject.create<number>(0),
  groundSpeed: Subject.create<number>(0),

  // Start position (for distance calculation)
  startLat: Subject.create<number>(0),
  startLon: Subject.create<number>(0),
  startFuelGallons: Subject.create<number>(0),

  // Airport detection
  departureAirport: Subject.create<string>(""),
  currentAirport: Subject.create<string | null>(null),
  isOnGround: Subject.create<boolean>(true),

  // XP preview
  estimatedXp: Subject.create<number>(0),
  xpPerMinute: Subject.create<number>(1), // Base XP rate

  // Live tracking UI (pushed by FlightTracker.tick + FreeFlightController.tick)
  ffTrackingAirspeed: Subject.create<number>(0),
  ffTrackingFuelPercent: Subject.create<number>(0),
  ffTrackingMaxGForce: Subject.create<number>(1.0),
  ffTrackingCurrentGForce: Subject.create<number>(1.0),
  ffTrackingGForceAlert: Subject.create<boolean>(false),
  ffTrackingOverspeed: Subject.create<boolean>(false),
  ffTrackingScoreEstimated: Subject.create<number>(1000),
  ffTrackingGradeEstimated: Subject.create<string>("A"),
  ffTrackingSimRate: Subject.create<number>(1.0),
  ffTrackingPhaseId: Subject.create<string>("idle"),
  ffTrackingPhaseText: Subject.create<string>(""),
  ffTrackingPhaseColor: Subject.create<string>("#9ca3af"),

  // Lights (4-state: 0=grey, 1=green, 2=red, 3=orange)
  ffTrackingLightNav: Subject.create<number>(0),
  ffTrackingLightStrobe: Subject.create<number>(0),
  ffTrackingLightBeacon: Subject.create<number>(0),
  ffTrackingLightLanding: Subject.create<number>(0),
  ffTrackingLightTaxi: Subject.create<number>(0),
  ffTrackingLightsMissing: Subject.create<number>(0),
  ffTrackingLightsUnnecessary: Subject.create<number>(0),
  ffTrackingLightsStatusColor: Subject.create<string>("green"),

  // UI state
  showEndFlightConfirm: Subject.create<boolean>(false),
  positionBlocked: Subject.create<boolean>(false),
  loading: Subject.create<boolean>(false),
  error: Subject.create<string | null>(null),

  // Today's stats (from API)
  todayStats: Subject.create<FreeFlightStats | null>(null),

  // ═══════════════════════════════════════════════════════════════════════════
  // V2.0: Enhanced tracking for XP scoring
  // NOTE: Some of these states (ffDistanceNm, ffFlightTimeMin, ffLandingFpm, ffMaxGforce,
  //       ffFuelStartPercent, ffFuelEndPercent) are updated during tracking but currently
  //       not consumed by UI. FreeFlightManager uses internal vars for final calculation.
  //       Keeping them for potential future real-time UI display (spec-freeflight-xp-efb.md).
  // ═══════════════════════════════════════════════════════════════════════════

  // Flight data (V2.0)
  ffArrivalIcao: Subject.create<string>(""),            // ICAO arrival (auto-detected)
  ffDistanceNm: Subject.create<number>(0),              // Distance flown (for potential UI)
  ffFlightTimeMin: Subject.create<number>(0),           // Flight time in minutes (for potential UI)
  ffLandingFpm: Subject.create<number>(0),              // Landing vertical speed (for potential UI)
  ffMaxGforce: Subject.create<number>(1),               // Max G-force during flight (for potential UI)
  ffFuelStartPercent: Subject.create<number>(0),        // Fuel at departure (for potential UI)
  ffFuelEndPercent: Subject.create<number>(0),          // Fuel at arrival (for potential UI)

  // Bonus tracking (same values as missions)
  ffBonusRealTime: Subject.create<boolean>(true),       // true if sim rate = 1× during all flight
  ffBonusNight: Subject.create<boolean>(false),         // true if >50% of flight at night
  ffBonusAtc: Subject.create<boolean>(true),            // true if ATC compliance = 100%
  ffBonusFuelEco: Subject.create<boolean>(false),       // true if fuel efficiency > threshold
  ffBonusNoAutopilot: Subject.create<boolean>(true),    // true if AP never activated
  ffBonusBadWeather: Subject.create<boolean>(false),    // true if bad weather detected

  // Calculated result (displayed in recap)
  ffScore: Subject.create<number>(0),                   // Score 0-1500 (same scale as missions)
  ffGrade: Subject.create<string>(""),                  // S/A/B/C/D/F (same scale)
  ffXpEarned: Subject.create<number>(0),                // Final calculated XP
  ffRecapData: Subject.create<FreeFlightRecapData | null>(null),  // Complete data for popup

  // UI
  ffShowRecap: Subject.create<boolean>(false),          // Show recap popup
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

export function resetFreeFlightState(): void {
  freeFlightState.status.set("idle");
  freeFlightState.currentSession.set(null);

  // Session tracking
  freeFlightState.sessionId.set("");
  freeFlightState.isTracking.set(false);

  // Flight tracking
  freeFlightState.flightTimeMinutes.set(0);
  freeFlightState.distanceFlownNm.set(0);
  freeFlightState.fuelUsedGallons.set(0);
  freeFlightState.landingsCount.set(0);
  freeFlightState.startLat.set(0);
  freeFlightState.startLon.set(0);
  freeFlightState.startFuelGallons.set(0);
  freeFlightState.departureAirport.set("");
  freeFlightState.currentAirport.set(null);
  freeFlightState.estimatedXp.set(0);
  freeFlightState.error.set(null);

  // Live tracking UI
  freeFlightState.ffTrackingAirspeed.set(0);
  freeFlightState.ffTrackingFuelPercent.set(0);
  freeFlightState.ffTrackingMaxGForce.set(1.0);
  freeFlightState.ffTrackingCurrentGForce.set(1.0);
  freeFlightState.ffTrackingGForceAlert.set(false);
  freeFlightState.ffTrackingOverspeed.set(false);
  freeFlightState.ffTrackingScoreEstimated.set(1000);
  freeFlightState.ffTrackingGradeEstimated.set("A");
  freeFlightState.ffTrackingSimRate.set(1.0);
  freeFlightState.ffTrackingPhaseId.set("idle");
  freeFlightState.ffTrackingPhaseText.set("");
  freeFlightState.ffTrackingPhaseColor.set("#9ca3af");
  freeFlightState.ffTrackingLightNav.set(0);
  freeFlightState.ffTrackingLightStrobe.set(0);
  freeFlightState.ffTrackingLightBeacon.set(0);
  freeFlightState.ffTrackingLightLanding.set(0);
  freeFlightState.ffTrackingLightTaxi.set(0);
  freeFlightState.ffTrackingLightsMissing.set(0);
  freeFlightState.ffTrackingLightsUnnecessary.set(0);
  freeFlightState.ffTrackingLightsStatusColor.set("green");

  // V2.0: Reset enhanced tracking states
  freeFlightState.ffArrivalIcao.set("");
  freeFlightState.ffDistanceNm.set(0);
  freeFlightState.ffFlightTimeMin.set(0);
  freeFlightState.ffLandingFpm.set(0);
  freeFlightState.ffMaxGforce.set(1);
  freeFlightState.ffFuelStartPercent.set(0);
  freeFlightState.ffFuelEndPercent.set(0);
  freeFlightState.ffBonusRealTime.set(true);
  freeFlightState.ffBonusNight.set(false);
  freeFlightState.ffBonusAtc.set(true);
  freeFlightState.ffBonusFuelEco.set(false);
  freeFlightState.ffBonusNoAutopilot.set(true);
  freeFlightState.ffBonusBadWeather.set(false);
  freeFlightState.ffScore.set(0);
  freeFlightState.ffGrade.set("");
  freeFlightState.ffXpEarned.set(0);
  freeFlightState.ffRecapData.set(null);
  freeFlightState.ffShowRecap.set(false);
}

export function formatFlightTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}
