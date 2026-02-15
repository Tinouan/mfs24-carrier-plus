/**
 * MapManager - OpenLayers map management
 * Extracted from WorldOfAircraft.tsx for better maintainability
 *
 * Handles:
 * - Map initialization and disposal
 * - Aircraft position updates
 * - Airport/factory/helipad layer management
 * - Click handlers and interactions
 */

import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import XYZ from "ol/source/XYZ";
import { fromLonLat, toLonLat } from "ol/proj";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Style, Icon } from "ol/style";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface MapBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface AirportData {
  ident?: string;
  icao?: string;
  latitude_deg?: number;
  longitude_deg?: number;
  lat?: number;
  lon?: number;
  type?: string;
  name?: string;
}

export type FactoryIconState = "npc" | "producing" | "idle" | "empty";

export interface FactoryData {
  id: string;
  name: string;
  airport_ident: string;
  latitude?: number;
  longitude?: number;
  tier?: number;
  product_type?: string;
  emoji?: string;
  /** Raw SVG string of the product icon (from ITEM_ICON_MAP) */
  productIconSvg?: string;
  /** true = producing, false = idle/paused */
  isProducing?: boolean;
  /** Icon state for zoom-based display */
  iconState?: FactoryIconState;
  /** NPC factory flag */
  isNpc?: boolean;
  /** NPC stock info (for tooltip) */
  stockCurrent?: number;
  stockMax?: number;
  /** Item display name (for tooltip) */
  itemName?: string;
}

export interface MapCallbacks {
  onAirportClick: (icao: string, name: string, type: string, lat: number, lon: number) => void;
  onMapError: (error: string) => void;
  onAirportsLoaded: (count: number) => void;
  onFactoriesLoaded: (count: number) => void;
  onHelipadsLoaded: (count: number) => void;
  onMapMoveEnd: () => void;
  t: (section: string, key: string) => string;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAP MANAGER CLASS
// ═══════════════════════════════════════════════════════════════════════════

class MapManager {
  // Map instance
  private olMap: Map | null = null;
  private mapInitialized = false;

  // Layers
  private aircraftFeature: Feature<Point> | null = null;
  private aircraftSource: VectorSource<Feature<Point>> | null = null;
  private airportsSource: VectorSource<Feature<Point>> | null = null;
  private airportsLayer: VectorLayer<VectorSource<Feature<Point>>> | null = null;
  private factoriesSource: VectorSource<Feature<Point>> | null = null;
  private factoriesLayer: VectorLayer<VectorSource<Feature<Point>>> | null = null;
  private helipadsSource: VectorSource<Feature<Point>> | null = null;
  private helipadsLayer: VectorLayer<VectorSource<Feature<Point>>> | null = null;

  // State
  private lastLoadedBounds: MapBounds | null = null;
  private mapMoveDebounceTimer: number | null = null;
  private callbacks: MapCallbacks | null = null;

  // Filter state (managed externally, passed in)
  private showLargeAirports = true;
  private showMediumAirports = true;
  private showSmallAirports = false;

  // Factory airport coords cache for circle repositioning
  private factoryAirportCoords: Record<string, { lon: number; lat: number }> = {};

  // Diff-based airport tracking (avoid clear+recreate)
  private loadedAirportIdents: Record<string, boolean> = {};

  // Cached SVG styles per airport type (generated once, reused for all features)
  private airportStyleCache: Record<string, Style> = {};
  private airportHiddenStyle = new Style({});

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  initialize(callbacks: MapCallbacks): void {
    this.callbacks = callbacks;
    console.log("[MapManager] Initialized");
  }

  isInitialized(): boolean {
    return this.mapInitialized;
  }

  getMap(): Map | null {
    return this.olMap;
  }

  getAircraftFeature(): Feature<Point> | null {
    return this.aircraftFeature;
  }

  getAirportsSource(): VectorSource<Feature<Point>> | null {
    return this.airportsSource;
  }

  getHelipadsSource(): VectorSource<Feature<Point>> | null {
    return this.helipadsSource;
  }

  getFactoriesSource(): VectorSource<Feature<Point>> | null {
    return this.factoriesSource;
  }

  getLastLoadedBounds(): MapBounds | null {
    return this.lastLoadedBounds;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAP LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Initialize the OpenLayers map in the given container
   * @param options.skipDefaultHandlers - Skip setting up default drag/click handlers (for custom Coherent GT handling)
   */
  initializeMap(
    container: HTMLElement,
    initialLat: number,
    initialLon: number,
    initialHeading: number,
    options?: { skipDefaultHandlers?: boolean }
  ): boolean {
    if (this.mapInitialized) {
      return true;
    }

    try {
      console.log("[MapManager] Initializing OpenLayers map...");

      // Create aircraft marker feature
      this.aircraftFeature = new Feature({
        geometry: new Point(fromLonLat([initialLon, initialLat])),
      });

      // Aircraft SVG icon
      const aircraftSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24">
        <path fill="#3b82f6" stroke="#ffffff" stroke-width="1" d="M12 2L8 10H4L6 12L4 14H8L12 22L16 14H20L18 12L20 10H16L12 2Z"/>
      </svg>`;
      const aircraftIconUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(aircraftSvg);

      this.aircraftFeature.setStyle(
        new Style({
          image: new Icon({
            src: aircraftIconUrl,
            scale: 1,
            rotation: (initialHeading * Math.PI) / 180,
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

      // Create airports layer
      this.airportsSource = new VectorSource();
      this.airportsLayer = new VectorLayer({
        source: this.airportsSource,
        zIndex: 50,
        visible: false,
      });

      // Create factories layer (visible at zoom >= 10)
      this.factoriesSource = new VectorSource();
      this.factoriesLayer = new VectorLayer({
        source: this.factoriesSource,
        zIndex: 60,
        minZoom: 5,
      });

      // Create helipads layer
      this.helipadsSource = new VectorSource();
      this.helipadsLayer = new VectorLayer({
        source: this.helipadsSource,
        zIndex: 55,
        visible: false,
      });

      // Create the map
      this.olMap = new Map({
        target: container,
        layers: [
          // ESRI World Imagery
          new TileLayer({
            source: new XYZ({
              url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
              attributions: "&copy; Esri",
            }),
          }),
          // CartoDB dark labels overlay
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
          center: fromLonLat([initialLon || 2.3522, initialLat || 48.8566]),
          zoom: 7,
          minZoom: 4,
          maxZoom: 16,
        }),
        controls: [],
        interactions: [],
      });

      // Setup handlers unless skipped (for custom Coherent GT handling)
      if (!options?.skipDefaultHandlers) {
        this.setupManualMapDrag(container);
        this.setupMapClickHandler(container);
      }

      // Setup moveend listener (always needed for callbacks)
      this.olMap.on("moveend", () => this.onMapMoveEnd());

      this.mapInitialized = true;
      console.log("[MapManager] Map initialized successfully!");

      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("[MapManager] Map initialization FAILED:", errorMsg);
      if (this.callbacks) {
        this.callbacks.onMapError(errorMsg);
      }
      return false;
    }
  }

  /**
   * Dispose the map and clean up resources
   */
  disposeMap(): void {
    if (this.olMap) {
      this.olMap.setTarget(undefined);
      this.olMap = null;
    }

    this.aircraftFeature = null;
    this.aircraftSource = null;
    this.airportsSource = null;
    this.airportsLayer = null;
    this.factoriesSource = null;
    this.factoriesLayer = null;
    this.helipadsSource = null;
    this.helipadsLayer = null;
    this.mapInitialized = false;
    this.lastLoadedBounds = null;
    this.factoryAirportCoords = {};
    this.loadedAirportIdents = {};

    if (this.mapMoveDebounceTimer !== null) {
      clearTimeout(this.mapMoveDebounceTimer);
      this.mapMoveDebounceTimer = null;
    }

    console.log("[MapManager] Map disposed");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AIRCRAFT POSITION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Update aircraft position on the map
   */
  updateAircraftPosition(lat: number, lon: number, heading: number): void {
    if (!this.aircraftFeature || !this.olMap) return;

    const geometry = this.aircraftFeature.getGeometry();
    if (geometry) {
      geometry.setCoordinates(fromLonLat([lon, lat]));
    }

    // Update rotation
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
  }

  /**
   * Center the map on the aircraft
   */
  centerOnAircraft(lat: number, lon: number): void {
    if (!this.olMap) return;

    const view = this.olMap.getView();
    view.animate({
      center: fromLonLat([lon, lat]),
      duration: 500,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAP BOUNDS & MOVEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get the visible map bounds
   */
  getVisibleBounds(): MapBounds | null {
    if (!this.olMap) return null;

    const view = this.olMap.getView();
    const extent = view.calculateExtent(this.olMap.getSize());

    const bottomLeft = toLonLat([extent[0], extent[1]]);
    const topRight = toLonLat([extent[2], extent[3]]);

    return {
      minLon: bottomLeft[0],
      minLat: bottomLeft[1],
      maxLon: topRight[0],
      maxLat: topRight[1],
    };
  }

  /**
   * Check if airports should be reloaded based on bounds change
   */
  shouldReloadAirports(newBounds: MapBounds): boolean {
    if (!this.lastLoadedBounds) return true;

    const latRange = this.lastLoadedBounds.maxLat - this.lastLoadedBounds.minLat;
    const lonRange = this.lastLoadedBounds.maxLon - this.lastLoadedBounds.minLon;
    const threshold = 0.2;

    const outsideLat = newBounds.minLat < this.lastLoadedBounds.minLat - latRange * threshold ||
                       newBounds.maxLat > this.lastLoadedBounds.maxLat + latRange * threshold;
    const outsideLon = newBounds.minLon < this.lastLoadedBounds.minLon - lonRange * threshold ||
                       newBounds.maxLon > this.lastLoadedBounds.maxLon + lonRange * threshold;

    return outsideLat || outsideLon;
  }

  private onMapMoveEnd(): void {
    if (this.mapMoveDebounceTimer !== null) {
      clearTimeout(this.mapMoveDebounceTimer);
    }

    this.mapMoveDebounceTimer = window.setTimeout(() => {
      this.mapMoveDebounceTimer = null;
      // Notify parent to handle map move (check if reload needed)
      if (this.callbacks) {
        this.callbacks.onMapMoveEnd();
      }
    }, 500);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Set airport filter state
   */
  setAirportFilters(large: boolean, medium: boolean, small: boolean): void {
    this.showLargeAirports = large;
    this.showMediumAirports = medium;
    this.showSmallAirports = small;
  }

  /**
   * Set airports layer visibility
   */
  setAirportsVisible(visible: boolean): void {
    if (this.airportsLayer) {
      this.airportsLayer.setVisible(visible);
    }
  }

  /**
   * Set factories layer visibility
   */
  setFactoriesVisible(visible: boolean): void {
    if (this.factoriesLayer) {
      this.factoriesLayer.setVisible(visible);
    }
  }

  /**
   * Set helipads layer visibility
   */
  setHelipadsVisible(visible: boolean): void {
    if (this.helipadsLayer) {
      this.helipadsLayer.setVisible(visible);
    }
  }

  /**
   * Get (or create) a cached Style for an airport type.
   * Only 6 possible types — each SVG is encoded once and reused.
   */
  private getAirportStyle(type: string): Style {
    if (this.airportStyleCache[type]) return this.airportStyleCache[type];

    const colors: Record<string, string> = {
      "large_airport": "#FF5722",
      "medium_airport": "#FFC107",
      "small_airport": "#FFFFFF",
      "heliport": "#2196F3",
      "seaplane_base": "#00BCD4",
      "closed": "#9E9E9E",
    };
    const sizes: Record<string, number> = {
      "large_airport": 12,
      "medium_airport": 9,
      "small_airport": 6,
      "heliport": 7,
      "seaplane_base": 7,
      "closed": 5,
    };
    const color = colors[type] || "#FFFFFF";
    const size = sizes[type] || 6;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
      <circle cx="14" cy="14" r="${size}" fill="${color}" stroke="#1a1a24" stroke-width="2"/>
    </svg>`;
    const iconUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);

    const style = new Style({ image: new Icon({ src: iconUrl, scale: 1 }) });
    this.airportStyleCache[type] = style;
    return style;
  }

  /**
   * Diff-based airport update: only add new features, remove stale ones.
   * Much faster than clear+recreate when panning.
   */
  updateAirportFeatures(airports: AirportData[]): void {
    if (!this.airportsSource) return;

    // Build set of incoming idents
    const incomingIdents: Record<string, boolean> = {};
    for (const a of airports) {
      const icao = a.ident || a.icao || "";
      if (icao) incomingIdents[icao] = true;
    }

    // Remove features no longer in the result set
    const toRemove: Feature<Point>[] = [];
    this.airportsSource.getFeatures().forEach((f) => {
      const icao = f.get("icao") as string;
      if (!incomingIdents[icao]) {
        toRemove.push(f);
        delete this.loadedAirportIdents[icao];
      }
    });
    for (const f of toRemove) {
      this.airportsSource.removeFeature(f);
    }

    // Add only new airports (skip already loaded)
    let added = 0;
    for (const airport of airports) {
      const icao = airport.ident || airport.icao || "????";
      if (this.loadedAirportIdents[icao]) continue;

      const lat = airport.latitude_deg || airport.lat || 0;
      const lon = airport.longitude_deg || airport.lon || 0;
      if (lat === 0 && lon === 0) continue;

      const type = airport.type || "small_airport";
      const feature = new Feature({
        geometry: new Point(fromLonLat([lon, lat])),
      });

      feature.setStyle(this.getAirportStyle(type));
      feature.set("icao", icao);
      feature.set("name", airport.name || "");
      feature.set("type", type);

      this.airportsSource.addFeature(feature);
      this.loadedAirportIdents[icao] = true;
      added++;
    }

    if (added > 0 || toRemove.length > 0) {
      console.log(`[MapManager] Airports diff: +${added} -${toRemove.length} (total: ${this.airportsSource.getFeatures().length})`);
    }
  }

  /**
   * Full reload: clear everything and load from scratch.
   * Used when toggling airport types on/off.
   */
  loadAirports(airports: AirportData[]): void {
    if (!this.airportsSource) return;

    this.airportsSource.clear();
    this.loadedAirportIdents = {};
    this.updateAirportFeatures(airports);
  }

  /**
   * Filter airports based on visibility settings
   */
  filterAirports(): void {
    if (!this.airportsSource) return;

    this.airportsSource.getFeatures().forEach((feature) => {
      const type = feature.get("type") as string;
      let visible = false;

      if (type === "large_airport" && this.showLargeAirports) visible = true;
      if (type === "medium_airport" && this.showMediumAirports) visible = true;
      if (type === "small_airport" && this.showSmallAirports) visible = true;

      // Hide by setting empty style or show by restoring cached style
      if (!visible) {
        feature.setStyle(this.airportHiddenStyle);
      } else {
        feature.setStyle(this.getAirportStyle(type));
      }
    });
  }

  /**
   * Save last loaded bounds
   */
  setLastLoadedBounds(bounds: MapBounds): void {
    this.lastLoadedBounds = bounds;
  }

  /**
   * Load helipads on the map
   */
  loadHelipads(helipads: AirportData[]): void {
    if (!this.helipadsSource) return;

    this.helipadsSource.clear();

    helipads.forEach((helipad) => {
      const lat = helipad.latitude_deg || helipad.lat || 0;
      const lon = helipad.longitude_deg || helipad.lon || 0;
      const icao = helipad.ident || helipad.icao || "????";
      const type = helipad.type || "heliport";

      if (lat === 0 && lon === 0) return;

      const feature = new Feature({
        geometry: new Point(fromLonLat([lon, lat])),
      });

      // Heliport colors
      const color = type === "seaplane_base" ? "#00BCD4" : "#2196F3";
      const size = 7;

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
        <circle cx="14" cy="14" r="${size}" fill="${color}" stroke="#1a1a24" stroke-width="2"/>
        <text x="14" y="18" text-anchor="middle" font-size="10" font-weight="bold" fill="#1a1a24">H</text>
      </svg>`;
      const iconUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);

      feature.setStyle(
        new Style({
          image: new Icon({ src: iconUrl, scale: 1 }),
        })
      );

      feature.set("icao", icao);
      feature.set("name", helipad.name || "");
      feature.set("type", type);

      this.helipadsSource?.addFeature(feature);
    });

    console.log("[MapManager] Loaded", helipads.length, "helipads");
  }

  /**
   * Compute circle positions for factory icons around an airport
   */
  private getFactoryIconPositions(
    centerLon: number, centerLat: number,
    factoryCount: number, zoom: number
  ): { lon: number; lat: number }[] {
    // Radius in degrees — adapts to zoom for constant visual spacing
    // At zoom 7: ~0.24° (~25km), zoom 10: ~0.03° (~3km), zoom 14: ~0.002°
    const radiusDeg = 0.03 / Math.pow(2, zoom - 10);

    if (factoryCount <= 0) return [];

    // Single factory: place above the airport marker
    if (factoryCount === 1) {
      return [{ lon: centerLon, lat: centerLat + radiusDeg * 0.7 }];
    }

    // Two concentric rings for 8+ factories
    if (factoryCount > 8) {
      const innerCount = Math.ceil(factoryCount / 2);
      const outerCount = factoryCount - innerCount;
      const inner = this.computeRingPositions(centerLon, centerLat, innerCount, radiusDeg);
      const outer = this.computeRingPositions(centerLon, centerLat, outerCount, radiusDeg * 1.8);
      return inner.concat(outer);
    }

    return this.computeRingPositions(centerLon, centerLat, factoryCount, radiusDeg);
  }

  private computeRingPositions(
    centerLon: number, centerLat: number,
    count: number, radiusDeg: number
  ): { lon: number; lat: number }[] {
    const positions: { lon: number; lat: number }[] = [];
    const angleStep = (2 * Math.PI) / count;
    const startAngle = -Math.PI / 2; // Start from top

    for (let i = 0; i < count; i++) {
      const angle = startAngle + (i * angleStep);
      positions.push({
        lon: centerLon + radiusDeg * Math.cos(angle),
        lat: centerLat + radiusDeg * Math.sin(angle) * 0.7, // Mercator correction
      });
    }
    return positions;
  }

  /**
   * Load factories on the map — positioned in circles around airports
   */
  loadFactories(factories: FactoryData[], zoom?: number): void {
    if (!this.factoriesSource) return;

    this.factoriesSource.clear();
    this.factoryAirportCoords = {};

    const currentZoom = zoom || this.olMap?.getView().getZoom() || 10;

    // Group factories by airport
    const byAirport: Record<string, FactoryData[]> = {};
    for (const factory of factories) {
      const lat = factory.latitude || 0;
      const lon = factory.longitude || 0;
      if (lat === 0 && lon === 0) continue;

      const icao = factory.airport_ident;
      if (!byAirport[icao]) {
        byAirport[icao] = [];
        this.factoryAirportCoords[icao] = { lon, lat };
      }
      byAirport[icao].push(factory);
    }

    // Create features with circle positioning
    const icaos = Object.keys(byAirport);
    for (const icao of icaos) {
      const airportFactories = byAirport[icao];
      const coords = this.factoryAirportCoords[icao];
      const positions = this.getFactoryIconPositions(
        coords.lon, coords.lat, airportFactories.length, currentZoom
      );

      for (let i = 0; i < airportFactories.length; i++) {
        const factory = airportFactories[i];
        const pos = positions[i];
        if (!pos) continue;

        const feature = new Feature({
          geometry: new Point(fromLonLat([pos.lon, pos.lat])),
        });

        // Determine icon state
        const state: FactoryIconState = factory.iconState || (
          factory.isNpc ? "npc" :
          factory.isProducing ? "producing" :
          factory.productIconSvg ? "idle" : "empty"
        );

        // Build marker SVG (pass tier for color ring on player factories)
        const tier = factory.tier || 0;
        const svg = this.getFactoryIconSvg(factory.productIconSvg || null, state, tier);
        const iconUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);

        feature.setStyle(
          new Style({
            image: new Icon({ src: iconUrl, scale: 1 }),
          })
        );

        // Feature properties for click handling and repositioning
        feature.set("id", factory.id);
        feature.set("name", factory.name || "");
        feature.set("tier", factory.tier || 0);
        feature.set("airport", icao);
        feature.set("factoryIndex", i);
        feature.set("factoryTotal", airportFactories.length);
        feature.set("isNpc", factory.isNpc || false);
        feature.set("stockCurrent", factory.stockCurrent || 0);
        feature.set("stockMax", factory.stockMax || 0);
        feature.set("itemName", factory.itemName || "");
        feature.set("iconState", state);

        this.factoriesSource?.addFeature(feature);
      }
    }

    console.log("[MapManager] Loaded", factories.length, "factories at", Object.keys(byAirport).length, "airports");
  }

  /**
   * Reposition factory features when zoom changes (constant visual spacing)
   */
  repositionFactoryFeatures(zoom: number): void {
    if (!this.factoriesSource) return;

    // Group features by airport for batch repositioning
    const byAirport: Record<string, Feature<Point>[]> = {};
    for (const feature of this.factoriesSource.getFeatures()) {
      const icao = feature.get("airport") as string;
      if (!byAirport[icao]) byAirport[icao] = [];
      byAirport[icao].push(feature);
    }

    for (const icao of Object.keys(byAirport)) {
      const features = byAirport[icao];
      const coords = this.factoryAirportCoords[icao];
      if (!coords) continue;

      const positions = this.getFactoryIconPositions(
        coords.lon, coords.lat, features.length, zoom
      );

      for (const feature of features) {
        const idx = feature.get("factoryIndex") as number;
        if (positions[idx]) {
          const geom = feature.getGeometry();
          if (geom) {
            geom.setCoordinates(fromLonLat([positions[idx].lon, positions[idx].lat]));
          }
        }
      }
    }
  }

  // Tier border colors (matches RenderHelpers.ts TIER_BORDER_COLORS)
  private static readonly TIER_COLORS: Record<number, string> = {
    0: "#4a5568",  // Gray — NPC/Raw
    1: "#22c55e",  // Green — Common
    2: "#3b82f6",  // Blue — Advanced
    3: "#a855f7",  // Purple — Rare
    4: "#f59e0b",  // Orange — Epic
    5: "#ef4444",  // Red — Legendary
  };

  /**
   * Build factory icon SVG based on state (npc, producing, idle, empty)
   * Player factories (tier >= 1) use tier color for the border
   */
  private getFactoryIconSvg(productSvgRaw: string | null, state: FactoryIconState, tier: number = 0): string {
    const tierColor = MapManager.TIER_COLORS[tier] || "#4a5568";
    const isPlayer = tier >= 1;

    // Style per state
    const styles: Record<FactoryIconState, {
      border: string; borderStyle: string; bg: string;
      opacity: string; filter: string; grayscale: boolean;
    }> = {
      npc:       { border: "#4a5568", borderStyle: "solid", bg: "#1e293b", opacity: "1.0", filter: "", grayscale: false },
      producing: { border: "#22c55e", borderStyle: "solid", bg: "#0d1a2e", opacity: "1.0", filter: `<filter id="glow"><feDropShadow dx="0" dy="0" stdDeviation="2" flood-color="${tierColor}" flood-opacity="0.5"/></filter>`, grayscale: false },
      idle:      { border: "#3b82f6", borderStyle: "solid", bg: "#0d1a2e", opacity: "0.6", filter: `<filter id="gray"><feColorMatrix type="saturate" values="0"/></filter>`, grayscale: true },
      empty:     { border: "#3b82f6", borderStyle: "dashed", bg: "#0d1a2e", opacity: "1.0", filter: "", grayscale: false },
    };

    const s = styles[state];
    // Player factories use tier color for the border
    const borderColor = isPlayer ? tierColor : s.border;

    // Empty state: show "?" text
    if (state === "empty" || !productSvgRaw) {
      const dashArray = s.borderStyle === "dashed" ? ` stroke-dasharray="4 3"` : "";
      return `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
        <rect x="2" y="2" width="32" height="32" rx="6" fill="${s.bg}" stroke="${borderColor}" stroke-width="2"${dashArray}/>
        <text x="18" y="23" text-anchor="middle" font-size="16" font-weight="bold" fill="${borderColor}">?</text>
      </svg>`;
    }

    // Process product SVG
    try {
      let innerSvg = productSvgRaw
        .replace(/<\?xml[^?]*\?>\s*/g, "")
        .trim();

      // Replace <svg ...> tag with positioned/sized version
      innerSvg = innerSvg.replace(
        /<svg[^>]*>/,
        `<svg x="5" y="5" width="26" height="26" viewBox="0 0 64 64">`
      );

      const filterDef = s.filter ? `<defs>${s.filter}</defs>` : "";
      const rectFilterRef = s.filter && !s.grayscale ? ` filter="url(#glow)"` : "";
      const iconFilterRef = s.grayscale ? ` filter="url(#gray)"` : "";

      return `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
        ${filterDef}
        <rect x="2" y="2" width="32" height="32" rx="6" fill="${s.bg}" stroke="${borderColor}" stroke-width="2"${rectFilterRef}/>
        <g opacity="${s.opacity}"${iconFilterRef}>${innerSvg}</g>
      </svg>`;
    } catch (e) {
      // Fallback to empty state
      return this.getFactoryIconSvg(null, "empty", tier);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  private setupManualMapDrag(container: HTMLElement): void {
    if (!this.olMap) return;

    let isDragging = false;
    let lastX = 0;
    let lastY = 0;
    let totalDragDistance = 0;

    container.addEventListener("mousedown", (e: MouseEvent) => {
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      totalDragDistance = 0;
      container.style.cursor = "grabbing";
      e.preventDefault();
    });

    container.addEventListener("mousemove", (e: MouseEvent) => {
      if (!isDragging || !this.olMap) return;

      const deltaX = e.clientX - lastX;
      const deltaY = e.clientY - lastY;
      totalDragDistance += Math.abs(deltaX) + Math.abs(deltaY);

      const view = this.olMap.getView();
      const resolution = view.getResolution() || 1;
      const center = view.getCenter();

      if (center) {
        view.setCenter([
          center[0] - deltaX * resolution,
          center[1] + deltaY * resolution,
        ]);
      }

      lastX = e.clientX;
      lastY = e.clientY;
    });

    container.addEventListener("mouseup", () => {
      isDragging = false;
      container.style.cursor = "grab";
    });

    container.addEventListener("mouseleave", () => {
      isDragging = false;
      container.style.cursor = "grab";
    });

    // Wheel zoom
    container.addEventListener("wheel", (e: WheelEvent) => {
      if (!this.olMap) return;
      e.preventDefault();

      const view = this.olMap.getView();
      const currentZoom = view.getZoom() || 7;
      const delta = e.deltaY > 0 ? -0.5 : 0.5;
      const newZoom = Math.max(4, Math.min(16, currentZoom + delta));

      view.animate({ zoom: newZoom, duration: 100 });
    });

    container.style.cursor = "grab";
  }

  private setupMapClickHandler(container: HTMLElement): void {
    container.addEventListener("click", (e: MouseEvent) => {
      if (!this.olMap || !this.callbacks) return;

      const pixel = this.olMap.getEventPixel(e);
      const features = this.olMap.getFeaturesAtPixel(pixel);

      if (features && features.length > 0) {
        const feature = features[0] as Feature<Point>;
        const icao = feature.get("icao") as string;
        const name = feature.get("name") as string;
        const type = feature.get("type") as string;

        if (icao) {
          const geom = feature.getGeometry();
          if (geom) {
            const coords = toLonLat(geom.getCoordinates());
            this.callbacks.onAirportClick(icao, name, type, coords[1], coords[0]);
          }
        }
      }
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const mapManager = new MapManager();
