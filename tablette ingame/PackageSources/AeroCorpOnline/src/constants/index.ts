/**
 * AeroCorpOnline Constants - Configuration values
 * Extracted for better maintainability and centralized configuration
 * P2P Mode: All network API calls removed - 100% local storage
 */

// ═══════════════════════════════════════════════════════════
// TRACKING INTERVALS (milliseconds)
// ═══════════════════════════════════════════════════════════
export const SIMVAR_UPDATE_INTERVAL_MS = 500;          // SimVar polling (0.5s)
export const FLIGHT_TRACKING_INTERVAL_MS = 2000;       // Mission tracking (2s)
export const BACKGROUND_TRACKING_INTERVAL_MS = 30000;  // Background anti-cheat (30s)
export const FUEL_SYNC_MIN_INTERVAL_MS = 120000;       // Fuel sync minimum interval (2 min)

// ═══════════════════════════════════════════════════════════
// FLIGHT DETECTION THRESHOLDS
// ═══════════════════════════════════════════════════════════
export const OVERSPEED_IAS_LOW_ALT = 250;  // Max IAS below 10000ft
export const OVERSPEED_IAS_HIGH_ALT = 400; // Max IAS above 10000ft
export const OVERSPEED_ALTITUDE_THRESHOLD = 10000; // Altitude to switch IAS limits
export const MIN_LANDING_FPM = 50;         // Minimum FPM to count as landing
export const GROUND_ALTITUDE_THRESHOLD = 500; // Max altitude to consider "landed"

// ═══════════════════════════════════════════════════════════
// LANDING RATINGS (based on vertical speed in fpm)
// ═══════════════════════════════════════════════════════════
export const LANDING_RATINGS = {
  BUTTER: { maxFpm: 60, label: "Butter", color: "#22c55e" },
  SMOOTH: { maxFpm: 120, label: "Smooth", color: "#22c55e" },
  GOOD: { maxFpm: 200, label: "Good", color: "#84cc16" },
  FIRM: { maxFpm: 300, label: "Firm", color: "#eab308" },
  HARD: { maxFpm: 400, label: "Hard", color: "#f97316" },
  ROUGH: { maxFpm: 600, label: "Rough", color: "#ef4444" },
  VERY_HARD: { maxFpm: 1000, label: "Very Hard", color: "#dc2626" },
  CRASH: { maxFpm: Infinity, label: "Crash!", color: "#991b1b" },
} as const;

// ═══════════════════════════════════════════════════════════
// SCORING THRESHOLDS
// ═══════════════════════════════════════════════════════════
export const SCORE_THRESHOLDS = {
  LANDING: {
    EXCELLENT: 30,  // Score >= 30 = green
    GOOD: 15,       // Score >= 15 = orange
    // Below = red
  },
  TIME_RATIO: {
    FULL_BONUS: 80,     // >= 80% real time = 50pt bonus
    MEDIUM_BONUS: 50,   // >= 50% real time = 30pt bonus
    // Below = 0pt bonus
  },
  GRADE: {
    S: 90,
    A: 75,
    B: 50,
    C: 25,
    // Below = D
  },
} as const;

// ═══════════════════════════════════════════════════════════
// FUEL & REFUEL
// ═══════════════════════════════════════════════════════════
export const REFUEL_PRICE_PER_GALLON = 6.50;  // USD per gallon
export const GALLONS_TO_LITERS = 3.78541;
export const KG_TO_LBS = 2.20462;
export const NM_TO_KM = 1.852;
export const FT_TO_METERS = 0.3048;

// ═══════════════════════════════════════════════════════════
// PAYLOAD VERIFICATION
// ═══════════════════════════════════════════════════════════
export const PAYLOAD_TOLERANCE_PERCENT = 0.05; // 5% tolerance for payload verification
export const FUEL_TOLERANCE_GALLONS = 2;       // 2 gallon tolerance for fuel sync

// ═══════════════════════════════════════════════════════════
// MAP CONFIGURATION
// ═══════════════════════════════════════════════════════════
export const MAP_DEFAULT_ZOOM = 10;
export const MAP_MIN_ZOOM = 3;
export const MAP_MAX_ZOOM = 18;
export const MAP_DEBOUNCE_MS = 500; // Debounce for map move events

// ═══════════════════════════════════════════════════════════
// AIRCRAFT SYSTEMS
// ═══════════════════════════════════════════════════════════
export const SYSTEM_WARNING_THRESHOLD = 50;  // % condition = warning
export const SYSTEM_CRITICAL_THRESHOLD = 25; // % condition = critical
export const SYSTEM_FAILED_THRESHOLD = 0;    // % condition = failed

export const SYSTEM_NAMES: Record<string, string> = {
  engine: "Engine",
  landing_gear: "Landing Gear",
  propeller: "Propeller",
  electrical: "Electrical",
  pitot: "Pitot",
  avionics: "Avionics",
};

export const SYSTEM_NAMES_FR: Record<string, string> = {
  engine: "Moteur",
  landing_gear: "Train d'atterrissage",
  propeller: "Hélice",
  electrical: "Électrique",
  pitot: "Tube Pitot",
  avionics: "Avionique",
};

// ═══════════════════════════════════════════════════════════
// UI CONFIGURATION
// ═══════════════════════════════════════════════════════════
export const MAX_CHECKPOINT_LINES = 8;       // Max checkpoint lines to display
export const NEARBY_AIRPORTS_RADIUS_NM = 50; // Radius for nearby airports search

// ═══════════════════════════════════════════════════════════
// MODIFIERS LIST (V1.0)
// ═══════════════════════════════════════════════════════════
export const AVAILABLE_MODIFIERS = [
  { id: "no_autopilot", label: "No Autopilot", labelFr: "Sans Autopilote", bonus: 20 },
  { id: "night_flight", label: "Night Flight", labelFr: "Vol de Nuit", bonus: 15 },
  { id: "bad_weather", label: "Bad Weather", labelFr: "Mauvais Temps", bonus: 25 },
  { id: "short_runway", label: "Short Runway", labelFr: "Piste Courte", bonus: 10 },
  { id: "heavy_load", label: "Heavy Load", labelFr: "Charge Lourde", bonus: 10 },
  { id: "mountain_ops", label: "Mountain Ops", labelFr: "Opérations Montagne", bonus: 20 },
  { id: "ifr_only", label: "IFR Only", labelFr: "IFR Uniquement", bonus: 15 },
] as const;

// ═══════════════════════════════════════════════════════════
// LANGUAGES
// ═══════════════════════════════════════════════════════════
export const SUPPORTED_LANGUAGES = ["en", "fr", "de", "es", "ru"] as const;
export const DEFAULT_LANGUAGE = "en";
