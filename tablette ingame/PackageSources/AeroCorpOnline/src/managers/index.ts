/**
 * Managers - Business logic managers extracted from AeroCorpOnline.tsx
 */

// Tracking Manager
export { trackingManager } from "./TrackingManager";
export type { TrackingState, TrackingCallbacks } from "./TrackingManager";

// Map Manager
export { mapManager } from "./MapManager";
export type { MapBounds, AirportData, FactoryData, MapCallbacks } from "./MapManager";

// Mission Creation Manager
export { missionCreationManager } from "./MissionCreationManager";
export type { FlightPlanData, PayloadState, MissionCreationCallbacks } from "./MissionCreationManager";

// Free Flight Manager removed — replaced by FlightTracker service

// Database Manager (P2P local storage)
export { DatabaseManager } from "./DatabaseManager";
export type {
  DatabaseCallbacks,
  Player,
  Company,
  Aircraft,
  InventoryItem,
  MarketOrder,
  Mission,
  FreeFlightSession,
  Item,
  Recipe,
} from "./DatabaseManager";

// Persistence Manager (States ↔ DB sync)
export { PersistenceManager } from "./PersistenceManager";

// Network Manager (P2P connection management)
export { NetworkManager } from "./NetworkManager";
export type { NetworkState, PeerInfo, NetworkCallbacks } from "./NetworkManager";

// Popup Manager (centralized popup logic)
export { popupManager } from "./PopupManager";
export type { PopupCallbacks } from "./PopupManager";
