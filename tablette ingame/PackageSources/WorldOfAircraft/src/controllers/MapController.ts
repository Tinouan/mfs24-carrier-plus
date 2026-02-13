import OLMap from "ol/Map";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import VectorSource from "ol/source/Vector";
import { fromLonLat, toLonLat } from "ol/proj";
import { Style } from "ol/style";
import { NodeReference } from "@microsoft/msfs-sdk";
import { mapManager } from "../managers";
import { DatabaseManager } from "../managers/DatabaseManager";
import type { Player } from "../managers/DatabaseManager";
import { WorldRouter, TransferRouter } from "../services";
import { mapState, simVarState, authState, transferState, marketState } from "../state";
import { showNotification } from "../state/PopupState";
import { isGameReady } from "../state/GameModeState";
import { factoryState } from "../state/FactoryState";
import { RecipeService } from "../services/RecipeService";
import { ItemService } from "../services/ItemService";
import { ITEM_ICON_MAP } from "../data/itemIconMap";
import { renderAirportsListHtml } from "../helpers";

export class MapController {
  // Refs (passed from WorldOfAircraft)
  private mapContainerRef: NodeReference<HTMLDivElement>;
  private nearbyAirportsListRef: NodeReference<HTMLDivElement>;
  private icaoSearchInputRef: NodeReference<HTMLInputElement>;

  // Map state (moved from WOA)
  private olMap: OLMap | null = null;
  private aircraftFeature: Feature<Point> | null = null;
  private mapInitialized = false;
  private airportsSource: VectorSource<Feature<Point>> | null = null;
  private factoriesSource: VectorSource<Feature<Point>> | null = null;
  private helipadsSource: VectorSource<Feature<Point>> | null = null;
  private lastLoadedZoom: number = 7;
  private nearbyAirports: Array<{ icao: string; name: string; distance_nm: number }> = [];

  // Translation
  private t: (section: string, key: string) => string;

  constructor(
    refs: {
      mapContainer: NodeReference<HTMLDivElement>;
      nearbyAirportsList: NodeReference<HTMLDivElement>;
      icaoSearchInput: NodeReference<HTMLInputElement>;
    },
    translate: (section: string, key: string) => string
  ) {
    this.mapContainerRef = refs.mapContainer;
    this.nearbyAirportsListRef = refs.nearbyAirportsList;
    this.icaoSearchInputRef = refs.icaoSearchInput;
    this.t = translate;
  }

  // ═══════════════════════════════════════════════════════════
  // PUBLIC ACCESSORS
  // ═══════════════════════════════════════════════════════════

  public isMapInitialized(): boolean {
    return this.mapInitialized;
  }

  /**
   * Force map view + marker to a specific position and zoom.
   * Replaces the "BRUTE FORCE" block from WOA's new pilot init.
   */
  public forcePosition(lat: number, lon: number, zoom: number): void {
    if (!this.olMap || !this.aircraftFeature) return;
    const coords = fromLonLat([lon, lat]);
    const geom = this.aircraftFeature.getGeometry();
    if (geom) {
      geom.setCoordinates(coords);
    }
    this.olMap.getView().setCenter(coords);
    this.olMap.getView().setZoom(zoom);
  }

  /**
   * Force OpenLayers to recalculate map size (after resume from pause).
   */
  public refreshMapSize(): void {
    if (this.olMap) {
      this.olMap.updateSize();
    }
  }

  // ═══════════════════════════════════════════════════════════
  // MAP INITIALIZATION
  // ═══════════════════════════════════════════════════════════

  /**
   * V2.1: Initialize map manager with callbacks
   */
  public initializeMapManager(): void {
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
   * Clean up map resources - called before reinitializing or when closing app
   * Handles the case where GT debugger refresh recreates DOM but JS state persists
   */
  public disposeMap(): void {
    // V2.1: Delegate to MapManager
    mapManager.disposeMap();
    this.mapInitialized = false;
    this.olMap = null;
    this.aircraftFeature = null;
    this.airportsSource = null;
    this.factoriesSource = null;
    this.helipadsSource = null;
  }

  public initializeMap(): void {
    if (this.mapInitialized || !this.mapContainerRef.getOrDefault()) {
      return;
    }

    const container = this.mapContainerRef.getOrDefault();
    if (!container) {
      console.log("[WOA] Map container not found");
      return;
    }

    // Get current position from SimVars
    let lat = simVarState.latitude.get();
    let lon = simVarState.longitude.get();
    const heading = simVarState.heading.get();

    // V4.1: Check if SimVar coordinates are valid (not 0,0 or near Pacific)
    const simVarValid = Math.abs(lat) > 0.1; // MSFS returns (0, 90) when no flight loaded

    // V4.1 FIX: Robust fallback chain for initial marker position
    if (!simVarValid) {
      let foundFallback = false;
      const user = authState.currentUser.get();

      // Fallback 1: Player.last_latitude/longitude (persisted via WOA_Solo_SaveData)
      if (user?.last_latitude && user?.last_longitude) {
        lat = user.last_latitude;
        lon = user.last_longitude;
        foundFallback = true;
        console.log(`[WOA] Map init: Using Player.last_latitude/longitude (${lat}, ${lon})`);
      }

      // Fallback 2: Player's current_airport via airports cache
      if (!foundFallback) {
        const airportIcao = user?.current_airport || user?.preferred_airport;
        if (airportIcao) {
          const airports = DatabaseManager.getAirportsCache();
          const airport = airports.find(a => a.ident === airportIcao);
          if (airport && airport.latitude && airport.longitude) {
            lat = airport.latitude;
            lon = airport.longitude;
            foundFallback = true;
            console.log(`[WOA] Map init: Using player airport ${airportIcao} for marker (${lat}, ${lon})`);
          }
        }
      }

      if (!foundFallback) {
        console.log("[WOA] Map init: No fallback position available, marker will be at 0,0");
      }
    }

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

    // Always center on player's economic position (current_airport in DB)
    if (this.olMap) {
      void this.centerMapOnPlayerAirport();
    }

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

  // ═══════════════════════════════════════════════════════════
  // MAP CLICK & FEATURE INTERACTION
  // ═══════════════════════════════════════════════════════════

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
    if (!isGameReady()) {
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

  // ═══════════════════════════════════════════════════════════
  // NEARBY AIRPORTS SIDEBAR
  // ═══════════════════════════════════════════════════════════

  public toggleAirportsSidebar(): void {
    mapState.showAirportsSidebar.set(!mapState.showAirportsSidebar.get());
    // Fetch airports if opening and not already loaded
    if (mapState.showAirportsSidebar.get() && this.nearbyAirports.length === 0) {
      this.fetchNearbyAirports();
    }
  }

  public async fetchNearbyAirports(): Promise<void> {
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

  // ═══════════════════════════════════════════════════════════
  // MAP POSITION & CENTERING
  // ═══════════════════════════════════════════════════════════

  public updateMapPosition(): void {
    if (!mapManager.isInitialized()) return;

    // DB is the single source of truth. No SimVars.
    // 1. current_airport → lookup airport coords from cache
    // 2. last_latitude/last_longitude (fallback)
    const user = authState.currentUser.get();
    let lat = 0;
    let lon = 0;

    if (user?.current_airport) {
      const airports = DatabaseManager.getAirportsCache();
      const airport = airports.find(a => a.ident === user.current_airport);
      if (airport && airport.latitude && airport.longitude) {
        lat = airport.latitude;
        lon = airport.longitude;
      }
    }

    if (!lat && user?.last_latitude && user?.last_longitude && Math.abs(user.last_latitude) > 0.1) {
      lat = user.last_latitude;
      lon = user.last_longitude;
    }

    if (Math.abs(lat) < 0.1) return;

    mapManager.updateAircraftPosition(lat, lon, 0);
  }

  /**
   * V4.1: Save player's last known position to database
   */
  private async savePlayerPosition(lat: number, lon: number): Promise<void> {
    try {
      const user = authState.currentUser.get();
      if (!user) return;
      const player = await DatabaseManager.get<Player>("player", String(user.id));
      if (player) {
        player.last_latitude = lat;
        player.last_longitude = lon;
        player.updated_at = new Date().toISOString();
        await DatabaseManager.put("player", player, false);
      }
    } catch (e) {
      // Silent fail - not critical
    }
  }

  public centerMapOnAircraft(): void {
    if (!mapManager.isInitialized()) return;
    // Delegate to centerMapOnPlayerAirport which uses DB position
    void this.centerMapOnPlayerAirport();
  }

  /**
   * V4.1: Center map on player's position (from last_lat/lon or airport)
   * Also updates the marker position
   */
  public async centerMapOnPlayerAirport(): Promise<void> {
    if (!this.olMap) return;

    try {
      const user = authState.currentUser.get();

      // Priority 1: current_airport (economic position from DB)
      const targetIcao = user?.current_airport || user?.preferred_airport;
      if (targetIcao) {
        const airports = DatabaseManager.getAirportsCache();
        const airport = airports.find(a => a.ident === targetIcao);
        if (airport && airport.latitude && airport.longitude) {
          console.log(`[WOA] Centering on player airport: ${targetIcao} (${airport.latitude}, ${airport.longitude})`);
          mapManager.updateAircraftPosition(airport.latitude, airport.longitude, 0);
          this.olMap.getView().animate({
            center: fromLonLat([airport.longitude, airport.latitude]),
            zoom: 9,
            duration: 500,
          });
          return;
        }
      }

      // Fallback: last_latitude/longitude
      if (user?.last_latitude && user?.last_longitude) {
        console.log(`[WOA] Centering on player saved position: (${user.last_latitude}, ${user.last_longitude})`);
        mapManager.updateAircraftPosition(user.last_latitude, user.last_longitude, 0);
        this.olMap.getView().animate({
          center: fromLonLat([user.last_longitude, user.last_latitude]),
          zoom: 9,
          duration: 500,
        });
        return;
      }

      console.log("[WOA] No player position or airport to center on");
    } catch (e) {
      console.warn("[WOA] Could not center on player airport:", e);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // ICAO SEARCH
  // ═══════════════════════════════════════════════════════════

  public async searchAirportByIcao(): Promise<void> {
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

  // ═══════════════════════════════════════════════════════════
  // AIRPORT FILTERS & LAYER TOGGLES
  // ═══════════════════════════════════════════════════════════

  public toggleLargeAirports(): void {
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

  public toggleMediumAirports(): void {
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

  public toggleSmallAirports(): void {
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

  // ═══════════════════════════════════════════════════════════
  // AIRPORT/HELIPAD/FACTORY LOADING
  // ═══════════════════════════════════════════════════════════

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

  public toggleFactoriesOnMap(): void {
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

    // Load factories from local state + resolve airport coordinates
    const factories = factoryState.factories.get();
    const airports = DatabaseManager.getAirportsCache();

    const mapFactories = factories
      .map(f => {
        const airport = airports.find(a => a.ident === f.airport_ident);

        // Resolve product icon SVG
        let productIconSvg: string | undefined;
        let isProducing = false;

        if (f.status === "producing" && f.current_recipe_id) {
          isProducing = true;
          const recipe = RecipeService.getRecipeById(f.current_recipe_id);
          if (recipe) {
            const item = ItemService.getItemById(recipe.resultItemId);
            if (item?.icon_path) productIconSvg = ITEM_ICON_MAP[item.icon_path];
          }
        } else if (f.last_result_item_id) {
          const item = ItemService.getItemById(f.last_result_item_id);
          if (item?.icon_path) productIconSvg = ITEM_ICON_MAP[item.icon_path];
        }

        return {
          id: f.id,
          name: f.name,
          airport_ident: f.airport_ident,
          latitude: airport?.latitude || 0,
          longitude: airport?.longitude || 0,
          tier: f.tier,
          productIconSvg,
          isProducing,
        };
      })
      .filter(f => f.latitude !== 0 || f.longitude !== 0);

    mapManager.loadFactories(mapFactories);
    mapState.factoriesOnMapStatus.set("success");
    console.log(`[WOA] Loaded ${mapFactories.length} factories on map`);
  }

  public toggleHelipadsOnMap(): void {
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

  // ═══════════════════════════════════════════════════════════
  // PILOT & AIRCRAFT TRANSFERS (Phase 7)
  // ═══════════════════════════════════════════════════════════

  /**
   * Open pilot transfer popup — estimate cost and show confirmation
   */
  public async openPilotTransfer(destIcao: string, destName: string): Promise<void> {
    const user = authState.currentUser.get();
    const originIcao = user?.current_airport || user?.preferred_airport || "";
    if (!originIcao || originIcao === destIcao) return;

    try {
      // Refresh wallet from DB before showing popup
      const player = await DatabaseManager.getPlayer();
      if (player) {
        marketState.walletPersonal.set(player.money);
      }

      const estimate = await TransferRouter.estimatePilotTransfer(originIcao, destIcao);
      transferState.transferDestIcao.set(destIcao);
      transferState.transferDestName.set(destName);
      transferState.transferEstimate.set(estimate);
      transferState.showPilotTransferPopup.set(true);
    } catch (e) {
      console.error("[MapController] estimatePilotTransfer error:", e);
    }
  }

  /**
   * Confirm pilot transfer — deduct cost, move player
   */
  public async confirmPilotTransfer(): Promise<void> {
    const user = authState.currentUser.get();
    if (!user) return;

    const destIcao = transferState.transferDestIcao.get();
    const destName = transferState.transferDestName.get();

    try {
      const result = await TransferRouter.transferPilot(String(user.id), destIcao);
      if (result.success) {
        // Look up new airport coordinates from cache
        const airports = DatabaseManager.getAirportsCache();
        const destAirport = airports.find(a => a.ident === destIcao);
        const newLat = destAirport?.latitude || 0;
        const newLon = destAirport?.longitude || 0;

        // Update auth state with new position
        authState.currentUser.set({
          ...user,
          current_airport: destIcao,
          last_latitude: newLat || user.last_latitude,
          last_longitude: newLon || user.last_longitude,
        });

        // Persist last_latitude/longitude in DB
        if (newLat && newLon) {
          void this.savePlayerPosition(newLat, newLon);
        }

        // Refresh wallet
        const player = await DatabaseManager.getPlayer();
        if (player) {
          marketState.walletPersonal.set(player.money);
        }

        showNotification(this.t("transfer", "pilotTransferred") + ` → ${destName} (${destIcao})`);

        // Force marker + view to new airport immediately
        if (newLat && newLon) {
          this.forcePosition(newLat, newLon, 12);
        }
      } else {
        showNotification(result.error || "Transfer failed");
      }
    } catch (e) {
      console.error("[MapController] confirmPilotTransfer error:", e);
      showNotification("Transfer error");
    } finally {
      transferState.showPilotTransferPopup.set(false);
      transferState.transferEstimate.set(null);
    }
  }

  public closePilotTransferPopup(): void {
    transferState.showPilotTransferPopup.set(false);
    transferState.transferEstimate.set(null);
  }

}
