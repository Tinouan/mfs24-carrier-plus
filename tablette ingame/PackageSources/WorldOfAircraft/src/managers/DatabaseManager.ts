/**
 * DatabaseManager - Local localStorage persistence for P2P mode
 * Provides offline-first storage with automatic sync capability
 * Note: Uses localStorage instead of IndexedDB for Coherent GT compatibility
 */

import type { ContractOffer, ActiveContract } from "../types";

// ═══════════════════════════════════════════════════════════
// TYPES - Complete interfaces matching backend PostgreSQL schema
// ═══════════════════════════════════════════════════════════

export interface DatabaseCallbacks {
  onReady?: () => void;
  onError?: (error: Error) => void;
  onDataChanged?: () => void;  // V4.1 FIX: Called when critical data changes, for NativePersistence sync
}

// ─────────────────────────────────────────────────────────
// USER / PLAYER
// ─────────────────────────────────────────────────────────

export interface Player {
  id: string;
  name: string;
  email?: string;
  xp: number;
  money: number;
  trust_score: number;           // 0-100, anti-cheat score
  nationality?: string;          // ISO country code
  preferred_airport?: string;    // ICAO code (home base)
  current_airport?: string;      // V4.1: ICAO code (current position)
  last_latitude?: number;        // V4.1: Last known GPS latitude (for map marker fallback)
  last_longitude?: number;       // V4.1: Last known GPS longitude (for map marker fallback)
  is_premium: boolean;
  created_at: string;
  updated_at: string;
  last_login_at?: string;
}

export interface PlayerProfile {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url?: string;
  bio?: string;
  country?: string;
  timezone?: string;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────
// COMPANY
// ─────────────────────────────────────────────────────────

export interface Company {
  id: string;
  name: string;
  balance: number;
  owner_id: string;
  reputation: number;            // Company reputation score
  headquarters_icao?: string;    // HQ airport
  founded_at: string;
  created_at: string;
  updated_at: string;
}

export interface CompanyMember {
  company_id: string;
  user_id: string;
  role: "owner" | "admin" | "pilot" | "member";
  joined_at: string;
}

// ─────────────────────────────────────────────────────────
// AIRCRAFT
// ─────────────────────────────────────────────────────────

export type SystemStatus = "ok" | "degraded" | "failed";

export interface AircraftSystems {
  id: string;
  aircraft_id: string;
  // System conditions (0-100%)
  engine_condition: number;
  propeller_condition: number;
  landing_gear_condition: number;
  electrical_condition: number;
  avionics_condition: number;
  pitot_condition: number;
  // System status derived from condition
  engine_status: SystemStatus;
  propeller_status: SystemStatus;
  landing_gear_status: SystemStatus;
  electrical_status: SystemStatus;
  avionics_status: SystemStatus;
  pitot_status: SystemStatus;
  // Failure flags
  engine_failed: boolean;
  propeller_failed: boolean;
  landing_gear_failed: boolean;
  electrical_failed: boolean;
  avionics_failed: boolean;
  pitot_failed: boolean;
  // Maintenance
  last_maintenance_at?: string;
  next_maintenance_due_hours?: number;
  created_at: string;
  updated_at: string;
}

export interface Aircraft {
  id: string;
  registration: string;
  name?: string;                 // Optional nickname for the aircraft
  description?: string;          // Optional note/description (max 50 chars)
  type_code: string;             // References AircraftCatalog.icaoType (e.g., "C172")
  company_id: string | null;     // null for personal aircraft
  owner_id: string | null;       // player_id for personal aircraft
  owner_type: "player" | "company";  // Explicit ownership type
  location_icao: string;         // Current airport ICAO code
  status: "parked" | "in_flight" | "maintenance" | "stored";  // Aircraft status
  fuel_gallons: number;
  condition: number;             // 0-100 overall condition
  flight_hours: number;          // Total flight hours
  cycles?: number;               // Number of flights (optional for backwards compat)
  cargo_capacity_kg: number;     // Max cargo capacity from catalog
  passenger_seats?: number;      // V4.1: Passenger capacity (default 4)
  last_flight_at?: string;
  purchase_price?: number;
  for_sale?: boolean;            // Optional for backwards compat
  sale_price?: number;
  is_active?: boolean;           // Soft delete flag (default true)
  created_at: string;
  updated_at?: string;           // Optional for backwards compat
  // Inline systems (simplified for localStorage)
  systems?: AircraftSystemsInline;
}

// Simplified inline systems for localStorage (no separate table needed)
export interface AircraftSystemsInline {
  engine_condition: number;
  propeller_condition: number;
  landing_gear_condition: number;
  electrical_condition: number;
  avionics_condition: number;
  pitot_condition: number;
  engine_failed: boolean;
  propeller_failed: boolean;
  landing_gear_failed: boolean;
  electrical_failed: boolean;
  avionics_failed: boolean;
  pitot_failed: boolean;
  last_maintenance_at?: string;
}

export interface AircraftCatalog {
  id: string;
  name: string;
  icaoType: string;
  manufacturer: string;
  category: "single_piston" | "twin_piston" | "turboprop" | "jet_small" | "jet_medium" | "jet_large" | "cargo_heavy" | "helicopter" | "light" | "high_performance" | "twin" | "bush" | "utility" | "amphibious";
  cargoCapacityKg: number;
  passengerSeats: number;           // V4.1: Passenger capacity
  maxRangeNm: number;
  cruiseSpeedKts: number;
  fuelCapacityGal?: number;
  fuelBurnGph?: number;
  basePrice: number;
  operatingCostPerHour: number;
  minRunwayLengthM: number;
  requiredLicense: "student" | "PPL" | "IR" | "CPL" | "ATPL";
  requiresCopilot: boolean;         // V4.1: Requires copilot
  requiresTypeRating: boolean;      // V4.1: Requires type rating
  isActive: boolean;                // V4.1: Active in catalog
  msfsAircraftId: string;
  // Additional specs
  maxAltitudeFt?: number;
  maxPayloadLbs?: number;
  emptyWeightLbs?: number;
  mtowLbs?: number;
}

export interface AircraftDamageLog {
  id: string;
  aircraft_id: string;
  mission_id?: string;
  damage_type: "wear" | "hard_landing" | "overspeed" | "overstress" | "crash";
  system_affected: string;
  severity: "minor" | "moderate" | "severe" | "critical";
  condition_before: number;
  condition_after: number;
  description?: string;
  created_at: string;
}

export interface AircraftMaintenanceLog {
  id: string;
  aircraft_id: string;
  maintenance_type: "inspection" | "repair" | "overhaul" | "replacement";
  systems_serviced: string[];    // Array of system names
  cost: number;
  duration_hours: number;
  performed_by?: string;
  notes?: string;
  created_at: string;
}

// ─────────────────────────────────────────────────────────
// ITEMS & INVENTORY
// ─────────────────────────────────────────────────────────

export interface Item {
  id: string;
  name: string;
  tier: number;                  // 1-5 rarity/complexity
  tags: string[];                // Categories: "raw", "processed", "cargo", etc.
  icon: string;
  icon_path?: string;              // Path to SVG icon (T0 items)
  baseValue: number;
  weightKg: number;
  isRaw: boolean;
  stackSize: number;
  description: string;
  // Compatibility aliases (populated at load time)
  code: string;
  base_price: number;
  weight_kg: number;
  category: string;
}

export interface Recipe {
  id: string;
  name: string;
  tier: number;
  resultItemId: string;
  resultQuantity: number;
  productionTimeHours: number;
  baseWorkers: number;
  description: string;
  ingredients: RecipeIngredient[];
}

export interface RecipeIngredient {
  itemId: string;
  quantity: number;
}

export interface InventoryLocation {
  id: string;
  location_type: "aircraft" | "airport" | "warehouse" | "factory";
  location_id: string;           // aircraft_id, airport ICAO, etc.
  owner_id?: string;             // Company or player who owns this location
  capacity_kg?: number;
  created_at: string;
}

export interface InventoryItem {
  id: string;
  location_type: "aircraft" | "airport" | "warehouse" | "factory";
  location_id: string;
  item_code: string;
  quantity: number;
  reserved_quantity?: number;    // Quantity reserved for pending orders (defaults to 0)
  owner_type?: "player" | "company";  // V4.1: Ownership tag (default "player")
  source?: string;               // Origin: "contract", "market", "production", etc.
  contract_id?: string;          // Link to contract if spawned by contract acceptance
  created_at?: string;
  updated_at?: string;
}

// ─────────────────────────────────────────────────────────
// FACTORIES & WORKERS
// ─────────────────────────────────────────────────────────

export type FactoryStatusType = "idle" | "producing" | "maintenance" | "offline";

export interface Factory {
  id: string;
  company_id: string;
  airport_ident: string;         // ICAO code (Phase 9)
  name: string;
  tier: number;                  // 0=NPC, 1-10=player
  factory_type: string;
  status: FactoryStatusType;
  current_recipe_id: string | null;
  last_recipe_id?: string | null;
  last_result_item_id?: string | null;
  is_active: boolean;
  max_workers: number;
  max_engineers: number;
  max_ingredients: number;
  food_stock: number;
  food_capacity: number;
  food_tier_min: number;               // Lowest food tier in stock (determines bonus)
  food_items?: { item_code: string; quantity: number; tier: number }[]; // Tracked food deposits
  food_consumption_per_hour: number;
  // NPC fields (tier 0 only)
  item_id?: string;              // T0 item produced (only for NPC tier=0)
  stock_current?: number;        // Current stock (0-stock_max)
  stock_max?: number;            // Max stock capacity (default 1000)
  production_rate?: number;      // Items produced per tick (default 50)
  created_at: string;
}

export type WorkerStatusType = "available" | "working" | "injured" | "dead";

export interface WorkerInstance {
  id: string;
  owner_company_id: string | null;
  owner_player_id: string | null;
  owner_type: "company" | "personal";
  item_id: string;
  airport_ident: string;
  country_code: string;
  speed: number;
  resistance: number;
  xp: number;
  tier: number;
  hourly_salary: number;
  status: WorkerStatusType;
  factory_id: string | null;
  for_sale: boolean;
  sale_price: number | null;
  injured_at: string | null;
  injury_duration_days: number;
  created_at: string;
}

// ─────────────────────────────────────────────────────────
// MARKET
// ─────────────────────────────────────────────────────────

export interface MarketOrder {
  id: string;
  // New schema fields (optional for backwards compat)
  company_id?: string;
  side?: "buy" | "sell";
  unit_price?: number;
  status?: "open" | "filled" | "cancelled" | "expired";
  airport_icao?: string;
  filled_quantity?: number;
  updated_at?: string;
  expires_at?: string;
  // Common fields
  item_code: string;
  quantity: number;
  created_at: string;
  // Backwards compatibility aliases (used by existing code)
  type?: "buy" | "sell";         // Alias for side
  price_per_unit?: number;       // Alias for unit_price
  icao?: string;                 // Alias for airport_icao
  seller_id?: string;            // Alias for company_id
  item_name?: string;            // Resolved item display name
  owner_type?: "player" | "company";
  is_active?: boolean;           // Derived from status === "open"
  metadata?: string;             // Phase 9: extra data (e.g. country_code for worker orders)
}

export interface MarketTransaction {
  id: string;
  order_id: string;
  buyer_company_id: string;
  seller_company_id: string;
  item_code: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  created_at: string;
}

// ─────────────────────────────────────────────────────────
// V4.1: PLAYER SELL ORDERS
// ─────────────────────────────────────────────────────────

export interface SellOrder {
  id: string;                      // UUID
  seller_id: string;               // Player ID
  seller_name: string;             // Player display name
  item_id: string;                 // Item code (e.g., "CARGO_MAIL")
  item_name: string;               // Item display name
  item_tier: number;               // Item tier 0-5
  quantity: number;                // Quantity for sale
  price_per_unit: number;          // Price per unit
  total_price: number;             // quantity * price_per_unit
  owner_type: "player" | "company"; // From personal or company inventory
  airport_icao: string;            // Airport where item is stored
  status: "active" | "sold" | "cancelled";
  created_at: string;              // ISO timestamp
  sold_at?: string;                // ISO timestamp when sold
  buyer_id?: string;               // Buyer ID (AI or player)
  is_aircraft?: boolean;           // True if this is an aircraft sell order
}

// ─────────────────────────────────────────────────────────
// MISSIONS - Complete V0.9 spec
// ─────────────────────────────────────────────────────────

export type MissionStatus =
  | "draft"
  | "pending"
  | "accepted"
  | "boarding"
  | "taxiing"
  | "departed"
  | "in_flight"
  | "in_progress"              // Backwards compatibility alias for in_flight
  | "approach"
  | "landed"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired";

export type MissionType = "cargo" | "passenger" | "medical" | "vip" | "charter" | "tour";

export interface Mission {
  id: string;
  // Core references
  user_id?: string;               // New field, optional for backwards compat
  player_id?: string;             // Backwards compat alias for user_id
  company_id?: string;
  aircraft_id: string;

  // Mission definition
  mission_type?: MissionType;
  origin_icao: string;
  destination_icao: string;
  alternate_icao?: string;
  status: MissionStatus;

  // Payload
  cargo_kg: number;
  pax_count?: number;
  cargo_description?: string;

  // Flight plan
  planned_route?: string;
  planned_altitude_ft?: number;
  planned_speed_kts?: number;
  estimated_flight_time_min?: number;

  // Distance
  great_circle_nm?: number;
  distance_nm?: number;           // Backwards compat alias for great_circle_nm
  planned_distance_nm?: number;
  actual_distance_nm?: number;

  // Fuel
  block_fuel_gal?: number;
  fuel_used_gal?: number;

  // Timing
  scheduled_departure?: string;
  actual_departure?: string;
  scheduled_arrival?: string;
  actual_arrival?: string;
  flight_time_minutes?: number;
  block_time_minutes?: number;

  // Rewards
  base_reward?: number;
  bonus_reward?: number;
  penalty?: number;
  final_reward?: number;
  xp_earned?: number;

  // Scoring
  score_total?: number | null;
  score_landing?: number | null;
  score_fuel_efficiency?: number | null;
  score_time?: number | null;
  score_safety?: number | null;
  score_smoothness?: number | null;
  grade?: string | null;         // "A+", "A", "B", etc.

  // Landing data
  landing_vs_fpm?: number;
  landing_g_force?: number;
  landing_centerline_ft?: number;
  landing_touchdown_zone?: boolean;
  landing_runway?: string;

  // Tracking
  max_altitude_ft?: number;
  max_speed_kts?: number;
  max_g_force?: number;
  overspeed_seconds?: number;
  stall_count?: number;

  // Anti-cheat
  sim_rate_violations?: number;
  pause_count?: number;
  total_pause_seconds?: number;
  slew_detected?: boolean;
  teleport_detected?: boolean;
  position_anomalies?: number;
  trust_score_delta?: number;
  client_version?: string;

  // Weather at departure
  departure_metar?: string;
  departure_wind_dir?: number;
  departure_wind_speed?: number;
  departure_visibility_sm?: number;
  departure_ceiling_ft?: number;

  // Weather at arrival
  arrival_metar?: string;
  arrival_wind_dir?: number;
  arrival_wind_speed?: number;
  arrival_visibility_sm?: number;
  arrival_ceiling_ft?: number;

  // Night/IFR tracking
  night_flight?: boolean;
  ifr_flight?: boolean;
  night_time_minutes?: number;
  ifr_time_minutes?: number;

  // Failure reason
  failure_reason?: string;
  failure_details?: string;

  // Timestamps
  created_at: string;
  started_at?: string;
  completed_at?: string | null;
  updated_at?: string;
}

export interface MissionLeg {
  id: string;
  mission_id: string;
  leg_number: number;
  from_icao: string;
  to_icao: string;
  distance_nm: number;
  status: "pending" | "in_progress" | "completed" | "skipped";
  started_at?: string;
  completed_at?: string;
}

export interface MissionWaypoint {
  id: string;
  mission_id: string;
  sequence: number;
  waypoint_type: "airport" | "vor" | "ndb" | "fix" | "coordinates";
  identifier: string;
  latitude: number;
  longitude: number;
  altitude_ft?: number;
  is_mandatory: boolean;
  reached_at?: string;
}

export interface MissionEvent {
  id: string;
  mission_id: string;
  event_type: string;            // "takeoff", "landing", "overspeed", "stall", etc.
  severity: "info" | "warning" | "critical";
  latitude?: number;
  longitude?: number;
  altitude_ft?: number;
  speed_kts?: number;
  description?: string;
  data?: Record<string, any>;    // Additional event data
  created_at: string;
}

export interface MissionFlightData {
  id: string;
  mission_id: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  altitude_ft: number;
  heading: number;
  ground_speed_kts: number;
  vertical_speed_fpm: number;
  fuel_remaining_gal: number;
  on_ground: boolean;
}

export interface MissionCargo {
  id: string;
  mission_id: string;
  item_code: string;
  quantity: number;
  weight_kg: number;
  is_delivered: boolean;
}

// ─────────────────────────────────────────────────────────
// PILOT CAREER & STATS
// ─────────────────────────────────────────────────────────

export interface PilotCareerStats {
  id: string;
  user_id: string;

  // Mission counts
  total_missions: number;
  completed_missions: number;
  failed_missions: number;
  cancelled_missions: number;

  // Flight time
  total_flight_time_minutes: number;
  total_airborne_time_minutes: number;
  night_flight_time_minutes: number;
  ifr_flight_time_minutes: number;

  // Distance
  total_distance_nm: number;
  longest_flight_nm: number;

  // Landings
  total_landings: number;
  butter_landings: number;       // VS < 100 fpm
  hard_landings: number;         // VS > 400 fpm
  avg_landing_rate_fpm?: number;
  best_landing_rate_fpm?: number;

  // Scoring
  total_score: number;
  average_score?: number;
  best_score: number;
  worst_score?: number;
  average_grade?: string;

  // Fuel
  total_fuel_used_lbs: number;
  avg_fuel_efficiency?: number;

  // Airports & exploration
  unique_airports_visited: number;
  unique_countries_visited: number;

  // Aircraft experience (JSON)
  aircraft_hours?: Record<string, number>;  // { "C172": 45.5, "A320": 120.0 }
  favorite_aircraft?: string;

  // Achievements (JSON)
  achievements?: string[];       // ["first_flight", "100_hours", etc.]

  // Streaks
  current_streak_days: number;
  longest_streak_days: number;
  last_flight_date?: string;

  // Career progression
  career_level: number;
  career_xp: number;

  created_at: string;
  updated_at: string;
}

export interface FreeFlightSession {
  id: string;
  user_id?: string;
  player_id?: string;            // Backwards compat alias for user_id
  aircraft_id?: string;
  company_id?: string;

  // Airports
  start_airport?: string | null;
  end_airport?: string | null;

  // Position tracking
  start_lat?: number;
  start_lon?: number;
  start_fuel_gallons?: number;
  end_lat?: number;
  end_lon?: number;
  end_fuel_gallons?: number;

  // Flight stats
  flight_time_minutes: number;
  distance_nm: number;
  landings_count: number;
  fuel_used_gallons?: number;

  // XP (2/min + 50/landing + 25/100nm)
  xp_earned: number;

  // Status
  is_active?: boolean;

  // Timestamps
  started_at: string;
  ended_at?: string | null;
  created_at?: string;
}

// ─────────────────────────────────────────────────────────
// V4.1: TRANSACTION LOG
// ─────────────────────────────────────────────────────────

export type TransactionType =
  | "mission_reward"
  | "free_flight_reward"
  | "market_buy"
  | "market_sell"
  | "refuel"
  | "repair"
  | "company_create"
  | "transfer_in"
  | "transfer_out"
  | "transfer_to_company"
  | "transfer_from_company"
  | "contract_reward"
  | "pilot_transfer"
  | "aircraft_transfer"
  | "factory_create"
  | "factory_upgrade"
  | "worker_salary";

export interface TransactionLog {
  id: string;              // UUID
  timestamp: string;       // ISO8601
  type: TransactionType;
  amount: number;          // Positif = gain, Négatif = dépense
  balance_after: number;   // Solde après l'opération
  wallet: "player" | "company";
  description: string;     // Ex: "Mission LFPG→LFBO (Grade A)", "Achat Raw Wood x50"
  related_id?: string;     // ID mission, ID ordre market, etc.
  airport_icao?: string;   // Où ça s'est passé
}

// ─────────────────────────────────────────────────────────
// AIRPORTS
// ─────────────────────────────────────────────────────────

export interface Airport {
  // OurAirports data
  id?: number;
  ident: string;
  type: string;                  // "large_airport", "medium_airport", etc.
  name: string;
  latitude: number;
  longitude: number;
  elevation: number;             // feet
  continent: string;
  country: string;               // ISO code
  region: string;                // ISO region
  municipality: string;
  iata_code?: string;
  gps_code?: string;

  // Factory system
  max_factory_slots?: number;
  occupied_slots?: number;
}

// Store names - all available localStorage collections
type StoreName =
  | "player"
  | "player_profile"
  | "company"
  | "company_members"
  | "aircraft"
  | "aircraft_systems"
  | "aircraft_damage_log"
  | "aircraft_maintenance_log"
  | "aircraft_catalog"
  | "inventory"
  | "inventory_locations"
  | "items"
  | "recipes"
  | "factories"
  | "workers"
  | "production_batches"
  | "market_orders"
  | "market_transactions"
  | "missions"
  | "mission_legs"
  | "mission_waypoints"
  | "mission_events"
  | "mission_flight_data"
  | "mission_cargo"
  | "pilot_career_stats"
  | "free_flight_sessions"
  | "flight_history"       // V2.0: Flight history for missions and free flights
  | "transaction_log"      // V4.1: Financial transaction log
  | "sell_orders"          // V4.1: Player sell orders
  | "company_messages"
  | "contract_offers"       // V5: Contract offers board
  | "active_contracts"      // V5: Active/completed contracts
  | "airports"
  | "sync_log";

// Key path for each store (which field is the primary key)
const KEY_PATHS: Record<StoreName, string> = {
  player: "id",
  player_profile: "id",
  company: "id",
  company_members: "company_id",  // Composite key handled in queries
  aircraft: "id",
  aircraft_systems: "id",
  aircraft_damage_log: "id",
  aircraft_maintenance_log: "id",
  aircraft_catalog: "id",
  inventory: "id",
  inventory_locations: "id",
  items: "id",
  recipes: "id",
  factories: "id",
  workers: "id",
  production_batches: "id",
  market_orders: "id",
  market_transactions: "id",
  missions: "id",
  mission_legs: "id",
  mission_waypoints: "id",
  mission_events: "id",
  mission_flight_data: "id",
  mission_cargo: "id",
  pilot_career_stats: "id",
  free_flight_sessions: "id",
  flight_history: "id",  // V2.0: Flight history
  transaction_log: "id", // V4.1: Transaction log
  sell_orders: "id",     // V4.1: Player sell orders
  company_messages: "id", // V4: Company messaging
  contract_offers: "id",  // V5: Contract offers
  active_contracts: "id", // V5: Active contracts
  airports: "ident",
  sync_log: "id",
};

// ═══════════════════════════════════════════════════════════
// DATABASE MANAGER CLASS (localStorage + Coherent DataStore)
// ═══════════════════════════════════════════════════════════

const STORAGE_PREFIX = "woa_";
const DATASTORE_KEY = "WorldOfAircraftData";

// Stores that need persistent backup (critical game data)
const PERSISTENT_STORES: StoreName[] = [
  "player",
  "company",
  "company_members",
  "aircraft",
  "inventory",
  "missions",
  "pilot_career_stats",
  "free_flight_sessions",
  "flight_history",       // V2.0: Flight history
  "transaction_log",      // V4.1: Transaction log
  "sell_orders",          // V4.1: Player sell orders
  "market_orders",
  "factories",
  "workers",
  "production_batches",
  "company_messages",
  "contract_offers",        // V5: Contract offers
  "active_contracts",       // V5: Active contracts
];

// Global MSFS declarations in src/types/msfs-globals.d.ts

class DatabaseManagerClass {
  private callbacks: DatabaseCallbacks = {};
  private initialized = false;
  private syncIdCounter = 0;
  private saveTimeout: number | null = null;

  // In-memory cache for airports (static data, no need to persist)
  private airportsCache: Airport[] = [];

  // In-memory cache for NPC factories (tier 0) — not persisted to save localStorage quota
  private npcFactoriesCache: any[] = [];

  // ─────────────────────────────────────────────────────────
  // INITIALIZATION
  // ─────────────────────────────────────────────────────────

  async initialize(callbacks: DatabaseCallbacks = {}): Promise<void> {
    if (this.initialized) {
      callbacks.onReady?.();
      return;
    }

    this.callbacks = callbacks;

    try {
      // Check if localStorage is available
      if (typeof localStorage === "undefined") {
        throw new Error("localStorage is not available");
      }

      // ── QUOTA CLEANUP ──
      // Coherent GT has a very small localStorage quota (~5MB).
      // Remove non-essential data FIRST using removeItem (never throws),
      // then re-write smaller versions only after freeing space.

      // 1. Strip NPC factories (tier 0) — read, remove, then re-write player-only
      let playerFactories: any[] = [];
      try {
        const factoriesKey = STORAGE_PREFIX + "factories";
        const raw = localStorage.getItem(factoriesKey);
        if (raw) {
          const all = JSON.parse(raw) as any[];
          playerFactories = all.filter((f: any) => f.tier !== 0);
          const npcCount = all.length - playerFactories.length;
          // Always removeItem first (frees quota immediately, never throws)
          localStorage.removeItem(factoriesKey);
          if (npcCount > 0) {
            console.log(`[DatabaseManager] Stripped ${npcCount} NPC factories from localStorage`);
          }
        }
      } catch (e) {
        localStorage.removeItem(STORAGE_PREFIX + "factories");
        console.warn("[DatabaseManager] Cleared corrupted factories store");
      }

      // 2. Nuke sync_log entirely (non-essential, rebuilt on sync)
      localStorage.removeItem(STORAGE_PREFIX + "sync_log");

      // 3. Trim large non-critical stores to prevent quota overflow
      const TRIM_STORES: { name: string; maxEntries: number }[] = [
        { name: "transaction_log", maxEntries: 200 },
        { name: "flight_history", maxEntries: 100 },
        { name: "market_orders", maxEntries: 200 },
        { name: "sell_orders", maxEntries: 100 },
        { name: "company_messages", maxEntries: 50 },
      ];
      for (const { name, maxEntries } of TRIM_STORES) {
        try {
          const key = STORAGE_PREFIX + name;
          const raw = localStorage.getItem(key);
          if (raw && raw.length > 20000) {
            const entries = JSON.parse(raw) as any[];
            if (entries.length > maxEntries) {
              localStorage.removeItem(key);
              const trimmed = entries.slice(-maxEntries);
              localStorage.setItem(key, JSON.stringify(trimmed));
              console.log(`[DatabaseManager] Trimmed ${name}: ${entries.length} → ${trimmed.length}`);
            }
          }
        } catch (e) {
          localStorage.removeItem(STORAGE_PREFIX + name);
        }
      }

      // 4. Re-write player factories (now that quota is freed)
      if (playerFactories.length > 0) {
        try {
          localStorage.setItem(STORAGE_PREFIX + "factories", JSON.stringify(playerFactories));
        } catch (e) {
          console.error("[DatabaseManager] Cannot save player factories — quota still full");
        }
      }

      // 5. Test localStorage
      try {
        localStorage.setItem(STORAGE_PREFIX + "test", "1");
        localStorage.removeItem(STORAGE_PREFIX + "test");
      } catch (e) {
        // Last resort: clear ALL non-essential stores
        console.warn("[DatabaseManager] Quota STILL exceeded — emergency purge");
        const essential = ["player", "company", "aircraft", "inventory", "factories", "workers"];
        const allKeys = Object.keys(localStorage).filter(k => k.startsWith(STORAGE_PREFIX));
        for (const key of allKeys) {
          const storeName = key.replace(STORAGE_PREFIX, "");
          if (!essential.includes(storeName)) {
            localStorage.removeItem(key);
          }
        }
        // Retry
        localStorage.setItem(STORAGE_PREFIX + "test", "1");
        localStorage.removeItem(STORAGE_PREFIX + "test");
      }

      // Debug: Log all localStorage keys with woa_ prefix
      console.log("[DatabaseManager] === INITIALIZATION DEBUG ===");
      console.log("[DatabaseManager] localStorage available: true");
      const allKeys = Object.keys(localStorage).filter(k => k.startsWith(STORAGE_PREFIX));
      console.log(`[DatabaseManager] Found ${allKeys.length} woa_ keys in localStorage:`, allKeys);

      // Log counts for each store
      for (const store of PERSISTENT_STORES) {
        const count = this.loadStore(store).length;
        if (count > 0) {
          console.log(`[DatabaseManager] Store "${store}": ${count} records`);
        }
      }

      // Try to restore from backup if localStorage is empty
      const playerCount = this.loadStore<Player>("player").length;
      console.log(`[DatabaseManager] Player count in localStorage: ${playerCount}`);

      if (playerCount === 0) {
        console.log("[DatabaseManager] No player found, trying to restore from backup sources...");
        await this.restoreFromDataStore();

        // Check again after restore attempt
        const restoredPlayerCount = this.loadStore<Player>("player").length;
        console.log(`[DatabaseManager] Player count after restore attempt: ${restoredPlayerCount}`);
      } else {
        console.log("[DatabaseManager] Player found in localStorage, no restore needed");
      }

      // Load sync counter
      const counterStr = localStorage.getItem(STORAGE_PREFIX + "sync_counter");
      this.syncIdCounter = counterStr ? parseInt(counterStr, 10) : 0;

      this.initialized = true;
      console.log("[DatabaseManager] === INITIALIZATION COMPLETE ===");
      this.callbacks.onReady?.();
    } catch (error) {
      console.error("[DatabaseManager] Failed to initialize:", error);
      this.callbacks.onError?.(error as Error);
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────
  // FILE-BASED PERSISTENCE (using coui:// fetch for backup)
  // ─────────────────────────────────────────────────────────

  // Backup file path - stored in panel's data folder
  private readonly BACKUP_FILE = "coui://html_ui/efb_ui/efb_apps/WorldOfAircraft/woa_backup.json";

  /**
   * Save critical data for persistence
   * Uses native MSFS GetStoredData/SetStoredData APIs (global functions)
   */
  private async saveToDataStore(): Promise<void> {
    try {
      const data: Record<string, any[]> = {};
      for (const store of PERSISTENT_STORES) {
        data[store] = this.loadStore(store);
      }

      const jsonData = JSON.stringify(data);
      console.log(`[DatabaseManager] Saving data (${(jsonData.length / 1024).toFixed(1)} KB)...`);

      // Strategy 1: Use native MSFS SetStoredData (global function)
      if (typeof SetStoredData === "function") {
        try {
          SetStoredData(DATASTORE_KEY, jsonData);
          console.log(`[DatabaseManager] Saved via native SetStoredData ✅`);
          return; // Success
        } catch (e) {
          console.warn("[DatabaseManager] SetStoredData failed:", e);
        }
      } else {
        console.log("[DatabaseManager] SetStoredData not available");
      }

      // Strategy 2: Try saving to sessionStorage as fallback
      try {
        sessionStorage.setItem(DATASTORE_KEY, jsonData);
        console.log("[DatabaseManager] Saved to sessionStorage as fallback");
      } catch (e) {
        console.log("[DatabaseManager] sessionStorage not available");
      }

      console.log("[DatabaseManager] Data save attempted (persistence may be limited)");
    } catch (error) {
      console.warn("[DatabaseManager] Failed to save data:", error);
    }
  }

  /**
   * Restore data from various persistence sources
   * Uses native MSFS GetStoredData API (global function)
   */
  private async restoreFromDataStore(): Promise<void> {
    try {
      let jsonData: string | null = null;

      // Strategy 1: Use native MSFS GetStoredData (global function)
      if (typeof GetStoredData === "function") {
        try {
          const result = GetStoredData(DATASTORE_KEY);
          if (result && result !== "" && result !== "null" && result !== "undefined") {
            jsonData = result;
            console.log(`[DatabaseManager] Restored via native GetStoredData ✅`);
          }
        } catch (e) {
          console.warn("[DatabaseManager] GetStoredData failed:", e);
        }
      } else {
        console.log("[DatabaseManager] GetStoredData not available");
      }

      // Strategy 2: Try sessionStorage as fallback
      if (!jsonData) {
        try {
          jsonData = sessionStorage.getItem(DATASTORE_KEY);
          if (jsonData) {
            console.log("[DatabaseManager] Restored from sessionStorage");
          }
        } catch (e) {
          console.log("[DatabaseManager] sessionStorage not available");
        }
      }

      // Strategy 3: Try loading from backup file
      if (!jsonData) {
        try {
          console.log("[DatabaseManager] Trying to load from backup file...");
          const response = await fetch(this.BACKUP_FILE);
          if (response.ok) {
            jsonData = await response.text();
            console.log("[DatabaseManager] Restored from backup file");
          }
        } catch (e) {
          console.log("[DatabaseManager] Backup file not available");
        }
      }

      if (!jsonData || jsonData === "null" || jsonData === "") {
        console.log("[DatabaseManager] No backup data found from any source");
        return;
      }

      const data = JSON.parse(jsonData) as Record<string, any[]>;
      let restoredCount = 0;

      for (const [storeName, records] of Object.entries(data)) {
        if (records && records.length > 0) {
          this.saveStore(storeName as StoreName, records);
          restoredCount += records.length;
          console.log(`[DatabaseManager] Restored ${records.length} records to ${storeName}`);
        }
      }

      if (restoredCount > 0) {
        console.log(`[DatabaseManager] Successfully restored ${restoredCount} total records`);
      }
    } catch (error) {
      console.warn("[DatabaseManager] Failed to restore data:", error);
    }
  }

  /**
   * Schedule a save to DataStore (debounced to avoid too many writes)
   * V4.1 FIX: Also triggers onDataChanged callback for NativePersistence sync
   */
  private schedulePersistentSave(): void {
    if (this.saveTimeout !== null) {
      clearTimeout(this.saveTimeout);
    }
    // Save after 2 seconds of no changes
    this.saveTimeout = window.setTimeout(() => {
      this.saveTimeout = null;
      void this.saveToDataStore();
      // V4.1 FIX: Notify that data changed so NativePersistence can save too
      this.callbacks.onDataChanged?.();
    }, 2000);
  }

  // ─────────────────────────────────────────────────────────
  // LOW-LEVEL STORAGE OPERATIONS
  // ─────────────────────────────────────────────────────────

  private getStoreKey(storeName: StoreName): string {
    return STORAGE_PREFIX + storeName;
  }

  private loadStore<T>(storeName: StoreName): T[] {
    const key = this.getStoreKey(storeName);
    const data = localStorage.getItem(key);
    if (!data) return [];
    try {
      return JSON.parse(data) as T[];
    } catch {
      console.warn(`[DatabaseManager] Failed to parse store ${storeName}`);
      return [];
    }
  }

  private saveStore<T>(storeName: StoreName, data: T[]): void {
    const key = this.getStoreKey(storeName);
    // NPC factories (tier 0) are re-seeded on each init — don't persist to save quota
    if (storeName === "factories") {
      const playerOnly = (data as any[]).filter((f: any) => f.tier !== 0);
      localStorage.setItem(key, JSON.stringify(playerOnly));
    } else {
      localStorage.setItem(key, JSON.stringify(data));
    }
  }

  private getNextSyncId(): number {
    this.syncIdCounter++;
    localStorage.setItem(STORAGE_PREFIX + "sync_counter", String(this.syncIdCounter));
    return this.syncIdCounter;
  }

  // ─────────────────────────────────────────────────────────
  // AIRPORTS MEMORY CACHE (static data, not persisted)
  // ─────────────────────────────────────────────────────────

  setAirportsCache(airports: Airport[]): void {
    this.airportsCache = airports;
    console.log(`[DatabaseManager] Airports cache set: ${airports.length} airports`);
  }

  getAirportsCache(): Airport[] {
    return this.airportsCache;
  }

  // ─────────────────────────────────────────────────────────
  // GENERIC CRUD OPERATIONS
  // ─────────────────────────────────────────────────────────

  async get<T>(storeName: StoreName, key: string): Promise<T | undefined> {
    if (!this.initialized) throw new Error("Database not initialized");

    // Use memory cache for airports
    if (storeName === "airports") {
      return this.airportsCache.find((a) => a.ident === key) as T | undefined;
    }

    // Factories: check NPC cache first, then localStorage
    if (storeName === "factories") {
      const npc = this.npcFactoriesCache.find((f: any) => f.id === key);
      if (npc) return npc as T;
    }

    const keyPath = KEY_PATHS[storeName];
    const data = this.loadStore<T>(storeName);
    return data.find((item: any) => item[keyPath] === key);
  }

  async getAll<T>(storeName: StoreName): Promise<T[]> {
    if (!this.initialized) throw new Error("Database not initialized");

    // Use memory cache for airports
    if (storeName === "airports") {
      return this.airportsCache as T[];
    }

    // Factories: merge player (localStorage) + NPC (memory cache)
    if (storeName === "factories") {
      const playerFactories = this.loadStore<T>(storeName);
      return ([] as T[]).concat(playerFactories, this.npcFactoriesCache as T[]);
    }

    return this.loadStore<T>(storeName);
  }

  async put<T>(storeName: StoreName, record: T, logSync = true): Promise<void> {
    if (!this.initialized) throw new Error("Database not initialized");

    // NPC factories (tier 0): store in memory only, not localStorage
    if (storeName === "factories" && (record as any).tier === 0) {
      const keyValue = (record as any).id;
      const idx = this.npcFactoriesCache.findIndex((f: any) => f.id === keyValue);
      if (idx >= 0) {
        this.npcFactoriesCache[idx] = record;
      } else {
        this.npcFactoriesCache.push(record);
      }
      return; // Skip localStorage + sync
    }

    const keyPath = KEY_PATHS[storeName];
    const data = this.loadStore<T>(storeName);
    const keyValue = (record as any)[keyPath];

    // Find existing index
    const existingIndex = data.findIndex((item: any) => item[keyPath] === keyValue);

    if (existingIndex >= 0) {
      // Update existing
      data[existingIndex] = record;
    } else {
      // Add new
      data.push(record);
    }

    this.saveStore(storeName, data);

    // Log for sync
    if (logSync) {
      const syncLog = this.loadStore<any>("sync_log");
      syncLog.push({
        id: this.getNextSyncId(),
        store: storeName,
        action: "put",
        data: record,
        timestamp: Date.now(),
        synced: 0,
      });
      this.saveStore("sync_log", syncLog);
    }

    // Schedule persistent save for critical stores
    if (PERSISTENT_STORES.includes(storeName)) {
      this.schedulePersistentSave();
    }
  }

  async delete(storeName: StoreName, key: string, logSync = true): Promise<void> {
    if (!this.initialized) throw new Error("Database not initialized");

    const keyPath = KEY_PATHS[storeName];
    const data = this.loadStore<any>(storeName);
    const filtered = data.filter((item: any) => item[keyPath] !== key);

    this.saveStore(storeName, filtered);

    // Log for sync
    if (logSync) {
      const syncLog = this.loadStore<any>("sync_log");
      syncLog.push({
        id: this.getNextSyncId(),
        store: storeName,
        action: "delete",
        key: key,
        timestamp: Date.now(),
        synced: 0,
      });
      this.saveStore("sync_log", syncLog);
    }

    // Schedule persistent save for critical stores
    if (PERSISTENT_STORES.includes(storeName)) {
      this.schedulePersistentSave();
    }
  }

  async query<T>(
    storeName: StoreName,
    indexName: string,
    value: any
  ): Promise<T[]> {
    if (!this.initialized) throw new Error("Database not initialized");

    const data = this.loadStore<T>(storeName);

    // Handle compound index (array value)
    if (Array.isArray(value)) {
      // For compound indexes like ["location_type", "location_id"]
      // indexName would be "location" and value would be ["aircraft", "abc123"]
      if (indexName === "location") {
        return data.filter((item: any) =>
          item.location_type === value[0] && item.location_id === value[1]
        );
      }
    }

    // Simple index query
    return data.filter((item: any) => item[indexName] === value);
  }

  async count(storeName: StoreName): Promise<number> {
    if (!this.initialized) throw new Error("Database not initialized");

    // Use memory cache for airports
    if (storeName === "airports") {
      return this.airportsCache.length;
    }

    return this.loadStore(storeName).length;
  }

  async clear(storeName: StoreName): Promise<void> {
    if (!this.initialized) throw new Error("Database not initialized");
    this.saveStore(storeName, []);
  }

  // ─────────────────────────────────────────────────────────
  // SPECIALIZED QUERIES
  // ─────────────────────────────────────────────────────────

  // Player
  async getPlayer(): Promise<Player | undefined> {
    const players = await this.getAll<Player>("player");
    return players[0]; // Single player in local mode
  }

  async savePlayer(player: Player): Promise<void> {
    player.updated_at = new Date().toISOString();
    await this.put("player", player);
  }

  // Company
  async getCompanyByOwner(ownerId: string): Promise<Company | undefined> {
    const companies = await this.query<Company>("company", "owner_id", ownerId);
    return companies[0];
  }

  // Aircraft
  async getAircraftByCompany(companyId: string): Promise<Aircraft[]> {
    return this.query<Aircraft>("aircraft", "company_id", companyId);
  }

  async getAircraftByOwner(ownerId: string): Promise<Aircraft[]> {
    const results = await this.query<Aircraft>("aircraft", "owner_id", ownerId);
    console.log(`[DatabaseManager] getAircraftByOwner(${ownerId}): found ${results.length} aircraft`);
    return results;
  }

  async getAircraftAtAirport(icao: string): Promise<Aircraft[]> {
    return this.query<Aircraft>("aircraft", "location_icao", icao);
  }

  async updateAircraftLocation(aircraftId: string, icao: string): Promise<void> {
    const aircraft = await this.get<Aircraft>("aircraft", aircraftId);
    if (aircraft) {
      aircraft.location_icao = icao;
      await this.put("aircraft", aircraft);
    }
  }

  async updateAircraftFuel(aircraftId: string, fuelGallons: number): Promise<void> {
    const aircraft = await this.get<Aircraft>("aircraft", aircraftId);
    if (aircraft) {
      aircraft.fuel_gallons = fuelGallons;
      await this.put("aircraft", aircraft);
    }
  }

  // Inventory
  async getInventoryAt(locationType: string, locationId: string): Promise<InventoryItem[]> {
    return this.query<InventoryItem>("inventory", "location", [locationType, locationId]);
  }

  // Market
  async getActiveMarketOrders(icao?: string): Promise<MarketOrder[]> {
    const allOrders = await this.query<MarketOrder>("market_orders", "is_active", true);
    if (icao) {
      return allOrders.filter((o) => o.icao === icao);
    }
    return allOrders;
  }

  async getMarketOrdersByItem(itemCode: string): Promise<MarketOrder[]> {
    const orders = await this.query<MarketOrder>("market_orders", "item_code", itemCode);
    return orders.filter((o) => o.is_active);
  }

  // Missions
  async getActiveMission(playerId: string): Promise<Mission | undefined> {
    const missions = await this.query<Mission>("missions", "player_id", playerId);
    return missions.find((m) => m.status === "in_progress");
  }

  async getActiveMissionForAircraft(aircraftId: string): Promise<Mission | undefined> {
    const missions = await this.query<Mission>("missions", "aircraft_id", aircraftId);
    return missions.find((m) => m.status === "in_progress");
  }

  async getMissionsByStatus(status: string): Promise<Mission[]> {
    return this.query<Mission>("missions", "status", status);
  }

  // Free Flight
  async getActiveFreeFlight(playerId: string): Promise<FreeFlightSession | undefined> {
    const sessions = await this.query<FreeFlightSession>("free_flight_sessions", "player_id", playerId);
    return sessions.find((s) => s.ended_at === null);
  }

  // Items catalog
  async getItemByCode(code: string): Promise<Item | undefined> {
    return this.get<Item>("items", code);
  }

  async getItemsByCategory(category: string): Promise<Item[]> {
    return this.query<Item>("items", "category", category);
  }

  // Aircraft Systems
  async getAircraftSystems(aircraftId: string): Promise<AircraftSystems | undefined> {
    const systems = await this.query<AircraftSystems>("aircraft_systems", "aircraft_id", aircraftId);
    return systems[0];
  }

  async saveAircraftSystems(systems: AircraftSystems): Promise<void> {
    systems.updated_at = new Date().toISOString();
    await this.put("aircraft_systems", systems);
  }

  // Pilot Career Stats
  async getPilotCareerStats(userId: string): Promise<PilotCareerStats | undefined> {
    const stats = await this.query<PilotCareerStats>("pilot_career_stats", "user_id", userId);
    return stats[0];
  }

  async savePilotCareerStats(stats: PilotCareerStats): Promise<void> {
    stats.updated_at = new Date().toISOString();
    await this.put("pilot_career_stats", stats);
  }

  async getOrCreatePilotCareerStats(userId: string): Promise<PilotCareerStats> {
    let stats = await this.getPilotCareerStats(userId);
    if (!stats) {
      stats = {
        id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
        user_id: userId,
        total_missions: 0,
        completed_missions: 0,
        failed_missions: 0,
        cancelled_missions: 0,
        total_flight_time_minutes: 0,
        total_airborne_time_minutes: 0,
        night_flight_time_minutes: 0,
        ifr_flight_time_minutes: 0,
        total_distance_nm: 0,
        longest_flight_nm: 0,
        total_landings: 0,
        butter_landings: 0,
        hard_landings: 0,
        total_score: 0,
        best_score: 0,
        total_fuel_used_lbs: 0,
        unique_airports_visited: 0,
        unique_countries_visited: 0,
        current_streak_days: 0,
        longest_streak_days: 0,
        career_level: 1,
        career_xp: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await this.put("pilot_career_stats", stats);
    }
    return stats;
  }

  // Factories (Phase 9)
  async getFactoriesByCompany(companyId: string): Promise<Factory[]> {
    return this.query<Factory>("factories", "company_id", companyId);
  }

  async getFactoriesAtAirport(icao: string): Promise<Factory[]> {
    return this.query<Factory>("factories", "airport_ident", icao);
  }

  // Workers (Phase 9)
  async getWorkersByCompany(companyId: string): Promise<WorkerInstance[]> {
    return this.query<WorkerInstance>("workers", "owner_company_id", companyId);
  }

  async getWorkersByFactory(factoryId: string): Promise<WorkerInstance[]> {
    return this.query<WorkerInstance>("workers", "factory_id", factoryId);
  }

  async getUnassignedWorkers(companyId: string): Promise<WorkerInstance[]> {
    const workers = await this.getWorkersByCompany(companyId);
    return workers.filter(w => !w.factory_id && w.status === "available");
  }

  // Mission sub-entities
  async getMissionLegs(missionId: string): Promise<MissionLeg[]> {
    const legs = await this.query<MissionLeg>("mission_legs", "mission_id", missionId);
    return legs.sort((a, b) => a.leg_number - b.leg_number);
  }

  async getMissionWaypoints(missionId: string): Promise<MissionWaypoint[]> {
    const waypoints = await this.query<MissionWaypoint>("mission_waypoints", "mission_id", missionId);
    return waypoints.sort((a, b) => a.sequence - b.sequence);
  }

  async getMissionEvents(missionId: string): Promise<MissionEvent[]> {
    const events = await this.query<MissionEvent>("mission_events", "mission_id", missionId);
    return events.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }

  async addMissionEvent(event: MissionEvent): Promise<void> {
    await this.put("mission_events", event);
  }

  async getMissionCargo(missionId: string): Promise<MissionCargo[]> {
    return this.query<MissionCargo>("mission_cargo", "mission_id", missionId);
  }

  // Aircraft damage & maintenance logs
  async getAircraftDamageLog(aircraftId: string): Promise<AircraftDamageLog[]> {
    const logs = await this.query<AircraftDamageLog>("aircraft_damage_log", "aircraft_id", aircraftId);
    return logs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  async addAircraftDamage(damage: AircraftDamageLog): Promise<void> {
    await this.put("aircraft_damage_log", damage);
  }

  async getAircraftMaintenanceLog(aircraftId: string): Promise<AircraftMaintenanceLog[]> {
    const logs = await this.query<AircraftMaintenanceLog>("aircraft_maintenance_log", "aircraft_id", aircraftId);
    return logs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  async addAircraftMaintenance(maintenance: AircraftMaintenanceLog): Promise<void> {
    await this.put("aircraft_maintenance_log", maintenance);
  }

  // Company members
  async getCompanyMembers(companyId: string): Promise<CompanyMember[]> {
    return this.query<CompanyMember>("company_members", "company_id", companyId);
  }

  // ─────────────────────────────────────────────────────────
  // FLIGHT HISTORY (V2.0)
  // ─────────────────────────────────────────────────────────

  /**
   * Flight history entry interface (matches types/index.ts)
   */
  async saveFlightHistory(entry: {
    id: string;
    type: "mission" | "freeflight";
    date: number;
    departure_icao: string;
    arrival_icao: string;
    distance_nm: number;
    flight_time_minutes: number;
    aircraft_id: string;
    aircraft_type: string;
    aircraft_reg: string;
    score_total: number;
    grade: string;
    landing_fpm: number;
    max_gforce: number;
    xp_earned: number;
    money_earned: number;
    bonuses: {
      real_time: boolean;
      night: boolean;
      atc: boolean;
      fuel_eco: boolean;
      no_autopilot: boolean;
      bad_weather: boolean;
    };
    weather_visibility_nm: number;
    weather_wind_kts: number;
    atc_compliance: number;
    atc_violations: number;
  }): Promise<void> {
    await this.put("flight_history", entry);
    console.log(`[DatabaseManager] Flight history saved: ${entry.type} ${entry.departure_icao}→${entry.arrival_icao}`);
  }

  /**
   * Get flight history sorted by date (newest first)
   */
  async getFlightHistory(
    limit = 50,
    offset = 0,
    filter?: "all" | "mission" | "freeflight"
  ): Promise<any[]> {
    let entries = await this.getAll<any>("flight_history");

    // Filter by type if specified
    if (filter && filter !== "all") {
      entries = entries.filter((e) => e.type === filter);
    }

    // Sort by date (newest first)
    entries.sort((a, b) => b.date - a.date);

    // Apply pagination
    return entries.slice(offset, offset + limit);
  }

  /**
   * Get total flight history count
   */
  async getFlightHistoryCount(filter?: "all" | "mission" | "freeflight"): Promise<number> {
    let entries = await this.getAll<any>("flight_history");

    if (filter && filter !== "all") {
      entries = entries.filter((e) => e.type === filter);
    }

    return entries.length;
  }

  // ─────────────────────────────────────────────────────────
  // V4.1: TRANSACTION LOG OPERATIONS
  // ─────────────────────────────────────────────────────────

  private generateTransactionId(): string {
    return `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Save a transaction log entry and prune old entries if needed
   */
  async saveTransaction(entry: Omit<TransactionLog, "id">): Promise<void> {
    const transaction: TransactionLog = {
      ...entry,
      id: this.generateTransactionId(),
      amount: Math.round(entry.amount),
      balance_after: Math.round(entry.balance_after),
    };
    await this.put("transaction_log", transaction);

    // Prune to 500 max entries
    await this.pruneTransactionLog(500);

    console.log(`[DatabaseManager] Transaction logged: ${entry.type} ${entry.amount > 0 ? "+" : ""}${entry.amount}$ (${entry.description})`);
  }

  /**
   * Get transaction log sorted by timestamp (newest first)
   */
  async getTransactionLog(
    limit = 50,
    offset = 0,
    walletFilter?: "player" | "company" | "all"
  ): Promise<TransactionLog[]> {
    let entries = await this.getAll<TransactionLog>("transaction_log");

    // Filter by wallet if specified
    if (walletFilter && walletFilter !== "all") {
      entries = entries.filter((e) => e.wallet === walletFilter);
    }

    // Sort by timestamp (newest first)
    entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply pagination
    return entries.slice(offset, offset + limit);
  }

  /**
   * Prune transaction log to keep only the newest N entries
   */
  async pruneTransactionLog(maxEntries: number): Promise<void> {
    let entries = await this.getAll<TransactionLog>("transaction_log");

    if (entries.length <= maxEntries) return;

    // Sort by timestamp (newest first)
    entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Keep only the newest entries
    const toKeep = entries.slice(0, maxEntries);

    // Clear and re-save
    await this.clear("transaction_log");
    for (const entry of toKeep) {
      await this.put("transaction_log", entry, false);
    }

    console.log(`[DatabaseManager] Pruned transaction log: ${entries.length} -> ${toKeep.length}`);
  }

  // ─────────────────────────────────────────────────────────
  // CONTRACT OPERATIONS (V5)
  // ─────────────────────────────────────────────────────────

  async getAvailableContracts(): Promise<ContractOffer[]> {
    const all = await this.getAll<ContractOffer>("contract_offers");
    return all.filter(c => c.status === "available");
  }

  async getContractOffer(id: string): Promise<ContractOffer | undefined> {
    return this.get<ContractOffer>("contract_offers", id);
  }

  async saveContractOffer(offer: ContractOffer): Promise<void> {
    await this.put("contract_offers", offer);
  }

  async getActiveContracts(playerId: string): Promise<ActiveContract[]> {
    const all = await this.getAll<ActiveContract>("active_contracts");
    return all.filter(c => c.pilot_id === playerId);
  }

  async getActiveContract(id: string): Promise<ActiveContract | undefined> {
    return this.get<ActiveContract>("active_contracts", id);
  }

  async saveActiveContract(contract: ActiveContract): Promise<void> {
    await this.put("active_contracts", contract);
  }

  async getCompletedContracts(playerId: string): Promise<ActiveContract[]> {
    const all = await this.getAll<ActiveContract>("active_contracts");
    return all.filter(c => c.pilot_id === playerId && (c.status === "completed" || (c.status as string) === "failed" || c.status === "cancelled"));
  }

  async removeContractCargo(contractId: string, airportIcao: string): Promise<void> {
    const inventory = await this.getInventoryAt("airport", airportIcao);
    for (const item of inventory) {
      if (item.contract_id === contractId) {
        await this.delete("inventory", item.id);
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // SYNC OPERATIONS (for P2P)
  // ─────────────────────────────────────────────────────────

  async getUnsyncedChanges(): Promise<any[]> {
    const syncLog = this.loadStore<any>("sync_log");
    return syncLog.filter((entry) => entry.synced === 0);
  }

  async markAsSynced(syncIds: number[]): Promise<void> {
    if (!this.initialized) throw new Error("Database not initialized");

    const syncLog = this.loadStore<any>("sync_log");
    for (const entry of syncLog) {
      if (syncIds.includes(entry.id)) {
        entry.synced = 1;
      }
    }
    this.saveStore("sync_log", syncLog);
  }

  async clearSyncLog(): Promise<void> {
    await this.clear("sync_log");
  }

  // ─────────────────────────────────────────────────────────
  // UTILITY
  // ─────────────────────────────────────────────────────────

  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Force immediate save to Coherent DataStore
   * Call this before app suspend or close to ensure data is persisted
   */
  async forceSave(): Promise<void> {
    if (this.saveTimeout !== null) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    await this.saveToDataStore();
  }

  async exportDatabase(): Promise<Record<string, any[]>> {
    const storeNames: StoreName[] = [
      "player",
      "player_profile",
      "company",
      "company_members",
      "aircraft",
      "aircraft_systems",
      "aircraft_damage_log",
      "aircraft_maintenance_log",
      "aircraft_catalog",
      "inventory",
      "inventory_locations",
      "items",
      "recipes",
      "factories",
      "workers",
      "market_orders",
      "market_transactions",
      "missions",
      "mission_legs",
      "mission_waypoints",
      "mission_events",
      "mission_cargo",
      "pilot_career_stats",
      "free_flight_sessions",
      "flight_history",
      "company_messages",
    ];

    const exportData: Record<string, any[]> = {};

    for (const storeName of storeNames) {
      exportData[storeName] = await this.getAll(storeName);
    }

    return exportData;
  }

  async importDatabase(data: Record<string, any[]>): Promise<void> {
    for (const [storeName, records] of Object.entries(data)) {
      await this.clear(storeName as StoreName);
      for (const record of records) {
        await this.put(storeName as StoreName, record, false);
      }
    }
    console.log("[DatabaseManager] Database imported successfully");
  }

  async deleteDatabase(): Promise<void> {
    const storeNames: StoreName[] = [
      "player",
      "player_profile",
      "company",
      "company_members",
      "aircraft",
      "aircraft_systems",
      "aircraft_damage_log",
      "aircraft_maintenance_log",
      "aircraft_catalog",
      "inventory",
      "inventory_locations",
      "items",
      "recipes",
      "factories",
      "workers",
      "market_orders",
      "market_transactions",
      "missions",
      "mission_legs",
      "mission_waypoints",
      "mission_events",
      "mission_cargo",
      "pilot_career_stats",
      "free_flight_sessions",
      "flight_history",
      "transaction_log",
      "sell_orders",
      "company_messages",
      "sync_log",
    ];

    for (const storeName of storeNames) {
      localStorage.removeItem(this.getStoreKey(storeName));
    }
    localStorage.removeItem(STORAGE_PREFIX + "sync_counter");

    this.initialized = false;
    console.log("[DatabaseManager] Database deleted");
  }

  // ─────────────────────────────────────────────────────────
  // V4.1: SELL ORDERS OPERATIONS
  // ─────────────────────────────────────────────────────────

  /**
   * Get all active sell orders
   */
  async getActiveSellOrders(): Promise<SellOrder[]> {
    const orders = await this.getAll<SellOrder>("sell_orders");
    return orders.filter(o => o.status === "active");
  }

  /**
   * Get sell orders by seller ID
   */
  async getSellOrdersBySeller(sellerId: string): Promise<SellOrder[]> {
    return this.query<SellOrder>("sell_orders", "seller_id", sellerId);
  }

  /**
   * Get sell orders at a specific airport
   */
  async getSellOrdersAtAirport(icao: string): Promise<SellOrder[]> {
    const orders = await this.query<SellOrder>("sell_orders", "airport_icao", icao);
    return orders.filter(o => o.status === "active");
  }

  /**
   * Create a new sell order
   */
  async createSellOrder(order: SellOrder): Promise<void> {
    await this.put("sell_orders", order);
    console.log(`[DatabaseManager] Sell order created: ${order.quantity}x ${order.item_name} at ${order.airport_icao}`);
  }

  /**
   * Update a sell order (status change, etc.)
   */
  async updateSellOrder(order: SellOrder): Promise<void> {
    await this.put("sell_orders", order);
  }

  /**
   * Prune old sell orders (keep only active or recent sold/cancelled)
   */
  async pruneSellOrders(maxDaysOld: number = 7, maxTotal: number = 100): Promise<void> {
    const orders = await this.getAll<SellOrder>("sell_orders");
    const cutoffDate = Date.now() - (maxDaysOld * 24 * 60 * 60 * 1000);

    // Keep active orders and recent sold/cancelled
    const toKeep = orders.filter(o => {
      if (o.status === "active") return true;
      const createdTime = new Date(o.created_at).getTime();
      return createdTime > cutoffDate;
    });

    // If still too many, keep only the newest
    if (toKeep.length > maxTotal) {
      toKeep.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      toKeep.splice(maxTotal);
    }

    // Only rewrite if we pruned something
    if (toKeep.length < orders.length) {
      await this.clear("sell_orders");
      for (const order of toKeep) {
        await this.put("sell_orders", order, false);
      }
      console.log(`[DatabaseManager] Pruned sell orders: ${orders.length} -> ${toKeep.length}`);
    }
  }

  // ─────────────────────────────────────────────────────────
  // V4: COMPANY MESSAGES
  // ─────────────────────────────────────────────────────────

  async getCompanyMessages(companyId: string, limit = 50): Promise<any[]> {
    const messages = await this.query<any>("company_messages", "company_id", companyId);
    messages.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return messages.slice(0, limit);
  }

  async saveCompanyMessage(message: any): Promise<void> {
    await this.put("company_messages", message);
  }

  async pinCompanyMessage(messageId: string, companyId: string): Promise<void> {
    const messages = await this.getCompanyMessages(companyId, 500);
    for (const msg of messages) {
      if (msg.is_pinned && msg.id !== messageId) {
        msg.is_pinned = false;
        await this.put("company_messages", msg);
      }
    }
    const target = messages.find((m: any) => m.id === messageId);
    if (target) {
      target.is_pinned = !target.is_pinned;
      await this.put("company_messages", target);
    }
  }
}

// ═══════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════

export const DatabaseManager = new DatabaseManagerClass();
