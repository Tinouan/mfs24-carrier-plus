/**
 * FreeFlightController - All free flight logic extracted from AeroCorpOnline.tsx
 *
 * Interface with TSX:
 * - initialize() — called once in onOpen()
 * - tick() — called every readSimVars() cycle
 * - destroy() — cleanup subscriptions
 */
import { NodeReference } from "@microsoft/msfs-sdk";
import { FlightTracker } from "../services/FlightTracker";
import { freeFlightState, type FreeFlightRecapData } from "../state/FreeFlightState";
import { simVarState, missionState, settingsState } from "../state";
import { isGameReady } from "../state/GameModeState";
import { renderAndBindRecap } from "../helpers/freeFlightRecapHelper";

// Translations object type — matches the shape in AeroCorpOnline.tsx
type TranslationsMap = Record<string, { freeFlight: Record<string, string> }>;

interface FreeFlightControllerDeps {
  recapPopupRef: NodeReference<HTMLDivElement>;
  translations: TranslationsMap;
}

export class FreeFlightController {
  private recapPopupRef: NodeReference<HTMLDivElement>;
  private translations: TranslationsMap;
  private subscriptions: { destroy(): void }[] = [];

  constructor(deps: FreeFlightControllerDeps) {
    this.recapPopupRef = deps.recapPopupRef;
    this.translations = deps.translations;
  }

  // ═══════════════════════════════════════
  // INITIALIZE — Called once in onOpen()
  // ═══════════════════════════════════════

  initialize(): void {
    // 1. Initialize FlightTracker callbacks
    FlightTracker.initialize({
      onSessionComplete: (recapData: FreeFlightRecapData) => {
        console.log(`[FlightTracker] Session complete - XP: ${recapData.xp_earned}, Grade: ${recapData.grade}`);
        freeFlightState.ffRecapData.set(recapData);
        freeFlightState.ffShowRecap.set(true);
      },
      onLandingDetected: (airport: string, fpm: number) => {
        simVarState.lastLandingRate.set(fpm);
        console.log(`[FlightTracker] Landing at ${airport}, FPM: ${fpm.toFixed(0)}`);
      },
      onError: (err: string) => console.warn("[FlightTracker]", err),
    });

    // 2. Subscribe to recap popup state
    this.subscriptions.push(freeFlightState.ffShowRecap.sub((show) => {
      if (show) {
        this.renderRecapPopup();
      } else {
        const el = this.recapPopupRef.getOrDefault();
        if (el) el.innerHTML = "";
      }
    }));

    // 3. When aircraft selected + no mission → start tracker
    this.subscriptions.push(missionState.selectedAircraftId.sub((aircraftId) => {
      if (aircraftId && isGameReady() && !missionState.activeMission.get()) {
        const reg = simVarState.currentSimAircraftReg.get();
        FlightTracker.start(aircraftId, reg || "Unknown");
      }
    }));

    // 4. When mission changes → pause/resume
    this.subscriptions.push(missionState.activeMission.sub((mission) => {
      if (mission) {
        FlightTracker.pauseForMission();
      } else {
        FlightTracker.resumeAfterMission();
        const aircraftId = missionState.selectedAircraftId.get();
        const reg = simVarState.currentSimAircraftReg.get();
        if (aircraftId) FlightTracker.start(aircraftId, reg || "Unknown");
      }
    }));

    console.log("[FreeFlightController] Initialized");
  }

  // ═══════════════════════════════════════
  // TICK — Called by readSimVars() every cycle
  // ═══════════════════════════════════════

  tick(): void {
    const fuelCapacity = SimVar.GetSimVarValue("FUEL TOTAL CAPACITY", "gallons") as number || 0;
    const engineRunning = SimVar.GetSimVarValue("ENG COMBUSTION:1", "boolean") as boolean;

    FlightTracker.tick({
      onGround: simVarState.onGround.get(),
      airspeed: simVarState.airspeed.get(),
      groundSpeed: simVarState.groundSpeed.get(),
      gForce: simVarState.gForce.get(),
      verticalSpeed: simVarState.verticalSpeed.get(),
      fuelGallons: simVarState.fuelQuantity.get(),
      fuelCapacity,
      lat: simVarState.latitude.get(),
      lon: simVarState.longitude.get(),
      engineRunning,
      altitude: simVarState.altitude.get(),
    });
  }

  // ═══════════════════════════════════════
  // RECAP POPUP
  // ═══════════════════════════════════════

  private renderRecapPopup(): void {
    const el = this.recapPopupRef.getOrDefault();
    if (!el) return;
    const recapData = freeFlightState.ffRecapData.get();
    if (!recapData) return;

    const lang = settingsState.currentLanguage.get();
    renderAndBindRecap(
      el,
      recapData,
      this.translations[lang].freeFlight as unknown as Record<string, string>,
      () => {
        freeFlightState.ffShowRecap.set(false);
        freeFlightState.ffRecapData.set(null);
      }
    );
  }

  // ═══════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════

  destroy(): void {
    for (const sub of this.subscriptions) {
      sub.destroy();
    }
    this.subscriptions = [];
    FlightTracker.stop();
  }
}
