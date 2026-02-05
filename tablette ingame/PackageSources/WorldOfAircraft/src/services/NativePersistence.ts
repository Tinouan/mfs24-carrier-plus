/**
 * NativePersistence - Sauvegarde native MSFS via GetStoredData/SetStoredData
 *
 * Ces APIs persistent les données entre les sessions MSFS !
 * Pas besoin de module WASM, la persistance est directement disponible dans l'EFB.
 *
 * Usage:
 * - save() : Sauvegarde toutes les données importantes
 * - load() : Charge les données sauvegardées
 * - restore() : Restaure les données dans DatabaseManager
 */

import { DatabaseManager, type Player, type Aircraft, type Company, type Mission } from "../managers/DatabaseManager";
import { NetworkState, type OfflineAction } from "../state/NetworkState";

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface SaveData {
  version: number;
  timestamp: number;
  player_id: string;

  player: Player | null;
  aircraft: Aircraft[];
  company: Company | null;
  missions: Mission[];
  pending_actions: OfflineAction[];

  // Checksum pour détecter corruption
  checksum: string;
}

// Declare MSFS native APIs (available in Coherent GT)
declare function GetStoredData(key: string): string;
declare function SetStoredData(key: string, value: string): void;

// ═══════════════════════════════════════════════════════════
// NATIVE PERSISTENCE CLASS
// ═══════════════════════════════════════════════════════════

class NativePersistenceClass {
  private STORAGE_KEY = "WOA_SaveData";
  private SOLO_SETUP_KEY = "WOA_SoloSetupComplete";
  private PLAYER_ID_KEY = "WOA_PlayerId";
  private VERSION = 1;
  private autoSaveInterval: number | null = null;

  // ═══════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════

  /**
   * Check if native persistence is available
   */
  isAvailable(): boolean {
    try {
      return typeof GetStoredData === "function" && typeof SetStoredData === "function";
    } catch {
      return false;
    }
  }

  /**
   * Sauvegarder toutes les données
   */
  async save(): Promise<boolean> {
    if (!this.isAvailable()) {
      console.warn("[NativePersistence] GetStoredData/SetStoredData not available");
      return false;
    }

    try {
      const saveData = await this.collectSaveData();
      saveData.checksum = this.calculateChecksum(saveData);

      const json = JSON.stringify(saveData);
      SetStoredData(this.STORAGE_KEY, json);

      console.log(`[NativePersistence] Saved successfully (${(json.length / 1024).toFixed(1)} KB)`);
      return true;
    } catch (e) {
      console.error("[NativePersistence] Save failed:", e);
      return false;
    }
  }

  /**
   * Charger les données sauvegardées
   */
  async load(): Promise<SaveData | null> {
    if (!this.isAvailable()) {
      console.warn("[NativePersistence] GetStoredData/SetStoredData not available");
      return null;
    }

    try {
      const json = GetStoredData(this.STORAGE_KEY);

      if (!json || json === "") {
        console.log("[NativePersistence] No save data found");
        return null;
      }

      const saveData: SaveData = JSON.parse(json);

      // Vérifier le checksum
      const expectedChecksum = saveData.checksum;
      saveData.checksum = "";
      const actualChecksum = this.calculateChecksum(saveData);

      if (expectedChecksum !== actualChecksum) {
        console.warn("[NativePersistence] Checksum mismatch - data may be corrupted");
        // On charge quand même mais on log l'erreur
      }

      saveData.checksum = expectedChecksum;

      const savedDate = new Date(saveData.timestamp);
      console.log(`[NativePersistence] Loaded successfully, saved at: ${savedDate.toLocaleString()}`);
      console.log(`[NativePersistence] Data: player=${saveData.player?.name || "none"}, aircraft=${saveData.aircraft?.length || 0}, missions=${saveData.missions?.length || 0}`);

      return saveData;
    } catch (e) {
      console.error("[NativePersistence] Load failed:", e);
      return null;
    }
  }

  /**
   * Restaurer les données dans DatabaseManager
   */
  async restore(saveData: SaveData): Promise<void> {
    console.log("[NativePersistence] Restoring data...");

    // Player
    if (saveData.player) {
      await DatabaseManager.put("player", saveData.player, false);
      console.log(`[NativePersistence] Restored player: ${saveData.player.name}`);
    }

    // Aircraft
    if (saveData.aircraft && saveData.aircraft.length > 0) {
      for (const aircraft of saveData.aircraft) {
        await DatabaseManager.put("aircraft", aircraft, false);
      }
      console.log(`[NativePersistence] Restored ${saveData.aircraft.length} aircraft`);
    }

    // Company
    if (saveData.company) {
      await DatabaseManager.put("company", saveData.company, false);
      console.log(`[NativePersistence] Restored company: ${saveData.company.name}`);
    }

    // Missions (only active/recent ones)
    if (saveData.missions && saveData.missions.length > 0) {
      for (const mission of saveData.missions) {
        await DatabaseManager.put("missions", mission, false);
      }
      console.log(`[NativePersistence] Restored ${saveData.missions.length} missions`);
    }

    // Pending actions (for offline sync)
    if (saveData.pending_actions && saveData.pending_actions.length > 0) {
      NetworkState.pendingActions.set(saveData.pending_actions);
      console.log(`[NativePersistence] Restored ${saveData.pending_actions.length} pending actions`);
    }

    console.log("[NativePersistence] Restore complete");
  }

  /**
   * Démarrer l'auto-save périodique
   */
  startAutoSave(intervalMs: number = 60000): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }

    this.autoSaveInterval = window.setInterval(async () => {
      await this.save();
    }, intervalMs);

    console.log(`[NativePersistence] Auto-save started (every ${intervalMs / 1000}s)`);
  }

  /**
   * Arrêter l'auto-save
   */
  stopAutoSave(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
      console.log("[NativePersistence] Auto-save stopped");
    }
  }

  /**
   * Effacer la sauvegarde
   */
  clear(): void {
    if (!this.isAvailable()) {
      console.warn("[NativePersistence] GetStoredData/SetStoredData not available");
      return;
    }

    try {
      SetStoredData(this.STORAGE_KEY, "");
      console.log("[NativePersistence] Save data cleared");
    } catch (e) {
      console.error("[NativePersistence] Clear failed:", e);
    }
  }

  /**
   * Obtenir des infos sur la sauvegarde actuelle (sans charger tout)
   */
  async getSaveInfo(): Promise<{ exists: boolean; timestamp?: number; size?: number } | null> {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const json = GetStoredData(this.STORAGE_KEY);
      if (!json || json === "") {
        return { exists: false };
      }

      const saveData: SaveData = JSON.parse(json);
      return {
        exists: true,
        timestamp: saveData.timestamp,
        size: json.length,
      };
    } catch {
      return { exists: false };
    }
  }

  /**
   * Check if Solo mode setup has been completed
   * Used to detect true "first launch" vs. returning player
   */
  isSoloSetupComplete(): boolean {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const value = GetStoredData(this.SOLO_SETUP_KEY);
      return value === "true";
    } catch {
      return false;
    }
  }

  /**
   * Mark Solo mode setup as complete
   * Call this after first launch wizard is finished
   */
  setSoloSetupComplete(complete: boolean = true): void {
    if (!this.isAvailable()) {
      console.warn("[NativePersistence] Cannot set solo setup flag - native APIs not available");
      return;
    }

    try {
      SetStoredData(this.SOLO_SETUP_KEY, complete ? "true" : "false");
      console.log(`[NativePersistence] Solo setup complete flag set to: ${complete}`);
    } catch (e) {
      console.error("[NativePersistence] Failed to set solo setup flag:", e);
    }
  }

  /**
   * Clear Solo mode setup flag (for testing/reset)
   */
  clearSoloSetup(): void {
    if (!this.isAvailable()) {
      return;
    }

    try {
      SetStoredData(this.SOLO_SETUP_KEY, "");
      console.log("[NativePersistence] Solo setup flag cleared");
    } catch (e) {
      console.error("[NativePersistence] Failed to clear solo setup flag:", e);
    }
  }

  /**
   * Get the stored player ID (persists across EFB sessions)
   */
  getPlayerId(): string | null {
    if (!this.isAvailable()) {
      // Fallback to localStorage if native APIs not available
      return localStorage.getItem("woa_player_id");
    }

    try {
      const value = GetStoredData(this.PLAYER_ID_KEY);
      if (value && value.length > 0) {
        return value;
      }
      // Also check localStorage as fallback (migration from old system)
      const localId = localStorage.getItem("woa_player_id");
      if (localId) {
        // Migrate to native storage
        this.setPlayerId(localId);
        return localId;
      }
      return null;
    } catch {
      return localStorage.getItem("woa_player_id");
    }
  }

  /**
   * Set the player ID (persists across EFB sessions)
   */
  setPlayerId(playerId: string): void {
    // Always save to localStorage as backup
    localStorage.setItem("woa_player_id", playerId);

    if (!this.isAvailable()) {
      return;
    }

    try {
      SetStoredData(this.PLAYER_ID_KEY, playerId);
      console.log(`[NativePersistence] Player ID saved: ${playerId}`);
    } catch (e) {
      console.error("[NativePersistence] Failed to save player ID:", e);
    }
  }

  /**
   * Clear player ID (for testing/reset)
   */
  clearPlayerId(): void {
    localStorage.removeItem("woa_player_id");

    if (!this.isAvailable()) {
      return;
    }

    try {
      SetStoredData(this.PLAYER_ID_KEY, "");
      console.log("[NativePersistence] Player ID cleared");
    } catch (e) {
      console.error("[NativePersistence] Failed to clear player ID:", e);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════

  /**
   * Collecter toutes les données à sauvegarder
   */
  private async collectSaveData(): Promise<SaveData> {
    const player = await DatabaseManager.getPlayer();
    const aircraft = await DatabaseManager.getAll<Aircraft>("aircraft");
    const company = player ? await DatabaseManager.getCompanyByOwner(player.id) : undefined;

    // Ne garder que les missions récentes ou en cours
    const allMissions = await DatabaseManager.getAll<Mission>("missions");
    const recentMissions = allMissions.filter((m) => {
      // Garder: en cours, ou terminées depuis moins de 7 jours
      if (m.status === "in_progress" || m.status === "active") return true;
      if (m.completed_at) {
        const completedDate = new Date(m.completed_at);
        const daysSinceCompletion = (Date.now() - completedDate.getTime()) / (1000 * 60 * 60 * 24);
        return daysSinceCompletion < 7;
      }
      return false;
    });

    const pendingActions = NetworkState.pendingActions.get();

    return {
      version: this.VERSION,
      timestamp: Date.now(),
      player_id: player?.id || "",
      player: player || null,
      aircraft: aircraft || [],
      company: company || null,
      missions: recentMissions,
      pending_actions: pendingActions,
      checksum: "",
    };
  }

  /**
   * Calculer un checksum simple pour détecter les modifications/corruptions
   */
  private calculateChecksum(data: SaveData): string {
    const str = JSON.stringify({
      player_id: data.player_id,
      timestamp: data.timestamp,
      player_money: data.player?.money,
      player_xp: data.player?.xp,
      aircraft_count: data.aircraft?.length,
      missions_count: data.missions?.length,
    });

    // Simple hash
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }
}

// ═══════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════

export const NativePersistence = new NativePersistenceClass();
