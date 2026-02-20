/**
 * WearConstants — Centralized Wear & Tear V2.0 constants
 * Source of truth for all wear rates, repair costs, thresholds, and display data.
 * Spec: spec-wear-tear-v2.md
 */

// ═══════════════════════════════════════════════════════════
// SYSTEM LIST — 10 systems (V2.0)
// ═══════════════════════════════════════════════════════════

export const ALL_SYSTEMS_V2 = [
  "engine", "landing_gear", "tires", "brakes", "propeller",
  "oil", "flight_surfaces", "electrical", "fuel_system", "avionics",
] as const;

export type SystemName = (typeof ALL_SYSTEMS_V2)[number];

// ═══════════════════════════════════════════════════════════
// DISPLAY — Names & Icons
// ═══════════════════════════════════════════════════════════

export const SYSTEM_NAMES_FR_V2: Record<string, string> = {
  engine: "Moteur",
  landing_gear: "Train",
  tires: "Pneus",
  brakes: "Freins",
  propeller: "Hélice",
  oil: "Huile",
  flight_surfaces: "Surfaces de vol",
  electrical: "Électrique",
  fuel_system: "Circuit carburant",
  avionics: "Avionique",
};

export const SYSTEM_ICONS: Record<string, string> = {
  engine: "ENG",
  landing_gear: "GEAR",
  tires: "TIRE",
  brakes: "BRK",
  propeller: "PROP",
  oil: "OIL",
  flight_surfaces: "SURF",
  electrical: "ELEC",
  fuel_system: "FUEL",
  avionics: "AVI",
};

// ═══════════════════════════════════════════════════════════
// WEAR RATES — Per hour of flight (spec A4)
// ═══════════════════════════════════════════════════════════

export const WEAR_PER_HOUR: Record<string, number> = {
  engine: 4.0,
  landing_gear: 1.0,
  tires: 1.5,
  brakes: 2.0,
  propeller: 2.0,
  oil: 3.0,
  flight_surfaces: 0.5,
  electrical: 0.6,
  fuel_system: 0.3,
  avionics: 1.0,
};

// ═══════════════════════════════════════════════════════════
// LANDING WEAR — Per landing by FPM bracket (spec A5)
// ═══════════════════════════════════════════════════════════

export const LANDING_WEAR: Array<[number, number, Record<string, number>]> = [
  [0, 200, {
    landing_gear: 2.0, tires: 3.0, brakes: 1.0,
  }],
  [200, 400, {
    landing_gear: 6.0, tires: 8.0, brakes: 3.0, flight_surfaces: 1.0,
  }],
  [400, 700, {
    landing_gear: 20.0, tires: 25.0, brakes: 10.0,
    propeller: 10.0, flight_surfaces: 5.0,
  }],
  [700, 1000, {
    landing_gear: 50.0, tires: 60.0, brakes: 20.0,
    propeller: 30.0, engine: 20.0, flight_surfaces: 15.0,
    oil: 10.0,
  }],
  [1000, 9999, {
    landing_gear: 80.0, tires: 90.0, brakes: 40.0,
    propeller: 50.0, engine: 40.0, flight_surfaces: 30.0,
    oil: 25.0, fuel_system: 15.0, electrical: 10.0,
  }],
];

// ═══════════════════════════════════════════════════════════
// G-FORCE WEAR — Threshold-based (spec A6)
// ═══════════════════════════════════════════════════════════

export const GFORCE_WEAR: Array<[number, Record<string, number>]> = [
  [4.0, {
    engine: 20.0, avionics: 16.0, propeller: 12.0,
    electrical: 10.0, landing_gear: 10.0,
    flight_surfaces: 15.0, oil: 8.0, fuel_system: 5.0,
  }],
  [3.0, {
    engine: 10.0, avionics: 8.0, propeller: 6.0,
    flight_surfaces: 8.0, oil: 4.0,
  }],
  [2.5, {
    engine: 6.0, avionics: 4.0, flight_surfaces: 3.0,
  }],
];

// ═══════════════════════════════════════════════════════════
// OVERSPEED & OVERWEIGHT WEAR (spec A7)
// ═══════════════════════════════════════════════════════════

export const OVERSPEED_WEAR: Record<string, number> = {
  engine: 10.0, propeller: 10.0,
  flight_surfaces: 8.0, oil: 5.0,
};

export const OVERWEIGHT_WEAR_MULTIPLIER: Record<string, number> = {
  landing_gear: 0.10,
  engine: 0.04,
  tires: 0.12,
  brakes: 0.08,
};

// ═══════════════════════════════════════════════════════════
// REPAIR COSTS (spec A8)
// ═══════════════════════════════════════════════════════════

export const REPAIR_COST_RATE: Record<string, number> = {
  engine: 0.0015,
  landing_gear: 0.0010,
  tires: 0.0004,
  brakes: 0.0005,
  propeller: 0.0008,
  oil: 0.0002,
  flight_surfaces: 0.0012,
  electrical: 0.0005,
  fuel_system: 0.0006,
  avionics: 0.0012,
};

// ═══════════════════════════════════════════════════════════
// THRESHOLDS (spec A9)
// ═══════════════════════════════════════════════════════════

export const CRITICAL_SYSTEMS: string[] = ["engine", "landing_gear", "tires", "fuel_system"];
export const CRITICAL_THRESHOLD = 10.0;
export const WARNING_THRESHOLD = 50.0;
export const DANGER_THRESHOLD = 25.0;

// ═══════════════════════════════════════════════════════════
// DISPLAY THRESHOLDS (spec D2)
// ═══════════════════════════════════════════════════════════

export const CONDITION_LABELS: Array<{ min: number; label: string; color: string }> = [
  { min: 75, label: "Neuf", color: "#22c55e" },
  { min: 50, label: "Bon", color: "#eab308" },
  { min: 25, label: "Usé", color: "#f59e0b" },
  { min: 10, label: "Critique", color: "#ef4444" },
  { min: 0, label: "HS", color: "#991b1b" },
];

// ═══════════════════════════════════════════════════════════
// MSFS W&T MAPPING (spec B1)
// ═══════════════════════════════════════════════════════════

export const MSFS_TO_SYSTEM: Record<number, string> = {
  39: "engine",
  40: "engine",
  35: "landing_gear",
  37: "tires",
  38: "tires",
  36: "brakes",
  41: "oil",
  42: "oil",
  5: "flight_surfaces",
  6: "flight_surfaces",
  9: "flight_surfaces",
  10: "flight_surfaces",
  13: "flight_surfaces",
  19: "flight_surfaces",
  28: "electrical",
  29: "electrical",
  0: "fuel_system",
  43: "avionics",
  44: "avionics",
  45: "avionics",
};

export const MSFS_FAILURE_CHECKS = [
  { id: 37, system: "tires" },
  { id: 35, system: "landing_gear" },
  { id: 39, system: "engine" },
  { id: 40, system: "engine" },
  { id: 36, system: "brakes" },
  { id: 28, system: "electrical" },
];
