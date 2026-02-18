/**
 * OfflineMissionService - Gestion des missions en mode hors ligne
 *
 * Permet de créer et compléter des missions quand le serveur SEED est inaccessible.
 * Les missions sont validées localement avec les mêmes règles que SEED,
 * puis synchronisées automatiquement quand la connexion revient.
 *
 * ANTI-CHEAT: Même validation que SEED pour éviter les abus
 */

import { DatabaseManager, type Aircraft, type Mission, type Airport } from "../managers/DatabaseManager";
import { NetworkState } from "../state/NetworkState";
import type { FlightStats, MissionScore, MissionCompletionResult } from "./SyncService";

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface OfflineMission extends Mission {
  is_offline: boolean;            // Flag pour identifier les missions créées offline
  local_xp_earned?: number;       // XP calculé localement (pour correction SEED)
  local_money_earned?: number;    // Argent calculé localement (pour correction SEED)
  flight_stats?: FlightStats;     // Stats de vol pour sync ultérieure
  final_score?: MissionScore;     // Score calculé localement
}

export interface OfflineMissionResult {
  success: boolean;
  error?: string;
  mission?: OfflineMission;
  score?: MissionScore;
  xp_earned?: number;
  money_earned?: number;
  pending_sync?: boolean;
}

interface ValidationResult {
  valid: boolean;
  reason?: string;
  flags?: string[];
}

// ═══════════════════════════════════════════════════════════
// CONSTANTS (mêmes valeurs que SEED)
// ═══════════════════════════════════════════════════════════

const XP_PER_NM = 2;
const MONEY_PER_NM = 10;
const WEAR_PER_HOUR = 0.5;
const EARTH_RADIUS_NM = 3440.065;

// ═══════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════

class OfflineMissionServiceClass {

  // ═══════════════════════════════════════════════════════════
  // MISSION CREATION (mode offline)
  // ═══════════════════════════════════════════════════════════

  /**
   * Créer une mission en mode offline
   * Calcule localement la distance, l'XP de base et la récompense
   */
  async createMissionOffline(
    aircraftId: string,
    destinationIcao: string
  ): Promise<OfflineMissionResult> {
    try {
      // Charger l'avion
      const aircraft = await DatabaseManager.get<Aircraft>("aircraft", aircraftId);
      if (!aircraft) {
        return { success: false, error: "Aircraft not found" };
      }

      // Vérifier l'état de l'avion
      if (aircraft.condition < 20) {
        return { success: false, error: "Aircraft needs repair before flying" };
      }

      // Vérifier pas de mission active pour cet avion
      const existingMissions = await DatabaseManager.query<Mission>("missions", "aircraft_id", aircraftId);
      const activeMission = existingMissions.find(m => m.status === "in_progress");
      if (activeMission) {
        return { success: false, error: "Aircraft already has an active mission" };
      }

      // Charger les aéroports pour calcul de distance
      const departureIcao = aircraft.location_icao;
      const departure = await this.getAirport(departureIcao);
      const destination = await this.getAirport(destinationIcao);

      if (!departure || !destination) {
        return { success: false, error: "Invalid airport(s)" };
      }

      // Calcul distance (même formule que SEED)
      const distanceNm = this.calculateDistance(
        departure.latitude, departure.longitude,
        destination.latitude, destination.longitude
      );

      // Calcul récompenses de base (même formule que SEED)
      const baseXp = Math.floor(distanceNm * XP_PER_NM);
      const baseReward = Math.floor(distanceNm * MONEY_PER_NM);

      // Créer la mission
      const now = new Date().toISOString();
      const mission: OfflineMission = {
        id: this.generateUUID(),
        user_id: await this.getPlayerId(),
        player_id: await this.getPlayerId(),
        aircraft_id: aircraftId,
        origin_icao: departureIcao,
        destination_icao: destinationIcao,
        status: "in_progress",
        cargo_kg: 0,
        great_circle_nm: Math.round(distanceNm),
        distance_nm: Math.round(distanceNm),
        base_reward: baseReward,
        xp_earned: baseXp,
        block_fuel_gal: aircraft.fuel_gallons,
        created_at: now,
        started_at: now,
        updated_at: now,
        // Flags offline
        is_offline: true,
      };

      // Sauvegarder localement
      await DatabaseManager.put("missions", mission);

      console.log(`[OfflineMission] Created mission ${mission.id}: ${departureIcao} → ${destinationIcao} (${Math.round(distanceNm)}nm)`);

      return {
        success: true,
        mission,
        xp_earned: baseXp,
        money_earned: baseReward,
        pending_sync: true,
      };
    } catch (e) {
      console.error("[OfflineMission] Create failed:", e);
      return { success: false, error: String(e) };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // MISSION COMPLETION (mode offline)
  // ═══════════════════════════════════════════════════════════

  /**
   * Compléter une mission en mode offline
   * Valide les stats de vol et calcule les récompenses localement
   * Ajoute à la queue pour sync ultérieure
   */
  async completeMissionOffline(
    missionId: string,
    flightStats: FlightStats
  ): Promise<OfflineMissionResult> {
    try {
      // Charger la mission
      const mission = await DatabaseManager.get<OfflineMission>("missions", missionId);
      if (!mission) {
        return { success: false, error: "Mission not found" };
      }

      if (mission.status !== "in_progress") {
        return { success: false, error: "Mission not active" };
      }

      // Charger l'avion
      const aircraft = await DatabaseManager.get<Aircraft>("aircraft", mission.aircraft_id);
      if (!aircraft) {
        return { success: false, error: "Aircraft not found" };
      }

      // Charger le joueur
      const player = await DatabaseManager.getPlayer();
      if (!player) {
        return { success: false, error: "Player not found" };
      }

      // VALIDATION (même logique que SEED)
      const validation = this.validateFlightStats(flightStats, aircraft, mission);
      if (!validation.valid) {
        console.warn(`[OfflineMission] Flight validation failed: ${validation.reason}`);
        // On ne bloque pas mais on log les flags
        for (const flag of validation.flags || []) {
          console.warn(`[OfflineMission] ANTI-CHEAT flag: ${flag}`);
        }
      }

      // CALCUL SCORE (même logique que SEED)
      const score = this.calculateMissionScore(flightStats);

      // CALCUL RÉCOMPENSES
      const baseXp = mission.xp_earned || Math.floor((mission.distance_nm || 0) * XP_PER_NM);
      const baseReward = mission.base_reward || Math.floor((mission.distance_nm || 0) * MONEY_PER_NM);
      const xpEarned = Math.floor(baseXp * score.multiplier);
      const moneyEarned = Math.floor(baseReward * score.multiplier);

      // CALCUL USURE
      const flightHours = flightStats.flight_time_minutes / 60;
      let wearPercent = flightHours * WEAR_PER_HOUR;

      // Extra wear for hard landings
      if (flightStats.landing_fpm > 500) {
        wearPercent += 5;
      }
      if (flightStats.overspeed_count > 0) {
        wearPercent += flightStats.overspeed_count * 2;
      }

      // MISE À JOUR AVION
      aircraft.condition = Math.max(0, aircraft.condition - wearPercent);
      aircraft.flight_hours += flightHours;
      aircraft.fuel_gallons = Math.max(0, flightStats.fuel_remaining);
      aircraft.location_icao = flightStats.arrival_icao;
      await DatabaseManager.put("aircraft", aircraft);

      // MISE À JOUR JOUEUR
      player.xp += xpEarned;
      player.money += moneyEarned;
      player.updated_at = new Date().toISOString();
      await DatabaseManager.savePlayer(player);

      // V4.1: Log transaction
      if (moneyEarned > 0) {
        await DatabaseManager.saveTransaction({
          timestamp: new Date().toISOString(),
          type: "mission_reward",
          amount: moneyEarned,
          balance_after: player.money,
          wallet: "player",
          description: `Mission ${mission.origin_icao} > ${flightStats.arrival_icao} (${score.grade})`,
          related_id: missionId,
          airport_icao: flightStats.arrival_icao,
        });
      }

      // MISE À JOUR MISSION
      mission.status = "completed";
      mission.completed_at = new Date().toISOString();
      mission.score_total = score.score;
      mission.grade = score.grade;
      mission.xp_earned = xpEarned;
      mission.final_reward = moneyEarned;
      mission.flight_time_minutes = flightStats.flight_time_minutes;
      mission.fuel_used_gal = (mission.block_fuel_gal || 0) - flightStats.fuel_remaining;
      mission.landing_vs_fpm = flightStats.landing_fpm;
      mission.max_g_force = flightStats.max_g_force;
      mission.overspeed_seconds = flightStats.overspeed_count;
      // Stocker pour sync
      mission.flight_stats = flightStats;
      mission.final_score = score;
      mission.local_xp_earned = xpEarned;
      mission.local_money_earned = moneyEarned;

      await DatabaseManager.put("missions", mission);

      // AJOUTER À LA QUEUE POUR SYNC
      NetworkState.queueAction({
        type: "mission_complete",
        data: {
          mission_id: missionId,
          flight_stats: flightStats,
          local_xp: xpEarned,
          local_money: moneyEarned,
          departure_icao: mission.origin_icao,
          arrival_icao: flightStats.arrival_icao,
          distance_nm: mission.distance_nm,
        },
      });

      console.log(`[OfflineMission] Completed: Grade ${score.grade}, +${xpEarned} XP, +${moneyEarned} CR (pending sync)`);

      return {
        success: true,
        score,
        xp_earned: xpEarned,
        money_earned: moneyEarned,
        pending_sync: true,
      };
    } catch (e) {
      console.error("[OfflineMission] Complete failed:", e);
      return { success: false, error: String(e) };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // VALIDATION (même logique que SEED)
  // ═══════════════════════════════════════════════════════════

  private validateFlightStats(
    stats: FlightStats,
    aircraft: Aircraft,
    mission: Mission
  ): ValidationResult {
    const errors: string[] = [];
    const flags: string[] = [];

    // 1. Flight time realistic? (max 24h)
    if (stats.flight_time_minutes > 1440) {
      errors.push("FLIGHT_TOO_LONG");
      flags.push("SPEED_HACK_SUSPECTED");
    }

    // 2. Distance consistent with time? (max 300 kts average)
    const maxDistance = (stats.flight_time_minutes / 60) * 300;
    if (stats.distance_nm > maxDistance * 1.2) {
      errors.push("IMPOSSIBLE_DISTANCE");
      flags.push("TELEPORT_SUSPECTED");
    }

    // 3. Departure matches aircraft's last known position?
    if (aircraft.location_icao !== stats.departure_icao) {
      errors.push("TELEPORTATION_DETECTED");
      flags.push("TELEPORT_SUSPECTED");
    }

    // 4. G-force realistic? (max 10g)
    if (stats.max_g_force > 10) {
      errors.push("IMPOSSIBLE_G_FORCE");
      flags.push("IMPOSSIBLE_G_FORCE");
    }

    // 5. Fuel consumption realistic? (minimum ~5 gal/100nm)
    const fuelUsed = (mission.block_fuel_gal || aircraft.fuel_gallons) - stats.fuel_remaining;
    const minFuelExpected = (mission.distance_nm || 0) * 0.05;
    if (fuelUsed < minFuelExpected && stats.flight_time_minutes > 10) {
      errors.push("FUEL_ANOMALY");
      flags.push("FUEL_CHEAT_SUSPECTED");
    }

    // 6. Time >= 30% of estimated
    const estimatedTime = ((mission.distance_nm || 0) / 120) * 60; // 120 kts average
    const minTime = estimatedTime * 0.3;
    if (stats.flight_time_minutes < minTime) {
      errors.push("FLIGHT_TOO_FAST");
      flags.push("SPEED_HACK_SUSPECTED");
    }

    if (errors.length > 0) {
      return { valid: false, reason: errors.join(", "), flags };
    }

    return { valid: true };
  }

  // ═══════════════════════════════════════════════════════════
  // SCORE CALCULATION (même logique que SEED)
  // ═══════════════════════════════════════════════════════════

  private calculateMissionScore(stats: FlightStats): MissionScore {
    let score = 1000;
    let multiplier = 1.0;
    const penalties: string[] = [];
    const bonuses: string[] = [];

    // Penalties
    if (stats.landing_fpm > 500) {
      score -= 200;
      multiplier -= 0.1;
      penalties.push("Hard landing (-200)");
    } else if (stats.landing_fpm > 300) {
      score -= 100;
      multiplier -= 0.05;
      penalties.push("Firm landing (-100)");
    }

    if (stats.overspeed_count > 0) {
      const penalty = stats.overspeed_count * 50;
      score -= penalty;
      multiplier -= 0.05 * stats.overspeed_count;
      penalties.push(`Overspeed x${stats.overspeed_count} (-${penalty})`);
    }

    if (stats.max_g_force > 2.5) {
      score -= 100;
      multiplier -= 0.05;
      penalties.push("Excessive G-force (-100)");
    }

    // Bonuses
    if (stats.landing_fpm < 100) {
      score += 150;
      multiplier += 0.1;
      bonuses.push("Smooth landing (+150)");
    }
    if (stats.landing_fpm < 50) {
      score += 100;
      multiplier += 0.05;
      bonuses.push("Butter landing (+100)");
    }

    // Grade
    let grade = "F";
    if (score >= 1200) grade = "S";
    else if (score >= 1000) grade = "A";
    else if (score >= 800) grade = "B";
    else if (score >= 600) grade = "C";
    else if (score >= 400) grade = "D";

    return {
      score: Math.max(0, score),
      multiplier: Math.max(0.5, Math.min(1.5, multiplier)),
      grade,
      penalties,
      bonuses,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // DISTANCE CALCULATION (Haversine formula)
  // ═══════════════════════════════════════════════════════════

  private calculateDistance(
    lat1: number, lon1: number,
    lat2: number, lon2: number
  ): number {
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return EARTH_RADIUS_NM * c;
  }

  // ═══════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════

  private async getPlayerId(): Promise<string> {
    const player = await DatabaseManager.getPlayer();
    return player?.id || "";
  }

  private async getAirport(icao: string): Promise<Airport | undefined> {
    return DatabaseManager.get<Airport>("airports", icao);
  }

  private generateUUID(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // ═══════════════════════════════════════════════════════════
  // GET ACTIVE MISSION
  // ═══════════════════════════════════════════════════════════

  async getActiveMission(aircraftId: string): Promise<OfflineMission | null> {
    const missions = await DatabaseManager.query<OfflineMission>("missions", "aircraft_id", aircraftId);
    const active = missions.find(m => m.status === "in_progress");
    return active || null;
  }
}

// ═══════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════

export const OfflineMissionService = new OfflineMissionServiceClass();
