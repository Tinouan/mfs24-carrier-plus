/**
 * LocalMissionService - Mission management for P2P local mode
 * Uses DatabaseManager instead of API calls
 */

import { DatabaseManager } from "../managers/DatabaseManager";
import type { Mission, Aircraft, AircraftCatalog, Item } from "../managers/DatabaseManager";
import type { ActiveMissionResponse, MissionRecapData, MissionCheckpoint } from "../types";
import { localFleetService } from "./LocalFleetService";

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

// Extended mission with checkpoints stored locally
interface LocalMission extends Mission {
  checkpoints?: MissionCheckpoint[];
  modifiers?: string[];
  aircraft_type?: string;
}

// ═══════════════════════════════════════════════════════════
// LOCAL MISSION SERVICE CLASS
// ═══════════════════════════════════════════════════════════

class LocalMissionServiceClass {
  /**
   * Get active mission for current user
   */
  async getActiveMission(): Promise<ActiveMissionResponse | null> {
    const player = await DatabaseManager.getPlayer();
    if (!player) return null;

    const mission = await DatabaseManager.getActiveMission(player.id) as LocalMission | undefined;
    if (!mission) return null;

    return {
      id: mission.id,
      origin_icao: mission.origin_icao,
      destination_icao: mission.destination_icao,
      aircraft_type: mission.aircraft_type || "Unknown",
      status: mission.status,
      cargo_weight_kg: mission.cargo_kg,
      distance_nm: mission.distance_nm,
      checkpoints: mission.checkpoints,
      checkpoints_total: mission.checkpoints?.length || 0,
      created_at: mission.created_at,
    };
  }

  /**
   * Create a new mission (legacy format)
   */
  async createMission(data: CreateMissionRequest): Promise<MissionResponse> {
    const player = await DatabaseManager.getPlayer();
    if (!player) throw new Error("No player found");

    // Check for existing active mission
    const existingMission = await DatabaseManager.getActiveMission(player.id);
    if (existingMission) {
      throw new Error("Already have an active mission");
    }

    // Get aircraft info
    const aircraft = await DatabaseManager.get<Aircraft>("aircraft", data.aircraft_id);
    if (!aircraft) throw new Error("Aircraft not found");

    // Check aircraft systems - ensure aircraft can fly
    const systemsCheck = await this.checkAircraftCanFly(aircraft);
    if (!systemsCheck.canFly) {
      throw new Error(`Aircraft cannot fly: ${systemsCheck.reason}`);
    }

    const catalog = await DatabaseManager.getAll<AircraftCatalog>("aircraft_catalog");
    const catEntry = catalog.find((c) => c.icaoType === aircraft.type_code || c.id === aircraft.type_code);

    const missionId = this.generateUUID();
    const now = new Date().toISOString();

    const mission: LocalMission = {
      id: missionId,
      player_id: player.id,
      aircraft_id: data.aircraft_id,
      origin_icao: data.origin_icao,
      destination_icao: data.destination_icao,
      status: "in_progress",
      cargo_kg: data.cargo_weight_kg || 0,
      distance_nm: data.distance_nm || 0,
      xp_earned: 0,
      score_total: null,
      grade: null,
      created_at: now,
      completed_at: null,
      aircraft_type: catEntry?.name || aircraft.type_code,
      modifiers: data.modifiers,
    };

    await DatabaseManager.put("missions", mission);
    console.log(`[LocalMissionService] Created mission ${missionId}: ${data.origin_icao} -> ${data.destination_icao}`);

    // Calculate XP estimate
    const distanceNm = data.distance_nm || 0;
    const baseXP = Math.floor(distanceNm * 2); // 2 XP per nm
    const cargoMultiplier = (data.cargo_weight_kg || 0) > 0 ? 1.5 : 1;
    const modifiersMultiplier = 1.3; // Max with all modifiers

    const xpEstimate = {
      base: baseXP,
      with_cargo: Math.floor(baseXP * cargoMultiplier),
      with_modifiers_max: Math.floor(baseXP * cargoMultiplier * modifiersMultiplier),
      potential_grade_s: Math.floor(baseXP * cargoMultiplier * modifiersMultiplier * 1.15), // Grade S = 115%
      potential_grade_a: Math.floor(baseXP * cargoMultiplier * modifiersMultiplier * 1.0),  // Grade A = 100%
      cargo_multiplier: cargoMultiplier,
      modifiers_multiplier: modifiersMultiplier,
    };

    return {
      id: missionId,
      origin_icao: data.origin_icao,
      destination_icao: data.destination_icao,
      aircraft_type: mission.aircraft_type || "Unknown",
      status: "in_progress",
      cargo_weight_kg: data.cargo_weight_kg,
      distance_nm: data.distance_nm,
      created_at: now,
      xp_estimate: xpEstimate,
    };
  }

  /**
   * Create a new mission V1 (with checkpoints)
   */
  async createMissionV1(data: CreateMissionV1Request): Promise<MissionResponse> {
    const player = await DatabaseManager.getPlayer();
    if (!player) throw new Error("No player found");

    // Check for existing active mission
    const existingMission = await DatabaseManager.getActiveMission(player.id);
    if (existingMission) {
      throw new Error("Already have an active mission");
    }

    // Get aircraft info
    const aircraft = await DatabaseManager.get<Aircraft>("aircraft", data.aircraft_id);
    if (!aircraft) throw new Error("Aircraft not found");

    // Check aircraft systems - ensure aircraft can fly
    const systemsCheck = await this.checkAircraftCanFly(aircraft);
    if (!systemsCheck.canFly) {
      throw new Error(`Aircraft cannot fly: ${systemsCheck.reason}`);
    }

    const catalog = await DatabaseManager.getAll<AircraftCatalog>("aircraft_catalog");
    const catEntry = catalog.find((c) => c.icaoType === aircraft.type_code || c.id === aircraft.type_code);

    const missionId = this.generateUUID();
    const now = new Date().toISOString();

    // Convert checkpoints to MissionCheckpoint format
    const checkpoints: MissionCheckpoint[] = data.checkpoints.map((cp) => ({
      sequence: cp.sequence,
      latitude: cp.latitude,
      longitude: cp.longitude,
      radius_nm: cp.radius_nm,
      type: cp.type,
      phase_after: cp.phase_after,
      validated: false,
      validated_at: null,
    }));

    // Calculate distance from checkpoints
    let distance = 0;
    for (let i = 1; i < checkpoints.length; i++) {
      distance += this.calculateDistance(
        checkpoints[i - 1].latitude,
        checkpoints[i - 1].longitude,
        checkpoints[i].latitude,
        checkpoints[i].longitude
      );
    }

    const mission: LocalMission = {
      id: missionId,
      player_id: player.id,
      aircraft_id: data.aircraft_id,
      origin_icao: data.origin_icao,
      destination_icao: data.destination_icao,
      status: "in_progress",
      cargo_kg: data.cargo_weight_kg,
      distance_nm: Math.round(distance),
      xp_earned: 0,
      score_total: null,
      grade: null,
      created_at: now,
      completed_at: null,
      aircraft_type: catEntry?.name || aircraft.type_code,
      checkpoints,
      modifiers: data.modifiers,
    };

    await DatabaseManager.put("missions", mission);
    console.log(`[LocalMissionService] Created V1 mission ${missionId} with ${checkpoints.length} checkpoints`);

    // Calculate XP estimate
    const distanceNm = Math.round(distance);
    const baseXP = Math.floor(distanceNm * 2); // 2 XP per nm
    const cargoMultiplier = (data.cargo_weight_kg || 0) > 0 ? 1.5 : 1;
    const modifiersCount = data.modifiers?.length || 0;
    const modifiersMultiplier = 1 + modifiersCount * 0.1; // 10% per modifier

    const xpEstimate = {
      base: baseXP,
      with_cargo: Math.floor(baseXP * cargoMultiplier),
      with_modifiers_max: Math.floor(baseXP * cargoMultiplier * modifiersMultiplier),
      potential_grade_s: Math.floor(baseXP * cargoMultiplier * modifiersMultiplier * 1.15), // Grade S = 115%
      potential_grade_a: Math.floor(baseXP * cargoMultiplier * modifiersMultiplier * 1.0),  // Grade A = 100%
      cargo_multiplier: cargoMultiplier,
      modifiers_multiplier: modifiersMultiplier,
    };

    return {
      id: missionId,
      origin_icao: data.origin_icao,
      destination_icao: data.destination_icao,
      aircraft_type: mission.aircraft_type || "Unknown",
      status: "in_progress",
      cargo_weight_kg: data.cargo_weight_kg,
      distance_nm: distanceNm,
      checkpoints,
      created_at: now,
      xp_estimate: xpEstimate,
    };
  }

  /**
   * Validate a checkpoint
   */
  async validateCheckpoint(
    missionId: string,
    data: CheckpointValidateRequest
  ): Promise<{ validated: boolean; checkpoint_index?: number }> {
    const mission = await DatabaseManager.get<LocalMission>("missions", missionId);
    if (!mission) throw new Error("Mission not found");
    if (!mission.checkpoints) return { validated: false };

    // Find next unvalidated checkpoint
    const nextCpIndex = mission.checkpoints.findIndex((cp) => !cp.validated);
    if (nextCpIndex === -1) return { validated: false };

    const checkpoint = mission.checkpoints[nextCpIndex];

    // Check if within radius
    const distance = this.calculateDistance(
      data.latitude,
      data.longitude,
      checkpoint.latitude,
      checkpoint.longitude
    );

    if (distance <= checkpoint.radius_nm) {
      // Validate checkpoint
      checkpoint.validated = true;
      checkpoint.validated_at = new Date().toISOString();
      await DatabaseManager.put("missions", mission);

      console.log(`[LocalMissionService] Validated checkpoint ${nextCpIndex + 1}/${mission.checkpoints.length}`);
      return { validated: true, checkpoint_index: nextCpIndex };
    }

    return { validated: false };
  }

  /**
   * Complete a mission
   */
  async completeMission(missionId: string, data: CompleteMissionRequest): Promise<MissionRecapData> {
    const mission = await DatabaseManager.get<LocalMission>("missions", missionId);
    if (!mission) throw new Error("Mission not found");

    const player = await DatabaseManager.getPlayer();
    if (!player) throw new Error("No player found");

    // Calculate scores
    const scores = this.calculateScores(mission, data);

    // Determine grade
    const grade = this.calculateGrade(scores.total);

    // Calculate XP
    const xpEarned = this.calculateXP(mission, scores, grade, data.real_time_ratio);

    // Update mission
    mission.status = data.final_icao === mission.destination_icao ? "completed" : "completed";
    mission.score_total = scores.total;
    mission.grade = grade;
    mission.xp_earned = xpEarned;
    mission.completed_at = new Date().toISOString();

    await DatabaseManager.put("missions", mission);

    // Update player XP
    player.xp += xpEarned;

    // Calculate and award money reward
    const moneyEarned = this.calculateMoneyReward(mission, grade);
    if (moneyEarned > 0) {
      player.money += moneyEarned;
      console.log(`[LocalMissionService] Awarded ${moneyEarned} CR`);
    }

    await DatabaseManager.savePlayer(player);

    // V2.0: Update pilot career stats
    const careerStats = await DatabaseManager.getOrCreatePilotCareerStats(player.id);
    careerStats.total_missions += 1;
    careerStats.completed_missions += 1;
    careerStats.total_flight_time_minutes += Math.round(data.flight_time_seconds / 60);
    careerStats.total_distance_nm += mission.distance_nm ?? 0;
    careerStats.total_landings += 1;
    // Update average grade (weighted average)
    if (careerStats.completed_missions === 1) {
      careerStats.average_grade = grade;
    } else {
      // Keep track of best grade seen
      const gradeOrder = ["S", "A", "B", "C", "D", "F"];
      const currentGradeIndex = gradeOrder.indexOf(careerStats.average_grade || "F");
      const newGradeIndex = gradeOrder.indexOf(grade);
      if (newGradeIndex < currentGradeIndex) {
        careerStats.average_grade = grade; // Better grade
      }
    }
    await DatabaseManager.savePilotCareerStats(careerStats);
    console.log(`[LocalMissionService] Updated career stats: ${careerStats.total_missions} missions, ${careerStats.total_flight_time_minutes}min total`);

    // Aircraft location NOT updated here — handled by PositionService.onSuccessfulLanding() in MissionController

    // Apply landing damage based on FPM
    const landingDamage = await localFleetService.applyLandingDamage(
      mission.aircraft_id,
      data.landing_fpm,
      missionId
    );

    if (landingDamage.damaged) {
      console.log(`[LocalMissionService] Landing damage applied: ${landingDamage.systemsAffected.join(", ")}`);
    }

    console.log(`[LocalMissionService] Completed mission ${missionId}: Grade ${grade}, XP +${xpEarned}`);

    return {
      origin_icao: mission.origin_icao,
      destination_icao: mission.destination_icao,
      final_icao: data.final_icao,
      distance_nm: mission.distance_nm ?? 0,
      score_landing: scores.landing,
      score_gforce: scores.gforce,
      score_destination: scores.destination,
      score_time: scores.time,
      score_fuel: scores.fuel,
      score_total: scores.total,
      grade,
      xp_earned: xpEarned,
      money_earned: moneyEarned,
      cheated: false,
      cheat_penalty_percent: 0,
      landing_fpm: data.landing_fpm,
      max_gforce: data.max_gforce,
      flight_time_minutes: Math.round(data.flight_time_seconds / 60),
    };
  }

  /**
   * Complete a mission V1 (with modifiers)
   */
  async completeMissionV1(missionId: string, data: CompleteMissionV1Request): Promise<MissionRecapData> {
    const result = await this.completeMission(missionId, data);

    // Add modifier info to result
    result.modifiers_validated = data.modifiers_validated;
    result.modifiers_failed = data.modifiers_failed;

    // Recalculate XP with modifiers bonus
    const modifierBonus = data.modifiers_validated.length * 50;
    result.xp_earned += modifierBonus;

    // Update player XP with bonus
    const player = await DatabaseManager.getPlayer();
    if (player) {
      player.xp += modifierBonus;
      await DatabaseManager.savePlayer(player);
    }

    result.xp_breakdown = {
      base_xp: result.xp_earned - modifierBonus,
      cargo_multiplier: data.cargo_actual_kg > 0 ? 1.5 : 1,
      modifiers_bonus: modifierBonus,
      real_time_bonus: 0,
      real_time_ratio: data.real_time_ratio,
      modifiers_multiplier: 1 + data.modifiers_validated.length * 0.1,
      grade_multiplier: this.getGradeMultiplier(result.grade),
      total_xp: result.xp_earned,
    };

    return result;
  }

  /**
   * Fail/cancel a mission
   */
  async failMission(missionId: string): Promise<void> {
    const mission = await DatabaseManager.get<Mission>("missions", missionId);
    if (!mission) throw new Error("Mission not found");

    mission.status = "failed";
    mission.completed_at = new Date().toISOString();

    await DatabaseManager.put("missions", mission);
    console.log(`[LocalMissionService] Failed/cancelled mission ${missionId}`);
  }

  /**
   * Get mission history
   */
  async getMissionHistory(limit: number = 20): Promise<MissionResponse[]> {
    const player = await DatabaseManager.getPlayer();
    if (!player) return [];

    const allMissions = await DatabaseManager.query<LocalMission>("missions", "player_id", player.id);
    const completedMissions = allMissions
      .filter((m) => m.status === "completed" || m.status === "failed")
      .sort((a, b) => new Date(b.completed_at || b.created_at).getTime() - new Date(a.completed_at || a.created_at).getTime())
      .slice(0, limit);

    return completedMissions.map((m) => ({
      id: m.id,
      origin_icao: m.origin_icao,
      destination_icao: m.destination_icao,
      aircraft_type: m.aircraft_type || "Unknown",
      status: m.status,
      cargo_weight_kg: m.cargo_kg,
      distance_nm: m.distance_nm,
      checkpoints: m.checkpoints,
      created_at: m.created_at,
    }));
  }

  // ─────────────────────────────────────────────────────────
  // SCORING HELPERS
  // ─────────────────────────────────────────────────────────

  private calculateScores(
    mission: LocalMission,
    data: CompleteMissionRequest
  ): { landing: number; gforce: number; destination: number; time: number; fuel: number; total: number } {
    // Landing score (0-100 based on FPM)
    let landing = 100;
    const fpm = Math.abs(data.landing_fpm);
    if (fpm > 50) landing -= Math.min(50, (fpm - 50) * 0.5);
    if (fpm > 200) landing -= Math.min(30, (fpm - 200) * 0.3);
    if (fpm > 500) landing = Math.max(0, landing - 20);
    landing = Math.max(0, Math.round(landing));

    // G-force score (0-100)
    let gforce = 100;
    if (data.max_gforce > 1.5) gforce -= (data.max_gforce - 1.5) * 20;
    if (data.max_gforce > 2) gforce -= (data.max_gforce - 2) * 30;
    gforce = Math.max(0, Math.round(gforce));

    // Destination score (100 if correct, 50 if alternate)
    const destination = data.final_icao === mission.destination_icao ? 100 : 50;

    // Time score (based on expected vs actual)
    const expectedMinutes = ((mission.distance_nm ?? 0) / 120) * 60; // Assuming ~120kts average
    const actualMinutes = data.flight_time_seconds / 60;
    const timeRatio = actualMinutes / expectedMinutes;
    let time = 100;
    if (timeRatio > 1.5) time -= (timeRatio - 1.5) * 30;
    if (timeRatio < 0.7) time -= (0.7 - timeRatio) * 30; // Too fast = suspicious
    time = Math.max(0, Math.round(time));

    // Fuel score (simple based on efficiency)
    const fuel = Math.max(0, Math.round(100 - data.fuel_used_kg * 0.01));

    // Total (weighted average)
    const total = Math.round(landing * 0.35 + gforce * 0.15 + destination * 0.25 + time * 0.15 + fuel * 0.1);

    return { landing, gforce, destination, time, fuel, total };
  }

  private calculateGrade(score: number): string {
    if (score >= 95) return "S";
    if (score >= 85) return "A";
    if (score >= 70) return "B";
    if (score >= 55) return "C";
    if (score >= 40) return "D";
    return "F";
  }

  private calculateXP(
    mission: LocalMission,
    scores: { total: number },
    grade: string,
    realTimeRatio: number
  ): number {
    // Base XP from distance
    let xp = Math.round((mission.distance_nm ?? 0) * 2);

    // Cargo bonus
    if (mission.cargo_kg > 0) {
      xp += Math.round(mission.cargo_kg * 0.5);
    }

    // Grade multiplier
    xp = Math.round(xp * this.getGradeMultiplier(grade));

    // Real-time bonus (1:1 simulation time)
    if (realTimeRatio >= 0.95) {
      xp = Math.round(xp * 1.25);
    }

    return xp;
  }

  private getGradeMultiplier(grade: string): number {
    switch (grade) {
      case "S": return 2.0;
      case "A": return 1.5;
      case "B": return 1.2;
      case "C": return 1.0;
      case "D": return 0.8;
      default: return 0.5;
    }
  }

  /**
   * Calculate money reward for a completed mission.
   * Based on distance + cargo weight, scaled by grade.
   */
  private calculateMoneyReward(mission: LocalMission, grade: string): number {
    // Base reward: distance-based
    const distanceNm = mission.distance_nm ?? 0;
    let reward = Math.round(distanceNm * 5); // 5 CR per nm base

    // Cargo bonus (heavier cargo = more money)
    if (mission.cargo_kg > 0) {
      reward += Math.round(mission.cargo_kg * 0.3); // 0.3 CR per kg
    }

    // Grade multiplier
    reward = Math.round(reward * this.getGradeMultiplier(grade));

    // Minimum reward (at least something for completing)
    return Math.max(reward, 50);
  }

  /**
   * Check if aircraft can fly based on systems status
   * Returns { canFly: boolean, reason?: string }
   */
  private async checkAircraftCanFly(aircraft: Aircraft): Promise<{ canFly: boolean; reason?: string }> {
    const systems = (aircraft as any).systems;

    // If no systems data, assume aircraft can fly (legacy data)
    if (!systems) {
      return { canFly: true };
    }

    // Check if using NEW format (engine_condition) or OLD format (engine)
    if (typeof systems.engine_condition === "number") {
      // V2: Check critical systems (engine, landing_gear, tires, fuel_system)
      const criticalSystemNames = ["engine", "landing_gear", "tires", "fuel_system"];
      const failedSystems: string[] = [];

      for (const sysName of criticalSystemNames) {
        const condition = systems[`${sysName}_condition`] ?? 100;
        const failed = systems[`${sysName}_failed`] ?? false;
        if (failed) {
          failedSystems.push(`${sysName} (FAILED)`);
        } else if (condition < 10) {
          failedSystems.push(`${sysName} (${Math.round(condition)}% - Critical)`);
        }
      }

      if (failedSystems.length > 0) {
        return {
          canFly: false,
          reason: `Critical systems: ${failedSystems.join(", ")}. Repair required.`,
        };
      }

      // Warn about degraded systems but allow flight
      const degradedSystems = [
        { name: "Electrical", condition: systems.electrical_condition },
        { name: "Avionics", condition: systems.avionics_condition },
        { name: "Oil", condition: systems.oil_condition ?? 100 },
      ].filter((s) => s.condition < 30);

      if (degradedSystems.length > 0) {
        console.log(`[LocalMissionService] Warning: Degraded systems: ${degradedSystems.map((s) => s.name).join(", ")}`);
      }

      return { canFly: true };
    } else {
      // OLD format: check for "failed" status
      const criticalSystems = ["engine", "propeller", "landing_gear"];
      const failedSystems: string[] = [];

      for (const sys of criticalSystems) {
        if (systems[sys] === "failed") {
          failedSystems.push(sys.replace("_", " "));
        }
      }

      if (failedSystems.length > 0) {
        return {
          canFly: false,
          reason: `Failed systems: ${failedSystems.join(", ")}. Repair required.`,
        };
      }

      return { canFly: true };
    }
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3440.065; // Earth radius in nautical miles
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

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

export const localMissionService = new LocalMissionServiceClass();
