/**
 * PopupState - Popup and modal visibility state
 * Extracted from WorldOfAircraft.tsx for better maintainability
 */

import { Subject } from "@microsoft/msfs-sdk";

// ═══════════════════════════════════════════════════════════
// POPUP STATE TYPE
// ═══════════════════════════════════════════════════════════

export interface PopupStateType {
  // Refuel popup
  showRefuelPopup: Subject<boolean>;
  refuelTargetGallons: Subject<number>;

  // Systems detail popup
  showSystemsPopup: Subject<boolean>;

  // Checkpoints helper popup
  showCheckpointsPopup: Subject<boolean>;

  // Mission recap
  showMissionRecap: Subject<boolean>;

  // Hangar popups
  hangarRepairPopupOpen: Subject<boolean>;
  hangarEditRegPopupOpen: Subject<boolean>;
  hangarEditRegValue: Subject<string>;

  // Notification
  popupNotification: Subject<string>;
}

// ═══════════════════════════════════════════════════════════
// STATE INSTANCE
// ═══════════════════════════════════════════════════════════

export const popupState: PopupStateType = {
  // Refuel popup
  showRefuelPopup: Subject.create(false),
  refuelTargetGallons: Subject.create(0),

  // Systems detail popup
  showSystemsPopup: Subject.create(false),

  // Checkpoints helper popup
  showCheckpointsPopup: Subject.create(false),

  // Mission recap
  showMissionRecap: Subject.create(false),

  // Hangar popups
  hangarRepairPopupOpen: Subject.create(false),
  hangarEditRegPopupOpen: Subject.create(false),
  hangarEditRegValue: Subject.create(""),

  // Notification
  popupNotification: Subject.create(""),
};

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

export const showNotification = (message: string): void => {
  popupState.popupNotification.set(message);
};

export const clearNotification = (): void => {
  popupState.popupNotification.set("");
};
