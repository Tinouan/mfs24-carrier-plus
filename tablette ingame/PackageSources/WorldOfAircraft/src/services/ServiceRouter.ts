/**
 * ServiceRouter - Unified service access for P2P mode
 * All services use local storage - no network/server mode
 */

import { Services } from "./ServiceAdapter";
import type {
  AircraftDetails,
  AircraftListItem,
  HangarAircraftItem,
  AircraftSystemsStatus,
  RepairQuote,
  HangarCargoItem,
  AircraftDetailsResponse,
  AircraftCargoResponse,
  ActiveMissionResponse,
  MissionRecapData,
  MarketListing,
  AirportInventoryItem,
  CompanyData,
  CompanyMember,
  CompanyFleetItem,
  AirportInventoryResponse,
} from "../types";
import type {
  CreateMissionRequest,
  CreateMissionV1Request,
  CompleteMissionRequest,
  CompleteMissionV1Request,
  CheckpointValidateRequest,
  MissionResponse,
} from "./MissionService";

// ═══════════════════════════════════════════════════════════
// FLEET SERVICE ROUTER
// ═══════════════════════════════════════════════════════════

export const FleetRouter = {
  async getFleet(): Promise<HangarAircraftItem[]> {
    return Services.fleet.getFleet();
  },

  async getAvailableAtAirport(icao: string): Promise<AircraftListItem[]> {
    return Services.fleet.getAvailableAtAirport(icao);
  },

  async getAircraftDetails(aircraftId: string): Promise<AircraftDetails> {
    return Services.fleet.getAircraftDetails(aircraftId);
  },

  async getAircraftDetailsRaw(aircraftId: string): Promise<AircraftDetailsResponse> {
    return Services.fleet.getAircraftDetailsRaw(aircraftId);
  },

  async getAircraft(aircraftId: string): Promise<AircraftDetails> {
    return Services.fleet.getAircraft(aircraftId);
  },

  async getAircraftSystems(aircraftId: string): Promise<AircraftSystemsStatus> {
    return Services.fleet.getAircraftSystems(aircraftId);
  },

  async getAircraftCargo(aircraftId: string): Promise<HangarCargoItem[]> {
    return Services.fleet.getAircraftCargo(aircraftId);
  },

  async getAircraftCargoRaw(aircraftId: string): Promise<AircraftCargoResponse> {
    return Services.fleet.getAircraftCargoRaw(aircraftId);
  },

  async loadCargo(aircraftId: string, fromLocationId: string, itemId: string, qty: number): Promise<void> {
    return Services.fleet.loadCargo(aircraftId, fromLocationId, itemId, qty);
  },

  async unloadCargo(aircraftId: string, toLocationId: string, itemId: string, qty: number): Promise<void> {
    return Services.fleet.unloadCargo(aircraftId, toLocationId, itemId, qty);
  },

  async getRepairQuote(aircraftId: string): Promise<RepairQuote> {
    return Services.fleet.getRepairQuote(aircraftId);
  },

  async repairAircraft(aircraftId: string, systems: string[], payFrom: "player" | "company"): Promise<void> {
    return Services.fleet.repairAircraft(aircraftId, systems, payFrom);
  },

  async syncFuel(aircraftId: string, fuelGallons: number, fuelCapacityGallons: number): Promise<AircraftDetails> {
    return Services.fleet.syncFuel(aircraftId, fuelGallons, fuelCapacityGallons);
  },

  async applyBackgroundWear(aircraftId: string, flightTimeMinutes: number, avgAltitude: number, avgSpeed: number): Promise<void> {
    return Services.fleet.applyBackgroundWear(aircraftId, flightTimeMinutes, avgAltitude, avgSpeed);
  },

  async applyLandingDamage(aircraftId: string, landingFpm: number, missionId?: string): Promise<{ damaged: boolean; systemsAffected: string[] }> {
    return Services.fleet.applyLandingDamage(aircraftId, landingFpm, missionId);
  },

  async updateRegistration(aircraftId: string, registration: string): Promise<AircraftDetails> {
    return Services.fleet.updateRegistration(aircraftId, registration);
  },

  async updateLocation(aircraftId: string, icao: string): Promise<void> {
    return Services.fleet.updateLocation(aircraftId, icao);
  },
};

// ═══════════════════════════════════════════════════════════
// MISSION SERVICE ROUTER
// ═══════════════════════════════════════════════════════════

export const MissionRouter = {
  async getActiveMission(): Promise<ActiveMissionResponse | null> {
    return Services.missions.getActiveMission();
  },

  async createMission(data: CreateMissionRequest): Promise<MissionResponse> {
    return Services.missions.createMission(data);
  },

  async createMissionV1(data: CreateMissionV1Request): Promise<MissionResponse> {
    return Services.missions.createMissionV1(data);
  },

  async validateCheckpoint(
    missionId: string,
    data: CheckpointValidateRequest
  ): Promise<{ validated: boolean; checkpoint_index?: number }> {
    return Services.missions.validateCheckpoint(missionId, data);
  },

  async completeMission(missionId: string, data: CompleteMissionRequest): Promise<MissionRecapData> {
    return Services.missions.completeMission(missionId, data);
  },

  async completeMissionV1(missionId: string, data: CompleteMissionV1Request): Promise<MissionRecapData> {
    return Services.missions.completeMissionV1(missionId, data);
  },

  async failMission(missionId: string): Promise<void> {
    return Services.missions.failMission(missionId);
  },

  async getMissionHistory(limit?: number): Promise<MissionResponse[]> {
    return Services.missions.getMissionHistory(limit);
  },
};

// ═══════════════════════════════════════════════════════════
// MARKET SERVICE ROUTER
// ═══════════════════════════════════════════════════════════

export const MarketRouter = {
  async getPlayerInventory(): Promise<any[]> {
    return Services.market.getPlayerInventory();
  },

  async getCompanyInventory(): Promise<any[]> {
    return Services.market.getCompanyInventory();
  },

  async getAirportInventory(icao: string): Promise<AirportInventoryItem[]> {
    return Services.market.getAirportInventory(icao);
  },

  async getAirportInventoryRaw(icao: string): Promise<AirportInventoryResponse> {
    return Services.market.getAirportInventoryRaw(icao);
  },

  async getMarketListings(tier?: number | null, limit?: number): Promise<MarketListing[]> {
    return Services.market.getMarketListings(tier, limit);
  },

  async buyItem(locationId: string, itemId: string, qty: number, payFrom: "player" | "company"): Promise<void> {
    return Services.market.buyItem(locationId, itemId, qty, payFrom);
  },

  async getCompanyInfo(): Promise<CompanyData | null> {
    return Services.market.getCompanyInfo();
  },

  async getCompanyMembers(): Promise<CompanyMember[]> {
    return Services.market.getCompanyMembers();
  },

  async getCompanyFleet(): Promise<CompanyFleetItem[]> {
    return Services.market.getCompanyFleet();
  },

  async getPlayerBalance(): Promise<number> {
    return Services.market.getPlayerBalance();
  },

  async getCompanyBalance(): Promise<number> {
    return Services.market.getCompanyBalance();
  },
};

// ═══════════════════════════════════════════════════════════
// WORLD SERVICE ROUTER
// ═══════════════════════════════════════════════════════════

export const WorldRouter = {
  async getAirport(ident: string): Promise<any> {
    return Services.world.getAirport(ident);
  },

  async getAirportByIcao(icao: string): Promise<any> {
    const airport = await Services.world.getAirport(icao);
    if (!airport) return null;
    // Convert to API response format
    return {
      ident: airport.ident,
      name: airport.name,
      type: airport.type,
      latitude_deg: airport.latitude,
      longitude_deg: airport.longitude,
      elevation_ft: airport.elevation,
      municipality: airport.municipality,
      iso_country: airport.country,
    };
  },

  async searchAirports(query: string, limit?: number): Promise<any[]> {
    return Services.world.searchAirports(query, limit);
  },

  async getNearbyAirports(lat: number, lon: number, radiusNm: number, limit?: number): Promise<any[]> {
    return Services.world.getNearbyAirports(lat, lon, radiusNm, limit);
  },

  async getClosestAirport(lat: number, lon: number): Promise<any> {
    const nearby = await Services.world.getNearbyAirports(lat, lon, 100, 1);
    if (nearby.length > 0) {
      const a = nearby[0];
      return {
        ident: a.ident,
        name: a.name,
        type: a.type,
        latitude_deg: a.latitude,
        longitude_deg: a.longitude,
        distance_nm: a.distance_nm,
      };
    }
    return null;
  },

  async getFactoriesAtAirport(_icao: string): Promise<any[]> {
    // No factories in P2P mode
    return [];
  },

  async getAvailableSlots(icao: string): Promise<number> {
    // Get factory slots from airport database
    const airport = await Services.world.getAirport(icao);
    if (airport && airport.factory_slots !== undefined) {
      return airport.factory_slots;
    }
    // Fallback based on type if factory_slots not defined
    if (airport) {
      switch (airport.type) {
        case "large_airport": return 12;
        case "medium_airport": return 6;
        case "small_airport": return 3;
        case "heliport": return 1;
        default: return 0;
      }
    }
    return 0;
  },

  async getAirportsInBounds(
    minLat: number,
    maxLat: number,
    minLon: number,
    maxLon: number,
    type?: string,
    limit?: number
  ): Promise<any[]> {
    return Services.world.getAirportsInBounds(minLat, maxLat, minLon, maxLon, type, limit);
  },

  async getAircraftCatalog(): Promise<any[]> {
    return Services.world.getAircraftCatalog();
  },
};

// ═══════════════════════════════════════════════════════════
// PLAYER & COMPANY ROUTER
// ═══════════════════════════════════════════════════════════

export const PlayerRouter = {
  async getPlayer(): Promise<any> {
    return Services.player.getPlayer();
  },

  async updateMoney(delta: number): Promise<any> {
    return Services.player.updateMoney(delta);
  },

  async updateXP(delta: number): Promise<any> {
    return Services.player.updateXP(delta);
  },
};

export const CompanyRouter = {
  async getCompany(): Promise<any> {
    return Services.company.getCompany();
  },

  async updateBalance(delta: number): Promise<any> {
    return Services.company.updateBalance(delta);
  },
};

// ═══════════════════════════════════════════════════════════
// FREE FLIGHT ROUTER
// ═══════════════════════════════════════════════════════════

export const FreeFlightRouter = {
  async startSession(aircraftId: string, startAirport: string): Promise<any> {
    return Services.freeFlight.startSession(aircraftId, startAirport);
  },

  async getActiveSession(): Promise<any> {
    return Services.freeFlight.getActiveSession();
  },

  async updateSession(sessionId: string, updates: any): Promise<any> {
    return Services.freeFlight.updateSession(sessionId, updates);
  },

  async endSession(sessionId: string, endAirport: string): Promise<any> {
    return Services.freeFlight.endSession(sessionId, endAirport);
  },
};
