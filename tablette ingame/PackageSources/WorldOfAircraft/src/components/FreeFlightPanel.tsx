/**
 * FreeFlightPanel - Background free flight stats display
 * Shows in MissionsView "Apercu" when no active mission
 * Displays: flight time, distance, landings, XP earned today
 */
import { FSComponent, VNode, Subject, MappedSubject } from "@microsoft/msfs-sdk";
import { Button } from "@efb/efb-api";
import type { Language } from "../types";
import { freeFlightState, formatFlightTime } from "../state/FreeFlightState";
import { freeFlightManager } from "../managers/FreeFlightManager";

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

  return (
    <div style="background: #252532; border-radius: 12px; padding: 16px; position: relative;">
      {/* Header */}
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <div style="font-size: 12px; font-weight: 600; color: #9ca3af; text-transform: uppercase;">
          Vol Libre
        </div>
        <div style={status.map(s => s === "in_flight"
          ? "font-size: 10px; padding: 3px 8px; background: rgba(34, 197, 94, 0.2); border: 1px solid #22c55e; border-radius: 4px; color: #22c55e; font-weight: 600;"
          : "font-size: 10px; padding: 3px 8px; background: rgba(107, 114, 128, 0.2); border: 1px solid #6b7280; border-radius: 4px; color: #6b7280;")}>
          {status.map(s => s === "in_flight" ? "EN VOL" : s === "paused" ? "EN PAUSE" : "INACTIF")}
        </div>
      </div>

      {/* Free Flight Active - Show live stats */}
      <div style={status.map(s => s === "in_flight" ? "display: block;" : "display: none;")}>

        {/* Current flight info */}
        <div style="background: #1a1a24; border-radius: 8px; padding: 12px; margin-bottom: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div>
              <div style="font-size: 9px; color: #6b7280; text-transform: uppercase;">Depart</div>
              <div style="font-family: monospace; font-size: 16px; font-weight: 700; color: #60a5fa;">
                {departureAirport.map(a => a || "----")}
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 9px; color: #6b7280; text-transform: uppercase;">Temps de vol</div>
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
              <div style="font-size: 9px; color: #6b7280;">atterrissages</div>
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
            <div style="font-size: 12px; font-weight: 600; color: white;">{groundSpeed} kt</div>
            <div style="font-size: 9px; color: #6b7280;">Vitesse sol</div>
          </div>
          <div style="flex: 1; background: #1a1a24; border-radius: 6px; padding: 8px; text-align: center;">
            <div style="font-size: 12px; font-weight: 600; color: white;">{altitude.map(a => a.toLocaleString())} ft</div>
            <div style="font-size: 9px; color: #6b7280;">Altitude</div>
          </div>
          <div style="flex: 1; background: #1a1a24; border-radius: 6px; padding: 8px; text-align: center;">
            <div style={isOnGround.map(g => g
              ? "font-size: 12px; font-weight: 600; color: #22c55e;"
              : "font-size: 12px; font-weight: 600; color: #60a5fa;")}>
              {isOnGround.map(g => g ? "AU SOL" : "EN VOL")}
            </div>
            <div style="font-size: 9px; color: #6b7280;">Statut</div>
          </div>
        </div>

        {/* Info message */}
        <div style="background: rgba(96, 165, 250, 0.1); border: 1px solid rgba(96, 165, 250, 0.3); border-radius: 6px; padding: 10px; margin-bottom: 10px;">
          <div style="font-size: 10px; color: #60a5fa;">
            Le vol libre s'arrete automatiquement quand vous creez une mission.
            L'XP est attribue a la fin de chaque session.
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
        <svg style="width: 40px; height: 40px; margin-bottom: 12px; opacity: 0.4;" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5">
          <path d="M21.5 11.5L12 17L2.5 11.5"/>
          <path d="M21.5 6.5L12 12L2.5 6.5L12 1L21.5 6.5Z"/>
        </svg>
        <div style="color: #6b7280; font-size: 12px; margin-bottom: 4px;">
          {currentLanguage.map(l => translations[l].missions.noActiveMission)}
        </div>
        <div style="color: #4b5563; font-size: 10px; margin-bottom: 12px;">
          Le vol libre demarre automatiquement en jeu
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
          Statistiques du jour
        </div>
        <div style="background: #1a1a24; border-radius: 6px; padding: 10px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <span style="font-size: 10px; color: #9ca3af;">Sessions</span>
            <span style="font-size: 10px; color: white; font-weight: 600;">{todayStats.map(s => s?.sessionsToday || 0)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <span style="font-size: 10px; color: #9ca3af;">Temps total</span>
            <span style="font-size: 10px; color: white; font-weight: 600;">{todayStats.map(s => formatFlightTime(s?.totalFlightTime || 0))}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <span style="font-size: 10px; color: #9ca3af;">Distance</span>
            <span style="font-size: 10px; color: white; font-weight: 600;">{todayStats.map(s => (s?.totalDistanceNm || 0).toFixed(1))} nm</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="font-size: 10px; color: #9ca3af;">Atterrissages</span>
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
              Vol Termine
            </div>
            <div style="font-size: 10px; color: #6b7280;">
              Frein de parking active - Session terminee
            </div>
          </div>

          {/* Stats Summary */}
          <div style="background: #1a1a24; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
            <div style="display: flex; flex-wrap: wrap; gap: 12px;">
              <div style="text-align: center; width: calc(50% - 6px);">
                <div style="font-size: 20px; font-weight: 700; color: #f59e0b;">+{xp}</div>
                <div style="font-size: 9px; color: #6b7280; text-transform: uppercase;">XP Gagnes</div>
              </div>
              <div style="text-align: center; width: calc(50% - 6px);">
                <div style="font-size: 20px; font-weight: 700; color: white;">{flightTime.map(t => formatFlightTime(t))}</div>
                <div style="font-size: 9px; color: #6b7280; text-transform: uppercase;">Temps de vol</div>
              </div>
              <div style="text-align: center; width: calc(50% - 6px);">
                <div style="font-size: 16px; font-weight: 600; color: white;">{distance.map(d => d.toFixed(1))} nm</div>
                <div style="font-size: 9px; color: #6b7280; text-transform: uppercase;">Distance</div>
              </div>
              <div style="text-align: center; width: calc(50% - 6px);">
                <div style="font-size: 16px; font-weight: 600; color: white;">{landings}</div>
                <div style="font-size: 9px; color: #6b7280; text-transform: uppercase;">Atterrissages</div>
              </div>
            </div>
          </div>

          {/* Info */}
          <div style="background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 6px; padding: 10px; margin-bottom: 16px;">
            <div style="font-size: 10px; color: #22c55e; text-align: center;">
              Un nouveau vol libre demarrera automatiquement
            </div>
          </div>

          {/* Buttons */}
          <div style="display: flex; gap: 8px;">
            <Button callback={() => freeFlightManager.dismissEndFlightPopup()}>
              <div style="flex: 1; background: rgba(107, 114, 128, 0.2); border: 1px solid #6b7280; color: #9ca3af; padding: 10px 16px; border-radius: 6px; font-size: 11px; font-weight: 500; text-align: center;">
                Continuer
              </div>
            </Button>
            <Button callback={() => void freeFlightManager.confirmSessionEnd()}>
              <div style="flex: 1; background: rgba(34, 197, 94, 0.2); border: 1px solid #22c55e; color: #22c55e; padding: 10px 16px; border-radius: 6px; font-size: 11px; font-weight: 600; text-align: center;">
                Terminer
              </div>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
