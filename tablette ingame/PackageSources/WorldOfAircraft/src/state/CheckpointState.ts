/**
 * CheckpointState - Checkpoint display and flight phase state
 * Extracted from WorldOfAircraft.tsx for better maintainability
 */

import { Subject } from "@microsoft/msfs-sdk";

// ═══════════════════════════════════════════════════════════
// FLIGHT PHASE ID TYPE
// ═══════════════════════════════════════════════════════════

export type FlightPhaseId = "none" | "taxi_out" | "climb" | "cruise" | "descent" | "taxi_in";

// ═══════════════════════════════════════════════════════════
// CHECKPOINT STATE TYPE
// ═══════════════════════════════════════════════════════════

export interface CheckpointStateType {
  // Next checkpoint info
  nextCheckpointCoords: Subject<string>;
  nextCheckpointBearing: Subject<number>;
  nextCheckpointDistance: Subject<string>;
  nextCheckpointETA: Subject<string>;

  // Checkpoint list display (8 lines max)
  checkpointLine0: Subject<string>;
  checkpointLine1: Subject<string>;
  checkpointLine2: Subject<string>;
  checkpointLine3: Subject<string>;
  checkpointLine4: Subject<string>;
  checkpointLine5: Subject<string>;
  checkpointLine6: Subject<string>;
  checkpointLine7: Subject<string>;

  // Flight phase display
  flightPhaseIcon: Subject<string>;
  flightPhaseText: Subject<string>;
  flightPhaseColor: Subject<string>;
  flightPhaseId: Subject<FlightPhaseId>;
}

// ═══════════════════════════════════════════════════════════
// STATE INSTANCE
// ═══════════════════════════════════════════════════════════

export const checkpointState: CheckpointStateType = {
  // Next checkpoint info
  nextCheckpointCoords: Subject.create("---"),
  nextCheckpointBearing: Subject.create(0),
  nextCheckpointDistance: Subject.create("---"),
  nextCheckpointETA: Subject.create("---"),

  // Checkpoint list display
  checkpointLine0: Subject.create(""),
  checkpointLine1: Subject.create(""),
  checkpointLine2: Subject.create(""),
  checkpointLine3: Subject.create(""),
  checkpointLine4: Subject.create(""),
  checkpointLine5: Subject.create(""),
  checkpointLine6: Subject.create(""),
  checkpointLine7: Subject.create(""),

  // Flight phase display (text labels for Coherent GT compatibility)
  flightPhaseIcon: Subject.create("[DEP]"),
  flightPhaseText: Subject.create("EN ATTENTE"),
  flightPhaseColor: Subject.create("#9ca3af"),
  flightPhaseId: Subject.create<FlightPhaseId>("none"),
};

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

export const getCheckpointLines = (): string[] => [
  checkpointState.checkpointLine0.get(),
  checkpointState.checkpointLine1.get(),
  checkpointState.checkpointLine2.get(),
  checkpointState.checkpointLine3.get(),
  checkpointState.checkpointLine4.get(),
  checkpointState.checkpointLine5.get(),
  checkpointState.checkpointLine6.get(),
  checkpointState.checkpointLine7.get(),
];

export const setCheckpointLine = (index: number, value: string): void => {
  const lines = [
    checkpointState.checkpointLine0,
    checkpointState.checkpointLine1,
    checkpointState.checkpointLine2,
    checkpointState.checkpointLine3,
    checkpointState.checkpointLine4,
    checkpointState.checkpointLine5,
    checkpointState.checkpointLine6,
    checkpointState.checkpointLine7,
  ];
  if (index >= 0 && index < lines.length) {
    lines[index].set(value);
  }
};

export const clearCheckpointLines = (): void => {
  checkpointState.checkpointLine0.set("");
  checkpointState.checkpointLine1.set("");
  checkpointState.checkpointLine2.set("");
  checkpointState.checkpointLine3.set("");
  checkpointState.checkpointLine4.set("");
  checkpointState.checkpointLine5.set("");
  checkpointState.checkpointLine6.set("");
  checkpointState.checkpointLine7.set("");
};
