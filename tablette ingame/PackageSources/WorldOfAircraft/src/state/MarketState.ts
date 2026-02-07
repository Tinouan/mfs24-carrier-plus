/**
 * MarketState - Market listings and buy popup state
 * Extracted from WorldOfAircraft.tsx for better maintainability
 */

import { Subject } from "@microsoft/msfs-sdk";
import type { MarketListing, MarketBuyItem } from "../types";

// ═══════════════════════════════════════════════════════════
// WALLET TYPE
// ═══════════════════════════════════════════════════════════

export type WalletType = "player" | "company";

export interface SellableItem {
  item_code: string;
  item_name: string;
  quantity: number;
  airport_icao: string;
  tier: number;
}

export interface SellAircraftData {
  id: string;
  registration: string;
  type_code: string;
  name: string;
  condition: number;
  sell_value: number;
  catalog_price: number;
  location_icao: string;
  owner_type: "player" | "company";
}

// ═══════════════════════════════════════════════════════════
// MARKET STATE TYPE
// ═══════════════════════════════════════════════════════════

export interface MarketStateType {
  // Listings
  marketListings: Subject<MarketListing[]>;
  marketLoading: Subject<boolean>;
  marketError: Subject<string | null>;
  marketTierFilter: Subject<number | null>;
  marketIcaoFilter: Subject<string>;  // Filter by airport ICAO
  marketItemFilter: Subject<string>;  // Filter by item name

  // Wallet
  walletPersonal: Subject<number>;

  // Buy popup
  showMarketBuyPopup: Subject<boolean>;
  marketBuyItem: Subject<MarketBuyItem | null>;
  marketBuyQty: Subject<number>;
  marketBuyTotal: Subject<number>;
  marketBuyWallet: Subject<WalletType>;

  // V4.1: Aircraft catalog filter
  aircraftCategoryFilter: Subject<string>;

  // V4.1: Sell item popup
  showSellItemPopup: Subject<boolean>;
  sellItemList: Subject<SellableItem[]>;
  sellItemSelectedIndex: Subject<number>;
  sellItemQty: Subject<number>;
  sellItemPrice: Subject<number>;
  sellItemOwnerType: Subject<WalletType>;

  // V4.1: Aircraft sell choice popup
  showSellAircraftPopup: Subject<boolean>;
  sellAircraftData: Subject<SellAircraftData | null>;
  sellAircraftPrice: Subject<number>;
}

// ═══════════════════════════════════════════════════════════
// STATE INSTANCE
// ═══════════════════════════════════════════════════════════

export const marketState: MarketStateType = {
  // Listings
  marketListings: Subject.create<MarketListing[]>([]),
  marketLoading: Subject.create(false),
  marketError: Subject.create<string | null>(null),
  marketTierFilter: Subject.create<number | null>(null),
  marketIcaoFilter: Subject.create<string>(""),  // Empty = show all
  marketItemFilter: Subject.create<string>(""),  // Empty = show all

  // Wallet
  walletPersonal: Subject.create(0),

  // Buy popup
  showMarketBuyPopup: Subject.create(false),
  marketBuyItem: Subject.create<MarketBuyItem | null>(null),
  marketBuyQty: Subject.create(1),
  marketBuyTotal: Subject.create(0),
  marketBuyWallet: Subject.create<WalletType>("company"),

  // V4.1: Aircraft catalog filter
  aircraftCategoryFilter: Subject.create<string>("all"),

  // V4.1: Sell item popup
  showSellItemPopup: Subject.create(false),
  sellItemList: Subject.create<SellableItem[]>([]),
  sellItemSelectedIndex: Subject.create(0),
  sellItemQty: Subject.create(1),
  sellItemPrice: Subject.create(0),
  sellItemOwnerType: Subject.create<WalletType>("player"),

  // V4.1: Aircraft sell choice popup
  showSellAircraftPopup: Subject.create(false),
  sellAircraftData: Subject.create<SellAircraftData | null>(null),
  sellAircraftPrice: Subject.create(0),
};

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

export const getPersonalBalance = (): number => marketState.walletPersonal.get();

export const openBuyPopup = (item: MarketBuyItem): void => {
  marketState.marketBuyItem.set(item);
  marketState.marketBuyQty.set(1);
  marketState.marketBuyTotal.set(item.sale_price);
  marketState.showMarketBuyPopup.set(true);
};

export const closeBuyPopup = (): void => {
  marketState.showMarketBuyPopup.set(false);
  marketState.marketBuyItem.set(null);
};

export const updateBuyTotal = (): void => {
  const item = marketState.marketBuyItem.get();
  const qty = marketState.marketBuyQty.get();
  if (item) {
    marketState.marketBuyTotal.set(item.sale_price * qty);
  }
};

export const openSellItemPopup = (items: SellableItem[]): void => {
  marketState.sellItemList.set(items);
  marketState.sellItemSelectedIndex.set(0);
  marketState.sellItemQty.set(1);
  marketState.sellItemPrice.set(items.length > 0 ? 100 : 0);
  marketState.sellItemOwnerType.set("player");
  marketState.showSellItemPopup.set(true);
};

export const closeSellItemPopup = (): void => {
  marketState.showSellItemPopup.set(false);
  marketState.sellItemList.set([]);
};

export const openSellAircraftPopup = (data: SellAircraftData): void => {
  marketState.sellAircraftData.set(data);
  marketState.sellAircraftPrice.set(data.catalog_price);
  marketState.showSellAircraftPopup.set(true);
};

export const closeSellAircraftPopup = (): void => {
  marketState.showSellAircraftPopup.set(false);
  marketState.sellAircraftData.set(null);
};
