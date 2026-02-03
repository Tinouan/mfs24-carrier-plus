/**
 * Components - Popup HTML generators and UI helpers
 */

export {
  renderRefuelPopupHtml,
  renderSystemsPopupHtml,
  renderRepairListHtml,
  getGaugeColor,
  getFuelGaugeColor,
  type RefuelPopupData,
  type SystemsPopupData,
  type RepairItemData,
} from "./PopupHelpers";

// V2.3: Extracted render components
export { renderSidebarTab, TAB_ICONS, type SidebarTabProps } from "./SidebarTab";
export { renderLoginPanel, type LoginPanelProps } from "./LoginPanel";
export { renderLogoutConfirmPopup, type LogoutConfirmPopupProps } from "./LogoutConfirmPopup";
export { renderMissionRecapPopup, type MissionRecapPopupProps } from "./MissionRecapPopup";
export { renderCargoTransferPopup, type CargoTransferPopupProps, type CargoPopupItem } from "./CargoTransferPopup";
export { renderMissionTrackingPanel, type MissionTrackingPanelProps } from "./MissionTrackingPanel";
export { renderFreeFlightPanel, type FreeFlightPanelProps } from "./FreeFlightPanel";
export { renderWelcomePopup, type WelcomePopupProps } from "./WelcomePopup";
