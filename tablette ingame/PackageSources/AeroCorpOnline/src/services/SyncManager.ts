/**
 * SyncManager - Gestion de la synchronisation entre local et SEED
 *
 * Responsabilités:
 * - Vérification périodique de la connexion
 * - Synchronisation des actions en attente quand la connexion revient
 * - Résolution des conflits (SEED = source de vérité)
 * - Pull des données fraîches du SEED
 */

import { SyncService, type FlightStats } from "./SyncService";
import { NetworkState, type OfflineAction, type SyncResult } from "../state/NetworkState";
import { DatabaseManager, type Player, type Aircraft } from "../managers/DatabaseManager";
import { isSoloMode } from "../state/GameModeState";

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface ActionSyncResult {
  success: boolean;
  error?: string;
  seedXp?: number;
  seedMoney?: number;
}

// ═══════════════════════════════════════════════════════════
// SYNC MANAGER CLASS
// ═══════════════════════════════════════════════════════════

class SyncManagerClass {
  private checkInterval: number | null = null;
  private readonly CHECK_INTERVAL_MS = 30000; // 30 secondes
  private isSyncing = false;

  // ═══════════════════════════════════════════════════════════
  // CONNECTION CHECK
  // ═══════════════════════════════════════════════════════════

  /**
   * Démarrer la vérification périodique de connexion
   */
  startConnectionCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    console.log(`[SyncManager] Starting connection check every ${this.CHECK_INTERVAL_MS / 1000}s`);

    // Check immédiat
    this.checkConnection();

    // Check périodique
    this.checkInterval = window.setInterval(() => {
      this.checkConnection();
    }, this.CHECK_INTERVAL_MS);
  }

  /**
   * Arrêter la vérification périodique
   */
  stopConnectionCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log("[SyncManager] Connection check stopped");
    }
  }

  /**
   * Vérifier l'état de la connexion et synchroniser si nécessaire
   */
  private async checkConnection(): Promise<void> {
    // V3.0: NEVER change network state in Solo mode
    if (isSoloMode()) {
      console.log("[SyncManager] Solo mode - skipping connection check");
      return;
    }

    const wasOnline = NetworkState.isOnline();

    try {
      const isNowOnline = await SyncService.connect();

      if (isNowOnline && !wasOnline) {
        // Vient de se reconnecter
        console.log("[SyncManager] Connection restored - starting sync");
        NetworkState.setOnline();

        // Sync les actions en attente
        if (NetworkState.hasPendingActions()) {
          await this.syncPendingActions();
        }
      } else if (!isNowOnline && wasOnline) {
        // Vient de se déconnecter
        console.log("[SyncManager] Connection lost - switching to offline mode");
        NetworkState.setOffline();
      }
    } catch (e) {
      if (wasOnline) {
        console.log("[SyncManager] Connection check failed - switching to offline mode");
        NetworkState.setOffline();
      }
    }
  }

  /**
   * Forcer une vérification de connexion maintenant
   */
  async forceConnectionCheck(): Promise<boolean> {
    await this.checkConnection();
    return NetworkState.isOnline();
  }

  // ═══════════════════════════════════════════════════════════
  // SYNC PENDING ACTIONS
  // ═══════════════════════════════════════════════════════════

  /**
   * Synchroniser toutes les actions en attente avec SEED
   */
  async syncPendingActions(): Promise<SyncResult> {
    // V3.0: No sync in solo mode
    if (isSoloMode()) {
      console.log("[SyncManager] Solo mode - no SEED sync needed");
      return { success: true, synced: 0, failed: 0, errors: [] };
    }

    if (this.isSyncing) {
      console.log("[SyncManager] Sync already in progress");
      return { success: false, synced: 0, failed: 0, errors: ["Sync already in progress"] };
    }

    const pending = NetworkState.pendingActions.get();
    if (pending.length === 0) {
      return { success: true, synced: 0, failed: 0, errors: [] };
    }

    console.log(`[SyncManager] Syncing ${pending.length} pending actions...`);
    this.isSyncing = true;
    NetworkState.setSyncing();

    let synced = 0;
    let failed = 0;
    const errors: string[] = [];
    const syncedIds: string[] = [];

    for (const action of pending) {
      try {
        const result = await this.syncAction(action);

        if (result.success) {
          synced++;
          syncedIds.push(action.id);

          // Corriger les récompenses locales si différentes du SEED
          if (action.type === "mission_complete") {
            await this.correctLocalRewards(action, result);
          }
        } else {
          failed++;
          errors.push(`${action.type}: ${result.error || "Unknown error"}`);
        }
      } catch (e) {
        failed++;
        errors.push(`${action.type}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Retirer les actions synchronisées de la queue
    for (const id of syncedIds) {
      NetworkState.removeAction(id);
    }

    this.isSyncing = false;

    // V3.0: Only set online if NOT in solo mode
    if (!isSoloMode()) {
      NetworkState.setOnline();
    }

    // Recharger les données fraîches du SEED
    if (synced > 0) {
      await this.pullFromSeed();
    }

    console.log(`[SyncManager] Sync complete: ${synced} synced, ${failed} failed`);

    return { success: failed === 0, synced, failed, errors };
  }

  /**
   * Synchroniser une action individuelle
   */
  private async syncAction(action: OfflineAction): Promise<ActionSyncResult> {
    switch (action.type) {
      case "mission_complete":
        return this.syncMissionComplete(action.data);

      case "refuel":
        // Refuel offline n'est PAS autorisé (trop facile à tricher)
        return { success: false, error: "Refuel requires online connection" };

      case "market_buy":
      case "market_sell":
        // Market offline n'est PAS autorisé (pas de marché partagé offline)
        return { success: false, error: "Market operations require online connection" };

      default:
        return { success: false, error: `Unknown action type: ${action.type}` };
    }
  }

  /**
   * Synchroniser une complétion de mission
   */
  private async syncMissionComplete(data: Record<string, unknown>): Promise<ActionSyncResult> {
    const missionId = data.mission_id as string;
    const flightStats = data.flight_stats as FlightStats;

    // Essayer de compléter sur SEED
    const result = await SyncService.completeMission(missionId, flightStats);

    if (!result) {
      // Peut-être que la mission n'existe pas sur SEED
      // On la crée d'abord, puis on la complète
      const departureIcao = data.departure_icao as string;
      const arrivalIcao = data.arrival_icao as string;
      const aircraftId = data.aircraft_id as string;

      if (departureIcao && arrivalIcao && aircraftId) {
        console.log("[SyncManager] Mission not found on SEED, creating then completing...");

        // Créer la mission sur SEED
        const newMission = await SyncService.createMission(aircraftId, arrivalIcao);

        if (newMission) {
          // Maintenant compléter avec les stats
          const completeResult = await SyncService.completeMission(newMission.id, flightStats);

          if (completeResult) {
            return {
              success: true,
              seedXp: completeResult.xp_earned,
              seedMoney: completeResult.money_earned,
            };
          }
        }
      }

      return { success: false, error: "Failed to sync mission to SEED" };
    }

    return {
      success: true,
      seedXp: result.xp_earned,
      seedMoney: result.money_earned,
    };
  }

  /**
   * Corriger les récompenses locales si SEED a donné des valeurs différentes
   */
  private async correctLocalRewards(
    action: OfflineAction,
    seedResult: ActionSyncResult
  ): Promise<void> {
    const localXp = action.data.local_xp as number | undefined;
    const localMoney = action.data.local_money as number | undefined;

    if (seedResult.seedXp === undefined || seedResult.seedMoney === undefined) {
      return;
    }

    if (localXp === undefined || localMoney === undefined) {
      return;
    }

    // Vérifier si correction nécessaire
    const xpDiff = seedResult.seedXp - localXp;
    const moneyDiff = seedResult.seedMoney - localMoney;

    if (xpDiff === 0 && moneyDiff === 0) {
      return;
    }

    console.log(`[SyncManager] SEED corrected rewards: XP ${localXp} → ${seedResult.seedXp} (${xpDiff >= 0 ? "+" : ""}${xpDiff}), Money ${localMoney} → ${seedResult.seedMoney} (${moneyDiff >= 0 ? "+" : ""}${moneyDiff})`);

    // Corriger le player local
    const player = await DatabaseManager.getPlayer();
    if (player) {
      // Ajuster les valeurs (soustraire le local, ajouter le SEED)
      player.xp = player.xp - localXp + seedResult.seedXp;
      player.money = player.money - localMoney + seedResult.seedMoney;
      player.updated_at = new Date().toISOString();
      await DatabaseManager.savePlayer(player);

      console.log(`[SyncManager] Player updated: XP=${player.xp}, Money=${player.money}`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PULL FROM SEED
  // ═══════════════════════════════════════════════════════════

  /**
   * Télécharger les données fraîches du SEED et mettre à jour le local
   */
  async pullFromSeed(): Promise<void> {
    if (!SyncService.isConnected()) {
      console.log("[SyncManager] Cannot pull: not connected");
      return;
    }

    console.log("[SyncManager] Pulling fresh data from SEED...");

    try {
      // 1. Player
      const seedPlayer = await SyncService.getPlayer();
      if (seedPlayer) {
        const localPlayer = await DatabaseManager.getPlayer();
        if (localPlayer) {
          // Mettre à jour avec les valeurs SEED (source de vérité)
          localPlayer.xp = seedPlayer.xp;
          localPlayer.money = seedPlayer.money;
          localPlayer.name = seedPlayer.name;
          localPlayer.updated_at = new Date().toISOString();
          await DatabaseManager.savePlayer(localPlayer);
        }
      }

      // 2. Aircraft
      const seedAircraft = await SyncService.getPlayerAircraftList();
      for (const ac of seedAircraft) {
        const localAc = await DatabaseManager.get<Aircraft>("aircraft", ac.id);
        if (localAc) {
          // Mettre à jour avec les valeurs SEED
          localAc.location_icao = ac.current_airport_ident;
          localAc.fuel_gallons = ac.fuel_gallons;
          localAc.condition = ac.condition;
          localAc.flight_hours = ac.hours;
          await DatabaseManager.put("aircraft", localAc, false);
        }
      }

      // 3. World data (market, etc.)
      await SyncService.loadWorld();

      console.log("[SyncManager] Pull complete");
    } catch (e) {
      console.error("[SyncManager] Pull failed:", e);
    }
  }

  /**
   * Push les données locales vers SEED (pour sync initial)
   */
  async pushToSeed(): Promise<void> {
    if (!SyncService.isConnected()) {
      console.log("[SyncManager] Cannot push: not connected");
      return;
    }

    console.log("[SyncManager] Pushing local data to SEED...");

    try {
      // Push aircraft locations
      const allAircraft = await DatabaseManager.getAll<Aircraft>("aircraft");
      for (const ac of allAircraft) {
        await SyncService.saveAircraft({
          id: ac.id,
          owner_id: ac.owner_id || "",
          registration: ac.registration,
          aircraft_type: ac.name || ac.type_code,
          icao_type: ac.type_code,
          current_airport_ident: ac.location_icao,
          status: ac.status,
          fuel_gallons: ac.fuel_gallons,
          fuel_capacity_gallons: 50, // Default
          cargo_kg: 0,
          cargo_capacity_kg: ac.cargo_capacity_kg,
          condition: ac.condition,
          hours: ac.flight_hours,
        });
      }

      console.log("[SyncManager] Push complete");
    } catch (e) {
      console.error("[SyncManager] Push failed:", e);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // STATUS
  // ═══════════════════════════════════════════════════════════

  /**
   * Vérifier si une sync est en cours
   */
  isSyncInProgress(): boolean {
    return this.isSyncing;
  }
}

// ═══════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════

export const SyncManager = new SyncManagerClass();
