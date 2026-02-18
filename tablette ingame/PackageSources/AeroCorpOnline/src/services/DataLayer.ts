/**
 * DataLayer - Abstraction layer for local/network data access
 * Allows seamless switching between solo (IndexedDB) and multiplayer (P2P) modes
 */

import { DatabaseManager } from "../managers/DatabaseManager";
import type {
  Player,
  Company,
  Aircraft,
  InventoryItem,
  MarketOrder,
  Mission,
  FreeFlightSession,
  Item,
} from "../managers/DatabaseManager";

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export type DataMode = "local" | "network";

export interface NetworkConfig {
  host: string;
  port: number;
  playerId?: string;
}

export interface DataLayerCallbacks {
  onModeChange?: (mode: DataMode) => void;
  onError?: (error: Error) => void;
}

// ═══════════════════════════════════════════════════════════
// DATA LAYER CLASS
// ═══════════════════════════════════════════════════════════

class DataLayerClass {
  private mode: DataMode = "local";
  private networkConfig: NetworkConfig | null = null;
  private callbacks: DataLayerCallbacks = {};

  // ─────────────────────────────────────────────────────────
  // MODE MANAGEMENT
  // ─────────────────────────────────────────────────────────

  initialize(callbacks: DataLayerCallbacks = {}): void {
    this.callbacks = callbacks;
    console.log("[DataLayer] Initialized in", this.mode, "mode");
  }

  setLocalMode(): void {
    this.mode = "local";
    this.networkConfig = null;
    console.log("[DataLayer] Switched to LOCAL mode");
    this.callbacks.onModeChange?.("local");
  }

  setNetworkMode(config: NetworkConfig): void {
    this.mode = "network";
    this.networkConfig = config;
    console.log(`[DataLayer] Switched to NETWORK mode: ${config.host}:${config.port}`);
    this.callbacks.onModeChange?.("network");
  }

  getMode(): DataMode {
    return this.mode;
  }

  isLocalMode(): boolean {
    return this.mode === "local";
  }

  isNetworkMode(): boolean {
    return this.mode === "network";
  }

  // ─────────────────────────────────────────────────────────
  // PLAYER
  // ─────────────────────────────────────────────────────────

  async getPlayer(): Promise<Player | undefined> {
    if (this.mode === "network" && this.networkConfig) {
      return this.fetchFromPeer<Player>("/api/player");
    }
    return DatabaseManager.getPlayer();
  }

  async updatePlayerMoney(delta: number): Promise<Player | undefined> {
    if (this.mode === "network" && this.networkConfig) {
      return this.postToPeer<Player>("/api/player/money", { delta });
    }

    const player = await DatabaseManager.getPlayer();
    if (player) {
      player.money += delta;
      player.updated_at = new Date().toISOString();
      await DatabaseManager.put("player", player);
    }
    return player;
  }

  async updatePlayerXP(delta: number): Promise<Player | undefined> {
    if (this.mode === "network" && this.networkConfig) {
      return this.postToPeer<Player>("/api/player/xp", { delta });
    }

    const player = await DatabaseManager.getPlayer();
    if (player) {
      player.xp += delta;
      player.updated_at = new Date().toISOString();
      await DatabaseManager.put("player", player);
    }
    return player;
  }

  // ─────────────────────────────────────────────────────────
  // COMPANY
  // ─────────────────────────────────────────────────────────

  async getCompany(ownerId: string): Promise<Company | undefined> {
    if (this.mode === "network" && this.networkConfig) {
      return this.fetchFromPeer<Company>("/api/company", { owner_id: ownerId });
    }
    return DatabaseManager.getCompanyByOwner(ownerId);
  }

  async updateCompanyBalance(companyId: string, delta: number): Promise<Company | undefined> {
    if (this.mode === "network" && this.networkConfig) {
      return this.postToPeer<Company>("/api/company/balance", { company_id: companyId, delta });
    }

    const company = await DatabaseManager.get<Company>("company", companyId);
    if (company) {
      company.balance += delta;
      await DatabaseManager.put("company", company);
    }
    return company;
  }

  // ─────────────────────────────────────────────────────────
  // FLEET / AIRCRAFT
  // ─────────────────────────────────────────────────────────

  async getFleet(companyId: string): Promise<Aircraft[]> {
    if (this.mode === "network" && this.networkConfig) {
      return this.fetchFromPeer<Aircraft[]>("/api/fleet", { company_id: companyId });
    }
    return DatabaseManager.getAircraftByCompany(companyId);
  }

  async getAircraft(aircraftId: string): Promise<Aircraft | undefined> {
    if (this.mode === "network" && this.networkConfig) {
      return this.fetchFromPeer<Aircraft>(`/api/fleet/${aircraftId}`);
    }
    return DatabaseManager.get<Aircraft>("aircraft", aircraftId);
  }

  async updateAircraftLocation(aircraftId: string, icao: string): Promise<void> {
    if (this.mode === "network" && this.networkConfig) {
      await this.postToPeer("/api/fleet/location", { aircraft_id: aircraftId, icao });
      return;
    }
    await DatabaseManager.updateAircraftLocation(aircraftId, icao);
  }

  async updateAircraftFuel(aircraftId: string, fuelGallons: number): Promise<void> {
    if (this.mode === "network" && this.networkConfig) {
      await this.postToPeer("/api/fleet/fuel", { aircraft_id: aircraftId, fuel_gallons: fuelGallons });
      return;
    }
    await DatabaseManager.updateAircraftFuel(aircraftId, fuelGallons);
  }

  async getAircraftAtAirport(icao: string): Promise<Aircraft[]> {
    if (this.mode === "network" && this.networkConfig) {
      return this.fetchFromPeer<Aircraft[]>("/api/fleet/at-airport", { icao });
    }
    return DatabaseManager.getAircraftAtAirport(icao);
  }

  // ─────────────────────────────────────────────────────────
  // MARKET
  // ─────────────────────────────────────────────────────────

  async getMarketListings(icao?: string): Promise<MarketOrder[]> {
    if (this.mode === "network" && this.networkConfig) {
      return this.fetchFromPeer<MarketOrder[]>("/api/market/listings", icao ? { icao } : undefined);
    }
    return DatabaseManager.getActiveMarketOrders(icao);
  }

  async getMarketListingsByItem(itemCode: string): Promise<MarketOrder[]> {
    if (this.mode === "network" && this.networkConfig) {
      return this.fetchFromPeer<MarketOrder[]>("/api/market/listings", { item_code: itemCode });
    }
    return DatabaseManager.getMarketOrdersByItem(itemCode);
  }

  async createMarketOrder(order: Omit<MarketOrder, "id" | "created_at" | "is_active">): Promise<MarketOrder> {
    const newOrder: MarketOrder = {
      ...order,
      id: this.generateUUID(),
      created_at: new Date().toISOString(),
      is_active: true,
    };

    if (this.mode === "network" && this.networkConfig) {
      return this.postToPeer<MarketOrder>("/api/market/orders", newOrder);
    }

    await DatabaseManager.put("market_orders", newOrder);
    return newOrder;
  }

  async buyMarketOrder(orderId: string, quantity: number, buyerId: string): Promise<{ success: boolean; message?: string }> {
    if (this.mode === "network" && this.networkConfig) {
      return this.postToPeer("/api/market/buy", { order_id: orderId, quantity, buyer_id: buyerId });
    }

    // Local mode: validate and execute
    const order = await DatabaseManager.get<MarketOrder>("market_orders", orderId);
    if (!order || !order.is_active) {
      return { success: false, message: "Order not found or inactive" };
    }

    if (order.quantity < quantity) {
      return { success: false, message: "Insufficient quantity" };
    }

    const totalCost = (order.price_per_unit ?? order.unit_price ?? 0) * quantity;
    const player = await DatabaseManager.getPlayer();
    if (!player || player.money < totalCost) {
      return { success: false, message: "Insufficient funds" };
    }

    // Deduct money
    player.money -= totalCost;
    player.updated_at = new Date().toISOString();
    await DatabaseManager.put("player", player);

    // Update order quantity
    order.quantity -= quantity;
    if (order.quantity <= 0) {
      order.is_active = false;
    }
    await DatabaseManager.put("market_orders", order);

    // Add to buyer's inventory (simplified - adds to current aircraft)
    // In full implementation, would need to specify destination

    return { success: true };
  }

  async cancelMarketOrder(orderId: string): Promise<void> {
    if (this.mode === "network" && this.networkConfig) {
      await this.postToPeer("/api/market/cancel", { order_id: orderId });
      return;
    }

    const order = await DatabaseManager.get<MarketOrder>("market_orders", orderId);
    if (order) {
      order.is_active = false;
      await DatabaseManager.put("market_orders", order);
    }
  }

  // ─────────────────────────────────────────────────────────
  // INVENTORY
  // ─────────────────────────────────────────────────────────

  async getInventory(locationType: string, locationId: string): Promise<InventoryItem[]> {
    if (this.mode === "network" && this.networkConfig) {
      return this.fetchFromPeer<InventoryItem[]>("/api/inventory", { type: locationType, id: locationId });
    }
    return DatabaseManager.getInventoryAt(locationType, locationId);
  }

  async transferItem(
    fromType: string,
    fromId: string,
    toType: string,
    toId: string,
    itemCode: string,
    quantity: number
  ): Promise<{ success: boolean; message?: string }> {
    if (this.mode === "network" && this.networkConfig) {
      return this.postToPeer("/api/inventory/transfer", {
        from_type: fromType,
        from_id: fromId,
        to_type: toType,
        to_id: toId,
        item_code: itemCode,
        quantity,
      });
    }

    // Local mode: validate and execute transfer
    const fromItems = await DatabaseManager.getInventoryAt(fromType, fromId);
    const sourceItem = fromItems.find((i) => i.item_code === itemCode);

    if (!sourceItem || sourceItem.quantity < quantity) {
      return { success: false, message: "Insufficient quantity in source" };
    }

    // Reduce from source
    sourceItem.quantity -= quantity;
    if (sourceItem.quantity <= 0) {
      await DatabaseManager.delete("inventory", sourceItem.id);
    } else {
      await DatabaseManager.put("inventory", sourceItem);
    }

    // Add to destination
    const toItems = await DatabaseManager.getInventoryAt(toType, toId);
    const destItem = toItems.find((i) => i.item_code === itemCode);

    if (destItem) {
      destItem.quantity += quantity;
      await DatabaseManager.put("inventory", destItem);
    } else {
      await DatabaseManager.put("inventory", {
        id: this.generateUUID(),
        location_type: toType as "aircraft" | "airport" | "warehouse",
        location_id: toId,
        item_code: itemCode,
        quantity,
      });
    }

    return { success: true };
  }

  // ─────────────────────────────────────────────────────────
  // MISSIONS
  // ─────────────────────────────────────────────────────────

  async getMissions(playerId: string, status?: string): Promise<Mission[]> {
    if (this.mode === "network" && this.networkConfig) {
      return this.fetchFromPeer<Mission[]>("/api/missions", { player_id: playerId, status });
    }

    if (status) {
      return DatabaseManager.getMissionsByStatus(status);
    }
    return DatabaseManager.getAll<Mission>("missions");
  }

  async getActiveMission(playerId: string): Promise<Mission | undefined> {
    if (this.mode === "network" && this.networkConfig) {
      return this.fetchFromPeer<Mission | undefined>("/api/missions/active", { player_id: playerId });
    }
    return DatabaseManager.getActiveMission(playerId);
  }

  async createMission(mission: Omit<Mission, "id" | "created_at">): Promise<Mission> {
    const newMission: Mission = {
      ...mission,
      id: this.generateUUID(),
      created_at: new Date().toISOString(),
    };

    if (this.mode === "network" && this.networkConfig) {
      return this.postToPeer<Mission>("/api/missions", newMission);
    }

    await DatabaseManager.put("missions", newMission);
    return newMission;
  }

  async updateMissionStatus(
    missionId: string,
    status: Mission["status"],
    completionData?: { score_total?: number; grade?: string; xp_earned?: number }
  ): Promise<Mission | undefined> {
    if (this.mode === "network" && this.networkConfig) {
      return this.postToPeer<Mission>("/api/missions/status", { mission_id: missionId, status, ...completionData });
    }

    const mission = await DatabaseManager.get<Mission>("missions", missionId);
    if (mission) {
      mission.status = status;
      if (status === "completed") {
        mission.completed_at = new Date().toISOString();
        if (completionData) {
          mission.score_total = completionData.score_total ?? null;
          mission.grade = completionData.grade ?? null;
          mission.xp_earned = completionData.xp_earned ?? 0;
        }
      }
      await DatabaseManager.put("missions", mission);
    }
    return mission;
  }

  // ─────────────────────────────────────────────────────────
  // FREE FLIGHT
  // ─────────────────────────────────────────────────────────

  async startFreeFlight(session: Omit<FreeFlightSession, "id" | "started_at">): Promise<FreeFlightSession> {
    const newSession: FreeFlightSession = {
      ...session,
      id: this.generateUUID(),
      started_at: new Date().toISOString(),
    };

    if (this.mode === "network" && this.networkConfig) {
      return this.postToPeer<FreeFlightSession>("/api/free-flight/start", newSession);
    }

    await DatabaseManager.put("free_flight_sessions", newSession);
    return newSession;
  }

  async updateFreeFlight(
    sessionId: string,
    updates: Partial<Pick<FreeFlightSession, "flight_time_minutes" | "distance_nm" | "landings_count" | "xp_earned">>
  ): Promise<void> {
    if (this.mode === "network" && this.networkConfig) {
      await this.postToPeer("/api/free-flight/update", { session_id: sessionId, ...updates });
      return;
    }

    const session = await DatabaseManager.get<FreeFlightSession>("free_flight_sessions", sessionId);
    if (session) {
      Object.assign(session, updates);
      await DatabaseManager.put("free_flight_sessions", session);
    }
  }

  async endFreeFlight(sessionId: string, endAirport: string): Promise<FreeFlightSession | undefined> {
    if (this.mode === "network" && this.networkConfig) {
      return this.postToPeer<FreeFlightSession>("/api/free-flight/end", { session_id: sessionId, end_airport: endAirport });
    }

    const session = await DatabaseManager.get<FreeFlightSession>("free_flight_sessions", sessionId);
    if (session) {
      session.end_airport = endAirport;
      session.ended_at = new Date().toISOString();
      await DatabaseManager.put("free_flight_sessions", session);
    }
    return session;
  }

  // ─────────────────────────────────────────────────────────
  // ITEMS CATALOG
  // ─────────────────────────────────────────────────────────

  async getItem(code: string): Promise<Item | undefined> {
    if (this.mode === "network" && this.networkConfig) {
      return this.fetchFromPeer<Item>(`/api/items/${code}`);
    }
    return DatabaseManager.getItemByCode(code);
  }

  async getItemsByCategory(category: string): Promise<Item[]> {
    if (this.mode === "network" && this.networkConfig) {
      return this.fetchFromPeer<Item[]>("/api/items", { category });
    }
    return DatabaseManager.getItemsByCategory(category);
  }

  async getAllItems(): Promise<Item[]> {
    if (this.mode === "network" && this.networkConfig) {
      return this.fetchFromPeer<Item[]>("/api/items");
    }
    return DatabaseManager.getAll<Item>("items");
  }

  // ─────────────────────────────────────────────────────────
  // NETWORK HELPERS
  // ─────────────────────────────────────────────────────────

  private async fetchFromPeer<T>(path: string, params?: Record<string, any>): Promise<T> {
    if (!this.networkConfig) {
      throw new Error("Network config not set");
    }

    const url = new URL(`http://${this.networkConfig.host}:${this.networkConfig.port}${path}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined) url.searchParams.set(k, String(v));
      });
    }

    try {
      const response = await fetch(url.toString(), {
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      console.error(`[DataLayer] Network error fetching ${path}:`, error);
      this.callbacks.onError?.(error as Error);
      throw error;
    }
  }

  private async postToPeer<T>(path: string, body: any): Promise<T> {
    if (!this.networkConfig) {
      throw new Error("Network config not set");
    }

    const url = `http://${this.networkConfig.host}:${this.networkConfig.port}${path}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      console.error(`[DataLayer] Network error posting to ${path}:`, error);
      this.callbacks.onError?.(error as Error);
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────
  // UTILITIES
  // ─────────────────────────────────────────────────────────

  private generateUUID(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}

// ═══════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════

export const DataLayer = new DataLayerClass();
