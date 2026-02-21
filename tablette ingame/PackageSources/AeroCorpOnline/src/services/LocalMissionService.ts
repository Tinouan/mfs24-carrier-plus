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
  flight_mode?: 'IFR' | 'VFR';
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
  fuel_remaining_percent?: number;
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
  cargo_fill_percent?: number;
  night_active?: boolean;
  lights_compliance?: number;  // 0.0 to 1.0
  // V4: Anti-cheat flags
  slew_used?: boolean;
  crash_occurred?: boolean;
  unlimited_fuel?: boolean;
  // V5: Suivi vol
  flightpath_compliance?: number; // 0.0 to 1.0
  // V6: Weather
  weather_difficulty?: number; // 0.0 to 1.0
  modifiers_validated: string[];
  modifiers_failed: string[];
}

// Extended mission with checkpoints stored locally
interface LocalMission extends Mission {
  checkpoints?: MissionCheckpoint[];
  modifiers?: string[];
  aircraft_type?: string;
  flight_mode?: 'IFR' | 'VFR';
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
      flight_mode: data.flight_mode || 'IFR',
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

    // Calculate scores (V2: /1000 scale, 4 categories)
    const scores = this.calculateScoresV2(mission, data);

    // Determine grade (V2: /1000 thresholds)
    const grade = this.calculateGradeV2(scores.total);

    // XP uses simple base calculation for completeMission (V1 path uses calculateXPV2)
    const xpEarned = Math.round((mission.distance_nm ?? 0) * 4 * this.getGradeMultiplierV2(grade));

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
      distance_flown_nm: data.distance_flown_nm,
      score_landing: scores.landing,
      score_gforce: scores.gforce,
      score_destination: scores.destination,
      score_distance: scores.distance,
      score_total: scores.total,
      grade,
      xp_earned: xpEarned,
      money_earned: moneyEarned,
      cheated: false,
      cheat_penalty_percent: 0,
      landing_fpm: data.landing_fpm,
      max_gforce: data.max_gforce,
      flight_time_minutes: Math.round(data.flight_time_seconds / 60),
      fuel_remaining_percent: data.fuel_remaining_percent,
    };
  }

  /**
   * Complete a mission V1 (with V2 XP formula)
   */
  async completeMissionV1(missionId: string, data: CompleteMissionV1Request): Promise<MissionRecapData> {
    const result = await this.completeMission(missionId, data);

    // V2: Full XP calculation with new formula
    const xpBreakdown = this.calculateXPV2(
      await DatabaseManager.get<LocalMission>("missions", missionId) as LocalMission,
      result.grade,
      data
    );

    // Recalculate with V2 formula (override the simple calc from completeMission)
    const xpDiff = xpBreakdown.total_xp - result.xp_earned;
    result.xp_earned = xpBreakdown.total_xp;
    result.xp_breakdown = xpBreakdown;
    result.cargo_fill_percent = data.cargo_fill_percent ?? xpBreakdown.cargo_fill_percent;
    result.cargo_weight_kg = data.cargo_actual_kg;

    // Update player XP with the difference
    if (xpDiff !== 0) {
      const player = await DatabaseManager.getPlayer();
      if (player) {
        player.xp += xpDiff;
        await DatabaseManager.savePlayer(player);
      }
    }

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
  // SCORING HELPERS — V2 (/1000, 4 categories)
  // ─────────────────────────────────────────────────────────

  private calculateScoresV2(
    mission: LocalMission,
    data: CompleteMissionRequest
  ): { landing: number; gforce: number; destination: number; distance: number; total: number } {
    // === LANDING (450 pts max) — based on raw VS (negative = descent) ===
    const fpm = data.landing_fpm; // raw value, negative during landing
    let landing: number;
    if (fpm > 0)           landing = 0;    // Bounce
    else if (fpm >= -60)   landing = 450;
    else if (fpm >= -120)  landing = 418;
    else if (fpm >= -180)  landing = 375;
    else if (fpm >= -240)  landing = 315;
    else if (fpm >= -300)  landing = 248;
    else if (fpm >= -400)  landing = 170;
    else if (fpm >= -500)  landing = 90;
    else if (fpm >= -700)  landing = 34;
    else                   landing = 0;

    // === G-FORCE (200 pts max) ===
    const g = data.max_gforce;
    let gforce: number;
    if (g <= 1.3)      gforce = 200;
    else if (g <= 1.5) gforce = 180;
    else if (g <= 1.8) gforce = 150;
    else if (g <= 2.0) gforce = 120;
    else if (g <= 2.5) gforce = 80;
    else if (g <= 3.0) gforce = 40;
    else               gforce = 0;

    // === DESTINATION (250 pts max) ===
    const destination = data.final_icao.toUpperCase() === mission.destination_icao.toUpperCase() ? 250 : 0;

    // === DISTANCE (100 pts max) — bidirectional ratio ===
    const plannedDist = mission.distance_nm ?? 0;
    const actualDist = data.distance_flown_nm || plannedDist;
    const distRatioPct = plannedDist > 0 ? (actualDist / plannedDist) * 100 : 100;
    let distance: number;
    if (distRatioPct >= 95 && distRatioPct <= 105)       distance = 100;
    else if (distRatioPct >= 90 && distRatioPct <= 110)  distance = 80;
    else if (distRatioPct >= 85 && distRatioPct <= 115)  distance = 60;
    else if (distRatioPct >= 80 && distRatioPct <= 120)  distance = 40;
    else                                                  distance = 20;

    const total = landing + gforce + destination + distance;
    return { landing, gforce, destination, distance, total };
  }

  private calculateGradeV2(score: number): string {
    if (score >= 950) return "S";
    if (score >= 850) return "A";
    if (score >= 750) return "B";
    if (score >= 650) return "C";
    if (score >= 500) return "D";
    if (score >= 350) return "E";
    return "F";
  }

  private calculateXPV2(
    mission: LocalMission,
    grade: string,
    data: CompleteMissionV1Request
  ): import("../types").XpBreakdownV2 {
    const distanceNm = mission.distance_nm ?? 0;

    // 1. Base XP: distance * 4
    const base_xp = Math.floor(distanceNm * 4);

    // 2. Cargo multiplier (% fill of cargo hold)
    const maxCargo = data.cargo_expected_kg || 0;
    const actualCargo = data.cargo_actual_kg || 0;
    const cargo_fill_percent = maxCargo > 0 ? Math.round((actualCargo / maxCargo) * 100) : 0;
    let cargo_multiplier: number;
    if (cargo_fill_percent >= 76)      cargo_multiplier = 1.5;
    else if (cargo_fill_percent >= 51) cargo_multiplier = 1.3;
    else if (cargo_fill_percent >= 26) cargo_multiplier = 1.2;
    else if (cargo_fill_percent >= 1)  cargo_multiplier = 1.1;
    else                               cargo_multiplier = 1.0;

    // 3. Night bonus
    const night_bonus = data.night_active ? 0.50 : 0;

    // 4. Fuel bonus (based on remaining fuel %)
    // V4: No fuel bonus if unlimited fuel was detected
    const fuelRemaining = data.fuel_remaining_percent ?? 0;
    let fuel_bonus: number;
    if (data.unlimited_fuel) {
      fuel_bonus = 0;
    } else if (fuelRemaining >= 25)       fuel_bonus = 0.20;
    else if (fuelRemaining >= 20)  fuel_bonus = 0.15;
    else if (fuelRemaining >= 15)  fuel_bonus = 0.10;
    else if (fuelRemaining >= 10)  fuel_bonus = 0.05;
    else                           fuel_bonus = 0;

    // 4b. Lights bonus (based on compliance ratio)
    const lights_compliance = data.lights_compliance ?? 1.0;
    let lights_bonus: number;
    if (lights_compliance >= 1.0)       lights_bonus = 0.15;
    else if (lights_compliance >= 0.90) lights_bonus = 0.10;
    else if (lights_compliance >= 0.75) lights_bonus = 0.05;
    else                                lights_bonus = 0;

    // 4c. Flightpath bonus (suivi de vol compliance)
    const flightpath_compliance = data.flightpath_compliance ?? 0;
    let flightpath_bonus: number;
    if (flightpath_compliance >= 0.95)       flightpath_bonus = 0.20;
    else if (flightpath_compliance >= 0.85)  flightpath_bonus = 0.15;
    else if (flightpath_compliance >= 0.70)  flightpath_bonus = 0.10;
    else if (flightpath_compliance >= 0.50)  flightpath_bonus = 0.05;
    else                                     flightpath_bonus = 0;

    // 4d. Weather difficulty bonus
    const weather_difficulty = data.weather_difficulty ?? 0;
    let weather_bonus: number;
    if (weather_difficulty >= 0.80)      weather_bonus = 0.15;
    else if (weather_difficulty >= 0.60) weather_bonus = 0.10;
    else if (weather_difficulty >= 0.40) weather_bonus = 0.05;
    else if (weather_difficulty >= 0.20) weather_bonus = 0.02;
    else                                weather_bonus = 0;

    const total_additive = 1 + night_bonus + fuel_bonus + lights_bonus + flightpath_bonus + weather_bonus;

    // 5. Sim rate bonus (was "real-time bonus")
    const rtPct = Math.round(data.real_time_ratio * 100);
    let simrate_bonus: number;
    if (rtPct >= 100)      simrate_bonus = 1.00;
    else if (rtPct >= 90)  simrate_bonus = 0.70;
    else if (rtPct >= 75)  simrate_bonus = 0.50;
    else if (rtPct >= 50)  simrate_bonus = 0.30;
    else if (rtPct >= 25)  simrate_bonus = 0.15;
    else                   simrate_bonus = 0;

    // 6. Grade multiplier
    const grade_multiplier = this.getGradeMultiplierV2(grade);

    // V4: Anti-cheat — slew/crash detected = halve XP
    const anticheat_penalty = (data.slew_used || data.crash_occurred) ? 0.5 : 1.0;

    // Formula: XP = base_xp * cargo_mult * (1 + night + fuel + lights + flightpath + weather) * (1 + simrate) * grade_mult * anticheat
    const total_xp = Math.round(
      base_xp * cargo_multiplier * total_additive * (1 + simrate_bonus) * grade_multiplier * anticheat_penalty
    );

    return {
      distance_nm: distanceNm,
      base_xp,
      cargo_fill_percent,
      cargo_multiplier,
      night_bonus,
      fuel_bonus,
      lights_compliance,
      lights_bonus,
      flightpath_compliance,
      flightpath_bonus,
      weather_difficulty,
      weather_bonus,
      total_additive,
      simrate_ratio: rtPct,
      simrate_bonus,
      grade,
      grade_multiplier,
      total_xp,
    };
  }

  private getGradeMultiplierV2(grade: string): number {
    switch (grade) {
      case "S": return 2.0;
      case "A": return 1.5;
      case "B": return 1.2;
      case "C": return 1.0;
      case "D": return 0.7;
      case "E": return 0.5;
      default:  return 0.2; // F
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
    reward = Math.round(reward * this.getGradeMultiplierV2(grade));

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
