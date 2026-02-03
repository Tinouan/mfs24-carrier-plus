/**
 * InventoryState - Inventory items and status
 * Extracted from CarrierPlus.tsx for better maintainability
 */

import { Subject } from "@microsoft/msfs-sdk";
import type { LoadingStatus } from "../types";

// ═══════════════════════════════════════════════════════════
// INVENTORY TYPE
// ═══════════════════════════════════════════════════════════

export type InventoryOwnerType = "player" | "company";

// ═══════════════════════════════════════════════════════════
// INVENTORY STATE TYPE
// ═══════════════════════════════════════════════════════════

// Inventory item structure for P2P persistence
export interface LocalInventoryItem {
  id: string;
  location_type: "aircraft" | "airport" | "warehouse";
  location_id: string;
  item_code: string;
  quantity: number;
}

export interface InventoryStateType {
  inventoryStatus: Subject<LoadingStatus>;
  inventoryError: Subject<string | null>;
  inventoryType: Subject<InventoryOwnerType>;

  // P2P persistence: actual items list
  inventoryItems: Subject<LocalInventoryItem[]>;
}

// ═══════════════════════════════════════════════════════════
// STATE INSTANCE
// ═══════════════════════════════════════════════════════════

export const inventoryState: InventoryStateType = {
  inventoryStatus: Subject.create<LoadingStatus>("idle"),
  inventoryError: Subject.create<string | null>(null),
  inventoryType: Subject.create<InventoryOwnerType>("player"),

  // P2P persistence: actual items list
  inventoryItems: Subject.create<LocalInventoryItem[]>([]),
};

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

export const isInventoryLoading = (): boolean => inventoryState.inventoryStatus.get() === "loading";
export const getInventoryType = (): InventoryOwnerType => inventoryState.inventoryType.get();
