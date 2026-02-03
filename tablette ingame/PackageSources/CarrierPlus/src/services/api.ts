/**
 * CarrierPlus API Service - HTTP utilities and API endpoints
 * DEPRECATED: Legacy network API - P2P mode uses local ServiceRouters instead
 * This file is kept for type definitions and potential future network mode
 */

// Legacy API URL - not used in P2P mode
const API_BASE_URL = "http://localhost:8000/api";

// ═══════════════════════════════════════════════════════════
// API ENDPOINTS
// ═══════════════════════════════════════════════════════════
export const ENDPOINTS = {
  // Auth
  LOGIN: "/auth/login",
  REGISTER: "/auth/register",
  ME: "/auth/me",

  // World
  AIRPORTS: "/world/airports",
  AIRPORTS_CLOSEST: "/world/airports/closest",
  FACTORIES: "/world/factories",

  // Fleet
  FLEET: "/fleet",
  FLEET_AVAILABLE: "/fleet/available",
  FLEET_DETAILS: (id: string) => `/fleet/${id}/details`,
  FLEET_SYSTEMS: (id: string) => `/fleet/${id}/systems`,
  FLEET_CARGO: (id: string) => `/fleet/${id}/cargo`,
  FLEET_LOAD: (id: string) => `/fleet/${id}/load`,
  FLEET_UNLOAD: (id: string) => `/fleet/${id}/unload`,
  FLEET_REPAIR: (id: string) => `/fleet/${id}/repair`,
  FLEET_REPAIR_QUOTE: (id: string) => `/fleet/${id}/repair-quote`,
  FLEET_SYNC_FUEL: (id: string) => `/fleet/${id}/sync-fuel`,
  FLEET_BACKGROUND_WEAR: (id: string) => `/fleet/${id}/background-wear`,

  // Missions
  MISSIONS: "/missions",
  MISSION_ACTIVE: "/missions/active",
  MISSION_CREATE: "/missions/create",
  MISSION_START: (id: string) => `/missions/${id}/start`,
  MISSION_COMPLETE: (id: string) => `/missions/${id}/complete`,
  MISSION_FAIL: (id: string) => `/missions/${id}/fail`,
  MISSION_TRACKING: (id: string) => `/missions/${id}/tracking`,
  MISSION_CHECKPOINT: (id: string) => `/missions/${id}/checkpoint`,

  // Inventory
  INVENTORY_PLAYER: "/inventory/player",
  INVENTORY_COMPANY: "/inventory/company",
  INVENTORY_AIRPORT: (icao: string) => `/inventory/airport/${icao}`,

  // Company
  COMPANY: "/company",
  COMPANY_MEMBERS: "/company/members",
  COMPANY_FLEET: "/company/fleet",

  // Market
  MARKET: "/market",
  MARKET_BUY: "/market/buy",
} as const;

// ═══════════════════════════════════════════════════════════
// API RESPONSE TYPES
// ═══════════════════════════════════════════════════════════
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  status: number;
}

export interface ApiError {
  detail: string;
}

// ═══════════════════════════════════════════════════════════
// API CLIENT CLASS
// ═══════════════════════════════════════════════════════════
class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Build headers for API request
   */
  private buildHeaders(token: string | null, contentType: string = "application/json"): HeadersInit {
    const headers: HeadersInit = {
      "Content-Type": contentType,
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }

  /**
   * Generic fetch wrapper with error handling
   */
  async request<T>(
    endpoint: string,
    options: {
      method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      token?: string | null;
      body?: unknown;
      params?: Record<string, string | number | boolean>;
    } = {}
  ): Promise<ApiResponse<T>> {
    const { method = "GET", token = null, body, params } = options;

    // Build URL with query params
    let url = `${this.baseUrl}${endpoint}`;
    if (params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      }
      const queryString = searchParams.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    try {
      const response = await fetch(url, {
        method,
        headers: this.buildHeaders(token),
        body: body ? JSON.stringify(body) : undefined,
      });

      const status = response.status;

      if (!response.ok) {
        let errorMessage = `HTTP ${status}`;
        try {
          const errorData = await response.json() as ApiError;
          errorMessage = errorData.detail || errorMessage;
        } catch {
          // Response wasn't JSON
        }
        return { success: false, error: errorMessage, status };
      }

      // Handle empty responses
      const text = await response.text();
      if (!text) {
        return { success: true, data: undefined, status };
      }

      const data = JSON.parse(text) as T;
      return { success: true, data, status };
    } catch (error) {
      console.error(`[API] Request failed: ${endpoint}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Network error",
        status: 0,
      };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // CONVENIENCE METHODS
  // ═══════════════════════════════════════════════════════════

  async get<T>(endpoint: string, token?: string | null, params?: Record<string, string | number | boolean>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: "GET", token, params });
  }

  async post<T>(endpoint: string, body: unknown, token?: string | null): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: "POST", token, body });
  }

  async put<T>(endpoint: string, body: unknown, token?: string | null): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: "PUT", token, body });
  }

  async patch<T>(endpoint: string, body: unknown, token?: string | null): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: "PATCH", token, body });
  }

  async delete<T>(endpoint: string, token?: string | null): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: "DELETE", token });
  }
}

// ═══════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════
export const api = new ApiClient();

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

/**
 * Build full API URL for an endpoint
 */
export function apiUrl(endpoint: string, params?: Record<string, string | number | boolean>): string {
  let url = `${API_BASE_URL}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }
  return url;
}

/**
 * Build authorization header
 */
export function authHeader(token: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  };
}
