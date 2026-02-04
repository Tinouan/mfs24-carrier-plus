/**
 * CargoState - Cargo management and transfer popup state
 * Extracted from WorldOfAircraft.tsx for better maintainability
 */

import { Subject } from "@microsoft/msfs-sdk";
import type { CargoPopupItem } from "../types";

// ═══════════════════════════════════════════════════════════
// CARGO DIRECTION TYPE
// ═══════════════════════════════════════════════════════════

export type CargoDirection = "load" | "unload";

// ═══════════════════════════════════════════════════════════
// CARGO STATE TYPE
// ═══════════════════════════════════════════════════════════

export interface CargoStateType {
  // Aircraft cargo info
  aircraftCargoWeight: Subject<number>;
  aircraftCargoCapacity: Subject<number>;

  // Loading state
  cargoLoading: Subject<boolean>;

  // Cargo transfer popup
  showCargoPopup: Subject<boolean>;
  cargoPopupDirection: Subject<CargoDirection>;
  cargoPopupItem: Subject<CargoPopupItem | null>;
  cargoPopupQty: Subject<number>;
}

// ═══════════════════════════════════════════════════════════
// STATE INSTANCE
// ═══════════════════════════════════════════════════════════

export const cargoState: CargoStateType = {
  // Aircraft cargo info
  aircraftCargoWeight: Subject.create(0),
  aircraftCargoCapacity: Subject.create(0),

  // Loading state
  cargoLoading: Subject.create(false),

  // Cargo transfer popup
  showCargoPopup: Subject.create(false),
  cargoPopupDirection: Subject.create<CargoDirection>("load"),
  cargoPopupItem: Subject.create<CargoPopupItem | null>(null),
  cargoPopupQty: Subject.create(1),
};

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

export const getCargoWeight = (): number => cargoState.aircraftCargoWeight.get();
export const getCargoCapacity = (): number => cargoState.aircraftCargoCapacity.get();
export const getCargoPercentage = (): number => {
  const capacity = cargoState.aircraftCargoCapacity.get();
  if (capacity <= 0) return 0;
  return Math.round((cargoState.aircraftCargoWeight.get() / capacity) * 100);
};

export const openCargoPopup = (item: CargoPopupItem, direction: CargoDirection): void => {
  cargoState.cargoPopupItem.set(item);
  cargoState.cargoPopupDirection.set(direction);
  cargoState.cargoPopupQty.set(1);
  cargoState.showCargoPopup.set(true);
};

export const closeCargoPopup = (): void => {
  cargoState.showCargoPopup.set(false);
  cargoState.cargoPopupItem.set(null);
};
