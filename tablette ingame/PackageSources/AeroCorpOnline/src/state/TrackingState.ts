/**
 * TrackingState - Live flight tracking UI variables
 * Extracted from AeroCorpOnline.tsx for better maintainability
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

  // V2: Grade estimation (real-time)
  trackingGradeEstimated: Subject<string>;
  trackingScoreEstimated: Subject<number>;
  trackingScoreGforce: Subject<number>;
  trackingGforceAlert: Subject<string>;   // "ok" | "warning" | "critical"
  trackingCargoFillPercent: Subject<number>;

  // V2: ATC Suivi
  trackingAtcAssignedAlt: Subject<number>;
  trackingAtcAltDeviation: Subject<boolean>;
  trackingAtcCruiseSpd: Subject<number>;
  trackingAtcSpdDeviation: Subject<boolean>;

  // V3: Lights tracking — 4 states: 0=grey, 1=green, 2=red, 3=orange
  trackingLightNav: Subject<number>;
  trackingLightStrobe: Subject<number>;
  trackingLightBeacon: Subject<number>;
  trackingLightLanding: Subject<number>;
  trackingLightTaxi: Subject<number>;
  trackingLightsMissing: Subject<number>;       // count of OFF+required
  trackingLightsUnnecessary: Subject<number>;   // count of ON+not required
  trackingLightsStatusColor: Subject<string>;   // "green" | "red" | "orange"
  trackingLightsAlert: Subject<string>;         // contextual alert ("" if OK)

  // V5: Suivi vol — mode, route, cruise status
  trackingSuiviAtcMode: Subject<string>;       // 'native' | 'gps_fallback'
  trackingSuiviCrossTrackNm: Subject<number>;  // cross-track deviation in nm
  trackingSuiviRouteStatus: Subject<string>;   // 'ok' | 'warning' | 'error'
  trackingSuiviInCruise: Subject<boolean>;     // CRUISE phase active
  trackingSuiviAlert: Subject<string>;         // contextual alert ("" if OK)

  // V6: Weather
  trackingWeatherScore: Subject<number>;        // 0-100 (normalized difficulty %)
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

  // V2: Grade estimation
  trackingGradeEstimated: Subject.create("--"),
  trackingScoreEstimated: Subject.create(0),
  trackingScoreGforce: Subject.create(200),
  trackingGforceAlert: Subject.create("ok"),
  trackingCargoFillPercent: Subject.create(0),

  // V2: ATC Suivi
  trackingAtcAssignedAlt: Subject.create(0),
  trackingAtcAltDeviation: Subject.create(false),
  trackingAtcCruiseSpd: Subject.create(0),
  trackingAtcSpdDeviation: Subject.create(false),

  // V3: Lights tracking — 4 states: 0=grey, 1=green, 2=red, 3=orange
  trackingLightNav: Subject.create(0),
  trackingLightStrobe: Subject.create(0),
  trackingLightBeacon: Subject.create(0),
  trackingLightLanding: Subject.create(0),
  trackingLightTaxi: Subject.create(0),
  trackingLightsMissing: Subject.create(0),
  trackingLightsUnnecessary: Subject.create(0),
  trackingLightsStatusColor: Subject.create("green"),
  trackingLightsAlert: Subject.create(""),

  // V5: Suivi vol
  trackingSuiviAtcMode: Subject.create("gps_fallback"),
  trackingSuiviCrossTrackNm: Subject.create(0),
  trackingSuiviRouteStatus: Subject.create("ok"),
  trackingSuiviInCruise: Subject.create(false),
  trackingSuiviAlert: Subject.create(""),

  // V6: Weather
  trackingWeatherScore: Subject.create(0),
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
  // V2 fields
  trackingState.trackingGradeEstimated.set("--");
  trackingState.trackingScoreEstimated.set(0);
  trackingState.trackingScoreGforce.set(200);
  trackingState.trackingGforceAlert.set("ok");
  trackingState.trackingCargoFillPercent.set(0);
  trackingState.trackingAtcAssignedAlt.set(0);
  trackingState.trackingAtcAltDeviation.set(false);
  trackingState.trackingAtcCruiseSpd.set(0);
  trackingState.trackingAtcSpdDeviation.set(false);
  // V3: Lights
  trackingState.trackingLightNav.set(0);
  trackingState.trackingLightStrobe.set(0);
  trackingState.trackingLightBeacon.set(0);
  trackingState.trackingLightLanding.set(0);
  trackingState.trackingLightTaxi.set(0);
  trackingState.trackingLightsMissing.set(0);
  trackingState.trackingLightsUnnecessary.set(0);
  trackingState.trackingLightsStatusColor.set("green");
  trackingState.trackingLightsAlert.set("");
  // V5: Suivi vol
  trackingState.trackingSuiviAtcMode.set("gps_fallback");
  trackingState.trackingSuiviCrossTrackNm.set(0);
  trackingState.trackingSuiviRouteStatus.set("ok");
  trackingState.trackingSuiviInCruise.set(false);
  trackingState.trackingSuiviAlert.set("");
  // V6: Weather
  trackingState.trackingWeatherScore.set(0);
};
