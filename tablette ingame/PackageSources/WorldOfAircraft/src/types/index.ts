/**
 * WorldOfAircraft Types - All TypeScript interfaces and types
 * Extracted for better maintainability
 */

// ═══════════════════════════════════════════════════════════
// TAB NAVIGATION TYPES
// ═══════════════════════════════════════════════════════════
export type TabType = "map" | "profile" | "missions" | "contrats" | "company" | "market" | "hangar" | "settings";
export type ProfileSubTab = "apercu" | "certifications" | "inventaire" | "historique" | "messagerie" | "social";
export type MissionsSubTab = "apercu" | "creation" | "historique";
export type ContratsSubTab = "dashboard" | "mes-contrats" | "en-cours";
export type CompanySubTab = "overview" | "membres" | "inventaire" | "historique" | "messagerie";
export type MarketSubTab = "inventory" | "achats" | "mes-ventes" | "avions" | "historique";

// Flight mode type (for distinguishing mission vs free flight)
export type FlightMode = "mission" | "free_flight";

// Company role types (Phase 4)
export type CompanyRole = "ceo" | "officer" | "pilot" | "recruit";

// Company message (Phase 4)
export interface CompanyMessage {
  id: string;
  company_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  is_system: boolean;
  is_pinned: boolean;
  created_at: string;
}

// ═══════════════════════════════════════════════════════════
// USER & AUTHENTICATION
// ═══════════════════════════════════════════════════════════
export interface UserInfo {
  id: number | string;  // number for network mode, string (UUID) for P2P mode
  username: string;
  email: string;
  // Extended fields for profile display
  xp?: number;
  money?: number;
  nationality?: string;
  preferred_airport?: string;   // Home base ICAO
  current_airport?: string;     // V4.1: Current position ICAO
  last_latitude?: number;       // V4.1: Last known GPS latitude (for map marker fallback)
  last_longitude?: number;      // V4.1: Last known GPS longitude (for map marker fallback)
  // Career stats (populated from PilotCareerStats)
  career_stats?: {
    total_missions: number;
    total_flight_time_minutes: number;
    total_distance_nm: number;
    average_grade?: string;
  };
}

// Level calculation result
export interface LevelInfo {
  level: number;
  currentXp: number;
  nextLevelXp: number;
  progress: number;  // 0-100
}

// ═══════════════════════════════════════════════════════════
// AIRCRAFT TYPES
// ═══════════════════════════════════════════════════════════
export interface AircraftDetails {
  id: string;
  registration: string | null;
  description?: string | null;   // Optional note (max 50 chars)
  aircraft_type: string;
  aircraft_model: string;
  icao_type: string | null;  // V2.3: ICAO type code
  current_airport_ident: string | null;
  status: string;
  required_license: string | null;
  owner_type: string;  // "company" | "player"
  // Persistent data
  fuel_gallons: number;
  fuel_capacity_gallons: number;
  cargo_kg: number;
  cargo_capacity_kg: number;
  passengers: number;
  passenger_capacity: number;
  condition: number;  // V2.3: Aircraft condition (0-1)
  hours: number;      // V2.3: Total flight hours
  // Systems status
  landing_gear: string;
  engine_status: string;
  propeller_status: string;
  electrical_status: string;
  pitot_status: string;
  avionics_status: string;
}

export interface AircraftListItem {
  id: string;
  registration: string | null;
  aircraft_type: string;
  aircraft_model: string | null;
  cargo_capacity_kg: number;
}

export interface HangarAircraftItem {
  id: string;
  registration: string | null;
  aircraft_type: string;
  icao_type: string | null;
  current_airport_ident: string | null;
  status: string;
  required_license: string | null;
  owner_type: string;
  thumbnail_url?: string | null;
  for_sale?: boolean;
}

export interface MissionAircraftInfo {
  id: string;
  registration: string;
  aircraft_type: string;
  icao_type: string | null;
  cargo_capacity_kg: number;
  passenger_capacity: number;
  fuel_gallons: number;
  fuel_capacity_gallons: number;
  condition: number;
  hours: number;
  status: string;
  current_airport_ident: string | null;
  owner_type: string;
  // Systems status
  engine_status: string;
  landing_gear: string;
  propeller_status: string;
  electrical_status: string;
  pitot_status: string;
  avionics_status: string;
}

export interface AircraftSystemsStatus {
  systems: Record<string, { condition: number; failed: boolean; status: string }>;
  warnings: string[];
  critical: string[];
  can_takeoff: boolean;
}

// Raw API response for aircraft details (used in fetchAircraftDetails)
export interface AircraftDetailsResponse {
  id: string;
  registration: string | null;
  description?: string | null;
  aircraft_type: string;
  icao_type: string | null;
  current_airport_ident: string | null;
  status: string;
  required_license: string | null;
  owner_type: string;
  fuel_gallons: number;
  fuel_capacity_gallons: number;
  current_cargo_kg?: number;
  cargo_capacity_kg: number;
  passenger_capacity?: number;
  condition?: number;
  hours?: number;
}

export interface RepairQuote {
  quotes: Record<string, { current_condition: number; target_condition: number; cost: number }>;
  total_cost: number;
  total_cost_all_systems: number;
}

// ═══════════════════════════════════════════════════════════
// MISSION TYPES
// ═══════════════════════════════════════════════════════════

// Basic ActiveMission for UI display
export interface ActiveMission {
  id: string;
  origin_icao: string;
  destination_icao: string;
  aircraft_type: string;
  aircraft_id?: string;
  status: string;
  cargo_weight_kg?: number;
  distance_nm?: number;
}

// Full API response for active mission (includes checkpoints)
export interface ActiveMissionResponse {
  id: string;
  origin_icao: string;
  destination_icao: string;
  aircraft_type: string;
  status: string;
  cargo_weight_kg?: number;
  distance_nm?: number;
  waypoints_total?: number;
  checkpoints?: MissionCheckpoint[];
  checkpoints_total?: number;
  created_at?: string;
}

export interface MissionRecapData {
  origin_icao: string;
  destination_icao: string;
  final_icao: string;
  distance_nm: number;
  score_landing: number;
  score_gforce: number;
  score_destination: number;
  score_time: number;
  score_fuel: number;
  score_total: number;
  grade: string;
  xp_earned: number;
  cheated: boolean;
  cheat_penalty_percent: number;
  landing_fpm: number;
  max_gforce: number;
  // V1.0: Modifiers and XP breakdown
  modifiers_validated?: string[];
  modifiers_failed?: string[];
  xp_breakdown?: XpBreakdown;
  // V2.3: Enhanced recap data
  flight_time_minutes?: number;
  fuel_remaining_percent?: number;
  cargo_weight_kg?: number;
  atc_compliance?: number;
  atc_violations?: number;
  landing_quality?: string;
}

// API response for mission completion (nested scores object)
export interface MissionCompleteResponse {
  scores?: {
    landing: number;
    gforce: number;
    destination: number;
    time: number;
    fuel: number;
  };
  score_total: number;
  grade: string;
  xp_breakdown?: XpBreakdown | null;
  modifiers_validated?: string[];
  modifiers_failed?: string[];
}

export interface XpBreakdown {
  base_xp: number;
  cargo_multiplier: number;
  modifiers_bonus: number;
  real_time_bonus: number;
  real_time_ratio: number;
  modifiers_multiplier: number;
  grade_multiplier: number;
  total_xp: number;
}

export interface MissionCheckpoint {
  sequence: number;
  latitude: number;
  longitude: number;
  radius_nm: number;
  type?: string;        // "departure", "cruise", "arrival", "intermediate"
  phase_after?: string; // "cruise", "descent"
  validated: boolean;
  validated_at: string | null;
}

export interface XpEstimate {
  base: number;
  with_cargo: number;
  with_modifiers_max: number;
  potential_grade_s: number;
  potential_grade_a: number;
  cargo_multiplier: number;
  modifiers_multiplier: number;
}

// ═══════════════════════════════════════════════════════════
// CARGO & INVENTORY TYPES
// ═══════════════════════════════════════════════════════════
export interface AirportInventoryItem {
  item_id: string;
  item_name: string;
  quantity: number;
  weight_kg: number;
  location_id: string;
  location_name: string;
  owner_type?: "player" | "company";  // V4.1: Ownership tag
  category?: string;                   // V4.1: Item category (e.g. "personnel")
}

export interface ProfileInventoryItem {
  id: number | string;
  item_code: string;
  item_name: string;
  quantity: number;
  airport_icao: string;
  tier?: number;
  owner_type?: "player" | "company";  // V4.1: Ownership tag (default "player")
  category?: string;                   // V4.1: Item category (material, product, personnel)
  source?: string;                     // V5.1: Origin ("contract", "market", etc.)
}

export interface AircraftCargoItem {
  item_id: string;
  item_name: string;
  qty: number;
  weight_kg: number;
  total_weight_kg: number;
}

export interface HangarCargoItem {
  item_code: string;
  item_name: string;
  qty: number;
  total_weight_kg: number;
  tier: number;
  source?: string;
  contract_id?: string;
}

export interface CargoPopupItem {
  item_id: string;
  item_name: string;
  max_qty: number;
  weight_kg: number;
  location_id: string;
  // V5.1: Weight info for popup display
  aircraft_cargo_kg?: number;
  aircraft_cargo_max_kg?: number;
}

// Raw API response for airport inventory (with containers structure)
export interface AirportInventoryResponse {
  containers: Array<{
    id: string;
    name?: string;
    type: string;
    items: Array<{
      item_id: string;
      item_name: string;
      qty: number;
      weight_kg: number | string;
      source?: string;
      contract_id?: string;
    }>;
  }>;
}

// Raw API response for aircraft cargo
export interface AircraftCargoResponse {
  current_cargo_kg: number;
  cargo_capacity_kg: number;
  items: Array<{
    item_id: string;
    item_name: string;
    qty: number;
    weight_kg: number | string;
    total_weight_kg: number | string;
    source?: string;
    contract_id?: string;
  }>;
}

// ═══════════════════════════════════════════════════════════
// MAP & AIRPORT TYPES
// ═══════════════════════════════════════════════════════════
export interface NearbyAirport {
  icao: string;
  name: string;
  distance_nm: number;
}

export interface SelectedAirport {
  icao: string;
  name: string;
  type: string;
  lat: number;
  lon: number;
}

export interface DestinationAirport {
  icao: string;
  name: string;
}

export interface FactoryAtAirport {
  id: string;
  name: string;
}

export interface Factory {
  id: string;
  name: string;
  airport_ident: string;
  company_id: string;
  product_type: string;
}

// Alias for map view - same as SelectedAirport
export type AirportInfo = SelectedAirport;

// ═══════════════════════════════════════════════════════════
// COMPANY TYPES
// ═══════════════════════════════════════════════════════════
export interface CompanyData {
  id: string;
  name: string;
  home_airport_ident: string;
  balance: number;
  created_at: string;
}

// Alias for compatibility with views
export type CompanyInfo = CompanyData;

export interface CompanyMember {
  user_id: string;
  username: string;
  email: string;
  role: CompanyRole | string;
}

export interface CompanyFleetItem {
  id: string;
  registration: string | null;
  aircraft_type: string;
  current_airport_ident: string | null;
  status: string;
}

// ═══════════════════════════════════════════════════════════
// MARKET TYPES
// ═══════════════════════════════════════════════════════════
export interface MarketListing {
  location_id: string;
  airport_ident: string;
  company_id: string;
  company_name: string;
  item_id: string;
  item_code: string;
  item_name: string;
  item_tier: number;
  item_icon: string | null;
  sale_price: number;
  sale_qty: number;
}

export interface MarketBuyItem {
  location_id: string;
  airport_ident: string;
  company_name: string;
  item_id: string;
  item_code: string;
  item_name: string;
  item_tier: number;
  sale_price: number;
  sale_qty: number;
}

// ═══════════════════════════════════════════════════════════
// FLIGHT PLAN TYPES
// ═══════════════════════════════════════════════════════════
export interface EfbFlightPlanData {
  origin: string;
  destination: string;
  waypoints: Array<{ ident: string; lat: number; lon: number; type: string }>;
  totalDistance: number;
}

// ═══════════════════════════════════════════════════════════
// LANDING & FLIGHT DATA TYPES
// ═══════════════════════════════════════════════════════════
export type LandingRating = "excellent" | "good" | "acceptable" | "hard" | null;

export type LoadingStatus = "idle" | "loading" | "success" | "error";
export type MissionCreationStatus = "idle" | "loading" | "creating" | "success" | "error";

// ═══════════════════════════════════════════════════════════
// INTERNATIONALIZATION
// ═══════════════════════════════════════════════════════════
export type Language = "en" | "fr" | "de" | "es" | "ru";

// ═══════════════════════════════════════════════════════════
// FLIGHT HISTORY (V2.0)
// ═══════════════════════════════════════════════════════════

export type FlightHistoryFilter = "all" | "mission" | "freeflight";

// V4.1: Unified history filter (flights + transactions)
export type UnifiedHistoryFilter = "all" | "flights" | "transactions" | "contracts";

export interface FlightHistoryEntry {
  id: string;                    // UUID unique
  type: "mission" | "freeflight"; // Flight type
  date: number;                  // Timestamp (Date.now())

  // Route
  departure_icao: string;
  arrival_icao: string;
  distance_nm: number;
  flight_time_minutes: number;

  // Aircraft
  aircraft_id: string;
  aircraft_type: string;         // Ex: "C172", "A320"
  aircraft_reg: string;          // Ex: "F-ABCD"

  // Scoring
  score_total: number;
  grade: string;                 // S/A/B/C/D/F
  landing_fpm: number;
  max_gforce: number;

  // Result
  xp_earned: number;
  money_earned: number;          // 0 for freeflight, >0 for missions

  // Active bonuses (for detailed display)
  bonuses: {
    real_time: boolean;
    night: boolean;
    atc: boolean;
    fuel_eco: boolean;
    no_autopilot: boolean;
    bad_weather: boolean;
  };

  // Weather
  weather_visibility_nm: number;
  weather_wind_kts: number;

  // ATC
  atc_compliance: number;
  atc_violations: number;
}

// ═══════════════════════════════════════════════════════════
// CONTRACT TYPES (Phase 5A)
// ═══════════════════════════════════════════════════════════

export interface ContractCargoItem {
  item_code: string;
  item_name: string;
  quantity: number;
  weight_kg: number;
}

export interface ContractOffer {
  id: string;
  // Creator
  creator_id: string;          // "AI" or player_id
  creator_name: string;        // "IA Transport" or player name
  creator_type: "ai" | "player";
  // Route
  origin_icao: string;
  destination_icao: string;
  distance_nm: number;
  // Cargo
  cargo_type: "items" | "passengers" | "mixed";
  cargo_description: string;   // "5x Iron Ore" or "3 passagers"
  cargo_weight_kg: number;
  cargo_items?: ContractCargoItem[];
  passenger_count?: number;
  // Conditions
  reward_cr: number;
  required_license: string;    // "PPL", "IR", "CPL", "ATPL"
  min_cargo_capacity_kg: number;
  // Status
  status: "available" | "accepted";
  accepted_by?: string;
  accepted_at?: string;
  created_at: string;
}

export interface ActiveContract {
  id: string;
  offer_id: string;
  pilot_id: string;
  pilot_name: string;
  // Copied from offer
  origin_icao: string;
  destination_icao: string;
  distance_nm: number;
  cargo_type: string;
  cargo_description: string;
  cargo_weight_kg: number;
  cargo_items?: ContractCargoItem[];  // Items to spawn/track
  passenger_count?: number;           // Passengers to spawn/track
  reward_cr: number;
  // Timing
  accepted_at: string;
  completed_at?: string;
  // Status
  status: "in_progress" | "completed" | "cancelled";
  failure_reason?: string;     // "cancelled"
  // Result
  actual_flight_time_min?: number;
  score?: number;
  xp_earned?: number;
  // Wallet
  wallet: "player" | "company";
}

// ═══════════════════════════════════════════════════════════
// SOCIAL TYPES (Phase 6)
// ═══════════════════════════════════════════════════════════

export interface Friend {
  id: string;
  player_id: string;
  friend_id: string;
  friend_name: string;
  friend_level: number;
  friend_nationality: string;
  status: "pending" | "accepted" | "blocked";
  created_at: string;
}

export interface DirectMessage {
  id: string;
  sender_id: string;
  sender_name: string;
  recipient_id: string;
  recipient_name: string;
  content: string;
  read: boolean;
  type: "message" | "system" | "contract_proposal" | "cr_transfer";
  metadata?: {
    amount?: number;
    contract_id?: string;
  };
  created_at: string;
}

export interface PlayerSearchResult {
  id: string;
  name: string;
  level: number;
  nationality: string;
  current_airport: string;
  is_online: boolean;
  is_friend: boolean;
}

// ═══════════════════════════════════════════════════════════
// TRANSFER TYPES (Phase 7)
// ═══════════════════════════════════════════════════════════

export interface TransferAircraftOption {
  id: string;
  registration: string;
  type: string;
  location_icao: string;
  location_name: string;
  distance_nm: number;
  cost_cr: number;
  owner_type: "player" | "company";
}

export interface Notification {
  id: string;
  player_id: string;
  type: "friend_request" | "friend_accepted" | "message" | "contract" | "transfer";
  title: string;
  body: string;
  read: boolean;
  metadata?: Record<string, unknown>;
  created_at: string;
}
