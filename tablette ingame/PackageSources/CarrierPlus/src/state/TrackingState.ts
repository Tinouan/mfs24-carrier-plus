/**
 * TrackingState - Live flight tracking UI variables
 * Extracted from CarrierPlus.tsx for better maintainability
 */

import { Subject } from "@microsoft/msfs-sdk";

// ═══════════════════════════════════════════════════════════
// TRACKING STATE TYPE
// ═══════════════════════════════════════════════════════════

export interface TrackingStateType {
  // Progress
  trackingDistanceFlown: Subject<number>;
  trackingProgressPercent: Subject<number>;
  trackingCurrentAltitude: Subject<number>;

  // Fuel
  trackingFuelPercent: Subject<number>;
  trackingFuelUsed: Subject<number>;
  trackingFuelMax: Subject<number>;

  // Simulation
  trackingSimRate: Subject<number>;
  trackingCanAccelerate: Subject<boolean>;
  trackingApActive: Subject<boolean>;

  // Time
  trackingRealTime: Subject<string>;
  trackingSimTime: Subject<string>;
  trackingTimeRatio: Subject<number>;

  // Bonuses
  trackingBonusNight: Subject<number>;
  trackingBonusCargo: Subject<number>;
  trackingBonusEco: Subject<number>;
  trackingBonusLanding: Subject<string>;
  trackingBonusRealTime: Subject<number>;

  // Cargo
  trackingCargoExpected: Subject<number>;
  trackingCargoActual: Subject<number>;

  // ATC Compliance
  trackingAtcCompliance: Subject<number>;
  trackingAtcViolations: Subject<number>;
}

// ═══════════════════════════════════════════════════════════
// STATE INSTANCE
// ═══════════════════════════════════════════════════════════

export const trackingState: TrackingStateType = {
  // Progress
  trackingDistanceFlown: Subject.create(0),
  trackingProgressPercent: Subject.create(0),
  trackingCurrentAltitude: Subject.create(0),

  // Fuel
  trackingFuelPercent: Subject.create(100),
  trackingFuelUsed: Subject.create(0),
  trackingFuelMax: Subject.create(0),

  // Simulation
  trackingSimRate: Subject.create(1),
  trackingCanAccelerate: Subject.create(false),
  trackingApActive: Subject.create(false),

  // Time
  trackingRealTime: Subject.create("0:00:00"),
  trackingSimTime: Subject.create("0:00:00"),
  trackingTimeRatio: Subject.create(100),

  // Bonuses
  trackingBonusNight: Subject.create(0),
  trackingBonusCargo: Subject.create(100),
  trackingBonusEco: Subject.create(100),
  trackingBonusLanding: Subject.create("--"),
  trackingBonusRealTime: Subject.create(100),

  // Cargo
  trackingCargoExpected: Subject.create(0),
  trackingCargoActual: Subject.create(0),

  // ATC Compliance
  trackingAtcCompliance: Subject.create(100),
  trackingAtcViolations: Subject.create(0),
};

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

export const getTrackingProgress = (): number => trackingState.trackingProgressPercent.get();

export const resetTracking = (): void => {
  trackingState.trackingDistanceFlown.set(0);
  trackingState.trackingProgressPercent.set(0);
  trackingState.trackingFuelPercent.set(100);
  trackingState.trackingFuelUsed.set(0);
  trackingState.trackingRealTime.set("0:00:00");
  trackingState.trackingSimTime.set("0:00:00");
  trackingState.trackingTimeRatio.set(100);
  trackingState.trackingAtcCompliance.set(100);
  trackingState.trackingAtcViolations.set(0);
};
