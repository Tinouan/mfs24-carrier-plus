/**
 * InventoryState - Inventory items and status
 * Extracted from WorldOfAircraft.tsx for better maintainability
 */

import { Subject } from "@microsoft/msfs-sdk";
import type { LoadingStatus, ProfileInventoryItem } from "../types";

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

  // Profile inventory (for display in Profile tab)
  profileInventory: Subject<ProfileInventoryItem[]>;
  profileInventoryLoading: Subject<boolean>;
  profileIcaoFilter: Subject<string>;
  profileItemFilter: Subject<string>;
  profileTierFilter: Subject<number | null>;  // null = all tiers
  profileOwnerFilter: Subject<"all" | "player" | "company">;  // V4.1: Ownership filter

  // Company inventory (for display in Company tab)
  companyInventory: Subject<ProfileInventoryItem[]>;
  companyInventoryLoading: Subject<boolean>;
  companyIcaoFilter: Subject<string>;
  companyItemFilter: Subject<string>;
  companyTierFilter: Subject<number | null>;  // null = all tiers
  companyOwnerFilter: Subject<"all" | "player" | "company">;  // V4.1: Ownership filter

  // Market inventory (for display in Market > Inventory tab)
  marketInventory: Subject<ProfileInventoryItem[]>;
  marketInventoryLoading: Subject<boolean>;
  marketInvIcaoFilter: Subject<string>;
  marketInvItemFilter: Subject<string>;
  marketInvTierFilter: Subject<number | null>;
  marketInvOwnerFilter: Subject<"all" | "player" | "company">;
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

  // Profile inventory (for display in Profile tab)
  profileInventory: Subject.create<ProfileInventoryItem[]>([]),
  profileInventoryLoading: Subject.create(false),
  profileIcaoFilter: Subject.create<string>(""),
  profileItemFilter: Subject.create<string>(""),
  profileTierFilter: Subject.create<number | null>(null),  // null = all tiers
  profileOwnerFilter: Subject.create<"all" | "player" | "company">("all"),  // V4.1: Ownership filter

  // Company inventory (for display in Company tab)
  companyInventory: Subject.create<ProfileInventoryItem[]>([]),
  companyInventoryLoading: Subject.create(false),
  companyIcaoFilter: Subject.create<string>(""),
  companyItemFilter: Subject.create<string>(""),
  companyTierFilter: Subject.create<number | null>(null),  // null = all tiers
  companyOwnerFilter: Subject.create<"all" | "player" | "company">("all"),  // V4.1: Ownership filter

  // Market inventory (for display in Market > Inventory tab)
  marketInventory: Subject.create<ProfileInventoryItem[]>([]),
  marketInventoryLoading: Subject.create(false),
  marketInvIcaoFilter: Subject.create<string>(""),
  marketInvItemFilter: Subject.create<string>(""),
  marketInvTierFilter: Subject.create<number | null>(null),
  marketInvOwnerFilter: Subject.create<"all" | "player" | "company">("all"),
};

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

export const isInventoryLoading = (): boolean => inventoryState.inventoryStatus.get() === "loading";
export const getInventoryType = (): InventoryOwnerType => inventoryState.inventoryType.get();
