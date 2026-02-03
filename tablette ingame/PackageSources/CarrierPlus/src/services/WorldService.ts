/**
 * WorldService - DEPRECATED
 *
 * @deprecated This service is no longer used. P2P mode uses WorldRouter → LocalWorldService.
 * Kept for reference only - will be removed in future cleanup.
 *
 * Use instead: import { WorldRouter } from "./services"
 */

import { api, ENDPOINTS } from "./api";
import type { NearbyAirport, SelectedAirport, FactoryAtAirport } from "../types";

// ═══════════════════════════════════════════════════════════
// RESPONSE TYPES
// ═══════════════════════════════════════════════════════════

export interface AirportResponse {
  ident: string;
  name: string;
  type: string;
  latitude_deg: number;
  longitude_deg: number;
  elevation_ft?: number;
  municipality?: string;
  iso_country?: string;
}

export interface NearbyAirportResponse {
  ident: string;
  name: string;
  type: string;
  latitude_deg: number;
  longitude_deg: number;
  distance_nm: number;
}

export interface ClosestAirportResponse {
  ident: string;
  name: string;
  type: string;
  latitude_deg: number;
  longitude_deg: number;
  distance_nm: number;
}

export interface FactoryResponse {
  id: string;
  name: string;
  airport_ident: string;
  company_id: string;
  product_type: string;
  latitude_deg?: number;
  longitude_deg?: number;
}

export interface AvailableSlotsResponse {
  available_slots: number;
  max_slots: number;
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

// ═══════════════════════════════════════════════════════════
// WORLD SERVICE CLASS
// ═══════════════════════════════════════════════════════════

class WorldService {
  /**
   * Search airports by various criteria
   */
  async searchAirports(params: {
    ident?: string;
    lat?: number;
    lon?: number;
    radius?: number;
    type?: string;
    limit?: number;
    minLat?: number;
    maxLat?: number;
    minLon?: number;
    maxLon?: number;
  }): Promise<AirportResponse[]> {
    const response = await api.get<AirportResponse[]>(ENDPOINTS.AIRPORTS, null, params as Record<string, string | number>);
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.error || "Failed to search airports");
  }

  /**
   * Get airport by ICAO code
   */
  async getAirportByIcao(icao: string): Promise<AirportResponse | null> {
    const airports = await this.searchAirports({ ident: icao, limit: 1 });
    return airports.length > 0 ? airports[0] : null;
  }

  /**
   * Get nearby airports
   */
  async getNearbyAirports(lat: number, lon: number, radius: number = 50, limit: number = 10): Promise<NearbyAirportResponse[]> {
    const response = await api.get<NearbyAirportResponse[]>(
      ENDPOINTS.AIRPORTS,
      null,
      { lat, lon, radius, limit }
    );
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.error || "Failed to fetch nearby airports");
  }

  /**
   * Get closest airport to coordinates
   */
  async getClosestAirport(lat: number, lon: number): Promise<ClosestAirportResponse | null> {
    const response = await api.get<ClosestAirportResponse>(
      ENDPOINTS.AIRPORTS_CLOSEST,
      null,
      { lat, lon }
    );
    if (response.success && response.data) {
      return response.data;
    }
    if (response.status === 404) {
      return null;
    }
    throw new Error(response.error || "Failed to fetch closest airport");
  }

  /**
   * Get airports within bounding box (for map display)
   */
  async getAirportsInBounds(bounds: BoundingBox, type?: string, limit: number = 2000): Promise<AirportResponse[]> {
    const params: Record<string, string | number> = {
      min_lat: bounds.minLat,
      max_lat: bounds.maxLat,
      min_lon: bounds.minLon,
      max_lon: bounds.maxLon,
      limit,
    };
    if (type) {
      params.type = type;
    }
    const response = await api.get<AirportResponse[]>(ENDPOINTS.AIRPORTS, null, params);
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.error || "Failed to fetch airports in bounds");
  }

  /**
   * Get available factory slots at airport
   */
  async getAvailableSlots(icao: string): Promise<number> {
    const response = await api.get<AvailableSlotsResponse>(
      `${ENDPOINTS.AIRPORTS}/${icao}/available-slots`
    );
    if (response.success && response.data) {
      return response.data.available_slots;
    }
    throw new Error(response.error || "Failed to fetch available slots");
  }

  /**
   * Get factories at airport
   */
  async getFactoriesAtAirport(icao: string, token: string): Promise<FactoryAtAirport[]> {
    const response = await api.get<FactoryResponse[]>(
      ENDPOINTS.FACTORIES,
      token,
      { airport_ident: icao }
    );
    if (response.success && response.data) {
      return response.data.map(f => ({ id: f.id, name: f.name }));
    }
    throw new Error(response.error || "Failed to fetch factories");
  }

  /**
   * Get factories within bounding box (for map display)
   */
  async getFactoriesInBounds(bounds: BoundingBox, limit: number = 500): Promise<FactoryResponse[]> {
    const response = await api.get<FactoryResponse[]>(
      `${ENDPOINTS.FACTORIES}`,
      null,
      {
        min_lat: bounds.minLat,
        max_lat: bounds.maxLat,
        min_lon: bounds.minLon,
        max_lon: bounds.maxLon,
        limit,
      }
    );
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.error || "Failed to fetch factories in bounds");
  }

  /**
   * Convert API response to SelectedAirport format
   */
  toSelectedAirport(airport: AirportResponse | NearbyAirportResponse | ClosestAirportResponse): SelectedAirport {
    return {
      icao: airport.ident,
      name: airport.name,
      type: airport.type,
      lat: airport.latitude_deg,
      lon: airport.longitude_deg,
    };
  }

  /**
   * Convert API response to NearbyAirport format
   */
  toNearbyAirport(airport: NearbyAirportResponse): NearbyAirport {
    return {
      icao: airport.ident,
      name: airport.name,
      distance_nm: airport.distance_nm,
    };
  }
}

// ═══════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════

export const worldService = new WorldService();
