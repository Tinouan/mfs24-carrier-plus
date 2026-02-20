/**
 * WearTearReaderService — Passive MSFS W&T SimVar reading (spec Part B)
 *
 * Reads MSFS Wear & Tear SimVars (read-only) and aggregates them
 * by BDD system. Used to detect real-time MSFS failures and merge
 * with BDD state (take the worst).
 *
 * IMPORTANT: SimVar syntax is WITHOUT index prefix (confirmed by tests).
 * e.g. "WEAR AND TEAR LEVEL:35" NOT "1:WEAR AND TEAR LEVEL:35"
 */

import { MSFS_TO_SYSTEM, MSFS_FAILURE_CHECKS } from "../constants/WearConstants";

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface MsfsWearState {
  [system: string]: number; // 0-1, worst component of group
}

export interface MsfsFailures {
  [system: string]: boolean;
}

// ═══════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════

class WearTearReaderServiceClass {
  /**
   * Read all MSFS W&T SimVars and aggregate by BDD system.
   * Returns { system_name: worst_value_0_to_1 }
   */
  readMsfsWearState(): MsfsWearState {
    const systemValues: Record<string, number[]> = {};

    for (const [idStr, system] of Object.entries(MSFS_TO_SYSTEM)) {
      const id = Number(idStr);
      try {
        const value = SimVar.GetSimVarValue(
          `WEAR AND TEAR LEVEL:${id}`,
          "percent over 100"
        ) as number;

        // Ignore 0 values (component absent on this aircraft)
        if (value > 0) {
          if (!systemValues[system]) systemValues[system] = [];
          systemValues[system].push(value);
        }
      } catch {
        // SimVar not available — skip silently
      }
    }

    // Aggregate: MIN (worst value of group)
    const result: MsfsWearState = {};
    for (const [system, values] of Object.entries(systemValues)) {
      result[system] = Math.min(...values);
    }

    return result;
  }

  /**
   * Compare MSFS state with BDD state.
   * Returns the WORST of both for each system.
   * BDD conditions are 0-100, MSFS values are 0-1.
   */
  mergeWithBdd(
    bddConditions: Record<string, number>,
    msfsState: MsfsWearState
  ): Record<string, number> {
    const merged: Record<string, number> = { ...bddConditions };

    for (const [system, msfsValue] of Object.entries(msfsState)) {
      const msfsPercent = msfsValue * 100; // MSFS: 0-1 → 0-100
      const bddKey = `${system}_condition`;
      const bddPercent = bddConditions[bddKey] ?? 100;

      // Take the WORST of both
      merged[bddKey] = Math.min(bddPercent, msfsPercent);
    }

    return merged;
  }

  /**
   * Check if MSFS has triggered any failures (tire burst, etc.)
   * Returns { system: true } for each failed system.
   */
  checkMsfsFailures(): MsfsFailures {
    const failures: MsfsFailures = {};

    for (const check of MSFS_FAILURE_CHECKS) {
      try {
        const isFailed = SimVar.GetSimVarValue(
          `WEAR AND TEAR IS FAILED:${check.id}`,
          "bool"
        ) as boolean;

        if (isFailed) {
          failures[check.system] = true;
        }
      } catch {
        // SimVar not available — skip
      }
    }

    return failures;
  }
}

export const WearTearReaderService = new WearTearReaderServiceClass();
