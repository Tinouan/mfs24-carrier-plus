import { NodeReference } from "@microsoft/msfs-sdk";
import { FleetRouter, WorldRouter, TransferRouter } from "../services";
import { popupManager, DatabaseManager } from "../managers";
import { hangarState, navigationState, simVarState, settingsState, transferState, marketState } from "../state";
import { showNotification } from "../state/PopupState";
import { isGameReady } from "../state/GameModeState";
import {
  setSimulatorFuel,
  renderHangarCargoHtml, renderHangarSystemsHtml, renderHangarListHtml,
  type HangarCargoItem, type HangarSystemsData, type HangarAircraftItem,
  type HangarListTranslations, type HangarSystemsTranslations,
} from "../helpers";
import type { AircraftDetails } from "../types";

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface HangarRefs {
  hangarList: NodeReference<HTMLDivElement>;
  hangarFilter: NodeReference<HTMLInputElement>;
  hangarSystemsList: NodeReference<HTMLDivElement>;
  hangarRepairList: NodeReference<HTMLDivElement>;
  hangarCargoList: NodeReference<HTMLDivElement>;
  hangarEditRegInput: NodeReference<HTMLInputElement>;
  refuelPopup: NodeReference<HTMLDivElement>;
  systemsPopup: NodeReference<HTMLDivElement>;
}

interface HangarCallbacks {
  onLoadCurrentAircraftForMission: () => void;
  setupInputEventBlocker: (el: HTMLInputElement) => void;
  extractIcaoType: (atcModel: string) => string;
}

// ═══════════════════════════════════════════════════════════
// CONTROLLER
// ═══════════════════════════════════════════════════════════

export class HangarController {
  // Refs (passed from AeroCorpOnline)
  private hangarListRef: NodeReference<HTMLDivElement>;
  private hangarFilterRef: NodeReference<HTMLInputElement>;
  private hangarSystemsListRef: NodeReference<HTMLDivElement>;
  private hangarRepairListRef: NodeReference<HTMLDivElement>;
  private hangarCargoListRef: NodeReference<HTMLDivElement>;
  private hangarEditRegInputRef: NodeReference<HTMLInputElement>;
  private refuelPopupRef: NodeReference<HTMLDivElement>;
  private systemsPopupRef: NodeReference<HTMLDivElement>;

  // Internal state
  private hangarFilterInitialized = false;

  // Translation
  private t: (section: string, key: string) => string;

  // Callbacks to shared WOA methods
  private callbacks: HangarCallbacks;

  constructor(
    refs: HangarRefs,
    translate: (section: string, key: string) => string,
    callbacks: HangarCallbacks
  ) {
    this.hangarListRef = refs.hangarList;
    this.hangarFilterRef = refs.hangarFilter;
    this.hangarSystemsListRef = refs.hangarSystemsList;
    this.hangarRepairListRef = refs.hangarRepairList;
    this.hangarCargoListRef = refs.hangarCargoList;
    this.hangarEditRegInputRef = refs.hangarEditRegInput;
    this.refuelPopupRef = refs.refuelPopup;
    this.systemsPopupRef = refs.systemsPopup;
    this.t = translate;
    this.callbacks = callbacks;
  }

  // ═══════════════════════════════════════════════════════════
  // HANGAR FETCH METHODS
  // ═══════════════════════════════════════════════════════════

  public async fetchHangarAircraftList(): Promise<void> {
    // P2P mode - always use local database
    hangarState.hangarLoading.set(true);
    try {
      // V2.3: Use fleetService to get ALL aircraft (personal + company)
      const data = await FleetRouter.getFleet();
      console.log("[ACO] Hangar fleet list:", data);
      hangarState.hangarAircraftList.set(Array.isArray(data) ? data : []);
      this.renderHangarList();
    } catch (error) {
      console.error("[ACO] Error fetching hangar aircraft:", error);
      hangarState.hangarAircraftList.set([]);
      this.renderHangarList();
    } finally {
      hangarState.hangarLoading.set(false);
    }
  }

  public async fetchAircraftDetails(aircraftId: string): Promise<void> {
    // P2P mode - always use local database
    hangarState.hangarLoading.set(true);
    try {
      // V1.9: Use FleetRouter.getAircraftDetailsRaw for raw API response
      const apiData = await FleetRouter.getAircraftDetailsRaw(aircraftId);
      console.log("[ACO] Aircraft details from API:", apiData);

      // V1.2: Use API data for fuel (persisted from last flight)
      // SimVars are only for the currently loaded aircraft in the sim
      const fuelGallons = apiData.fuel_gallons || 0;
      const fuelCapacityGallons = apiData.fuel_capacity_gallons || 50;

      // Build aircraft details from API data
      const data: AircraftDetails = {
        id: apiData.id,
        registration: apiData.registration,
        description: apiData.description || null,
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

      console.log("[ACO] Aircraft details merged:", data);

      hangarState.hangarSelectedAircraft.set(data);

      // V1.4: Anti-cheat - If this is the current aircraft in sim, apply DB fuel
      const currentSimReg = simVarState.currentSimAircraftReg.get();
      if (data.registration && currentSimReg &&
          data.registration.toUpperCase() === currentSimReg.toUpperCase()) {
        const simFuelCapacity = SimVar.GetSimVarValue("FUEL TOTAL CAPACITY", "gallons") as number || 0;
        const simFuelCurrent = SimVar.GetSimVarValue("FUEL TOTAL QUANTITY", "gallons") as number || 0;

        // Check for cheat attempt
        if (simFuelCurrent > fuelGallons + 1) {
          console.warn(`[ACO] ANTI-CHEAT Hangar: Sim fuel (${simFuelCurrent.toFixed(1)}) > DB fuel (${fuelGallons.toFixed(1)}). Resetting.`);
        }

        // Always apply DB fuel to simulator
        if (simFuelCapacity > 0) {
          console.log(`[ACO] Hangar: Applying DB fuel to simulator: ${fuelGallons} gal`);
          setSimulatorFuel(fuelGallons, simFuelCapacity);
          // Update DB fuel capacity if simulator reports different value
          if (Math.abs(fuelCapacityGallons - simFuelCapacity) > 1) {
            void FleetRouter.syncFuel(aircraftId, fuelGallons, simFuelCapacity);
          }
        }
      }

      // Re-render list to update selection highlight
      this.renderHangarList();
      // V1.1: Fetch aircraft systems data
      void this.fetchAircraftSystems(aircraftId);
      // V1.4: Fetch aircraft cargo items
      void this.fetchHangarCargo(aircraftId);
    } catch (error) {
      console.error("[ACO] Error fetching aircraft details:", error);
      hangarState.hangarSelectedAircraft.set(null);
    } finally {
      hangarState.hangarLoading.set(false);
    }
  }

  /**
   * V1.1: Fetch aircraft systems condition from API
   */
  public async fetchAircraftSystems(aircraftId: string): Promise<void> {
    if (!isGameReady()) return;

    try {
      // V1.9: Use fleetService for aircraft systems
      const data = await FleetRouter.getAircraftSystems(aircraftId);
      console.log("[ACO] Aircraft systems:", data);
      hangarState.hangarSystems.set(data);
      this.renderHangarSystems();
      this.renderHangarList();
    } catch (error) {
      console.error("[ACO] Error fetching aircraft systems:", error);
      hangarState.hangarSystems.set(null);
    }
  }

  /**
   * V1.4: Fetch aircraft cargo items for hangar display
   */
  private async fetchHangarCargo(aircraftId: string): Promise<void> {
    if (!isGameReady()) return;

    try {
      // V1.9: Use fleetService for aircraft cargo
      const data = await FleetRouter.getAircraftCargo(aircraftId);
      console.log("[ACO] Aircraft cargo:", data);
      hangarState.hangarCargoItems.set(data || []);
      this.renderHangarCargo();
    } catch (error) {
      console.error("[ACO] Error fetching aircraft cargo:", error);
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

  // ═══════════════════════════════════════════════════════════
  // HANGAR ACTION METHODS
  // ═══════════════════════════════════════════════════════════

  /**
   * V1.3: Open refuel popup - V2.5: Delegated to PopupManager
   */
  public openRefuelPopup(): void {
    popupManager.openRefuel();
  }

  /**
   * V1.4: Open systems detail popup - V2.5: Delegated to PopupManager
   */
  public openSystemsPopup(): void {
    popupManager.openSystems();
  }

  /**
   * V1.1: Perform repair - V2.5: Delegated to PopupManager
   */
  public async performRepair(aircraftId: string, systems: string[], payFrom: string): Promise<void> {
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
  public openRepairPopup(): void {
    popupManager.openRepair();
  }

  /**
   * V1.4: Open edit registration popup
   */
  public openEditRegistrationPopup(): void {
    popupManager.openEditRegistration();
  }

  /**
   * V1.4: Auto-update aircraft registration from simulator (silent, no popup)
   * V3.1: Now works in P2P mode (no token required)
   */
  private async autoUpdateAircraftRegistration(aircraftId: string, newReg: string): Promise<void> {
    if (!newReg || newReg.length < 2) return;

    try {
      await FleetRouter.updateRegistration(aircraftId, newReg.toUpperCase());
      console.log("[ACO] Registration auto-synced to:", newReg);
      void this.fetchHangarAircraftList();
    } catch (error) {
      console.error("[ACO] Error auto-syncing registration:", error);
    }
  }

  /**
   * V1.4: Update aircraft registration via API (from popup)
   * V3.1: Now works in P2P mode (no token required)
   */
  public async updateAircraftRegistration(): Promise<void> {
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
   * V1.4: SYNC button - Apply DB fuel to simulator (anti-cheat)
   * This enforces the database state, preventing cheating via MFS fuel panel
   */
  public async syncFuelFromSimulator(): Promise<void> {
    const aircraft = hangarState.hangarSelectedAircraft.get();
    if (!isGameReady() || !aircraft) return;

    // Security check - only sync if this is the active aircraft
    if (!this.isSelectedAircraftActive()) {
      console.warn("[ACO] Cannot sync - selected aircraft is not the active aircraft in MSFS");
      return;
    }

    // Read fuel capacity from simulator
    const simFuelCapacity = SimVar.GetSimVarValue("FUEL TOTAL CAPACITY", "gallons") as number || 0;
    const simFuelCurrent = SimVar.GetSimVarValue("FUEL TOTAL QUANTITY", "gallons") as number || 0;

    if (simFuelCapacity <= 0) {
      console.warn("[ACO] No fuel capacity from SimVar - is an aircraft loaded?");
      return;
    }

    // Get DB fuel value
    const dbFuelGallons = aircraft.fuel_gallons;

    console.log(`[ACO] SYNC: DB fuel=${dbFuelGallons}, Sim fuel=${simFuelCurrent.toFixed(1)}`);

    // Anti-cheat check
    if (simFuelCurrent > dbFuelGallons + 1) {
      console.warn(`[ACO] ANTI-CHEAT: Sim fuel (${simFuelCurrent.toFixed(1)}) > DB fuel (${dbFuelGallons}). Enforcing DB value.`);
    }

    // Apply DB fuel to simulator (source of truth)
    console.log(`[ACO] Enforcing DB fuel to simulator: ${dbFuelGallons} gal`);
    setSimulatorFuel(dbFuelGallons, simFuelCapacity);

    // P2P: Update DB capacity if different (first sync for new aircraft)
    if (Math.abs(aircraft.fuel_capacity_gallons - simFuelCapacity) > 1) {
      try {
        await FleetRouter.syncFuel(aircraft.id, dbFuelGallons, simFuelCapacity);
        console.log("[ACO] Updated fuel capacity in local DB:", simFuelCapacity);
      } catch (error) {
        console.error("[ACO] Error updating fuel capacity:", error);
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
    const aircraft = hangarState.hangarSelectedAircraft.get();
    if (!isGameReady() || !aircraft) return;

    // Security check - only refuel if this is the active aircraft
    if (!this.isSelectedAircraftActive()) {
      console.warn("[ACO] Cannot refuel - selected aircraft is not the active aircraft in MSFS");
      return;
    }

    // Get simulator capacity
    const simFuelCapacity = SimVar.GetSimVarValue("FUEL TOTAL CAPACITY", "gallons") as number || aircraft.fuel_capacity_gallons;
    const targetFuel = simFuelCapacity; // Full tank

    console.log("[ACO] Refueling hangar aircraft to full:", targetFuel, "gal");

    try {
      // Step 1: Write fuel to simulator (all tanks)
      setSimulatorFuel(targetFuel, simFuelCapacity);
      console.log("[ACO] Fuel written to simulator tanks");

      // Step 2: P2P - Sync to local database
      await FleetRouter.syncFuel(aircraft.id, targetFuel, simFuelCapacity);
      console.log("[ACO] Fuel synced to local database");

      // Step 3: Refresh aircraft details
      void this.fetchAircraftDetails(aircraft.id);

    } catch (error) {
      console.error("[ACO] Error refueling:", error);
    }
  }

  /**
   * V1.4: Auto-sync at connection - Apply DB fuel to simulator
   * This restores the saved fuel state when the player connects
   */
  public async autoSyncCurrentAircraft(): Promise<void> {
    if (!isGameReady()) return;

    // Check if database is initialized before proceeding
    if (!DatabaseManager.isInitialized()) {
      console.log("[ACO] Auto-sync skipped: Database not yet initialized");
      return;
    }

    // Read aircraft registration from simulator (ATC ID = registration/tail number)
    const simRegistration = SimVar.GetSimVarValue("ATC ID", "string") as string;
    if (!simRegistration || simRegistration.trim() === "") {
      console.log("[ACO] No aircraft loaded in simulator, skipping auto-sync");
      return;
    }

    // Read current simulator capacity (needed to calculate percentage for setSimulatorFuel)
    const simFuelCapacity = SimVar.GetSimVarValue("FUEL TOTAL CAPACITY", "gallons") as number || 0;
    if (simFuelCapacity <= 0) {
      console.log("[ACO] No fuel capacity from SimVar, skipping auto-sync");
      return;
    }

    console.log(`[ACO] Auto-sync: Looking for aircraft ${simRegistration}`);

    try {
      // Fetch fleet to find matching aircraft by type + airport
      const fleet = await FleetRouter.getFleet();

      // V1.4: Get ICAO type from simulator for better matching
      const rawAtcModel = SimVar.GetSimVarValue("ATC MODEL", "string") as string;
      const simIcaoType = this.callbacks.extractIcaoType(rawAtcModel);
      let currentAirport = simVarState.closestAirport.get() !== "----" ? simVarState.closestAirport.get() : null;

      // V1.6: Wait for airport detection if not yet available (max 5 retries, silent)
      if (!currentAirport) {
        for (let retry = 0; retry < 5 && !currentAirport; retry++) {
          await new Promise(resolve => setTimeout(resolve, 500));
          currentAirport = simVarState.closestAirport.get() !== "----" ? simVarState.closestAirport.get() : null;
        }
      }

      // V4.3: Coordinate fallback if GPS CLOSEST AIRPORT ID fails
      if (!currentAirport) {
        let lat = SimVar.GetSimVarValue("PLANE LATITUDE", "degrees") as number || 0;
        let lon = SimVar.GetSimVarValue("PLANE LONGITUDE", "degrees") as number || 0;
        if (lat === 0 && lon === 0) {
          lat = simVarState.latitude.get();
          lon = simVarState.longitude.get();
        }
        if (lat !== 0 || lon !== 0) {
          const airport = await WorldRouter.getClosestAirport(lat, lon);
          if (airport) {
            currentAirport = airport.ident;
            simVarState.closestAirport.set(currentAirport);
            console.log(`[ACO] Auto-sync: coordinate fallback detected airport ${currentAirport}`);
          }
        }
        if (!currentAirport) {
          return;
        }
      }

      console.log(`[ACO] Auto-sync: Type=${simIcaoType}, Airport=${currentAirport}`);

      // V1.8 SIMPLIFIED: Match by TYPE + AIRPORT only
      // No automatic registration sync - player manages registrations manually in hangar
      let matchingAircraft = null;

      if (simIcaoType && currentAirport) {
        matchingAircraft = fleet.find(
          ac => ac.icao_type?.toUpperCase() === simIcaoType.toUpperCase() &&
                ac.current_airport_ident?.toUpperCase() === currentAirport.toUpperCase()
        );

        if (matchingAircraft) {
          console.log(`[ACO] Found ${simIcaoType} at ${currentAirport}: ${matchingAircraft.registration}`);
        } else {
          // Fallback: match same type with no location (lost aircraft)
          const sameTypeAircraft = fleet.filter(
            ac => ac.icao_type?.toUpperCase() === simIcaoType.toUpperCase()
          );
          const lostAircraft = sameTypeAircraft.find(
            ac => !ac.current_airport_ident || ac.current_airport_ident === "----" || ac.current_airport_ident === "---"
          );
          if (lostAircraft) {
            matchingAircraft = lostAircraft;
            console.log(`[ACO] Found lost ${simIcaoType} (${lostAircraft.registration}@${lostAircraft.current_airport_ident}), assigning to ${currentAirport}`);
          } else if (sameTypeAircraft.length > 0) {
            console.log(`[ACO] No ${simIcaoType} at ${currentAirport}. Available at: ${sameTypeAircraft.map(a => `${a.registration}@${a.current_airport_ident}`).join(", ")}`);
          } else {
            console.log(`[ACO] No ${simIcaoType} in fleet`);
          }
        }
      }

      if (!matchingAircraft) {
        console.log(`[ACO] No aircraft available at ${currentAirport} for type ${simIcaoType}`);
        return;
      }

      console.log(`[ACO] Using aircraft: ${matchingAircraft.registration} (${matchingAircraft.aircraft_type})`);

      // Update aircraft location in DB if different from current airport
      if (matchingAircraft.current_airport_ident?.toUpperCase() !== currentAirport.toUpperCase()) {
        await FleetRouter.updateLocation(matchingAircraft.id, currentAirport);
        console.log(`[ACO] Auto-sync: updated aircraft ${matchingAircraft.registration} location to ${currentAirport}`);
      }

      // FIX: getFleet() returns HangarAircraftItem which does NOT include fuel_gallons.
      // We must fetch full aircraft details to get the actual fuel data from DB.
      const aircraftDetails = await FleetRouter.getAircraftDetails(matchingAircraft.id);
      const dbFuelGallons = Number(aircraftDetails.fuel_gallons) || 0;
      const dbFuelCapacity = Number(aircraftDetails.fuel_capacity_gallons) || simFuelCapacity;
      const simFuelCurrent = SimVar.GetSimVarValue("FUEL TOTAL QUANTITY", "gallons") as number || 0;

      console.log(`[ACO] DB fuel: ${dbFuelGallons}/${dbFuelCapacity} gal, Sim fuel: ${simFuelCurrent} gal`);

      // Anti-cheat check (sim fuel higher than DB fuel)
      if (simFuelCurrent > dbFuelGallons + 1) {
        console.warn(`[ACO] ANTI-CHEAT: Sim fuel (${simFuelCurrent.toFixed(1)}) > DB fuel (${dbFuelGallons.toFixed(1)}). Resetting to DB value.`);
      }

      // Apply DB fuel to simulator (source of truth) — guard: never write 0
      if (simFuelCapacity > 0 && dbFuelGallons > 0) {
        console.log(`[ACO] Applying DB fuel to simulator: ${dbFuelGallons} gal`);
        setSimulatorFuel(dbFuelGallons, simFuelCapacity);
        console.log("[ACO] Fuel enforced from database to simulator");
      } else if (dbFuelGallons <= 0) {
        console.warn(`[ACO] DB fuel is 0 or not set for ${matchingAircraft.registration}, NOT resetting simulator fuel`);
      }

      // P2P: Update DB capacity if simulator has different capacity (first time sync)
      if (Math.abs(dbFuelCapacity - simFuelCapacity) > 1) {
        console.log(`[ACO] Updating fuel capacity in local DB: ${simFuelCapacity} gal`);
        await FleetRouter.syncFuel(matchingAircraft.id, dbFuelGallons > 0 ? dbFuelGallons : simFuelCurrent, simFuelCapacity);
      }

      // V1.5: Also refresh aircraft condition data in UI
      // This ensures displayed condition is up-to-date when returning to app
      const currentTab = navigationState.activeTab.get();
      const hangarSelectedId = hangarState.hangarSelectedAircraft.get()?.id;

      if (currentTab === "hangar" && hangarSelectedId === matchingAircraft.id) {
        // Refresh hangar aircraft details (includes condition, hours, systems)
        console.log("[ACO] Refreshing hangar aircraft details...");
        void this.fetchAircraftDetails(matchingAircraft.id);
      } else if (currentTab === "missions") {
        // Refresh mission aircraft info (includes condition)
        console.log("[ACO] Refreshing mission aircraft info...");
        this.callbacks.onLoadCurrentAircraftForMission();
      }

      console.log("[ACO] Auto-sync completed (fuel + condition)");

    } catch (error) {
      console.error("[ACO] Auto-sync error:", error);
    }
  }

  /**
   * V2.3: Render hangar aircraft list using helper
   */
  public renderHangarList(): void {
    const listEl = this.hangarListRef.getOrDefault();
    if (!listEl) return;

    const aircraft = hangarState.hangarAircraftList.get() as HangarAircraftItem[];
    const selectedId = hangarState.hangarSelectedAircraft.get()?.id;
    const currentSimReg = simVarState.currentSimAircraftReg.get();
    const filterText = hangarState.hangarFilter.get();

    const lang = settingsState.currentLanguage.get();
    const translations: HangarListTranslations = {
      noAircraft: this.t("hangar", "noAircraft"),
      noMatch: "Aucun avion trouvé",
      personalBadge: this.t("hangar", "personalBadge"),
      companyBadge: this.t("hangar", "companyBadge"),
      active: this.t("hangar", "active"),
      forSaleBadge: lang === "fr" ? "EN VENTE" : "FOR SALE",
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

  private initHangarFilterInput(): void {
    if (this.hangarFilterInitialized) return;

    const filterInput = this.hangarFilterRef.getOrDefault();
    if (!filterInput) return;

    this.hangarFilterInitialized = true;

    // Use Coherent API to properly capture keyboard focus from MSFS
    this.callbacks.setupInputEventBlocker(filterInput);

    // Handle input for filtering
    filterInput.addEventListener("input", () => {
      hangarState.hangarFilter.set(filterInput.value);
      this.renderHangarList();
    });
  }

  // ═══════════════════════════════════════════════════════════
  // AIRCRAFT TRANSFER (V7.1 — moved from Map to Hangar)
  // ═══════════════════════════════════════════════════════════

  /**
   * Open aircraft transfer popup for a specific aircraft
   */
  public openAircraftTransferPopup(): void {
    const aircraft = hangarState.hangarSelectedAircraft.get();
    if (!aircraft || aircraft.status !== "parked") return;

    transferState.acTransferAircraftId.set(aircraft.id);
    transferState.acTransferAircraftReg.set(aircraft.registration || aircraft.aircraft_type);
    transferState.acTransferOriginIcao.set(aircraft.current_airport_ident || "");
    transferState.acTransferOwnerType.set(aircraft.owner_type === "player" ? "player" : "company");
    transferState.acTransferDestIcao.set("");
    transferState.acTransferEstimate.set(null);
    transferState.showAircraftTransferPopup.set(true);
  }

  /**
   * Update transfer estimate when ICAO input changes (called on input event)
   */
  public async updateTransferEstimate(destIcao: string): Promise<void> {
    const cleaned = destIcao.toUpperCase().trim();
    transferState.acTransferDestIcao.set(cleaned);

    // Need exactly 4 chars for a valid ICAO
    if (cleaned.length < 3) {
      transferState.acTransferEstimate.set(null);
      return;
    }

    const originIcao = transferState.acTransferOriginIcao.get();
    if (!originIcao || originIcao === cleaned) {
      transferState.acTransferEstimate.set(null);
      return;
    }

    try {
      const estimate = await TransferRouter.estimateAircraftTransfer(originIcao, cleaned);
      // Only update if ICAO hasn't changed since we started the request
      if (transferState.acTransferDestIcao.get() === cleaned) {
        transferState.acTransferEstimate.set(estimate.distance_nm > 0 ? estimate : null);
      }
    } catch (e) {
      transferState.acTransferEstimate.set(null);
    }
  }

  /**
   * Confirm aircraft transfer to the entered ICAO destination
   */
  public async confirmAircraftTransfer(): Promise<void> {
    const aircraftId = transferState.acTransferAircraftId.get();
    const destIcao = transferState.acTransferDestIcao.get();
    const estimate = transferState.acTransferEstimate.get();

    if (!aircraftId || !destIcao || !estimate) return;

    try {
      const result = await TransferRouter.transferAircraft(aircraftId, destIcao);
      if (result.success) {
        // Refresh wallet
        const player = await DatabaseManager.getPlayer();
        if (player) {
          marketState.walletPersonal.set(player.money);
        }

        showNotification(this.t("transfer", "aircraftTransferred") + ` → ${destIcao}`);

        // Close popup and refresh hangar
        this.closeAircraftTransferPopup();
        void this.fetchHangarAircraftList();
        void this.fetchAircraftDetails(aircraftId);
      } else {
        showNotification(result.error || "Transfer failed");
      }
    } catch (e) {
      console.error("[HangarController] confirmAircraftTransfer error:", e);
      showNotification("Transfer error");
    }
  }

  public closeAircraftTransferPopup(): void {
    transferState.showAircraftTransferPopup.set(false);
    transferState.acTransferDestIcao.set("");
    transferState.acTransferEstimate.set(null);
  }

  // ─────────────────────────────────────────────────────────
  // AIRCRAFT NOTE/DESCRIPTION
  // ─────────────────────────────────────────────────────────

  public startEditNote(): void {
    hangarState.hangarNoteEditing.set(true);
  }

  public async saveNote(description: string): Promise<void> {
    const aircraft = hangarState.hangarSelectedAircraft.get();
    if (!aircraft) return;

    try {
      const trimmed = description.trim().substring(0, 50);
      const updated = await FleetRouter.updateDescription(aircraft.id, trimmed);
      hangarState.hangarSelectedAircraft.set(updated);
    } catch (e) {
      console.error("[HangarController] saveNote error:", e);
    }
    hangarState.hangarNoteEditing.set(false);
  }
}
