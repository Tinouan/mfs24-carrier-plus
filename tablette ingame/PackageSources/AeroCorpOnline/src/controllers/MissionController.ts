import { EventBus, NodeReference } from "@microsoft/msfs-sdk";
import { FleetRouter, MissionRouter, WorldRouter, MarketRouter, ContractRouter } from "../services";
import { popupManager, trackingManager, missionCreationManager } from "../managers";
import { DatabaseManager } from "../managers/DatabaseManager";
import { ItemService } from "../services/ItemService";
import { InitService } from "../services/InitService";
import { PositionService } from "../services/PositionService";
import { positionState } from "../state/positionState";
import {
  missionState, missionCreationState, trackingState, checkpointState, cargoState,
  authState, simVarState, popupState, hangarState, settingsState, navigationState, marketState,
} from "../state";
import { isGameReady } from "../state/GameModeState";
import {
  setSimulatorFuel,
  renderAirportInventoryHtml, renderAircraftCargoHtml,
  renderAirportPassengersHtml, renderAircraftPassengersHtml,
  renderMissionAircraftInfoHtml,
  type AirportInventoryItem, type AircraftCargoItem, type PassengerItem,
  type MissionAircraftData, type MissionAircraftTranslations, type MissionAircraftInfoState,
} from "../helpers";
import type { MissionRecapData } from "../types";
import { haversineDistanceNm } from "../services/SimVarReader";

// Global MSFS declarations in src/types/msfs-globals.d.ts

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface MissionRefs {
  aircraftList: NodeReference<HTMLDivElement>;
  airportInventory: NodeReference<HTMLDivElement>;
  aircraftCargo: NodeReference<HTMLDivElement>;
  airportPassengers: NodeReference<HTMLDivElement>;
  aircraftPassengers: NodeReference<HTMLDivElement>;
  cargoPopupSlider: NodeReference<HTMLInputElement>;
  cargoPopupQty: NodeReference<HTMLSpanElement>;
  fpDestinationInput: NodeReference<HTMLInputElement>;
  missionAircraftInfo: NodeReference<HTMLDivElement>;
}

interface MissionCallbacks {
  onRefreshProfileInventory: () => void;
  setupInputEventBlocker: (el: HTMLInputElement) => void;
  onOpenRefuelPopup: () => void;
  onOpenSystemsPopup: () => void;
}

// ═══════════════════════════════════════════════════════════
// CONTROLLER
// ═══════════════════════════════════════════════════════════

export class MissionController {
  // Refs (passed from AeroCorpOnline)
  private aircraftListRef: NodeReference<HTMLDivElement>;
  private airportInventoryRef: NodeReference<HTMLDivElement>;
  private aircraftCargoRef: NodeReference<HTMLDivElement>;
  private airportPassengersRef: NodeReference<HTMLDivElement>;
  private aircraftPassengersRef: NodeReference<HTMLDivElement>;
  private cargoPopupSliderRef: NodeReference<HTMLInputElement>;
  private cargoPopupQtyRef: NodeReference<HTMLSpanElement>;
  private fpDestinationInputRef: NodeReference<HTMLInputElement>;
  private missionAircraftInfoRef: NodeReference<HTMLDivElement>;

  // Mission state (instance properties moved from WOA)
  private availableAircraftList: Array<{
    id: string;
    registration: string | null;
    aircraft_type: string;
    aircraft_model: string | null;
    cargo_capacity_kg: number;
  }> = [];
  private airportInventory: Array<{
    item_id: string;
    item_name: string;
    quantity: number;
    weight_kg: number;
    location_id: string;
    location_name: string;
    owner_type?: "player" | "company";
    category?: string;
    source?: string;
    contract_id?: string;
    contract_route?: string;
    item_icon?: string;
    item_icon_path?: string;
    item_tier?: number;
  }> = [];
  private aircraftCargo: Array<{
    item_id: string;
    item_name: string;
    qty: number;
    weight_kg: number;
    total_weight_kg: number;
    source?: string;
    contract_id?: string;
    contract_route?: string;
    item_icon?: string;
    item_icon_path?: string;
    item_tier?: number;
  }> = [];

  // Flight tracking state
  private flightTrackingActive = false;
  private flightTrackingInterval: number | null = null;
  public payloadStartLbs = 0;
  public payloadVerifiedLbs = 0;
  public payloadVerificationDone = false;
  public maxGForce = 1.0;
  public landingFpm = 0;
  public flightStartTime: Date | null = null;
  public fuelStartPercent = 0;

  // FlightPlanner event subscriptions (msfs-sdk)
  private fplEventSubscriptions: Array<{ destroy(): void }> = [];

  // Real-time tracking state
  public realTimeStartMs: number = 0;
  public simTimeStartSec: number = 0;
  private lastWpNextId: string = "";
  private autopilotEverUsed: boolean = false;
  private originLat: number = 0;
  private originLon: number = 0;
  private destLat: number = 0;
  private destLon: number = 0;

  // Translation
  private t: (section: string, key: string) => string;

  // Callbacks to shared WOA methods
  private callbacks: MissionCallbacks;

  constructor(
    refs: MissionRefs,
    translate: (section: string, key: string) => string,
    callbacks: MissionCallbacks
  ) {
    this.aircraftListRef = refs.aircraftList;
    this.airportInventoryRef = refs.airportInventory;
    this.aircraftCargoRef = refs.aircraftCargo;
    this.airportPassengersRef = refs.airportPassengers;
    this.aircraftPassengersRef = refs.aircraftPassengers;
    this.cargoPopupSliderRef = refs.cargoPopupSlider;
    this.cargoPopupQtyRef = refs.cargoPopupQty;
    this.fpDestinationInputRef = refs.fpDestinationInput;
    this.missionAircraftInfoRef = refs.missionAircraftInfo;
    this.t = translate;
    this.callbacks = callbacks;
  }

  // ═══════════════════════════════════════════════════════════
  // BLOC 1: VALIDATION + ICAO EXTRACTION
  // ═══════════════════════════════════════════════════════════

  // Update fpCanValidate based on current state
  public updateFpCanValidate(): void {
    const hasActivePlan = missionCreationState.fpHasActivePlan.get();
    const destIcao = missionCreationState.fpDestinationInput.get();
    const flightMode = missionCreationState.fpFlightMode.get();

    if (flightMode === 'VFR') {
      // VFR: destination ICAO must be 4 chars, exist in airports cache, and differ from origin
      const destExists = destIcao.length === 4 &&
        this.databaseManager.getAirportsCache().some(a => a.ident === destIcao.toUpperCase());
      const originIcao = missionCreationState.fpOriginIcao.get();
      missionCreationState.fpCanValidate.set(destExists && destIcao.toUpperCase() !== originIcao.toUpperCase());
    } else {
      // IFR: unchanged
      missionCreationState.fpCanValidate.set(hasActivePlan && destIcao.length === 4);
    }
  }

  /**
   * Extract ICAO aircraft type from various MSFS SimVar formats.
   */
  public extractIcaoType(atcModel: string): string {
    if (!atcModel) return "";

    // Format: "ATCCOM.AC_MODEL C172.0.text" - extract between AC_MODEL and the dot/number
    const acModelMatch = atcModel.match(/AC_MODEL\s+([A-Z0-9]+)/i);
    if (acModelMatch) {
      return acModelMatch[1].toUpperCase();
    }

    // Format: "$$:PC12" or similar with colon
    if (atcModel.includes(":")) {
      const afterColon = atcModel.split(":").pop();
      if (afterColon) return afterColon.toUpperCase();
    }

    // Format: Direct ICAO code (2-4 alphanumeric characters)
    if (/^[A-Z0-9]{2,4}$/i.test(atcModel.trim())) {
      return atcModel.trim().toUpperCase();
    }

    // Try to find common ICAO patterns anywhere in the string
    const icaoPatterns = [
      /\b(A320|A321|A330|A340|A350|A380)\b/i,     // Airbus
      /\b(B7[0-9]{2}|B73[0-9]|B74[0-9]|B75[0-9]|B76[0-9]|B77[0-9]|B78[0-9])\b/i, // Boeing
      /\b(C1[0-9]{2}|C208|C172|C152|C182|C206)\b/i, // Cessna
      /\b(PA[0-9]{2}|PA28|PA34|PA44|PA46)\b/i,     // Piper
      /\b(PC12|PC24|TBM[0-9]|SR2[0-9]|DA[0-9]{2})\b/i, // Pilatus, Daher, Cirrus, Diamond
      /\b(E[0-9]{3}|CRJ[0-9])\b/i,                 // Embraer, CRJ
      /\b(AT[0-9]{2}|DH[0-9]{2}|BE[0-9]{2}|BE[A-Z][0-9])\b/i, // ATR, De Havilland, Beechcraft
    ];

    for (const pattern of icaoPatterns) {
      const match = atcModel.match(pattern);
      if (match) {
        return match[1].toUpperCase();
      }
    }

    // Fallback: return original string uppercase
    return atcModel.toUpperCase();
  }

  // ═══════════════════════════════════════════════════════════
  // BLOC 2: DESTINATION INPUT SETUP
  // ═══════════════════════════════════════════════════════════

  public setupDestinationInput(input: HTMLInputElement | null): void {
    if (!input) return;

    // First, setup keyboard capture
    this.callbacks.setupInputEventBlocker(input);

    // Then, add input event listener to capture typed value into Subject
    input.addEventListener("input", (e: Event) => {
      const target = e.target as HTMLInputElement;
      const value = target.value.toUpperCase();
      missionCreationState.fpDestinationInput.set(value);

      // VFR: calculate distance in real-time when ICAO is 4 chars
      if (missionCreationState.fpFlightMode.get() === 'VFR' && value.length === 4) {
        const originIcao = missionCreationState.fpOriginIcao.get();
        const airports = this.databaseManager.getAirportsCache();
        const origin = airports.find(a => a.ident === originIcao);
        const dest = airports.find(a => a.ident === value);
        if (origin && dest) {
          const distNm = haversineDistanceNm(origin.latitude, origin.longitude, dest.latitude, dest.longitude);
          missionCreationState.fpTotalDistance.set(Math.round(distNm * 10) / 10);
        }
      }
      this.updateFpCanValidate();
    });

    // Also capture on keyup as a fallback
    input.addEventListener("keyup", (e: KeyboardEvent) => {
      const target = e.target as HTMLInputElement;
      const value = target.value.toUpperCase();
      if (value !== missionCreationState.fpDestinationInput.get()) {
        missionCreationState.fpDestinationInput.set(value);
        this.updateFpCanValidate();
      }
    });
  }

  // ═══════════════════════════════════════════════════════════
  // BLOC 3: AIRCRAFT LIST + MISSION ORIGIN
  // ═══════════════════════════════════════════════════════════

  private renderAircraftList(): void {
    const el = this.aircraftListRef.getOrDefault();
    if (!el) return;

    if (this.availableAircraftList.length === 0) {
      el.innerHTML = `
        <div style="text-align: center; padding: 12px; color: #f59e0b; font-size: 12px;">
          {this.t("map", "noAircraftAtAirport")}
        </div>
      `;
      return;
    }

    const selectedId = missionState.selectedAircraftId.get();
    const currentSimReg = simVarState.currentSimAircraftReg.get();

    const sortedAircraft = [...this.availableAircraftList].sort((a, b) => {
      const aIsActive = a.registration?.toUpperCase() === currentSimReg;
      const bIsActive = b.registration?.toUpperCase() === currentSimReg;
      if (aIsActive && !bIsActive) return -1;
      if (!aIsActive && bIsActive) return 1;
      return 0;
    });

    const html = sortedAircraft.map(ac => {
      const isSelected = selectedId === ac.id;
      const isCurrentAircraft = ac.registration?.toUpperCase() === currentSimReg;
      const isLocked = !isCurrentAircraft;

      let bgStyle: string;
      let opacity: string;
      let cursor: string;

      if (isLocked) {
        bgStyle = "background: #1f2937; border: 1px solid #ef4444;";
        opacity = "opacity: 1;";
        cursor = "cursor: not-allowed;";
      } else if (isSelected) {
        bgStyle = "background: rgba(59, 130, 246, 0.2); border: 2px solid #22c55e;";
        opacity = "opacity: 1;";
        cursor = "cursor: pointer;";
      } else {
        bgStyle = "background: #374151; border: 1px solid #22c55e;";
        opacity = "opacity: 1;";
        cursor = "cursor: pointer;";
      }

      const radioStyle = isSelected && !isLocked
        ? "width: 18px; height: 18px; border-radius: 50%; background: #3b82f6; display: flex; align-items: center; justify-content: center;"
        : "width: 18px; height: 18px; border-radius: 50%; border: 2px solid #6b7280;";
      const innerDot = isSelected && !isLocked
        ? `<div style="width: 8px; height: 8px; background: white; border-radius: 50%;"></div>`
        : "";

      const lockIndicator = isLocked
        ? `<div style="display: flex; align-items: center; gap: 4px;">
             <svg style="width: 14px; height: 14px; fill: #ef4444;" viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM9 8V6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9z"/></svg>
             <span style="font-size: 9px; color: #ef4444;">${this.t("hangar", "boardAircraft")}</span>
           </div>`
        : `<div style="${radioStyle}">${innerDot}</div>`;

      const activeIndicator = !isLocked
        ? `<div style="position: absolute; top: 4px; right: 4px; font-size: 8px; color: #22c55e; font-weight: 600;">${this.t("hangar", "active")}</div>`
        : "";

      const thumbnailUrl = ac.aircraft_model
        ? `coui://html_ui/efb_ui/efb_apps/AeroCorpOnline/Assets/aircraft/${ac.aircraft_model.toUpperCase()}.jpg`
        : "";

      return `
        <div class="aircraft-item" data-id="${ac.id}" data-locked="${isLocked}" style="position: relative; display: flex; align-items: center; gap: 10px; padding: 8px; ${bgStyle} ${opacity} ${cursor} border-radius: 6px; margin-bottom: 6px;">
          ${activeIndicator}
          <img src="${thumbnailUrl}" alt="" style="width: 50px; height: 35px; object-fit: cover; border-radius: 4px; flex-shrink: 0;" onerror="this.style.display='none'" />
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 600; color: white; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${ac.registration || ac.aircraft_type}</div>
            <div style="font-size: 11px; color: #9ca3af;">${ac.aircraft_model || ac.aircraft_type} - ${ac.cargo_capacity_kg} kg</div>
          </div>
          ${lockIndicator}
        </div>
      `;
    }).join("");

    el.innerHTML = html;

    el.querySelectorAll(".aircraft-item").forEach((item) => {
      item.addEventListener("click", () => {
        const isLocked = item.getAttribute("data-locked") === "true";
        if (isLocked) {
          console.log("[ACO] Aircraft locked - not current aircraft");
          return;
        }

        const id = item.getAttribute("data-id");
        if (id) {
          missionState.selectedAircraftId.set(id);
          this.renderAircraftList();
          void this.fetchAircraftCargo(id);
          const origin = missionState.missionOriginIcao.get();
          if (origin) {
            void this.fetchAirportInventoryForCargo(origin);
          }
          this.readCurrentFuel();
          void this.fetchMissionAircraftSystems(id);
          missionCreationState.cargoValidated.set(false);
          this.updateCreationSteps();
        }
      });
    });
  }

  public async fetchAvailableAircraft(icao: string): Promise<void> {
    if (!isGameReady()) {
      console.log("[ACO] Not logged in, cannot fetch aircraft");
      return;
    }

    console.log("[ACO] Fetching available aircraft at:", icao);
    missionState.missionStatus.set("loading");
    missionState.missionError.set(null);

    try {
      const aircraft = await FleetRouter.getAvailableAtAirport(icao);
      console.log("[ACO] Available aircraft:", aircraft);
      this.availableAircraftList = aircraft;
      missionState.missionStatus.set("idle");

      if (aircraft.length > 0) {
        missionState.selectedAircraftId.set(aircraft[0].id);
        void this.fetchAircraftCargo(aircraft[0].id);
        void this.fetchAirportInventoryForCargo(icao);
        this.readCurrentFuel();
        this.updateCreationSteps();
      }

      this.renderAircraftList();
    } catch (error) {
      console.error("[ACO] Error fetching aircraft:", error);
      missionState.missionError.set(this.t("missions", "errorLoadingAircrafts"));
      this.availableAircraftList = [];
      this.renderAircraftList();
      missionState.missionStatus.set("error");
    }
  }

  public async refreshMissionOrigin(): Promise<void> {
    missionState.missionStatus.set("idle");
    missionState.missionWarnings.set([]);

    // BDD is the ONLY source of truth — use PositionService
    const dbAirport = PositionService.getDbPosition();

    if (dbAirport && dbAirport !== "----" && dbAirport !== "") {
      console.log(`[ACO] refreshMissionOrigin: origin from DB = ${dbAirport}`);
      missionState.missionOriginIcao.set(dbAirport);
      void this.loadCurrentAircraftForMission();
      this.fetchActiveMission();
    } else {
      console.warn("[ACO] refreshMissionOrigin: no airport in DB — player must set initial position");
      missionState.missionOriginIcao.set(null);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // BLOC 4: CREATION + FLIGHT PLAN + CARGO VALIDATION
  // ═══════════════════════════════════════════════════════════

  public async updateCreationSteps(): Promise<void> {
    const aircraft = missionState.missionCurrentAircraft.get();
    const hasAircraft = aircraft !== null;
    const cargoOk = missionCreationState.cargoValidated.get();
    const flightPlanOk = missionCreationState.fpValidated.get();

    // ── Anti-cheat: collect 3 positions ──
    let locationValid = true;
    const acType = aircraft?.aircraft_type || "";

    // Reference: DB player.current_airport (fallback to preferred_airport if lost)
    const user = authState.currentUser.get();
    const refAirport = user?.current_airport?.toUpperCase() || user?.preferred_airport?.toUpperCase() || "";

    // SimVar airport — use detected airport (GPS or lat/lon fallback) for display
    const rawSimAirport = (positionState.simVarAirport.get() || "").toUpperCase();
    const detectedAirport = PositionService.getDetectedSimAirport().toUpperCase();
    // If PositionService confirms correct airport (via lat/lon) but GPS = "----", show DB airport
    const isCorrect = PositionService.isAtCorrectAirport();
    let simAirport = detectedAirport || rawSimAirport;
    if (isCorrect && (!simAirport || simAirport === "----")) {
      simAirport = refAirport;
    }

    // Aircraft DB location
    let acAirport = refAirport; // default = assume match
    if (hasAircraft && aircraft!.current_airport_ident) {
      acAirport = aircraft!.current_airport_ident.toUpperCase();
    }

    // Check mismatches — use PositionService which handles GPS "----" via lat/lon fallback
    const simMatch = !refAirport || isCorrect;
    const acMatch = !refAirport || acAirport === refAirport;

    if (hasAircraft && (!simMatch || !acMatch)) {
      locationValid = false;
    }

    const step1Valid = hasAircraft && locationValid;
    missionCreationState.creationStep1Valid.set(step1Valid);
    missionCreationState.creationStep2Valid.set(step1Valid && cargoOk);
    missionCreationState.creationStep3Valid.set(step1Valid && flightPlanOk);

    const allValid = step1Valid && cargoOk && flightPlanOk;
    missionCreationState.canCreateMissionFlag.set(allValid);

    // Anti-cheat info (3-position diagnostic)
    if (hasAircraft && !locationValid) {
      let helpMsg = this.t("missions", "allMustMatch");
      if (!simMatch && !acMatch) {
        // If GPS returns "----", don't suggest transferring to "----"
        if (simAirport === "----" || simAirport === "") {
          helpMsg = this.t("missions", "loadFlightAt").replace("{airport}", refAirport);
        } else {
          helpMsg = this.t("missions", "loadOrTransfer").replace("{airport}", refAirport).replace("{sim}", simAirport);
        }
      } else if (!simMatch) {
        helpMsg = this.t("missions", "loadFlightAt").replace("{airport}", refAirport);
      } else if (!acMatch) {
        helpMsg = this.t("missions", "transferAcHere").replace("{airport}", refAirport);
      }
      missionCreationState.antiCheatInfo.set({ refAirport, simAirport, acAirport, acType, helpMsg });
    } else {
      missionCreationState.antiCheatInfo.set(null);
    }

    // Validation error for cargo/flight plan only (displayed at bottom)
    if (!hasAircraft) {
      missionCreationState.creationErrorMsg.set(this.t("missions", "aircraftNotDetected"));
    } else if (!locationValid) {
      missionCreationState.creationErrorMsg.set("");
    } else if (!cargoOk) {
      missionCreationState.creationErrorMsg.set(this.t("missions", "validateCargo"));
    } else if (!flightPlanOk) {
      missionCreationState.creationErrorMsg.set(this.t("missions", "validateFlightPlanError"));
    } else {
      missionCreationState.creationErrorMsg.set("");
    }

    console.log("[ACO] updateCreationSteps:", { step1: step1Valid, locationValid, simAirport, acAirport, refAirport });
  }

  public readFlightPlanFromGPS(): void {
    missionCreationManager.readFlightPlanFromGPS();

    setTimeout(() => {
      this.setupDestinationInput(this.fpDestinationInputRef.getOrDefault());
    }, 100);
  }

  // ============== EFB FlightPlanner Event Subscription ==============

  public subscribeToFlightPlannerEvents(bus: EventBus): void {
    try {
      if (!bus) return;

      this.fplEventSubscriptions.push(
        bus.getSubscriber<any>().on("fplCreated").handle((event: any) => this.onEfbFlightPlanCreated(event)),
        bus.getSubscriber<any>().on("fplLoaded").handle((event: any) => this.onEfbFlightPlanLoaded(event)),
        bus.getSubscriber<any>().on("fplCalculated").handle((event: any) => this.onEfbFlightPlanCalculated(event)),
        bus.getSubscriber<any>().on("fplOriginDestChanged").handle((event: any) => this.onEfbFlightPlanOriginDestChanged(event)),
        bus.getSubscriber<any>().on("fplLegChange").handle(() => { /* leg change */ })
      );
    } catch (error) {
      console.error("[ACO] FlightPlanner events error:", error);
    }
  }

  public unsubscribeFromFlightPlannerEvents(): void {
    for (const sub of this.fplEventSubscriptions) {
      try { sub.destroy(); } catch { /* ignore */ }
    }
    this.fplEventSubscriptions = [];
  }

  private onEfbFlightPlanCreated(_event: any): void {
    popupState.popupNotification.set(this.t("missions", "efbFlightPlanCreated"));
    this.tryReadEfbFlightPlan();
  }

  private onEfbFlightPlanLoaded(_event: any): void {
    popupState.popupNotification.set(this.t("missions", "efbFlightPlanLoaded"));
    this.tryReadEfbFlightPlan();
  }

  private onEfbFlightPlanCalculated(_event: any): void {
    this.tryReadEfbFlightPlan();
  }

  private onEfbFlightPlanOriginDestChanged(event: any): void {
    if (event?.airport) {
      const icao = event.airport?.icao || "";
      if (event.type === "OriginChanged" && icao) {
        missionCreationState.fpOriginIcao.set(icao);
      } else if (event.type === "DestinationChanged" && icao) {
        missionCreationState.fpDestinationInput.set(icao);
        const inputEl = this.fpDestinationInputRef.getOrDefault();
        if (inputEl) inputEl.value = icao;
      }
    }
  }

  private tryReadEfbFlightPlan(): void {
    try {
      Coherent.call("GET_FLIGHTPLAN").then((fp: any) => {
        if (fp) this.processEfbFlightPlan(fp);
      }).catch(() => { /* not available */ });

      Coherent.call("LOAD_CURRENT_ATC_FLIGHTPLAN").then(() => {
        return Coherent.call("GET_FLIGHTPLAN");
      }).then((fp: any) => {
        if (fp) this.processEfbFlightPlan(fp);
      }).catch(() => { /* not available */ });

      Coherent.call("GET_FLIGHTPLAN_WAYPOINT_COUNT").then((count: any) => {
        if (typeof count === "number" && count > 0) {
          this.readWaypointsOneByOne(count);
        }
      }).catch(() => { /* not available */ });

      Coherent.call("GET_CURRENT_FLIGHTPLAN").then((fp: any) => {
        if (fp) this.processEfbFlightPlan(fp);
      }).catch(() => { /* not available */ });

      Coherent.call("FLIGHTPLAN_GET_CURRENT").then((fp: any) => {
        if (fp) this.processEfbFlightPlan(fp);
      }).catch(() => { /* not available */ });

      Promise.all([
        Coherent.call("GET_FLIGHTPLAN_ORIGIN").catch(() => null),
        Coherent.call("GET_FLIGHTPLAN_DESTINATION").catch(() => null),
      ]).then(([origin, dest]: any[]) => {
        if (origin?.icao) missionCreationState.fpOriginIcao.set(origin.icao);
        if (dest?.icao) missionCreationState.fpDestinationInput.set(dest.icao);
      });
    } catch (error) {
      console.error("[ACO] EFB flight plan error:", error);
    }
  }

  private readWaypointsOneByOne(count: number): void {
    const waypoints: Array<{ ident: string; lat: number; lon: number; type: string }> = [];
    const promises = [];
    for (let i = 0; i < count; i++) {
      promises.push(
        Coherent.call("GET_FLIGHTPLAN_WAYPOINT", i).then((wp: any) => {
          if (wp) {
            waypoints[i] = {
              ident: wp.ident || wp.icao || `WP${i}`,
              lat: wp.lla?.lat || wp.lat || 0,
              lon: wp.lla?.long || wp.lla?.lon || wp.lon || 0,
              type: wp.waypointType || wp.type || "unknown",
            };
          }
        }).catch(() => { /* skip */ })
      );
    }

    Promise.all(promises).then(() => {
      const validWps = waypoints.filter(w => w);
      if (validWps.length > 0) {
        const origin = validWps[0]?.ident || "";
        const dest = validWps[validWps.length - 1]?.ident || "";
        if (/^[A-Z]{4}$/.test(origin)) missionCreationState.fpOriginIcao.set(origin);
        if (/^[A-Z]{4}$/.test(dest)) missionCreationState.fpDestinationInput.set(dest);
        popupState.popupNotification.set(`Plan EFB: ${origin} -> ${dest} (${validWps.length} WPs)`);
      }
    });
  }

  private processEfbFlightPlan(fp: any): void {
    const waypoints: Array<{ ident: string; lat: number; lon: number; type: string }> = [];
    let origin = "";
    let destination = "";
    let totalDistance = 0;

    try {
      if (fp.waypoints && Array.isArray(fp.waypoints) && fp.waypoints.length > 0) {
        for (let i = 0; i < fp.waypoints.length; i++) {
          const wp = fp.waypoints[i];
          if (!wp) continue; // Skip undefined entries (VFR plans may have sparse arrays)
          const ident = wp.ident || wp.icao || "";
          waypoints.push({
            ident,
            lat: wp.lla?.lat || wp.lat || 0,
            lon: wp.lla?.long || wp.lla?.lon || wp.lon || 0,
            type: wp.waypointType || wp.type || "unknown",
          });
          if (i === 0 && /^[A-Z]{4}$/.test(ident)) origin = ident;
          if (i === fp.waypoints.length - 1 && /^[A-Z]{4}$/.test(ident)) destination = ident;
        }
      }
    } catch (e) {
      console.log("[MissionController] Error parsing EFB flight plan waypoints (VFR?):", e);
    }

    if (!origin) {
      const originCandidates = [
        fp.directToOrigin?.icao, fp.directToOrigin?.ident,
        fp.originAirport?.icao, fp.originAirport?.ident,
        fp.departure?.icao, fp.departure?.ident,
        fp.origin?.icao, fp.origin?.ident,
      ];
      for (const c of originCandidates) {
        if (c && /^[A-Z]{4}$/.test(c)) { origin = c; break; }
      }
    }

    if (!destination) {
      const destCandidates = [
        fp.directToTarget?.icao, fp.directToTarget?.ident,
        fp.destinationAirport?.icao, fp.destinationAirport?.ident,
        fp.arrival?.icao, fp.arrival?.ident,
        fp.destination?.icao, fp.destination?.ident,
      ];
      for (const c of destCandidates) {
        if (c && /^[A-Z]{4}$/.test(c)) { destination = c; break; }
      }
    }

    totalDistance = fp.totalDistance || fp.distance || 0;

    if (origin) missionCreationState.fpOriginIcao.set(origin);
    if (destination) {
      missionCreationState.fpDestinationInput.set(destination);
      const inputEl = this.fpDestinationInputRef.getOrDefault();
      if (inputEl) inputEl.value = destination;
    }
    if (waypoints.length > 0) missionCreationState.fpWaypointCount.set(waypoints.length);
    if (totalDistance > 0) missionCreationState.fpTotalDistance.set(totalDistance);

    popupState.popupNotification.set(`Plan EFB: ${origin} -> ${destination} (${waypoints.length} WPs)`);
  }

  public validateFlightPlan(): void {
    const inputEl = this.fpDestinationInputRef.getOrDefault();
    let destination = (inputEl?.value || "").toUpperCase().trim();

    if (!destination) {
      destination = missionCreationState.fpDestinationInput.get().toUpperCase().trim();
    }
    console.log("[ACO] Flight plan validation - destination:", destination);

    if (!destination || !/^[A-Z]{4}$/.test(destination)) {
      popupState.popupNotification.set(this.t("missions", "enterValidIcao"));
      console.log("[ACO] Invalid ICAO format");
      return;
    }

    const wpCount = missionCreationState.fpWaypointCount.get();
    const hasActivePlan = missionCreationState.fpHasActivePlan.get();
    console.log("[ACO] Waypoint count:", wpCount, "| GPS Active:", hasActivePlan);

    const flightMode = missionCreationState.fpFlightMode.get();
    if (flightMode === 'IFR' && wpCount < 2 && !hasActivePlan) {
      popupState.popupNotification.set(this.t("missions", "readGpsFirst"));
      return;
    }

    console.log("[ACO] Validating flight plan OK!");
    missionCreationState.fpDestinationIcao.set(destination);
    missionCreationState.fpDestinationInput.set(destination);
    missionCreationState.fpValidated.set(true);

    const origin = missionCreationState.fpOriginIcao.get();

    // VFR: ensure distance is computed from haversine if not already set
    if (flightMode === 'VFR' && missionCreationState.fpTotalDistance.get() === 0) {
      const airports = this.databaseManager.getAirportsCache();
      const originAp = airports.find(a => a.ident === origin);
      const destAp = airports.find(a => a.ident === destination);
      if (originAp && destAp) {
        const distNm = haversineDistanceNm(originAp.latitude, originAp.longitude, destAp.latitude, destAp.longitude);
        missionCreationState.fpTotalDistance.set(Math.round(distNm * 10) / 10);
      }
    }

    const distance = missionCreationState.fpTotalDistance.get();
    const modeLabel = flightMode === 'VFR' ? 'VFR' : 'IFR';

    popupState.popupNotification.set(`Plan valide (${modeLabel}): ${origin} > ${destination} (${distance} nm)`);
    this.updateCreationSteps();
  }

  public modifyFlightPlan(): void {
    missionCreationState.fpValidated.set(false);
    this.updateCreationSteps();
  }

  public validateCargoStep(): void {
    const cargoWeight = cargoState.aircraftCargoWeight.get();
    const fuelPercent = missionCreationState.fuelTargetPercent.get();

    void this.applyCargoToAircraft(cargoWeight);
    this.applyFuelToAircraft();

    missionCreationState.cargoValidated.set(true);
    popupState.popupNotification.set(`Cargo: ${cargoWeight.toFixed(0)} kg, Fuel: ${fuelPercent}%`);
    this.updateCreationSteps();
  }

  private async applyCargoToAircraft(cargoWeightKg: number): Promise<void> {
    try {
      const stationCount = SimVar.GetSimVarValue("PAYLOAD STATION COUNT", "number") as number || 0;
      if (stationCount < 1) return;

      const cargoKeywords = ["BAGGAGE", "CARGO", "FREIGHT", "LUGGAGE", "HOLD", "POD", "BELLY"];
      const cargoStations: number[] = [];

      for (let i = 1; i <= stationCount; i++) {
        const name = (SimVar.GetSimVarValue(`PAYLOAD STATION NAME:${i}`, "string") as string || "").toUpperCase();
        if (cargoKeywords.some(keyword => name.includes(keyword))) {
          cargoStations.push(i);
        }
      }

      if (cargoStations.length === 0) cargoStations.push(stationCount);

      for (const station of cargoStations) {
        await SimVar.SetSimVarValue(`PAYLOAD STATION WEIGHT:${station}`, "kilograms", 0);
      }
      await new Promise(resolve => setTimeout(resolve, 200));

      if (cargoWeightKg > 0) {
        const weightPerStation = cargoWeightKg / cargoStations.length;
        for (const station of cargoStations) {
          await SimVar.SetSimVarValue(`PAYLOAD STATION WEIGHT:${station}`, "kilograms", weightPerStation);
        }
      }
    } catch (e) {
      console.error("[ACO] Error applying cargo:", e);
    }
  }

  public modifyCargoStep(): void {
    missionCreationState.cargoValidated.set(false);
    this.updateCreationSteps();
  }

  public readCurrentFuel(): void {
    try {
      const fuelCapacityGal = SimVar.GetSimVarValue("FUEL TOTAL CAPACITY", "gallons") as number || 0;
      const fuelQuantityGal = SimVar.GetSimVarValue("FUEL TOTAL QUANTITY", "gallons") as number || 0;
      const fuelCapacityKg = fuelCapacityGal * 3.785 * 0.8;
      const fuelPercent = fuelCapacityGal > 0 ? Math.round((fuelQuantityGal / fuelCapacityGal) * 100) : 0;

      missionCreationState.fuelCapacityKg.set(Math.round(fuelCapacityKg));
      missionCreationState.fuelCurrentPercent.set(fuelPercent);
      missionCreationState.fuelTargetPercent.set(fuelPercent);

      console.log("[ACO] Fuel read:", fuelPercent, "% (", Math.round(fuelQuantityGal * 3.785 * 0.8), "kg /", Math.round(fuelCapacityKg), "kg)");
    } catch (e) {
      console.error("[ACO] Error reading fuel:", e);
    }
  }

  private applyFuelToAircraft(): void {
    try {
      const targetPercent = missionCreationState.fuelTargetPercent.get();
      const fuelCapacityGal = SimVar.GetSimVarValue("FUEL TOTAL CAPACITY", "gallons") as number || 0;
      const targetQuantityGal = (targetPercent / 100) * fuelCapacityGal;

      SimVar.SetSimVarValue("FUEL TOTAL QUANTITY", "gallons", targetQuantityGal);

      missionCreationState.fuelCurrentPercent.set(targetPercent);
      console.log("[ACO] Fuel set to:", targetPercent, "% (", Math.round(targetQuantityGal), "gallons)");
    } catch (e) {
      console.error("[ACO] Error setting fuel:", e);
    }
  }

  private canCreateMission(): boolean {
    return missionCreationState.creationStep1Valid.get() &&
           missionCreationState.creationStep2Valid.get() &&
           missionCreationState.creationStep3Valid.get();
  }

  private resetCreationSteps(): void {
    missionState.selectedAircraftId.set(null);
    missionCreationState.cargoValidated.set(false);
    missionCreationState.fpValidated.set(false);
    missionCreationState.fpDestinationInput.set("");
    missionCreationState.fpDestinationIcao.set("");
    missionCreationState.fpOriginIcao.set("");
    missionCreationState.fpWaypointCount.set(0);
    missionCreationState.fpTotalDistance.set(0);
    missionCreationState.fpHasActivePlan.set(false);
    missionCreationState.creationStep1Valid.set(false);
    missionCreationState.creationStep2Valid.set(false);
    missionCreationState.creationStep3Valid.set(false);
    missionState.missionAircraftSystems.set(null);
    this.updateCreationSteps();
  }

  public async createMissionV11(): Promise<void> {
    if (!this.canCreateMission()) {
      missionState.missionError.set(this.t("missions", "completeAllSteps"));
      return;
    }

    const origin = missionCreationState.fpOriginIcao.get() || missionState.missionOriginIcao.get();
    const destination = missionCreationState.fpDestinationIcao.get();
    const aircraftId = missionState.selectedAircraftId.get();
    const distance = missionCreationState.fpTotalDistance.get();
    const waypointCount = missionCreationState.fpWaypointCount.get();

    if (!isGameReady() || !origin || !destination || !aircraftId) {
      console.log("[ACO] createMissionV11: Missing data - origin:", origin, "destination:", destination, "aircraftId:", aircraftId);
      missionState.missionError.set(this.t("missions", "missingMissionData"));
      return;
    }

    const existingMissionForAircraft = await DatabaseManager.getActiveMissionForAircraft(aircraftId);
    if (existingMissionForAircraft) {
      console.log("[ACO] Aircraft already has active mission:", existingMissionForAircraft.id);
      missionState.missionError.set(this.t("missions", "aircraftAlreadyInMission"));
      return;
    }

    // ── Anti-cheat: verify player is physically at the right airport ──
    if (!PositionService.isAtCorrectAirport()) {
      console.log("[ACO] Anti-cheat: PositionService says not at correct airport, expected=" + origin);
      missionState.missionError.set(this.t("missions", "mustBeAtAirport") + " " + origin);
      missionState.missionStatus.set("error");
      return;
    }

    const selectedAircraft = this.availableAircraftList.find(a => a.id === aircraftId);

    // ── Anti-cheat: verify aircraft DB location matches origin ──
    const currentAircraft = missionState.missionCurrentAircraft.get();
    if (currentAircraft?.current_airport_ident) {
      const acLocation = currentAircraft.current_airport_ident.toUpperCase();
      if (acLocation !== origin.toUpperCase()) {
        console.log(`[ACO] Anti-cheat: aircraft location=${acLocation}, expected=${origin}`);
        const acType = currentAircraft.aircraft_type || aircraftId;
        missionState.missionError.set(
          this.t("missions", "aircraftNotHere").replace("{type}", acType).replace("{location}", acLocation)
        );
        missionState.missionStatus.set("error");
        return;
      }
    }

    // ── Anti-cheat: verify sim aircraft registration matches selected aircraft ──
    if (selectedAircraft?.registration && typeof SimVar !== "undefined") {
      try {
        const simReg = (SimVar.GetSimVarValue("ATC ID", "string") as string || "").trim().toUpperCase();
        const expectedReg = selectedAircraft.registration.toUpperCase();
        if (simReg && simReg !== expectedReg) {
          console.log(`[ACO] Anti-cheat: SimVar ATC ID=${simReg}, expected=${expectedReg}`);
          const acType = currentAircraft?.aircraft_type || selectedAircraft.aircraft_type;
          missionState.missionError.set(this.t("missions", "wrongAircraftReg").replace("{type}", acType));
          missionState.missionStatus.set("error");
          return;
        }
      } catch {
        console.log("[ACO] Could not read ATC ID SimVar");
      }
    }

    // ── Verify aircraft type matches ──
    if (selectedAircraft && selectedAircraft.aircraft_model) {
      try {
        const rawAtcModel = SimVar.GetSimVarValue("ATC MODEL", "string") as string;
        const extractedType = this.extractIcaoType(rawAtcModel);
        const expectedIcao = selectedAircraft.aircraft_model.toUpperCase();

        console.log("[ACO] ATC_MODEL check: raw=", rawAtcModel, "extracted=", extractedType, "expectedIcao=", expectedIcao);

        if (extractedType && expectedIcao && extractedType !== expectedIcao) {
          missionState.missionError.set(`${this.t("missions", "wrongAircraft")} ${extractedType}, ${this.t("missions", "notA")} ${expectedIcao}`);
          missionState.missionStatus.set("error");
          return;
        }
      } catch (e) {
        console.log("[ACO] Could not read ATC MODEL SimVar");
      }
    }

    console.log("[ACO] Creating V1.1 mission:", origin, "->", destination, `(${distance} nm, ${waypointCount} WPs)`);
    missionState.missionStatus.set("creating");
    missionState.missionError.set(null);

    try {
      const now = new Date();
      const departureLocalTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

      let departureWeather: { visibility_nm: number; wind_kts: number; precipitation: boolean } | null = null;
      try {
        const visibility = SimVar.GetSimVarValue("AMBIENT VISIBILITY", "nautical miles") as number;
        const windSpeed = SimVar.GetSimVarValue("AMBIENT WIND VELOCITY", "knots") as number;
        const precipRate = SimVar.GetSimVarValue("AMBIENT PRECIP RATE", "millimeters of water") as number;
        departureWeather = {
          visibility_nm: visibility || 10,
          wind_kts: windSpeed || 0,
          precipitation: (precipRate || 0) > 0,
        };
        console.log("[ACO] Departure weather:", departureWeather);
      } catch (e) {
        console.log("[ACO] Could not read weather SimVars");
      }

      const cargoWeightKg = cargoState.aircraftCargoWeight.get();
      const modifiersSelected = missionState.selectedModifiers.get();

      console.log("[ACO] V1.1 Mission params:", {
        origin,
        destination,
        distance_nm: distance,
        waypoint_count: waypointCount,
        modifiers: modifiersSelected,
        cargo_weight_kg: cargoWeightKg,
        departure_local_time: departureLocalTime,
      });

      const mission = await MissionRouter.createMission({
        aircraft_id: aircraftId,
        origin_icao: origin,
        destination_icao: destination,
        cargo_weight_kg: cargoWeightKg,
        distance_nm: distance,
        modifiers: modifiersSelected,
      });
      console.log("[ACO] V1.1 Mission created:", mission);

      if (!mission || !mission.id) {
        throw new Error("Invalid mission response from server");
      }

      const flightModeValue = missionCreationState.fpFlightMode.get();
      missionState.activeMission.set({
        id: mission.id,
        origin_icao: mission.origin_icao,
        destination_icao: mission.destination_icao,
        aircraft_type: selectedAircraft?.aircraft_type || "",
        status: mission.status,
        flight_mode: flightModeValue,
      });

      missionState.waypointsTotal.set(mission.waypoints_total || waypointCount);
      missionState.waypointsPassed.set(0);
      missionState.missionDistanceNm.set(mission.distance_nm || distance);
      console.log("[ACO] V2.0: Mission created with", missionState.waypointsTotal.get(), "waypoints,", missionState.missionDistanceNm.get(), "nm");

      missionState.xpEstimate.set(mission.xp_estimate || null);

      missionState.missionStatus.set("success");
      popupState.popupNotification.set(`${this.t("missions", "missionCreatedSuccess")} ${origin} -> ${destination}`);

      trackingManager.resetTrackingVariables();

      this.writePayloadToSimVars();
      this.startFlightTrackingV1();
      trackingManager.setFlightMode(flightModeValue);

      this.resetCreationSteps();

      navigationState.activeTab.set("missions");
      navigationState.missionsSubTab.set("en-cours");

    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : this.t("missions", "errorCreatingMission");
      console.error("[ACO] Error creating V1.1 mission:", error);
      missionState.missionError.set(errMsg);
      missionState.missionStatus.set("error");
    }
  }

  // ═══════════════════════════════════════════════════════════
  // BLOC 5: ACTIVE MISSION + CARGO
  // ═══════════════════════════════════════════════════════════

  public async fetchActiveMission(): Promise<void> {
    if (!isGameReady()) return;

    try {
      const mission = await MissionRouter.getActiveMission();
      console.log("[ACO] Active mission:", mission);

      if (!mission) {
        missionState.activeMission.set(null);
        return;
      }

      missionState.activeMission.set({
        id: mission.id,
        origin_icao: mission.origin_icao,
        destination_icao: mission.destination_icao,
        aircraft_type: mission.aircraft_type || "Unknown",
        status: mission.status,
      });

      const checkpoints = mission.checkpoints || [];
      missionState.missionCheckpoints.set(checkpoints);
      missionState.checkpointsTotal.set(mission.checkpoints_total || checkpoints.length || 0);

      const validatedCount = checkpoints.filter(cp => cp.validated).length;
      missionState.checkpointsValidated.set(validatedCount);

      const nextCp = checkpoints.find(cp => !cp.validated);
      missionState.nextCheckpoint.set(nextCp ? nextCp.sequence : validatedCount + 1);

      console.log("[ACO] Active mission checkpoints loaded:", checkpoints.length, "validated:", validatedCount);

      if (mission.cargo_weight_kg !== undefined) {
        cargoState.aircraftCargoWeight.set(mission.cargo_weight_kg);
        console.log("[ACO] Restored cargo weight from mission:", mission.cargo_weight_kg, "kg");
      }

      if (mission.waypoints_total !== undefined) {
        missionState.waypointsTotal.set(mission.waypoints_total);
      }
      if (mission.distance_nm !== undefined) {
        missionState.missionDistanceNm.set(mission.distance_nm);
      }

      if (mission.status === "in_progress" || mission.status === "created") {
        this.startFlightTrackingV1();
      }
    } catch (error) {
      console.error("[ACO] Error fetching active mission:", error);
    }
  }

  public async cancelMission(): Promise<void> {
    const mission = missionState.activeMission.get();
    if (!mission || !isGameReady()) return;

    console.log("[ACO] Cancelling mission:", mission.id);
    missionState.missionStatus.set("loading");

    const currentAirport = positionState.simVarAirport.get();
    const currentLat = SimVar.GetSimVarValue("PLANE LATITUDE", "degrees");
    const currentLon = SimVar.GetSimVarValue("PLANE LONGITUDE", "degrees");
    const currentAlt = SimVar.GetSimVarValue("PLANE ALTITUDE", "feet");

    const cancelPayload: Record<string, unknown> = { reason: "cancelled" };

    if (currentLat && currentLon) {
      cancelPayload.final_latitude = currentLat;
      cancelPayload.final_longitude = currentLon;
      cancelPayload.final_altitude_ft = currentAlt;
    }

    if (currentAirport && currentAirport !== "----" && currentAirport.length >= 3) {
      cancelPayload.final_icao = currentAirport.toUpperCase();
      console.log("[ACO] V1.6: Cancelling mission with position update to:", currentAirport);
    }

    try {
      await MissionRouter.failMission(mission.id);
      console.log("[ACO] Mission cancelled");
      missionState.activeMission.set(null);
      trackingManager.resetTrackingVariables();
      missionState.missionStatus.set("idle");
      missionState.missionError.set(null);
      void this.loadCurrentAircraftForMission();
    } catch (error) {
      console.error("[ACO] Error cancelling mission:", error);
      missionState.missionError.set(this.t("missions", "errorCancellingMission"));
      missionState.missionStatus.set("error");
    }
  }

  private async fetchDestinationCoordinates(icao: string): Promise<void> {
    try {
      console.log("[ACO] V2.2: Fetching destination coordinates for:", icao);
      const airport = await WorldRouter.getAirportByIcao(icao);
      if (airport) {
        this.destLat = airport.latitude_deg || 0;
        this.destLon = airport.longitude_deg || 0;
        console.log("[ACO] V2.2: Destination coordinates:", this.destLat, this.destLon, "for", icao);
      } else {
        console.warn("[ACO] V2.2: No airport found for ICAO:", icao);
      }
    } catch (error) {
      console.error("[ACO] Error fetching destination coordinates:", error);
    }
  }

  public async fetchAirportInventoryForCargo(icao: string): Promise<void> {
    if (!isGameReady()) return;

    console.log("[ACO] Fetching airport inventory for cargo:", icao);
    cargoState.cargoLoading.set(true);

    try {
      const data = await MarketRouter.getAirportInventoryRaw(icao);
      console.log("[ACO] Airport inventory:", data);

      const contractRouteMap = new Map<string, string>();
      try {
        const activeContracts = await ContractRouter.getActiveContracts();
        for (const c of activeContracts) {
          contractRouteMap.set(c.id, `${c.origin_icao} -> ${c.destination_icao}`);
        }
      } catch { /* no contracts */ }

      this.airportInventory = [];
      if (data.containers) {
        for (const container of data.containers) {
          if (container.type === "aircraft") continue;

          for (const item of container.items || []) {
            const existing = this.airportInventory.find(
              i => i.item_id === item.item_id && i.location_id === container.id && i.source === (item.source || undefined)
            );
            if (existing) {
              existing.quantity += item.qty;
            } else {
              const itemDef = ItemService.getItemById(item.item_id);
              this.airportInventory.push({
                item_id: item.item_id,
                item_name: item.item_name,
                quantity: item.qty,
                weight_kg: parseFloat(String(item.weight_kg)) || 0,
                location_id: container.id,
                location_name: container.name || container.type,
                owner_type: (item as any).owner_type || undefined,
                source: item.source,
                contract_id: item.contract_id,
                contract_route: item.contract_id ? contractRouteMap.get(item.contract_id) : undefined,
                item_icon: itemDef?.icon,
                item_icon_path: itemDef?.icon_path,
                item_tier: itemDef?.tier,
              });
            }
          }
        }
      }

      this.renderCargoUI();
    } catch (error) {
      console.error("[ACO] Error fetching airport inventory:", error);
    } finally {
      cargoState.cargoLoading.set(false);
    }
  }

  public async fetchAircraftCargo(aircraftId: string): Promise<void> {
    if (!isGameReady()) return;

    console.log("[ACO] Fetching aircraft cargo:", aircraftId);

    try {
      const data = await FleetRouter.getAircraftCargoRaw(aircraftId);
      console.log("[ACO] Aircraft cargo:", data);

      this.aircraftCargo = (data.items || []).map(item => {
        const itemDef = ItemService.getItemById(item.item_id);
        return {
          item_id: item.item_id,
          item_name: item.item_name,
          qty: item.qty,
          weight_kg: parseFloat(String(item.weight_kg)) || 0,
          total_weight_kg: parseFloat(String(item.total_weight_kg)) || 0,
          source: item.source,
          contract_id: item.contract_id,
          item_icon: itemDef?.icon,
          item_icon_path: itemDef?.icon_path,
          item_tier: itemDef?.tier,
        };
      });

      cargoState.aircraftCargoWeight.set(data.current_cargo_kg || 0);
      cargoState.aircraftCargoCapacity.set(data.cargo_capacity_kg || 0);

      this.renderCargoUI();
    } catch (error) {
      console.error("[ACO] Error fetching aircraft cargo:", error);
    }
  }

  public async loadCargoItem(fromLocationId: string, itemId: string, qty: number): Promise<void> {
    const aircraftId = missionState.selectedAircraftId.get();
    if (!isGameReady() || !aircraftId) return;

    const onGround = SimVar.GetSimVarValue("SIM ON GROUND", "boolean") as boolean;
    const groundSpeed = SimVar.GetSimVarValue("GROUND VELOCITY", "knots") as number || 0;

    if (!onGround || groundSpeed > 1) {
      missionState.missionError.set(this.t("missions", "loadingNotPossible"));
      return;
    }

    console.log("[ACO] Loading cargo:", { fromLocationId, itemId, qty });
    cargoState.cargoLoading.set(true);

    try {
      await FleetRouter.loadCargo(aircraftId, fromLocationId, itemId, qty);
      console.log("[ACO] Cargo loaded");
      const origin = missionState.missionOriginIcao.get();
      if (origin) {
        await this.fetchAirportInventoryForCargo(origin);
      }
      await this.fetchAircraftCargo(aircraftId);
      this.callbacks.onRefreshProfileInventory();
    } catch (error) {
      console.error("[ACO] Error loading cargo:", error);
      missionState.missionError.set(error instanceof Error ? error.message : this.t("missions", "errorLoadingCargo"));
      setTimeout(() => { missionState.missionError.set(null); }, 5000);
    } finally {
      cargoState.cargoLoading.set(false);
    }
  }

  public async unloadCargoItem(toLocationId: string, itemId: string, qty: number): Promise<void> {
    const aircraftId = missionState.selectedAircraftId.get();
    if (!isGameReady() || !aircraftId) return;

    const onGround = SimVar.GetSimVarValue("SIM ON GROUND", "boolean") as boolean;
    const groundSpeed = SimVar.GetSimVarValue("GROUND VELOCITY", "knots") as number || 0;

    if (!onGround || groundSpeed > 1) {
      missionState.missionError.set(this.t("missions", "unloadingNotPossible"));
      return;
    }

    console.log("[ACO] Unloading cargo:", { toLocationId, itemId, qty });
    cargoState.cargoLoading.set(true);

    try {
      await FleetRouter.unloadCargo(aircraftId, toLocationId, itemId, qty);
      console.log("[ACO] Cargo unloaded");
      const origin = missionState.missionOriginIcao.get();
      if (origin) {
        await this.fetchAirportInventoryForCargo(origin);
      }
      await this.fetchAircraftCargo(aircraftId);
      this.callbacks.onRefreshProfileInventory();
    } catch (error) {
      console.error("[ACO] Error unloading cargo:", error);
    } finally {
      cargoState.cargoLoading.set(false);
    }
  }

  public renderCargoUI(): void {
    const PERSONNEL_ITEMS = ["worker", "engineer", "pilot", "copilot", "passenger"];
    const sourceFilter = cargoState.cargoSourceFilter.get();

    const filteredAirportInventory = (this.airportInventory as AirportInventoryItem[])
      .filter(item => {
        if (PERSONNEL_ITEMS.includes(item.item_id.toLowerCase()) || item.category === "personnel") {
          return false;
        }
        const itemOwner = item.owner_type || "player";
        return itemOwner === sourceFilter;
      });

    const airportEl = this.airportInventoryRef.getOrDefault();
    if (airportEl) {
      airportEl.innerHTML = renderAirportInventoryHtml(
        filteredAirportInventory,
        this.t("missions", "noItemAvailable")
      );

      airportEl.querySelectorAll(".load-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const itemId = btn.getAttribute("data-id");
          const locId = btn.getAttribute("data-loc");
          const itemName = btn.getAttribute("data-name");
          const maxQty = parseInt(btn.getAttribute("data-qty") || "1", 10);
          const weight = parseFloat(btn.getAttribute("data-weight") || "0");
          if (itemId && locId && itemName) {
            this.openCargoPopup("load", itemId, itemName, maxQty, weight, locId);
          }
        });
      });
    }

    const filteredAircraftCargo = (this.aircraftCargo as AircraftCargoItem[])
      .filter(item => !PERSONNEL_ITEMS.includes(item.item_id.toLowerCase()));

    const cargoEl = this.aircraftCargoRef.getOrDefault();
    if (cargoEl) {
      cargoEl.innerHTML = renderAircraftCargoHtml(
        filteredAircraftCargo,
        "Soute vide"
      );

      cargoEl.querySelectorAll(".unload-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const itemId = btn.getAttribute("data-id");
          const itemName = btn.getAttribute("data-name");
          const maxQty = parseInt(btn.getAttribute("data-qty") || "1", 10);
          const weight = parseFloat(btn.getAttribute("data-weight") || "0");
          const firstLoc = this.airportInventory[0]?.location_id || "";
          if (itemId && itemName) {
            this.openCargoPopup("unload", itemId, itemName, maxQty, weight, firstLoc);
          }
        });
      });
    }

    this.renderPassengersUI();
  }

  public setCargoSourceFilter(filter: "player" | "company"): void {
    cargoState.cargoSourceFilter.set(filter);
    this.renderCargoUI();
  }

  private renderPassengersUI(): void {
    const PERSONNEL_ITEMS = ["worker", "engineer", "pilot", "copilot", "passenger"];
    const sourceFilter = cargoState.cargoSourceFilter.get();

    const airportPersonnel: PassengerItem[] = this.airportInventory
      .filter(item => {
        if (!PERSONNEL_ITEMS.includes(item.item_id.toLowerCase()) && item.category !== "personnel") return false;
        const itemOwner = (item as any).owner_type || "player";
        return itemOwner === sourceFilter;
      })
      .map(item => ({
        item_id: item.item_id,
        location_id: item.location_id,
        item_name: item.item_name,
        quantity: item.quantity,
        weight_kg: item.weight_kg,
        source: item.source,
        contract_route: item.contract_route,
      }));

    const aircraftPersonnel = this.aircraftCargo
      .filter(item => PERSONNEL_ITEMS.includes(item.item_id.toLowerCase()))
      .map(item => ({
        item_id: item.item_id,
        item_name: item.item_name,
        qty: item.qty,
        weight_kg: item.weight_kg,
        source: item.source,
      }));

    const passengerCount = aircraftPersonnel.reduce((sum, p) => sum + p.qty, 0);
    const passengerWeight = aircraftPersonnel.reduce((sum, p) => sum + (p.qty * p.weight_kg), 0);

    cargoState.aircraftPassengerCount.set(passengerCount);
    cargoState.aircraftPassengerWeight.set(passengerWeight);

    const airportPaxEl = this.airportPassengersRef.getOrDefault();
    if (airportPaxEl) {
      airportPaxEl.innerHTML = renderAirportPassengersHtml(
        airportPersonnel,
        "-"
      );

      airportPaxEl.querySelectorAll(".load-pax-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const itemId = btn.getAttribute("data-id");
          const locId = btn.getAttribute("data-loc");
          const itemName = btn.getAttribute("data-name");
          const maxQty = parseInt(btn.getAttribute("data-qty") || "1", 10);
          const weight = parseFloat(btn.getAttribute("data-weight") || "0");
          if (itemId && locId && itemName) {
            this.openCargoPopup("load", itemId, itemName, maxQty, weight, locId);
          }
        });
      });
    }

    const aircraftPaxEl = this.aircraftPassengersRef.getOrDefault();
    if (aircraftPaxEl) {
      aircraftPaxEl.innerHTML = renderAircraftPassengersHtml(
        aircraftPersonnel,
        "-"
      );

      aircraftPaxEl.querySelectorAll(".unload-pax-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const itemId = btn.getAttribute("data-id");
          const itemName = btn.getAttribute("data-name");
          const maxQty = parseInt(btn.getAttribute("data-qty") || "1", 10);
          const weight = parseFloat(btn.getAttribute("data-weight") || "0");
          const firstLoc = this.airportInventory[0]?.location_id || "";
          if (itemId && itemName) {
            this.openCargoPopup("unload", itemId, itemName, maxQty, weight, firstLoc);
          }
        });
      });
    }
  }

  public openCargoPopup(
    direction: "load" | "unload",
    itemId: string,
    itemName: string,
    maxQty: number,
    weightKg: number,
    locationId: string
  ): void {
    const onGround = SimVar.GetSimVarValue("SIM ON GROUND", "boolean") as boolean;
    const groundSpeed = SimVar.GetSimVarValue("GROUND VELOCITY", "knots") as number || 0;

    if (!onGround) {
      missionState.missionError.set(this.t("missions", "cannotLoadInFlight"));
      return;
    }
    if (groundSpeed > 1) {
      missionState.missionError.set(this.t("missions", "stopAircraftToLoad"));
      return;
    }

    const PERSONNEL_ITEMS = ["worker", "engineer", "pilot", "copilot", "passenger"];
    const isPersonnel = PERSONNEL_ITEMS.includes(itemId.toLowerCase());

    const currentCargoWeight = cargoState.aircraftCargoWeight.get() + cargoState.aircraftPassengerWeight.get();
    const maxCargoCapacity = cargoState.aircraftCargoCapacity.get();
    const remainingWeight = Math.max(0, maxCargoCapacity - currentCargoWeight);
    const weightPerUnit = weightKg > 0 ? weightKg : 1;

    if (direction === "unload") {
      const acItem = this.aircraftCargo.find(c => c.item_id.toLowerCase() === itemId.toLowerCase());
      maxQty = acItem ? acItem.qty : 0;
    } else {
      if (isPersonnel) {
        const seats = cargoState.aircraftPassengerSeats.get();
        const current = cargoState.aircraftPassengerCount.get();
        const available = Math.max(0, seats - current);
        maxQty = Math.min(maxQty, available);
      }
      if (maxCargoCapacity > 0) {
        const maxByWeight = Math.floor(remainingWeight / weightPerUnit);
        maxQty = Math.min(maxQty, maxByWeight);
      }
    }

    if (maxQty <= 0) {
      if (direction === "unload") {
        console.warn(`[ACO] No ${itemId} in aircraft to unload`);
      } else if (remainingWeight <= 0 && direction === "load") {
        missionState.missionError.set(this.t("missions", "aircraftCargoFull"));
        setTimeout(() => { missionState.missionError.set(null); }, 3000);
      } else if (isPersonnel) {
        missionState.missionError.set(this.t("missions", "noSeatsAvailable"));
        setTimeout(() => { missionState.missionError.set(null); }, 3000);
      }
      return;
    }

    if (maxQty === 1) {
      if (direction === "load") {
        void this.loadCargoItem(locationId, itemId, 1);
      } else {
        void this.unloadCargoItem(locationId, itemId, 1);
      }
      return;
    }

    popupManager.openCargo(direction, {
      item_id: itemId,
      item_name: itemName,
      max_qty: maxQty,
      weight_kg: weightKg,
      location_id: locationId,
      aircraft_cargo_kg: currentCargoWeight,
      aircraft_cargo_max_kg: maxCargoCapacity,
    });
  }

  public closeCargoPopup(): void {
    popupManager.closeCargo();
  }

  public updateCargoPopupSlider(): void {
    popupManager.updateCargoSlider();
  }

  public setCargoPopupQty(qty: number): void {
    cargoState.cargoPopupQty.set(qty);
    popupManager.updateCargoSlider();
  }

  public async confirmCargoTransfer(): Promise<void> {
    await popupManager.confirmCargo();
  }

  public writePayloadToSimVars(): void {
    const cargoWeightKg = cargoState.aircraftCargoWeight.get();
    missionCreationManager.writePayloadToSimVars(cargoWeightKg);
  }

  public getTotalPayload(): number {
    return missionCreationManager.getTotalPayload();
  }

  // ═══════════════════════════════════════════════════════════
  // BLOC 6: MISSION AIRCRAFT INFO (intercalé dans hangar)
  // ═══════════════════════════════════════════════════════════

  public async fetchMissionAircraftSystems(aircraftId: string): Promise<void> {
    if (!isGameReady()) return;

    try {
      const data = await FleetRouter.getAircraftSystems(aircraftId);
      missionState.missionAircraftSystems.set({
        warnings: data.warnings || [],
        critical: data.critical || [],
        can_takeoff: data.can_takeoff ?? true,
      });
    } catch (error) {
      console.error("[ACO] Error fetching mission aircraft systems:", error);
      missionState.missionAircraftSystems.set(null);
    }
  }

  public async loadCurrentAircraftForMission(): Promise<void> {
    if (!isGameReady()) {
      console.log("[ACO] Not logged in, cannot load aircraft");
      return;
    }

    console.log("[ACO] Loading current aircraft for mission...");
    missionState.missionAircraftLoading.set(true);
    missionState.missionAircraftNotFound.set(false);
    this.renderMissionAircraftInfo();

    try {
      const rawAtcModel = SimVar.GetSimVarValue("ATC MODEL", "string") as string;
      const simIcaoType = this.extractIcaoType(rawAtcModel);
      const currentAirport = missionState.missionOriginIcao.get();

      console.log("[ACO] SimVars - Type:", simIcaoType, "Airport:", currentAirport);

      const fleetData = await FleetRouter.getFleet() as Array<{
        id: string;
        registration: string | null;
        icao_type: string | null;
        current_airport_ident: string | null;
      }>;

      let matchingAircraft = null;

      if (simIcaoType && currentAirport) {
        matchingAircraft = fleetData.find(
          ac => ac.icao_type?.toUpperCase() === simIcaoType.toUpperCase() &&
                ac.current_airport_ident?.toUpperCase() === currentAirport.toUpperCase()
        );
        if (matchingAircraft) {
          console.log("[ACO] Matched by type+airport:", matchingAircraft.registration, "(", simIcaoType, "@", currentAirport, ")");
        }
      }

      if (!matchingAircraft && simIcaoType) {
        const sameTypeAircraft = fleetData.filter(
          ac => ac.icao_type?.toUpperCase() === simIcaoType.toUpperCase()
        );

        if (sameTypeAircraft.length >= 1) {
          matchingAircraft = sameTypeAircraft[0];
          console.log("[ACO] Matched by type only:", matchingAircraft.registration, "(", simIcaoType, ")");
        }
      }

      if (!matchingAircraft) {
        console.log("[ACO] No matching aircraft found - Type:", simIcaoType, "Airport:", currentAirport);
        missionState.missionAircraftNotFound.set(true);
        missionState.missionCurrentAircraft.set(null);
        missionState.missionAircraftLoading.set(false);
        this.renderMissionAircraftInfo();
        return;
      }

      const apiData = await FleetRouter.getAircraft(matchingAircraft.id);
      console.log("[ACO] Current aircraft details:", apiData);

      // ── Non-blocking warnings (orange) during preparation ──
      const warnings: string[] = [];
      const playerAirport = currentAirport?.toUpperCase() || "";
      const acDbLocation = apiData.current_airport_ident?.toUpperCase() || "";

      // Warning: player not at correct airport (uses PositionService with GPS + lat/lon fallback)
      if (playerAirport && !PositionService.isAtCorrectAirport()) {
        warnings.push(this.t("missions", "mustBeAtAirport") + " " + playerAirport);
        console.warn("[ACO] Warning: PositionService says not at correct airport, DB=" + playerAirport);
      }

      // Warning: aircraft DB location ≠ player airport
      if (acDbLocation && playerAirport && acDbLocation !== playerAirport) {
        const acType = apiData.aircraft_type || apiData.registration || matchingAircraft.id;
        warnings.push(this.t("missions", "aircraftNotHere").replace("{type}", acType).replace("{location}", acDbLocation));
        console.warn(`[ACO] Warning: aircraft ${acType} at ${acDbLocation}, player at ${playerAirport}`);
      }

      missionState.missionWarnings.set(warnings);

      let systemsData = { warnings: [] as string[], critical: [] as string[], can_takeoff: true };
      try {
        systemsData = await FleetRouter.getAircraftSystems(matchingAircraft.id);
      } catch (e) {
        console.log("[ACO] Could not fetch systems data");
      }

      const passengerSeats = apiData.passenger_capacity ?? 4;
      const aircraftInfo = {
        id: apiData.id,
        registration: apiData.registration || "N/A",
        aircraft_type: apiData.aircraft_type,
        icao_type: apiData.icao_type || null,
        cargo_capacity_kg: apiData.cargo_capacity_kg || 500,
        passenger_capacity: passengerSeats,
        fuel_gallons: apiData.fuel_gallons || 0,
        fuel_capacity_gallons: apiData.fuel_capacity_gallons || 50,
        condition: apiData.condition || 1.0,
        hours: apiData.hours || 0,
        status: apiData.status || "parked",
        current_airport_ident: apiData.current_airport_ident,
        owner_type: apiData.owner_type || "player",
        system_statuses: Object.keys(systemsData.systems).reduce<Record<string, string>>((acc, s) => {
          acc[s] = systemsData.critical.includes(s) ? "CRIT" : systemsData.warnings.includes(s) ? "WARN" : "OK";
          return acc;
        }, {}),
        engine_status: systemsData.critical.includes("engine") ? "CRIT" : systemsData.warnings.includes("engine") ? "WARN" : "OK",
        landing_gear: systemsData.critical.includes("landing_gear") ? "CRIT" : systemsData.warnings.includes("landing_gear") ? "WARN" : "OK",
        propeller_status: systemsData.critical.includes("propeller") ? "CRIT" : systemsData.warnings.includes("propeller") ? "WARN" : "OK",
        electrical_status: systemsData.critical.includes("electrical") ? "CRIT" : systemsData.warnings.includes("electrical") ? "WARN" : "OK",
        avionics_status: systemsData.critical.includes("avionics") ? "CRIT" : systemsData.warnings.includes("avionics") ? "WARN" : "OK",
      };

      missionState.missionCurrentAircraft.set(aircraftInfo);

      cargoState.aircraftPassengerSeats.set(passengerSeats);
      missionState.missionAircraftNotFound.set(false);

      const simFuelCapacity = SimVar.GetSimVarValue("FUEL TOTAL CAPACITY", "gallons") as number || aircraftInfo.fuel_capacity_gallons;
      const simFuelCurrent = SimVar.GetSimVarValue("FUEL TOTAL QUANTITY", "gallons") as number || 0;

      if (simFuelCapacity > 0) {
        if (simFuelCurrent > aircraftInfo.fuel_gallons + 1) {
          console.warn(`[ACO] ANTI-CHEAT: Sim fuel (${simFuelCurrent.toFixed(1)}) > DB fuel (${aircraftInfo.fuel_gallons.toFixed(1)}). Resetting to DB value.`);
        }

        console.log(`[ACO] Applying DB fuel to simulator: ${aircraftInfo.fuel_gallons} gal`);
        setSimulatorFuel(aircraftInfo.fuel_gallons, simFuelCapacity);
      }

      missionState.selectedAircraftId.set(aircraftInfo.id);
      cargoState.aircraftCargoCapacity.set(aircraftInfo.cargo_capacity_kg);

      missionState.missionAircraftSystems.set({
        warnings: systemsData.warnings,
        critical: systemsData.critical,
        can_takeoff: systemsData.can_takeoff,
      });

      void this.fetchAircraftCargo(aircraftInfo.id);
      const origin = missionState.missionOriginIcao.get();
      if (origin) {
        void this.fetchAirportInventoryForCargo(origin);
      }

      this.updateCreationSteps();

    } catch (error) {
      console.error("[ACO] Error loading current aircraft:", error);
      missionState.missionAircraftNotFound.set(true);
      missionState.missionCurrentAircraft.set(null);
    } finally {
      missionState.missionAircraftLoading.set(false);
      this.renderMissionAircraftInfo();
    }
  }

  public renderMissionAircraftInfo(): void {
    const el = this.missionAircraftInfoRef.getOrDefault();
    if (!el) return;

    const loading = missionState.missionAircraftLoading.get();
    const notFound = missionState.missionAircraftNotFound.get();
    const aircraft = missionState.missionCurrentAircraft.get();

    let overallConditionPercent: number | null = null;
    const systemsData = hangarState.hangarSystems.get();
    if (systemsData?.systems) {
      const systemKeys = Object.keys(systemsData.systems);
      const totalCondition = systemKeys.reduce((sum, key) => sum + (systemsData.systems[key]?.condition || 0), 0);
      overallConditionPercent = systemKeys.length > 0 ? Math.round(totalCondition / systemKeys.length) : 100;
    }

    const state: MissionAircraftInfoState = {
      loading,
      notFound,
      aircraft: aircraft as MissionAircraftData | null,
      currentReg: simVarState.currentSimAircraftReg.get(),
      errorMessage: missionState.missionError.get(),
      overallConditionPercent,
    };

    const translations: MissionAircraftTranslations = {
      loadingAircraft: this.t("missions", "loadingAircraft"),
      aircraftNotRecognized: this.t("missions", "aircraftNotRecognized"),
      registrationNotInFleet: this.t("missions", "registrationNotInFleet"),
      aircraftNotDetected: this.t("missions", "aircraftNotDetected"),
      addAircraftToHangar: this.t("missions", "addAircraftToHangar"),
      waitingForAircraft: this.t("missions", "waitingForAircraft"),
      personalBadge: this.t("hangar", "personalBadge"),
      companyBadge: this.t("hangar", "companyBadge"),
      passengers: this.t("hangar", "passengers"),
      fuel: this.t("hangar", "fuel"),
      overallConditionLabel: this.t("hangar", "overallConditionLabel"),
      detail: this.t("hangar", "detail"),
      flightHoursShort: this.t("hangar", "flightHoursShort"),
      wear: this.t("hangar", "wear"),
    };

    el.innerHTML = renderMissionAircraftInfoHtml(state, translations);

    // Add event handlers for buttons - delegate to hangar controller via callbacks
    el.querySelector(".mission-refuel-btn")?.addEventListener("click", () => this.callbacks.onOpenRefuelPopup());
    el.querySelector(".mission-systems-btn")?.addEventListener("click", () => this.callbacks.onOpenSystemsPopup());
  }

  // ═══════════════════════════════════════════════════════════
  // BLOC 7: FLIGHT TRACKING + CHECKPOINTS + COMPLETION
  // ═══════════════════════════════════════════════════════════

  public stopFlightTracking(): void {
    if (!this.flightTrackingActive) return;

    console.log("[ACO] Stopping flight tracking");
    this.flightTrackingActive = false;

    if (this.flightTrackingInterval) {
      window.clearInterval(this.flightTrackingInterval);
      this.flightTrackingInterval = null;
    }
  }

  private resetTrackingVariables(): void {
    console.log("[ACO] Resetting tracking variables");
    trackingState.trackingDistanceFlown.set(0);
    trackingState.trackingProgressPercent.set(0);
    trackingState.trackingCurrentAltitude.set(0);
    trackingState.trackingFuelPercent.set(100);
    trackingState.trackingSimRate.set(1);
    trackingState.trackingCanAccelerate.set(false);
    trackingState.trackingApActive.set(false);
    trackingState.trackingRealTime.set("0:00:00");
    trackingState.trackingSimTime.set("0:00:00");
    trackingState.trackingTimeRatio.set(100);
    trackingState.trackingBonusNight.set(0);
    trackingState.trackingBonusCargo.set(100);
    trackingState.trackingBonusEco.set(100);
    trackingState.trackingCargoExpected.set(0);
    trackingState.trackingCargoActual.set(0);
    trackingState.trackingFuelUsed.set(0);
    trackingState.trackingFuelMax.set(0);
    missionState.waypointsPassed.set(0);
    checkpointState.flightPhaseId.set("none");
    checkpointState.flightPhaseText.set(this.t("missions", "waiting"));
    checkpointState.flightPhaseColor.set("#9ca3af");
    this.maxGForce = 1.0;
    this.autopilotEverUsed = false;
    this.fuelStartPercent = 0;
    this.originLat = 0;
    this.originLon = 0;
    this.destLat = 0;
    this.destLon = 0;
    trackingState.trackingAtcCompliance.set(100);
    trackingState.trackingAtcViolations.set(0);
    trackingState.trackingBonusRealTime.set(100);
    trackingState.trackingBonusLanding.set("--");
  }

  public startFlightTrackingV1(): void {
    this.stopFlightTracking();
    this.resetTrackingVariables();

    console.log("[ACO] Starting V2.0 flight tracking via TrackingManager");
    this.flightTrackingActive = true;
    missionState.waypointsPassed.set(0);

    const mission = missionState.activeMission.get();
    if (mission?.destination_icao) {
      void this.fetchDestinationCoordinates(mission.destination_icao);
    }

    trackingManager.startFlightTracking();
  }

  private async checkCheckpoints(): Promise<void> {
    const mission = missionState.activeMission.get();
    if (!mission || !isGameReady()) return;

    const checkpoints = missionState.missionCheckpoints.get();
    const nextSeq = missionState.nextCheckpoint.get();

    if (Math.random() < 0.2) {
      console.log(`[ACO] Checkpoint check: ${checkpoints.length} checkpoints, next=#${nextSeq}`);
    }

    const lat = simVarState.latitude.get();
    const lon = simVarState.longitude.get();
    const alt = simVarState.altitude.get();
    const groundSpeed = SimVar.GetSimVarValue("GPS GROUND SPEED", "knots") as number || 0;

    const checkpointLineSetters = [
      checkpointState.checkpointLine0, checkpointState.checkpointLine1, checkpointState.checkpointLine2, checkpointState.checkpointLine3,
      checkpointState.checkpointLine4, checkpointState.checkpointLine5, checkpointState.checkpointLine6, checkpointState.checkpointLine7
    ];

    let cumulativeDistNm = 0;
    const sortedCheckpoints = [...checkpoints].sort((a, b) => a.sequence - b.sequence);

    for (let i = 0; i < 8; i++) {
      if (i < sortedCheckpoints.length) {
        const cp = sortedCheckpoints[i];
        const distToCp = trackingManager.haversineDistanceNm(lat, lon, cp.latitude, cp.longitude);
        const icon = cp.validated ? "[OK]" : (cp.sequence === nextSeq ? "[>>]" : "[  ]");

        if (cp.sequence === nextSeq && !cp.validated) {
          const bearingToCp = trackingManager.calculateBearing(lat, lon, cp.latitude, cp.longitude);
          checkpointLineSetters[i].set(`${icon} CP${cp.sequence} | Lat=${cp.latitude.toFixed(3)} Lon=${cp.longitude.toFixed(3)} | ${distToCp.toFixed(0)}nm Cap${Math.round(bearingToCp)}`);
        } else {
          checkpointLineSetters[i].set(`${icon} CP${cp.sequence} | Lat=${cp.latitude.toFixed(3)} Lon=${cp.longitude.toFixed(3)} | ${distToCp.toFixed(0)}nm`);
        }
      } else {
        checkpointLineSetters[i].set("");
      }
    }

    const lastValidated = [...checkpoints]
      .filter(cp => cp.validated)
      .sort((a, b) => b.sequence - a.sequence)[0];

    const nextCpForPhase = checkpoints.find(cp => cp.sequence === nextSeq);
    let phase = "cruise";
    if (nextCpForPhase) {
      if (nextCpForPhase.type === "departure") {
        phase = "departure";
      } else if (nextCpForPhase.type === "arrival" || nextCpForPhase.phase_after === "descent") {
        phase = "arrival";
      } else {
        phase = "cruise";
      }
    }

    if (phase === "departure") {
      checkpointState.flightPhaseIcon.set("[DEP]");
      checkpointState.flightPhaseText.set(this.t("missions", "takeoffPhase"));
      checkpointState.flightPhaseColor.set("#3b82f6");
    } else if (phase === "cruise") {
      checkpointState.flightPhaseIcon.set("[CRS]");
      checkpointState.flightPhaseText.set(this.t("missions", "cruisePhase"));
      checkpointState.flightPhaseColor.set("#10b981");
    } else if (phase === "arrival") {
      checkpointState.flightPhaseIcon.set("[ARR]");
      checkpointState.flightPhaseText.set(this.t("missions", "approachPhase"));
      checkpointState.flightPhaseColor.set("#f59e0b");
    }

    const nextCp = checkpoints.find(cp => cp.sequence === nextSeq && !cp.validated);
    if (!nextCp) {
      checkpointState.nextCheckpointCoords.set("---");
      checkpointState.nextCheckpointBearing.set(0);
      checkpointState.nextCheckpointDistance.set("---");
      checkpointState.nextCheckpointETA.set("---");
      return;
    }

    const distance = trackingManager.haversineDistanceNm(lat, lon, nextCp.latitude, nextCp.longitude);
    const bearing = trackingManager.calculateBearing(lat, lon, nextCp.latitude, nextCp.longitude);

    let etaStr = "---";
    if (groundSpeed > 30) {
      const hoursToGo = distance / groundSpeed;
      const minutesToGo = Math.round(hoursToGo * 60);
      if (minutesToGo < 60) {
        etaStr = `${minutesToGo} min`;
      } else {
        const hrs = Math.floor(minutesToGo / 60);
        const mins = minutesToGo % 60;
        etaStr = `${hrs}h${mins.toString().padStart(2, '0')}`;
      }
    }

    checkpointState.nextCheckpointCoords.set(`Lat=${nextCp.latitude.toFixed(3)} Lon=${nextCp.longitude.toFixed(3)}`);
    checkpointState.nextCheckpointBearing.set(Math.round(bearing));
    checkpointState.nextCheckpointDistance.set(distance.toFixed(1));
    checkpointState.nextCheckpointETA.set(etaStr);

    if (distance <= nextCp.radius_nm) {
      console.log(`[ACO] V1.0: Checkpoint ${nextSeq} within range (${distance.toFixed(2)} nm)`);

      const fuelCapacity = SimVar.GetSimVarValue("FUEL TOTAL CAPACITY", "gallons") as number;
      const fuelQuantity = SimVar.GetSimVarValue("FUEL TOTAL QUANTITY", "gallons") as number;
      const fuelPercent = fuelCapacity > 0 ? (fuelQuantity / fuelCapacity) * 100 : 100;
      const autopilotActive = SimVar.GetSimVarValue("AUTOPILOT MASTER", "boolean") as boolean;
      let simRate = 1;
      try {
        simRate = SimVar.GetSimVarValue("SIMULATION RATE", "number") as number;
      } catch (e) {
        simRate = 1;
      }

      try {
        const result = await MissionRouter.validateCheckpoint(mission.id, {
          latitude: lat,
          longitude: lon,
          altitude_ft: alt,
          groundspeed_kts: SimVar.GetSimVarValue("GROUND VELOCITY", "knots") as number || 0,
        });

        console.log(`[ACO] V1.0: Checkpoint ${nextSeq} validated!`, result);

        const updatedCheckpoints = checkpoints.map(cp =>
          cp.sequence === nextSeq ? { ...cp, validated: true, validated_at: new Date().toISOString() } : cp
        );
        missionState.missionCheckpoints.set(updatedCheckpoints);
        missionState.checkpointsValidated.set(result.checkpoint_index || nextSeq);
        missionState.nextCheckpoint.set(nextSeq + 1);
      } catch (error) {
        console.error("[ACO] V1.0: Error validating checkpoint:", error);
      }
    }
  }

  private directToNextCheckpoint(): void {
    const checkpoints = missionState.missionCheckpoints.get();
    const nextSeq = missionState.nextCheckpoint.get();

    const nextCp = checkpoints.find(cp => cp.sequence === nextSeq && !cp.validated);
    if (!nextCp) {
      console.log("[ACO] Direct-To: No next checkpoint available");
      return;
    }

    const latDeg = Math.floor(Math.abs(nextCp.latitude));
    const latMin = ((Math.abs(nextCp.latitude) - latDeg) * 60).toFixed(2);
    const latDir = nextCp.latitude >= 0 ? 'N' : 'S';

    const lonDeg = Math.floor(Math.abs(nextCp.longitude));
    const lonMin = ((Math.abs(nextCp.longitude) - lonDeg) * 60).toFixed(2);
    const lonDir = nextCp.longitude >= 0 ? 'E' : 'W';

    console.log(`======================================`);
    console.log(`   DIRECT-TO CP${nextCp.sequence}`);
    console.log(`--------------------------------------`);
    console.log(`   LAT: ${latDir} ${latDeg} deg ${latMin}`);
    console.log(`   LON: ${lonDir} ${lonDeg} deg ${lonMin}`);
    console.log(`--------------------------------------`);
    console.log(`   Decimal: ${nextCp.latitude.toFixed(6)}, ${nextCp.longitude.toFixed(6)}`);
    console.log(`======================================`);

    try {
      SimVar.SetSimVarValue("GPS WP NEXT LAT", "degree", nextCp.latitude);
      SimVar.SetSimVarValue("GPS WP NEXT LON", "degree", nextCp.longitude);
      (SimVar.SetSimVarValue as (name: string, unit: string, value: unknown) => void)("GPS WP NEXT ID", "string", `CP${nextCp.sequence}`);
      console.log("[ACO] SimVars sent (works on basic GPS aircraft)");
    } catch (error) {
      console.log("[ACO] SimVar method not supported on this aircraft");
    }
  }

  private showAllCheckpointsCoords(): void {
    const checkpoints = missionState.missionCheckpoints.get();
    const mission = missionState.activeMission.get();

    if (!checkpoints || checkpoints.length === 0) {
      console.log("[ACO] No checkpoints available");
      return;
    }

    console.log(`\n`);
    console.log(`================================================`);
    console.log(`  CHECKPOINTS - ${mission?.origin_icao || '?'} -> ${mission?.destination_icao || '?'}`);
    console.log(`================================================`);

    const sortedCps = [...checkpoints].sort((a, b) => a.sequence - b.sequence);

    for (const cp of sortedCps) {
      const latDeg = Math.floor(Math.abs(cp.latitude));
      const latMin = ((Math.abs(cp.latitude) - latDeg) * 60).toFixed(2);
      const latDir = cp.latitude >= 0 ? 'N' : 'S';

      const lonDeg = Math.floor(Math.abs(cp.longitude));
      const lonMin = ((Math.abs(cp.longitude) - lonDeg) * 60).toFixed(2);
      const lonDir = cp.longitude >= 0 ? 'E' : 'W';

      console.log(`------------------------------------------------`);
      console.log(`  CP${cp.sequence}`);
      console.log(`  LAT: ${latDir} ${latDeg} ${latMin}`);
      console.log(`  LON: ${lonDir} ${lonDeg} ${lonMin}`);
      console.log(`  Decimal: ${cp.latitude.toFixed(6)}, ${cp.longitude.toFixed(6)}`);
    }

    console.log(`================================================`);
    console.log(`  Entrez ces coordonnees manuellement dans`);
    console.log(`  le planificateur de vol MSFS:`);
    console.log(`  Itineraire > En route > AJOUTER UN POINT`);
    console.log(`================================================\n`);
  }

  private openFlightPlanHelper(): void {
    const mission = missionState.activeMission.get();
    const checkpoints = missionState.missionCheckpoints.get();

    if (!checkpoints || checkpoints.length === 0) {
      console.log("[ACO] No checkpoints to display");
      missionState.missionError.set(this.t("missions", "noCheckpoint"));
      return;
    }

    const sortedCps = [...checkpoints].sort((a, b) => a.sequence - b.sequence);

    let clipboardText = `${this.t("missions", "flightPlanTitle")}: ${mission?.origin_icao} -> ${mission?.destination_icao}\n`;
    clipboardText += `Planificateur > Itineraire > En route > AJOUTER UN POINT\n`;
    clipboardText += `================================================\n`;
    clipboardText += `1. ${mission?.origin_icao} (DEPART)\n`;

    console.log(`\n`);
    console.log(`%c╔══════════════════════════════════════════════════════════╗`, "color: #3b82f6; font-weight: bold; font-size: 12px;");
    console.log(`%c║  PLAN DE VOL: ${mission?.origin_icao} --> ${mission?.destination_icao}`, "color: #22c55e; font-size: 14px; font-weight: bold;");
    console.log(`%c║  Planificateur > Itineraire > En route > AJOUTER UN POINT`, "color: #9ca3af;");
    console.log(`%c╠══════════════════════════════════════════════════════════╣`, "color: #3b82f6; font-weight: bold;");
    console.log(`%c║  1. ${mission?.origin_icao} (DEPART)`, "color: #22c55e; font-weight: bold;");

    for (let i = 0; i < sortedCps.length; i++) {
      const cp = sortedCps[i];
      const latDeg = Math.floor(Math.abs(cp.latitude));
      const latMin = ((Math.abs(cp.latitude) - latDeg) * 60).toFixed(2);
      const latDir = cp.latitude >= 0 ? 'N' : 'S';
      const lonDeg = Math.floor(Math.abs(cp.longitude));
      const lonMin = ((Math.abs(cp.longitude) - lonDeg) * 60).toFixed(2);
      const lonDir = cp.longitude >= 0 ? 'E' : 'W';

      const coordDMS = `${latDir}${latDeg} ${latMin}' ${lonDir}${lonDeg} ${lonMin}'`;
      const coordDec = `${cp.latitude.toFixed(4)}, ${cp.longitude.toFixed(4)}`;

      console.log(`%c║  ${i + 2}. CP${cp.sequence}: %c${coordDMS}  %c[${coordDec}]`,
        "color: #f59e0b; font-weight: bold;",
        "color: white; font-family: monospace;",
        "color: #6b7280; font-family: monospace;");

      clipboardText += `${i + 2}. CP${cp.sequence}: ${coordDMS} [${coordDec}]\n`;
    }

    console.log(`%c║  ${sortedCps.length + 2}. ${mission?.destination_icao} (ARRIVEE)`, "color: #22c55e; font-weight: bold;");
    clipboardText += `${sortedCps.length + 2}. ${mission?.destination_icao} (ARRIVEE)\n`;

    console.log(`%c╠══════════════════════════════════════════════════════════╣`, "color: #3b82f6; font-weight: bold;");
    console.log(`%c║  Garde F12 ouvert pour voir ce plan!`, "color: #60a5fa; font-weight: bold;");
    console.log(`%c╚══════════════════════════════════════════════════════════╝\n`, "color: #3b82f6; font-weight: bold;");

    try {
      if (navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(clipboardText);
        missionState.missionError.set(this.t("missions", "checkpointsCopied"));
        console.log(`%c[COPIE PRESSE-PAPIER OK]`, "color: #22c55e; font-weight: bold; background: #1a1a24; padding: 4px 8px;");
      }
    } catch (error) {
      missionState.missionError.set(this.t("missions", "openConsoleForCoords"));
      console.log("[ACO] Clipboard error:", error);
    }

    setTimeout(() => {
      const currentError = missionState.missionError.get();
      if (currentError?.includes("Checkpoints") || currentError?.includes("F12")) {
        missionState.missionError.set(null);
      }
    }, 5000);
  }

  private formatCoordForPopup(decimal: number, isLat: boolean): string {
    const dir = isLat ? (decimal >= 0 ? 'N' : 'S') : (decimal >= 0 ? 'E' : 'W');
    const abs = Math.abs(decimal);
    const deg = Math.floor(abs);
    const min = ((abs - deg) * 60).toFixed(2);
    return `${dir}${deg} ${min}'`;
  }

  private copyCheckpointCoords(lat: number, lon: number, cpName: string): void {
    const coordStr = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;

    try {
      if (navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(coordStr);
        popupState.popupNotification.set(`Copie: ${cpName}`);
        console.log(`[ACO] Copied to clipboard: ${coordStr}`);
      } else {
        popupState.popupNotification.set(`${cpName}: ${coordStr}`);
        console.log(`[ACO] Clipboard not available, coords: ${coordStr}`);
      }
    } catch (error) {
      popupState.popupNotification.set(`${cpName}: ${coordStr}`);
      console.log(`[ACO] Copy failed, coords: ${coordStr}`);
    }

    setTimeout(() => {
      if (popupState.popupNotification.get().includes(cpName)) {
        popupState.popupNotification.set("");
      }
    }, 3000);
  }

  private setSimRate(rate: number): void {
    const canAccelerate = trackingState.trackingCanAccelerate.get();
    if (rate > 1 && !canAccelerate) {
      popupState.popupNotification.set(this.t("missions", "accelerationNotAvailable"));
      return;
    }

    try {
      SimVar.SetSimVarValue("SIMULATION RATE", "number", rate);
      trackingState.trackingSimRate.set(rate);
      console.log("[ACO] Sim rate set to:", rate);
    } catch (e) {
      console.error("[ACO] Failed to set sim rate:", e);
    }
  }

  public async completeMissionV1(): Promise<void> {
    this.stopFlightTracking();

    const mission = missionState.activeMission.get();
    if (!mission || !isGameReady()) return;

    console.log("[ACO] V1.0: Completing mission with modifiers:", mission.id);

    try {
      // V4: Use FlightSummary from TrackingManager (centralized data)
      const summary = trackingManager.getFlightSummary();

      // Use SimVar airport from PositionService, fallback to mission destination
      const simApt = positionState.simVarAirport.get();
      const finalIcao = (simApt && simApt !== "----")
        ? simApt
        : mission.destination_icao;

      const cheated = this.payloadVerificationDone &&
        this.payloadStartLbs > 0 &&
        Math.abs(this.payloadVerifiedLbs - this.payloadStartLbs) / this.payloadStartLbs > 0.05;

      const result: MissionRecapData = await MissionRouter.completeMissionV1(mission.id, {
        landing_fpm: summary.touchdownVS || this.landingFpm,
        max_gforce: summary.maxGForce,
        final_icao: finalIcao,
        flight_time_seconds: summary.flightDurationSec,
        fuel_used_kg: Math.max(0, summary.fuelPercentStart - summary.fuelPercentEnd),
        fuel_remaining_percent: summary.fuelPercentEnd,
        distance_flown_nm: trackingState.trackingDistanceFlown.get(),
        real_time_ratio: summary.simRateAverage > 0 ? 1 / summary.simRateAverage : 1,
        cargo_actual_kg: trackingState.trackingCargoActual.get(),
        cargo_expected_kg: trackingState.trackingCargoExpected.get(),
        cargo_fill_percent: trackingState.trackingCargoFillPercent.get(),
        night_active: summary.isNightFlight,
        lights_compliance: summary.lightsCompliance,
        flightpath_compliance: summary.flightPathCompliance,
        weather_difficulty: summary.weatherDifficulty,
        slew_used: summary.slewUsed,
        crash_occurred: summary.crashOccurred,
        unlimited_fuel: summary.unlimitedFuelUsed,
        modifiers_validated: [],
        modifiers_failed: [],
      });

      // Add controller-specific fields not available in the service
      result.cheated = cheated || summary.slewUsed || summary.crashOccurred;
      result.cheat_penalty_percent = (cheated || summary.slewUsed) ? 50 : 0;
      result.landing_quality = trackingManager.getLandingQuality(summary.touchdownVS || this.landingFpm);
      result.atc_compliance = trackingState.trackingAtcCompliance.get();
      result.atc_violations = trackingState.trackingAtcViolations.get();
      result.flightpath_compliance = summary.flightPathCompliance;
      result.weather_difficulty = summary.weatherDifficulty;
      result.aircraft_type = mission.aircraft_type;

      // If cheated, reduce XP
      if (cheated && result.xp_earned > 0) {
        result.xp_earned = Math.round(result.xp_earned / 2);
      }

      missionState.activeMission.set(null);
      trackingManager.resetTrackingVariables();

      missionState.missionCheckpoints.set([]);
      missionState.checkpointsValidated.set(0);
      missionState.checkpointsTotal.set(0);
      missionState.nextCheckpoint.set(1);
      missionState.selectedModifiers.set([]);
      missionState.xpEstimate.set(null);

      missionState.missionRecapData.set(result);
      popupState.showMissionRecap.set(true);
      missionState.missionStatus.set("idle");
      missionState.missionError.set(null);

      try {
        const fuelQuantity = SimVar.GetSimVarValue("FUEL TOTAL QUANTITY", "gallons") as number;
        const fuelCapacity = SimVar.GetSimVarValue("FUEL TOTAL CAPACITY", "gallons") as number;
        if (fuelCapacity > 0) {
          if (mission.aircraft_id) await FleetRouter.syncFuel(mission.aircraft_id, fuelQuantity, fuelCapacity);
          console.log(`[ACO] Fuel synced after mission: ${fuelQuantity.toFixed(1)}/${fuelCapacity.toFixed(1)} gal`);
        }
      } catch (e) {
        console.warn("[ACO] Could not sync fuel after mission:", e);
      }

      // Update position via PositionService (single source of truth)
      try {
        const aircraftId = mission.aircraft_id || missionState.selectedAircraftId.get();
        if (aircraftId && finalIcao) {
          await PositionService.onSuccessfulLanding(aircraftId, finalIcao);
          console.log(`[ACO] Position updated via PositionService: ${finalIcao}`);
        }
      } catch (e) {
        console.warn("[ACO] Could not update position after mission:", e);
      }

      try {
        const player = await InitService.getPlayerInfo();
        if (player) {
          const careerStats = await DatabaseManager.getOrCreatePilotCareerStats(player.id);
          authState.currentUser.set({
            id: player.id,
            username: player.name,
            email: player.email || "",
            xp: player.xp,
            money: player.money,
            nationality: player.nationality,
            preferred_airport: player.preferred_airport,
            current_airport: player.current_airport,
            career_stats: {
              total_missions: careerStats.total_missions,
              total_flight_time_minutes: careerStats.total_flight_time_minutes,
              total_distance_nm: careerStats.total_distance_nm,
              average_grade: careerStats.average_grade,
            },
          });
          marketState.walletPersonal.set(player.money);
          console.log(`[ACO] Player stats refreshed after mission: XP=${player.xp}, Money=${player.money}, Missions=${careerStats.total_missions}, Current=${player.current_airport}`);
        }
      } catch (e) {
        console.warn("[ACO] Could not refresh player stats after mission:", e);
      }

    } catch (error) {
      console.error("[ACO] V1.0 Error completing mission:", error);
      missionState.missionError.set(this.t("missions", "errorCompletingMission"));
    }
  }
}
