/**
 * GameModeState - Game mode selection state (Solo vs Online)
 * Architecture v3.0: Two completely separate careers
 *
 * Solo Mode:
 * - Local storage via GetStoredData/SetStoredData
 * - AI-driven economy (no player market)
 * - NO anti-cheat (full freedom)
 * - Works offline
 *
 * Online Mode:
 * - SEED server for all data
 * - Player-driven economy
 * - STRICT anti-cheat
 * - Requires connection
 */

import { Subject } from "@microsoft/msfs-sdk";
import { authState } from "./AuthState";

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export type GameMode = "solo" | "online";

export interface GameModeStateType {
  /** Current selected game mode */
  currentMode: Subject<GameMode | null>;

  /** Whether mode has been selected (show selector if false) */
  modeSelected: Subject<boolean>;

  /** Whether mode selection screen is visible */
  showModeSelector: Subject<boolean>;

  /** Loading state during mode switch */
  modeSwitchLoading: Subject<boolean>;

  /** Error message if mode switch fails */
  modeSwitchError: Subject<string | null>;

  /**
   * Whether mode initialization is complete
   * CRITICAL: Data fetching should NOT happen until this is true
   * - Solo: true after NativePersistence restore complete
   * - Online: true after SEED connection and data sync complete
   */
  modeInitialized: Subject<boolean>;
}

// ═══════════════════════════════════════════════════════════
// STORAGE KEY
// ═══════════════════════════════════════════════════════════

const GAME_MODE_STORAGE_KEY = "WOA_GameMode";

// ═══════════════════════════════════════════════════════════
// STATE INSTANCE
// ═══════════════════════════════════════════════════════════

export const gameModeState: GameModeStateType = {
  currentMode: Subject.create<GameMode | null>(null),
  modeSelected: Subject.create(false),
  showModeSelector: Subject.create(false),
  modeSwitchLoading: Subject.create(false),
  modeSwitchError: Subject.create<string | null>(null),
  modeInitialized: Subject.create(false),
};

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

/**
 * Get current game mode
 */
export const getCurrentGameMode = (): GameMode | null => {
  return gameModeState.currentMode.get();
};

/**
 * Check if in Solo mode
 */
export const isSoloMode = (): boolean => {
  return gameModeState.currentMode.get() === "solo";
};

/**
 * Check if in Online mode
 */
export const isOnlineMode = (): boolean => {
  return gameModeState.currentMode.get() === "online";
};

/**
 * Check if mode has been selected
 */
export const isModeSelected = (): boolean => {
  return gameModeState.modeSelected.get();
};

/**
 * Check if mode initialization is complete
 * CRITICAL: Data fetching should NOT happen until this returns true
 */
export const isModeInitialized = (): boolean => {
  return gameModeState.modeInitialized.get();
};

/**
 * PASSE 5: Unified guard for checking if game is ready for operations
 *
 * This replaces the inconsistent pattern: authState.isLoggedIn.get() || authState.isP2PMode.get()
 *
 * Returns true when:
 * - Solo mode: Local services (IndexedDB) are initialized
 * - Online mode: SEED connection and auth are established
 *
 * Use this for:
 * - Checking if UI can fetch/display data
 * - Checking if operations can be performed
 *
 * Note: This imports from AuthState to check the operational flags.
 * For routing (Solo vs Online), use isSoloMode()/isOnlineMode() instead.
 */
export const isGameReady = (): boolean => {
  return authState.isLoggedIn.get() || authState.isP2PMode.get();
};

/**
 * Set mode initialization status
 * Called by InitService when mode-specific setup is complete
 */
export const setModeInitialized = (initialized: boolean): void => {
  console.log(`[GameModeState] Mode initialization: ${initialized}`);
  gameModeState.modeInitialized.set(initialized);
};

/**
 * Set game mode (called from mode selection screen)
 */
export const setGameMode = (mode: GameMode): void => {
  console.log(`[GameModeState] Setting game mode to: ${mode}`);
  gameModeState.currentMode.set(mode);
  gameModeState.modeSelected.set(true);
  gameModeState.showModeSelector.set(false);

  // Persist mode choice to native storage
  try {
    if (typeof SetStoredData === "function") {
      SetStoredData(GAME_MODE_STORAGE_KEY, mode);
      console.log(`[GameModeState] Mode persisted to native storage`);
    }
  } catch (e) {
    console.warn("[GameModeState] Failed to persist mode:", e);
  }
};

/**
 * Load saved game mode from native storage
 * Returns the mode if found, null otherwise
 */
export const loadSavedGameMode = (): GameMode | null => {
  try {
    if (typeof GetStoredData === "function") {
      const savedMode = GetStoredData(GAME_MODE_STORAGE_KEY);
      if (savedMode === "solo" || savedMode === "online") {
        console.log(`[GameModeState] Loaded saved mode: ${savedMode}`);
        gameModeState.currentMode.set(savedMode);
        gameModeState.modeSelected.set(true);
        return savedMode;
      }
    }
  } catch (e) {
    console.warn("[GameModeState] Failed to load saved mode:", e);
  }
  return null;
};

/**
 * Show mode selection screen
 */
export const showModeSelector = (): void => {
  gameModeState.showModeSelector.set(true);
};

/**
 * Hide mode selection screen
 */
export const hideModeSelector = (): void => {
  gameModeState.showModeSelector.set(false);
};

/**
 * Reset mode selection (for testing or switching careers)
 */
export const resetModeSelection = (): void => {
  console.log("[GameModeState] Resetting mode selection");
  gameModeState.currentMode.set(null);
  gameModeState.modeSelected.set(false);
  gameModeState.showModeSelector.set(true);
  gameModeState.modeInitialized.set(false); // Reset initialization flag

  // Clear persisted mode
  try {
    if (typeof SetStoredData === "function") {
      SetStoredData(GAME_MODE_STORAGE_KEY, "");
    }
  } catch (e) {
    console.warn("[GameModeState] Failed to clear persisted mode:", e);
  }
};

// Global MSFS declarations in src/types/msfs-globals.d.ts
