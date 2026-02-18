/**
 * ServiceAdapter - Unified service layer with mode-aware routing
 * Architecture v3.0: Two separate careers (Solo/Online)
 *
 * SOLO MODE:
 * - All operations are local only
 * - NO SEED sync, NO anti-cheat
 * - Full freedom for player
 *
 * ONLINE MODE:
 * - SEED sync for all operations
 * - STRICT anti-cheat
 * - Server is source of truth
 */

import { localFleetService } from "./LocalFleetService";
import { localMissionService } from "./LocalMissionService";
import { localMarketService } from "./LocalMarketService";
import { localContractService } from "./LocalContractService";
import { SyncService, type FlightStats, type SeedMission, type MissionCompletionResult, type RefuelResult, type MarketOrder, type PlayerInventoryItem, type AirportInventoryRaw, type AircraftCargoResponse } from "./SyncService";
import { OfflineMissionService, type OfflineMissionResult } from "./OfflineMissionService";
import { NetworkState } from "../state/NetworkState";
import { DatabaseManager } from "../managers/DatabaseManager";
import type { Airport, AircraftCatalog, Aircraft } from "../managers/DatabaseManager";
import { isSoloMode, isOnlineMode, isModeInitialized } from "../state/GameModeState";
import { LocalFactoryService } from "./LocalFactoryService";
import type { MarketListing } from "../types";
import type { Factory } from "../managers/DatabaseManager";

// Re-export types for convenience
export type {
  CreateMissionRequest,
  CreateMissionV1Request,
  CompleteMissionRequest,
  CompleteMissionV1Request,
  CheckpointValidateRequest,
  MissionResponse,
} from "./LocalMissionService";

// ═══════════════════════════════════════════════════════════
// SERVICE ADAPTER CLASS
// ═══════════════════════════════════════════════════════════

class ServiceAdapterClass {
  // ─────────────────────────────────────────────────────────
  // FLEET OPERATIONS (with SEED sync for aircraft state)
  // ─────────────────────────────────────────────────────────

  get fleet() {
    return {
      getFleet: () => localFleetService.getFleet(),
      getAvailableAtAirport: (icao: string) => localFleetService.getAvailableAtAirport(icao),
      getAircraftDetails: (aircraftId: string) => localFleetService.getAircraftDetails(aircraftId),
      getAircraftDetailsRaw: (aircraftId: string) => localFleetService.getAircraftDetailsRaw(aircraftId),
      getAircraft: (aircraftId: string) => localFleetService.getAircraft(aircraftId),
      getAircraftSystems: (aircraftId: string) => localFleetService.getAircraftSystems(aircraftId),
      getAircraftCargo: (aircraftId: string) => localFleetService.getAircraftCargo(aircraftId),

      /**
       * Get aircraft cargo (raw format) - routes based on game mode
       * SOLO: Local cargo from IndexedDB
       * ONLINE: Cargo from SEED server
       */
      getAircraftCargoRaw: async (aircraftId: string) => {
        // CRITICAL: Check if mode initialization is complete
        if (!isModeInitialized()) {
          console.warn("[ServiceAdapter] Mode not initialized yet - returning empty aircraft cargo");
          return { items: [], current_cargo_kg: 0, cargo_capacity_kg: 0 };
        }

        if (isOnlineMode() && NetworkState.isOnline()) {
          console.log("[ServiceAdapter] Online mode: fetching aircraft cargo from SEED");
          return SyncService.getAircraftCargo(aircraftId);
        }
        console.log("[ServiceAdapter] Solo/offline: using local aircraft cargo");
        return localFleetService.getAircraftCargoRaw(aircraftId);
      },

      /**
       * Load cargo onto aircraft - routes based on game mode
       * SOLO: Local operation (IndexedDB)
       * ONLINE: SEED validates and processes
       */
      loadCargo: async (aircraftId: string, fromLocationId: string, itemId: string, qty: number) => {
        // CRITICAL: Check if mode initialization is complete
        if (!isModeInitialized()) {
          throw new Error("Mode not initialized - cannot load cargo yet");
        }

        if (isOnlineMode() && NetworkState.isOnline()) {
          console.log("[ServiceAdapter] Online mode: loading cargo via SEED");
          const success = await SyncService.loadCargo(aircraftId, fromLocationId, itemId, qty);
          if (!success) {
            throw new Error("SEED cargo load failed");
          }
          return;
        }
        console.log("[ServiceAdapter] Solo/offline: loading cargo locally");
        return localFleetService.loadCargo(aircraftId, fromLocationId, itemId, qty);
      },

      /**
       * Unload cargo from aircraft - routes based on game mode
       * SOLO: Local operation (IndexedDB)
       * ONLINE: SEED validates and processes
       */
      unloadCargo: async (aircraftId: string, toLocationId: string, itemId: string, qty: number) => {
        // CRITICAL: Check if mode initialization is complete
        if (!isModeInitialized()) {
          throw new Error("Mode not initialized - cannot unload cargo yet");
        }

        if (isOnlineMode() && NetworkState.isOnline()) {
          console.log("[ServiceAdapter] Online mode: unloading cargo via SEED");
          const success = await SyncService.unloadCargo(aircraftId, toLocationId, itemId, qty);
          if (!success) {
            throw new Error("SEED cargo unload failed");
          }
          return;
        }
        console.log("[ServiceAdapter] Solo/offline: unloading cargo locally");
        return localFleetService.unloadCargo(aircraftId, toLocationId, itemId, qty);
      },

      getRepairQuote: (aircraftId: string) => localFleetService.getRepairQuote(aircraftId),
      repairAircraft: (aircraftId: string, systems: string[], payFrom: "player" | "company") =>
        localFleetService.repairAircraft(aircraftId, systems, payFrom),

      // Sync fuel state to local + SEED
      syncFuel: async (aircraftId: string, fuelGallons: number, fuelCapacityGallons: number) => {
        const result = await localFleetService.syncFuel(aircraftId, fuelGallons, fuelCapacityGallons);
        // Sync aircraft state to SEED
        this.syncAircraftToSeed(aircraftId);
        return result;
      },

      // Apply wear and sync to SEED
      applyBackgroundWear: async (aircraftId: string, flightTimeMinutes: number, avgAltitude: number, avgSpeed: number) => {
        const result = await localFleetService.applyBackgroundWear(aircraftId, flightTimeMinutes, avgAltitude, avgSpeed);
        this.syncAircraftToSeed(aircraftId);
        return result;
      },

      // Apply landing damage and sync to SEED
      applyLandingDamage: async (aircraftId: string, landingFpm: number, missionId?: string) => {
        const result = await localFleetService.applyLandingDamage(aircraftId, landingFpm, missionId);
        this.syncAircraftToSeed(aircraftId);
        return result;
      },

      // Update registration and sync to SEED
      updateRegistration: async (aircraftId: string, registration: string) => {
        const result = await localFleetService.updateRegistration(aircraftId, registration);
        this.syncAircraftToSeed(aircraftId);
        return result;
      },

      // Update description and sync to SEED
      updateDescription: async (aircraftId: string, description: string) => {
        const result = await localFleetService.updateDescription(aircraftId, description);
        this.syncAircraftToSeed(aircraftId);
        return result;
      },

      // Update location and sync to SEED
      updateLocation: async (aircraftId: string, icao: string) => {
        const result = await localFleetService.updateLocation(aircraftId, icao);
        this.syncAircraftToSeed(aircraftId);
        return result;
      },
    };
  }

  // Helper to sync aircraft state to SEED (fire and forget)
  // V3.0: Only sync in Online mode - NO SEED sync in Solo mode
  private async syncAircraftToSeed(aircraftId: string): Promise<void> {
    // V3.0: NO SEED sync in Solo mode
    if (isSoloMode()) {
      return;
    }

    try {
      const aircraft = await localFleetService.getAircraftDetailsRaw(aircraftId);
      if (aircraft) {
        // Convert to SEED format
        const seedAircraft = {
          id: aircraft.id,
          owner_id: (aircraft as any).owner_id || "",
          registration: aircraft.registration || "",
          aircraft_type: aircraft.aircraft_type,
          icao_type: aircraft.icao_type || "",
          current_airport_ident: aircraft.current_airport_ident || "",
          status: aircraft.status,
          fuel_gallons: aircraft.fuel_gallons,
          fuel_capacity_gallons: aircraft.fuel_capacity_gallons,
          cargo_kg: aircraft.current_cargo_kg || 0,
          cargo_capacity_kg: aircraft.cargo_capacity_kg,
          condition: aircraft.condition || 100,
          hours: aircraft.hours || 0,
        };
        await SyncService.updateAircraft(seedAircraft);
      }
    } catch (e) {
      console.warn("[ServiceAdapter] SEED aircraft sync failed:", e);
    }
  }

  // ─────────────────────────────────────────────────────────
  // MISSION OPERATIONS
  // ─────────────────────────────────────────────────────────

  get missions() {
    return {
      getActiveMission: () => localMissionService.getActiveMission(),
      createMission: (data: Parameters<typeof localMissionService.createMission>[0]) =>
        localMissionService.createMission(data),
      createMissionV1: (data: Parameters<typeof localMissionService.createMissionV1>[0]) =>
        localMissionService.createMissionV1(data),
      validateCheckpoint: (missionId: string, data: Parameters<typeof localMissionService.validateCheckpoint>[1]) =>
        localMissionService.validateCheckpoint(missionId, data),
      completeMission: (missionId: string, data: Parameters<typeof localMissionService.completeMission>[1]) =>
        localMissionService.completeMission(missionId, data),
      completeMissionV1: (missionId: string, data: Parameters<typeof localMissionService.completeMissionV1>[1]) =>
        localMissionService.completeMissionV1(missionId, data),
      failMission: (missionId: string) => localMissionService.failMission(missionId),
      getMissionHistory: (limit?: number) => localMissionService.getMissionHistory(limit),
    };
  }

  // ─────────────────────────────────────────────────────────
  // MARKET OPERATIONS
  // V3.0: Routes based on GAME MODE (Solo → local, Online → SEED)
  // ─────────────────────────────────────────────────────────

  get market() {
    return {
      /**
       * Get player inventory - routes based on game mode
       * SOLO: Local inventory from IndexedDB (persisted via AeroCorpOnlineData)
       * ONLINE: Inventory from SEED server
       */
      getPlayerInventory: async () => {
        // CRITICAL: Check if mode initialization is complete
        const initialized = isModeInitialized();
        const onlineMode = isOnlineMode();
        const networkOnline = NetworkState.isOnline();
        console.log(`[ServiceAdapter] getPlayerInventory - initialized: ${initialized}, isOnlineMode: ${onlineMode}, NetworkState.isOnline: ${networkOnline}`);

        // If not initialized, return empty array to prevent loading stale data
        if (!initialized) {
          console.warn("[ServiceAdapter] Mode not initialized yet - returning empty inventory");
          return [];
        }

        if (onlineMode && networkOnline) {
          console.log("[ServiceAdapter] Online mode: fetching player inventory from SEED");
          const items = await SyncService.getPlayerInventory();
          console.log(`[ServiceAdapter] SEED returned ${items.length} inventory items`);
          // Convert to local format
          return items.map((item: PlayerInventoryItem) => ({
            id: item.id,
            item_type: item.item_code || item.item_id,
            item_name: item.item_name,
            quantity: item.quantity,
            airport_icao: item.airport_icao,
            weight_kg: item.weight_kg,
            tier: item.tier,
          }));
        }
        console.log("[ServiceAdapter] Solo/offline: using local player inventory (IndexedDB)");
        const localItems = await localMarketService.getPlayerInventory();
        console.log(`[ServiceAdapter] Local IndexedDB returned ${localItems.length} inventory items`);
        return localItems;
      },

      /**
       * Get company inventory - routes based on game mode
       * SOLO: Local inventory from IndexedDB
       * ONLINE: Inventory from SEED server
       */
      getCompanyInventory: async () => {
        // CRITICAL: Check if mode initialization is complete
        if (!isModeInitialized()) {
          console.warn("[ServiceAdapter] Mode not initialized yet - returning empty company inventory");
          return [];
        }

        if (isOnlineMode() && NetworkState.isOnline()) {
          console.log("[ServiceAdapter] Online mode: fetching company inventory from SEED");
          const items = await SyncService.getCompanyInventory();
          // Convert to local format
          return items.map((item: PlayerInventoryItem) => ({
            id: item.id,
            item_type: item.item_code || item.item_id,
            item_name: item.item_name,
            quantity: item.quantity,
            airport_icao: item.airport_icao,
            weight_kg: item.weight_kg,
            tier: item.tier,
          }));
        }
        console.log("[ServiceAdapter] Solo/offline: using local company inventory");
        return localMarketService.getCompanyInventory();
      },

      getAirportInventory: (icao: string) => localMarketService.getAirportInventory(icao),

      /**
       * Get airport inventory with containers (for cargo UI) - routes based on game mode
       * SOLO: Local containers from IndexedDB
       * ONLINE: Containers from SEED server
       */
      getAirportInventoryRaw: async (icao: string) => {
        // CRITICAL: Check if mode initialization is complete
        if (!isModeInitialized()) {
          console.warn("[ServiceAdapter] Mode not initialized yet - returning empty airport inventory");
          return { containers: [] };
        }

        if (isOnlineMode() && NetworkState.isOnline()) {
          console.log("[ServiceAdapter] Online mode: fetching airport inventory from SEED");
          return SyncService.getAirportInventoryRaw(icao);
        }
        console.log("[ServiceAdapter] Solo/offline: using local airport inventory");
        return localMarketService.getAirportInventoryRaw(icao);
      },

      /**
       * Get market listings - routes based on game mode
       * SOLO: Local AI market (unlimited stock, fixed prices)
       * ONLINE: SEED market (player-driven economy)
       */
      getMarketListings: async (tier?: number | null, limit?: number): Promise<MarketListing[]> => {
        // CRITICAL: Check if mode initialization is complete
        if (!isModeInitialized()) {
          console.warn("[ServiceAdapter] Mode not initialized yet - returning empty market listings");
          return [];
        }

        // V3.0: Online mode uses SEED market orders
        if (isOnlineMode() && NetworkState.isOnline()) {
          console.log("[ServiceAdapter] Online mode: fetching market from SEED");
          const orders = await SyncService.getMarketOrders();

          // Convert MarketOrder to MarketListing format
          const listings: MarketListing[] = orders.map((order: MarketOrder) => ({
            location_id: `seed_${order.id}`, // Prefix with seed_ for buyItem routing
            airport_ident: order.airport_ident,
            company_id: order.seller_id,
            company_name: order.seller_name,
            item_id: order.item_id,
            item_code: order.item_id,
            item_name: order.item_name,
            item_tier: order.item_tier,
            item_icon: null,
            sale_price: order.price_per_unit,
            sale_qty: order.quantity,
          }));

          // Apply tier filter if specified
          let filtered = listings;
          if (tier !== null && tier !== undefined) {
            filtered = filtered.filter(l => l.item_tier === tier);
          }

          // Apply limit
          if (limit) {
            filtered = filtered.slice(0, limit);
          }

          console.log(`[ServiceAdapter] SEED market: ${filtered.length} listings`);
          return filtered;
        }

        // Solo mode or offline: use local market (AI traders)
        console.log("[ServiceAdapter] Solo/offline mode: using local market");
        return localMarketService.getMarketListings(tier, limit);
      },

      /**
       * Buy item from market - routes based on game mode
       * SOLO: Local transaction (deduct local money, add to local inventory)
       * ONLINE: SEED transaction (server validates and processes)
       */
      buyItem: async (locationId: string, itemId: string, qty: number, payFrom: "player" | "company"): Promise<void> => {
        // CRITICAL: Check if mode initialization is complete
        if (!isModeInitialized()) {
          throw new Error("Mode not initialized - cannot buy items yet");
        }

        // V3.0: Online mode with seed_ prefix uses SEED directly
        if (isOnlineMode() && locationId.startsWith("seed_") && NetworkState.isOnline()) {
          console.log("[ServiceAdapter] Online mode: buying via SEED");
          const seedOrderId = locationId.replace("seed_", "");
          const player = await DatabaseManager.getPlayer();
          if (!player) throw new Error("No player found");

          const buyerId = payFrom === "player"
            ? player.id
            : (await DatabaseManager.getCompanyByOwner(player.id))?.id;
          if (!buyerId) throw new Error("No buyer ID found");

          const success = await SyncService.buyMarketOrder(seedOrderId, buyerId, qty);
          if (!success) {
            throw new Error("SEED purchase failed");
          }

          // Reload player data from SEED to get updated balance
          const updatedPlayer = await SyncService.getPlayer();
          if (updatedPlayer) {
            player.money = updatedPlayer.money;
            player.xp = updatedPlayer.xp;
            await DatabaseManager.savePlayer(player);
            console.log(`[ServiceAdapter] Player balance updated from SEED: ${player.money}`);
          }

          // Persist to native storage (survives MSFS restarts)
          await DatabaseManager.forceSave();
          return;
        }

        // Solo mode or local orders: use local market service
        console.log("[ServiceAdapter] Solo/local mode: buying locally");
        return localMarketService.buyItem(locationId, itemId, qty, payFrom);
      },

      sellItem: (icao: string, itemCode: string, qty: number, pricePerUnit: number) =>
        localMarketService.sellItem(icao, itemCode, qty, pricePerUnit),
      getCompanyInfo: () => localMarketService.getCompanyInfo(),
      getCompanyMembers: () => localMarketService.getCompanyMembers(),
      getCompanyFleet: () => localMarketService.getCompanyFleet(),
      getPlayerBalance: () => localMarketService.getPlayerBalance(),
      getCompanyBalance: () => localMarketService.getCompanyBalance(),
      transferToCompany: (amount: number) => localMarketService.transferToCompany(amount),
      transferFromCompany: (amount: number) => localMarketService.transferFromCompany(amount),
    };
  }

  // ─────────────────────────────────────────────────────────
  // PLAYER & COMPANY (with SEED sync)
  // ─────────────────────────────────────────────────────────

  get player() {
    return {
      getPlayer: () => DatabaseManager.getPlayer(),

      // NOTE: updateMoney and updateXP have been REMOVED
      // ANTI-CHEAT: Money and XP can ONLY be modified through SEED:
      // - completeSeedMission() → awards XP and money based on flight performance
      // - refuelAircraft() → deducts money for fuel
      // - buyMarketItem() → deducts money for purchases
      //
      // Local-only methods are kept for deductions (buying items, repairs)
      // but any additions require going through SEED

      // Local deduction only (for repairs, local purchases)
      deductMoney: async (amount: number, reason: string) => {
        const player = await DatabaseManager.getPlayer();
        if (player) {
          if (player.money < amount) {
            console.warn(`[ServiceAdapter] Insufficient funds: need ${amount}, have ${player.money}`);
            return null;
          }
          player.money -= amount;
          await DatabaseManager.savePlayer(player);
          console.log(`[ServiceAdapter] Deducted ${amount} (${reason}). New balance: ${player.money}`);
        }
        return player;
      },
    };
  }

  get company() {
    return {
      getCompany: async () => {
        const player = await DatabaseManager.getPlayer();
        if (!player) return null;
        return DatabaseManager.getCompanyByOwner(player.id);
      },

      updateBalance: async (delta: number) => {
        // 1. Update locally first
        const player = await DatabaseManager.getPlayer();
        if (!player) return null;
        const company = await DatabaseManager.getCompanyByOwner(player.id);
        if (company) {
          company.balance += delta;
          await DatabaseManager.put("company", company);

          // 2. V3.0: Sync to SEED only in Online mode
          if (isOnlineMode()) {
            const seedCompany = await SyncService.getCompany();
            if (seedCompany) {
              seedCompany.balance += delta;
              SyncService.updateCompany(seedCompany).catch((e) =>
                console.warn("[ServiceAdapter] SEED sync failed for company balance:", e)
              );
            }
          }
        }
        return company;
      },
    };
  }

  // ─────────────────────────────────────────────────────────
  // WORLD DATA (AIRPORTS, AIRCRAFT CATALOG)
  // ─────────────────────────────────────────────────────────

  get world() {
    return {
      getAirport: (ident: string) => DatabaseManager.get<Airport>("airports", ident),
      searchAirports: async (query: string, limit = 20) => {
        const all = await DatabaseManager.getAll<Airport>("airports");
        const q = query.toUpperCase();
        return all
          .filter((a) =>
            a.ident.includes(q) ||
            a.name.toUpperCase().includes(q) ||
            a.municipality?.toUpperCase().includes(q)
          )
          .slice(0, limit);
      },
      getNearbyAirports: async (lat: number, lon: number, radiusNm: number, limit = 10) => {
        const all = await DatabaseManager.getAll<Airport>("airports");
        const R = 3440.065; // Earth radius in nm

        const withDistance = all.map((a) => {
          const dLat = (a.latitude - lat) * Math.PI / 180;
          const dLon = (a.longitude - lon) * Math.PI / 180;
          const lat1 = lat * Math.PI / 180;
          const lat2 = a.latitude * Math.PI / 180;

          const x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
          const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
          const distance = R * c;

          return { ...a, distance_nm: Math.round(distance) };
        });

        return withDistance
          .filter((a) => a.distance_nm <= radiusNm)
          .sort((a, b) => a.distance_nm - b.distance_nm)
          .slice(0, limit);
      },
      getAirportsInBounds: async (minLat: number, maxLat: number, minLon: number, maxLon: number, type?: string, limit = 5000) => {
        const all = await DatabaseManager.getAll<Airport>("airports");
        let filtered = all.filter((a) =>
          a.latitude >= minLat &&
          a.latitude <= maxLat &&
          a.longitude >= minLon &&
          a.longitude <= maxLon
        );
        if (type) {
          filtered = filtered.filter((a) => a.type === type);
        }
        // Convert to API response format
        return filtered.slice(0, limit).map((a) => ({
          ident: a.ident,
          name: a.name,
          type: a.type,
          latitude_deg: a.latitude,
          longitude_deg: a.longitude,
          elevation_ft: a.elevation,
          municipality: a.municipality,
          iso_country: a.country,
        }));
      },
      // Single-pass query with multiple types (faster than calling getAirportsInBounds per type)
      getAirportsInBoundsByTypes: (minLat: number, maxLat: number, minLon: number, maxLon: number, types: string[], limit = 5000) => {
        const all = DatabaseManager.getAirportsCache();
        const typeSet = new Set(types);
        const results: { ident: string; name: string; type: string; latitude_deg: number; longitude_deg: number }[] = [];
        for (const a of all) {
          if (results.length >= limit) break;
          if (a.latitude >= minLat && a.latitude <= maxLat &&
              a.longitude >= minLon && a.longitude <= maxLon &&
              typeSet.has(a.type)) {
            results.push({ ident: a.ident, name: a.name, type: a.type, latitude_deg: a.latitude, longitude_deg: a.longitude });
          }
        }
        return results;
      },
      getAircraftCatalog: () => DatabaseManager.getAll<AircraftCatalog>("aircraft_catalog"),
      getAircraftType: (id: string) => DatabaseManager.get<AircraftCatalog>("aircraft_catalog", id),
    };
  }

  // ─────────────────────────────────────────────────────────
  // ITEMS CATALOG
  // ─────────────────────────────────────────────────────────

  get items() {
    return {
      getItem: (code: string) => DatabaseManager.getItemByCode(code),
      getAllItems: () => DatabaseManager.getAll("items"),
      getItemsByCategory: (category: string) => DatabaseManager.getItemsByCategory(category),
      getItemsByTier: async (tier: number) => {
        const all = await DatabaseManager.getAll("items");
        return all.filter((i: any) => i.tier === tier);
      },
    };
  }

  // ─────────────────────────────────────────────────────────
  // SEED MISSIONS (ANTI-CHEAT: Server-side XP/money calculation)
  // V3.0: Routes based on GAME MODE (not network status)
  // Solo = always local, Online = always SEED
  // ─────────────────────────────────────────────────────────

  get seedMissions() {
    return {
      /**
       * Create a mission - routes based on game mode
       * SOLO: Local mission (no SEED)
       * ONLINE: SEED calculates base_xp and base_reward server-side
       */
      createMission: async (
        aircraftId: string,
        destinationIcao: string,
        cargo?: { item_id: string; quantity: number }[]
      ): Promise<SeedMission | null> => {
        // V3.0: Check GAME MODE, not network status
        if (isOnlineMode() && NetworkState.isOnline()) {
          // ONLINE MODE: Create on SEED
          return SyncService.createMission(aircraftId, destinationIcao, cargo);
        } else {
          // SOLO MODE or ONLINE but disconnected: Create locally
          const result = await OfflineMissionService.createMissionOffline(aircraftId, destinationIcao);
          if (result.success && result.mission) {
            // Convert to SeedMission format
            return {
              id: result.mission.id,
              player_id: result.mission.player_id || result.mission.user_id || "",
              aircraft_id: result.mission.aircraft_id,
              departure_icao: result.mission.origin_icao,
              destination_icao: result.mission.destination_icao,
              distance_nm: result.mission.distance_nm || result.mission.great_circle_nm || 0,
              base_xp: result.xp_earned || 0,
              base_reward: result.money_earned || 0,
              fuel_at_start: result.mission.block_fuel_gal || 0,
              status: "in_progress",
              created_at: result.mission.created_at,
            };
          }
          return null;
        }
      },

      /**
       * Complete a mission - routes based on game mode
       * SOLO: Local completion (no anti-cheat, player controls XP/money)
       * ONLINE: SEED calculates final XP/money (strict anti-cheat)
       */
      completeMission: async (
        missionId: string,
        flightStats: FlightStats
      ): Promise<MissionCompletionResult | OfflineMissionResult | null> => {
        // V3.0: Check GAME MODE, not network status
        if (isOnlineMode() && NetworkState.isOnline()) {
          // ONLINE MODE: Complete on SEED (server calculates rewards)
          const result = await SyncService.completeMission(missionId, flightStats);
          if (result) {
            // Update local player with SEED values
            const player = await DatabaseManager.getPlayer();
            if (player) {
              player.xp = result.new_xp;
              player.money = result.new_balance;
              await DatabaseManager.savePlayer(player);
            }
          }
          return result;
        } else {
          // SOLO MODE or ONLINE but disconnected: Complete locally
          const result = await OfflineMissionService.completeMissionOffline(missionId, flightStats);
          return result;
        }
      },

      /**
       * Get active mission for an aircraft
       */
      getActiveMission: async (aircraftId: string): Promise<SeedMission | null> => {
        // V3.0: Check GAME MODE, not network status
        if (isOnlineMode() && NetworkState.isOnline()) {
          return SyncService.getActiveMission(aircraftId);
        } else {
          const mission = await OfflineMissionService.getActiveMission(aircraftId);
          if (mission) {
            // Convert to SeedMission format
            return {
              id: mission.id,
              player_id: mission.player_id || mission.user_id || "",
              aircraft_id: mission.aircraft_id,
              departure_icao: mission.origin_icao,
              destination_icao: mission.destination_icao,
              distance_nm: mission.distance_nm || mission.great_circle_nm || 0,
              base_xp: mission.xp_earned || 0,
              base_reward: mission.base_reward || 0,
              fuel_at_start: mission.block_fuel_gal || 0,
              status: mission.status as "in_progress" | "completed" | "failed" | "cancelled",
              created_at: mission.created_at,
            };
          }
          return null;
        }
      },

      /**
       * Check if currently in online mode AND connected
       */
      isOnline: () => isOnlineMode() && NetworkState.isOnline(),
    };
  }

  // ─────────────────────────────────────────────────────────
  // REFUEL
  // V3.0: Solo = local refuel (free), Online = SEED (paid, anti-cheat)
  // ─────────────────────────────────────────────────────────

  get refuel() {
    return {
      /**
       * Refuel aircraft
       * SOLO: Local refuel (no cost, player freedom)
       * ONLINE: SEED calculates cost and deducts from player (anti-cheat)
       */
      refuelAircraft: async (
        aircraftId: string,
        gallonsToAdd: number
      ): Promise<RefuelResult | { success: false; error: string }> => {
        // V3.0: Check GAME MODE
        if (isSoloMode()) {
          // SOLO MODE: Free local refuel (no anti-cheat)
          const aircraft = await DatabaseManager.get("aircraft", aircraftId);
          if (aircraft) {
            const currentFuel = (aircraft as any).fuel_gallons || 0;
            const newFuel = currentFuel + gallonsToAdd;
            (aircraft as any).fuel_gallons = newFuel;
            await DatabaseManager.put("aircraft", aircraft);

            return {
              success: true,
              aircraft_id: aircraftId,
              fuel_added: gallonsToAdd,
              gallons_added: gallonsToAdd,
              new_fuel: newFuel,
              cost: 0, // Free in Solo mode
              new_balance: (await DatabaseManager.getPlayer())?.money || 0,
            };
          }
          return { success: false, error: "Aircraft not found" };
        }

        // ONLINE MODE: Requires connection to SEED
        if (!NetworkState.isOnline()) {
          return {
            success: false,
            error: "OFFLINE_REFUEL_DISABLED",
          };
        }

        // ONLINE: Refuel via SEED (server calculates and deducts cost)
        const result = await SyncService.refuelAircraft(aircraftId, gallonsToAdd);

        if (result) {
          // Update local player balance
          const player = await DatabaseManager.getPlayer();
          if (player) {
            const previousBalance = player.money;
            player.money = result.new_balance;
            await DatabaseManager.savePlayer(player);

            // V4.1: Log transaction (only if cost > 0)
            if (result.cost > 0) {
              const aircraft = await DatabaseManager.get<Aircraft>("aircraft", aircraftId);
              const airportIcao = (aircraft as any)?.location_icao || "";
              await DatabaseManager.saveTransaction({
                timestamp: new Date().toISOString(),
                type: "refuel",
                amount: -result.cost,
                balance_after: result.new_balance,
                wallet: "player",
                description: `Refuel ${(result.gallons_added || result.fuel_added).toFixed(0)} gal`,
                related_id: aircraftId,
                airport_icao: airportIcao,
              });
            }
          }

          // Update local aircraft fuel
          const aircraft = await DatabaseManager.get("aircraft", aircraftId);
          if (aircraft) {
            (aircraft as any).fuel_gallons = result.new_fuel;
            await DatabaseManager.put("aircraft", aircraft);
          }

          return result;
        }

        return { success: false, error: "Refuel failed" };
      },

      /**
       * Check if refuel is available
       * Solo = always available, Online = requires connection
       */
      isAvailable: () => isSoloMode() || NetworkState.isOnline(),
    };
  }

  // ─────────────────────────────────────────────────────────
  // TRUST SCORE (ANTI-CHEAT monitoring - Online mode only)
  // ─────────────────────────────────────────────────────────

  get trustScore() {
    return {
      /**
       * Get player's trust score and flag history
       * V3.0: Only available in Online mode
       */
      getPlayerTrust: async () => {
        // V3.0: Trust score only exists in Online mode
        if (isSoloMode() || !NetworkState.isOnline()) {
          return null;
        }
        return SyncService.getPlayerTrust();
      },
    };
  }

  // ─────────────────────────────────────────────────────────
  // NETWORK STATUS
  // ─────────────────────────────────────────────────────────

  get network() {
    return {
      isOnline: () => NetworkState.isOnline(),
      isOffline: () => NetworkState.isOffline(),
      isSyncing: () => NetworkState.isSyncing(),
      getStatus: () => NetworkState.getStatus(),
      getPendingCount: () => NetworkState.getPendingCount(),
      hasPendingActions: () => NetworkState.hasPendingActions(),
    };
  }

  // ─────────────────────────────────────────────────────────
  // FREE FLIGHT
  // ─────────────────────────────────────────────────────────

  get freeFlight() {
    return {
      startSession: async (aircraftId: string, startAirport: string) => {
        const player = await DatabaseManager.getPlayer();
        if (!player) throw new Error("No player found");

        const session = {
          id: this.generateUUID(),
          player_id: player.id,
          aircraft_id: aircraftId,
          start_airport: startAirport,
          end_airport: null,
          flight_time_minutes: 0,
          distance_nm: 0,
          landings_count: 0,
          xp_earned: 0,
          started_at: new Date().toISOString(),
          ended_at: null,
        };

        await DatabaseManager.put("free_flight_sessions", session);
        console.log(`[ServiceAdapter] Started free flight session ${session.id}`);
        return session;
      },

      getActiveSession: async () => {
        const player = await DatabaseManager.getPlayer();
        if (!player) return null;
        return DatabaseManager.getActiveFreeFlight(player.id);
      },

      updateSession: async (sessionId: string, updates: {
        flight_time_minutes?: number;
        distance_nm?: number;
        landings_count?: number;
        xp_earned?: number;
      }) => {
        const session = await DatabaseManager.get("free_flight_sessions", sessionId);
        if (session) {
          Object.assign(session, updates);
          await DatabaseManager.put("free_flight_sessions", session);
        }
        return session;
      },

      endSession: async (sessionId: string, endAirport: string) => {
        const session = await DatabaseManager.get("free_flight_sessions", sessionId);
        if (session) {
          (session as any).end_airport = endAirport;
          (session as any).ended_at = new Date().toISOString();
          await DatabaseManager.put("free_flight_sessions", session);

          // Award XP - mode-aware logic
          const player = await DatabaseManager.getPlayer();
          if (player && (session as any).xp_earned > 0) {
            if (isSoloMode()) {
              // SOLO: Add XP locally (no anti-cheat)
              player.xp += (session as any).xp_earned;
              await DatabaseManager.savePlayer(player);
            } else if (isOnlineMode()) {
              // ONLINE: XP should come from SEED server
              // TODO [SPEC-FF-XP]: Implement SEED endpoint free-flight-end
              // For now, add locally but mark as pending sync
              console.warn(`[ServiceAdapter] ONLINE mode: Free flight XP added locally (${(session as any).xp_earned} XP) - pending SEED endpoint`);
              player.xp += (session as any).xp_earned;
              await DatabaseManager.savePlayer(player);
              (session as any).pending_sync = true;
              await DatabaseManager.put("free_flight_sessions", session);
            }
          }
        }
        return session;
      },
    };
  }

  // ─────────────────────────────────────────────────────────
  // CONTRACT OPERATIONS (V5)
  // ─────────────────────────────────────────────────────────

  get contracts() {
    return {
      getAvailableContracts: () => localContractService.getAvailableContracts(),
      getActiveContracts: () => localContractService.getActiveContracts(),
      getCompletedContracts: () => localContractService.getCompletedContracts(),
      acceptContract: (offerId: string, wallet: "player" | "company") => localContractService.acceptContract(offerId, wallet),
      completeContract: (contractId: string) => localContractService.completeContract(contractId),
      cancelContract: (contractId: string) => localContractService.cancelContract(contractId),
      refreshContracts: () => localContractService.refreshContracts(),
      generateAIContracts: (playerAirport: string) => localContractService.generateAIContracts(playerAirport),
    };
  }

  // ─────────────────────────────────────────────────────────
  // UTILITIES
  // ─────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────
  // FACTORY OPERATIONS (Phase 9)
  // ─────────────────────────────────────────────────────────

  get factories() {
    return {
      createFactory: async (airportIdent: string, name: string): Promise<Factory> => {
        if (isOnlineMode()) {
          throw new Error("Factories not yet available in Online mode");
        }
        return LocalFactoryService.createFactory(airportIdent, name);
      },

      getMyFactories: async (): Promise<Factory[]> => {
        if (isOnlineMode()) {
          throw new Error("Factories not yet available in Online mode");
        }
        return LocalFactoryService.getMyFactories();
      },

      getFactoriesAtAirport: async (airportIdent: string): Promise<Factory[]> => {
        return LocalFactoryService.getFactoriesAtAirport(airportIdent);
      },

      getRemainingSlots: (airportIdent: string, airportType: string): number => {
        return LocalFactoryService.getRemainingSlots(airportIdent, airportType);
      },

      upgradeFactory: async (factoryId: string): Promise<Factory> => {
        if (isOnlineMode()) {
          throw new Error("Factories not yet available in Online mode");
        }
        return LocalFactoryService.upgradeFactory(factoryId);
      },

      deleteFactory: async (factoryId: string): Promise<void> => {
        if (isOnlineMode()) {
          throw new Error("Factories not yet available in Online mode");
        }
        return LocalFactoryService.deleteFactory(factoryId);
      },

      assignWorker: async (workerId: string, factoryId: string): Promise<void> => {
        if (isOnlineMode()) {
          throw new Error("Factories not yet available in Online mode");
        }
        return LocalFactoryService.assignWorkerToFactory(workerId, factoryId);
      },

      unassignWorker: async (workerId: string): Promise<void> => {
        if (isOnlineMode()) {
          throw new Error("Factories not yet available in Online mode");
        }
        return LocalFactoryService.unassignWorkerFromFactory(workerId);
      },

      depositFood: async (factoryId: string, itemId: string, quantity: number): Promise<void> => {
        if (isOnlineMode()) {
          throw new Error("Factories not yet available in Online mode");
        }
        return LocalFactoryService.depositFood(factoryId, itemId, quantity);
      },

      withdrawFood: async (factoryId: string, itemCode: string, quantity: number): Promise<void> => {
        if (isOnlineMode()) {
          throw new Error("Factories not yet available in Online mode");
        }
        return LocalFactoryService.withdrawFood(factoryId, itemCode, quantity);
      },

      startProduction: async (factoryId: string, recipeId: string, quantity: number) => {
        if (isOnlineMode()) {
          throw new Error("Factories not yet available in Online mode");
        }
        return LocalFactoryService.startProduction(factoryId, recipeId, quantity);
      },

      cancelProduction: async (factoryId: string): Promise<void> => {
        if (isOnlineMode()) {
          throw new Error("Factories not yet available in Online mode");
        }
        return LocalFactoryService.cancelProduction(factoryId);
      },

      cancelUpgrade: async (factoryId: string): Promise<void> => {
        if (isOnlineMode()) {
          throw new Error("Factories not yet available in Online mode");
        }
        return LocalFactoryService.cancelUpgrade(factoryId);
      },
    };
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

export const Services = new ServiceAdapterClass();
