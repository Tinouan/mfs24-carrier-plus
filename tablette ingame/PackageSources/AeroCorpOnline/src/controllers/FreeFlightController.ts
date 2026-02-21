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
import { evaluateLightsStatus } from "../helpers/LightsHelper";
import type { CriticalSnapshot } from "../services/SimVarReader";

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

  tick(snap: CriticalSnapshot): void {
    FlightTracker.tick({
      onGround: snap.onGround,
      airspeed: snap.airspeed,
      groundSpeed: snap.groundSpeed,
      gForce: snap.gForce,
      verticalSpeed: snap.verticalSpeed,
      fuelGallons: snap.fuelQuantity,
      fuelCapacity: snap.fuelCapacity,
      lat: snap.lat,
      lon: snap.lon,
      engineRunning: snap.engineRunning,
      altitude: snap.altitude,
    });

    // Lights + simRate evaluation (only when free flight is active)
    if (freeFlightState.status.get() !== "in_flight") return;

    const lightsOn = {
      nav: SimVar.GetSimVarValue("LIGHT NAV ON", "bool") !== 0,
      strobe: SimVar.GetSimVarValue("LIGHT STROBE ON", "bool") !== 0,
      beacon: SimVar.GetSimVarValue("LIGHT BEACON ON", "bool") !== 0,
      landing: SimVar.GetSimVarValue("LIGHT LANDING ON", "bool") !== 0,
      taxi: SimVar.GetSimVarValue("LIGHT TAXI ON", "bool") !== 0,
    };
    const timeOfDay = SimVar.GetSimVarValue("E:TIME OF DAY", "number") as number;
    const simRate = SimVar.GetSimVarValue("SIMULATION RATE", "number") as number;

    const lights = evaluateLightsStatus(
      snap.onGround, timeOfDay >= 2, snap.altitude, snap.verticalSpeed < -300, lightsOn
    );

    freeFlightState.ffTrackingLightNav.set(lights.nav);
    freeFlightState.ffTrackingLightStrobe.set(lights.strobe);
    freeFlightState.ffTrackingLightBeacon.set(lights.beacon);
    freeFlightState.ffTrackingLightLanding.set(lights.landing);
    freeFlightState.ffTrackingLightTaxi.set(lights.taxi);
    freeFlightState.ffTrackingLightsMissing.set(lights.missing);
    freeFlightState.ffTrackingLightsUnnecessary.set(lights.unnecessary);
    freeFlightState.ffTrackingLightsStatusColor.set(lights.statusColor);
    freeFlightState.ffTrackingSimRate.set(simRate || 1.0);
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
