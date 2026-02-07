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

import { DatabaseManager, type Player, type Aircraft, type Company, type Mission, type InventoryItem } from "../managers/DatabaseManager";
import { NetworkState, type OfflineAction } from "../state/NetworkState";
import { getCurrentGameMode, type GameMode } from "../state/GameModeState";

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
  inventory: InventoryItem[];
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
  // Base keys - will be prefixed with mode (Solo/Online)
  private BASE_STORAGE_KEY = "SaveData";
  private BASE_SETUP_KEY = "SetupComplete";
  private BASE_PLAYER_ID_KEY = "PlayerId";
  private VERSION = 1;
  private autoSaveInterval: number | null = null;

  // ═══════════════════════════════════════════════════════════
  // MODE-PREFIXED KEY HELPERS
  // Architecture v3.0: Solo and Online have COMPLETELY SEPARATE saves
  // ═══════════════════════════════════════════════════════════

  /**
   * Get mode prefix for storage keys
   * Solo mode: "WOA_Solo_"
   * Online mode: "WOA_Online_"
   */
  private getModePrefix(mode?: GameMode | null): string {
    const currentMode = mode ?? getCurrentGameMode();
    if (currentMode === "solo") return "WOA_Solo_";
    if (currentMode === "online") return "WOA_Online_";
    // Fallback for when mode isn't set yet (shouldn't happen in normal flow)
    return "WOA_";
  }

  /**
   * Get storage key with mode prefix
   */
  private getStorageKey(mode?: GameMode | null): string {
    return this.getModePrefix(mode) + this.BASE_STORAGE_KEY;
  }

  /**
   * Get setup complete key with mode prefix
   */
  private getSetupKey(mode?: GameMode | null): string {
    return this.getModePrefix(mode) + this.BASE_SETUP_KEY;
  }

  /**
   * Get player ID key with mode prefix
   */
  private getPlayerIdKey(mode?: GameMode | null): string {
    return this.getModePrefix(mode) + this.BASE_PLAYER_ID_KEY;
  }

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
   * Generic get: retrieve a simple string value by key
   * Key is auto-prefixed with "WOA_" for namespace isolation
   */
  get(key: string): string | null {
    if (!this.isAvailable()) {
      // Fallback to localStorage
      return localStorage.getItem(key);
    }
    try {
      const value = GetStoredData(`WOA_${key}`);
      if (value && value.length > 0) {
        return value;
      }
      // Migration: check localStorage
      const localValue = localStorage.getItem(key);
      if (localValue) {
        this.set(key, localValue); // Migrate to native
        return localValue;
      }
      return null;
    } catch {
      return localStorage.getItem(key);
    }
  }

  /**
   * Generic set: store a simple string value by key
   * Key is auto-prefixed with "WOA_" for namespace isolation
   */
  set(key: string, value: string): void {
    // Always save to localStorage as backup
    if (value) {
      localStorage.setItem(key, value);
    } else {
      localStorage.removeItem(key);
    }

    if (!this.isAvailable()) {
      return;
    }

    try {
      SetStoredData(`WOA_${key}`, value);
    } catch (e) {
      console.error(`[NativePersistence] Failed to set ${key}:`, e);
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
      // Don't save empty data (no player = nothing to save)
      if (!saveData.player || !saveData.player.id) {
        console.log("[NativePersistence] Skipping save - no player data");
        return false;
      }
      saveData.checksum = this.calculateChecksum(saveData);

      const json = JSON.stringify(saveData);
      const storageKey = this.getStorageKey();
      SetStoredData(storageKey, json);

      console.log(`[NativePersistence] Saved to ${storageKey} (${(json.length / 1024).toFixed(1)} KB)`);
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
      const storageKey = this.getStorageKey();
      let json = GetStoredData(storageKey);

      // Migration: Check old non-prefixed key WOA_SaveData
      if ((!json || json === "") && getCurrentGameMode() === "solo") {
        const oldKey = "WOA_SaveData";
        json = GetStoredData(oldKey);
        if (json && json !== "") {
          console.log(`[NativePersistence] Migrating save data from ${oldKey} to ${storageKey}`);
          SetStoredData(storageKey, json); // Migrate to new key
        }
      }

      if (!json || json === "") {
        console.log(`[NativePersistence] No save data found for ${storageKey}`);
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

    // Inventory
    if (saveData.inventory && saveData.inventory.length > 0) {
      for (const item of saveData.inventory) {
        await DatabaseManager.put("inventory", item, false);
      }
      console.log(`[NativePersistence] Restored ${saveData.inventory.length} inventory items`);
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
   * Effacer la sauvegarde (for current mode)
   */
  clear(): void {
    if (!this.isAvailable()) {
      console.warn("[NativePersistence] GetStoredData/SetStoredData not available");
      return;
    }

    try {
      const storageKey = this.getStorageKey();
      SetStoredData(storageKey, "");
      console.log(`[NativePersistence] Save data cleared for ${storageKey}`);
    } catch (e) {
      console.error("[NativePersistence] Clear failed:", e);
    }
  }

  /**
   * V4.1: Clear save data for a specific mode
   * More explicit than clear() which uses current mode
   */
  clearSaveData(mode: GameMode): void {
    if (!this.isAvailable()) {
      console.warn("[NativePersistence] GetStoredData/SetStoredData not available");
      return;
    }

    try {
      const storageKey = this.getStorageKey(mode);
      SetStoredData(storageKey, "");
      console.log(`[NativePersistence] Save data cleared for ${storageKey}`);
    } catch (e) {
      console.error(`[NativePersistence] Clear failed for ${mode}:`, e);
    }
  }

  /**
   * V4.1: Verify that save data was properly cleared
   * Returns an object indicating if the data is empty
   */
  verifyClear(mode: GameMode): { cleared: boolean; dataLength: number; hasPlayer: boolean } {
    if (!this.isAvailable()) {
      return { cleared: true, dataLength: 0, hasPlayer: false };
    }

    try {
      const storageKey = this.getStorageKey(mode);
      const json = GetStoredData(storageKey);

      if (!json || json === "") {
        return { cleared: true, dataLength: 0, hasPlayer: false };
      }

      // Check if there's a player in the data
      try {
        const data = JSON.parse(json);
        const hasPlayer = !!(data.player && data.player.id);
        return {
          cleared: false,
          dataLength: json.length,
          hasPlayer,
        };
      } catch {
        return { cleared: false, dataLength: json.length, hasPlayer: false };
      }
    } catch (e) {
      console.error("[NativePersistence] Verify failed:", e);
      return { cleared: true, dataLength: 0, hasPlayer: false };
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
      const storageKey = this.getStorageKey();
      const json = GetStoredData(storageKey);
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
   * Check if setup has been completed for current mode
   * Used to detect true "first launch" vs. returning player
   *
   * FIX: Now checks "WorldOfAircraftData" (where DatabaseManager actually saves)
   * instead of the mode-specific keys that are never written.
   *
   * @param mode - Optional mode override (defaults to current mode)
   */
  isSetupComplete(mode?: GameMode | null): boolean {
    if (!this.isAvailable()) return false;

    // Check the ACTUAL data store used by DatabaseManager
    const DATASTORE_KEY = "WorldOfAircraftData";
    const json = GetStoredData(DATASTORE_KEY);
    if (!json || json === "") return false;

    try {
      const data = JSON.parse(json);
      // Check for player data in the DatabaseManager format
      const hasPlayer = !!(data.player && Array.isArray(data.player) && data.player.length > 0);
      if (!hasPlayer) {
        console.log(`[NativePersistence] No player found in ${DATASTORE_KEY}`);
        return false;
      }
      console.log(`[NativePersistence] Setup complete - found player in ${DATASTORE_KEY}`);
      return true;
    } catch (e) {
      console.warn(`[NativePersistence] Failed to parse ${DATASTORE_KEY}:`, e);
      return false;
    }
  }

  /**
   * @deprecated Use isSetupComplete() instead
   */
  isSoloSetupComplete(): boolean {
    return this.isSetupComplete("solo");
  }

  /**
   * Mark mode setup as complete
   * Call this after first launch wizard is finished
   * @param mode - Optional mode override (defaults to current mode)
   */
  setSetupComplete(complete: boolean = true, mode?: GameMode | null): void {
    if (!this.isAvailable()) {
      console.warn("[NativePersistence] Cannot set setup flag - native APIs not available");
      return;
    }

    try {
      const setupKey = this.getSetupKey(mode);
      SetStoredData(setupKey, complete ? "true" : "false");
      console.log(`[NativePersistence] Setup complete flag for ${setupKey}: ${complete}`);
    } catch (e) {
      console.error("[NativePersistence] Failed to set setup flag:", e);
    }
  }

  /**
   * @deprecated Use setSetupComplete() instead
   */
  setSoloSetupComplete(complete: boolean = true): void {
    this.setSetupComplete(complete, "solo");
  }

  /**
   * Clear setup flag for current mode (for testing/reset)
   * @param mode - Optional mode override (defaults to current mode)
   */
  clearSetup(mode?: GameMode | null): void {
    if (!this.isAvailable()) {
      return;
    }

    try {
      const setupKey = this.getSetupKey(mode);
      SetStoredData(setupKey, "");
      console.log(`[NativePersistence] Setup flag cleared for ${setupKey}`);
    } catch (e) {
      console.error("[NativePersistence] Failed to clear setup flag:", e);
    }
  }

  /**
   * @deprecated Use clearSetup() instead
   */
  clearSoloSetup(): void {
    this.clearSetup("solo");
  }

  /**
   * Get the stored player ID for current mode (persists across EFB sessions)
   * Solo and Online have SEPARATE player IDs!
   * @param mode - Optional mode override (defaults to current mode)
   */
  getPlayerId(mode?: GameMode | null): string | null {
    const playerIdKey = this.getPlayerIdKey(mode);
    const localStorageKey = `woa_${(mode ?? getCurrentGameMode()) || ""}_player_id`;

    if (!this.isAvailable()) {
      // Fallback to localStorage if native APIs not available
      return localStorage.getItem(localStorageKey);
    }

    try {
      const value = GetStoredData(playerIdKey);
      if (value && value.length > 0) {
        return value;
      }
      // Migration 1: Check localStorage as fallback
      const localId = localStorage.getItem(localStorageKey);
      if (localId) {
        this.setPlayerId(localId, mode);
        return localId;
      }
      // Migration 2: Check old non-prefixed key (WOA_PlayerId)
      const oldKey = "WOA_PlayerId";
      const oldValue = GetStoredData(oldKey);
      if (oldValue && oldValue.length > 0) {
        console.log(`[NativePersistence] Migrating player ID from ${oldKey} to ${playerIdKey}`);
        this.setPlayerId(oldValue, mode);
        return oldValue;
      }
      return null;
    } catch {
      return localStorage.getItem(localStorageKey);
    }
  }

  /**
   * Set the player ID for current mode (persists across EFB sessions)
   * @param mode - Optional mode override (defaults to current mode)
   */
  setPlayerId(playerId: string, mode?: GameMode | null): void {
    const playerIdKey = this.getPlayerIdKey(mode);
    const localStorageKey = `woa_${(mode ?? getCurrentGameMode()) || ""}_player_id`;

    // Always save to localStorage as backup
    localStorage.setItem(localStorageKey, playerId);

    if (!this.isAvailable()) {
      return;
    }

    try {
      SetStoredData(playerIdKey, playerId);
      console.log(`[NativePersistence] Player ID saved to ${playerIdKey}: ${playerId}`);
    } catch (e) {
      console.error("[NativePersistence] Failed to save player ID:", e);
    }
  }

  /**
   * Clear player ID for current mode (for testing/reset)
   * @param mode - Optional mode override (defaults to current mode)
   */
  clearPlayerId(mode?: GameMode | null): void {
    const playerIdKey = this.getPlayerIdKey(mode);
    const localStorageKey = `woa_${(mode ?? getCurrentGameMode()) || ""}_player_id`;

    localStorage.removeItem(localStorageKey);

    if (!this.isAvailable()) {
      return;
    }

    try {
      SetStoredData(playerIdKey, "");
      console.log(`[NativePersistence] Player ID cleared for ${playerIdKey}`);
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
    const inventory = await DatabaseManager.getAll<InventoryItem>("inventory");

    return {
      version: this.VERSION,
      timestamp: Date.now(),
      player_id: player?.id || "",
      player: player || null,
      aircraft: aircraft || [],
      company: company || null,
      missions: recentMissions,
      inventory: inventory || [],
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
