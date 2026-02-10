/**
 * SimVarHelpers - Utility functions for MSFS SimVar operations
 * Extracted from WorldOfAircraft.tsx for reusability
 */

// Global MSFS declarations in src/types/msfs-globals.d.ts

// ═══════════════════════════════════════════════════════════════════════════
// FUEL MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Set fuel in simulator by writing to all fuel tanks
 * FUEL TOTAL QUANTITY is read-only, so we need to set individual tank levels
 *
 * @param targetGallons - Target fuel amount in gallons
 * @param capacityGallons - Fuel capacity in gallons
 */
export function setSimulatorFuel(targetGallons: number, capacityGallons: number): void {
  // Calculate target level as percentage (0.0 to 1.0)
  const targetLevel = Math.min(1.0, Math.max(0.0, targetGallons / capacityGallons));
  console.log(`[SimVarHelpers] Setting fuel level to ${(targetLevel * 100).toFixed(1)}%`);

  // List of all possible fuel tanks in MSFS
  // We set ALL tanks to the same level percentage
  const fuelTanks = [
    "FUEL TANK CENTER LEVEL",
    "FUEL TANK LEFT MAIN LEVEL",
    "FUEL TANK RIGHT MAIN LEVEL",
    "FUEL TANK LEFT AUX LEVEL",
    "FUEL TANK RIGHT AUX LEVEL",
    "FUEL TANK LEFT TIP LEVEL",
    "FUEL TANK RIGHT TIP LEVEL",
    "FUEL TANK EXTERNAL1 LEVEL",
    "FUEL TANK EXTERNAL2 LEVEL",
    "FUEL TANK CENTER2 LEVEL",
    "FUEL TANK CENTER3 LEVEL",
  ];

  // Set each tank to the target level
  for (const tank of fuelTanks) {
    try {
      SimVar.SetSimVarValue(tank, "percent over 100", targetLevel);
    } catch {
      // Tank doesn't exist on this aircraft, ignore
    }
  }

  console.log("[SimVarHelpers] Fuel written to simulator tanks");
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
