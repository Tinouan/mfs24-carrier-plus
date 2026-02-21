/**
 * MissionsView - Missions tab render function
 * Extracted from AeroCorpOnline.tsx for better maintainability
 * Contains: Apercu (tracking), Creation (3-step), Historique sub-tabs
 */
import { FSComponent, VNode, Subject, MappedSubject, NodeReference } from "@microsoft/msfs-sdk";
import { Button } from "@efb/efb-api";
import type { Language, ActiveMission, MissionRecapData, MissionAircraftInfo, MissionsSubTab, MissionCreationStatus } from "../types";
import type { FlightPhaseId } from "../state/CheckpointState";
import type { AntiCheatInfo } from "../state/MissionCreationState";
import { renderMissionRecapPopup, renderCargoTransferPopup, renderMissionTrackingPanel, type CargoPopupItem } from "../components";

// Re-export CargoPopupItem for use in AeroCorpOnline.tsx
export type { CargoPopupItem };

// V1.9: Inline type for mission aircraft systems (matches AeroCorpOnline.tsx)
interface MissionAircraftSystemsInfo {
  warnings: string[];
  critical: string[];
  can_takeoff: boolean;
}

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

export interface MissionsViewProps {
  // Core state
  activeTab: Subject<string>;
  missionsSubTab: Subject<MissionsSubTab>;
  currentLanguage: Subject<Language>;
  isLoggedIn: Subject<boolean>;

  // Active mission tracking
  activeMission: Subject<ActiveMission | null>;
  trackingProgressPercent: Subject<number>;
  trackingDistanceFlown: Subject<number>;
  missionDistanceNm: Subject<number>;
  flightPhaseColor: Subject<string>;
  flightPhaseText: Subject<string>;
  flightPhaseId: Subject<FlightPhaseId>;
  trackingCurrentAltitude: Subject<number>;
  trackingCanAccelerate: Subject<boolean>;

  // XP Bonus tracking
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

  // Mission creation - Step 1
  creationStep1Valid: Subject<boolean>;
  missionOriginIcao: Subject<string | null>;
  currentSimAircraftReg: Subject<string>;
  missionCurrentAircraft: Subject<MissionAircraftInfo | null>;
  missionAircraftSystems: Subject<MissionAircraftSystemsInfo | null>;
  missionAircraftInfoRef: NodeReference<HTMLDivElement>;

  // Mission creation - Step 2 (Cargo)
  creationStep2Valid: Subject<boolean>;
  cargoValidated: Subject<boolean>;
  selectedAircraftId: Subject<string | null>;
  aircraftCargoWeight: Subject<number>;
  aircraftCargoCapacity: Subject<number>;
  cargoLoading: Subject<boolean>;
  airportInventoryRef: NodeReference<HTMLDivElement>;
  aircraftCargoRef: NodeReference<HTMLDivElement>;

  // V4.1: Cargo source filter
  cargoSourceFilter: Subject<"player" | "company">;
  onSetCargoSourceFilter: (filter: "player" | "company") => void;

  // V4.1: Passengers
  aircraftPassengerSeats: Subject<number>;
  aircraftPassengerCount: Subject<number>;
  aircraftPassengerWeight: Subject<number>;
  airportPassengersRef: NodeReference<HTMLDivElement>;
  aircraftPassengersRef: NodeReference<HTMLDivElement>;

  // Mission creation - Step 3 (Flight Plan)
  creationStep3Valid: Subject<boolean>;
  fpValidated: Subject<boolean>;
  fpHasActivePlan: Subject<boolean>;
  fpWaypointCount: Subject<number>;
  fpTotalDistance: Subject<number>;
  fpOriginIcao: Subject<string>;
  fpDestinationIcao: Subject<string>;
  fpCanValidate: Subject<boolean>;
  fpFlightMode: Subject<'IFR' | 'VFR'>;
  fpDestinationInputRef: NodeReference<HTMLInputElement>;

  // Mission status
  missionStatus: Subject<MissionCreationStatus>;
  missionError: Subject<string | null>;
  missionWarnings: Subject<string[]>;
  antiCheatInfo: Subject<AntiCheatInfo | null>;
  creationErrorMsg: Subject<string>;
  canCreateMissionFlag: Subject<boolean>;

  // Cargo popup
  showCargoPopup: Subject<boolean>;
  cargoPopupDirection: Subject<"load" | "unload">;
  cargoPopupItem: Subject<CargoPopupItem | null>;
  cargoPopupSliderRef: NodeReference<HTMLInputElement>;
  cargoPopupQtyRef: NodeReference<HTMLSpanElement>;

  // Mission recap popup
  showMissionRecap: Subject<boolean>;
  missionRecapData: Subject<MissionRecapData | null>;

  // Mission history
  missionHistoryRef: NodeReference<HTMLDivElement>;
  missionHistoryLoading: Subject<boolean>;
  onFetchMissionHistory: () => void;

  // Callbacks
  onCancelMission: () => Promise<void>;
  onValidateCargoStep: () => void;
  onModifyCargoStep: () => void;
  onReadFlightPlanFromGPS: () => void;
  onValidateFlightPlan: () => void;
  onModifyFlightPlan: () => void;
  onCloseCargoPopup: () => void;
  onConfirmCargoTransfer: () => Promise<void>;
  onSetCargoQty: (qty: number) => void;
  onCreateMission: () => Promise<void>;
  t: (cat: string, key: string) => string;

  // Phase 6b: Toggle creation flow / contracts list in "disponibles"
  showCreationFlow: Subject<boolean>;
  onOpenCreationFlow: () => void;

  // Phase 3: Contract integration (from old ContratsView)
  availableContractsRef: NodeReference<HTMLDivElement>;
  contractFiltersRef: NodeReference<HTMLDivElement>;
  activeContractsRef: NodeReference<HTMLDivElement>;
  completedContractsRef: NodeReference<HTMLDivElement>;
  contractPopupRef: NodeReference<HTMLDivElement>;
  contractsLoading: Subject<boolean>;
  onRefreshContracts: () => void;
  isP2PMode: Subject<boolean>;
}

// ═══════════════════════════════════════════════════════════
// RENDER FUNCTION
// ═══════════════════════════════════════════════════════════

export function renderMissionsTab(props: MissionsViewProps): VNode {
  const {
    activeTab,
    missionsSubTab,
    currentLanguage,
    isLoggedIn,
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
    trackingGradeEstimated,
    trackingScoreEstimated,
    trackingScoreGforce,
    trackingGforceAlert,
    trackingCargoFillPercent,
    trackingAtcAssignedAlt,
    trackingAtcAltDeviation,
    trackingAtcCruiseSpd,
    trackingAtcSpdDeviation,
    trackingSimRate,
    trackingLightNav,
    trackingLightStrobe,
    trackingLightBeacon,
    trackingLightLanding,
    trackingLightTaxi,
    trackingLightsMissing,
    trackingLightsUnnecessary,
    trackingLightsStatusColor,
    trackingLightsAlert,
    // V5: Suivi vol
    trackingSuiviAtcMode,
    trackingSuiviCrossTrackNm,
    trackingSuiviRouteStatus,
    trackingSuiviInCruise,
    trackingSuiviAlert,
    // V6: Weather
    trackingWeatherScore,
    creationStep1Valid,
    missionOriginIcao,
    currentSimAircraftReg,
    missionCurrentAircraft,
    missionAircraftSystems,
    missionAircraftInfoRef,
    creationStep2Valid,
    cargoValidated,
    selectedAircraftId,
    aircraftCargoWeight,
    aircraftCargoCapacity,
    cargoLoading,
    airportInventoryRef,
    aircraftCargoRef,
    cargoSourceFilter,
    onSetCargoSourceFilter,
    aircraftPassengerSeats,
    aircraftPassengerCount,
    aircraftPassengerWeight,
    airportPassengersRef,
    aircraftPassengersRef,
    creationStep3Valid,
    fpValidated,
    fpHasActivePlan,
    fpWaypointCount,
    fpTotalDistance,
    fpOriginIcao,
    fpDestinationIcao,
    fpCanValidate,
    fpFlightMode,
    fpDestinationInputRef,
    missionStatus,
    missionError,
    missionWarnings,
    antiCheatInfo,
    creationErrorMsg,
    canCreateMissionFlag,
    showCargoPopup,
    cargoPopupDirection,
    cargoPopupItem,
    cargoPopupSliderRef,
    cargoPopupQtyRef,
    showMissionRecap,
    missionRecapData,
    missionHistoryRef,
    missionHistoryLoading,
    onFetchMissionHistory,
    onCancelMission,
    onValidateCargoStep,
    onModifyCargoStep,
    onReadFlightPlanFromGPS,
    onValidateFlightPlan,
    onModifyFlightPlan,
    onCloseCargoPopup,
    onConfirmCargoTransfer,
    onSetCargoQty,
    onCreateMission,
    t,
    // Phase 6b: Toggle creation flow
    showCreationFlow,
    onOpenCreationFlow,
    // Phase 3: Contract integration
    availableContractsRef,
    contractFiltersRef,
    activeContractsRef,
    completedContractsRef,
    contractPopupRef,
    contractsLoading,
    onRefreshContracts,
    isP2PMode,
  } = props;

  return (
    <div style={activeTab.map(tab => tab === "missions"
      ? "position: absolute; top: 0; left: 0; right: 0; bottom: 0; overflow: hidden; display: flex; flex-direction: column;"
      : "display: none;")}>

      {/* Phase 3: Missions Sub-Tabs Header — Disponibles / En cours / Historique */}
      <div style="display: flex; justify-content: center; align-items: center; padding: 10px 12px; background: #252532; border-bottom: 1px solid #374151; flex-shrink: 0;">
        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
          <Button callback={(): void => missionsSubTab.set("disponibles")}>
            <div style={missionsSubTab.map(tab => tab === "disponibles"
              ? "padding: 6px 12px; background: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white; font-weight: 600;"
              : "padding: 6px 12px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white;")}>
              {currentLanguage.map(l => (translations[l].missions as any).tabAvailable || "Available")}
            </div>
          </Button>
          <Button callback={(): void => missionsSubTab.set("en-cours")}>
            <div style={missionsSubTab.map(tab => tab === "en-cours"
              ? "padding: 6px 12px; background: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white; font-weight: 600;"
              : "padding: 6px 12px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white;")}>
              {currentLanguage.map(l => (translations[l].missions as any).tabInProgress || "In Progress")}
            </div>
          </Button>
          <Button callback={(): void => missionsSubTab.set("historique")}>
            <div style={missionsSubTab.map(tab => tab === "historique"
              ? "padding: 6px 12px; background: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white; font-weight: 600;"
              : "padding: 6px 12px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white;")}>
              {currentLanguage.map(l => translations[l].missions.history)}
            </div>
          </Button>
        </div>
      </div>

      {/* Missions Sub-Tab Content — disponibles: flex layout (fixed header+filters), others: scroll */}
      <div style={missionsSubTab.map(tab => tab === "disponibles"
        ? "flex: 1; display: flex; flex-direction: column; min-height: 0;"
        : "flex: 1; overflow-y: auto;")}>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* EN COURS SUB-TAB — Mission tracking + active contracts */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {renderMissionTrackingPanel({
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
          trackingGradeEstimated,
          trackingScoreEstimated,
          trackingScoreGforce,
          trackingGforceAlert,
          trackingCargoFillPercent,
          trackingAtcAssignedAlt,
          trackingAtcAltDeviation,
          trackingAtcCruiseSpd,
          trackingAtcSpdDeviation,
          trackingSimRate,
          trackingLightNav,
          trackingLightStrobe,
          trackingLightBeacon,
          trackingLightLanding,
          trackingLightTaxi,
          trackingLightsMissing,
          trackingLightsUnnecessary,
          trackingLightsStatusColor,
          trackingLightsAlert,
          trackingSuiviAtcMode,
          trackingSuiviCrossTrackNm,
          trackingSuiviRouteStatus,
          trackingSuiviInCruise,
          trackingSuiviAlert,
          trackingWeatherScore,
          onCancelMission,
          onGoToCreation: () => { missionsSubTab.set("disponibles"); showCreationFlow.set(true); onOpenCreationFlow(); },
        })}

        {/* Phase 3: Active contracts (below tracking panel, same sub-tab) */}
        <div style={missionsSubTab.map(tab => tab === "en-cours" ? "padding: 0 16px 16px; color: white;" : "display: none;")}>
          <div style="font-size: 12px; font-weight: 600; color: #9ca3af; margin-bottom: 8px; margin-top: 8px; border-top: 1px solid #374151; padding-top: 12px;">
            {currentLanguage.map(l => (translations[l] as any).contracts?.active || "Active Contracts")}
          </div>
          <div ref={activeContractsRef}></div>
        </div>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* DISPONIBLES SUB-TAB — Available contracts + mission creation */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <div style={missionsSubTab.map(tab => tab === "disponibles" ? "display: flex; flex-direction: column; padding: 12px; color: white; flex: 1; min-height: 0; box-sizing: border-box;" : "display: none;")}>

          {/* Phase 6b: Contracts list (visible when NOT in creation flow) */}
          <div style={MappedSubject.create(([logged, creating]) => logged && !creating ? "display: flex; flex-direction: column; flex: 1; min-height: 0;" : "display: none;", isLoggedIn, showCreationFlow)}>
            {/* Fixed header: title + compact create button (outside scroll area) */}
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 4px 0 8px; flex-shrink: 0;">
              <div style="font-size: 12px; font-weight: 600; color: #9ca3af; text-transform: uppercase;">
                {currentLanguage.map(l => (translations[l] as any).contracts?.available || "Available Contracts")}
              </div>
              <Button callback={(): void => { showCreationFlow.set(true); onOpenCreationFlow(); }}>
                <div style="background: #22c55e; color: #1a1a24; border-radius: 6px; padding: 6px 14px; font-size: 11px; font-weight: 600; white-space: nowrap;">
                  {currentLanguage.map(l => `+ ${translations[l].missions.creation}`)}
                </div>
              </Button>
            </div>
            {/* Fixed filters (outside scroll area, rendered by ContractController) */}
            <div ref={contractFiltersRef} style="flex-shrink: 0;"></div>
            {/* Scrollable: contract cards + refresh */}
            <div style="overflow-y: auto; flex: 1; min-height: 0;">
              {/* Loading */}
              <div style={contractsLoading.map(l => l ? "text-align: center; padding: 12px; color: #6b7280; font-size: 11px;" : "display: none;")}>
                {currentLanguage.map(l => translations[l].common.loading)}
              </div>
              {/* Contracts list (cards only) */}
              <div ref={availableContractsRef} style={contractsLoading.map(l => l ? "display: none;" : "")}></div>
              {/* Refresh button */}
              <div style={contractsLoading.map(l => l ? "display: none;" : "margin-top: 8px;")}>
                <Button callback={(): void => { onRefreshContracts(); }}>
                  <div style="background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; color: white; padding: 6px; border-radius: 6px; text-align: center; font-size: 10px;">
                    {currentLanguage.map(l => (translations[l] as any).contracts?.refresh || translations[l].common.refresh)}
                  </div>
                </Button>
              </div>
            </div>
          </div>

          {/* Not logged in message */}
          <div style={isLoggedIn.map(l => l ? "display: none;" : "display: block;")}>
            <div style="background: rgba(245, 158, 11, 0.15); border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; text-align: center;">
              <svg style="width: 32px; height: 32px; margin-bottom: 8px;" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v4"/>
                <path d="M12 16h.01"/>
              </svg>
              <div style="color: #f59e0b; font-size: 13px; font-weight: 600; margin-bottom: 4px;">{currentLanguage.map(l => translations[l].missions.loginRequired)}</div>
              <div style="color: #9ca3af; font-size: 11px;">{currentLanguage.map(l => translations[l].missions.loginToCreate)}</div>
            </div>
          </div>

          {/* Phase 6b: Logged in + creation flow active */}
          <div style={MappedSubject.create(([logged, creating]) => logged && creating ? "display: flex; flex-direction: column; flex: 1; gap: 10px; overflow-y: auto; min-height: 0;" : "display: none;", isLoggedIn, showCreationFlow)}>

            {/* Phase 6b: Back to contracts button */}
            <Button callback={(): void => { showCreationFlow.set(false); }}>
              <div style="display: flex; align-items: center; gap: 6px; color: #60a5fa; font-size: 11px; font-weight: 600; padding: 4px 0; margin-bottom: 4px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                {currentLanguage.map(l => (translations[l] as any).contracts?.available || "Available Contracts")}
              </div>
            </Button>

            {/* ===== STEP 1: CREATION MISSION ===== */}
            <div style="background: #252532; border-radius: 8px; overflow: visible;">
              {/* Step Header */}
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: #1a1a24;">
                <div style="font-size: 11px; font-weight: 600; color: #60a5fa;">
                  {currentLanguage.map(l => translations[l].missions.missionCreationTitle)}
                </div>
                <div style={creationStep1Valid.map(v => v
                  ? "font-size: 14px; color: #22c55e;"
                  : "font-size: 14px; color: #6b7280;")}>
                  {creationStep1Valid.map(v => v ? "[OK]" : "[ ]")}
                </div>
              </div>

              {/* Step Content */}
              <div style="padding: 12px;">
                {/* V1.5: VALIDATED STATE - Compact green summary */}
                <div style={creationStep1Valid.map(v => v ? "display: block;" : "display: none;")}>
                  <div style="padding: 10px; background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 6px; margin-bottom: 8px;">
                    <div style="font-size: 11px; color: #22c55e; font-weight: 600; margin-bottom: 6px;">
                      {currentLanguage.map(l => translations[l].missions.aircraftAndAirportValid)}
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                      <div>
                        <div style="font-size: 9px; color: #9ca3af; text-transform: uppercase;">{currentLanguage.map(l => translations[l].missions.departure)}</div>
                        <div style="font-family: monospace; font-size: 16px; font-weight: 700; color: white;">
                          {missionOriginIcao.map(o => o || "----")}
                        </div>
                      </div>
                      <div style="text-align: right;">
                        <div style="font-size: 9px; color: #9ca3af; text-transform: uppercase;">{currentLanguage.map(l => translations[l].missions.currentAircraft)}</div>
                        <div style="font-family: monospace; font-size: 14px; font-weight: 700; color: white;">
                          {currentSimAircraftReg.map(r => r || "----")}
                        </div>
                        <div style="font-size: 10px; color: #9ca3af;">
                          {missionCurrentAircraft.map(ac => ac?.aircraft_type || "")}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* NOT VALIDATED - Full display */}
                <div style={creationStep1Valid.map(v => v ? "display: none;" : "display: block;")}>
                  {/* Airport Auto-detect + Current Aircraft */}
                  <div style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end;">
                    <div>
                      <div style="font-size: 9px; color: #6b7280; text-transform: uppercase; margin-bottom: 2px;">
                        {currentLanguage.map(l => translations[l].missions.currentAirportGps)}
                      </div>
                      <div style={missionOriginIcao.map(o => o
                        ? "font-family: monospace; font-size: 18px; font-weight: 700; color: #60a5fa;"
                        : "font-family: monospace; font-size: 18px; font-weight: 700; color: #ef4444;")}>
                        {missionOriginIcao.map(o => o || "----")}
                      </div>
                    </div>
                    {/* V1.2: Current aircraft from simulator */}
                    <div style="text-align: right;">
                      <div style="font-size: 9px; color: #6b7280; text-transform: uppercase; margin-bottom: 2px;">
                        {currentLanguage.map(l => translations[l].missions.currentAircraft)}
                      </div>
                      <div style="display: flex; align-items: center; gap: 6px;">
                        <div style="font-family: monospace; font-size: 14px; font-weight: 700; color: #22c55e;">
                          {currentSimAircraftReg.map(r => r || "----")}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Warning when no GPS */}
                  <div style={missionOriginIcao.map(o => o
                    ? "display: none;"
                    : "margin-bottom: 12px; padding: 8px; background: rgba(239, 68, 68, 0.1); border-radius: 6px; font-size: 10px; color: #ef4444;")}>
                    {t("missions", "positionNotDetected")}
                  </div>

                  {/* Anti-cheat 3-position diagnostic banner */}
                  <div style={antiCheatInfo.map(info => info
                    ? "background: rgba(239, 68, 68, 0.15); border: 2px solid #ef4444; border-radius: 8px; padding: 14px 16px; margin: 12px 0;"
                    : "display: none;")}>
                    <div style="color: #ef4444; font-size: 15px; font-weight: bold; margin-bottom: 10px; text-align: center;">
                      {antiCheatInfo.map(info => info ? t("missions", "antiCheatTitle") : "")}
                    </div>
                    {/* Position pilote (jeu) - always green, it's the reference */}
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0;">
                      <span style="color: #9ca3af; font-size: 12px;">{antiCheatInfo.map(info => info ? t("missions", "positionGame") : "")}</span>
                      <span style={antiCheatInfo.map(() => "font-size: 14px; font-weight: bold; font-family: monospace; color: #22c55e;")}>
                        {antiCheatInfo.map(info => info ? info.refAirport : "")}
                      </span>
                    </div>
                    {/* Position physique (simulateur) - green if matches ref, red if not */}
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0;">
                      <span style="color: #9ca3af; font-size: 12px;">{antiCheatInfo.map(info => info ? t("missions", "positionSim") : "")}</span>
                      <span style={antiCheatInfo.map(info => info && info.simAirport && info.simAirport === info.refAirport
                        ? "font-size: 14px; font-weight: bold; font-family: monospace; color: #22c55e;"
                        : "font-size: 14px; font-weight: bold; font-family: monospace; color: #ef4444;")}>
                        {antiCheatInfo.map(info => info ? (info.simAirport || t("missions", "positionNotDetectedShort")) : "")}
                      </span>
                    </div>
                    {/* Position avion (jeu) - green if matches ref, red if not */}
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0;">
                      <span style="color: #9ca3af; font-size: 12px;">{antiCheatInfo.map(info => info ? info.acType : "")}</span>
                      <span style={antiCheatInfo.map(info => info && info.acAirport !== info.refAirport
                        ? "font-size: 14px; font-weight: bold; font-family: monospace; color: #ef4444;"
                        : "font-size: 14px; font-weight: bold; font-family: monospace; color: #22c55e;")}>
                        {antiCheatInfo.map(info => info ? info.acAirport : "")}
                      </span>
                    </div>
                    {/* Contextual help message */}
                    <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(239, 68, 68, 0.3); color: #fca5a5; font-size: 12px; text-align: center;">
                      {antiCheatInfo.map(info => info ? info.helpMsg : "")}
                    </div>
                  </div>

                  {/* V1.1: Aircraft Systems Warnings */}
                  <div style={missionAircraftSystems.map(sys => {
                    if (!sys) return "display: none;";
                    if (!sys.can_takeoff) {
                      return "margin-top: 8px; padding: 10px; background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; border-radius: 6px;";
                    }
                    if (sys.warnings.length > 0 || sys.critical.length > 0) {
                      return "margin-top: 8px; padding: 10px; background: rgba(245, 158, 11, 0.15); border: 1px solid #f59e0b; border-radius: 6px;";
                    }
                    return "display: none;";
                  })}>
                    {missionAircraftSystems.map(sys => {
                      if (!sys) return null;
                      const systemNames: Record<string, string> = {
                        "engine": t("hangar", "engine"), "landing_gear": t("hangar", "landingGear"), "tires": t("hangar", "tires"),
                        "brakes": t("hangar", "brakes"), "propeller": t("hangar", "propeller"), "oil": t("hangar", "oil"),
                        "flight_surfaces": t("hangar", "flightSurfaces"), "electrical": t("hangar", "electrical"),
                        "fuel_system": t("hangar", "fuelSystem"), "avionics": t("hangar", "avionics"),
                      };
                      if (!sys.can_takeoff) {
                        return (
                          <div>
                            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                              <svg style="width: 14px; height: 14px;" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
                              </svg>
                              <span style="font-size: 11px; color: #ef4444; font-weight: 600;">{t("hangar", "grounded")}</span>
                            </div>
                            <div style="font-size: 9px; color: #fca5a5;">
                              Systemes critiques: {sys.critical.map(s => systemNames[s] || s).join(", ")}
                            </div>
                            <div style="font-size: 9px; color: #fca5a5; margin-top: 2px;">
                              Reparation obligatoire avant decollage
                            </div>
                          </div>
                        );
                      }
                      const allWarnings = [...sys.critical, ...sys.warnings];
                      return (
                        <div>
                          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                            <svg style="width: 14px; height: 14px;" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2">
                              <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                            </svg>
                            <span style="font-size: 11px; color: #f59e0b; font-weight: 600;">ATTENTION</span>
                          </div>
                          <div style="font-size: 9px; color: #fcd34d;">
                            Systemes uses: {allWarnings.map(s => systemNames[s] || s).join(", ")}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>{/* End NOT VALIDATED */}

                {/* Aircraft Info Card — hidden after cargo validation */}
                <div ref={missionAircraftInfoRef} style={cargoValidated.map(v => v ? "display: none;" : "margin-top: 8px;")}>
                  <div style="text-align: center; padding: 16px; color: #6b7280; font-size: 11px;">
                    {t("missions", "waitingForAircraft")}
                  </div>
                </div>
              </div>
            </div>

            {/* ===== STEP 2: CARGO ===== */}
            <div style={MappedSubject.create(([step1, ac]) => !step1
              ? "display: none;"
              : ac
                ? "background: #252532; border-radius: 8px; overflow: visible;"
                : "background: #252532; border-radius: 8px; overflow: visible; opacity: 0.5;",
              creationStep1Valid, missionCurrentAircraft)}>
              {/* Step Header */}
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: #1a1a24;">
                <div style={creationStep2Valid.map(v => v
                  ? "font-size: 11px; font-weight: 600; color: #22c55e;"
                  : "font-size: 11px; font-weight: 600; color: #f59e0b;")}>
                  {currentLanguage.map(l => translations[l].missions.step2Cargo)}
                </div>
                <div style={creationStep2Valid.map(v => v
                  ? "font-size: 14px; color: #22c55e;"
                  : "font-size: 14px; color: #6b7280;")}>
                  {creationStep2Valid.map(v => v ? "[OK]" : "[ ]")}
                </div>
              </div>

              {/* Step Content - Only when aircraft detected */}
              <div style={missionCurrentAircraft.map(ac => ac ? "padding: 12px;" : "display: none;")}>

                {/* Cargo NOT validated - Show editing UI */}
                <div style={cargoValidated.map(v => v ? "display: none;" : "display: block;")}>
                  {/* Cargo capacity bar */}
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="font-size: 9px; color: #6b7280; text-transform: uppercase;">{currentLanguage.map(l => translations[l].hangar.cargo)}</div>
                    <div style="font-size: 10px; color: #f59e0b;">
                      {aircraftCargoWeight.map(w => w.toFixed(0))}kg / {aircraftCargoCapacity.map(c => c)}kg
                    </div>
                  </div>

                  {/* Loading indicator */}
                  <div style={cargoLoading.map(l => l ? "text-align: center; padding: 8px; color: #60a5fa; font-size: 11px;" : "display: none;")}>
                    {currentLanguage.map(l => translations[l].common.loading)}
                  </div>

                  {/* V4.1: Cargo source filter toggle */}
                  <div style={cargoLoading.map(l => l ? "display: none;" : "display: flex; align-items: center; gap: 8px; margin-bottom: 8px;")}>
                    <div style="font-size: 9px; color: #6b7280;">{currentLanguage.map(l => translations[l].inventory?.loadFrom || "Load from")}</div>
                    <div style="display: flex; gap: 4px;">
                      <Button callback={(): void => onSetCargoSourceFilter("player")}>
                        <div style={cargoSourceFilter.map(f => f === "player"
                          ? "padding: 4px 10px; background: #3b82f6; border-radius: 4px; font-size: 10px; color: white; font-weight: 600;"
                          : "padding: 4px 10px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 4px; font-size: 10px; color: #3b82f6;")}>
                          {currentLanguage.map(l => translations[l].inventory?.personal || "Personal")}
                        </div>
                      </Button>
                      <Button callback={(): void => onSetCargoSourceFilter("company")}>
                        <div style={cargoSourceFilter.map(f => f === "company"
                          ? "padding: 4px 10px; background: #f59e0b; border-radius: 4px; font-size: 10px; color: #1a1a24; font-weight: 600;"
                          : "padding: 4px 10px; background: rgba(245, 158, 11, 0.2); border: 1px solid #f59e0b; border-radius: 4px; font-size: 10px; color: #f59e0b;")}>
                          {currentLanguage.map(l => (translations[l].company as any)?.tabTitle || "Company")}
                        </div>
                      </Button>
                    </div>
                  </div>

                  {/* Two column layout */}
                  <div style={cargoLoading.map(l => l ? "display: none;" : "display: flex; gap: 8px;")}>
                    {/* Left: Airport inventory */}
                    <div style="flex: 1; background: #1a1a24; border-radius: 6px; padding: 8px; max-height: 120px; overflow-y: auto;">
                      <div style="font-size: 9px; color: #6b7280; text-transform: uppercase; margin-bottom: 6px; text-align: center;">
                        {currentLanguage.map(l => translations[l].missions.airport)}
                      </div>
                      <div ref={airportInventoryRef}>
                        <div style="color: #9ca3af; font-size: 10px; text-align: center; padding: 8px;">
                          {t("missions", "noItem")}
                        </div>
                      </div>
                    </div>

                    {/* Right: Aircraft cargo */}
                    <div style="flex: 1; background: #1a1a24; border-radius: 6px; padding: 8px; max-height: 120px; overflow-y: auto;">
                      <div style="font-size: 9px; color: #6b7280; text-transform: uppercase; margin-bottom: 6px; text-align: center;">
                        {currentLanguage.map(l => translations[l].missions.aircraftHold)}
                      </div>
                      <div ref={aircraftCargoRef}>
                        <div style="color: #9ca3af; font-size: 10px; text-align: center; padding: 8px;">
                          {t("missions", "emptyHold")}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div style="margin-top: 8px; background: #374151; border-radius: 4px; height: 6px; overflow: hidden;">
                    <div style={aircraftCargoWeight.map(w => {
                      const cap = aircraftCargoCapacity.get();
                      const pct = cap > 0 ? Math.min((w / cap) * 100, 100) : 0;
                      const color = pct > 90 ? "#ef4444" : pct > 70 ? "#f59e0b" : "#22c55e";
                      return `width: ${pct}%; height: 100%; background: ${color}; transition: width 0.3s;`;
                    })}>
                    </div>
                  </div>

                  {/* V4.1: PASSENGERS SECTION */}
                  <div style={cargoLoading.map(l => l ? "display: none;" : "margin-top: 12px; border-top: 1px solid #374151; padding-top: 12px;")}>
                    {/* Section header with seats count */}
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                      <div style="font-size: 10px; font-weight: 600; color: #a855f7;">
                        {currentLanguage.map(l => translations[l].missions?.passengers || "Passengers")}
                      </div>
                      <div style="font-size: 10px; color: #a855f7;">
                        {currentLanguage.map(l => translations[l].missions?.seats || "Seats")}: {aircraftPassengerCount} / {aircraftPassengerSeats}
                      </div>
                    </div>

                    {/* Two column layout for passengers */}
                    <div style="display: flex; gap: 8px;">
                      {/* Left: Airport personnel */}
                      <div style="flex: 1; background: #1a1a24; border-radius: 6px; padding: 8px; max-height: 80px; overflow-y: auto;">
                        <div style="font-size: 9px; color: #6b7280; text-transform: uppercase; margin-bottom: 6px; text-align: center;">
                          {currentLanguage.map(l => translations[l].missions?.atAirport || "At airport")}
                        </div>
                        <div ref={airportPassengersRef}>
                          <div style="color: #9ca3af; font-size: 10px; text-align: center; padding: 4px;">
                            -
                          </div>
                        </div>
                      </div>

                      {/* Right: Aircraft passengers */}
                      <div style="flex: 1; background: #1a1a24; border-radius: 6px; padding: 8px; max-height: 80px; overflow-y: auto;">
                        <div style="font-size: 9px; color: #6b7280; text-transform: uppercase; margin-bottom: 6px; text-align: center;">
                          {currentLanguage.map(l => translations[l].missions?.inAircraft || "In aircraft")}
                        </div>
                        <div ref={aircraftPassengersRef}>
                          <div style="color: #9ca3af; font-size: 10px; text-align: center; padding: 4px;">
                            -
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Passenger weight */}
                    <div style="margin-top: 6px; text-align: right; font-size: 9px; color: #9ca3af;">
                      {currentLanguage.map(l => translations[l].missions?.passengerWeight || "Pax weight")}: {aircraftPassengerWeight.map(w => w.toFixed(0))} kg
                    </div>
                  </div>

                  {/* Validate Cargo Button */}
                  <Button callback={(): void => { onValidateCargoStep(); }}>
                    <div style="width: 100%; margin-top: 10px; background: #f59e0b; color: #1a1a24; border-radius: 6px; padding: 10px; font-size: 11px; font-weight: 600; text-align: center; box-sizing: border-box;">
                      {currentLanguage.map(l => translations[l].missions.validate)}
                    </div>
                  </Button>
                </div>

                {/* Cargo VALIDATED - Show summary */}
                <div style={cargoValidated.map(v => v ? "display: block;" : "display: none;")}>
                  <div style="padding: 10px; background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 6px; margin-bottom: 8px;">
                    <div style="font-size: 11px; color: #22c55e; font-weight: 600; margin-bottom: 4px;">
                      {currentLanguage.map(l => translations[l].missions.cargoValidatedApplied)}
                    </div>
                    <div style="font-size: 13px; color: white; font-weight: 700;">
                      {aircraftCargoWeight.map(w => w.toFixed(0))} {currentLanguage.map(l => translations[l].missions.kgLoaded)}
                    </div>
                  </div>
                  <Button callback={(): void => { onModifyCargoStep(); }}>
                    <div style="width: 100%; background: #374151; color: #9ca3af; border-radius: 6px; padding: 8px; font-size: 11px; text-align: center; box-sizing: border-box;">
                      {currentLanguage.map(l => translations[l].missions.modify)}
                    </div>
                  </Button>
                </div>
              </div>

              {/* Disabled state message */}
              <div style={selectedAircraftId.map(id => id ? "display: none;" : "padding: 12px; text-align: center; color: #6b7280; font-size: 10px;")}>
                {t("missions", "selectAircraftFirst")}
              </div>
            </div>

            {/* ===== STEP 3: PLAN DE VOL ===== */}
            <div style={MappedSubject.create(([step1, v]) => !step1
              ? "display: none;"
              : v
                ? "background: #252532; border-radius: 8px; overflow: hidden;"
                : "background: #252532; border-radius: 8px; overflow: hidden; opacity: 0.5;",
              creationStep1Valid, cargoValidated)}>
              {/* Step Header */}
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: #1a1a24;">
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span style="font-size: 11px; font-weight: 600; color: #22c55e;">
                    {currentLanguage.map(l => translations[l].missions.step3FlightPlan)}
                  </span>
                  <span style={fpFlightMode.map(m => m === 'VFR'
                    ? "padding: 2px 8px; background: #f59e0b; color: white; border-radius: 4px; font-size: 10px; font-weight: 600;"
                    : m === 'IFR'
                      ? "padding: 2px 8px; background: #3b82f6; color: white; border-radius: 4px; font-size: 10px; font-weight: 600;"
                      : "display: none;")}>
                    {fpFlightMode}
                  </span>
                </div>
                <div style={creationStep3Valid.map(v => v
                  ? "font-size: 14px; color: #22c55e;"
                  : "font-size: 14px; color: #6b7280;")}>
                  {creationStep3Valid.map(v => v ? "[OK]" : "[ ]")}
                </div>
              </div>

              {/* Step Content - Only when cargo validated */}
              <div style={cargoValidated.map(v => v ? "padding: 12px;" : "display: none;")}>

                {/* Flight Plan NOT validated - Show input UI */}
                <div style={fpValidated.map(v => v ? "display: none;" : "display: block;")}>
                  {/* Instructions */}
                  <div style="font-size: 10px; color: #9ca3af; margin-bottom: 10px; text-align: center;">
                    {t("missions", "flightPlanInstructions")}
                  </div>

                  {/* Read Flight Plan Button */}
                  <div style="display: flex; gap: 8px; margin-bottom: 10px;">
                    <Button callback={(): void => { onReadFlightPlanFromGPS(); }}>
                      <div style="flex: 1; background: #374151; color: #9ca3af; border-radius: 6px; padding: 8px; font-size: 11px; text-align: center; box-sizing: border-box;">
                        {currentLanguage.map(l => translations[l].missions.readGps)}
                      </div>
                    </Button>
                  </div>

                  {/* VFR mode message */}
                  <div style={fpFlightMode.map(m => m === 'VFR'
                    ? "color: #f59e0b; font-size: 11px; margin-bottom: 10px; text-align: center; padding: 8px; background: rgba(245, 158, 11, 0.1); border-radius: 6px;"
                    : "display: none;")}>
                    Aucun plan GPS detecte — saisissez la destination pour un vol VFR direct
                  </div>

                  {/* Flight Plan Info */}
                  <div style="background: #1a1a24; border-radius: 6px; padding: 10px; margin-bottom: 10px;">
                    {/* Active plan line — hidden in VFR */}
                    <div style={fpFlightMode.map(m => m === 'VFR'
                      ? "display: none;"
                      : "display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 6px;")}>
                      <span style="color: #6b7280;">{currentLanguage.map(l => translations[l].missions.activePlan)}:</span>
                      <span style={fpHasActivePlan.map(h => h ? "color: #22c55e; font-weight: 600;" : "color: #ef4444;")}>
                        {MappedSubject.create(([h, l]) => h ? translations[l].common.yes : translations[l].common.no, fpHasActivePlan, currentLanguage)}
                      </span>
                    </div>
                    {/* Waypoints line — hidden in VFR */}
                    <div style={fpFlightMode.map(m => m === 'VFR'
                      ? "display: none;"
                      : "display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 6px;")}>
                      <span style="color: #6b7280;">Waypoints:</span>
                      <span style="color: white;">{fpWaypointCount}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 6px;">
                      <span style="color: #6b7280;">{fpFlightMode.map(m => m === 'VFR' ? "Distance estimee:" : "Distance:")}</span>
                      <span style="color: white;">{fpTotalDistance.map(d => d.toFixed(1))} nm</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 6px;">
                      <span style="color: #6b7280;">{currentLanguage.map(l => translations[l].missions.origin)}:</span>
                      <span style="color: #60a5fa; font-family: monospace;">{fpOriginIcao.map(o => o || missionOriginIcao.get() || "----")}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 10px;">
                      <span style="color: #6b7280;">Destination:</span>
                      <input
                        ref={fpDestinationInputRef}
                        type="text"
                        maxLength={4}
                        placeholder="ICAO"
                        style="width: 60px; background: #1f2937; border: 1px solid #374151; border-radius: 4px; color: #22c55e; font-family: monospace; font-size: 11px; padding: 4px 6px; text-align: center; text-transform: uppercase;"
                        onkeydown={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
                        onkeyup={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
                        onkeypress={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
                      />
                    </div>
                  </div>

                  {/* Validate Flight Plan Button */}
                  <div style="width: 100%;">
                    <Button callback={(): void => { onValidateFlightPlan(); }}>
                      <div style={fpCanValidate.map(canValidate => canValidate
                        ? "width: 100%; background: #22c55e; color: #1a1a24; border-radius: 6px; padding: 10px; font-size: 11px; font-weight: 600; text-align: center; box-sizing: border-box;"
                        : "width: 100%; background: #374151; color: #6b7280; border-radius: 6px; padding: 10px; font-size: 11px; font-weight: 600; text-align: center; box-sizing: border-box;")}>
                        {currentLanguage.map(l => translations[l].missions.validateFlightPlan)}
                      </div>
                    </Button>
                  </div>
                </div>

                {/* Flight Plan VALIDATED - Show summary */}
                <div style={fpValidated.map(v => v ? "display: block;" : "display: none;")}>
                  <div style="padding: 10px; background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 6px; margin-bottom: 8px;">
                    <div style="font-size: 11px; color: #22c55e; font-weight: 600; margin-bottom: 6px;">
                      {currentLanguage.map(l => translations[l].missions.flightPlanValidated)}
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                      <span style="font-family: monospace; font-size: 16px; font-weight: 700; color: #60a5fa;">
                        {fpOriginIcao.map(o => o || missionOriginIcao.get() || "----")}
                      </span>
                      <svg viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" style="width:14px;height:14px;"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                      <span style="font-family: monospace; font-size: 16px; font-weight: 700; color: #22c55e;">
                        {fpDestinationIcao}
                      </span>
                    </div>
                    <div style="font-size: 10px; color: #9ca3af;">
                      {fpTotalDistance.map(d => d.toFixed(1))} nm
                      {fpFlightMode.map(m => m === 'VFR' ? ' • VFR direct' : '')}
                      {MappedSubject.create(([m, wc]) => m === 'IFR' ? ` • ${wc} waypoints` : '', fpFlightMode, fpWaypointCount)}
                    </div>
                  </div>
                  <Button callback={(): void => { onModifyFlightPlan(); }}>
                    <div style="width: 100%; background: #374151; color: #9ca3af; border-radius: 6px; padding: 8px; font-size: 11px; text-align: center; box-sizing: border-box;">
                      {currentLanguage.map(l => translations[l].missions.modify)}
                    </div>
                  </Button>
                </div>
              </div>

              {/* Disabled state message */}
              <div style={cargoValidated.map(v => v ? "display: none;" : "padding: 12px; text-align: center; color: #6b7280; font-size: 10px;")}>
                {t("missions", "validateCargoFirst")}
              </div>
            </div>

            {/* Cargo Transfer Popup - V2.4: Extracted to component */}
            {renderCargoTransferPopup({
              showCargoPopup,
              cargoPopupDirection,
              cargoPopupItem,
              cargoPopupSliderRef,
              cargoPopupQtyRef,
              currentLanguage,
              onCloseCargoPopup,
              onConfirmCargoTransfer,
              onSetCargoQty,
            })}

            {/* Mission Recap Popup - V2.4: Extracted to component */}
            {renderMissionRecapPopup({
              showMissionRecap,
              missionRecapData,
              currentLanguage,
              t,
            })}

            {/* Active Mission Card */}
            <div style={activeMission.map(m => m
              ? "background: rgba(245, 158, 11, 0.15); border: 1px solid #f59e0b; border-radius: 8px; padding: 12px;"
              : "display: none;")}>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div style="font-size: 10px; color: #f59e0b; text-transform: uppercase; font-weight: 600;">{currentLanguage.map(l => translations[l].missions.activeMission)}</div>
                <div style={activeMission.map(m => m
                  ? "font-size: 9px; padding: 2px 6px; background: #f59e0b; color: #1a1a24; border-radius: 4px; font-weight: 600;"
                  : "display: none;")}>
                  {activeMission.map(m => m?.status?.toUpperCase() || "")}
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <span style="font-family: monospace; font-size: 16px; font-weight: 700; color: #60a5fa;">
                  {activeMission.map(m => m?.origin_icao || "")}
                </span>
                <svg viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" style="width:14px;height:14px;"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                <span style="font-family: monospace; font-size: 16px; font-weight: 700; color: #22c55e;">
                  {activeMission.map(m => m?.destination_icao || "")}
                </span>
              </div>
              <div style="font-size: 11px; color: #9ca3af; margin-bottom: 10px;">
                {activeMission.map(m => m?.aircraft_type || "")}
              </div>
              <Button callback={(): void => { void onCancelMission(); }}>
                <div style="background: #ef4444; color: white; border-radius: 6px; padding: 8px 16px; font-size: 12px; font-weight: 600; text-align: center;">
                  {t("missions", "cancelMission")}
                </div>
              </Button>
            </div>

            {/* Error Message */}
            <div style={missionError.map(e => e
              ? "background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; border-radius: 8px; padding: 12px; text-align: center;"
              : "display: none;")}>
              <div style="color: #ef4444; font-size: 12px;">
                {missionError}
              </div>
            </div>

            {/* Success Message */}
            <div style={missionStatus.map(s => s === "success"
              ? "background: rgba(34, 197, 94, 0.15); border: 1px solid #22c55e; border-radius: 8px; padding: 12px; text-align: center;"
              : "display: none;")}>
              <div style="color: #22c55e; font-size: 12px; font-weight: 600; margin-bottom: 4px;">
                {currentLanguage.map(l => translations[l].missions.missionCreatedSuccess)}
              </div>
              <div style="color: #9ca3af; font-size: 11px;">
                {activeMission.map(m => m ? `${m.origin_icao} -> ${m.destination_icao}` : "")}
              </div>
            </div>

            {/* Create Mission Button + Error Message (responsive) */}
            <div style={creationStep1Valid.map(v => v
              ? "margin-top: auto; padding-top: 8px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px;"
              : "display: none;")}>
              <Button
                callback={(): void => { void onCreateMission(); }}
                disabled={missionStatus.map(s => s === "creating" || s === "loading")}>
                <div style={canCreateMissionFlag.map(canCreate => canCreate
                  ? "background: #22c55e; color: #1a1a24; border-radius: 8px; padding: 12px 20px; font-size: 13px; font-weight: 600; text-align: center;"
                  : "background: #374151; color: #6b7280; border-radius: 8px; padding: 12px 20px; font-size: 13px; font-weight: 600; text-align: center;")}>
                  {MappedSubject.create(([s, l]) => s === "creating" ? translations[l].missions.creating : translations[l].missions.createMissionBtn, missionStatus, currentLanguage)}
                </div>
              </Button>
              {/* Validation error message - wraps to new line if needed */}
              <div style={creationErrorMsg.map(msg => msg
                ? "color: #f59e0b; font-size: 10px; flex: 1 1 auto; min-width: 100px;"
                : "display: none;")}>
                {creationErrorMsg}
              </div>
            </div>

            {/* Instructions V2 */}
            <div style="padding: 10px; background: rgba(96, 165, 250, 0.1); border-radius: 8px; border: 1px solid rgba(96, 165, 250, 0.3); margin-top: 8px;">
              <p style="font-size: 10px; color: #9ca3af; margin: 0;">
                {currentLanguage.map(l => translations[l].missions.instruction1)}<br/>
                {currentLanguage.map(l => translations[l].missions.instruction2)}<br/>
                {currentLanguage.map(l => translations[l].missions.instruction3)}
              </p>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* HISTORIQUE SUB-TAB */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <div style={missionsSubTab.map(tab => tab === "historique" ? "padding: 16px; color: white;" : "display: none;")}>
          {/* Not logged in message */}
          <div style={isLoggedIn.map(l => l ? "display: none;" : "display: block;")}>
            <div style="background: rgba(245, 158, 11, 0.15); border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; text-align: center;">
              <svg style="width: 32px; height: 32px; margin-bottom: 8px;" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v4"/>
                <path d="M12 16h.01"/>
              </svg>
              <div style="color: #f59e0b; font-size: 13px; font-weight: 600; margin-bottom: 4px;">{currentLanguage.map(l => translations[l].missions.loginRequired)}</div>
              <div style="color: #9ca3af; font-size: 11px;">{currentLanguage.map(l => translations[l].missions.loginToSeeHistory)}</div>
            </div>
          </div>

          {/* Logged in content */}
          <div style={isLoggedIn.map(l => l ? "display: block;" : "display: none;")}>
            {/* Title */}
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <div style="font-size: 12px; font-weight: 600; color: #9ca3af; text-transform: uppercase;">
                {currentLanguage.map(l => translations[l].company.missionHistory)}
              </div>
            </div>

            {/* Loading state */}
            <div style={missionHistoryLoading.map(l => l ? "display: flex; justify-content: center; padding: 24px;" : "display: none;")}>
              <div style="color: #9ca3af; font-size: 12px;">{currentLanguage.map(l => translations[l].common.loading)}</div>
            </div>

            {/* History list */}
            <div style={missionHistoryLoading.map(l => l ? "display: none;" : "display: block;")}>
              <div ref={missionHistoryRef}>
                <div style="background: #252532; border-radius: 12px; padding: 24px; text-align: center;">
                  <svg style="width: 40px; height: 40px; margin-bottom: 12px; opacity: 0.4;" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5">
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
                    <rect x="9" y="3" width="6" height="4" rx="1"/>
                    <path d="M9 12h6"/>
                    <path d="M9 16h6"/>
                  </svg>
                  <div style="color: #6b7280; font-size: 12px;">{currentLanguage.map(l => translations[l].common.loading)}</div>
                </div>
              </div>
            </div>

            {/* Refresh button */}
            <div style="margin-top: 12px;">
              <Button callback={(): void => { onFetchMissionHistory(); }} disabled={missionHistoryLoading}>
                <div style={missionHistoryLoading.map(l => l
                  ? "background: #374151; color: #6b7280; padding: 10px; border-radius: 8px; text-align: center; font-size: 11px;"
                  : "background: #3b82f6; color: white; padding: 10px; border-radius: 8px; text-align: center; font-size: 11px; font-weight: 500;")}>
                  {MappedSubject.create(([loading, lang]) => loading ? translations[lang].common.loading : translations[lang].common.refresh, missionHistoryLoading, currentLanguage)}
                </div>
              </Button>
            </div>

            {/* Phase 3: Completed contracts */}
            <div style="margin-top: 16px; border-top: 1px solid #374151; padding-top: 12px;">
              <div style="font-size: 12px; font-weight: 600; color: #9ca3af; margin-bottom: 8px;">
                {currentLanguage.map(l => l === "fr" ? "Contrats termines" : "Completed Contracts")}
              </div>
              <div ref={completedContractsRef}></div>
            </div>
          </div>
        </div>

      </div>

      {/* Phase 3: Contract popup overlay */}
      <div ref={contractPopupRef} style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none; z-index: 50;"></div>

    </div>
  );
}
