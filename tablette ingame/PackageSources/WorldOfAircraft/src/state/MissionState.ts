/**
 * MissionState - Active mission state
 * Extracted from WorldOfAircraft.tsx for better maintainability
 */

import { Subject } from "@microsoft/msfs-sdk";
import type {
  ActiveMission,
  MissionRecapData,
  MissionCheckpoint,
  MissionCreationStatus,
  XpEstimate,
  MissionAircraftInfo,
  AircraftSystemsStatus,
} from "../types";

// ═══════════════════════════════════════════════════════════
// MISSION STATE TYPE
// ═══════════════════════════════════════════════════════════

export interface MissionStateType {
  // Mission selection
  selectedAircraftId: Subject<string | null>;
  missionStatus: Subject<MissionCreationStatus>;
  missionError: Subject<string | null>;

  // Active mission
  activeMission: Subject<ActiveMission | null>;
  missionOriginIcao: Subject<string | null>;
  missionDistanceNm: Subject<number>;

  // Mission recap
  missionRecapData: Subject<MissionRecapData | null>;

  // Modifiers
  selectedModifiers: Subject<string[]>;
  xpEstimate: Subject<XpEstimate | null>;

  // Checkpoints
  missionCheckpoints: Subject<MissionCheckpoint[]>;
  checkpointsValidated: Subject<number>;
  checkpointsTotal: Subject<number>;
  nextCheckpoint: Subject<number>;

  // Waypoints (V2.0)
  waypointsPassed: Subject<number>;
  waypointsTotal: Subject<number>;

  // Current aircraft for mission
  missionCurrentAircraft: Subject<MissionAircraftInfo | null>;
  missionAircraftLoading: Subject<boolean>;
  missionAircraftNotFound: Subject<boolean>;
  missionAircraftSystems: Subject<Pick<AircraftSystemsStatus, "warnings" | "critical" | "can_takeoff"> | null>;
}

// ═══════════════════════════════════════════════════════════
// STATE INSTANCE
// ═══════════════════════════════════════════════════════════

export const missionState: MissionStateType = {
  // Mission selection
  selectedAircraftId: Subject.create<string | null>(null),
  missionStatus: Subject.create<MissionCreationStatus>("idle"),
  missionError: Subject.create<string | null>(null),

  // Active mission
  activeMission: Subject.create<ActiveMission | null>(null),
  missionOriginIcao: Subject.create<string | null>(null),
  missionDistanceNm: Subject.create(0),

  // Mission recap
  missionRecapData: Subject.create<MissionRecapData | null>(null),

  // Modifiers
  selectedModifiers: Subject.create<string[]>([]),
  xpEstimate: Subject.create<XpEstimate | null>(null),

  // Checkpoints
  missionCheckpoints: Subject.create<MissionCheckpoint[]>([]),
  checkpointsValidated: Subject.create(0),
  checkpointsTotal: Subject.create(0),
  nextCheckpoint: Subject.create(1),

  // Waypoints (V2.0)
  waypointsPassed: Subject.create(0),
  waypointsTotal: Subject.create(0),

  // Current aircraft for mission
  missionCurrentAircraft: Subject.create<MissionAircraftInfo | null>(null),
  missionAircraftLoading: Subject.create(false),
  missionAircraftNotFound: Subject.create(false),
  missionAircraftSystems: Subject.create<Pick<AircraftSystemsStatus, "warnings" | "critical" | "can_takeoff"> | null>(null),
};

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

export const getActiveMission = (): ActiveMission | null => missionState.activeMission.get();
export const hasMissionActive = (): boolean => missionState.activeMission.get() !== null;
export const getMissionCheckpoints = (): MissionCheckpoint[] => missionState.missionCheckpoints.get();
