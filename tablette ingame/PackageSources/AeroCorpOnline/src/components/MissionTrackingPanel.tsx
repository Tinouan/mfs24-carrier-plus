/**
 * MissionTrackingPanel - Live mission tracking UI component V2
 * Layout: Progression, Phase+Grade, G-Force+Time, ATC Suivi, Modifiers, Cancel
 * Reference: grade-tracking-v3.html
 */
import { FSComponent, VNode, Subject, MappedSubject } from "@microsoft/msfs-sdk";
import { Button } from "@efb/efb-api";
import type { Language, ActiveMission, MissionsSubTab } from "../types";
import type { FlightPhaseId } from "../state/CheckpointState";
import { renderFreeFlightPanel } from "./FreeFlightPanel";

import frTranslations from "../locales/fr.json";
import enTranslations from "../locales/en.json";
import deTranslations from "../locales/de.json";
import esTranslations from "../locales/es.json";
import ruTranslations from "../locales/ru.json";

const translations = {
  en: enTranslations,
  fr: frTranslations,
  de: deTranslations,
  es: esTranslations,
  ru: ruTranslations,
} as const;

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function getGradeColor(grade: string): string {
  switch (grade) {
    case "S": return "#eab308";
    case "A": return "#22c55e";
    case "B": return "#f59e0b";
    case "C": return "#e2e2e8";
    case "D": case "E": case "F": return "#ef4444";
    default: return "#4b5563";
  }
}

function getCargoMultLabel(fillPct: number): string {
  if (fillPct >= 76) return "x1.5";
  if (fillPct >= 51) return "x1.3";
  if (fillPct >= 26) return "x1.2";
  if (fillPct >= 1) return "x1.1";
  return "x1.0";
}

function getFuelBonusLabel(fuelPct: number): string {
  if (fuelPct >= 25) return "+20%";
  if (fuelPct >= 20) return "+15%";
  if (fuelPct >= 15) return "+10%";
  if (fuelPct >= 10) return "+5%";
  return "";
}

function getRealTimeLabel(ratio: number): string {
  if (ratio >= 100) return "x2.0";
  if (ratio >= 90) return "x1.7";
  if (ratio >= 75) return "x1.5";
  if (ratio >= 50) return "x1.3";
  if (ratio >= 25) return "x1.15";
  return "";
}

function getLightItemStyle(state: number): string {
  // 0=grey(off,not required), 1=green(on+required), 2=red(off+required), 3=orange(on+not required)
  if (state === 1) return "width: calc(33.33% - 3px); padding: 4px 6px; border-radius: 4px; display: flex; align-items: center; gap: 4px; background: #1e3a2a;";
  if (state === 2) return "width: calc(33.33% - 3px); padding: 4px 6px; border-radius: 4px; display: flex; align-items: center; gap: 4px; background: #351a1a; border: 1px solid rgba(239, 68, 68, 0.25);";
  if (state === 3) return "width: calc(33.33% - 3px); padding: 4px 6px; border-radius: 4px; display: flex; align-items: center; gap: 4px; background: #352a10; border: 1px solid rgba(245, 158, 11, 0.25);";
  return "width: calc(33.33% - 3px); padding: 4px 6px; border-radius: 4px; display: flex; align-items: center; gap: 4px; background: #162016;";
}

function getLightDotStyle(state: number): string {
  if (state === 1) return "width: 6px; height: 6px; border-radius: 50%; background: #22c55e; flex-shrink: 0;";
  if (state === 2) return "width: 6px; height: 6px; border-radius: 50%; background: #ef4444; flex-shrink: 0;";
  if (state === 3) return "width: 6px; height: 6px; border-radius: 50%; background: #f59e0b; flex-shrink: 0;";
  return "width: 6px; height: 6px; border-radius: 50%; background: #4b5563; flex-shrink: 0;";
}

function getLightTextStyle(state: number): string {
  if (state === 1) return "font-size: 10px; font-weight: 600; color: #22c55e;";
  if (state === 2) return "font-size: 10px; font-weight: 600; color: #ef4444;";
  if (state === 3) return "font-size: 10px; font-weight: 600; color: #f59e0b;";
  return "font-size: 10px; font-weight: 600; color: #6b7280;";
}

function formatFL(alt: number): string {
  if (alt >= 18000) return `FL${Math.round(alt / 100)}`;
  if (alt > 0) return `${Math.round(alt)} ft`;
  return "--";
}

// ═══════════════════════════════════════════════════════════
// PROPS INTERFACE
// ═══════════════════════════════════════════════════════════

export interface MissionTrackingPanelProps {
  missionsSubTab: Subject<MissionsSubTab>;
  isLoggedIn: Subject<boolean>;
  currentLanguage: Subject<Language>;
  activeMission: Subject<ActiveMission | null>;
  trackingProgressPercent: Subject<number>;
  trackingDistanceFlown: Subject<number>;
  missionDistanceNm: Subject<number>;
  flightPhaseColor: Subject<string>;
  flightPhaseText: Subject<string>;
  flightPhaseId: Subject<FlightPhaseId>;
  trackingCurrentAltitude: Subject<number>;
  trackingCanAccelerate: Subject<boolean>;
  trackingBonusNight: Subject<number>;
  trackingBonusCargo: Subject<number>;
  trackingBonusEco: Subject<number>;
  trackingBonusRealTime: Subject<number>;
  trackingTimeRatio: Subject<number>;
  trackingAtcCompliance: Subject<number>;
  trackingAtcViolations: Subject<number>;
  trackingCargoActual: Subject<number>;
  trackingCargoExpected: Subject<number>;
  trackingFuelUsed: Subject<number>;
  trackingFuelMax: Subject<number>;
  gForce: Subject<number>;
  trackingFuelPercent: Subject<number>;
  waypointsPassed: Subject<number>;
  waypointsTotal: Subject<number>;
  trackingRealTime: Subject<string>;
  trackingSimTime: Subject<string>;
  // V2: Grade estimation + ATC suivi
  trackingGradeEstimated: Subject<string>;
  trackingScoreEstimated: Subject<number>;
  trackingScoreGforce: Subject<number>;
  trackingGforceAlert: Subject<string>;
  trackingCargoFillPercent: Subject<number>;
  trackingAtcAssignedAlt: Subject<number>;
  trackingAtcAltDeviation: Subject<boolean>;
  trackingAtcCruiseSpd: Subject<number>;
  trackingAtcSpdDeviation: Subject<boolean>;
  trackingSimRate: Subject<number>;
  // V3: Lights
  trackingLightNav: Subject<number>;
  trackingLightStrobe: Subject<number>;
  trackingLightBeacon: Subject<number>;
  trackingLightLanding: Subject<number>;
  trackingLightTaxi: Subject<number>;
  trackingLightsMissing: Subject<number>;
  trackingLightsUnnecessary: Subject<number>;
  trackingLightsStatusColor: Subject<string>;
  trackingLightsAlert: Subject<string>;
  // V5: Suivi vol
  trackingSuiviAtcMode: Subject<string>;
  trackingSuiviCrossTrackNm: Subject<number>;
  trackingSuiviRouteStatus: Subject<string>;
  trackingSuiviInCruise: Subject<boolean>;
  trackingSuiviAlert: Subject<string>;
  // V6: Weather
  trackingWeatherScore: Subject<number>;
  // Callbacks
  onCancelMission: () => Promise<void>;
  onGoToCreation: () => void;
}

// ═══════════════════════════════════════════════════════════
// RENDER FUNCTION
// ═══════════════════════════════════════════════════════════

export function renderMissionTrackingPanel(props: MissionTrackingPanelProps): VNode {
  const {
    missionsSubTab, isLoggedIn, currentLanguage, activeMission,
    trackingProgressPercent, trackingDistanceFlown, missionDistanceNm,
    flightPhaseColor, flightPhaseText, flightPhaseId, trackingCurrentAltitude,
    trackingBonusNight, trackingTimeRatio, trackingFuelPercent,
    gForce, trackingRealTime,
    trackingGradeEstimated, trackingScoreEstimated, trackingScoreGforce,
    trackingGforceAlert, trackingCargoFillPercent,
    trackingAtcAssignedAlt, trackingAtcAltDeviation,
    trackingAtcCruiseSpd, trackingAtcSpdDeviation,
    trackingLightNav, trackingLightStrobe, trackingLightBeacon,
    trackingLightLanding, trackingLightTaxi, trackingLightsMissing,
    trackingLightsUnnecessary, trackingLightsStatusColor, trackingLightsAlert,
    trackingSuiviAtcMode, trackingSuiviCrossTrackNm, trackingSuiviRouteStatus,
    trackingSuiviInCruise, trackingSuiviAlert,
    trackingWeatherScore,
    onCancelMission, onGoToCreation,
  } = props;

  // Combined subjects — V5: Suivi vol alert (includes route status)
  const suiviHasAlert = MappedSubject.create(
    ([alert]: readonly [string]) => alert.length > 0,
    trackingSuiviAlert
  );

  // V5: Suivi vol — altitude status text
  const suiviAltStatusText = MappedSubject.create(
    ([dev, alt, inCruise]: readonly [boolean, number, boolean]) => {
      if (!inCruise) return "En transition";
      return dev ? `${Math.round(alt)} ft actuel` : "Respectee";
    },
    trackingAtcAltDeviation, trackingCurrentAltitude, trackingSuiviInCruise
  );

  // V5: Suivi vol — speed status text
  const suiviSpdStatusText = MappedSubject.create(
    ([dev, inCruise]: readonly [boolean, boolean]) => {
      if (!inCruise) return "En transition";
      return dev ? "Non respectee" : "Respectee";
    },
    trackingAtcSpdDeviation, trackingSuiviInCruise
  );

  // V5: Suivi vol — altitude display with mode suffix
  const suiviAltDisplay = MappedSubject.create(
    ([alt, mode]: readonly [number, string]) => {
      const fl = formatFL(alt);
      return mode === 'gps_fallback' && alt > 0 ? `${fl} rec.` : fl;
    },
    trackingAtcAssignedAlt, trackingSuiviAtcMode
  );

  // V5: Route status dot color
  const routeDotColor = trackingSuiviRouteStatus.map(s => {
    if (s === "error") return "#ef4444";
    if (s === "warning") return "#f59e0b";
    return "#22c55e";
  });

  // V5: Route status text color
  const routeTextColor = trackingSuiviRouteStatus.map(s => {
    if (s === "error") return "#ef4444";
    if (s === "warning") return "#f59e0b";
    return "#22c55e";
  });

  const routeStatusText = MappedSubject.create(
    ([nm, status]: readonly [number, string]) => {
      if (status === "error") return "Hors route";
      if (status === "warning") return "Ecart";
      return "En route";
    },
    trackingSuiviCrossTrackNm, trackingSuiviRouteStatus
  );

  // V5: Pre-created subjects for altitude column (avoid inline MappedSubject in JSX)
  const suiviAltValueStyle = MappedSubject.create(
    ([dev, inCruise]: readonly [boolean, boolean]) => {
      if (!inCruise) return "font-family: monospace; font-size: 16px; font-weight: 600; color: #4b5563;";
      return dev
        ? "font-family: monospace; font-size: 16px; font-weight: 600; color: #f59e0b;"
        : "font-family: monospace; font-size: 16px; font-weight: 600; color: #e2e2e8;";
    },
    trackingAtcAltDeviation, trackingSuiviInCruise
  );
  const suiviAltValueText = MappedSubject.create(
    ([inCruise, display]: readonly [boolean, string]) => inCruise ? display : "--",
    trackingSuiviInCruise, suiviAltDisplay
  );
  const suiviAltDotStyle = MappedSubject.create(
    ([dev, inCruise]: readonly [boolean, boolean]) => {
      if (!inCruise) return "width: 6px; height: 6px; border-radius: 50%; background: #4b5563; flex-shrink: 0;";
      return dev
        ? "width: 6px; height: 6px; border-radius: 50%; background: #f59e0b; flex-shrink: 0;"
        : "width: 6px; height: 6px; border-radius: 50%; background: #22c55e; flex-shrink: 0;";
    },
    trackingAtcAltDeviation, trackingSuiviInCruise
  );
  const suiviAltTextStyle = MappedSubject.create(
    ([dev, inCruise]: readonly [boolean, boolean]) => {
      if (!inCruise) return "font-size: 10px; color: #4b5563;";
      return dev ? "font-size: 10px; color: #f59e0b;" : "font-size: 10px; color: #22c55e;";
    },
    trackingAtcAltDeviation, trackingSuiviInCruise
  );

  // V5: Pre-created subjects for speed column
  const suiviSpdValueStyle = MappedSubject.create(
    ([dev, inCruise]: readonly [boolean, boolean]) => {
      if (!inCruise) return "font-family: monospace; font-size: 16px; font-weight: 600; color: #4b5563;";
      return dev
        ? "font-family: monospace; font-size: 16px; font-weight: 600; color: #f59e0b;"
        : "font-family: monospace; font-size: 16px; font-weight: 600; color: #e2e2e8;";
    },
    trackingAtcSpdDeviation, trackingSuiviInCruise
  );
  const suiviSpdValueText = MappedSubject.create(
    ([spd, inCruise]: readonly [number, boolean]) => inCruise && spd > 0 ? `${Math.round(spd)}` : "--",
    trackingAtcCruiseSpd, trackingSuiviInCruise
  );
  const suiviSpdDotStyle = MappedSubject.create(
    ([dev, inCruise]: readonly [boolean, boolean]) => {
      if (!inCruise) return "width: 6px; height: 6px; border-radius: 50%; background: #4b5563; flex-shrink: 0;";
      return dev
        ? "width: 6px; height: 6px; border-radius: 50%; background: #f59e0b; flex-shrink: 0;"
        : "width: 6px; height: 6px; border-radius: 50%; background: #22c55e; flex-shrink: 0;";
    },
    trackingAtcSpdDeviation, trackingSuiviInCruise
  );
  const suiviSpdTextStyle = MappedSubject.create(
    ([dev, inCruise]: readonly [boolean, boolean]) => {
      if (!inCruise) return "font-size: 10px; color: #4b5563;";
      return dev ? "font-size: 10px; color: #f59e0b;" : "font-size: 10px; color: #22c55e;";
    },
    trackingAtcSpdDeviation, trackingSuiviInCruise
  );

  const gforceStatusText = MappedSubject.create(
    ([alert, score]: readonly [string, number]) => {
      if (alert === "critical") return `CRITIQUE - ${score}/200 pts`;
      if (alert === "warning") return `ATTENTION - ${score}/200 pts`;
      return `OK - ${score}/200 pts`;
    },
    trackingGforceAlert, trackingScoreGforce
  );

  const lightsStatusText = MappedSubject.create(
    ([missing, unnecessary]: readonly [number, number]) => {
      if (missing > 0) return `${missing} OFF`;
      if (unnecessary > 0) return `${unnecessary} ON`;
      return "OK";
    },
    trackingLightsMissing, trackingLightsUnnecessary
  );

  const gradeBarFillStyle = MappedSubject.create(
    ([score, grade]: readonly [number, string]) => {
      const pct = Math.min(100, score / 10);
      const c = getGradeColor(grade);
      return `position: absolute; left: 0; top: 0; width: ${pct}%; height: 100%; background: ${c}; border-radius: 3px;`;
    },
    trackingScoreEstimated, trackingGradeEstimated
  );

  const gradeLetters = ["F", "E", "D", "C", "B", "A", "S"];

  return (
    <div style={missionsSubTab.map(tab => tab === "en-cours" ? "padding: 16px; color: white;" : "display: none;")}>
      {/* Not logged in */}
      <div style={isLoggedIn.map(l => l ? "display: none;" : "display: block;")}>
        <div style="background: rgba(245, 158, 11, 0.15); border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; text-align: center;">
          <div style="color: #f59e0b; font-size: 13px; font-weight: 600; margin-bottom: 4px;">
            {currentLanguage.map(l => translations[l].missions.loginRequired)}
          </div>
          <div style="color: #9ca3af; font-size: 11px;">
            {currentLanguage.map(l => translations[l].missions.loginToSeeMissions)}
          </div>
        </div>
      </div>

      {/* Logged in */}
      <div style={isLoggedIn.map(l => l ? "display: block;" : "display: none;")}>
        <div style="background: #13131f; border-radius: 16px; border: 1px solid #2a2a3d; overflow: hidden;">

          {/* Header label */}
          <div style="padding: 16px 24px 0;">
            <div style="font-size: 10px; letter-spacing: 2.5px; text-transform: uppercase; color: #4b5563; font-weight: 600; margin-bottom: 12px;">
              {currentLanguage.map(l => translations[l].missions.current)}
            </div>
          </div>

          {/* No active mission — Free Flight */}
          <div style={activeMission.map(m => m ? "display: none;" : "padding: 0 24px 16px;")}>
            {renderFreeFlightPanel({ currentLanguage, onGoToCreation })}
          </div>

          {/* Active mission tracking */}
          <div style={activeMission.map(m => m ? "display: block;" : "display: none;")}>

            {/* ═══ PROGRESSION ═══ */}
            <div style="padding: 0 24px 12px; border-bottom: 1px solid #2a2a3d;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                <div style="font-size: 16px; font-weight: 700; color: #f0f0f5;">
                  {activeMission.map(m => m?.origin_icao || "----")}
                </div>
                <div style="flex: 1; margin: 0 14px; height: 4px; background: #2a2a3d; border-radius: 2px; position: relative;">
                  <div style={trackingProgressPercent.map(p => `position: absolute; left: 0; top: 0; height: 100%; background: #3b82f6; border-radius: 2px; width: ${p}%;`)}></div>
                </div>
                <div style="font-size: 16px; font-weight: 700; color: #f0f0f5;">
                  {activeMission.map(m => m?.destination_icao || "----")}
                </div>
              </div>
              <div style="text-align: center; margin-bottom: 4px;">
                <span style="font-family: monospace; font-size: 14px; font-weight: 700; color: #3b82f6;">{trackingProgressPercent}%</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-family: monospace; font-size: 11px; color: #6b7280;">
                  {trackingDistanceFlown.map(d => `${d.toFixed(0)} nm`)}
                </span>
                <span style="font-family: monospace; font-size: 12px; font-weight: 600; color: #e2e2e8;">
                  {trackingRealTime}
                </span>
                <span style="font-family: monospace; font-size: 11px; color: #6b7280;">
                  {missionDistanceNm.map(total => {
                    const flown = trackingDistanceFlown.get();
                    return `${Math.max(0, total - flown).toFixed(0)} nm`;
                  })}
                </span>
              </div>
            </div>

            {/* ═══ PHASE + GRADE ═══ */}
            <div style="display: flex; gap: 12px; padding: 14px 24px; border-bottom: 1px solid #2a2a3d;">
              {/* Phase card */}
              <div style="flex: 1; background: #1a1a2a; border-radius: 10px; padding: 12px 14px;">
                <div style="font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #4b5563; margin-bottom: 8px;">{currentLanguage.map(l => (translations[l] as any).tracking.flightPhase)}</div>
                <div style="text-align: center;">
                  <div style={flightPhaseColor.map(c => `display: inline-block; padding: 4px 16px; border: 1px solid ${c}; border-radius: 6px; font-family: monospace; font-size: 12px; font-weight: 600; color: ${c};`)}>
                    {flightPhaseText}
                  </div>
                </div>
                <div style="text-align: center; font-family: monospace; font-size: 13px; color: #e2e2e8; margin-top: 6px;">
                  {trackingCurrentAltitude.map(a => formatFL(a))}
                </div>
                <div style="display: flex; justify-content: space-between; margin-top: 8px; padding: 0 4px;">
                  <span style={flightPhaseId.map(p => p === "taxi_out" ? "font-size: 9px; color: #22c55e; font-weight: 600;" : "font-size: 9px; color: #4b5563;")}>Roul</span>
                  <span style={flightPhaseId.map(p => p === "climb" ? "font-size: 9px; color: #f59e0b; font-weight: 600;" : "font-size: 9px; color: #4b5563;")}>Montee</span>
                  <span style={flightPhaseId.map(p => p === "cruise" ? "font-size: 9px; color: #22c55e; font-weight: 600;" : "font-size: 9px; color: #4b5563;")}>Crois</span>
                  <span style={flightPhaseId.map(p => p === "descent" ? "font-size: 9px; color: #f59e0b; font-weight: 600;" : "font-size: 9px; color: #4b5563;")}>Desc</span>
                  <span style={flightPhaseId.map(p => p === "taxi_in" ? "font-size: 9px; color: #22c55e; font-weight: 600;" : "font-size: 9px; color: #4b5563;")}>Roul</span>
                </div>
              </div>

              {/* Grade estimé card */}
              <div style="flex: 1; background: #1a1a2a; border-radius: 10px; padding: 12px 14px;">
                <div style="font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #4b5563; margin-bottom: 8px;">{currentLanguage.map(l => `${(translations[l] as any).tracking.grade} ${(translations[l] as any).tracking.estimated}`)}</div>
                <div style="display: flex; align-items: center; gap: 12px;">
                  {/* Grade circle */}
                  <div style={trackingGradeEstimated.map(g => {
                    const c = getGradeColor(g);
                    return `width: 48px; height: 48px; border-radius: 50%; border: 2px solid ${c}; display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: 700; color: ${c}; flex-shrink: 0;`;
                  })}>
                    {trackingGradeEstimated}
                  </div>
                  <div>
                    <div style="font-family: monospace; font-size: 18px; font-weight: 700; color: #e2e2e8;">
                      {trackingScoreEstimated} <span style="font-size: 12px; color: #4b5563; font-weight: 400;">/1000</span>
                    </div>
                  </div>
                </div>
                {/* Progress bar */}
                <div style="height: 6px; background: #2a2a3d; border-radius: 3px; margin-top: 10px; position: relative;">
                  <div style={gradeBarFillStyle}></div>
                </div>
                {/* Grade scale F-S */}
                <div style="display: flex; justify-content: space-between; margin-top: 3px;">
                  {gradeLetters.map(letter => (
                    <span style={trackingGradeEstimated.map(g => g === letter
                      ? `font-family: monospace; font-size: 8px; color: ${getGradeColor(g)}; font-weight: 600;`
                      : "font-family: monospace; font-size: 8px; color: #4b5563;"
                    )}>{letter}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* ═══ G-FORCE + TEMPS ═══ */}
            <div style="display: flex; gap: 12px; padding: 14px 24px; border-bottom: 1px solid #2a2a3d;">
              {/* G-Force card */}
              <div style={trackingGforceAlert.map(a => {
                const bc = a === "critical" ? "rgba(239, 68, 68, 0.38)" : a === "warning" ? "rgba(245, 158, 11, 0.38)" : "#1e3a2a";
                return `flex: 1; background: #1a1a2a; border: 1px solid ${bc}; border-radius: 10px; padding: 12px 14px;`;
              })}>
                <div style="font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #4b5563; margin-bottom: 6px;">{currentLanguage.map(l => `${(translations[l] as any).tracking.gforce} ${(translations[l] as any).tracking.gforceMax}`)}</div>
                <div style={trackingGforceAlert.map(a => {
                  const c = a === "critical" ? "#ef4444" : a === "warning" ? "#f59e0b" : "#e2e2e8";
                  return `font-family: monospace; font-size: 22px; font-weight: 700; color: ${c};`;
                })}>
                  {gForce.map(g => g.toFixed(1))} <span style="font-size: 12px; color: #6b7280; font-weight: 400;">G</span>
                </div>
                {/* Status dot + text */}
                <div style="display: flex; align-items: center; gap: 6px; margin-top: 6px;">
                  <div style={trackingGforceAlert.map(a => {
                    const c = a === "critical" ? "#ef4444" : a === "warning" ? "#f59e0b" : "#22c55e";
                    return `width: 8px; height: 8px; border-radius: 50%; background: ${c}; flex-shrink: 0;`;
                  })}></div>
                  <span style={trackingGforceAlert.map(a => {
                    const c = a === "critical" ? "#ef4444" : a === "warning" ? "#f59e0b" : "#22c55e";
                    return `font-size: 11px; font-weight: 500; color: ${c};`;
                  })}>{gforceStatusText}</span>
                </div>
                {/* Alert sub-message (warning/critical) */}
                <div style={trackingGforceAlert.map(a => {
                  if (a === "critical") return "margin-top: 8px; padding: 6px 8px; background: #2a1515; border: 1px solid rgba(239, 68, 68, 0.31); border-radius: 6px;";
                  if (a === "warning") return "margin-top: 8px; padding: 6px 8px; background: #2a2515; border: 1px solid rgba(245, 158, 11, 0.31); border-radius: 6px;";
                  return "display: none;";
                })}>
                  <div style={trackingGforceAlert.map(a => `font-size: 10px; color: ${a === "critical" ? "#fca5a5" : "#fcd34d"}; line-height: 1.3;`)}>
                    {MappedSubject.create(([a, l]: readonly [string, string]) => a === "critical" ? (translations[l] as any).tracking.gforceAlertCritical : (translations[l] as any).tracking.gforceAlertWarning, trackingGforceAlert, currentLanguage)}
                  </div>
                </div>
              </div>

              {/* Lumières card */}
              <div style={trackingLightsStatusColor.map(c =>
                c === "red" ? "flex: 1; background: #1a1a2a; border: 1px solid rgba(239, 68, 68, 0.38); border-radius: 10px; padding: 12px 14px;"
                : c === "orange" ? "flex: 1; background: #1a1a2a; border: 1px solid rgba(245, 158, 11, 0.38); border-radius: 10px; padding: 12px 14px;"
                : "flex: 1; background: #1a1a2a; border: 1px solid #1e3a2a; border-radius: 10px; padding: 12px 14px;"
              )}>
                <div style="font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #4b5563; margin-bottom: 6px;">{currentLanguage.map(l => (translations[l] as any).tracking.lights)}</div>
                <div style="display: flex; flex-wrap: wrap; gap: 3px;">
                  {/* NAV */}
                  <div style={trackingLightNav.map(s => getLightItemStyle(s))}>
                    <div style={trackingLightNav.map(s => getLightDotStyle(s))}></div>
                    <span style={trackingLightNav.map(s => getLightTextStyle(s))}>NAV</span>
                  </div>
                  {/* STRB */}
                  <div style={trackingLightStrobe.map(s => getLightItemStyle(s))}>
                    <div style={trackingLightStrobe.map(s => getLightDotStyle(s))}></div>
                    <span style={trackingLightStrobe.map(s => getLightTextStyle(s))}>STRB</span>
                  </div>
                  {/* BCN */}
                  <div style={trackingLightBeacon.map(s => getLightItemStyle(s))}>
                    <div style={trackingLightBeacon.map(s => getLightDotStyle(s))}></div>
                    <span style={trackingLightBeacon.map(s => getLightTextStyle(s))}>BCN</span>
                  </div>
                  {/* LDG */}
                  <div style={trackingLightLanding.map(s => getLightItemStyle(s))}>
                    <div style={trackingLightLanding.map(s => getLightDotStyle(s))}></div>
                    <span style={trackingLightLanding.map(s => getLightTextStyle(s))}>LDG</span>
                  </div>
                  {/* TAXI */}
                  <div style={trackingLightTaxi.map(s => getLightItemStyle(s))}>
                    <div style={trackingLightTaxi.map(s => getLightDotStyle(s))}></div>
                    <span style={trackingLightTaxi.map(s => getLightTextStyle(s))}>TAXI</span>
                  </div>
                  {/* Status global */}
                  <div style={trackingLightsStatusColor.map(c => {
                    const base = "width: calc(33.33% - 3px); padding: 4px 6px; border-radius: 4px; display: flex; align-items: center; gap: 4px;";
                    if (c === "red") return base + " background: #351a1a; border: 1px solid rgba(239, 68, 68, 0.25);";
                    if (c === "orange") return base + " background: #352a10; border: 1px solid rgba(245, 158, 11, 0.25);";
                    return base + " background: #1e3a2a;";
                  })}>
                    <div style={trackingLightsStatusColor.map(c =>
                      c === "red" ? "width: 6px; height: 6px; border-radius: 50%; background: #ef4444; flex-shrink: 0;"
                      : c === "orange" ? "width: 6px; height: 6px; border-radius: 50%; background: #f59e0b; flex-shrink: 0;"
                      : "width: 6px; height: 6px; border-radius: 50%; background: #22c55e; flex-shrink: 0;"
                    )}></div>
                    <span style={trackingLightsStatusColor.map(c =>
                      c === "red" ? "font-size: 10px; font-weight: 600; color: #ef4444;"
                      : c === "orange" ? "font-size: 10px; font-weight: 600; color: #f59e0b;"
                      : "font-size: 10px; font-weight: 600; color: #22c55e;"
                    )}>
                      {lightsStatusText}
                    </span>
                  </div>
                </div>
                {/* Alert message */}
                <div style={trackingLightsAlert.map(a => a
                  ? "margin-top: 8px;"
                  : "display: none;"
                )}>
                  <div style={trackingLightsStatusColor.map(c =>
                    c === "orange"
                      ? "padding: 6px 8px; background: #2a2010; border: 1px solid rgba(245, 158, 11, 0.25); border-radius: 6px;"
                      : "padding: 6px 8px; background: #2a1515; border: 1px solid rgba(239, 68, 68, 0.31); border-radius: 6px;"
                  )}>
                    <div style={trackingLightsStatusColor.map(c =>
                      c === "orange"
                        ? "font-size: 10px; color: #fcd34d; line-height: 1.3;"
                        : "font-size: 10px; color: #fca5a5; line-height: 1.3;"
                    )}>
                      {trackingLightsAlert}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ═══ SUIVI VOL ═══ */}
            <div style="padding: 14px 24px; border-bottom: 1px solid #2a2a3d;">
              <div style={suiviHasAlert.map(a => a
                ? "background: #1a1a2a; border: 1px solid rgba(245, 158, 11, 0.25); border-radius: 10px; padding: 12px 14px; position: relative;"
                : "background: #1a1a2a; border: 1px solid #1e3a2a; border-radius: 10px; padding: 12px 14px; position: relative;"
              )}>
                {/* Header with mode badge */}
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                  <div style="font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: #4b5563;">{currentLanguage.map(l => (translations[l] as any).tracking.atcTracking)}</div>
                  <div style={trackingSuiviAtcMode.map(m => m === 'native'
                    ? "font-size: 8px; font-weight: 700; color: #22c55e; letter-spacing: 1px;"
                    : "font-size: 8px; font-weight: 700; color: #60a5fa; letter-spacing: 1px;"
                  )}>
                    {trackingSuiviAtcMode.map(m => m === 'native' ? 'ATC' : 'GPS')}
                  </div>
                </div>
                <div style="display: flex; gap: 16px;">
                  {/* Col 1: Altitude */}
                  <div style="flex: 1;">
                    <div style="font-size: 10px; color: #6b7280; margin-bottom: 2px;">{currentLanguage.map(l => (translations[l] as any).tracking.altitude)}</div>
                    <div style={suiviAltValueStyle}>
                      {suiviAltValueText}
                    </div>
                    <div style="display: flex; align-items: center; gap: 4px; margin-top: 4px;">
                      <div style={suiviAltDotStyle}></div>
                      <span style={suiviAltTextStyle}>
                        {suiviAltStatusText}
                      </span>
                    </div>
                  </div>

                  {/* Col 2: Vitesse */}
                  <div style="flex: 1;">
                    <div style="font-size: 10px; color: #6b7280; margin-bottom: 2px;">{currentLanguage.map(l => (translations[l] as any).tracking.airspeed)}</div>
                    <div style={suiviSpdValueStyle}>
                      {suiviSpdValueText} <span style="font-size: 10px; color: #6b7280; font-weight: 400;">kts</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 4px; margin-top: 4px;">
                      <div style={suiviSpdDotStyle}></div>
                      <span style={suiviSpdTextStyle}>
                        {suiviSpdStatusText}
                      </span>
                    </div>
                  </div>

                  {/* Col 3: Ecart route */}
                  <div style="flex: 1;">
                    <div style="font-size: 10px; color: #6b7280; margin-bottom: 2px;">{currentLanguage.map(l => (translations[l] as any).tracking.atcDeviation)}</div>
                    <div style={trackingSuiviRouteStatus.map(s =>
                      s === "error" ? "font-family: monospace; font-size: 16px; font-weight: 600; color: #ef4444;"
                      : s === "warning" ? "font-family: monospace; font-size: 16px; font-weight: 600; color: #f59e0b;"
                      : "font-family: monospace; font-size: 16px; font-weight: 600; color: #e2e2e8;"
                    )}>
                      {trackingSuiviCrossTrackNm.map(n => n > 0 ? `${n.toFixed(1)}` : "0.0")} <span style="font-size: 10px; color: #6b7280; font-weight: 400;">nm</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 4px; margin-top: 4px;">
                      <div style={routeDotColor.map(c => `width: 6px; height: 6px; border-radius: 50%; background: ${c}; flex-shrink: 0;`)}></div>
                      <span style={routeTextColor.map(c => `font-size: 10px; color: ${c};`)}>
                        {routeStatusText}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Suivi vol alert message */}
                <div style={suiviHasAlert.map(a => a
                  ? "margin-top: 10px; padding: 6px 10px; background: #2a2010; border: 1px solid rgba(245, 158, 11, 0.25); border-radius: 6px;"
                  : "display: none;"
                )}>
                  <div style="font-size: 10px; color: #fcd34d; line-height: 1.3;">
                    <span style="font-weight: 700; color: #f59e0b;">!</span> {trackingSuiviAlert}
                  </div>
                </div>
              </div>
            </div>

            {/* ═══ MODIFICATEURS ACTIFS ═══ */}
            <div style="padding: 14px 24px;">
              <div style="font-size: 10px; letter-spacing: 2.5px; text-transform: uppercase; color: #4b5563; font-weight: 600; margin-bottom: 10px;">{currentLanguage.map(l => (translations[l] as any).tracking.bonuses)}</div>
              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                {/* Nuit */}
                <div style={trackingBonusNight.map(n => n > 0
                  ? "display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; background: #1a2e1a; border: 1px solid rgba(34, 197, 94, 0.25); border-radius: 6px;"
                  : "display: none;"
                )}>
                  <span style="font-size: 11px; color: #9ca3af;">{currentLanguage.map(l => (translations[l] as any).tracking.bonusNight)}</span>
                  <span style="font-family: monospace; font-size: 11px; font-weight: 600; color: #22c55e;">+50%</span>
                </div>
                {/* Cargo */}
                <div style="display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; background: #1a2e1a; border: 1px solid rgba(34, 197, 94, 0.25); border-radius: 6px;">
                  <span style="font-size: 11px; color: #9ca3af;">
                    {MappedSubject.create(([p, l]: readonly [number, string]) => `${(translations[l] as any).tracking.cargo} ${p}%`, trackingCargoFillPercent, currentLanguage)}
                  </span>
                  <span style="font-family: monospace; font-size: 11px; font-weight: 600; color: #22c55e;">
                    {trackingCargoFillPercent.map(p => getCargoMultLabel(p))}
                  </span>
                </div>
                {/* Vitesse sim (was "Temps réel") */}
                <div style={trackingTimeRatio.map(r => r >= 25
                  ? "display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; background: #1a2e1a; border: 1px solid rgba(34, 197, 94, 0.25); border-radius: 6px;"
                  : "display: none;"
                )}>
                  <span style="font-size: 11px; color: #9ca3af;">
                    {MappedSubject.create(([r, l]: readonly [number, string]) => {
                      const t = (translations[l] as any).tracking;
                      if (r >= 100) return t.bonusRealTime;
                      if (r >= 90) return `${t.simRate} ${Math.round(r)}%`;
                      return t.simRate;
                    }, trackingTimeRatio, currentLanguage)}
                  </span>
                  <span style="font-family: monospace; font-size: 11px; font-weight: 600; color: #22c55e;">
                    {trackingTimeRatio.map(r => getRealTimeLabel(r))}
                  </span>
                </div>
                {/* Fuel */}
                <div style={trackingFuelPercent.map(p => p >= 10
                  ? "display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; background: #1a2e1a; border: 1px solid rgba(34, 197, 94, 0.25); border-radius: 6px;"
                  : "display: none;"
                )}>
                  <span style="font-size: 11px; color: #9ca3af;">
                    {MappedSubject.create(([p, l]: readonly [number, string]) => `${(translations[l] as any).tracking.fuel} ${Math.round(p)}%`, trackingFuelPercent, currentLanguage)}
                  </span>
                  <span style="font-family: monospace; font-size: 11px; font-weight: 600; color: #22c55e;">
                    {trackingFuelPercent.map(p => getFuelBonusLabel(p))}
                  </span>
                </div>
                {/* Lumières */}
                <div style={trackingLightsStatusColor.map(c =>
                  c === "red" ? "display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; background: #2a1515; border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 6px;"
                  : c === "orange" ? "display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; background: #2a2010; border: 1px solid rgba(245, 158, 11, 0.25); border-radius: 6px;"
                  : "display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; background: #1a2e1a; border: 1px solid rgba(34, 197, 94, 0.25); border-radius: 6px;"
                )}>
                  <span style={trackingLightsStatusColor.map(c =>
                    c === "red" ? "font-size: 11px; color: #fca5a5;"
                    : c === "orange" ? "font-size: 11px; color: #fcd34d;"
                    : "font-size: 11px; color: #9ca3af;"
                  )}>{currentLanguage.map(l => (translations[l] as any).tracking.lights)}</span>
                  <span style={trackingLightsStatusColor.map(c =>
                    c === "red" ? "font-family: monospace; font-size: 11px; font-weight: 600; color: #ef4444;"
                    : c === "orange" ? "font-family: monospace; font-size: 11px; font-weight: 600; color: #f59e0b;"
                    : "font-family: monospace; font-size: 11px; font-weight: 600; color: #22c55e;"
                  )}>
                    {lightsStatusText}
                  </span>
                </div>
                {/* Météo */}
                <div style={trackingWeatherScore.map(s => s >= 20
                  ? "display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; background: #1a2e1a; border: 1px solid rgba(34, 197, 94, 0.25); border-radius: 6px;"
                  : "display: none;"
                )}>
                  <span style="font-size: 11px; color: #9ca3af;">{currentLanguage.map(l => (translations[l] as any).tracking.bonusWeather)}</span>
                  <span style="font-family: monospace; font-size: 11px; font-weight: 600; color: #22c55e;">
                    {trackingWeatherScore.map(s => {
                      if (s >= 80) return "+15%";
                      if (s >= 60) return "+10%";
                      if (s >= 40) return "+5%";
                      return "+2%";
                    })}
                  </span>
                </div>
              </div>
            </div>

            {/* ═══ ANNULER ═══ */}
            <div style="padding: 0 24px 16px;">
              <Button callback={(): void => { void onCancelMission(); }}>
                <div style="background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; color: #ef4444; border-radius: 6px; padding: 8px 16px; font-size: 11px; font-weight: 500; text-align: center;">
                  {currentLanguage.map(l => translations[l].common.cancel)}
                </div>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
