/**
 * Views barrel export
 * Centralized export of all tab view render functions
 */

// Settings Tab
export { renderSettingsTab } from "./SettingsView";
export type { SettingsViewProps } from "./SettingsView";

// Profile Tab
export { renderProfileTab } from "./ProfileView";
export type { ProfileViewProps } from "./ProfileView";

// Inventory Tab
export { renderInventoryTab } from "./InventoryView";
export type { InventoryViewProps } from "./InventoryView";

// Market Tab
export { renderMarketTab } from "./MarketView";
export type { MarketViewProps } from "./MarketView";

// Hangar Tab
export { renderHangarTab } from "./HangarView";
export type { HangarViewProps } from "./HangarView";

// Map Tab
export { renderMapTab } from "./MapView";
export type { MapViewProps } from "./MapView";

// Company Tab
export { renderCompanyTab } from "./CompanyView";
export type { CompanyViewProps } from "./CompanyView";

// Missions Tab
export { renderMissionsTab } from "./MissionsView";
export type { MissionsViewProps, CargoPopupItem } from "./MissionsView";

// Free Flight Tab (Career Mode)
export { renderFreeFlightView } from "./FreeFlightView";
export type { FreeFlightViewProps } from "./FreeFlightView";
