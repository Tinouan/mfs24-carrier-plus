/**
 * ServiceAdapter - Unified service layer for P2P local mode
 * Provides a clean API that automatically uses local services
 * This replaces the need for auth tokens in all service calls
 */

import { localFleetService } from "./LocalFleetService";
import { localMissionService } from "./LocalMissionService";
import { localMarketService } from "./LocalMarketService";
import { DatabaseManager } from "../managers/DatabaseManager";
import type { Airport, AircraftCatalog } from "../managers/DatabaseManager";

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
  // FLEET OPERATIONS
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
      syncFuel: (aircraftId: string, fuelGallons: number, fuelCapacityGallons: number) =>
        localFleetService.syncFuel(aircraftId, fuelGallons, fuelCapacityGallons),
      applyBackgroundWear: (aircraftId: string, flightTimeMinutes: number, avgAltitude: number, avgSpeed: number) =>
        localFleetService.applyBackgroundWear(aircraftId, flightTimeMinutes, avgAltitude, avgSpeed),
      applyLandingDamage: (aircraftId: string, landingFpm: number, missionId?: string) =>
        localFleetService.applyLandingDamage(aircraftId, landingFpm, missionId),
      updateRegistration: (aircraftId: string, registration: string) =>
        localFleetService.updateRegistration(aircraftId, registration),
      updateLocation: (aircraftId: string, icao: string) =>
        localFleetService.updateLocation(aircraftId, icao),
    };
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
  // PLAYER & COMPANY
  // ─────────────────────────────────────────────────────────

  get player() {
    return {
      getPlayer: () => DatabaseManager.getPlayer(),
      updateMoney: async (delta: number) => {
        const player = await DatabaseManager.getPlayer();
        if (player) {
          player.money += delta;
          await DatabaseManager.savePlayer(player);
        }
        return player;
      },
      updateXP: async (delta: number) => {
        const player = await DatabaseManager.getPlayer();
        if (player) {
          player.xp += delta;
          await DatabaseManager.savePlayer(player);
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
        const player = await DatabaseManager.getPlayer();
        if (!player) return null;
        const company = await DatabaseManager.getCompanyByOwner(player.id);
        if (company) {
          company.balance += delta;
          await DatabaseManager.put("company", company);
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
