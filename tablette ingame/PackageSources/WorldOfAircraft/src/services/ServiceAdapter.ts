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
import { SyncService, type FlightStats, type SeedMission, type MissionCompletionResult, type RefuelResult } from "./SyncService";
import { OfflineMissionService, type OfflineMissionResult } from "./OfflineMissionService";
import { NetworkState } from "../state/NetworkState";
import { DatabaseManager } from "../managers/DatabaseManager";
import type { Airport, AircraftCatalog } from "../managers/DatabaseManager";
import { isSoloMode, isOnlineMode } from "../state/GameModeState";

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
      getAircraftCargoRaw: (aircraftId: string) => localFleetService.getAircraftCargoRaw(aircraftId),
      loadCargo: (aircraftId: string, fromLocationId: string, itemId: string, qty: number) =>
        localFleetService.loadCargo(aircraftId, fromLocationId, itemId, qty),
      unloadCargo: (aircraftId: string, toLocationId: string, itemId: string, qty: number) =>
        localFleetService.unloadCargo(aircraftId, toLocationId, itemId, qty),
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
          owner_id: aircraft.owner_id,
          registration: aircraft.registration,
          aircraft_type: aircraft.aircraft_type,
          icao_type: aircraft.icao_type,
          current_airport_ident: aircraft.current_airport_ident,
          status: aircraft.status,
          fuel_gallons: aircraft.fuel_gallons,
          fuel_capacity_gallons: aircraft.fuel_capacity_gallons,
          cargo_kg: aircraft.cargo_kg,
          cargo_capacity_kg: aircraft.cargo_capacity_kg,
          condition: aircraft.condition,
          hours: aircraft.hours,
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
  // ─────────────────────────────────────────────────────────

  get market() {
    return {
      getPlayerInventory: () => localMarketService.getPlayerInventory(),
      getCompanyInventory: () => localMarketService.getCompanyInventory(),
      getAirportInventory: (icao: string) => localMarketService.getAirportInventory(icao),
      getAirportInventoryRaw: (icao: string) => localMarketService.getAirportInventoryRaw(icao),
      getMarketListings: (tier?: number | null, limit?: number) => localMarketService.getMarketListings(tier, limit),
      buyItem: (locationId: string, itemId: string, qty: number, payFrom: "player" | "company") =>
        localMarketService.buyItem(locationId, itemId, qty, payFrom),
      sellItem: (icao: string, itemCode: string, qty: number, pricePerUnit: number) =>
        localMarketService.sellItem(icao, itemCode, qty, pricePerUnit),
      getCompanyInfo: () => localMarketService.getCompanyInfo(),
      getCompanyMembers: () => localMarketService.getCompanyMembers(),
      getCompanyFleet: () => localMarketService.getCompanyFleet(),
      getPlayerBalance: () => localMarketService.getPlayerBalance(),
      getCompanyBalance: () => localMarketService.getCompanyBalance(),
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
            player.money = result.new_balance;
            await DatabaseManager.savePlayer(player);
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

          // Award XP
          const player = await DatabaseManager.getPlayer();
          if (player && (session as any).xp_earned > 0) {
            player.xp += (session as any).xp_earned;
            await DatabaseManager.savePlayer(player);
          }
        }
        return session;
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
