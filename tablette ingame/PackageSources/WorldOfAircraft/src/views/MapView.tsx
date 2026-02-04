/**
 * MapView - Map tab render function with OpenLayers integration
 * Extracted from WorldOfAircraft.tsx for better maintainability
 */
import { FSComponent, VNode, Subject, MappedSubject, NodeReference } from "@microsoft/msfs-sdk";
import { Button } from "@efb/efb-api";
import type { Language, LoadingStatus, AirportInfo, FactoryAtAirport, DestinationAirport } from "../types";

// Import translations
import frTranslations from "../locales/fr.json";
import enTranslations from "../locales/en.json";
import deTranslations from "../locales/de.json";
import esTranslations from "../locales/es.json";
import ruTranslations from "../locales/ru.json";

const translations = {
  en: enTranslations,
  fr: frTranslations,
  de: deTranslations,
  es: esTranslations,
  ru: ruTranslations,
} as const;

/**
 * Props interface for MapView
 */
export interface MapViewProps {
  activeTab: Subject<string>;
  currentLanguage: Subject<Language>;
  mapContainerRef: NodeReference<HTMLDivElement>;
  mapError: Subject<string | null>;
  // Airport toggles
  showLargeAirports: Subject<boolean>;
  showMediumAirports: Subject<boolean>;
  showSmallAirports: Subject<boolean>;
  showFactoriesOnMap: Subject<boolean>;
  showHelipadsOnMap: Subject<boolean>;
  largeAirportsStatus: Subject<LoadingStatus>;
  mediumAirportsStatus: Subject<LoadingStatus>;
  smallAirportsStatus: Subject<LoadingStatus>;
  factoriesOnMapStatus: Subject<LoadingStatus>;
  helipadsOnMapStatus: Subject<LoadingStatus>;
  // ICAO Search
  icaoSearchInputRef: NodeReference<HTMLInputElement>;
  icaoSearchStatus: Subject<LoadingStatus>;
  icaoSearchError: Subject<string | null>;
  // Nearby airports
  showAirportsSidebar: Subject<boolean>;
  nearbyAirportsStatus: Subject<LoadingStatus>;
  nearbyAirportsListRef: NodeReference<HTMLDivElement>;
  // Airport context menu
  selectedAirport: Subject<AirportInfo | null>;
  destinationAirport: Subject<DestinationAirport | null>;
  availableSlotsAtAirport: Subject<number | null>;
  myFactoriesAtAirport: Subject<FactoryAtAirport[]>;
  // Callbacks
  onCenterMapOnAircraft: () => void;
  onToggleLargeAirports: () => void;
  onToggleMediumAirports: () => void;
  onToggleSmallAirports: () => void;
  onToggleFactoriesOnMap: () => void;
  onToggleHelipadsOnMap: () => void;
  onSearchAirportByIcao: () => void;
  onFetchNearbyAirports: () => void;
  onOpenCreateFactory: (airport: AirportInfo) => void;
  onOpenManageFactory: (factory: FactoryAtAirport) => void;
  onSetDestinationAirport: (airport: AirportInfo) => void;
  t: (category: string, key: string) => string;
}

/**
 * Render the Map tab content
 */
export function renderMapTab(props: MapViewProps): VNode {
  const {
    activeTab,
    currentLanguage,
    mapContainerRef,
    mapError,
    showLargeAirports,
    showMediumAirports,
    showSmallAirports,
    showFactoriesOnMap,
    showHelipadsOnMap,
    largeAirportsStatus,
    mediumAirportsStatus,
    smallAirportsStatus,
    factoriesOnMapStatus,
    helipadsOnMapStatus,
    icaoSearchInputRef,
    icaoSearchStatus,
    icaoSearchError,
    showAirportsSidebar,
    nearbyAirportsStatus,
    nearbyAirportsListRef,
    selectedAirport,
    destinationAirport,
    availableSlotsAtAirport,
    myFactoriesAtAirport,
    onCenterMapOnAircraft,
    onToggleLargeAirports,
    onToggleMediumAirports,
    onToggleSmallAirports,
    onToggleFactoriesOnMap,
    onToggleHelipadsOnMap,
    onSearchAirportByIcao,
    onFetchNearbyAirports,
    onOpenCreateFactory,
    onOpenManageFactory,
    onSetDestinationAirport,
    t,
  } = props;

  return (
    <div style={activeTab.map(tab => tab === "map"
      ? "position: absolute; top: 0; left: 0; right: 0; bottom: 0; overflow: hidden; display: flex; flex-direction: column;"
      : "display: none;")}>

      {/* Map Controls Header (sub-tabs style) */}
      <div style="display: flex; justify-content: center; align-items: center; padding: 10px 12px; background: #252532; border-bottom: 1px solid #374151; flex-shrink: 0;">
        <div style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center;">
          {/* Center on aircraft */}
          <Button callback={(): void => { onCenterMapOnAircraft(); }}>
            <div style="padding: 6px 12px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white;">
              {currentLanguage.map(l => translations[l].map.center)}
            </div>
          </Button>
          {/* Toggle: Large airports */}
          <Button callback={(): void => { onToggleLargeAirports(); }}>
            <div style={showLargeAirports.map(show => show
              ? "padding: 6px 12px; background: #FF5722; border: 1px solid #FF5722; border-radius: 6px; font-size: 11px; color: #1a1a24; font-weight: 600;"
              : "padding: 6px 12px; background: rgba(255, 87, 34, 0.2); border: 1px solid #FF5722; border-radius: 6px; font-size: 11px; color: white;")}>
              {MappedSubject.create(([s, l]) => s === "loading" ? "..." : translations[l].map.large, largeAirportsStatus, currentLanguage)}
            </div>
          </Button>
          {/* Toggle: Medium airports */}
          <Button callback={(): void => { onToggleMediumAirports(); }}>
            <div style={showMediumAirports.map(show => show
              ? "padding: 6px 12px; background: #FFC107; border: 1px solid #FFC107; border-radius: 6px; font-size: 11px; color: #1a1a24; font-weight: 600;"
              : "padding: 6px 12px; background: rgba(255, 193, 7, 0.2); border: 1px solid #FFC107; border-radius: 6px; font-size: 11px; color: white;")}>
              {MappedSubject.create(([s, l]) => s === "loading" ? "..." : translations[l].map.medium, mediumAirportsStatus, currentLanguage)}
            </div>
          </Button>
          {/* Toggle: Small airports */}
          <Button callback={(): void => { onToggleSmallAirports(); }}>
            <div style={showSmallAirports.map(show => show
              ? "padding: 6px 12px; background: #22c55e; border: 1px solid #22c55e; border-radius: 6px; font-size: 11px; color: #1a1a24; font-weight: 600;"
              : "padding: 6px 12px; background: rgba(34, 197, 94, 0.2); border: 1px solid #22c55e; border-radius: 6px; font-size: 11px; color: white;")}>
              {MappedSubject.create(([s, l]) => s === "loading" ? "..." : translations[l].map.small, smallAirportsStatus, currentLanguage)}
            </div>
          </Button>
          {/* Toggle factories on map */}
          <Button callback={(): void => { onToggleFactoriesOnMap(); }}>
            <div style={showFactoriesOnMap.map(show => show
              ? "padding: 6px 12px; background: #a855f7; border: 1px solid #a855f7; border-radius: 6px; font-size: 11px; color: #1a1a24; font-weight: 600;"
              : "padding: 6px 12px; background: rgba(168, 85, 247, 0.2); border: 1px solid #a855f7; border-radius: 6px; font-size: 11px; color: white;")}>
              {factoriesOnMapStatus.map(s => s === "loading" ? "..." : "FAC")}
            </div>
          </Button>
          {/* Toggle helipads on map */}
          <Button callback={(): void => { onToggleHelipadsOnMap(); }}>
            <div style={showHelipadsOnMap.map(show => show
              ? "padding: 6px 12px; background: #2196F3; border: 1px solid #2196F3; border-radius: 6px; font-size: 11px; color: #1a1a24; font-weight: 600;"
              : "padding: 6px 12px; background: rgba(33, 150, 243, 0.2); border: 1px solid #2196F3; border-radius: 6px; font-size: 11px; color: white;")}>
              {helipadsOnMapStatus.map(s => s === "loading" ? "..." : "HELI")}
            </div>
          </Button>
        </div>
      </div>

      {/* ICAO Search Bar */}
      <div style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: #1a1a24; border-bottom: 1px solid #374151; flex-shrink: 0;">
        <input
          type="text"
          ref={icaoSearchInputRef}
          placeholder={t("map", "searchIcao")}
          style="flex: 1; background: #252532; border: 1px solid #374151; border-radius: 6px; padding: 6px 10px; color: white; font-size: 11px; text-transform: uppercase;"
          onkeydown={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
          onkeyup={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
          onkeypress={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
        />
        <Button callback={(): void => { onSearchAirportByIcao(); }}>
          <div style={icaoSearchStatus.map(s => s === "loading"
            ? "padding: 6px 12px; background: #374151; border: 1px solid #374151; border-radius: 6px; font-size: 11px; color: #9ca3af;"
            : "padding: 6px 12px; background: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white; font-weight: 600;")}>
            {icaoSearchStatus.map(s => s === "loading" ? "..." : "GO")}
          </div>
        </Button>
      </div>

      {/* ICAO Search Error */}
      <div style={icaoSearchError.map(e => e
        ? "background: rgba(239, 68, 68, 0.15); border-bottom: 1px solid #ef4444; padding: 6px 12px; flex-shrink: 0;"
        : "display: none;")}>
        <span style="color: #ef4444; font-size: 10px;">{icaoSearchError}</span>
      </div>

      {/* Map Error Display */}
      <div style={mapError.map(e => e
        ? "background: rgba(239, 68, 68, 0.15); border-bottom: 1px solid #ef4444; padding: 8px 12px; flex-shrink: 0;"
        : "display: none;")}>
        <span style="color: #ef4444; font-size: 11px;">{mapError}</span>
      </div>

      {/* OpenLayers Map Container */}
      <div
        ref={mapContainerRef}
        style="flex: 1; width: 100%; min-height: 200px; background: #0a0a0f;"
      />

      {/* Nearby Airports Sidebar - toggleable */}
      <div style={showAirportsSidebar.map(show => show
        ? "position: absolute; right: 8px; top: 52px; width: 180px; max-height: calc(100% - 60px); background: rgba(37, 37, 50, 0.95); border-radius: 8px; border: 1px solid #374151; overflow: hidden; display: flex; flex-direction: column;"
        : "display: none;")}>
        <div style="padding: 8px 10px; background: #1a1a24; border-bottom: 1px solid #374151; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 10px; color: #6b7280; text-transform: uppercase;">{currentLanguage.map(l => translations[l].map.nearbyAirports)}</span>
          <Button callback={(): void => { onFetchNearbyAirports(); }} disabled={nearbyAirportsStatus.map(s => s === "loading")}>
            <div style="font-size: 9px; color: #60a5fa; padding: 2px 6px; background: rgba(59, 130, 246, 0.2); border-radius: 3px;">
              {nearbyAirportsStatus.map(s => s === "loading" ? "..." : "Refresh")}
            </div>
          </Button>
        </div>
        <div ref={nearbyAirportsListRef} style="padding: 8px; overflow-y: auto; flex: 1;">
          <div style="color: #9ca3af; font-size: 10px; text-align: center; padding: 8px;">
            {currentLanguage.map(l => translations[l].common.loading)}
          </div>
        </div>
      </div>

      {/* Airport Context Menu */}
      <div style={selectedAirport.map(airport => airport
        ? "position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #1e2433; border: 2px solid #3b82f6; border-radius: 16px; min-width: 280px; z-index: 1000; box-shadow: 0 12px 40px rgba(0,0,0,0.7);"
        : "display: none;")}>

        {/* Close Button - separate row aligned right */}
        <div style="display: flex; justify-content: flex-end; padding: 10px 10px 0 10px;">
          <Button callback={(): void => { selectedAirport.set(null); }}>
            <div style="width: 28px; height: 28px; background: #374151; border-radius: 14px; color: #9ca3af; font-size: 14px; line-height: 28px; text-align: center;">
              X
            </div>
          </Button>
        </div>

        {/* Menu Header */}
        <div style="padding: 0 20px 16px 20px; text-align: center; border-bottom: 1px solid #374151;">
          <div style="font-size: 28px; font-weight: 700; color: #60a5fa; font-family: monospace; letter-spacing: 3px;">
            {selectedAirport.map(a => a?.icao || "")}
          </div>
          <div style="font-size: 14px; color: #e5e7eb; margin-top: 8px; font-weight: 500;">
            {selectedAirport.map(a => a?.name || "")}
          </div>
          <div style="display: inline-block; margin-top: 10px; padding: 5px 14px; background: #2d3748; border-radius: 14px; font-size: 11px; color: #93c5fd; text-transform: capitalize;">
            {selectedAirport.map(a => a?.type?.replace(/_/g, " ") || "")}
          </div>
        </div>

        {/* Menu Actions */}
        <div style="padding: 12px 16px; text-align: center;">
          {/* Create Factory Button */}
          <div style="margin: 6px 0; text-align: center;">
            <Button callback={(): void => {
              const airport = selectedAirport.get();
              if (airport) onOpenCreateFactory(airport);
            }}>
              <div style="display: inline-block; padding: 12px 40px; background: #3b82f6; border-radius: 8px; color: #ffffff; font-size: 13px; font-weight: 600;">
                {MappedSubject.create(([slots, l]) => slots !== null ? `${translations[l].map.createFactory} (${slots})` : translations[l].map.createFactory, availableSlotsAtAirport, currentLanguage)}
              </div>
            </Button>
          </div>

          {/* Manage Factory Button - only if user has factories here */}
          <div style={myFactoriesAtAirport.map(factories => factories.length > 0
            ? "margin: 6px 0; text-align: center;"
            : "display: none;")}>
            <Button callback={(): void => {
              const factories = myFactoriesAtAirport.get();
              if (factories.length > 0) onOpenManageFactory(factories[0]);
            }}>
              <div style="display: inline-block; padding: 12px 40px; background: #a855f7; border-radius: 8px; color: #ffffff; font-size: 13px; font-weight: 600;">
                {MappedSubject.create(([f, l]) => `${translations[l].map.manageFactory} (${f.length})`, myFactoriesAtAirport, currentLanguage)}
              </div>
            </Button>
          </div>

          {/* Set Destination Button */}
          <div style="margin: 6px 0; text-align: center;">
            <Button callback={(): void => {
              const airport = selectedAirport.get();
              if (airport) onSetDestinationAirport(airport);
            }}>
              <div style="display: inline-block; padding: 12px 40px; background: #22c55e; border-radius: 8px; color: #1a1a24; font-size: 13px; font-weight: 600;">
                {currentLanguage.map(l => translations[l].map.setDestination)}
              </div>
            </Button>
          </div>
        </div>

        {/* Current Destination Display */}
        <div style={destinationAirport.map(dest => dest
          ? "padding: 12px 20px; border-top: 1px solid #374151; text-align: center; font-size: 12px; color: #6b7280;"
          : "display: none;")}>
          {currentLanguage.map(l => translations[l].map.currentDestination)}:
          <span style="color: #22c55e; font-family: monospace; font-weight: 600; margin-left: 6px;">
            {destinationAirport.map(d => d?.icao || "")}
          </span>
        </div>
      </div>
    </div>
  );
}
