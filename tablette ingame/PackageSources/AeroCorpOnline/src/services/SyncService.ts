/**
 * SyncService - Connexion au monde unique SEED
 * Gère toute la communication avec le serveur central
 *
 * Architecture "Monde Unique":
 * - Pas de mode solo isolé, un seul monde partagé
 * - Tous les joueurs (PC + Xbox) dans le même monde
 * - SEED = source de vérité centrale (Cloudflare R2 + Workers)
 * - Connexion obligatoire pour jouer
 */

import { marketState } from "../state/MarketState";
import type { MarketListing } from "../types";

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface WorldData {
  market_orders: MarketOrder[];
  airport_inventories: Record<string, AirportInventory[]>;
  factories: WorldFactory[];
  prices: Record<string, number>;
  version: number;
}

export interface AirportInventory {
  item_id: string;
  item_name: string;
  quantity: number;
  price: number;
}

export interface PlayerInventoryItem {
  id: string;
  item_id: string;
  item_code: string;
  item_name: string;
  quantity: number;
  airport_icao: string;
  weight_kg?: number;
  tier?: number;
}

export interface AirportInventoryRaw {
  containers: Array<{
    id: string;
    name: string;
    type: string;
    items: Array<{
      item_id: string;
      item_name: string;
      qty: number;
      weight_kg: number;
    }>;
  }>;
}

export interface AircraftCargoResponse {
  items: Array<{
    item_id: string;
    item_name: string;
    qty: number;
    weight_kg: number;
    total_weight_kg: number;
  }>;
  current_cargo_kg: number;
  cargo_capacity_kg: number;
}

export interface WorldFactory {
  id: string;
  name: string;
  airport_ident: string;
  owner_id: string;
  owner_name: string;
  product_type: string;
  production_rate: number;
}

export interface SeedPlayer {
  id: string;
  name: string;
  money: number;
  xp: number;
  home_airport: string;
  created_at: string;
  updated_at: string;
  /** Player inventory - items owned by the player at various locations */
  inventory?: PlayerInventoryItem[];
}

export interface SeedAircraft {
  id: string;
  owner_id: string;
  registration: string;
  aircraft_type: string;
  icao_type: string;
  current_airport_ident: string;
  status: string;
  fuel_gallons: number;
  fuel_capacity_gallons: number;
  cargo_kg: number;
  cargo_capacity_kg: number;
  condition: number;
  hours: number;
}

export interface SeedCompany {
  id: string;
  name: string;
  owner_id: string;
  home_airport_ident: string;
  balance: number;
  created_at: string;
  /** Company inventory - items owned by the company at various locations */
  inventory?: PlayerInventoryItem[];
}

// ═══════════════════════════════════════════════════════════
// MISSION TYPES (ANTI-CHEAT: Server-side calculation)
// ═══════════════════════════════════════════════════════════

export interface SeedMission {
  id: string;
  player_id: string;
  aircraft_id: string;
  departure_icao: string;
  destination_icao: string;
  distance_nm: number;
  base_xp: number;
  base_reward: number;
  cargo?: { item_id: string; quantity: number }[];
  fuel_at_start: number;
  status: "in_progress" | "completed" | "failed" | "cancelled";
  created_at: string;
  completed_at?: string;
}

export interface FlightStats {
  flight_time_minutes: number;
  distance_nm: number;
  landing_fpm: number;
  max_g_force: number;
  overspeed_count: number;
  fuel_remaining: number;
  departure_icao: string;
  arrival_icao: string;
}

export interface MissionScore {
  score: number;
  multiplier: number;
  grade: string;
  penalties: string[];
  bonuses: string[];
}

export interface MissionCompletionResult {
  success: boolean;
  score: MissionScore;
  xp_earned: number;
  money_earned: number;
  new_xp: number;
  new_balance: number;
  wear_applied: number;
  new_condition: number;
  trust_modifier: number;
}

export interface RefuelResult {
  success: boolean;
  fuel_added: number;
  aircraft_id?: string;
  gallons_added?: number;
  cost: number;
  new_fuel: number;
  new_balance: number;
}

export interface PlayerTrust {
  player_id: string;
  trust_score: number;
  events: { timestamp: string; reason: string; penalty: number }[];
  last_flag_date: string;
}

export interface MarketOrder {
  id: string;
  seller_id: string;
  seller_name: string;
  airport_ident: string;
  item_id: string;
  item_name: string;
  item_tier: number;
  quantity: number;
  price_per_unit: number;
  created_at: string;
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "failed";

// ═══════════════════════════════════════════════════════════
// SYNC SERVICE CLASS
// ═══════════════════════════════════════════════════════════

// SEED URLs - switch between dev and production
const SEED_URL_DEV = "http://localhost:8787";
const SEED_URL_PROD = "https://aerocorp-online-seed.aerocorponline.workers.dev";

// API Key for SEED authentication
const API_KEY = "8d90c0a2f60ff15017f3040c061030ce0cf4356795e5925e419ed2f73fa060a3";

class SyncServiceClass {
  // URL du SEED - PRODUCTION par défaut (Monde Unique)
  private SEED_URL = SEED_URL_PROD;
  private connected = false;
  private playerId: string | null = null;
  private worldVersion = 0;
  private pollingInterval: number | null = null;
  private connectionStatus: ConnectionStatus = "disconnected";
  private lastError: string | null = null;

  // ═══════════════════════════════════════════════════════════
  // AUTH HEADERS
  // ═══════════════════════════════════════════════════════════

  private getHeaders(): HeadersInit {
    return {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
      "X-Player-ID": this.playerId || "",
    };
  }

  // ═══════════════════════════════════════════════════════════
  // CONNEXION
  // ═══════════════════════════════════════════════════════════

  async connect(): Promise<boolean> {
    this.connectionStatus = "connecting";
    this.lastError = null;

    try {
      console.log("[Sync] Connecting to SEED...");
      const response = await fetch(`${this.SEED_URL}/ping`, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (response.ok) {
        this.connected = true;
        this.connectionStatus = "connected";
        console.log("[Sync] Connected to SEED!");
        return true;
      }

      throw new Error(`Ping failed: ${response.status}`);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.error("[Sync] Connection failed:", error);
      this.lastError = error;
      this.connected = false;
      this.connectionStatus = "failed";
    }

    return false;
  }

  async reconnect(): Promise<boolean> {
    console.log("[Sync] Attempting reconnection...");
    this.connectionStatus = "connecting";
    return this.connect();
  }

  disconnect(): void {
    this.stopPolling();
    this.connected = false;
    this.connectionStatus = "disconnected";
    this.playerId = null;
    console.log("[Sync] Disconnected from SEED");
  }

  isConnected(): boolean {
    return this.connected;
  }

  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  // ═══════════════════════════════════════════════════════════
  // MONDE (données partagées)
  // ═══════════════════════════════════════════════════════════

  async loadWorld(): Promise<WorldData | null> {
    if (!this.connected) return null;

    try {
      console.log("[Sync] Loading world data...");

      const response = await fetch(`${this.SEED_URL}/world`, {
        headers: this.getHeaders(),
      });
      if (!response.ok) throw new Error("Failed to load world");

      const world: WorldData = await response.json();

      // Mettre à jour seulement si nouvelle version
      if (world.version > this.worldVersion) {
        this.worldVersion = world.version;
        this.applyWorldData(world);
        console.log(`[Sync] World updated to version ${world.version}`);
      }

      return world;
    } catch (e) {
      console.error("[Sync] Load world failed:", e);
      return null;
    }
  }

  private applyWorldData(world: WorldData): void {
    // Convertir les market_orders du SEED vers le format MarketListing
    const listings: MarketListing[] = world.market_orders.map((order) => ({
      location_id: `seed_${order.id || ""}`,
      airport_ident: order.airport_ident || "",
      company_id: order.seller_id || "",
      company_name: order.seller_name || "Unknown",
      item_id: order.item_id || "",
      item_code: order.item_id || "",
      item_name: order.item_name || "",
      item_tier: order.item_tier || 1,
      item_icon: null,
      sale_price: order.price_per_unit || 0,
      sale_qty: order.quantity || 0,
    }));

    marketState.marketListings.set(listings);

    // TODO: Mettre à jour les autres states quand ils seront créés
    // worldState.inventories.set(world.airport_inventories);
    // worldState.factories.set(world.factories);
    // worldState.prices.set(world.prices);
  }

  getWorldVersion(): number {
    return this.worldVersion;
  }

  // ═══════════════════════════════════════════════════════════
  // JOUEUR (données personnelles)
  // ═══════════════════════════════════════════════════════════

  async loadOrCreatePlayer(playerId: string): Promise<SeedPlayer | null> {
    if (!this.connected) return null;

    this.playerId = playerId;

    try {
      // Essayer de charger le joueur existant
      const response = await fetch(`${this.SEED_URL}/players/${playerId}`, {
        headers: this.getHeaders(),
      });

      if (response.ok) {
        const player: SeedPlayer = await response.json();
        console.log(`[Sync] Loaded player: ${player.name}`);
        return player;
      }

      if (response.status === 404) {
        // Nouveau joueur - sera créé via createPlayer
        console.log("[Sync] Player not found - first launch");
        return null;
      }

      throw new Error(`Failed to load player: ${response.status}`);
    } catch (e) {
      console.error("[Sync] Load player failed:", e);
      return null;
    }
  }

  async savePlayer(player: SeedPlayer): Promise<boolean> {
    if (!this.connected) return false;

    try {
      const response = await fetch(`${this.SEED_URL}/players/${player.id}`, {
        method: "PUT",
        headers: this.getHeaders(),
        body: JSON.stringify(player),
      });

      if (response.ok) {
        console.log("[Sync] Player saved");
        return true;
      }

      throw new Error(`Save failed: ${response.status}`);
    } catch (e) {
      console.error("[Sync] Save player failed:", e);
    }

    return false;
  }

  async createPlayer(player: SeedPlayer): Promise<boolean> {
    if (!this.connected) return false;

    // Set playerId BEFORE the request so headers are correct
    this.playerId = player.id;

    try {
      const response = await fetch(`${this.SEED_URL}/players`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(player),
      });

      if (response.ok) {
        console.log(`[Sync] Player created: ${player.name} (ID: ${player.id})`);
        return true;
      }

      // Reset playerId on failure
      this.playerId = null;
      throw new Error(`Create failed: ${response.status}`);
    } catch (e) {
      this.playerId = null;
      console.error("[Sync] Create player failed:", e);
    }

    return false;
  }

  /**
   * Set player ID manually (used during first launch)
   */
  setPlayerId(playerId: string): void {
    this.playerId = playerId;
    console.log(`[Sync] Player ID set: ${playerId}`);
  }

  getPlayerId(): string | null {
    return this.playerId;
  }

  // ═══════════════════════════════════════════════════════════
  // AVIONS
  // ═══════════════════════════════════════════════════════════

  async loadPlayerAircraft(playerId: string): Promise<SeedAircraft[]> {
    if (!this.connected) return [];

    try {
      const response = await fetch(`${this.SEED_URL}/players/${playerId}/aircraft`, {
        headers: this.getHeaders(),
      });
      if (!response.ok) return [];

      return await response.json();
    } catch (e) {
      console.error("[Sync] Load aircraft failed:", e);
      return [];
    }
  }

  async saveAircraft(aircraft: SeedAircraft): Promise<boolean> {
    if (!this.connected) return false;

    try {
      const response = await fetch(`${this.SEED_URL}/aircraft/${aircraft.id}`, {
        method: "PUT",
        headers: this.getHeaders(),
        body: JSON.stringify(aircraft),
      });

      return response.ok;
    } catch (e) {
      console.error("[Sync] Save aircraft failed:", e);
      return false;
    }
  }

  /**
   * Create a new aircraft on SEED (uses POST)
   * Used for starter aircraft during first launch
   */
  async createAircraft(aircraft: SeedAircraft): Promise<boolean> {
    if (!this.connected || !this.playerId) return false;

    try {
      // POST to player's aircraft collection to create new aircraft
      const response = await fetch(`${this.SEED_URL}/players/${this.playerId}/aircraft`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(aircraft),
      });

      if (response.ok) {
        console.log(`[Sync] Aircraft created: ${aircraft.registration}`);
        return true;
      }
      console.warn(`[Sync] Create aircraft failed: ${response.status}`);
      return false;
    } catch (e) {
      console.error("[Sync] Create aircraft failed:", e);
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // COMPANY
  // ═══════════════════════════════════════════════════════════

  async loadPlayerCompany(playerId: string): Promise<SeedCompany | null> {
    if (!this.connected) return null;

    try {
      const response = await fetch(`${this.SEED_URL}/players/${playerId}/company`, {
        headers: this.getHeaders(),
      });
      if (!response.ok) return null;

      return await response.json();
    } catch (e) {
      console.error("[Sync] Load company failed:", e);
      return null;
    }
  }

  async createCompany(company: Omit<SeedCompany, "id" | "created_at">): Promise<SeedCompany | null> {
    if (!this.connected) return null;

    try {
      const response = await fetch(`${this.SEED_URL}/companies`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(company),
      });

      if (response.ok) {
        return await response.json();
      }
      return null;
    } catch (e) {
      console.error("[Sync] Create company failed:", e);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // MARCHÉ
  // ═══════════════════════════════════════════════════════════

  async postMarketOrder(order: Omit<MarketOrder, "id" | "created_at">): Promise<boolean> {
    if (!this.connected) return false;

    try {
      const response = await fetch(`${this.SEED_URL}/market/orders`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(order),
      });

      if (response.ok) {
        // Recharger le monde pour avoir les nouvelles données
        await this.loadWorld();
        return true;
      }
      return false;
    } catch (e) {
      console.error("[Sync] Post market order failed:", e);
      return false;
    }
  }

  async buyMarketOrder(orderId: string, buyerId: string, quantity: number): Promise<boolean> {
    if (!this.connected) return false;

    try {
      const response = await fetch(`${this.SEED_URL}/market/orders/${orderId}/buy`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({ buyer_id: buyerId, quantity }),
      });

      if (response.ok) {
        // Recharger le monde pour avoir les nouvelles données
        await this.loadWorld();
        return true;
      }
      return false;
    } catch (e) {
      console.error("[Sync] Buy market order failed:", e);
      return false;
    }
  }

  async cancelMarketOrder(orderId: string, sellerId: string): Promise<boolean> {
    if (!this.connected) return false;

    try {
      const response = await fetch(`${this.SEED_URL}/market/orders/${orderId}`, {
        method: "DELETE",
        headers: this.getHeaders(),
        body: JSON.stringify({ seller_id: sellerId }),
      });

      if (response.ok) {
        await this.loadWorld();
        return true;
      }
      return false;
    } catch (e) {
      console.error("[Sync] Cancel market order failed:", e);
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // POLLING (mise à jour périodique)
  // ═══════════════════════════════════════════════════════════

  startPolling(intervalMs: number = 30000): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    console.log(`[Sync] Starting polling every ${intervalMs / 1000}s`);

    // Premier chargement immédiat
    this.loadWorld();

    this.pollingInterval = window.setInterval(() => {
      if (this.connected) {
        this.loadWorld();
      } else {
        // Tenter une reconnexion automatique
        this.reconnect().then((success) => {
          if (success) {
            this.loadWorld();
          }
        });
      }
    }, intervalMs);
  }

  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      console.log("[Sync] Polling stopped");
    }
  }

  isPolling(): boolean {
    return this.pollingInterval !== null;
  }

  // ═══════════════════════════════════════════════════════════
  // UTILITAIRES
  // ═══════════════════════════════════════════════════════════

  setSeedUrl(url: string): void {
    this.SEED_URL = url;
    console.log(`[Sync] SEED URL set to: ${url}`);
  }

  getSeedUrl(): string {
    return this.SEED_URL;
  }

  /**
   * Switch to development mode (localhost)
   */
  useDevMode(): void {
    this.SEED_URL = SEED_URL_DEV;
    console.log("[Sync] Switched to DEV mode (localhost)");
  }

  /**
   * Switch to production mode (Cloudflare Workers)
   */
  useProdMode(): void {
    this.SEED_URL = SEED_URL_PROD;
    console.log("[Sync] Switched to PROD mode (Cloudflare Workers)");
  }

  /**
   * Check if using production mode
   */
  isProdMode(): boolean {
    return this.SEED_URL === SEED_URL_PROD;
  }

  // ═══════════════════════════════════════════════════════════
  // PLAYER (extended)
  // ═══════════════════════════════════════════════════════════

  async getPlayer(): Promise<SeedPlayer | null> {
    if (!this.connected || !this.playerId) return null;

    try {
      const response = await fetch(`${this.SEED_URL}/players/${this.playerId}`, {
        headers: this.getHeaders(),
      });
      if (response.ok) {
        return response.json();
      }
    } catch (e) {
      console.error("[Sync] Get player failed:", e);
    }
    return null;
  }

  // NOTE: updatePlayerMoney and updatePlayerXP have been REMOVED
  // ANTI-CHEAT: Money and XP can ONLY be modified by SEED through:
  // - completeMission() → awards XP and money based on flight performance
  // - refuelAircraft() → deducts money for fuel
  // - buyMarketOrder() → deducts money for purchases
  // Direct modification attempts will be blocked by the server and flagged

  // ═══════════════════════════════════════════════════════════
  // AIRCRAFT (extended)
  // ═══════════════════════════════════════════════════════════

  async getPlayerAircraftList(): Promise<SeedAircraft[]> {
    if (!this.connected || !this.playerId) return [];

    try {
      const response = await fetch(`${this.SEED_URL}/players/${this.playerId}/aircraft`, {
        headers: this.getHeaders(),
      });
      if (response.ok) {
        return response.json();
      }
    } catch (e) {
      console.error("[Sync] Get aircraft list failed:", e);
    }
    return [];
  }

  async getAircraftDetails(aircraftId: string): Promise<SeedAircraft | null> {
    const aircraft = await this.getPlayerAircraftList();
    return aircraft.find((a) => a.id === aircraftId) || null;
  }

  async updateAircraft(aircraft: SeedAircraft): Promise<boolean> {
    if (!this.connected) return false;

    try {
      const response = await fetch(`${this.SEED_URL}/aircraft/${aircraft.id}`, {
        method: "PUT",
        headers: this.getHeaders(),
        body: JSON.stringify(aircraft),
      });
      return response.ok;
    } catch (e) {
      console.error("[Sync] Update aircraft failed:", e);
      return false;
    }
  }

  async purchaseAircraft(catalogId: string, registration: string): Promise<SeedAircraft | null> {
    if (!this.connected || !this.playerId) return null;

    try {
      const response = await fetch(`${this.SEED_URL}/players/${this.playerId}/aircraft`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({ catalog_id: catalogId, registration }),
      });
      if (response.ok) {
        return response.json();
      }
    } catch (e) {
      console.error("[Sync] Purchase aircraft failed:", e);
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════
  // COMPANY (extended)
  // ═══════════════════════════════════════════════════════════

  async getCompany(): Promise<SeedCompany | null> {
    if (!this.connected || !this.playerId) return null;

    try {
      const response = await fetch(`${this.SEED_URL}/players/${this.playerId}/company`, {
        headers: this.getHeaders(),
      });
      if (response.ok) {
        return response.json();
      }
    } catch (e) {
      // 404 is expected if no company exists
      if (!(e instanceof Error && e.message.includes("404"))) {
        console.error("[Sync] Get company failed:", e);
      }
    }
    return null;
  }

  async updateCompany(company: SeedCompany): Promise<boolean> {
    if (!this.connected) return false;

    try {
      const response = await fetch(`${this.SEED_URL}/companies/${company.id}`, {
        method: "PUT",
        headers: this.getHeaders(),
        body: JSON.stringify(company),
      });
      return response.ok;
    } catch (e) {
      console.error("[Sync] Update company failed:", e);
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // MISSIONS (ANTI-CHEAT: Server-side XP/money calculation)
  // ═══════════════════════════════════════════════════════════

  /**
   * Create a new mission on SEED server
   * SEED calculates distance, base_xp, base_reward server-side
   */
  async createMission(
    aircraftId: string,
    destinationIcao: string,
    cargo?: { item_id: string; quantity: number }[]
  ): Promise<SeedMission | null> {
    if (!this.connected || !this.playerId) return null;

    try {
      const response = await fetch(`${this.SEED_URL}/missions`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          aircraft_id: aircraftId,
          destination_icao: destinationIcao,
          cargo,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`[Sync] Mission created: ${result.mission.id}`);
        return result.mission;
      }

      const error = await response.json();
      console.error("[Sync] Create mission failed:", error.error);
      return null;
    } catch (e) {
      console.error("[Sync] Create mission failed:", e);
      return null;
    }
  }

  /**
   * Complete a mission - SEED calculates and awards XP/money
   * This is the ONLY way to earn XP and money (anti-cheat)
   */
  async completeMission(
    missionId: string,
    stats: FlightStats
  ): Promise<MissionCompletionResult | null> {
    if (!this.connected || !this.playerId) return null;

    try {
      const response = await fetch(`${this.SEED_URL}/missions/${missionId}/complete`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(stats),
      });

      if (response.ok) {
        const result: MissionCompletionResult = await response.json();
        console.log(`[Sync] Mission completed: Grade ${result.score.grade}, +${result.xp_earned} XP, +${result.money_earned} CR`);
        return result;
      }

      const error = await response.json();
      console.error("[Sync] Complete mission failed:", error.error);
      return null;
    } catch (e) {
      console.error("[Sync] Complete mission failed:", e);
      return null;
    }
  }

  /**
   * Get active mission for an aircraft
   */
  async getActiveMission(aircraftId: string): Promise<SeedMission | null> {
    if (!this.connected) return null;

    try {
      const response = await fetch(`${this.SEED_URL}/missions/active/${aircraftId}`, {
        headers: this.getHeaders(),
      });

      if (response.ok) {
        return await response.json();
      }
      // 404 = no active mission (normal)
      return null;
    } catch (e) {
      console.error("[Sync] Get active mission failed:", e);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // REFUEL (ANTI-CHEAT: Server-side cost calculation)
  // ═══════════════════════════════════════════════════════════

  /**
   * Refuel aircraft - SEED calculates cost and deducts from player
   * This is the ONLY way to add fuel (anti-cheat)
   */
  async refuelAircraft(aircraftId: string, gallonsToAdd: number): Promise<RefuelResult | null> {
    if (!this.connected || !this.playerId) return null;

    try {
      const response = await fetch(`${this.SEED_URL}/aircraft/${aircraftId}/refuel`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({ gallons_to_add: gallonsToAdd }),
      });

      if (response.ok) {
        const result: RefuelResult = await response.json();
        console.log(`[Sync] Refuel: +${result.fuel_added} gal, cost ${result.cost} CR, balance ${result.new_balance} CR`);
        return result;
      }

      const error = await response.json();
      console.error("[Sync] Refuel failed:", error.error);
      return null;
    } catch (e) {
      console.error("[Sync] Refuel failed:", e);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // TRUST SCORE (ANTI-CHEAT monitoring)
  // ═══════════════════════════════════════════════════════════

  /**
   * Get player's trust score and flag history
   */
  async getPlayerTrust(): Promise<PlayerTrust | null> {
    if (!this.connected || !this.playerId) return null;

    try {
      const response = await fetch(`${this.SEED_URL}/players/${this.playerId}/trust`, {
        headers: this.getHeaders(),
      });

      if (response.ok) {
        return await response.json();
      }
      return null;
    } catch (e) {
      console.error("[Sync] Get trust score failed:", e);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // MARKET (extended)
  // ═══════════════════════════════════════════════════════════

  async getMarketOrders(filters?: { icao?: string; item_code?: string }): Promise<MarketOrder[]> {
    if (!this.connected) return [];

    try {
      let url = `${this.SEED_URL}/market/orders`;
      if (filters) {
        const params = new URLSearchParams();
        if (filters.icao) params.set("icao", filters.icao);
        if (filters.item_code) params.set("item_code", filters.item_code);
        if (params.toString()) url += "?" + params.toString();
      }

      const response = await fetch(url, {
        headers: this.getHeaders(),
      });
      if (response.ok) {
        return response.json();
      }
    } catch (e) {
      console.error("[Sync] Get market orders failed:", e);
    }
    return [];
  }

  // ═══════════════════════════════════════════════════════════
  // INVENTORY
  // ═══════════════════════════════════════════════════════════

  async getAirportInventory(icao: string): Promise<AirportInventory[]> {
    if (!this.connected) return [];

    try {
      const response = await fetch(`${this.SEED_URL}/world/inventories/${icao}`, {
        headers: this.getHeaders(),
      });
      if (response.ok) {
        return response.json();
      }
    } catch (e) {
      console.error("[Sync] Get airport inventory failed:", e);
    }
    return [];
  }

  async updateAirportInventory(icao: string, items: AirportInventory[]): Promise<boolean> {
    if (!this.connected) return false;

    try {
      const response = await fetch(`${this.SEED_URL}/world/inventories/${icao}`, {
        method: "PUT",
        headers: this.getHeaders(),
        body: JSON.stringify(items),
      });
      return response.ok;
    } catch (e) {
      console.error("[Sync] Update airport inventory failed:", e);
      return false;
    }
  }

  /**
   * Get player inventory from SEED
   * Uses GET /players/:id which includes inventory field
   * Returns items owned by the player at all locations
   */
  async getPlayerInventory(): Promise<PlayerInventoryItem[]> {
    if (!this.connected || !this.playerId) return [];

    try {
      // Use the main player endpoint which includes inventory
      const response = await fetch(`${this.SEED_URL}/players/${this.playerId}`, {
        headers: this.getHeaders(),
      });
      if (response.ok) {
        const player: SeedPlayer = await response.json();
        console.log(`[Sync] getPlayerInventory: Player has ${player.inventory?.length || 0} inventory items`);
        return player.inventory || [];
      }
    } catch (e) {
      console.error("[Sync] Get player inventory failed:", e);
    }
    return [];
  }

  /**
   * Get company inventory from SEED
   * Uses GET /players/:id/company which includes inventory field
   * Returns items owned by the player's company
   */
  async getCompanyInventory(): Promise<PlayerInventoryItem[]> {
    if (!this.connected || !this.playerId) return [];

    try {
      // Use the company endpoint which includes inventory
      const response = await fetch(`${this.SEED_URL}/players/${this.playerId}/company`, {
        headers: this.getHeaders(),
      });
      if (response.ok) {
        const company: SeedCompany = await response.json();
        console.log(`[Sync] getCompanyInventory: Company has ${company.inventory?.length || 0} inventory items`);
        return company.inventory || [];
      }
      // 404 is expected if no company exists
      if (response.status === 404) return [];
    } catch (e) {
      console.error("[Sync] Get company inventory failed:", e);
    }
    return [];
  }

  /**
   * Get airport inventory with containers structure (for cargo UI)
   */
  async getAirportInventoryRaw(icao: string): Promise<AirportInventoryRaw> {
    if (!this.connected) return { containers: [] };

    try {
      const response = await fetch(`${this.SEED_URL}/world/inventories/${icao}/detailed`, {
        headers: this.getHeaders(),
      });
      if (response.ok) {
        return response.json();
      }
    } catch (e) {
      console.error("[Sync] Get airport inventory raw failed:", e);
    }
    return { containers: [] };
  }

  // ═══════════════════════════════════════════════════════════
  // CARGO OPERATIONS
  // ═══════════════════════════════════════════════════════════

  /**
   * Get aircraft cargo from SEED
   */
  async getAircraftCargo(aircraftId: string): Promise<AircraftCargoResponse> {
    if (!this.connected) return { items: [], current_cargo_kg: 0, cargo_capacity_kg: 0 };

    try {
      const response = await fetch(`${this.SEED_URL}/aircraft/${aircraftId}/cargo`, {
        headers: this.getHeaders(),
      });
      if (response.ok) {
        return response.json();
      }
    } catch (e) {
      console.error("[Sync] Get aircraft cargo failed:", e);
    }
    return { items: [], current_cargo_kg: 0, cargo_capacity_kg: 0 };
  }

  /**
   * Load cargo onto aircraft via SEED
   */
  async loadCargo(aircraftId: string, fromLocationId: string, itemId: string, qty: number): Promise<boolean> {
    if (!this.connected) return false;

    try {
      const response = await fetch(`${this.SEED_URL}/aircraft/${aircraftId}/cargo/load`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          from_location_id: fromLocationId,
          item_id: itemId,
          quantity: qty,
        }),
      });
      return response.ok;
    } catch (e) {
      console.error("[Sync] Load cargo failed:", e);
      return false;
    }
  }

  /**
   * Unload cargo from aircraft via SEED
   */
  async unloadCargo(aircraftId: string, toLocationId: string, itemId: string, qty: number): Promise<boolean> {
    if (!this.connected) return false;

    try {
      const response = await fetch(`${this.SEED_URL}/aircraft/${aircraftId}/cargo/unload`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          to_location_id: toLocationId,
          item_id: itemId,
          quantity: qty,
        }),
      });
      return response.ok;
    } catch (e) {
      console.error("[Sync] Unload cargo failed:", e);
      return false;
    }
  }

  /**
   * End a free flight session and get XP reward from SEED
   * Server calculates XP based on raw flight stats (anti-cheat)
   */
  async endFreeFlight(
    aircraftId: string,
    stats: {
      flight_time_minutes: number;
      distance_nm: number;
      landing_fpm: number;
      max_g_force: number;
      overspeed_count: number;
      departure_icao: string;
      arrival_icao: string;
      landings: number;
    }
  ): Promise<{ success: boolean; xp_earned: number; message?: string }> {
    if (!this.connected) {
      return { success: false, xp_earned: 0, message: "Not connected to SEED" };
    }

    try {
      const response = await fetch(`${this.SEED_URL}/aircraft/${aircraftId}/free-flight-end`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(stats),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Sync] Free flight end failed:", errorText);
        return { success: false, xp_earned: 0, message: errorText };
      }

      const result = await response.json() as { success: boolean; xp_earned: number; message?: string };
      console.log(`[Sync] Free flight ended: +${result.xp_earned} XP`);
      return result;
    } catch (e) {
      console.error("[Sync] Free flight end failed:", e);
      return { success: false, xp_earned: 0, message: String(e) };
    }
  }

  /**
   * Génère un UUID v4
   */
  generateUUID(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}

// ═══════════════════════════════════════════════════════════
// EXPORT SINGLETON
// ═══════════════════════════════════════════════════════════

export const SyncService = new SyncServiceClass();
