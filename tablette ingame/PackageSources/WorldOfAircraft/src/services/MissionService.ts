/**
 * MissionService - DEPRECATED
 *
 * @deprecated This service is no longer used. P2P mode uses MissionRouter → LocalMissionService.
 * Kept for type definitions only - will be removed in future cleanup.
 *
 * Use instead: import { MissionRouter } from "./services"
 */

import { api, ENDPOINTS } from "./api";
import type { ActiveMissionResponse, MissionRecapData, MissionCheckpoint } from "../types";

// ═══════════════════════════════════════════════════════════
// REQUEST/RESPONSE TYPES
// ═══════════════════════════════════════════════════════════

export interface CreateMissionRequest {
  aircraft_id: string;
  origin_icao: string;
  destination_icao: string;
  cargo_weight_kg?: number;
  distance_nm?: number;
  modifiers?: string[];
}

export interface CreateMissionV1Request {
  aircraft_id: string;
  origin_icao: string;
  destination_icao: string;
  cargo_weight_kg: number;
  modifiers: string[];
  checkpoints: Array<{
    sequence: number;
    latitude: number;
    longitude: number;
    radius_nm: number;
    type: string;
    phase_after?: string;
  }>;
}

export interface MissionResponse {
  id: string;
  origin_icao: string;
  destination_icao: string;
  aircraft_type: string;
  status: string;
  cargo_weight_kg?: number;
  distance_nm?: number;
  checkpoints?: MissionCheckpoint[];
  created_at?: string;
  waypoints_total?: number;
  xp_estimate?: {
    base: number;
    with_cargo: number;
    with_modifiers_max: number;
    potential_grade_s: number;
    potential_grade_a: number;
    cargo_multiplier: number;
    modifiers_multiplier: number;
  };
}

export interface CheckpointValidateRequest {
  latitude: number;
  longitude: number;
  altitude_ft: number;
  groundspeed_kts: number;
}

export interface CompleteMissionRequest {
  landing_fpm: number;
  max_gforce: number;
  final_icao: string;
  flight_time_seconds: number;
  fuel_used_kg: number;
  distance_flown_nm: number;
  real_time_ratio: number;
  tracking_data?: {
    avg_altitude_ft: number;
    avg_speed_kts: number;
    max_altitude_ft: number;
    max_speed_kts: number;
    overspeed_count: number;
    stall_count: number;
  };
}

export interface CompleteMissionV1Request extends CompleteMissionRequest {
  cargo_actual_kg: number;
  cargo_expected_kg: number;
  modifiers_validated: string[];
  modifiers_failed: string[];
}

// ═══════════════════════════════════════════════════════════
// MISSION SERVICE CLASS
// ═══════════════════════════════════════════════════════════

class MissionService {
  /**
   * Get active mission for current user (full response with checkpoints)
   */
  async getActiveMission(token: string): Promise<ActiveMissionResponse | null> {
    const response = await api.get<ActiveMissionResponse>(ENDPOINTS.MISSION_ACTIVE, token);
    if (response.success && response.data) {
      return response.data;
    }
    if (response.status === 404) {
      return null; // No active mission
    }
    throw new Error(response.error || "Failed to fetch active mission");
  }

  /**
   * Create a new mission (legacy)
   */
  async createMission(data: CreateMissionRequest, token: string): Promise<MissionResponse> {
    const response = await api.post<MissionResponse>(ENDPOINTS.MISSIONS, data, token);
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.error || "Failed to create mission");
  }

  /**
   * Create a new mission V1 (with checkpoints)
   */
  async createMissionV1(data: CreateMissionV1Request, token: string): Promise<MissionResponse> {
    const response = await api.post<MissionResponse>(`${ENDPOINTS.MISSIONS}/v1`, data, token);
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.error || "Failed to create mission");
  }

  /**
   * Validate a checkpoint
   */
  async validateCheckpoint(
    missionId: string,
    data: CheckpointValidateRequest,
    token: string
  ): Promise<{ validated: boolean; checkpoint_index?: number }> {
    const response = await api.post<{ validated: boolean; checkpoint_index?: number }>(
      ENDPOINTS.MISSION_CHECKPOINT(missionId),
      data,
      token
    );
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.error || "Failed to validate checkpoint");
  }

  /**
   * Complete a mission (legacy)
   */
  async completeMission(
    missionId: string,
    data: CompleteMissionRequest,
    token: string
  ): Promise<MissionRecapData> {
    const response = await api.post<MissionRecapData>(
      ENDPOINTS.MISSION_COMPLETE(missionId),
      data,
      token
    );
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.error || "Failed to complete mission");
  }

  /**
   * Complete a mission V1 (with modifiers)
   */
  async completeMissionV1(
    missionId: string,
    data: CompleteMissionV1Request,
    token: string
  ): Promise<MissionRecapData> {
    const response = await api.post<MissionRecapData>(
      `${ENDPOINTS.MISSIONS}/${missionId}/complete-v1`,
      data,
      token
    );
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.error || "Failed to complete mission");
  }

  /**
   * Fail/cancel a mission
   */
  async failMission(missionId: string, token: string): Promise<void> {
    const response = await api.post(ENDPOINTS.MISSION_FAIL(missionId), {}, token);
    if (!response.success) {
      throw new Error(response.error || "Failed to cancel mission");
    }
  }

  /**
   * Get mission history
   */
  async getMissionHistory(token: string, limit: number = 20): Promise<MissionResponse[]> {
    const response = await api.get<MissionResponse[]>(
      ENDPOINTS.MISSIONS,
      token,
      { limit, status: "completed" }
    );
    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(response.error || "Failed to fetch mission history");
  }
}

// ═══════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════

export const missionService = new MissionService();
