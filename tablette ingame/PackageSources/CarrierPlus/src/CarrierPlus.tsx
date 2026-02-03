// Polyfills for Coherent GT (must be BEFORE OpenLayers)
import ResizeObserver from "resize-observer-polyfill";
if (typeof window !== "undefined" && !window.ResizeObserver) {
  (window as any).ResizeObserver = ResizeObserver;
}

import {
  App,
  AppBootMode,
  AppInstallProps,
  AppSuspendMode,
  AppView,
  AppViewProps,
  Button,
  Efb,
  RequiredProps,
  TVNode,
} from "@efb/efb-api";
import { FSComponent, VNode, Subject, MappedSubject, NodeReference, EventBus } from "@microsoft/msfs-sdk";

// OpenLayers imports
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import XYZ from "ol/source/XYZ";
import { fromLonLat, toLonLat } from "ol/proj";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Style, Icon, Fill, Stroke, Circle as CircleStyle } from "ol/style";
// Interactions disabled - using manual drag for Coherent GT compatibility
import "ol/ol.css";

import "./CarrierPlus.scss";

// V1.7: Modular architecture - types and constants extracted for maintainability
import type {
  TabType,
  ProfileSubTab,
  MissionsSubTab,
  CompanySubTab,
  AircraftDetails,
  LandingRating,
  UserInfo,
  Language,
  MarketListing,
  CompanyInfo,
  CompanyMember,
  RepairQuote,
  MissionCompleteResponse,
} from "./types";
import {
  REFUEL_PRICE_PER_GALLON,
  FLIGHT_TRACKING_INTERVAL_MS,
  SIMVAR_UPDATE_INTERVAL_MS,
} from "./constants";
// V3.0: Service Routers - P2P local mode only
import { FleetRouter, MissionRouter, MarketRouter, WorldRouter, PlayerRouter, FreeFlightRouter } from "./services";

// V2.0: Managers for business logic
import { trackingManager, mapManager, missionCreationManager, freeFlightManager, PersistenceManager } from "./managers";
import type { FlightPlanData, PayloadState } from "./managers";

// P2P: Local database initialization and AI economy
import { InitService, AIEconomyService } from "./services";
import { DatabaseManager } from "./managers/DatabaseManager";

// Render helpers for DOM updates
import {
  renderAirportsListHtml,
  renderInventoryListHtml,
  renderMarketListingsHtml,
  renderCompanyMembersHtml,
  renderCompanyFleetHtml,
  setSimulatorFuel,
  // V2.3: Hangar render helpers
  renderHangarCargoHtml,
  renderHangarSystemsHtml,
  renderHangarListHtml,
  type HangarCargoItem,
  type HangarSystemsData,
  type HangarAircraftItem,
  type HangarListTranslations,
  type HangarSystemsTranslations,
  // V2.3: Cargo render helpers
  renderAirportInventoryHtml,
  renderAircraftCargoHtml,
  type AirportInventoryItem,
  type AircraftCargoItem,
  // V2.3: Mission render helpers
  renderMissionAircraftInfoHtml,
  type MissionAircraftData,
  type MissionAircraftTranslations,
  type MissionAircraftInfoState,
} from "./helpers";

// Popup HTML generators and UI components
import {
  renderRefuelPopupHtml,
  renderSystemsPopupHtml,
  renderRepairListHtml,
  type RefuelPopupData,
  type SystemsPopupData,
  type RepairItemData,
  // V2.3: Extracted render components
  renderSidebarTab,
  renderLoginPanel,
  renderLogoutConfirmPopup,
  renderWelcomePopup,
} from "./components";

// V1.8: All tab views extracted for maintainability
import { renderSettingsTab } from "./views/SettingsView";
import { renderProfileTab } from "./views/ProfileView";
import { renderInventoryTab } from "./views/InventoryView";
import { renderMarketTab } from "./views/MarketView";
import { renderHangarTab } from "./views/HangarView";
import { renderMapTab } from "./views/MapView";
import { renderCompanyTab } from "./views/CompanyView";
import { renderMissionsTab } from "./views/MissionsView";
import type { CargoPopupItem } from "./views/MissionsView";

// V2.3: State modules for reactive state management
import {
  authState,
  navigationState,
  settingsState,
  simVarState,
  mapState,
  missionState,
  missionCreationState,
  trackingState,
  checkpointState,
  cargoState,
  hangarState,
  companyState,
  marketState,
  popupState,
  inventoryState,
  type FlightPhaseId,
} from "./state";

declare const BASE_URL: string;

// Declare global SimVar API
declare const SimVar: {
  GetSimVarValue(name: string, unit: string): number | boolean | string;
  SetSimVarValue(name: string, unit: string, value: number): void;
};

// Declare global MSFS ViewListener
declare function RegisterViewListener(name: string, callback?: () => void): unknown;

// Declare global Coherent API
declare const Coherent: {
  call(name: string, ...args: unknown[]): Promise<unknown>;
  trigger(name: string, ...args: unknown[]): void;
  on(name: string, callback: (...args: unknown[]) => void): { clear(): void };
};

// V1.5: Internationalization - Translations from JSON files
import frTranslations from "./locales/fr.json";
import enTranslations from "./locales/en.json";
import deTranslations from "./locales/de.json";
import esTranslations from "./locales/es.json";
import ruTranslations from "./locales/ru.json";

// Translations object built from JSON files (Language type imported from ./types)
const translations = {
  en: enTranslations,
  fr: frTranslations,
  de: deTranslations,
  es: esTranslations,
  ru: ruTranslations,
} as const;

type TranslationKeys = typeof frTranslations;

class CarrierPlusView extends AppView<RequiredProps<AppViewProps, "bus">> {
  // DOM refs for login inputs (required by LoginPanel component even in P2P mode)
  private emailInputRef = FSComponent.createRef<HTMLInputElement>();
  private passwordInputRef = FSComponent.createRef<HTMLInputElement>();
  private settingsEmailInputRef = FSComponent.createRef<HTMLInputElement>();
  private settingsPasswordInputRef = FSComponent.createRef<HTMLInputElement>();

  // P2P: Welcome popup input refs
  private welcomePilotNameRef = FSComponent.createRef<HTMLInputElement>();
  private welcomeAirportRef = FSComponent.createRef<HTMLInputElement>();

  // ICAO search
  private icaoSearchInputRef = FSComponent.createRef<HTMLInputElement>();

  // Landing detection
  private wasOnGround = true;

  // P2P: AI Economy elapsed time tracker (in seconds)
  private aiEconomyStartTime = Date.now();

  // Map tab - nearby airports
  private nearbyAirports: Array<{ icao: string; name: string; distance_nm: number }> = [];
  private nearbyAirportsListRef = FSComponent.createRef<HTMLDivElement>();

  // Inventory state
  private inventoryItems: Array<{ id: number; item_type: string; quantity: number; airport_icao: string }> = [];
  private inventoryListRef = FSComponent.createRef<HTMLDivElement>();

  // OpenLayers map (V2.1: Most state now in MapManager)
  private mapContainerRef = FSComponent.createRef<HTMLDivElement>();
  private olMap: Map | null = null;  // Local reference for Coherent GT click handling
  private aircraftFeature: Feature<Point> | null = null;
  private mapInitialized = false;

  // Map layer sources (local refs for feature access)
  private airportsSource: VectorSource<Feature<Point>> | null = null;
  private factoriesSource: VectorSource<Feature<Point>> | null = null;
  private helipadsSource: VectorSource<Feature<Point>> | null = null;
  private lastLoadedZoom: number = 7;  // Track zoom for threshold-based reloading

  // V0.8 Mission state
  private availableAircraftList: Array<{
    id: string;
    registration: string | null;
    aircraft_type: string;
    aircraft_model: string | null;
    cargo_capacity_kg: number;
  }> = [];
  private aircraftListRef = FSComponent.createRef<HTMLDivElement>();

  // V0.8 Cargo management
  private airportInventory: Array<{
    item_id: string;
    item_name: string;
    quantity: number;
    weight_kg: number;
    location_id: string;
    location_name: string;
  }> = [];
  private aircraftCargo: Array<{
    item_id: string;
    item_name: string;
    qty: number;
    weight_kg: number;
    total_weight_kg: number;
  }> = [];
  private airportInventoryRef = FSComponent.createRef<HTMLDivElement>();
  private aircraftCargoRef = FSComponent.createRef<HTMLDivElement>();

  // Cargo transfer popup refs
  private cargoPopupSliderRef = FSComponent.createRef<HTMLInputElement>();
  private cargoPopupQtyRef = FSComponent.createRef<HTMLSpanElement>();

  // Flight plan destination input ref
  private fpDestinationInputRef = FSComponent.createRef<HTMLInputElement>();

  // V0.8 Flight tracking state
  private flightTrackingActive = false;
  private flightTrackingInterval: number | null = null;
  private payloadStartLbs = 0;
  private payloadVerifiedLbs = 0;
  private payloadVerificationDone = false;
  private maxGForce = 1.0;
  private landingFpm = 0;
  private flightStartTime: Date | null = null;
  private parkingBrakeWarningShown = false;  // V1.9: Avoid spam when parking brake at wrong airport
  private engineShutdownWarningShown = false;  // V1.6: Avoid spam when engine shutdown at destination

  // Flight tracking state (non-Subject)
  private fuelStartPercent = 0;

  // FlightPlanner event subscriptions (msfs-sdk)
  private fplEventSubscriptions: Array<{ destroy(): void }> = [];

  // Real-time tracking state (non-Subject)
  private realTimeStartMs: number = 0;
  private simTimeStartSec: number = 0;
  private lastWpNextId: string = "";
  private autopilotEverUsed: boolean = false;
  private originLat: number = 0;
  private originLon: number = 0;
  private destLat: number = 0;
  private destLon: number = 0;

  // V2.3: ATC Tracking state (non-Subject)
  private atcClearedTakeoff = false;
  private atcClearedLanding = false;
  private tookOffWithoutClearance = false;
  private landedWithoutClearance = false;

  // Hangar DOM refs
  private hangarListRef = FSComponent.createRef<HTMLDivElement>();
  private hangarFilterRef = FSComponent.createRef<HTMLInputElement>();
  private hangarSystemsListRef = FSComponent.createRef<HTMLDivElement>();
  private hangarRepairListRef = FSComponent.createRef<HTMLDivElement>();
  private hangarCargoListRef = FSComponent.createRef<HTMLDivElement>();
  private hangarEditRegInputRef = FSComponent.createRef<HTMLInputElement>();

  // Mission creation DOM refs
  private missionAircraftInfoRef = FSComponent.createRef<HTMLDivElement>();

  // Popup DOM refs
  private refuelPricePerGallon = REFUEL_PRICE_PER_GALLON;
  private refuelPopupRef = FSComponent.createRef<HTMLDivElement>();
  private systemsPopupRef = FSComponent.createRef<HTMLDivElement>();

  // Company DOM refs
  private companyMembersRef = FSComponent.createRef<HTMLDivElement>();
  private companyFleetRef = FSComponent.createRef<HTMLDivElement>();

  // Market DOM refs
  private marketListingsRef = FSComponent.createRef<HTMLDivElement>();
  private marketBuyQtySliderRef = FSComponent.createRef<HTMLInputElement>();
  private marketBuyQtyDisplayRef = FSComponent.createRef<HTMLSpanElement>();

  private updateInterval: number | null = null;

  public onOpen(): void {
    this.startSimVarUpdates();
    this.loadAuthFromStorage();

    // P2P: Initialize local database (IndexedDB)
    this.initializeLocalDatabase();

    // V2.0: Initialize tracking manager with callbacks
    this.initializeTrackingManager();

    // V2.1: Initialize map manager with callbacks
    this.initializeMapManager();

    // V2.2: Initialize mission creation manager with callbacks
    this.initializeMissionCreationManager();

    // V2.4: Initialize free flight manager for career mode
    this.initializeFreeFlightManager();

    // V1.6: Start background flight tracking (anti-cheat)
    trackingManager.startBackgroundTracking();

    // Force map re-initialization on app open (handles GT debugger refresh)
    // The DOM might have been recreated but JS state persisted with stale references
    this.disposeMap();

    // If already on map tab, initialize immediately
    if (navigationState.activeTab.get() === "map") {
      setTimeout(() => {
        this.initializeMap();
        this.setupInputEventBlocker(this.icaoSearchInputRef.getOrDefault());
      }, 100);
    }

    // Auto-initialize map when switching to map tab
    navigationState.activeTab.sub((tab) => {
      if (tab === "map") {
        if (!this.mapInitialized) {
          // Small delay to ensure DOM is rendered
          setTimeout(() => this.initializeMap(), 100);
        }
        // Setup keyboard blocking for ICAO search input
        setTimeout(() => {
          this.setupInputEventBlocker(this.icaoSearchInputRef.getOrDefault());
        }, 150);
      }
      // Auto-refresh aircraft when switching to create-mission tab
      if (tab === "create-mission" && (authState.isLoggedIn.get() || authState.isP2PMode.get())) {
        void this.refreshMissionOrigin();
      }
      // Auto-fetch company data when switching to company tab
      if (tab === "company" && (authState.isLoggedIn.get() || authState.isP2PMode.get())) {
        void this.fetchCompanyData();
      }
      // Auto-fetch market data when switching to market tab
      if (tab === "market" && (authState.isLoggedIn.get() || authState.isP2PMode.get())) {
        void this.fetchMarketData();
      }
      // V2.1: Auto-refresh active mission when switching to missions tab
      if (tab === "missions" && (authState.isLoggedIn.get() || authState.isP2PMode.get())) {
        console.log("[CarrierPlus] Switched to missions tab, refreshing active mission...");
        void this.fetchActiveMission();
        // V1.4: Auto-sync current aircraft fuel (anti-cheat)
        void this.autoSyncCurrentAircraft();
      }
      // V2.2: Auto-fetch hangar aircraft list when switching to hangar tab
      if (tab === "hangar" && (authState.isLoggedIn.get() || authState.isP2PMode.get())) {
        console.log("[CarrierPlus] Switched to hangar tab, loading aircraft list...");
        void this.fetchHangarAircraftList();
        // V1.2: Auto-sync current aircraft fuel (anti-cheat)
        void this.autoSyncCurrentAircraft();
      }
      // P2P: Settings tab no longer needs credentials setup
    });

    // V1.1: Auto-refresh when switching to missions sub-tabs
    navigationState.missionsSubTab.sub((subTab) => {
      if (subTab === "creation" && (authState.isLoggedIn.get() || authState.isP2PMode.get())) {
        console.log("[CarrierPlus] Switched to creation sub-tab, auto-refreshing...");
        void this.refreshMissionOrigin();
        // V1.4: Auto-sync current aircraft fuel (anti-cheat)
        void this.autoSyncCurrentAircraft();
        // Setup keyboard capture for destination ICAO input
        setTimeout(() => {
          this.setupDestinationInput(this.fpDestinationInputRef.getOrDefault());
        }, 150);
      }
      // V2.1: Auto-refresh apercu when switching to it
      if (subTab === "apercu" && (authState.isLoggedIn.get() || authState.isP2PMode.get())) {
        console.log("[CarrierPlus] Switched to apercu sub-tab, refreshing active mission...");
        void this.fetchActiveMission();
      }
    });

    // Auto-update fpCanValidate when fpHasActivePlan or fpDestinationInput changes
    missionCreationState.fpHasActivePlan.sub(() => this.updateFpCanValidate());
    missionCreationState.fpDestinationInput.sub(() => this.updateFpCanValidate());

    // V1.2: Update creation steps when current aircraft changes
    missionState.missionCurrentAircraft.sub(() => this.updateCreationSteps());

    // V1.2: Re-render aircraft lists when current simulator aircraft changes
    simVarState.currentSimAircraftReg.sub(() => {
      // Re-render hangar list if it exists
      if (this.hangarListRef.getOrDefault()) {
        this.renderHangarList();
      }
      // V1.2: Reload current aircraft for mission when registration changes
      if (this.missionAircraftInfoRef.getOrDefault()) {
        void this.loadCurrentAircraftForMission();
      }
    });

  }

  /**
   * P2P: Initialize local database for offline-first experience
   * Sets up IndexedDB, loads seed data on first launch, syncs states
   */
  private initializeLocalDatabase(): void {
    console.log("[CarrierPlus] Initializing local database...");

    // Initialize database and seed data
    InitService.initialize({
      onProgress: (step, progress) => {
        console.log(`[CarrierPlus] DB init: ${progress}% - ${step}`);
      },
      onFirstLaunch: () => {
        // First launch detected - show welcome popup for user to enter their info
        console.log("[CarrierPlus] First launch detected - showing welcome popup");
        authState.showFirstLaunchPopup.set(true);

        // Add input listener for ICAO validation after popup renders
        requestAnimationFrame(() => {
          const airportInput = this.welcomeAirportRef.instance;
          if (airportInput) {
            airportInput.addEventListener("input", () => {
              const value = airportInput.value.toUpperCase();
              const isValid = /^[A-Z]{4}$/.test(value);
              authState.firstLaunchAirportValid.set(isValid);
            });
          }

          // Add click handler for nationality list using event delegation
          const nationalityList = document.querySelector(".nationality-list");
          if (nationalityList) {
            nationalityList.addEventListener("click", (e: Event) => {
              const target = e.target as HTMLElement;
              // Find the nationality-item parent (could be clicked on span or text)
              const item = target.closest(".nationality-item") as HTMLElement;
              if (item && item.dataset.code) {
                authState.firstLaunchNationality.set(item.dataset.code);
              }
            });
          }
        });
      },
      onComplete: () => {
        console.log("[CarrierPlus] Local database initialized");
        this.initializePersistenceAndEconomy();
      },
      onError: (error) => {
        console.error("[CarrierPlus] Failed to initialize local database:", error);
      },
    });
  }

  /**
   * P2P: Initialize persistence manager and AI economy
   * Called after database is ready (either on first launch completion or on existing data)
   */
  private initializePersistenceAndEconomy(): void {
    // Initialize persistence manager
    PersistenceManager.initialize({
      onLoaded: () => {
        console.log("[CarrierPlus] States loaded from local database");
      },
      onError: (error) => {
        console.error("[CarrierPlus] Persistence error:", error);
      },
      onSaved: (store) => {
        console.log(`[CarrierPlus] Auto-saved: ${store}`);
      },
    });

    // Load states from database
    PersistenceManager.loadAllStates()
      .then(async () => {
        // Enable auto-save after loading
        PersistenceManager.enableAutoSave();

        // P2P Auto-login: DISABLED temporarily for testing
        // TODO: Re-enable after fixing freeze issue
        /*
        if (authState.isP2PMode.get()) {
          try {
            const player = await PlayerRouter.getPlayer();
            if (player) {
              authState.isLoggedIn.set(true);
              authState.currentUser.set({
                id: player.id,
                username: player.name,
                email: "",
              });
              console.log(`[CarrierPlus] P2P auto-login: ${player.name}`);
            }
          } catch (e) {
            console.warn("[CarrierPlus] P2P auto-login failed:", e);
          }
        }
        */

        // Start AI economy for solo mode (price fluctuation, AI orders)
        AIEconomyService.initialize({
          onPricesUpdated: (count) => console.log(`[AIEconomy] Updated ${count} prices`),
          onOrdersGenerated: (count) => console.log(`[AIEconomy] Generated ${count} AI orders`),
        });
        AIEconomyService.start();

        // Generate initial AI orders if market is empty
        AIEconomyService.forceUpdate().then(() => {
          console.log("[CarrierPlus] P2P local mode ready with AI economy");
        });
      })
      .catch((error) => {
        console.error("[CarrierPlus] Failed to load states:", error);
      });
  }

  /**
   * P2P: Complete first launch setup with user-provided data
   * Called when user validates the welcome popup (only if ICAO is valid)
   */
  private completeFirstLaunchSetup(): void {
    const pilotNameInput = this.welcomePilotNameRef.instance;
    const airportInput = this.welcomeAirportRef.instance;

    const pilotName = pilotNameInput?.value?.trim() || "Pilote";
    const nationality = authState.firstLaunchNationality.get();
    const startingAirport = (airportInput?.value?.trim() || "").toUpperCase();

    // Validation is done in WelcomePopup - button is disabled if invalid
    console.log(`[CarrierPlus] Completing first launch: ${pilotName} (${nationality}) at ${startingAirport}`);

    // Hide welcome popup
    authState.showFirstLaunchPopup.set(false);

    // Complete the setup with user data
    InitService.completeFirstLaunch(pilotName, nationality, startingAirport)
      .then(async () => {
        console.log("[CarrierPlus] First launch setup complete!");
        // Initialize persistence and economy after setup
        this.initializePersistenceAndEconomy();

        // Load player data into state
        try {
          const player = await InitService.getPlayerInfo();
          if (player) {
            console.log(`[CarrierPlus] Player loaded: ${player.name} with ${player.money} credits`);
            marketState.walletPersonal.set(player.money);
            authState.currentUser.set({
              id: player.id,
              username: player.name,
              email: "",
            });
            authState.isLoggedIn.set(true);
          }
        } catch (e) {
          console.warn("[CarrierPlus] Could not load player info:", e);
        }

        // Refresh hangar list with the new aircraft
        console.log("[CarrierPlus] Refreshing hangar after first launch...");
        void this.fetchHangarAircraftList();
      })
      .catch((error) => {
        console.error("[CarrierPlus] Failed to complete first launch:", error);
      });
  }

  /**
   * V2.0: Initialize tracking manager with callbacks
   */
  private initializeTrackingManager(): void {
    trackingManager.initialize({
      getAuthToken: () => authState.authToken.get(),
      getActiveMission: () => missionState.activeMission.get(),
      getMissionCheckpoints: () => missionState.missionCheckpoints.get(),
      getMissionAircraft: () => missionState.missionCurrentAircraft.get(),
      getAircraftCargoWeight: () => cargoState.aircraftCargoWeight.get(),
      getWaypointsTotal: () => missionState.waypointsTotal.get(),
      getMissionDistanceNm: () => missionState.missionDistanceNm.get(),
      // V2.0: Additional getters
      getWaypointsPassed: () => missionState.waypointsPassed.get(),
      getClosestAirport: () => simVarState.closestAirport.get(),
      getTotalPayload: () => this.getTotalPayload(),
      // V2.0: Full state update from manager
      onTrackingStateUpdate: (state) => {
        if (state.distanceFlown !== undefined) trackingState.trackingDistanceFlown.set(state.distanceFlown);
        if (state.progressPercent !== undefined) trackingState.trackingProgressPercent.set(state.progressPercent);
        if (state.currentAltitude !== undefined) trackingState.trackingCurrentAltitude.set(state.currentAltitude);
        if (state.fuelPercent !== undefined) trackingState.trackingFuelPercent.set(state.fuelPercent);
        if (state.simRate !== undefined) trackingState.trackingSimRate.set(state.simRate);
        if (state.canAccelerate !== undefined) trackingState.trackingCanAccelerate.set(state.canAccelerate);
        if (state.apActive !== undefined) trackingState.trackingApActive.set(state.apActive);
        if (state.realTime !== undefined) trackingState.trackingRealTime.set(state.realTime);
        if (state.simTime !== undefined) trackingState.trackingSimTime.set(state.simTime);
        if (state.timeRatio !== undefined) trackingState.trackingTimeRatio.set(state.timeRatio);
        if (state.bonusNight !== undefined) trackingState.trackingBonusNight.set(state.bonusNight);
        if (state.bonusCargo !== undefined) trackingState.trackingBonusCargo.set(state.bonusCargo);
        if (state.bonusEco !== undefined) trackingState.trackingBonusEco.set(state.bonusEco);
        if (state.bonusRealTime !== undefined) trackingState.trackingBonusRealTime.set(state.bonusRealTime);
        if (state.cargoExpected !== undefined) trackingState.trackingCargoExpected.set(state.cargoExpected);
        if (state.cargoActual !== undefined) trackingState.trackingCargoActual.set(state.cargoActual);
        if (state.fuelUsed !== undefined) trackingState.trackingFuelUsed.set(state.fuelUsed);
        if (state.fuelMax !== undefined) trackingState.trackingFuelMax.set(state.fuelMax);
        if (state.atcCompliance !== undefined) trackingState.trackingAtcCompliance.set(state.atcCompliance);
        if (state.atcViolations !== undefined) trackingState.trackingAtcViolations.set(state.atcViolations);
        if (state.waypointsPassed !== undefined) missionState.waypointsPassed.set(state.waypointsPassed);
        if (state.flightPhaseId !== undefined) checkpointState.flightPhaseId.set(state.flightPhaseId as FlightPhaseId);
        if (state.flightPhaseText !== undefined) checkpointState.flightPhaseText.set(state.flightPhaseText);
        if (state.flightPhaseColor !== undefined) checkpointState.flightPhaseColor.set(state.flightPhaseColor);
        // Update max G-force
        const maxG = trackingManager.getMaxGForce();
        simVarState.gForce.set(maxG);
      },
      onCheckpointValidated: (seq) => {
        missionState.checkpointsValidated.set(missionState.checkpointsValidated.get() + 1);
        missionState.nextCheckpoint.set(seq + 1);
      },
      onFlightPhaseChange: (id, text, color) => {
        checkpointState.flightPhaseId.set(id as FlightPhaseId);
        checkpointState.flightPhaseText.set(text);
        checkpointState.flightPhaseColor.set(color);
        // Update icon based on phase
        const iconMap: Record<string, string> = {
          "taxi_out": "🛫", "climb": "🛫", "cruise": "✈️", "descent": "🛬", "taxi_in": "🛬"
        };
        checkpointState.flightPhaseIcon.set(iconMap[id] || "✈️");
      },
      onWaypointPassed: (count) => missionState.waypointsPassed.set(count),
      onCheckpointsUpdate: (cps) => missionState.missionCheckpoints.set(cps),
      // V2.0: Mission completion trigger
      onMissionCompleteTrigger: () => {
        void this.completeMissionV1();
      },
      onTouchdown: (fpm) => {
        this.landingFpm = fpm;
        console.log("[CarrierPlus] Touchdown callback - FPM:", fpm);
      },
      onBackgroundWearApply: async (aircraftId, flightMinutes) => {
        await FleetRouter.applyBackgroundWear(aircraftId, flightMinutes, 0, 0);
      },
      onBackgroundFuelSync: async (aircraftId, fuelGallons, fuelCapacity) => {
        await FleetRouter.syncFuel(aircraftId, fuelGallons, fuelCapacity);
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      t: (section: any, key: any) => this.t(section, key),
    });
  }

  /**
   * V2.1: Initialize map manager with callbacks
   */
  private initializeMapManager(): void {
    mapManager.initialize({
      onAirportClick: (icao, name, type, lat, lon) => {
        // Handled by custom handleMapClick for Coherent GT compatibility
        mapState.selectedAirport.set({ icao, name, type, lat, lon });
      },
      onMapError: (error) => {
        mapState.mapError.set(`${this.t("map", "mapError")}: ${error}`);
      },
      onAirportsLoaded: (count) => {
        console.log("[CarrierPlus] Airports loaded:", count);
      },
      onFactoriesLoaded: (count) => {
        console.log("[CarrierPlus] Factories loaded:", count);
      },
      onHelipadsLoaded: (count) => {
        console.log("[CarrierPlus] Helipads loaded:", count);
      },
      onMapMoveEnd: () => {
        // Check if we need to reload airports
        const anyAirportsVisible = mapState.showLargeAirports.get() || mapState.showMediumAirports.get() || mapState.showSmallAirports.get();
        if (!anyAirportsVisible) return;

        const bounds = mapManager.getVisibleBounds();
        if (!bounds) return;

        const map = mapManager.getMap();
        const currentZoom = map?.getView().getZoom() || 7;

        // Check if zoom crossed a threshold (7 or 9)
        const zoomThresholds = [7, 9, 11];
        const lastThreshold = zoomThresholds.filter(t => this.lastLoadedZoom >= t).length;
        const currentThreshold = zoomThresholds.filter(t => currentZoom >= t).length;
        const zoomCrossedThreshold = lastThreshold !== currentThreshold;

        if (zoomCrossedThreshold || mapManager.shouldReloadAirports(bounds)) {
          console.log(`[CarrierPlus] Map moved - reloading airports (zoom: ${this.lastLoadedZoom.toFixed(1)} → ${currentZoom.toFixed(1)}, threshold: ${zoomCrossedThreshold})`);
          void this.fetchAirportsForMap();
        }
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      t: (section: any, key: any) => this.t(section, key),
    });
  }

  /**
   * V2.2: Initialize mission creation manager with callbacks
   */
  private initializeMissionCreationManager(): void {
    missionCreationManager.initialize({
      onFlightPlanRead: (data: FlightPlanData) => {
        // Update state from flight plan data
        missionCreationState.fpWaypointCount.set(data.wpCount);
        missionCreationState.fpHasActivePlan.set(data.hasActivePlan);
        missionCreationState.fpTotalDistance.set(data.totalDistanceNm);
        missionCreationState.fpPrevWpId.set(data.prevWpId);
        missionCreationState.fpNextWpId.set(data.nextWpId);

        // Use origin from missionOriginIcao or detected origin
        const currentOrigin = missionState.missionOriginIcao.get();
        if (currentOrigin) {
          missionCreationState.fpOriginIcao.set(currentOrigin);
        } else if (data.detectedOrigin) {
          missionCreationState.fpOriginIcao.set(data.detectedOrigin);
        }
      },
      onDestinationDetected: (icao: string) => {
        missionCreationState.fpDestinationInput.set(icao);
        // Also try to set the input field value directly
        const inputEl = this.fpDestinationInputRef.getOrDefault();
        if (inputEl) {
          inputEl.value = icao;
        }
      },
      onFlightPlanNotification: (message: string) => {
        popupState.popupNotification.set(message);
      },
      onError: (error: string) => {
        console.error("[CarrierPlus] Mission creation error:", error);
      },
      onPayloadWritten: (state: PayloadState) => {
        this.payloadStartLbs = state.payloadStartLbs;
        this.fuelStartPercent = state.fuelStartPercent;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      t: (section: any, key: any) => this.t(section, key),
    });
  }

  /**
   * V2.4: Initialize free flight manager for career mode background tracking
   */
  private initializeFreeFlightManager(): void {
    freeFlightManager.initialize({
      onLandingDetected: (airport: string, totalLandings: number) => {
        console.log(`[FreeFlight] Landing at ${airport}, total: ${totalLandings}`);
      },
      onStatsUpdated: (flightTime: number, distance: number, xp: number) => {
        // Stats are already in freeFlightState, no need to update here
      },
      onError: (error: string) => {
        console.warn("[FreeFlight] Error:", error);
      },
    });

    // Subscribe to changes that trigger free flight start/stop
    // Start when: logged in + aircraft detected + no active mission
    authState.isLoggedIn.sub((loggedIn) => {
      if (loggedIn) {
        this.checkAndStartFreeFlight();
      } else {
        freeFlightManager.stopBackgroundTracking();
      }
    });

    // When aircraft changes
    missionState.selectedAircraftId.sub(() => {
      if (authState.isLoggedIn.get() || authState.isP2PMode.get()) {
        this.checkAndStartFreeFlight();
      }
    });

    // When mission state changes
    missionState.activeMission.sub((mission) => {
      if (mission) {
        // Mission started - pause free flight
        freeFlightManager.pauseForMission();
      } else {
        // Mission ended - resume free flight
        this.checkAndStartFreeFlight();
      }
    });
  }

  /**
   * Check conditions and start free flight tracking if appropriate
   */
  private checkAndStartFreeFlight(): void {
    const isLoggedIn = authState.isLoggedIn.get() || authState.isP2PMode.get();
    const aircraftId = missionState.selectedAircraftId.get();
    const aircraftReg = simVarState.currentSimAircraftReg.get();
    const activeMission = missionState.activeMission.get();
    const closestAirport = simVarState.closestAirport.get();

    if (isLoggedIn && aircraftId && !activeMission) {
      freeFlightManager.startBackgroundTracking(
        aircraftId,
        aircraftReg || "Unknown",
        closestAirport || "ZZZZ"
      );
    }
  }

  // Update fpCanValidate based on current state
  private updateFpCanValidate(): void {
    const hasActivePlan = missionCreationState.fpHasActivePlan.get();
    const destIcao = missionCreationState.fpDestinationInput.get();
    missionCreationState.fpCanValidate.set(hasActivePlan && destIcao.length === 4);
  }

  /**
   * Clean up map resources - called before reinitializing or when closing app
   * Handles the case where GT debugger refresh recreates DOM but JS state persists
   */
  private disposeMap(): void {
    // V2.1: Delegate to MapManager
    mapManager.disposeMap();
    this.mapInitialized = false;
    this.olMap = null;
    this.aircraftFeature = null;
    this.airportsSource = null;
    this.factoriesSource = null;
    this.helipadsSource = null;
  }

  /**
   * Extract ICAO aircraft type from various MSFS SimVar formats.
   * Handles:
   * - "ATCCOM.AC_MODEL C172.0.text" -> "C172"
   * - "$$:PC12" -> "PC12"
   * - "Cessna 172 Skyhawk" -> searches for known pattern
   * - Direct ICAO like "C172", "B738" -> returns as-is
   */
  private extractIcaoType(atcModel: string): string {
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

  private loadAuthFromStorage(): void {
    try {
      // P2P: Load user preferences only (auth handled by InitService)
      this.loadUnitPreferences();
      this.loadLanguage();

      // P2P: Auto-sync current aircraft fuel after a short delay
      setTimeout(() => {
        void this.autoSyncCurrentAircraft();
      }, 1000);
    } catch (error) {
      console.error("[CarrierPlus] Failed to load preferences:", error);
    }
  }

  // V1.5: Load unit preferences from localStorage
  private loadUnitPreferences(): void {
    try {
      const savedUnits = localStorage.getItem("carrierplus_units");
      if (savedUnits) {
        const units = JSON.parse(savedUnits);
        if (units.distance) settingsState.unitDistance.set(units.distance);
        if (units.weight) settingsState.unitWeight.set(units.weight);
        if (units.altitude) settingsState.unitAltitude.set(units.altitude);
        if (units.fuel) settingsState.unitFuel.set(units.fuel);
        if (units.speed) settingsState.unitSpeed.set(units.speed);
        if (units.temperature) settingsState.unitTemperature.set(units.temperature);
        console.log("[CarrierPlus] Unit preferences loaded:", units);
      }
    } catch (error) {
      console.error("[CarrierPlus] Failed to load unit preferences:", error);
    }
  }

  // V1.5: Save unit preferences to localStorage
  private saveUnitPreferences(): void {
    try {
      const units = {
        distance: settingsState.unitDistance.get(),
        weight: settingsState.unitWeight.get(),
        altitude: settingsState.unitAltitude.get(),
        fuel: settingsState.unitFuel.get(),
        speed: settingsState.unitSpeed.get(),
        temperature: settingsState.unitTemperature.get(),
      };
      localStorage.setItem("carrierplus_units", JSON.stringify(units));
      console.log("[CarrierPlus] Unit preferences saved:", units);
    } catch (error) {
      console.error("[CarrierPlus] Failed to save unit preferences:", error);
    }
  }

  // V1.5: Toggle a unit preference and save
  private toggleUnit(unitType: "distance" | "weight" | "altitude" | "fuel" | "speed" | "temperature"): void {
    switch (unitType) {
      case "distance":
        settingsState.unitDistance.set(settingsState.unitDistance.get() === "nm" ? "km" : "nm");
        break;
      case "weight":
        settingsState.unitWeight.set(settingsState.unitWeight.get() === "kg" ? "lbs" : "kg");
        break;
      case "altitude":
        settingsState.unitAltitude.set(settingsState.unitAltitude.get() === "ft" ? "m" : "ft");
        break;
      case "fuel":
        settingsState.unitFuel.set(settingsState.unitFuel.get() === "gal" ? "L" : "gal");
        break;
      case "speed":
        settingsState.unitSpeed.set(settingsState.unitSpeed.get() === "kts" ? "kmh" : "kts");
        break;
      case "temperature":
        settingsState.unitTemperature.set(settingsState.unitTemperature.get() === "C" ? "F" : "C");
        break;
    }
    this.saveUnitPreferences();
  }

  // V1.5: Get translation for current language
  private t(category: keyof TranslationKeys, key: string): string {
    const lang = settingsState.currentLanguage.get();
    const categoryObj = translations[lang][category] as Record<string, string>;
    return categoryObj[key] || key;
  }

  // V1.5: Set language and save to localStorage
  private setLanguage(lang: Language): void {
    settingsState.currentLanguage.set(lang);
    try {
      localStorage.setItem("carrierplus_language", lang);
      console.log("[CarrierPlus] Language set to:", lang);
    } catch (error) {
      console.error("[CarrierPlus] Failed to save language:", error);
    }
  }

  // V1.5: Load language from localStorage
  private loadLanguage(): void {
    try {
      const savedLang = localStorage.getItem("carrierplus_language") as Language | null;
      const validLanguages: Language[] = ["en", "fr", "de", "es"];
      if (savedLang && validLanguages.includes(savedLang)) {
        settingsState.currentLanguage.set(savedLang);
        console.log("[CarrierPlus] Language loaded:", savedLang);
      }
    } catch (error) {
      console.error("[CarrierPlus] Failed to load language:", error);
    }
  }

  private saveAuthToStorage(token: string, user: UserInfo): void {
    try {
      localStorage.setItem("carrierplus_token", token);
      localStorage.setItem("carrierplus_user", JSON.stringify(user));
      console.log("[CarrierPlus] Session saved for:", user.username);
    } catch (error) {
      console.error("[CarrierPlus] Failed to save session:", error);
    }
  }

  private clearAuthStorage(): void {
    try {
      localStorage.removeItem("carrierplus_token");
      localStorage.removeItem("carrierplus_user");
    } catch (error) {
      console.error("[CarrierPlus] Failed to clear session:", error);
    }
  }

  public onClose(): void {
    this.stopSimVarUpdates();
    // Don't dispose map on close - it might just be minimized
    // Only dispose on open to handle GT refresh case
  }

  public onResume(): void {
    this.startSimVarUpdates();

    // Subscribe to FlightPlanner events (EFB flight plan detection)
    this.subscribeToFlightPlannerEvents();

    // V1.4: Auto-sync aircraft fuel when app resumes (anti-cheat)
    // This ensures fuel is enforced when returning from main menu
    if (authState.isLoggedIn.get() || authState.isP2PMode.get()) {
      console.log("[CarrierPlus] App resumed, syncing aircraft state...");
      void this.autoSyncCurrentAircraft();
    }

    // Refresh map if it exists and we're on map tab (handles resume from pause)
    if (navigationState.activeTab.get() === "map" && this.olMap) {
      // Force OpenLayers to recalculate size after resume
      setTimeout(() => {
        if (this.olMap) {
          this.olMap.updateSize();
        }
      }, 100);
    }
  }

  public onPause(): void {
    this.stopSimVarUpdates();
    this.unsubscribeFromFlightPlannerEvents();
  }

  private startSimVarUpdates(): void {
    if (this.updateInterval) return;
    this.updateInterval = window.setInterval(() => this.readSimVars(), SIMVAR_UPDATE_INTERVAL_MS);
    this.readSimVars();
  }

  private stopSimVarUpdates(): void {
    if (this.updateInterval) {
      window.clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  private readSimVars(): void {
    try {
      if (typeof SimVar !== "undefined") {
        // Position & Navigation
        simVarState.latitude.set(SimVar.GetSimVarValue("PLANE LATITUDE", "degrees") as number || 0);
        simVarState.longitude.set(SimVar.GetSimVarValue("PLANE LONGITUDE", "degrees") as number || 0);
        simVarState.altitude.set(SimVar.GetSimVarValue("PLANE ALTITUDE", "feet") as number || 0);
        simVarState.heading.set(SimVar.GetSimVarValue("PLANE HEADING DEGREES TRUE", "degrees") as number || 0);

        // Speeds
        simVarState.groundSpeed.set(SimVar.GetSimVarValue("GROUND VELOCITY", "knots") as number || 0);
        simVarState.airspeed.set(SimVar.GetSimVarValue("AIRSPEED INDICATED", "knots") as number || 0);
        const vs = SimVar.GetSimVarValue("VERTICAL SPEED", "feet per minute") as number || 0;
        simVarState.verticalSpeed.set(vs);

        // Other data
        simVarState.gForce.set(SimVar.GetSimVarValue("G FORCE", "GForce") as number || 1);
        simVarState.fuelQuantity.set(SimVar.GetSimVarValue("FUEL TOTAL QUANTITY", "gallons") as number || 0);
        simVarState.touchdownVelocity.set(SimVar.GetSimVarValue("PLANE TOUCHDOWN NORMAL VELOCITY", "feet per second") as number || 0);

        // V1.2: Current aircraft registration (for anti-cheat aircraft locking)
        const atcId = SimVar.GetSimVarValue("ATC ID", "string") as string;
        simVarState.currentSimAircraftReg.set(atcId?.toUpperCase() || "");

        // Closest airport (might not be available)
        try {
          const airport = SimVar.GetSimVarValue("GPS CLOSEST AIRPORT ID", "string") as string;
          simVarState.closestAirport.set(airport || "----");
        } catch {
          simVarState.closestAirport.set("----");
        }

        // Landing detection
        const currentOnGround = SimVar.GetSimVarValue("SIM ON GROUND", "bool") as boolean;

        // Detect landing: was in air, now on ground
        if (!this.wasOnGround && currentOnGround) {
          // Use the vertical speed just before landing (convert to positive fpm)
          const landingRate = Math.abs(vs);
          simVarState.lastLandingRate.set(landingRate);

          // Determine rating
          if (landingRate < 100) {
            simVarState.landingRating.set("excellent");
          } else if (landingRate < 300) {
            simVarState.landingRating.set("good");
          } else if (landingRate < 600) {
            simVarState.landingRating.set("acceptable");
          } else {
            simVarState.landingRating.set("hard");
          }
        }

        this.wasOnGround = currentOnGround;
        simVarState.onGround.set(currentOnGround);

        // Update map position if map is initialized
        if (this.mapInitialized) {
          this.updateMapPosition();
        }

        // P2P: Tick AI economy service (uses elapsed seconds since start)
        const elapsedSeconds = Math.floor((Date.now() - this.aiEconomyStartTime) / 1000);
        AIEconomyService.tick(elapsedSeconds);
      }
    } catch (e) {
      // Silent error
    }
  }

  private toggleLoginPanel(): void {
    // P2P: Login panel shows user info only (no form needed)
    authState.showLoginPanel.set(!authState.showLoginPanel.get());
  }

  private setupInputEventBlocker(input: HTMLInputElement | null): void {
    if (!input) return;

    // Generate a unique ID for this input
    const uuid = `carrierplus-input-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // When input is focused, tell MSFS to capture keyboard for the EFB
    input.addEventListener("focus", () => {
      console.log("[CarrierPlus] Input focused - requesting keyboard capture via Coherent");
      // Tell MSFS to capture keyboard input for this field
      // @ts-ignore - Coherent is a global provided by MSFS
      if (typeof Coherent !== "undefined") {
        // @ts-ignore
        Coherent.trigger("FOCUS_INPUT_FIELD", { uuid, isPassword: input.type === "password" });
      }
    });

    // When input loses focus, release keyboard back to simulator
    input.addEventListener("blur", () => {
      console.log("[CarrierPlus] Input blurred - releasing keyboard via Coherent");
      // @ts-ignore
      if (typeof Coherent !== "undefined") {
        // @ts-ignore
        Coherent.trigger("UNFOCUS_INPUT_FIELD", uuid);
      }
    });
  }

  // Special setup for destination ICAO input - captures keyboard AND input events
  private setupDestinationInput(input: HTMLInputElement | null): void {
    if (!input) return;

    // First, setup keyboard capture
    this.setupInputEventBlocker(input);

    // Then, add input event listener to capture typed value into Subject
    // This is needed because input.value doesn't work reliably in Coherent GT
    input.addEventListener("input", (e: Event) => {
      const target = e.target as HTMLInputElement;
      const value = target.value.toUpperCase();
      console.log("[CarrierPlus] Destination input event:", value);
      missionCreationState.fpDestinationInput.set(value);
    });

    // Also capture on keyup as a fallback
    input.addEventListener("keyup", (e: KeyboardEvent) => {
      const target = e.target as HTMLInputElement;
      const value = target.value.toUpperCase();
      if (value !== missionCreationState.fpDestinationInput.get()) {
        console.log("[CarrierPlus] Destination keyup:", value);
        missionCreationState.fpDestinationInput.set(value);
      }
    });

    console.log("[CarrierPlus] Destination input setup complete");
  }

  // P2P: Login is handled locally via InitService - these are stub methods for UI compatibility
  private doLogin(): void {
    console.log("[CarrierPlus] P2P mode - login handled locally via welcome popup");
    authState.showLoginPanel.set(false);
  }

  private saveSettingsCredentials(): void {
    console.log("[CarrierPlus] P2P mode - credentials not needed");
  }

  private askLogout(): void {
    authState.showLogoutConfirm.set(true);
    authState.showLoginPanel.set(false);
  }

  private cancelLogout(): void {
    authState.showLogoutConfirm.set(false);
  }

  private confirmLogout(): void {
    console.log("[CarrierPlus] Logging out");
    authState.authToken.set(null);
    authState.currentUser.set(null);
    authState.isLoggedIn.set(false);
    authState.showLoginPanel.set(false);
    authState.showLogoutConfirm.set(false);
    this.clearAuthStorage();
  }

  // V1.5: Handle 401 Unauthorized errors - auto logout + notification
  private handleUnauthorized(): void {
    console.log("[CarrierPlus] Session expired or unauthorized");
    authState.authToken.set(null);
    authState.currentUser.set(null);
    authState.isLoggedIn.set(false);
    this.clearAuthStorage();
    popupState.popupNotification.set(this.t("login", "sessionExpired"));
  }

  private toggleAirportsSidebar(): void {
    mapState.showAirportsSidebar.set(!mapState.showAirportsSidebar.get());
    // Fetch airports if opening and not already loaded
    if (mapState.showAirportsSidebar.get() && this.nearbyAirports.length === 0) {
      this.fetchNearbyAirports();
    }
  }

  // Helper to get auth headers for API calls
  private getAuthHeaders(): Record<string, string> {
    const token = authState.authToken.get();
    if (token) {
      return {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json",
      };
    }
    return { "Accept": "application/json" };
  }

  private async fetchNearbyAirports(): Promise<void> {
    const lat = simVarState.latitude.get();
    const lon = simVarState.longitude.get();

    if (lat === 0 && lon === 0) {
      mapState.nearbyAirportsError.set(this.t("missions", "positionNotDetected"));
      return;
    }

    console.log("[CarrierPlus] Fetching nearby airports for:", lat, lon);
    mapState.nearbyAirportsStatus.set("loading");
    mapState.nearbyAirportsError.set(null);

    try {
      // V3.0: Use WorldRouter for P2P/network mode auto-switching
      const airports = await WorldRouter.getNearbyAirports(lat, lon, 50, 10);
      console.log("[CarrierPlus] Nearby airports:", airports);

      this.nearbyAirports = airports.map((a: { ident?: string; icao?: string; name?: string; distance_nm?: number }) => ({
        icao: a.ident || a.icao || "????",
        name: a.name || "Unknown",
        distance_nm: a.distance_nm || 0,
      }));

      mapState.nearbyAirportsStatus.set("success");
      this.renderAirportsList();

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("[CarrierPlus] Nearby airports FAILED:", errorMsg);
      mapState.nearbyAirportsStatus.set("error");
      mapState.nearbyAirportsError.set(errorMsg);
    }
  }

  private renderAirportsList(): void {
    const el = this.nearbyAirportsListRef.getOrDefault();
    if (!el) return;
    el.innerHTML = renderAirportsListHtml(this.nearbyAirports, this.t("map", "noAirport"));
  }

  private renderInventoryList(): void {
    const el = this.inventoryListRef.getOrDefault();
    if (!el) return;
    el.innerHTML = renderInventoryListHtml(
      this.inventoryItems,
      this.t("inventory", "emptyInventory"),
      this.t("hangar", "storedAt"),
      this.t("hangar", "units")
    );
  }

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
    // V1.2: Get current aircraft registration from SimVar for strict mode
    const currentSimReg = simVarState.currentSimAircraftReg.get();

    // V1.2: Sort aircraft list - active aircraft first
    const sortedAircraft = [...this.availableAircraftList].sort((a, b) => {
      const aIsActive = a.registration?.toUpperCase() === currentSimReg;
      const bIsActive = b.registration?.toUpperCase() === currentSimReg;
      if (aIsActive && !bIsActive) return -1;
      if (!aIsActive && bIsActive) return 1;
      return 0;
    });

    const html = sortedAircraft.map(ac => {
      const isSelected = selectedId === ac.id;
      // V1.2: Check if this is the aircraft the player is currently in
      const isCurrentAircraft = ac.registration?.toUpperCase() === currentSimReg;
      const isLocked = !isCurrentAircraft;

      // Style based on selection AND lock status
      let bgStyle: string;
      let opacity: string;
      let cursor: string;

      if (isLocked) {
        // Locked: white text, red border, not clickable (but visible)
        bgStyle = "background: #1f2937; border: 1px solid #ef4444;";
        opacity = "opacity: 1;";
        cursor = "cursor: not-allowed;";
      } else if (isSelected) {
        // Selected and unlocked
        bgStyle = "background: rgba(59, 130, 246, 0.2); border: 2px solid #22c55e;";
        opacity = "opacity: 1;";
        cursor = "cursor: pointer;";
      } else {
        // Unlocked but not selected
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

      // Lock indicator for locked aircraft
      const lockIndicator = isLocked
        ? `<div style="display: flex; align-items: center; gap: 4px;">
             <svg style="width: 14px; height: 14px; fill: #ef4444;" viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM9 8V6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9z"/></svg>
             <span style="font-size: 9px; color: #ef4444;">${this.t("hangar", "boardAircraft")}</span>
           </div>`
        : `<div style="${radioStyle}">${innerDot}</div>`;

      // Active indicator for unlocked aircraft
      const activeIndicator = !isLocked
        ? `<div style="position: absolute; top: 4px; right: 4px; font-size: 8px; color: #22c55e; font-weight: 600;">${this.t("hangar", "active")}</div>`
        : "";

      // V1.4: Aircraft thumbnail in fleet list
      const thumbnailUrl = ac.aircraft_model
        ? `coui://html_ui/efb_ui/efb_apps/CarrierPlus/Assets/aircraft/${ac.aircraft_model.toUpperCase()}.jpg`
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

    // Add click handlers (only for unlocked aircraft)
    el.querySelectorAll(".aircraft-item").forEach((item) => {
      item.addEventListener("click", () => {
        // V1.2: Check if aircraft is locked
        const isLocked = item.getAttribute("data-locked") === "true";
        if (isLocked) {
          console.log("[CarrierPlus] Aircraft locked - not current aircraft");
          return; // Ignore click on locked aircraft
        }

        const id = item.getAttribute("data-id");
        if (id) {
          missionState.selectedAircraftId.set(id);
          this.renderAircraftList(); // Re-render to update selection
          // V0.8: Fetch cargo data when aircraft selected
          void this.fetchAircraftCargo(id);
          const origin = missionState.missionOriginIcao.get();
          if (origin) {
            void this.fetchAirportInventoryForCargo(origin);
          }
          // V2.2: Read current fuel when aircraft selected
          this.readCurrentFuel();
          // V1.1: Fetch aircraft systems for warnings
          void this.fetchMissionAircraftSystems(id);
          // V1.1: Update creation steps validation
          missionCreationState.cargoValidated.set(false); // Reset cargo validation when aircraft changes
          this.updateCreationSteps();
        }
      });
    });
  }

  private initializeMap(): void {
    if (this.mapInitialized || !this.mapContainerRef.getOrDefault()) {
      return;
    }

    const container = this.mapContainerRef.getOrDefault();
    if (!container) {
      console.log("[CarrierPlus] Map container not found");
      return;
    }

    // Get current position
    const lat = simVarState.latitude.get();
    const lon = simVarState.longitude.get();
    const heading = simVarState.heading.get();

    // V2.1: Delegate map creation to MapManager (skip default handlers for Coherent GT)
    const success = mapManager.initializeMap(container, lat, lon, heading, { skipDefaultHandlers: true });
    if (!success) {
      mapState.mapError.set(this.t("map", "mapError"));
      return;
    }

    // Get references from MapManager
    this.olMap = mapManager.getMap();
    this.aircraftFeature = mapManager.getAircraftFeature();
    this.airportsSource = mapManager.getAirportsSource();
    this.helipadsSource = mapManager.getHelipadsSource();
    this.factoriesSource = mapManager.getFactoriesSource();

    // Setup custom drag/click handler for Coherent GT compatibility
    // (MapManager's default handlers don't work in Coherent GT)
    this.setupManualMapDrag(container);

    this.mapInitialized = true;
    mapState.mapError.set(null);
    console.log("[CarrierPlus] Map initialized successfully!");

    // Load airports on initial map load if filters are active
    const anyAirportsVisible = mapState.showLargeAirports.get() || mapState.showMediumAirports.get() || mapState.showSmallAirports.get();
    if (anyAirportsVisible) {
      console.log("[CarrierPlus] Filters active on init, loading airports...");
      mapManager.setAirportsVisible(true);
      void this.fetchAirportsForMap();
    }
  }

  // Manual drag/pan and click implementation for Coherent GT compatibility
  private setupManualMapDrag(container: HTMLElement): void {
    if (!this.olMap) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let totalDragDistance = 0;

    // Mouse down - start drag
    container.addEventListener("mousedown", (e: MouseEvent) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      lastX = e.clientX;
      lastY = e.clientY;
      totalDragDistance = 0;
      container.style.cursor = "grabbing";
      e.preventDefault();
    });

    // Mouse move - drag the map
    container.addEventListener("mousemove", (e: MouseEvent) => {
      if (!isDragging || !this.olMap) return;

      const deltaX = e.clientX - lastX;
      const deltaY = e.clientY - lastY;

      // Track total drag distance
      totalDragDistance += Math.abs(deltaX) + Math.abs(deltaY);

      const view = this.olMap.getView();
      const resolution = view.getResolution() || 1;
      const center = view.getCenter();

      if (center) {
        // Move map in opposite direction of drag
        view.setCenter([
          center[0] - deltaX * resolution,
          center[1] + deltaY * resolution,
        ]);
      }

      lastX = e.clientX;
      lastY = e.clientY;
    });

    // Mouse up - stop drag OR handle click
    container.addEventListener("mouseup", (e: MouseEvent) => {
      const wasDragging = isDragging;
      isDragging = false;
      container.style.cursor = "grab";

      // If we didn't drag much, treat as a click
      if (wasDragging && totalDragDistance < 5) {
        this.handleMapClick(e, container);
      }
    });

    // Mouse leave - stop drag
    container.addEventListener("mouseleave", () => {
      isDragging = false;
      container.style.cursor = "grab";
    });

    // Mouse wheel - zoom
    container.addEventListener("wheel", (e: WheelEvent) => {
      if (!this.olMap) return;
      e.preventDefault();

      const view = this.olMap.getView();
      const zoom = view.getZoom() || 7;
      const delta = e.deltaY > 0 ? -0.5 : 0.5;
      const newZoom = Math.max(4, Math.min(16, zoom + delta));

      view.animate({
        zoom: newZoom,
        duration: 150,
      });
    });

    // Set initial cursor
    container.style.cursor = "grab";
  }

  // Handle click on map (called from mouseup when no drag detected)
  // Note: forEachFeatureAtPixel uses getImageData which is not supported in Coherent GT
  // So we manually search for features by coordinate distance
  private async handleMapClick(e: MouseEvent, container: HTMLElement): Promise<void> {
    if (!this.olMap) return;

    // Get pixel relative to map container
    const rect = container.getBoundingClientRect();
    const pixel: [number, number] = [e.clientX - rect.left, e.clientY - rect.top];

    console.log("[CarrierPlus] Map click at pixel:", pixel);

    // Convert pixel to map coordinate
    const clickCoord = this.olMap.getCoordinateFromPixel(pixel);
    if (!clickCoord) {
      console.log("[CarrierPlus] Could not get coordinate from pixel");
      mapState.selectedAirport.set(null);
      return;
    }

    const clickLonLat = toLonLat(clickCoord);
    console.log("[CarrierPlus] Click coordinate:", clickLonLat);

    // Get current zoom to determine hit tolerance
    const zoom = this.olMap.getView().getZoom() || 7;
    // Tolerance in degrees - larger when zoomed out, smaller when zoomed in
    const tolerance = 0.5 / Math.pow(2, zoom - 5);

    // Search for nearest airport feature manually
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let nearestFeature: any = null;
    let nearestDistance = Infinity;

    // Check airports layer (if any airport type is visible)
    const anyAirportsVisible = mapState.showLargeAirports.get() || mapState.showMediumAirports.get() || mapState.showSmallAirports.get();
    if (this.airportsSource && anyAirportsVisible) {
      this.airportsSource.getFeatures().forEach((feature) => {
        const geom = feature.getGeometry();
        if (geom) {
          const featureCoord = toLonLat(geom.getCoordinates());
          const dx = featureCoord[0] - clickLonLat[0];
          const dy = featureCoord[1] - clickLonLat[1];
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < tolerance && distance < nearestDistance) {
            nearestDistance = distance;
            nearestFeature = feature;
          }
        }
      });
    }

    // Check helipads layer
    if (this.helipadsSource && mapState.showHelipadsOnMap.get()) {
      this.helipadsSource.getFeatures().forEach((feature) => {
        const geom = feature.getGeometry();
        if (geom) {
          const featureCoord = toLonLat(geom.getCoordinates());
          const dx = featureCoord[0] - clickLonLat[0];
          const dy = featureCoord[1] - clickLonLat[1];
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < tolerance && distance < nearestDistance) {
            nearestDistance = distance;
            nearestFeature = feature;
          }
        }
      });
    }

    if (nearestFeature) {
      const icao = nearestFeature.get("icao");
      const name = nearestFeature.get("name");
      const type = nearestFeature.get("type");

      console.log("[CarrierPlus] Airport found:", { icao, name, type, distance: nearestDistance });

      if (icao && type) {
        // Get coordinates from feature geometry
        const geometry = nearestFeature.getGeometry();
        let lat = 0;
        let lon = 0;
        if (geometry) {
          const coords = toLonLat(geometry.getCoordinates());
          lon = coords[0];
          lat = coords[1];
        }

        mapState.selectedAirport.set({ icao, name, type, lat, lon });

        // Fetch available slots (public API, no auth needed)
        await this.fetchAvailableSlotsAtAirport(icao);

        // Fetch user's factories at this airport (if logged in)
        if (authState.isLoggedIn.get()) {
          await this.fetchMyFactoriesAtAirport(icao);
        } else {
          mapState.myFactoriesAtAirport.set([]);
        }
        return;
      }
    }

    // Clicked elsewhere - close menu
    console.log("[CarrierPlus] No airport feature found, closing menu");
    mapState.selectedAirport.set(null);
  }

  // Fetch user's factories at a specific airport
  private async fetchMyFactoriesAtAirport(icaoCode: string): Promise<void> {
    const token = authState.authToken.get();
    if (!token) {
      mapState.myFactoriesAtAirport.set([]);
      return;
    }

    try {
      const factories = await WorldRouter.getFactoriesAtAirport(icaoCode);
      console.log(`[CarrierPlus] My factories at ${icaoCode}:`, factories.length);
      mapState.myFactoriesAtAirport.set(factories);
    } catch (error) {
      console.error("[CarrierPlus] Failed to fetch my factories:", error);
      mapState.myFactoriesAtAirport.set([]);
    }
  }

  // Fetch available factory slots at a specific airport
  private async fetchAvailableSlotsAtAirport(icaoCode: string): Promise<void> {
    try {
      const slots = await WorldRouter.getAvailableSlots(icaoCode);
      console.log(`[CarrierPlus] Available slots at ${icaoCode}:`, slots);
      mapState.availableSlotsAtAirport.set(slots);
    } catch (error) {
      console.error("[CarrierPlus] Failed to fetch available slots:", error);
      mapState.availableSlotsAtAirport.set(null);
    }
  }

  // Context menu actions
  private openCreateFactory(airport: { icao: string; name: string }): void {
    console.log("[CarrierPlus] TODO: Open create factory form at", airport.icao);
    // TODO: Implement factory creation form
    mapState.selectedAirport.set(null);
  }

  private openManageFactory(factory: { id: string; name: string }): void {
    console.log("[CarrierPlus] TODO: Open manage factory", factory.id, factory.name);
    // TODO: Implement factory management panel
    mapState.selectedAirport.set(null);
  }

  private setDestinationAirport(airport: { icao: string; name: string }): void {
    console.log("[CarrierPlus] Destination set:", airport.icao, airport.name);
    mapState.destinationAirport.set(airport);
    mapState.selectedAirport.set(null);
    // Also set the flight plan destination input
    missionCreationState.fpDestinationInput.set(airport.icao);
    // Update the HTML input element as well
    const inputEl = this.fpDestinationInputRef.getOrDefault();
    if (inputEl) inputEl.value = airport.icao;
    // Switch to missions tab > creation sub-tab when destination is set
    navigationState.activeTab.set("missions");
    navigationState.missionsSubTab.set("creation");
  }

  // V0.8 Mission Methods

  private async fetchAvailableAircraft(icao: string): Promise<void> {
    const token = authState.authToken.get();
    // P2P mode doesn't require token
    if (!authState.isP2PMode.get() && !token) {
      console.log("[CarrierPlus] Not logged in, cannot fetch aircraft");
      return;
    }

    console.log("[CarrierPlus] Fetching available aircraft at:", icao);
    missionState.missionStatus.set("loading");
    missionState.missionError.set(null);

    try {
      // V1.9: Use fleetService for available aircraft
      const aircraft = await FleetRouter.getAvailableAtAirport(icao);
      console.log("[CarrierPlus] Available aircraft:", aircraft);
      this.availableAircraftList = aircraft;
      missionState.missionStatus.set("idle");

      // Auto-select first aircraft if any
      if (aircraft.length > 0) {
        missionState.selectedAircraftId.set(aircraft[0].id);
        // V0.8: Fetch cargo data for auto-selected aircraft
        void this.fetchAircraftCargo(aircraft[0].id);
        void this.fetchAirportInventoryForCargo(icao);
        // V2.2: Read current fuel
        this.readCurrentFuel();
        // V1.1: Update creation steps validation
        this.updateCreationSteps();
      }

      // Render the list
      this.renderAircraftList();
    } catch (error) {
      console.error("[CarrierPlus] Error fetching aircraft:", error);
      missionState.missionError.set(this.t("missions", "errorLoadingAircrafts"));
      this.availableAircraftList = [];
      this.renderAircraftList();
      missionState.missionStatus.set("error");
    }
  }

  private async refreshMissionOrigin(): Promise<void> {
    // V1.5: Always ensure status is idle at start to prevent stuck button
    missionState.missionStatus.set("idle");

    // Use API to find closest airport from GPS coordinates
    const lat = simVarState.latitude.get();
    const lon = simVarState.longitude.get();

    if (lat === 0 && lon === 0) {
      console.log("[CarrierPlus] No GPS position available");
      return;
    }

    console.log("[CarrierPlus] Finding closest airport to:", lat, lon);
    missionState.missionStatus.set("loading");

    try {
      const airport = await WorldRouter.getClosestAirport(lat, lon);
      if (!airport) throw new Error("No airport found");
      console.log("[CarrierPlus] Closest airport:", airport.ident, airport.name);

      missionState.missionOriginIcao.set(airport.ident);
      // V1.2: Auto-load current aircraft from SimVar instead of fetching list
      void this.loadCurrentAircraftForMission();
      // Also check for active mission
      this.fetchActiveMission();

      // Reset status to idle so button is clickable
      missionState.missionStatus.set("idle");
    } catch (error) {
      console.error("[CarrierPlus] Error finding closest airport:", error);
      missionState.missionError.set(this.t("missions", "errorDetectingAirport"));
      missionState.missionStatus.set("error");
    }
  }

  // ========================================
  // V1.1: Step-based Mission Creation
  // ========================================

  // Update validation status for all creation steps
  private updateCreationSteps(): void {
    // Step 1: V1.2 - Aircraft detected from SimVar (not selected)
    const hasAircraft = missionState.missionCurrentAircraft.get() !== null;

    // Step 2: Cargo validated
    const cargoOk = missionCreationState.cargoValidated.get();

    // V1.6: Step 1 requires BOTH aircraft detected AND cargo validated
    // This prevents showing "valid" state when aircraft is blocked by anti-cheat
    const step1Valid = hasAircraft && cargoOk;
    missionCreationState.creationStep1Valid.set(step1Valid);
    missionCreationState.creationStep2Valid.set(hasAircraft && cargoOk);

    // Step 3: Flight plan validated
    const flightPlanOk = missionCreationState.fpValidated.get();
    missionCreationState.creationStep3Valid.set(flightPlanOk);

    // Update error message and button state
    // Need aircraft + cargo + flight plan for mission creation
    const allValid = hasAircraft && cargoOk && flightPlanOk;
    missionCreationState.canCreateMissionFlag.set(allValid);

    if (!hasAircraft) {
      missionCreationState.creationErrorMsg.set(this.t("missions", "aircraftNotDetected"));
    } else if (!cargoOk) {
      missionCreationState.creationErrorMsg.set(this.t("missions", "validateCargo"));
    } else if (!flightPlanOk) {
      missionCreationState.creationErrorMsg.set(this.t("missions", "validateFlightPlanError"));
    } else {
      missionCreationState.creationErrorMsg.set("");
    }

    console.log("[CarrierPlus] updateCreationSteps:", { step1: step1Valid, step2: cargoOk, step3: flightPlanOk, canCreate: allValid });
  }

  // Read flight plan data from aircraft GPS SimVars
  // V2.2: Delegates to MissionCreationManager for SimVar reading
  private readFlightPlanFromGPS(): void {
    console.log("[CarrierPlus] Reading flight plan from aircraft GPS...");

    // Explore EFB internal data (for debugging)
    this.exploreEfbInternalData();

    // Delegate to manager - callbacks will update state
    missionCreationManager.readFlightPlanFromGPS();

    // Setup destination input listeners (must be done when input exists)
    setTimeout(() => {
      this.setupDestinationInput(this.fpDestinationInputRef.getOrDefault());
    }, 100);
  }

  // ============== EFB FlightPlanner Event Subscription ==============

  /**
   * Subscribe to FlightPlanner events from the EventBus
   * This allows us to intercept flight plans created in the EFB
   */
  private subscribeToFlightPlannerEvents(): void {
    console.log("[CarrierPlus] Setting up FlightPlanner event subscriptions...");

    try {
      const bus = this.props.bus;
      if (!bus) {
        console.log("[CarrierPlus] No EventBus available");
        return;
      }

      // Subscribe to flight plan created event
      const fplCreatedSub = bus.getSubscriber<any>().on("fplCreated").handle((event: any) => {
        console.log("[CarrierPlus] *** fplCreated event ***", event);
        this.onEfbFlightPlanCreated(event);
      });
      this.fplEventSubscriptions.push(fplCreatedSub);

      // Subscribe to flight plan loaded event
      const fplLoadedSub = bus.getSubscriber<any>().on("fplLoaded").handle((event: any) => {
        console.log("[CarrierPlus] *** fplLoaded event ***", event);
        this.onEfbFlightPlanLoaded(event);
      });
      this.fplEventSubscriptions.push(fplLoadedSub);

      // Subscribe to flight plan calculated event (after route computation)
      const fplCalculatedSub = bus.getSubscriber<any>().on("fplCalculated").handle((event: any) => {
        console.log("[CarrierPlus] *** fplCalculated event ***", event);
        this.onEfbFlightPlanCalculated(event);
      });
      this.fplEventSubscriptions.push(fplCalculatedSub);

      // Subscribe to origin/destination changes
      const fplOriginDestSub = bus.getSubscriber<any>().on("fplOriginDestChanged").handle((event: any) => {
        console.log("[CarrierPlus] *** fplOriginDestChanged event ***", event);
        this.onEfbFlightPlanOriginDestChanged(event);
      });
      this.fplEventSubscriptions.push(fplOriginDestSub);

      // Subscribe to leg changes
      const fplLegChangeSub = bus.getSubscriber<any>().on("fplLegChange").handle((event: any) => {
        console.log("[CarrierPlus] *** fplLegChange event ***", event);
      });
      this.fplEventSubscriptions.push(fplLegChangeSub);

      console.log("[CarrierPlus] FlightPlanner event subscriptions active");

    } catch (error) {
      console.error("[CarrierPlus] Error subscribing to FlightPlanner events:", error);
    }
  }

  /**
   * Unsubscribe from FlightPlanner events
   */
  private unsubscribeFromFlightPlannerEvents(): void {
    console.log("[CarrierPlus] Unsubscribing from FlightPlanner events...");
    for (const sub of this.fplEventSubscriptions) {
      try {
        sub.destroy();
      } catch (e) { /* ignore */ }
    }
    this.fplEventSubscriptions = [];
  }

  /**
   * Handle fplCreated event - a new flight plan was created in the EFB
   */
  private onEfbFlightPlanCreated(event: any): void {
    console.log("[CarrierPlus] EFB Flight Plan CREATED - Plan index:", event?.planIndex);
    popupState.popupNotification.set(this.t("missions", "efbFlightPlanCreated"));
    // Try to read the plan data via Coherent
    this.tryReadEfbFlightPlan();
  }

  /**
   * Handle fplLoaded event - a flight plan was loaded
   */
  private onEfbFlightPlanLoaded(event: any): void {
    console.log("[CarrierPlus] EFB Flight Plan LOADED - Plan index:", event?.planIndex);
    popupState.popupNotification.set(this.t("missions", "efbFlightPlanLoaded"));
    this.tryReadEfbFlightPlan();
  }

  /**
   * Handle fplCalculated event - flight plan path was computed
   */
  private onEfbFlightPlanCalculated(event: any): void {
    console.log("[CarrierPlus] EFB Flight Plan CALCULATED - Plan index:", event?.planIndex);
    // This is the best moment to read the flight plan - after calculation
    this.tryReadEfbFlightPlan();
  }

  /**
   * Handle fplOriginDestChanged event
   */
  private onEfbFlightPlanOriginDestChanged(event: any): void {
    console.log("[CarrierPlus] EFB Flight Plan origin/dest changed:", event);
    if (event?.airport) {
      const icao = event.airport?.icao || "";
      if (event.type === "OriginChanged" && icao) {
        console.log("[CarrierPlus] EFB Origin set to:", icao);
        missionCreationState.fpOriginIcao.set(icao);
      } else if (event.type === "DestinationChanged" && icao) {
        console.log("[CarrierPlus] EFB Destination set to:", icao);
        missionCreationState.fpDestinationInput.set(icao);
        const inputEl = this.fpDestinationInputRef.getOrDefault();
        if (inputEl) inputEl.value = icao;
      }
    }
  }

  /**
   * Explore EFB internal data - call this to debug what's available
   */
  private exploreEfbInternalData(): void {
    console.log("[CarrierPlus] ========== EXPLORING EFB INTERNAL DATA ==========");

    // 1. Check localStorage for EFB data
    console.log("[CarrierPlus] -- localStorage keys --");
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const value = localStorage.getItem(key);
          // Only log flight plan related keys or first 100 chars
          if (key.toLowerCase().includes("flight") || key.toLowerCase().includes("plan") || key.toLowerCase().includes("route") || key.toLowerCase().includes("efb")) {
            console.log(`  ${key}:`, value?.substring(0, 200));
          }
        }
      }
    } catch (e) { console.log("  localStorage not accessible"); }

    // 2. Check sessionStorage
    console.log("[CarrierPlus] -- sessionStorage keys --");
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key) {
          const value = sessionStorage.getItem(key);
          if (key.toLowerCase().includes("flight") || key.toLowerCase().includes("plan") || key.toLowerCase().includes("route") || key.toLowerCase().includes("efb")) {
            console.log(`  ${key}:`, value?.substring(0, 200));
          }
        }
      }
    } catch (e) { console.log("  sessionStorage not accessible"); }

    // 3. Try EFB-specific Coherent calls
    const efbCalls = [
      "EFB_GET_FLIGHTPLAN",
      "EFB_GET_ROUTE",
      "EFB_GET_CURRENT_ROUTE",
      "GET_EFB_FLIGHTPLAN",
      "GET_EFB_ROUTE",
      "FLIGHTPLANNER_GET_ROUTE",
      "FLIGHTPLANNER_GET_FLIGHTPLAN",
      "GET_PLANNER_ROUTE",
      "GET_PLANNED_ROUTE",
      "GET_ROUTE_DATA",
      "GET_FLIGHT_DATA",
      "NAV_GET_FLIGHTPLAN",
      "NAVIGATION_GET_ROUTE",
    ];

    console.log("[CarrierPlus] -- Trying EFB-specific Coherent calls --");
    for (const call of efbCalls) {
      Coherent.call(call).then((result: any) => {
        console.log(`  ${call} SUCCESS:`, result);
      }).catch(() => {
        // Silent fail - not available
      });
    }

    // 4. Try to access window objects that might contain EFB state
    console.log("[CarrierPlus] -- Checking window objects --");
    const windowAny = window as any;
    const objectsToCheck = ["efb", "EFB", "flightPlanner", "FlightPlanner", "navData", "NavData", "route", "Route", "flightPlan", "FlightPlan"];
    for (const obj of objectsToCheck) {
      if (windowAny[obj]) {
        console.log(`  window.${obj}:`, windowAny[obj]);
      }
    }

    // 5. Check Coherent engine bindings
    console.log("[CarrierPlus] -- Coherent engine info --");
    try {
      if (windowAny.engine) {
        console.log("  engine exists:", typeof windowAny.engine);
        if (windowAny.engine.mock !== undefined) console.log("  engine.mock:", windowAny.engine.mock);
      }
    } catch (e) { /* */ }

    // 6. Check IndexedDB for EFB databases
    console.log("[CarrierPlus] -- IndexedDB databases --");
    try {
      if (indexedDB && indexedDB.databases) {
        indexedDB.databases().then((dbs: any[]) => {
          console.log("  Available databases:", dbs);
          for (const db of dbs) {
            console.log(`    - ${db.name} (v${db.version})`);
            // Try to open and read flight plan data
            if (db.name && (db.name.toLowerCase().includes("efb") || db.name.toLowerCase().includes("flight") || db.name.toLowerCase().includes("nav"))) {
              this.exploreIndexedDB(db.name);
            }
          }
        }).catch((e: any) => console.log("  indexedDB.databases() failed:", e));
      }
    } catch (e) { console.log("  IndexedDB not accessible"); }

    // 7. Look for Vue/React state (EFB might use a framework)
    console.log("[CarrierPlus] -- Framework state --");
    try {
      // Vue devtools
      if (windowAny.__VUE_DEVTOOLS_GLOBAL_HOOK__) console.log("  Vue detected");
      if (windowAny.__REACT_DEVTOOLS_GLOBAL_HOOK__) console.log("  React detected");
      // Check for any store
      if (windowAny.__store__) console.log("  __store__:", windowAny.__store__);
      if (windowAny.$store) console.log("  $store:", windowAny.$store);
    } catch (e) { /* */ }

    console.log("[CarrierPlus] ========== END EXPLORATION ==========");
  }

  /**
   * Explore an IndexedDB database
   */
  private exploreIndexedDB(dbName: string): void {
    console.log(`[CarrierPlus] Exploring IndexedDB: ${dbName}`);
    try {
      const request = indexedDB.open(dbName);
      request.onsuccess = (event: any) => {
        const db = event.target.result;
        console.log(`  Stores in ${dbName}:`, Array.from(db.objectStoreNames));

        // Look for flight plan related stores
        for (const storeName of db.objectStoreNames) {
          if (storeName.toLowerCase().includes("flight") || storeName.toLowerCase().includes("route") || storeName.toLowerCase().includes("plan")) {
            console.log(`  Reading store: ${storeName}`);
            try {
              const tx = db.transaction(storeName, "readonly");
              const store = tx.objectStore(storeName);
              const getAllRequest = store.getAll();
              getAllRequest.onsuccess = () => {
                console.log(`    ${storeName} data:`, getAllRequest.result);
              };
            } catch (e) { /* */ }
          }
        }
        db.close();
      };
      request.onerror = () => console.log(`  Failed to open ${dbName}`);
    } catch (e) { /* */ }
  }

  /**
   * Try to read the EFB flight plan via Coherent API
   */
  private tryReadEfbFlightPlan(): void {
    console.log("[CarrierPlus] Attempting to read EFB flight plan via Coherent...");

    // First, explore what's available
    this.exploreEfbInternalData();

    try {
      // Method 1: GET_FLIGHTPLAN
      Coherent.call("GET_FLIGHTPLAN").then((fp: any) => {
        console.log("[CarrierPlus] GET_FLIGHTPLAN result:", fp);
        if (fp) {
          // Even if waypoints is empty, try to extract origin/dest from other fields
          this.processEfbFlightPlan(fp);
        }
      }).catch((e: any) => {
        console.log("[CarrierPlus] GET_FLIGHTPLAN failed:", e);
      });

      // Method 2: LOAD_CURRENT_ATC_FLIGHTPLAN + GET_FLIGHTPLAN
      Coherent.call("LOAD_CURRENT_ATC_FLIGHTPLAN").then(() => {
        return Coherent.call("GET_FLIGHTPLAN");
      }).then((fp: any) => {
        console.log("[CarrierPlus] ATC FLIGHTPLAN after load:", fp);
        if (fp) this.processEfbFlightPlan(fp);
      }).catch((e: any) => {
        console.log("[CarrierPlus] ATC FLIGHTPLAN failed:", e);
      });

      // Method 3: Try to get number of waypoints and iterate
      Coherent.call("GET_FLIGHTPLAN_WAYPOINT_COUNT").then((count: any) => {
        console.log("[CarrierPlus] WAYPOINT_COUNT:", count);
        if (typeof count === "number" && count > 0) {
          this.readWaypointsOneByOne(count);
        }
      }).catch(() => { /* not available */ });

      // Method 4: Try GET_CURRENT_FLIGHTPLAN
      Coherent.call("GET_CURRENT_FLIGHTPLAN").then((fp: any) => {
        console.log("[CarrierPlus] GET_CURRENT_FLIGHTPLAN:", fp);
        if (fp) this.processEfbFlightPlan(fp);
      }).catch(() => { /* not available */ });

      // Method 5: Try FLIGHTPLAN_GET_CURRENT
      Coherent.call("FLIGHTPLAN_GET_CURRENT").then((fp: any) => {
        console.log("[CarrierPlus] FLIGHTPLAN_GET_CURRENT:", fp);
        if (fp) this.processEfbFlightPlan(fp);
      }).catch(() => { /* not available */ });

      // Method 6: Try to get origin and destination directly
      Promise.all([
        Coherent.call("GET_FLIGHTPLAN_ORIGIN").catch(() => null),
        Coherent.call("GET_FLIGHTPLAN_DESTINATION").catch(() => null),
      ]).then(([origin, dest]: any[]) => {
        console.log("[CarrierPlus] Origin/Dest direct:", { origin, dest });
        if (origin?.icao) missionCreationState.fpOriginIcao.set(origin.icao);
        if (dest?.icao) {
          missionCreationState.fpDestinationInput.set(dest.icao);
        }
      });

    } catch (error) {
      console.error("[CarrierPlus] Error reading EFB flight plan:", error);
    }
  }

  /**
   * Try to read waypoints one by one
   */
  private readWaypointsOneByOne(count: number): void {
    console.log("[CarrierPlus] Reading", count, "waypoints one by one...");
    const waypoints: Array<{ ident: string; lat: number; lon: number; type: string }> = [];

    const promises = [];
    for (let i = 0; i < count; i++) {
      promises.push(
        Coherent.call("GET_FLIGHTPLAN_WAYPOINT", i).then((wp: any) => {
          console.log(`[CarrierPlus] Waypoint ${i}:`, wp);
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
      console.log("[CarrierPlus] All waypoints read:", waypoints.filter(w => w));
      const validWps = waypoints.filter(w => w);
      if (validWps.length > 0) {
        const origin = validWps[0]?.ident || "";
        const dest = validWps[validWps.length - 1]?.ident || "";
        if (/^[A-Z]{4}$/.test(origin)) missionCreationState.fpOriginIcao.set(origin);
        if (/^[A-Z]{4}$/.test(dest)) {
          missionCreationState.fpDestinationInput.set(dest);
        }
        popupState.popupNotification.set(`Plan EFB: ${origin} -> ${dest} (${validWps.length} WPs)`);
      }
    });
  }

  /**
   * Process the flight plan data retrieved from EFB
   */
  private processEfbFlightPlan(fp: any): void {
    console.log("[CarrierPlus] Processing EFB flight plan:", fp);
    console.log("[CarrierPlus] Waypoints count:", fp.waypoints?.length);

    const waypoints: Array<{ ident: string; lat: number; lon: number; type: string }> = [];
    let origin = "";
    let destination = "";
    let totalDistance = 0;

    // Try to extract from waypoints array first
    if (fp.waypoints && Array.isArray(fp.waypoints) && fp.waypoints.length > 0) {
      for (let i = 0; i < fp.waypoints.length; i++) {
        const wp = fp.waypoints[i];
        const ident = wp.ident || wp.icao || "";
        const lat = wp.lla?.lat || wp.lat || 0;
        const lon = wp.lla?.long || wp.lla?.lon || wp.lon || 0;
        const type = wp.waypointType || wp.type || "unknown";

        waypoints.push({ ident, lat, lon, type });

        // First waypoint with ICAO pattern is likely origin
        if (i === 0 && /^[A-Z]{4}$/.test(ident)) {
          origin = ident;
        }
        // Last waypoint with ICAO pattern is likely destination
        if (i === fp.waypoints.length - 1 && /^[A-Z]{4}$/.test(ident)) {
          destination = ident;
        }

        console.log(`  WP ${i}: ${ident} (${lat.toFixed(4)}, ${lon.toFixed(4)}) type=${type}`);
      }
    }

    // If waypoints empty, try to extract from other fields
    if (!origin) {
      // Try directToOrigin, originAirport, departure fields
      const originCandidates = [
        fp.directToOrigin?.icao,
        fp.directToOrigin?.ident,
        fp.originAirport?.icao,
        fp.originAirport?.ident,
        fp.departure?.icao,
        fp.departure?.ident,
        fp.origin?.icao,
        fp.origin?.ident,
      ];
      for (const c of originCandidates) {
        if (c && /^[A-Z]{4}$/.test(c)) {
          origin = c;
          console.log("[CarrierPlus] Found origin from alternate field:", origin);
          break;
        }
      }
    }

    if (!destination) {
      // Try directToTarget, destinationAirport, arrival fields
      const destCandidates = [
        fp.directToTarget?.icao,
        fp.directToTarget?.ident,
        fp.destinationAirport?.icao,
        fp.destinationAirport?.ident,
        fp.arrival?.icao,
        fp.arrival?.ident,
        fp.destination?.icao,
        fp.destination?.ident,
      ];
      for (const c of destCandidates) {
        if (c && /^[A-Z]{4}$/.test(c)) {
          destination = c;
          console.log("[CarrierPlus] Found destination from alternate field:", destination);
          break;
        }
      }
    }

    // Try to get distance
    totalDistance = fp.totalDistance || fp.distance || 0;

    // Update UI fields
    if (origin) {
      missionCreationState.fpOriginIcao.set(origin);
    }
    if (destination) {
      missionCreationState.fpDestinationInput.set(destination);
      const inputEl = this.fpDestinationInputRef.getOrDefault();
      if (inputEl) inputEl.value = destination;
    }
    if (waypoints.length > 0) {
      missionCreationState.fpWaypointCount.set(waypoints.length);
    }
    if (totalDistance > 0) {
      missionCreationState.fpTotalDistance.set(totalDistance);
    }

    popupState.popupNotification.set(`Plan EFB: ${origin} -> ${destination} (${waypoints.length} WPs)`);
    console.log("[CarrierPlus] EFB Flight plan processed:", { origin, destination, waypointCount: waypoints.length, totalDistance });
  }

  // Validate the flight plan with user-entered destination
  private validateFlightPlan(): void {
    // Get destination from DOM or Subject (event listener captures input)
    const inputEl = this.fpDestinationInputRef.getOrDefault();
    let destination = (inputEl?.value || "").toUpperCase().trim();

    // Fallback to Subject (set by event listener or auto-detection)
    if (!destination) {
      destination = missionCreationState.fpDestinationInput.get().toUpperCase().trim();
    }
    console.log("[CarrierPlus] Flight plan validation - destination:", destination);

    // Validate ICAO format (4 letters)
    if (!destination || !/^[A-Z]{4}$/.test(destination)) {
      popupState.popupNotification.set(this.t("missions", "enterValidIcao"));
      console.log("[CarrierPlus] Invalid ICAO format");
      return;
    }

    // Check if flight plan is valid:
    // - Either has 2+ waypoints (World Map plan)
    // - Or has active GPS plan (VFR cockpit plan - waypoints not exposed but GPS is active)
    const wpCount = missionCreationState.fpWaypointCount.get();
    const hasActivePlan = missionCreationState.fpHasActivePlan.get();
    console.log("[CarrierPlus] Waypoint count:", wpCount, "| GPS Active:", hasActivePlan);

    if (wpCount < 2 && !hasActivePlan) {
      popupState.popupNotification.set(this.t("missions", "readGpsFirst"));
      return;
    }

    // Validate
    console.log("[CarrierPlus] Validating flight plan OK!");
    missionCreationState.fpDestinationIcao.set(destination);
    missionCreationState.fpDestinationInput.set(destination);
    missionCreationState.fpValidated.set(true);

    const origin = missionCreationState.fpOriginIcao.get();
    const distance = missionCreationState.fpTotalDistance.get();

    popupState.popupNotification.set(`Plan valide: ${origin} → ${destination} (${distance} nm)`);
    this.updateCreationSteps();
  }

  // Modify flight plan (reset validation)
  private modifyFlightPlan(): void {
    missionCreationState.fpValidated.set(false);
    this.updateCreationSteps();
  }

  // Validate cargo (mark as applied)
  private validateCargoStep(): void {
    console.log("[CarrierPlus] validateCargoStep called");
    const cargoWeight = cargoState.aircraftCargoWeight.get();
    const fuelPercent = missionCreationState.fuelTargetPercent.get();
    console.log("[CarrierPlus] Cargo weight to apply:", cargoWeight, "kg, Fuel:", fuelPercent, "%");

    // Apply weight to aircraft payload stations
    void this.applyCargoToAircraft(cargoWeight);

    // Apply fuel to aircraft
    this.applyFuelToAircraft();

    missionCreationState.cargoValidated.set(true);
    popupState.popupNotification.set(`Cargo: ${cargoWeight.toFixed(0)} kg, Fuel: ${fuelPercent}%`);
    this.updateCreationSteps();
  }

  // Apply cargo weight to aircraft payload stations
  private async applyCargoToAircraft(cargoWeightKg: number): Promise<void> {
    try {
      // Get number of payload stations
      const stationCount = SimVar.GetSimVarValue("PAYLOAD STATION COUNT", "number") as number || 0;
      console.log("[CarrierPlus] Aircraft has", stationCount, "payload stations");

      // Log current weights of all stations
      console.log("[CarrierPlus] Current payload stations:");
      for (let i = 1; i <= stationCount; i++) {
        const weight = SimVar.GetSimVarValue(`PAYLOAD STATION WEIGHT:${i}`, "kilograms") as number || 0;
        const name = SimVar.GetSimVarValue(`PAYLOAD STATION NAME:${i}`, "string") as string || `Station ${i}`;
        console.log(`  Station ${i} (${name}): ${weight.toFixed(1)} kg`);
      }

      if (stationCount >= 1) {
        // Find cargo/baggage stations by name
        const cargoStations: number[] = [];

        // Keywords for cargo/baggage stations (from MSFS SDK documentation)
        const cargoKeywords = [
          "BAGGAGE",   // Common: "Aft Baggage", "Fwd Baggage"
          "CARGO",     // Common: "Cargo", "Cargo Pod", "Belly Cargo"
          "FREIGHT",   // Freight aircraft
          "LUGGAGE",   // Alternative to baggage
          "HOLD",      // Cargo hold: "Forward Hold", "Aft Hold"
          "POD",       // External cargo pod
          "BELLY",     // Belly cargo compartment
        ];

        for (let i = 1; i <= stationCount; i++) {
          const name = (SimVar.GetSimVarValue(`PAYLOAD STATION NAME:${i}`, "string") as string || "").toUpperCase();
          // Check if station name contains any cargo keyword
          const isCargo = cargoKeywords.some(keyword => name.includes(keyword));
          if (isCargo) {
            cargoStations.push(i);
            console.log(`[CarrierPlus] Found cargo station ${i}: ${name}`);
          }
        }

        // Fallback: if no cargo stations found, use the last station
        if (cargoStations.length === 0) {
          console.log("[CarrierPlus] No BAGGAGE/CARGO stations found, using last station");
          cargoStations.push(stationCount);
        }

        // ALWAYS reset all cargo stations to 0 first
        console.log("[CarrierPlus] Resetting cargo stations to 0...");
        for (const station of cargoStations) {
          await SimVar.SetSimVarValue(`PAYLOAD STATION WEIGHT:${station}`, "kilograms", 0);
          console.log(`[CarrierPlus] Reset station ${station} to 0 kg`);
        }

        // Small delay to ensure reset is applied
        await new Promise(resolve => setTimeout(resolve, 200));

        // Apply the new weight only if > 0
        if (cargoWeightKg > 0) {
          const weightPerStation = cargoWeightKg / cargoStations.length;
          console.log(`[CarrierPlus] Distributing ${cargoWeightKg} kg across cargo stations:`, cargoStations);

          for (const station of cargoStations) {
            await SimVar.SetSimVarValue(`PAYLOAD STATION WEIGHT:${station}`, "kilograms", weightPerStation);
            console.log(`[CarrierPlus] Set station ${station} = ${weightPerStation.toFixed(1)} kg`);
          }
        } else {
          console.log("[CarrierPlus] No cargo to apply (0 kg)");
        }

        // Note: Coherent triggers (PAYLOAD_STATION_VALUE_CHANGED) were tested but they
        // override/reset the SimVar values to 0. The SimVar approach works for aircraft
        // physics, but the MSFS EFB Weight & Balance UI won't visually update.
        // This is a known MSFS 2024 limitation - the weight IS applied to the aircraft.

        // Wait a bit then verify
        setTimeout(() => {
          console.log("[CarrierPlus] Verifying payload after apply:");
          for (let i = 1; i <= stationCount; i++) {
            const weight = SimVar.GetSimVarValue(`PAYLOAD STATION WEIGHT:${i}`, "kilograms") as number || 0;
            console.log(`  Station ${i}: ${weight.toFixed(1)} kg`);
          }
          const totalWeight = SimVar.GetSimVarValue("TOTAL WEIGHT", "kilograms") as number || 0;
          console.log("[CarrierPlus] Total aircraft weight:", totalWeight.toFixed(0), "kg");
        }, 500);
      }

    } catch (e) {
      console.error("[CarrierPlus] Error applying cargo weight:", e);
    }
  }

  // Modify cargo (reset validation)
  private modifyCargoStep(): void {
    console.log("[CarrierPlus] modifyCargoStep called");
    missionCreationState.cargoValidated.set(false);
    this.updateCreationSteps();
  }

  // V2.2: Read current fuel from SimVars
  private readCurrentFuel(): void {
    try {
      const fuelCapacityGal = SimVar.GetSimVarValue("FUEL TOTAL CAPACITY", "gallons") as number || 0;
      const fuelQuantityGal = SimVar.GetSimVarValue("FUEL TOTAL QUANTITY", "gallons") as number || 0;
      const fuelCapacityKg = fuelCapacityGal * 3.785 * 0.8; // gallons to kg (density ~0.8 kg/L)
      const fuelPercent = fuelCapacityGal > 0 ? Math.round((fuelQuantityGal / fuelCapacityGal) * 100) : 0;

      missionCreationState.fuelCapacityKg.set(Math.round(fuelCapacityKg));
      missionCreationState.fuelCurrentPercent.set(fuelPercent);
      missionCreationState.fuelTargetPercent.set(fuelPercent); // Initialize target to current

      console.log("[CarrierPlus] Fuel read:", fuelPercent, "% (", Math.round(fuelQuantityGal * 3.785 * 0.8), "kg /", Math.round(fuelCapacityKg), "kg)");
    } catch (e) {
      console.error("[CarrierPlus] Error reading fuel:", e);
    }
  }

  // V2.2: Apply fuel to aircraft
  private applyFuelToAircraft(): void {
    try {
      const targetPercent = missionCreationState.fuelTargetPercent.get();
      const fuelCapacityGal = SimVar.GetSimVarValue("FUEL TOTAL CAPACITY", "gallons") as number || 0;
      const targetQuantityGal = (targetPercent / 100) * fuelCapacityGal;

      // Set fuel quantity using the standard SimVar
      SimVar.SetSimVarValue("FUEL TOTAL QUANTITY", "gallons", targetQuantityGal);

      missionCreationState.fuelCurrentPercent.set(targetPercent);
      console.log("[CarrierPlus] Fuel set to:", targetPercent, "% (", Math.round(targetQuantityGal), "gallons)");
    } catch (e) {
      console.error("[CarrierPlus] Error setting fuel:", e);
    }
  }

  // Check if mission can be created
  private canCreateMission(): boolean {
    return missionCreationState.creationStep1Valid.get() &&
           missionCreationState.creationStep2Valid.get() &&
           missionCreationState.creationStep3Valid.get();
  }

  // Reset all creation steps
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
    // V1.1: Reset aircraft systems warnings
    missionState.missionAircraftSystems.set(null);
    this.updateCreationSteps();
  }

  // V1.1: Create mission with step-based data (uses flight plan destination instead of map selection)
  private async createMissionV11(): Promise<void> {
    // Check all steps are validated
    if (!this.canCreateMission()) {
      missionState.missionError.set(this.t("missions", "completeAllSteps"));
      return;
    }

    const token = authState.authToken.get();
    const origin = missionCreationState.fpOriginIcao.get() || missionState.missionOriginIcao.get();
    const destination = missionCreationState.fpDestinationIcao.get();
    const aircraftId = missionState.selectedAircraftId.get();
    const distance = missionCreationState.fpTotalDistance.get();
    const waypointCount = missionCreationState.fpWaypointCount.get();

    if (!token || !origin || !destination || !aircraftId) {
      missionState.missionError.set(this.t("missions", "missingMissionData"));
      return;
    }

    // V0.8 Spec: Validate aircraft model matches ATC_MODEL SimVar
    const selectedAircraft = this.availableAircraftList.find(a => a.id === aircraftId);
    if (selectedAircraft && selectedAircraft.aircraft_model) {
      try {
        const rawAtcModel = SimVar.GetSimVarValue("ATC MODEL", "string") as string;
        const extractedType = this.extractIcaoType(rawAtcModel);
        const expectedIcao = selectedAircraft.aircraft_model.toUpperCase();

        console.log("[CarrierPlus] ATC_MODEL check: raw=", rawAtcModel, "extracted=", extractedType, "expectedIcao=", expectedIcao);

        // Compare extracted ICAO type with icao_type from database (sent as aircraft_model)
        if (extractedType && expectedIcao && extractedType !== expectedIcao) {
          missionState.missionError.set(`${this.t("missions", "wrongAircraft")} ${extractedType}, ${this.t("missions", "notA")} ${expectedIcao}`);
          missionState.missionStatus.set("error");
          return;
        }
      } catch (e) {
        console.log("[CarrierPlus] Could not read ATC MODEL SimVar");
      }
    }

    console.log("[CarrierPlus] Creating V1.1 mission:", origin, "->", destination, `(${distance} nm, ${waypointCount} WPs)`);
    missionState.missionStatus.set("creating");
    missionState.missionError.set(null);

    try {
      // Get departure conditions for modifier validation
      const now = new Date();
      const departureLocalTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

      // Get weather data from SimVars
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
        console.log("[CarrierPlus] Departure weather:", departureWeather);
      } catch (e) {
        console.log("[CarrierPlus] Could not read weather SimVars");
      }

      // Get cargo weight and modifiers
      const cargoWeightKg = cargoState.aircraftCargoWeight.get();
      const modifiersSelected = missionState.selectedModifiers.get();

      console.log("[CarrierPlus] V1.1 Mission params:", {
        origin,
        destination,
        distance_nm: distance,
        waypoint_count: waypointCount,
        modifiers: modifiersSelected,
        cargo_weight_kg: cargoWeightKg,
        departure_local_time: departureLocalTime,
      });

      // P2P: Use MissionRouter for local mission creation
      const mission = await MissionRouter.createMission({
        aircraft_id: aircraftId,
        origin_icao: origin,
        destination_icao: destination,
        cargo_weight_kg: cargoWeightKg,
        distance_nm: distance,
        modifiers: modifiersSelected,
      });
      console.log("[CarrierPlus] V1.1 Mission created:", mission);

      if (!mission || !mission.id) {
        throw new Error("Invalid mission response from server");
      }

      // Store active mission
      missionState.activeMission.set({
        id: mission.id,
        origin_icao: mission.origin_icao,
        destination_icao: mission.destination_icao,
        aircraft_type: selectedAircraft?.aircraft_type || "",
        status: mission.status,
      });

      // V2.0: Store waypoint tracking data (no more backend checkpoints)
      missionState.waypointsTotal.set(mission.waypoints_total || waypointCount);
      missionState.waypointsPassed.set(0);
      missionState.missionDistanceNm.set(mission.distance_nm || distance);
      console.log("[CarrierPlus] V2.0: Mission created with", missionState.waypointsTotal.get(), "waypoints,", missionState.missionDistanceNm.get(), "nm");

      // Store XP estimate
      missionState.xpEstimate.set(mission.xp_estimate || null);

      missionState.missionStatus.set("success");
      popupState.popupNotification.set(`${this.t("missions", "missionCreatedSuccess")} ${origin} -> ${destination}`);

      // V1.6: Reset background tracking to prevent duplicate wear
      // (in case player was flying without mission before creating one)
      trackingManager.resetBackgroundTracking();

      // Write payload to SimVars and start flight tracking
      this.writePayloadToSimVars();
      this.startFlightTrackingV1();

      // Reset creation steps for next mission
      this.resetCreationSteps();

      // Navigate to missions > apercu to show the active mission
      navigationState.activeTab.set("missions");
      navigationState.missionsSubTab.set("apercu");

    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : this.t("missions", "errorCreatingMission");
      console.error("[CarrierPlus] Error creating V1.1 mission:", error);
      missionState.missionError.set(errMsg);
      missionState.missionStatus.set("error");
    }
  }

  private async fetchActiveMission(): Promise<void> {
    const token = authState.authToken.get();
    // P2P mode doesn't require token
    if (!authState.isP2PMode.get() && !token) return;

    try {
      // V1.9: Use missionService with ActiveMissionResponse type
      const mission = await MissionRouter.getActiveMission();
      console.log("[CarrierPlus] Active mission:", mission);

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

      // V1.0: Load checkpoints for active mission
      const checkpoints = mission.checkpoints || [];
      missionState.missionCheckpoints.set(checkpoints);
      missionState.checkpointsTotal.set(mission.checkpoints_total || checkpoints.length || 0);

      // Count already validated checkpoints
      const validatedCount = checkpoints.filter(cp => cp.validated).length;
      missionState.checkpointsValidated.set(validatedCount);

      // Find next checkpoint sequence
      const nextCp = checkpoints.find(cp => !cp.validated);
      missionState.nextCheckpoint.set(nextCp ? nextCp.sequence : validatedCount + 1);

      console.log("[CarrierPlus] Active mission checkpoints loaded:", checkpoints.length, "validated:", validatedCount);

      // V2.2: Restore cargo weight from mission data
      if (mission.cargo_weight_kg !== undefined) {
        cargoState.aircraftCargoWeight.set(mission.cargo_weight_kg);
        console.log("[CarrierPlus] Restored cargo weight from mission:", mission.cargo_weight_kg, "kg");
      }

      // V2.0: Restore waypoints and distance from mission
      if (mission.waypoints_total !== undefined) {
        missionState.waypointsTotal.set(mission.waypoints_total);
      }
      if (mission.distance_nm !== undefined) {
        missionState.missionDistanceNm.set(mission.distance_nm);
      }

      // Start flight tracking if we have an active mission
      if (mission.status === "in_progress" || mission.status === "created") {
        this.startFlightTrackingV1();
      }
    } catch (error) {
      console.error("[CarrierPlus] Error fetching active mission:", error);
    }
  }

  private async cancelMission(): Promise<void> {
    const token = authState.authToken.get();
    const mission = missionState.activeMission.get();
    // P2P mode doesn't require token
    if (!mission || (!authState.isP2PMode.get() && !token)) return;

    console.log("[CarrierPlus] Cancelling mission:", mission.id);
    missionState.missionStatus.set("loading");

    // V1.6: Get current position to update aircraft location on cancel
    const currentAirport = simVarState.closestAirport.get();
    const currentLat = SimVar.GetSimVarValue("PLANE LATITUDE", "degrees");
    const currentLon = SimVar.GetSimVarValue("PLANE LONGITUDE", "degrees");
    const currentAlt = SimVar.GetSimVarValue("PLANE ALTITUDE", "feet");

    const cancelPayload: Record<string, unknown> = { reason: "cancelled" };

    // V1.6: Include position data if available
    if (currentLat && currentLon) {
      cancelPayload.final_latitude = currentLat;
      cancelPayload.final_longitude = currentLon;
      cancelPayload.final_altitude_ft = currentAlt;
    }

    // V1.6: Include airport ICAO if valid
    if (currentAirport && currentAirport !== "----" && currentAirport.length >= 3) {
      cancelPayload.final_icao = currentAirport.toUpperCase();
      console.log("[CarrierPlus] V1.6: Cancelling mission with position update to:", currentAirport);
    }

    try {
      await MissionRouter.failMission(mission.id);
      console.log("[CarrierPlus] Mission cancelled");
      missionState.activeMission.set(null);
      // V1.6: Reset background tracking to prevent any leftover data
      trackingManager.resetBackgroundTracking();
      missionState.missionStatus.set("idle");
      missionState.missionError.set(null);
      // V1.2: Reload current aircraft info
      void this.loadCurrentAircraftForMission();
    } catch (error) {
      console.error("[CarrierPlus] Error cancelling mission:", error);
      missionState.missionError.set(this.t("missions", "errorCancellingMission"));
      missionState.missionStatus.set("error");
    }
  }

  // V2.2: Fetch destination coordinates for accurate progress calculation
  private async fetchDestinationCoordinates(icao: string): Promise<void> {
    try {
      console.log("[CarrierPlus] V2.2: Fetching destination coordinates for:", icao);
      // V1.9: Use worldService for airport lookup
      const airport = await WorldRouter.getAirportByIcao(icao);
      if (airport) {
        this.destLat = airport.latitude_deg || 0;
        this.destLon = airport.longitude_deg || 0;
        console.log("[CarrierPlus] V2.2: Destination coordinates:", this.destLat, this.destLon, "for", icao);
      } else {
        console.warn("[CarrierPlus] V2.2: No airport found for ICAO:", icao);
      }
    } catch (error) {
      console.error("[CarrierPlus] Error fetching destination coordinates:", error);
    }
  }

  // V0.8 Cargo Management Methods
  private async fetchAirportInventoryForCargo(icao: string): Promise<void> {
    const token = authState.authToken.get();
    // P2P mode doesn't require token
    if (!authState.isP2PMode.get() && !token) return;

    console.log("[CarrierPlus] Fetching airport inventory for cargo:", icao);
    cargoState.cargoLoading.set(true);

    try {
      // V1.9: Use MarketRouter.getAirportInventoryRaw for containers structure
      const data = await MarketRouter.getAirportInventoryRaw(icao);
      console.log("[CarrierPlus] Airport inventory:", data);

      // Flatten all items from all containers (hangars, warehouses) at this airport
      this.airportInventory = [];
      if (data.containers) {
        for (const container of data.containers) {
          // Skip aircraft containers
          if (container.type === "aircraft") continue;

          for (const item of container.items || []) {
            // Check if item already exists in our list
            const existing = this.airportInventory.find(
              i => i.item_id === item.item_id && i.location_id === container.id
            );
            if (existing) {
              existing.quantity += item.qty;
            } else {
              this.airportInventory.push({
                item_id: item.item_id,
                item_name: item.item_name,
                quantity: item.qty,
                weight_kg: parseFloat(String(item.weight_kg)) || 0,
                location_id: container.id,
                location_name: container.name || container.type,
              });
            }
          }
        }
      }

      this.renderCargoUI();
    } catch (error) {
      console.error("[CarrierPlus] Error fetching airport inventory:", error);
    } finally {
      cargoState.cargoLoading.set(false);
    }
  }

  private async fetchAircraftCargo(aircraftId: string): Promise<void> {
    const token = authState.authToken.get();
    // P2P mode doesn't require token
    if (!authState.isP2PMode.get() && !token) return;

    console.log("[CarrierPlus] Fetching aircraft cargo:", aircraftId);

    try {
      // V1.9: Use FleetRouter.getAircraftCargoRaw for raw API response
      const data = await FleetRouter.getAircraftCargoRaw(aircraftId);
      console.log("[CarrierPlus] Aircraft cargo:", data);

      this.aircraftCargo = (data.items || []).map(item => ({
        item_id: item.item_id,
        item_name: item.item_name,
        qty: item.qty,
        weight_kg: parseFloat(String(item.weight_kg)) || 0,
        total_weight_kg: parseFloat(String(item.total_weight_kg)) || 0,
      }));

      cargoState.aircraftCargoWeight.set(data.current_cargo_kg || 0);
      cargoState.aircraftCargoCapacity.set(data.cargo_capacity_kg || 0);

      this.renderCargoUI();
    } catch (error) {
      console.error("[CarrierPlus] Error fetching aircraft cargo:", error);
    }
  }

  private async loadCargoItem(fromLocationId: string, itemId: string, qty: number): Promise<void> {
    const token = authState.authToken.get();
    const aircraftId = missionState.selectedAircraftId.get();
    if (!token || !aircraftId) return;

    // Safety check: must be on ground and not moving
    const onGround = SimVar.GetSimVarValue("SIM ON GROUND", "boolean") as boolean;
    const groundSpeed = SimVar.GetSimVarValue("GROUND VELOCITY", "knots") as number || 0;

    if (!onGround || groundSpeed > 1) {
      missionState.missionError.set(this.t("missions", "loadingNotPossible"));
      return;
    }

    console.log("[CarrierPlus] Loading cargo:", { fromLocationId, itemId, qty });
    cargoState.cargoLoading.set(true);

    try {
      // V1.9: Use fleetService for cargo loading
      await FleetRouter.loadCargo(aircraftId, fromLocationId, itemId, qty);
      console.log("[CarrierPlus] Cargo loaded");
      const origin = missionState.missionOriginIcao.get();
      if (origin) {
        await this.fetchAirportInventoryForCargo(origin);
      }
      await this.fetchAircraftCargo(aircraftId);
    } catch (error) {
      console.error("[CarrierPlus] Error loading cargo:", error);
      missionState.missionError.set(error instanceof Error ? error.message : this.t("missions", "errorLoadingCargo"));
      setTimeout(() => { missionState.missionError.set(null); }, 5000);
    } finally {
      cargoState.cargoLoading.set(false);
    }
  }

  private async unloadCargoItem(toLocationId: string, itemId: string, qty: number): Promise<void> {
    const token = authState.authToken.get();
    const aircraftId = missionState.selectedAircraftId.get();
    if (!token || !aircraftId) return;

    // Safety check: must be on ground and not moving
    const onGround = SimVar.GetSimVarValue("SIM ON GROUND", "boolean") as boolean;
    const groundSpeed = SimVar.GetSimVarValue("GROUND VELOCITY", "knots") as number || 0;

    if (!onGround || groundSpeed > 1) {
      missionState.missionError.set(this.t("missions", "unloadingNotPossible"));
      return;
    }

    console.log("[CarrierPlus] Unloading cargo:", { toLocationId, itemId, qty });
    cargoState.cargoLoading.set(true);

    try {
      // V1.9: Use fleetService for cargo unloading
      await FleetRouter.unloadCargo(aircraftId, toLocationId, itemId, qty);
      console.log("[CarrierPlus] Cargo unloaded");
      const origin = missionState.missionOriginIcao.get();
      if (origin) {
        await this.fetchAirportInventoryForCargo(origin);
      }
      await this.fetchAircraftCargo(aircraftId);
    } catch (error) {
      console.error("[CarrierPlus] Error unloading cargo:", error);
    } finally {
      cargoState.cargoLoading.set(false);
    }
  }

  private renderCargoUI(): void {
    // Render airport inventory (left panel) using helper
    const airportEl = this.airportInventoryRef.getOrDefault();
    if (airportEl) {
      airportEl.innerHTML = renderAirportInventoryHtml(
        this.airportInventory as AirportInventoryItem[],
        this.t("missions", "noItemAvailable")
      );

      // Add click handlers for load buttons
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

    // Render aircraft cargo (right panel) using helper
    const cargoEl = this.aircraftCargoRef.getOrDefault();
    if (cargoEl) {
      cargoEl.innerHTML = renderAircraftCargoHtml(
        this.aircraftCargo as AircraftCargoItem[],
        "Soute vide"
      );

      // Add click handlers for unload buttons
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
  }

  private openCargoPopup(
    direction: "load" | "unload",
    itemId: string,
    itemName: string,
    maxQty: number,
    weightKg: number,
    locationId: string
  ): void {
    // Check if on ground and not moving
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

    cargoState.cargoPopupDirection.set(direction);
    cargoState.cargoPopupItem.set({
      item_id: itemId,
      item_name: itemName,
      max_qty: maxQty,
      weight_kg: weightKg,
      location_id: locationId,
    });
    cargoState.cargoPopupQty.set(1);
    cargoState.showCargoPopup.set(true);

    // Update slider and display after popup is shown
    setTimeout(() => {
      this.updateCargoPopupSlider();
    }, 50);
  }

  private closeCargoPopup(): void {
    cargoState.showCargoPopup.set(false);
    cargoState.cargoPopupItem.set(null);
  }

  private updateCargoPopupSlider(): void {
    const slider = this.cargoPopupSliderRef.getOrDefault();
    const qtyDisplay = this.cargoPopupQtyRef.getOrDefault();
    const item = cargoState.cargoPopupItem.get();

    if (slider && item) {
      slider.max = String(item.max_qty);
      slider.value = String(cargoState.cargoPopupQty.get());

      slider.oninput = () => {
        const val = parseInt(slider.value, 10);
        cargoState.cargoPopupQty.set(val);
        if (qtyDisplay) {
          const totalWeight = (val * item.weight_kg).toFixed(1);
          qtyDisplay.textContent = `${val} (${totalWeight}kg)`;
        }
      };
    }

    if (qtyDisplay && item) {
      const val = cargoState.cargoPopupQty.get();
      const totalWeight = (val * item.weight_kg).toFixed(1);
      qtyDisplay.textContent = `${val} (${totalWeight}kg)`;
    }
  }

  private async confirmCargoTransfer(): Promise<void> {
    const item = cargoState.cargoPopupItem.get();
    const qty = cargoState.cargoPopupQty.get();
    const direction = cargoState.cargoPopupDirection.get();

    if (!item || qty < 1) {
      this.closeCargoPopup();
      return;
    }

    this.closeCargoPopup();

    if (direction === "load") {
      await this.loadCargoItem(item.location_id, item.item_id, qty);
    } else {
      await this.unloadCargoItem(item.location_id, item.item_id, qty);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // V0.8 FLIGHT TRACKING & PAYLOAD VERIFICATION
  // ═══════════════════════════════════════════════════════════

  // V2.2: Delegates to MissionCreationManager for payload handling
  private writePayloadToSimVars(): void {
    const cargoWeightKg = cargoState.aircraftCargoWeight.get();
    // Manager writes to SimVars and calls onPayloadWritten callback to update state
    missionCreationManager.writePayloadToSimVars(cargoWeightKg);
  }

  // V2.2: Delegates to MissionCreationManager for payload reading
  private getTotalPayload(): number {
    return missionCreationManager.getTotalPayload();
  }

  // =====================================================
  // V2.2: HANGAR TAB FUNCTIONS
  // =====================================================

  private async fetchHangarAircraftList(): Promise<void> {
    // P2P mode - always use local database
    hangarState.hangarLoading.set(true);
    try {
      // V2.3: Use fleetService to get ALL aircraft (personal + company)
      const data = await FleetRouter.getFleet();
      console.log("[CarrierPlus] Hangar fleet list:", data);
      hangarState.hangarAircraftList.set(Array.isArray(data) ? data : []);
      this.renderHangarList();
    } catch (error) {
      console.error("[CarrierPlus] Error fetching hangar aircraft:", error);
      hangarState.hangarAircraftList.set([]);
      this.renderHangarList();
    } finally {
      hangarState.hangarLoading.set(false);
    }
  }

  private async fetchAircraftDetails(aircraftId: string): Promise<void> {
    // P2P mode - always use local database
    hangarState.hangarLoading.set(true);
    try {
      // V1.9: Use FleetRouter.getAircraftDetailsRaw for raw API response
      const apiData = await FleetRouter.getAircraftDetailsRaw(aircraftId);
      console.log("[CarrierPlus] Aircraft details from API:", apiData);

      // V1.2: Use API data for fuel (persisted from last flight)
      // SimVars are only for the currently loaded aircraft in the sim
      const fuelGallons = apiData.fuel_gallons || 0;
      const fuelCapacityGallons = apiData.fuel_capacity_gallons || 50;

      // Build aircraft details from API data
      const data: AircraftDetails = {
        id: apiData.id,
        registration: apiData.registration,
        aircraft_type: apiData.aircraft_type,
        aircraft_model: apiData.icao_type || apiData.aircraft_type,
        icao_type: apiData.icao_type || null,
        current_airport_ident: apiData.current_airport_ident,
        status: apiData.status,
        required_license: "PPL", // Default, could come from catalog
        owner_type: apiData.owner_type || "company",
        // V1.2: Fuel from API (persisted)
        fuel_gallons: fuelGallons,
        fuel_capacity_gallons: fuelCapacityGallons,
        // Cargo from API (V1.4: now fetched from /details endpoint)
        cargo_kg: apiData.current_cargo_kg || 0,
        cargo_capacity_kg: apiData.cargo_capacity_kg || 500,
        // Passengers (not tracked yet)
        passengers: 0,
        passenger_capacity: 4,
        // V2.3: Condition and hours
        condition: apiData.condition || 1.0,
        hours: apiData.hours || 0,
        // Systems status (will be populated by fetchAircraftSystems)
        landing_gear: "OK",
        engine_status: "OK",
        propeller_status: "OK",
        electrical_status: "OK",
        pitot_status: "OK",
        avionics_status: "OK",
      };

      console.log("[CarrierPlus] Aircraft details merged:", data);

      hangarState.hangarSelectedAircraft.set(data);

      // V1.4: Anti-cheat - If this is the current aircraft in sim, apply DB fuel
      const currentSimReg = simVarState.currentSimAircraftReg.get();
      if (data.registration && currentSimReg &&
          data.registration.toUpperCase() === currentSimReg.toUpperCase()) {
        const simFuelCapacity = SimVar.GetSimVarValue("FUEL TOTAL CAPACITY", "gallons") as number || 0;
        const simFuelCurrent = SimVar.GetSimVarValue("FUEL TOTAL QUANTITY", "gallons") as number || 0;

        // Check for cheat attempt
        if (simFuelCurrent > fuelGallons + 1) {
          console.warn(`[CarrierPlus] ANTI-CHEAT Hangar: Sim fuel (${simFuelCurrent.toFixed(1)}) > DB fuel (${fuelGallons.toFixed(1)}). Resetting.`);
        }

        // Always apply DB fuel to simulator
        if (simFuelCapacity > 0) {
          console.log(`[CarrierPlus] Hangar: Applying DB fuel to simulator: ${fuelGallons} gal`);
          setSimulatorFuel(fuelGallons, simFuelCapacity);
        }
      }

      // Re-render list to update selection highlight
      this.renderHangarList();
      // V1.1: Fetch aircraft systems data
      void this.fetchAircraftSystems(aircraftId);
      // V1.4: Fetch aircraft cargo items
      void this.fetchHangarCargo(aircraftId);
    } catch (error) {
      console.error("[CarrierPlus] Error fetching aircraft details:", error);
      hangarState.hangarSelectedAircraft.set(null);
    } finally {
      hangarState.hangarLoading.set(false);
    }
  }

  /**
   * V1.1: Fetch aircraft systems condition from API
   */
  private async fetchAircraftSystems(aircraftId: string): Promise<void> {
    const token = authState.authToken.get();
    // P2P mode doesn't require token
    if (!authState.isP2PMode.get() && !token) return;

    try {
      // V1.9: Use fleetService for aircraft systems
      const data = await FleetRouter.getAircraftSystems(aircraftId);
      console.log("[CarrierPlus] Aircraft systems:", data);
      hangarState.hangarSystems.set(data);
      this.renderHangarSystems();
      this.renderHangarList();
    } catch (error) {
      console.error("[CarrierPlus] Error fetching aircraft systems:", error);
      hangarState.hangarSystems.set(null);
    }
  }

  /**
   * V1.4: Fetch aircraft cargo items for hangar display
   */
  private async fetchHangarCargo(aircraftId: string): Promise<void> {
    const token = authState.authToken.get();
    // P2P mode doesn't require token
    if (!authState.isP2PMode.get() && !token) return;

    try {
      // V1.9: Use fleetService for aircraft cargo
      const data = await FleetRouter.getAircraftCargo(aircraftId);
      console.log("[CarrierPlus] Aircraft cargo:", data);
      hangarState.hangarCargoItems.set(data || []);
      this.renderHangarCargo();
    } catch (error) {
      console.error("[CarrierPlus] Error fetching aircraft cargo:", error);
      hangarState.hangarCargoItems.set([]);
    }
  }

  /**
   * V1.4: Render cargo items list in hangar (using helper)
   */
  private renderHangarCargo(): void {
    const container = this.hangarCargoListRef.getOrDefault();
    if (!container) return;

    const items = hangarState.hangarCargoItems.get() as HangarCargoItem[];
    const lang = settingsState.currentLanguage.get();
    const emptyMessage = lang === "fr" ? "Soute vide" : "Cargo hold empty";

    container.innerHTML = renderHangarCargoHtml(items, emptyMessage);
  }

  /**
   * V1.1: Fetch aircraft systems for mission creation warnings
   */
  private async fetchMissionAircraftSystems(aircraftId: string): Promise<void> {
    const token = authState.authToken.get();
    // P2P mode doesn't require token
    if (!authState.isP2PMode.get() && !token) return;

    try {
      const data = await FleetRouter.getAircraftSystems(aircraftId);
      missionState.missionAircraftSystems.set({
        warnings: data.warnings || [],
        critical: data.critical || [],
        can_takeoff: data.can_takeoff ?? true,
      });
    } catch (error) {
      console.error("[CarrierPlus] Error fetching mission aircraft systems:", error);
      missionState.missionAircraftSystems.set(null);
    }
  }

  /**
   * V1.2: Load current aircraft info for mission creation
   * V1.3: Auto-match by aircraft type + airport if registration doesn't match
   * Called automatically when step 1 is displayed
   */
  private async loadCurrentAircraftForMission(): Promise<void> {
    const token = authState.authToken.get();
    // P2P mode doesn't require token
    if (!authState.isP2PMode.get() && !token) {
      console.log("[CarrierPlus] Not logged in, cannot load aircraft");
      return;
    }

    console.log("[CarrierPlus] Loading current aircraft for mission...");
    missionState.missionAircraftLoading.set(true);
    missionState.missionAircraftNotFound.set(false);
    this.renderMissionAircraftInfo();

    try {
      // Step 1: Read SimVars for matching - V3.1: Only use ICAO type, not registration
      const rawAtcModel = SimVar.GetSimVarValue("ATC MODEL", "string") as string;
      const simIcaoType = this.extractIcaoType(rawAtcModel);
      const currentAirport = missionState.missionOriginIcao.get();

      console.log("[CarrierPlus] SimVars - Type:", simIcaoType, "Airport:", currentAirport);

      // Step 2: Fetch all fleet
      const fleetData = await FleetRouter.getFleet() as Array<{
        id: string;
        registration: string | null;
        icao_type: string | null;
        current_airport_ident: string | null;
      }>;

      // Step 3: V3.1 Simplified matching - Only by ICAO type + airport (no registration)
      let matchingAircraft = null;

      // 3a: Try type + airport match (most reliable)
      if (simIcaoType && currentAirport) {
        matchingAircraft = fleetData.find(
          ac => ac.icao_type?.toUpperCase() === simIcaoType.toUpperCase() &&
                ac.current_airport_ident?.toUpperCase() === currentAirport.toUpperCase()
        );
        if (matchingAircraft) {
          console.log("[CarrierPlus] Matched by type+airport:", matchingAircraft.registration, "(", simIcaoType, "@", currentAirport, ")");
        }
      }

      // 3b: If no match, try type only - find any aircraft of this type
      if (!matchingAircraft && simIcaoType) {
        const sameTypeAircraft = fleetData.filter(
          ac => ac.icao_type?.toUpperCase() === simIcaoType.toUpperCase()
        );

        if (sameTypeAircraft.length >= 1) {
          // Take the first aircraft of this type
          matchingAircraft = sameTypeAircraft[0];
          console.log("[CarrierPlus] Matched by type only:", matchingAircraft.registration, "(", simIcaoType, ")");
        }
      }

      if (!matchingAircraft) {
        console.log("[CarrierPlus] No matching aircraft found - Type:", simIcaoType, "Airport:", currentAirport);
        missionState.missionAircraftNotFound.set(true);
        missionState.missionCurrentAircraft.set(null);
        missionState.missionAircraftLoading.set(false);
        this.renderMissionAircraftInfo();
        return;
      }

      // Step 2: Fetch full details for this aircraft
      const apiData = await FleetRouter.getAircraft(matchingAircraft.id);
      console.log("[CarrierPlus] Current aircraft details:", apiData);

      // V1.6: ANTI-CHEAT - Verify aircraft location matches detected airport
      const dbAirport = apiData.current_airport_ident?.toUpperCase();
      const apiDetectedAirport = currentAirport?.toUpperCase(); // From /api/world/airports/closest
      const simVarAirport = simVarState.closestAirport.get()?.toUpperCase(); // From SimVar GPS CLOSEST AIRPORT ID

      // Use SimVar if valid, otherwise fall back to API
      const simVarValid = simVarAirport && simVarAirport !== "----" && simVarAirport.length >= 3;
      const apiValid = apiDetectedAirport && apiDetectedAirport !== "----" && apiDetectedAirport.length >= 3;

      console.log(`[CarrierPlus] ANTI-CHEAT: DB=${dbAirport}, SimVar=${simVarAirport} (valid=${simVarValid}), API=${apiDetectedAirport} (valid=${apiValid})`);

      // Check: At least one detected airport must match aircraft's DB location
      // Allow if EITHER SimVar OR API matches the DB airport
      const simVarMatches = simVarValid && simVarAirport === dbAirport;
      const apiMatches = apiValid && apiDetectedAirport === dbAirport;

      // V1.6: Only BLOCK if we have positive confirmation of mismatch
      // - If SimVar is valid and doesn't match AND API is valid and doesn't match → Block
      // - If SimVar is not valid ("----") → Give benefit of the doubt, allow (API might be wrong)
      // - If no detection at all → Allow (can't verify, trust user)
      if (dbAirport && !simVarMatches && !apiMatches && simVarValid) {
        // SimVar is working but doesn't match - this is a confirmed mismatch
        console.warn(`[CarrierPlus] ANTI-CHEAT: Confirmed mismatch! DB=${dbAirport}, SimVar=${simVarAirport}`);
        missionState.missionAircraftNotFound.set(true);
        missionState.missionCurrentAircraft.set(null);
        missionState.missionAircraftLoading.set(false);
        this.updateCreationSteps();
        const errorMsg = this.t("missions", "aircraftWrongAirport").replace("{db}", dbAirport).replace("{detected}", simVarAirport);
        missionState.missionError.set(errorMsg);
        missionCreationState.creationErrorMsg.set(errorMsg);
        this.renderMissionAircraftInfo();
        return;
      }

      // If we get here: either matched, or SimVar not working (benefit of the doubt)
      if (simVarMatches) {
        console.log(`[CarrierPlus] ANTI-CHEAT: Location verified via SimVar - Aircraft at ${dbAirport}`);
      } else if (apiMatches) {
        console.log(`[CarrierPlus] ANTI-CHEAT: Location verified via API - Aircraft at ${dbAirport}`);
      } else if (!simVarValid) {
        console.warn(`[CarrierPlus] ANTI-CHEAT: SimVar not working, trusting DB location: ${dbAirport}`);
      } else {
        console.log(`[CarrierPlus] ANTI-CHEAT: No DB airport set, allowing`);
      }

      // Step 3: Fetch systems data
      let systemsData = { warnings: [] as string[], critical: [] as string[], can_takeoff: true };
      try {
        systemsData = await FleetRouter.getAircraftSystems(matchingAircraft.id);
      } catch (e) {
        console.log("[CarrierPlus] Could not fetch systems data");
      }

      // Build aircraft info - V3.1: Use DB registration only (no sim registration fallback)
      const aircraftInfo = {
        id: apiData.id,
        registration: apiData.registration || "N/A",
        aircraft_type: apiData.aircraft_type,
        icao_type: apiData.icao_type || null,
        cargo_capacity_kg: apiData.cargo_capacity_kg || 500,
        passenger_capacity: 4, // Default
        fuel_gallons: apiData.fuel_gallons || 0,
        fuel_capacity_gallons: apiData.fuel_capacity_gallons || 50,
        condition: apiData.condition || 1.0,
        hours: apiData.hours || 0,
        status: apiData.status || "parked",
        current_airport_ident: apiData.current_airport_ident,
        owner_type: apiData.owner_type || "player",
        // Systems - derive from warnings/critical
        engine_status: systemsData.critical.includes("engine") ? "CRIT" : systemsData.warnings.includes("engine") ? "WARN" : "OK",
        landing_gear: systemsData.critical.includes("landing_gear") ? "CRIT" : systemsData.warnings.includes("landing_gear") ? "WARN" : "OK",
        propeller_status: systemsData.critical.includes("propeller") ? "CRIT" : systemsData.warnings.includes("propeller") ? "WARN" : "OK",
        electrical_status: systemsData.critical.includes("electrical") ? "CRIT" : systemsData.warnings.includes("electrical") ? "WARN" : "OK",
        pitot_status: systemsData.critical.includes("pitot") ? "CRIT" : systemsData.warnings.includes("pitot") ? "WARN" : "OK",
        avionics_status: systemsData.critical.includes("avionics") ? "CRIT" : systemsData.warnings.includes("avionics") ? "WARN" : "OK",
      };

      missionState.missionCurrentAircraft.set(aircraftInfo);
      missionState.missionAircraftNotFound.set(false);

      // V1.4: Anti-cheat - ALWAYS apply DB fuel to simulator
      // This prevents cheating via MFS fuel panel
      const simFuelCapacity = SimVar.GetSimVarValue("FUEL TOTAL CAPACITY", "gallons") as number || aircraftInfo.fuel_capacity_gallons;
      const simFuelCurrent = SimVar.GetSimVarValue("FUEL TOTAL QUANTITY", "gallons") as number || 0;

      if (simFuelCapacity > 0) {
        // Check for cheat attempt (sim fuel higher than DB fuel)
        if (simFuelCurrent > aircraftInfo.fuel_gallons + 1) {
          console.warn(`[CarrierPlus] ANTI-CHEAT: Sim fuel (${simFuelCurrent.toFixed(1)}) > DB fuel (${aircraftInfo.fuel_gallons.toFixed(1)}). Resetting to DB value.`);
        }

        // Always apply DB fuel to simulator (source of truth)
        console.log(`[CarrierPlus] Applying DB fuel to simulator: ${aircraftInfo.fuel_gallons} gal`);
        setSimulatorFuel(aircraftInfo.fuel_gallons, simFuelCapacity);
      }

      // Also set selectedAircraftId for mission creation compatibility
      missionState.selectedAircraftId.set(aircraftInfo.id);
      cargoState.aircraftCargoCapacity.set(aircraftInfo.cargo_capacity_kg);

      // Set systems data for warnings display
      missionState.missionAircraftSystems.set({
        warnings: systemsData.warnings,
        critical: systemsData.critical,
        can_takeoff: systemsData.can_takeoff,
      });

      // Fetch cargo data for the aircraft
      void this.fetchAircraftCargo(aircraftInfo.id);
      const origin = missionState.missionOriginIcao.get();
      if (origin) {
        void this.fetchAirportInventoryForCargo(origin);
      }

      // Update creation steps
      this.updateCreationSteps();

    } catch (error) {
      console.error("[CarrierPlus] Error loading current aircraft:", error);
      missionState.missionAircraftNotFound.set(true);
      missionState.missionCurrentAircraft.set(null);
    } finally {
      missionState.missionAircraftLoading.set(false);
      this.renderMissionAircraftInfo();
    }
  }

  /**
   * V1.2: Render mission aircraft info card using helper
   */
  private renderMissionAircraftInfo(): void {
    const el = this.missionAircraftInfoRef.getOrDefault();
    if (!el) return;

    const loading = missionState.missionAircraftLoading.get();
    const notFound = missionState.missionAircraftNotFound.get();
    const aircraft = missionState.missionCurrentAircraft.get();

    // Calculate overall condition from systems if available
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

    // Add event handlers for buttons
    el.querySelector(".mission-refuel-btn")?.addEventListener("click", () => this.openRefuelPopup());
    el.querySelector(".mission-systems-btn")?.addEventListener("click", () => this.openSystemsPopup());
  }

  /**
   * V1.3: Open refuel popup with current fuel level
   */
  private openRefuelPopup(): void {
    const aircraft = missionState.missionCurrentAircraft.get() || hangarState.hangarSelectedAircraft.get();
    if (!aircraft) return;

    // Set initial target to current fuel level
    popupState.refuelTargetGallons.set(aircraft.fuel_gallons);
    popupState.showRefuelPopup.set(true);

    // Render the popup after state is set
    setTimeout(() => this.renderRefuelPopup(), 10);
  }

  /**
   * V1.3: Close refuel popup
   */
  private closeRefuelPopup(): void {
    popupState.showRefuelPopup.set(false);
  }

  /**
   * V1.3: Render refuel popup using PopupHelpers
   */
  private renderRefuelPopup(): void {
    const el = this.refuelPopupRef.getOrDefault();
    if (!el) return;

    const aircraft = missionState.missionCurrentAircraft.get() || hangarState.hangarSelectedAircraft.get();
    if (!aircraft) return;

    const maxFuel = aircraft.fuel_capacity_gallons;

    // Generate HTML using helper
    const data: RefuelPopupData = {
      registration: aircraft.registration || "N/A",
      aircraftType: aircraft.aircraft_type,
      currentFuel: aircraft.fuel_gallons,
      maxFuel: maxFuel,
      targetFuel: popupState.refuelTargetGallons.get(),
      pricePerGallon: this.refuelPricePerGallon,
      translations: {
        refuelTitle: this.t("hangar", "refuelTitle"),
        currentLevel: this.t("hangar", "currentLevel"),
        target: this.t("hangar", "target"),
        toAdd: this.t("hangar", "toAdd"),
        total: this.t("common", "total"),
        cancel: this.t("common", "cancel"),
        full: this.t("hangar", "full"),
      },
    };

    el.innerHTML = renderRefuelPopupHtml(data);

    // Add event listeners
    el.querySelector(".refuel-close-btn")?.addEventListener("click", () => this.closeRefuelPopup());
    el.querySelector(".refuel-cancel-btn")?.addEventListener("click", () => this.closeRefuelPopup());
    el.querySelector(".refuel-full-btn")?.addEventListener("click", () => {
      popupState.refuelTargetGallons.set(maxFuel);
      this.renderRefuelPopup();
    });
    el.querySelector(".refuel-confirm-btn")?.addEventListener("click", () => void this.executeRefuel());
    (el.querySelector(".refuel-slider") as HTMLInputElement)?.addEventListener("input", (e) => {
      popupState.refuelTargetGallons.set(parseFloat((e.target as HTMLInputElement).value));
      this.renderRefuelPopup();
    });
  }

  /**
   * V1.3: Execute refuel with selected amount
   * V1.9: Uses setSimulatorFuel from helpers and FleetRouter.syncFuel
   */
  private async executeRefuel(): Promise<void> {
    const aircraft = missionState.missionCurrentAircraft.get() || hangarState.hangarSelectedAircraft.get();
    if (!aircraft) return;

    const token = authState.authToken.get();
    // P2P mode doesn't require token
    if (!authState.isP2PMode.get() && !token) return;

    const targetFuel = popupState.refuelTargetGallons.get();
    console.log("[CarrierPlus] Refueling to:", targetFuel, "gal");

    try {
      // Step 1: Sync to database via service (DB is source of truth)
      await FleetRouter.syncFuel(aircraft.id, targetFuel, aircraft.fuel_capacity_gallons);
      console.log("[CarrierPlus] Fuel synced to database");

      // Step 2: Write fuel to simulator
      setSimulatorFuel(targetFuel, aircraft.fuel_capacity_gallons);

      // Step 3: Close popup
      this.closeRefuelPopup();

      // Step 4: Update LOCAL states with new fuel value (don't re-fetch DB)
      const missionAircraft = missionState.missionCurrentAircraft.get();
      if (missionAircraft && missionAircraft.id === aircraft.id) {
        missionState.missionCurrentAircraft.set({
          ...missionAircraft,
          fuel_gallons: targetFuel,
        });
        this.renderMissionAircraftInfo();
      }

      const hangarAircraft = hangarState.hangarSelectedAircraft.get();
      if (hangarAircraft && hangarAircraft.id === aircraft.id) {
        hangarState.hangarSelectedAircraft.set({
          ...hangarAircraft,
          fuel_gallons: targetFuel,
        });
        this.renderHangarList();
      }

    } catch (error) {
      console.error("[CarrierPlus] Error refueling:", error);
    }
  }

  /**
   * V1.4: Open systems detail popup
   */
  private openSystemsPopup(): void {
    const aircraft = missionState.missionCurrentAircraft.get() || hangarState.hangarSelectedAircraft.get();
    if (!aircraft) return;

    popupState.showSystemsPopup.set(true);
    setTimeout(() => this.renderSystemsPopup(), 10);
  }

  /**
   * V1.4: Close systems detail popup
   */
  private closeSystemsPopup(): void {
    popupState.showSystemsPopup.set(false);
  }

  /**
   * V1.4: Render systems detail popup using PopupHelpers
   */
  private renderSystemsPopup(): void {
    const el = this.systemsPopupRef.getOrDefault();
    if (!el) return;

    const aircraft = missionState.missionCurrentAircraft.get() || hangarState.hangarSelectedAircraft.get();
    if (!aircraft || !popupState.showSystemsPopup.get()) {
      el.innerHTML = "";
      return;
    }

    // Build systems array from API data
    const systemsApiData = hangarState.hangarSystems.get();
    const systemLabels: Record<string, string> = {
      "engine": this.t("hangar", "engine"),
      "landing_gear": this.t("hangar", "landingGearFull"),
      "propeller": this.t("hangar", "propellerRotor"),
      "electrical": this.t("hangar", "electrical"),
      "pitot": this.t("hangar", "pitotStatic"),
      "avionics": this.t("hangar", "avionics"),
    };

    const systemKeys = ["engine", "landing_gear", "propeller", "electrical", "pitot", "avionics"];
    const systems = systemKeys.map(key => {
      let value = 100;
      if (systemsApiData?.systems?.[key]) {
        value = Math.round(systemsApiData.systems[key].condition);
      }
      return { key, label: systemLabels[key], value };
    });

    const acAny = aircraft as { hours?: number };
    const data: SystemsPopupData = {
      registration: aircraft.registration || "N/A",
      aircraftType: aircraft.aircraft_type,
      flightHours: typeof acAny.hours === "number" ? acAny.hours : 0,
      systems,
      translations: {
        systemsStatus: this.t("hangar", "systemsStatus"),
        flightHoursShort: this.t("hangar", "flightHoursShort"),
        overallCondition: this.t("hangar", "overallCondition"),
        good: this.t("hangar", "good"),
        worn: this.t("hangar", "worn"),
        critical: this.t("hangar", "critical"),
        repair: this.t("hangar", "repair"),
      },
    };

    el.innerHTML = renderSystemsPopupHtml(data);

    // Add event listeners
    el.querySelector(".systems-close-btn")?.addEventListener("click", () => this.closeSystemsPopup());
    el.querySelector(".systems-repair-btn")?.addEventListener("click", () => this.openRepairPopupFromSystems());
    el.addEventListener("click", (e) => {
      if (e.target === el.firstElementChild) this.closeSystemsPopup();
    });
  }

  /**
   * V1.1: Fetch repair quote from API
   */
  private async fetchRepairQuote(aircraftId: string): Promise<void> {
    const token = authState.authToken.get();
    // P2P mode doesn't require token
    if (!authState.isP2PMode.get() && !token) return;

    try {
      // V1.9: Use fleetService for repair quote
      const data = await FleetRouter.getRepairQuote(aircraftId);
      console.log("[CarrierPlus] Repair quote:", data);
      hangarState.hangarRepairQuote.set(data);
      this.renderRepairList();
    } catch (error) {
      console.error("[CarrierPlus] Error fetching repair quote:", error);
      hangarState.hangarRepairQuote.set(null);
    }
  }

  /**
   * V1.1: Render repair list using PopupHelpers
   */
  private renderRepairList(): void {
    const listEl = this.hangarRepairListRef.getOrDefault();
    if (!listEl) return;

    const quote = hangarState.hangarRepairQuote.get();
    if (!quote) {
      listEl.innerHTML = `<div style="text-align: center; padding: 16px; color: #6b7280; font-size: 11px;">${this.t("hangar", "loadingQuote")}</div>`;
      return;
    }

    const systemNames: Record<string, string> = {
      "engine": this.t("hangar", "engine"),
      "landing_gear": this.t("hangar", "landingGear"),
      "propeller": this.t("hangar", "propeller"),
      "electrical": this.t("hangar", "electrical"),
      "pitot": this.t("hangar", "pitot"),
      "avionics": this.t("hangar", "avionics"),
    };

    const quotes = quote.quotes as Record<string, { current_condition: number; cost: number }>;
    const items: RepairItemData[] = Object.entries(quotes)
      .filter(([, data]) => data.current_condition < 100)
      .map(([system, data]) => ({
        system,
        label: systemNames[system] || system,
        currentCondition: data.current_condition,
        cost: data.cost,
      }));

    listEl.innerHTML = renderRepairListHtml(items, this.t("hangar", "noRepairNeeded"), this.t("hangar", "loadingQuote"));
  }

  /**
   * V1.1: Perform repair via API
   */
  private async performRepair(aircraftId: string, systems: string[], payFrom: string): Promise<void> {
    const token = authState.authToken.get();
    // P2P mode doesn't require token
    if (!authState.isP2PMode.get() && !token) return;

    hangarState.hangarLoading.set(true);
    try {
      // V1.9: Use fleetService for repair
      await FleetRouter.repairAircraft(aircraftId, systems, payFrom as "player" | "company");
      console.log("[CarrierPlus] Repair completed");
      popupState.hangarRepairPopupOpen.set(false);
      await this.fetchAircraftSystems(aircraftId);
      if (payFrom === "company") {
        void this.fetchCompanyData();
      }
    } catch (error) {
      console.error("[CarrierPlus] Error performing repair:", error);
      alert(`${this.t("common", "error")}: ${error instanceof Error ? error.message : this.t("hangar", "repairFailed")}`);
    } finally {
      hangarState.hangarLoading.set(false);
    }
  }

  /**
   * V1.1: Render aircraft systems using innerHTML (using helper)
   */
  private renderHangarSystems(): void {
    const listEl = this.hangarSystemsListRef.getOrDefault();
    if (!listEl) return;

    const systemsData = hangarState.hangarSystems.get() as HangarSystemsData | null;
    const translations: HangarSystemsTranslations = {
      loading: this.t("common", "loading"),
      grounded: this.t("hangar", "grounded"),
      repairRequired: this.t("hangar", "repairRequired"),
      failure: this.t("hangar", "failure"),
      engine: this.t("hangar", "engine"),
      landingGear: this.t("hangar", "landingGear"),
      propeller: this.t("hangar", "propeller"),
      electrical: this.t("hangar", "electrical"),
      pitot: this.t("hangar", "pitot"),
      avionics: this.t("hangar", "avionics"),
    };

    listEl.innerHTML = renderHangarSystemsHtml(systemsData, translations);
  }

  /**
   * V1.1: Open repair popup
   */
  private openRepairPopup(): void {
    const aircraft = hangarState.hangarSelectedAircraft.get();
    if (!aircraft) return;

    // Fetch repair quote
    void this.fetchRepairQuote(aircraft.id);
    popupState.hangarRepairPopupOpen.set(true);
  }

  /**
   * V1.4: Open edit registration popup
   */
  private openEditRegistrationPopup(): void {
    const aircraft = hangarState.hangarSelectedAircraft.get();
    if (!aircraft) return;

    popupState.hangarEditRegValue.set(aircraft.registration || "");
    popupState.hangarEditRegPopupOpen.set(true);

    // Focus input and setup event listeners after popup opens
    setTimeout(() => {
      const input = this.hangarEditRegInputRef.getOrDefault();
      if (input) {
        // Set initial value manually (JSX value attribute doesn't work in FSComponent)
        input.value = aircraft.registration || "";
        input.focus();
        input.select();

        // Use Coherent API to properly capture keyboard focus from MSFS
        this.setupInputEventBlocker(input);

        // Add input event listener manually (JSX onInput doesn't work in FSComponent)
        input.addEventListener("input", (e: Event) => {
          const value = (e.target as HTMLInputElement).value.toUpperCase();
          (e.target as HTMLInputElement).value = value; // Force uppercase
          popupState.hangarEditRegValue.set(value);
        });

        // Handle Enter and Escape keys
        input.addEventListener("keydown", (e: KeyboardEvent) => {
          if (e.key === "Enter") {
            void this.updateAircraftRegistration();
          } else if (e.key === "Escape") {
            popupState.hangarEditRegPopupOpen.set(false);
          }
        });
      }
    }, 100);
  }

  /**
   * V1.4: Auto-update aircraft registration from simulator (silent, no popup)
   * V3.1: Now works in P2P mode (no token required)
   */
  private async autoUpdateAircraftRegistration(aircraftId: string, newReg: string): Promise<void> {
    const token = authState.authToken.get();
    const isP2P = authState.isP2PMode.get();

    if (!newReg || newReg.length < 2) return;

    try {
      await FleetRouter.updateRegistration(aircraftId, newReg.toUpperCase());
      console.log("[CarrierPlus] Registration auto-synced to:", newReg);
      void this.fetchHangarAircraftList();
    } catch (error) {
      console.error("[CarrierPlus] Error auto-syncing registration:", error);
    }
  }

  /**
   * V1.4: Update aircraft registration via API (from popup)
   * V3.1: Now works in P2P mode (no token required)
   */
  private async updateAircraftRegistration(): Promise<void> {
    const aircraft = hangarState.hangarSelectedAircraft.get();
    const token = authState.authToken.get();
    const isP2P = authState.isP2PMode.get();
    const newReg = popupState.hangarEditRegValue.get().trim().toUpperCase();

    // P2P mode doesn't need token, network mode does
    if (!aircraft || !newReg) return;

    if (newReg.length < 2 || newReg.length > 10) {
      console.error("[CarrierPlus] Registration must be 2-10 characters");
      return;
    }

    try {
      await FleetRouter.updateRegistration(aircraft.id, newReg);
      console.log("[CarrierPlus] Registration updated to:", newReg);

      // Close popup
      popupState.hangarEditRegPopupOpen.set(false);

      // Refresh aircraft details
      void this.fetchAircraftDetails(aircraft.id);

      // Refresh list
      void this.fetchHangarAircraftList();

    } catch (error) {
      console.error("[CarrierPlus] Error updating registration:", error);
    }
  }

  /**
   * V1.5: Open repair popup from systems detail popup (works from missions or hangar)
   * Redirects to Hangar tab with aircraft selected, then opens repair popup
   */
  private openRepairPopupFromSystems(): void {
    // Get aircraft from mission context or hangar context
    const missionAircraft = missionState.missionCurrentAircraft.get();
    const hangarAircraft = hangarState.hangarSelectedAircraft.get();

    let aircraftId: string | null = null;

    if (missionAircraft) {
      // Convert mission aircraft to AircraftDetails for the repair popup
      const details: AircraftDetails = {
        id: missionAircraft.id,
        registration: missionAircraft.registration,
        aircraft_type: missionAircraft.aircraft_type,
        aircraft_model: missionAircraft.icao_type || missionAircraft.aircraft_type,
        icao_type: missionAircraft.icao_type,
        current_airport_ident: missionAircraft.current_airport_ident,
        status: missionAircraft.status,
        required_license: "PPL",
        owner_type: missionAircraft.owner_type,
        fuel_gallons: missionAircraft.fuel_gallons,
        fuel_capacity_gallons: missionAircraft.fuel_capacity_gallons,
        cargo_kg: 0,
        cargo_capacity_kg: missionAircraft.cargo_capacity_kg,
        passengers: 0,
        passenger_capacity: missionAircraft.passenger_capacity,
        condition: missionAircraft.condition,
        hours: missionAircraft.hours,
        landing_gear: missionAircraft.landing_gear,
        engine_status: missionAircraft.engine_status,
        propeller_status: missionAircraft.propeller_status,
        electrical_status: missionAircraft.electrical_status,
        pitot_status: missionAircraft.pitot_status,
        avionics_status: missionAircraft.avionics_status,
      };
      hangarState.hangarSelectedAircraft.set(details);
      aircraftId = missionAircraft.id;
    } else if (hangarAircraft) {
      aircraftId = hangarAircraft.id;
    }

    if (!aircraftId) {
      console.warn("[CarrierPlus] No aircraft found for repair popup");
      return;
    }

    // Close systems popup
    this.closeSystemsPopup();

    // Switch to Hangar tab (repair popup is rendered there)
    navigationState.activeTab.set("hangar");

    // Small delay to let the tab render, then open repair popup
    setTimeout(() => {
      // Fetch full aircraft details and systems for hangar display
      void this.fetchAircraftDetails(aircraftId!);
      // Fetch repair quote and open popup
      void this.fetchRepairQuote(aircraftId!);
      popupState.hangarRepairPopupOpen.set(true);
    }, 100);
  }

  /**
   * V1.2: Check if selected hangar aircraft is the current one in simulator
   */
  private isSelectedAircraftActive(): boolean {
    const aircraft = hangarState.hangarSelectedAircraft.get();
    const currentSimReg = simVarState.currentSimAircraftReg.get();
    return !!(aircraft?.registration && aircraft.registration.toUpperCase() === currentSimReg);
  }

  /**
   * V1.2: Sync fuel from current simulator aircraft
   * Updates the selected hangar aircraft with fuel data from SimVars
   * Only works if selected aircraft is the one currently loaded in MSFS
   */
  /**
   * V1.4: SYNC button - Apply DB fuel to simulator (anti-cheat)
   * This enforces the database state, preventing cheating via MFS fuel panel
   */
  private async syncFuelFromSimulator(): Promise<void> {
    const token = authState.authToken.get();
    const aircraft = hangarState.hangarSelectedAircraft.get();
    if (!token || !aircraft) return;

    // Security check - only sync if this is the active aircraft
    if (!this.isSelectedAircraftActive()) {
      console.warn("[CarrierPlus] Cannot sync - selected aircraft is not the active aircraft in MSFS");
      return;
    }

    // Read fuel capacity from simulator
    const simFuelCapacity = SimVar.GetSimVarValue("FUEL TOTAL CAPACITY", "gallons") as number || 0;
    const simFuelCurrent = SimVar.GetSimVarValue("FUEL TOTAL QUANTITY", "gallons") as number || 0;

    if (simFuelCapacity <= 0) {
      console.warn("[CarrierPlus] No fuel capacity from SimVar - is an aircraft loaded?");
      return;
    }

    // Get DB fuel value
    const dbFuelGallons = aircraft.fuel_gallons;

    console.log(`[CarrierPlus] SYNC: DB fuel=${dbFuelGallons}, Sim fuel=${simFuelCurrent.toFixed(1)}`);

    // Anti-cheat check
    if (simFuelCurrent > dbFuelGallons + 1) {
      console.warn(`[CarrierPlus] ANTI-CHEAT: Sim fuel (${simFuelCurrent.toFixed(1)}) > DB fuel (${dbFuelGallons}). Enforcing DB value.`);
    }

    // Apply DB fuel to simulator (source of truth)
    console.log(`[CarrierPlus] Enforcing DB fuel to simulator: ${dbFuelGallons} gal`);
    setSimulatorFuel(dbFuelGallons, simFuelCapacity);

    // P2P: Update DB capacity if different (first sync for new aircraft)
    if (Math.abs(aircraft.fuel_capacity_gallons - simFuelCapacity) > 1) {
      try {
        await FleetRouter.syncFuel(aircraft.id, dbFuelGallons, simFuelCapacity);
        console.log("[CarrierPlus] Updated fuel capacity in local DB:", simFuelCapacity);
      } catch (error) {
        console.error("[CarrierPlus] Error updating fuel capacity:", error);
      }
    }

    // Refresh aircraft details to show updated values
    void this.fetchAircraftDetails(aircraft.id);
  }

  /**
   * V1.4: Refuel hangar aircraft to full capacity
   * Writes to all fuel tanks and syncs to database
   */
  private async refuelHangarAircraft(): Promise<void> {
    const token = authState.authToken.get();
    const aircraft = hangarState.hangarSelectedAircraft.get();
    if (!token || !aircraft) return;

    // Security check - only refuel if this is the active aircraft
    if (!this.isSelectedAircraftActive()) {
      console.warn("[CarrierPlus] Cannot refuel - selected aircraft is not the active aircraft in MSFS");
      return;
    }

    // Get simulator capacity
    const simFuelCapacity = SimVar.GetSimVarValue("FUEL TOTAL CAPACITY", "gallons") as number || aircraft.fuel_capacity_gallons;
    const targetFuel = simFuelCapacity; // Full tank

    console.log("[CarrierPlus] Refueling hangar aircraft to full:", targetFuel, "gal");

    try {
      // Step 1: Write fuel to simulator (all tanks)
      setSimulatorFuel(targetFuel, simFuelCapacity);
      console.log("[CarrierPlus] Fuel written to simulator tanks");

      // Step 2: P2P - Sync to local database
      await FleetRouter.syncFuel(aircraft.id, targetFuel, simFuelCapacity);
      console.log("[CarrierPlus] Fuel synced to local database");

      // Step 3: Refresh aircraft details
      void this.fetchAircraftDetails(aircraft.id);

    } catch (error) {
      console.error("[CarrierPlus] Error refueling:", error);
    }
  }

  /**
   * V1.2: Auto-sync fuel for the current aircraft in simulator
   * Reads registration from SimVar ATC ID, finds matching aircraft, syncs fuel
   * Called automatically at login and when opening Hangar tab (anti-cheat)
   */
  /**
   * V1.4: Auto-sync at connection - Apply DB fuel to simulator
   * This restores the saved fuel state when the player connects
   */
  private async autoSyncCurrentAircraft(): Promise<void> {
    const token = authState.authToken.get();
    // P2P mode doesn't require token
    if (!authState.isP2PMode.get() && !token) return;

    // Read aircraft registration from simulator (ATC ID = registration/tail number)
    const simRegistration = SimVar.GetSimVarValue("ATC ID", "string") as string;
    if (!simRegistration || simRegistration.trim() === "") {
      console.log("[CarrierPlus] No aircraft loaded in simulator, skipping auto-sync");
      return;
    }

    // Read current simulator capacity (needed to calculate percentage for setSimulatorFuel)
    const simFuelCapacity = SimVar.GetSimVarValue("FUEL TOTAL CAPACITY", "gallons") as number || 0;
    if (simFuelCapacity <= 0) {
      console.log("[CarrierPlus] No fuel capacity from SimVar, skipping auto-sync");
      return;
    }

    console.log(`[CarrierPlus] Auto-sync: Looking for aircraft ${simRegistration}`);

    try {
      // Fetch fleet to find matching aircraft by registration
      const fleet = await FleetRouter.getFleet() as unknown as Array<{
        id: string;
        registration: string | null;
        icao_type: string | null;
        aircraft_type: string;
        current_airport_ident: string | null;
        fuel_gallons?: number;
        fuel_capacity_gallons?: number;
      }>;

      // V1.4: Get ICAO type from simulator for better matching
      const rawAtcModel = SimVar.GetSimVarValue("ATC MODEL", "string") as string;
      const simIcaoType = this.extractIcaoType(rawAtcModel);
      let currentAirport = simVarState.closestAirport.get() !== "----" ? simVarState.closestAirport.get() : null;

      // V1.6: Wait for airport detection if not yet available (max 5 retries)
      if (!currentAirport) {
        console.log("[CarrierPlus] Airport not yet detected, waiting...");
        for (let retry = 0; retry < 5 && !currentAirport; retry++) {
          await new Promise(resolve => setTimeout(resolve, 500));
          currentAirport = simVarState.closestAirport.get() !== "----" ? simVarState.closestAirport.get() : null;
          console.log(`[CarrierPlus] Retry ${retry + 1}/5: Airport=${currentAirport || "not detected"}`);
        }
        if (!currentAirport) {
          console.warn("[CarrierPlus] Airport still not detected after 5 retries, aborting sync");
          return;
        }
      }

      console.log(`[CarrierPlus] Auto-sync: Type=${simIcaoType}, Airport=${currentAirport}`);

      // V1.8 SIMPLIFIED: Match by TYPE + AIRPORT only
      // No automatic registration sync - player manages registrations manually in hangar
      let matchingAircraft = null;

      if (simIcaoType && currentAirport) {
        matchingAircraft = fleet.find(
          ac => ac.icao_type?.toUpperCase() === simIcaoType.toUpperCase() &&
                ac.current_airport_ident?.toUpperCase() === currentAirport.toUpperCase()
        );

        if (matchingAircraft) {
          console.log(`[CarrierPlus] Found ${simIcaoType} at ${currentAirport}: ${matchingAircraft.registration}`);
        } else {
          // Log where this type of aircraft is available
          const sameTypeAircraft = fleet.filter(
            ac => ac.icao_type?.toUpperCase() === simIcaoType.toUpperCase()
          );
          if (sameTypeAircraft.length > 0) {
            console.log(`[CarrierPlus] No ${simIcaoType} at ${currentAirport}. Available at: ${sameTypeAircraft.map(a => `${a.registration}@${a.current_airport_ident}`).join(", ")}`);
          } else {
            console.log(`[CarrierPlus] No ${simIcaoType} in fleet`);
          }
        }
      }

      if (!matchingAircraft) {
        console.log(`[CarrierPlus] No aircraft available at ${currentAirport} for type ${simIcaoType}`);
        return;
      }

      console.log(`[CarrierPlus] Using aircraft: ${matchingAircraft.registration} (${matchingAircraft.aircraft_type})`);

      // V1.4: Anti-cheat - ALWAYS apply DB fuel to simulator
      const dbFuelGallons = Number(matchingAircraft.fuel_gallons) || 0;
      const dbFuelCapacity = Number(matchingAircraft.fuel_capacity_gallons) || simFuelCapacity;
      const simFuelCurrent = SimVar.GetSimVarValue("FUEL TOTAL QUANTITY", "gallons") as number || 0;

      console.log(`[CarrierPlus] DB fuel: ${dbFuelGallons}/${dbFuelCapacity} gal, Sim fuel: ${simFuelCurrent} gal`);

      // Check for cheat attempt (sim fuel higher than DB fuel)
      if (simFuelCurrent > dbFuelGallons + 1) {
        console.warn(`[CarrierPlus] ANTI-CHEAT: Sim fuel (${simFuelCurrent.toFixed(1)}) > DB fuel (${dbFuelGallons.toFixed(1)}). Resetting to DB value.`);
      }

      // Always apply DB fuel to simulator (source of truth)
      if (simFuelCapacity > 0) {
        console.log(`[CarrierPlus] Applying DB fuel to simulator: ${dbFuelGallons} gal`);
        setSimulatorFuel(dbFuelGallons, simFuelCapacity);
        console.log("[CarrierPlus] Fuel enforced from database to simulator");
      }

      // P2P: Update DB capacity if simulator has different capacity (first time sync)
      if (Math.abs(dbFuelCapacity - simFuelCapacity) > 1) {
        console.log(`[CarrierPlus] Updating fuel capacity in local DB: ${simFuelCapacity} gal`);
        await FleetRouter.syncFuel(matchingAircraft.id, dbFuelGallons, simFuelCapacity);
      }

      // V1.5: Also refresh aircraft condition data in UI
      // This ensures displayed condition is up-to-date when returning to app
      const currentTab = navigationState.activeTab.get();
      const hangarSelectedId = hangarState.hangarSelectedAircraft.get()?.id;

      if (currentTab === "hangar" && hangarSelectedId === matchingAircraft.id) {
        // Refresh hangar aircraft details (includes condition, hours, systems)
        console.log("[CarrierPlus] Refreshing hangar aircraft details...");
        void this.fetchAircraftDetails(matchingAircraft.id);
      } else if (currentTab === "missions") {
        // Refresh mission aircraft info (includes condition)
        console.log("[CarrierPlus] Refreshing mission aircraft info...");
        void this.loadCurrentAircraftForMission();
      }

      console.log("[CarrierPlus] Auto-sync completed (fuel + condition)");

    } catch (error) {
      console.error("[CarrierPlus] Auto-sync error:", error);
    }
  }

  /**
   * V2.3: Render hangar aircraft list using helper
   */
  private renderHangarList(): void {
    const listEl = this.hangarListRef.getOrDefault();
    if (!listEl) return;

    const aircraft = hangarState.hangarAircraftList.get() as HangarAircraftItem[];
    const selectedId = hangarState.hangarSelectedAircraft.get()?.id;
    const currentSimReg = simVarState.currentSimAircraftReg.get();
    const filterText = hangarState.hangarFilter.get();

    const translations: HangarListTranslations = {
      noAircraft: this.t("hangar", "noAircraft"),
      noMatch: "Aucun avion trouvé",
      personalBadge: this.t("hangar", "personalBadge"),
      companyBadge: this.t("hangar", "companyBadge"),
      active: this.t("hangar", "active"),
    };

    listEl.innerHTML = renderHangarListHtml(aircraft, selectedId, currentSimReg, filterText, translations);

    // Add click handlers (all clickable in hangar - soft mode)
    const items = listEl.querySelectorAll(".hangar-aircraft-item");
    items.forEach(item => {
      item.addEventListener("click", () => {
        const aircraftId = item.getAttribute("data-aircraft-id");
        if (aircraftId) {
          void this.fetchAircraftDetails(aircraftId);
        }
      });
    });

    // Initialize filter input event listeners (only once)
    this.initHangarFilterInput();
  }

  private hangarFilterInitialized = false;

  private initHangarFilterInput(): void {
    if (this.hangarFilterInitialized) return;

    const filterInput = this.hangarFilterRef.getOrDefault();
    if (!filterInput) return;

    this.hangarFilterInitialized = true;

    // Use Coherent API to properly capture keyboard focus from MSFS
    this.setupInputEventBlocker(filterInput);

    // Handle input for filtering
    filterInput.addEventListener("input", () => {
      hangarState.hangarFilter.set(filterInput.value);
      this.renderHangarList();
    });
  }

  private stopFlightTracking(): void {
    if (!this.flightTrackingActive) return;

    console.log("[CarrierPlus] Stopping flight tracking");
    this.flightTrackingActive = false;

    if (this.flightTrackingInterval) {
      window.clearInterval(this.flightTrackingInterval);
      this.flightTrackingInterval = null;
    }
  }

  // V2.1: Reset all tracking UI variables to initial state
  private resetTrackingVariables(): void {
    console.log("[CarrierPlus] Resetting tracking variables");
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
    // V2.3: ATC tracking reset
    this.atcClearedTakeoff = false;
    this.atcClearedLanding = false;
    this.tookOffWithoutClearance = false;
    this.landedWithoutClearance = false;
    trackingState.trackingAtcCompliance.set(100);
    trackingState.trackingAtcViolations.set(0);
    trackingState.trackingBonusRealTime.set(100);
    trackingState.trackingBonusLanding.set("--");
  }

  // V2.0: Enhanced flight tracking - delegates to TrackingManager
  private startFlightTrackingV1(): void {
    // Stop any existing tracking first
    this.stopFlightTracking();

    // Reset UI tracking variables
    this.resetTrackingVariables();

    console.log("[CarrierPlus] Starting V2.0 flight tracking via TrackingManager");
    this.flightTrackingActive = true;
    missionState.waypointsPassed.set(0);

    // Fetch destination coordinates for progress calculation
    const mission = missionState.activeMission.get();
    if (mission?.destination_icao) {
      void this.fetchDestinationCoordinates(mission.destination_icao);
    }

    // Start the manager's tracking (handles all SimVar reading and state updates)
    trackingManager.startFlightTracking();
  }


  // V1.0: Check and validate checkpoints
  private async checkCheckpoints(): Promise<void> {
    const mission = missionState.activeMission.get();
    const token = authState.authToken.get();
    if (!mission || !token) return;

    const checkpoints = missionState.missionCheckpoints.get();
    const nextSeq = missionState.nextCheckpoint.get();

    // Debug: log checkpoint state every 10 seconds
    if (Math.random() < 0.2) {
      console.log(`[CarrierPlus] Checkpoint check: ${checkpoints.length} checkpoints, next=#${nextSeq}`);
    }

    // Get current aircraft position and groundspeed
    const lat = simVarState.latitude.get();
    const lon = simVarState.longitude.get();
    const alt = simVarState.altitude.get();
    const groundSpeed = SimVar.GetSimVarValue("GPS GROUND SPEED", "knots") as number || 0;

    // V1.0: Build checkpoint list display (8 lines max)
    const checkpointLineSetters = [
      checkpointState.checkpointLine0, checkpointState.checkpointLine1, checkpointState.checkpointLine2, checkpointState.checkpointLine3,
      checkpointState.checkpointLine4, checkpointState.checkpointLine5, checkpointState.checkpointLine6, checkpointState.checkpointLine7
    ];

    // Calculate cumulative distance from origin for each checkpoint
    let cumulativeDistNm = 0;
    const sortedCheckpoints = [...checkpoints].sort((a, b) => a.sequence - b.sequence);

    for (let i = 0; i < 8; i++) {
      if (i < sortedCheckpoints.length) {
        const cp = sortedCheckpoints[i];

        // Calculate distance from current position to this checkpoint
        const distToCp = trackingManager.haversineDistanceNm(lat, lon, cp.latitude, cp.longitude);

        // Status icon - use ASCII only to avoid rendering issues
        const icon = cp.validated ? "[OK]" : (cp.sequence === nextSeq ? "[>>]" : "[  ]");

        // Build clear line: [>>] CP1 | Lat=49.016 Lon=2.427 | 6nm Cap271
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

    // V1.0: Determine flight phase based on checkpoints
    // Find the last validated checkpoint to determine current phase
    const lastValidated = [...checkpoints]
      .filter(cp => cp.validated)
      .sort((a, b) => b.sequence - a.sequence)[0];

    const nextCpForPhase = checkpoints.find(cp => cp.sequence === nextSeq);
    let phase = "cruise";
    if (nextCpForPhase) {
      // Use phase_after from the checkpoint if available
      if (nextCpForPhase.type === "departure") {
        phase = "departure";
      } else if (nextCpForPhase.type === "arrival" || nextCpForPhase.phase_after === "descent") {
        phase = "arrival";
      } else {
        phase = "cruise";
      }
    }

    // Update flight phase display
    if (phase === "departure") {
      checkpointState.flightPhaseIcon.set("🛫");
      checkpointState.flightPhaseText.set(this.t("missions", "takeoffPhase"));
      checkpointState.flightPhaseColor.set("#3b82f6");
    } else if (phase === "cruise") {
      checkpointState.flightPhaseIcon.set("✈️");
      checkpointState.flightPhaseText.set(this.t("missions", "cruisePhase"));
      checkpointState.flightPhaseColor.set("#10b981");
    } else if (phase === "arrival") {
      checkpointState.flightPhaseIcon.set("🛬");
      checkpointState.flightPhaseText.set(this.t("missions", "approachPhase"));
      checkpointState.flightPhaseColor.set("#f59e0b");
    }

    // Find the next unvalidated checkpoint
    const nextCp = checkpoints.find(cp => cp.sequence === nextSeq && !cp.validated);
    if (!nextCp) {
      checkpointState.nextCheckpointCoords.set("---");
      checkpointState.nextCheckpointBearing.set(0);
      checkpointState.nextCheckpointDistance.set("---");
      checkpointState.nextCheckpointETA.set("---");
      return;
    }

    // Check if within validation radius
    const distance = trackingManager.haversineDistanceNm(lat, lon, nextCp.latitude, nextCp.longitude);
    const bearing = trackingManager.calculateBearing(lat, lon, nextCp.latitude, nextCp.longitude);

    // Calculate ETA based on groundspeed
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

    // Update display variables for UI - clear decimal format
    checkpointState.nextCheckpointCoords.set(`Lat=${nextCp.latitude.toFixed(3)} Lon=${nextCp.longitude.toFixed(3)}`);
    checkpointState.nextCheckpointBearing.set(Math.round(bearing));
    checkpointState.nextCheckpointDistance.set(distance.toFixed(1));
    checkpointState.nextCheckpointETA.set(etaStr);

    if (distance <= nextCp.radius_nm) {
      console.log(`[CarrierPlus] V1.0: Checkpoint ${nextSeq} within range (${distance.toFixed(2)} nm)`);

      // Get flight stats for the checkpoint
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

        console.log(`[CarrierPlus] V1.0: Checkpoint ${nextSeq} validated!`, result);

        // Update local checkpoint state
        const updatedCheckpoints = checkpoints.map(cp =>
          cp.sequence === nextSeq ? { ...cp, validated: true, validated_at: new Date().toISOString() } : cp
        );
        missionState.missionCheckpoints.set(updatedCheckpoints);
        missionState.checkpointsValidated.set(result.checkpoint_index || nextSeq);
        missionState.nextCheckpoint.set(nextSeq + 1);
      } catch (error) {
        console.error("[CarrierPlus] V1.0: Error validating checkpoint:", error);
      }
    }
  }

  // V1.0: Direct-To next checkpoint - send coordinates to aircraft GPS
  // Note: Only works on aircraft with basic GPS. Custom avionics require manual entry.
  private directToNextCheckpoint(): void {
    const checkpoints = missionState.missionCheckpoints.get();
    const nextSeq = missionState.nextCheckpoint.get();

    const nextCp = checkpoints.find(cp => cp.sequence === nextSeq && !cp.validated);
    if (!nextCp) {
      console.log("[CarrierPlus] Direct-To: No next checkpoint available");
      return;
    }

    // Format coordinates for manual entry (degrees + decimal minutes)
    const latDeg = Math.floor(Math.abs(nextCp.latitude));
    const latMin = ((Math.abs(nextCp.latitude) - latDeg) * 60).toFixed(2);
    const latDir = nextCp.latitude >= 0 ? 'N' : 'S';

    const lonDeg = Math.floor(Math.abs(nextCp.longitude));
    const lonMin = ((Math.abs(nextCp.longitude) - lonDeg) * 60).toFixed(2);
    const lonDir = nextCp.longitude >= 0 ? 'E' : 'W';

    // Display coordinates clearly in console for manual entry
    console.log(`======================================`);
    console.log(`   DIRECT-TO CP${nextCp.sequence}`);
    console.log(`--------------------------------------`);
    console.log(`   LAT: ${latDir} ${latDeg} deg ${latMin}`);
    console.log(`   LON: ${lonDir} ${lonDeg} deg ${lonMin}`);
    console.log(`--------------------------------------`);
    console.log(`   Decimal: ${nextCp.latitude.toFixed(6)}, ${nextCp.longitude.toFixed(6)}`);
    console.log(`======================================`);

    try {
      // Try to set GPS waypoint (works on basic GPS aircraft only)
      SimVar.SetSimVarValue("GPS WP NEXT LAT", "degree", nextCp.latitude);
      SimVar.SetSimVarValue("GPS WP NEXT LON", "degree", nextCp.longitude);
      (SimVar.SetSimVarValue as (name: string, unit: string, value: unknown) => void)("GPS WP NEXT ID", "string", `CP${nextCp.sequence}`);
      console.log("[CarrierPlus] SimVars sent (works on basic GPS aircraft)");
    } catch (error) {
      console.log("[CarrierPlus] SimVar method not supported on this aircraft");
    }
  }

  // V1.0: Display all checkpoints coordinates for manual entry
  private showAllCheckpointsCoords(): void {
    const checkpoints = missionState.missionCheckpoints.get();
    const mission = missionState.activeMission.get();

    if (!checkpoints || checkpoints.length === 0) {
      console.log("[CarrierPlus] No checkpoints available");
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

  // V1.0: Copy all checkpoints to clipboard + show in console (F12)
  // Console F12 reste visible même quand on change d'app EFB
  private openFlightPlanHelper(): void {
    const mission = missionState.activeMission.get();
    const checkpoints = missionState.missionCheckpoints.get();

    if (!checkpoints || checkpoints.length === 0) {
      console.log("[CarrierPlus] No checkpoints to display");
      missionState.missionError.set(this.t("missions", "noCheckpoint"));
      return;
    }

    // Sort checkpoints by sequence
    const sortedCps = [...checkpoints].sort((a, b) => a.sequence - b.sequence);

    // Build clipboard text
    let clipboardText = `${this.t("missions", "flightPlanTitle")}: ${mission?.origin_icao} -> ${mission?.destination_icao}\n`;
    clipboardText += `Planificateur > Itineraire > En route > AJOUTER UN POINT\n`;
    clipboardText += `================================================\n`;
    clipboardText += `1. ${mission?.origin_icao} (DEPART)\n`;

    // Console output with colors
    console.log(`\n`);
    console.log(`%c╔══════════════════════════════════════════════════════════╗`, "color: #3b82f6; font-weight: bold; font-size: 12px;");
    console.log(`%c║  PLAN DE VOL: ${mission?.origin_icao} --> ${mission?.destination_icao}`, "color: #22c55e; font-size: 14px; font-weight: bold;");
    console.log(`%c║  Planificateur > Itineraire > En route > AJOUTER UN POINT`, "color: #9ca3af;");
    console.log(`%c╠══════════════════════════════════════════════════════════╣`, "color: #3b82f6; font-weight: bold;");
    console.log(`%c║  1. ${mission?.origin_icao} (DEPART)`, "color: #22c55e; font-weight: bold;");

    // Checkpoints
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

    // Destination
    console.log(`%c║  ${sortedCps.length + 2}. ${mission?.destination_icao} (ARRIVEE)`, "color: #22c55e; font-weight: bold;");
    clipboardText += `${sortedCps.length + 2}. ${mission?.destination_icao} (ARRIVEE)\n`;

    console.log(`%c╠══════════════════════════════════════════════════════════╣`, "color: #3b82f6; font-weight: bold;");
    console.log(`%c║  Garde F12 ouvert pour voir ce plan!`, "color: #60a5fa; font-weight: bold;");
    console.log(`%c╚══════════════════════════════════════════════════════════╝\n`, "color: #3b82f6; font-weight: bold;");

    // Copy all to clipboard
    try {
      if (navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(clipboardText);
        missionState.missionError.set(this.t("missions", "checkpointsCopied"));
        console.log(`%c[COPIE PRESSE-PAPIER OK]`, "color: #22c55e; font-weight: bold; background: #1a1a24; padding: 4px 8px;");
      }
    } catch (error) {
      missionState.missionError.set(this.t("missions", "openConsoleForCoords"));
      console.log("[CarrierPlus] Clipboard error:", error);
    }

    // Clear message after 5 seconds
    setTimeout(() => {
      const currentError = missionState.missionError.get();
      if (currentError?.includes("Checkpoints") || currentError?.includes("F12")) {
        missionState.missionError.set(null);
      }
    }, 5000);
  }

  // V1.0: Format coordinate for display (degrees minutes format)
  private formatCoordForPopup(decimal: number, isLat: boolean): string {
    const dir = isLat ? (decimal >= 0 ? 'N' : 'S') : (decimal >= 0 ? 'E' : 'W');
    const abs = Math.abs(decimal);
    const deg = Math.floor(abs);
    const min = ((abs - deg) * 60).toFixed(2);
    return `${dir}${deg} ${min}'`;
  }

  // V1.0: Copy checkpoint coordinates to clipboard
  private copyCheckpointCoords(lat: number, lon: number, cpName: string): void {
    const coordStr = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;

    try {
      // Try native clipboard
      if (navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(coordStr);
        popupState.popupNotification.set(`Copie: ${cpName}`);
        console.log(`[CarrierPlus] Copied to clipboard: ${coordStr}`);
      } else {
        // Fallback: just show notification
        popupState.popupNotification.set(`${cpName}: ${coordStr}`);
        console.log(`[CarrierPlus] Clipboard not available, coords: ${coordStr}`);
      }
    } catch (error) {
      popupState.popupNotification.set(`${cpName}: ${coordStr}`);
      console.log(`[CarrierPlus] Copy failed, coords: ${coordStr}`);
    }

    // Clear notification after 3 seconds
    setTimeout(() => {
      if (popupState.popupNotification.get().includes(cpName)) {
        popupState.popupNotification.set("");
      }
    }, 3000);
  }

  // V2.1: Set simulation rate
  private setSimRate(rate: number): void {
    // Only allow acceleration in cruise phase with AP active
    const canAccelerate = trackingState.trackingCanAccelerate.get();
    if (rate > 1 && !canAccelerate) {
      popupState.popupNotification.set(this.t("missions", "accelerationNotAvailable"));
      return;
    }

    try {
      // MSFS uses KEY_SIM_RATE to set simulation rate
      // Rate 1 = normal, 2 = 2x, 4 = 4x, etc.
      SimVar.SetSimVarValue("SIMULATION RATE", "number", rate);
      trackingState.trackingSimRate.set(rate);
      console.log("[CarrierPlus] Sim rate set to:", rate);
    } catch (e) {
      console.error("[CarrierPlus] Failed to set sim rate:", e);
    }
  }

  // NOTE: trackFlightV1() removed - all logic moved to TrackingManager.trackFlightV1()
  // The manager now handles: waypoint tracking, flight phase, progress, bonuses, ATC, mission completion

  // V1.0: Complete mission with modifier validation and XP breakdown
  private async completeMissionV1(): Promise<void> {
    this.stopFlightTracking();

    const token = authState.authToken.get();
    const mission = missionState.activeMission.get();
    // P2P mode doesn't require token
    if (!mission || (!authState.isP2PMode.get() && !token)) return;

    console.log("[CarrierPlus] V1.0: Completing mission with modifiers:", mission.id);

    try {
      // Calculate flight time
      const flightTimeMinutes = this.flightStartTime
        ? Math.round((Date.now() - this.flightStartTime.getTime()) / 60000)
        : 0;

      // V1.0: Calculate real-time tracking
      const realTimeSeconds = Math.floor((Date.now() - this.realTimeStartMs) / 1000);
      let simTimeSeconds = 0;
      try {
        const currentSimTime = SimVar.GetSimVarValue("E:ABSOLUTE TIME", "seconds") as number;
        simTimeSeconds = Math.floor(currentSimTime - this.simTimeStartSec);
      } catch (e) {
        simTimeSeconds = realTimeSeconds; // Fallback to real time
      }

      // Get current fuel percentage
      const fuelCapacity = SimVar.GetSimVarValue("FUEL TOTAL CAPACITY", "gallons") as number;
      const fuelQuantity = SimVar.GetSimVarValue("FUEL TOTAL QUANTITY", "gallons") as number;
      const fuelCurrentPercent = fuelCapacity > 0 ? (fuelQuantity / fuelCapacity) * 100 : 100;

      // Get autopilot usage
      const autopilotUsed = SimVar.GetSimVarValue("AUTOPILOT MASTER", "boolean") as boolean;

      // Get closest airport (final ICAO)
      const lat = simVarState.latitude.get();
      const lon = simVarState.longitude.get();
      let finalIcao = mission.destination_icao;

      try {
        const closest = await WorldRouter.getClosestAirport(lat, lon);
        if (closest) finalIcao = closest.ident;
      } catch (e) {
        console.log("[CarrierPlus] Could not get closest airport");
      }

      // Detect cheating
      const cheated = this.payloadVerificationDone &&
        this.payloadStartLbs > 0 &&
        Math.abs(this.payloadVerifiedLbs - this.payloadStartLbs) / this.payloadStartLbs > 0.05;

      // V2.0: Use GPS waypoints passed
      const waypointsPassed = missionState.waypointsPassed.get();
      const waypointsTotal = missionState.waypointsTotal.get();

      const result: MissionCompleteResponse = await MissionRouter.completeMissionV1(mission.id, {
        landing_fpm: this.landingFpm,
        max_gforce: this.maxGForce,
        final_icao: finalIcao,
        flight_time_seconds: flightTimeMinutes * 60,
        fuel_used_kg: 100 - fuelCurrentPercent,
        distance_flown_nm: 0,
        real_time_ratio: realTimeSeconds > 0 ? simTimeSeconds / realTimeSeconds : 1,
        cargo_actual_kg: trackingState.trackingCargoActual.get(),
        cargo_expected_kg: trackingState.trackingCargoExpected.get(),
        modifiers_validated: [],
        modifiers_failed: [],
      });

      // Update active mission status
      missionState.activeMission.set(null);
      // V1.6: Reset background tracking to prevent duplicate wear
      trackingManager.resetBackgroundTracking();

      // Reset V1.0 tracking state
      missionState.missionCheckpoints.set([]);
      missionState.checkpointsValidated.set(0);
      missionState.checkpointsTotal.set(0);
      missionState.nextCheckpoint.set(1);
      missionState.selectedModifiers.set([]);
      missionState.xpEstimate.set(null);

      // V1.0: Show mission recap with modifiers and XP breakdown
      missionState.missionRecapData.set({
        origin_icao: mission.origin_icao,
        destination_icao: mission.destination_icao,
        final_icao: finalIcao,
        distance_nm: 0,
        score_landing: result.scores?.landing || 0,
        score_gforce: result.scores?.gforce || 0,
        score_destination: result.scores?.destination || 0,
        score_time: result.scores?.time || 0,
        score_fuel: result.scores?.fuel || 0,
        score_total: result.score_total || 0,
        grade: result.grade || "F",
        xp_earned: result.xp_breakdown?.total_xp || 0,
        cheated: cheated,
        cheat_penalty_percent: cheated ? 50 : 0,
        landing_fpm: this.landingFpm,
        max_gforce: this.maxGForce,
        // V1.0: Additional data
        modifiers_validated: result.modifiers_validated || [],
        modifiers_failed: result.modifiers_failed || [],
        xp_breakdown: result.xp_breakdown || undefined,
        // V2.3: Enhanced recap data
        flight_time_minutes: flightTimeMinutes,
        fuel_remaining_percent: fuelCurrentPercent,
        cargo_weight_kg: mission.cargo_weight_kg || 0,
        atc_compliance: trackingState.trackingAtcCompliance.get(),
        atc_violations: trackingState.trackingAtcViolations.get(),
        landing_quality: trackingManager.getLandingQuality(this.landingFpm),
      });
      popupState.showMissionRecap.set(true);
      missionState.missionStatus.set("idle");
      missionState.missionError.set(null);

    } catch (error) {
      console.error("[CarrierPlus] V1.0 Error completing mission:", error);
      missionState.missionError.set(this.t("missions", "errorCompletingMission"));
    }
  }

  private updateMapPosition(): void {
    if (!mapManager.isInitialized()) return;

    const lat = simVarState.latitude.get();
    const lon = simVarState.longitude.get();
    const heading = simVarState.heading.get();

    if (lat === 0 && lon === 0) return;

    // V2.1: Delegate to MapManager
    mapManager.updateAircraftPosition(lat, lon, heading);
  }

  private centerMapOnAircraft(): void {
    if (!mapManager.isInitialized()) return;

    const lat = simVarState.latitude.get();
    const lon = simVarState.longitude.get();

    if (lat === 0 && lon === 0) return;

    // V2.1: Delegate to MapManager
    mapManager.centerOnAircraft(lat, lon);
  }

  private async searchAirportByIcao(): Promise<void> {
    const inputEl = this.icaoSearchInputRef.getOrDefault();
    if (!inputEl) return;

    const icao = inputEl.value.trim().toUpperCase();
    if (!icao || icao.length < 2) {
      mapState.icaoSearchError.set(this.t("missions", "enterIcaoMin2"));
      return;
    }

    mapState.icaoSearchStatus.set("loading");
    mapState.icaoSearchError.set(null);

    try {
      // V3.0: Use WorldRouter for P2P/network mode auto-switching
      const airport = await WorldRouter.getAirportByIcao(icao);

      if (!airport) {
        mapState.icaoSearchError.set(this.t("map", "airportNotFound"));
        mapState.icaoSearchStatus.set("error");
        return;
      }
      const airportLat = airport.latitude_deg || airport.lat || 0;
      const airportLon = airport.longitude_deg || airport.lon || 0;

      if (airportLat === 0 && airportLon === 0) {
        mapState.icaoSearchError.set(this.t("map", "invalidCoordinates"));
        mapState.icaoSearchStatus.set("error");
        return;
      }

      // Center map on the airport
      if (this.olMap) {
        this.olMap.getView().animate({
          center: fromLonLat([airportLon, airportLat]),
          zoom: 12,
          duration: 800,
        });
      }

      console.log(`[CarrierPlus] Centered on ${icao}: ${airport.name || ""} (${airportLat}, ${airportLon})`);
      mapState.icaoSearchStatus.set("success");

      // Clear input after successful search
      inputEl.value = "";

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("[CarrierPlus] ICAO search failed:", errorMsg);
      mapState.icaoSearchError.set(this.t("errors", "searchError"));
      mapState.icaoSearchStatus.set("error");
    }
  }

  private toggleLargeAirports(): void {
    const newState = !mapState.showLargeAirports.get();
    mapState.showLargeAirports.set(newState);

    // Ensure layer is visible
    if (newState) {
      mapManager.setAirportsVisible(true);
    }

    // Fetch airports for current view if turning on and no airports loaded yet
    if (newState && this.airportsSource && this.airportsSource.getFeatures().length === 0) {
      void this.fetchAirportsForMap();
    } else {
      this.filterAirportsOnMap();
    }

    // Hide layer if all airport types are off
    this.updateAirportsLayerVisibility();
  }

  private toggleMediumAirports(): void {
    const newState = !mapState.showMediumAirports.get();
    mapState.showMediumAirports.set(newState);

    // Ensure layer is visible
    if (newState) {
      mapManager.setAirportsVisible(true);
    }

    // Fetch airports for current view if turning on and no airports loaded yet
    if (newState && this.airportsSource && this.airportsSource.getFeatures().length === 0) {
      void this.fetchAirportsForMap();
    } else {
      this.filterAirportsOnMap();
    }

    // Hide layer if all airport types are off
    this.updateAirportsLayerVisibility();
  }

  private toggleSmallAirports(): void {
    const newState = !mapState.showSmallAirports.get();
    mapState.showSmallAirports.set(newState);

    // Ensure layer is visible
    if (newState) {
      mapManager.setAirportsVisible(true);
    }

    // Fetch airports for current view if turning on and no airports loaded yet
    if (newState && this.airportsSource && this.airportsSource.getFeatures().length === 0) {
      void this.fetchAirportsForMap();
    } else {
      this.filterAirportsOnMap();
    }

    // Hide layer if all airport types are off
    this.updateAirportsLayerVisibility();
  }

  private updateAirportsLayerVisibility(): void {
    const anyVisible = mapState.showLargeAirports.get() || mapState.showMediumAirports.get() || mapState.showSmallAirports.get();
    mapManager.setAirportsVisible(anyVisible);
  }

  private filterAirportsOnMap(): void {
    if (!this.airportsSource) return;

    const showLarge = mapState.showLargeAirports.get();
    const showMedium = mapState.showMediumAirports.get();
    const showSmall = mapState.showSmallAirports.get();

    this.airportsSource.getFeatures().forEach(feature => {
      const airportType = feature.get("type") as string;

      // Determine if this airport should be visible
      let visible = false;
      if (airportType === "large_airport") {
        visible = showLarge;
      } else if (airportType === "medium_airport") {
        visible = showMedium;
      } else if (airportType === "small_airport") {
        visible = showSmall;
      }
      // heliports, seaplane_base, closed are controlled by their own toggles (HELI)

      // Update style visibility
      const currentStyle = feature.getStyle();
      if (currentStyle && currentStyle instanceof Style) {
        const image = currentStyle.getImage();
        if (image) {
          image.setOpacity(visible ? 1 : 0);
        }
      }
    });

    // Force redraw
    this.airportsSource.changed();
  }

  private async fetchAirportsForMap(): Promise<void> {
    if (!mapManager.isInitialized()) return;

    const map = mapManager.getMap();
    if (!map) return;

    // Get current zoom level
    const zoom = map.getView().getZoom() || 7;

    // Get visible bounds from the map view (not aircraft position)
    let bounds = mapManager.getVisibleBounds();

    // Fallback to aircraft position if no bounds available
    if (!bounds) {
      const lat = simVarState.latitude.get();
      const lon = simVarState.longitude.get();
      if (lat === 0 && lon === 0) return;

      const delta = 8;
      bounds = { minLat: lat - delta, maxLat: lat + delta, minLon: lon - delta, maxLon: lon + delta };
    }

    // Add padding to load slightly more than visible (better UX when panning)
    const latPadding = (bounds.maxLat - bounds.minLat) * 0.3;
    const lonPadding = (bounds.maxLon - bounds.minLon) * 0.3;
    const minLat = bounds.minLat - latPadding;
    const maxLat = bounds.maxLat + latPadding;
    const minLon = bounds.minLon - lonPadding;
    const maxLon = bounds.maxLon + lonPadding;

    // Set loading status
    mapState.largeAirportsStatus.set("loading");
    mapState.mediumAirportsStatus.set("loading");
    mapState.smallAirportsStatus.set("loading");

    try {
      // ZOOM-BASED LOADING STRATEGY
      // Zoom < 7  : large only (500 max)
      // Zoom 7-9  : large + medium (2000 max)
      // Zoom 9-11 : large + medium + small (6000 max)
      // Zoom > 11 : all types (7000 max)

      const promises: Promise<Array<{ ident: string; name: string; type: string; latitude_deg: number; longitude_deg: number; elevation_ft?: number; municipality?: string; iso_country?: string }>>[] = [];

      // Always load large airports
      promises.push(WorldRouter.getAirportsInBounds(minLat, maxLat, minLon, maxLon, "large_airport", 500));

      // Medium airports at zoom >= 7
      if (zoom >= 7) {
        promises.push(WorldRouter.getAirportsInBounds(minLat, maxLat, minLon, maxLon, "medium_airport", 1500));
      }

      // Small airports at zoom >= 9
      if (zoom >= 9) {
        promises.push(WorldRouter.getAirportsInBounds(minLat, maxLat, minLon, maxLon, "small_airport", 4000));
      }

      const results = await Promise.all(promises);
      const airports = results.flat();

      console.log(`[CarrierPlus] Zoom ${zoom.toFixed(1)} - Fetched ${airports.length} airports (L:${results[0]?.length || 0} M:${results[1]?.length || 0} S:${results[2]?.length || 0})`);

      // Update last loaded zoom
      this.lastLoadedZoom = zoom;

      // V2.1: Delegate feature creation to MapManager
      mapManager.loadAirports(airports);

      mapState.largeAirportsStatus.set("success");
      mapState.mediumAirportsStatus.set("success");
      mapState.smallAirportsStatus.set("success");

      // Save loaded bounds for comparison on next move
      mapManager.setLastLoadedBounds({ minLat, maxLat, minLon, maxLon });

      // Apply filters after loading
      this.filterAirportsOnMap();

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("[CarrierPlus] Fetch airports for map FAILED:", errorMsg);
      mapState.largeAirportsStatus.set("error");
      mapState.mediumAirportsStatus.set("error");
      mapState.smallAirportsStatus.set("error");
    }
  }

  private toggleFactoriesOnMap(): void {
    const newState = !mapState.showFactoriesOnMap.get();
    mapState.showFactoriesOnMap.set(newState);

    mapManager.setFactoriesVisible(newState);

    // Fetch factories when toggling on
    if (newState) {
      this.fetchFactoriesForMap();
    }
  }

  private fetchFactoriesForMap(): void {
    if (!mapManager.isInitialized()) return;

    // P2P: Factories are not available in P2P mode (network-only feature)
    console.log("[CarrierPlus] P2P mode - factories not available");
    mapManager.loadFactories([]);
    mapState.factoriesOnMapStatus.set("success");
  }

  private toggleHelipadsOnMap(): void {
    const newState = !mapState.showHelipadsOnMap.get();
    mapState.showHelipadsOnMap.set(newState);

    mapManager.setHelipadsVisible(newState);

    // Fetch helipads when toggling on
    if (newState) {
      this.fetchHelipadsForMap();
    }
  }

  private async fetchHelipadsForMap(): Promise<void> {
    if (!mapManager.isInitialized()) return;

    const map = mapManager.getMap();
    const zoom = map?.getView().getZoom() || 7;

    // Only load helipads at zoom > 10 (too many to show zoomed out)
    if (zoom < 10) {
      console.log(`[CarrierPlus] Zoom ${zoom.toFixed(1)} too low for helipads`);
      mapManager.loadHelipads([]);
      mapState.helipadsOnMapStatus.set("success");
      return;
    }

    // Use visible bounds instead of aircraft position
    let bounds = mapManager.getVisibleBounds();
    if (!bounds) {
      const lat = simVarState.latitude.get();
      const lon = simVarState.longitude.get();
      if (lat === 0 && lon === 0) return;
      const delta = 4;
      bounds = { minLat: lat - delta, maxLat: lat + delta, minLon: lon - delta, maxLon: lon + delta };
    }

    mapState.helipadsOnMapStatus.set("loading");

    // Add padding
    const latPadding = (bounds.maxLat - bounds.minLat) * 0.2;
    const lonPadding = (bounds.maxLon - bounds.minLon) * 0.2;
    const minLat = bounds.minLat - latPadding;
    const maxLat = bounds.maxLat + latPadding;
    const minLon = bounds.minLon - lonPadding;
    const maxLon = bounds.maxLon + lonPadding;

    try {
      // V3.0: Use WorldRouter for P2P/network mode auto-switching
      const helipads = await WorldRouter.getAirportsInBounds(minLat, maxLat, minLon, maxLon, "heliport", 1000);
      console.log(`[CarrierPlus] Zoom ${zoom.toFixed(1)} - Fetched ${helipads.length} helipads`);

      // V2.1: Delegate feature creation to MapManager
      mapManager.loadHelipads(helipads);

      mapState.helipadsOnMapStatus.set("success");

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("[CarrierPlus] Fetch helipads for map FAILED:", errorMsg);
      mapState.helipadsOnMapStatus.set("error");
    }
  }

  private async fetchInventory(type: "player" | "company"): Promise<void> {
    inventoryState.inventoryType.set(type);
    console.log(`[CarrierPlus] Fetching ${type} inventory...`);
    inventoryState.inventoryStatus.set("loading");
    inventoryState.inventoryError.set(null);

    try {
      // P2P: Use MarketRouter for local inventory
      const items = type === "player"
        ? await MarketRouter.getPlayerInventory()
        : await MarketRouter.getCompanyInventory();

      console.log(`[CarrierPlus] ${type} Inventory:`, items);

      this.inventoryItems = items.map((item: { item_id?: string; item_name?: string; item_type?: string; qty?: number; quantity?: number; airport_ident?: string; airport_icao?: string }) => ({
        id: 0,
        item_type: item.item_name || item.item_type || "unknown",
        quantity: item.qty || item.quantity || 0,
        airport_icao: item.airport_ident || item.airport_icao || "----",
      }));

      inventoryState.inventoryStatus.set("success");
      this.renderInventoryList();

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[CarrierPlus] ${type} Inventory FAILED:`, errorMsg);
      inventoryState.inventoryStatus.set("error");
      inventoryState.inventoryError.set(errorMsg);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // COMPANY DATA
  // ═══════════════════════════════════════════════════════════

  private async fetchCompanyData(): Promise<void> {
    const token = authState.authToken.get();
    // P2P mode doesn't require token
    if (!authState.isP2PMode.get() && !token) return;

    companyState.companyLoading.set(true);

    try {
      // Fetch company info
      const company = await MarketRouter.getCompanyInfo();
      if (!company) {
        companyState.companyData.set(null);
        companyState.companyLoading.set(false);
        return;
      }
      companyState.companyData.set(company);
      console.log("[CarrierPlus] Company loaded:", company);

      // Fetch members and fleet in parallel
      const [members, fleet] = await Promise.all([
        MarketRouter.getCompanyMembers().catch(() => []),
        FleetRouter.getFleet().catch(() => []),
      ]);
      companyState.companyMembers.set(members);
      companyState.companyFleet.set(fleet);
      console.log("[CarrierPlus] Members loaded:", members.length, "Fleet loaded:", fleet.length);

      this.renderCompanyTab();

    } catch (error) {
      console.error("[CarrierPlus] Error fetching company data:", error);
      companyState.companyData.set(null);
    } finally {
      companyState.companyLoading.set(false);
    }
  }

  private renderCompanyTab(): void {
    const membersEl = this.companyMembersRef.getOrDefault();
    if (membersEl) {
      membersEl.innerHTML = renderCompanyMembersHtml(companyState.companyMembers.get(), this.t("company", "noMember"));
    }
    const fleetEl = this.companyFleetRef.getOrDefault();
    if (fleetEl) {
      fleetEl.innerHTML = renderCompanyFleetHtml(companyState.companyFleet.get(), this.t("company", "noAircraft"));
    }
  }

  /**
   * Handle buying a company (P2P mode only)
   * Cost: 50,000 credits
   */
  private async handleBuyCompany(): Promise<void> {
    // Only available in P2P mode
    if (!authState.isP2PMode.get()) {
      console.log("[CarrierPlus] Buy company only available in P2P mode");
      return;
    }

    const companyName = companyState.buyCompanyName.get().trim();
    if (!companyName) {
      companyState.buyCompanyError.set(this.t("company", "enterCompanyName") || "Please enter a company name");
      return;
    }

    companyState.buyCompanyLoading.set(true);
    companyState.buyCompanyError.set(null);

    try {
      // Use InitService to purchase company
      const company = await InitService.purchaseCompany(companyName);
      console.log("[CarrierPlus] Company purchased:", company.name);

      // Update state
      companyState.companyData.set({
        id: company.id,
        name: company.name,
        balance: company.balance,
        created_at: company.created_at,
        home_airport_ident: "",
      });

      // Update wallet balance (deduct 50,000)
      const player = await InitService.getPlayerInfo();
      if (player) {
        marketState.walletPersonal.set(player.money);
      }

      // Clear form
      companyState.buyCompanyName.set("");

      // Refresh company tab
      void this.fetchCompanyData();

    } catch (error) {
      console.error("[CarrierPlus] Error buying company:", error);
      const errorMsg = error instanceof Error ? error.message : "Failed to purchase company";
      companyState.buyCompanyError.set(errorMsg);
    } finally {
      companyState.buyCompanyLoading.set(false);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // MARKET (HV) DATA
  // ═══════════════════════════════════════════════════════════

  private async fetchMarketData(): Promise<void> {
    const token = authState.authToken.get();
    // P2P mode doesn't require token
    if (!authState.isP2PMode.get() && !token) return;

    marketState.marketLoading.set(true);
    marketState.marketError.set(null);

    try {
      // Fetch data in parallel
      const tierFilter = marketState.marketTierFilter.get();
      const [walletBalance, company, listings] = await Promise.all([
        MarketRouter.getCompanyInfo().then(c => c?.balance || 0).catch(() => 0),
        !companyState.companyData.get() ? MarketRouter.getCompanyInfo() : Promise.resolve(companyState.companyData.get()),
        MarketRouter.getMarketListings(tierFilter, 100),
      ]);

      marketState.walletPersonal.set(walletBalance);
      if (company && !companyState.companyData.get()) {
        companyState.companyData.set(company);
      }
      marketState.marketListings.set(listings);
      console.log("[CarrierPlus] Market loaded:", listings.length, "listings");

      this.renderMarketTab();

    } catch (error) {
      console.error("[CarrierPlus] Error fetching market data:", error);
      marketState.marketError.set(this.t("market", "errorLoadingMarket"));
    } finally {
      marketState.marketLoading.set(false);
    }
  }

  private renderMarketTab(): void {
    const listingsEl = this.marketListingsRef.getOrDefault();
    if (!listingsEl) return;

    const listings = marketState.marketListings.get();
    listingsEl.innerHTML = renderMarketListingsHtml(listings, this.t("market", "noOfferAvailable"), this.t("hangar", "availableShort"));

    // Add click handlers for each listing
    listingsEl.querySelectorAll(".market-listing-item").forEach(el => {
      el.addEventListener("click", () => {
        const locationId = el.getAttribute("data-location-id");
        const itemId = el.getAttribute("data-item-id");
        if (locationId && itemId) this.openMarketBuyPopup(locationId, itemId);
      });
    });
  }

  private openMarketBuyPopup(locationId: string, itemId: string): void {
    const listings = marketState.marketListings.get();
    const item = listings.find(l => l.location_id === locationId && l.item_id === itemId);

    if (!item) {
      console.error("[CarrierPlus] Market item not found");
      return;
    }

    marketState.marketBuyItem.set({
      location_id: item.location_id,
      airport_ident: item.airport_ident,
      company_name: item.company_name,
      item_id: item.item_id,
      item_code: item.item_code,
      item_name: item.item_name,
      item_tier: item.item_tier,
      sale_price: item.sale_price,
      sale_qty: item.sale_qty,
    });
    marketState.marketBuyQty.set(1);
    marketState.marketBuyTotal.set(item.sale_price);
    marketState.marketBuyWallet.set("company");
    marketState.showMarketBuyPopup.set(true);

    // Update slider max
    setTimeout(() => {
      const slider = this.marketBuyQtySliderRef.getOrDefault();
      if (slider) {
        slider.max = item.sale_qty.toString();
        slider.value = "1";
      }
    }, 50);
  }

  private closeMarketBuyPopup(): void {
    marketState.showMarketBuyPopup.set(false);
    marketState.marketBuyItem.set(null);
  }

  private updateMarketBuyQty(qty: number): void {
    const item = marketState.marketBuyItem.get();
    if (!item) return;

    qty = Math.max(1, Math.min(qty, item.sale_qty));
    marketState.marketBuyQty.set(qty);
    marketState.marketBuyTotal.set(item.sale_price * qty);

    const qtyDisplay = this.marketBuyQtyDisplayRef.getOrDefault();
    if (qtyDisplay) {
      qtyDisplay.textContent = qty.toString();
    }
  }

  private async confirmMarketBuy(): Promise<void> {
    const token = authState.authToken.get();
    const item = marketState.marketBuyItem.get();
    if (!token || !item) return;

    const qty = marketState.marketBuyQty.get();
    const wallet = marketState.marketBuyWallet.get();
    const totalCost = item.sale_price * qty;

    // Check balance
    if (wallet === "player") {
      if (marketState.walletPersonal.get() < totalCost) {
        marketState.marketError.set(this.t("market", "insufficientPersonalBalance"));
        this.closeMarketBuyPopup();
        return;
      }
    } else {
      const company = companyState.companyData.get();
      if (!company || company.balance < totalCost) {
        marketState.marketError.set(this.t("market", "insufficientCompanyBalance"));
        this.closeMarketBuyPopup();
        return;
      }
    }

    try {
      await MarketRouter.buyItem(item.location_id, item.item_id, qty, wallet);
      console.log("[CarrierPlus] Market buy success:", qty, "x", item.item_name);

      // Close popup and refresh
      this.closeMarketBuyPopup();
      marketState.marketError.set(null);
      void this.fetchMarketData();

    } catch (error) {
      console.error("[CarrierPlus] Market buy error:", error);
      marketState.marketError.set(error instanceof Error ? error.message : this.t("market", "errorPurchasing"));
      this.closeMarketBuyPopup();
    }
  }

  public render(): VNode {
    return (
      <div style="display: flex; width: 100%; height: 100%; background: #1a1a24; color: white; font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;">
        {/* Left Sidebar - Specs v0.9 Order */}
        <div style="width: 40px; background: #252532; display: flex; flex-direction: column; justify-content: space-between; border-right: 1px solid #374151; flex-shrink: 0;">
          {/* Main Navigation Tabs - V2.3: Using SidebarTab component */}
          <div style="display: flex; flex-direction: column; padding-top: 50px;">
            {renderSidebarTab({ tabId: "profile", activeTab: navigationState.activeTab, onClick: () => navigationState.activeTab.set("profile") })}
            {renderSidebarTab({ tabId: "map", activeTab: navigationState.activeTab, onClick: () => navigationState.activeTab.set("map") })}
            {renderSidebarTab({ tabId: "missions", activeTab: navigationState.activeTab, onClick: () => navigationState.activeTab.set("missions") })}
            {renderSidebarTab({ tabId: "company", activeTab: navigationState.activeTab, onClick: () => navigationState.activeTab.set("company") })}
            {renderSidebarTab({ tabId: "market", activeTab: navigationState.activeTab, onClick: () => navigationState.activeTab.set("market") })}
            {renderSidebarTab({ tabId: "hangar", activeTab: navigationState.activeTab, onClick: () => navigationState.activeTab.set("hangar") })}
          </div>{/* End Main Navigation Tabs */}

          {/* Settings Button - Bottom */}
          <div style="padding-bottom: 8px;">
            {renderSidebarTab({ tabId: "settings", activeTab: navigationState.activeTab, onClick: () => navigationState.activeTab.set("settings") })}
          </div>

        </div>

        {/* Content Area */}
        <div style="flex: 1; overflow: hidden; position: relative; display: flex; flex-direction: column;">
          {/* App Header Bar with Profile */}
          <div style="display: flex; justify-content: center; align-items: center; padding: 6px 12px; background: #1a1a24; border-bottom: 1px solid #374151; flex-shrink: 0; position: relative;">
            {/* App Title - Left */}
            <div style="position: absolute; left: 12px; display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 11px; font-weight: 600; color: #60a5fa;">Carrier+</span>
              <span style="font-size: 8px; color: #6b7280;">v0.9</span>
            </div>

            {/* Profile Button - Centered with offset to the left */}
            <div style="margin-right: 60px;">
              <Button callback={(): void => this.toggleLoginPanel()}>
                <div style={authState.isLoggedIn.map(logged => logged
                  ? "display: flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 16px; background: rgba(34, 197, 94, 0.25); border: 1px solid #22c55e;"
                  : "display: flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 16px; background: rgba(55, 65, 81, 0.5); border: 1px solid #374151;")}>
                  <svg style="width: 14px; height: 14px; min-width: 14px; min-height: 14px; flex-shrink: 0;" viewBox="0 0 24 24" fill="none" stroke={authState.isLoggedIn.map(l => l ? "#22c55e" : "#9ca3af")} stroke-width="1.5">
                    <circle cx="12" cy="8" r="4"/>
                    <path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>
                  </svg>
                  <span style={authState.isLoggedIn.map(l => l ? "font-size: 10px; color: #22c55e; font-weight: 500;" : "font-size: 10px; color: #9ca3af;")}>
                    {MappedSubject.create(([loggedIn, lang]) => loggedIn ? "" : translations[lang].login.login, authState.isLoggedIn, settingsState.currentLanguage)}
                    {authState.currentUser.map(u => u ? u.username : "")}
                  </span>
                </div>
              </Button>
            </div>
          </div>

          {/* Login Panel Overlay - V2.3: Extracted to LoginPanel component */}
          {renderLoginPanel({
            showLoginPanel: authState.showLoginPanel,
            isLoggedIn: authState.isLoggedIn,
            currentUser: authState.currentUser,
            loginError: authState.loginError,
            loginLoading: authState.loginLoading,
            currentLanguage: settingsState.currentLanguage,
            emailInputRef: this.emailInputRef,
            passwordInputRef: this.passwordInputRef,
            onLogin: () => this.doLogin(),
            onLogout: () => this.askLogout(),
          })}

          {/* Logout Confirmation Popup - V2.3: Extracted to LogoutConfirmPopup component */}
          {renderLogoutConfirmPopup({
            showLogoutConfirm: authState.showLogoutConfirm,
            currentLanguage: settingsState.currentLanguage,
            onCancel: () => this.cancelLogout(),
            onConfirm: () => this.confirmLogout(),
          })}

          {/* P2P: First Launch Welcome Popup */}
          {renderWelcomePopup({
            showPopup: authState.showFirstLaunchPopup,
            pilotName: authState.firstLaunchPilotName,
            nationality: authState.firstLaunchNationality,
            startingAirport: authState.firstLaunchAirport,
            airportValid: authState.firstLaunchAirportValid,
            currentLanguage: settingsState.currentLanguage,
            pilotNameInputRef: this.welcomePilotNameRef,
            airportInputRef: this.welcomeAirportRef,
            onValidate: () => this.completeFirstLaunchSetup(),
          })}

          {/* Tab Content Container */}
          <div style="flex: 1; overflow: hidden; position: relative;">
          {/* Profile Tab Content - V1.8: Extracted to ProfileView.tsx */}
          {renderProfileTab({
            activeTab: navigationState.activeTab as Subject<string>,
            profileSubTab: navigationState.profileSubTab,
            currentLanguage: settingsState.currentLanguage,
            currentUser: authState.currentUser,
            onGround: simVarState.onGround,
            closestAirport: simVarState.closestAirport,
          })}

          {/* Missions Tab Content - V1.9: Extracted to MissionsView.tsx */}
          {renderMissionsTab({
            activeTab: navigationState.activeTab as Subject<string>,
            missionsSubTab: navigationState.missionsSubTab,
            currentLanguage: settingsState.currentLanguage,
            isLoggedIn: authState.isLoggedIn,
            activeMission: missionState.activeMission,
            trackingProgressPercent: trackingState.trackingProgressPercent,
            trackingDistanceFlown: trackingState.trackingDistanceFlown,
            missionDistanceNm: missionState.missionDistanceNm,
            flightPhaseColor: checkpointState.flightPhaseColor,
            flightPhaseText: checkpointState.flightPhaseText,
            flightPhaseId: checkpointState.flightPhaseId,
            trackingCurrentAltitude: trackingState.trackingCurrentAltitude,
            trackingCanAccelerate: trackingState.trackingCanAccelerate,
            trackingBonusNight: trackingState.trackingBonusNight,
            trackingBonusCargo: trackingState.trackingBonusCargo,
            trackingBonusEco: trackingState.trackingBonusEco,
            trackingBonusRealTime: trackingState.trackingBonusRealTime,
            trackingTimeRatio: trackingState.trackingTimeRatio,
            trackingAtcCompliance: trackingState.trackingAtcCompliance,
            trackingAtcViolations: trackingState.trackingAtcViolations,
            trackingCargoActual: trackingState.trackingCargoActual,
            trackingCargoExpected: trackingState.trackingCargoExpected,
            trackingFuelUsed: trackingState.trackingFuelUsed,
            trackingFuelMax: trackingState.trackingFuelMax,
            gForce: simVarState.gForce,
            trackingFuelPercent: trackingState.trackingFuelPercent,
            waypointsPassed: missionState.waypointsPassed,
            waypointsTotal: missionState.waypointsTotal,
            trackingRealTime: trackingState.trackingRealTime,
            trackingSimTime: trackingState.trackingSimTime,
            creationStep1Valid: missionCreationState.creationStep1Valid,
            missionOriginIcao: missionState.missionOriginIcao,
            currentSimAircraftReg: simVarState.currentSimAircraftReg,
            missionCurrentAircraft: missionState.missionCurrentAircraft,
            missionAircraftSystems: missionState.missionAircraftSystems,
            missionAircraftInfoRef: this.missionAircraftInfoRef,
            creationStep2Valid: missionCreationState.creationStep2Valid,
            cargoValidated: missionCreationState.cargoValidated,
            selectedAircraftId: missionState.selectedAircraftId,
            aircraftCargoWeight: cargoState.aircraftCargoWeight,
            aircraftCargoCapacity: cargoState.aircraftCargoCapacity,
            cargoLoading: cargoState.cargoLoading,
            airportInventoryRef: this.airportInventoryRef,
            aircraftCargoRef: this.aircraftCargoRef,
            creationStep3Valid: missionCreationState.creationStep3Valid,
            fpValidated: missionCreationState.fpValidated,
            fpHasActivePlan: missionCreationState.fpHasActivePlan,
            fpWaypointCount: missionCreationState.fpWaypointCount,
            fpTotalDistance: missionCreationState.fpTotalDistance,
            fpOriginIcao: missionCreationState.fpOriginIcao,
            fpDestinationIcao: missionCreationState.fpDestinationIcao,
            fpCanValidate: missionCreationState.fpCanValidate,
            fpDestinationInputRef: this.fpDestinationInputRef,
            missionStatus: missionState.missionStatus,
            missionError: missionState.missionError,
            creationErrorMsg: missionCreationState.creationErrorMsg,
            canCreateMissionFlag: missionCreationState.canCreateMissionFlag,
            showCargoPopup: cargoState.showCargoPopup,
            cargoPopupDirection: cargoState.cargoPopupDirection,
            cargoPopupItem: cargoState.cargoPopupItem as Subject<CargoPopupItem | null>,
            cargoPopupSliderRef: this.cargoPopupSliderRef,
            cargoPopupQtyRef: this.cargoPopupQtyRef,
            showMissionRecap: popupState.showMissionRecap,
            missionRecapData: missionState.missionRecapData,
            onCancelMission: () => this.cancelMission(),
            onValidateCargoStep: () => this.validateCargoStep(),
            onModifyCargoStep: () => this.modifyCargoStep(),
            onReadFlightPlanFromGPS: () => this.readFlightPlanFromGPS(),
            onValidateFlightPlan: () => this.validateFlightPlan(),
            onModifyFlightPlan: () => this.modifyFlightPlan(),
            onCloseCargoPopup: () => this.closeCargoPopup(),
            onConfirmCargoTransfer: () => this.confirmCargoTransfer(),
            onCreateMission: () => this.createMissionV11(),
            t: (cat: string, key: string) => this.t(cat as keyof typeof translations["fr"], key),
          })}

          {/* Inventaire Tab Content - V1.8: Extracted to InventoryView.tsx */}
          {renderInventoryTab({
            activeTab: navigationState.activeTab as Subject<string>,
            currentLanguage: settingsState.currentLanguage,
            isLoggedIn: authState.isLoggedIn,
            inventoryType: inventoryState.inventoryType,
            inventoryStatus: inventoryState.inventoryStatus,
            inventoryError: inventoryState.inventoryError,
            inventoryListRef: this.inventoryListRef,
            onFetchInventory: (type: "player" | "company") => this.fetchInventory(type),
          })}

          {/* Company Tab Content - V1.8: Extracted to CompanyView.tsx */}
          {renderCompanyTab({
            activeTab: navigationState.activeTab as Subject<string>,
            currentLanguage: settingsState.currentLanguage,
            isLoggedIn: authState.isLoggedIn,
            isP2PMode: authState.isP2PMode,
            companySubTab: navigationState.companySubTab,
            companyLoading: companyState.companyLoading,
            companyData: companyState.companyData,
            companyMembers: companyState.companyMembers,
            companyFleet: companyState.companyFleet,
            companyMembersRef: this.companyMembersRef,
            companyFleetRef: this.companyFleetRef,
            // Buy company (P2P mode)
            playerMoney: marketState.walletPersonal,
            buyCompanyName: companyState.buyCompanyName,
            buyCompanyLoading: companyState.buyCompanyLoading,
            buyCompanyError: companyState.buyCompanyError,
            onBuyCompany: () => { void this.handleBuyCompany(); },
            t: (cat: string, key: string) => this.t(cat as keyof TranslationKeys, key),
          })}

          {/* Market (HV) Tab Content - V1.8: Extracted to MarketView.tsx */}
          {renderMarketTab({
            activeTab: navigationState.activeTab as Subject<string>,
            currentLanguage: settingsState.currentLanguage,
            isLoggedIn: authState.isLoggedIn,
            walletPersonal: marketState.walletPersonal,
            companyData: companyState.companyData,
            marketTierFilter: marketState.marketTierFilter,
            marketError: marketState.marketError,
            marketLoading: marketState.marketLoading,
            marketListings: marketState.marketListings,
            marketListingsRef: this.marketListingsRef,
            showMarketBuyPopup: marketState.showMarketBuyPopup,
            marketBuyItem: marketState.marketBuyItem,
            marketBuyQty: marketState.marketBuyQty,
            marketBuyTotal: marketState.marketBuyTotal,
            marketBuyWallet: marketState.marketBuyWallet,
            marketBuyQtySliderRef: this.marketBuyQtySliderRef,
            marketBuyQtyDisplayRef: this.marketBuyQtyDisplayRef,
            onFetchMarketData: () => { void this.fetchMarketData(); },
            onUpdateMarketBuyQty: (qty: number) => this.updateMarketBuyQty(qty),
            onCloseMarketBuyPopup: () => this.closeMarketBuyPopup(),
            onConfirmMarketBuy: () => { void this.confirmMarketBuy(); },
          })}

          {/* Hangar Tab Content - V1.8: Extracted to HangarView.tsx */}
          {renderHangarTab({
            activeTab: navigationState.activeTab as Subject<string>,
            currentLanguage: settingsState.currentLanguage,
            isLoggedIn: authState.isLoggedIn,
            hangarLoading: hangarState.hangarLoading,
            hangarSelectedAircraft: hangarState.hangarSelectedAircraft,
            hangarFilterRef: this.hangarFilterRef,
            hangarListRef: this.hangarListRef,
            hangarCargoListRef: this.hangarCargoListRef,
            hangarSystemsListRef: this.hangarSystemsListRef,
            hangarEditRegPopupOpen: popupState.hangarEditRegPopupOpen,
            hangarEditRegInputRef: this.hangarEditRegInputRef,
            hangarRepairPopupOpen: popupState.hangarRepairPopupOpen,
            hangarRepairListRef: this.hangarRepairListRef,
            hangarRepairQuote: hangarState.hangarRepairQuote,
            onFetchHangarAircraftList: () => { void this.fetchHangarAircraftList(); },
            onSyncFuelFromSimulator: () => { void this.syncFuelFromSimulator(); },
            onOpenRefuelPopup: () => this.openRefuelPopup(),
            onOpenEditRegistrationPopup: () => this.openEditRegistrationPopup(),
            onUpdateAircraftRegistration: () => { void this.updateAircraftRegistration(); },
            onOpenRepairPopup: () => this.openRepairPopup(),
            onPerformRepair: (aircraftId: string, systems: string[], wallet: "player" | "company") => { void this.performRepair(aircraftId, systems, wallet); },
          })}

          {/* Settings Tab Content - V1.7: Extracted to SettingsView.tsx */}
          {renderSettingsTab({
            activeTab: navigationState.activeTab as Subject<string>,
            currentLanguage: settingsState.currentLanguage,
            isLoggedIn: authState.isLoggedIn,
            currentUser: authState.currentUser,
            settingsCredentialsSaved: authState.settingsCredentialsSaved,
            settingsEmailInputRef: this.settingsEmailInputRef,
            settingsPasswordInputRef: this.settingsPasswordInputRef,
            onSetLanguage: (lang: Language) => this.setLanguage(lang),
            onSaveCredentials: () => this.saveSettingsCredentials(),
            onLogout: () => this.askLogout(),
          })}

          {/* Map Tab Content - V1.8: Extracted to MapView.tsx */}
          {renderMapTab({
            activeTab: navigationState.activeTab as Subject<string>,
            currentLanguage: settingsState.currentLanguage,
            mapContainerRef: this.mapContainerRef,
            mapError: mapState.mapError,
            showLargeAirports: mapState.showLargeAirports,
            showMediumAirports: mapState.showMediumAirports,
            showSmallAirports: mapState.showSmallAirports,
            showFactoriesOnMap: mapState.showFactoriesOnMap,
            showHelipadsOnMap: mapState.showHelipadsOnMap,
            largeAirportsStatus: mapState.largeAirportsStatus,
            mediumAirportsStatus: mapState.mediumAirportsStatus,
            smallAirportsStatus: mapState.smallAirportsStatus,
            factoriesOnMapStatus: mapState.factoriesOnMapStatus,
            helipadsOnMapStatus: mapState.helipadsOnMapStatus,
            icaoSearchInputRef: this.icaoSearchInputRef,
            icaoSearchStatus: mapState.icaoSearchStatus,
            icaoSearchError: mapState.icaoSearchError,
            showAirportsSidebar: mapState.showAirportsSidebar,
            nearbyAirportsStatus: mapState.nearbyAirportsStatus,
            nearbyAirportsListRef: this.nearbyAirportsListRef,
            selectedAirport: mapState.selectedAirport,
            destinationAirport: mapState.destinationAirport,
            availableSlotsAtAirport: mapState.availableSlotsAtAirport,
            myFactoriesAtAirport: mapState.myFactoriesAtAirport,
            onCenterMapOnAircraft: () => this.centerMapOnAircraft(),
            onToggleLargeAirports: () => this.toggleLargeAirports(),
            onToggleMediumAirports: () => this.toggleMediumAirports(),
            onToggleSmallAirports: () => this.toggleSmallAirports(),
            onToggleFactoriesOnMap: () => this.toggleFactoriesOnMap(),
            onToggleHelipadsOnMap: () => this.toggleHelipadsOnMap(),
            onSearchAirportByIcao: () => { void this.searchAirportByIcao(); },
            onFetchNearbyAirports: () => this.fetchNearbyAirports(),
            onOpenCreateFactory: (airport) => this.openCreateFactory(airport),
            onOpenManageFactory: (factory) => this.openManageFactory(factory),
            onSetDestinationAirport: (airport) => this.setDestinationAirport(airport),
            t: (category: string, key: string) => this.t(category as keyof TranslationKeys, key),
          })}

          </div>{/* End Tab Content Container */}
        </div>

        {/* V1.3: Refuel Popup (rendered via ref) */}
        <div ref={this.refuelPopupRef} style={popupState.showRefuelPopup.map(show => show ? "display: block;" : "display: none;")}>
        </div>

        {/* V1.4: Systems Detail Popup (rendered via ref) */}
        <div ref={this.systemsPopupRef} style={popupState.showSystemsPopup.map(show => show ? "display: block;" : "display: none;")}>
        </div>
      </div>
    );
  }
}

class CarrierPlusApp extends App {
  public get name(): string {
    return "MFS Carrier+";
  }

  public get icon(): string {
    return `${BASE_URL}/Assets/app-icon.svg`;
  }

  public BootMode = AppBootMode.WARM;
  public SuspendMode = AppSuspendMode.SLEEP;

  public async install(_props: AppInstallProps): Promise<void> {
    Efb.loadCss(`${BASE_URL}/CarrierPlus.css`);
    return Promise.resolve();
  }

  public get compatibleAircraftModels(): string[] | undefined {
    return undefined;
  }

  public render(): TVNode<CarrierPlusView> {
    return <CarrierPlusView bus={this.bus} />;
  }
}

Efb.use(CarrierPlusApp);
