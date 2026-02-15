/**
 * MarketView - Market (HV) tab render function
 * Extracted from WorldOfAircraft.tsx for better maintainability
 */
import { FSComponent, VNode, Subject, MappedSubject, NodeReference } from "@microsoft/msfs-sdk";
import { Button } from "@efb/efb-api";
import type { Language, MarketListing, MarketBuyItem, CompanyInfo, MarketSubTab, CompanyRole } from "../types";
import type { SellableItem, SellAircraftData } from "../state/MarketState";
import { hasCompanyPermission } from "../helpers/CompanyPermissions";
import { formatMoney } from "../helpers/PlayerHelpers";

// Import translations
import frTranslations from "../locales/fr.json";
import enTranslations from "../locales/en.json";
import deTranslations from "../locales/de.json";
import esTranslations from "../locales/es.json";
import ruTranslations from "../locales/ru.json";

const translations = {
  en: enTranslations,
  fr: frTranslations,
  de: deTranslations,
  es: esTranslations,
  ru: ruTranslations,
} as const;

/**
 * Props interface for MarketView
 */
export interface MarketViewProps {
  activeTab: Subject<string>;
  currentLanguage: Subject<Language>;
  isLoggedIn: Subject<boolean>;
  marketSubTab: Subject<MarketSubTab>;
  walletPersonal: Subject<number>;
  companyData: Subject<CompanyInfo | null>;
  playerRole: Subject<CompanyRole>;
  marketTierFilter: Subject<number | null>;
  marketIcaoFilter: Subject<string>;
  marketIcaoFilterRef: NodeReference<HTMLInputElement>;
  marketItemFilter: Subject<string>;
  marketItemFilterRef: NodeReference<HTMLInputElement>;
  marketError: Subject<string | null>;
  marketLoading: Subject<boolean>;
  marketListings: Subject<MarketListing[]>;
  marketListingsRef: NodeReference<HTMLDivElement>;
  showMarketBuyPopup: Subject<boolean>;
  marketBuyItem: Subject<MarketBuyItem | null>;
  marketBuyQty: Subject<number>;
  marketBuyTotal: Subject<number>;
  marketBuyWallet: Subject<"player" | "company">;
  marketBuyQtySliderRef: NodeReference<HTMLInputElement>;
  marketBuyQtyDisplayRef: NodeReference<HTMLSpanElement>;
  onFetchMarketData: () => void;
  onUpdateMarketBuyQty: (qty: number) => void;
  onCloseMarketBuyPopup: () => void;
  onConfirmMarketBuy: () => void;
  // V4.1: Sell orders props
  mySellOrdersRef: NodeReference<HTMLDivElement>;
  onFetchMySellOrders: () => void;
  onCancelSellOrder: (orderId: string) => void;
  // V4.1: Aircraft catalog props
  aircraftCatalogRef: NodeReference<HTMLDivElement>;
  myAircraftForSaleRef: NodeReference<HTMLDivElement>;
  aircraftCategoryFilter: Subject<string>;
  onFetchAircraftCatalog: () => void;
  onPurchaseAircraft: (catalogId: string, ownerType: "player" | "company") => void;
  onSellAircraft: (aircraftId: string) => void;
  // V4.1: Market inventory props
  marketInventoryListRef: NodeReference<HTMLDivElement>;
  marketInvIcaoFilterRef: NodeReference<HTMLInputElement>;
  marketInvItemFilterRef: NodeReference<HTMLInputElement>;
  marketInvIcaoFilter: Subject<string>;
  marketInvItemFilter: Subject<string>;
  marketInvTierFilter: Subject<number | null>;
  marketInvOwnerFilter: Subject<"all" | "player" | "company">;
  onFetchMarketInventory: () => void;
  // V4.1: Sell item popup
  showSellItemPopup: Subject<boolean>;
  sellItemPopupRef: NodeReference<HTMLDivElement>;
  onOpenSellItemPopup: (itemCode?: string, airportIcao?: string) => void;
  onCloseSellItemPopup: () => void;
  // V4.1: Aircraft sell choice popup
  showSellAircraftPopup: Subject<boolean>;
  sellAircraftPopupRef: NodeReference<HTMLDivElement>;
  onCloseSellAircraftPopup: () => void;
  // V4.1: History (moved from Profile)
  flightHistoryRef: NodeReference<HTMLDivElement>;
  flightHistoryLoading: Subject<boolean>;
  onFetchFlightHistory: () => void;
}

/**
 * Render the Market tab content
 */
export function renderMarketTab(props: MarketViewProps): VNode {
  const {
    activeTab,
    currentLanguage,
    isLoggedIn,
    marketSubTab,
    walletPersonal,
    companyData,
    playerRole,
    marketTierFilter,
    marketIcaoFilter,
    marketIcaoFilterRef,
    marketItemFilter,
    marketItemFilterRef,
    marketError,
    marketLoading,
    marketListings,
    marketListingsRef,
    showMarketBuyPopup,
    marketBuyItem,
    marketBuyQty,
    marketBuyTotal,
    marketBuyWallet,
    marketBuyQtySliderRef,
    marketBuyQtyDisplayRef,
    onFetchMarketData,
    onUpdateMarketBuyQty,
    onCloseMarketBuyPopup,
    onConfirmMarketBuy,
    // V4.1: Sell orders
    mySellOrdersRef,
    onFetchMySellOrders,
    onCancelSellOrder,
    // V4.1: Aircraft catalog
    aircraftCatalogRef,
    myAircraftForSaleRef,
    aircraftCategoryFilter,
    onFetchAircraftCatalog,
    onPurchaseAircraft,
    onSellAircraft,
    // V4.1: Market inventory
    marketInventoryListRef,
    marketInvIcaoFilterRef,
    marketInvItemFilterRef,
    marketInvIcaoFilter,
    marketInvItemFilter,
    marketInvTierFilter,
    marketInvOwnerFilter,
    onFetchMarketInventory,
    // V4.1: Sell item popup
    showSellItemPopup,
    sellItemPopupRef,
    onOpenSellItemPopup,
    onCloseSellItemPopup,
    // V4.1: Aircraft sell choice popup
    showSellAircraftPopup,
    sellAircraftPopupRef,
    onCloseSellAircraftPopup,
    // V4.1: History (moved from Profile)
    flightHistoryRef,
    flightHistoryLoading,
    onFetchFlightHistory,
  } = props;

  return (
    <div>
      {/* Market (HV) Tab Content */}
      <div style={activeTab.map(t => t === "market"
        ? "position: absolute; top: 0; left: 0; right: 0; bottom: 0; overflow: hidden; display: flex; flex-direction: column;"
        : "display: none;")}>

        {/* Market Sub-Tabs Header (centered) */}
        <div style="display: flex; justify-content: center; align-items: center; padding: 10px 12px; background: #252532; border-bottom: 1px solid #374151; flex-shrink: 0;">
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <Button callback={(): void => marketSubTab.set("inventory")}>
              <div style={marketSubTab.map(t => t === "inventory"
                ? "padding: 6px 12px; background: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white; font-weight: 600;"
                : "padding: 6px 12px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white;")}>
                {currentLanguage.map(l => translations[l].inventory.title)}
              </div>
            </Button>
            <Button callback={(): void => marketSubTab.set("achats")}>
              <div style={marketSubTab.map(t => t === "achats"
                ? "padding: 6px 12px; background: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white; font-weight: 600;"
                : "padding: 6px 12px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white;")}>
                {currentLanguage.map(l => l === "fr" ? "Achats" : "Buy")}
              </div>
            </Button>
            <Button callback={(): void => marketSubTab.set("mes-ventes")}>
              <div style={marketSubTab.map(t => t === "mes-ventes"
                ? "padding: 6px 12px; background: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white; font-weight: 600;"
                : "padding: 6px 12px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white;")}>
                {currentLanguage.map(l => translations[l].market.mySales)}
              </div>
            </Button>
            <Button callback={(): void => marketSubTab.set("avions")}>
              <div style={marketSubTab.map(t => t === "avions"
                ? "padding: 6px 12px; background: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white; font-weight: 600;"
                : "padding: 6px 12px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white;")}>
                {currentLanguage.map(l => l === "fr" ? "Avions" : "Aircraft")}
              </div>
            </Button>
            <Button callback={(): void => { marketSubTab.set("historique"); onFetchFlightHistory(); }}>
              <div style={marketSubTab.map(t => t === "historique"
                ? "padding: 6px 12px; background: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white; font-weight: 600;"
                : "padding: 6px 12px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white;")}>
                {currentLanguage.map(l => translations[l].history.title)}
              </div>
            </Button>
          </div>
        </div>

        {/* Market Sub-Tab Content */}
        <div style="flex: 1; overflow-y: auto;">

        {/* Inventory Sub-Tab */}
        <div style={marketSubTab.map(t => t === "inventory" ? "padding: 16px; color: white;" : "display: none;")}>
          {/* Not logged in */}
          <div style={isLoggedIn.map(l => l ? "display: none;" : "display: block;")}>
            <div style="background: rgba(245, 158, 11, 0.15); border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; text-align: center;">
              <div style="color: #f59e0b; font-size: 13px; font-weight: 600;">{currentLanguage.map(l => translations[l].missions.loginRequired)}</div>
            </div>
          </div>

          {/* Logged in content */}
          <div style={isLoggedIn.map(l => l ? "display: block;" : "display: none;")}>
            {/* Wallets Header */}
            <div style="display: flex; gap: 8px; margin-bottom: 12px;">
              <div style="flex: 1; background: #252532; border-radius: 8px; padding: 10px;">
                <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; margin-bottom: 4px;">{currentLanguage.map(l => translations[l].inventory.personal)}</div>
                <div style="font-size: 14px; font-weight: 700; color: #22c55e;">
                  {walletPersonal.map(w => formatMoney(w))}
                </div>
              </div>
              <div style="flex: 1; background: #252532; border-radius: 8px; padding: 10px;">
                <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; margin-bottom: 4px;">{currentLanguage.map(l => translations[l].inventory.company)}</div>
                <div style="font-size: 14px; font-weight: 700; color: #3b82f6;">
                  {companyData.map(c => c ? formatMoney(c.balance) : "0 CR")}
                </div>
              </div>
            </div>

            {/* Filters */}
            <div style="display: flex; gap: 8px; margin-bottom: 12px;">
              <div style="flex: 1;">
                <input
                  ref={marketInvIcaoFilterRef}
                  type="text"
                  placeholder={currentLanguage.map(l => l === "fr" ? "Aeroport (ICAO)..." : "Airport (ICAO)...")}
                  value={marketInvIcaoFilter}
                  maxLength={4}
                  style="width: 100%; padding: 8px 12px; background: #252532; border: 1px solid #374151; border-radius: 6px; color: white; font-size: 12px; font-family: monospace; text-transform: uppercase; outline: none; box-sizing: border-box;"
                  onkeydown={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
                  onkeyup={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
                  onkeypress={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
                />
              </div>
              <div style="flex: 1;">
                <input
                  ref={marketInvItemFilterRef}
                  type="text"
                  placeholder={currentLanguage.map(l => l === "fr" ? "Nom d'item..." : "Item name...")}
                  value={marketInvItemFilter}
                  style="width: 100%; padding: 8px 12px; background: #252532; border: 1px solid #374151; border-radius: 6px; color: white; font-size: 12px; outline: none; box-sizing: border-box;"
                  onkeydown={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
                  onkeyup={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
                  onkeypress={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
                />
              </div>
            </div>

            {/* Owner filter */}
            <div style="display: flex; gap: 4px; margin-bottom: 8px; flex-wrap: wrap;">
              <Button callback={(): void => { marketInvOwnerFilter.set("all"); onFetchMarketInventory(); }}>
                <div style={marketInvOwnerFilter.map(o => o === "all"
                  ? "padding: 6px 10px; background: #3b82f6; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                  : "padding: 6px 10px; background: #252532; color: #6b7280; border-radius: 6px; font-size: 10px;")}>
                  {currentLanguage.map(l => translations[l].common.all)}
                </div>
              </Button>
              <Button callback={(): void => { marketInvOwnerFilter.set("player"); onFetchMarketInventory(); }}>
                <div style={marketInvOwnerFilter.map(o => o === "player"
                  ? "padding: 6px 10px; background: #22c55e; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                  : "padding: 6px 10px; background: #252532; color: #22c55e; border-radius: 6px; font-size: 10px;")}>
                  {currentLanguage.map(l => translations[l].inventory.personal)}
                </div>
              </Button>
              <Button callback={(): void => { marketInvOwnerFilter.set("company"); onFetchMarketInventory(); }}>
                <div style={marketInvOwnerFilter.map(o => o === "company"
                  ? "padding: 6px 10px; background: #f59e0b; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                  : "padding: 6px 10px; background: #252532; color: #f59e0b; border-radius: 6px; font-size: 10px;")}>
                  {currentLanguage.map(l => translations[l].inventory.company)}
                </div>
              </Button>
            </div>

            {/* Tier filters */}
            <div style="display: flex; gap: 4px; margin-bottom: 12px; flex-wrap: wrap;">
              <Button callback={(): void => { marketInvTierFilter.set(null); onFetchMarketInventory(); }}>
                <div style={marketInvTierFilter.map(t => t === null
                  ? "padding: 6px 10px; background: #3b82f6; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                  : "padding: 6px 10px; background: #252532; color: #6b7280; border-radius: 6px; font-size: 10px;")}>
                  {currentLanguage.map(l => translations[l].common.all)}
                </div>
              </Button>
              <Button callback={(): void => { marketInvTierFilter.set(0); onFetchMarketInventory(); }}>
                <div style={marketInvTierFilter.map(t => t === 0
                  ? "padding: 6px 10px; background: #6b7280; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                  : "padding: 6px 10px; background: #252532; color: #6b7280; border-radius: 6px; font-size: 10px;")}>
                  T0
                </div>
              </Button>
              <Button callback={(): void => { marketInvTierFilter.set(1); onFetchMarketInventory(); }}>
                <div style={marketInvTierFilter.map(t => t === 1
                  ? "padding: 6px 10px; background: #22c55e; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                  : "padding: 6px 10px; background: #252532; color: #22c55e; border-radius: 6px; font-size: 10px;")}>
                  T1
                </div>
              </Button>
              <Button callback={(): void => { marketInvTierFilter.set(2); onFetchMarketInventory(); }}>
                <div style={marketInvTierFilter.map(t => t === 2
                  ? "padding: 6px 10px; background: #3b82f6; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                  : "padding: 6px 10px; background: #252532; color: #3b82f6; border-radius: 6px; font-size: 10px;")}>
                  T2
                </div>
              </Button>
              <Button callback={(): void => { marketInvTierFilter.set(3); onFetchMarketInventory(); }}>
                <div style={marketInvTierFilter.map(t => t === 3
                  ? "padding: 6px 10px; background: #a855f7; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                  : "padding: 6px 10px; background: #252532; color: #a855f7; border-radius: 6px; font-size: 10px;")}>
                  T3
                </div>
              </Button>
              <Button callback={(): void => { marketInvTierFilter.set(4); onFetchMarketInventory(); }}>
                <div style={marketInvTierFilter.map(t => t === 4
                  ? "padding: 6px 10px; background: #f59e0b; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                  : "padding: 6px 10px; background: #252532; color: #f59e0b; border-radius: 6px; font-size: 10px;")}>
                  T4
                </div>
              </Button>
              <Button callback={(): void => { marketInvTierFilter.set(5); onFetchMarketInventory(); }}>
                <div style={marketInvTierFilter.map(t => t === 5
                  ? "padding: 6px 10px; background: #ef4444; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                  : "padding: 6px 10px; background: #252532; color: #ef4444; border-radius: 6px; font-size: 10px;")}>
                  T5
                </div>
              </Button>
            </div>

            {/* Inventory list (dynamic via ref) */}
            <div ref={marketInventoryListRef} style="margin-bottom: 16px;">
              <div style="background: #252532; border-radius: 8px; padding: 16px; text-align: center;">
                <div style="color: #6b7280; font-size: 11px;">{currentLanguage.map(l => translations[l].common.loading)}</div>
              </div>
            </div>

            {/* Refresh button */}
            <Button callback={(): void => { onFetchMarketInventory(); }}>
              <div style="background: #3b82f6; color: white; padding: 10px; border-radius: 8px; text-align: center; font-size: 11px; font-weight: 500;">
                {currentLanguage.map(l => translations[l].common.refresh)}
              </div>
            </Button>
          </div>
        </div>

        {/* Achats Sub-Tab */}
        <div style={marketSubTab.map(t => t === "achats" ? "padding: 16px; color: white;" : "display: none;")}>

          {/* Not logged in message */}
          <div style={isLoggedIn.map(l => l ? "display: none;" : "display: block;")}>
            <div style="background: rgba(245, 158, 11, 0.15); border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; text-align: center;">
              <svg style="width: 32px; height: 32px; margin-bottom: 8px;" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v4"/>
                <path d="M12 16h.01"/>
              </svg>
              <div style="color: #f59e0b; font-size: 13px; font-weight: 600; margin-bottom: 4px;">{currentLanguage.map(l => translations[l].missions.loginRequired)}</div>
              <div style="color: #9ca3af; font-size: 11px;">{currentLanguage.map(l => translations[l].market.loginToAccess)}</div>
            </div>
          </div>

          {/* Logged in content */}
          <div style={isLoggedIn.map(l => l ? "display: flex; flex-direction: column; flex: 1;" : "display: none;")}>
            {/* Wallets Header */}
            <div style="display: flex; gap: 8px; margin-bottom: 12px;">
              <div style="flex: 1; background: #252532; border-radius: 8px; padding: 10px;">
                <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; margin-bottom: 4px;">{currentLanguage.map(l => translations[l].inventory.personal)}</div>
                <div style="font-size: 14px; font-weight: 700; color: #22c55e;">
                  {walletPersonal.map(w => formatMoney(w))}
                </div>
              </div>
              <div style="flex: 1; background: #252532; border-radius: 8px; padding: 10px;">
                <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; margin-bottom: 4px;">{currentLanguage.map(l => translations[l].inventory.company)}</div>
                <div style="font-size: 14px; font-weight: 700; color: #3b82f6;">
                  {companyData.map(c => c ? formatMoney(c.balance) : "0 CR")}
                </div>
              </div>
            </div>

            {/* Filters - Two columns */}
            <div style="display: flex; gap: 8px; margin-bottom: 12px;">
              <div style="flex: 1;">
                <input
                  ref={marketIcaoFilterRef}
                  type="text"
                  placeholder={currentLanguage.map(l => l === "fr" ? "Aéroport (ICAO)..." : "Airport (ICAO)...")}
                  value={marketIcaoFilter}
                  maxLength={4}
                  style="width: 100%; padding: 8px 12px; background: #252532; border: 1px solid #374151; border-radius: 6px; color: white; font-size: 12px; font-family: monospace; text-transform: uppercase; outline: none; box-sizing: border-box;"
                  onkeydown={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
                  onkeyup={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
                  onkeypress={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
                />
              </div>
              <div style="flex: 1;">
                <input
                  ref={marketItemFilterRef}
                  type="text"
                  placeholder={currentLanguage.map(l => l === "fr" ? "Nom d'item..." : "Item name...")}
                  value={marketItemFilter}
                  style="width: 100%; padding: 8px 12px; background: #252532; border: 1px solid #374151; border-radius: 6px; color: white; font-size: 12px; outline: none; box-sizing: border-box;"
                  onkeydown={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
                  onkeyup={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
                  onkeypress={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
                />
              </div>
            </div>

            {/* Tier Filters */}
            <div style="display: flex; gap: 4px; margin-bottom: 12px; flex-wrap: wrap;">
              <Button callback={(): void => { marketTierFilter.set(null); onFetchMarketData(); }}>
                <div style={marketTierFilter.map(t => t === null
                  ? "padding: 6px 10px; background: #3b82f6; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                  : "padding: 6px 10px; background: #252532; color: #6b7280; border-radius: 6px; font-size: 10px;")}>
                  {currentLanguage.map(l => translations[l].common.all)}
                </div>
              </Button>
              <Button callback={(): void => { marketTierFilter.set(0); onFetchMarketData(); }}>
                <div style={marketTierFilter.map(t => t === 0
                  ? "padding: 6px 10px; background: #6b7280; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                  : "padding: 6px 10px; background: #252532; color: #6b7280; border-radius: 6px; font-size: 10px;")}>
                  T0
                </div>
              </Button>
              <Button callback={(): void => { marketTierFilter.set(1); onFetchMarketData(); }}>
                <div style={marketTierFilter.map(t => t === 1
                  ? "padding: 6px 10px; background: #22c55e; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                  : "padding: 6px 10px; background: #252532; color: #22c55e; border-radius: 6px; font-size: 10px;")}>
                  T1
                </div>
              </Button>
              <Button callback={(): void => { marketTierFilter.set(2); onFetchMarketData(); }}>
                <div style={marketTierFilter.map(t => t === 2
                  ? "padding: 6px 10px; background: #3b82f6; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                  : "padding: 6px 10px; background: #252532; color: #3b82f6; border-radius: 6px; font-size: 10px;")}>
                  T2
                </div>
              </Button>
              <Button callback={(): void => { marketTierFilter.set(3); onFetchMarketData(); }}>
                <div style={marketTierFilter.map(t => t === 3
                  ? "padding: 6px 10px; background: #a855f7; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                  : "padding: 6px 10px; background: #252532; color: #a855f7; border-radius: 6px; font-size: 10px;")}>
                  T3
                </div>
              </Button>
              <Button callback={(): void => { marketTierFilter.set(4); onFetchMarketData(); }}>
                <div style={marketTierFilter.map(t => t === 4
                  ? "padding: 6px 10px; background: #f59e0b; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                  : "padding: 6px 10px; background: #252532; color: #f59e0b; border-radius: 6px; font-size: 10px;")}>
                  T4
                </div>
              </Button>
              <Button callback={(): void => { marketTierFilter.set(5); onFetchMarketData(); }}>
                <div style={marketTierFilter.map(t => t === 5
                  ? "padding: 6px 10px; background: #ef4444; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                  : "padding: 6px 10px; background: #252532; color: #ef4444; border-radius: 6px; font-size: 10px;")}>
                  T5
                </div>
              </Button>
            </div>

            {/* Error message */}
            <div style={marketError.map(e => e
              ? "background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; border-radius: 8px; padding: 10px; margin-bottom: 12px;"
              : "display: none;")}>
              <span style="color: #ef4444; font-size: 12px;">{marketError}</span>
            </div>

            {/* Loading state */}
            <div style={marketLoading.map(l => l ? "display: flex; justify-content: center; padding: 24px;" : "display: none;")}>
              <div style="color: #9ca3af; font-size: 12px;">{currentLanguage.map(l => translations[l].market.loadingMarket)}</div>
            </div>

            {/* Market Listings */}
            <div style={marketLoading.map(l => l ? "display: none;" : "display: block;")}>
              <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; margin-bottom: 8px;">
                {MappedSubject.create(([listings, lang]) => `${translations[lang].market.availableOffers} (${listings.length})`, marketListings, currentLanguage)}
              </div>
              <div ref={marketListingsRef} style="display: flex; flex-direction: column;">
                <div style="background: #252532; border-radius: 12px; padding: 24px; text-align: center;">
                  <svg style="width: 40px; height: 40px; margin-bottom: 12px; opacity: 0.4;" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5">
                    <path d="M12 2v20"/>
                    <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
                  </svg>
                  <div style="color: #6b7280; font-size: 12px;">{currentLanguage.map(l => translations[l].common.loading)}</div>
                </div>
              </div>
            </div>

            {/* Refresh button */}
            <div style="margin-top: 12px;">
              <Button callback={(): void => { onFetchMarketData(); }} disabled={marketLoading}>
                <div style={marketLoading.map(l => l
                  ? "background: #374151; color: #6b7280; padding: 10px; border-radius: 8px; text-align: center; font-size: 11px;"
                  : "background: #3b82f6; color: white; padding: 10px; border-radius: 8px; text-align: center; font-size: 11px; font-weight: 500;")}>
                  {MappedSubject.create(([loading, lang]) => loading ? translations[lang].common.loading : translations[lang].common.refresh, marketLoading, currentLanguage)}
                </div>
              </Button>
            </div>
          </div>
        </div>

        {/* Mes Ventes Sub-Tab */}
        <div style={marketSubTab.map(t => t === "mes-ventes" ? "padding: 16px; color: white;" : "display: none;")}>
          {/* Not logged in */}
          <div style={isLoggedIn.map(l => l ? "display: none;" : "display: block;")}>
            <div style="background: rgba(245, 158, 11, 0.15); border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; text-align: center;">
              <div style="color: #f59e0b; font-size: 13px; font-weight: 600;">{currentLanguage.map(l => translations[l].missions.loginRequired)}</div>
            </div>
          </div>

          {/* Logged in content */}
          <div style={isLoggedIn.map(l => l ? "display: block;" : "display: none;")}>
            {/* Wallets Header */}
            <div style="display: flex; gap: 8px; margin-bottom: 12px;">
              <div style="flex: 1; background: #252532; border-radius: 8px; padding: 10px;">
                <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; margin-bottom: 4px;">{currentLanguage.map(l => translations[l].inventory.personal)}</div>
                <div style="font-size: 14px; font-weight: 700; color: #22c55e;">
                  {walletPersonal.map(w => formatMoney(w))}
                </div>
              </div>
              <div style="flex: 1; background: #252532; border-radius: 8px; padding: 10px;">
                <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; margin-bottom: 4px;">{currentLanguage.map(l => translations[l].inventory.company)}</div>
                <div style="font-size: 14px; font-weight: 700; color: #3b82f6;">
                  {companyData.map(c => c ? formatMoney(c.balance) : "0 CR")}
                </div>
              </div>
            </div>

            {/* Active orders section */}
            <div style="font-size: 11px; font-weight: 600; color: #9ca3af; text-transform: uppercase; margin-bottom: 8px;">
              {currentLanguage.map(l => translations[l].market.activeOrders)}
            </div>

            {/* Sell orders list (dynamic via ref) */}
            <div ref={mySellOrdersRef} style="margin-bottom: 16px;">
              <div style="background: #252532; border-radius: 8px; padding: 16px; text-align: center;">
                <div style="color: #6b7280; font-size: 11px;">{currentLanguage.map(l => translations[l].common.loading)}</div>
              </div>
            </div>

            {/* Refresh button */}
            <Button callback={(): void => { onFetchMySellOrders(); }}>
              <div style="background: #3b82f6; color: white; padding: 10px; border-radius: 8px; text-align: center; font-size: 11px; font-weight: 500;">
                {currentLanguage.map(l => translations[l].common.refresh)}
              </div>
            </Button>
          </div>
        </div>

        {/* Avions Sub-Tab */}
        <div style={marketSubTab.map(t => t === "avions" ? "padding: 16px; color: white;" : "display: none;")}>
          {/* Not logged in */}
          <div style={isLoggedIn.map(l => l ? "display: none;" : "display: block;")}>
            <div style="background: rgba(245, 158, 11, 0.15); border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; text-align: center;">
              <div style="color: #f59e0b; font-size: 13px; font-weight: 600;">{currentLanguage.map(l => translations[l].missions.loginRequired)}</div>
            </div>
          </div>

          {/* Logged in content */}
          <div style={isLoggedIn.map(l => l ? "display: block;" : "display: none;")}>
            {/* Wallets Header */}
            <div style="display: flex; gap: 8px; margin-bottom: 12px;">
              <div style="flex: 1; background: #252532; border-radius: 8px; padding: 10px;">
                <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; margin-bottom: 4px;">{currentLanguage.map(l => translations[l].inventory.personal)}</div>
                <div style="font-size: 14px; font-weight: 700; color: #22c55e;">
                  {walletPersonal.map(w => formatMoney(w))}
                </div>
              </div>
              <div style="flex: 1; background: #252532; border-radius: 8px; padding: 10px;">
                <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; margin-bottom: 4px;">{currentLanguage.map(l => translations[l].inventory.company)}</div>
                <div style="font-size: 14px; font-weight: 700; color: #3b82f6;">
                  {companyData.map(c => c ? formatMoney(c.balance) : "0 CR")}
                </div>
              </div>
            </div>

            {/* Category filter */}
            <div style="display: flex; gap: 4px; margin-bottom: 12px; flex-wrap: wrap;">
              <Button callback={(): void => { aircraftCategoryFilter.set("all"); onFetchAircraftCatalog(); }}>
                <div style={aircraftCategoryFilter.map(c => c === "all"
                  ? "padding: 6px 10px; background: #3b82f6; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                  : "padding: 6px 10px; background: #252532; color: #6b7280; border-radius: 6px; font-size: 10px;")}>
                  {currentLanguage.map(l => translations[l].common.all)}
                </div>
              </Button>
              <Button callback={(): void => { aircraftCategoryFilter.set("single_piston"); onFetchAircraftCatalog(); }}>
                <div style={aircraftCategoryFilter.map(c => c === "single_piston"
                  ? "padding: 6px 10px; background: #22c55e; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                  : "padding: 6px 10px; background: #252532; color: #22c55e; border-radius: 6px; font-size: 10px;")}>
                  PPL
                </div>
              </Button>
              <Button callback={(): void => { aircraftCategoryFilter.set("turboprop"); onFetchAircraftCatalog(); }}>
                <div style={aircraftCategoryFilter.map(c => c === "turboprop"
                  ? "padding: 6px 10px; background: #f59e0b; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                  : "padding: 6px 10px; background: #252532; color: #f59e0b; border-radius: 6px; font-size: 10px;")}>
                  Turbo
                </div>
              </Button>
              <Button callback={(): void => { aircraftCategoryFilter.set("jet_small"); onFetchAircraftCatalog(); }}>
                <div style={aircraftCategoryFilter.map(c => c === "jet_small"
                  ? "padding: 6px 10px; background: #a855f7; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                  : "padding: 6px 10px; background: #252532; color: #a855f7; border-radius: 6px; font-size: 10px;")}>
                  Jet
                </div>
              </Button>
              <Button callback={(): void => { aircraftCategoryFilter.set("helicopter"); onFetchAircraftCatalog(); }}>
                <div style={aircraftCategoryFilter.map(c => c === "helicopter"
                  ? "padding: 6px 10px; background: #ef4444; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                  : "padding: 6px 10px; background: #252532; color: #ef4444; border-radius: 6px; font-size: 10px;")}>
                  Heli
                </div>
              </Button>
            </div>

            {/* Aircraft catalog section */}
            <div style="font-size: 11px; font-weight: 600; color: #9ca3af; text-transform: uppercase; margin-bottom: 8px;">
              {currentLanguage.map(l => translations[l].market.aircraftCatalog)}
            </div>

            {/* Aircraft catalog list (dynamic via ref) */}
            <div ref={aircraftCatalogRef} style="margin-bottom: 16px; max-height: 300px; overflow-y: auto;">
              <div style="background: #252532; border-radius: 8px; padding: 16px; text-align: center;">
                <div style="color: #6b7280; font-size: 11px;">{currentLanguage.map(l => translations[l].common.loading)}</div>
              </div>
            </div>

            {/* My aircraft for sale section */}
            <div style="font-size: 11px; font-weight: 600; color: #9ca3af; text-transform: uppercase; margin-bottom: 8px; margin-top: 16px;">
              {currentLanguage.map(l => translations[l].market.myAircraftForSale)}
            </div>

            {/* My aircraft list (dynamic via ref) */}
            <div ref={myAircraftForSaleRef} style="margin-bottom: 16px;">
              <div style="background: #252532; border-radius: 8px; padding: 16px; text-align: center;">
                <div style="color: #6b7280; font-size: 11px;">{currentLanguage.map(l => translations[l].common.loading)}</div>
              </div>
            </div>

            {/* Refresh button */}
            <Button callback={(): void => { onFetchAircraftCatalog(); }}>
              <div style="background: #3b82f6; color: white; padding: 10px; border-radius: 8px; text-align: center; font-size: 11px; font-weight: 500;">
                {currentLanguage.map(l => translations[l].common.refresh)}
              </div>
            </Button>
          </div>
        </div>

        {/* Historique Sub-Tab (moved from Profile) */}
        <div style={marketSubTab.map(t => t === "historique" ? "padding: 16px; color: white;" : "display: none;")}>
          {/* Not logged in */}
          <div style={isLoggedIn.map(l => l ? "display: none;" : "display: block;")}>
            <div style="background: rgba(245, 158, 11, 0.15); border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; text-align: center;">
              <div style="color: #f59e0b; font-size: 13px; font-weight: 600;">{currentLanguage.map(l => translations[l].missions.loginRequired)}</div>
            </div>
          </div>

          {/* Logged in content */}
          <div style={isLoggedIn.map(l => l ? "display: block;" : "display: none;")}>
            {/* Title */}
            <div style="font-size: 12px; font-weight: 600; color: #9ca3af; text-transform: uppercase; margin-bottom: 12px;">
              {currentLanguage.map(l => translations[l].history.title)}
            </div>

            {/* Loading state */}
            <div style={flightHistoryLoading.map(l => l ? "display: flex; justify-content: center; padding: 24px;" : "display: none;")}>
              <div style="color: #9ca3af; font-size: 12px;">{currentLanguage.map(l => translations[l].common.loading)}</div>
            </div>

            {/* History List (rendered via innerHTML) */}
            <div style={flightHistoryLoading.map(l => l ? "display: none;" : "display: block;")}>
              <div ref={flightHistoryRef}>
                {/* Content will be rendered via innerHTML */}
              </div>
            </div>
          </div>
        </div>

        </div>{/* End Market Sub-Tab Content */}
      </div>

      {/* Market Buy Popup */}
      <div style={showMarketBuyPopup.map(s => s
        ? "position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px;"
        : "display: none;")}>
        <div style="background: #252532; border-radius: 12px; padding: 20px; width: 100%; max-width: 320px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h3 style="font-size: 14px; font-weight: 600; color: white; margin: 0;">{currentLanguage.map(l => translations[l].market.buy)}</h3>
            <Button callback={(): void => { onCloseMarketBuyPopup(); }}>
              <div style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; color: #6b7280; font-size: 18px;">
                x
              </div>
            </Button>
          </div>

          {/* Item info */}
          <div style="background: #1a1a24; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
            <div style="font-size: 14px; font-weight: 600; color: white; margin-bottom: 4px;">
              {marketBuyItem.map(i => i?.item_name || "")}
            </div>
            <div style="font-size: 11px; color: #6b7280;">
              @ {marketBuyItem.map(i => i?.airport_ident || "")} • {marketBuyItem.map(i => i?.company_name || "")}
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 8px;">
              <span style="font-size: 12px; color: #9ca3af;">{currentLanguage.map(l => translations[l].market.unitPrice)}:</span>
              <span style="font-size: 12px; font-weight: 600; color: #22c55e;">{marketBuyItem.map(i => i ? formatMoney(i.sale_price) : "")}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="font-size: 12px; color: #9ca3af;">{currentLanguage.map(l => translations[l].common.available)}:</span>
              <span style="font-size: 12px; color: white;">{marketBuyItem.map(i => i?.sale_qty.toString() || "0")}</span>
            </div>
          </div>

          {/* Quantity selector */}
          <div style="margin-bottom: 16px;">
            <div style="font-size: 11px; color: #6b7280; margin-bottom: 6px;">{currentLanguage.map(l => translations[l].common.quantity)}</div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <input
                ref={marketBuyQtySliderRef}
                type="range"
                min="1"
                max="1"
                value="1"
                style="flex: 1; accent-color: #3b82f6;"
                oninput={(e: Event): void => { onUpdateMarketBuyQty(parseInt((e.target as HTMLInputElement).value)); }}
              />
              <span ref={marketBuyQtyDisplayRef} style="font-size: 14px; font-weight: 600; color: white; min-width: 30px; text-align: right;">
                {marketBuyQty}
              </span>
            </div>
          </div>

          {/* V4.1: Wallet balances display */}
          <div style="margin-bottom: 16px;">
            <div style="display: flex; gap: 8px;">
              <div style="flex: 1; padding: 10px; background: #1a1a24; border: 1px solid #3b82f6; border-radius: 6px; text-align: center;">
                <div style="font-size: 10px; color: #6b7280;">{currentLanguage.map(l => l === "fr" ? "Perso" : "Personal")}</div>
                <div style="font-size: 12px; font-weight: 600; color: #3b82f6;">
                  {walletPersonal.map(w => formatMoney(w))}
                </div>
              </div>
              <div style="flex: 1; padding: 10px; background: #1a1a24; border: 1px solid #f59e0b; border-radius: 6px; text-align: center;">
                <div style="font-size: 10px; color: #6b7280;">{currentLanguage.map(l => l === "fr" ? "Company" : "Company")}</div>
                <div style="font-size: 12px; font-weight: 600; color: #f59e0b;">
                  {companyData.map(c => c ? formatMoney(c.balance) : "- CR")}
                </div>
              </div>
            </div>
          </div>

          {/* Total */}
          <div style="background: #1a1a24; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 12px; color: #9ca3af;">{currentLanguage.map(l => translations[l].common.total)}:</span>
              <span style="font-size: 16px; font-weight: 700; color: #f59e0b;">
                {marketBuyTotal.map(t => formatMoney(t))}
              </span>
            </div>
          </div>

          {/* V4.1: Two buy buttons (perso/company) */}
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; gap: 8px;">
              {/* Buy Personal - always enabled if enough funds */}
              <Button callback={(): void => { marketBuyWallet.set("player"); onConfirmMarketBuy(); }}>
                <div style={MappedSubject.create(([total, wallet]) => wallet >= total
                  ? "flex: 1; padding: 12px; background: #3b82f6; color: white; border-radius: 8px; text-align: center; font-size: 12px; font-weight: 600;"
                  : "flex: 1; padding: 12px; background: #374151; color: #6b7280; border-radius: 8px; text-align: center; font-size: 12px; opacity: 0.5; pointer-events: none;",
                  marketBuyTotal, walletPersonal)}>
                  {currentLanguage.map(l => l === "fr" ? "Acheter perso" : "Buy personal")}
                </div>
              </Button>
              {/* Buy Company - disabled if no company, insufficient funds, or no permission */}
              <Button callback={(): void => { marketBuyWallet.set("company"); onConfirmMarketBuy(); }}>
                <div style={MappedSubject.create(([total, company, role]) => {
                  const canBuy = company && company.balance >= total && hasCompanyPermission(role, "market_buy");
                  return canBuy
                    ? "flex: 1; padding: 12px; background: #f59e0b; color: #1a1a24; border-radius: 8px; text-align: center; font-size: 12px; font-weight: 600;"
                    : "flex: 1; padding: 12px; background: #374151; color: #6b7280; border-radius: 8px; text-align: center; font-size: 12px; opacity: 0.4; pointer-events: none;";
                }, marketBuyTotal, companyData, playerRole)}>
                  {currentLanguage.map(l => l === "fr" ? "Acheter company" : "Buy company")}
                </div>
              </Button>
            </div>
            <Button callback={(): void => { onCloseMarketBuyPopup(); }}>
              <div style="width: 100%; padding: 10px; background: #374151; color: #9ca3af; border-radius: 8px; text-align: center; font-size: 11px;">
                {currentLanguage.map(l => translations[l].common.cancel)}
              </div>
            </Button>
          </div>
        </div>
      </div>

      {/* Sell Item Popup */}
      <div style={showSellItemPopup.map(s => s
        ? "position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px;"
        : "display: none;")}>
        <div style="background: #252532; border-radius: 12px; padding: 20px; width: 100%; max-width: 320px; max-height: 90vh; overflow-y: auto;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h3 style="font-size: 14px; font-weight: 600; color: white; margin: 0;">{currentLanguage.map(l => translations[l].market.postSale)}</h3>
            <Button callback={(): void => { onCloseSellItemPopup(); }}>
              <div style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; color: #6b7280; font-size: 18px;">
                x
              </div>
            </Button>
          </div>
          <div ref={sellItemPopupRef}>
            {/* Dynamic content rendered via innerHTML */}
          </div>
        </div>
      </div>

      {/* Aircraft Sell Choice Popup */}
      <div style={showSellAircraftPopup.map(s => s
        ? "position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px;"
        : "display: none;")}>
        <div style="background: #252532; border-radius: 12px; padding: 20px; width: 100%; max-width: 320px; max-height: 90vh; overflow-y: auto;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h3 style="font-size: 14px; font-weight: 600; color: white; margin: 0;">{currentLanguage.map(l => translations[l].market.sellAircraft)}</h3>
            <Button callback={(): void => { onCloseSellAircraftPopup(); }}>
              <div style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; color: #6b7280; font-size: 18px;">
                x
              </div>
            </Button>
          </div>
          <div ref={sellAircraftPopupRef}>
            {/* Dynamic content rendered via innerHTML */}
          </div>
        </div>
      </div>
    </div>
  );
}
