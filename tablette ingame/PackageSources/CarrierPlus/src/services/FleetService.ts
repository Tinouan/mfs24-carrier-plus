/**
 * FleetService - DEPRECATED
 *
 * @deprecated This service is no longer used. P2P mode uses FleetRouter → LocalFleetService.
 * Kept for reference only - will be removed in future cleanup.
 *
 * Use instead: import { FleetRouter } from "./services"
 */

import { api, ENDPOINTS } from "./api";
import type {
  AircraftDetails,
  AircraftListItem,
  HangarAircraftItem,
  AircraftSystemsStatus,
  RepairQuote,
  HangarCargoItem,
  AircraftDetailsResponse,
  AircraftCargoResponse,
} from "../types";

// ═══════════════════════════════════════════════════════════
// RESPONSE TYPES
// ═══════════════════════════════════════════════════════════

interface FleetListResponse {
  id: string;
  registration: string | null;
  aircraft_type: string;
  icao_type: string | null;
  current_airport_ident: string | null;
  status: string;
  required_license: string | null;
  owner_type: string;
}

interface AvailableAircraftResponse {
  id: string;
  registration: string | null;
  aircraft_type: string;
  aircraft_model: string | null;
  cargo_capacity_kg: number;
}

// ═══════════════════════════════════════════════════════════
// FLEET SERVICE CLASS
// ═══════════════════════════════════════════════════════════

class FleetService {
  /**
   * Get all aircraft in the fleet (for hangar display)
   */
  async getFleet(token: string): Promise<HangarAircraftItem[]> {
    const response = await api.get<FleetListResponse[]>(ENDPOINTS.FLEET + "/", token);
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.error || "Failed to fetch fleet");
  }

  /**
   * Get available aircraft at a specific airport
   */
  async getAvailableAtAirport(icao: string, token: string): Promise<AircraftListItem[]> {
    const response = await api.get<AvailableAircraftResponse[]>(
      ENDPOINTS.FLEET_AVAILABLE,
      token,
      { icao }
    );
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.error || "Failed to fetch available aircraft");
  }

  /**
   * Get detailed aircraft information (typed)
   */
  async getAircraftDetails(aircraftId: string, token: string): Promise<AircraftDetails> {
    const response = await api.get<AircraftDetails>(
      ENDPOINTS.FLEET_DETAILS(aircraftId),
      token
    );
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.error || "Failed to fetch aircraft details");
  }

  /**
   * Get detailed aircraft information (raw API response)
   * Use this when you need icao_type, current_cargo_kg, etc.
   */
  async getAircraftDetailsRaw(aircraftId: string, token: string): Promise<AircraftDetailsResponse> {
    const response = await api.get<AircraftDetailsResponse>(
      ENDPOINTS.FLEET_DETAILS(aircraftId),
      token
    );
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.error || "Failed to fetch aircraft details");
  }

  /**
   * Get aircraft by ID (basic info)
   */
  async getAircraft(aircraftId: string, token: string): Promise<AircraftDetails> {
    const response = await api.get<AircraftDetails>(`${ENDPOINTS.FLEET}/${aircraftId}`, token);
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.error || "Failed to fetch aircraft");
  }

  /**
   * Get aircraft systems status
   */
  async getAircraftSystems(aircraftId: string, token: string): Promise<AircraftSystemsStatus> {
    const response = await api.get<AircraftSystemsStatus>(
      ENDPOINTS.FLEET_SYSTEMS(aircraftId),
      token
    );
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.error || "Failed to fetch aircraft systems");
  }

  /**
   * Get aircraft cargo (for hangar display)
   */
  async getAircraftCargo(aircraftId: string, token: string): Promise<HangarCargoItem[]> {
    const response = await api.get<HangarCargoItem[]>(
      ENDPOINTS.FLEET_CARGO(aircraftId),
      token
    );
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.error || "Failed to fetch aircraft cargo");
  }

  /**
   * Get aircraft cargo (raw API response with current_cargo_kg)
   * Use this for mission creation cargo management
   */
  async getAircraftCargoRaw(aircraftId: string, token: string): Promise<AircraftCargoResponse> {
    const response = await api.get<AircraftCargoResponse>(
      ENDPOINTS.FLEET_CARGO(aircraftId),
      token
    );
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.error || "Failed to fetch aircraft cargo");
  }

  /**
   * Load cargo onto aircraft
   */
  async loadCargo(
    aircraftId: string,
    fromLocationId: string,
    itemId: string,
    qty: number,
    token: string
  ): Promise<void> {
    const response = await api.post(
      ENDPOINTS.FLEET_LOAD(aircraftId),
      { from_location_id: fromLocationId, item_id: itemId, qty },
      token
    );
    if (!response.success) {
      throw new Error(response.error || "Failed to load cargo");
    }
  }

  /**
   * Unload cargo from aircraft
   */
  async unloadCargo(
    aircraftId: string,
    toLocationId: string,
    itemId: string,
    qty: number,
    token: string
  ): Promise<void> {
    const response = await api.post(
      ENDPOINTS.FLEET_UNLOAD(aircraftId),
      { to_location_id: toLocationId, item_id: itemId, qty },
      token
    );
    if (!response.success) {
      throw new Error(response.error || "Failed to unload cargo");
    }
  }

  /**
   * Get repair quote for aircraft
   */
  async getRepairQuote(aircraftId: string, token: string): Promise<RepairQuote> {
    const response = await api.get<RepairQuote>(
      ENDPOINTS.FLEET_REPAIR_QUOTE(aircraftId),
      token,
      { systems: "all" }
    );
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.error || "Failed to get repair quote");
  }

  /**
   * Repair aircraft systems
   */
  async repairAircraft(
    aircraftId: string,
    systems: string[],
    payFrom: "player" | "company",
    token: string
  ): Promise<void> {
    const systemsParam = systems.join(",");
    const response = await api.post(
      `${ENDPOINTS.FLEET_REPAIR(aircraftId)}?systems=${systemsParam}&pay_from=${payFrom}`,
      {},
      token
    );
    if (!response.success) {
      throw new Error(response.error || "Failed to repair aircraft");
    }
  }

  /**
   * Update aircraft fuel
   */
  async updateFuel(
    aircraftId: string,
    fuelGallons: number,
    fuelCapacityGallons: number,
    token: string
  ): Promise<void> {
    const response = await api.patch(
      `${ENDPOINTS.FLEET}/${aircraftId}/fuel`,
      null,
      token
    );
    // Note: The API uses query params for fuel updates
    // This might need adjustment based on actual API
    if (!response.success && response.status !== 200) {
      throw new Error(response.error || "Failed to update fuel");
    }
  }

  /**
   * Sync fuel from simulator
   */
  async syncFuel(
    aircraftId: string,
    fuelGallons: number,
    fuelCapacityGallons: number,
    token: string
  ): Promise<AircraftDetails> {
    const response = await api.request<AircraftDetails>(
      `${ENDPOINTS.FLEET}/${aircraftId}/fuel?fuel_gallons=${fuelGallons}&fuel_capacity_gallons=${fuelCapacityGallons}`,
      { method: "PATCH", token }
    );
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.error || "Failed to sync fuel");
  }

  /**
   * Apply background wear to aircraft
   */
  async applyBackgroundWear(
    aircraftId: string,
    flightTimeMinutes: number,
    avgAltitude: number,
    avgSpeed: number,
    token: string
  ): Promise<void> {
    const params = new URLSearchParams({
      flight_time_minutes: flightTimeMinutes.toString(),
      avg_altitude: avgAltitude.toString(),
      avg_speed: avgSpeed.toString(),
    });
    const response = await api.post(
      `${ENDPOINTS.FLEET_BACKGROUND_WEAR(aircraftId)}?${params.toString()}`,
      {},
      token
    );
    if (!response.success) {
      throw new Error(response.error || "Failed to apply background wear");
    }
  }

  /**
   * Update aircraft registration
   */
  async updateRegistration(
    aircraftId: string,
    registration: string,
    token: string
  ): Promise<AircraftDetails> {
    const response = await api.patch<AircraftDetails>(
      `${ENDPOINTS.FLEET}/${aircraftId}`,
      { registration },
      token
    );
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.error || "Failed to update registration");
  }
}

// ═══════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════

export const fleetService = new FleetService();
