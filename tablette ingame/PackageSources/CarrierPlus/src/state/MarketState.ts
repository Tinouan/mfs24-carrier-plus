/**
 * MarketState - Market listings and buy popup state
 * Extracted from CarrierPlus.tsx for better maintainability
 */

import { Subject } from "@microsoft/msfs-sdk";
import type { MarketListing, MarketBuyItem } from "../types";

// ═══════════════════════════════════════════════════════════
// WALLET TYPE
// ═══════════════════════════════════════════════════════════

export type WalletType = "player" | "company";

// ═══════════════════════════════════════════════════════════
// MARKET STATE TYPE
// ═══════════════════════════════════════════════════════════

export interface MarketStateType {
  // Listings
  marketListings: Subject<MarketListing[]>;
  marketLoading: Subject<boolean>;
  marketError: Subject<string | null>;
  marketTierFilter: Subject<number | null>;

  // Wallet
  walletPersonal: Subject<number>;

  // Buy popup
  showMarketBuyPopup: Subject<boolean>;
  marketBuyItem: Subject<MarketBuyItem | null>;
  marketBuyQty: Subject<number>;
  marketBuyTotal: Subject<number>;
  marketBuyWallet: Subject<WalletType>;
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

  // Wallet
  walletPersonal: Subject.create(0),

  // Buy popup
  showMarketBuyPopup: Subject.create(false),
  marketBuyItem: Subject.create<MarketBuyItem | null>(null),
  marketBuyQty: Subject.create(1),
  marketBuyTotal: Subject.create(0),
  marketBuyWallet: Subject.create<WalletType>("company"),
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
