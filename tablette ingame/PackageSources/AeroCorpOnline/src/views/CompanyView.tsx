/**
 * CompanyView → BusinessView - Business tab with 3 sub-tabs
 * Phase 4: Merged Company + Market into Marche / Usines / Finances
 */
import { FSComponent, VNode, Subject, MappedSubject, NodeReference } from "@microsoft/msfs-sdk";
import { Button } from "@efb/efb-api";
import type {
  Language, CompanyInfo, CompanySubTab, CompanyFleetItem, CompanyMember, CompanyRole,
  ProfileInventoryItem, BusinessSubTab, MarketListing, MarketBuyItem,
} from "../types";
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
 * Props interface for CompanyView (Phase 4: includes market props)
 */
export interface CompanyViewProps {
  activeTab: Subject<string>;
  currentLanguage: Subject<Language>;
  isLoggedIn: Subject<boolean>;
  isP2PMode: Subject<boolean>;
  // Phase 4: Business sub-tab
  businessSubTab: Subject<BusinessSubTab>;
  companySubTab: Subject<CompanySubTab>;
  companyLoading: Subject<boolean>;
  companyData: Subject<CompanyInfo | null>;
  companyMembers: Subject<CompanyMember[]>;
  companyFleet: Subject<CompanyFleetItem[]>;
  companyMembersRef: NodeReference<HTMLDivElement>;
  companyFleetRef: NodeReference<HTMLDivElement>;
  // Company purchase
  playerMoney: Subject<number>;
  buyCompanyName: Subject<string>;
  buyCompanyAirport: Subject<string>;
  buyCompanyLoading: Subject<boolean>;
  buyCompanyError: Subject<string | null>;
  buyCompanyNameInputRef: NodeReference<HTMLInputElement>;
  buyCompanyAirportInputRef: NodeReference<HTMLInputElement>;
  onBuyCompany: () => void;
  // Company inventory (Phase 5: will move to Hangar)
  companyInventory: Subject<ProfileInventoryItem[]>;
  companyInventoryLoading: Subject<boolean>;
  companyIcaoFilter: Subject<string>;
  companyItemFilter: Subject<string>;
  companyTierFilter: Subject<number | null>;
  companyIcaoFilterRef: NodeReference<HTMLInputElement>;
  companyItemFilterRef: NodeReference<HTMLInputElement>;
  companyInventoryListRef: NodeReference<HTMLDivElement>;
  onFetchCompanyInventory: () => void;
  onSetCompanyTierFilter: (tier: number | null) => void;
  // Transfers
  playerRole: Subject<CompanyRole>;
  transferAmount: Subject<number>;
  transferLoading: Subject<boolean>;
  transferError: Subject<string | null>;
  transferAmountInputRef: NodeReference<HTMLInputElement>;
  onTransfer: (direction: "to" | "from") => void;
  // Membres
  companyMembersFullRef: NodeReference<HTMLDivElement>;
  // Historique
  companyHistoryRef: NodeReference<HTMLDivElement>;
  companyHistoryLoading: Subject<boolean>;
  // Messagerie
  companyMessagesRef: NodeReference<HTMLDivElement>;
  companyMessagesLoading: Subject<boolean>;
  companyMessageInputRef: NodeReference<HTMLInputElement>;
  companyMessageSending: Subject<boolean>;
  onSendMessage: () => void;
  // Usines
  factoryListRef: NodeReference<HTMLDivElement>;
  factoryDetailRef: NodeReference<HTMLDivElement>;
  t: (category: string, key: string) => string;
  // ═══════════════════════════════════════
  // Phase 4: Market props (from MarketView)
  // ═══════════════════════════════════════
  walletPersonal: Subject<number>;
  marketTierFilter: Subject<number | null>;
  marketIcaoFilter: Subject<string>;
  marketIcaoFilterRef: NodeReference<HTMLInputElement>;
  marketItemFilter: Subject<string>;
  marketItemFilterRef: NodeReference<HTMLInputElement>;
  marketError: Subject<string | null>;
  marketLoading: Subject<boolean>;
  marketListings: Subject<MarketListing[]>;
  marketListingsRef: NodeReference<HTMLDivElement>;
  onFetchMarketData: () => void;
  // Buy popup
  showMarketBuyPopup: Subject<boolean>;
  marketBuyItem: Subject<MarketBuyItem | null>;
  marketBuyQty: Subject<number>;
  marketBuyTotal: Subject<number>;
  marketBuyWallet: Subject<"player" | "company">;
  marketBuyQtySliderRef: NodeReference<HTMLInputElement>;
  marketBuyQtyDisplayRef: NodeReference<HTMLSpanElement>;
  onUpdateMarketBuyQty: (qty: number) => void;
  onCloseMarketBuyPopup: () => void;
  onConfirmMarketBuy: () => void;
  // Sell orders
  mySellOrdersRef: NodeReference<HTMLDivElement>;
  onFetchMySellOrders: () => void;
  onCancelSellOrder: (orderId: string) => void;
  // Aircraft
  aircraftCatalogRef: NodeReference<HTMLDivElement>;
  myAircraftForSaleRef: NodeReference<HTMLDivElement>;
  aircraftCategoryFilter: Subject<string>;
  onFetchAircraftCatalog: () => void;
  onPurchaseAircraft: (catalogId: string, ownerType: "player" | "company") => void;
  onSellAircraft: (aircraftId: string) => void;
  // Sell popups
  showSellItemPopup: Subject<boolean>;
  sellItemPopupRef: NodeReference<HTMLDivElement>;
  onOpenSellItemPopup: (itemCode?: string, airportIcao?: string) => void;
  onCloseSellItemPopup: () => void;
  showSellAircraftPopup: Subject<boolean>;
  sellAircraftPopupRef: NodeReference<HTMLDivElement>;
  onCloseSellAircraftPopup: () => void;
}

/**
 * Render the Business tab content (Phase 4: Company + Market merged)
 */
export function renderCompanyTab(props: CompanyViewProps): VNode {
  const {
    activeTab,
    currentLanguage,
    isLoggedIn,
    isP2PMode,
    businessSubTab,
    companyLoading,
    companyData,
    companyMembers,
    companyFleet,
    companyMembersRef,
    companyFleetRef,
    playerMoney,
    buyCompanyName,
    buyCompanyAirport,
    buyCompanyLoading,
    buyCompanyError,
    buyCompanyNameInputRef,
    buyCompanyAirportInputRef,
    onBuyCompany,
    playerRole,
    transferAmount,
    transferLoading,
    transferError,
    transferAmountInputRef,
    onTransfer,
    companyMembersFullRef,
    companyHistoryRef,
    companyHistoryLoading,
    companyMessagesRef,
    companyMessagesLoading,
    companyMessageInputRef,
    companyMessageSending,
    onSendMessage,
    factoryListRef,
    factoryDetailRef,
    // Phase 4: Market props
    walletPersonal,
    marketTierFilter,
    marketIcaoFilter,
    marketIcaoFilterRef,
    marketItemFilter,
    marketItemFilterRef,
    marketError,
    marketLoading,
    marketListings,
    marketListingsRef,
    onFetchMarketData,
    showMarketBuyPopup,
    marketBuyItem,
    marketBuyQty,
    marketBuyTotal,
    marketBuyWallet,
    marketBuyQtySliderRef,
    marketBuyQtyDisplayRef,
    onUpdateMarketBuyQty,
    onCloseMarketBuyPopup,
    onConfirmMarketBuy,
    mySellOrdersRef,
    onFetchMySellOrders,
    aircraftCatalogRef,
    myAircraftForSaleRef,
    aircraftCategoryFilter,
    onFetchAircraftCatalog,
    showSellItemPopup,
    sellItemPopupRef,
    onCloseSellItemPopup,
    showSellAircraftPopup,
    sellAircraftPopupRef,
    onCloseSellAircraftPopup,
  } = props;

  const COMPANY_COST = 50000;

  return (
    <div style={activeTab.map(tab => tab === "company" || tab === "business"
      ? "position: absolute; top: 0; left: 0; right: 0; bottom: 0; overflow: hidden; display: flex; flex-direction: column;"
      : "display: none;")}>

      {/* Phase 4: 3 Business Sub-Tabs */}
      <div style="display: flex; justify-content: center; align-items: center; padding: 10px 12px; background: #252532; border-bottom: 1px solid #374151; flex-shrink: 0;">
        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
          <Button callback={(): void => businessSubTab.set("marche")}>
            <div style={businessSubTab.map(t => t === "marche"
              ? "padding: 6px 12px; background: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white; font-weight: 600;"
              : "padding: 6px 12px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white;")}>
              {currentLanguage.map(l => (translations[l] as any).business?.market || translations[l].market.title)}
            </div>
          </Button>
          <Button callback={(): void => businessSubTab.set("usines")}>
            <div style={businessSubTab.map(t => t === "usines"
              ? "padding: 6px 12px; background: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white; font-weight: 600;"
              : "padding: 6px 12px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white;")}>
              {currentLanguage.map(l => (translations[l] as any).business?.factories || (translations[l].company as any).factories || "Usines")}
            </div>
          </Button>
          <Button callback={(): void => businessSubTab.set("finances")}>
            <div style={businessSubTab.map(t => t === "finances"
              ? "padding: 6px 12px; background: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white; font-weight: 600;"
              : "padding: 6px 12px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white;")}>
              {currentLanguage.map(l => (translations[l] as any).business?.finances || translations[l].company.finances)}
            </div>
          </Button>
        </div>
      </div>

      {/* Sub-Tab Content */}
      <div style="flex: 1; overflow-y: auto;">

        {/* ═══════════════════════════════════════════════════════ */}
        {/* MARCHE Sub-Tab (achats + ventes + avions) */}
        {/* ═══════════════════════════════════════════════════════ */}
        <div style={businessSubTab.map(t => t === "marche" ? "padding: 16px; color: white;" : "display: none;")}>
          {/* Not logged in */}
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
                <div style="font-size: 14px; font-weight: 700; color: #22c55e;">{walletPersonal.map(w => formatMoney(w))}</div>
              </div>
              <div style="flex: 1; background: #252532; border-radius: 8px; padding: 10px;">
                <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; margin-bottom: 4px;">{currentLanguage.map(l => translations[l].inventory.company)}</div>
                <div style="font-size: 14px; font-weight: 700; color: #3b82f6;">{companyData.map(c => c ? formatMoney(c.balance) : "0 CR")}</div>
              </div>
            </div>

            {/* === ACHATS === */}
            <div style="font-size: 11px; font-weight: 600; color: #9ca3af; text-transform: uppercase; margin-bottom: 8px;">
              {currentLanguage.map(l => l === "fr" ? "Achats" : "Buy")}
            </div>

            {/* Filters */}
            <div style="display: flex; gap: 8px; margin-bottom: 12px;">
              <div style="flex: 1;">
                <input ref={marketIcaoFilterRef} type="text"
                  placeholder={currentLanguage.map(l => l === "fr" ? "Aeroport (ICAO)..." : "Airport (ICAO)...")}
                  value={marketIcaoFilter} maxLength={4}
                  style="width: 100%; padding: 8px 12px; background: #252532; border: 1px solid #374151; border-radius: 6px; color: white; font-size: 12px; font-family: monospace; text-transform: uppercase; outline: none; box-sizing: border-box;"
                  onkeydown={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
                  onkeyup={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
                  onkeypress={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
                />
              </div>
              <div style="flex: 1;">
                <input ref={marketItemFilterRef} type="text"
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
                  : "padding: 6px 10px; background: #252532; color: #6b7280; border-radius: 6px; font-size: 10px;")}>T0</div>
              </Button>
              <Button callback={(): void => { marketTierFilter.set(1); onFetchMarketData(); }}>
                <div style={marketTierFilter.map(t => t === 1
                  ? "padding: 6px 10px; background: #22c55e; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                  : "padding: 6px 10px; background: #252532; color: #22c55e; border-radius: 6px; font-size: 10px;")}>T1</div>
              </Button>
              <Button callback={(): void => { marketTierFilter.set(2); onFetchMarketData(); }}>
                <div style={marketTierFilter.map(t => t === 2
                  ? "padding: 6px 10px; background: #3b82f6; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                  : "padding: 6px 10px; background: #252532; color: #3b82f6; border-radius: 6px; font-size: 10px;")}>T2</div>
              </Button>
              <Button callback={(): void => { marketTierFilter.set(3); onFetchMarketData(); }}>
                <div style={marketTierFilter.map(t => t === 3
                  ? "padding: 6px 10px; background: #a855f7; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                  : "padding: 6px 10px; background: #252532; color: #a855f7; border-radius: 6px; font-size: 10px;")}>T3</div>
              </Button>
              <Button callback={(): void => { marketTierFilter.set(4); onFetchMarketData(); }}>
                <div style={marketTierFilter.map(t => t === 4
                  ? "padding: 6px 10px; background: #f59e0b; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                  : "padding: 6px 10px; background: #252532; color: #f59e0b; border-radius: 6px; font-size: 10px;")}>T4</div>
              </Button>
              <Button callback={(): void => { marketTierFilter.set(5); onFetchMarketData(); }}>
                <div style={marketTierFilter.map(t => t === 5
                  ? "padding: 6px 10px; background: #ef4444; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                  : "padding: 6px 10px; background: #252532; color: #ef4444; border-radius: 6px; font-size: 10px;")}>T5</div>
              </Button>
            </div>

            {/* Error */}
            <div style={marketError.map(e => e ? "background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; border-radius: 8px; padding: 10px; margin-bottom: 12px;" : "display: none;")}>
              <span style="color: #ef4444; font-size: 12px;">{marketError}</span>
            </div>

            {/* Loading */}
            <div style={marketLoading.map(l => l ? "display: flex; justify-content: center; padding: 24px;" : "display: none;")}>
              <div style="color: #9ca3af; font-size: 12px;">{currentLanguage.map(l => translations[l].market.loadingMarket)}</div>
            </div>

            {/* Listings */}
            <div style={marketLoading.map(l => l ? "display: none;" : "display: block;")}>
              <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; margin-bottom: 8px;">
                {MappedSubject.create(([listings, lang]) => `${translations[lang].market.availableOffers} (${listings.length})`, marketListings, currentLanguage)}
              </div>
              <div ref={marketListingsRef} style="display: flex; flex-direction: column;">
                <div style="background: #252532; border-radius: 12px; padding: 24px; text-align: center;">
                  <svg style="width: 40px; height: 40px; margin-bottom: 12px; opacity: 0.4;" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5">
                    <path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
                  </svg>
                  <div style="color: #6b7280; font-size: 12px;">{currentLanguage.map(l => translations[l].common.loading)}</div>
                </div>
              </div>
            </div>

            {/* Refresh */}
            <div style="margin-top: 12px;">
              <Button callback={(): void => { onFetchMarketData(); }} disabled={marketLoading}>
                <div style={marketLoading.map(l => l
                  ? "background: #374151; color: #6b7280; padding: 10px; border-radius: 8px; text-align: center; font-size: 11px;"
                  : "background: #3b82f6; color: white; padding: 10px; border-radius: 8px; text-align: center; font-size: 11px; font-weight: 500;")}>
                  {MappedSubject.create(([loading, lang]) => loading ? translations[lang].common.loading : translations[lang].common.refresh, marketLoading, currentLanguage)}
                </div>
              </Button>
            </div>

            {/* === MES VENTES === */}
            <div style="margin-top: 20px; border-top: 1px solid #374151; padding-top: 16px;">
              <div style="font-size: 11px; font-weight: 600; color: #9ca3af; text-transform: uppercase; margin-bottom: 8px;">
                {currentLanguage.map(l => translations[l].market.mySales)}
              </div>
              <div ref={mySellOrdersRef} style="margin-bottom: 12px;">
                <div style="background: #252532; border-radius: 8px; padding: 16px; text-align: center;">
                  <div style="color: #6b7280; font-size: 11px;">{currentLanguage.map(l => translations[l].common.loading)}</div>
                </div>
              </div>
              <Button callback={(): void => { onFetchMySellOrders(); }}>
                <div style="background: #3b82f6; color: white; padding: 10px; border-radius: 8px; text-align: center; font-size: 11px; font-weight: 500;">
                  {currentLanguage.map(l => translations[l].common.refresh)}
                </div>
              </Button>
            </div>

            {/* === AVIONS === */}
            <div style="margin-top: 20px; border-top: 1px solid #374151; padding-top: 16px;">
              <div style="font-size: 11px; font-weight: 600; color: #9ca3af; text-transform: uppercase; margin-bottom: 8px;">
                {currentLanguage.map(l => l === "fr" ? "Avions" : "Aircraft")}
              </div>
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
                    : "padding: 6px 10px; background: #252532; color: #22c55e; border-radius: 6px; font-size: 10px;")}>PPL</div>
                </Button>
                <Button callback={(): void => { aircraftCategoryFilter.set("turboprop"); onFetchAircraftCatalog(); }}>
                  <div style={aircraftCategoryFilter.map(c => c === "turboprop"
                    ? "padding: 6px 10px; background: #f59e0b; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                    : "padding: 6px 10px; background: #252532; color: #f59e0b; border-radius: 6px; font-size: 10px;")}>Turbo</div>
                </Button>
                <Button callback={(): void => { aircraftCategoryFilter.set("jet_small"); onFetchAircraftCatalog(); }}>
                  <div style={aircraftCategoryFilter.map(c => c === "jet_small"
                    ? "padding: 6px 10px; background: #a855f7; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                    : "padding: 6px 10px; background: #252532; color: #a855f7; border-radius: 6px; font-size: 10px;")}>Jet</div>
                </Button>
                <Button callback={(): void => { aircraftCategoryFilter.set("helicopter"); onFetchAircraftCatalog(); }}>
                  <div style={aircraftCategoryFilter.map(c => c === "helicopter"
                    ? "padding: 6px 10px; background: #ef4444; color: white; border-radius: 6px; font-size: 10px; font-weight: 600;"
                    : "padding: 6px 10px; background: #252532; color: #ef4444; border-radius: 6px; font-size: 10px;")}>Heli</div>
                </Button>
              </div>
              <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; margin-bottom: 8px;">{currentLanguage.map(l => translations[l].market.aircraftCatalog)}</div>
              <div ref={aircraftCatalogRef} style="margin-bottom: 16px; max-height: 300px; overflow-y: auto;">
                <div style="background: #252532; border-radius: 8px; padding: 16px; text-align: center;">
                  <div style="color: #6b7280; font-size: 11px;">{currentLanguage.map(l => translations[l].common.loading)}</div>
                </div>
              </div>
              <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; margin-bottom: 8px; margin-top: 16px;">{currentLanguage.map(l => translations[l].market.myAircraftForSale)}</div>
              <div ref={myAircraftForSaleRef} style="margin-bottom: 16px;">
                <div style="background: #252532; border-radius: 8px; padding: 16px; text-align: center;">
                  <div style="color: #6b7280; font-size: 11px;">{currentLanguage.map(l => translations[l].common.loading)}</div>
                </div>
              </div>
              <Button callback={(): void => { onFetchAircraftCatalog(); }}>
                <div style="background: #3b82f6; color: white; padding: 10px; border-radius: 8px; text-align: center; font-size: 11px; font-weight: 500;">
                  {currentLanguage.map(l => translations[l].common.refresh)}
                </div>
              </Button>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* USINES Sub-Tab */}
        {/* ═══════════════════════════════════════════════════════ */}
        <div style={businessSubTab.map(t => t === "usines" ? "padding: 16px; color: white;" : "display: none;")}>
          <div style="display: flex; gap: 12px; height: 100%;">
            <div ref={factoryListRef} style="flex: 1; min-width: 0; overflow-y: auto;">
              <div style="color: #6b7280; font-size: 11px; text-align: center; padding: 24px;">{currentLanguage.map(l => translations[l].common.loading)}</div>
            </div>
            <div ref={factoryDetailRef} style="flex: 2; min-width: 0; overflow-y: auto;">
              <div style="color: #6b7280; font-size: 11px; text-align: center; padding: 24px;">{currentLanguage.map(l => (translations[l].company as any).selectFactory || "Select a factory")}</div>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* FINANCES Sub-Tab (overview + members + history + messages) */}
        {/* ═══════════════════════════════════════════════════════ */}
        <div style={businessSubTab.map(t => t === "finances" ? "padding: 16px; color: white;" : "display: none;")}>
          {/* Not logged in */}
          <div style={MappedSubject.create(([logged, p2p]) => (!logged && !p2p) ? "display: block;" : "display: none;", isLoggedIn, isP2PMode)}>
            <div style="background: rgba(245, 158, 11, 0.15); border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; text-align: center;">
              <svg style="width: 32px; height: 32px; margin-bottom: 8px;" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>
              </svg>
              <div style="color: #f59e0b; font-size: 13px; font-weight: 600; margin-bottom: 4px;">{currentLanguage.map(l => translations[l].missions.loginRequired)}</div>
              <div style="color: #9ca3af; font-size: 11px;">{currentLanguage.map(l => translations[l].company.loginToSeeCompany)}</div>
            </div>
          </div>

          {/* Logged in / P2P */}
          <div style={MappedSubject.create(([logged, p2p]) => (logged || p2p) ? "display: block;" : "display: none;", isLoggedIn, isP2PMode)}>
            {/* Loading */}
            <div style={companyLoading.map(l => l ? "display: flex; justify-content: center; padding: 32px;" : "display: none;")}>
              <div style="color: #9ca3af; font-size: 12px;">{currentLanguage.map(l => translations[l].common.loading)}</div>
            </div>

            {/* No company - Buy Form */}
            <div style={MappedSubject.create(([c, loading]) => !c && !loading ? "display: block;" : "display: none;", companyData, companyLoading)}>
              <div style="background: #252532; border-radius: 12px; padding: 24px;">
                <div style="text-align: center; margin-bottom: 20px;">
                  <div style="width: 56px; height: 56px; border-radius: 12px; background: linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%); display: flex; align-items: center; justify-content: center; margin: 0 auto 12px;">
                    <svg style="width: 28px; height: 28px;" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5">
                      <path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/>
                    </svg>
                  </div>
                  <div style="color: white; font-size: 16px; font-weight: 600; margin-bottom: 4px;">{currentLanguage.map(l => translations[l].company.noCompany)}</div>
                  <div style="color: #9ca3af; font-size: 12px;">{currentLanguage.map(l => translations[l].company.buyCompanyDesc || "Start your own aviation company")}</div>
                </div>
                {/* P2P Buy Form */}
                <div style={isP2PMode.map(p2p => p2p ? "display: block;" : "display: none;")}>
                  <div style="margin-bottom: 16px;">
                    <label style="display: block; color: #9ca3af; font-size: 11px; margin-bottom: 6px; text-transform: uppercase;">{currentLanguage.map(l => translations[l].company.companyName || "Company Name")}</label>
                    <input ref={buyCompanyNameInputRef} type="text" value={buyCompanyName}
                      oninput={(e: any) => buyCompanyName.set(e.target.value)}
                      placeholder={currentLanguage.map(l => translations[l].company.enterCompanyName || "My Aviation Company")}
                      style="width: 100%; padding: 10px 12px; background: #1a1a24; border: 1px solid #374151; border-radius: 8px; color: white; font-size: 13px; outline: none; box-sizing: border-box;"
                      onkeydown={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
                      onkeyup={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
                      onkeypress={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
                    />
                  </div>
                  <div style="margin-bottom: 16px;">
                    <label style="display: block; color: #9ca3af; font-size: 11px; margin-bottom: 6px; text-transform: uppercase;">{currentLanguage.map(l => translations[l].company.headquarters || "Headquarters Airport")}</label>
                    <input ref={buyCompanyAirportInputRef} type="text" value={buyCompanyAirport}
                      oninput={(e: any) => buyCompanyAirport.set(e.target.value.toUpperCase())}
                      placeholder="LFPG" maxLength={4}
                      style="width: 100%; padding: 10px 12px; background: #1a1a24; border: 1px solid #374151; border-radius: 8px; color: white; font-size: 13px; font-family: monospace; text-transform: uppercase; outline: none; box-sizing: border-box;"
                      onkeydown={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
                      onkeyup={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
                      onkeypress={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
                    />
                    <div style="color: #6b7280; font-size: 10px; margin-top: 4px;">{currentLanguage.map(l => translations[l].company.headquartersHint || "4-letter ICAO code")}</div>
                  </div>
                  <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 12px; margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                      <span style="color: #9ca3af; font-size: 12px;">{currentLanguage.map(l => translations[l].company.cost || "Cost")}:</span>
                      <span style="color: #3b82f6; font-size: 14px; font-weight: 600;">{formatMoney(COMPANY_COST)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                      <span style="color: #9ca3af; font-size: 12px;">{currentLanguage.map(l => translations[l].company.yourBalance || "Your balance")}:</span>
                      <span style={playerMoney.map(m => `color: ${m >= COMPANY_COST ? "#22c55e" : "#ef4444"}; font-size: 14px; font-weight: 600;`)}>{playerMoney.map(m => formatMoney(m))}</span>
                    </div>
                  </div>
                  <div style={buyCompanyError.map(e => e ? "display: block; margin-bottom: 12px;" : "display: none;")}>
                    <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; border-radius: 6px; padding: 10px; color: #ef4444; font-size: 12px; text-align: center;">{buyCompanyError}</div>
                  </div>
                  <Button callback={onBuyCompany}>
                    <div style={MappedSubject.create(([money, loading, name, airport]) => {
                      const canBuy = money >= COMPANY_COST && !loading && name.trim().length > 0 && airport.trim().length === 4;
                      return canBuy
                        ? "width: 100%; padding: 12px; background: linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%); border-radius: 8px; color: white; font-size: 13px; font-weight: 600; text-align: center;"
                        : "width: 100%; padding: 12px; background: #374151; border-radius: 8px; color: #6b7280; font-size: 13px; font-weight: 600; text-align: center;";
                    }, playerMoney, buyCompanyLoading, buyCompanyName, buyCompanyAirport)}>
                      {buyCompanyLoading.map(l => l ? (currentLanguage.get() === "fr" ? "Achat en cours..." : "Purchasing...") : (currentLanguage.get() === "fr" ? "Acheter une compagnie" : "Buy Company"))}
                    </div>
                  </Button>
                  <div style={playerMoney.map(m => m < COMPANY_COST ? "display: block; margin-top: 12px;" : "display: none;")}>
                    <div style="color: #f59e0b; font-size: 11px; text-align: center;">{currentLanguage.map(l => translations[l].company.insufficientFunds || "Insufficient funds")}</div>
                  </div>
                </div>
                {/* Network Mode */}
                <div style={isP2PMode.map(p2p => !p2p ? "display: block; text-align: center;" : "display: none;")}>
                  <div style="color: #6b7280; font-size: 11px;">{currentLanguage.map(l => translations[l].company.createFromWebmap)}</div>
                </div>
              </div>
            </div>

            {/* Company exists */}
            <div style={companyData.map(c => c ? "display: block;" : "display: none;")}>
              {/* Info Card */}
              <div style="background: #252532; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <div style="width: 48px; height: 48px; border-radius: 8px; background: linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%); display: flex; align-items: center; justify-content: center;">
                    <svg style="width: 24px; height: 24px;" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5">
                      <path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/>
                    </svg>
                  </div>
                  <div style="flex: 1;">
                    <div style="font-size: 16px; font-weight: 600; color: white;">{companyData.map(c => c?.name || "")}</div>
                    <div style="font-size: 11px; color: #9ca3af;">{currentLanguage.map(l => translations[l].company.base)}: {companyData.map(c => c?.home_airport_ident || "")}</div>
                  </div>
                </div>
              </div>

              {/* Finances */}
              <div style="background: #252532; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
                <div style="font-size: 12px; font-weight: 600; color: #9ca3af; text-transform: uppercase; margin-bottom: 12px;">{currentLanguage.map(l => translations[l].company.finances)}</div>
                <div style="display: flex; flex-wrap: wrap; gap: 12px;">
                  <div style="width: calc(50% - 6px);">
                    <div style="font-size: 18px; font-weight: 700; color: #22c55e;">{companyData.map(c => c ? formatMoney(c.balance) : "0 CR")}</div>
                    <div style="font-size: 10px; color: #6b7280;">{currentLanguage.map(l => translations[l].company.balance)}</div>
                  </div>
                  <div style="width: calc(50% - 6px);">
                    <div style="font-size: 18px; font-weight: 700; color: white;">{companyFleet.map(f => f.length.toString())}</div>
                    <div style="font-size: 10px; color: #6b7280;">{currentLanguage.map(l => translations[l].company.aircraft)}</div>
                  </div>
                </div>
              </div>

              {/* Transfers */}
              <div style="background: #252532; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
                <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                  <div style="flex: 1; background: #1a1a24; border-radius: 8px; padding: 10px; text-align: center;">
                    <div style="font-size: 16px; font-weight: 700; color: #3b82f6;">{playerMoney.map(m => formatMoney(m))}</div>
                    <div style="font-size: 9px; color: #6b7280; margin-top: 2px;">{currentLanguage.map(l => translations[l].company.personalBalance)}</div>
                  </div>
                  <div style="flex: 1; background: #1a1a24; border-radius: 8px; padding: 10px; text-align: center;">
                    <div style="font-size: 16px; font-weight: 700; color: #22c55e;">{companyData.map(c => c ? formatMoney(c.balance) : "0 CR")}</div>
                    <div style="font-size: 9px; color: #6b7280; margin-top: 2px;">{currentLanguage.map(l => translations[l].company.companyBalance)}</div>
                  </div>
                </div>
                <div style="display: flex; gap: 6px; align-items: center;">
                  <input ref={transferAmountInputRef} type="number" min="0" placeholder="0"
                    style="flex: 1; padding: 8px 10px; background: #1a1a24; border: 1px solid #374151; border-radius: 6px; color: white; font-size: 12px; outline: none; box-sizing: border-box;"
                    onkeydown={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
                    onkeyup={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
                    onkeypress={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
                  />
                  <Button callback={(): void => onTransfer("to")}>
                    <div style={transferLoading.map(l => l
                      ? "padding: 8px 10px; background: #374151; border-radius: 6px; font-size: 10px; color: #6b7280; white-space: nowrap;"
                      : "padding: 8px 10px; background: #22c55e; border-radius: 6px; font-size: 10px; color: white; font-weight: 600; white-space: nowrap;")}>
                      {currentLanguage.map(l => translations[l].company.transferToCompany)}
                    </div>
                  </Button>
                  <Button callback={(): void => onTransfer("from")}>
                    <div style={MappedSubject.create(([loading, role]) => {
                      const canWithdraw = role === "ceo" || role === "officer";
                      return loading || !canWithdraw
                        ? "padding: 8px 10px; background: #374151; border-radius: 6px; font-size: 10px; color: #6b7280; white-space: nowrap;"
                        : "padding: 8px 10px; background: #ef4444; border-radius: 6px; font-size: 10px; color: white; font-weight: 600; white-space: nowrap;";
                    }, transferLoading, playerRole)}>
                      {currentLanguage.map(l => translations[l].company.transferFromCompany)}
                    </div>
                  </Button>
                </div>
                <div style={transferError.map(e => e ? "margin-top: 8px;" : "display: none;")}>
                  <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; border-radius: 6px; padding: 8px; color: #ef4444; font-size: 11px; text-align: center;">{transferError}</div>
                </div>
              </div>

              {/* Members */}
              <div style="margin-top: 20px; border-top: 1px solid #374151; padding-top: 16px;">
                <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; margin-bottom: 8px;">
                  {MappedSubject.create(([m, l]) => `${translations[l].company.members} (${m.length})`, companyMembers, currentLanguage)}
                </div>
                <div ref={companyMembersFullRef} style="display: flex; flex-direction: column;">
                  <div style="color: #6b7280; font-size: 11px; text-align: center; padding: 16px;">{currentLanguage.map(l => translations[l].common.loading)}</div>
                </div>
              </div>

              {/* History */}
              <div style="margin-top: 20px; border-top: 1px solid #374151; padding-top: 16px;">
                <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; margin-bottom: 8px;">{currentLanguage.map(l => translations[l].company.companyHistory)}</div>
                <div style={companyHistoryLoading.map(l => l ? "display: flex; justify-content: center; padding: 24px;" : "display: none;")}>
                  <div style="color: #9ca3af; font-size: 12px;">{currentLanguage.map(l => translations[l].common.loading)}</div>
                </div>
                <div ref={companyHistoryRef} style={companyHistoryLoading.map(l => l ? "display: none;" : "display: block;")}>
                  <div style="color: #6b7280; font-size: 11px; text-align: center; padding: 24px;">{currentLanguage.map(l => translations[l].common.loading)}</div>
                </div>
              </div>

              {/* Messagerie */}
              <div style="margin-top: 20px; border-top: 1px solid #374151; padding-top: 16px; position: relative;">
                <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; margin-bottom: 8px;">{currentLanguage.map(l => translations[l].company.messages)}</div>
                {/* Solo overlay */}
                <div style={isP2PMode.map(p2p => p2p
                  ? "background: rgba(13, 13, 20, 0.85); border-radius: 12px; padding: 32px 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;"
                  : "display: none;")}>
                  <svg style="width: 48px; height: 48px; margin-bottom: 12px; opacity: 0.5;" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"/>
                  </svg>
                  <div style="color: #9ca3af; font-size: 14px; font-weight: 600; margin-bottom: 4px;">{currentLanguage.map(l => translations[l].company.onlineOnly)}</div>
                  <div style="color: #6b7280; font-size: 11px; max-width: 240px;">{currentLanguage.map(l => translations[l].company.onlineOnlyDesc)}</div>
                </div>
                {/* Online messages */}
                <div style={isP2PMode.map(p2p => p2p ? "display: none;" : "display: block;")}>
                  <div style={companyMessagesLoading.map(l => l ? "display: flex; justify-content: center; padding: 24px;" : "display: none;")}>
                    <div style="color: #9ca3af; font-size: 12px;">{currentLanguage.map(l => translations[l].common.loading)}</div>
                  </div>
                  <div ref={companyMessagesRef} style={companyMessagesLoading.map(l => l ? "display: none;" : "display: block;")}>
                    <div style="color: #6b7280; font-size: 11px; text-align: center; padding: 24px;">{currentLanguage.map(l => translations[l].company.noMessages)}</div>
                  </div>
                  <div style="display: flex; gap: 6px; align-items: center; margin-top: 8px;">
                    <input ref={companyMessageInputRef} type="text"
                      placeholder={currentLanguage.map(l => translations[l].company.messagePlaceholder)}
                      style="flex: 1; padding: 10px 12px; background: #1a1a24; border: 1px solid #374151; border-radius: 8px; color: white; font-size: 12px; outline: none; box-sizing: border-box;"
                      onkeydown={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
                      onkeyup={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
                      onkeypress={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
                    />
                    <Button callback={onSendMessage}>
                      <div style={companyMessageSending.map(s => s
                        ? "padding: 10px 16px; background: #374151; border-radius: 8px; color: #6b7280; font-size: 12px; font-weight: 600;"
                        : "padding: 10px 16px; background: #3b82f6; border-radius: 8px; color: white; font-size: 12px; font-weight: 600;")}>
                        {currentLanguage.map(l => translations[l].company.sendMessage)}
                      </div>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>{/* End Sub-Tab Content */}

      {/* ═══════════════════ POPUPS ═══════════════════ */}

      {/* Market Buy Popup */}
      <div style={showMarketBuyPopup.map(s => s
        ? "position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px;"
        : "display: none;")}>
        <div style="background: #252532; border-radius: 12px; padding: 20px; width: 100%; max-width: 320px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h3 style="font-size: 14px; font-weight: 600; color: white; margin: 0;">{currentLanguage.map(l => translations[l].market.buy)}</h3>
            <Button callback={(): void => { onCloseMarketBuyPopup(); }}>
              <div style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; color: #6b7280; font-size: 18px;">x</div>
            </Button>
          </div>
          <div style="background: #1a1a24; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
            <div style="font-size: 14px; font-weight: 600; color: white; margin-bottom: 4px;">{marketBuyItem.map(i => i?.item_name || "")}</div>
            <div style="font-size: 11px; color: #6b7280;">@ {marketBuyItem.map(i => i?.airport_ident || "")} • {marketBuyItem.map(i => i?.company_name || "")}</div>
            <div style="display: flex; justify-content: space-between; margin-top: 8px;">
              <span style="font-size: 12px; color: #9ca3af;">{currentLanguage.map(l => translations[l].market.unitPrice)}:</span>
              <span style="font-size: 12px; font-weight: 600; color: #22c55e;">{marketBuyItem.map(i => i ? formatMoney(i.sale_price) : "")}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="font-size: 12px; color: #9ca3af;">{currentLanguage.map(l => translations[l].common.available)}:</span>
              <span style="font-size: 12px; color: white;">{marketBuyItem.map(i => i?.sale_qty.toString() || "0")}</span>
            </div>
          </div>
          <div style="margin-bottom: 16px;">
            <div style="font-size: 11px; color: #6b7280; margin-bottom: 6px;">{currentLanguage.map(l => translations[l].common.quantity)}</div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <input ref={marketBuyQtySliderRef} type="range" min="1" max="1" value="1" style="flex: 1; accent-color: #3b82f6;"
                oninput={(e: Event): void => { onUpdateMarketBuyQty(parseInt((e.target as HTMLInputElement).value)); }} />
              <span ref={marketBuyQtyDisplayRef} style="font-size: 14px; font-weight: 600; color: white; min-width: 30px; text-align: right;">{marketBuyQty}</span>
            </div>
          </div>
          <div style="margin-bottom: 16px;">
            <div style="display: flex; gap: 8px;">
              <div style="flex: 1; padding: 10px; background: #1a1a24; border: 1px solid #3b82f6; border-radius: 6px; text-align: center;">
                <div style="font-size: 10px; color: #6b7280;">{currentLanguage.map(l => l === "fr" ? "Perso" : "Personal")}</div>
                <div style="font-size: 12px; font-weight: 600; color: #3b82f6;">{walletPersonal.map(w => formatMoney(w))}</div>
              </div>
              <div style="flex: 1; padding: 10px; background: #1a1a24; border: 1px solid #f59e0b; border-radius: 6px; text-align: center;">
                <div style="font-size: 10px; color: #6b7280;">{currentLanguage.map(l => l === "fr" ? "Company" : "Company")}</div>
                <div style="font-size: 12px; font-weight: 600; color: #f59e0b;">{companyData.map(c => c ? formatMoney(c.balance) : "- CR")}</div>
              </div>
            </div>
          </div>
          <div style="background: #1a1a24; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 12px; color: #9ca3af;">{currentLanguage.map(l => translations[l].common.total)}:</span>
              <span style="font-size: 16px; font-weight: 700; color: #f59e0b;">{marketBuyTotal.map(t => formatMoney(t))}</span>
            </div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; gap: 8px;">
              <Button callback={(): void => { marketBuyWallet.set("player"); onConfirmMarketBuy(); }}>
                <div style={MappedSubject.create(([total, wallet]) => wallet >= total
                  ? "flex: 1; padding: 12px; background: #3b82f6; color: white; border-radius: 8px; text-align: center; font-size: 12px; font-weight: 600;"
                  : "flex: 1; padding: 12px; background: #374151; color: #6b7280; border-radius: 8px; text-align: center; font-size: 12px; opacity: 0.5; pointer-events: none;",
                  marketBuyTotal, walletPersonal)}>
                  {currentLanguage.map(l => l === "fr" ? "Acheter perso" : "Buy personal")}
                </div>
              </Button>
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
              <div style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; color: #6b7280; font-size: 18px;">x</div>
            </Button>
          </div>
          <div ref={sellItemPopupRef}></div>
        </div>
      </div>

      {/* Aircraft Sell Popup */}
      <div style={showSellAircraftPopup.map(s => s
        ? "position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px;"
        : "display: none;")}>
        <div style="background: #252532; border-radius: 12px; padding: 20px; width: 100%; max-width: 320px; max-height: 90vh; overflow-y: auto;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h3 style="font-size: 14px; font-weight: 600; color: white; margin: 0;">{currentLanguage.map(l => translations[l].market.sellAircraft)}</h3>
            <Button callback={(): void => { onCloseSellAircraftPopup(); }}>
              <div style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; color: #6b7280; font-size: 18px;">x</div>
            </Button>
          </div>
          <div ref={sellAircraftPopupRef}></div>
        </div>
      </div>

    </div>
  );
}
