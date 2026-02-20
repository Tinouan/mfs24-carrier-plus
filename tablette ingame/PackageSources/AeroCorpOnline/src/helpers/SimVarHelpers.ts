/**
 * SimVarHelpers - Utility functions for MSFS SimVar operations
 * Extracted from AeroCorpOnline.tsx for reusability
 */

import { FlightTracker } from "../services/FlightTracker";

// Global MSFS declarations in src/types/msfs-globals.d.ts

// ═══════════════════════════════════════════════════════════════════════════
// FUEL MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/** Timestamp of last fuel injection — used by anti-cheat cooldown */
export let lastFuelInjectionTime = 0;

/**
 * Set fuel in simulator by writing to the 3 main fuel tanks
 * FUEL TOTAL QUANTITY is read-only, so we need to set individual tank levels
 *
 * @param targetGallons - Target fuel amount in gallons
 * @param capacityGallons - Fuel capacity in gallons
 */
export function setSimulatorFuel(targetGallons: number, capacityGallons: number): void {
  // Calculate target level as percentage (0.0 to 1.0)
  const targetLevel = Math.min(1.0, Math.max(0.0, targetGallons / capacityGallons));
  console.log(`[SimVarHelpers] Setting fuel level to ${(targetLevel * 100).toFixed(1)}%`);

  // V3.0: Only write to the 3 main tanks (was 11 — many don't exist on most aircraft)
  const fuelTanks = [
    "FUEL TANK LEFT MAIN LEVEL",
    "FUEL TANK RIGHT MAIN LEVEL",
    "FUEL TANK CENTER LEVEL",
  ];

  for (const tank of fuelTanks) {
    try {
      SimVar.SetSimVarValue(tank, "percent over 100", targetLevel);
    } catch {
      // Tank doesn't exist on this aircraft, ignore
    }
  }

  // Notify FlightTracker so it doesn't see this as fuel consumption
  FlightTracker.updateFuelBaseline(targetGallons);
  lastFuelInjectionTime = Date.now();
}

// ═══════════════════════════════════════════════════════════════════════════
// FUEL READING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Read current fuel from simulator
 * @returns Current fuel in gallons
 */
export function getSimulatorFuelGallons(): number {
  try {
    return (SimVar.GetSimVarValue("FUEL TOTAL QUANTITY", "gallons") as number) || 0;
  } catch {
    return 0;
  }
}

/**
 * Read fuel capacity from simulator
 * @returns Fuel capacity in gallons
 */
export function getSimulatorFuelCapacity(): number {
  try {
    return (SimVar.GetSimVarValue("FUEL TOTAL CAPACITY", "gallons") as number) || 0;
  } catch {
    return 0;
  }
}
