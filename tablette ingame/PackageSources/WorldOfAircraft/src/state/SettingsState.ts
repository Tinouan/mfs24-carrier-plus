/**
 * SettingsState - User preferences and unit settings
 * Extracted from WorldOfAircraft.tsx for better maintainability
 */

import { Subject } from "@microsoft/msfs-sdk";
import type { Language } from "../types";

// ═══════════════════════════════════════════════════════════
// UNIT TYPES
// ═══════════════════════════════════════════════════════════

export type DistanceUnit = "nm" | "km";
export type WeightUnit = "kg" | "lbs";
export type AltitudeUnit = "ft" | "m";
export type FuelUnit = "gal" | "L";
export type SpeedUnit = "kts" | "kmh";
export type TemperatureUnit = "C" | "F";

// ═══════════════════════════════════════════════════════════
// SETTINGS STATE TYPE
// ═══════════════════════════════════════════════════════════

export interface SettingsStateType {
  unitDistance: Subject<DistanceUnit>;
  unitWeight: Subject<WeightUnit>;
  unitAltitude: Subject<AltitudeUnit>;
  unitFuel: Subject<FuelUnit>;
  unitSpeed: Subject<SpeedUnit>;
  unitTemperature: Subject<TemperatureUnit>;
  currentLanguage: Subject<Language>;
  // Debug: simulate offline mode
  isOfflineSimulated: Subject<boolean>;
}

// ═══════════════════════════════════════════════════════════
// INITIALIZATION HELPER
// ═══════════════════════════════════════════════════════════

function getInitialLanguage(): Language {
  try {
    const saved = localStorage.getItem("woa_language") as Language | null;
    const valid: Language[] = ["en", "fr", "de", "es", "ru"];
    if (saved && valid.includes(saved)) {
      console.log("[SettingsState] Initial language from storage:", saved);
      return saved;
    }
  } catch (e) {
    console.error("[SettingsState] Failed to get initial language:", e);
  }
  return "en";
}

// ═══════════════════════════════════════════════════════════
// STATE INSTANCE
// ═══════════════════════════════════════════════════════════

export const settingsState: SettingsStateType = {
  unitDistance: Subject.create<DistanceUnit>("nm"),
  unitWeight: Subject.create<WeightUnit>("kg"),
  unitAltitude: Subject.create<AltitudeUnit>("ft"),
  unitFuel: Subject.create<FuelUnit>("gal"),
  unitSpeed: Subject.create<SpeedUnit>("kts"),
  unitTemperature: Subject.create<TemperatureUnit>("C"),
  currentLanguage: Subject.create<Language>(getInitialLanguage()),
  // Debug: simulate offline mode
  isOfflineSimulated: Subject.create<boolean>(false),
};

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

export const getLanguage = (): Language => settingsState.currentLanguage.get();
export const setLanguage = (lang: Language): void => {
  settingsState.currentLanguage.set(lang);
  try {
    localStorage.setItem("woa_language", lang);
  } catch (e) {
    console.error("[SettingsState] Failed to save language:", e);
  }
};
