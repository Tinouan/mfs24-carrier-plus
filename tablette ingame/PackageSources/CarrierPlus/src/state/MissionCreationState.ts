/**
 * MissionCreationState - Step-based mission creation wizard state
 * Extracted from CarrierPlus.tsx for better maintainability
 */

import { Subject } from "@microsoft/msfs-sdk";

// ═══════════════════════════════════════════════════════════
// FLIGHT PLAN SOURCE TYPE
// ═══════════════════════════════════════════════════════════

export type FlightPlanSource = "gps";

// ═══════════════════════════════════════════════════════════
// MISSION CREATION STATE TYPE
// ═══════════════════════════════════════════════════════════

export interface MissionCreationStateType {
  // Step validation
  creationStep1Valid: Subject<boolean>;  // Aircraft selected
  creationStep2Valid: Subject<boolean>;  // Cargo validated
  creationStep3Valid: Subject<boolean>;  // Flight plan validated
  cargoValidated: Subject<boolean>;      // Cargo applied
  creationErrorMsg: Subject<string>;
  canCreateMissionFlag: Subject<boolean>;

  // Flight plan data (MSFS 2024)
  fpDestinationInput: Subject<string>;
  fpOriginIcao: Subject<string>;
  fpDestinationIcao: Subject<string>;
  fpWaypointCount: Subject<number>;
  fpTotalDistance: Subject<number>;
  fpHasActivePlan: Subject<boolean>;
  fpPrevWpId: Subject<string>;
  fpNextWpId: Subject<string>;
  fpValidated: Subject<boolean>;
  fpCanValidate: Subject<boolean>;
  fpSource: Subject<FlightPlanSource>;
  fpRoute: Subject<string>;

  // Fuel management
  fuelTargetPercent: Subject<number>;
  fuelCurrentPercent: Subject<number>;
  fuelCapacityKg: Subject<number>;
}

// ═══════════════════════════════════════════════════════════
// STATE INSTANCE
// ═══════════════════════════════════════════════════════════

export const missionCreationState: MissionCreationStateType = {
  // Step validation
  creationStep1Valid: Subject.create(false),
  creationStep2Valid: Subject.create(false),
  creationStep3Valid: Subject.create(false),
  cargoValidated: Subject.create(false),
  creationErrorMsg: Subject.create(""),
  canCreateMissionFlag: Subject.create(false),

  // Flight plan data
  fpDestinationInput: Subject.create(""),
  fpOriginIcao: Subject.create(""),
  fpDestinationIcao: Subject.create(""),
  fpWaypointCount: Subject.create(0),
  fpTotalDistance: Subject.create(0),
  fpHasActivePlan: Subject.create(false),
  fpPrevWpId: Subject.create(""),
  fpNextWpId: Subject.create(""),
  fpValidated: Subject.create(false),
  fpCanValidate: Subject.create(false),
  fpSource: Subject.create<FlightPlanSource>("gps"),
  fpRoute: Subject.create(""),

  // Fuel management
  fuelTargetPercent: Subject.create(100),
  fuelCurrentPercent: Subject.create(0),
  fuelCapacityKg: Subject.create(0),
};

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

export const canCreateMission = (): boolean => missionCreationState.canCreateMissionFlag.get();
export const getFlightPlanOrigin = (): string => missionCreationState.fpOriginIcao.get();
export const getFlightPlanDestination = (): string => missionCreationState.fpDestinationIcao.get();

export const resetMissionCreation = (): void => {
  missionCreationState.creationStep1Valid.set(false);
  missionCreationState.creationStep2Valid.set(false);
  missionCreationState.creationStep3Valid.set(false);
  missionCreationState.cargoValidated.set(false);
  missionCreationState.creationErrorMsg.set("");
  missionCreationState.canCreateMissionFlag.set(false);
  missionCreationState.fpValidated.set(false);
};
