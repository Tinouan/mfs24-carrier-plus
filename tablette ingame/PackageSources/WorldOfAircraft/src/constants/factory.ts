/**
 * Factory System Constants — Phase 9
 * Configuration for factories, workers, and production
 */

// ═══════════════════════════════════════════════════════════
// FACTORY TIER CONFIG
// ═══════════════════════════════════════════════════════════

export interface FactoryTierConfig {
  tier: number;
  max_ingredients: number;
  max_workers: number;
  max_engineers: number;
  upgrade_cost: number;       // PLACEHOLDER — will be rebalanced
  food_capacity: number;
}

export const FACTORY_TIER_CONFIG: FactoryTierConfig[] = [
  { tier: 1,  max_ingredients: 2, max_workers: 10,  max_engineers: 0, upgrade_cost: 0,       food_capacity: 200 },
  { tier: 2,  max_ingredients: 2, max_workers: 20,  max_engineers: 1, upgrade_cost: 5_000,   food_capacity: 500 },
  { tier: 3,  max_ingredients: 3, max_workers: 30,  max_engineers: 1, upgrade_cost: 10_000,  food_capacity: 1000 },
  { tier: 4,  max_ingredients: 3, max_workers: 40,  max_engineers: 2, upgrade_cost: 20_000,  food_capacity: 2000 },
  { tier: 5,  max_ingredients: 4, max_workers: 50,  max_engineers: 2, upgrade_cost: 40_000,  food_capacity: 3000 },
  { tier: 6,  max_ingredients: 4, max_workers: 60,  max_engineers: 3, upgrade_cost: 60_000,  food_capacity: 4000 },
  { tier: 7,  max_ingredients: 5, max_workers: 70,  max_engineers: 3, upgrade_cost: 90_000,  food_capacity: 5000 },
  { tier: 8,  max_ingredients: 5, max_workers: 80,  max_engineers: 4, upgrade_cost: 130_000, food_capacity: 7000 },
  { tier: 9,  max_ingredients: 5, max_workers: 90,  max_engineers: 4, upgrade_cost: 180_000, food_capacity: 9000 },
  { tier: 10, max_ingredients: 5, max_workers: 100, max_engineers: 5, upgrade_cost: 250_000, food_capacity: 12000 },
];

/** Cost to create a new T1 factory */
export const FACTORY_CREATION_COST = 25_000;

// ═══════════════════════════════════════════════════════════
// UPGRADE COSTS (items + duration per target tier)
// ═══════════════════════════════════════════════════════════

export interface UpgradeCost {
  credits: number;
  items: { item_id: string; name: string; quantity: number }[];
  time_hours: number;
}

/** Upgrade cost to reach target tier (key = target tier) — instant upgrades, no timer */
export const UPGRADE_COSTS: Record<number, UpgradeCost> = {
  2: {
    credits: 5_000,
    items: [
      { item_id: "steel-ingot", name: "Steel Ingot", quantity: 10 },
      { item_id: "bricks", name: "Bricks", quantity: 5 },
    ],
    time_hours: 0,
  },
  3: {
    credits: 10_000,
    items: [
      { item_id: "reinforced-steel", name: "Reinforced Steel", quantity: 15 },
      { item_id: "cement", name: "Cement", quantity: 10 },
      { item_id: "glass", name: "Glass", quantity: 5 },
    ],
    time_hours: 0,
  },
  4: {
    credits: 20_000,
    items: [
      { item_id: "reinforced-steel", name: "Reinforced Steel", quantity: 20 },
      { item_id: "window-panes", name: "Window Panes", quantity: 10 },
      { item_id: "wire-cable", name: "Wire Cable", quantity: 5 },
    ],
    time_hours: 0,
  },
  5: {
    credits: 40_000,
    items: [
      { item_id: "steel-beam", name: "Steel Beam", quantity: 15 },
      { item_id: "insulation", name: "Insulation", quantity: 10 },
      { item_id: "circuit-board", name: "Circuit Board", quantity: 5 },
    ],
    time_hours: 0,
  },
  6: {
    credits: 60_000,
    items: [
      { item_id: "steel-beam", name: "Steel Beam", quantity: 20 },
      { item_id: "structural-panel", name: "Structural Panel", quantity: 10 },
      { item_id: "electric-motor", name: "Electric Motor", quantity: 5 },
    ],
    time_hours: 0,
  },
  7: {
    credits: 90_000,
    items: [
      { item_id: "structural-panel", name: "Structural Panel", quantity: 15 },
      { item_id: "armored-plate", name: "Armored Plate", quantity: 10 },
      { item_id: "sensor-module", name: "Sensor Module", quantity: 5 },
    ],
    time_hours: 0,
  },
  8: {
    credits: 130_000,
    items: [
      { item_id: "armored-plate", name: "Armored Plate", quantity: 20 },
      { item_id: "power-supply", name: "Power Supply", quantity: 10 },
      { item_id: "advanced-battery", name: "Advanced Battery", quantity: 5 },
    ],
    time_hours: 0,
  },
  9: {
    credits: 180_000,
    items: [
      { item_id: "avionics-unit", name: "Avionics Unit", quantity: 10 },
      { item_id: "generator", name: "Generator", quantity: 10 },
      { item_id: "industrial-robot-arm", name: "Industrial Robot Arm", quantity: 5 },
    ],
    time_hours: 0,
  },
  10: {
    credits: 250_000,
    items: [
      { item_id: "satellite-component", name: "Satellite Component", quantity: 5 },
      { item_id: "flight-computer", name: "Flight Computer", quantity: 5 },
      { item_id: "surgical-robot", name: "Surgical Robot", quantity: 3 },
    ],
    time_hours: 0,
  },
};

/** Cancel upgrade refund rate (80% of CR) */
export const UPGRADE_CANCEL_REFUND_RATE = 0.80;

// ═══════════════════════════════════════════════════════════
// AIRPORT FACTORY SLOTS
// ═══════════════════════════════════════════════════════════

export const AIRPORT_FACTORY_SLOTS: Record<string, number> = {
  large_airport: 10,
  medium_airport: 5,
  small_airport: 2,
  seaplane_base: 1,
  heliport: 1,
  closed: 0,
};

// ═══════════════════════════════════════════════════════════
// WORKER XP TIERS
// ═══════════════════════════════════════════════════════════

export interface WorkerXpTier {
  tier: number;
  name: string;
  xp_required: number;
  speed_bonus: number;       // Multiplier (1.0 = no bonus)
  production_bonus: number;  // Multiplier (1.0 = no bonus)
}

export const WORKER_XP_TIERS: WorkerXpTier[] = [
  { tier: 1, name: "Novice",    xp_required: 0,     speed_bonus: 1.00, production_bonus: 1.00 },
  { tier: 2, name: "Apprenti",  xp_required: 1000,  speed_bonus: 1.05, production_bonus: 1.05 },
  { tier: 3, name: "Compagnon", xp_required: 5000,  speed_bonus: 1.10, production_bonus: 1.10 },
  { tier: 4, name: "Expert",    xp_required: 15000, speed_bonus: 1.15, production_bonus: 1.15 },
  { tier: 5, name: "Maitre",    xp_required: 50000, speed_bonus: 1.20, production_bonus: 1.25 },
];

// ═══════════════════════════════════════════════════════════
// WORKER CONSTANTS
// ═══════════════════════════════════════════════════════════

/** Base injury risk per hour of work (0.5%) */
export const WORKER_BASE_INJURY_RISK = 0.005;

/** Injury risk multiplier when factory has no food (x2) */
export const WORKER_NO_FOOD_INJURY_MULTIPLIER = 2;

/** Efficiency when factory has no food (30%) */
export const NO_FOOD_EFFICIENCY = 0.3;

/** Food consumed per worker per hour */
export const FOOD_PER_WORKER_PER_HOUR = 1;

/** Penalty when a worker dies */
export const WORKER_DEATH_PENALTY = 10000;

/** Max injury duration in days before death */
export const WORKER_MAX_INJURY_DAYS = 10;

// ═══════════════════════════════════════════════════════════
// PRODUCTION CONSTANTS
// ═══════════════════════════════════════════════════════════

/** Max worker tier bonus on production quantity (+25%) */
export const MAX_WORKER_TIER_BONUS = 1.25;

/** XP gained per completed batch = recipe.tier * this value */
export const XP_PER_BATCH_MULTIPLIER = 10;

// ═══════════════════════════════════════════════════════════
// FOOD TIER BONUS — Higher-tier food speeds up production
// ═══════════════════════════════════════════════════════════

/** Food tier bonus multiplier: tier → speed multiplier */
export const FOOD_TIER_BONUS: Record<number, number> = {
  0: 1.0,   // T0 raw food (meat, fish, wheat…)
  1: 1.15,  // T1 processed (bread, salted meat…)
  2: 1.30,  // T2 quality (quality bread, cheese…)
  3: 1.45,  // T3 gourmet
  4: 1.60,  // T4 premium
  5: 1.80,  // T5 elite
};

// ═══════════════════════════════════════════════════════════
// ENGINEER BONUS — Diminishing returns on production speed
// ═══════════════════════════════════════════════════════════

/** Engineer bonus increments (diminishing returns) */
const ENGINEER_BONUS_STEPS = [0.10, 0.08, 0.06, 0.05, 0.04];

/** Max engineer bonus cap by factory tier */
export const ENGINEER_MAX_BONUS: Record<number, number> = {
  1: 0.18, 2: 0.24, 3: 0.33, 4: 0.42, 5: 0.50,
  6: 0.50, 7: 0.50, 8: 0.50, 9: 0.50, 10: 0.50,
};

/** Calculate engineer production speed bonus */
export function calculateEngineerBonus(nbEngineers: number, factoryTier: number): number {
  let bonus = 0;
  for (let i = 0; i < nbEngineers; i++) {
    bonus += i < ENGINEER_BONUS_STEPS.length ? ENGINEER_BONUS_STEPS[i] : 0.03;
  }
  const cap = ENGINEER_MAX_BONUS[factoryTier] ?? 0.50;
  return Math.min(bonus, cap);
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

/** Get tier config for a given tier number */
export function getFactoryTierConfig(tier: number): FactoryTierConfig {
  return FACTORY_TIER_CONFIG[Math.min(Math.max(tier - 1, 0), FACTORY_TIER_CONFIG.length - 1)];
}

/** Calculate worker tier from XP */
export function calculateWorkerTier(xp: number): number {
  if (xp >= 50000) return 5;
  if (xp >= 15000) return 4;
  if (xp >= 5000) return 3;
  if (xp >= 1000) return 2;
  return 1;
}

/** Get worker tier name */
export function getWorkerTierName(tier: number): string {
  return WORKER_XP_TIERS[Math.min(Math.max(tier - 1, 0), WORKER_XP_TIERS.length - 1)].name;
}

/** Check if a factory can execute a recipe (based on ingredient count) */
export function canFactoryExecuteRecipe(factoryTier: number, ingredientCount: number): boolean {
  if (factoryTier >= 9) return true;
  const config = getFactoryTierConfig(factoryTier);
  return ingredientCount <= config.max_ingredients;
}
