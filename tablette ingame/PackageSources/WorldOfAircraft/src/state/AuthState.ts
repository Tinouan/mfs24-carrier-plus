/**
 * AuthState - Authentication and login state
 * Extracted from WorldOfAircraft.tsx for better maintainability
 */

import { Subject } from "@microsoft/msfs-sdk";
import type { UserInfo } from "../types";

// ═══════════════════════════════════════════════════════════
// SEED CONNECTION STATUS
// ═══════════════════════════════════════════════════════════

export type SeedConnectionStatus = "disconnected" | "connecting" | "connected" | "failed";

// ═══════════════════════════════════════════════════════════
// AUTH STATE TYPE
// ═══════════════════════════════════════════════════════════

export interface AuthStateType {
  isLoggedIn: Subject<boolean>;
  authToken: Subject<string | null>;
  currentUser: Subject<UserInfo | null>;
  showLoginPanel: Subject<boolean>;
  showLogoutConfirm: Subject<boolean>;
  loginError: Subject<string | null>;
  loginLoading: Subject<boolean>;
  settingsCredentialsSaved: Subject<boolean>;
  // P2P Mode
  isP2PMode: Subject<boolean>; // When true, uses local services instead of API
  // P2P First Launch
  showFirstLaunchPopup: Subject<boolean>;
  firstLaunchPilotName: Subject<string>;
  firstLaunchNationality: Subject<string>;
  firstLaunchAirport: Subject<string>;
  firstLaunchAirportValid: Subject<boolean>;
  // SEED Connection (Monde Unique)
  seedConnectionStatus: Subject<SeedConnectionStatus>;
  seedConnectionError: Subject<string | null>;
  seedInitProgress: Subject<number>;
  seedInitStep: Subject<string>;
}

// ═══════════════════════════════════════════════════════════
// STATE INSTANCE
// ═══════════════════════════════════════════════════════════

export const authState: AuthStateType = {
  isLoggedIn: Subject.create(false),
  authToken: Subject.create<string | null>(null),
  currentUser: Subject.create<UserInfo | null>(null),
  showLoginPanel: Subject.create(false),
  showLogoutConfirm: Subject.create(false),
  loginError: Subject.create<string | null>(null),
  loginLoading: Subject.create(false),
  settingsCredentialsSaved: Subject.create(false),
  // P2P Mode - defaults to true for local-first experience
  isP2PMode: Subject.create(true),
  // P2P First Launch
  showFirstLaunchPopup: Subject.create(false),
  firstLaunchPilotName: Subject.create(""),
  firstLaunchNationality: Subject.create("FR"),
  firstLaunchAirport: Subject.create("LFPG"),
  firstLaunchAirportValid: Subject.create(false), // Invalid until user types valid ICAO
  // SEED Connection (Monde Unique)
  seedConnectionStatus: Subject.create<SeedConnectionStatus>("connecting"),
  seedConnectionError: Subject.create<string | null>(null),
  seedInitProgress: Subject.create(0),
  seedInitStep: Subject.create(""),
};

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

export const getAuthToken = (): string | null => authState.authToken.get();
export const isUserLoggedIn = (): boolean => authState.isLoggedIn.get();
export const getCurrentUser = (): UserInfo | null => authState.currentUser.get();
export const isP2PMode = (): boolean => authState.isP2PMode.get();

/**
 * Enable P2P local mode (uses DatabaseManager instead of API)
 */
export const enableP2PMode = (): void => {
  authState.isP2PMode.set(true);
  // In P2P mode, we auto-login based on local database
  console.log("[AuthState] P2P mode enabled - using local services");
};

/**
 * Disable P2P mode and switch to network API mode
 */
export const disableP2PMode = (): void => {
  authState.isP2PMode.set(false);
  console.log("[AuthState] P2P mode disabled - using network services");
};
