/**
 * MapState - Map layer toggles and airport selection
 * Extracted from AeroCorpOnline.tsx for better maintainability
 */

import { Subject } from "@microsoft/msfs-sdk";
import type { LoadingStatus, SelectedAirport, DestinationAirport, FactoryAtAirport } from "../types";

// ═══════════════════════════════════════════════════════════
// MAP STATE TYPE
// ═══════════════════════════════════════════════════════════

export interface MapStateType {
  // Map errors
  mapError: Subject<string | null>;

  // Layer visibility toggles
  showFactoriesOnMap: Subject<boolean>;
  showHelipadsOnMap: Subject<boolean>;
  showLargeAirports: Subject<boolean>;
  showMediumAirports: Subject<boolean>;
  showSmallAirports: Subject<boolean>;

  // Layer loading status
  largeAirportsStatus: Subject<LoadingStatus>;
  mediumAirportsStatus: Subject<LoadingStatus>;
  smallAirportsStatus: Subject<LoadingStatus>;
  factoriesOnMapStatus: Subject<LoadingStatus>;
  helipadsOnMapStatus: Subject<LoadingStatus>;

  // Airport context menu
  selectedAirport: Subject<SelectedAirport | null>;
  myFactoriesAtAirport: Subject<FactoryAtAirport[]>;
  availableSlotsAtAirport: Subject<number | null>;
  destinationAirport: Subject<DestinationAirport | null>;

  // Sidebar
  showAirportsSidebar: Subject<boolean>;

  // ICAO search
  icaoSearchStatus: Subject<LoadingStatus>;
  icaoSearchError: Subject<string | null>;

  // Nearby airports
  nearbyAirportsStatus: Subject<LoadingStatus>;
  nearbyAirportsError: Subject<string | null>;

  // NPC factory tooltip (shown on map click)
  npcFactoryTooltip: Subject<{
    name: string;
    itemName: string;
    stockCurrent: number;
    stockMax: number;
    x: number;
    y: number;
  } | null>;
}

// ═══════════════════════════════════════════════════════════
// STATE INSTANCE
// ═══════════════════════════════════════════════════════════

export const mapState: MapStateType = {
  // Map errors
  mapError: Subject.create<string | null>(null),

  // Layer visibility toggles
  showFactoriesOnMap: Subject.create(false),
  showHelipadsOnMap: Subject.create(true),
  showLargeAirports: Subject.create(true),
  showMediumAirports: Subject.create(true),
  showSmallAirports: Subject.create(true),

  // Layer loading status
  largeAirportsStatus: Subject.create<LoadingStatus>("idle"),
  mediumAirportsStatus: Subject.create<LoadingStatus>("idle"),
  smallAirportsStatus: Subject.create<LoadingStatus>("idle"),
  factoriesOnMapStatus: Subject.create<LoadingStatus>("idle"),
  helipadsOnMapStatus: Subject.create<LoadingStatus>("idle"),

  // Airport context menu
  selectedAirport: Subject.create<SelectedAirport | null>(null),
  myFactoriesAtAirport: Subject.create<FactoryAtAirport[]>([]),
  availableSlotsAtAirport: Subject.create<number | null>(null),
  destinationAirport: Subject.create<DestinationAirport | null>(null),

  // Sidebar
  showAirportsSidebar: Subject.create(false),

  // ICAO search
  icaoSearchStatus: Subject.create<LoadingStatus>("idle"),
  icaoSearchError: Subject.create<string | null>(null),

  // Nearby airports
  nearbyAirportsStatus: Subject.create<LoadingStatus>("idle"),
  nearbyAirportsError: Subject.create<string | null>(null),

  // NPC factory tooltip
  npcFactoryTooltip: Subject.create<{
    name: string;
    itemName: string;
    stockCurrent: number;
    stockMax: number;
    x: number;
    y: number;
  } | null>(null),
};

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

export const getSelectedAirport = (): SelectedAirport | null => mapState.selectedAirport.get();
export const clearSelectedAirport = (): void => mapState.selectedAirport.set(null);
