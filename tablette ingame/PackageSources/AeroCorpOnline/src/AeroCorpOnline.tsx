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

// OpenLayers CSS (map rendering handled by MapController)
import "ol/ol.css";

import "./AeroCorpOnline.scss";

// V1.7: Modular architecture - types and constants extracted for maintainability
import type {
  Language,
  FlightHistoryEntry,
} from "./types";
import {
  SIMVAR_UPDATE_INTERVAL_MS,
} from "./constants";
// V3.0: Service Routers - route to IndexedDB (Solo) or SEED (Online)
import { FleetRouter, ContractRouter } from "./services";

// V2.0: Managers for business logic
import { trackingManager, missionCreationManager, PersistenceManager, popupManager } from "./managers";
import type { FlightPlanData, PayloadState } from "./managers";

// P2P: Local database initialization and AI economy
import { InitService, AIEconomyService } from "./services";
import { DatabaseManager } from "./managers/DatabaseManager";

// V2.1: Sync services for hybrid online/offline mode
import { SyncService } from "./services/SyncService";
import { SyncManager } from "./services/SyncManager";
import { NetworkState } from "./state/NetworkState";
import { isGameReady, setGameMode, resetModeSelection, isSoloMode } from "./state/GameModeState";
import { factoryState } from "./state/FactoryState";
import { PositionService } from "./services/PositionService";
import { FreeFlightController } from "./controllers/FreeFlightController";
import { positionState } from "./state/positionState";
import { NativePersistence } from "./services/NativePersistence";
import { readCriticalSimVars } from "./services/SimVarReader";

// Render helpers for DOM updates
import {
  // V2.4: Free flight render helpers (recap extracted to freeFlightRecapHelper)
  // V4.1: Specialized history renderers
  renderTransactionsHistoryHtml,
  renderFlightsHistoryHtml,
  type UnifiedTimelineEntry,
  type UnifiedHistoryTranslations,
  // Phase 1: Header bar level calculation
  calculateLevel,
} from "./helpers";
import { ContractController, CompanyController, MapController, MarketController, HangarController, MissionController, SocialController, FactoryController } from "./controllers";

// Popup HTML generators and UI components
import {
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
  freeFlightState,
  transferState,
  type FlightPhaseId,
  closeSellItemPopup,
  closeSellAircraftPopup,
} from "./state";
import type { FreeFlightRecapData } from "./state/FreeFlightState";

// Global MSFS declarations in src/types/msfs-globals.d.ts

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

class AeroCorpOnlineView extends AppView<RequiredProps<AppViewProps, "bus">> {
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

  // Map refs (used in JSX, passed to MapController)
  private nearbyAirportsListRef = FSComponent.createRef<HTMLDivElement>();
  private mapContainerRef = FSComponent.createRef<HTMLDivElement>();

  // V0.8 Mission refs (state moved to MissionController)
  private aircraftListRef = FSComponent.createRef<HTMLDivElement>();
  private airportInventoryRef = FSComponent.createRef<HTMLDivElement>();
  private aircraftCargoRef = FSComponent.createRef<HTMLDivElement>();

  // V4.1: Passengers refs
  private airportPassengersRef = FSComponent.createRef<HTMLDivElement>();
  private aircraftPassengersRef = FSComponent.createRef<HTMLDivElement>();

  // Cargo transfer popup refs
  private cargoPopupSliderRef = FSComponent.createRef<HTMLInputElement>();
  private cargoPopupQtyRef = FSComponent.createRef<HTMLSpanElement>();

  // Flight plan destination input ref
  private fpDestinationInputRef = FSComponent.createRef<HTMLInputElement>();

  // Hangar DOM refs
  private hangarListRef = FSComponent.createRef<HTMLDivElement>();
  private hangarFilterRef = FSComponent.createRef<HTMLInputElement>();
  private hangarSystemsListRef = FSComponent.createRef<HTMLDivElement>();
  private hangarRepairListRef = FSComponent.createRef<HTMLDivElement>();
  private hangarCargoListRef = FSComponent.createRef<HTMLDivElement>();
  private hangarEditRegInputRef = FSComponent.createRef<HTMLInputElement>();
  private transferIcaoInputRef = FSComponent.createRef<HTMLInputElement>();

  // Mission creation DOM refs
  private missionAircraftInfoRef = FSComponent.createRef<HTMLDivElement>();

  // Popup DOM refs
  private refuelPopupRef = FSComponent.createRef<HTMLDivElement>();
  private systemsPopupRef = FSComponent.createRef<HTMLDivElement>();

  // Company DOM refs
  private companyMembersRef = FSComponent.createRef<HTMLDivElement>();
  private companyFleetRef = FSComponent.createRef<HTMLDivElement>();
  private companyMembersFullRef = FSComponent.createRef<HTMLDivElement>();
  private companyHistoryRef = FSComponent.createRef<HTMLDivElement>();
  private companyMessagesRef = FSComponent.createRef<HTMLDivElement>();
  private companyMessageInputRef = FSComponent.createRef<HTMLInputElement>();
  private transferAmountInputRef = FSComponent.createRef<HTMLInputElement>();
  // Phase 9.7: Factory refs
  private factoryListRef = FSComponent.createRef<HTMLDivElement>();
  private factoryDetailRef = FSComponent.createRef<HTMLDivElement>();

  // Market DOM refs
  private marketListingsRef = FSComponent.createRef<HTMLDivElement>();
  private marketBuyQtySliderRef = FSComponent.createRef<HTMLInputElement>();
  private marketBuyQtyDisplayRef = FSComponent.createRef<HTMLSpanElement>();
  private marketIcaoFilterRef = FSComponent.createRef<HTMLInputElement>();
  private marketItemFilterRef = FSComponent.createRef<HTMLInputElement>();
  // V4.1: Sell orders and aircraft catalog refs
  private mySellOrdersRef = FSComponent.createRef<HTMLDivElement>();
  private aircraftCatalogRef = FSComponent.createRef<HTMLDivElement>();
  private myAircraftForSaleRef = FSComponent.createRef<HTMLDivElement>();
  // V4.1: Market inventory refs
  private marketInventoryListRef = FSComponent.createRef<HTMLDivElement>();
  private marketInvIcaoFilterRef = FSComponent.createRef<HTMLInputElement>();
  private marketInvItemFilterRef = FSComponent.createRef<HTMLInputElement>();
  // V4.1: Sell popups refs
  private sellItemPopupRef = FSComponent.createRef<HTMLDivElement>();
  private sellAircraftPopupRef = FSComponent.createRef<HTMLDivElement>();

  // V5: Contract DOM refs (kept for JSX render) + controller
  private availableContractsRef = FSComponent.createRef<HTMLDivElement>();
  private contractFiltersRef = FSComponent.createRef<HTMLDivElement>();
  private activeContractsRef = FSComponent.createRef<HTMLDivElement>();
  private completedContractsRef = FSComponent.createRef<HTMLDivElement>();
  private contractPopupRef = FSComponent.createRef<HTMLDivElement>();
  private contractController = new ContractController(
    {
      availableContracts: this.availableContractsRef,
      contractFilters: this.contractFiltersRef,
      activeContracts: this.activeContractsRef,
      completedContracts: this.completedContractsRef,
      contractPopup: this.contractPopupRef,
    },
    (section: string, key: string) => this.t(section as any, key),
    // Phase 6b: After accepting a contract, open creation flow with destination pre-filled
    (destinationIcao: string) => {
      this.showCreationFlow.set(true);
      // Chain async refreshes so data is ready before UI reads it
      void (async () => {
        await this.missionController.refreshMissionOrigin();
        await this.hangarController.autoSyncCurrentAircraft();
        const origin = missionState.missionOriginIcao.get();
        if (origin && origin !== "----") {
          void this.missionController.fetchAirportInventoryForCargo(origin);
        }
        // Pre-fill destination ICAO
        missionCreationState.fpDestinationInput.set(destinationIcao);
        setTimeout(() => {
          this.missionController.setupDestinationInput(this.fpDestinationInputRef.getOrDefault());
          const inputEl = this.fpDestinationInputRef.getOrDefault();
          if (inputEl) {
            inputEl.value = destinationIcao;
          }
        }, 150);
      })();
    }
  );

  // Profile inventory refs
  private profileIcaoFilterRef = FSComponent.createRef<HTMLInputElement>();
  private profileItemFilterRef = FSComponent.createRef<HTMLInputElement>();
  private profileInventoryListRef = FSComponent.createRef<HTMLDivElement>();

  // V2.4: Flight history refs and state
  private flightHistoryRef = FSComponent.createRef<HTMLDivElement>();
  private flightHistoryLoading = Subject.create<boolean>(false);
  private flightHistoryEntries: FlightHistoryEntry[] = [];

  // V4.1: Specialized history refs
  private missionHistoryRef = FSComponent.createRef<HTMLDivElement>();
  private missionHistoryLoading = Subject.create<boolean>(false);
  // Phase 6b: Toggle creation flow / contracts list in missions tab
  private showCreationFlow = Subject.create<boolean>(false);
  private profileFlightHistoryRef = FSComponent.createRef<HTMLDivElement>();
  private profileFlightHistoryLoading = Subject.create<boolean>(false);
  private transactionLogEntries: import("./managers/DatabaseManager").TransactionLog[] = [];

  // V2.4: Free flight recap popup ref
  private freeFlightRecapRef = FSComponent.createRef<HTMLDivElement>();
  private freeFlightController = new FreeFlightController({
    recapPopupRef: this.freeFlightRecapRef,
    translations: translations as any,
  });

  // Company inventory refs
  private companyIcaoFilterRef = FSComponent.createRef<HTMLInputElement>();
  private companyItemFilterRef = FSComponent.createRef<HTMLInputElement>();
  private companyInventoryListRef = FSComponent.createRef<HTMLDivElement>();

  // V7: Pilot transfer state — uses positionState.dbAirport (single source of truth)

  // V6: Social refs
  private socialFriendsListRef = FSComponent.createRef<HTMLDivElement>();
  private socialSearchInputRef = FSComponent.createRef<HTMLInputElement>();
  private socialSearchResultsRef = FSComponent.createRef<HTMLDivElement>();
  private socialPendingRef = FSComponent.createRef<HTMLDivElement>();
  private socialConversationsRef = FSComponent.createRef<HTMLDivElement>();
  private socialMessagesRef = FSComponent.createRef<HTMLDivElement>();
  private socialMessageInputRef = FSComponent.createRef<HTMLInputElement>();

  // V6: Social controller
  private socialController = new SocialController(
    {
      friendsList: this.socialFriendsListRef,
      searchInput: this.socialSearchInputRef,
      searchResults: this.socialSearchResultsRef,
      pendingRequests: this.socialPendingRef,
      conversationsList: this.socialConversationsRef,
      messagesContainer: this.socialMessagesRef,
      messageInput: this.socialMessageInputRef,
    },
    (section: string, key: string) => this.t(section as any, key),
    { setupInputEventBlocker: (el) => this.setupInputEventBlocker(el) }
  );

  // V6.1: Company controller
  private companyController = new CompanyController(
    {
      companyMembers: this.companyMembersRef,
      companyFleet: this.companyFleetRef,
      companyMembersFull: this.companyMembersFullRef,
      companyHistory: this.companyHistoryRef,
      companyMessages: this.companyMessagesRef,
      companyMessageInput: this.companyMessageInputRef,
      transferAmount: this.transferAmountInputRef,
      companyInventoryList: this.companyInventoryListRef,
      companyIcaoFilter: this.companyIcaoFilterRef,
      companyItemFilter: this.companyItemFilterRef,
    },
    (section: string, key: string) => this.t(section as any, key),
    {
      setupInputEventBlocker: (el: HTMLInputElement | null) => { if (el) this.setupInputEventBlocker(el); },
      renderGroupedInventory: (el: HTMLElement | null, items: any[], filters: any) => this.marketController.renderGroupedInventory(el, items, filters),
    }
  );

  // Phase 9.7: Factory controller
  private factoryController = new FactoryController(
    {
      factoryList: this.factoryListRef,
      factoryDetail: this.factoryDetailRef,
    },
    (section: string, key: string) => this.t(section as any, key)
  );

  private mapController = new MapController(
    {
      mapContainer: this.mapContainerRef,
      nearbyAirportsList: this.nearbyAirportsListRef,
      icaoSearchInput: this.icaoSearchInputRef,
    },
    (section: string, key: string) => this.t(section as any, key)
  );

  private marketController = new MarketController(
    {
      marketListings: this.marketListingsRef,
      marketBuyQtySlider: this.marketBuyQtySliderRef,
      marketBuyQtyDisplay: this.marketBuyQtyDisplayRef,
      marketIcaoFilter: this.marketIcaoFilterRef,
      marketItemFilter: this.marketItemFilterRef,
      mySellOrders: this.mySellOrdersRef,
      aircraftCatalog: this.aircraftCatalogRef,
      myAircraftForSale: this.myAircraftForSaleRef,
      marketInventoryList: this.marketInventoryListRef,
      marketInvIcaoFilter: this.marketInvIcaoFilterRef,
      marketInvItemFilter: this.marketInvItemFilterRef,
      sellItemPopup: this.sellItemPopupRef,
      sellAircraftPopup: this.sellAircraftPopupRef,
      profileIcaoFilter: this.profileIcaoFilterRef,
      profileItemFilter: this.profileItemFilterRef,
      profileInventoryList: this.profileInventoryListRef,
    },
    (section: string, key: string) => this.t(section as any, key),
    {
      onRefreshCompanyData: () => { void this.companyController.fetchCompanyData(); },
      onRefreshHangar: () => { void this.hangarController.fetchHangarAircraftList(); },
    }
  );

  // V9.0: Hangar controller
  private hangarController = new HangarController(
    {
      hangarList: this.hangarListRef,
      hangarFilter: this.hangarFilterRef,
      hangarSystemsList: this.hangarSystemsListRef,
      hangarRepairList: this.hangarRepairListRef,
      hangarCargoList: this.hangarCargoListRef,
      hangarEditRegInput: this.hangarEditRegInputRef,
      refuelPopup: this.refuelPopupRef,
      systemsPopup: this.systemsPopupRef,
    },
    (section: string, key: string) => this.t(section as any, key),
    {
      onLoadCurrentAircraftForMission: () => { void this.missionController.loadCurrentAircraftForMission(); },
      setupInputEventBlocker: (el) => this.setupInputEventBlocker(el),
      extractIcaoType: (atcModel) => this.missionController.extractIcaoType(atcModel),
    }
  );

  // V9.0: Mission controller
  private missionController = new MissionController(
    {
      aircraftList: this.aircraftListRef,
      airportInventory: this.airportInventoryRef,
      aircraftCargo: this.aircraftCargoRef,
      airportPassengers: this.airportPassengersRef,
      aircraftPassengers: this.aircraftPassengersRef,
      cargoPopupSlider: this.cargoPopupSliderRef,
      cargoPopupQty: this.cargoPopupQtyRef,
      fpDestinationInput: this.fpDestinationInputRef,
      missionAircraftInfo: this.missionAircraftInfoRef,
    },
    (section: string, key: string) => this.t(section as any, key),
    {
      onRefreshProfileInventory: () => { void this.marketController.fetchProfileInventory(); },
      setupInputEventBlocker: (el) => this.setupInputEventBlocker(el),
      onOpenRefuelPopup: () => this.hangarController.openRefuelPopup(),
      onOpenSystemsPopup: () => this.hangarController.openSystemsPopup(),
    }
  );

  private updateInterval: number | null = null;

  // Subscriptions array for cleanup (PASSE 3 - memory leak fix)
  private stateSubscriptions: Array<{ destroy: () => void }> = [];

  public onOpen(): void {
    this.startSimVarUpdates();
    this.loadAuthFromStorage();

    // P2P: Initialize local database (IndexedDB)
    this.initializeLocalDatabase();

    // V2.0: Initialize tracking manager with callbacks
    this.initializeTrackingManager();

    // V2.1: Initialize map manager with callbacks
    this.mapController.initializeMapManager();

    // V2.2: Initialize mission creation manager with callbacks
    this.initializeMissionCreationManager();

    // V3.0: Initialize free flight controller (FlightTracker + subscriptions + recap)
    this.freeFlightController.initialize();

    // V7.1: Transfer ICAO input popup
    this.initializeTransferPopup();

    // NOTE: PositionService.loadFromDb() is NOT called here — it must wait
    // for DatabaseManager.initialize() + restoreFromDataStore() to complete.
    // It is called in onComplete callback of InitService instead.

    // V2.5: Initialize popup manager for centralized popup logic
    this.initializePopupManager();

    // Force map re-initialization on app open (handles GT debugger refresh)
    // The DOM might have been recreated but JS state persisted with stale references
    this.mapController.disposeMap();

    // If already on map tab, initialize immediately
    if (navigationState.activeTab.get() === "map") {
      setTimeout(() => {
        this.mapController.initializeMap();
        this.setupInputEventBlocker(this.icaoSearchInputRef.getOrDefault());
      }, 100);
    }

    // Auto-initialize map when switching to map tab
    this.stateSubscriptions.push(navigationState.activeTab.sub((tab) => {
      if (tab === "map") {
        if (!this.mapController.isMapInitialized()) {
          // Small delay to ensure DOM is rendered
          setTimeout(() => this.mapController.initializeMap(), 100);
        }
        // Setup keyboard blocking for ICAO search input
        setTimeout(() => {
          this.setupInputEventBlocker(this.icaoSearchInputRef.getOrDefault());
        }, 150);
      }
      // Phase 6b: create-mission dead code removed — refreshMissionOrigin called via missionsSubTab subscription
      // Auto-fetch company data when switching to company/business tab
      if ((tab === "company" || tab === "business") && (isGameReady())) {
        void this.companyController.fetchCompanyData();
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
      // Phase 4: Market auto-fetch merged into business tab — triggered by businessSubTab subscription
      // Phase 3: Auto-refresh missions + contracts when switching to missions tab
      if (tab === "missions" && (isGameReady())) {
        void this.missionController.fetchActiveMission();
        void this.hangarController.autoSyncCurrentAircraft();
        // V5.1: Always refresh airport inventory when switching to missions tab
        const origin = missionState.missionOriginIcao.get();
        if (origin && origin !== "----") {
          void this.missionController.fetchAirportInventoryForCargo(origin);
        }
        // Phase 3: Also fetch contracts (merged from old contrats tab)
        void ContractRouter.refreshContracts();
        const subTab = navigationState.missionsSubTab.get();
        if (subTab === "disponibles") void this.contractController.fetchAvailableContracts();
        else if (subTab === "en-cours") void this.contractController.fetchActiveContracts();
      }
      // V2.2: Auto-fetch hangar aircraft list when switching to hangar tab
      if (tab === "hangar" && (isGameReady())) {
        void this.hangarController.fetchHangarAircraftList();
        void this.hangarController.autoSyncCurrentAircraft();
      }
      // P2P: Settings tab no longer needs credentials setup
    }));

    // Phase 3: Auto-refresh when switching to missions sub-tabs (merged with old contratsSubTab)
    this.stateSubscriptions.push(navigationState.missionsSubTab.sub((subTab) => {
      if (subTab === "disponibles" && (isGameReady())) {
        void this.missionController.refreshMissionOrigin();
        void this.hangarController.autoSyncCurrentAircraft();
        const origin = missionState.missionOriginIcao.get();
        if (origin && origin !== "----") {
          void this.missionController.fetchAirportInventoryForCargo(origin);
        }
        // Setup keyboard capture for destination ICAO input
        setTimeout(() => {
          this.missionController.setupDestinationInput(this.fpDestinationInputRef.getOrDefault());
        }, 150);
        // Phase 3: Also fetch available contracts
        void this.contractController.fetchAvailableContracts();
      }
      // Phase 6b: Reset creation flow toggle when leaving disponibles
      if (subTab !== "disponibles") {
        this.showCreationFlow.set(false);
      }
      if (subTab === "en-cours" && (isGameReady())) {
        void this.missionController.fetchActiveMission();
        // Phase 3: Also fetch active contracts
        void this.contractController.fetchActiveContracts();
      }
      if (subTab === "historique" && (isGameReady())) {
        void this.fetchFlightHistory();
      }
    }));

    // V4.1: Auto-fetch when switching to market sub-tabs
    this.stateSubscriptions.push(navigationState.marketSubTab.sub((subTab) => {
      if (subTab === "inventory" && (isGameReady())) {
        void this.marketController.fetchMarketInventory();
        // Setup filter inputs after DOM renders
        setTimeout(() => {
          const icaoInput = this.marketInvIcaoFilterRef.getOrDefault();
          if (icaoInput) {
            this.setupInputEventBlocker(icaoInput);
            icaoInput.addEventListener("input", () => {
              const value = icaoInput.value.toUpperCase();
              icaoInput.value = value;
              inventoryState.marketInvIcaoFilter.set(value);
              this.marketController.renderMarketInventory();
            });
          }
          const itemInput = this.marketInvItemFilterRef.getOrDefault();
          if (itemInput) {
            this.setupInputEventBlocker(itemInput);
            itemInput.addEventListener("input", () => {
              inventoryState.marketInvItemFilter.set(itemInput.value);
              this.marketController.renderMarketInventory();
            });
          }
        }, 150);
      }
      if (subTab === "mes-ventes" && (isGameReady())) {
        void this.marketController.fetchMySellOrders();
      }
      if (subTab === "avions" && (isGameReady())) {
        void this.marketController.fetchAircraftCatalog();
      }
      if (subTab === "historique" && (isGameReady())) {
        void this.fetchFlightHistory();
      }
    }));

    // Phase 4: Auto-fetch when switching business sub-tabs (marche/usines/finances)
    this.stateSubscriptions.push(navigationState.businessSubTab.sub((subTab) => {
      if (subTab === "marche" && (isGameReady())) {
        void this.marketController.fetchMarketData();
        // Setup market filter inputs after DOM renders
        setTimeout(() => {
          const icaoInput = this.marketIcaoFilterRef.getOrDefault();
          if (icaoInput) {
            this.setupInputEventBlocker(icaoInput);
            icaoInput.addEventListener("input", () => {
              const value = icaoInput.value.toUpperCase();
              icaoInput.value = value;
              marketState.marketIcaoFilter.set(value);
              this.marketController.renderMarketTab();
            });
          }
          const itemInput = this.marketItemFilterRef.getOrDefault();
          if (itemInput) {
            this.setupInputEventBlocker(itemInput);
            itemInput.addEventListener("input", () => {
              marketState.marketItemFilter.set(itemInput.value);
              this.marketController.renderMarketTab();
            });
          }
        }, 150);
      }
      if (subTab === "usines" && (isGameReady())) {
        this.factoryController.refresh();
      }
      if (subTab === "finances" && (isGameReady())) {
        void this.companyController.fetchCompanyHistory();
        void this.companyController.fetchCompanyMessages();
        this.companyController.renderCompanyMembers();
        // Setup inputs after DOM renders
        setTimeout(() => {
          const msgInput = this.companyMessageInputRef.getOrDefault();
          if (msgInput) this.setupInputEventBlocker(msgInput);
          const transferInput = this.transferAmountInputRef.getOrDefault();
          if (transferInput) this.setupInputEventBlocker(transferInput);
        }, 150);
      }
    }));

    // Auto-fetch profile inventory when switching to inventaire sub-tab
    this.stateSubscriptions.push(navigationState.profileSubTab.sub((subTab) => {
      if (subTab === "inventaire" && (isGameReady())) {
        void this.marketController.fetchProfileInventory();
        // Setup filter inputs after DOM renders
        setTimeout(() => {
          const icaoInput = this.profileIcaoFilterRef.getOrDefault();
          if (icaoInput) {
            this.setupInputEventBlocker(icaoInput);
            icaoInput.addEventListener("input", () => {
              const value = icaoInput.value.toUpperCase();
              icaoInput.value = value;
              inventoryState.profileIcaoFilter.set(value);
              this.marketController.renderProfileInventory();
            });
          }
          const itemInput = this.profileItemFilterRef.getOrDefault();
          if (itemInput) {
            this.setupInputEventBlocker(itemInput);
            itemInput.addEventListener("input", () => {
              inventoryState.profileItemFilter.set(itemInput.value);
              this.marketController.renderProfileInventory();
            });
          }
        }, 150);
      }
      // V4.1: Auto-fetch flight history when switching to historique
      if (subTab === "historique" && (isGameReady())) {
        void this.fetchFlightHistory();
      }
      // V6: Auto-fetch social data when switching to social/messagerie
      if (subTab === "social" && (isGameReady())) {
        void this.socialController.fetchFriends();
        setTimeout(() => {
          const searchInput = this.socialSearchInputRef.getOrDefault();
          if (searchInput) this.setupInputEventBlocker(searchInput);
        }, 150);
      }
      if (subTab === "messagerie" && (isGameReady())) {
        void this.socialController.fetchConversations();
        setTimeout(() => {
          const msgInput = this.socialMessageInputRef.getOrDefault();
          if (msgInput) this.setupInputEventBlocker(msgInput);
        }, 150);
      }
    }));

    // Auto-fetch company inventory when switching to inventaire sub-tab in company
    this.stateSubscriptions.push(navigationState.companySubTab.sub((subTab) => {
      if (subTab === "inventaire" && (isGameReady())) {
        void this.companyController.fetchCompanyInventory();
        // Setup filter inputs after DOM renders
        setTimeout(() => {
          const icaoInput = this.companyIcaoFilterRef.getOrDefault();
          if (icaoInput) {
            this.setupInputEventBlocker(icaoInput);
            icaoInput.addEventListener("input", () => {
              const value = icaoInput.value.toUpperCase();
              icaoInput.value = value;
              inventoryState.companyIcaoFilter.set(value);
              this.companyController.renderCompanyInventory();
            });
          }
          const itemInput = this.companyItemFilterRef.getOrDefault();
          if (itemInput) {
            this.setupInputEventBlocker(itemInput);
            itemInput.addEventListener("input", () => {
              inventoryState.companyItemFilter.set(itemInput.value);
              this.companyController.renderCompanyInventory();
            });
          }
        }, 150);
      }
      if (subTab === "membres" && (isGameReady())) {
        this.companyController.renderCompanyMembers();
      }
      if (subTab === "historique" && (isGameReady())) {
        void this.companyController.fetchCompanyHistory();
      }
      if (subTab === "messagerie" && (isGameReady())) {
        void this.companyController.fetchCompanyMessages();
        setTimeout(() => {
          const msgInput = this.companyMessageInputRef.getOrDefault();
          if (msgInput) {
            this.setupInputEventBlocker(msgInput);
          }
          const transferInput = this.transferAmountInputRef.getOrDefault();
          if (transferInput) {
            this.setupInputEventBlocker(transferInput);
          }
        }, 150);
      }
      if (subTab === "usines" && (isGameReady())) {
        this.factoryController.refresh();
      }
    }));

    // Auto-update fpCanValidate when fpHasActivePlan or fpDestinationInput changes
    this.stateSubscriptions.push(missionCreationState.fpHasActivePlan.sub(() => this.missionController.updateFpCanValidate()));
    this.stateSubscriptions.push(missionCreationState.fpDestinationInput.sub(() => this.missionController.updateFpCanValidate()));

    // V1.2: Update creation steps when current aircraft changes
    this.stateSubscriptions.push(missionState.missionCurrentAircraft.sub(() => this.missionController.updateCreationSteps()));

    // V1.2: Re-render aircraft lists when current simulator aircraft changes
    this.stateSubscriptions.push(simVarState.currentSimAircraftReg.sub(() => {
      // Re-render hangar list if it exists
      if (this.hangarListRef.getOrDefault()) {
        this.hangarController.renderHangarList();
      }
      // V1.2: Reload current aircraft for mission when registration changes
      if (this.missionAircraftInfoRef.getOrDefault()) {
        void this.missionController.loadCurrentAircraftForMission();
      }
    }));

  }

  /**
   * P2P: Initialize local database for offline-first experience
   * Sets up IndexedDB, loads seed data on first launch, syncs states
   */
  private initializeLocalDatabase(): void {
    console.log("[ACO] Initializing SEED connection (Monde Unique)...");

    // Set initial connection status
    authState.seedConnectionStatus.set("connecting");
    authState.seedInitStep.set("Connexion au monde...");
    authState.seedInitProgress.set(0);

    // Initialize database and seed data with SEED connection
    InitService.initialize({
      onProgress: (step, progress) => {
        authState.seedInitStep.set(step);
        authState.seedInitProgress.set(progress);
      },
      onFirstLaunch: () => {
        // First launch detected - show welcome popup for user to enter their info
        console.log("[ACO] First launch detected - showing welcome popup");
        authState.seedConnectionStatus.set("connected");
        authState.showFirstLaunchPopup.set(true);

        // Add input listener for ICAO validation after popup renders
        // Use setTimeout with longer delay to ensure DOM is fully rendered in Coherent GT
        setTimeout(() => {
          const airportInput = this.welcomeAirportRef.instance;
          const pilotNameInput = this.welcomePilotNameRef.instance;

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
              authState.firstLaunchAirportValid.set(isValid);
              // V4.1 FIX: Sync Subject with input value (for fallback in completeFirstLaunchSetup)
              authState.firstLaunchAirport.set(value);
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
        console.log("[ACO] Mode selection required - showing selector");
        authState.seedConnectionStatus.set("connected"); // Hide connection screen
        gameModeState.showModeSelector.set(true);
      },
      onComplete: () => {
        console.log("[ACO] SEED connection and initialization complete");
        authState.seedConnectionStatus.set("connected");
        // Load position AFTER DatabaseManager is initialized + data restored
        void PositionService.loadFromDb();
        this.initializePersistenceAndEconomy();
        // FIX: Load player data (money, XP, career stats) into state
        void this.loadPlayerDataIntoState();
        // Airports are now loaded — trigger map reload + centering
        if (this.mapController.isMapInitialized()) {
          this.mapController.refreshMapSize();
          void this.mapController.centerMapOnPlayerAirport();
        }
      },
      onError: (error) => {
        console.error("[ACO] Initialization failed:", error);
        authState.seedConnectionStatus.set("failed");
        authState.seedConnectionError.set(error.message || "Connection failed");
      },
    });
  }

  /**
   * Retry SEED connection after failure
   */
  private handleRetryConnection = (): void => {
    console.log("[ACO] Retrying SEED connection...");
    authState.seedConnectionError.set(null);
    this.initializeLocalDatabase();
  };

  /**
   * Switch to Solo mode when SEED connection fails
   */
  private handleSwitchToSolo = (): void => {
    console.log("[ACO] Switching to Solo mode (SEED unavailable)...");
    resetModeSelection();
    setGameMode("solo");
    authState.seedConnectionStatus.set("connected");
    authState.seedConnectionError.set(null);

    InitService.continueWithMode("solo")
      .then(() => {
        gameModeState.modeSwitchLoading.set(false);
        void PositionService.loadFromDb();
        this.initializePersistenceAndEconomy();
        // FIX: Load player data into state
        void this.loadPlayerDataIntoState();
        if (this.mapController.isMapInitialized()) {
          this.mapController.refreshMapSize();
          void this.mapController.centerMapOnPlayerAirport();
        }
      })
      .catch((e) => {
        console.error("[ACO] Solo fallback initialization error:", e);
        gameModeState.modeSwitchError.set(e instanceof Error ? e.message : "Unknown error");
        gameModeState.modeSwitchLoading.set(false);
      });
  };

  /**
   * V3.0: Handle game mode selection (Solo or Online)
   */
  private handleSelectGameMode = (mode: "solo" | "online"): void => {
    console.log(`[ACO] Game mode selected: ${mode}`);
    gameModeState.modeSwitchLoading.set(true);
    gameModeState.modeSwitchError.set(null);

    // Set game mode state
    gameModeState.currentMode.set(mode);
    gameModeState.modeSelected.set(true);
    gameModeState.showModeSelector.set(false);

    // V6 FIX: Sync isP2PMode with game mode selection
    authState.isP2PMode.set(mode === "solo");

    // V3.0: Set network state immediately based on mode
    if (mode === "solo") {
      // Solo mode = offline (no SEED connection)
      // IMPORTANT: Stop all SEED services FIRST to prevent them from setting status back to "online"
      SyncManager.stopConnectionCheck();
      SyncService.stopPolling();
      SyncService.disconnect();
      NetworkState.setOffline();
    } else {
      // Online mode = will connect to SEED
      NetworkState.setConnecting();
    }

    // Persist mode choice
    if (typeof SetStoredData === "function") {
      SetStoredData("ACO_GameMode", mode);
    }

    // Continue initialization with selected mode
    InitService.continueWithMode(mode)
      .then(() => {
        gameModeState.modeSwitchLoading.set(false);
        void PositionService.loadFromDb();
        this.initializePersistenceAndEconomy();
        // FIX: Load player data into state
        void this.loadPlayerDataIntoState();
        // Airports are now loaded — trigger map reload + centering
        if (this.mapController.isMapInitialized()) {
          this.mapController.refreshMapSize();
          void this.mapController.centerMapOnPlayerAirport();
        }
      })
      .catch((e) => {
        console.error("[ACO] Mode initialization error:", e);
        gameModeState.modeSwitchError.set(e instanceof Error ? e.message : "Unknown error");
        gameModeState.modeSwitchLoading.set(false);
      });
  };

  /**
   * Load player data from database into reactive state.
   * Called on every initialization path (reload, mode selection, solo fallback).
   * Must be called AFTER DatabaseManager is initialized and data is restored.
   */
  private async loadPlayerDataIntoState(): Promise<void> {
    try {
      const player = await InitService.getPlayerInfo();
      if (!player) return;

      marketState.walletPersonal.set(player.money);

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
        last_latitude: player.last_latitude,
        last_longitude: player.last_longitude,
        career_stats: {
          total_missions: careerStats.total_missions,
          total_flight_time_minutes: careerStats.total_flight_time_minutes,
          total_distance_nm: careerStats.total_distance_nm,
          average_grade: careerStats.average_grade,
        },
      });
      authState.isLoggedIn.set(true);
      this.socialController.setPlayerId(player.id);

      // Also load company balance if player has a company
      const companyData = companyState.companyData.get();
      if (companyData) {
        companyState.companyBalance.set(companyData.balance ?? 0);
      }
    } catch (e) {
      console.error("[ACO] Failed to load player data:", e);
    }
  }

  /**
   * P2P: Initialize persistence manager and AI economy
   * Called after database is ready (either on first launch completion or on existing data)
   * @param skipLoadStates - If true, skip loading states (used after fresh first launch to avoid overwriting fresh data)
   */
  private initializePersistenceAndEconomy(skipLoadStates: boolean = false): void {
    // Initialize persistence manager
    PersistenceManager.initialize({
      onLoaded: () => {},
      onError: (error) => {
        console.error("[ACO] Persistence error:", error);
      },
      onSaved: () => {},
    });

    // V4.1 FIX: Skip loading states if this is a fresh first launch
    // Fresh first launch data is already in DatabaseManager, no need to re-load
    // Re-loading could potentially restore stale cached data
    if (skipLoadStates) {
      // Just enable auto-save and start AI economy
      PersistenceManager.enableAutoSave();
      AIEconomyService.initialize({
        onPricesUpdated: () => {},
        onOrdersGenerated: () => {},
      });
      AIEconomyService.start();
      AIEconomyService.forceUpdate();
      return;
    }

    // Load states from database
    PersistenceManager.loadAllStates()
      .then(async () => {
        // Enable auto-save after loading
        PersistenceManager.enableAutoSave();

        // Start AI economy for solo mode (price fluctuation, AI orders)
        AIEconomyService.initialize({
          onPricesUpdated: () => {},
          onOrdersGenerated: () => {},
        });
        AIEconomyService.start();

        // Generate initial AI orders if market is empty
        AIEconomyService.forceUpdate();
      })
      .catch((error) => {
        console.error("[ACO] Failed to load states:", error);
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
    // V4.1 FIX: Read airport from input, fallback to Subject, then to default
    const inputAirport = (airportInput?.value?.trim() || "").toUpperCase();
    const subjectAirport = authState.firstLaunchAirport.get().toUpperCase();
    const startingAirport = inputAirport.length === 4 ? inputAirport : (subjectAirport.length === 4 ? subjectAirport : "LFPG");

    // Validation is done in WelcomePopup - button is disabled if invalid
    console.log(`[ACO] Completing first launch: ${pilotName} (${nationality}) at ${startingAirport} (input: "${inputAirport}", subject: "${subjectAirport}")`);

    // Hide welcome popup
    authState.showFirstLaunchPopup.set(false);

    // Complete the setup with user data
    InitService.completeFirstLaunch(pilotName, nationality, startingAirport)
      .then(async () => {
        // V4.1 FIX: Initialize persistence but SKIP loadAllStates to prevent overwriting fresh data
        // The player data is already fresh in DatabaseManager from completeFirstLaunch()
        this.initializePersistenceAndEconomy(true); // skipLoadStates = true

        // Load player data into state (shared method for all init paths)
        await this.loadPlayerDataIntoState();

        // Initialize position state from fresh player data
        void PositionService.loadFromDb();

        // Center map on chosen airport
        const user = authState.currentUser.get();
        if (user) {
          const chosenIcao = user.current_airport || user.preferred_airport;
          if (chosenIcao) {
            void this.mapController.centerMapOnPlayerAirport();
            const airports = DatabaseManager.getAirportsCache();
            const airport = airports.find(a => a.ident === chosenIcao);
            if (airport) {
              this.mapController.forcePosition(airport.latitude, airport.longitude, 12);
            }
          }
        }

        // Refresh hangar list with the new aircraft
        void this.hangarController.fetchHangarAircraftList();
      })
      .catch((error) => {
        console.error("[ACO] Failed to complete first launch:", error);
      });
  }

  /**
   * V2.0: Initialize tracking manager with callbacks
   */
  private initializeTrackingManager(): void {
    trackingManager.initialize({
      getActiveMission: () => missionState.activeMission.get(),
      getMissionCheckpoints: () => missionState.missionCheckpoints.get(),
      getMissionAircraft: () => missionState.missionCurrentAircraft.get(),
      getAircraftCargoWeight: () => cargoState.aircraftCargoWeight.get(),
      getWaypointsTotal: () => missionState.waypointsTotal.get(),
      getMissionDistanceNm: () => missionState.missionDistanceNm.get(),
      // V2.0: Additional getters
      getWaypointsPassed: () => missionState.waypointsPassed.get(),
      getClosestAirport: () => positionState.simVarAirport.get(),
      getTotalPayload: () => this.missionController.getTotalPayload(),
      getAircraftCargoCapacity: () => cargoState.aircraftCargoCapacity.get(),
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
        // V2: Grade estimation + ATC suivi
        if (state.gradeEstimated !== undefined) trackingState.trackingGradeEstimated.set(state.gradeEstimated);
        if (state.scoreEstimated !== undefined) trackingState.trackingScoreEstimated.set(state.scoreEstimated);
        if (state.scoreGforce !== undefined) trackingState.trackingScoreGforce.set(state.scoreGforce);
        if (state.gforceAlert !== undefined) trackingState.trackingGforceAlert.set(state.gforceAlert);
        if (state.cargoFillPercent !== undefined) trackingState.trackingCargoFillPercent.set(state.cargoFillPercent);
        if (state.atcAssignedAlt !== undefined) trackingState.trackingAtcAssignedAlt.set(state.atcAssignedAlt);
        if (state.atcAltDeviation !== undefined) trackingState.trackingAtcAltDeviation.set(state.atcAltDeviation);
        if (state.atcCruiseSpd !== undefined) trackingState.trackingAtcCruiseSpd.set(state.atcCruiseSpd);
        if (state.atcSpdDeviation !== undefined) trackingState.trackingAtcSpdDeviation.set(state.atcSpdDeviation);
        // V3: Lights
        if (state.lightNav !== undefined) trackingState.trackingLightNav.set(state.lightNav);
        if (state.lightStrobe !== undefined) trackingState.trackingLightStrobe.set(state.lightStrobe);
        if (state.lightBeacon !== undefined) trackingState.trackingLightBeacon.set(state.lightBeacon);
        if (state.lightLanding !== undefined) trackingState.trackingLightLanding.set(state.lightLanding);
        if (state.lightTaxi !== undefined) trackingState.trackingLightTaxi.set(state.lightTaxi);
        if (state.lightsMissing !== undefined) trackingState.trackingLightsMissing.set(state.lightsMissing);
        if (state.lightsUnnecessary !== undefined) trackingState.trackingLightsUnnecessary.set(state.lightsUnnecessary);
        if (state.lightsStatusColor !== undefined) trackingState.trackingLightsStatusColor.set(state.lightsStatusColor);
        if (state.lightsAlert !== undefined) trackingState.trackingLightsAlert.set(state.lightsAlert);
        // V5: Suivi vol
        if (state.suiviAtcMode !== undefined) trackingState.trackingSuiviAtcMode.set(state.suiviAtcMode);
        if (state.suiviCrossTrackNm !== undefined) trackingState.trackingSuiviCrossTrackNm.set(state.suiviCrossTrackNm);
        if (state.suiviRouteStatus !== undefined) trackingState.trackingSuiviRouteStatus.set(state.suiviRouteStatus);
        if (state.suiviInCruise !== undefined) trackingState.trackingSuiviInCruise.set(state.suiviInCruise);
        if (state.suiviAlert !== undefined) trackingState.trackingSuiviAlert.set(state.suiviAlert);
        // V6: Weather
        if (state.weatherScore !== undefined) trackingState.trackingWeatherScore.set(state.weatherScore);
        // Update max G-force
        const maxG = trackingManager.getMaxGForce();
        simVarState.gForce.set(maxG);
        // Also update MissionController.maxGForce for mission completion scoring
        this.missionController.maxGForce = maxG;
      },
      onCheckpointValidated: (seq) => {
        missionState.checkpointsValidated.set(missionState.checkpointsValidated.get() + 1);
        missionState.nextCheckpoint.set(seq + 1);
      },
      onFlightPhaseChange: (id, text, color) => {
        checkpointState.flightPhaseId.set(id as FlightPhaseId);
        checkpointState.flightPhaseText.set(text);
        checkpointState.flightPhaseColor.set(color);
        // Update icon based on phase (text labels for Coherent GT compatibility)
        const iconMap: Record<string, string> = {
          "taxi_out": "[DEP]", "climb": "[DEP]", "cruise": "[CRS]", "descent": "[ARR]", "taxi_in": "[ARR]"
        };
        checkpointState.flightPhaseIcon.set(iconMap[id] || "[CRS]");
      },
      onWaypointPassed: (count) => missionState.waypointsPassed.set(count),
      onCheckpointsUpdate: (cps) => missionState.missionCheckpoints.set(cps),
      // V2.0: Mission completion trigger
      onMissionCompleteTrigger: () => {
        void this.missionController.completeMissionV1();
      },
      onTouchdown: (fpm) => {
        this.missionController.landingFpm = fpm;
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

        // VFR detection: no GPS flight plan → VFR mode
        if (data.wpCount === 0 && !data.hasActivePlan) {
          missionCreationState.fpFlightMode.set('VFR');
          missionCreationState.fpSource.set('vfr');
        } else {
          missionCreationState.fpFlightMode.set('IFR');
          missionCreationState.fpSource.set('gps');
        }

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
        console.error("[ACO] Mission creation error:", error);
      },
      onPayloadWritten: (state: PayloadState) => {
        this.missionController.payloadStartLbs = state.payloadStartLbs;
        this.missionController.fuelStartPercent = state.fuelStartPercent;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      t: (section: any, key: any) => this.t(section, key),
    });
  }

  /**
   * V7.1: Setup transfer ICAO input when popup opens
   */
  private initializeTransferPopup(): void {
    this.stateSubscriptions.push(transferState.showAircraftTransferPopup.sub((show) => {
      if (show) {
        setTimeout(() => {
          const icaoInput = this.transferIcaoInputRef.getOrDefault();
          if (icaoInput) {
            this.setupInputEventBlocker(icaoInput);
            icaoInput.value = "";
            icaoInput.addEventListener("input", () => {
              const val = icaoInput.value.toUpperCase();
              icaoInput.value = val;
              void this.hangarController.updateTransferEstimate(val);
            });
            icaoInput.focus();
          }
        }, 100);
      }
    }));
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
      refreshHangarList: () => this.hangarController.renderHangarList(),
      refreshMissionAircraftInfo: () => this.missionController.renderMissionAircraftInfo(),
      refreshAircraftSystems: async (id) => this.hangarController.fetchAircraftSystems(id),
      refreshAircraftDetails: async (id) => this.hangarController.fetchAircraftDetails(id),
      refreshCompanyData: async () => this.companyController.fetchCompanyData(),
      refreshMarketListings: () => void this.marketController.fetchMarketData(),
      refreshCargoLists: () => this.missionController.renderCargoUI(),
      refreshInventory: () => {
        // Refresh both player and company inventory after market purchase
        void this.marketController.fetchProfileInventory();
        void this.companyController.fetchCompanyInventory();
      },
      transferCargo: (direction, locationId, itemId, qty) => {
        if (direction === "load") {
          void this.missionController.loadCargoItem(locationId, itemId, qty);
        } else {
          void this.missionController.unloadCargoItem(locationId, itemId, qty);
        }
      },
      setupInputCapture: (el) => this.setupInputEventBlocker(el),
    });
  }

  private loadAuthFromStorage(): void {
    try {
      // P2P: Load user preferences only (auth handled by InitService)
      this.loadUnitPreferences();
      this.loadLanguage();

      // P2P: Auto-sync current aircraft fuel after a short delay
      setTimeout(() => {
        void this.hangarController.autoSyncCurrentAircraft();
      }, 1000);
    } catch (error) {
      console.error("[ACO] Failed to load preferences:", error);
    }
  }

  // V1.5: Load unit preferences from NativePersistence
  private loadUnitPreferences(): void {
    try {
      const savedUnits = NativePersistence.get("aco_units");
      if (savedUnits) {
        const units = JSON.parse(savedUnits);
        if (units.distance) settingsState.unitDistance.set(units.distance);
        if (units.weight) settingsState.unitWeight.set(units.weight);
        if (units.altitude) settingsState.unitAltitude.set(units.altitude);
        if (units.fuel) settingsState.unitFuel.set(units.fuel);
        if (units.speed) settingsState.unitSpeed.set(units.speed);
        if (units.temperature) settingsState.unitTemperature.set(units.temperature);
      }
    } catch (error) {
      console.error("[ACO] Failed to load unit preferences:", error);
    }
  }

  // V1.5: Get translation for current language
  private t(category: keyof TranslationKeys, key: string): string {
    const lang = settingsState.currentLanguage.get();
    const categoryObj = translations[lang][category] as Record<string, string>;
    return categoryObj[key] || key;
  }

  // V1.5: Set language and save to NativePersistence
  private setLanguage(lang: Language): void {
    settingsState.currentLanguage.set(lang);
    NativePersistence.set("aco_language", lang);
  }

  // V1.5: Load language from NativePersistence
  private loadLanguage(): void {
    const savedLang = NativePersistence.get("aco_language") as Language | null;
    const validLanguages: Language[] = ["en", "fr", "de", "es"];
    if (savedLang && validLanguages.includes(savedLang)) {
      settingsState.currentLanguage.set(savedLang);
    }
  }

  public onClose(): void {
    // Force save all data to DataStore before closing (prevents data loss between sessions)
    DatabaseManager.forceSaveSync();

    this.stopSimVarUpdates();
    // Don't dispose map on close - it might just be minimized
    // Only dispose on open to handle GT refresh case

    // PASSE 3: Cleanup state subscriptions to prevent memory leaks
    this.stateSubscriptions.forEach((sub) => {
      try {
        sub.destroy();
      } catch (e) {
        console.error("[ACO] Error destroying subscription:", e);
      }
    });
    this.stateSubscriptions = [];
  }

  public onResume(): void {
    this.startSimVarUpdates();

    // Subscribe to FlightPlanner events (EFB flight plan detection)
    this.missionController.subscribeToFlightPlannerEvents(this.props.bus);

    // V3.0: Reload position from DB (PositionService is single source of truth)
    void PositionService.loadFromDb();

    // V1.4: Auto-sync aircraft fuel when app resumes (anti-cheat)
    // This ensures fuel is enforced when returning from main menu
    if (isGameReady()) {
      void this.hangarController.autoSyncCurrentAircraft();
    }

    // Refresh map if it exists and we're on map tab (handles resume from pause)
    if (navigationState.activeTab.get() === "map") {
      setTimeout(() => {
        this.mapController.refreshMapSize();
        void this.mapController.centerMapOnPlayerAirport();
      }, 100);
    }
  }

  public onPause(): void {
    this.stopSimVarUpdates();
    this.missionController.unsubscribeFromFlightPlannerEvents();

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
        // Centralized SimVar read (CriticalSnapshot)
        const snap = readCriticalSimVars();

        // Map to SimVarState Subjects
        simVarState.latitude.set(snap.lat);
        simVarState.longitude.set(snap.lon);
        simVarState.altitude.set(snap.altitude);
        simVarState.heading.set(snap.heading);
        simVarState.groundSpeed.set(snap.groundSpeed);
        simVarState.airspeed.set(snap.airspeed);
        simVarState.verticalSpeed.set(snap.verticalSpeed);
        simVarState.gForce.set(snap.gForce);
        simVarState.fuelQuantity.set(snap.fuelQuantity);
        simVarState.touchdownVelocity.set(snap.touchdownVelocity);
        simVarState.currentSimAircraftReg.set(snap.atcId);
        simVarState.closestAirport.set(snap.closestAirport);
        simVarState.onGround.set(snap.onGround);

        // Position tracking (strict BDD-based)
        PositionService.updateSimPosition(snap.lat, snap.lon);
        PositionService.updateSimVar(snap.closestAirport);

        // Landing detection (delegated to TrackingManager for UI feedback)
        trackingManager.processUILandingDetection(snap.verticalSpeed, snap.onGround);

        // FlightTracker tick (delegated to FreeFlightController)
        this.freeFlightController.tick(snap);

        // Update map position if map is initialized
        if (this.mapController.isMapInitialized()) {
          this.mapController.updateMapPosition();
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
    const uuid = `woa-input-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

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

  /**
   * Reset all local data - for testing and troubleshooting
   * Clears DatabaseManager, localStorage, and native persistence
   * V4.1 FIX: Made async to properly await the reset before showing welcome screen
   */
  private async resetAllData(): Promise<void> {
    const confirmReset = confirm("Are you sure you want to reset ALL data? This cannot be undone!");
    if (!confirmReset) return;

    console.log("[ACO] Resetting all local data...");

    try {
      // V4.1 FIX: AWAIT the database reset - MUST complete before anything else
      // This clears DatabaseManager (player, aircraft, inventory, etc.) + NativePersistence + localStorage
      await InitService.resetDatabase();
      console.log("[ACO] DatabaseManager + NativePersistence + localStorage cleared via InitService");

      // Clear user preferences stored via generic NativePersistence.set()
      NativePersistence.set("aco_language", "");
      NativePersistence.set("aco_units", "");
      console.log("[ACO] User preferences cleared");

      // Clear pending actions queue (Online mode)
      NetworkState.clearPendingActions();
      console.log("[ACO] Pending actions cleared");

      // Reset auth state
      authState.authToken.set(null);
      authState.currentUser.set(null);
      authState.isLoggedIn.set(false);
      authState.isP2PMode.set(true);

      // V4.1 FIX: Reset market state (wallet, etc.)
      marketState.walletPersonal.set(0);
      companyState.companyData.set(null);

      // V4.1 FIX: Set mode to "solo" before showing welcome popup
      // This ensures completeFirstLaunch() knows which mode to use
      gameModeState.currentMode.set("solo");
      gameModeState.modeSelected.set(true);
      gameModeState.showModeSelector.set(false);
      // Persist mode choice for next session
      if (typeof SetStoredData === "function") {
        SetStoredData("ACO_GameMode", "solo");
      }

      // Show first launch popup for fresh start
      authState.showFirstLaunchPopup.set(true);

      alert("Data reset complete! The welcome screen will appear.");

    } catch (error) {
      console.error("[ACO] Reset failed:", error);
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
        w.SetStoredData("aco_test", "ok");
        persistenceWorks = w.GetStoredData("aco_test") === "ok";
      } catch { /* ignore */ }
    }

    const summary = Object.entries(apis).map(([k, v]) => `${v ? "✅" : "❌"} ${k}`).join("\n");
    console.log(`[ACO] API Test:\n${summary}\n${persistenceWorks ? "✅" : "❌"} Persistence roundtrip`);
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
      console.log("[ACO] Stopping offline simulation, attempting reconnect...");
      settingsState.isOfflineSimulated.set(false);

      // Try to reconnect to SEED
      const connected = await SyncService.connect();
      if (connected) {
        NetworkState.setOnline();
        SyncService.startPolling(30000);
        SyncManager.startConnectionCheck();
        console.log("[ACO] Reconnected to SEED");
        alert("Reconnecté au SEED ! Mode ONLINE actif.");
      } else {
        NetworkState.setOffline();
        console.log("[ACO] Could not reconnect to SEED, staying offline");
        alert("Impossible de se reconnecter au SEED. Mode OFFLINE maintenu.");
      }
    } else {
      // Simulate offline: disconnect from SEED
      console.log("[ACO] Simulating offline mode...");
      settingsState.isOfflineSimulated.set(true);

      // Stop all SEED communication
      SyncService.stopPolling();
      SyncManager.stopConnectionCheck();
      NetworkState.setOffline();

      console.log("[ACO] Offline mode simulated - SEED polling stopped");
      alert("Mode OFFLINE simulé !\n\nLes missions seront créées/complétées localement.\nLe ravitaillement est désactivé.\nCliquez à nouveau pour reconnecter au SEED.");
    }
  }

  private openCreateFactory(_airport: { icao: string; name: string }): void {
    mapState.selectedAirport.set(null);
    navigationState.activeTab.set("business");
    navigationState.businessSubTab.set("usines");
  }

  private openManageFactory(factory: { id: string; name: string }): void {
    mapState.selectedAirport.set(null);
    if (factory.id) {
      factoryState.selectedFactoryId.set(factory.id);
    }
    navigationState.activeTab.set("business");
    navigationState.businessSubTab.set("usines");
  }

  private setDestinationAirport(airport: { icao: string; name: string }): void {
    mapState.destinationAirport.set(airport);
    mapState.selectedAirport.set(null);
    // Also set the flight plan destination input
    missionCreationState.fpDestinationInput.set(airport.icao);
    // Update the HTML input element as well
    const inputEl = this.fpDestinationInputRef.getOrDefault();
    if (inputEl) inputEl.value = airport.icao;
    // Switch to missions tab > creation sub-tab when destination is set
    navigationState.activeTab.set("missions");
    navigationState.missionsSubTab.set("disponibles");
  }


  // ═══════════════════════════════════════════════════════════
  // V2.4: FLIGHT HISTORY
  // ═══════════════════════════════════════════════════════════

  /**
   * V4.1: Fetch unified history (flights + transactions) from local database
   */
  private async fetchFlightHistory(): Promise<void> {
    this.flightHistoryLoading.set(true);

    try {
      // Fetch both flights and transactions in parallel
      const [flights, transactions] = await Promise.all([
        DatabaseManager.getFlightHistory(50),
        DatabaseManager.getTransactionLog(50),
      ]);

      this.flightHistoryEntries = flights;
      this.transactionLogEntries = transactions;

      this.renderMarketTransactionHistory();
      this.renderMissionHistory();
      this.renderFreeFlightHistory();
    } catch (error) {
      console.error("[ACO] Error fetching unified history:", error);
    } finally {
      this.flightHistoryLoading.set(false);
    }
  }

  /**
   * V4.1: Render transactions-only history for Market > Historique
   */
  private renderMarketTransactionHistory(): void {
    const el = this.flightHistoryRef.getOrDefault();
    if (!el) return;

    const lang = settingsState.currentLanguage.get();
    const tr = translations[lang];

    // Build transactions timeline only
    const timeline: UnifiedTimelineEntry[] = [];
    for (const tx of this.transactionLogEntries) {
      timeline.push({
        id: tx.id,
        date: tx.timestamp,
        type: "transaction",
        transactionType: tx.type,
        amount: tx.amount,
        description: tx.description,
        airport_icao: tx.airport_icao,
      });
    }
    timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const historyTr: UnifiedHistoryTranslations = {
      filterAll: "", filterFlights: "", filterTransactions: "", filterContracts: "",
      mission: tr.history.mission,
      freeflight: tr.history.freeflight,
      marketBuy: (tr.history as any).marketBuy || "Purchase",
      marketSell: (tr.history as any).marketSell || "Sale",
      marketList: (tr.history as any).marketList || "Listed for sale",
      aircraftBuy: (tr.history as any).aircraftBuy || "Aircraft purchase",
      aircraftSell: (tr.history as any).aircraftSell || "Aircraft sale",
      refuel: (tr.history as any).refuel || "Refuel",
      repair: (tr.history as any).repair || "Repair",
      companyCreate: (tr.history as any).companyCreate || "Company created",
      missionReward: (tr.history as any).missionReward || "Mission reward",
      contractReward: (tr.history as any).contractReward || "Contract reward",
      loadMore: tr.history.loadMore,
      noHistory: (tr.history as any).noHistory || tr.history.noFlights,
    };

    el.innerHTML = renderTransactionsHistoryHtml(timeline, historyTr);
  }

  /**
   * V4.1: Render mission-only history for Missions > Historique
   */
  private renderMissionHistory(): void {
    const el = this.missionHistoryRef.getOrDefault();
    if (!el) return;

    const lang = settingsState.currentLanguage.get();
    const tr = translations[lang];

    // Build all flights timeline (missions + free flights)
    const timeline: UnifiedTimelineEntry[] = [];
    for (const flight of this.flightHistoryEntries) {
      timeline.push({
        id: flight.id,
        date: typeof flight.date === "number" ? new Date(flight.date).toISOString() : flight.date,
        type: "flight",
        flightType: flight.type,
        departure_icao: flight.departure_icao,
        arrival_icao: flight.arrival_icao,
        grade: flight.grade,
        xp_earned: flight.xp_earned,
        money_earned: flight.money_earned,
        flight_time_minutes: flight.flight_time_minutes,
      });
    }
    timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const historyTr: UnifiedHistoryTranslations = {
      filterAll: "", filterFlights: "", filterTransactions: "", filterContracts: "",
      mission: tr.history.mission,
      freeflight: tr.history.freeflight,
      marketBuy: "", marketSell: "", marketList: "", aircraftBuy: "", aircraftSell: "",
      refuel: "", repair: "", companyCreate: "", missionReward: "",
      loadMore: tr.history.loadMore,
      noHistory: (tr.history as any).noHistory || tr.history.noFlights,
    };

    el.innerHTML = renderFlightsHistoryHtml(timeline, historyTr);

    // Bind click on each flight row → show recap popup
    el.querySelectorAll(".history-flight-row").forEach((row) => {
      row.addEventListener("click", () => {
        const flightId = row.getAttribute("data-flight-id");
        if (flightId) this.showFlightRecap(flightId);
      });
    });
  }

  /**
   * Show recap popup for a flight history entry (mission or freeflight)
   */
  private showFlightRecap(flightId: string): void {
    const flight = this.flightHistoryEntries.find((f: any) => f.id === flightId);
    if (!flight) return;

    // Derive landing quality from FPM
    const fpm = flight.landing_fpm || 0;
    let landingQuality = "normal";
    if (fpm <= 60) landingQuality = "butter";
    else if (fpm <= 120) landingQuality = "smooth";
    else if (fpm <= 240) landingQuality = "normal";
    else if (fpm <= 600) landingQuality = "hard";
    else landingQuality = "crash";

    // Convert boolean bonuses to FreeFlightBonus objects
    const bonusMultipliers: Record<string, number> = {
      real_time: 1.20, night: 1.15, atc: 1.15,
      fuel_eco: 1.10, no_autopilot: 1.10, bad_weather: 1.15,
    };
    const bonuses: any = {};
    let totalMultiplier = 1.0;
    for (const key of Object.keys(bonusMultipliers)) {
      const active = flight.bonuses?.[key] || false;
      bonuses[key] = { active, multiplier: active ? bonusMultipliers[key] : 1.0 };
      if (active) totalMultiplier *= bonusMultipliers[key];
    }

    const recapData: FreeFlightRecapData = {
      departure_icao: flight.departure_icao,
      arrival_icao: flight.arrival_icao,
      distance_nm: flight.distance_nm || 0,
      flight_time_minutes: flight.flight_time_minutes || 0,
      score_landing: 0,
      score_gforce: 0,
      score_total: flight.score_total || 0,
      grade: flight.grade || "C",
      landing_fpm: fpm,
      landing_quality: landingQuality,
      max_gforce: flight.max_gforce || 1.0,
      bonuses,
      bonus_multiplier_total: totalMultiplier,
      xp_earned: flight.xp_earned || 0,
      money_earned: flight.money_earned || 0,
      weather_visibility_nm: flight.weather_visibility_nm || 0,
      weather_wind_kts: flight.weather_wind_kts || 0,
      weather_precipitation: false,
      fuel_remaining_percent: 0,
      atc_compliance: flight.atc_compliance || 0,
      atc_violations: flight.atc_violations || 0,
    };

    freeFlightState.ffRecapData.set(recapData);
    freeFlightState.ffShowRecap.set(true);
  }

  /**
   * V4.1: Render free-flight-only history for Profile > Historique des vols
   */
  private renderFreeFlightHistory(): void {
    const el = this.profileFlightHistoryRef.getOrDefault();
    if (!el) return;

    const lang = settingsState.currentLanguage.get();
    const tr = translations[lang];

    // Build free flight timeline only
    const timeline: UnifiedTimelineEntry[] = [];
    for (const flight of this.flightHistoryEntries) {
      if (flight.type !== "freeflight") continue;
      timeline.push({
        id: flight.id,
        date: typeof flight.date === "number" ? new Date(flight.date).toISOString() : flight.date,
        type: "flight",
        flightType: flight.type,
        departure_icao: flight.departure_icao,
        arrival_icao: flight.arrival_icao,
        grade: flight.grade,
        xp_earned: flight.xp_earned,
        money_earned: flight.money_earned,
        flight_time_minutes: flight.flight_time_minutes,
      });
    }
    timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const historyTr: UnifiedHistoryTranslations = {
      filterAll: "", filterFlights: "", filterTransactions: "", filterContracts: "",
      mission: tr.history.mission,
      freeflight: tr.history.freeflight,
      marketBuy: "", marketSell: "", marketList: "", aircraftBuy: "", aircraftSell: "",
      refuel: "", repair: "", companyCreate: "", missionReward: "",
      loadMore: tr.history.loadMore,
      noHistory: (tr.history as any).noHistory || tr.history.noFlights,
    };

    el.innerHTML = renderFlightsHistoryHtml(timeline, historyTr);
  }

  // ═══════════════════════════════════════════════════════════
  // COMPANY INVENTORY
  // ═══════════════════════════════════════════════════════════

  public render(): VNode {
    return (
      <div style="display: flex; width: 100%; height: 100%; background: #1a1a24; color: white; font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;">
        {/* Left Sidebar - Specs v0.9 Order */}
        <div style="width: 40px; background: #252532; display: flex; flex-direction: column; justify-content: space-between; border-right: 1px solid #374151; flex-shrink: 0;">
          {/* Phase 2: 5+1 Sidebar — Map, Missions, Business, Hangar, Pilote + Settings */}
          <div style="display: flex; flex-direction: column; padding-top: 44px;">
            {renderSidebarTab({ tabId: "map", activeTab: navigationState.activeTab, onClick: () => navigationState.activeTab.set("map") })}
            {renderSidebarTab({ tabId: "missions", activeTab: navigationState.activeTab, onClick: () => navigationState.activeTab.set("missions") })}
            {renderSidebarTab({ tabId: "business", activeTab: navigationState.activeTab, onClick: () => navigationState.activeTab.set("business") })}
            {renderSidebarTab({ tabId: "hangar", activeTab: navigationState.activeTab, onClick: () => navigationState.activeTab.set("hangar") })}
            {renderSidebarTab({ tabId: "pilote", activeTab: navigationState.activeTab, onClick: () => navigationState.activeTab.set("pilote") })}
          </div>{/* End Main Navigation Tabs */}

          {/* Settings Button - Bottom */}
          <div style="padding-bottom: 8px;">
            {renderSidebarTab({ tabId: "settings", activeTab: navigationState.activeTab, onClick: () => navigationState.activeTab.set("settings") })}
          </div>

        </div>

        {/* Content Area — padding-top matches sidebar to clear native EFB header */}
        <div style="flex: 1; overflow: hidden; position: relative; display: flex; flex-direction: column; padding-top: 44px;">
          {/* Phase 1: Rich Header Bar — player info always visible */}
          <div style="display: flex; align-items: center; padding: 0 10px; height: 32px; background: #1a1f2e; border-bottom: 1px solid #374151; flex-shrink: 0; gap: 0;">

            {/* GROUP 1: Identite pilote */}
            <div style="display: flex; align-items: center; gap: 6px; padding-right: 10px; min-width: 0;">
              <svg style="width: 13px; height: 13px; flex-shrink: 0;" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2">
                <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>
              </svg>
              <span style={authState.currentUser.map(u => u ? "font-size: 11px; font-weight: 600; color: #e5e7eb; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80px;" : "display: none;")}>
                {authState.currentUser.map(u => u?.username ?? "")}
              </span>
              <span style={authState.currentUser.map(u => {
                if (!u?.xp && u?.xp !== 0) return "display: none;";
                const lvl = calculateLevel(u.xp ?? 0).level;
                const color = lvl >= 10 ? "#f59e0b" : lvl >= 5 ? "#a855f7" : "#60a5fa";
                return `font-size: 9px; font-weight: 700; color: ${color}; background: ${color}22; padding: 1px 5px; border-radius: 8px; white-space: nowrap;`;
              })}>
                {authState.currentUser.map(u => {
                  const lvl = calculateLevel(u?.xp ?? 0).level;
                  return `Lv.${lvl}`;
                })}
              </span>
            </div>

            {/* Separateur */}
            <div style="width: 1px; height: 20px; background: #374151; flex-shrink: 0;"></div>

            {/* GROUP 2: Finances */}
            <div style="display: flex; align-items: center; gap: 12px; padding: 0 10px;">
              <div style="display: flex; align-items: center; gap: 4px;">
                <svg style="width: 11px; height: 11px; flex-shrink: 0;" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5">
                  <path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
                </svg>
                <span style="font-size: 10px; color: #22c55e; font-weight: 600; white-space: nowrap;">
                  {marketState.walletPersonal.map(v => v.toLocaleString() + " CR")}
                </span>
              </div>
              <div style={companyState.companyId.map(id => id ? "display: flex; align-items: center; gap: 4px;" : "display: none;")}>
                <svg style="width: 11px; height: 11px; flex-shrink: 0;" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.5">
                  <path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/>
                </svg>
                <span style="font-size: 10px; color: #3b82f6; font-weight: 600; white-space: nowrap;">
                  {companyState.companyBalance.map(v => v.toLocaleString())}
                </span>
              </div>
            </div>

            {/* Separateur */}
            <div style="width: 1px; height: 20px; background: #374151; flex-shrink: 0;"></div>

            {/* GROUP 3: XP Progression */}
            <div style="display: flex; align-items: center; gap: 6px; padding: 0 10px; flex: 1; justify-content: center;">
              <div style="width: 80px; height: 5px; background: #374151; border-radius: 3px; overflow: hidden; flex-shrink: 0;">
                <div style={authState.currentUser.map(u => {
                  const info = calculateLevel(u?.xp ?? 0);
                  return `width: ${info.progress}%; height: 100%; background: #a855f7; border-radius: 3px; transition: width 0.3s;`;
                })}></div>
              </div>
              <span style="font-size: 9px; color: #9ca3af; white-space: nowrap;">
                {authState.currentUser.map(u => {
                  const info = calculateLevel(u?.xp ?? 0);
                  return `${info.currentXp} / ${info.nextLevelXp} XP`;
                })}
              </span>
            </div>

            {/* Separateur */}
            <div style="width: 1px; height: 20px; background: #374151; flex-shrink: 0;"></div>

            {/* GROUP 4: Statut vol + connexion */}
            <div style="display: flex; align-items: center; gap: 6px; padding-left: 10px;">
              <div style={MappedSubject.create(([onGround, tracking]) => {
                const inFlight = !onGround || tracking;
                const color = inFlight ? "#f97316" : "#22c55e";
                return `display: flex; align-items: center; gap: 3px; padding: 2px 6px; border-radius: 10px; background: ${color}15; border: 1px solid ${color}40;`;
              }, simVarState.onGround, freeFlightState.isTracking)}>
                <div style={MappedSubject.create(([onGround, tracking]) => {
                  const inFlight = !onGround || tracking;
                  const color = inFlight ? "#f97316" : "#22c55e";
                  return `width: 5px; height: 5px; border-radius: 50%; background: ${color};`;
                }, simVarState.onGround, freeFlightState.isTracking)}></div>
                <span style={MappedSubject.create(([onGround, tracking]) => {
                  const inFlight = !onGround || tracking;
                  const color = inFlight ? "#f97316" : "#22c55e";
                  return `font-size: 8px; color: ${color}; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;`;
                }, simVarState.onGround, freeFlightState.isTracking)}>
                  {MappedSubject.create(([onGround, tracking]) => {
                    const inFlight = !onGround || tracking;
                    return inFlight ? "EN VOL" : "AU SOL";
                  }, simVarState.onGround, freeFlightState.isTracking)}
                </span>
              </div>

              <div style={MappedSubject.create(([status, offlineSimulated, gameMode]) => {
                const isSolo = gameMode === "solo";
                const isOnline = !isSolo && status === "connected" && !offlineSimulated;
                const isConnecting = !isSolo && status === "connecting" && !offlineSimulated;
                const color = isOnline ? "#22c55e" : isConnecting ? "#fbbf24" : "#6b7280";
                return `display: flex; align-items: center; gap: 3px; padding: 2px 6px; border-radius: 10px; background: ${color}15; border: 1px solid ${color}40;`;
              }, authState.seedConnectionStatus, settingsState.isOfflineSimulated, gameModeState.currentMode)}>
                <div style={MappedSubject.create(([status, offlineSimulated, gameMode]) => {
                  const isSolo = gameMode === "solo";
                  const isOnline = !isSolo && status === "connected" && !offlineSimulated;
                  const isConnecting = !isSolo && status === "connecting" && !offlineSimulated;
                  const color = isOnline ? "#22c55e" : isConnecting ? "#fbbf24" : "#6b7280";
                  return `width: 5px; height: 5px; border-radius: 50%; background: ${color}; flex-shrink: 0;`;
                }, authState.seedConnectionStatus, settingsState.isOfflineSimulated, gameModeState.currentMode)}></div>
                <span style={MappedSubject.create(([status, offlineSimulated, gameMode]) => {
                  const isSolo = gameMode === "solo";
                  const isOnline = !isSolo && status === "connected" && !offlineSimulated;
                  const isConnecting = !isSolo && status === "connecting" && !offlineSimulated;
                  const color = isOnline ? "#22c55e" : isConnecting ? "#fbbf24" : "#6b7280";
                  return `font-size: 8px; color: ${color}; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;`;
                }, authState.seedConnectionStatus, settingsState.isOfflineSimulated, gameModeState.currentMode)}>
                  {MappedSubject.create(([status, offlineSimulated, gameMode]) => {
                    const isSolo = gameMode === "solo";
                    if (isSolo) return "SOLO";
                    const isOnline = status === "connected" && !offlineSimulated;
                    const isConnecting = status === "connecting" && !offlineSimulated;
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
            onSwitchToSolo: this.handleSwitchToSolo,
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
            closestAirport: positionState.simVarAirport,
            // Inventory
            profileInventory: inventoryState.profileInventory,
            profileInventoryLoading: inventoryState.profileInventoryLoading,
            profileIcaoFilter: inventoryState.profileIcaoFilter,
            profileItemFilter: inventoryState.profileItemFilter,
            profileTierFilter: inventoryState.profileTierFilter,
            profileOwnerFilter: inventoryState.profileOwnerFilter,  // V4.1
            profileIcaoFilterRef: this.profileIcaoFilterRef,
            profileItemFilterRef: this.profileItemFilterRef,
            profileInventoryListRef: this.profileInventoryListRef,
            onFetchProfileInventory: () => { void this.marketController.fetchProfileInventory(); },
            onSetProfileTierFilter: (tier: number | null) => { inventoryState.profileTierFilter.set(tier); this.marketController.renderProfileInventory(); },
            onSetProfileOwnerFilter: (owner: "all" | "player" | "company") => { inventoryState.profileOwnerFilter.set(owner); this.marketController.renderProfileInventory(); },  // V4.1
            // Flight history
            profileFlightHistoryRef: this.profileFlightHistoryRef,
            profileFlightHistoryLoading: this.profileFlightHistoryLoading,
            onFetchFlightHistory: () => { void this.fetchFlightHistory(); },
            // V6: Social & Messagerie
            isP2PMode: authState.isP2PMode,
            socialFriendsListRef: this.socialFriendsListRef,
            socialSearchInputRef: this.socialSearchInputRef,
            socialSearchResultsRef: this.socialSearchResultsRef,
            socialPendingRef: this.socialPendingRef,
            socialConversationsRef: this.socialConversationsRef,
            socialMessagesRef: this.socialMessagesRef,
            socialMessageInputRef: this.socialMessageInputRef,
            onSearchPlayers: () => { void this.socialController.searchPlayers(); },
            onSendMessage: () => { void this.socialController.sendMessage(); },
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
            // V2: Grade estimation + ATC suivi
            trackingGradeEstimated: trackingState.trackingGradeEstimated,
            trackingScoreEstimated: trackingState.trackingScoreEstimated,
            trackingScoreGforce: trackingState.trackingScoreGforce,
            trackingGforceAlert: trackingState.trackingGforceAlert,
            trackingCargoFillPercent: trackingState.trackingCargoFillPercent,
            trackingAtcAssignedAlt: trackingState.trackingAtcAssignedAlt,
            trackingAtcAltDeviation: trackingState.trackingAtcAltDeviation,
            trackingAtcCruiseSpd: trackingState.trackingAtcCruiseSpd,
            trackingAtcSpdDeviation: trackingState.trackingAtcSpdDeviation,
            trackingSimRate: trackingState.trackingSimRate,
            // V3: Lights
            trackingLightNav: trackingState.trackingLightNav,
            trackingLightStrobe: trackingState.trackingLightStrobe,
            trackingLightBeacon: trackingState.trackingLightBeacon,
            trackingLightLanding: trackingState.trackingLightLanding,
            trackingLightTaxi: trackingState.trackingLightTaxi,
            trackingLightsMissing: trackingState.trackingLightsMissing,
            trackingLightsUnnecessary: trackingState.trackingLightsUnnecessary,
            trackingLightsStatusColor: trackingState.trackingLightsStatusColor,
            trackingLightsAlert: trackingState.trackingLightsAlert,
            trackingSuiviAtcMode: trackingState.trackingSuiviAtcMode,
            trackingSuiviCrossTrackNm: trackingState.trackingSuiviCrossTrackNm,
            trackingSuiviRouteStatus: trackingState.trackingSuiviRouteStatus,
            trackingSuiviInCruise: trackingState.trackingSuiviInCruise,
            trackingSuiviAlert: trackingState.trackingSuiviAlert,
            // V6: Weather
            trackingWeatherScore: trackingState.trackingWeatherScore,
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
            cargoSourceFilter: cargoState.cargoSourceFilter,
            onSetCargoSourceFilter: (filter: "player" | "company") => this.missionController.setCargoSourceFilter(filter),
            aircraftPassengerSeats: cargoState.aircraftPassengerSeats,
            aircraftPassengerCount: cargoState.aircraftPassengerCount,
            aircraftPassengerWeight: cargoState.aircraftPassengerWeight,
            airportPassengersRef: this.airportPassengersRef,
            aircraftPassengersRef: this.aircraftPassengersRef,
            creationStep3Valid: missionCreationState.creationStep3Valid,
            fpValidated: missionCreationState.fpValidated,
            fpHasActivePlan: missionCreationState.fpHasActivePlan,
            fpWaypointCount: missionCreationState.fpWaypointCount,
            fpTotalDistance: missionCreationState.fpTotalDistance,
            fpOriginIcao: missionCreationState.fpOriginIcao,
            fpDestinationIcao: missionCreationState.fpDestinationIcao,
            fpCanValidate: missionCreationState.fpCanValidate,
            fpFlightMode: missionCreationState.fpFlightMode,
            fpDestinationInputRef: this.fpDestinationInputRef,
            missionStatus: missionState.missionStatus,
            missionError: missionState.missionError,
            missionWarnings: missionState.missionWarnings,
            antiCheatInfo: missionCreationState.antiCheatInfo,
            creationErrorMsg: missionCreationState.creationErrorMsg,
            canCreateMissionFlag: missionCreationState.canCreateMissionFlag,
            showCargoPopup: cargoState.showCargoPopup,
            cargoPopupDirection: cargoState.cargoPopupDirection,
            cargoPopupItem: cargoState.cargoPopupItem as Subject<CargoPopupItem | null>,
            cargoPopupSliderRef: this.cargoPopupSliderRef,
            cargoPopupQtyRef: this.cargoPopupQtyRef,
            showMissionRecap: popupState.showMissionRecap,
            missionRecapData: missionState.missionRecapData,
            missionHistoryRef: this.missionHistoryRef,
            missionHistoryLoading: this.missionHistoryLoading,
            onFetchMissionHistory: () => { void this.fetchFlightHistory(); },
            onCancelMission: () => this.missionController.cancelMission(),
            onValidateCargoStep: () => this.missionController.validateCargoStep(),
            onModifyCargoStep: () => this.missionController.modifyCargoStep(),
            onReadFlightPlanFromGPS: () => this.missionController.readFlightPlanFromGPS(),
            onValidateFlightPlan: () => this.missionController.validateFlightPlan(),
            onModifyFlightPlan: () => this.missionController.modifyFlightPlan(),
            onCloseCargoPopup: () => this.missionController.closeCargoPopup(),
            onConfirmCargoTransfer: () => this.missionController.confirmCargoTransfer(),
            onSetCargoQty: (qty: number) => this.missionController.setCargoPopupQty(qty),
            onCreateMission: async () => { await this.missionController.createMissionV11(); this.showCreationFlow.set(false); },
            t: (cat: string, key: string) => this.t(cat as keyof typeof translations["fr"], key),
            // Phase 6b: Toggle creation flow
            showCreationFlow: this.showCreationFlow,
            onOpenCreationFlow: () => {
              void (async () => {
                await this.missionController.refreshMissionOrigin();
                await this.hangarController.autoSyncCurrentAircraft();
                const origin = missionState.missionOriginIcao.get();
                if (origin && origin !== "----") {
                  void this.missionController.fetchAirportInventoryForCargo(origin);
                }
                setTimeout(() => {
                  this.missionController.setupDestinationInput(this.fpDestinationInputRef.getOrDefault());
                }, 150);
              })();
            },
            // Phase 3: Contract integration (from old ContratsView)
            availableContractsRef: this.availableContractsRef,
            contractFiltersRef: this.contractFiltersRef,
            activeContractsRef: this.activeContractsRef,
            completedContractsRef: this.completedContractsRef,
            contractPopupRef: this.contractPopupRef,
            contractsLoading: this.contractController.contractsLoading,
            onRefreshContracts: () => { void this.contractController.fetchAvailableContracts(); },
            isP2PMode: authState.isP2PMode,
          })}

          {/* Business Tab Content - Phase 4: Company + Market merged */}
          {renderCompanyTab({
            activeTab: navigationState.activeTab as Subject<string>,
            currentLanguage: settingsState.currentLanguage,
            isLoggedIn: authState.isLoggedIn,
            isP2PMode: authState.isP2PMode,
            // Phase 4: Business sub-tab
            businessSubTab: navigationState.businessSubTab,
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
            onBuyCompany: () => { void this.companyController.handleBuyCompany(); },
            // Company inventory (Phase 5: will move to Hangar)
            companyInventory: inventoryState.companyInventory,
            companyInventoryLoading: inventoryState.companyInventoryLoading,
            companyIcaoFilter: inventoryState.companyIcaoFilter,
            companyItemFilter: inventoryState.companyItemFilter,
            companyTierFilter: inventoryState.companyTierFilter,
            companyIcaoFilterRef: this.companyIcaoFilterRef,
            companyItemFilterRef: this.companyItemFilterRef,
            companyInventoryListRef: this.companyInventoryListRef,
            onFetchCompanyInventory: () => { void this.companyController.fetchCompanyInventory(); },
            onSetCompanyTierFilter: (tier: number | null) => {
              inventoryState.companyTierFilter.set(tier);
              this.companyController.renderCompanyInventory();
            },
            // Transfers
            playerRole: companyState.playerRole,
            transferAmount: companyState.transferAmount,
            transferLoading: companyState.transferLoading,
            transferError: companyState.transferError,
            transferAmountInputRef: this.transferAmountInputRef,
            onTransfer: (direction: "to" | "from") => { void this.companyController.handleTransfer(direction); },
            // Membres
            companyMembersFullRef: this.companyMembersFullRef,
            // Historique
            companyHistoryRef: this.companyHistoryRef,
            companyHistoryLoading: companyState.companyHistoryLoading,
            // Messagerie
            companyMessagesRef: this.companyMessagesRef,
            companyMessagesLoading: companyState.companyMessagesLoading,
            companyMessageInputRef: this.companyMessageInputRef,
            companyMessageSending: companyState.companyMessageSending,
            onSendMessage: () => { void this.companyController.handleSendCompanyMessage(); },
            // Usines
            factoryListRef: this.factoryListRef,
            factoryDetailRef: this.factoryDetailRef,
            t: (cat: string, key: string) => this.t(cat as keyof TranslationKeys, key),
            // Phase 4: Market props (absorbed from MarketView)
            walletPersonal: marketState.walletPersonal,
            marketTierFilter: marketState.marketTierFilter,
            marketIcaoFilter: marketState.marketIcaoFilter,
            marketIcaoFilterRef: this.marketIcaoFilterRef,
            marketItemFilter: marketState.marketItemFilter,
            marketItemFilterRef: this.marketItemFilterRef,
            marketError: marketState.marketError,
            marketLoading: marketState.marketLoading,
            marketListings: marketState.marketListings,
            marketListingsRef: this.marketListingsRef,
            onFetchMarketData: () => { void this.marketController.fetchMarketData(); },
            showMarketBuyPopup: marketState.showMarketBuyPopup,
            marketBuyItem: marketState.marketBuyItem,
            marketBuyQty: marketState.marketBuyQty,
            marketBuyTotal: marketState.marketBuyTotal,
            marketBuyWallet: marketState.marketBuyWallet,
            marketBuyQtySliderRef: this.marketBuyQtySliderRef,
            marketBuyQtyDisplayRef: this.marketBuyQtyDisplayRef,
            onUpdateMarketBuyQty: (qty: number) => this.marketController.updateMarketBuyQty(qty),
            onCloseMarketBuyPopup: () => this.marketController.closeMarketBuyPopup(),
            onConfirmMarketBuy: () => { void this.marketController.confirmMarketBuy(); },
            mySellOrdersRef: this.mySellOrdersRef,
            onFetchMySellOrders: () => { void this.marketController.fetchMySellOrders(); },
            onCancelSellOrder: (orderId: string) => { void this.marketController.cancelSellOrder(orderId); },
            aircraftCatalogRef: this.aircraftCatalogRef,
            myAircraftForSaleRef: this.myAircraftForSaleRef,
            aircraftCategoryFilter: marketState.aircraftCategoryFilter,
            onFetchAircraftCatalog: () => { void this.marketController.fetchAircraftCatalog(); },
            onPurchaseAircraft: (catalogId: string, ownerType: "player" | "company") => { void this.marketController.purchaseAircraft(catalogId, ownerType); },
            onSellAircraft: (aircraftId: string) => { void this.marketController.sellAircraft(aircraftId); },
            showSellItemPopup: marketState.showSellItemPopup,
            sellItemPopupRef: this.sellItemPopupRef,
            onOpenSellItemPopup: (itemCode?: string, airportIcao?: string) => { void this.marketController.openSellItemPopupHandler(itemCode, airportIcao); },
            onCloseSellItemPopup: () => { closeSellItemPopup(); },
            showSellAircraftPopup: marketState.showSellAircraftPopup,
            sellAircraftPopupRef: this.sellAircraftPopupRef,
            onCloseSellAircraftPopup: () => { closeSellAircraftPopup(); },
          })}
          {/* Phase 4: MarketView merged into CompanyView — import kept for reference */}
          {/* renderMarketTab removed — content absorbed into Business tab */}

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
            onFetchHangarAircraftList: () => { void this.hangarController.fetchHangarAircraftList(); },
            onOpenRefuelPopup: () => this.hangarController.openRefuelPopup(),
            onOpenEditRegistrationPopup: () => this.hangarController.openEditRegistrationPopup(),
            onUpdateAircraftRegistration: () => { void this.hangarController.updateAircraftRegistration(); },
            onOpenRepairPopup: () => this.hangarController.openRepairPopup(),
            onPerformRepair: (aircraftId: string, systems: string[], wallet: "player" | "company") => { void this.hangarController.performRepair(aircraftId, systems, wallet); },
            // V7.1: Aircraft transfer
            showAircraftTransferPopup: transferState.showAircraftTransferPopup,
            acTransferAircraftReg: transferState.acTransferAircraftReg,
            acTransferOriginIcao: transferState.acTransferOriginIcao,
            acTransferOwnerType: transferState.acTransferOwnerType,
            acTransferDestIcao: transferState.acTransferDestIcao,
            acTransferEstimate: transferState.acTransferEstimate,
            walletPersonal: marketState.walletPersonal,
            companyBalance: companyState.companyBalance,
            transferIcaoInputRef: this.transferIcaoInputRef,
            onOpenAircraftTransferPopup: () => this.hangarController.openAircraftTransferPopup(),
            onTransferIcaoInput: (icao: string) => { void this.hangarController.updateTransferEstimate(icao); },
            onConfirmAircraftTransfer: () => { void this.hangarController.confirmAircraftTransfer(); },
            onCloseAircraftTransferPopup: () => this.hangarController.closeAircraftTransferPopup(),
            // Note/description
            hangarNoteEditing: hangarState.hangarNoteEditing,
            onStartEditNote: () => this.hangarController.startEditNote(),
            onSaveNote: (desc: string) => { void this.hangarController.saveNote(desc); },
            setupInputEventBlocker: (el: HTMLInputElement) => this.setupInputEventBlocker(el),
          })}

          {/* Settings Tab Content - V1.7: Extracted to SettingsView.tsx */}
          {renderSettingsTab({
            activeTab: navigationState.activeTab as Subject<string>,
            currentLanguage: settingsState.currentLanguage,
            isOfflineSimulated: settingsState.isOfflineSimulated,
            currentGameMode: gameModeState.currentMode,
            onSetLanguage: (lang: Language) => this.setLanguage(lang),
            onResetData: () => { void this.resetAllData(); },
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
            onCenterMapOnAircraft: () => this.mapController.centerMapOnAircraft(),
            onToggleLargeAirports: () => this.mapController.toggleLargeAirports(),
            onToggleMediumAirports: () => this.mapController.toggleMediumAirports(),
            onToggleSmallAirports: () => this.mapController.toggleSmallAirports(),
            onToggleFactoriesOnMap: () => this.mapController.toggleFactoriesOnMap(),
            onToggleHelipadsOnMap: () => this.mapController.toggleHelipadsOnMap(),
            onSearchAirportByIcao: () => { void this.mapController.searchAirportByIcao(); },
            onFetchNearbyAirports: () => this.mapController.fetchNearbyAirports(),
            onOpenCreateFactory: (airport) => this.openCreateFactory(airport),
            onOpenManageFactory: (factory) => this.openManageFactory(factory),
            onSetDestinationAirport: (airport) => this.setDestinationAirport(airport),
            // V7: Pilot transfer props
            currentUserAirport: positionState.dbAirport,
            walletPersonal: marketState.walletPersonal,
            showPilotTransferPopup: transferState.showPilotTransferPopup,
            transferEstimate: transferState.transferEstimate,
            transferDestIcao: transferState.transferDestIcao,
            transferDestName: transferState.transferDestName,
            onMovePilotHere: (airport) => { void this.mapController.openPilotTransfer(airport.icao, airport.name); },
            onConfirmPilotTransfer: () => {
              void this.mapController.confirmPilotTransfer();
            },
            onClosePilotTransferPopup: () => this.mapController.closePilotTransferPopup(),
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

        {/* V2.4: Free Flight Recap Popup (rendered via ref) */}
        <div ref={this.freeFlightRecapRef} style={freeFlightState.ffShowRecap.map(show => show
          ? "position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000;"
          : "display: none;")}>
        </div>
      </div>
    );
  }
}

class AeroCorpOnlineApp extends App {
  public get name(): string {
    return "AeroCorp Online";
  }

  public get icon(): string {
    return `${BASE_URL}/Assets/app-icon.svg`;
  }

  public BootMode = AppBootMode.WARM;
  public SuspendMode = AppSuspendMode.SLEEP;

  public async install(_props: AppInstallProps): Promise<void> {
    Efb.loadCss(`${BASE_URL}/AeroCorpOnline.css`);
    return Promise.resolve();
  }

  public get compatibleAircraftModels(): string[] | undefined {
    return undefined;
  }

  public render(): TVNode<AeroCorpOnlineView> {
    return <AeroCorpOnlineView bus={this.bus} />;
  }
}

Efb.use(AeroCorpOnlineApp);
