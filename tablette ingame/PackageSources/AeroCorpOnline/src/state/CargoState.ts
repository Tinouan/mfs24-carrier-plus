/**
 * CargoState - Cargo management and transfer popup state
 * Extracted from AeroCorpOnline.tsx for better maintainability
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

// V4.1: Cargo source filter type
export type CargoSourceFilter = "player" | "company";

export interface CargoStateType {
  // Aircraft cargo info
  aircraftCargoWeight: Subject<number>;
  aircraftCargoCapacity: Subject<number>;

  // V4.1: Passengers state
  aircraftPassengerSeats: Subject<number>;
  aircraftPassengerCount: Subject<number>;
  aircraftPassengerWeight: Subject<number>;

  // Loading state
  cargoLoading: Subject<boolean>;

  // V4.1: Cargo source filter (player or company inventory)
  cargoSourceFilter: Subject<CargoSourceFilter>;

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

  // V4.1: Passengers state
  aircraftPassengerSeats: Subject.create(0),
  aircraftPassengerCount: Subject.create(0),
  aircraftPassengerWeight: Subject.create(0),

  // Loading state
  cargoLoading: Subject.create(false),

  // V4.1: Cargo source filter (player or company inventory)
  cargoSourceFilter: Subject.create<CargoSourceFilter>("player"),

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

// V4.1: Passengers helpers
export const getPassengerSeats = (): number => cargoState.aircraftPassengerSeats.get();
export const getPassengerCount = (): number => cargoState.aircraftPassengerCount.get();
export const getPassengerWeight = (): number => cargoState.aircraftPassengerWeight.get();
export const getCargoSourceFilter = (): CargoSourceFilter => cargoState.cargoSourceFilter.get();

export const setCargoSourceFilter = (filter: CargoSourceFilter): void => {
  cargoState.cargoSourceFilter.set(filter);
};

export const setPassengerInfo = (seats: number, count: number, weight: number): void => {
  cargoState.aircraftPassengerSeats.set(seats);
  cargoState.aircraftPassengerCount.set(count);
  cargoState.aircraftPassengerWeight.set(weight);
};
