/**
 * FreeFlightPanel - Background free flight stats + live tracking display
 * Shows in MissionsView "En cours" when no active mission
 * V2: Added live tracking (grade, score, lights, G-force, fuel, simRate)
 */
import { FSComponent, VNode, Subject, MappedSubject } from "@microsoft/msfs-sdk";
import { Button } from "@efb/efb-api";
import type { Language } from "../types";
import { freeFlightState, formatFlightTime } from "../state/FreeFlightState";
import { positionState } from "../state/positionState";

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
// HELPERS (same as MissionTrackingPanel)
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

function getLightItemStyle(state: number): string {
  if (state === 1) return "padding: 3px 6px; border-radius: 4px; display: flex; align-items: center; gap: 3px; background: #1e3a2a;";
  if (state === 2) return "padding: 3px 6px; border-radius: 4px; display: flex; align-items: center; gap: 3px; background: #351a1a; border: 1px solid rgba(239, 68, 68, 0.25);";
  if (state === 3) return "padding: 3px 6px; border-radius: 4px; display: flex; align-items: center; gap: 3px; background: #352a10; border: 1px solid rgba(245, 158, 11, 0.25);";
  return "padding: 3px 6px; border-radius: 4px; display: flex; align-items: center; gap: 3px; background: #162016;";
}

// ═══════════════════════════════════════════════════════════
// PROPS INTERFACE
// ═══════════════════════════════════════════════════════════

export interface FreeFlightPanelProps {
  currentLanguage: Subject<Language>;
  onGoToCreation: () => void;
}

// ═══════════════════════════════════════════════════════════
// RENDER FUNCTION
// ═══════════════════════════════════════════════════════════

export function renderFreeFlightPanel(props: FreeFlightPanelProps): VNode {
  const { currentLanguage, onGoToCreation } = props;

  // Direct references to free flight state
  const status = freeFlightState.status;
  const flightTime = freeFlightState.flightTimeMinutes;
  const distance = freeFlightState.distanceFlownNm;
  const landings = freeFlightState.landingsCount;
  const xp = freeFlightState.estimatedXp;
  const groundSpeed = freeFlightState.groundSpeed;
  const altitude = freeFlightState.currentAltitude;
  const isOnGround = freeFlightState.isOnGround;
  const departureAirport = freeFlightState.departureAirport;
  const todayStats = freeFlightState.todayStats;
  const showEndFlightConfirm = freeFlightState.showEndFlightConfirm;
  const isAtCorrectAirport = positionState.isAtCorrectAirport;

  // Live tracking refs
  const gradeEstimated = freeFlightState.ffTrackingGradeEstimated;
  const scoreEstimated = freeFlightState.ffTrackingScoreEstimated;
  const maxGForce = freeFlightState.ffTrackingMaxGForce;
  const gforceAlert = freeFlightState.ffTrackingGForceAlert;
  const fuelPercent = freeFlightState.ffTrackingFuelPercent;
  const simRate = freeFlightState.ffTrackingSimRate;
  const lightNav = freeFlightState.ffTrackingLightNav;
  const lightStrobe = freeFlightState.ffTrackingLightStrobe;
  const lightBeacon = freeFlightState.ffTrackingLightBeacon;
  const lightLanding = freeFlightState.ffTrackingLightLanding;
  const lightTaxi = freeFlightState.ffTrackingLightTaxi;
  const lightsStatusColor = freeFlightState.ffTrackingLightsStatusColor;
  const lightsMissing = freeFlightState.ffTrackingLightsMissing;
  const lightsUnnecessary = freeFlightState.ffTrackingLightsUnnecessary;

  // Pre-computed subjects
  const gradeBarFillStyle = MappedSubject.create(
    ([score, grade]: readonly [number, string]) => {
      const pct = Math.min(100, score / 10);
      const c = getGradeColor(grade);
      return `position: absolute; left: 0; top: 0; width: ${pct}%; height: 100%; background: ${c}; border-radius: 3px;`;
    },
    scoreEstimated, gradeEstimated
  );

  const lightsStatusText = MappedSubject.create(
    ([missing, unnecessary]: readonly [number, number]) => {
      if (missing > 0) return `${missing} OFF`;
      if (unnecessary > 0) return `${unnecessary} ON`;
      return "OK";
    },
    lightsMissing, lightsUnnecessary
  );

  return (
    <div style="background: #252532; border-radius: 12px; padding: 16px; position: relative;">
      {/* Header */}
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <div style="font-size: 12px; font-weight: 600; color: #9ca3af; text-transform: uppercase;">
          {currentLanguage.map(l => (translations[l] as any).tracking.freeFlightTracking)}
        </div>
        <div style={status.map(s => s === "in_flight"
          ? "font-size: 10px; padding: 3px 8px; background: rgba(34, 197, 94, 0.2); border: 1px solid #22c55e; border-radius: 4px; color: #22c55e; font-weight: 600;"
          : "font-size: 10px; padding: 3px 8px; background: rgba(107, 114, 128, 0.2); border: 1px solid #6b7280; border-radius: 4px; color: #6b7280;")}>
          {MappedSubject.create(([s, l]: readonly [string, string]) => {
            const t = (translations[l] as any).tracking;
            return s === "in_flight" ? t.inFlight : s === "paused" ? t.paused : t.inactive;
          }, status, currentLanguage)}
        </div>
      </div>

      {/* Free Flight Active - Show live stats */}
      <div style={status.map(s => s === "in_flight" ? "display: block;" : "display: none;")}>

        {/* Current flight info */}
        <div style="background: #1a1a24; border-radius: 8px; padding: 12px; margin-bottom: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div>
              <div style="font-size: 9px; color: #6b7280; text-transform: uppercase;">{currentLanguage.map(l => (translations[l] as any).tracking.departure)}</div>
              <div style="font-family: monospace; font-size: 16px; font-weight: 700; color: #60a5fa;">
                {departureAirport.map(a => a || "----")}
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 9px; color: #6b7280; text-transform: uppercase;">{currentLanguage.map(l => (translations[l] as any).tracking.flightTime)}</div>
              <div style="font-size: 16px; font-weight: 700; color: white;">
                {flightTime.map(t => formatFlightTime(t))}
              </div>
            </div>
          </div>

          {/* Live flight data row */}
          <div style="display: flex; justify-content: space-between; padding-top: 8px; border-top: 1px solid #374151;">
            <div style="text-align: center;">
              <div style="font-size: 14px; font-weight: 600; color: white;">{distance.map(d => d.toFixed(1))}</div>
              <div style="font-size: 9px; color: #6b7280;">nm</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 14px; font-weight: 600; color: white;">{landings}</div>
              <div style="font-size: 9px; color: #6b7280;">{currentLanguage.map(l => (translations[l] as any).tracking.landings)}</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 14px; font-weight: 600; color: #f59e0b;">+{xp}</div>
              <div style="font-size: 9px; color: #6b7280;">XP</div>
            </div>
          </div>
        </div>

        {/* Live position data */}
        <div style="display: flex; gap: 8px; margin-bottom: 10px;">
          <div style="flex: 1; background: #1a1a24; border-radius: 6px; padding: 8px; text-align: center;">
            <div style="font-size: 12px; font-weight: 600; color: white;">{groundSpeed.map(s => Math.round(s))} kt</div>
            <div style="font-size: 9px; color: #6b7280;">{currentLanguage.map(l => (translations[l] as any).tracking.groundSpeed)}</div>
          </div>
          <div style="flex: 1; background: #1a1a24; border-radius: 6px; padding: 8px; text-align: center;">
            <div style="font-size: 12px; font-weight: 600; color: white;">{altitude.map(a => Math.round(a))} ft</div>
            <div style="font-size: 9px; color: #6b7280;">{currentLanguage.map(l => (translations[l] as any).tracking.altitude)}</div>
          </div>
          <div style="flex: 1; background: #1a1a24; border-radius: 6px; padding: 8px; text-align: center;">
            <div style={isOnGround.map(g => g
              ? "font-size: 12px; font-weight: 600; color: #22c55e;"
              : "font-size: 12px; font-weight: 600; color: #60a5fa;")}>
              {MappedSubject.create(([g, l]: readonly [boolean, string]) => {
                const t = (translations[l] as any).tracking;
                return g ? t.onGround : t.inFlight;
              }, isOnGround, currentLanguage)}
            </div>
            <div style="font-size: 9px; color: #6b7280;">{currentLanguage.map(l => (translations[l] as any).tracking.status)}</div>
          </div>
        </div>

        {/* ═══ GRADE + SCORE ═══ */}
        <div style="background: #1a1a24; border-radius: 8px; padding: 10px; margin-bottom: 10px;">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
            {/* Grade circle */}
            <div style={gradeEstimated.map(g => {
              const c = getGradeColor(g);
              return `width: 36px; height: 36px; border-radius: 50%; border: 2px solid ${c}; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 700; color: ${c}; flex-shrink: 0;`;
            })}>
              {gradeEstimated}
            </div>
            <div style="flex: 1;">
              <div style="font-size: 9px; color: #6b7280; text-transform: uppercase; margin-bottom: 2px;">
                {currentLanguage.map(l => `${(translations[l] as any).tracking.grade} ${(translations[l] as any).tracking.estimated}`)}
              </div>
              <div style="font-family: monospace; font-size: 14px; font-weight: 700; color: #e2e2e8;">
                {scoreEstimated} <span style="font-size: 10px; color: #4b5563; font-weight: 400;">/1000</span>
              </div>
            </div>
          </div>
          {/* Progress bar */}
          <div style="height: 4px; background: #2a2a3d; border-radius: 2px; position: relative;">
            <div style={gradeBarFillStyle}></div>
          </div>
        </div>

        {/* ═══ LIGHTS ═══ */}
        <div style={lightsStatusColor.map(c =>
          c === "red" ? "background: #1a1a24; border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 8px; padding: 10px; margin-bottom: 10px;"
          : c === "orange" ? "background: #1a1a24; border: 1px solid rgba(245, 158, 11, 0.25); border-radius: 8px; padding: 10px; margin-bottom: 10px;"
          : "background: #1a1a24; border-radius: 8px; padding: 10px; margin-bottom: 10px;"
        )}>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <div style="font-size: 9px; color: #6b7280; text-transform: uppercase;">
              {currentLanguage.map(l => (translations[l] as any).tracking.lights)}
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
              <div style={lightsStatusColor.map(c =>
                c === "red" ? "width: 5px; height: 5px; border-radius: 50%; background: #ef4444;"
                : c === "orange" ? "width: 5px; height: 5px; border-radius: 50%; background: #f59e0b;"
                : "width: 5px; height: 5px; border-radius: 50%; background: #22c55e;"
              )}></div>
              <span style={lightsStatusColor.map(c =>
                c === "red" ? "font-size: 9px; font-weight: 600; color: #ef4444;"
                : c === "orange" ? "font-size: 9px; font-weight: 600; color: #f59e0b;"
                : "font-size: 9px; font-weight: 600; color: #22c55e;"
              )}>{lightsStatusText}</span>
            </div>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 3px;">
            <div style={lightNav.map(s => getLightItemStyle(s))}>
              <div style={lightNav.map(s => getLightDotStyle(s))}></div>
              <span style={lightNav.map(s => getLightTextStyle(s))}>NAV</span>
            </div>
            <div style={lightStrobe.map(s => getLightItemStyle(s))}>
              <div style={lightStrobe.map(s => getLightDotStyle(s))}></div>
              <span style={lightStrobe.map(s => getLightTextStyle(s))}>STRB</span>
            </div>
            <div style={lightBeacon.map(s => getLightItemStyle(s))}>
              <div style={lightBeacon.map(s => getLightDotStyle(s))}></div>
              <span style={lightBeacon.map(s => getLightTextStyle(s))}>BCN</span>
            </div>
            <div style={lightLanding.map(s => getLightItemStyle(s))}>
              <div style={lightLanding.map(s => getLightDotStyle(s))}></div>
              <span style={lightLanding.map(s => getLightTextStyle(s))}>LDG</span>
            </div>
            <div style={lightTaxi.map(s => getLightItemStyle(s))}>
              <div style={lightTaxi.map(s => getLightDotStyle(s))}></div>
              <span style={lightTaxi.map(s => getLightTextStyle(s))}>TAXI</span>
            </div>
          </div>
        </div>

        {/* ═══ G-FORCE + FUEL + SIM RATE ═══ */}
        <div style="display: flex; gap: 8px; margin-bottom: 10px;">
          {/* G-Force */}
          <div style={gforceAlert.map(a => a
            ? "flex: 1; background: #1a1a24; border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 6px; padding: 8px; text-align: center;"
            : "flex: 1; background: #1a1a24; border-radius: 6px; padding: 8px; text-align: center;"
          )}>
            <div style={gforceAlert.map(a => a
              ? "font-size: 14px; font-weight: 700; color: #f59e0b;"
              : "font-size: 14px; font-weight: 700; color: white;"
            )}>
              {maxGForce.map(g => g.toFixed(1))}G
            </div>
            <div style="font-size: 9px; color: #6b7280;">{currentLanguage.map(l => `${(translations[l] as any).tracking.gforce} ${(translations[l] as any).tracking.gforceMax}`)}</div>
          </div>
          {/* Fuel */}
          <div style="flex: 1; background: #1a1a24; border-radius: 6px; padding: 8px; text-align: center;">
            <div style="font-size: 14px; font-weight: 700; color: white;">
              {fuelPercent.map(p => `${Math.round(p)}%`)}
            </div>
            <div style="font-size: 9px; color: #6b7280;">{currentLanguage.map(l => (translations[l] as any).tracking.fuel)}</div>
          </div>
          {/* Sim Rate */}
          <div style="flex: 1; background: #1a1a24; border-radius: 6px; padding: 8px; text-align: center;">
            <div style={simRate.map(r => r > 1.1
              ? "font-size: 14px; font-weight: 700; color: #f59e0b;"
              : "font-size: 14px; font-weight: 700; color: white;"
            )}>
              {simRate.map(r => `x${r.toFixed(1)}`)}
            </div>
            <div style="font-size: 9px; color: #6b7280;">{currentLanguage.map(l => (translations[l] as any).tracking.simRate)}</div>
          </div>
        </div>

        {/* Info message */}
        <div style="background: rgba(96, 165, 250, 0.1); border: 1px solid rgba(96, 165, 250, 0.3); border-radius: 6px; padding: 10px; margin-bottom: 10px;">
          <div style="font-size: 10px; color: #60a5fa;">
            {currentLanguage.map(l => (translations[l] as any).tracking.freeFlightAutoStop)}
          </div>
        </div>

        {/* Create Mission Button */}
        <Button callback={onGoToCreation}>
          <div style="width: 100%; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; color: #60a5fa; padding: 10px; border-radius: 6px; font-size: 11px; font-weight: 500; text-align: center; box-sizing: border-box;">
            {currentLanguage.map(l => translations[l].missions.createMission)}
          </div>
        </Button>
      </div>

      {/* Free Flight Not Active - Show idle state */}
      <div style={status.map(s => s === "in_flight" ? "display: none;" : "display: flex; flex-direction: column; align-items: center; padding: 20px; text-align: center;")}>

        {/* Position mismatch warning */}
        <div style={isAtCorrectAirport.map(ok => ok
          ? "display: none;"
          : "width: 100%; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 6px; padding: 10px; margin-bottom: 12px; text-align: left;")}>
          <div style="font-size: 11px; font-weight: 600; color: #ef4444; margin-bottom: 4px;">
            {currentLanguage.map(l => (translations[l] as any).tracking.positionMismatch)}
          </div>
          <div style="font-size: 10px; color: #fca5a5;">
            {positionState.dbAirport.map(db =>
              `${db || "?"}`
            )}
          </div>
        </div>

        <svg style="width: 40px; height: 40px; margin-bottom: 12px; opacity: 0.4;" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5">
          <path d="M21.5 11.5L12 17L2.5 11.5"/>
          <path d="M21.5 6.5L12 12L2.5 6.5L12 1L21.5 6.5Z"/>
        </svg>
        <div style="color: #6b7280; font-size: 12px; margin-bottom: 4px;">
          {currentLanguage.map(l => translations[l].missions.noActiveMission)}
        </div>
        <div style="color: #4b5563; font-size: 10px; margin-bottom: 12px;">
          {currentLanguage.map(l => (translations[l] as any).tracking.freeFlightAutoStart)}
        </div>
        <Button callback={onGoToCreation}>
          <div style="background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; color: #60a5fa; padding: 8px 16px; border-radius: 6px; font-size: 11px; font-weight: 500;">
            {currentLanguage.map(l => translations[l].missions.createMission)}
          </div>
        </Button>
      </div>

      {/* Today's Stats Section (shown if we have stats from API) */}
      <div style={todayStats.map(stats => stats && stats.sessionsToday > 0 ? "margin-top: 12px;" : "display: none;")}>
        <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; margin-bottom: 8px;">
          {currentLanguage.map(l => (translations[l] as any).tracking.todayStats)}
        </div>
        <div style="background: #1a1a24; border-radius: 6px; padding: 10px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <span style="font-size: 10px; color: #9ca3af;">{currentLanguage.map(l => (translations[l] as any).tracking.sessions)}</span>
            <span style="font-size: 10px; color: white; font-weight: 600;">{todayStats.map(s => s?.sessionsToday || 0)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <span style="font-size: 10px; color: #9ca3af;">{currentLanguage.map(l => (translations[l] as any).tracking.totalTime)}</span>
            <span style="font-size: 10px; color: white; font-weight: 600;">{todayStats.map(s => formatFlightTime(s?.totalFlightTime || 0))}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <span style="font-size: 10px; color: #9ca3af;">{currentLanguage.map(l => (translations[l] as any).tracking.distance)}</span>
            <span style="font-size: 10px; color: white; font-weight: 600;">{todayStats.map(s => (s?.totalDistanceNm || 0).toFixed(1))} nm</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="font-size: 10px; color: #9ca3af;">{currentLanguage.map(l => (translations[l] as any).tracking.landings)}</span>
            <span style="font-size: 10px; color: white; font-weight: 600;">{todayStats.map(s => s?.totalLandings || 0)}</span>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* END FLIGHT CONFIRMATION POPUP */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div style={showEndFlightConfirm.map(show => show
        ? "position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.85); display: flex; align-items: center; justify-content: center; z-index: 100; border-radius: 12px;"
        : "display: none;")}>
        <div style="background: #252532; border: 1px solid #374151; border-radius: 12px; padding: 20px; max-width: 280px; width: 90%;">
          {/* Header */}
          <div style="text-align: center; margin-bottom: 16px;">
            <div style="font-size: 14px; font-weight: 700; color: white; margin-bottom: 4px;">
              {currentLanguage.map(l => (translations[l] as any).tracking.flightEnded)}
            </div>
            <div style="font-size: 10px; color: #6b7280;">
              {currentLanguage.map(l => (translations[l] as any).tracking.parkingBrakeSet)}
            </div>
          </div>

          {/* Stats Summary */}
          <div style="background: #1a1a24; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
            <div style="display: flex; flex-wrap: wrap; gap: 12px;">
              <div style="text-align: center; width: calc(50% - 6px);">
                <div style="font-size: 20px; font-weight: 700; color: #f59e0b;">+{xp}</div>
                <div style="font-size: 9px; color: #6b7280; text-transform: uppercase;">XP</div>
              </div>
              <div style="text-align: center; width: calc(50% - 6px);">
                <div style="font-size: 20px; font-weight: 700; color: white;">{flightTime.map(t => formatFlightTime(t))}</div>
                <div style="font-size: 9px; color: #6b7280; text-transform: uppercase;">{currentLanguage.map(l => (translations[l] as any).tracking.flightTime)}</div>
              </div>
              <div style="text-align: center; width: calc(50% - 6px);">
                <div style="font-size: 16px; font-weight: 600; color: white;">{distance.map(d => d.toFixed(1))} nm</div>
                <div style="font-size: 9px; color: #6b7280; text-transform: uppercase;">{currentLanguage.map(l => (translations[l] as any).tracking.distance)}</div>
              </div>
              <div style="text-align: center; width: calc(50% - 6px);">
                <div style="font-size: 16px; font-weight: 600; color: white;">{landings}</div>
                <div style="font-size: 9px; color: #6b7280; text-transform: uppercase;">{currentLanguage.map(l => (translations[l] as any).tracking.landings)}</div>
              </div>
            </div>
          </div>

          {/* Info */}
          <div style="background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 6px; padding: 10px; margin-bottom: 16px;">
            <div style="font-size: 10px; color: #22c55e; text-align: center;">
              {currentLanguage.map(l => (translations[l] as any).tracking.autoRestart)}
            </div>
          </div>

          {/* Buttons */}
          <div style="display: flex; gap: 8px;">
            <Button callback={() => freeFlightState.showEndFlightConfirm.set(false)}>
              <div style="flex: 1; background: rgba(107, 114, 128, 0.2); border: 1px solid #6b7280; color: #9ca3af; padding: 10px 16px; border-radius: 6px; font-size: 11px; font-weight: 500; text-align: center;">
                {currentLanguage.map(l => (translations[l] as any).tracking.close)}
              </div>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
