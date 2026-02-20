/**
 * PopupManager - Centralized popup lifecycle and business logic
 *
 * Handles:
 * - Refuel popup
 * - Systems popup
 * - Repair popup
 * - Edit Registration popup
 * - Cargo popup
 * - Market Buy popup
 *
 * Note: Uses direct state imports like TrackingManager for simplicity.
 * Callbacks are only used for DOM access and UI refresh methods.
 */

import { REFUEL_PRICE_PER_GALLON } from "../constants";
import { FleetRouter, MarketRouter } from "../services";
import {
  authState,
  popupState,
  missionState,
  hangarState,
  cargoState,
  marketState,
  companyState,
} from "../state";
import {
  renderRefuelPopupHtml,
  renderSystemsPopupHtml,
  renderRepairListHtml,
  setSimulatorFuel,
  type RefuelPopupData,
  type SystemsPopupData,
  type RepairItemData,
} from "../helpers";
import type {
  AircraftDetails,
  MissionAircraftInfo,
  CargoPopupItem,
  MarketBuyItem,
} from "../types";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface PopupCallbacks {
  // Translation
  t: (section: string, key: string) => string;

  // DOM refs getters
  getRefuelPopupEl: () => HTMLDivElement | null;
  getSystemsPopupEl: () => HTMLDivElement | null;
  getHangarRepairListEl: () => HTMLDivElement | null;
  getEditRegInputEl: () => HTMLInputElement | null;
  getCargoSliderEl: () => HTMLInputElement | null;
  getCargoQtyEl: () => HTMLSpanElement | null;
  getMarketBuySliderEl: () => HTMLInputElement | null;
  getMarketBuyQtyEl: () => HTMLSpanElement | null;

  // UI refresh callbacks (need access to AeroCorpOnline render methods)
  refreshHangarList: () => void;
  refreshMissionAircraftInfo: () => void;
  refreshAircraftSystems: (aircraftId: string) => Promise<void>;
  refreshAircraftDetails: (aircraftId: string) => Promise<void>;
  refreshCompanyData: () => Promise<void>;
  refreshMarketListings: () => void;
  refreshCargoLists: () => void;
  refreshInventory: () => void;

  // Cargo operations (delegated to AeroCorpOnline for complex logic)
  transferCargo: (direction: "load" | "unload", locationId: string, itemId: string, qty: number) => void;

  // Input capture setup (Coherent GT keyboard handling)
  setupInputCapture: (el: HTMLInputElement) => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// POPUP MANAGER CLASS
// ═══════════════════════════════════════════════════════════════════════════

class PopupManagerClass {
  private callbacks: PopupCallbacks | null = null;
  private refuelPricePerGallon = REFUEL_PRICE_PER_GALLON;
  private cargoSliderHandler: ((e: Event) => void) | null = null;

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  initialize(callbacks: PopupCallbacks): void {
    this.callbacks = callbacks;
    console.log("[PopupManager] Initialized");
  }

  isInitialized(): boolean {
    return this.callbacks !== null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPER: Get current aircraft (from mission or hangar)
  // ═══════════════════════════════════════════════════════════════════════════

  private getCurrentAircraft(): AircraftDetails | MissionAircraftInfo | null {
    return missionState.missionCurrentAircraft.get() || hangarState.hangarSelectedAircraft.get();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REFUEL POPUP
  // ═══════════════════════════════════════════════════════════════════════════

  openRefuel(): void {
    const aircraft = this.getCurrentAircraft();
    if (!aircraft) return;

    popupState.refuelTargetGallons.set(aircraft.fuel_gallons);
    popupState.showRefuelPopup.set(true);

    setTimeout(() => this.renderRefuel(), 10);
  }

  closeRefuel(): void {
    popupState.showRefuelPopup.set(false);
  }

  renderRefuel(): void {
    if (!this.callbacks) return;
    const el = this.callbacks.getRefuelPopupEl();
    if (!el) return;

    const aircraft = this.getCurrentAircraft();
    if (!aircraft) return;

    const maxFuel = aircraft.fuel_capacity_gallons;
    const t = this.callbacks.t;

    const data: RefuelPopupData = {
      registration: aircraft.registration || "N/A",
      aircraftType: aircraft.aircraft_type,
      currentFuel: aircraft.fuel_gallons,
      maxFuel: maxFuel,
      targetFuel: popupState.refuelTargetGallons.get(),
      pricePerGallon: this.refuelPricePerGallon,
      translations: {
        refuelTitle: t("hangar", "refuelTitle"),
        currentLevel: t("hangar", "currentLevel"),
        target: t("hangar", "target"),
        toAdd: t("hangar", "toAdd"),
        total: t("common", "total"),
        cancel: t("common", "cancel"),
        full: t("hangar", "full"),
        confirmRefuel: t("hangar", "confirmRefuel"),
      },
    };

    el.innerHTML = renderRefuelPopupHtml(data);

    // Add event listeners
    el.querySelector(".refuel-overlay")?.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).classList.contains("refuel-overlay")) this.closeRefuel();
    });
    el.querySelector(".refuel-close-btn")?.addEventListener("click", () => this.closeRefuel());
    el.querySelector(".refuel-cancel-btn")?.addEventListener("click", () => this.closeRefuel());
    el.querySelector(".refuel-full-btn")?.addEventListener("click", () => {
      popupState.refuelTargetGallons.set(maxFuel);
      this.renderRefuel();
    });
    el.querySelector(".refuel-confirm-btn")?.addEventListener("click", () => void this.confirmRefuel());
    (el.querySelector(".refuel-slider") as HTMLInputElement)?.addEventListener("input", (e) => {
      popupState.refuelTargetGallons.set(parseFloat((e.target as HTMLInputElement).value));
      this.renderRefuel();
    });
  }

  async confirmRefuel(): Promise<void> {
    if (!this.callbacks) return;

    const aircraft = this.getCurrentAircraft();
    if (!aircraft) return;

    // P2P mode doesn't require token
    if (!authState.isP2PMode.get() && !authState.authToken.get()) return;

    const targetFuel = popupState.refuelTargetGallons.get();
    console.log("[PopupManager] Refueling to:", targetFuel, "gal");

    try {
      // Step 1: Sync to database
      await FleetRouter.syncFuel(aircraft.id, targetFuel, aircraft.fuel_capacity_gallons);
      console.log("[PopupManager] Fuel synced to database");

      // Step 2: Write fuel to simulator
      setSimulatorFuel(targetFuel, aircraft.fuel_capacity_gallons);

      // Step 3: Close popup
      this.closeRefuel();

      // Step 4: Update local states
      const missionAircraft = missionState.missionCurrentAircraft.get();
      if (missionAircraft && missionAircraft.id === aircraft.id) {
        missionState.missionCurrentAircraft.set({
          ...missionAircraft,
          fuel_gallons: targetFuel,
        });
        this.callbacks.refreshMissionAircraftInfo();
      }

      const hangarAircraft = hangarState.hangarSelectedAircraft.get();
      if (hangarAircraft && hangarAircraft.id === aircraft.id) {
        hangarState.hangarSelectedAircraft.set({
          ...hangarAircraft,
          fuel_gallons: targetFuel,
        });
        this.callbacks.refreshHangarList();
      }
    } catch (error) {
      console.error("[PopupManager] Error refueling:", error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SYSTEMS POPUP
  // ═══════════════════════════════════════════════════════════════════════════

  openSystems(): void {
    const aircraft = this.getCurrentAircraft();
    if (!aircraft) return;

    popupState.showSystemsPopup.set(true);
    setTimeout(() => this.renderSystems(), 10);
  }

  closeSystems(): void {
    popupState.showSystemsPopup.set(false);
  }

  renderSystems(): void {
    if (!this.callbacks) return;
    const el = this.callbacks.getSystemsPopupEl();
    if (!el) return;

    const aircraft = this.getCurrentAircraft();
    if (!aircraft || !popupState.showSystemsPopup.get()) {
      el.innerHTML = "";
      return;
    }

    const t = this.callbacks.t;
    const systemsApiData = hangarState.hangarSystems.get();
    const systemLabels: Record<string, string> = {
      "engine": t("hangar", "engine"),
      "landing_gear": t("hangar", "landingGearFull"),
      "tires": t("hangar", "tires"),
      "brakes": t("hangar", "brakes"),
      "propeller": t("hangar", "propellerRotor"),
      "oil": t("hangar", "oil"),
      "flight_surfaces": t("hangar", "flightSurfaces"),
      "electrical": t("hangar", "electrical"),
      "fuel_system": t("hangar", "fuelSystem"),
      "avionics": t("hangar", "avionics"),
    };

    const systemKeys = ["engine", "landing_gear", "tires", "brakes", "propeller", "oil", "flight_surfaces", "electrical", "fuel_system", "avionics"];
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
        systemsStatus: t("hangar", "systemsStatus"),
        flightHoursShort: t("hangar", "flightHoursShort"),
        overallCondition: t("hangar", "overallCondition"),
        good: t("hangar", "good"),
        worn: t("hangar", "worn"),
        critical: t("hangar", "critical"),
        repair: t("hangar", "repair"),
      },
    };

    el.innerHTML = renderSystemsPopupHtml(data);

    // Add event listeners
    el.querySelector(".systems-close-btn")?.addEventListener("click", () => this.closeSystems());
    el.querySelector(".systems-repair-btn")?.addEventListener("click", () => this.openRepairFromSystems());
    el.addEventListener("click", (e) => {
      if (e.target === el.firstElementChild) this.closeSystems();
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REPAIR POPUP
  // ═══════════════════════════════════════════════════════════════════════════

  openRepair(): void {
    const aircraft = hangarState.hangarSelectedAircraft.get();
    if (!aircraft) return;

    void this.fetchRepairQuote(aircraft.id);
    popupState.hangarRepairPopupOpen.set(true);
  }

  closeRepair(): void {
    popupState.hangarRepairPopupOpen.set(false);
  }

  async fetchRepairQuote(aircraftId: string): Promise<void> {
    if (!authState.isP2PMode.get() && !authState.authToken.get()) return;

    try {
      const data = await FleetRouter.getRepairQuote(aircraftId);
      console.log("[PopupManager] Repair quote:", data);
      hangarState.hangarRepairQuote.set(data);
      this.renderRepairList();
    } catch (error) {
      console.error("[PopupManager] Error fetching repair quote:", error);
      hangarState.hangarRepairQuote.set(null);
    }
  }

  renderRepairList(): void {
    if (!this.callbacks) return;
    const listEl = this.callbacks.getHangarRepairListEl();
    if (!listEl) return;

    const t = this.callbacks.t;
    const quote = hangarState.hangarRepairQuote.get();

    if (!quote) {
      listEl.innerHTML = `<div style="text-align: center; padding: 16px; color: #6b7280; font-size: 11px;">${t("hangar", "loadingQuote")}</div>`;
      return;
    }

    const systemNames: Record<string, string> = {
      "engine": t("hangar", "engine"),
      "landing_gear": t("hangar", "landingGear"),
      "tires": t("hangar", "tires"),
      "brakes": t("hangar", "brakes"),
      "propeller": t("hangar", "propeller"),
      "oil": t("hangar", "oil"),
      "flight_surfaces": t("hangar", "flightSurfaces"),
      "electrical": t("hangar", "electrical"),
      "fuel_system": t("hangar", "fuelSystem"),
      "avionics": t("hangar", "avionics"),
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

    listEl.innerHTML = renderRepairListHtml(items, t("hangar", "noRepairNeeded"), t("hangar", "loadingQuote"));
  }

  async confirmRepair(aircraftId: string, systems: string[], payFrom: string): Promise<void> {
    if (!this.callbacks) return;
    if (!authState.isP2PMode.get() && !authState.authToken.get()) return;

    hangarState.hangarLoading.set(true);
    try {
      await FleetRouter.repairAircraft(aircraftId, systems, payFrom as "player" | "company");
      console.log("[PopupManager] Repair completed");
      this.closeRepair();
      await this.callbacks.refreshAircraftSystems(aircraftId);
      if (payFrom === "company") {
        void this.callbacks.refreshCompanyData();
      }
    } catch (error) {
      console.error("[PopupManager] Error performing repair:", error);
      const t = this.callbacks.t;
      alert(`${t("common", "error")}: ${error instanceof Error ? error.message : t("hangar", "repairFailed")}`);
    } finally {
      hangarState.hangarLoading.set(false);
    }
  }

  openRepairFromSystems(): void {
    if (!this.callbacks) return;

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
        system_statuses: missionAircraft.system_statuses || {},
        landing_gear: missionAircraft.landing_gear,
        engine_status: missionAircraft.engine_status,
        propeller_status: missionAircraft.propeller_status,
        electrical_status: missionAircraft.electrical_status,
        avionics_status: missionAircraft.avionics_status,
      };
      hangarState.hangarSelectedAircraft.set(details);
      aircraftId = missionAircraft.id;
    } else if (hangarAircraft) {
      aircraftId = hangarAircraft.id;
    }

    if (!aircraftId) {
      console.warn("[PopupManager] No aircraft found for repair popup");
      return;
    }

    // Close systems popup and open repair popup
    this.closeSystems();
    void this.fetchRepairQuote(aircraftId);
    popupState.hangarRepairPopupOpen.set(true);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EDIT REGISTRATION POPUP
  // ═══════════════════════════════════════════════════════════════════════════

  openEditRegistration(): void {
    if (!this.callbacks) return;

    const aircraft = hangarState.hangarSelectedAircraft.get();
    if (!aircraft) return;

    popupState.hangarEditRegValue.set(aircraft.registration || "");
    popupState.hangarEditRegPopupOpen.set(true);

    setTimeout(() => {
      const input = this.callbacks!.getEditRegInputEl();
      if (input) {
        input.value = aircraft.registration || "";
        input.focus();
        input.select();

        this.callbacks!.setupInputCapture(input);

        input.addEventListener("input", (e: Event) => {
          const value = (e.target as HTMLInputElement).value.toUpperCase();
          (e.target as HTMLInputElement).value = value;
          popupState.hangarEditRegValue.set(value);
        });

        input.addEventListener("keydown", (e: KeyboardEvent) => {
          if (e.key === "Enter") {
            void this.confirmEditRegistration();
          } else if (e.key === "Escape") {
            this.closeEditRegistration();
          }
        });
      }
    }, 100);
  }

  closeEditRegistration(): void {
    popupState.hangarEditRegPopupOpen.set(false);
  }

  async confirmEditRegistration(): Promise<void> {
    if (!this.callbacks) return;

    const aircraft = hangarState.hangarSelectedAircraft.get();
    const newReg = popupState.hangarEditRegValue.get().trim().toUpperCase();

    if (!aircraft || !newReg) return;

    if (newReg.length < 2 || newReg.length > 10) {
      console.error("[PopupManager] Registration must be 2-10 characters");
      return;
    }

    try {
      await FleetRouter.updateRegistration(aircraft.id, newReg);
      console.log("[PopupManager] Registration updated to:", newReg);

      this.closeEditRegistration();
      await this.callbacks.refreshAircraftDetails(aircraft.id);
      this.callbacks.refreshHangarList();
    } catch (error) {
      console.error("[PopupManager] Error updating registration:", error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CARGO POPUP
  // ═══════════════════════════════════════════════════════════════════════════

  openCargo(direction: "load" | "unload", item: CargoPopupItem): void {
    cargoState.cargoPopupDirection.set(direction);
    cargoState.cargoPopupItem.set(item);
    cargoState.cargoPopupQty.set(1);
    cargoState.showCargoPopup.set(true);

    setTimeout(() => this.updateCargoSlider(), 50);
  }

  closeCargo(): void {
    cargoState.showCargoPopup.set(false);
    cargoState.cargoPopupItem.set(null);
  }

  updateCargoSlider(): void {
    if (!this.callbacks) return;

    const slider = this.callbacks.getCargoSliderEl();
    const qtyDisplay = this.callbacks.getCargoQtyEl();
    const item = cargoState.cargoPopupItem.get();

    if (!slider || !item) return;

    const maxQty = item.max_qty;
    const currentQty = cargoState.cargoPopupQty.get();

    slider.min = "1";
    slider.max = String(maxQty);
    slider.value = String(currentQty);

    if (qtyDisplay) {
      const totalWeight = (currentQty * item.weight_kg).toFixed(1);
      qtyDisplay.textContent = `${currentQty} (${totalWeight}kg)`;
    }

    // Remove old listener before adding new one (no cloneNode to preserve ref)
    if (this.cargoSliderHandler) {
      slider.removeEventListener("input", this.cargoSliderHandler);
    }

    this.cargoSliderHandler = (e: Event) => {
      const val = parseInt((e.target as HTMLInputElement).value, 10);
      cargoState.cargoPopupQty.set(val);
      if (qtyDisplay && item) {
        const totalWeight = (val * item.weight_kg).toFixed(1);
        qtyDisplay.textContent = `${val} (${totalWeight}kg)`;
      }
    };

    slider.addEventListener("input", this.cargoSliderHandler);
  }

  async confirmCargo(): Promise<void> {
    if (!this.callbacks) return;

    const item = cargoState.cargoPopupItem.get();
    const qty = cargoState.cargoPopupQty.get();
    const direction = cargoState.cargoPopupDirection.get();

    if (!item || qty < 1) {
      this.closeCargo();
      return;
    }

    this.closeCargo();
    this.callbacks.transferCargo(direction, item.location_id, item.item_id, qty);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MARKET BUY POPUP
  // ═══════════════════════════════════════════════════════════════════════════

  openMarketBuy(item: MarketBuyItem): void {
    marketState.marketBuyItem.set(item);
    marketState.marketBuyQty.set(1);
    marketState.marketBuyTotal.set(item.sale_price);
    marketState.marketBuyWallet.set("company");
    marketState.showMarketBuyPopup.set(true);

    setTimeout(() => this.updateMarketBuySlider(), 50);
  }

  closeMarketBuy(): void {
    marketState.showMarketBuyPopup.set(false);
    marketState.marketBuyItem.set(null);
  }

  updateMarketBuySlider(): void {
    if (!this.callbacks) return;

    const slider = this.callbacks.getMarketBuySliderEl();
    const qtyDisplay = this.callbacks.getMarketBuyQtyEl();
    const item = marketState.marketBuyItem.get();

    if (!slider || !item) return;

    const maxQty = item.sale_qty;
    const currentQty = marketState.marketBuyQty.get();

    slider.max = String(maxQty);
    slider.value = String(currentQty);

    if (qtyDisplay) {
      qtyDisplay.textContent = String(currentQty);
    }

    // Update total
    marketState.marketBuyTotal.set(item.sale_price * currentQty);

    // Remove old listeners and add new one
    const newSlider = slider.cloneNode(true) as HTMLInputElement;
    slider.parentNode?.replaceChild(newSlider, slider);

    newSlider.addEventListener("input", (e) => {
      const val = parseInt((e.target as HTMLInputElement).value, 10);
      const clampedVal = Math.max(1, Math.min(val, item.sale_qty));
      marketState.marketBuyQty.set(clampedVal);
      marketState.marketBuyTotal.set(item.sale_price * clampedVal);
      if (qtyDisplay) qtyDisplay.textContent = String(clampedVal);
    });
  }

  updateMarketBuyQty(qty: number): void {
    const item = marketState.marketBuyItem.get();
    if (!item) return;

    qty = Math.max(1, Math.min(qty, item.sale_qty));
    marketState.marketBuyQty.set(qty);
    marketState.marketBuyTotal.set(item.sale_price * qty);

    const qtyDisplay = this.callbacks?.getMarketBuyQtyEl();
    if (qtyDisplay) {
      qtyDisplay.textContent = qty.toString();
    }
  }

  async confirmMarketBuy(): Promise<void> {
    if (!this.callbacks) return;

    const item = marketState.marketBuyItem.get();
    const isP2P = authState.isP2PMode.get();
    const token = authState.authToken.get();

    if ((!token && !isP2P) || !item) return;

    const qty = marketState.marketBuyQty.get();
    const wallet = marketState.marketBuyWallet.get();
    const totalCost = item.sale_price * qty;
    const t = this.callbacks.t;

    // Check balance
    if (wallet === "player") {
      if (marketState.walletPersonal.get() < totalCost) {
        marketState.marketError.set(t("market", "insufficientPersonalBalance"));
        this.closeMarketBuy();
        return;
      }
    } else {
      const company = companyState.companyData.get();
      if (!company || company.balance < totalCost) {
        marketState.marketError.set(t("market", "insufficientCompanyBalance"));
        this.closeMarketBuy();
        return;
      }
    }

    try {
      await MarketRouter.buyItem(item.location_id, item.item_id, qty, wallet);
      console.log("[PopupManager] Market buy success:", qty, "x", item.item_name);

      this.closeMarketBuy();
      marketState.marketError.set(null);
      this.callbacks.refreshMarketListings();
      this.callbacks.refreshInventory(); // Refresh inventory UI after purchase
    } catch (error) {
      console.error("[PopupManager] Error buying item:", error);
      marketState.marketError.set(
        error instanceof Error ? error.message : t("market", "purchaseFailed")
      );
      this.closeMarketBuy();
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const popupManager = new PopupManagerClass();
