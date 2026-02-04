/**
 * HangarState - Aircraft hangar management state
 * Extracted from WorldOfAircraft.tsx for better maintainability
 */

import { Subject } from "@microsoft/msfs-sdk";
import type {
  HangarAircraftItem,
  AircraftDetails,
  AircraftSystemsStatus,
  RepairQuote,
  HangarCargoItem,
} from "../types";

// ═══════════════════════════════════════════════════════════
// HANGAR STATE TYPE
// ═══════════════════════════════════════════════════════════

export interface HangarStateType {
  // Aircraft list
  hangarAircraftList: Subject<HangarAircraftItem[]>;
  hangarSelectedAircraft: Subject<AircraftDetails | null>;
  hangarLoading: Subject<boolean>;
  hangarFilter: Subject<string>;

  // Systems
  hangarSystems: Subject<AircraftSystemsStatus | null>;

  // Repair
  hangarRepairQuote: Subject<RepairQuote | null>;

  // Cargo
  hangarCargoItems: Subject<HangarCargoItem[]>;
}

// ═══════════════════════════════════════════════════════════
// STATE INSTANCE
// ═══════════════════════════════════════════════════════════

export const hangarState: HangarStateType = {
  // Aircraft list
  hangarAircraftList: Subject.create<HangarAircraftItem[]>([]),
  hangarSelectedAircraft: Subject.create<AircraftDetails | null>(null),
  hangarLoading: Subject.create(false),
  hangarFilter: Subject.create(""),

  // Systems
  hangarSystems: Subject.create<AircraftSystemsStatus | null>(null),

  // Repair
  hangarRepairQuote: Subject.create<RepairQuote | null>(null),

  // Cargo
  hangarCargoItems: Subject.create<HangarCargoItem[]>([]),
};

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

export const getSelectedAircraft = (): AircraftDetails | null => hangarState.hangarSelectedAircraft.get();
export const getHangarFilter = (): string => hangarState.hangarFilter.get();

export const clearHangarSelection = (): void => {
  hangarState.hangarSelectedAircraft.set(null);
  hangarState.hangarSystems.set(null);
  hangarState.hangarRepairQuote.set(null);
  hangarState.hangarCargoItems.set([]);
};
