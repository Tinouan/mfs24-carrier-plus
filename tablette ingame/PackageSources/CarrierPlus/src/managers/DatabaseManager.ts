/**
 * DatabaseManager - Local localStorage persistence for P2P mode
 * Provides offline-first storage with automatic sync capability
 * Note: Uses localStorage instead of IndexedDB for Coherent GT compatibility
 */

// ═══════════════════════════════════════════════════════════
// TYPES - Complete interfaces matching backend PostgreSQL schema
// ═══════════════════════════════════════════════════════════

export interface DatabaseCallbacks {
  onReady?: () => void;
  onError?: (error: Error) => void;
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
  preferred_airport?: string;    // ICAO code
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
  type_code: string;             // References AircraftCatalog.icaoType
  company_id: string | null;     // null for personal aircraft
  owner_id: string | null;       // player_id for personal aircraft
  location_icao: string;
  fuel_gallons: number;
  condition: number;             // 0-100 overall condition
  flight_hours: number;          // Total flight hours
  cycles?: number;               // Number of flights (optional for backwards compat)
  last_flight_at?: string;
  purchase_price?: number;
  for_sale?: boolean;            // Optional for backwards compat
  sale_price?: number;
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
  category: "single_prop" | "twin_prop" | "turboprop" | "jet" | "helicopter" | "airliner";
  cargoCapacityKg: number;
  maxRangeNm: number;
  cruiseSpeedKts: number;
  fuelCapacityGal?: number;
  fuelBurnGph?: number;
  basePrice: number;
  operatingCostPerHour: number;
  minRunwayLengthM: number;
  requiredLicense: string;
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
  created_at?: string;
  updated_at?: string;
}

// ─────────────────────────────────────────────────────────
// FACTORIES & WORKERS
// ─────────────────────────────────────────────────────────

export interface Factory {
  id: string;
  company_id: string;
  airport_icao: string;
  name: string;
  recipe_id?: string;
  is_active: boolean;
  production_progress: number;   // 0-100%
  production_started_at?: string;
  slots_used: number;
  created_at: string;
  updated_at: string;
}

export interface WorkerInstance {
  id: string;
  company_id: string;
  item_id: string;               // Worker item (badge)
  factory_id?: string;           // Assigned factory (null if unassigned)
  name: string;
  xp: number;
  level: number;
  efficiency_bonus: number;      // 0-1 multiplier
  specialty?: string;            // Recipe type bonus
  is_active: boolean;
  hired_at: string;
  created_at: string;
}

export interface WorkerXpThreshold {
  level: number;
  xp_required: number;
  efficiency_bonus: number;
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
  is_active?: boolean;           // Derived from status === "open"
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
  airports: "ident",
  sync_log: "id",
};

// ═══════════════════════════════════════════════════════════
// DATABASE MANAGER CLASS (localStorage-based)
// ═══════════════════════════════════════════════════════════

const STORAGE_PREFIX = "carrier_plus_";

class DatabaseManagerClass {
  private callbacks: DatabaseCallbacks = {};
  private initialized = false;
  private syncIdCounter = 0;

  // In-memory cache for airports (static data, no need to persist)
  private airportsCache: Airport[] = [];

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

      // Test localStorage
      localStorage.setItem(STORAGE_PREFIX + "test", "1");
      localStorage.removeItem(STORAGE_PREFIX + "test");

      // Load sync counter
      const counterStr = localStorage.getItem(STORAGE_PREFIX + "sync_counter");
      this.syncIdCounter = counterStr ? parseInt(counterStr, 10) : 0;

      this.initialized = true;
      console.log("[DatabaseManager] localStorage initialized successfully");
      this.callbacks.onReady?.();
    } catch (error) {
      console.error("[DatabaseManager] Failed to initialize:", error);
      this.callbacks.onError?.(error as Error);
      throw error;
    }
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
    localStorage.setItem(key, JSON.stringify(data));
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

    return this.loadStore<T>(storeName);
  }

  async put<T>(storeName: StoreName, record: T, logSync = true): Promise<void> {
    if (!this.initialized) throw new Error("Database not initialized");

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
    console.log("[DatabaseManager] getAircraftByOwner called for:", ownerId);
    // Also log all aircraft to debug
    const allAircraft = this.loadStore<Aircraft>("aircraft");
    console.log("[DatabaseManager] All aircraft in storage:", allAircraft.length, allAircraft.map(a => ({
      id: a.id,
      reg: a.registration,
      owner_id: a.owner_id,
      company_id: a.company_id,
    })));
    const result = await this.query<Aircraft>("aircraft", "owner_id", ownerId);
    console.log("[DatabaseManager] Aircraft matching owner_id:", result.length);
    return result;
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

  // Factories
  async getFactoriesByCompany(companyId: string): Promise<Factory[]> {
    return this.query<Factory>("factories", "company_id", companyId);
  }

  async getFactoriesAtAirport(icao: string): Promise<Factory[]> {
    return this.query<Factory>("factories", "airport_icao", icao);
  }

  // Workers
  async getWorkersByCompany(companyId: string): Promise<WorkerInstance[]> {
    return this.query<WorkerInstance>("workers", "company_id", companyId);
  }

  async getWorkersByFactory(factoryId: string): Promise<WorkerInstance[]> {
    return this.query<WorkerInstance>("workers", "factory_id", factoryId);
  }

  async getUnassignedWorkers(companyId: string): Promise<WorkerInstance[]> {
    const workers = await this.getWorkersByCompany(companyId);
    return workers.filter(w => !w.factory_id && w.is_active);
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
      "sync_log",
    ];

    for (const storeName of storeNames) {
      localStorage.removeItem(this.getStoreKey(storeName));
    }
    localStorage.removeItem(STORAGE_PREFIX + "sync_counter");

    this.initialized = false;
    console.log("[DatabaseManager] Database deleted");
  }
}

// ═══════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════

export const DatabaseManager = new DatabaseManagerClass();
