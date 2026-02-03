/**
 * MissionTrackingPanel - Live mission tracking UI component
 * Extracted from MissionsView.tsx (APERCU sub-tab)
 * Shows progress, phases, XP bonuses, flight data, and time
 */
import { FSComponent, VNode, Subject } from "@microsoft/msfs-sdk";
import { Button } from "@efb/efb-api";
import type { Language, ActiveMission, MissionsSubTab } from "../types";
import type { FlightPhaseId } from "../state/CheckpointState";
import { renderFreeFlightPanel } from "./FreeFlightPanel";

// Import translations
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
// PROPS INTERFACE
// ═══════════════════════════════════════════════════════════

export interface MissionTrackingPanelProps {
  // Core state
  missionsSubTab: Subject<MissionsSubTab>;
  isLoggedIn: Subject<boolean>;
  currentLanguage: Subject<Language>;

  // Active mission
  activeMission: Subject<ActiveMission | null>;
  trackingProgressPercent: Subject<number>;
  trackingDistanceFlown: Subject<number>;
  missionDistanceNm: Subject<number>;

  // Flight phase
  flightPhaseColor: Subject<string>;
  flightPhaseText: Subject<string>;
  flightPhaseId: Subject<FlightPhaseId>;
  trackingCurrentAltitude: Subject<number>;
  trackingCanAccelerate: Subject<boolean>;

  // XP Bonuses
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

  // Flight data
  gForce: Subject<number>;
  trackingFuelPercent: Subject<number>;
  waypointsPassed: Subject<number>;
  waypointsTotal: Subject<number>;
  trackingRealTime: Subject<string>;
  trackingSimTime: Subject<string>;

  // Callbacks
  onCancelMission: () => Promise<void>;
  onGoToCreation: () => void;
}

// ═══════════════════════════════════════════════════════════
// RENDER FUNCTION
// ═══════════════════════════════════════════════════════════

export function renderMissionTrackingPanel(props: MissionTrackingPanelProps): VNode {
  const {
    missionsSubTab,
    isLoggedIn,
    currentLanguage,
    activeMission,
    trackingProgressPercent,
    trackingDistanceFlown,
    missionDistanceNm,
    flightPhaseColor,
    flightPhaseText,
    flightPhaseId,
    trackingCurrentAltitude,
    trackingCanAccelerate,
    trackingBonusNight,
    trackingBonusCargo,
    trackingBonusEco,
    trackingBonusRealTime,
    trackingTimeRatio,
    trackingAtcCompliance,
    trackingAtcViolations,
    trackingCargoActual,
    trackingCargoExpected,
    trackingFuelUsed,
    trackingFuelMax,
    gForce,
    trackingFuelPercent,
    waypointsPassed,
    waypointsTotal,
    trackingRealTime,
    trackingSimTime,
    onCancelMission,
    onGoToCreation,
  } = props;

  return (
    <div style={missionsSubTab.map(tab => tab === "apercu" ? "padding: 16px; color: white;" : "display: none;")}>
      {/* Not logged in message */}
      <div style={isLoggedIn.map(l => l ? "display: none;" : "display: block;")}>
        <div style="background: rgba(245, 158, 11, 0.15); border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; text-align: center;">
          <svg style="width: 32px; height: 32px; margin-bottom: 8px;" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4"/>
            <path d="M12 16h.01"/>
          </svg>
          <div style="color: #f59e0b; font-size: 13px; font-weight: 600; margin-bottom: 4px;">{currentLanguage.map(l => translations[l].missions.loginRequired)}</div>
          <div style="color: #9ca3af; font-size: 11px;">{currentLanguage.map(l => translations[l].missions.loginToSeeMissions)}</div>
        </div>
      </div>

      {/* Logged in content */}
      <div style={isLoggedIn.map(l => l ? "display: block;" : "display: none;")}>
        {/* Active Mission Section */}
        <div style="background: #252532; border-radius: 12px; padding: 16px;">
          <div style="font-size: 12px; font-weight: 600; color: #9ca3af; text-transform: uppercase; margin-bottom: 12px;">{currentLanguage.map(l => translations[l].missions.current)}</div>

          {/* No active mission - Show Free Flight Panel */}
          <div style={activeMission.map(m => m ? "display: none;" : "display: block;")}>
            {renderFreeFlightPanel({
              currentLanguage,
              onGoToCreation,
            })}
          </div>

          {/* Active mission card - Live Tracking UI */}
          <div style={activeMission.map(m => m ? "display: block;" : "display: none;")}>

            {/* PROGRESSION BAR */}
            <div style="background: #1a1a24; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
              {/* Route display */}
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                <span style="font-family: monospace; font-size: 14px; font-weight: 700; color: #60a5fa;">
                  {activeMission.map(m => m?.origin_icao || "----")}
                </span>
                <div style="flex: 1; margin: 0 12px; position: relative; height: 4px; background: #374151; border-radius: 2px;">
                  {/* Progress fill */}
                  <div style={trackingProgressPercent.map(p => `position: absolute; left: 0; top: 0; height: 100%; background: linear-gradient(90deg, #3b82f6, #22c55e); border-radius: 2px; width: ${p}%; transition: width 0.5s ease;`)}></div>
                  {/* Aircraft indicator */}
                  <div style={trackingProgressPercent.map(p => `position: absolute; top: -6px; left: ${Math.max(0, Math.min(p, 100))}%; transform: translateX(-50%); font-size: 12px;`)}>✈</div>
                </div>
                <span style="font-family: monospace; font-size: 14px; font-weight: 700; color: #22c55e;">
                  {activeMission.map(m => m?.destination_icao || "----")}
                </span>
              </div>
              {/* Percentage and distances */}
              <div style="text-align: center; margin-bottom: 4px;">
                <span style="font-size: 20px; font-weight: 700; color: #60a5fa;">{trackingProgressPercent}%</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 14px; color: white;">
                <span>{trackingDistanceFlown.map(d => d.toFixed(0))} {currentLanguage.map(l => translations[l].missions.nmFlown)}</span>
                <span>{missionDistanceNm.map(total => {
                  const flown = trackingDistanceFlown.get();
                  return Math.max(0, total - flown).toFixed(0);
                })} {currentLanguage.map(l => translations[l].missions.nmRemaining)}</span>
              </div>
            </div>

            {/* ROW 1: PHASE + ACCELERATION */}
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              {/* PHASE Card */}
              <div style="flex: 1; background: #1a1a24; border-radius: 8px; padding: 10px;">
                <div style="font-size: 11px; color: white; text-transform: uppercase; margin-bottom: 6px; font-weight: 600;">{currentLanguage.map(l => translations[l].missions.phase)}</div>
                <div style={flightPhaseColor.map(c => `text-align: center; padding: 6px 10px; background: ${c}25; border: 1px solid ${c}; border-radius: 6px; margin-bottom: 6px;`)}>
                  <span style={flightPhaseColor.map(c => `font-size: 12px; font-weight: 700; color: ${c};`)}>{flightPhaseText}</span>
                </div>
                {/* Altitude display in feet */}
                <div style="text-align: center; font-size: 11px; color: white; margin-bottom: 6px;">
                  {trackingCurrentAltitude.map(a => `${a.toLocaleString()} ft`)}
                </div>
                {/* Phase indicators - 5 phases */}
                <div style="display: flex; justify-content: space-around; font-size: 9px;">
                  <span style={flightPhaseId.map(p => p === "taxi_out" ? "color: #22c55e; font-weight: 600;" : "color: #6b7280;")}>Roul</span>
                  <span style={flightPhaseId.map(p => p === "climb" ? "color: #f59e0b; font-weight: 600;" : "color: #6b7280;")}>Montee</span>
                  <span style={flightPhaseId.map(p => p === "cruise" ? "color: #22c55e; font-weight: 600;" : "color: #6b7280;")}>Crois</span>
                  <span style={flightPhaseId.map(p => p === "descent" ? "color: #f59e0b; font-weight: 600;" : "color: #6b7280;")}>Desc</span>
                  <span style={flightPhaseId.map(p => p === "taxi_in" ? "color: #22c55e; font-weight: 600;" : "color: #6b7280;")}>Roul</span>
                </div>
              </div>

              {/* ACCELERATION Card */}
              <div style="flex: 1; background: #1a1a24; border-radius: 8px; padding: 10px; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                <div style="font-size: 11px; color: white; text-transform: uppercase; margin-bottom: 8px; font-weight: 600;">Acceleration</div>
                {/* Status centered */}
                <div style={trackingCanAccelerate.map(c => c
                  ? "padding: 8px 16px; background: rgba(34, 197, 94, 0.2); border: 1px solid #22c55e; border-radius: 6px;"
                  : "padding: 8px 16px; background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; border-radius: 6px;")}>
                  <span style={trackingCanAccelerate.map(c => c ? "font-size: 12px; font-weight: 700; color: #22c55e;" : "font-size: 12px; font-weight: 700; color: #ef4444;")}>
                    {trackingCanAccelerate.map(c => c ? "DISPONIBLE" : "INDISPONIBLE")}
                  </span>
                </div>
              </div>
            </div>

            {/* XP BONUS */}
            <div style="background: #1a1a24; border-radius: 8px; padding: 12px; margin-bottom: 8px;">
              <div style="font-size: 14px; color: white; text-transform: uppercase; margin-bottom: 12px; font-weight: 600;">XP Bonus</div>

              {/* Nuit */}
              <div style="margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                  <span style="font-size: 14px; color: white;">Nuit</span>
                  <span style="font-size: 14px; color: white; font-weight: 600;">{trackingBonusNight}%</span>
                </div>
                <div style="background: #374151; border-radius: 3px; height: 6px; overflow: hidden;">
                  <div style={trackingBonusNight.map(p => `background: #8b5cf6; width: ${p}%; height: 100%;`)}></div>
                </div>
                <div style="font-size: 12px; color: white; margin-top: 4px;">Actif quand il fait nuit</div>
              </div>

              {/* Cargo */}
              <div style="margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                  <span style="font-size: 14px; color: white;">Cargo</span>
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="font-size: 14px; color: white; font-weight: 600;">{trackingBonusCargo}%</span>
                    <span style={trackingBonusCargo.map(p => p === 100 ? "font-size: 14px; color: #22c55e;" : "display: none;")}>[OK]</span>
                  </div>
                </div>
                <div style="background: #374151; border-radius: 3px; height: 6px; overflow: hidden;">
                  <div style={trackingBonusCargo.map(p => `background: #f59e0b; width: ${p}%; height: 100%;`)}></div>
                </div>
                <div style="font-size: 12px; color: white; margin-top: 4px;">
                  {trackingCargoActual} kg / {trackingCargoExpected} kg attendu
                </div>
              </div>

              {/* Eco */}
              <div style="margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                  <span style="font-size: 14px; color: white;">Eco</span>
                  <span style="font-size: 14px; color: white; font-weight: 600;">{trackingBonusEco}%</span>
                </div>
                <div style="background: #374151; border-radius: 3px; height: 6px; overflow: hidden;">
                  <div style={trackingBonusEco.map(p => `background: #22c55e; width: ${p}%; height: 100%;`)}></div>
                </div>
                <div style="font-size: 12px; color: white; margin-top: 4px;">
                  {trackingFuelUsed.map(u => u.toFixed(0))} kg utilises (max {trackingFuelMax.map(m => m.toFixed(0))} kg)
                </div>
              </div>

              {/* Temps Reel */}
              <div style="margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                  <span style="font-size: 14px; color: white;">Temps Reel</span>
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="font-size: 14px; color: white; font-weight: 600;">+{trackingBonusRealTime}%</span>
                    <span style={trackingBonusRealTime.map(p => p >= 70 ? "font-size: 14px; color: #22c55e;" : "display: none;")}>[OK]</span>
                  </div>
                </div>
                <div style="background: #374151; border-radius: 3px; height: 6px; overflow: hidden;">
                  <div style={trackingBonusRealTime.map(p => `background: #3b82f6; width: ${p}%; height: 100%;`)}></div>
                </div>
                <div style="font-size: 12px; color: white; margin-top: 4px;">
                  Ratio: {trackingTimeRatio}% (100% = temps reel)
                </div>
              </div>

              {/* ATC Compliance */}
              <div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                  <span style="font-size: 14px; color: white;">ATC</span>
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <span style={trackingAtcCompliance.map(c => c === 100
                      ? "font-size: 14px; color: #22c55e; font-weight: 600;"
                      : "font-size: 14px; color: #ef4444; font-weight: 600;")}>{trackingAtcCompliance}%</span>
                    <span style={trackingAtcCompliance.map(c => c === 100 ? "font-size: 14px; color: #22c55e;" : "display: none;")}>[OK]</span>
                    <span style={trackingAtcViolations.map(v => v > 0 ? "font-size: 12px; color: #ef4444;" : "display: none;")}>
                      ({trackingAtcViolations} violation{trackingAtcViolations.map(v => v > 1 ? "s" : "")})
                    </span>
                  </div>
                </div>
                <div style="background: #374151; border-radius: 3px; height: 6px; overflow: hidden;">
                  <div style={trackingAtcCompliance.map(c => `background: ${c === 100 ? '#22c55e' : '#ef4444'}; width: ${c}%; height: 100%;`)}></div>
                </div>
                <div style="font-size: 12px; color: white; margin-top: 4px;">
                  {trackingAtcCompliance.map(c => c === 100 ? "Clearances respectees" : "Clearance manquante detectee")}
                </div>
              </div>
            </div>

            {/* ROW 2: DONNEES VOL + TEMPS */}
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              {/* DONNEES VOL Card */}
              <div style="flex: 1; background: #1a1a24; border-radius: 8px; padding: 10px;">
                <div style="font-size: 11px; color: white; text-transform: uppercase; margin-bottom: 6px; font-weight: 600;">Donnees vol</div>
                <div style="font-size: 12px; color: white;">
                  <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                    <span>G-Force max</span>
                    <span style="font-weight: 600;">{gForce.map(g => g.toFixed(1))} g</span>
                  </div>
                  <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                    <span>{currentLanguage.map(l => translations[l].hangar.fuel)}</span>
                    <span style="font-weight: 600;">{trackingFuelPercent}%</span>
                  </div>
                  <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                    <span>Waypoints</span>
                    <span style="font-weight: 600;">{waypointsPassed}/{waypointsTotal}</span>
                  </div>
                  <div style="display: flex; justify-content: space-between;">
                    <span>Altitude</span>
                    <span style="font-weight: 600;">{trackingCurrentAltitude.map(a => a.toLocaleString())} ft</span>
                  </div>
                </div>
              </div>

              {/* TEMPS Card */}
              <div style="flex: 1; background: #1a1a24; border-radius: 8px; padding: 10px;">
                <div style="font-size: 11px; color: white; text-transform: uppercase; margin-bottom: 6px; font-weight: 600;">Temps</div>
                <div style="font-size: 12px; color: white;">
                  <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                    <span>Reel</span>
                    <span style="font-weight: 600; font-family: monospace;">{trackingRealTime}</span>
                  </div>
                  <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                    <span>Simule</span>
                    <span style="font-weight: 600; font-family: monospace;">{trackingSimTime}</span>
                  </div>
                  <div style="display: flex; justify-content: space-between;">
                    <span>Ratio</span>
                    <span style="font-weight: 600;">{trackingTimeRatio}%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ACTION BUTTONS */}
            <div style="display: flex; gap: 8px; justify-content: flex-end;">
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
