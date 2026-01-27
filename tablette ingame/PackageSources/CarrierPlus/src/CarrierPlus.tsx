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
  TabSelector,
  TVNode,
} from "@efb/efb-api";
import { FSComponent, VNode, Subject, NodeReference } from "@microsoft/msfs-sdk";

// OpenLayers imports
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
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

declare const BASE_URL: string;

// Declare global SimVar API
declare const SimVar: {
  GetSimVarValue(name: string, unit: string): number | boolean | string;
  SetSimVarValue(name: string, unit: string, value: number): void;
};

type TabType = "map" | "profile" | "missions" | "create-mission" | "company" | "market" | "inventory";

// Landing rating thresholds (in fpm, absolute value)
type LandingRating = "excellent" | "good" | "acceptable" | "hard" | null;

// User info type
interface UserInfo {
  id: number;
  username: string;
  email: string;
}

class CarrierPlusView extends AppView<RequiredProps<AppViewProps, "bus">> {
  // Current active tab
  private activeTab = Subject.create<TabType>("map");

  // Hidden state (always false for all tabs)
  private hiddenFalse = Subject.create(false);

  // Authentication state
  private isLoggedIn = Subject.create(false);
  private authToken = Subject.create<string | null>(null);
  private currentUser = Subject.create<UserInfo | null>(null);
  private showLoginPanel = Subject.create(false);
  private showLogoutConfirm = Subject.create(false);
  private loginError = Subject.create<string | null>(null);
  private loginLoading = Subject.create(false);

  // Map sidebar toggle
  private showAirportsSidebar = Subject.create(false);

  // DOM refs for login inputs (onInput doesn't work in Coherent GT)
  private emailInputRef = FSComponent.createRef<HTMLInputElement>();
  private passwordInputRef = FSComponent.createRef<HTMLInputElement>();

  // Flight data (updated from SimVars)
  private latitude = Subject.create(0);
  private longitude = Subject.create(0);
  private altitude = Subject.create(0);
  private groundSpeed = Subject.create(0);
  private verticalSpeed = Subject.create(0);
  private heading = Subject.create(0);
  private onGround = Subject.create(true);
  private gForce = Subject.create(1.0);

  // New SimVars
  private airspeed = Subject.create(0);
  private fuelQuantity = Subject.create(0);
  private touchdownVelocity = Subject.create(0);
  private closestAirport = Subject.create("----");

  // Landing detection
  private wasOnGround = true;
  private lastLandingRate = Subject.create<number | null>(null);
  private landingRating = Subject.create<LandingRating>(null);

  // API Test state
  private apiTestStatus = Subject.create<"idle" | "loading" | "success" | "error">("idle");
  private apiTestResult = Subject.create<string>("");
  private apiTestAirports = Subject.create<Array<{ icao: string; name: string }>>([]);

  // Map tab - nearby airports
  private nearbyAirports: Array<{ icao: string; name: string; distance_nm: number }> = [];
  private nearbyAirportsStatus = Subject.create<"idle" | "loading" | "success" | "error">("idle");
  private nearbyAirportsError = Subject.create<string | null>(null);
  private nearbyAirportsListRef = FSComponent.createRef<HTMLDivElement>();

  // Inventory state
  private inventoryItems: Array<{ id: number; item_type: string; quantity: number; airport_icao: string }> = [];
  private inventoryStatus = Subject.create<"idle" | "loading" | "success" | "error">("idle");
  private inventoryError = Subject.create<string | null>(null);
  private inventoryListRef = FSComponent.createRef<HTMLDivElement>();
  private inventoryType = Subject.create<"player" | "company">("player");

  // OpenLayers map
  private mapContainerRef = FSComponent.createRef<HTMLDivElement>();
  private olMap: Map | null = null;
  private aircraftFeature: Feature<Point> | null = null;
  private aircraftSource: VectorSource<Feature<Point>> | null = null;
  private mapInitialized = false;
  private mapError = Subject.create<string | null>(null);

  // Map layers for airports and factories
  private airportsLayer: VectorLayer<VectorSource<Feature<Point>>> | null = null;
  private airportsSource: VectorSource<Feature<Point>> | null = null;
  private factoriesLayer: VectorLayer<VectorSource<Feature<Point>>> | null = null;
  private factoriesSource: VectorSource<Feature<Point>> | null = null;

  // Map layer visibility toggles
  private showAirportsOnMap = Subject.create(false);
  private showFactoriesOnMap = Subject.create(false);
  private showHelipadsOnMap = Subject.create(false);
  private airportsOnMapStatus = Subject.create<"idle" | "loading" | "success" | "error">("idle");
  private factoriesOnMapStatus = Subject.create<"idle" | "loading" | "success" | "error">("idle");
  private helipadsOnMapStatus = Subject.create<"idle" | "loading" | "success" | "error">("idle");

  // Helipads layer (separate from airports)
  private helipadsLayer: VectorLayer<VectorSource<Feature<Point>>> | null = null;
  private helipadsSource: VectorSource<Feature<Point>> | null = null;

  // Airport context menu state
  private selectedAirport = Subject.create<{
    icao: string;
    name: string;
    type: string;
    lat: number;
    lon: number;
  } | null>(null);
  private myFactoriesAtAirport = Subject.create<Array<{ id: string; name: string }>>([]);
  private availableSlotsAtAirport = Subject.create<number | null>(null);
  private destinationAirport = Subject.create<{ icao: string; name: string } | null>(null);

  // V0.8 Mission state
  private availableAircraftList: Array<{
    id: string;
    registration: string | null;
    aircraft_type: string;
    aircraft_model: string | null;
    cargo_capacity_kg: number;
  }> = [];
  private aircraftListRef = FSComponent.createRef<HTMLDivElement>();
  private selectedAircraftId = Subject.create<string | null>(null);
  private missionStatus = Subject.create<"idle" | "loading" | "creating" | "success" | "error">("idle");
  private missionError = Subject.create<string | null>(null);
  private activeMission = Subject.create<{
    id: string;
    origin_icao: string;
    destination_icao: string;
    aircraft_type: string;
    status: string;
  } | null>(null);
  private missionOriginIcao = Subject.create<string | null>(null);

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
  private aircraftCargoWeight = Subject.create<number>(0);
  private aircraftCargoCapacity = Subject.create<number>(0);
  private airportInventoryRef = FSComponent.createRef<HTMLDivElement>();
  private aircraftCargoRef = FSComponent.createRef<HTMLDivElement>();
  private cargoLoading = Subject.create<boolean>(false);

  // Cargo transfer popup state
  private showCargoPopup = Subject.create<boolean>(false);
  private cargoPopupDirection = Subject.create<"load" | "unload">("load");
  private cargoPopupItem = Subject.create<{
    item_id: string;
    item_name: string;
    max_qty: number;
    weight_kg: number;
    location_id: string;
  } | null>(null);
  private cargoPopupQty = Subject.create<number>(1);
  private cargoPopupSliderRef = FSComponent.createRef<HTMLInputElement>();
  private cargoPopupQtyRef = FSComponent.createRef<HTMLSpanElement>();

  // V0.8 Flight tracking state
  private flightTrackingActive = false;
  private flightTrackingInterval: number | null = null;
  private payloadStartLbs = 0;
  private payloadVerifiedLbs = 0;
  private payloadVerificationDone = false;
  private maxGForce = 1.0;
  private landingFpm = 0;
  private flightStartTime: Date | null = null;

  // V0.8 Mission completion result
  private showMissionRecap = Subject.create<boolean>(false);
  private missionRecapData = Subject.create<{
    origin_icao: string;
    destination_icao: string;
    final_icao: string;
    distance_nm: number;
    score_landing: number;
    score_gforce: number;
    score_destination: number;
    score_time: number;
    score_fuel: number;
    score_total: number;
    grade: string;
    xp_earned: number;
    cheated: boolean;
    cheat_penalty_percent: number;
    landing_fpm: number;
    max_gforce: number;
  } | null>(null);
  private fuelStartPercent = 0;

  // V0.8 Company tab state
  private companyData = Subject.create<{
    id: string;
    name: string;
    home_airport_ident: string;
    balance: number;
    created_at: string;
  } | null>(null);
  private companyMembers = Subject.create<Array<{
    user_id: string;
    username: string;
    email: string;
    role: string;
  }>>([]);
  private companyFleet = Subject.create<Array<{
    id: string;
    registration: string | null;
    aircraft_type: string;
    current_airport_ident: string | null;
    status: string;
  }>>([]);
  private companyLoading = Subject.create<boolean>(false);
  private companyMembersRef = FSComponent.createRef<HTMLDivElement>();
  private companyFleetRef = FSComponent.createRef<HTMLDivElement>();

  // V0.8 Market (HV) state
  private marketListings = Subject.create<Array<{
    location_id: string;
    airport_ident: string;
    company_id: string;
    company_name: string;
    item_id: string;
    item_code: string;
    item_name: string;
    item_tier: number;
    item_icon: string | null;
    sale_price: number;
    sale_qty: number;
  }>>([]);
  private marketLoading = Subject.create<boolean>(false);
  private marketError = Subject.create<string | null>(null);
  private marketTierFilter = Subject.create<number | null>(null);
  private walletPersonal = Subject.create<number>(0);
  private showMarketBuyPopup = Subject.create<boolean>(false);
  private marketBuyItem = Subject.create<{
    location_id: string;
    airport_ident: string;
    company_name: string;
    item_id: string;
    item_code: string;
    item_name: string;
    item_tier: number;
    sale_price: number;
    sale_qty: number;
  } | null>(null);
  private marketBuyQty = Subject.create<number>(1);
  private marketBuyTotal = Subject.create<number>(0);
  private marketBuyWallet = Subject.create<"player" | "company">("company");
  private marketListingsRef = FSComponent.createRef<HTMLDivElement>();
  private marketBuyQtySliderRef = FSComponent.createRef<HTMLInputElement>();
  private marketBuyQtyDisplayRef = FSComponent.createRef<HTMLSpanElement>();

  private updateInterval: number | null = null;

  public onOpen(): void {
    this.startSimVarUpdates();
    this.loadAuthFromStorage();

    // Auto-initialize map when switching to map tab
    this.activeTab.sub((tab) => {
      if (tab === "map" && !this.mapInitialized) {
        // Small delay to ensure DOM is rendered
        setTimeout(() => this.initializeMap(), 100);
      }
      // Auto-refresh aircraft when switching to create-mission tab
      if (tab === "create-mission" && this.isLoggedIn.get()) {
        void this.refreshMissionOrigin();
      }
      // Auto-fetch company data when switching to company tab
      if (tab === "company" && this.isLoggedIn.get()) {
        void this.fetchCompanyData();
      }
      // Auto-fetch market data when switching to market tab
      if (tab === "market" && this.isLoggedIn.get()) {
        void this.fetchMarketData();
      }
    });

  }

  private loadAuthFromStorage(): void {
    try {
      const savedToken = localStorage.getItem("carrierplus_token");
      const savedUser = localStorage.getItem("carrierplus_user");

      if (savedToken && savedUser) {
        const user = JSON.parse(savedUser) as UserInfo;
        this.authToken.set(savedToken);
        this.currentUser.set(user);
        this.isLoggedIn.set(true);
        console.log("[CarrierPlus] Session restored for:", user.username);
      }
    } catch (error) {
      console.error("[CarrierPlus] Failed to restore session:", error);
      this.clearAuthStorage();
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
  }

  public onResume(): void {
    this.startSimVarUpdates();
  }

  public onPause(): void {
    this.stopSimVarUpdates();
  }

  private startSimVarUpdates(): void {
    if (this.updateInterval) return;
    this.updateInterval = window.setInterval(() => this.readSimVars(), 500);
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
        this.latitude.set(SimVar.GetSimVarValue("PLANE LATITUDE", "degrees") as number || 0);
        this.longitude.set(SimVar.GetSimVarValue("PLANE LONGITUDE", "degrees") as number || 0);
        this.altitude.set(SimVar.GetSimVarValue("PLANE ALTITUDE", "feet") as number || 0);
        this.heading.set(SimVar.GetSimVarValue("PLANE HEADING DEGREES TRUE", "degrees") as number || 0);

        // Speeds
        this.groundSpeed.set(SimVar.GetSimVarValue("GROUND VELOCITY", "knots") as number || 0);
        this.airspeed.set(SimVar.GetSimVarValue("AIRSPEED INDICATED", "knots") as number || 0);
        const vs = SimVar.GetSimVarValue("VERTICAL SPEED", "feet per minute") as number || 0;
        this.verticalSpeed.set(vs);

        // Other data
        this.gForce.set(SimVar.GetSimVarValue("G FORCE", "GForce") as number || 1);
        this.fuelQuantity.set(SimVar.GetSimVarValue("FUEL TOTAL QUANTITY", "gallons") as number || 0);
        this.touchdownVelocity.set(SimVar.GetSimVarValue("PLANE TOUCHDOWN NORMAL VELOCITY", "feet per second") as number || 0);

        // Closest airport (might not be available)
        try {
          const airport = SimVar.GetSimVarValue("GPS CLOSEST AIRPORT ID", "string") as string;
          this.closestAirport.set(airport || "----");
        } catch {
          this.closestAirport.set("----");
        }

        // Landing detection
        const currentOnGround = SimVar.GetSimVarValue("SIM ON GROUND", "bool") as boolean;

        // Detect landing: was in air, now on ground
        if (!this.wasOnGround && currentOnGround) {
          // Use the vertical speed just before landing (convert to positive fpm)
          const landingRate = Math.abs(vs);
          this.lastLandingRate.set(landingRate);

          // Determine rating
          if (landingRate < 100) {
            this.landingRating.set("excellent");
          } else if (landingRate < 300) {
            this.landingRating.set("good");
          } else if (landingRate < 600) {
            this.landingRating.set("acceptable");
          } else {
            this.landingRating.set("hard");
          }
        }

        this.wasOnGround = currentOnGround;
        this.onGround.set(currentOnGround);

        // Update map position if map is initialized
        if (this.mapInitialized) {
          this.updateMapPosition();
        }
      }
    } catch (e) {
      // Silent error
    }
  }

  private formatCoord(value: number, isLat: boolean): string {
    const dir = isLat ? (value >= 0 ? "N" : "S") : (value >= 0 ? "E" : "W");
    return `${Math.abs(value).toFixed(4)} ${dir}`;
  }

  private getLandingColor(rating: LandingRating): string {
    switch (rating) {
      case "excellent": return "#22c55e"; // green
      case "good": return "#eab308"; // yellow
      case "acceptable": return "#f97316"; // orange
      case "hard": return "#ef4444"; // red
      default: return "#9ca3af";
    }
  }

  private getLandingText(rating: LandingRating): string {
    switch (rating) {
      case "excellent": return "EXCELLENT";
      case "good": return "BON";
      case "acceptable": return "ACCEPTABLE";
      case "hard": return "DUR";
      default: return "";
    }
  }

  private clearLanding(): void {
    this.lastLandingRate.set(null);
    this.landingRating.set(null);
  }

  private async testApi(): Promise<void> {
    console.log("[CarrierPlus] Starting API test...");
    this.apiTestStatus.set("loading");
    this.apiTestResult.set("Connexion en cours...");
    this.apiTestAirports.set([]);

    try {
      const url = "http://localhost:8000/api/world/airports?limit=3";
      console.log("[CarrierPlus] Fetching:", url);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Accept": "application/json",
        },
      });

      console.log("[CarrierPlus] Response status:", response.status);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log("[CarrierPlus] Response data:", data);

      // Extract airports from response
      const airports = data.airports || data.items || data || [];
      const airportList = Array.isArray(airports) ? airports.slice(0, 3) : [];

      this.apiTestAirports.set(airportList.map((a: { icao?: string; name?: string }) => ({
        icao: a.icao || "????",
        name: a.name || "Unknown",
      })));

      this.apiTestStatus.set("success");
      this.apiTestResult.set("Connexion OK!");
      console.log("[CarrierPlus] API test SUCCESS!");

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("[CarrierPlus] API test FAILED:", errorMsg);

      this.apiTestStatus.set("error");
      this.apiTestResult.set(errorMsg);
      this.apiTestAirports.set([]);
    }
  }

  private toggleLoginPanel(): void {
    this.showLoginPanel.set(!this.showLoginPanel.get());
    // Reset form when opening
    if (this.showLoginPanel.get()) {
      const emailEl = this.emailInputRef.getOrDefault();
      const passwordEl = this.passwordInputRef.getOrDefault();
      if (emailEl) emailEl.value = "";
      if (passwordEl) passwordEl.value = "";
      this.loginError.set(null);
    }
  }

  private async doLogin(): Promise<void> {
    // Read values directly from DOM refs (onInput doesn't work in Coherent GT)
    const emailEl = this.emailInputRef.getOrDefault();
    const passwordEl = this.passwordInputRef.getOrDefault();
    const email = emailEl?.value || "";
    const password = passwordEl?.value || "";

    console.log("[CarrierPlus] Login attempt - email:", email, "password length:", password.length);

    if (!email || !password) {
      this.loginError.set("Email et mot de passe requis");
      return;
    }

    console.log("[CarrierPlus] Attempting login for:", email);
    this.loginLoading.set(true);
    this.loginError.set(null);

    try {
      const response = await fetch("http://localhost:8000/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      console.log("[CarrierPlus] Login response status:", response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log("[CarrierPlus] Login success:", data);

      // Store token and user info
      const token = data.access_token || data.token;
      const user: UserInfo = {
        id: data.user?.id || data.id || 0,
        username: data.user?.username || data.username || email.split("@")[0],
        email: data.user?.email || data.email || email,
      };

      this.authToken.set(token);
      this.currentUser.set(user);
      this.isLoggedIn.set(true);
      this.showLoginPanel.set(false);

      // Save to localStorage for session persistence
      this.saveAuthToStorage(token, user);

      // Clear form
      if (emailEl) emailEl.value = "";
      if (passwordEl) passwordEl.value = "";

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("[CarrierPlus] Login FAILED:", errorMsg);
      this.loginError.set(errorMsg);
    } finally {
      this.loginLoading.set(false);
    }
  }

  private askLogout(): void {
    this.showLogoutConfirm.set(true);
    this.showLoginPanel.set(false);
  }

  private cancelLogout(): void {
    this.showLogoutConfirm.set(false);
  }

  private confirmLogout(): void {
    console.log("[CarrierPlus] Logging out");
    this.authToken.set(null);
    this.currentUser.set(null);
    this.isLoggedIn.set(false);
    this.showLoginPanel.set(false);
    this.showLogoutConfirm.set(false);
    this.clearAuthStorage();
  }

  private toggleAirportsSidebar(): void {
    this.showAirportsSidebar.set(!this.showAirportsSidebar.get());
    // Fetch airports if opening and not already loaded
    if (this.showAirportsSidebar.get() && this.nearbyAirports.length === 0) {
      this.fetchNearbyAirports();
    }
  }

  // Helper to get auth headers for API calls
  private getAuthHeaders(): Record<string, string> {
    const token = this.authToken.get();
    if (token) {
      return {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json",
      };
    }
    return { "Accept": "application/json" };
  }

  private async fetchNearbyAirports(): Promise<void> {
    const lat = this.latitude.get();
    const lon = this.longitude.get();

    if (lat === 0 && lon === 0) {
      this.nearbyAirportsError.set("Position GPS non disponible");
      return;
    }

    console.log("[CarrierPlus] Fetching nearby airports for:", lat, lon);
    this.nearbyAirportsStatus.set("loading");
    this.nearbyAirportsError.set(null);

    try {
      const url = `http://localhost:8000/api/world/airports?lat=${lat}&lon=${lon}&radius=50&limit=10`;
      const response = await fetch(url, {
        method: "GET",
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log("[CarrierPlus] Nearby airports:", data);

      const airports = data.airports || data.items || data || [];
      this.nearbyAirports = airports.map((a: { ident?: string; icao?: string; name?: string; distance_nm?: number }) => ({
        icao: a.ident || a.icao || "????",
        name: a.name || "Unknown",
        distance_nm: a.distance_nm || 0,
      }));

      this.nearbyAirportsStatus.set("success");
      this.renderAirportsList();

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("[CarrierPlus] Nearby airports FAILED:", errorMsg);
      this.nearbyAirportsStatus.set("error");
      this.nearbyAirportsError.set(errorMsg);
    }
  }

  private renderAirportsList(): void {
    const el = this.nearbyAirportsListRef.getOrDefault();
    if (!el) return;

    if (this.nearbyAirports.length === 0) {
      el.innerHTML = `
        <div style="color: #9ca3af; font-size: 10px; text-align: center; padding: 8px;">
          Aucun aeroport
        </div>
      `;
      return;
    }

    // Compact list style for sidebar
    const html = this.nearbyAirports.map(airport => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px solid #374151;">
        <div style="display: flex; flex-direction: column; overflow: hidden;">
          <span style="font-family: monospace; color: #60a5fa; font-weight: 600; font-size: 11px;">${airport.icao}</span>
          <span style="color: #6b7280; font-size: 9px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100px;">${airport.name}</span>
        </div>
        <div style="text-align: right; flex-shrink: 0;">
          <span style="font-family: monospace; color: #f59e0b; font-size: 10px;">${airport.distance_nm.toFixed(1)}</span>
          <span style="color: #6b7280; font-size: 8px;">nm</span>
        </div>
      </div>
    `).join("");

    el.innerHTML = html;
  }

  private renderInventoryList(): void {
    const el = this.inventoryListRef.getOrDefault();
    if (!el) return;

    if (this.inventoryItems.length === 0) {
      el.innerHTML = `
        <div style="color: #9ca3af; font-size: 12px; text-align: center; padding: 16px;">
          Inventaire vide
        </div>
      `;
      return;
    }

    const html = this.inventoryItems.map(item => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #374151;">
        <div style="display: flex; flex-direction: column;">
          <span style="color: white; font-weight: 500; font-size: 13px;">${item.item_type}</span>
          <span style="color: #6b7280; font-size: 10px;">
            Stocke a: <span style="font-family: monospace; color: #60a5fa;">${item.airport_icao}</span>
          </span>
        </div>
        <div style="text-align: right;">
          <span style="font-family: monospace; color: #22c55e; font-size: 16px; font-weight: 600;">${item.quantity}</span>
          <span style="color: #6b7280; font-size: 10px; margin-left: 4px;">unites</span>
        </div>
      </div>
    `).join("");

    el.innerHTML = html;
  }

  private renderAircraftList(): void {
    const el = this.aircraftListRef.getOrDefault();
    if (!el) return;

    if (this.availableAircraftList.length === 0) {
      el.innerHTML = `
        <div style="text-align: center; padding: 12px; color: #f59e0b; font-size: 12px;">
          Aucun avion disponible a cet aeroport
        </div>
      `;
      return;
    }

    const selectedId = this.selectedAircraftId.get();
    const html = this.availableAircraftList.map(ac => {
      const isSelected = selectedId === ac.id;
      const bgStyle = isSelected
        ? "background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6;"
        : "background: #374151; border: 1px solid transparent;";
      const radioStyle = isSelected
        ? "width: 18px; height: 18px; border-radius: 50%; background: #3b82f6; display: flex; align-items: center; justify-content: center;"
        : "width: 18px; height: 18px; border-radius: 50%; border: 2px solid #6b7280;";
      const innerDot = isSelected
        ? `<div style="width: 8px; height: 8px; background: white; border-radius: 50%;"></div>`
        : "";

      return `
        <div class="aircraft-item" data-id="${ac.id}" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; ${bgStyle} border-radius: 6px; cursor: pointer; margin-bottom: 6px;">
          <div>
            <div style="font-weight: 600; color: white; font-size: 13px;">${ac.registration || ac.aircraft_type}</div>
            <div style="font-size: 11px; color: #9ca3af;">${ac.aircraft_model || ac.aircraft_type} - ${ac.cargo_capacity_kg} kg</div>
          </div>
          <div style="${radioStyle}">${innerDot}</div>
        </div>
      `;
    }).join("");

    el.innerHTML = html;

    // Add click handlers
    el.querySelectorAll(".aircraft-item").forEach((item) => {
      item.addEventListener("click", () => {
        const id = item.getAttribute("data-id");
        if (id) {
          this.selectedAircraftId.set(id);
          this.renderAircraftList(); // Re-render to update selection
          // V0.8: Fetch cargo data when aircraft selected
          void this.fetchAircraftCargo(id);
          const origin = this.missionOriginIcao.get();
          if (origin) {
            void this.fetchAirportInventoryForCargo(origin);
          }
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

    try {
      console.log("[CarrierPlus] Initializing OpenLayers map...");

      // Get current position
      const lat = this.latitude.get();
      const lon = this.longitude.get();
      const heading = this.heading.get();

      // Create aircraft marker feature
      this.aircraftFeature = new Feature({
        geometry: new Point(fromLonLat([lon, lat])),
      });

      // Aircraft SVG icon (airplane pointing up/north)
      const aircraftSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24">
        <path fill="#3b82f6" stroke="#ffffff" stroke-width="1" d="M12 2L8 10H4L6 12L4 14H8L12 22L16 14H20L18 12L20 10H16L12 2Z"/>
      </svg>`;
      const aircraftIconUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(aircraftSvg);

      // Set initial aircraft style with rotation
      this.aircraftFeature.setStyle(
        new Style({
          image: new Icon({
            src: aircraftIconUrl,
            scale: 1,
            rotation: (heading * Math.PI) / 180, // Convert degrees to radians
            rotateWithView: false,
          }),
        })
      );

      // Create vector source and layer for aircraft
      this.aircraftSource = new VectorSource({
        features: [this.aircraftFeature],
      });

      const aircraftLayer = new VectorLayer({
        source: this.aircraftSource,
        zIndex: 100,
      });

      // Create airports layer (initially empty, populated when toggled on)
      this.airportsSource = new VectorSource();
      this.airportsLayer = new VectorLayer({
        source: this.airportsSource,
        zIndex: 50,
        visible: false,
      });

      // Create factories layer (initially empty, populated when toggled on)
      this.factoriesSource = new VectorSource();
      this.factoriesLayer = new VectorLayer({
        source: this.factoriesSource,
        zIndex: 60,
        visible: false,
      });

      // Create helipads layer (separate from airports for toggle)
      this.helipadsSource = new VectorSource();
      this.helipadsLayer = new VectorLayer({
        source: this.helipadsSource,
        zIndex: 55,
        visible: false,
      });

      // Create the map with ESRI World Imagery (same as webmap) + CartoDB dark labels
      this.olMap = new Map({
        target: container,
        layers: [
          // ESRI World Imagery - satellite view (shows airport runways)
          new TileLayer({
            source: new XYZ({
              url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
              attributions: "&copy; Esri",
            }),
          }),
          // CartoDB dark labels overlay for place names
          new TileLayer({
            source: new XYZ({
              url: "https://a.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png",
              attributions: "&copy; CARTO",
            }),
          }),
          this.airportsLayer,
          this.helipadsLayer,
          this.factoriesLayer,
          aircraftLayer,
        ],
        view: new View({
          center: fromLonLat([lon || 2.3522, lat || 48.8566]), // Default to Paris if no position
          zoom: 7, // Start more zoomed out to see larger area
          minZoom: 4,
          maxZoom: 16,
        }),
        controls: [], // Remove default controls for cleaner look
        // Disable default interactions - we'll add manual drag for Coherent GT
        interactions: [],
      });

      // Setup manual drag for Coherent GT compatibility
      this.setupManualMapDrag(container);

      // Setup click handler for airport selection
      this.setupMapClickHandler();

      this.mapInitialized = true;
      this.mapError.set(null);
      console.log("[CarrierPlus] Map initialized successfully!");

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("[CarrierPlus] Map initialization FAILED:", errorMsg);
      this.mapError.set(`Erreur carte: ${errorMsg}`);
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
      this.selectedAirport.set(null);
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

    // Check airports layer
    if (this.airportsSource && this.showAirportsOnMap.get()) {
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
    if (this.helipadsSource && this.showHelipadsOnMap.get()) {
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

        this.selectedAirport.set({ icao, name, type, lat, lon });

        // Fetch available slots (public API, no auth needed)
        await this.fetchAvailableSlotsAtAirport(icao);

        // Fetch user's factories at this airport (if logged in)
        if (this.isLoggedIn.get()) {
          await this.fetchMyFactoriesAtAirport(icao);
        } else {
          this.myFactoriesAtAirport.set([]);
        }
        return;
      }
    }

    // Clicked elsewhere - close menu
    console.log("[CarrierPlus] No airport feature found, closing menu");
    this.selectedAirport.set(null);
  }

  // Click handler for airport feature selection (legacy - not used in Coherent GT)
  private setupMapClickHandler(): void {
    // Note: OpenLayers click events don't work in Coherent GT
    // Click handling is done in setupManualMapDrag via handleMapClick
  }

  // Fetch user's factories at a specific airport
  private async fetchMyFactoriesAtAirport(icaoCode: string): Promise<void> {
    // Only fetch if we have a valid token
    const token = this.authToken.get();
    if (!token) {
      this.myFactoriesAtAirport.set([]);
      return;
    }

    try {
      const response = await fetch(
        `http://localhost:8000/api/factories?airport_ident=${icaoCode}`,
        { method: "GET", headers: this.getAuthHeaders() }
      );

      if (response.ok) {
        const data = await response.json();
        const factories = data.factories || data || [];
        console.log(`[CarrierPlus] API response for ${icaoCode}:`, JSON.stringify(factories));
        this.myFactoriesAtAirport.set(
          factories.map((f: { id: string; name: string }) => ({ id: f.id, name: f.name }))
        );
        console.log(`[CarrierPlus] My factories at ${icaoCode}:`, factories.length);
      } else {
        // 401 = not authorized, token might be expired
        if (response.status === 401) {
          console.log("[CarrierPlus] Token expired or invalid, clearing auth");
          this.authToken.set(null);
          this.isLoggedIn.set(false);
          localStorage.removeItem("carrierplus_token");
        }
        this.myFactoriesAtAirport.set([]);
      }
    } catch (error) {
      console.error("[CarrierPlus] Failed to fetch my factories:", error);
      this.myFactoriesAtAirport.set([]);
    }
  }

  // Fetch available factory slots at a specific airport
  private async fetchAvailableSlotsAtAirport(icaoCode: string): Promise<void> {
    console.log(`[CarrierPlus] Fetching available slots for ${icaoCode}...`);
    try {
      const response = await fetch(
        `http://localhost:8000/api/world/airports/${icaoCode}/available-slots`,
        { method: "GET" }
      );

      console.log(`[CarrierPlus] Slots API response status: ${response.status}`);
      if (response.ok) {
        const data = await response.json();
        console.log(`[CarrierPlus] Slots API data:`, JSON.stringify(data));
        this.availableSlotsAtAirport.set(data.available_slots ?? 0);
      } else {
        const errorText = await response.text();
        console.error(`[CarrierPlus] Slots API error: ${errorText}`);
        this.availableSlotsAtAirport.set(null);
      }
    } catch (error) {
      console.error("[CarrierPlus] Failed to fetch available slots:", error);
      this.availableSlotsAtAirport.set(null);
    }
  }

  // Context menu actions
  private openCreateFactory(airport: { icao: string; name: string }): void {
    console.log("[CarrierPlus] TODO: Open create factory form at", airport.icao);
    // TODO: Implement factory creation form
    this.selectedAirport.set(null);
  }

  private openManageFactory(factory: { id: string; name: string }): void {
    console.log("[CarrierPlus] TODO: Open manage factory", factory.id, factory.name);
    // TODO: Implement factory management panel
    this.selectedAirport.set(null);
  }

  private setDestinationAirport(airport: { icao: string; name: string }): void {
    console.log("[CarrierPlus] Destination set:", airport.icao, airport.name);
    this.destinationAirport.set(airport);
    this.selectedAirport.set(null);
    // Switch to mission tab when destination is set
    this.activeTab.set("create-mission");
  }

  // V0.8 Mission Methods

  private async fetchAvailableAircraft(icao: string): Promise<void> {
    const token = this.authToken.get();
    if (!token) {
      console.log("[CarrierPlus] Not logged in, cannot fetch aircraft");
      return;
    }

    console.log("[CarrierPlus] Fetching available aircraft at:", icao);
    this.missionStatus.set("loading");
    this.missionError.set(null);

    try {
      const response = await fetch(`http://localhost:8000/api/fleet/available?icao=${icao}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const aircraft = await response.json();
      console.log("[CarrierPlus] Available aircraft:", aircraft);
      this.availableAircraftList = aircraft;
      this.missionStatus.set("idle");

      // Auto-select first aircraft if any
      if (aircraft.length > 0) {
        this.selectedAircraftId.set(aircraft[0].id);
        // V0.8: Fetch cargo data for auto-selected aircraft
        void this.fetchAircraftCargo(aircraft[0].id);
        void this.fetchAirportInventoryForCargo(icao);
      }

      // Render the list
      this.renderAircraftList();
    } catch (error) {
      console.error("[CarrierPlus] Error fetching aircraft:", error);
      this.missionError.set("Erreur de chargement des avions");
      this.availableAircraftList = [];
      this.renderAircraftList();
      this.missionStatus.set("error");
    }
  }

  private async createMission(): Promise<void> {
    const token = this.authToken.get();
    const origin = this.missionOriginIcao.get();
    const destination = this.destinationAirport.get();
    const aircraftId = this.selectedAircraftId.get();

    if (!token || !origin || !destination || !aircraftId) {
      this.missionError.set("Donnees manquantes pour la mission");
      return;
    }

    // V0.8 Spec: Validate aircraft model matches ATC_MODEL SimVar
    const selectedAircraft = this.availableAircraftList.find(a => a.id === aircraftId);
    if (selectedAircraft && selectedAircraft.aircraft_model) {
      try {
        let atcModel = SimVar.GetSimVarValue("ATC MODEL", "string") as string;
        // MSFS returns format like "$$:PC12" - extract the model code after ":"
        if (atcModel && atcModel.includes(":")) {
          atcModel = atcModel.split(":").pop() || atcModel;
        }
        console.log("[CarrierPlus] ATC_MODEL check:", atcModel, "vs", selectedAircraft.aircraft_model);
        // Case-insensitive comparison
        if (atcModel && atcModel.toUpperCase() !== selectedAircraft.aircraft_model.toUpperCase()) {
          this.missionError.set(`Avion incorrect! Vous pilotez un ${atcModel}, pas un ${selectedAircraft.aircraft_model}`);
          this.missionStatus.set("error");
          return;
        }
      } catch (e) {
        console.log("[CarrierPlus] Could not read ATC MODEL SimVar");
      }
    }

    console.log("[CarrierPlus] Creating mission:", origin, "->", destination.icao);
    this.missionStatus.set("creating");
    this.missionError.set(null);

    try {
      const response = await fetch("http://localhost:8000/api/missions/", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          origin_icao: origin,
          destination_icao: destination.icao,
          aircraft_id: aircraftId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }

      const mission = await response.json();
      console.log("[CarrierPlus] Mission created:", mission);
      this.activeMission.set({
        id: mission.id,
        origin_icao: mission.origin_icao,
        destination_icao: mission.destination_icao,
        aircraft_type: mission.aircraft_type || selectedAircraft?.aircraft_type || "",
        status: mission.status,
      });
      this.missionStatus.set("success");

      // V0.8: Write payload to SimVars and start flight tracking
      this.writePayloadToSimVars();
      this.startFlightTracking();
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : "Erreur creation mission";
      console.error("[CarrierPlus] Error creating mission:", error);
      this.missionError.set(errMsg);
      this.missionStatus.set("error");
    }
  }

  private async refreshMissionOrigin(): Promise<void> {
    // Use API to find closest airport from GPS coordinates
    const lat = this.latitude.get();
    const lon = this.longitude.get();

    if (lat === 0 && lon === 0) {
      console.log("[CarrierPlus] No GPS position available");
      return;
    }

    console.log("[CarrierPlus] Finding closest airport to:", lat, lon);
    this.missionStatus.set("loading");

    try {
      const response = await fetch(`http://localhost:8000/api/world/airports/closest?lat=${lat}&lon=${lon}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const airport = await response.json();
      console.log("[CarrierPlus] Closest airport:", airport.ident, airport.name);

      this.missionOriginIcao.set(airport.ident);
      this.fetchAvailableAircraft(airport.ident);
      // Also check for active mission
      this.fetchActiveMission();
    } catch (error) {
      console.error("[CarrierPlus] Error finding closest airport:", error);
      this.missionError.set("Erreur detection aeroport");
      this.missionStatus.set("error");
    }
  }

  private async fetchActiveMission(): Promise<void> {
    const token = this.authToken.get();
    if (!token) return;

    try {
      const response = await fetch("http://localhost:8000/api/missions/active", {
        headers: { "Authorization": `Bearer ${token}` },
      });

      if (response.status === 404) {
        // No active mission
        this.activeMission.set(null);
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const mission = await response.json();
      console.log("[CarrierPlus] Active mission:", mission);
      this.activeMission.set({
        id: mission.id,
        origin_icao: mission.origin_icao,
        destination_icao: mission.destination_icao,
        aircraft_type: mission.aircraft_type || "Unknown",
        status: mission.status,
      });
    } catch (error) {
      console.error("[CarrierPlus] Error fetching active mission:", error);
    }
  }

  private async cancelMission(): Promise<void> {
    const token = this.authToken.get();
    const mission = this.activeMission.get();
    if (!token || !mission) return;

    console.log("[CarrierPlus] Cancelling mission:", mission.id);
    this.missionStatus.set("loading");

    try {
      const response = await fetch(`http://localhost:8000/api/missions/${mission.id}/fail`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: "cancelled" }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      console.log("[CarrierPlus] Mission cancelled");
      this.activeMission.set(null);
      this.missionStatus.set("idle");
      this.missionError.set(null);
      // Refresh aircraft list
      const origin = this.missionOriginIcao.get();
      if (origin) {
        this.fetchAvailableAircraft(origin);
      }
    } catch (error) {
      console.error("[CarrierPlus] Error cancelling mission:", error);
      this.missionError.set("Erreur annulation mission");
      this.missionStatus.set("error");
    }
  }

  // V0.8 Cargo Management Methods
  private async fetchAirportInventoryForCargo(icao: string): Promise<void> {
    const token = this.authToken.get();
    if (!token) return;

    console.log("[CarrierPlus] Fetching airport inventory for cargo:", icao);
    this.cargoLoading.set(true);

    try {
      const response = await fetch(`http://localhost:8000/api/inventory/airport/${icao.toUpperCase()}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
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
                weight_kg: parseFloat(item.weight_kg) || 0,
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
      this.cargoLoading.set(false);
    }
  }

  private async fetchAircraftCargo(aircraftId: string): Promise<void> {
    const token = this.authToken.get();
    if (!token) return;

    console.log("[CarrierPlus] Fetching aircraft cargo:", aircraftId);

    try {
      const response = await fetch(`http://localhost:8000/api/fleet/${aircraftId}/cargo`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log("[CarrierPlus] Aircraft cargo:", data);

      this.aircraftCargo = (data.items || []).map((item: any) => ({
        item_id: item.item_id,
        item_name: item.item_name,
        qty: item.qty,
        weight_kg: parseFloat(item.weight_kg) || 0,
        total_weight_kg: parseFloat(item.total_weight_kg) || 0,
      }));

      this.aircraftCargoWeight.set(parseFloat(data.current_cargo_kg) || 0);
      this.aircraftCargoCapacity.set(data.cargo_capacity_kg || 0);

      this.renderCargoUI();
    } catch (error) {
      console.error("[CarrierPlus] Error fetching aircraft cargo:", error);
    }
  }

  private async loadCargoItem(fromLocationId: string, itemId: string, qty: number): Promise<void> {
    const token = this.authToken.get();
    const aircraftId = this.selectedAircraftId.get();
    if (!token || !aircraftId) return;

    // Safety check: must be on ground with engines off
    const onGround = SimVar.GetSimVarValue("SIM ON GROUND", "boolean") as boolean;
    const engine1Running = SimVar.GetSimVarValue("ENG COMBUSTION:1", "boolean") as boolean;
    const engine2Running = SimVar.GetSimVarValue("ENG COMBUSTION:2", "boolean") as boolean;

    if (!onGround || engine1Running || engine2Running) {
      this.missionError.set("Chargement impossible: au sol moteurs éteints requis");
      return;
    }

    console.log("[CarrierPlus] Loading cargo:", { fromLocationId, itemId, qty });
    this.cargoLoading.set(true);

    try {
      const response = await fetch(`http://localhost:8000/api/fleet/${aircraftId}/load`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from_location_id: fromLocationId,
          item_id: itemId,
          qty: qty,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        this.missionError.set(error.detail || "Erreur chargement");
        throw new Error(error.detail || `HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log("[CarrierPlus] Cargo loaded:", data);

      // Refresh both inventories
      const origin = this.missionOriginIcao.get();
      if (origin) {
        await this.fetchAirportInventoryForCargo(origin);
      }
      await this.fetchAircraftCargo(aircraftId);
    } catch (error) {
      console.error("[CarrierPlus] Error loading cargo:", error);
    } finally {
      this.cargoLoading.set(false);
    }
  }

  private async unloadCargoItem(toLocationId: string, itemId: string, qty: number): Promise<void> {
    const token = this.authToken.get();
    const aircraftId = this.selectedAircraftId.get();
    if (!token || !aircraftId) return;

    // Safety check: must be on ground with engines off
    const onGround = SimVar.GetSimVarValue("SIM ON GROUND", "boolean") as boolean;
    const engine1Running = SimVar.GetSimVarValue("ENG COMBUSTION:1", "boolean") as boolean;
    const engine2Running = SimVar.GetSimVarValue("ENG COMBUSTION:2", "boolean") as boolean;

    if (!onGround || engine1Running || engine2Running) {
      this.missionError.set("Déchargement impossible: au sol moteurs éteints requis");
      return;
    }

    console.log("[CarrierPlus] Unloading cargo:", { toLocationId, itemId, qty });
    this.cargoLoading.set(true);

    try {
      const response = await fetch(`http://localhost:8000/api/fleet/${aircraftId}/unload`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to_location_id: toLocationId,
          item_id: itemId,
          qty: qty,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        this.missionError.set(error.detail || "Erreur dechargement");
        throw new Error(error.detail || `HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log("[CarrierPlus] Cargo unloaded:", data);

      // Refresh both inventories
      const origin = this.missionOriginIcao.get();
      if (origin) {
        await this.fetchAirportInventoryForCargo(origin);
      }
      await this.fetchAircraftCargo(aircraftId);
    } catch (error) {
      console.error("[CarrierPlus] Error unloading cargo:", error);
    } finally {
      this.cargoLoading.set(false);
    }
  }

  private renderCargoUI(): void {
    // Render airport inventory (left panel)
    const airportEl = this.airportInventoryRef.getOrDefault();
    if (airportEl) {
      if (this.airportInventory.length === 0) {
        airportEl.innerHTML = `<div style="color: #9ca3af; font-size: 11px; text-align: center; padding: 16px;">
          Aucun item disponible
        </div>`;
      } else {
        const html = this.airportInventory.map(item => {
          return `
            <div class="cargo-item" data-id="${item.item_id}" data-loc="${item.location_id}" data-name="${item.item_name}" data-qty="${item.quantity}" data-weight="${item.weight_kg}" style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #1a1a24; border-radius: 6px; margin-bottom: 6px;">
              <div style="flex: 1;">
                <div style="font-size: 12px; color: white; font-weight: 500;">${item.item_name}</div>
                <div style="font-size: 10px; color: #6b7280;">${item.weight_kg}kg • ${item.location_name}</div>
              </div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 13px; color: #22c55e; font-weight: 600;">x${item.quantity}</span>
                <button class="load-btn" data-id="${item.item_id}" data-loc="${item.location_id}" data-name="${item.item_name}" data-qty="${item.quantity}" data-weight="${item.weight_kg}" style="background: #3b82f6; color: white; border: none; border-radius: 4px; padding: 4px 8px; font-size: 10px; cursor: pointer;">
                  →
                </button>
              </div>
            </div>
          `;
        }).join("");
        airportEl.innerHTML = html;

        // Add click handlers for load buttons - open popup
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
    }

    // Render aircraft cargo (right panel)
    const cargoEl = this.aircraftCargoRef.getOrDefault();
    if (cargoEl) {
      if (this.aircraftCargo.length === 0) {
        cargoEl.innerHTML = `<div style="color: #9ca3af; font-size: 11px; text-align: center; padding: 16px;">
          Soute vide
        </div>`;
      } else {
        const html = this.aircraftCargo.map(item => {
          return `
            <div class="cargo-item" data-id="${item.item_id}" data-name="${item.item_name}" data-qty="${item.qty}" data-weight="${item.weight_kg}" style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #1a1a24; border-radius: 6px; margin-bottom: 6px;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <button class="unload-btn" data-id="${item.item_id}" data-name="${item.item_name}" data-qty="${item.qty}" data-weight="${item.weight_kg}" style="background: #f59e0b; color: #1a1a24; border: none; border-radius: 4px; padding: 4px 8px; font-size: 10px; cursor: pointer;">
                  ←
                </button>
                <span style="font-size: 13px; color: #60a5fa; font-weight: 600;">x${item.qty}</span>
              </div>
              <div style="flex: 1; text-align: right;">
                <div style="font-size: 12px; color: white; font-weight: 500;">${item.item_name}</div>
                <div style="font-size: 10px; color: #6b7280;">${item.total_weight_kg}kg total</div>
              </div>
            </div>
          `;
        }).join("");
        cargoEl.innerHTML = html;

        // Add click handlers for unload buttons - open popup
        cargoEl.querySelectorAll(".unload-btn").forEach((btn) => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const itemId = btn.getAttribute("data-id");
            const itemName = btn.getAttribute("data-name");
            const maxQty = parseInt(btn.getAttribute("data-qty") || "1", 10);
            const weight = parseFloat(btn.getAttribute("data-weight") || "0");
            // Use first airport location for unloading
            const firstLoc = this.airportInventory[0]?.location_id || "";
            if (itemId && itemName) {
              this.openCargoPopup("unload", itemId, itemName, maxQty, weight, firstLoc);
            }
          });
        });
      }
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
    // Check if on ground and engines off
    const onGround = SimVar.GetSimVarValue("SIM ON GROUND", "boolean") as boolean;
    const engine1Running = SimVar.GetSimVarValue("ENG COMBUSTION:1", "boolean") as boolean;
    const engine2Running = SimVar.GetSimVarValue("ENG COMBUSTION:2", "boolean") as boolean;

    if (!onGround) {
      this.missionError.set("Impossible de charger en vol");
      return;
    }
    if (engine1Running || engine2Running) {
      this.missionError.set("Coupez les moteurs pour charger");
      return;
    }

    this.cargoPopupDirection.set(direction);
    this.cargoPopupItem.set({
      item_id: itemId,
      item_name: itemName,
      max_qty: maxQty,
      weight_kg: weightKg,
      location_id: locationId,
    });
    this.cargoPopupQty.set(1);
    this.showCargoPopup.set(true);

    // Update slider and display after popup is shown
    setTimeout(() => {
      this.updateCargoPopupSlider();
    }, 50);
  }

  private closeCargoPopup(): void {
    this.showCargoPopup.set(false);
    this.cargoPopupItem.set(null);
  }

  private updateCargoPopupSlider(): void {
    const slider = this.cargoPopupSliderRef.getOrDefault();
    const qtyDisplay = this.cargoPopupQtyRef.getOrDefault();
    const item = this.cargoPopupItem.get();

    if (slider && item) {
      slider.max = String(item.max_qty);
      slider.value = String(this.cargoPopupQty.get());

      slider.oninput = () => {
        const val = parseInt(slider.value, 10);
        this.cargoPopupQty.set(val);
        if (qtyDisplay) {
          const totalWeight = (val * item.weight_kg).toFixed(1);
          qtyDisplay.textContent = `${val} (${totalWeight}kg)`;
        }
      };
    }

    if (qtyDisplay && item) {
      const val = this.cargoPopupQty.get();
      const totalWeight = (val * item.weight_kg).toFixed(1);
      qtyDisplay.textContent = `${val} (${totalWeight}kg)`;
    }
  }

  private async confirmCargoTransfer(): Promise<void> {
    const item = this.cargoPopupItem.get();
    const qty = this.cargoPopupQty.get();
    const direction = this.cargoPopupDirection.get();

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

  private writePayloadToSimVars(): void {
    try {
      // Get cargo weight from aircraft cargo (already loaded)
      const cargoWeightKg = this.aircraftCargoWeight.get();
      const cargoWeightLbs = cargoWeightKg * 2.20462; // Convert kg to lbs

      console.log("[CarrierPlus] Writing payload to SimVars:", cargoWeightKg, "kg =", cargoWeightLbs, "lbs");

      // Get number of payload stations
      const stationCount = SimVar.GetSimVarValue("PAYLOAD STATION COUNT", "number") as number;
      console.log("[CarrierPlus] Payload stations:", stationCount);

      if (stationCount > 0) {
        // Distribute cargo weight across available stations (simplified: use station 1 or 2 for cargo)
        // Station 1 is usually pilot, station 2+ are passengers/cargo
        const cargoStation = stationCount >= 2 ? 2 : 1;

        // Write cargo weight to the station
        SimVar.SetSimVarValue(`PAYLOAD STATION WEIGHT:${cargoStation}`, "pounds", cargoWeightLbs);
        console.log("[CarrierPlus] Set PAYLOAD STATION WEIGHT:", cargoStation, "=", cargoWeightLbs, "lbs");
      }

      // Record total payload at start
      this.payloadStartLbs = this.getTotalPayload();
      console.log("[CarrierPlus] Payload at start:", this.payloadStartLbs, "lbs");

      // Record fuel at start
      const fuelCapacity = SimVar.GetSimVarValue("FUEL TOTAL CAPACITY", "gallons") as number;
      const fuelQuantity = SimVar.GetSimVarValue("FUEL TOTAL QUANTITY", "gallons") as number;
      this.fuelStartPercent = fuelCapacity > 0 ? (fuelQuantity / fuelCapacity) * 100 : 100;
      console.log("[CarrierPlus] Fuel at start:", this.fuelStartPercent.toFixed(1), "%");

    } catch (error) {
      console.error("[CarrierPlus] Error writing payload to SimVars:", error);
    }
  }

  private getTotalPayload(): number {
    try {
      const stationCount = SimVar.GetSimVarValue("PAYLOAD STATION COUNT", "number") as number;
      let totalPayload = 0;

      for (let i = 1; i <= stationCount; i++) {
        const stationWeight = SimVar.GetSimVarValue(`PAYLOAD STATION WEIGHT:${i}`, "pounds") as number;
        totalPayload += stationWeight || 0;
      }

      return totalPayload;
    } catch (error) {
      console.error("[CarrierPlus] Error reading payload:", error);
      return 0;
    }
  }

  private startFlightTracking(): void {
    if (this.flightTrackingActive) return;

    console.log("[CarrierPlus] Starting flight tracking");
    this.flightTrackingActive = true;
    this.payloadVerificationDone = false;
    this.maxGForce = 1.0;
    this.landingFpm = 0;
    this.flightStartTime = new Date();

    // Poll every 2 seconds
    this.flightTrackingInterval = window.setInterval(() => {
      this.trackFlight();
    }, 2000);
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

  private trackFlight(): void {
    if (!this.flightTrackingActive) return;

    try {
      // Track max G-force
      const currentG = SimVar.GetSimVarValue("G FORCE", "GForce") as number;
      if (currentG > this.maxGForce) {
        this.maxGForce = currentG;
        console.log("[CarrierPlus] New max G-force:", this.maxGForce.toFixed(2));
      }

      // Check if on ground
      const onGround = SimVar.GetSimVarValue("SIM ON GROUND", "boolean") as boolean;
      const vs = SimVar.GetSimVarValue("VERTICAL SPEED", "feet per minute") as number;
      const radioAlt = SimVar.GetSimVarValue("RADIO HEIGHT", "feet") as number;

      // Payload verification at 500ft before landing (only once)
      if (!this.payloadVerificationDone && radioAlt < 500 && !onGround && vs < 0) {
        this.payloadVerifiedLbs = this.getTotalPayload();
        this.payloadVerificationDone = true;
        console.log("[CarrierPlus] Payload verified at 500ft:", this.payloadVerifiedLbs, "lbs");
      }

      // Detect landing
      if (onGround && this.onGround.get() === false) {
        // Just landed!
        this.landingFpm = Math.round(vs);
        console.log("[CarrierPlus] LANDING DETECTED! FPM:", this.landingFpm);

        // Complete the mission
        void this.completeMission();
      }

    } catch (error) {
      console.error("[CarrierPlus] Error in flight tracking:", error);
    }
  }

  private async completeMission(): Promise<void> {
    this.stopFlightTracking();

    const token = this.authToken.get();
    const mission = this.activeMission.get();
    if (!token || !mission) return;

    console.log("[CarrierPlus] Completing mission:", mission.id);

    try {
      // Calculate flight time
      const flightTimeMinutes = this.flightStartTime
        ? Math.round((Date.now() - this.flightStartTime.getTime()) / 60000)
        : 0;

      // Get current fuel percentage
      const fuelCapacity = SimVar.GetSimVarValue("FUEL TOTAL CAPACITY", "gallons") as number;
      const fuelQuantity = SimVar.GetSimVarValue("FUEL TOTAL QUANTITY", "gallons") as number;
      const fuelCurrentPercent = fuelCapacity > 0 ? (fuelQuantity / fuelCapacity) * 100 : 100;
      const fuelUsedPercent = Math.max(0, this.fuelStartPercent - fuelCurrentPercent);

      // Get closest airport (final ICAO)
      const lat = this.latitude.get();
      const lon = this.longitude.get();
      let finalIcao = mission.destination_icao;

      try {
        const closestResponse = await fetch(`http://localhost:8000/api/world/airports/closest?lat=${lat}&lon=${lon}`);
        if (closestResponse.ok) {
          const closestAirport = await closestResponse.json();
          finalIcao = closestAirport.ident;
        }
      } catch (e) {
        console.log("[CarrierPlus] Could not get closest airport");
      }

      // Detect cheating
      const cheated = this.payloadVerificationDone &&
        this.payloadStartLbs > 0 &&
        Math.abs(this.payloadVerifiedLbs - this.payloadStartLbs) / this.payloadStartLbs > 0.05;

      console.log("[CarrierPlus] Mission complete data:", {
        landing_fpm: this.landingFpm,
        max_gforce: this.maxGForce,
        final_icao: finalIcao,
        flight_time_minutes: flightTimeMinutes,
        fuel_used_percent: fuelUsedPercent,
        payload_start_lbs: this.payloadStartLbs,
        payload_verified_lbs: this.payloadVerifiedLbs,
        cheated,
      });

      const response = await fetch(`http://localhost:8000/api/missions/${mission.id}/complete`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          landing_fpm: this.landingFpm,
          max_gforce: this.maxGForce,
          final_icao: finalIcao,
          flight_time_minutes: flightTimeMinutes,
          fuel_used_percent: fuelUsedPercent,
          payload_start_lbs: this.payloadStartLbs,
          payload_verified_lbs: this.payloadVerifiedLbs,
          cheated,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || `HTTP ${response.status}`);
      }

      const result = await response.json();
      console.log("[CarrierPlus] Mission completed:", result);

      // Update active mission status
      this.activeMission.set(null);

      // Show mission recap screen with scoring
      this.missionRecapData.set({
        origin_icao: result.origin_icao,
        destination_icao: result.destination_icao,
        final_icao: result.final_icao || result.destination_icao,
        distance_nm: result.distance_nm || 0,
        score_landing: result.score_landing || 0,
        score_gforce: result.score_gforce || 0,
        score_destination: result.score_destination || 0,
        score_time: result.score_time || 0,
        score_fuel: result.score_fuel || 0,
        score_total: result.score_total || 0,
        grade: result.grade || "F",
        xp_earned: result.xp_earned || 0,
        cheated: result.cheated || false,
        cheat_penalty_percent: result.cheat_penalty_percent || 0,
        landing_fpm: result.landing_fpm || 0,
        max_gforce: result.max_gforce || 0,
      });
      this.showMissionRecap.set(true);
      this.missionStatus.set("idle");
      this.missionError.set(null);

    } catch (error) {
      console.error("[CarrierPlus] Error completing mission:", error);
      this.missionError.set("Erreur lors de la completion de la mission");
    }
  }

  private updateMapPosition(): void {
    if (!this.olMap || !this.aircraftFeature) return;

    const lat = this.latitude.get();
    const lon = this.longitude.get();
    const heading = this.heading.get();

    if (lat === 0 && lon === 0) return;

    try {
      // Update aircraft position
      const coords = fromLonLat([lon, lat]);
      this.aircraftFeature.getGeometry()?.setCoordinates(coords);

      // Update aircraft rotation based on heading
      const aircraftSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24">
        <path fill="#3b82f6" stroke="#ffffff" stroke-width="1" d="M12 2L8 10H4L6 12L4 14H8L12 22L16 14H20L18 12L20 10H16L12 2Z"/>
      </svg>`;
      const aircraftIconUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(aircraftSvg);

      this.aircraftFeature.setStyle(
        new Style({
          image: new Icon({
            src: aircraftIconUrl,
            scale: 1,
            rotation: (heading * Math.PI) / 180,
            rotateWithView: false,
          }),
        })
      );

      // Optionally center the map on the aircraft (can be toggled)
      // this.olMap.getView().setCenter(coords);
    } catch (error) {
      console.error("[CarrierPlus] Error updating map position:", error);
    }
  }

  private centerMapOnAircraft(): void {
    if (!this.olMap) return;

    const lat = this.latitude.get();
    const lon = this.longitude.get();

    if (lat === 0 && lon === 0) return;

    this.olMap.getView().animate({
      center: fromLonLat([lon, lat]),
      duration: 500,
    });
  }

  private toggleAirportsOnMap(): void {
    const newState = !this.showAirportsOnMap.get();
    this.showAirportsOnMap.set(newState);

    if (this.airportsLayer) {
      this.airportsLayer.setVisible(newState);
    }

    // Fetch airports when toggling on
    if (newState) {
      this.fetchAirportsForMap();
    }
  }

  private async fetchAirportsForMap(): Promise<void> {
    if (!this.olMap || !this.airportsSource) return;

    const lat = this.latitude.get();
    const lon = this.longitude.get();

    if (lat === 0 && lon === 0) return;

    this.airportsOnMapStatus.set("loading");

    // Calculate bounding box - large area (~500nm radius = ~8 degrees, covers most of France)
    const delta = 8;
    const minLat = lat - delta;
    const maxLat = lat + delta;
    const minLon = lon - delta;
    const maxLon = lon + delta;

    try {
      const response = await fetch(
        `http://localhost:8000/api/world/airports?min_lat=${minLat}&max_lat=${maxLat}&min_lon=${minLon}&max_lon=${maxLon}&limit=2000`,
        { method: "GET", headers: { "Accept": "application/json" } }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const airports = data.airports || data || [];

      // Count airport types for debugging
      const typeCounts: Record<string, number> = {};
      airports.forEach((a: { type?: string }) => {
        const t = a.type || "unknown";
        typeCounts[t] = (typeCounts[t] || 0) + 1;
      });
      console.log(`[CarrierPlus] Fetched ${airports.length} airports:`, typeCounts);

      // Clear existing features
      this.airportsSource.clear();

      // Add airport markers
      airports.forEach((airport: { ident?: string; icao?: string; latitude_deg?: number; longitude_deg?: number; lat?: number; lon?: number; type?: string; name?: string }) => {
        const airportLat = airport.latitude_deg || airport.lat || 0;
        const airportLon = airport.longitude_deg || airport.lon || 0;
        const airportIcao = airport.ident || airport.icao || "????";
        const airportType = airport.type || "small_airport";

        if (airportLat === 0 && airportLon === 0) return;

        const feature = new Feature({
          geometry: new Point(fromLonLat([airportLon, airportLat])),
        });

        // Airport type colors (more visible) - all types shown
        const airportColors: Record<string, string> = {
          "large_airport": "#FF5722",   // Orange-rouge vif
          "medium_airport": "#FFC107",  // Jaune-or
          "small_airport": "#FFFFFF",   // Blanc
          "heliport": "#2196F3",        // Bleu
          "seaplane_base": "#00BCD4",   // Cyan
          "closed": "#9E9E9E",          // Gris
        };
        const color = airportColors[airportType] || "#FFFFFF";

        // Size based on type (larger for better visibility)
        const airportSizes: Record<string, number> = {
          "large_airport": 12,
          "medium_airport": 9,
          "small_airport": 6,
          "heliport": 7,
          "seaplane_base": 7,
          "closed": 5,
        };
        const size = airportSizes[airportType] || 6;

        // Create SVG for airport marker - all visible, no opacity tricks
        const airportSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
          <circle cx="14" cy="14" r="${size}" fill="${color}" stroke="#1a1a24" stroke-width="2"/>
        </svg>`;
        const airportIconUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(airportSvg);

        feature.setStyle(
          new Style({
            image: new Icon({
              src: airportIconUrl,
              scale: 1,
            }),
          })
        );

        // Store airport info for potential popup
        feature.set("icao", airportIcao);
        feature.set("name", airport.name || "");
        feature.set("type", airportType);

        this.airportsSource?.addFeature(feature);
      });

      this.airportsOnMapStatus.set("success");

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("[CarrierPlus] Fetch airports for map FAILED:", errorMsg);
      this.airportsOnMapStatus.set("error");
    }
  }

  private toggleFactoriesOnMap(): void {
    const newState = !this.showFactoriesOnMap.get();
    this.showFactoriesOnMap.set(newState);

    if (this.factoriesLayer) {
      this.factoriesLayer.setVisible(newState);
    }

    // Fetch factories when toggling on
    if (newState) {
      this.fetchFactoriesForMap();
    }
  }

  // Convert emoji to simple SVG shape for Coherent GT compatibility
  private getFactoryShapeSvg(emoji: string, bgColor: string): string {
    // Map emojis to simple geometric shapes that render in Coherent GT
    const shapeMap: Record<string, string> = {
      // Food/Agriculture
      "🌾": `<path d="M18 8 L18 20 M14 12 L18 16 L22 12" stroke="#ffffff" stroke-width="2.5" fill="none"/>`, // Wheat
      "🫒": `<ellipse cx="18" cy="18" rx="6" ry="8" fill="#ffffff"/>`, // Olive
      "🍇": `<circle cx="15" cy="14" r="4" fill="#ffffff"/><circle cx="21" cy="14" r="4" fill="#ffffff"/><circle cx="18" cy="20" r="4" fill="#ffffff"/>`, // Grapes
      "🧀": `<path d="M8 24 L18 8 L28 24 Z" fill="#ffffff"/>`, // Cheese triangle
      "🍫": `<rect x="11" y="12" width="14" height="12" rx="2" fill="#ffffff"/>`, // Chocolate bar
      "🥫": `<rect x="12" y="10" width="12" height="16" rx="3" fill="#ffffff"/>`, // Can

      // Minerals/Mining
      "⛏️": `<path d="M12 24 L24 12 M10 14 L20 14 L20 10" stroke="#ffffff" stroke-width="2.5" fill="none"/>`, // Pickaxe
      "🪨": `<polygon points="18,10 26,18 22,26 14,26 10,18" fill="#ffffff"/>`, // Rock
      "💎": `<polygon points="18,10 26,18 18,26 10,18" fill="#ffffff"/>`, // Diamond

      // Wood/Construction
      "🪵": `<rect x="10" y="14" width="16" height="8" rx="2" fill="#ffffff"/>`, // Log
      "🧱": `<rect x="10" y="12" width="7" height="5" fill="#ffffff"/><rect x="19" y="12" width="7" height="5" fill="#ffffff"/><rect x="14" y="19" width="8" height="5" fill="#ffffff"/>`, // Bricks

      // Industrial
      "🛢️": `<rect x="12" y="10" width="12" height="16" rx="2" fill="#ffffff"/>`, // Barrel
      "⚙️": `<circle cx="18" cy="18" r="6" stroke="#ffffff" stroke-width="2.5" fill="none"/><circle cx="18" cy="18" r="2" fill="#ffffff"/>`, // Gear

      // Default factory
      "🏭": `<path d="M10 26 L10 16 L14 12 L14 16 L18 12 L18 16 L22 12 L22 26 Z" fill="#ffffff"/>`, // Factory
      "📦": `<rect x="11" y="11" width="14" height="14" rx="1" fill="#ffffff"/>`, // Box
    };

    const shape = shapeMap[emoji] || shapeMap["📦"]; // Default to box

    // Larger icons (48x48) for better visibility when zoomed out
    return `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 36 36">
      <circle cx="18" cy="18" r="16" fill="${bgColor}" stroke="#ffffff" stroke-width="2"/>
      ${shape}
    </svg>`;
  }

  private async fetchFactoriesForMap(): Promise<void> {
    if (!this.olMap || !this.factoriesSource) return;

    const lat = this.latitude.get();
    const lon = this.longitude.get();

    this.factoriesOnMapStatus.set("loading");

    // Calculate bounding box - large area (~500nm radius = ~8 degrees, covers most of France)
    const delta = 8;
    const minLat = lat - delta;
    const maxLat = lat + delta;
    const minLon = lon - delta;
    const maxLon = lon + delta;

    try {
      // Use /api/world/factories which returns factories with airport coordinates
      const response = await fetch(
        `http://localhost:8000/api/world/factories?min_lat=${minLat}&max_lat=${maxLat}&min_lon=${minLon}&max_lon=${maxLon}&limit=500`,
        { method: "GET", headers: { "Accept": "application/json" } }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const factories = data || [];

      console.log(`[CarrierPlus] Fetched ${factories.length} factories for map`);

      // Clear existing features
      this.factoriesSource.clear();

      // Add factory markers
      factories.forEach((factory: { id?: string; name?: string; tier?: number; latitude?: number; longitude?: number; airport_ident?: string; company_name?: string; icon?: string; product_name?: string }) => {
        const factoryLat = factory.latitude || 0;
        const factoryLon = factory.longitude || 0;

        if (factoryLat === 0 && factoryLon === 0) return;

        const feature = new Feature({
          geometry: new Point(fromLonLat([factoryLon, factoryLat])),
        });

        // Color based on tier
        const tier = factory.tier || 0;
        const tierColors: Record<number, string> = {
          0: "#607D8B",  // Gris-bleu - T0 NPC
          1: "#4CAF50",  // Vert
          2: "#8BC34A",
          3: "#CDDC39",
          4: "#FFEB3B",
          5: "#FFC107",
          6: "#FF9800",
          7: "#FF5722",
          8: "#F44336",
          9: "#E91E63",
          10: "#9C27B0",
        };
        const bgColor = tierColors[tier] || "#607D8B";

        // Get icon from API or default
        const emoji = factory.icon || "🏭";

        // Create SVG with geometric shape (Coherent GT compatible)
        const factorySvg = this.getFactoryShapeSvg(emoji, bgColor);
        const factoryIconUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(factorySvg);

        feature.setStyle(
          new Style({
            image: new Icon({
              src: factoryIconUrl,
              scale: 1.2, // Larger scale for factories to stay visible when zoomed out
            }),
          })
        );

        // Store factory info for potential popup
        feature.set("id", factory.id);
        feature.set("name", factory.name || "");
        feature.set("tier", tier);
        feature.set("airport", factory.airport_ident || "");
        feature.set("owner", factory.company_name || "");
        feature.set("icon", emoji);
        feature.set("product", factory.product_name || "");

        this.factoriesSource?.addFeature(feature);
      });

      this.factoriesOnMapStatus.set("success");

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("[CarrierPlus] Fetch factories for map FAILED:", errorMsg);
      this.factoriesOnMapStatus.set("error");
    }
  }

  private toggleHelipadsOnMap(): void {
    const newState = !this.showHelipadsOnMap.get();
    this.showHelipadsOnMap.set(newState);

    if (this.helipadsLayer) {
      this.helipadsLayer.setVisible(newState);
    }

    // Fetch helipads when toggling on
    if (newState) {
      this.fetchHelipadsForMap();
    }
  }

  private async fetchHelipadsForMap(): Promise<void> {
    if (!this.olMap || !this.helipadsSource) return;

    const lat = this.latitude.get();
    const lon = this.longitude.get();

    if (lat === 0 && lon === 0) return;

    this.helipadsOnMapStatus.set("loading");

    // Calculate bounding box - large area (~500nm radius = ~8 degrees)
    const delta = 8;
    const minLat = lat - delta;
    const maxLat = lat + delta;
    const minLon = lon - delta;
    const maxLon = lon + delta;

    try {
      // Fetch only heliports and seaplane bases (separate query with type filter)
      const response = await fetch(
        `http://localhost:8000/api/world/airports?min_lat=${minLat}&max_lat=${maxLat}&min_lon=${minLon}&max_lon=${maxLon}&type=heliport&limit=500`,
        { method: "GET", headers: { "Accept": "application/json" } }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const helipads = data.airports || data || [];

      console.log(`[CarrierPlus] Fetched ${helipads.length} helipads for map`);

      // Clear existing features
      this.helipadsSource.clear();

      // Add helipad markers
      helipads.forEach((helipad: { ident?: string; icao?: string; latitude_deg?: number; longitude_deg?: number; lat?: number; lon?: number; type?: string; name?: string }) => {
        const heliLat = helipad.latitude_deg || helipad.lat || 0;
        const heliLon = helipad.longitude_deg || helipad.lon || 0;
        const heliIcao = helipad.ident || helipad.icao || "????";
        const heliType = helipad.type || "heliport";

        if (heliLat === 0 && heliLon === 0) return;

        const feature = new Feature({
          geometry: new Point(fromLonLat([heliLon, heliLat])),
        });

        // Heliport colors
        const color = heliType === "seaplane_base" ? "#00BCD4" : "#2196F3"; // Cyan for seaplane, Blue for heliport
        const size = 7;

        // Create SVG for helipad marker (H icon)
        const heliSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
          <circle cx="14" cy="14" r="${size}" fill="${color}" stroke="#1a1a24" stroke-width="2"/>
          <text x="14" y="18" text-anchor="middle" font-size="10" font-weight="bold" fill="#1a1a24">H</text>
        </svg>`;
        const heliIconUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(heliSvg);

        feature.setStyle(
          new Style({
            image: new Icon({
              src: heliIconUrl,
              scale: 1,
            }),
          })
        );

        // Store helipad info
        feature.set("icao", heliIcao);
        feature.set("name", helipad.name || "");
        feature.set("type", heliType);

        this.helipadsSource?.addFeature(feature);
      });

      this.helipadsOnMapStatus.set("success");

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("[CarrierPlus] Fetch helipads for map FAILED:", errorMsg);
      this.helipadsOnMapStatus.set("error");
    }
  }

  private async fetchInventory(type: "player" | "company"): Promise<void> {
    if (!this.isLoggedIn.get()) {
      this.inventoryError.set("Connexion requise pour voir l'inventaire");
      return;
    }

    this.inventoryType.set(type);
    console.log(`[CarrierPlus] Fetching ${type} inventory...`);
    this.inventoryStatus.set("loading");
    this.inventoryError.set(null);

    try {
      const endpoint = type === "player"
        ? "http://localhost:8000/api/inventory/player"
        : "http://localhost:8000/api/inventory/company";

      const response = await fetch(endpoint, {
        method: "GET",
        headers: this.getAuthHeaders(),
      });

      if (response.status === 401) {
        this.inventoryError.set("Session expiree, reconnectez-vous");
        this.confirmLogout();
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log(`[CarrierPlus] ${type} Inventory:`, data);

      const items = data.items || data.inventory || data || [];
      this.inventoryItems = items.map((item: { item_id?: string; item_name?: string; qty?: number; airport_ident?: string }) => ({
        id: 0,
        item_type: item.item_name || "unknown",
        quantity: item.qty || 0,
        airport_icao: item.airport_ident || "----",
      }));

      this.inventoryStatus.set("success");
      this.renderInventoryList();

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[CarrierPlus] ${type} Inventory FAILED:`, errorMsg);
      this.inventoryStatus.set("error");
      this.inventoryError.set(errorMsg);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // COMPANY DATA
  // ═══════════════════════════════════════════════════════════

  private async fetchCompanyData(): Promise<void> {
    const token = this.authToken.get();
    if (!token) return;

    this.companyLoading.set(true);

    try {
      // Fetch company info
      const companyResponse = await fetch("http://localhost:8000/api/company/me", {
        headers: { "Authorization": `Bearer ${token}` },
      });

      if (companyResponse.status === 404) {
        // No company
        this.companyData.set(null);
        this.companyLoading.set(false);
        return;
      }

      if (!companyResponse.ok) {
        throw new Error("Failed to fetch company");
      }

      const company = await companyResponse.json();
      this.companyData.set(company);
      console.log("[CarrierPlus] Company loaded:", company);

      // Fetch members
      const membersResponse = await fetch("http://localhost:8000/api/company/members", {
        headers: { "Authorization": `Bearer ${token}` },
      });

      if (membersResponse.ok) {
        const members = await membersResponse.json();
        this.companyMembers.set(members);
        console.log("[CarrierPlus] Members loaded:", members.length);
      }

      // Fetch fleet
      const fleetResponse = await fetch("http://localhost:8000/api/fleet/", {
        headers: { "Authorization": `Bearer ${token}` },
      });

      if (fleetResponse.ok) {
        const fleet = await fleetResponse.json();
        this.companyFleet.set(fleet);
        console.log("[CarrierPlus] Fleet loaded:", fleet.length);
      }

      this.renderCompanyTab();

    } catch (error) {
      console.error("[CarrierPlus] Error fetching company data:", error);
      this.companyData.set(null);
    } finally {
      this.companyLoading.set(false);
    }
  }

  private renderCompanyTab(): void {
    // Render members list
    const membersEl = this.companyMembersRef.getOrDefault();
    if (membersEl) {
      const members = this.companyMembers.get();
      if (members.length === 0) {
        membersEl.innerHTML = `<div style="color: #6b7280; font-size: 11px; text-align: center; padding: 16px;">Aucun membre</div>`;
      } else {
        membersEl.innerHTML = members.map(m => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #1a1a24; border-radius: 6px; margin-bottom: 6px;">
            <span style="font-size: 12px; color: white;">${m.username}</span>
            <span style="font-size: 10px; color: ${m.role === "owner" ? "#f59e0b" : "#6b7280"}; text-transform: uppercase;">${m.role}</span>
          </div>
        `).join("");
      }
    }

    // Render fleet list
    const fleetEl = this.companyFleetRef.getOrDefault();
    if (fleetEl) {
      const fleet = this.companyFleet.get();
      if (fleet.length === 0) {
        fleetEl.innerHTML = `<div style="color: #6b7280; font-size: 11px; text-align: center; padding: 16px;">Aucun avion</div>`;
      } else {
        fleetEl.innerHTML = fleet.map(a => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #1a1a24; border-radius: 6px; margin-bottom: 6px;">
            <div>
              <div style="font-size: 12px; color: white; font-weight: 500;">${a.registration || "N/A"}</div>
              <div style="font-size: 10px; color: #6b7280;">${a.aircraft_type}</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 11px; color: #60a5fa;">${a.current_airport_ident || "?"}</div>
              <div style="font-size: 9px; color: ${a.status === "parked" ? "#22c55e" : a.status === "in_flight" ? "#f59e0b" : "#6b7280"};">${a.status}</div>
            </div>
          </div>
        `).join("");
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // MARKET (HV) DATA
  // ═══════════════════════════════════════════════════════════

  private async fetchMarketData(): Promise<void> {
    const token = this.authToken.get();
    if (!token) return;

    this.marketLoading.set(true);
    this.marketError.set(null);

    try {
      // Fetch personal wallet
      const userResponse = await fetch("http://localhost:8000/api/users/me", {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (userResponse.ok) {
        const userData = await userResponse.json();
        this.walletPersonal.set(userData.wallet || 0);
      }

      // Fetch company balance (reuse companyData if available)
      if (!this.companyData.get()) {
        const companyResponse = await fetch("http://localhost:8000/api/company/me", {
          headers: { "Authorization": `Bearer ${token}` },
        });
        if (companyResponse.ok) {
          const company = await companyResponse.json();
          this.companyData.set(company);
        }
      }

      // Fetch market listings
      const tierFilter = this.marketTierFilter.get();
      let url = "http://localhost:8000/api/inventory/market?limit=100";
      if (tierFilter !== null) {
        url += `&tier=${tierFilter}`;
      }

      const marketResponse = await fetch(url, {
        headers: { "Authorization": `Bearer ${token}` },
      });

      if (!marketResponse.ok) {
        throw new Error("Failed to fetch market listings");
      }

      const listings = await marketResponse.json();
      this.marketListings.set(listings);
      console.log("[CarrierPlus] Market loaded:", listings.length, "listings");

      this.renderMarketTab();

    } catch (error) {
      console.error("[CarrierPlus] Error fetching market data:", error);
      this.marketError.set("Erreur lors du chargement du marche");
    } finally {
      this.marketLoading.set(false);
    }
  }

  private renderMarketTab(): void {
    const listingsEl = this.marketListingsRef.getOrDefault();
    if (!listingsEl) return;

    const listings = this.marketListings.get();

    if (listings.length === 0) {
      listingsEl.innerHTML = `
        <div style="background: #252532; border-radius: 12px; padding: 24px; text-align: center;">
          <svg style="width: 40px; height: 40px; margin-bottom: 12px; opacity: 0.4;" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5">
            <path d="M12 2v20"/>
            <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
          </svg>
          <div style="color: #6b7280; font-size: 12px;">Aucune offre disponible</div>
          <div style="color: #4b5563; font-size: 10px; margin-top: 4px;">Revenez plus tard</div>
        </div>
      `;
      return;
    }

    // Group by tier for easier browsing
    listingsEl.innerHTML = listings.map(item => {
      const tierColors: Record<number, string> = {
        0: "#6b7280", 1: "#22c55e", 2: "#3b82f6", 3: "#a855f7", 4: "#f59e0b", 5: "#ef4444"
      };
      const tierColor = tierColors[item.item_tier] || "#6b7280";

      return `
        <div class="market-listing-item" data-location-id="${item.location_id}" data-item-id="${item.item_id}"
             style="background: #252532; border-radius: 8px; padding: 12px; margin-bottom: 8px; cursor: pointer; transition: background 0.2s;"
             onmouseover="this.style.background='#2d2d3d'" onmouseout="this.style.background='#252532'">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div style="flex: 1;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                <span style="font-size: 9px; padding: 2px 6px; border-radius: 4px; background: ${tierColor}20; color: ${tierColor}; font-weight: 600;">T${item.item_tier}</span>
                <span style="font-size: 13px; font-weight: 600; color: white;">${item.item_name}</span>
              </div>
              <div style="font-size: 10px; color: #6b7280;">
                @ <span style="color: #60a5fa;">${item.airport_ident}</span> • ${item.company_name}
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 14px; font-weight: 700; color: #22c55e;">${item.sale_price.toLocaleString()} CR</div>
              <div style="font-size: 10px; color: #6b7280;">${item.sale_qty} dispo</div>
            </div>
          </div>
        </div>
      `;
    }).join("");

    // Add click handlers for each listing
    const listingItems = listingsEl.querySelectorAll(".market-listing-item");
    listingItems.forEach(el => {
      el.addEventListener("click", () => {
        const locationId = el.getAttribute("data-location-id");
        const itemId = el.getAttribute("data-item-id");
        if (locationId && itemId) {
          this.openMarketBuyPopup(locationId, itemId);
        }
      });
    });
  }

  private openMarketBuyPopup(locationId: string, itemId: string): void {
    const listings = this.marketListings.get();
    const item = listings.find(l => l.location_id === locationId && l.item_id === itemId);

    if (!item) {
      console.error("[CarrierPlus] Market item not found");
      return;
    }

    this.marketBuyItem.set({
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
    this.marketBuyQty.set(1);
    this.marketBuyTotal.set(item.sale_price);
    this.marketBuyWallet.set("company");
    this.showMarketBuyPopup.set(true);

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
    this.showMarketBuyPopup.set(false);
    this.marketBuyItem.set(null);
  }

  private updateMarketBuyQty(qty: number): void {
    const item = this.marketBuyItem.get();
    if (!item) return;

    qty = Math.max(1, Math.min(qty, item.sale_qty));
    this.marketBuyQty.set(qty);
    this.marketBuyTotal.set(item.sale_price * qty);

    const qtyDisplay = this.marketBuyQtyDisplayRef.getOrDefault();
    if (qtyDisplay) {
      qtyDisplay.textContent = qty.toString();
    }
  }

  private async confirmMarketBuy(): Promise<void> {
    const token = this.authToken.get();
    const item = this.marketBuyItem.get();
    if (!token || !item) return;

    const qty = this.marketBuyQty.get();
    const wallet = this.marketBuyWallet.get();
    const totalCost = item.sale_price * qty;

    // Check balance
    if (wallet === "player") {
      if (this.walletPersonal.get() < totalCost) {
        this.marketError.set("Solde personnel insuffisant");
        this.closeMarketBuyPopup();
        return;
      }
    } else {
      const company = this.companyData.get();
      if (!company || company.balance < totalCost) {
        this.marketError.set("Solde company insuffisant");
        this.closeMarketBuyPopup();
        return;
      }
    }

    try {
      const response = await fetch("http://localhost:8000/api/inventory/market/buy", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          seller_location_id: item.location_id,
          item_code: item.item_code,
          qty: qty,
          buyer_type: wallet,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Achat echoue");
      }

      console.log("[CarrierPlus] Market buy success:", qty, "x", item.item_name);

      // Close popup and refresh
      this.closeMarketBuyPopup();
      this.marketError.set(null);
      void this.fetchMarketData();

    } catch (error) {
      console.error("[CarrierPlus] Market buy error:", error);
      this.marketError.set(error instanceof Error ? error.message : "Erreur lors de l'achat");
      this.closeMarketBuyPopup();
    }
  }

  public render(): VNode {
    return (
      <div style="display: flex; width: 100%; height: 100%; background: #1a1a24; color: white; font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;">
        {/* Left Sidebar - Specs v0.8 Order */}
        <div style="width: 40px; background: #252532; display: flex; flex-direction: column; border-right: 1px solid #374151; flex-shrink: 0; padding-top: 40px;">
          {/* 1. Map Tab */}
          <Button callback={(): void => this.activeTab.set("map")}>
            <div style={this.activeTab.map(t => t === "map"
              ? "width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: rgba(59, 130, 246, 0.3); border-left: 2px solid #3b82f6;"
              : "width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: transparent; border-left: 2px solid transparent;")}>
              <svg style="width: 18px; height: 18px;" viewBox="0 0 24 24" fill="none" stroke={this.activeTab.map(t => t === "map" ? "#3b82f6" : "#6b7280")} stroke-width="1.5">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
            </div>
          </Button>

          {/* 2. Profile Tab */}
          <Button callback={(): void => this.activeTab.set("profile")}>
            <div style={this.activeTab.map(t => t === "profile"
              ? "width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: rgba(59, 130, 246, 0.3); border-left: 2px solid #3b82f6;"
              : "width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: transparent; border-left: 2px solid transparent;")}>
              <svg style="width: 18px; height: 18px;" viewBox="0 0 24 24" fill="none" stroke={this.activeTab.map(t => t === "profile" ? "#3b82f6" : "#6b7280")} stroke-width="1.5">
                <circle cx="12" cy="8" r="4"/>
                <path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>
              </svg>
            </div>
          </Button>

          {/* 3. Missions Tab (Active + History) */}
          <Button callback={(): void => this.activeTab.set("missions")}>
            <div style={this.activeTab.map(t => t === "missions"
              ? "width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: rgba(59, 130, 246, 0.3); border-left: 2px solid #3b82f6;"
              : "width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: transparent; border-left: 2px solid transparent;")}>
              <svg style="width: 18px; height: 18px;" viewBox="0 0 24 24" fill="none" stroke={this.activeTab.map(t => t === "missions" ? "#3b82f6" : "#6b7280")} stroke-width="1.5">
                <path d="M21.5 11.5L12 17L2.5 11.5"/>
                <path d="M21.5 6.5L12 12L2.5 6.5L12 1L21.5 6.5Z"/>
                <path d="M21.5 16.5L12 22L2.5 16.5"/>
              </svg>
            </div>
          </Button>

          {/* 4. Create Mission Tab (+) */}
          <Button callback={(): void => this.activeTab.set("create-mission")}>
            <div style={this.activeTab.map(t => t === "create-mission"
              ? "width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: rgba(59, 130, 246, 0.3); border-left: 2px solid #3b82f6;"
              : "width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: transparent; border-left: 2px solid transparent;")}>
              <svg style="width: 18px; height: 18px;" viewBox="0 0 24 24" fill="none" stroke={this.activeTab.map(t => t === "create-mission" ? "#3b82f6" : "#6b7280")} stroke-width="2">
                <path d="M12 5v14"/>
                <path d="M5 12h14"/>
              </svg>
            </div>
          </Button>

          {/* 5. Company Tab */}
          <Button callback={(): void => this.activeTab.set("company")}>
            <div style={this.activeTab.map(t => t === "company"
              ? "width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: rgba(59, 130, 246, 0.3); border-left: 2px solid #3b82f6;"
              : "width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: transparent; border-left: 2px solid transparent;")}>
              <svg style="width: 18px; height: 18px;" viewBox="0 0 24 24" fill="none" stroke={this.activeTab.map(t => t === "company" ? "#3b82f6" : "#6b7280")} stroke-width="1.5">
                <path d="M3 21h18"/>
                <path d="M5 21V7l8-4v18"/>
                <path d="M19 21V11l-6-4"/>
                <path d="M9 9v.01"/>
                <path d="M9 12v.01"/>
                <path d="M9 15v.01"/>
                <path d="M9 18v.01"/>
              </svg>
            </div>
          </Button>

          {/* 6. Market (HV) Tab */}
          <Button callback={(): void => this.activeTab.set("market")}>
            <div style={this.activeTab.map(t => t === "market"
              ? "width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: rgba(59, 130, 246, 0.3); border-left: 2px solid #3b82f6;"
              : "width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: transparent; border-left: 2px solid transparent;")}>
              <svg style="width: 18px; height: 18px;" viewBox="0 0 24 24" fill="none" stroke={this.activeTab.map(t => t === "market" ? "#3b82f6" : "#6b7280")} stroke-width="1.5">
                <path d="M12 2v20"/>
                <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
              </svg>
            </div>
          </Button>

          {/* 7. Inventory Tab */}
          <Button callback={(): void => this.activeTab.set("inventory")}>
            <div style={this.activeTab.map(t => t === "inventory"
              ? "width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: rgba(59, 130, 246, 0.3); border-left: 2px solid #3b82f6;"
              : "width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: transparent; border-left: 2px solid transparent;")}>
              <svg style="width: 18px; height: 18px;" viewBox="0 0 24 24" fill="none" stroke={this.activeTab.map(t => t === "inventory" ? "#3b82f6" : "#6b7280")} stroke-width="1.5">
                <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
                <path d="M3.27 6.96L12 12.01l8.73-5.05"/>
                <path d="M12 22.08V12"/>
              </svg>
            </div>
          </Button>
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
                <div style={this.isLoggedIn.map(logged => logged
                  ? "display: flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 16px; background: rgba(34, 197, 94, 0.25); border: 1px solid #22c55e;"
                  : "display: flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 16px; background: rgba(55, 65, 81, 0.5); border: 1px solid #374151;")}>
                  <svg style="width: 14px; height: 14px; min-width: 14px; min-height: 14px; flex-shrink: 0;" viewBox="0 0 24 24" fill="none" stroke={this.isLoggedIn.map(l => l ? "#22c55e" : "#9ca3af")} stroke-width="1.5">
                    <circle cx="12" cy="8" r="4"/>
                    <path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>
                  </svg>
                  <span style={this.isLoggedIn.map(l => l ? "font-size: 10px; color: #22c55e; font-weight: 500;" : "font-size: 10px; color: #9ca3af;")}>
                    {this.isLoggedIn.map(l => l ? "" : "Connexion")}
                    {this.currentUser.map(u => u ? u.username : "")}
                  </span>
                </div>
              </Button>
            </div>
          </div>

          {/* Login Panel Overlay */}
          <div style={this.showLoginPanel.map(show => show
            ? "position: absolute; top: 38px; right: 12px; z-index: 100; background: #252532; border: 1px solid #374151; border-radius: 8px; padding: 16px; width: 260px; box-shadow: 0 4px 12px rgba(0,0,0,0.4);"
            : "display: none;")}>

            {/* If logged in, show user info */}
            <div style={this.isLoggedIn.map(l => l ? "display: block;" : "display: none;")}>
              <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                <div style="width: 36px; height: 36px; border-radius: 50%; background: rgba(34, 197, 94, 0.2); display: flex; align-items: center; justify-content: center;">
                  <svg style="width: 20px; height: 20px;" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="1.5">
                    <circle cx="12" cy="8" r="4"/>
                    <path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>
                  </svg>
                </div>
                <div>
                  <div style="font-size: 13px; font-weight: 600; color: white;">{this.currentUser.map(u => u?.username || "")}</div>
                  <div style="font-size: 10px; color: #9ca3af;">{this.currentUser.map(u => u?.email || "")}</div>
                </div>
              </div>
              <Button callback={(): void => this.askLogout()}>
                <div style="background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid #ef4444; border-radius: 6px; padding: 8px; text-align: center; font-size: 12px; font-weight: 500;">
                  Deconnexion
                </div>
              </Button>
            </div>

            {/* If not logged in, show login form */}
            <div style={this.isLoggedIn.map(l => l ? "display: none;" : "display: block;")}>
              <div style="font-size: 14px; font-weight: 600; color: white; margin-bottom: 12px;">Connexion</div>

              {/* Error message */}
              <div style={this.loginError.map(e => e
                ? "background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; border-radius: 4px; padding: 8px; margin-bottom: 10px; font-size: 11px; color: #ef4444;"
                : "display: none;")}>
                {this.loginError}
              </div>

              {/* Email input */}
              <div style="margin-bottom: 10px;">
                <label style="font-size: 10px; color: #9ca3af; text-transform: uppercase; display: block; margin-bottom: 4px;">Email</label>
                <input
                  type="text"
                  style="width: 100%; background: #1a1a24; border: 1px solid #374151; border-radius: 4px; padding: 8px 10px; color: white; font-size: 12px; box-sizing: border-box;"
                  placeholder="email@exemple.com"
                  ref={this.emailInputRef}
                />
              </div>

              {/* Password input */}
              <div style="margin-bottom: 12px;">
                <label style="font-size: 10px; color: #9ca3af; text-transform: uppercase; display: block; margin-bottom: 4px;">Mot de passe</label>
                <input
                  type="password"
                  style="width: 100%; background: #1a1a24; border: 1px solid #374151; border-radius: 4px; padding: 8px 10px; color: white; font-size: 12px; box-sizing: border-box;"
                  placeholder="••••••••"
                  ref={this.passwordInputRef}
                />
              </div>

              {/* Login button */}
              <Button callback={(): void => { this.doLogin(); }} disabled={this.loginLoading}>
                <div style={this.loginLoading.map(l => l
                  ? "background: #374151; color: #9ca3af; border-radius: 6px; padding: 10px; text-align: center; font-size: 12px; font-weight: 600;"
                  : "background: #3b82f6; color: white; border-radius: 6px; padding: 10px; text-align: center; font-size: 12px; font-weight: 600;")}>
                  {this.loginLoading.map(l => l ? "Connexion..." : "Se connecter")}
                </div>
              </Button>
            </div>
          </div>

          {/* Logout Confirmation Popup */}
          <div style={this.showLogoutConfirm.map(show => show
            ? "position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 200; display: flex; align-items: center; justify-content: center;"
            : "display: none;")}>
            <div style="background: #252532; border: 1px solid #374151; border-radius: 12px; padding: 20px; width: 280px; box-shadow: 0 8px 24px rgba(0,0,0,0.5);">
              <div style="text-align: center; margin-bottom: 16px;">
                <svg style="width: 40px; height: 40px; margin-bottom: 8px;" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 8v4"/>
                  <path d="M12 16h.01"/>
                </svg>
                <div style="font-size: 16px; font-weight: 600; color: white; margin-bottom: 4px;">Deconnexion</div>
                <div style="font-size: 12px; color: #9ca3af;">Voulez-vous vraiment vous deconnecter ?</div>
              </div>
              <div style="display: flex; gap: 10px;">
                <Button callback={(): void => this.cancelLogout()}>
                  <div style="flex: 1; background: #374151; color: #9ca3af; border-radius: 6px; padding: 10px; text-align: center; font-size: 12px; font-weight: 500;">
                    Annuler
                  </div>
                </Button>
                <Button callback={(): void => this.confirmLogout()}>
                  <div style="flex: 1; background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid #ef4444; border-radius: 6px; padding: 10px; text-align: center; font-size: 12px; font-weight: 500;">
                    Confirmer
                  </div>
                </Button>
              </div>
            </div>
          </div>

          {/* Tab Content Container */}
          <div style="flex: 1; overflow: hidden; position: relative;">
          {/* Profile Tab Content */}
          <div style={this.activeTab.map(t => t === "profile"
            ? "position: absolute; top: 0; left: 0; right: 0; bottom: 0; overflow-y: auto; display: flex; flex-direction: column;"
            : "display: none;")}>
            <div style="padding: 16px; color: white; overflow-y: auto;">
              <h2 style="font-size: 16px; font-weight: 600; color: #60a5fa; margin: 0 0 16px 0;">Profil</h2>

              {/* User Card */}
              <div style="background: #252532; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
                  <div style="width: 56px; height: 56px; border-radius: 50%; background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); display: flex; align-items: center; justify-content: center;">
                    <svg style="width: 28px; height: 28px;" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5">
                      <circle cx="12" cy="8" r="4"/>
                      <path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>
                    </svg>
                  </div>
                  <div style="flex: 1;">
                    <div style="font-size: 18px; font-weight: 600; color: white;">
                      {this.currentUser.map(u => u?.username || "Non connecte")}
                    </div>
                    <div style="font-size: 11px; color: #9ca3af;">Niveau 1</div>
                  </div>
                </div>

                {/* XP Progress */}
                <div style="margin-bottom: 8px;">
                  <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;">
                    <span style="color: #9ca3af;">XP</span>
                    <span style="color: #60a5fa;">0 / 1,000</span>
                  </div>
                  <div style="height: 6px; background: #1a1a24; border-radius: 3px; overflow: hidden;">
                    <div style="width: 0%; height: 100%; background: linear-gradient(90deg, #3b82f6, #8b5cf6); border-radius: 3px;"></div>
                  </div>
                </div>
              </div>

              {/* Licenses */}
              <div style="background: #252532; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
                <div style="font-size: 12px; font-weight: 600; color: #9ca3af; text-transform: uppercase; margin-bottom: 12px;">Licences</div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                  <span style="background: rgba(34, 197, 94, 0.2); color: #22c55e; padding: 4px 12px; border-radius: 12px; font-size: 11px; font-weight: 500;">PPL</span>
                  <span style="background: rgba(107, 114, 128, 0.2); color: #6b7280; padding: 4px 12px; border-radius: 12px; font-size: 11px;">IFR</span>
                  <span style="background: rgba(107, 114, 128, 0.2); color: #6b7280; padding: 4px 12px; border-radius: 12px; font-size: 11px;">CPL</span>
                  <span style="background: rgba(107, 114, 128, 0.2); color: #6b7280; padding: 4px 12px; border-radius: 12px; font-size: 11px;">ATPL</span>
                </div>
              </div>

              {/* Stats */}
              <div style="background: #252532; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
                <div style="font-size: 12px; font-weight: 600; color: #9ca3af; text-transform: uppercase; margin-bottom: 12px;">Statistiques</div>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
                  <div>
                    <div style="font-size: 20px; font-weight: 700; color: white;">0</div>
                    <div style="font-size: 10px; color: #6b7280;">Missions</div>
                  </div>
                  <div>
                    <div style="font-size: 20px; font-weight: 700; color: white;">0h</div>
                    <div style="font-size: 10px; color: #6b7280;">Heures de vol</div>
                  </div>
                  <div>
                    <div style="font-size: 20px; font-weight: 700; color: white;">0 nm</div>
                    <div style="font-size: 10px; color: #6b7280;">Distance</div>
                  </div>
                  <div>
                    <div style="font-size: 20px; font-weight: 700; color: white;">-</div>
                    <div style="font-size: 10px; color: #6b7280;">Grade moyen</div>
                  </div>
                </div>
              </div>

              {/* Flight Status */}
              <div style="background: #252532; border-radius: 12px; padding: 16px;">
                <div style="font-size: 12px; font-weight: 600; color: #9ca3af; text-transform: uppercase; margin-bottom: 12px;">Vol actuel</div>
                <div style="display: flex; align-items: center; justify-content: space-between;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style={this.onGround.map(v => v
                      ? "background: rgba(34, 197, 94, 0.2); color: #22c55e; padding: 4px 12px; border-radius: 8px; font-weight: 600; font-size: 11px;"
                      : "background: rgba(59, 130, 246, 0.2); color: #60a5fa; padding: 4px 12px; border-radius: 8px; font-weight: 600; font-size: 11px;")}>
                      {this.onGround.map(v => v ? "AU SOL" : "EN VOL")}
                    </span>
                  </div>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 10px; color: #6b7280;">Proche:</span>
                    <span style="font-family: monospace; color: #60a5fa; font-size: 12px; font-weight: 600;">
                      {this.closestAirport}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Missions Tab Content (Active + History) */}
          <div style={this.activeTab.map(t => t === "missions"
            ? "position: absolute; top: 0; left: 0; right: 0; bottom: 0; overflow-y: auto; display: flex; flex-direction: column;"
            : "display: none;")}>
            <div style="padding: 16px; color: white; overflow-y: auto;">
              <h2 style="font-size: 16px; font-weight: 600; color: #60a5fa; margin: 0 0 16px 0;">Missions</h2>

              {/* Not logged in message */}
              <div style={this.isLoggedIn.map(l => l ? "display: none;" : "display: block;")}>
                <div style="background: rgba(245, 158, 11, 0.15); border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; text-align: center;">
                  <svg style="width: 32px; height: 32px; margin-bottom: 8px;" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 8v4"/>
                    <path d="M12 16h.01"/>
                  </svg>
                  <div style="color: #f59e0b; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Connexion requise</div>
                  <div style="color: #9ca3af; font-size: 11px;">Connectez-vous pour voir vos missions</div>
                </div>
              </div>

              {/* Logged in content */}
              <div style={this.isLoggedIn.map(l => l ? "display: block;" : "display: none;")}>
                {/* Active Mission Section */}
                <div style="background: #252532; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
                  <div style="font-size: 12px; font-weight: 600; color: #9ca3af; text-transform: uppercase; margin-bottom: 12px;">Mission en cours</div>

                  {/* No active mission */}
                  <div style={this.activeMission.map(m => m ? "display: none;" : "display: flex; flex-direction: column; align-items: center; padding: 24px; text-align: center;")}>
                    <svg style="width: 40px; height: 40px; margin-bottom: 12px; opacity: 0.4;" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5">
                      <path d="M21.5 11.5L12 17L2.5 11.5"/>
                      <path d="M21.5 6.5L12 12L2.5 6.5L12 1L21.5 6.5Z"/>
                    </svg>
                    <div style="color: #6b7280; font-size: 12px;">Aucune mission active</div>
                    <Button callback={(): void => this.activeTab.set("create-mission")}>
                      <div style="margin-top: 12px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; color: #60a5fa; padding: 8px 16px; border-radius: 6px; font-size: 11px; font-weight: 500;">
                        Creer une mission
                      </div>
                    </Button>
                  </div>

                  {/* Active mission card */}
                  <div style={this.activeMission.map(m => m ? "display: block;" : "display: none;")}>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                      <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-family: monospace; font-size: 16px; font-weight: 700; color: white;">
                          {this.activeMission.map(m => m?.origin_icao || "")}
                        </span>
                        <svg style="width: 16px; height: 16px;" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2">
                          <path d="M5 12h14"/>
                          <path d="M12 5l7 7-7 7"/>
                        </svg>
                        <span style="font-family: monospace; font-size: 16px; font-weight: 700; color: #22c55e;">
                          {this.activeMission.map(m => m?.destination_icao || "")}
                        </span>
                      </div>
                      <span style="background: rgba(59, 130, 246, 0.2); color: #60a5fa; padding: 4px 10px; border-radius: 6px; font-size: 10px; font-weight: 600;">
                        EN COURS
                      </span>
                    </div>
                    <div style="display: flex; gap: 16px; font-size: 11px; color: #9ca3af;">
                      <span>Cargo: {this.aircraftCargoWeight.map(w => `${w.toFixed(0)} kg`)}</span>
                    </div>
                  </div>
                </div>

                {/* History Section */}
                <div style="background: #252532; border-radius: 12px; padding: 16px;">
                  <div style="font-size: 12px; font-weight: 600; color: #9ca3af; text-transform: uppercase; margin-bottom: 12px;">Historique</div>

                  <div style="display: flex; flex-direction: column; align-items: center; padding: 24px; text-align: center;">
                    <svg style="width: 32px; height: 32px; margin-bottom: 8px; opacity: 0.4;" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5">
                      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
                      <rect x="9" y="3" width="6" height="4" rx="1"/>
                    </svg>
                    <div style="color: #6b7280; font-size: 11px;">Historique a venir</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Create Mission Tab Content */}
          <div style={this.activeTab.map(t => t === "create-mission"
            ? "position: absolute; top: 0; left: 0; right: 0; bottom: 0; overflow-y: auto; display: flex; flex-direction: column;"
            : "display: none;")}>
            <div style="display: flex; flex-direction: column; padding: 16px; color: white; height: 100%;">
              <h2 style="font-size: 16px; font-weight: 600; color: #60a5fa; margin: 0 0 16px 0;">Creer une Mission</h2>

              {/* Not logged in message */}
              <div style={this.isLoggedIn.map(l => l ? "display: none;" : "display: block;")}>
                <div style="background: rgba(245, 158, 11, 0.15); border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; text-align: center;">
                  <svg style="width: 32px; height: 32px; margin-bottom: 8px;" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 8v4"/>
                    <path d="M12 16h.01"/>
                  </svg>
                  <div style="color: #f59e0b; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Connexion requise</div>
                  <div style="color: #9ca3af; font-size: 11px;">Connectez-vous pour creer une mission</div>
                </div>
              </div>

              {/* Logged in - Mission Creation */}
              <div style={this.isLoggedIn.map(l => l ? "display: flex; flex-direction: column; flex: 1; gap: 12px;" : "display: none;")}>

                {/* Origin Card */}
                <div style="background: #252532; border-radius: 8px; padding: 12px;">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                      <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; margin-bottom: 4px;">
                        Origine <span style="color: #9ca3af; font-size: 9px;">(GPS auto)</span>
                      </div>
                      <div style={this.missionOriginIcao.map(o => o
                        ? "font-family: monospace; font-size: 20px; font-weight: 700; color: #60a5fa;"
                        : "font-family: monospace; font-size: 20px; font-weight: 700; color: #ef4444;")}>
                        {this.missionOriginIcao.map(o => o || "----")}
                      </div>
                    </div>
                    <Button callback={(): void => { void this.refreshMissionOrigin(); }}>
                      <div style="background: #374151; border-radius: 6px; padding: 6px 10px; font-size: 10px; color: #9ca3af;">
                        <svg style="width: 14px; height: 14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M1 4v6h6"/><path d="M23 20v-6h-6"/>
                          <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
                        </svg>
                      </div>
                    </Button>
                  </div>
                  {/* Warning when no GPS */}
                  <div style={this.missionOriginIcao.map(o => o
                    ? "display: none;"
                    : "margin-top: 8px; padding: 8px; background: rgba(239, 68, 68, 0.1); border-radius: 6px; font-size: 10px; color: #ef4444;")}>
                    Impossible de detecter votre position. Assurez-vous d'etre proche d'un aeroport.
                  </div>
                </div>

                {/* Arrow */}
                <div style="text-align: center; color: #6b7280;">
                  <svg style="width: 24px; height: 24px; margin: 0 auto;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 5v14"/>
                    <path d="M19 12l-7 7-7-7"/>
                  </svg>
                </div>

                {/* Destination Card */}
                <div style="background: #252532; border-radius: 8px; padding: 12px;">
                  <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; margin-bottom: 4px;">Destination</div>
                  <div style={this.destinationAirport.map(d => d
                    ? "font-family: monospace; font-size: 20px; font-weight: 700; color: #22c55e;"
                    : "font-size: 12px; color: #9ca3af; font-style: italic;")}>
                    {this.destinationAirport.map(d => d ? d.icao : "Selectionnez sur la carte")}
                  </div>
                  <div style={this.destinationAirport.map(d => d ? "font-size: 11px; color: #9ca3af; margin-top: 2px;" : "display: none;")}>
                    {this.destinationAirport.map(d => d?.name || "")}
                  </div>
                </div>

                {/* Aircraft Selection */}
                <div style="background: #252532; border-radius: 8px; padding: 12px;">
                  <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; margin-bottom: 8px;">Avion</div>

                  {/* Loading state */}
                  <div style={this.missionStatus.map(s => s === "loading" ? "text-align: center; padding: 12px; color: #60a5fa;" : "display: none;")}>
                    Chargement des avions...
                  </div>

                  {/* Aircraft list (rendered via ref) */}
                  <div ref={this.aircraftListRef} style={this.missionStatus.map(s => s === "loading" ? "display: none;" : "display: block;")}>
                    <div style="text-align: center; padding: 12px; color: #9ca3af; font-size: 11px;">
                      Cliquez sur le bouton refresh pour charger les avions
                    </div>
                  </div>
                </div>

                {/* Cargo Management Section - shows when aircraft is selected */}
                <div style={this.selectedAircraftId.map(id => id
                  ? "background: #252532; border-radius: 8px; padding: 12px;"
                  : "display: none;")}>
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <div style="font-size: 10px; color: #6b7280; text-transform: uppercase;">Chargement Cargo</div>
                    <div style="font-size: 10px; color: #f59e0b;">
                      {this.aircraftCargoWeight.map(w => w.toFixed(0))}kg / {this.aircraftCargoCapacity.map(c => c)}kg
                    </div>
                  </div>

                  {/* Loading indicator */}
                  <div style={this.cargoLoading.map(l => l ? "text-align: center; padding: 8px; color: #60a5fa; font-size: 11px;" : "display: none;")}>
                    Chargement...
                  </div>

                  {/* Two column layout */}
                  <div style={this.cargoLoading.map(l => l ? "display: none;" : "display: flex; gap: 8px;")}>
                    {/* Left: Airport inventory */}
                    <div style="flex: 1; background: #1a1a24; border-radius: 6px; padding: 8px; max-height: 150px; overflow-y: auto;">
                      <div style="font-size: 9px; color: #6b7280; text-transform: uppercase; margin-bottom: 6px; text-align: center;">
                        Aeroport
                      </div>
                      <div ref={this.airportInventoryRef}>
                        <div style="color: #9ca3af; font-size: 10px; text-align: center; padding: 8px;">
                          Selectionnez un avion
                        </div>
                      </div>
                    </div>

                    {/* Right: Aircraft cargo */}
                    <div style="flex: 1; background: #1a1a24; border-radius: 6px; padding: 8px; max-height: 150px; overflow-y: auto;">
                      <div style="font-size: 9px; color: #6b7280; text-transform: uppercase; margin-bottom: 6px; text-align: center;">
                        Soute Avion
                      </div>
                      <div ref={this.aircraftCargoRef}>
                        <div style="color: #9ca3af; font-size: 10px; text-align: center; padding: 8px;">
                          Soute vide
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div style="margin-top: 8px; background: #374151; border-radius: 4px; height: 6px; overflow: hidden;">
                    <div style={this.aircraftCargoWeight.map(w => {
                      const cap = this.aircraftCargoCapacity.get();
                      const pct = cap > 0 ? Math.min((w / cap) * 100, 100) : 0;
                      const color = pct > 90 ? "#ef4444" : pct > 70 ? "#f59e0b" : "#22c55e";
                      return `width: ${pct}%; height: 100%; background: ${color}; transition: width 0.3s;`;
                    })}>
                    </div>
                  </div>
                </div>

                {/* Cargo Transfer Popup */}
                <div style={this.showCargoPopup.map(show => show
                  ? "position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000;"
                  : "display: none;")}>
                  <div style="background: #252532; border-radius: 12px; padding: 20px; min-width: 280px; max-width: 90%; border: 1px solid #374151;">
                    {/* Header */}
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                      <div style={this.cargoPopupDirection.map(d => d === "load"
                        ? "font-size: 14px; font-weight: 600; color: #3b82f6;"
                        : "font-size: 14px; font-weight: 600; color: #f59e0b;")}>
                        {this.cargoPopupDirection.map(d => d === "load" ? "Charger dans l'avion" : "Decharger de l'avion")}
                      </div>
                      <Button callback={(): void => { this.closeCargoPopup(); }}>
                        <div style="color: #9ca3af; font-size: 18px; cursor: pointer; padding: 4px;">✕</div>
                      </Button>
                    </div>

                    {/* Item info */}
                    <div style="background: #1a1a24; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
                      <div style="font-size: 14px; color: white; font-weight: 600; margin-bottom: 4px;">
                        {this.cargoPopupItem.map(i => i?.item_name || "")}
                      </div>
                      <div style="font-size: 11px; color: #6b7280;">
                        {this.cargoPopupItem.map(i => i ? `${i.weight_kg}kg par unite • ${i.max_qty} disponible(s)` : "")}
                      </div>
                    </div>

                    {/* Quantity slider */}
                    <div style="margin-bottom: 16px;">
                      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-size: 12px; color: #9ca3af;">Quantite:</span>
                        <span ref={this.cargoPopupQtyRef} style="font-size: 16px; color: #22c55e; font-weight: 700;">1</span>
                      </div>
                      <input
                        ref={this.cargoPopupSliderRef}
                        type="range"
                        min="1"
                        max="100"
                        value="1"
                        style="width: 100%; height: 8px; border-radius: 4px; background: #374151; outline: none; cursor: pointer;"
                      />
                      <div style="display: flex; justify-content: space-between; font-size: 10px; color: #6b7280; margin-top: 4px;">
                        <span>1</span>
                        <span>{this.cargoPopupItem.map(i => i?.max_qty || 1)}</span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div style="display: flex; gap: 10px;">
                      <Button callback={(): void => { this.closeCargoPopup(); }}>
                        <div style="flex: 1; background: #374151; color: #9ca3af; border-radius: 8px; padding: 12px; font-size: 13px; font-weight: 600; text-align: center;">
                          Annuler
                        </div>
                      </Button>
                      <Button callback={(): void => { void this.confirmCargoTransfer(); }}>
                        <div style={this.cargoPopupDirection.map(d => d === "load"
                          ? "flex: 1; background: #3b82f6; color: white; border-radius: 8px; padding: 12px; font-size: 13px; font-weight: 600; text-align: center;"
                          : "flex: 1; background: #f59e0b; color: #1a1a24; border-radius: 8px; padding: 12px; font-size: 13px; font-weight: 600; text-align: center;")}>
                          {this.cargoPopupDirection.map(d => d === "load" ? "Charger →" : "← Decharger")}
                        </div>
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Mission Recap Popup */}
                <div style={this.showMissionRecap.map(show => show
                  ? "position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 1001;"
                  : "display: none;")}>
                  <div style="background: #1a1a24; border-radius: 16px; padding: 24px; width: 320px; max-width: 95%; border: 2px solid #374151;">
                    {/* Header with grade */}
                    <div style="text-align: center; margin-bottom: 20px;">
                      <div style="font-size: 12px; color: #6b7280; text-transform: uppercase; margin-bottom: 8px;">Mission Terminee</div>
                      <div style={this.missionRecapData.map(d => {
                        const grade = d?.grade || "F";
                        const colors: Record<string, string> = {
                          "S": "#fbbf24", "A": "#22c55e", "B": "#3b82f6",
                          "C": "#9ca3af", "D": "#f59e0b", "E": "#ef4444", "F": "#7f1d1d"
                        };
                        return `font-size: 64px; font-weight: 800; color: ${colors[grade] || "#9ca3af"}; line-height: 1;`;
                      })}>
                        {this.missionRecapData.map(d => d?.grade || "F")}
                      </div>
                      <div style="font-family: monospace; font-size: 14px; color: #9ca3af; margin-top: 4px;">
                        {this.missionRecapData.map(d => d ? `${d.origin_icao} → ${d.final_icao}` : "")}
                      </div>
                    </div>

                    {/* Score breakdown */}
                    <div style="background: #252532; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
                      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="font-size: 11px; color: #9ca3af;">Atterrissage ({this.missionRecapData.map(d => d?.landing_fpm || 0)} fpm)</span>
                        <span style="font-size: 11px; color: #22c55e; font-weight: 600;">{this.missionRecapData.map(d => d?.score_landing || 0)}/40</span>
                      </div>
                      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="font-size: 11px; color: #9ca3af;">G-Force (max {this.missionRecapData.map(d => d?.max_gforce?.toFixed(1) || "0")}G)</span>
                        <span style="font-size: 11px; color: #22c55e; font-weight: 600;">{this.missionRecapData.map(d => d?.score_gforce || 0)}/20</span>
                      </div>
                      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="font-size: 11px; color: #9ca3af;">Destination</span>
                        <span style={this.missionRecapData.map(d => d?.score_destination === 20
                          ? "font-size: 11px; color: #22c55e; font-weight: 600;"
                          : "font-size: 11px; color: #ef4444; font-weight: 600;")}>
                          {this.missionRecapData.map(d => d?.score_destination || 0)}/20
                        </span>
                      </div>
                      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="font-size: 11px; color: #9ca3af;">Temps de vol</span>
                        <span style="font-size: 11px; color: #22c55e; font-weight: 600;">{this.missionRecapData.map(d => d?.score_time || 0)}/10</span>
                      </div>
                      <div style="display: flex; justify-content: space-between;">
                        <span style="font-size: 11px; color: #9ca3af;">Carburant</span>
                        <span style="font-size: 11px; color: #22c55e; font-weight: 600;">{this.missionRecapData.map(d => d?.score_fuel || 0)}/10</span>
                      </div>
                      <div style="border-top: 1px solid #374151; margin-top: 10px; padding-top: 10px; display: flex; justify-content: space-between;">
                        <span style="font-size: 13px; color: white; font-weight: 600;">TOTAL</span>
                        <span style="font-size: 13px; color: #3b82f6; font-weight: 700;">{this.missionRecapData.map(d => d?.score_total || 0)}/100</span>
                      </div>
                    </div>

                    {/* Cheat warning */}
                    <div style={this.missionRecapData.map(d => d?.cheated
                      ? "background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; border-radius: 8px; padding: 10px; margin-bottom: 16px;"
                      : "display: none;")}>
                      <div style="font-size: 11px; color: #ef4444; font-weight: 600; text-align: center;">
                        ⚠ TRICHE DETECTEE - XP DIVISE PAR 2
                      </div>
                    </div>

                    {/* XP earned */}
                    <div style="background: rgba(34, 197, 94, 0.15); border: 1px solid #22c55e; border-radius: 8px; padding: 12px; text-align: center; margin-bottom: 16px;">
                      <div style="font-size: 10px; color: #22c55e; text-transform: uppercase; margin-bottom: 4px;">XP Gagne</div>
                      <div style="font-size: 28px; font-weight: 700; color: #22c55e;">
                        +{this.missionRecapData.map(d => d?.xp_earned || 0)}
                      </div>
                    </div>

                    {/* Close button */}
                    <Button callback={(): void => { this.showMissionRecap.set(false); this.missionRecapData.set(null); }}>
                      <div style="background: #3b82f6; color: white; border-radius: 8px; padding: 14px; font-size: 14px; font-weight: 600; text-align: center;">
                        Fermer
                      </div>
                    </Button>
                  </div>
                </div>

                {/* Active Mission Card */}
                <div style={this.activeMission.map(m => m
                  ? "background: rgba(245, 158, 11, 0.15); border: 1px solid #f59e0b; border-radius: 8px; padding: 12px;"
                  : "display: none;")}>
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <div style="font-size: 10px; color: #f59e0b; text-transform: uppercase; font-weight: 600;">Mission en cours</div>
                    <div style={this.activeMission.map(m => m
                      ? "font-size: 9px; padding: 2px 6px; background: #f59e0b; color: #1a1a24; border-radius: 4px; font-weight: 600;"
                      : "display: none;")}>
                      {this.activeMission.map(m => m?.status?.toUpperCase() || "")}
                    </div>
                  </div>
                  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                    <span style="font-family: monospace; font-size: 16px; font-weight: 700; color: #60a5fa;">
                      {this.activeMission.map(m => m?.origin_icao || "")}
                    </span>
                    <span style="color: #6b7280;">→</span>
                    <span style="font-family: monospace; font-size: 16px; font-weight: 700; color: #22c55e;">
                      {this.activeMission.map(m => m?.destination_icao || "")}
                    </span>
                  </div>
                  <div style="font-size: 11px; color: #9ca3af; margin-bottom: 10px;">
                    {this.activeMission.map(m => m?.aircraft_type || "")}
                  </div>
                  <Button callback={(): void => { void this.cancelMission(); }}>
                    <div style="background: #ef4444; color: white; border-radius: 6px; padding: 8px 16px; font-size: 12px; font-weight: 600; text-align: center;">
                      Annuler la mission
                    </div>
                  </Button>
                </div>

                {/* Error Message */}
                <div style={this.missionError.map(e => e
                  ? "background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; border-radius: 8px; padding: 12px; text-align: center;"
                  : "display: none;")}>
                  <div style="color: #ef4444; font-size: 12px;">
                    {this.missionError}
                  </div>
                </div>

                {/* Success Message */}
                <div style={this.missionStatus.map(s => s === "success"
                  ? "background: rgba(34, 197, 94, 0.15); border: 1px solid #22c55e; border-radius: 8px; padding: 12px; text-align: center;"
                  : "display: none;")}>
                  <div style="color: #22c55e; font-size: 12px; font-weight: 600; margin-bottom: 4px;">
                    Mission creee!
                  </div>
                  <div style="color: #9ca3af; font-size: 11px;">
                    {this.activeMission.map(m => m ? `${m.origin_icao} -> ${m.destination_icao}` : "")}
                  </div>
                </div>

                {/* Create Mission Button */}
                <div style="margin-top: auto;">
                  <Button
                    callback={(): void => { void this.createMission(); }}
                    disabled={this.missionStatus.map(s => s === "creating" || s === "loading")}>
                    <div style={this.destinationAirport.map(d => d && this.selectedAircraftId.get()
                      ? "background: #22c55e; color: #1a1a24; border-radius: 8px; padding: 14px 24px; font-size: 14px; font-weight: 600; text-align: center;"
                      : "background: #374151; color: #6b7280; border-radius: 8px; padding: 14px 24px; font-size: 14px; font-weight: 600; text-align: center;")}>
                      {this.missionStatus.map(s => s === "creating" ? "Creation en cours..." : "VALIDER LA MISSION")}
                    </div>
                  </Button>
                </div>

                {/* Instructions */}
                <div style="padding: 10px; background: rgba(96, 165, 250, 0.1); border-radius: 8px; border: 1px solid rgba(96, 165, 250, 0.3); margin-top: 8px;">
                  <p style="font-size: 10px; color: #9ca3af; margin: 0;">
                    L'origine est detectee automatiquement (aeroport le plus proche).<br/>
                    Selectionnez une destination sur la carte, puis un avion.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Inventaire Tab Content */}
          <div style={this.activeTab.map(t => t === "inventory"
            ? "position: absolute; top: 0; left: 0; right: 0; bottom: 0; overflow-y: auto; display: flex; flex-direction: column;"
            : "display: none;")}>
            <div style="display: flex; flex-direction: column; height: 100%; color: white; padding: 16px;">
              {/* Title */}
              <h2 style="font-size: 16px; font-weight: 600; color: #60a5fa; margin: 0 0 16px 0;">Inventaire</h2>

              {/* Not logged in message */}
              <div style={this.isLoggedIn.map(l => l ? "display: none;" : "display: block;")}>
                <div style="background: rgba(245, 158, 11, 0.15); border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; text-align: center;">
                  <svg style="width: 32px; height: 32px; margin-bottom: 8px;" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 8v4"/>
                    <path d="M12 16h.01"/>
                  </svg>
                  <div style="color: #f59e0b; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Connexion requise</div>
                  <div style="color: #9ca3af; font-size: 11px;">Connectez-vous pour voir votre inventaire</div>
                </div>
              </div>

              {/* Logged in content */}
              <div style={this.isLoggedIn.map(l => l ? "display: flex; flex-direction: column; flex: 1;" : "display: none;")}>
                {/* Toggle Buttons */}
                <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                  <Button callback={(): void => { this.fetchInventory("player"); }} disabled={this.inventoryStatus.map(s => s === "loading")}>
                    <div style={this.inventoryType.map(t => t === "player"
                      ? "flex: 1; background: #3b82f6; color: white; border-radius: 8px; padding: 10px; text-align: center; font-size: 11px; font-weight: 600;"
                      : "flex: 1; background: #374151; color: #9ca3af; border-radius: 8px; padding: 10px; text-align: center; font-size: 11px; font-weight: 600;")}>
                      {this.inventoryStatus.map(s => s === "loading" && this.inventoryType.get() === "player" ? "..." : "Personnel")}
                    </div>
                  </Button>
                  <Button callback={(): void => { this.fetchInventory("company"); }} disabled={this.inventoryStatus.map(s => s === "loading")}>
                    <div style={this.inventoryType.map(t => t === "company"
                      ? "flex: 1; background: #3b82f6; color: white; border-radius: 8px; padding: 10px; text-align: center; font-size: 11px; font-weight: 600;"
                      : "flex: 1; background: #374151; color: #9ca3af; border-radius: 8px; padding: 10px; text-align: center; font-size: 11px; font-weight: 600;")}>
                      {this.inventoryStatus.map(s => s === "loading" && this.inventoryType.get() === "company" ? "..." : "Company")}
                    </div>
                  </Button>
                </div>

                {/* Error message */}
                <div style={this.inventoryError.map(e => e
                  ? "background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; border-radius: 8px; padding: 10px; margin-bottom: 12px;"
                  : "display: none;")}>
                  <span style="color: #ef4444; font-size: 12px;">{this.inventoryError}</span>
                </div>

                {/* Inventory List */}
                <div style="background: #252532; border-radius: 8px; padding: 12px; flex: 1; overflow-y: auto;">
                  <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; margin-bottom: 10px;">
                    Articles
                  </div>
                  <div ref={this.inventoryListRef}>
                    <div style="color: #9ca3af; font-size: 12px; text-align: center; padding: 16px;">
                      Cliquez sur "Actualiser" pour charger l'inventaire
                    </div>
                  </div>
                </div>

                {/* Info Note */}
                <div style="margin-top: 12px; padding: 10px; background: rgba(96, 165, 250, 0.1); border-radius: 8px; border: 1px solid rgba(96, 165, 250, 0.3);">
                  <p style="font-size: 10px; color: #9ca3af; margin: 0;">
                    L'inventaire affiche les articles que vous possedez dans le jeu. Utilisez les missions pour transporter du fret.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Company Tab Content */}
          <div style={this.activeTab.map(t => t === "company"
            ? "position: absolute; top: 0; left: 0; right: 0; bottom: 0; overflow-y: auto; display: flex; flex-direction: column;"
            : "display: none;")}>
            <div style="padding: 16px; color: white; overflow-y: auto;">
              <h2 style="font-size: 16px; font-weight: 600; color: #60a5fa; margin: 0 0 16px 0;">Company</h2>

              {/* Not logged in message */}
              <div style={this.isLoggedIn.map(l => l ? "display: none;" : "display: block;")}>
                <div style="background: rgba(245, 158, 11, 0.15); border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; text-align: center;">
                  <svg style="width: 32px; height: 32px; margin-bottom: 8px;" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 8v4"/>
                    <path d="M12 16h.01"/>
                  </svg>
                  <div style="color: #f59e0b; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Connexion requise</div>
                  <div style="color: #9ca3af; font-size: 11px;">Connectez-vous pour voir votre company</div>
                </div>
              </div>

              {/* Logged in content */}
              <div style={this.isLoggedIn.map(l => l ? "display: block;" : "display: none;")}>
                {/* Loading state */}
                <div style={this.companyLoading.map(l => l ? "display: flex; justify-content: center; padding: 32px;" : "display: none;")}>
                  <div style="color: #9ca3af; font-size: 12px;">Chargement...</div>
                </div>

                {/* No company */}
                <div style={this.companyData.map(c => !c && !this.companyLoading.get() ? "display: block;" : "display: none;")}>
                  <div style="background: rgba(107, 114, 128, 0.15); border: 1px solid #6b7280; border-radius: 8px; padding: 24px; text-align: center;">
                    <svg style="width: 40px; height: 40px; margin-bottom: 12px; opacity: 0.5;" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5">
                      <path d="M3 21h18"/>
                      <path d="M5 21V7l8-4v18"/>
                      <path d="M19 21V11l-6-4"/>
                    </svg>
                    <div style="color: #9ca3af; font-size: 13px; font-weight: 500; margin-bottom: 4px;">Aucune company</div>
                    <div style="color: #6b7280; font-size: 11px;">Creez une company depuis la webmap</div>
                  </div>
                </div>

                {/* Company data */}
                <div style={this.companyData.map(c => c ? "display: block;" : "display: none;")}>
                  {/* Company Info */}
                  <div style="background: #252532; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                      <div style="width: 48px; height: 48px; border-radius: 8px; background: linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%); display: flex; align-items: center; justify-content: center;">
                        <svg style="width: 24px; height: 24px;" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5">
                          <path d="M3 21h18"/>
                          <path d="M5 21V7l8-4v18"/>
                          <path d="M19 21V11l-6-4"/>
                        </svg>
                      </div>
                      <div style="flex: 1;">
                        <div style="font-size: 16px; font-weight: 600; color: white;">
                          {this.companyData.map(c => c?.name || "")}
                        </div>
                        <div style="font-size: 11px; color: #9ca3af;">
                          Base: {this.companyData.map(c => c?.home_airport_ident || "")}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Finances */}
                  <div style="background: #252532; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
                    <div style="font-size: 12px; font-weight: 600; color: #9ca3af; text-transform: uppercase; margin-bottom: 12px;">Finances</div>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
                      <div>
                        <div style="font-size: 18px; font-weight: 700; color: #22c55e;">
                          {this.companyData.map(c => c ? `${c.balance.toLocaleString()} CR` : "0 CR")}
                        </div>
                        <div style="font-size: 10px; color: #6b7280;">Solde</div>
                      </div>
                      <div>
                        <div style="font-size: 18px; font-weight: 700; color: white;">
                          {this.companyFleet.map(f => f.length.toString())}
                        </div>
                        <div style="font-size: 10px; color: #6b7280;">Avions</div>
                      </div>
                    </div>
                  </div>

                  {/* Members */}
                  <div style="background: #252532; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
                    <div style="font-size: 12px; font-weight: 600; color: #9ca3af; text-transform: uppercase; margin-bottom: 12px;">
                      Membres ({this.companyMembers.map(m => m.length.toString())})
                    </div>
                    <div ref={this.companyMembersRef} style="display: flex; flex-direction: column;">
                      <div style="color: #6b7280; font-size: 11px; text-align: center; padding: 16px;">Chargement...</div>
                    </div>
                  </div>

                  {/* Fleet */}
                  <div style="background: #252532; border-radius: 12px; padding: 16px;">
                    <div style="font-size: 12px; font-weight: 600; color: #9ca3af; text-transform: uppercase; margin-bottom: 12px;">
                      Flotte ({this.companyFleet.map(f => f.length.toString())})
                    </div>
                    <div ref={this.companyFleetRef} style="display: flex; flex-direction: column;">
                      <div style="color: #6b7280; font-size: 11px; text-align: center; padding: 16px;">Chargement...</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Market (HV) Tab Content */}
          <div style={this.activeTab.map(t => t === "market"
            ? "position: absolute; top: 0; left: 0; right: 0; bottom: 0; overflow-y: auto; display: flex; flex-direction: column;"
            : "display: none;")}>
            <div style="padding: 16px; color: white; overflow-y: auto;">
              <h2 style="font-size: 16px; font-weight: 600; color: #60a5fa; margin: 0 0 16px 0;">Hotel des Ventes</h2>

              {/* Not logged in message */}
              <div style={this.isLoggedIn.map(l => l ? "display: none;" : "display: block;")}>
                <div style="background: rgba(245, 158, 11, 0.15); border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; text-align: center;">
                  <svg style="width: 32px; height: 32px; margin-bottom: 8px;" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 8v4"/>
                    <path d="M12 16h.01"/>
                  </svg>
                  <div style="color: #f59e0b; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Connexion requise</div>
                  <div style="color: #9ca3af; font-size: 11px;">Connectez-vous pour acceder au marche</div>
                </div>
              </div>

              {/* Logged in content */}
              <div style={this.isLoggedIn.map(l => l ? "display: flex; flex-direction: column; flex: 1;" : "display: none;")}>
                {/* Wallets Header */}
                <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                  <div style="flex: 1; background: #252532; border-radius: 8px; padding: 10px;">
                    <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; margin-bottom: 4px;">Personnel</div>
                    <div style="font-size: 14px; font-weight: 700; color: #22c55e;">
                      {this.walletPersonal.map(w => `${w.toLocaleString()} CR`)}
                    </div>
                  </div>
                  <div style="flex: 1; background: #252532; border-radius: 8px; padding: 10px;">
                    <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; margin-bottom: 4px;">Company</div>
                    <div style="font-size: 14px; font-weight: 700; color: #3b82f6;">
                      {this.companyData.map(c => c ? `${c.balance.toLocaleString()} CR` : "0 CR")}
                    </div>
                  </div>
                </div>

                {/* Tier Filters */}
                <div style="display: flex; gap: 4px; margin-bottom: 12px; flex-wrap: wrap;">
                  <Button callback={(): void => { this.marketTierFilter.set(null); void this.fetchMarketData(); }}>
                    <div style={this.marketTierFilter.map(t => t === null
                      ? "padding: 6px 10px; background: #3b82f6; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                      : "padding: 6px 10px; background: #252532; color: #6b7280; border-radius: 6px; font-size: 10px;")}>
                      Tous
                    </div>
                  </Button>
                  <Button callback={(): void => { this.marketTierFilter.set(0); void this.fetchMarketData(); }}>
                    <div style={this.marketTierFilter.map(t => t === 0
                      ? "padding: 6px 10px; background: #6b7280; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                      : "padding: 6px 10px; background: #252532; color: #6b7280; border-radius: 6px; font-size: 10px;")}>
                      T0
                    </div>
                  </Button>
                  <Button callback={(): void => { this.marketTierFilter.set(1); void this.fetchMarketData(); }}>
                    <div style={this.marketTierFilter.map(t => t === 1
                      ? "padding: 6px 10px; background: #22c55e; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                      : "padding: 6px 10px; background: #252532; color: #22c55e; border-radius: 6px; font-size: 10px;")}>
                      T1
                    </div>
                  </Button>
                  <Button callback={(): void => { this.marketTierFilter.set(2); void this.fetchMarketData(); }}>
                    <div style={this.marketTierFilter.map(t => t === 2
                      ? "padding: 6px 10px; background: #3b82f6; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                      : "padding: 6px 10px; background: #252532; color: #3b82f6; border-radius: 6px; font-size: 10px;")}>
                      T2
                    </div>
                  </Button>
                  <Button callback={(): void => { this.marketTierFilter.set(3); void this.fetchMarketData(); }}>
                    <div style={this.marketTierFilter.map(t => t === 3
                      ? "padding: 6px 10px; background: #a855f7; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                      : "padding: 6px 10px; background: #252532; color: #a855f7; border-radius: 6px; font-size: 10px;")}>
                      T3
                    </div>
                  </Button>
                </div>

                {/* Error message */}
                <div style={this.marketError.map(e => e
                  ? "background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; border-radius: 8px; padding: 10px; margin-bottom: 12px;"
                  : "display: none;")}>
                  <span style="color: #ef4444; font-size: 12px;">{this.marketError}</span>
                </div>

                {/* Loading state */}
                <div style={this.marketLoading.map(l => l ? "display: flex; justify-content: center; padding: 24px;" : "display: none;")}>
                  <div style="color: #9ca3af; font-size: 12px;">Chargement du marche...</div>
                </div>

                {/* Market Listings */}
                <div style={this.marketLoading.map(l => l ? "display: none;" : "display: block;")}>
                  <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; margin-bottom: 8px;">
                    Offres disponibles ({this.marketListings.map(l => l.length.toString())})
                  </div>
                  <div ref={this.marketListingsRef} style="display: flex; flex-direction: column;">
                    <div style="background: #252532; border-radius: 12px; padding: 24px; text-align: center;">
                      <svg style="width: 40px; height: 40px; margin-bottom: 12px; opacity: 0.4;" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5">
                        <path d="M12 2v20"/>
                        <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
                      </svg>
                      <div style="color: #6b7280; font-size: 12px;">Chargement...</div>
                    </div>
                  </div>
                </div>

                {/* Refresh button */}
                <div style="margin-top: 12px;">
                  <Button callback={(): void => { void this.fetchMarketData(); }} disabled={this.marketLoading}>
                    <div style={this.marketLoading.map(l => l
                      ? "background: #374151; color: #6b7280; padding: 10px; border-radius: 8px; text-align: center; font-size: 11px;"
                      : "background: #3b82f6; color: white; padding: 10px; border-radius: 8px; text-align: center; font-size: 11px; font-weight: 500;")}>
                      {this.marketLoading.map(l => l ? "Chargement..." : "Actualiser")}
                    </div>
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Market Buy Popup */}
          <div style={this.showMarketBuyPopup.map(s => s
            ? "position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px;"
            : "display: none;")}>
            <div style="background: #252532; border-radius: 12px; padding: 20px; width: 100%; max-width: 320px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h3 style="font-size: 14px; font-weight: 600; color: white; margin: 0;">Acheter</h3>
                <Button callback={(): void => { this.closeMarketBuyPopup(); }}>
                  <div style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; color: #6b7280; font-size: 18px;">
                    x
                  </div>
                </Button>
              </div>

              {/* Item info */}
              <div style="background: #1a1a24; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
                <div style="font-size: 14px; font-weight: 600; color: white; margin-bottom: 4px;">
                  {this.marketBuyItem.map(i => i?.item_name || "")}
                </div>
                <div style="font-size: 11px; color: #6b7280;">
                  @ {this.marketBuyItem.map(i => i?.airport_ident || "")} • {this.marketBuyItem.map(i => i?.company_name || "")}
                </div>
                <div style="display: flex; justify-content: space-between; margin-top: 8px;">
                  <span style="font-size: 12px; color: #9ca3af;">Prix unitaire:</span>
                  <span style="font-size: 12px; font-weight: 600; color: #22c55e;">{this.marketBuyItem.map(i => i ? `${i.sale_price.toLocaleString()} CR` : "")}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="font-size: 12px; color: #9ca3af;">Disponible:</span>
                  <span style="font-size: 12px; color: white;">{this.marketBuyItem.map(i => i?.sale_qty.toString() || "0")}</span>
                </div>
              </div>

              {/* Quantity selector */}
              <div style="margin-bottom: 16px;">
                <div style="font-size: 11px; color: #6b7280; margin-bottom: 6px;">Quantite</div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <input
                    ref={this.marketBuyQtySliderRef}
                    type="range"
                    min="1"
                    max="1"
                    value="1"
                    style="flex: 1; accent-color: #3b82f6;"
                    oninput={(e: Event): void => { this.updateMarketBuyQty(parseInt((e.target as HTMLInputElement).value)); }}
                  />
                  <span ref={this.marketBuyQtyDisplayRef} style="font-size: 14px; font-weight: 600; color: white; min-width: 30px; text-align: right;">
                    {this.marketBuyQty}
                  </span>
                </div>
              </div>

              {/* Wallet selector */}
              <div style="margin-bottom: 16px;">
                <div style="font-size: 11px; color: #6b7280; margin-bottom: 6px;">Payer avec</div>
                <div style="display: flex; gap: 8px;">
                  <Button callback={(): void => { this.marketBuyWallet.set("company"); }}>
                    <div style={this.marketBuyWallet.map(w => w === "company"
                      ? "flex: 1; padding: 10px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 6px; text-align: center;"
                      : "flex: 1; padding: 10px; background: #1a1a24; border: 1px solid #374151; border-radius: 6px; text-align: center;")}>
                      <div style="font-size: 10px; color: #6b7280;">Company</div>
                      <div style={this.marketBuyWallet.map(w => w === "company" ? "font-size: 12px; font-weight: 600; color: #3b82f6;" : "font-size: 12px; color: #9ca3af;")}>
                        {this.companyData.map(c => c ? `${c.balance.toLocaleString()} CR` : "0 CR")}
                      </div>
                    </div>
                  </Button>
                  <Button callback={(): void => { this.marketBuyWallet.set("player"); }}>
                    <div style={this.marketBuyWallet.map(w => w === "player"
                      ? "flex: 1; padding: 10px; background: rgba(34, 197, 94, 0.2); border: 1px solid #22c55e; border-radius: 6px; text-align: center;"
                      : "flex: 1; padding: 10px; background: #1a1a24; border: 1px solid #374151; border-radius: 6px; text-align: center;")}>
                      <div style="font-size: 10px; color: #6b7280;">Personnel</div>
                      <div style={this.marketBuyWallet.map(w => w === "player" ? "font-size: 12px; font-weight: 600; color: #22c55e;" : "font-size: 12px; color: #9ca3af;")}>
                        {this.walletPersonal.map(w => `${w.toLocaleString()} CR`)}
                      </div>
                    </div>
                  </Button>
                </div>
              </div>

              {/* Total */}
              <div style="background: #1a1a24; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-size: 12px; color: #9ca3af;">Total:</span>
                  <span style="font-size: 16px; font-weight: 700; color: #f59e0b;">
                    {this.marketBuyTotal.map(t => `${t.toLocaleString()} CR`)}
                  </span>
                </div>
              </div>

              {/* Buttons */}
              <div style="display: flex; gap: 8px;">
                <Button callback={(): void => { this.closeMarketBuyPopup(); }}>
                  <div style="flex: 1; padding: 12px; background: #374151; color: #9ca3af; border-radius: 8px; text-align: center; font-size: 12px;">
                    Annuler
                  </div>
                </Button>
                <Button callback={(): void => { void this.confirmMarketBuy(); }}>
                  <div style="flex: 1; padding: 12px; background: #22c55e; color: white; border-radius: 8px; text-align: center; font-size: 12px; font-weight: 600;">
                    Confirmer
                  </div>
                </Button>
              </div>
            </div>
          </div>

          {/* Map Tab Content */}
          <div style={this.activeTab.map(t => t === "map"
            ? "position: absolute; top: 0; left: 0; right: 0; bottom: 0; overflow: hidden; display: flex; flex-direction: column;"
            : "display: none;")}>

            {/* Map Controls Header */}
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #252532; border-bottom: 1px solid #374151; flex-shrink: 0;">
              {/* Position Info */}
              <div style="display: flex; gap: 12px; align-items: center;">
                <span style="font-family: monospace; color: #f59e0b; font-size: 11px;">
                  {this.latitude.map(v => this.formatCoord(v, true))}
                </span>
                <span style="font-family: monospace; color: #f59e0b; font-size: 11px;">
                  {this.longitude.map(v => this.formatCoord(v, false))}
                </span>
              </div>

              {/* Control Buttons */}
              <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                <Button callback={(): void => { this.centerMapOnAircraft(); }}>
                  <div style="padding: 3px 8px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 4px; font-size: 9px; color: #60a5fa;">
                    GPS
                  </div>
                </Button>
                {/* Toggle airports on map */}
                <Button callback={(): void => { this.toggleAirportsOnMap(); }}>
                  <div style={this.showAirportsOnMap.map(show => show
                    ? "padding: 3px 8px; background: #22c55e; border: 1px solid #22c55e; border-radius: 4px; font-size: 9px; color: #1a1a24; font-weight: 600;"
                    : "padding: 3px 8px; background: rgba(34, 197, 94, 0.2); border: 1px solid #22c55e; border-radius: 4px; font-size: 9px; color: #22c55e;")}>
                    {this.airportsOnMapStatus.map(s => s === "loading" ? "..." : "AD")}
                  </div>
                </Button>
                {/* Toggle factories on map */}
                <Button callback={(): void => { this.toggleFactoriesOnMap(); }}>
                  <div style={this.showFactoriesOnMap.map(show => show
                    ? "padding: 3px 8px; background: #a855f7; border: 1px solid #a855f7; border-radius: 4px; font-size: 9px; color: #1a1a24; font-weight: 600;"
                    : "padding: 3px 8px; background: rgba(168, 85, 247, 0.2); border: 1px solid #a855f7; border-radius: 4px; font-size: 9px; color: #a855f7;")}>
                    {this.factoriesOnMapStatus.map(s => s === "loading" ? "..." : "FAC")}
                  </div>
                </Button>
                {/* Toggle helipads on map */}
                <Button callback={(): void => { this.toggleHelipadsOnMap(); }}>
                  <div style={this.showHelipadsOnMap.map(show => show
                    ? "padding: 3px 8px; background: #2196F3; border: 1px solid #2196F3; border-radius: 4px; font-size: 9px; color: #1a1a24; font-weight: 600;"
                    : "padding: 3px 8px; background: rgba(33, 150, 243, 0.2); border: 1px solid #2196F3; border-radius: 4px; font-size: 9px; color: #2196F3;")}>
                    {this.helipadsOnMapStatus.map(s => s === "loading" ? "..." : "HELI")}
                  </div>
                </Button>
                {/* Airports sidebar list */}
                <Button callback={(): void => { this.toggleAirportsSidebar(); }}>
                  <div style={this.showAirportsSidebar.map(show => show
                    ? "padding: 3px 8px; background: #f59e0b; border: 1px solid #f59e0b; border-radius: 4px; font-size: 9px; color: #1a1a24; font-weight: 600;"
                    : "padding: 3px 8px; background: rgba(245, 158, 11, 0.2); border: 1px solid #f59e0b; border-radius: 4px; font-size: 9px; color: #f59e0b;")}>
                    {this.nearbyAirportsStatus.map(s => s === "loading" ? "..." : "LIST")}
                  </div>
                </Button>
              </div>
            </div>

            {/* Map Error Display */}
            <div style={this.mapError.map(e => e
              ? "background: rgba(239, 68, 68, 0.15); border-bottom: 1px solid #ef4444; padding: 8px 12px; flex-shrink: 0;"
              : "display: none;")}>
              <span style="color: #ef4444; font-size: 11px;">{this.mapError}</span>
            </div>

            {/* OpenLayers Map Container */}
            <div
              ref={this.mapContainerRef}
              style="flex: 1; width: 100%; min-height: 200px; background: #0a0a0f;"
            />

            {/* Nearby Airports Sidebar - toggleable */}
            <div style={this.showAirportsSidebar.map(show => show
              ? "position: absolute; right: 8px; top: 52px; width: 180px; max-height: calc(100% - 60px); background: rgba(37, 37, 50, 0.95); border-radius: 8px; border: 1px solid #374151; overflow: hidden; display: flex; flex-direction: column;"
              : "display: none;")}>
              <div style="padding: 8px 10px; background: #1a1a24; border-bottom: 1px solid #374151; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 10px; color: #6b7280; text-transform: uppercase;">Aeroports (50 NM)</span>
                <Button callback={(): void => { this.fetchNearbyAirports(); }} disabled={this.nearbyAirportsStatus.map(s => s === "loading")}>
                  <div style="font-size: 9px; color: #60a5fa; padding: 2px 6px; background: rgba(59, 130, 246, 0.2); border-radius: 3px;">
                    {this.nearbyAirportsStatus.map(s => s === "loading" ? "..." : "Refresh")}
                  </div>
                </Button>
              </div>
              <div ref={this.nearbyAirportsListRef} style="padding: 8px; overflow-y: auto; flex: 1;">
                <div style="color: #9ca3af; font-size: 10px; text-align: center; padding: 8px;">
                  Chargement...
                </div>
              </div>
            </div>

            {/* Airport Context Menu */}
            <div style={this.selectedAirport.map(airport => airport
              ? "position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #1e2433; border: 2px solid #3b82f6; border-radius: 16px; min-width: 280px; z-index: 1000; box-shadow: 0 12px 40px rgba(0,0,0,0.7);"
              : "display: none;")}>

              {/* Close Button - separate row aligned right */}
              <div style="display: flex; justify-content: flex-end; padding: 10px 10px 0 10px;">
                <Button callback={(): void => { this.selectedAirport.set(null); }}>
                  <div style="width: 28px; height: 28px; background: #374151; border-radius: 14px; color: #9ca3af; font-size: 14px; line-height: 28px; text-align: center;">
                    X
                  </div>
                </Button>
              </div>

              {/* Menu Header */}
              <div style="padding: 0 20px 16px 20px; text-align: center; border-bottom: 1px solid #374151;">
                <div style="font-size: 28px; font-weight: 700; color: #60a5fa; font-family: monospace; letter-spacing: 3px;">
                  {this.selectedAirport.map(a => a?.icao || "")}
                </div>
                <div style="font-size: 14px; color: #e5e7eb; margin-top: 8px; font-weight: 500;">
                  {this.selectedAirport.map(a => a?.name || "")}
                </div>
                <div style="display: inline-block; margin-top: 10px; padding: 5px 14px; background: #2d3748; border-radius: 14px; font-size: 11px; color: #93c5fd; text-transform: capitalize;">
                  {this.selectedAirport.map(a => a?.type?.replace(/_/g, " ") || "")}
                </div>
              </div>

              {/* Menu Actions */}
              <div style="padding: 12px 16px; text-align: center;">
                {/* Create Factory Button */}
                <div style="margin: 6px 0; text-align: center;">
                  <Button callback={(): void => {
                    const airport = this.selectedAirport.get();
                    if (airport) this.openCreateFactory(airport);
                  }}>
                    <div style="display: inline-block; padding: 12px 40px; background: #3b82f6; border-radius: 8px; color: #ffffff; font-size: 13px; font-weight: 600;">
                      {this.availableSlotsAtAirport.map(slots => slots !== null ? `Creer une usine (${slots})` : "Creer une usine")}
                    </div>
                  </Button>
                </div>

                {/* Manage Factory Button - only if user has factories here */}
                <div style={this.myFactoriesAtAirport.map(factories => factories.length > 0
                  ? "margin: 6px 0; text-align: center;"
                  : "display: none;")}>
                  <Button callback={(): void => {
                    const factories = this.myFactoriesAtAirport.get();
                    if (factories.length > 0) this.openManageFactory(factories[0]);
                  }}>
                    <div style="display: inline-block; padding: 12px 40px; background: #a855f7; border-radius: 8px; color: #ffffff; font-size: 13px; font-weight: 600;">
                      {this.myFactoriesAtAirport.map(f => `Gerer mon usine (${f.length})`)}
                    </div>
                  </Button>
                </div>

                {/* Set Destination Button */}
                <div style="margin: 6px 0; text-align: center;">
                  <Button callback={(): void => {
                    const airport = this.selectedAirport.get();
                    if (airport) this.setDestinationAirport(airport);
                  }}>
                    <div style="display: inline-block; padding: 12px 40px; background: #22c55e; border-radius: 8px; color: #1a1a24; font-size: 13px; font-weight: 600;">
                      Definir destination
                    </div>
                  </Button>
                </div>
              </div>

              {/* Current Destination Display */}
              <div style={this.destinationAirport.map(dest => dest
                ? "padding: 12px 20px; border-top: 1px solid #374151; text-align: center; font-size: 12px; color: #6b7280;"
                : "display: none;")}>
                Destination actuelle:
                <span style="color: #22c55e; font-family: monospace; font-weight: 600; margin-left: 6px;">
                  {this.destinationAirport.map(d => d?.icao || "")}
                </span>
              </div>
            </div>
          </div>
          </div>{/* End Tab Content Container */}
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
