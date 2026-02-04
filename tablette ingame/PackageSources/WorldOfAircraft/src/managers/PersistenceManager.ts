/**
 * PersistenceManager - Synchronizes State modules with IndexedDB
 * Handles: States ↔ SQLite bidirectional sync
 *
 * Pattern:
 * - On startup: DB → States (loadAllStates)
 * - On change: States → DB (auto-save subscriptions)
 */

import { DatabaseManager } from "./DatabaseManager";
import type {
  Player,
  Company,
  Aircraft,
  MarketOrder,
  Mission,
  FreeFlightSession,
  InventoryItem,
} from "./DatabaseManager";

// Import state modules
import { authState } from "../state/AuthState";
import { marketState } from "../state/MarketState";
import { hangarState } from "../state/HangarState";
import { inventoryState } from "../state/InventoryState";
import { missionState } from "../state/MissionState";
import { freeFlightState } from "../state/FreeFlightState";
import { companyState } from "../state/CompanyState";

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface PersistenceCallbacks {
  onLoaded?: () => void;
  onError?: (error: Error) => void;
  onSaved?: (store: string) => void;
}

interface LocalPlayerState {
  id: string;
  name: string;
  xp: number;
  money: number;
  trust_score: number;
}

// ═══════════════════════════════════════════════════════════
// PERSISTENCE MANAGER CLASS
// ═══════════════════════════════════════════════════════════

// Subscription type from MSFS SDK
interface MsfsSubscription {
  destroy: () => void;
}

class PersistenceManagerClass {
  private callbacks: PersistenceCallbacks = {};
  private autoSaveEnabled = false;
  private subscriptions: MsfsSubscription[] = [];
  private currentPlayerId: string | null = null;
  private currentCompanyId: string | null = null;
  private saveDebounceTimers: Map<string, number> = new Map();

  // ─────────────────────────────────────────────────────────
  // INITIALIZATION
  // ─────────────────────────────────────────────────────────

  initialize(callbacks: PersistenceCallbacks = {}): void {
    this.callbacks = callbacks;
    console.log("[PersistenceManager] Initialized");
  }

  // ─────────────────────────────────────────────────────────
  // LOAD: DB → States
  // ─────────────────────────────────────────────────────────

  async loadAllStates(): Promise<void> {
    try {
      console.log("[PersistenceManager] Loading states from database...");

      // 1. Load player
      const player = await this.loadPlayer();
      if (!player) {
        console.warn("[PersistenceManager] No player found in database");
        return;
      }

      this.currentPlayerId = player.id;

      // 2. Load company
      const company = await this.loadCompany(player.id);
      if (company) {
        this.currentCompanyId = company.id;
      }

      // 3. Load other data in parallel
      await Promise.all([
        this.loadAircraft(this.currentCompanyId),
        this.loadMarketOrders(),
        this.loadInventory(),
        this.loadActiveMission(player.id),
        this.loadActiveFreeFlight(player.id),
      ]);

      console.log("[PersistenceManager] All states loaded from database");
      this.callbacks.onLoaded?.();

    } catch (error) {
      console.error("[PersistenceManager] Failed to load states:", error);
      this.callbacks.onError?.(error as Error);
      throw error;
    }
  }

  private async loadPlayer(): Promise<Player | undefined> {
    const player = await DatabaseManager.getPlayer();

    if (player) {
      // Update auth state with local player info
      // P2P mode: auto-login with local player data
      authState.isLoggedIn.set(true);
      authState.currentUser.set({
        id: 0, // Local P2P mode - no server ID
        username: player.name,
        email: "", // No email in P2P mode
      });

      console.log(`[PersistenceManager] Loaded player: ${player.name} (XP: ${player.xp}, Money: ${player.money})`);
      console.log(`[PersistenceManager] Auto-login enabled for P2P mode`);
    }

    return player;
  }

  private async loadCompany(ownerId: string): Promise<Company | undefined> {
    const company = await DatabaseManager.getCompanyByOwner(ownerId);

    if (company) {
      // Update company state
      companyState.companyId.set(company.id);
      companyState.companyName.set(company.name);
      companyState.companyBalance.set(company.balance);
      console.log(`[PersistenceManager] Loaded company: ${company.name}`);
    }

    return company;
  }

  private async loadAircraft(companyId: string | null): Promise<void> {
    const allAircraft: Aircraft[] = [];

    // 1. Load personal aircraft (owned by player directly)
    if (this.currentPlayerId) {
      const personalAircraft = await DatabaseManager.getAircraftByOwner(this.currentPlayerId);
      console.log(`[PersistenceManager] Found ${personalAircraft.length} personal aircraft`);
      allAircraft.push(...personalAircraft);
    }

    // 2. Load company aircraft (if player has a company)
    if (companyId) {
      const companyAircraft = await DatabaseManager.getAircraftByCompany(companyId);
      console.log(`[PersistenceManager] Found ${companyAircraft.length} company aircraft`);
      allAircraft.push(...companyAircraft);
    }

    // Transform to hangar format
    const hangarList = allAircraft.map((a) => ({
      id: a.id,
      registration: a.registration,
      type_code: a.type_code,
      location_icao: a.location_icao,
      fuel_gallons: a.fuel_gallons,
      condition: a.condition,
      flight_hours: a.flight_hours,
    }));

    hangarState.hangarAircraftList.set(hangarList as any);
    console.log(`[PersistenceManager] Loaded ${allAircraft.length} total aircraft`);
  }

  private async loadMarketOrders(): Promise<void> {
    const orders = await DatabaseManager.getActiveMarketOrders();

    // Transform to market state format
    const listings = orders.map((o) => ({
      id: o.id,
      type: o.type,
      item_code: o.item_code,
      quantity: o.quantity,
      price_per_unit: o.price_per_unit,
      icao: o.icao,
      seller_id: o.seller_id,
      is_ai: o.seller_id === "AI",
    }));

    marketState.marketListings.set(listings as any);
    console.log(`[PersistenceManager] Loaded ${orders.length} market orders`);
  }

  private async loadInventory(): Promise<void> {
    // Load all inventory items
    const items = await DatabaseManager.getAll<InventoryItem>("inventory");

    // Group by location for state
    inventoryState.inventoryItems.set(items as any);
    console.log(`[PersistenceManager] Loaded ${items.length} inventory items`);
  }

  private async loadActiveMission(playerId: string): Promise<void> {
    const mission = await DatabaseManager.getActiveMission(playerId);

    if (mission) {
      missionState.activeMission.set({
        id: mission.id,
        origin_icao: mission.origin_icao,
        destination_icao: mission.destination_icao,
        status: mission.status,
        cargo_kg: mission.cargo_kg,
        distance_nm: mission.distance_nm,
      } as any);
      console.log(`[PersistenceManager] Loaded active mission: ${mission.origin_icao} → ${mission.destination_icao}`);
    }
  }

  private async loadActiveFreeFlight(playerId: string): Promise<void> {
    const session = await DatabaseManager.getActiveFreeFlight(playerId);

    if (session) {
      freeFlightState.isTracking.set(true);
      freeFlightState.sessionId.set(session.id);
      freeFlightState.flightTimeMinutes.set(session.flight_time_minutes);
      freeFlightState.distanceNm.set(session.distance_nm);
      freeFlightState.landingsCount.set(session.landings_count);
      freeFlightState.xpEarned.set(session.xp_earned);
      console.log(`[PersistenceManager] Loaded active free flight session`);
    }
  }

  // ─────────────────────────────────────────────────────────
  // AUTO-SAVE: States → DB
  // ─────────────────────────────────────────────────────────

  enableAutoSave(): void {
    if (this.autoSaveEnabled) return;
    this.autoSaveEnabled = true;

    console.log("[PersistenceManager] Enabling auto-save subscriptions...");

    // Market orders changes
    const marketSub = marketState.marketListings.sub((listings) => {
      this.debouncedSave("market", async () => {
        // Note: Only save player-created orders, not AI ones
        // AI orders are regenerated by AIEconomyService
      });
    });
    this.subscriptions.push({ destroy: () => marketSub });

    // Free flight session updates
    const ffSub = freeFlightState.flightTimeMinutes.sub((time) => {
      if (time > 0 && this.currentPlayerId) {
        this.debouncedSave("free_flight", async () => {
          await this.saveFreeFlight();
        });
      }
    });
    this.subscriptions.push({ destroy: () => ffSub });

    // Aircraft fuel changes (save after refuel)
    const aircraftSub = hangarState.hangarSelectedAircraft.sub((aircraft) => {
      if (aircraft) {
        this.debouncedSave("aircraft", async () => {
          await this.saveAircraft(aircraft as any);
        });
      }
    });
    this.subscriptions.push({ destroy: () => aircraftSub });

    // Company balance changes
    const companySub = companyState.companyBalance.sub((balance) => {
      if (this.currentCompanyId) {
        this.debouncedSave("company", async () => {
          await this.saveCompanyBalance(balance);
        });
      }
    });
    this.subscriptions.push({ destroy: () => companySub });

    console.log("[PersistenceManager] Auto-save enabled with", this.subscriptions.length, "subscriptions");
  }

  disableAutoSave(): void {
    // Clear all subscriptions
    this.subscriptions.forEach((sub) => {
      try {
        sub.destroy();
      } catch {
        // Ignore errors on destroy
      }
    });
    this.subscriptions = [];
    this.autoSaveEnabled = false;

    // Clear debounce timers
    this.saveDebounceTimers.forEach((timer) => clearTimeout(timer));
    this.saveDebounceTimers.clear();

    console.log("[PersistenceManager] Auto-save disabled");
  }

  private debouncedSave(key: string, saveFn: () => Promise<void>): void {
    // Clear existing timer
    const existingTimer = this.saveDebounceTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new debounced save (500ms delay)
    const timer = window.setTimeout(async () => {
      try {
        await saveFn();
        this.callbacks.onSaved?.(key);
      } catch (error) {
        console.error(`[PersistenceManager] Failed to save ${key}:`, error);
      }
      this.saveDebounceTimers.delete(key);
    }, 500);

    this.saveDebounceTimers.set(key, timer);
  }

  // ─────────────────────────────────────────────────────────
  // SAVE HELPERS
  // ─────────────────────────────────────────────────────────

  private async saveFreeFlight(): Promise<void> {
    const sessionId = freeFlightState.sessionId.get();
    if (!sessionId || !this.currentPlayerId) return;

    const session: FreeFlightSession = {
      id: sessionId,
      player_id: this.currentPlayerId,
      aircraft_id: missionState.selectedAircraftId.get() || "",
      start_airport: freeFlightState.startAirport.get() || "",
      end_airport: null,
      flight_time_minutes: freeFlightState.flightTimeMinutes.get(),
      distance_nm: freeFlightState.distanceNm.get(),
      landings_count: freeFlightState.landingsCount.get(),
      xp_earned: freeFlightState.xpEarned.get(),
      started_at: new Date().toISOString(),
      ended_at: null,
    };

    await DatabaseManager.put("free_flight_sessions", session);
  }

  private async saveAircraft(aircraft: Aircraft): Promise<void> {
    await DatabaseManager.put("aircraft", aircraft);
  }

  private async saveCompanyBalance(balance: number): Promise<void> {
    if (!this.currentCompanyId) return;

    const company = await DatabaseManager.get<Company>("company", this.currentCompanyId);
    if (company) {
      company.balance = balance;
      await DatabaseManager.put("company", company);
    }
  }

  async saveMissionComplete(mission: Mission): Promise<void> {
    await DatabaseManager.put("missions", mission);
    console.log(`[PersistenceManager] Saved completed mission: ${mission.id}`);
  }

  async savePlayerXP(xpDelta: number): Promise<void> {
    const player = await DatabaseManager.getPlayer();
    if (player) {
      player.xp += xpDelta;
      player.updated_at = new Date().toISOString();
      await DatabaseManager.put("player", player);
      console.log(`[PersistenceManager] Player XP updated: +${xpDelta} (total: ${player.xp})`);
    }
  }

  async savePlayerMoney(moneyDelta: number): Promise<void> {
    const player = await DatabaseManager.getPlayer();
    if (player) {
      player.money += moneyDelta;
      player.updated_at = new Date().toISOString();
      await DatabaseManager.put("player", player);
      console.log(`[PersistenceManager] Player money updated: ${moneyDelta > 0 ? "+" : ""}${moneyDelta} (total: ${player.money})`);
    }
  }

  // ─────────────────────────────────────────────────────────
  // FORCE SAVE ALL
  // ─────────────────────────────────────────────────────────

  async saveAll(): Promise<void> {
    console.log("[PersistenceManager] Force saving all states...");

    try {
      // Save free flight if active
      if (freeFlightState.isTracking.get()) {
        await this.saveFreeFlight();
      }

      // Save company balance
      if (this.currentCompanyId) {
        await this.saveCompanyBalance(companyState.companyBalance.get());
      }

      console.log("[PersistenceManager] All states saved");
    } catch (error) {
      console.error("[PersistenceManager] Failed to save all:", error);
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────
  // GETTERS
  // ─────────────────────────────────────────────────────────

  getCurrentPlayerId(): string | null {
    return this.currentPlayerId;
  }

  getCurrentCompanyId(): string | null {
    return this.currentCompanyId;
  }

  isAutoSaveEnabled(): boolean {
    return this.autoSaveEnabled;
  }
}

// ═══════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════

export const PersistenceManager = new PersistenceManagerClass();
