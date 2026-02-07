/**
 * FreeFlightView - Free Flight (Career Mode) tab render function
 * Simpler than MissionsView - no cargo/flight plan validation
 * Just track: flight time, distance, landings, fuel usage → XP
 */
import { FSComponent, VNode, Subject, MappedSubject } from "@microsoft/msfs-sdk";
import { Button } from "@efb/efb-api";
import type { Language, MissionAircraftInfo } from "../types";
import type { FreeFlightStatus, FreeFlightSession, FreeFlightStats } from "../state/FreeFlightState";
import { formatFlightTime } from "../state/FreeFlightState";

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

// ═══════════════════════════════════════════════════════════════════════════
// PROPS INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

export interface FreeFlightViewProps {
  // Core state
  activeTab: Subject<string>;
  currentLanguage: Subject<Language>;
  isLoggedIn: Subject<boolean>;

  // Aircraft info
  missionCurrentAircraft: Subject<MissionAircraftInfo | null>;
  currentSimAircraftReg: Subject<string>;
  missionOriginIcao: Subject<string | null>;

  // Free flight state
  freeFlightStatus: Subject<FreeFlightStatus>;
  currentSession: Subject<FreeFlightSession | null>;
  flightTimeMinutes: Subject<number>;
  distanceFlownNm: Subject<number>;
  fuelUsedGallons: Subject<number>;
  landingsCount: Subject<number>;
  currentAltitude: Subject<number>;
  groundSpeed: Subject<number>;
  isOnGround: Subject<boolean>;
  estimatedXp: Subject<number>;
  departureAirport: Subject<string>;
  currentAirport: Subject<string | null>;
  todayStats: Subject<FreeFlightStats | null>;
  loading: Subject<boolean>;
  error: Subject<string | null>;

  // Callbacks
  onStartFreeFlight: () => void;
  onEndFreeFlight: () => void;
  onCancelFreeFlight: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// RENDER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export function renderFreeFlightView(props: FreeFlightViewProps): VNode {
  const {
    activeTab,
    currentLanguage,
    isLoggedIn,
    missionCurrentAircraft,
    currentSimAircraftReg,
    missionOriginIcao,
    freeFlightStatus,
    currentSession,
    flightTimeMinutes,
    distanceFlownNm,
    fuelUsedGallons,
    landingsCount,
    currentAltitude,
    groundSpeed,
    isOnGround,
    estimatedXp,
    departureAirport,
    currentAirport,
    todayStats,
    loading,
    error,
    onStartFreeFlight,
    onEndFreeFlight,
    onCancelFreeFlight,
  } = props;

  // Note: Currently using hardcoded French strings for simplicity
  // TODO: Add translations when freeFlightTranslations are added to locale files

  return (
    <div style={activeTab.map(tab => tab === "free-flight"
      ? "position: absolute; top: 0; left: 0; right: 0; bottom: 0; overflow: hidden; display: flex; flex-direction: column;"
      : "display: none;")}>

      {/* Header */}
      <div style="padding: 12px 16px; background: #252532; border-bottom: 1px solid #374151; flex-shrink: 0;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-size: 14px; font-weight: 700; color: white;">VOL LIBRE</div>
            <div style="font-size: 10px; color: #9ca3af;">Mode Carriere - Gagnez de l'XP en volant</div>
          </div>
          <div style={freeFlightStatus.map(s => s === "in_flight"
            ? "padding: 4px 10px; background: #22c55e; border-radius: 12px; font-size: 10px; color: white; font-weight: 600;"
            : "padding: 4px 10px; background: #374151; border-radius: 12px; font-size: 10px; color: #9ca3af;")}>
            {freeFlightStatus.map(s => s === "in_flight" ? "EN VOL" : s === "completed" ? "TERMINE" : "PRET")}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style="flex: 1; overflow-y: auto; padding: 12px;">

        {/* Not logged in */}
        <div style={isLoggedIn.map(l => l ? "display: none;" : "display: block;")}>
          <div style="background: rgba(245, 158, 11, 0.15); border: 1px solid #f59e0b; border-radius: 8px; padding: 20px; text-align: center;">
            <svg style="width: 40px; height: 40px; margin-bottom: 12px;" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 8v4M12 16h.01"/>
            </svg>
            <div style="color: #f59e0b; font-size: 14px; font-weight: 600;">Connexion requise</div>
            <div style="color: #9ca3af; font-size: 11px; margin-top: 4px;">Connectez-vous pour utiliser le mode Vol Libre</div>
          </div>
        </div>

        {/* Logged in content */}
        <div style={isLoggedIn.map(l => l ? "display: flex; flex-direction: column; gap: 12px;" : "display: none;")}>

          {/* ═══ IDLE STATE: Show aircraft + Start button ═══ */}
          <div style={freeFlightStatus.map(s => s === "idle" ? "display: flex; flex-direction: column; gap: 12px;" : "display: none;")}>

            {/* Current Aircraft Card */}
            <div style="background: #252532; border-radius: 8px; padding: 12px;">
              <div style="font-size: 10px; color: #9ca3af; text-transform: uppercase; margin-bottom: 8px;">Avion Actuel</div>

              {/* Aircraft Info */}
              <div style={missionCurrentAircraft.map(ac => ac ? "display: block;" : "display: none;")}>
                <div style="display: flex; justify-content: space-between; align-items: start;">
                  <div>
                    <div style="font-size: 18px; font-weight: 700; color: white; font-family: monospace;">
                      {currentSimAircraftReg.map(r => r || "----")}
                    </div>
                    <div style="font-size: 12px; color: #9ca3af;">
                      {missionCurrentAircraft.map(ac => ac?.aircraft_type || "")}
                    </div>
                  </div>
                  <div style="text-align: right;">
                    <div style="font-size: 10px; color: #6b7280;">Aeroport</div>
                    <div style="font-size: 16px; font-weight: 600; color: #60a5fa; font-family: monospace;">
                      {missionOriginIcao.map(o => o || "----")}
                    </div>
                  </div>
                </div>
              </div>

              {/* No aircraft */}
              <div style={missionCurrentAircraft.map(ac => ac ? "display: none;" : "display: block;")}>
                <div style="text-align: center; padding: 16px; color: #6b7280; font-size: 11px;">
                  Chargez un avion de votre flotte pour commencer
                </div>
              </div>
            </div>

            {/* Today's Stats (if available) */}
            <div style={todayStats.map(s => s ? "display: block;" : "display: none;")}>
              <div style="background: #252532; border-radius: 8px; padding: 12px;">
                <div style="font-size: 10px; color: #9ca3af; text-transform: uppercase; margin-bottom: 8px;">Aujourd'hui</div>
                <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                  <div style="text-align: center; width: calc(33.33% - 6px);">
                    <div style="font-size: 16px; font-weight: 700; color: #22c55e;">
                      {todayStats.map(s => s ? formatFlightTime(s.totalFlightTime) : "0m")}
                    </div>
                    <div style="font-size: 9px; color: #6b7280;">Temps de vol</div>
                  </div>
                  <div style="text-align: center; width: calc(33.33% - 6px);">
                    <div style="font-size: 16px; font-weight: 700; color: #60a5fa;">
                      {todayStats.map(s => s?.totalLandings || 0)}
                    </div>
                    <div style="font-size: 9px; color: #6b7280;">Atterrissages</div>
                  </div>
                  <div style="text-align: center; width: calc(33.33% - 6px);">
                    <div style="font-size: 16px; font-weight: 700; color: #f59e0b;">
                      {todayStats.map(s => s ? Math.round(s.totalDistanceNm) : 0)} nm
                    </div>
                    <div style="font-size: 9px; color: #6b7280;">Distance</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Start Button */}
            <Button callback={onStartFreeFlight}>
              <div style={MappedSubject.create(
                ([ac, onG, ld]) => ac && onG && !ld
                  ? "padding: 16px; background: #22c55e; border-radius: 8px; text-align: center; cursor: pointer;"
                  : "padding: 16px; background: #374151; border-radius: 8px; text-align: center; opacity: 0.5;",
                missionCurrentAircraft.map(ac => !!ac),
                isOnGround,
                loading
              )}>
                <div style="font-size: 14px; font-weight: 700; color: white;">
                  {loading.map(l => l ? "CHARGEMENT..." : "DEMARRER VOL LIBRE")}
                </div>
                <div style="font-size: 10px; color: rgba(255,255,255,0.7); margin-top: 4px;">
                  L'XP sera calcule automatiquement
                </div>
              </div>
            </Button>

            {/* Requirements hint */}
            <div style={missionCurrentAircraft.map(ac => ac ? "display: none;" : "display: block;")}>
              <div style="text-align: center; font-size: 10px; color: #6b7280;">
                Vous devez etre connecte et avoir un avion de votre flotte charge
              </div>
            </div>
          </div>

          {/* ═══ IN_FLIGHT STATE: Show tracking stats ═══ */}
          <div style={freeFlightStatus.map(s => s === "in_flight" ? "display: flex; flex-direction: column; gap: 12px;" : "display: none;")}>

            {/* Flight Info Header */}
            <div style="background: rgba(34, 197, 94, 0.15); border: 1px solid #22c55e; border-radius: 8px; padding: 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <div style="font-size: 10px; color: #22c55e; text-transform: uppercase;">Depart</div>
                  <div style="font-size: 20px; font-weight: 700; color: white; font-family: monospace;">
                    {departureAirport.map(a => a || "----")}
                  </div>
                </div>
                <div style="text-align: center; flex: 1;">
                  <svg style="width: 24px; height: 24px; transform: rotate(90deg);" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </div>
                <div style="text-align: right;">
                  <div style="font-size: 10px; color: #9ca3af; text-transform: uppercase;">Position</div>
                  <div style="font-size: 20px; font-weight: 700; color: white; font-family: monospace;">
                    {currentAirport.map(a => a || "EN VOL")}
                  </div>
                </div>
              </div>
            </div>

            {/* Real-time Stats Grid (Flexbox for Coherent GT) */}
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
              {/* Flight Time */}
              <div style="background: #252532; border-radius: 8px; padding: 12px; width: calc(50% - 4px);">
                <div style="font-size: 9px; color: #6b7280; text-transform: uppercase; margin-bottom: 4px;">Temps de vol</div>
                <div style="font-size: 24px; font-weight: 700; color: #22c55e;">
                  {flightTimeMinutes.map(m => formatFlightTime(m))}
                </div>
              </div>

              {/* Distance */}
              <div style="background: #252532; border-radius: 8px; padding: 12px; width: calc(50% - 4px);">
                <div style="font-size: 9px; color: #6b7280; text-transform: uppercase; margin-bottom: 4px;">Distance</div>
                <div style="font-size: 24px; font-weight: 700; color: #60a5fa;">
                  {distanceFlownNm.map(d => Math.round(d))} <span style="font-size: 12px; color: #9ca3af;">nm</span>
                </div>
              </div>

              {/* Landings */}
              <div style="background: #252532; border-radius: 8px; padding: 12px; width: calc(50% - 4px);">
                <div style="font-size: 9px; color: #6b7280; text-transform: uppercase; margin-bottom: 4px;">Atterrissages</div>
                <div style="font-size: 24px; font-weight: 700; color: #f59e0b;">
                  {landingsCount}
                </div>
              </div>

              {/* Fuel Used */}
              <div style="background: #252532; border-radius: 8px; padding: 12px; width: calc(50% - 4px);">
                <div style="font-size: 9px; color: #6b7280; text-transform: uppercase; margin-bottom: 4px;">Carburant</div>
                <div style="font-size: 24px; font-weight: 700; color: #ef4444;">
                  {fuelUsedGallons.map(f => Math.round(f))} <span style="font-size: 12px; color: #9ca3af;">gal</span>
                </div>
              </div>
            </div>

            {/* Current flight data */}
            <div style="display: flex; gap: 8px;">
              <div style="flex: 1; background: #1a1a24; border-radius: 6px; padding: 8px; text-align: center;">
                <div style="font-size: 8px; color: #6b7280;">ALT</div>
                <div style="font-size: 14px; font-weight: 600; color: white;">
                  {currentAltitude.map(a => a.toLocaleString())} ft
                </div>
              </div>
              <div style="flex: 1; background: #1a1a24; border-radius: 6px; padding: 8px; text-align: center;">
                <div style="font-size: 8px; color: #6b7280;">GS</div>
                <div style="font-size: 14px; font-weight: 600; color: white;">
                  {groundSpeed} kts
                </div>
              </div>
              <div style="flex: 1; background: #1a1a24; border-radius: 6px; padding: 8px; text-align: center;">
                <div style="font-size: 8px; color: #6b7280;">STATUS</div>
                <div style={isOnGround.map(og => og
                  ? "font-size: 14px; font-weight: 600; color: #22c55e;"
                  : "font-size: 14px; font-weight: 600; color: #60a5fa;")}>
                  {isOnGround.map(og => og ? "AU SOL" : "EN VOL")}
                </div>
              </div>
            </div>

            {/* XP Preview */}
            <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: 8px; padding: 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <div style="font-size: 10px; color: rgba(255,255,255,0.7); text-transform: uppercase;">XP Estime</div>
                  <div style="font-size: 28px; font-weight: 700; color: white;">
                    +{estimatedXp} XP
                  </div>
                </div>
                <div style="text-align: right; font-size: 9px; color: rgba(255,255,255,0.6);">
                  <div>2 XP / minute</div>
                  <div>50 XP / atterrissage</div>
                  <div>25 XP / 100nm</div>
                </div>
              </div>
            </div>

            {/* End Flight Button */}
            <Button callback={onEndFreeFlight}>
              <div style={MappedSubject.create(
                ([onG, time, ld]) => onG && time >= 2 && !ld
                  ? "padding: 14px; background: #3b82f6; border-radius: 8px; text-align: center; cursor: pointer;"
                  : "padding: 14px; background: #374151; border-radius: 8px; text-align: center; opacity: 0.6;",
                isOnGround,
                flightTimeMinutes,
                loading
              )}>
                <div style="font-size: 14px; font-weight: 700; color: white;">
                  {loading.map(l => l ? "ENREGISTREMENT..." : "TERMINER LE VOL")}
                </div>
                <div style={flightTimeMinutes.map(t => t < 2
                  ? "font-size: 10px; color: #fca5a5; margin-top: 4px;"
                  : "display: none;")}>
                  Minimum 2 minutes de vol requis
                </div>
              </div>
            </Button>

            {/* Cancel (emergency) */}
            <Button callback={onCancelFreeFlight}>
              <div style="padding: 8px; text-align: center;">
                <span style="font-size: 10px; color: #6b7280; text-decoration: underline;">Annuler (sans sauvegarder)</span>
              </div>
            </Button>
          </div>

          {/* ═══ COMPLETED STATE: Show summary ═══ */}
          <div style={freeFlightStatus.map(s => s === "completed" ? "display: flex; flex-direction: column; gap: 12px;" : "display: none;")}>
            <div style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); border-radius: 12px; padding: 20px; text-align: center;">
              <svg style="width: 48px; height: 48px; margin-bottom: 12px;" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M8 12l2.5 2.5L16 9"/>
              </svg>
              <div style="font-size: 18px; font-weight: 700; color: white; margin-bottom: 4px;">Vol Termine!</div>
              <div style="font-size: 32px; font-weight: 700; color: white;">
                +{estimatedXp} XP
              </div>
            </div>

            {/* Summary stats */}
            <div style="background: #252532; border-radius: 8px; padding: 12px;">
              <div style="display: flex; flex-wrap: wrap; gap: 12px;">
                <div style="width: calc(50% - 6px);">
                  <div style="font-size: 9px; color: #6b7280;">Temps de vol</div>
                  <div style="font-size: 16px; font-weight: 600; color: white;">
                    {flightTimeMinutes.map(m => formatFlightTime(m))}
                  </div>
                </div>
                <div style="width: calc(50% - 6px);">
                  <div style="font-size: 9px; color: #6b7280;">Distance</div>
                  <div style="font-size: 16px; font-weight: 600; color: white;">
                    {distanceFlownNm.map(d => Math.round(d))} nm
                  </div>
                </div>
                <div style="width: calc(50% - 6px);">
                  <div style="font-size: 9px; color: #6b7280;">Atterrissages</div>
                  <div style="font-size: 16px; font-weight: 600; color: white;">{landingsCount}</div>
                </div>
                <div style="width: calc(50% - 6px);">
                  <div style="font-size: 9px; color: #6b7280;">Carburant utilise</div>
                  <div style="font-size: 16px; font-weight: 600; color: white;">
                    {fuelUsedGallons.map(f => Math.round(f))} gal
                  </div>
                </div>
              </div>
            </div>

            {/* New flight button */}
            <Button callback={onCancelFreeFlight}>
              <div style="padding: 14px; background: #3b82f6; border-radius: 8px; text-align: center;">
                <div style="font-size: 14px; font-weight: 700; color: white;">NOUVEAU VOL</div>
              </div>
            </Button>
          </div>

          {/* Error message */}
          <div style={error.map(e => e ? "display: block;" : "display: none;")}>
            <div style="padding: 10px; background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; border-radius: 6px;">
              <div style="font-size: 11px; color: #ef4444;">{error}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
