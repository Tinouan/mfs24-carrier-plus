/**
 * MarketService - DEPRECATED
 *
 * @deprecated This service is no longer used. P2P mode uses MarketRouter → LocalMarketService.
 * Kept for reference only - will be removed in future cleanup.
 *
 * Use instead: import { MarketRouter } from "./services"
 */

import { api, ENDPOINTS } from "./api";
import type { MarketListing, AirportInventoryItem, CompanyData, CompanyMember, AirportInventoryResponse } from "../types";

// ═══════════════════════════════════════════════════════════
// RESPONSE TYPES
// ═══════════════════════════════════════════════════════════

export interface InventoryItem {
  id: number;
  item_type: string;
  item_name: string;
  quantity: number;
  airport_icao: string;
  weight_kg?: number;
  tier?: number;
}

export interface MarketListingResponse {
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

export interface BuyRequest {
  location_id: string;
  item_id: string;
  qty: number;
  pay_from: "player" | "company";
}

export interface CompanyResponse {
  id: string;
  name: string;
  home_airport_ident: string;
  balance: number;
  created_at: string;
}

// ═══════════════════════════════════════════════════════════
// MARKET SERVICE CLASS
// ═══════════════════════════════════════════════════════════

class MarketService {
  /**
   * Get player inventory
   */
  async getPlayerInventory(token: string): Promise<InventoryItem[]> {
    const response = await api.get<InventoryItem[]>(ENDPOINTS.INVENTORY_PLAYER, token);
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.error || "Failed to fetch player inventory");
  }

  /**
   * Get company inventory
   */
  async getCompanyInventory(token: string): Promise<InventoryItem[]> {
    const response = await api.get<InventoryItem[]>(ENDPOINTS.INVENTORY_COMPANY, token);
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.error || "Failed to fetch company inventory");
  }

  /**
   * Get inventory at specific airport (simplified list)
   */
  async getAirportInventory(icao: string, token: string): Promise<AirportInventoryItem[]> {
    const response = await api.get<AirportInventoryItem[]>(
      ENDPOINTS.INVENTORY_AIRPORT(icao.toUpperCase()),
      token
    );
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.error || "Failed to fetch airport inventory");
  }

  /**
   * Get airport inventory (raw API response with containers structure)
   * Use this for cargo management with location_id tracking
   */
  async getAirportInventoryRaw(icao: string, token: string): Promise<AirportInventoryResponse> {
    const response = await api.get<AirportInventoryResponse>(
      ENDPOINTS.INVENTORY_AIRPORT(icao.toUpperCase()),
      token
    );
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.error || "Failed to fetch airport inventory");
  }

  /**
   * Get market listings
   */
  async getMarketListings(tier?: number | null, limit: number = 100): Promise<MarketListing[]> {
    const params: Record<string, string | number> = { limit };
    if (tier !== null && tier !== undefined) {
      params.tier = tier;
    }
    const response = await api.get<MarketListingResponse[]>(
      `${ENDPOINTS.MARKET}`,
      null,
      params
    );
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.error || "Failed to fetch market listings");
  }

  /**
   * Buy item from market
   */
  async buyItem(
    locationId: string,
    itemId: string,
    qty: number,
    payFrom: "player" | "company",
    token: string
  ): Promise<void> {
    const response = await api.post(
      ENDPOINTS.MARKET_BUY,
      {
        location_id: locationId,
        item_id: itemId,
        qty,
        pay_from: payFrom,
      },
      token
    );
    if (!response.success) {
      throw new Error(response.error || "Failed to buy item");
    }
  }

  /**
   * Get company info
   */
  async getCompanyInfo(token: string): Promise<CompanyData | null> {
    const response = await api.get<CompanyResponse>(`${ENDPOINTS.COMPANY}/me`, token);
    if (response.success && response.data) {
      return response.data;
    }
    if (response.status === 404) {
      return null;
    }
    throw new Error(response.error || "Failed to fetch company info");
  }

  /**
   * Get company members
   */
  async getCompanyMembers(token: string): Promise<CompanyMember[]> {
    const response = await api.get<CompanyMember[]>(ENDPOINTS.COMPANY_MEMBERS, token);
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.error || "Failed to fetch company members");
  }

  /**
   * Get company fleet
   */
  async getCompanyFleet(token: string): Promise<Array<{
    id: string;
    registration: string | null;
    aircraft_type: string;
    current_airport_ident: string | null;
    status: string;
  }>> {
    const response = await api.get(ENDPOINTS.COMPANY_FLEET, token);
    if (response.success && response.data) {
      return response.data as Array<{
        id: string;
        registration: string | null;
        aircraft_type: string;
        current_airport_ident: string | null;
        status: string;
      }>;
    }
    throw new Error(response.error || "Failed to fetch company fleet");
  }
}

// ═══════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════

export const marketService = new MarketService();
