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
  Efb,
  RequiredProps,
  TVNode,
} from "@efb/efb-api";
import { FSComponent, VNode, Subject, MappedSubject } from "@microsoft/msfs-sdk";

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

import "./WorldOfAircraft.scss";

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
import { trackingManager, mapManager, missionCreationManager, freeFlightManager, PersistenceManager, popupManager } from "./managers";
import type { FlightPlanData, PayloadState } from "./managers";

// P2P: Local database initialization and AI economy
import { InitService, AIEconomyService } from "./services";
import { DatabaseManager } from "./managers/DatabaseManager";

// V2.1: Sync services for hybrid online/offline mode
import { SyncService } from "./services/SyncService";
import { SyncManager } from "./services/SyncManager";
import { NetworkState } from "./state/NetworkState";
import { NativePersistence } from "./services/NativePersistence";

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
  renderWelcomePopup,
  // SEED Connection
  renderConnectionScreen,
  // V3.0: Mode Selection
  renderModeSelectionScreen,
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
  gameModeState,
  showModeSelector,
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

// V3.0: Declare MSFS native persistence API
declare function GetStoredData(key: string): string;
declare function SetStoredData(key: string, value: string): void;

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

class WorldOfAircraftView extends AppView<RequiredProps<AppViewProps, "bus">> {
  // P2P: Welcome popup input refs
  private welcomePilotNameRef = FSComponent.createRef<HTMLInputElement>();
  private welcomeAirportRef = FSComponent.createRef<HTMLInputElement>();

  // ICAO search
  private icaoSearchInputRef = FSComponent.createRef<HTMLInputElement>();

  // Company name input (for keyboard capture)
  private buyCompanyNameInputRef = FSComponent.createRef<HTMLInputElement>();
  private buyCompanyAirportInputRef = FSComponent.createRef<HTMLInputElement>();

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
  private marketIcaoFilterRef = FSComponent.createRef<HTMLInputElement>();
  private marketItemFilterRef = FSComponent.createRef<HTMLInputElement>();

  // Profile inventory refs
  private profileIcaoFilterRef = FSComponent.createRef<HTMLInputElement>();
  private profileItemFilterRef = FSComponent.createRef<HTMLInputElement>();
  private profileInventoryListRef = FSComponent.createRef<HTMLDivElement>();

  // Company inventory refs
  private companyIcaoFilterRef = FSComponent.createRef<HTMLInputElement>();
  private companyItemFilterRef = FSComponent.createRef<HTMLInputElement>();
  private companyInventoryListRef = FSComponent.createRef<HTMLDivElement>();

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

    // V2.5: Initialize popup manager for centralized popup logic
    this.initializePopupManager();

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
        // Setup keyboard capture AND input listener for company name input (after DOM renders)
        // JSX oninput doesn't work reliably in Coherent GT, so we add manual listener
        setTimeout(() => {
          const companyInput = this.buyCompanyNameInputRef.getOrDefault();
          if (companyInput) {
            this.setupInputEventBlocker(companyInput);
            // Add manual input listener since JSX oninput doesn't work in Coherent GT
            companyInput.addEventListener("input", () => {
              companyState.buyCompanyName.set(companyInput.value);
            });
          }
          // Setup airport input
          const airportInput = this.buyCompanyAirportInputRef.getOrDefault();
          if (airportInput) {
            this.setupInputEventBlocker(airportInput);
            airportInput.addEventListener("input", () => {
              const value = airportInput.value.toUpperCase();
              airportInput.value = value;  // Force uppercase
              companyState.buyCompanyAirport.set(value);
            });
          }
        }, 150);
      }
      // Auto-fetch market data when switching to market tab
      if (tab === "market" && (authState.isLoggedIn.get() || authState.isP2PMode.get())) {
        void this.fetchMarketData();
        // Setup ICAO filter input after DOM renders
        setTimeout(() => {
          const icaoInput = this.marketIcaoFilterRef.getOrDefault();
          if (icaoInput) {
            this.setupInputEventBlocker(icaoInput);
            icaoInput.addEventListener("input", () => {
              const value = icaoInput.value.toUpperCase();
              icaoInput.value = value;  // Force uppercase
              marketState.marketIcaoFilter.set(value);
              this.renderMarketTab();  // Re-render with filter
            });
          }
          // Setup item name filter input
          const itemInput = this.marketItemFilterRef.getOrDefault();
          if (itemInput) {
            this.setupInputEventBlocker(itemInput);
            itemInput.addEventListener("input", () => {
              const value = itemInput.value;
              marketState.marketItemFilter.set(value);
              this.renderMarketTab();  // Re-render with filter
            });
          }
        }, 150);
      }
      // V2.1: Auto-refresh active mission when switching to missions tab
      if (tab === "missions" && (authState.isLoggedIn.get() || authState.isP2PMode.get())) {
        void this.fetchActiveMission();
        void this.autoSyncCurrentAircraft();
      }
      // V2.2: Auto-fetch hangar aircraft list when switching to hangar tab
      if (tab === "hangar" && (authState.isLoggedIn.get() || authState.isP2PMode.get())) {
        void this.fetchHangarAircraftList();
        void this.autoSyncCurrentAircraft();
      }
      // P2P: Settings tab no longer needs credentials setup
    });

    // V1.1: Auto-refresh when switching to missions sub-tabs
    navigationState.missionsSubTab.sub((subTab) => {
      if (subTab === "creation" && (authState.isLoggedIn.get() || authState.isP2PMode.get())) {
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
        void this.fetchActiveMission();
      }
    });

    // Auto-fetch profile inventory when switching to inventaire sub-tab
    navigationState.profileSubTab.sub((subTab) => {
      if (subTab === "inventaire" && (authState.isLoggedIn.get() || authState.isP2PMode.get())) {
        void this.fetchProfileInventory();
        // Setup filter inputs after DOM renders
        setTimeout(() => {
          const icaoInput = this.profileIcaoFilterRef.getOrDefault();
          if (icaoInput) {
            this.setupInputEventBlocker(icaoInput);
            icaoInput.addEventListener("input", () => {
              const value = icaoInput.value.toUpperCase();
              icaoInput.value = value;
              inventoryState.profileIcaoFilter.set(value);
              this.renderProfileInventory();
            });
          }
          const itemInput = this.profileItemFilterRef.getOrDefault();
          if (itemInput) {
            this.setupInputEventBlocker(itemInput);
            itemInput.addEventListener("input", () => {
              inventoryState.profileItemFilter.set(itemInput.value);
              this.renderProfileInventory();
            });
          }
        }, 150);
      }
    });

    // Auto-fetch company inventory when switching to inventaire sub-tab in company
    navigationState.companySubTab.sub((subTab) => {
      if (subTab === "inventaire" && (authState.isLoggedIn.get() || authState.isP2PMode.get())) {
        void this.fetchCompanyInventory();
        // Setup filter inputs after DOM renders
        setTimeout(() => {
          const icaoInput = this.companyIcaoFilterRef.getOrDefault();
          if (icaoInput) {
            this.setupInputEventBlocker(icaoInput);
            icaoInput.addEventListener("input", () => {
              const value = icaoInput.value.toUpperCase();
              icaoInput.value = value;
              inventoryState.companyIcaoFilter.set(value);
              this.renderCompanyInventory();
            });
          }
          const itemInput = this.companyItemFilterRef.getOrDefault();
          if (itemInput) {
            this.setupInputEventBlocker(itemInput);
            itemInput.addEventListener("input", () => {
              inventoryState.companyItemFilter.set(itemInput.value);
              this.renderCompanyInventory();
            });
          }
        }, 150);
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
    console.log("[WOA] Initializing SEED connection (Monde Unique)...");

    // Set initial connection status
    authState.seedConnectionStatus.set("connecting");
    authState.seedInitStep.set("Connexion au monde...");
    authState.seedInitProgress.set(0);

    // Initialize database and seed data with SEED connection
    InitService.initialize({
      onProgress: (step, progress) => {
        console.log(`[WOA] Init: ${progress}% - ${step}`);
        authState.seedInitStep.set(step);
        authState.seedInitProgress.set(progress);
      },
      onFirstLaunch: () => {
        // First launch detected - show welcome popup for user to enter their info
        console.log("[WOA] First launch detected - showing welcome popup");
        authState.seedConnectionStatus.set("connected");
        authState.showFirstLaunchPopup.set(true);

        // Add input listener for ICAO validation after popup renders
        // Use setTimeout with longer delay to ensure DOM is fully rendered in Coherent GT
        setTimeout(() => {
          const airportInput = this.welcomeAirportRef.instance;
          const pilotNameInput = this.welcomePilotNameRef.instance;

          console.log("[WOA] Setting up WelcomePopup inputs - pilotName:", !!pilotNameInput, "airport:", !!airportInput);

          // Setup Coherent keyboard capture for WelcomePopup inputs
          // This tells MSFS to stop capturing keyboard when input is focused
          if (pilotNameInput) {
            this.setupInputEventBlocker(pilotNameInput);
          }
          if (airportInput) {
            this.setupInputEventBlocker(airportInput);
            airportInput.addEventListener("input", () => {
              const value = airportInput.value.toUpperCase();
              const isValid = /^[A-Z]{4}$/.test(value);
              console.log("[WOA] Airport ICAO validation:", value, "valid:", isValid);
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
        }, 200);
      },
      onModeSelectionRequired: () => {
        // V3.0: No game mode selected - show mode selection screen
        console.log("[WOA] Mode selection required - showing selector");
        authState.seedConnectionStatus.set("connected"); // Hide connection screen
        gameModeState.showModeSelector.set(true);
      },
      onComplete: () => {
        console.log("[WOA] SEED connection and initialization complete");
        authState.seedConnectionStatus.set("connected");
        this.initializePersistenceAndEconomy();
      },
      onError: (error) => {
        console.error("[WOA] Initialization failed:", error);
        authState.seedConnectionStatus.set("failed");
        authState.seedConnectionError.set(error.message || "Connection failed");
      },
    });
  }

  /**
   * Retry SEED connection after failure
   */
  private handleRetryConnection = (): void => {
    console.log("[WOA] Retrying SEED connection...");
    authState.seedConnectionError.set(null);
    this.initializeLocalDatabase();
  };

  /**
   * V3.0: Handle game mode selection (Solo or Online)
   */
  private handleSelectGameMode = (mode: "solo" | "online"): void => {
    console.log(`[WOA] Game mode selected: ${mode}`);
    gameModeState.modeSwitchLoading.set(true);
    gameModeState.modeSwitchError.set(null);

    // Set game mode state
    gameModeState.currentMode.set(mode);
    gameModeState.modeSelected.set(true);
    gameModeState.showModeSelector.set(false);

    // V3.0: Set network state immediately based on mode
    if (mode === "solo") {
      // Solo mode = offline (no SEED connection)
      // IMPORTANT: Stop all SEED services FIRST to prevent them from setting status back to "online"
      SyncManager.stopConnectionCheck();
      SyncService.stopPolling();
      SyncService.disconnect();
      NetworkState.setOffline();
      console.log("[WOA] Solo mode: Stopped SEED services, NetworkState set to OFFLINE");
    } else {
      // Online mode = will connect to SEED
      NetworkState.setConnecting();
      console.log("[WOA] Online mode: NetworkState set to CONNECTING");
    }

    // Persist mode choice
    if (typeof SetStoredData === "function") {
      SetStoredData("WOA_GameMode", mode);
    }

    console.log(`[WOA] ${mode === "solo" ? "Solo" : "Online"} mode activated`);

    // Continue initialization with selected mode
    InitService.continueWithMode(mode)
      .then(() => {
        gameModeState.modeSwitchLoading.set(false);
        this.initializePersistenceAndEconomy();
      })
      .catch((e) => {
        console.error("[WOA] Mode initialization error:", e);
        gameModeState.modeSwitchError.set(e instanceof Error ? e.message : "Unknown error");
        gameModeState.modeSwitchLoading.set(false);
      });
  };

  /**
   * P2P: Initialize persistence manager and AI economy
   * Called after database is ready (either on first launch completion or on existing data)
   */
  private initializePersistenceAndEconomy(): void {
    // Initialize persistence manager
    PersistenceManager.initialize({
      onLoaded: () => {
        console.log("[WOA] States loaded from local database");
      },
      onError: (error) => {
        console.error("[WOA] Persistence error:", error);
      },
      onSaved: (store) => {
        console.log(`[WOA] Auto-saved: ${store}`);
      },
    });

    // Load states from database
    PersistenceManager.loadAllStates()
      .then(async () => {
        // Enable auto-save after loading
        PersistenceManager.enableAutoSave();

        // Start AI economy for solo mode (price fluctuation, AI orders)
        AIEconomyService.initialize({
          onPricesUpdated: (count) => console.log(`[AIEconomy] Updated ${count} prices`),
          onOrdersGenerated: (count) => console.log(`[AIEconomy] Generated ${count} AI orders`),
        });
        AIEconomyService.start();

        // Generate initial AI orders if market is empty
        AIEconomyService.forceUpdate().then(() => {
          console.log("[WOA] P2P local mode ready with AI economy");
        });
      })
      .catch((error) => {
        console.error("[WOA] Failed to load states:", error);
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
    console.log(`[WOA] Completing first launch: ${pilotName} (${nationality}) at ${startingAirport}`);

    // Hide welcome popup
    authState.showFirstLaunchPopup.set(false);

    // Complete the setup with user data
    InitService.completeFirstLaunch(pilotName, nationality, startingAirport)
      .then(async () => {
        console.log("[WOA] First launch setup complete!");
        // Initialize persistence and economy after setup
        this.initializePersistenceAndEconomy();

        // Load player data into state
        try {
          const player = await InitService.getPlayerInfo();
          if (player) {
            console.log(`[WOA] Player loaded: ${player.name} with ${player.money} credits`);
            marketState.walletPersonal.set(player.money);
            authState.currentUser.set({
              id: player.id,
              username: player.name,
              email: "",
            });
            authState.isLoggedIn.set(true);
          }
        } catch (e) {
          console.warn("[WOA] Could not load player info:", e);
        }

        // Refresh hangar list with the new aircraft
        console.log("[WOA] Refreshing hangar after first launch...");
        void this.fetchHangarAircraftList();
      })
      .catch((error) => {
        console.error("[WOA] Failed to complete first launch:", error);
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
        console.log("[WOA] Touchdown callback - FPM:", fpm);
      },
      onBackgroundWearApply: async (aircraftId, flightMinutes) => {
        await FleetRouter.applyBackgroundWear(aircraftId, flightMinutes, 0, 0);
      },
      onBackgroundFuelSync: async (aircraftId, fuelGallons, fuelCapacity) => {
        await FleetRouter.syncFuel(aircraftId, fuelGallons, fuelCapacity);
      },
      onLandingRatingDetected: (fpm, rating) => {
        simVarState.lastLandingRate.set(fpm);
        simVarState.landingRating.set(rating);
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
        console.log("[WOA] Airports loaded:", count);
      },
      onFactoriesLoaded: (count) => {
        console.log("[WOA] Factories loaded:", count);
      },
      onHelipadsLoaded: (count) => {
        console.log("[WOA] Helipads loaded:", count);
      },
      onMapMoveEnd: () => {
        const bounds = mapManager.getVisibleBounds();
        if (!bounds) return;

        const map = mapManager.getMap();
        const currentZoom = map?.getView().getZoom() || 7;

        // Check if zoom crossed a threshold (7 or 9)
        const zoomThresholds = [7, 9, 11];
        const lastThreshold = zoomThresholds.filter(t => this.lastLoadedZoom >= t).length;
        const currentThreshold = zoomThresholds.filter(t => currentZoom >= t).length;
        const zoomCrossedThreshold = lastThreshold !== currentThreshold;

        // Check if we need to reload airports
        const anyAirportsVisible = mapState.showLargeAirports.get() || mapState.showMediumAirports.get() || mapState.showSmallAirports.get();
        if (anyAirportsVisible && (zoomCrossedThreshold || mapManager.shouldReloadAirports(bounds))) {
          console.log(`[WOA] Map moved - reloading airports (zoom: ${this.lastLoadedZoom.toFixed(1)} → ${currentZoom.toFixed(1)}, threshold: ${zoomCrossedThreshold})`);
          void this.fetchAirportsForMap();
        }

        // Check if we need to reload helipads (only at zoom > 10)
        if (mapState.showHelipadsOnMap.get() && (zoomCrossedThreshold || mapManager.shouldReloadAirports(bounds))) {
          void this.fetchHelipadsForMap();
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
        console.error("[WOA] Mission creation error:", error);
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
      onSessionComplete: (xpEarned: number, flightTime: number, distance: number, landings: number) => {
        console.log(`[FreeFlight] Session complete - XP: ${xpEarned}, Time: ${flightTime.toFixed(1)}min, Distance: ${distance.toFixed(1)}nm, Landings: ${landings}`);
        // Popup is shown via freeFlightState.showEndFlightConfirm
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
   * V2.5: Initialize popup manager with callbacks
   */
  private initializePopupManager(): void {
    popupManager.initialize({
      t: (section, key) => this.t(section as keyof TranslationKeys, key),
      getRefuelPopupEl: () => this.refuelPopupRef.getOrDefault(),
      getSystemsPopupEl: () => this.systemsPopupRef.getOrDefault(),
      getHangarRepairListEl: () => this.hangarRepairListRef.getOrDefault(),
      getEditRegInputEl: () => this.hangarEditRegInputRef.getOrDefault(),
      getCargoSliderEl: () => this.cargoPopupSliderRef.getOrDefault(),
      getCargoQtyEl: () => this.cargoPopupQtyRef.getOrDefault(),
      getMarketBuySliderEl: () => this.marketBuyQtySliderRef.getOrDefault(),
      getMarketBuyQtyEl: () => this.marketBuyQtyDisplayRef.getOrDefault(),
      refreshHangarList: () => this.renderHangarList(),
      refreshMissionAircraftInfo: () => this.renderMissionAircraftInfo(),
      refreshAircraftSystems: async (id) => this.fetchAircraftSystems(id),
      refreshAircraftDetails: async (id) => this.fetchAircraftDetails(id),
      refreshCompanyData: async () => this.fetchCompanyData(),
      refreshMarketListings: () => void this.fetchMarketData(),
      refreshCargoLists: () => this.renderCargoUI(),
      transferCargo: (direction, locationId, itemId, qty) => {
        if (direction === "load") {
          void this.loadCargoItem(locationId, itemId, qty);
        } else {
          void this.unloadCargoItem(locationId, itemId, qty);
        }
      },
      setupInputCapture: (el) => this.setupInputEventBlocker(el),
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
      console.error("[WOA] Failed to load preferences:", error);
    }
  }

  // V1.5: Load unit preferences from localStorage
  private loadUnitPreferences(): void {
    try {
      const savedUnits = localStorage.getItem("woa_units");
      if (savedUnits) {
        const units = JSON.parse(savedUnits);
        if (units.distance) settingsState.unitDistance.set(units.distance);
        if (units.weight) settingsState.unitWeight.set(units.weight);
        if (units.altitude) settingsState.unitAltitude.set(units.altitude);
        if (units.fuel) settingsState.unitFuel.set(units.fuel);
        if (units.speed) settingsState.unitSpeed.set(units.speed);
        if (units.temperature) settingsState.unitTemperature.set(units.temperature);
        console.log("[WOA] Unit preferences loaded:", units);
      }
    } catch (error) {
      console.error("[WOA] Failed to load unit preferences:", error);
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
      localStorage.setItem("woa_units", JSON.stringify(units));
      console.log("[WOA] Unit preferences saved:", units);
    } catch (error) {
      console.error("[WOA] Failed to save unit preferences:", error);
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
      localStorage.setItem("woa_language", lang);
      console.log("[WOA] Language set to:", lang);
    } catch (error) {
      console.error("[WOA] Failed to save language:", error);
    }
  }

  // V1.5: Load language from localStorage
  private loadLanguage(): void {
    try {
      const savedLang = localStorage.getItem("woa_language") as Language | null;
      const validLanguages: Language[] = ["en", "fr", "de", "es"];
      if (savedLang && validLanguages.includes(savedLang)) {
        settingsState.currentLanguage.set(savedLang);
        console.log("[WOA] Language loaded:", savedLang);
      }
    } catch (error) {
      console.error("[WOA] Failed to load language:", error);
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
      console.log("[WOA] App resumed, syncing aircraft state...");
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

    // Force save to Coherent DataStore before pause
    // This ensures data persists across MSFS restarts
    void DatabaseManager.forceSave();
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

        // Landing detection (delegated to TrackingManager for UI feedback)
        const currentOnGround = SimVar.GetSimVarValue("SIM ON GROUND", "bool") as boolean;
        trackingManager.processUILandingDetection(vs, currentOnGround);
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

  private setupInputEventBlocker(input: HTMLInputElement | null): void {
    if (!input) return;

    // Generate a unique ID for this input
    const uuid = `woa-input-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // When input is focused, tell MSFS to capture keyboard for the EFB
    input.addEventListener("focus", () => {
      // @ts-ignore - Coherent is a global provided by MSFS
      if (typeof Coherent !== "undefined") {
        // @ts-ignore
        Coherent.trigger("FOCUS_INPUT_FIELD", { uuid, isPassword: input.type === "password" });
      }
    });

    // When input loses focus, release keyboard back to simulator
    input.addEventListener("blur", () => {
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
      missionCreationState.fpDestinationInput.set(target.value.toUpperCase());
    });

    // Also capture on keyup as a fallback
    input.addEventListener("keyup", (e: KeyboardEvent) => {
      const target = e.target as HTMLInputElement;
      const value = target.value.toUpperCase();
      if (value !== missionCreationState.fpDestinationInput.get()) {
        missionCreationState.fpDestinationInput.set(value);
      }
    });
  }

  /**
   * Reset all local data - for testing and troubleshooting
   * Clears all localStorage with woa_ prefix and native persistence
   */
  private resetAllData(): void {
    const confirmReset = confirm("Are you sure you want to reset ALL data? This cannot be undone!");
    if (!confirmReset) return;

    console.log("[WOA] Resetting all local data...");

    try {
      // Clear all woa_ keys from localStorage
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("woa_")) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
        console.log(`[WOA] Removed: ${key}`);
      });

      console.log(`[WOA] Reset complete - removed ${keysToRemove.length} keys`);

      // Clear native persistence (MSFS GetStoredData/SetStoredData)
      NativePersistence.clear();
      NativePersistence.clearSoloSetup();
      NativePersistence.clearPlayerId();
      console.log("[WOA] Native persistence cleared");

      // Clear saved game mode
      if (typeof SetStoredData === "function") {
        SetStoredData("WOA_GameMode", "");
        console.log("[WOA] Game mode cleared");
      }

      // Reset auth state
      authState.authToken.set(null);
      authState.currentUser.set(null);
      authState.isLoggedIn.set(false);
      authState.isP2PMode.set(true);

      // Show first launch popup for fresh start
      authState.showFirstLaunchPopup.set(true);

      alert("Data reset complete! The welcome screen will appear. Please restart the EFB.");

    } catch (error) {
      console.error("[WOA] Reset failed:", error);
      alert("Reset failed: " + (error instanceof Error ? error.message : String(error)));
    }
  }

  /**
   * Test MSFS APIs availability in Coherent GT (simplified)
   */
  private async testCommBus(): Promise<void> {
    const w = window as any;
    const apis = {
      SimVar: typeof w.SimVar !== "undefined",
      Coherent: typeof w.Coherent !== "undefined",
      GetStoredData: typeof w.GetStoredData === "function",
      SetStoredData: typeof w.SetStoredData === "function",
      CommBusCall: typeof w.CommBusCall === "function",
    };

    // Test persistence
    let persistenceWorks = false;
    if (apis.GetStoredData && apis.SetStoredData) {
      try {
        w.SetStoredData("woa_test", "ok");
        persistenceWorks = w.GetStoredData("woa_test") === "ok";
      } catch { /* ignore */ }
    }

    const summary = Object.entries(apis).map(([k, v]) => `${v ? "✅" : "❌"} ${k}`).join("\n");
    console.log(`[WOA] API Test:\n${summary}\n${persistenceWorks ? "✅" : "❌"} Persistence roundtrip`);
    alert(`API Test Complete\n\n${summary}\n\nPersistence: ${persistenceWorks ? "OK" : "FAIL"}`);
  }

  /**
   * Toggle simulated offline mode for testing
   * Forces NetworkState.setOffline() and stops SEED polling
   */
  private async toggleSimulateOffline(): Promise<void> {
    const isCurrentlySimulated = settingsState.isOfflineSimulated.get();

    if (isCurrentlySimulated) {
      // Reconnect: stop simulation, try to reconnect to SEED
      console.log("[WOA] Stopping offline simulation, attempting reconnect...");
      settingsState.isOfflineSimulated.set(false);

      // Try to reconnect to SEED
      const connected = await SyncService.connect();
      if (connected) {
        NetworkState.setOnline();
        SyncService.startPolling(30000);
        SyncManager.startConnectionCheck();
        console.log("[WOA] Reconnected to SEED");
        alert("Reconnecté au SEED ! Mode ONLINE actif.");
      } else {
        NetworkState.setOffline();
        console.log("[WOA] Could not reconnect to SEED, staying offline");
        alert("Impossible de se reconnecter au SEED. Mode OFFLINE maintenu.");
      }
    } else {
      // Simulate offline: disconnect from SEED
      console.log("[WOA] Simulating offline mode...");
      settingsState.isOfflineSimulated.set(true);

      // Stop all SEED communication
      SyncService.stopPolling();
      SyncManager.stopConnectionCheck();
      NetworkState.setOffline();

      console.log("[WOA] Offline mode simulated - SEED polling stopped");
      alert("Mode OFFLINE simulé !\n\nLes missions seront créées/complétées localement.\nLe ravitaillement est désactivé.\nCliquez à nouveau pour reconnecter au SEED.");
    }
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

    console.log("[WOA] Fetching nearby airports for:", lat, lon);
    mapState.nearbyAirportsStatus.set("loading");
    mapState.nearbyAirportsError.set(null);

    try {
      // V3.0: Use WorldRouter for P2P/network mode auto-switching
      const airports = await WorldRouter.getNearbyAirports(lat, lon, 50, 10);
      console.log("[WOA] Nearby airports:", airports);

      this.nearbyAirports = airports.map((a: { ident?: string; icao?: string; name?: string; distance_nm?: number }) => ({
        icao: a.ident || a.icao || "????",
        name: a.name || "Unknown",
        distance_nm: a.distance_nm || 0,
      }));

      mapState.nearbyAirportsStatus.set("success");
      this.renderAirportsList();

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("[WOA] Nearby airports FAILED:", errorMsg);
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
        ? `coui://html_ui/efb_ui/efb_apps/WorldOfAircraft/Assets/aircraft/${ac.aircraft_model.toUpperCase()}.jpg`
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
          console.log("[WOA] Aircraft locked - not current aircraft");
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
      console.log("[WOA] Map container not found");
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
    console.log("[WOA] Map initialized successfully!");

    // Load airports on initial map load if filters are active
    const anyAirportsVisible = mapState.showLargeAirports.get() || mapState.showMediumAirports.get() || mapState.showSmallAirports.get();
    if (anyAirportsVisible) {
      console.log("[WOA] Filters active on init, loading airports...");
      mapManager.setAirportsVisible(true);
      void this.fetchAirportsForMap();
    }

    // Load helipads on initial map load if filter is active
    if (mapState.showHelipadsOnMap.get()) {
      console.log("[WOA] Helipad filter active on init, loading helipads...");
      mapManager.setHelipadsVisible(true);
      void this.fetchHelipadsForMap();
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

    // Convert pixel to map coordinate
    const clickCoord = this.olMap.getCoordinateFromPixel(pixel);
    if (!clickCoord) {
      mapState.selectedAirport.set(null);
      return;
    }

    const clickLonLat = toLonLat(clickCoord);

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
    mapState.selectedAirport.set(null);
  }

  private async fetchMyFactoriesAtAirport(icaoCode: string): Promise<void> {
    const token = authState.authToken.get();
    if (!token) {
      mapState.myFactoriesAtAirport.set([]);
      return;
    }
    try {
      const factories = await WorldRouter.getFactoriesAtAirport(icaoCode);
      mapState.myFactoriesAtAirport.set(factories);
    } catch (error) {
      console.error("[WOA] Failed to fetch factories:", error);
      mapState.myFactoriesAtAirport.set([]);
    }
  }

  private async fetchAvailableSlotsAtAirport(icaoCode: string): Promise<void> {
    try {
      const slots = await WorldRouter.getAvailableSlots(icaoCode);
      mapState.availableSlotsAtAirport.set(slots);
    } catch (error) {
      console.error("[WOA] Failed to fetch slots:", error);
      mapState.availableSlotsAtAirport.set(null);
    }
  }

  private openCreateFactory(_airport: { icao: string; name: string }): void {
    // TODO: Implement factory creation form
    mapState.selectedAirport.set(null);
  }

  private openManageFactory(factory: { id: string; name: string }): void {
    console.log("[WOA] TODO: Open manage factory", factory.id, factory.name);
    // TODO: Implement factory management panel
    mapState.selectedAirport.set(null);
  }

  private setDestinationAirport(airport: { icao: string; name: string }): void {
    console.log("[WOA] Destination set:", airport.icao, airport.name);
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
      console.log("[WOA] Not logged in, cannot fetch aircraft");
      return;
    }

    console.log("[WOA] Fetching available aircraft at:", icao);
    missionState.missionStatus.set("loading");
    missionState.missionError.set(null);

    try {
      // V1.9: Use fleetService for available aircraft
      const aircraft = await FleetRouter.getAvailableAtAirport(icao);
      console.log("[WOA] Available aircraft:", aircraft);
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
      console.error("[WOA] Error fetching aircraft:", error);
      missionState.missionError.set(this.t("missions", "errorLoadingAircrafts"));
      this.availableAircraftList = [];
      this.renderAircraftList();
      missionState.missionStatus.set("error");
    }
  }

  private async refreshMissionOrigin(): Promise<void> {
    // V1.5: Always ensure status is idle at start to prevent stuck button
    missionState.missionStatus.set("idle");
    missionState.missionStatus.set("loading");

    try {
      let detectedAirport: string | null = null;

      // Method 1: Read SimVar directly (bypass state caching issues)
      if (typeof SimVar !== "undefined") {
        const simVarNames = ["GPS CLOSEST AIRPORT ID", "GPS WP PREV ID", "ATC AIRPORT IS TOWERED"];

        for (const varName of simVarNames) {
          try {
            const value = SimVar.GetSimVarValue(varName, "string") as string;
            if (value && typeof value === "string") {
              const cleaned = value.trim().toUpperCase();
              if (/^[A-Z]{3,4}$/.test(cleaned)) {
                detectedAirport = cleaned;
                break;
              }
            }
          } catch { /* SimVar not available */ }
        }

        // Also try the state value
        if (!detectedAirport) {
          const stateAirport = simVarState.closestAirport.get();
          if (stateAirport && stateAirport !== "----" && /^[A-Z]{3,4}$/i.test(stateAirport)) {
            detectedAirport = stateAirport.toUpperCase();
          }
        }
      }

      // Method 2: Fallback to coordinate-based search
      if (!detectedAirport) {
        // Wait for airports cache if empty
        if (DatabaseManager.getAirportsCache().length === 0) {
          for (let retry = 0; retry < 10 && DatabaseManager.getAirportsCache().length === 0; retry++) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }

        // Read coordinates
        let lat = 0, lon = 0;
        if (typeof SimVar !== "undefined") {
          lat = SimVar.GetSimVarValue("PLANE LATITUDE", "degrees") as number || 0;
          lon = SimVar.GetSimVarValue("PLANE LONGITUDE", "degrees") as number || 0;
        }
        if (lat === 0 && lon === 0) {
          lat = simVarState.latitude.get();
          lon = simVarState.longitude.get();
        }

        if (lat === 0 && lon === 0) {
          missionState.missionStatus.set("idle");
          return;
        }

        const airport = await WorldRouter.getClosestAirport(lat, lon);
        if (airport) {
          detectedAirport = airport.ident;
        }
      }

      // Set the detected airport
      if (detectedAirport) {
        missionState.missionOriginIcao.set(detectedAirport);
        void this.loadCurrentAircraftForMission();
        this.fetchActiveMission();
        missionState.missionStatus.set("idle");
      } else {
        throw new Error("No airport found from SimVar or coordinates");
      }

    } catch (error) {
      console.error("[WOA] refreshMissionOrigin error:", error);
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

    console.log("[WOA] updateCreationSteps:", { step1: step1Valid, step2: cargoOk, step3: flightPlanOk, canCreate: allValid });
  }

  // Read flight plan data from aircraft GPS SimVars
  // V2.2: Delegates to MissionCreationManager for SimVar reading
  private readFlightPlanFromGPS(): void {
    missionCreationManager.readFlightPlanFromGPS();

    // Setup destination input listeners (must be done when input exists)
    setTimeout(() => {
      this.setupDestinationInput(this.fpDestinationInputRef.getOrDefault());
    }, 100);
  }

  // ============== EFB FlightPlanner Event Subscription ==============

  /**
   * Subscribe to FlightPlanner events from the EventBus
   */
  private subscribeToFlightPlannerEvents(): void {
    try {
      const bus = this.props.bus;
      if (!bus) return;

      this.fplEventSubscriptions.push(
        bus.getSubscriber<any>().on("fplCreated").handle((event: any) => this.onEfbFlightPlanCreated(event)),
        bus.getSubscriber<any>().on("fplLoaded").handle((event: any) => this.onEfbFlightPlanLoaded(event)),
        bus.getSubscriber<any>().on("fplCalculated").handle((event: any) => this.onEfbFlightPlanCalculated(event)),
        bus.getSubscriber<any>().on("fplOriginDestChanged").handle((event: any) => this.onEfbFlightPlanOriginDestChanged(event)),
        bus.getSubscriber<any>().on("fplLegChange").handle(() => { /* leg change */ })
      );
    } catch (error) {
      console.error("[WOA] FlightPlanner events error:", error);
    }
  }

  private unsubscribeFromFlightPlannerEvents(): void {
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

  /**
   * Explore EFB internal data - call this to debug what's available
   */
  /**
   * Try to read the EFB flight plan via Coherent API
   */
  private tryReadEfbFlightPlan(): void {
    try {
      // Try multiple Coherent API methods
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
      console.error("[WOA] EFB flight plan error:", error);
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

  /**
   * Process the flight plan data retrieved from EFB
   */
  private processEfbFlightPlan(fp: any): void {
    const waypoints: Array<{ ident: string; lat: number; lon: number; type: string }> = [];
    let origin = "";
    let destination = "";
    let totalDistance = 0;

    // Extract from waypoints array
    if (fp.waypoints && Array.isArray(fp.waypoints) && fp.waypoints.length > 0) {
      for (let i = 0; i < fp.waypoints.length; i++) {
        const wp = fp.waypoints[i];
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

    // Fallback: try alternate fields for origin
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

    // Fallback: try alternate fields for destination
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

    // Update state
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

  // Validate the flight plan with user-entered destination
  private validateFlightPlan(): void {
    // Get destination from DOM or Subject (event listener captures input)
    const inputEl = this.fpDestinationInputRef.getOrDefault();
    let destination = (inputEl?.value || "").toUpperCase().trim();

    // Fallback to Subject (set by event listener or auto-detection)
    if (!destination) {
      destination = missionCreationState.fpDestinationInput.get().toUpperCase().trim();
    }
    console.log("[WOA] Flight plan validation - destination:", destination);

    // Validate ICAO format (4 letters)
    if (!destination || !/^[A-Z]{4}$/.test(destination)) {
      popupState.popupNotification.set(this.t("missions", "enterValidIcao"));
      console.log("[WOA] Invalid ICAO format");
      return;
    }

    // Check if flight plan is valid:
    // - Either has 2+ waypoints (World Map plan)
    // - Or has active GPS plan (VFR cockpit plan - waypoints not exposed but GPS is active)
    const wpCount = missionCreationState.fpWaypointCount.get();
    const hasActivePlan = missionCreationState.fpHasActivePlan.get();
    console.log("[WOA] Waypoint count:", wpCount, "| GPS Active:", hasActivePlan);

    if (wpCount < 2 && !hasActivePlan) {
      popupState.popupNotification.set(this.t("missions", "readGpsFirst"));
      return;
    }

    // Validate
    console.log("[WOA] Validating flight plan OK!");
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
    const cargoWeight = cargoState.aircraftCargoWeight.get();
    const fuelPercent = missionCreationState.fuelTargetPercent.get();

    void this.applyCargoToAircraft(cargoWeight);
    this.applyFuelToAircraft();

    missionCreationState.cargoValidated.set(true);
    popupState.popupNotification.set(`Cargo: ${cargoWeight.toFixed(0)} kg, Fuel: ${fuelPercent}%`);
    this.updateCreationSteps();
  }

  // Apply cargo weight to aircraft payload stations
  private async applyCargoToAircraft(cargoWeightKg: number): Promise<void> {
    try {
      const stationCount = SimVar.GetSimVarValue("PAYLOAD STATION COUNT", "number") as number || 0;
      if (stationCount < 1) return;

      // Find cargo/baggage stations by name
      const cargoKeywords = ["BAGGAGE", "CARGO", "FREIGHT", "LUGGAGE", "HOLD", "POD", "BELLY"];
      const cargoStations: number[] = [];

      for (let i = 1; i <= stationCount; i++) {
        const name = (SimVar.GetSimVarValue(`PAYLOAD STATION NAME:${i}`, "string") as string || "").toUpperCase();
        if (cargoKeywords.some(keyword => name.includes(keyword))) {
          cargoStations.push(i);
        }
      }

      // Fallback: use last station if no cargo stations found
      if (cargoStations.length === 0) cargoStations.push(stationCount);

      // Reset all cargo stations to 0
      for (const station of cargoStations) {
        await SimVar.SetSimVarValue(`PAYLOAD STATION WEIGHT:${station}`, "kilograms", 0);
      }
      await new Promise(resolve => setTimeout(resolve, 200));

      // Apply weight if > 0
      if (cargoWeightKg > 0) {
        const weightPerStation = cargoWeightKg / cargoStations.length;
        for (const station of cargoStations) {
          await SimVar.SetSimVarValue(`PAYLOAD STATION WEIGHT:${station}`, "kilograms", weightPerStation);
        }
      }
    } catch (e) {
      console.error("[WOA] Error applying cargo:", e);
    }
  }

  // Modify cargo (reset validation)
  private modifyCargoStep(): void {
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

      console.log("[WOA] Fuel read:", fuelPercent, "% (", Math.round(fuelQuantityGal * 3.785 * 0.8), "kg /", Math.round(fuelCapacityKg), "kg)");
    } catch (e) {
      console.error("[WOA] Error reading fuel:", e);
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
      console.log("[WOA] Fuel set to:", targetPercent, "% (", Math.round(targetQuantityGal), "gallons)");
    } catch (e) {
      console.error("[WOA] Error setting fuel:", e);
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
    const isP2P = authState.isP2PMode.get();
    const origin = missionCreationState.fpOriginIcao.get() || missionState.missionOriginIcao.get();
    const destination = missionCreationState.fpDestinationIcao.get();
    const aircraftId = missionState.selectedAircraftId.get();
    const distance = missionCreationState.fpTotalDistance.get();
    const waypointCount = missionCreationState.fpWaypointCount.get();

    // P2P mode doesn't require token
    if ((!isP2P && !token) || !origin || !destination || !aircraftId) {
      console.log("[WOA] createMissionV11: Missing data - isP2P:", isP2P, "token:", !!token, "origin:", origin, "destination:", destination, "aircraftId:", aircraftId);
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

        console.log("[WOA] ATC_MODEL check: raw=", rawAtcModel, "extracted=", extractedType, "expectedIcao=", expectedIcao);

        // Compare extracted ICAO type with icao_type from database (sent as aircraft_model)
        if (extractedType && expectedIcao && extractedType !== expectedIcao) {
          missionState.missionError.set(`${this.t("missions", "wrongAircraft")} ${extractedType}, ${this.t("missions", "notA")} ${expectedIcao}`);
          missionState.missionStatus.set("error");
          return;
        }
      } catch (e) {
        console.log("[WOA] Could not read ATC MODEL SimVar");
      }
    }

    console.log("[WOA] Creating V1.1 mission:", origin, "->", destination, `(${distance} nm, ${waypointCount} WPs)`);
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
        console.log("[WOA] Departure weather:", departureWeather);
      } catch (e) {
        console.log("[WOA] Could not read weather SimVars");
      }

      // Get cargo weight and modifiers
      const cargoWeightKg = cargoState.aircraftCargoWeight.get();
      const modifiersSelected = missionState.selectedModifiers.get();

      console.log("[WOA] V1.1 Mission params:", {
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
      console.log("[WOA] V1.1 Mission created:", mission);

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
      console.log("[WOA] V2.0: Mission created with", missionState.waypointsTotal.get(), "waypoints,", missionState.missionDistanceNm.get(), "nm");

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
      console.error("[WOA] Error creating V1.1 mission:", error);
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
      console.log("[WOA] Active mission:", mission);

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

      console.log("[WOA] Active mission checkpoints loaded:", checkpoints.length, "validated:", validatedCount);

      // V2.2: Restore cargo weight from mission data
      if (mission.cargo_weight_kg !== undefined) {
        cargoState.aircraftCargoWeight.set(mission.cargo_weight_kg);
        console.log("[WOA] Restored cargo weight from mission:", mission.cargo_weight_kg, "kg");
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
      console.error("[WOA] Error fetching active mission:", error);
    }
  }

  private async cancelMission(): Promise<void> {
    const token = authState.authToken.get();
    const mission = missionState.activeMission.get();
    // P2P mode doesn't require token
    if (!mission || (!authState.isP2PMode.get() && !token)) return;

    console.log("[WOA] Cancelling mission:", mission.id);
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
      console.log("[WOA] V1.6: Cancelling mission with position update to:", currentAirport);
    }

    try {
      await MissionRouter.failMission(mission.id);
      console.log("[WOA] Mission cancelled");
      missionState.activeMission.set(null);
      // V1.6: Reset background tracking to prevent any leftover data
      trackingManager.resetBackgroundTracking();
      missionState.missionStatus.set("idle");
      missionState.missionError.set(null);
      // V1.2: Reload current aircraft info
      void this.loadCurrentAircraftForMission();
    } catch (error) {
      console.error("[WOA] Error cancelling mission:", error);
      missionState.missionError.set(this.t("missions", "errorCancellingMission"));
      missionState.missionStatus.set("error");
    }
  }

  // V2.2: Fetch destination coordinates for accurate progress calculation
  private async fetchDestinationCoordinates(icao: string): Promise<void> {
    try {
      console.log("[WOA] V2.2: Fetching destination coordinates for:", icao);
      // V1.9: Use worldService for airport lookup
      const airport = await WorldRouter.getAirportByIcao(icao);
      if (airport) {
        this.destLat = airport.latitude_deg || 0;
        this.destLon = airport.longitude_deg || 0;
        console.log("[WOA] V2.2: Destination coordinates:", this.destLat, this.destLon, "for", icao);
      } else {
        console.warn("[WOA] V2.2: No airport found for ICAO:", icao);
      }
    } catch (error) {
      console.error("[WOA] Error fetching destination coordinates:", error);
    }
  }

  // V0.8 Cargo Management Methods
  private async fetchAirportInventoryForCargo(icao: string): Promise<void> {
    const token = authState.authToken.get();
    // P2P mode doesn't require token
    if (!authState.isP2PMode.get() && !token) return;

    console.log("[WOA] Fetching airport inventory for cargo:", icao);
    cargoState.cargoLoading.set(true);

    try {
      // V1.9: Use MarketRouter.getAirportInventoryRaw for containers structure
      const data = await MarketRouter.getAirportInventoryRaw(icao);
      console.log("[WOA] Airport inventory:", data);

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
      console.error("[WOA] Error fetching airport inventory:", error);
    } finally {
      cargoState.cargoLoading.set(false);
    }
  }

  private async fetchAircraftCargo(aircraftId: string): Promise<void> {
    const token = authState.authToken.get();
    // P2P mode doesn't require token
    if (!authState.isP2PMode.get() && !token) return;

    console.log("[WOA] Fetching aircraft cargo:", aircraftId);

    try {
      // V1.9: Use FleetRouter.getAircraftCargoRaw for raw API response
      const data = await FleetRouter.getAircraftCargoRaw(aircraftId);
      console.log("[WOA] Aircraft cargo:", data);

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
      console.error("[WOA] Error fetching aircraft cargo:", error);
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

    console.log("[WOA] Loading cargo:", { fromLocationId, itemId, qty });
    cargoState.cargoLoading.set(true);

    try {
      // V1.9: Use fleetService for cargo loading
      await FleetRouter.loadCargo(aircraftId, fromLocationId, itemId, qty);
      console.log("[WOA] Cargo loaded");
      const origin = missionState.missionOriginIcao.get();
      if (origin) {
        await this.fetchAirportInventoryForCargo(origin);
      }
      await this.fetchAircraftCargo(aircraftId);
    } catch (error) {
      console.error("[WOA] Error loading cargo:", error);
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

    console.log("[WOA] Unloading cargo:", { toLocationId, itemId, qty });
    cargoState.cargoLoading.set(true);

    try {
      // V1.9: Use fleetService for cargo unloading
      await FleetRouter.unloadCargo(aircraftId, toLocationId, itemId, qty);
      console.log("[WOA] Cargo unloaded");
      const origin = missionState.missionOriginIcao.get();
      if (origin) {
        await this.fetchAirportInventoryForCargo(origin);
      }
      await this.fetchAircraftCargo(aircraftId);
    } catch (error) {
      console.error("[WOA] Error unloading cargo:", error);
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
    // Check if on ground and not moving (SimVar access stays here)
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

    // Delegate to PopupManager
    popupManager.openCargo(direction, {
      item_id: itemId,
      item_name: itemName,
      max_qty: maxQty,
      weight_kg: weightKg,
      location_id: locationId,
    });
  }

  private closeCargoPopup(): void {
    popupManager.closeCargo();
  }

  private updateCargoPopupSlider(): void {
    popupManager.updateCargoSlider();
  }

  private async confirmCargoTransfer(): Promise<void> {
    await popupManager.confirmCargo();
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
      console.log("[WOA] Hangar fleet list:", data);
      hangarState.hangarAircraftList.set(Array.isArray(data) ? data : []);
      this.renderHangarList();
    } catch (error) {
      console.error("[WOA] Error fetching hangar aircraft:", error);
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
      console.log("[WOA] Aircraft details from API:", apiData);

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

      console.log("[WOA] Aircraft details merged:", data);

      hangarState.hangarSelectedAircraft.set(data);

      // V1.4: Anti-cheat - If this is the current aircraft in sim, apply DB fuel
      const currentSimReg = simVarState.currentSimAircraftReg.get();
      if (data.registration && currentSimReg &&
          data.registration.toUpperCase() === currentSimReg.toUpperCase()) {
        const simFuelCapacity = SimVar.GetSimVarValue("FUEL TOTAL CAPACITY", "gallons") as number || 0;
        const simFuelCurrent = SimVar.GetSimVarValue("FUEL TOTAL QUANTITY", "gallons") as number || 0;

        // Check for cheat attempt
        if (simFuelCurrent > fuelGallons + 1) {
          console.warn(`[WOA] ANTI-CHEAT Hangar: Sim fuel (${simFuelCurrent.toFixed(1)}) > DB fuel (${fuelGallons.toFixed(1)}). Resetting.`);
        }

        // Always apply DB fuel to simulator
        if (simFuelCapacity > 0) {
          console.log(`[WOA] Hangar: Applying DB fuel to simulator: ${fuelGallons} gal`);
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
      console.error("[WOA] Error fetching aircraft details:", error);
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
      console.log("[WOA] Aircraft systems:", data);
      hangarState.hangarSystems.set(data);
      this.renderHangarSystems();
      this.renderHangarList();
    } catch (error) {
      console.error("[WOA] Error fetching aircraft systems:", error);
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
      console.log("[WOA] Aircraft cargo:", data);
      hangarState.hangarCargoItems.set(data || []);
      this.renderHangarCargo();
    } catch (error) {
      console.error("[WOA] Error fetching aircraft cargo:", error);
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
      console.error("[WOA] Error fetching mission aircraft systems:", error);
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
      console.log("[WOA] Not logged in, cannot load aircraft");
      return;
    }

    console.log("[WOA] Loading current aircraft for mission...");
    missionState.missionAircraftLoading.set(true);
    missionState.missionAircraftNotFound.set(false);
    this.renderMissionAircraftInfo();

    try {
      // Step 1: Read SimVars for matching - V3.1: Only use ICAO type, not registration
      const rawAtcModel = SimVar.GetSimVarValue("ATC MODEL", "string") as string;
      const simIcaoType = this.extractIcaoType(rawAtcModel);
      const currentAirport = missionState.missionOriginIcao.get();

      console.log("[WOA] SimVars - Type:", simIcaoType, "Airport:", currentAirport);

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
          console.log("[WOA] Matched by type+airport:", matchingAircraft.registration, "(", simIcaoType, "@", currentAirport, ")");
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
          console.log("[WOA] Matched by type only:", matchingAircraft.registration, "(", simIcaoType, ")");
        }
      }

      if (!matchingAircraft) {
        console.log("[WOA] No matching aircraft found - Type:", simIcaoType, "Airport:", currentAirport);
        missionState.missionAircraftNotFound.set(true);
        missionState.missionCurrentAircraft.set(null);
        missionState.missionAircraftLoading.set(false);
        this.renderMissionAircraftInfo();
        return;
      }

      // Step 2: Fetch full details for this aircraft
      const apiData = await FleetRouter.getAircraft(matchingAircraft.id);
      console.log("[WOA] Current aircraft details:", apiData);

      // V1.6: ANTI-CHEAT - Verify aircraft location matches detected airport
      const dbAirport = apiData.current_airport_ident?.toUpperCase();
      const apiDetectedAirport = currentAirport?.toUpperCase(); // From /api/world/airports/closest
      const simVarAirport = simVarState.closestAirport.get()?.toUpperCase(); // From SimVar GPS CLOSEST AIRPORT ID

      // Use SimVar if valid, otherwise fall back to API
      const simVarValid = simVarAirport && simVarAirport !== "----" && simVarAirport.length >= 3;
      const apiValid = apiDetectedAirport && apiDetectedAirport !== "----" && apiDetectedAirport.length >= 3;

      console.log(`[WOA] ANTI-CHEAT: DB=${dbAirport}, SimVar=${simVarAirport} (valid=${simVarValid}), API=${apiDetectedAirport} (valid=${apiValid})`);

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
        console.warn(`[WOA] ANTI-CHEAT: Confirmed mismatch! DB=${dbAirport}, SimVar=${simVarAirport}`);
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
        console.log(`[WOA] ANTI-CHEAT: Location verified via SimVar - Aircraft at ${dbAirport}`);
      } else if (apiMatches) {
        console.log(`[WOA] ANTI-CHEAT: Location verified via API - Aircraft at ${dbAirport}`);
      } else if (!simVarValid) {
        console.warn(`[WOA] ANTI-CHEAT: SimVar not working, trusting DB location: ${dbAirport}`);
      } else {
        console.log(`[WOA] ANTI-CHEAT: No DB airport set, allowing`);
      }

      // Step 3: Fetch systems data
      let systemsData = { warnings: [] as string[], critical: [] as string[], can_takeoff: true };
      try {
        systemsData = await FleetRouter.getAircraftSystems(matchingAircraft.id);
      } catch (e) {
        console.log("[WOA] Could not fetch systems data");
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
          console.warn(`[WOA] ANTI-CHEAT: Sim fuel (${simFuelCurrent.toFixed(1)}) > DB fuel (${aircraftInfo.fuel_gallons.toFixed(1)}). Resetting to DB value.`);
        }

        // Always apply DB fuel to simulator (source of truth)
        console.log(`[WOA] Applying DB fuel to simulator: ${aircraftInfo.fuel_gallons} gal`);
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
      console.error("[WOA] Error loading current aircraft:", error);
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
   * V1.3: Open refuel popup - V2.5: Delegated to PopupManager
   */
  private openRefuelPopup(): void {
    popupManager.openRefuel();
  }

  /**
   * V1.4: Open systems detail popup - V2.5: Delegated to PopupManager
   */
  private openSystemsPopup(): void {
    popupManager.openSystems();
  }

  /**
   * V1.1: Perform repair - V2.5: Delegated to PopupManager
   */
  private async performRepair(aircraftId: string, systems: string[], payFrom: string): Promise<void> {
    await popupManager.confirmRepair(aircraftId, systems, payFrom);
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
    popupManager.openRepair();
  }

  /**
   * V1.4: Open edit registration popup
   */
  private openEditRegistrationPopup(): void {
    popupManager.openEditRegistration();
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
      console.log("[WOA] Registration auto-synced to:", newReg);
      void this.fetchHangarAircraftList();
    } catch (error) {
      console.error("[WOA] Error auto-syncing registration:", error);
    }
  }

  /**
   * V1.4: Update aircraft registration via API (from popup)
   * V3.1: Now works in P2P mode (no token required)
   */
  private async updateAircraftRegistration(): Promise<void> {
    await popupManager.confirmEditRegistration();
    // Refresh list after update
    void this.fetchHangarAircraftList();
  }

  /**
   * V1.5: Open repair popup from systems detail popup (works from missions or hangar)
   * Redirects to Hangar tab with aircraft selected, then opens repair popup
   */
  private openRepairPopupFromSystems(): void {
    // Switch to Hangar tab (repair popup is rendered there)
    navigationState.activeTab.set("hangar");

    // Delegate popup logic to PopupManager (handles aircraft conversion, systems close, etc.)
    setTimeout(() => {
      popupManager.openRepairFromSystems();
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
      console.warn("[WOA] Cannot sync - selected aircraft is not the active aircraft in MSFS");
      return;
    }

    // Read fuel capacity from simulator
    const simFuelCapacity = SimVar.GetSimVarValue("FUEL TOTAL CAPACITY", "gallons") as number || 0;
    const simFuelCurrent = SimVar.GetSimVarValue("FUEL TOTAL QUANTITY", "gallons") as number || 0;

    if (simFuelCapacity <= 0) {
      console.warn("[WOA] No fuel capacity from SimVar - is an aircraft loaded?");
      return;
    }

    // Get DB fuel value
    const dbFuelGallons = aircraft.fuel_gallons;

    console.log(`[WOA] SYNC: DB fuel=${dbFuelGallons}, Sim fuel=${simFuelCurrent.toFixed(1)}`);

    // Anti-cheat check
    if (simFuelCurrent > dbFuelGallons + 1) {
      console.warn(`[WOA] ANTI-CHEAT: Sim fuel (${simFuelCurrent.toFixed(1)}) > DB fuel (${dbFuelGallons}). Enforcing DB value.`);
    }

    // Apply DB fuel to simulator (source of truth)
    console.log(`[WOA] Enforcing DB fuel to simulator: ${dbFuelGallons} gal`);
    setSimulatorFuel(dbFuelGallons, simFuelCapacity);

    // P2P: Update DB capacity if different (first sync for new aircraft)
    if (Math.abs(aircraft.fuel_capacity_gallons - simFuelCapacity) > 1) {
      try {
        await FleetRouter.syncFuel(aircraft.id, dbFuelGallons, simFuelCapacity);
        console.log("[WOA] Updated fuel capacity in local DB:", simFuelCapacity);
      } catch (error) {
        console.error("[WOA] Error updating fuel capacity:", error);
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
      console.warn("[WOA] Cannot refuel - selected aircraft is not the active aircraft in MSFS");
      return;
    }

    // Get simulator capacity
    const simFuelCapacity = SimVar.GetSimVarValue("FUEL TOTAL CAPACITY", "gallons") as number || aircraft.fuel_capacity_gallons;
    const targetFuel = simFuelCapacity; // Full tank

    console.log("[WOA] Refueling hangar aircraft to full:", targetFuel, "gal");

    try {
      // Step 1: Write fuel to simulator (all tanks)
      setSimulatorFuel(targetFuel, simFuelCapacity);
      console.log("[WOA] Fuel written to simulator tanks");

      // Step 2: P2P - Sync to local database
      await FleetRouter.syncFuel(aircraft.id, targetFuel, simFuelCapacity);
      console.log("[WOA] Fuel synced to local database");

      // Step 3: Refresh aircraft details
      void this.fetchAircraftDetails(aircraft.id);

    } catch (error) {
      console.error("[WOA] Error refueling:", error);
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

    // Check if database is initialized before proceeding
    if (!DatabaseManager.isInitialized()) {
      console.log("[WOA] Auto-sync skipped: Database not yet initialized");
      return;
    }

    // Read aircraft registration from simulator (ATC ID = registration/tail number)
    const simRegistration = SimVar.GetSimVarValue("ATC ID", "string") as string;
    if (!simRegistration || simRegistration.trim() === "") {
      console.log("[WOA] No aircraft loaded in simulator, skipping auto-sync");
      return;
    }

    // Read current simulator capacity (needed to calculate percentage for setSimulatorFuel)
    const simFuelCapacity = SimVar.GetSimVarValue("FUEL TOTAL CAPACITY", "gallons") as number || 0;
    if (simFuelCapacity <= 0) {
      console.log("[WOA] No fuel capacity from SimVar, skipping auto-sync");
      return;
    }

    console.log(`[WOA] Auto-sync: Looking for aircraft ${simRegistration}`);

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

      // V1.6: Wait for airport detection if not yet available (max 5 retries, silent)
      if (!currentAirport) {
        for (let retry = 0; retry < 5 && !currentAirport; retry++) {
          await new Promise(resolve => setTimeout(resolve, 500));
          currentAirport = simVarState.closestAirport.get() !== "----" ? simVarState.closestAirport.get() : null;
        }
        if (!currentAirport) {
          // Silent abort - airport detection failing is normal when not at an airport
          return;
        }
      }

      console.log(`[WOA] Auto-sync: Type=${simIcaoType}, Airport=${currentAirport}`);

      // V1.8 SIMPLIFIED: Match by TYPE + AIRPORT only
      // No automatic registration sync - player manages registrations manually in hangar
      let matchingAircraft = null;

      if (simIcaoType && currentAirport) {
        matchingAircraft = fleet.find(
          ac => ac.icao_type?.toUpperCase() === simIcaoType.toUpperCase() &&
                ac.current_airport_ident?.toUpperCase() === currentAirport.toUpperCase()
        );

        if (matchingAircraft) {
          console.log(`[WOA] Found ${simIcaoType} at ${currentAirport}: ${matchingAircraft.registration}`);
        } else {
          // Log where this type of aircraft is available
          const sameTypeAircraft = fleet.filter(
            ac => ac.icao_type?.toUpperCase() === simIcaoType.toUpperCase()
          );
          if (sameTypeAircraft.length > 0) {
            console.log(`[WOA] No ${simIcaoType} at ${currentAirport}. Available at: ${sameTypeAircraft.map(a => `${a.registration}@${a.current_airport_ident}`).join(", ")}`);
          } else {
            console.log(`[WOA] No ${simIcaoType} in fleet`);
          }
        }
      }

      if (!matchingAircraft) {
        console.log(`[WOA] No aircraft available at ${currentAirport} for type ${simIcaoType}`);
        return;
      }

      console.log(`[WOA] Using aircraft: ${matchingAircraft.registration} (${matchingAircraft.aircraft_type})`);

      // V1.4: Anti-cheat - ALWAYS apply DB fuel to simulator
      const dbFuelGallons = Number(matchingAircraft.fuel_gallons) || 0;
      const dbFuelCapacity = Number(matchingAircraft.fuel_capacity_gallons) || simFuelCapacity;
      const simFuelCurrent = SimVar.GetSimVarValue("FUEL TOTAL QUANTITY", "gallons") as number || 0;

      console.log(`[WOA] DB fuel: ${dbFuelGallons}/${dbFuelCapacity} gal, Sim fuel: ${simFuelCurrent} gal`);

      // Check for cheat attempt (sim fuel higher than DB fuel)
      if (simFuelCurrent > dbFuelGallons + 1) {
        console.warn(`[WOA] ANTI-CHEAT: Sim fuel (${simFuelCurrent.toFixed(1)}) > DB fuel (${dbFuelGallons.toFixed(1)}). Resetting to DB value.`);
      }

      // Always apply DB fuel to simulator (source of truth)
      if (simFuelCapacity > 0) {
        console.log(`[WOA] Applying DB fuel to simulator: ${dbFuelGallons} gal`);
        setSimulatorFuel(dbFuelGallons, simFuelCapacity);
        console.log("[WOA] Fuel enforced from database to simulator");
      }

      // P2P: Update DB capacity if simulator has different capacity (first time sync)
      if (Math.abs(dbFuelCapacity - simFuelCapacity) > 1) {
        console.log(`[WOA] Updating fuel capacity in local DB: ${simFuelCapacity} gal`);
        await FleetRouter.syncFuel(matchingAircraft.id, dbFuelGallons, simFuelCapacity);
      }

      // V1.5: Also refresh aircraft condition data in UI
      // This ensures displayed condition is up-to-date when returning to app
      const currentTab = navigationState.activeTab.get();
      const hangarSelectedId = hangarState.hangarSelectedAircraft.get()?.id;

      if (currentTab === "hangar" && hangarSelectedId === matchingAircraft.id) {
        // Refresh hangar aircraft details (includes condition, hours, systems)
        console.log("[WOA] Refreshing hangar aircraft details...");
        void this.fetchAircraftDetails(matchingAircraft.id);
      } else if (currentTab === "missions") {
        // Refresh mission aircraft info (includes condition)
        console.log("[WOA] Refreshing mission aircraft info...");
        void this.loadCurrentAircraftForMission();
      }

      console.log("[WOA] Auto-sync completed (fuel + condition)");

    } catch (error) {
      console.error("[WOA] Auto-sync error:", error);
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

    console.log("[WOA] Stopping flight tracking");
    this.flightTrackingActive = false;

    if (this.flightTrackingInterval) {
      window.clearInterval(this.flightTrackingInterval);
      this.flightTrackingInterval = null;
    }
  }

  // V2.1: Reset all tracking UI variables to initial state
  private resetTrackingVariables(): void {
    console.log("[WOA] Resetting tracking variables");
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

    console.log("[WOA] Starting V2.0 flight tracking via TrackingManager");
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
      console.log(`[WOA] Checkpoint check: ${checkpoints.length} checkpoints, next=#${nextSeq}`);
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
      console.log(`[WOA] V1.0: Checkpoint ${nextSeq} within range (${distance.toFixed(2)} nm)`);

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

        console.log(`[WOA] V1.0: Checkpoint ${nextSeq} validated!`, result);

        // Update local checkpoint state
        const updatedCheckpoints = checkpoints.map(cp =>
          cp.sequence === nextSeq ? { ...cp, validated: true, validated_at: new Date().toISOString() } : cp
        );
        missionState.missionCheckpoints.set(updatedCheckpoints);
        missionState.checkpointsValidated.set(result.checkpoint_index || nextSeq);
        missionState.nextCheckpoint.set(nextSeq + 1);
      } catch (error) {
        console.error("[WOA] V1.0: Error validating checkpoint:", error);
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
      console.log("[WOA] Direct-To: No next checkpoint available");
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
      console.log("[WOA] SimVars sent (works on basic GPS aircraft)");
    } catch (error) {
      console.log("[WOA] SimVar method not supported on this aircraft");
    }
  }

  // V1.0: Display all checkpoints coordinates for manual entry
  private showAllCheckpointsCoords(): void {
    const checkpoints = missionState.missionCheckpoints.get();
    const mission = missionState.activeMission.get();

    if (!checkpoints || checkpoints.length === 0) {
      console.log("[WOA] No checkpoints available");
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
      console.log("[WOA] No checkpoints to display");
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
      console.log("[WOA] Clipboard error:", error);
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
        console.log(`[WOA] Copied to clipboard: ${coordStr}`);
      } else {
        // Fallback: just show notification
        popupState.popupNotification.set(`${cpName}: ${coordStr}`);
        console.log(`[WOA] Clipboard not available, coords: ${coordStr}`);
      }
    } catch (error) {
      popupState.popupNotification.set(`${cpName}: ${coordStr}`);
      console.log(`[WOA] Copy failed, coords: ${coordStr}`);
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
      console.log("[WOA] Sim rate set to:", rate);
    } catch (e) {
      console.error("[WOA] Failed to set sim rate:", e);
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

    console.log("[WOA] V1.0: Completing mission with modifiers:", mission.id);

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
        console.log("[WOA] Could not get closest airport");
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
      console.error("[WOA] V1.0 Error completing mission:", error);
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

      console.log(`[WOA] Centered on ${icao}: ${airport.name || ""} (${airportLat}, ${airportLon})`);
      mapState.icaoSearchStatus.set("success");

      // Clear input after successful search
      inputEl.value = "";

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("[WOA] ICAO search failed:", errorMsg);
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
      // Note: Array.flat() not supported in Coherent GT - use concat spread instead
      const airports = ([] as typeof results[0]).concat(...results);

      console.log(`[WOA] Zoom ${zoom.toFixed(1)} - Fetched ${airports.length} airports (L:${results[0]?.length || 0} M:${results[1]?.length || 0} S:${results[2]?.length || 0})`);

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
      console.error("[WOA] Fetch airports for map FAILED:", errorMsg);
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
    console.log("[WOA] P2P mode - factories not available");
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
      console.log(`[WOA] Zoom ${zoom.toFixed(1)} too low for helipads`);
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
      console.log(`[WOA] Zoom ${zoom.toFixed(1)} - Fetched ${helipads.length} helipads`);

      // V2.1: Delegate feature creation to MapManager
      mapManager.loadHelipads(helipads);

      mapState.helipadsOnMapStatus.set("success");

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("[WOA] Fetch helipads for map FAILED:", errorMsg);
      mapState.helipadsOnMapStatus.set("error");
    }
  }

  private async fetchInventory(type: "player" | "company"): Promise<void> {
    inventoryState.inventoryType.set(type);
    console.log(`[WOA] Fetching ${type} inventory...`);
    inventoryState.inventoryStatus.set("loading");
    inventoryState.inventoryError.set(null);

    try {
      // P2P: Use MarketRouter for local inventory
      const items = type === "player"
        ? await MarketRouter.getPlayerInventory()
        : await MarketRouter.getCompanyInventory();

      console.log(`[WOA] ${type} Inventory:`, items);

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
      console.error(`[WOA] ${type} Inventory FAILED:`, errorMsg);
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
      // Always load player balance first (needed for buy company form)
      const playerBalance = await MarketRouter.getPlayerBalance().catch(() => 0);
      marketState.walletPersonal.set(playerBalance);
      console.log("[WOA] Player balance loaded:", playerBalance);

      // Fetch company info
      const company = await MarketRouter.getCompanyInfo();
      if (!company) {
        companyState.companyData.set(null);
        companyState.companyLoading.set(false);
        return;
      }
      companyState.companyData.set(company);
      console.log("[WOA] Company loaded:", company);

      // Fetch members and fleet in parallel
      const [members, fleet] = await Promise.all([
        MarketRouter.getCompanyMembers().catch(() => []),
        FleetRouter.getFleet().catch(() => []),
      ]);
      companyState.companyMembers.set(members);
      companyState.companyFleet.set(fleet);
      console.log("[WOA] Members loaded:", members.length, "Fleet loaded:", fleet.length);

      this.renderCompanyTab();

    } catch (error) {
      console.error("[WOA] Error fetching company data:", error);
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
      console.log("[WOA] Buy company only available in P2P mode");
      return;
    }

    const companyName = companyState.buyCompanyName.get().trim();
    if (!companyName) {
      companyState.buyCompanyError.set(this.t("company", "enterCompanyName") || "Please enter a company name");
      return;
    }

    const companyAirport = companyState.buyCompanyAirport.get().trim().toUpperCase();
    if (!companyAirport || companyAirport.length !== 4) {
      companyState.buyCompanyError.set(this.t("company", "enterAirportCode") || "Please enter a valid 4-letter ICAO code");
      return;
    }

    companyState.buyCompanyLoading.set(true);
    companyState.buyCompanyError.set(null);

    try {
      // Use InitService to purchase company with chosen headquarters
      const company = await InitService.purchaseCompany(companyName, companyAirport);
      console.log("[WOA] Company purchased:", company.name, "at", company.headquarters_icao);

      // Update state
      companyState.companyData.set({
        id: company.id,
        name: company.name,
        balance: company.balance,
        created_at: company.created_at,
        home_airport_ident: company.headquarters_icao || companyAirport,
      });

      // Update wallet balance (deduct 50,000)
      const player = await InitService.getPlayerInfo();
      if (player) {
        marketState.walletPersonal.set(player.money);
      }

      // Clear form
      companyState.buyCompanyName.set("");
      companyState.buyCompanyAirport.set("");

      // Refresh company tab
      void this.fetchCompanyData();

    } catch (error) {
      console.error("[WOA] Error buying company:", error);
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
      const [playerBalance, company, listings] = await Promise.all([
        MarketRouter.getPlayerBalance().catch(() => 0),  // Player personal wallet
        !companyState.companyData.get() ? MarketRouter.getCompanyInfo() : Promise.resolve(companyState.companyData.get()),
        MarketRouter.getMarketListings(tierFilter, 100),
      ]);

      marketState.walletPersonal.set(playerBalance);
      if (company && !companyState.companyData.get()) {
        companyState.companyData.set(company);
      }
      marketState.marketListings.set(listings);
      console.log("[WOA] Market loaded:", listings.length, "listings");

      this.renderMarketTab();

    } catch (error) {
      console.error("[WOA] Error fetching market data:", error);
      marketState.marketError.set(this.t("market", "errorLoadingMarket"));
    } finally {
      marketState.marketLoading.set(false);
    }
  }

  private renderMarketTab(): void {
    const listingsEl = this.marketListingsRef.getOrDefault();
    if (!listingsEl) return;

    // Filter listings by ICAO and/or item name if filters are set
    const icaoFilter = marketState.marketIcaoFilter.get().trim().toUpperCase();
    const itemFilter = marketState.marketItemFilter.get().trim().toLowerCase();
    let listings = marketState.marketListings.get();
    if (icaoFilter.length > 0) {
      listings = listings.filter(l => l.airport_ident && l.airport_ident.toUpperCase().includes(icaoFilter));
    }
    if (itemFilter.length > 0) {
      listings = listings.filter(l => l.item_name && l.item_name.toLowerCase().includes(itemFilter));
    }
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
      console.error("[WOA] Market item not found");
      return;
    }

    // Delegate to PopupManager with MarketBuyItem
    popupManager.openMarketBuy({
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
  }

  private closeMarketBuyPopup(): void {
    popupManager.closeMarketBuy();
  }

  private updateMarketBuyQty(qty: number): void {
    popupManager.updateMarketBuyQty(qty);
  }

  private async confirmMarketBuy(): Promise<void> {
    await popupManager.confirmMarketBuy();
  }

  // ═══════════════════════════════════════════════════════════
  // PROFILE INVENTORY
  // ═══════════════════════════════════════════════════════════

  private async fetchProfileInventory(): Promise<void> {
    // P2P mode check
    if (!authState.isP2PMode.get() && !authState.authToken.get()) return;

    inventoryState.profileInventoryLoading.set(true);

    try {
      // Get all player's inventory from all airport locations
      const rawInventory = await MarketRouter.getPlayerInventory();

      // Map to ProfileInventoryItem format
      const items = rawInventory.map(inv => ({
        id: inv.id,
        item_code: inv.item_type,
        item_name: inv.item_name,
        quantity: inv.quantity,
        airport_icao: inv.airport_icao,
        tier: inv.tier,
      }));

      inventoryState.profileInventory.set(items);
      console.log("[WOA] Profile inventory loaded:", items.length, "items");

      this.renderProfileInventory();

    } catch (error) {
      console.error("[WOA] Error fetching profile inventory:", error);
    } finally {
      inventoryState.profileInventoryLoading.set(false);
    }
  }

  /**
   * Shared grouped inventory renderer - used by both profile and company inventory
   */
  private renderGroupedInventory(
    listEl: HTMLElement | null,
    items: Array<{ id: string; item_code: string; item_name: string; quantity: number; airport_icao: string; tier: number }>,
    filters: { icao: string; item: string; tier: number | null }
  ): void {
    if (!listEl) return;

    // Apply filters
    let filtered = items;
    if (filters.icao.length > 0) {
      filtered = filtered.filter(i => i.airport_icao?.toUpperCase().includes(filters.icao.toUpperCase()));
    }
    if (filters.item.length > 0) {
      filtered = filtered.filter(i => i.item_name?.toLowerCase().includes(filters.item.toLowerCase()));
    }
    if (filters.tier !== null) {
      filtered = filtered.filter(i => i.tier === filters.tier);
    }

    // Render empty state
    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div style="background: #252532; border-radius: 12px; padding: 24px; text-align: center;">
          <svg style="width: 40px; height: 40px; margin-bottom: 12px; opacity: 0.4;" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5">
            <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
            <path d="M3.27 6.96L12 12.01l8.73-5.05"/>
            <path d="M12 22.08V12"/>
          </svg>
          <div style="color: #6b7280; font-size: 12px;">${this.t("inventory", "noItems")}</div>
        </div>
      `;
      return;
    }

    // Group by airport
    const byAirport: Record<string, typeof filtered> = {};
    for (const item of filtered) {
      const icao = item.airport_icao || "UNKNOWN";
      if (!byAirport[icao]) byAirport[icao] = [];
      byAirport[icao].push(item);
    }

    // Render grouped inventory
    let html = "";
    for (const icao of Object.keys(byAirport)) {
      const airportItems = byAirport[icao];
      html += `<div style="background: #252532; border-radius: 8px; padding: 12px; margin-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <span style="font-family: monospace; color: #60a5fa; font-size: 12px; font-weight: 600;">${icao}</span>
          <span style="font-size: 10px; color: #6b7280;">(${airportItems.length} items)</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 4px;">`;
      for (const item of airportItems) {
        const tierColor = item.tier === 0 ? "#6b7280" : item.tier === 1 ? "#22c55e" : item.tier === 2 ? "#3b82f6" : "#a855f7";
        html += `<div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; background: #1a1a24; border-radius: 4px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="width: 6px; height: 6px; border-radius: 50%; background: ${tierColor};"></span>
            <span style="font-size: 11px; color: white;">${item.item_name}</span>
          </div>
          <span style="font-size: 11px; color: #9ca3af; font-weight: 600;">x${item.quantity}</span>
        </div>`;
      }
      html += `</div></div>`;
    }
    listEl.innerHTML = html;
  }

  private renderProfileInventory(): void {
    this.renderGroupedInventory(
      this.profileInventoryListRef.getOrDefault(),
      inventoryState.profileInventory.get(),
      {
        icao: inventoryState.profileIcaoFilter.get().trim(),
        item: inventoryState.profileItemFilter.get().trim(),
        tier: inventoryState.profileTierFilter.get()
      }
    );
  }

  // ═══════════════════════════════════════════════════════════
  // COMPANY INVENTORY
  // ═══════════════════════════════════════════════════════════

  private async fetchCompanyInventory(): Promise<void> {
    // P2P mode check
    if (!authState.isP2PMode.get() && !authState.authToken.get()) return;

    inventoryState.companyInventoryLoading.set(true);

    try {
      // Get all company's inventory from all airport locations
      const rawInventory = await MarketRouter.getCompanyInventory();

      // Map to ProfileInventoryItem format
      const items = rawInventory.map(inv => ({
        id: inv.id,
        item_code: inv.item_type,
        item_name: inv.item_name,
        quantity: inv.quantity,
        airport_icao: inv.airport_icao,
        tier: inv.tier,
      }));

      inventoryState.companyInventory.set(items);
      console.log("[WOA] Company inventory loaded:", items.length, "items");

      this.renderCompanyInventory();

    } catch (error) {
      console.error("[WOA] Error fetching company inventory:", error);
    } finally {
      inventoryState.companyInventoryLoading.set(false);
    }
  }

  private renderCompanyInventory(): void {
    this.renderGroupedInventory(
      this.companyInventoryListRef.getOrDefault(),
      inventoryState.companyInventory.get(),
      {
        icao: inventoryState.companyIcaoFilter.get().trim(),
        item: inventoryState.companyItemFilter.get().trim(),
        tier: inventoryState.companyTierFilter.get()
      }
    );
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
              <span style="font-size: 11px; font-weight: 600; color: #60a5fa;">World of Aircraft</span>
              <span style="font-size: 8px; color: #6b7280;">v0.9</span>
            </div>

            {/* Connection Status Indicator - V3.0: ONLINE (green) or OFFLINE (red) */}
            <div style="margin-right: 60px;">
              <div style={MappedSubject.create(([status, offlineSimulated, gameMode]) => {
                // V3.0: Solo mode = always OFFLINE (red), Online mode = depends on connection
                const isSolo = gameMode === "solo";
                const isOnline = !isSolo && status === "connected" && !offlineSimulated;
                const isConnecting = !isSolo && status === "connecting" && !offlineSimulated;
                return isOnline
                  ? "display: flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 16px; background: rgba(34, 197, 94, 0.25); border: 1px solid #22c55e;"
                  : isConnecting
                    ? "display: flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 16px; background: rgba(251, 191, 36, 0.25); border: 1px solid #fbbf24;"
                    : "display: flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 16px; background: rgba(239, 68, 68, 0.25); border: 1px solid #ef4444;";
              }, authState.seedConnectionStatus, settingsState.isOfflineSimulated, gameModeState.currentMode)}>
                {/* Status dot */}
                <div style={MappedSubject.create(([status, offlineSimulated, gameMode]) => {
                  const isSolo = gameMode === "solo";
                  const isOnline = !isSolo && status === "connected" && !offlineSimulated;
                  const isConnecting = !isSolo && status === "connecting" && !offlineSimulated;
                  return isOnline
                    ? "width: 8px; height: 8px; border-radius: 50%; background: #22c55e; flex-shrink: 0;"
                    : isConnecting
                      ? "width: 8px; height: 8px; border-radius: 50%; background: #fbbf24; flex-shrink: 0;"
                      : "width: 8px; height: 8px; border-radius: 50%; background: #ef4444; flex-shrink: 0;";
                }, authState.seedConnectionStatus, settingsState.isOfflineSimulated, gameModeState.currentMode)}></div>
                <span style={MappedSubject.create(([status, offlineSimulated, gameMode]) => {
                  const isSolo = gameMode === "solo";
                  const isOnline = !isSolo && status === "connected" && !offlineSimulated;
                  const isConnecting = !isSolo && status === "connecting" && !offlineSimulated;
                  return isOnline
                    ? "font-size: 10px; color: #22c55e; font-weight: 600; text-transform: uppercase;"
                    : isConnecting
                      ? "font-size: 10px; color: #fbbf24; font-weight: 600; text-transform: uppercase;"
                      : "font-size: 10px; color: #ef4444; font-weight: 600; text-transform: uppercase;";
                }, authState.seedConnectionStatus, settingsState.isOfflineSimulated, gameModeState.currentMode)}>
                  {MappedSubject.create(([status, offlineSimulated, gameMode]) => {
                    const isSolo = gameMode === "solo";
                    const isOnline = !isSolo && status === "connected" && !offlineSimulated;
                    const isConnecting = !isSolo && status === "connecting" && !offlineSimulated;
                    return isOnline ? "ONLINE" : isConnecting ? "..." : "OFFLINE";
                  }, authState.seedConnectionStatus, settingsState.isOfflineSimulated, gameModeState.currentMode)}
                </span>
              </div>
            </div>
          </div>

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

          {/* SEED Connection Screen - Monde Unique */}
          {renderConnectionScreen({
            connectionStatus: authState.seedConnectionStatus,
            connectionError: authState.seedConnectionError,
            initProgress: authState.seedInitProgress,
            initStep: authState.seedInitStep,
            currentLanguage: settingsState.currentLanguage,
            onRetry: this.handleRetryConnection,
          })}

          {/* V3.0: Mode Selection Screen - Solo / Online */}
          {renderModeSelectionScreen({
            showSelector: gameModeState.showModeSelector,
            loading: gameModeState.modeSwitchLoading,
            error: gameModeState.modeSwitchError,
            onSelectMode: (mode) => this.handleSelectGameMode(mode),
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
            // Inventory
            profileInventory: inventoryState.profileInventory,
            profileInventoryLoading: inventoryState.profileInventoryLoading,
            profileIcaoFilter: inventoryState.profileIcaoFilter,
            profileItemFilter: inventoryState.profileItemFilter,
            profileTierFilter: inventoryState.profileTierFilter,
            profileIcaoFilterRef: this.profileIcaoFilterRef,
            profileItemFilterRef: this.profileItemFilterRef,
            profileInventoryListRef: this.profileInventoryListRef,
            onFetchProfileInventory: () => { void this.fetchProfileInventory(); },
            onSetProfileTierFilter: (tier: number | null) => { inventoryState.profileTierFilter.set(tier); this.renderProfileInventory(); },
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
            buyCompanyAirport: companyState.buyCompanyAirport,
            buyCompanyLoading: companyState.buyCompanyLoading,
            buyCompanyError: companyState.buyCompanyError,
            buyCompanyNameInputRef: this.buyCompanyNameInputRef,
            buyCompanyAirportInputRef: this.buyCompanyAirportInputRef,
            onBuyCompany: () => { void this.handleBuyCompany(); },
            // Company inventory
            companyInventory: inventoryState.companyInventory,
            companyInventoryLoading: inventoryState.companyInventoryLoading,
            companyIcaoFilter: inventoryState.companyIcaoFilter,
            companyItemFilter: inventoryState.companyItemFilter,
            companyTierFilter: inventoryState.companyTierFilter,
            companyIcaoFilterRef: this.companyIcaoFilterRef,
            companyItemFilterRef: this.companyItemFilterRef,
            companyInventoryListRef: this.companyInventoryListRef,
            onFetchCompanyInventory: () => { void this.fetchCompanyInventory(); },
            onSetCompanyTierFilter: (tier: number | null) => {
              inventoryState.companyTierFilter.set(tier);
              this.renderCompanyInventory();
            },
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
            marketIcaoFilter: marketState.marketIcaoFilter,
            marketIcaoFilterRef: this.marketIcaoFilterRef,
            marketItemFilter: marketState.marketItemFilter,
            marketItemFilterRef: this.marketItemFilterRef,
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
            isOfflineSimulated: settingsState.isOfflineSimulated,
            currentGameMode: gameModeState.currentMode,
            onSetLanguage: (lang: Language) => this.setLanguage(lang),
            onResetData: () => this.resetAllData(),
            onTestCommBus: () => { void this.testCommBus(); },
            onSimulateOffline: () => { void this.toggleSimulateOffline(); },
            onChangeGameMode: () => showModeSelector(),
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

class WorldOfAircraftApp extends App {
  public get name(): string {
    return "World of Aircraft";
  }

  public get icon(): string {
    return `${BASE_URL}/Assets/app-icon.svg`;
  }

  public BootMode = AppBootMode.WARM;
  public SuspendMode = AppSuspendMode.SLEEP;

  public async install(_props: AppInstallProps): Promise<void> {
    Efb.loadCss(`${BASE_URL}/WorldOfAircraft.css`);
    return Promise.resolve();
  }

  public get compatibleAircraftModels(): string[] | undefined {
    return undefined;
  }

  public render(): TVNode<WorldOfAircraftView> {
    return <WorldOfAircraftView bus={this.bus} />;
  }
}

Efb.use(WorldOfAircraftApp);
