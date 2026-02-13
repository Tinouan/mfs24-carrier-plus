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

import "./WorldOfAircraft.scss";

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
import { trackingManager, missionCreationManager, freeFlightManager, PersistenceManager, popupManager } from "./managers";
import type { FlightPlanData, PayloadState } from "./managers";

// P2P: Local database initialization and AI economy
import { InitService, AIEconomyService } from "./services";
import { DatabaseManager } from "./managers/DatabaseManager";

// V2.1: Sync services for hybrid online/offline mode
import { SyncService } from "./services/SyncService";
import { SyncManager } from "./services/SyncManager";
import { NetworkState } from "./state/NetworkState";
import { isGameReady } from "./state/GameModeState";
import { NativePersistence } from "./services/NativePersistence";

// Render helpers for DOM updates
import {
  // V2.4: Free flight render helpers
  renderFreeFlightRecapHtml,
  type FreeFlightRecapTranslations,
  // V4.1: Specialized history renderers
  renderTransactionsHistoryHtml,
  renderFlightsHistoryHtml,
  type UnifiedTimelineEntry,
  type UnifiedHistoryTranslations,
} from "./helpers";
import { ContractController, CompanyController, MapController, MarketController, HangarController, MissionController, SocialController } from "./controllers";

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
import { renderMarketTab } from "./views/MarketView";
import { renderHangarTab } from "./views/HangarView";
import { renderMapTab } from "./views/MapView";
import { renderCompanyTab } from "./views/CompanyView";
import { renderMissionsTab } from "./views/MissionsView";
import type { CargoPopupItem } from "./views/MissionsView";
import { renderContratsTab } from "./views/ContratsView";

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
  type FreeFlightRecapData,
  closeSellItemPopup,
  closeSellAircraftPopup,
} from "./state";

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
  private activeContractsRef = FSComponent.createRef<HTMLDivElement>();
  private completedContractsRef = FSComponent.createRef<HTMLDivElement>();
  private contractPopupRef = FSComponent.createRef<HTMLDivElement>();
  private contractController = new ContractController(
    {
      availableContracts: this.availableContractsRef,
      activeContracts: this.activeContractsRef,
      completedContracts: this.completedContractsRef,
      contractPopup: this.contractPopupRef,
    },
    (section: string, key: string) => this.t(section as any, key)
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
  private profileFlightHistoryRef = FSComponent.createRef<HTMLDivElement>();
  private profileFlightHistoryLoading = Subject.create<boolean>(false);
  private transactionLogEntries: import("./managers/DatabaseManager").TransactionLog[] = [];

  // V2.4: Free flight recap popup ref
  private freeFlightRecapRef = FSComponent.createRef<HTMLDivElement>();

  // Company inventory refs
  private companyIcaoFilterRef = FSComponent.createRef<HTMLInputElement>();
  private companyItemFilterRef = FSComponent.createRef<HTMLInputElement>();
  private companyInventoryListRef = FSComponent.createRef<HTMLDivElement>();

  // V7: Pilot transfer state
  private currentUserAirport = Subject.create<string>("");

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

    // V2.4: Initialize free flight manager for career mode
    this.initializeFreeFlightManager();

    // V2.5: Initialize popup manager for centralized popup logic
    this.initializePopupManager();

    // V1.6: Start background flight tracking (anti-cheat)
    trackingManager.startBackgroundTracking();

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
      // Auto-refresh aircraft when switching to create-mission tab
      if ((tab as string) === "create-mission" && (isGameReady())) {
        void this.missionController.refreshMissionOrigin();
      }
      // Auto-fetch company data when switching to company tab
      if (tab === "company" && (isGameReady())) {
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
      // Auto-fetch market data when switching to market tab
      if (tab === "market" && (isGameReady())) {
        void this.marketController.fetchMarketData();
        // Setup ICAO filter input after DOM renders
        setTimeout(() => {
          const icaoInput = this.marketIcaoFilterRef.getOrDefault();
          if (icaoInput) {
            this.setupInputEventBlocker(icaoInput);
            icaoInput.addEventListener("input", () => {
              const value = icaoInput.value.toUpperCase();
              icaoInput.value = value;  // Force uppercase
              marketState.marketIcaoFilter.set(value);
              this.marketController.renderMarketTab();  // Re-render with filter
            });
          }
          // Setup item name filter input
          const itemInput = this.marketItemFilterRef.getOrDefault();
          if (itemInput) {
            this.setupInputEventBlocker(itemInput);
            itemInput.addEventListener("input", () => {
              const value = itemInput.value;
              marketState.marketItemFilter.set(value);
              this.marketController.renderMarketTab();  // Re-render with filter
            });
          }
        }, 150);
      }
      // V2.1: Auto-refresh active mission when switching to missions tab
      if (tab === "missions" && (isGameReady())) {
        void this.missionController.fetchActiveMission();
        void this.hangarController.autoSyncCurrentAircraft();
        // V5.1: Always refresh airport inventory when switching to missions tab
        const origin = missionState.missionOriginIcao.get();
        if (origin && origin !== "----") {
          void this.missionController.fetchAirportInventoryForCargo(origin);
        }
      }
      // V2.2: Auto-fetch hangar aircraft list when switching to hangar tab
      if (tab === "hangar" && (isGameReady())) {
        void this.hangarController.fetchHangarAircraftList();
        void this.hangarController.autoSyncCurrentAircraft();
      }
      // V5: Auto-fetch contracts when switching to contrats tab
      if (tab === "contrats" && (isGameReady())) {
        void ContractRouter.refreshContracts();
        const subTab = navigationState.contratsSubTab.get();
        if (subTab === "dashboard") void this.contractController.fetchAvailableContracts();
        else if (subTab === "en-cours") void this.contractController.fetchActiveContracts();
      }
      // P2P: Settings tab no longer needs credentials setup
    }));

    // V5: Auto-fetch when switching to contracts sub-tabs
    this.stateSubscriptions.push(navigationState.contratsSubTab.sub((subTab) => {
      if (navigationState.activeTab.get() !== "contrats") return;
      if (subTab === "dashboard" && (isGameReady())) {
        void this.contractController.fetchAvailableContracts();
      }
      if (subTab === "en-cours" && (isGameReady())) {
        void this.contractController.fetchActiveContracts();
      }
    }));

    // V1.1: Auto-refresh when switching to missions sub-tabs
    this.stateSubscriptions.push(navigationState.missionsSubTab.sub((subTab) => {
      if (subTab === "creation" && (isGameReady())) {
        void this.missionController.refreshMissionOrigin();
        // V1.4: Auto-sync current aircraft fuel (anti-cheat)
        void this.hangarController.autoSyncCurrentAircraft();
        // V5.1: Refresh airport inventory when switching to creation sub-tab
        const origin = missionState.missionOriginIcao.get();
        if (origin && origin !== "----") {
          void this.missionController.fetchAirportInventoryForCargo(origin);
        }
        // Setup keyboard capture for destination ICAO input
        setTimeout(() => {
          this.missionController.setupDestinationInput(this.fpDestinationInputRef.getOrDefault());
        }, 150);
      }
      // V2.1: Auto-refresh apercu when switching to it
      if (subTab === "apercu" && (isGameReady())) {
        void this.missionController.fetchActiveMission();
      }
      // V4.1: Auto-fetch mission history when switching to historique
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
   * @param skipLoadStates - If true, skip loading states (used after fresh first launch to avoid overwriting fresh data)
   */
  private initializePersistenceAndEconomy(skipLoadStates: boolean = false): void {
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

    // V4.1 FIX: Skip loading states if this is a fresh first launch
    // Fresh first launch data is already in DatabaseManager, no need to re-load
    // Re-loading could potentially restore stale cached data
    if (skipLoadStates) {
      console.log("[WOA] Skipping loadAllStates (fresh first launch)");
      // Just enable auto-save and start AI economy
      PersistenceManager.enableAutoSave();
      AIEconomyService.initialize({
        onPricesUpdated: (count) => console.log(`[AIEconomy] Updated ${count} prices`),
        onOrdersGenerated: (count) => console.log(`[AIEconomy] Generated ${count} AI orders`),
      });
      AIEconomyService.start();
      AIEconomyService.forceUpdate().then(() => {
        console.log("[WOA] P2P local mode ready with AI economy (fresh first launch)");
      });
      return;
    }

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
    // V4.1 FIX: Read airport from input, fallback to Subject, then to default
    const inputAirport = (airportInput?.value?.trim() || "").toUpperCase();
    const subjectAirport = authState.firstLaunchAirport.get().toUpperCase();
    const startingAirport = inputAirport.length === 4 ? inputAirport : (subjectAirport.length === 4 ? subjectAirport : "LFPG");

    // Validation is done in WelcomePopup - button is disabled if invalid
    console.log(`[WOA] Completing first launch: ${pilotName} (${nationality}) at ${startingAirport} (input: "${inputAirport}", subject: "${subjectAirport}")`);

    // Hide welcome popup
    authState.showFirstLaunchPopup.set(false);

    // Complete the setup with user data
    InitService.completeFirstLaunch(pilotName, nationality, startingAirport)
      .then(async () => {
        console.log("[WOA] First launch setup complete!");
        // V4.1 FIX: Initialize persistence but SKIP loadAllStates to prevent overwriting fresh data
        // The player data is already fresh in DatabaseManager from completeFirstLaunch()
        this.initializePersistenceAndEconomy(true); // skipLoadStates = true

        // Load player data into state (including career stats)
        try {
          const player = await InitService.getPlayerInfo();
          if (player) {
            console.log(`[WOA] Player loaded: ${player.name} with ${player.money} credits, ${player.xp} XP`);
            marketState.walletPersonal.set(player.money);

            // Load career stats for profile display
            const careerStats = await DatabaseManager.getOrCreatePilotCareerStats(player.id);

            authState.currentUser.set({
              id: player.id,
              username: player.name,
              email: player.email || "",
              xp: player.xp,
              money: player.money,
              nationality: player.nationality,
              preferred_airport: player.preferred_airport,
              current_airport: player.current_airport,  // V4.1: Current position
              last_latitude: player.last_latitude,      // V4.1: Map marker fallback
              last_longitude: player.last_longitude,    // V4.1: Map marker fallback
              career_stats: {
                total_missions: careerStats.total_missions,
                total_flight_time_minutes: careerStats.total_flight_time_minutes,
                total_distance_nm: careerStats.total_distance_nm,
                average_grade: careerStats.average_grade,
              },
            });
            authState.isLoggedIn.set(true);
            this.currentUserAirport.set(player.current_airport || player.preferred_airport || "");
            this.socialController.setPlayerId(player.id);

            // V4.1 FIX: Center map on player's starting airport after first launch
            console.log(`[WOA] Centering map on new pilot's airport: ${player.current_airport || player.preferred_airport}`);
            void this.mapController.centerMapOnPlayerAirport();

            // V4.1 BRUTE FORCE: Directly force marker + view on chosen airport
            const chosenIcao = player.current_airport || player.preferred_airport || startingAirport;
            const airports = DatabaseManager.getAirportsCache();
            const airport = airports.find(a => a.ident === chosenIcao);
            if (airport) {
              this.mapController.forcePosition(airport.latitude, airport.longitude, 12);
              console.log(`[WOA] BRUTE FORCE: marker+view forced to ${chosenIcao} (${airport.latitude}, ${airport.longitude})`);
            }
          }
        } catch (e) {
          console.warn("[WOA] Could not load player info:", e);
        }

        // Refresh hangar list with the new aircraft
        console.log("[WOA] Refreshing hangar after first launch...");
        void this.hangarController.fetchHangarAircraftList();

        // V4.1 FIX: Final verification log - the balance MUST be 100,000 CR
        const finalBalance = marketState.walletPersonal.get();
        const finalUserMoney = authState.currentUser.get()?.money;
        console.log(`[WOA] ═══════════════════════════════════════════════════`);
        console.log(`[WOA] FIRST LAUNCH COMPLETE - Balance Verification`);
        console.log(`[WOA] marketState.walletPersonal: ${finalBalance}`);
        console.log(`[WOA] authState.currentUser.money: ${finalUserMoney}`);
        console.log(`[WOA] Expected: 100,000 CR`);
        if (finalBalance !== 100000 || finalUserMoney !== 100000) {
          console.error(`[WOA] CRITICAL: Balance mismatch! Expected 100,000 but got ${finalBalance}/${finalUserMoney}`);
        } else {
          console.log(`[WOA] ✓ Balance is correct: 100,000 CR`);
        }
        console.log(`[WOA] ═══════════════════════════════════════════════════`);
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
      getActiveMission: () => missionState.activeMission.get(),
      getMissionCheckpoints: () => missionState.missionCheckpoints.get(),
      getMissionAircraft: () => missionState.missionCurrentAircraft.get(),
      getAircraftCargoWeight: () => cargoState.aircraftCargoWeight.get(),
      getWaypointsTotal: () => missionState.waypointsTotal.get(),
      getMissionDistanceNm: () => missionState.missionDistanceNm.get(),
      // V2.0: Additional getters
      getWaypointsPassed: () => missionState.waypointsPassed.get(),
      getClosestAirport: () => simVarState.closestAirport.get(),
      getTotalPayload: () => this.missionController.getTotalPayload(),
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
        this.missionController.payloadStartLbs = state.payloadStartLbs;
        this.missionController.fuelStartPercent = state.fuelStartPercent;
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
      onStatsUpdated: (_flightTime: number, _distance: number, _xp: number) => {
        // Stats are already in freeFlightState, no need to update here
      },
      onSessionComplete: (recapData: FreeFlightRecapData) => {
        console.log(`[FreeFlight] Session complete - XP: ${recapData.xp_earned}, Grade: ${recapData.grade}`);

        // Save to flight history
        void this.saveFreeFlightToHistory(recapData);

        // XP is already awarded by FreeFlightManager.endLocalSession()

        // Store recap data and show popup
        freeFlightState.ffRecapData.set(recapData);
        freeFlightState.ffShowRecap.set(true);
      },
      onError: (error: string) => {
        console.warn("[FreeFlight] Error:", error);
      },
    });

    // Subscribe to recap popup state
    this.stateSubscriptions.push(freeFlightState.ffShowRecap.sub((show) => {
      if (show) {
        this.renderFreeFlightRecapPopup();
      } else {
        const el = this.freeFlightRecapRef.getOrDefault();
        if (el) el.innerHTML = "";
      }
    }));

    // Subscribe to changes that trigger free flight start/stop
    // Start when: logged in + aircraft detected + no active mission
    this.stateSubscriptions.push(authState.isLoggedIn.sub((loggedIn) => {
      if (loggedIn) {
        this.checkAndStartFreeFlight();
      } else {
        freeFlightManager.stopBackgroundTracking();
      }
    }));

    // When aircraft changes
    this.stateSubscriptions.push(missionState.selectedAircraftId.sub(() => {
      if (isGameReady()) {
        this.checkAndStartFreeFlight();
      }
    }));

    // When mission state changes
    this.stateSubscriptions.push(missionState.activeMission.sub((mission) => {
      if (mission) {
        // Mission started - pause free flight
        freeFlightManager.pauseForMission();
      } else {
        // Mission ended - resume free flight
        this.checkAndStartFreeFlight();
      }
    }));

    // V7.1: Setup transfer ICAO input when popup opens
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

  /**
   * Check conditions and start free flight tracking if appropriate
   */
  private checkAndStartFreeFlight(): void {
    const isLoggedIn = isGameReady();
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
      console.error("[WOA] Failed to load preferences:", error);
    }
  }

  // V1.5: Load unit preferences from NativePersistence
  private loadUnitPreferences(): void {
    try {
      const savedUnits = NativePersistence.get("woa_units");
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

  // V1.5: Get translation for current language
  private t(category: keyof TranslationKeys, key: string): string {
    const lang = settingsState.currentLanguage.get();
    const categoryObj = translations[lang][category] as Record<string, string>;
    return categoryObj[key] || key;
  }

  // V1.5: Set language and save to NativePersistence
  private setLanguage(lang: Language): void {
    settingsState.currentLanguage.set(lang);
    NativePersistence.set("woa_language", lang);
    console.log("[WOA] Language set to:", lang);
  }

  // V1.5: Load language from NativePersistence
  private loadLanguage(): void {
    const savedLang = NativePersistence.get("woa_language") as Language | null;
    const validLanguages: Language[] = ["en", "fr", "de", "es"];
    if (savedLang && validLanguages.includes(savedLang)) {
      settingsState.currentLanguage.set(savedLang);
      console.log("[WOA] Language loaded:", savedLang);
    }
  }

  public onClose(): void {
    this.stopSimVarUpdates();
    // Don't dispose map on close - it might just be minimized
    // Only dispose on open to handle GT refresh case

    // PASSE 3: Cleanup state subscriptions to prevent memory leaks
    this.stateSubscriptions.forEach((sub) => {
      try {
        sub.destroy();
      } catch (e) {
        console.error("[WOA] Error destroying subscription:", e);
      }
    });
    this.stateSubscriptions = [];
  }

  public onResume(): void {
    this.startSimVarUpdates();

    // Subscribe to FlightPlanner events (EFB flight plan detection)
    this.missionController.subscribeToFlightPlannerEvents(this.props.bus);

    // V1.4: Auto-sync aircraft fuel when app resumes (anti-cheat)
    // This ensures fuel is enforced when returning from main menu
    if (isGameReady()) {
      console.log("[WOA] App resumed, syncing aircraft state...");
      void this.hangarController.autoSyncCurrentAircraft();
    }

    // Refresh map if it exists and we're on map tab (handles resume from pause)
    if (navigationState.activeTab.get() === "map") {
      setTimeout(() => this.mapController.refreshMapSize(), 100);
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

    console.log("[WOA] Resetting all local data...");

    try {
      // V4.1 FIX: AWAIT the database reset - MUST complete before anything else
      // This clears DatabaseManager (player, aircraft, inventory, etc.) + NativePersistence + localStorage
      await InitService.resetDatabase();
      console.log("[WOA] DatabaseManager + NativePersistence + localStorage cleared via InitService");

      // Clear user preferences stored via generic NativePersistence.set()
      NativePersistence.set("woa_language", "");
      NativePersistence.set("woa_units", "");
      console.log("[WOA] User preferences cleared");

      // Clear pending actions queue (Online mode)
      NetworkState.clearPendingActions();
      console.log("[WOA] Pending actions cleared");

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
        SetStoredData("WOA_GameMode", "solo");
      }

      // Show first launch popup for fresh start
      authState.showFirstLaunchPopup.set(true);

      alert("Data reset complete! The welcome screen will appear.");

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

  private openCreateFactory(_airport: { icao: string; name: string }): void {
    // TODO: Implement factory creation form
    mapState.selectedAirport.set(null);
  }

  private openManageFactory(_factory: { id: string; name: string }): void {
    // TODO Phase 9: Implement factory management panel
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

      console.log(`[WOA] Unified history loaded: ${flights.length} flights, ${transactions.length} transactions`);
      this.renderMarketTransactionHistory();
      this.renderMissionHistory();
      this.renderFreeFlightHistory();
    } catch (error) {
      console.error("[WOA] Error fetching unified history:", error);
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

    // Build mission flights timeline only
    const timeline: UnifiedTimelineEntry[] = [];
    for (const flight of this.flightHistoryEntries) {
      if (flight.type !== "mission") continue;
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

  /**
   * Save free flight session to history
   */
  private async saveFreeFlightToHistory(recapData: FreeFlightRecapData): Promise<void> {
    const aircraftId = missionState.selectedAircraftId.get();
    const aircraftReg = simVarState.currentSimAircraftReg.get() || "Unknown";

    const entry: FlightHistoryEntry = {
      id: `ff_${Date.now()}`,
      type: "freeflight",
      date: Date.now(),
      departure_icao: recapData.departure_icao,
      arrival_icao: recapData.arrival_icao,
      aircraft_id: aircraftId || "",
      aircraft_type: "",
      aircraft_reg: aircraftReg,
      distance_nm: recapData.distance_nm,
      flight_time_minutes: recapData.flight_time_minutes,
      score_total: recapData.score_total,
      grade: recapData.grade,
      xp_earned: recapData.xp_earned,
      money_earned: 0,
      landing_fpm: recapData.landing_fpm,
      max_gforce: recapData.max_gforce,
      bonuses: {
        real_time: recapData.bonuses.real_time.active,
        night: recapData.bonuses.night.active,
        atc: recapData.bonuses.atc.active,
        fuel_eco: recapData.bonuses.fuel_eco.active,
        no_autopilot: recapData.bonuses.no_autopilot.active,
        bad_weather: recapData.bonuses.bad_weather.active,
      },
      weather_visibility_nm: recapData.weather_visibility_nm,
      weather_wind_kts: recapData.weather_wind_kts,
      atc_compliance: recapData.atc_compliance,
      atc_violations: recapData.atc_violations,
    };

    try {
      await DatabaseManager.saveFlightHistory(entry);
      console.log("[WOA] Flight history entry saved:", entry.id);
    } catch (error) {
      console.error("[WOA] Error saving flight history:", error);
    }
  }

  /**
   * Render free flight recap popup
   */
  private renderFreeFlightRecapPopup(): void {
    const el = this.freeFlightRecapRef.getOrDefault();
    if (!el) return;

    const recapData = freeFlightState.ffRecapData.get();
    if (!recapData) return;

    const lang = settingsState.currentLanguage.get();
    const tr = translations[lang];

    const recapTr: FreeFlightRecapTranslations = {
      reportTitle: tr.freeFlight.reportTitle,
      departure: tr.freeFlight.departure,
      arrival: tr.freeFlight.arrival,
      distance: tr.freeFlight.distance,
      flightTime: tr.freeFlight.flightTime,
      fuelRemaining: tr.freeFlight.fuelRemaining,
      flightQuality: tr.freeFlight.flightQuality,
      landing: tr.freeFlight.landing,
      gforceMax: tr.freeFlight.gforceMax,
      atcCompliance: tr.freeFlight.atcCompliance,
      violations: tr.freeFlight.violations,
      bonuses: tr.freeFlight.bonuses,
      bonusRealTime: tr.freeFlight.bonusRealTime,
      bonusNight: tr.freeFlight.bonusNight,
      bonusAtc: tr.freeFlight.bonusAtc,
      bonusFuelEco: tr.freeFlight.bonusFuelEco,
      bonusNoAP: tr.freeFlight.bonusNoAP,
      bonusBadWeather: tr.freeFlight.bonusBadWeather,
      totalBonus: tr.freeFlight.totalBonus,
      result: tr.freeFlight.result,
      score: tr.freeFlight.score,
      grade: tr.freeFlight.grade,
      xpEarned: tr.freeFlight.xpEarned,
      moneyEarned: tr.freeFlight.moneyEarned,
      moneyDisabled: tr.freeFlight.moneyDisabled,
      close: tr.freeFlight.close,
      butter: tr.freeFlight.butter,
      smooth: tr.freeFlight.smooth,
      normal: tr.freeFlight.normal,
      hard: tr.freeFlight.hard,
      crash: tr.freeFlight.crash,
      perfect: tr.freeFlight.perfect,
      ok: tr.freeFlight.ok,
      poor: tr.freeFlight.poor,
    };

    el.innerHTML = renderFreeFlightRecapHtml(recapData, recapTr);

    // Bind close button
    const closeBtn = el.querySelector(".ff-recap-close-btn");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        freeFlightState.ffShowRecap.set(false);
        freeFlightState.ffRecapData.set(null);
      });
    }
  }

  // ═══════════════════════════════════════════════════════════
  // COMPANY INVENTORY
  // ═══════════════════════════════════════════════════════════

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
            {renderSidebarTab({ tabId: "contrats", activeTab: navigationState.activeTab, onClick: () => navigationState.activeTab.set("contrats") })}
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
            onCreateMission: () => this.missionController.createMissionV11(),
            t: (cat: string, key: string) => this.t(cat as keyof typeof translations["fr"], key),
          })}

          {/* Contrats Tab Content - V5: Contracts system */}
          {renderContratsTab({
            activeTab: navigationState.activeTab as Subject<string>,
            currentLanguage: settingsState.currentLanguage,
            isLoggedIn: authState.isLoggedIn,
            contratsSubTab: navigationState.contratsSubTab,
            availableContractsRef: this.availableContractsRef,
            activeContractsRef: this.activeContractsRef,
            completedContractsRef: this.completedContractsRef,
            contractPopupRef: this.contractPopupRef,
            contractsLoading: this.contractController.contractsLoading,
            onRefreshContracts: () => { void this.contractController.fetchAvailableContracts(); },
            isP2PMode: authState.isP2PMode,
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
            onBuyCompany: () => { void this.companyController.handleBuyCompany(); },
            // Company inventory
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
            // Membres full tab
            companyMembersFullRef: this.companyMembersFullRef,
            // Historique tab
            companyHistoryRef: this.companyHistoryRef,
            companyHistoryLoading: companyState.companyHistoryLoading,
            // Messagerie tab
            companyMessagesRef: this.companyMessagesRef,
            companyMessagesLoading: companyState.companyMessagesLoading,
            companyMessageInputRef: this.companyMessageInputRef,
            companyMessageSending: companyState.companyMessageSending,
            onSendMessage: () => { void this.companyController.handleSendCompanyMessage(); },
            t: (cat: string, key: string) => this.t(cat as keyof TranslationKeys, key),
          })}

          {/* Market (HV) Tab Content - V1.8: Extracted to MarketView.tsx */}
          {renderMarketTab({
            activeTab: navigationState.activeTab as Subject<string>,
            currentLanguage: settingsState.currentLanguage,
            isLoggedIn: authState.isLoggedIn,
            marketSubTab: navigationState.marketSubTab,
            walletPersonal: marketState.walletPersonal,
            companyData: companyState.companyData,
            playerRole: companyState.playerRole,
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
            onFetchMarketData: () => { void this.marketController.fetchMarketData(); },
            onUpdateMarketBuyQty: (qty: number) => this.marketController.updateMarketBuyQty(qty),
            onCloseMarketBuyPopup: () => this.marketController.closeMarketBuyPopup(),
            onConfirmMarketBuy: () => { void this.marketController.confirmMarketBuy(); },
            // V4.1: Sell orders
            mySellOrdersRef: this.mySellOrdersRef,
            onFetchMySellOrders: () => { void this.marketController.fetchMySellOrders(); },
            onCancelSellOrder: (orderId: string) => { void this.marketController.cancelSellOrder(orderId); },
            // V4.1: Aircraft catalog
            aircraftCatalogRef: this.aircraftCatalogRef,
            myAircraftForSaleRef: this.myAircraftForSaleRef,
            aircraftCategoryFilter: marketState.aircraftCategoryFilter,
            onFetchAircraftCatalog: () => { void this.marketController.fetchAircraftCatalog(); },
            onPurchaseAircraft: (catalogId: string, ownerType: "player" | "company") => { void this.marketController.purchaseAircraft(catalogId, ownerType); },
            onSellAircraft: (aircraftId: string) => { void this.marketController.sellAircraft(aircraftId); },
            // V4.1: Market inventory
            marketInventoryListRef: this.marketInventoryListRef,
            marketInvIcaoFilterRef: this.marketInvIcaoFilterRef,
            marketInvItemFilterRef: this.marketInvItemFilterRef,
            marketInvIcaoFilter: inventoryState.marketInvIcaoFilter,
            marketInvItemFilter: inventoryState.marketInvItemFilter,
            marketInvTierFilter: inventoryState.marketInvTierFilter,
            marketInvOwnerFilter: inventoryState.marketInvOwnerFilter,
            onFetchMarketInventory: () => { void this.marketController.fetchMarketInventory(); },
            // V4.1: Sell item popup
            showSellItemPopup: marketState.showSellItemPopup,
            sellItemPopupRef: this.sellItemPopupRef,
            onOpenSellItemPopup: (itemCode?: string, airportIcao?: string) => { void this.marketController.openSellItemPopupHandler(itemCode, airportIcao); },
            onCloseSellItemPopup: () => { closeSellItemPopup(); },
            // V4.1: Aircraft sell choice popup
            showSellAircraftPopup: marketState.showSellAircraftPopup,
            sellAircraftPopupRef: this.sellAircraftPopupRef,
            onCloseSellAircraftPopup: () => { closeSellAircraftPopup(); },
            // V4.1: History (moved from Profile)
            flightHistoryRef: this.flightHistoryRef,
            flightHistoryLoading: this.flightHistoryLoading,
            onFetchFlightHistory: () => { void this.fetchFlightHistory(); },
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
            onFetchHangarAircraftList: () => { void this.hangarController.fetchHangarAircraftList(); },
            onSyncFuelFromSimulator: () => { void this.hangarController.syncFuelFromSimulator(); },
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
            currentUserAirport: this.currentUserAirport,
            walletPersonal: marketState.walletPersonal,
            showPilotTransferPopup: transferState.showPilotTransferPopup,
            transferEstimate: transferState.transferEstimate,
            transferDestIcao: transferState.transferDestIcao,
            transferDestName: transferState.transferDestName,
            onMovePilotHere: (airport) => { void this.mapController.openPilotTransfer(airport.icao, airport.name); },
            onConfirmPilotTransfer: () => {
              void this.mapController.confirmPilotTransfer().then(() => {
                // Sync currentUserAirport after transfer
                const user = authState.currentUser.get();
                if (user) this.currentUserAirport.set(user.current_airport || "");
              });
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
          ? "position: absolute; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000;"
          : "display: none;")}>
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
