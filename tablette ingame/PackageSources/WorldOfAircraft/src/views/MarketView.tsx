/**
 * MarketView - Market (HV) tab render function
 * Extracted from WorldOfAircraft.tsx for better maintainability
 */
import { FSComponent, VNode, Subject, MappedSubject, NodeReference } from "@microsoft/msfs-sdk";
import { Button } from "@efb/efb-api";
import type { Language, MarketListing, MarketBuyItem, CompanyInfo } from "../types";

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
  walletPersonal: Subject<number>;
  companyData: Subject<CompanyInfo | null>;
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
}

/**
 * Render the Market tab content
 */
export function renderMarketTab(props: MarketViewProps): VNode {
  const {
    activeTab,
    currentLanguage,
    isLoggedIn,
    walletPersonal,
    companyData,
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
  } = props;

  return (
    <div>
      {/* Market (HV) Tab Content */}
      <div style={activeTab.map(t => t === "market"
        ? "position: absolute; top: 0; left: 0; right: 0; bottom: 0; overflow-y: auto; display: flex; flex-direction: column;"
        : "display: none;")}>
        <div style="padding: 16px; color: white; overflow-y: auto;">
          <h2 style="font-size: 16px; font-weight: 600; color: #60a5fa; margin: 0 0 16px 0;">Hotel des Ventes</h2>

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
                  {walletPersonal.map(w => `${w.toLocaleString()} CR`)}
                </div>
              </div>
              <div style="flex: 1; background: #252532; border-radius: 8px; padding: 10px;">
                <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; margin-bottom: 4px;">{currentLanguage.map(l => translations[l].inventory.company)}</div>
                <div style="font-size: 14px; font-weight: 700; color: #3b82f6;">
                  {companyData.map(c => c ? `${c.balance.toLocaleString()} CR` : "0 CR")}
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
              <span style="font-size: 12px; font-weight: 600; color: #22c55e;">{marketBuyItem.map(i => i ? `${i.sale_price.toLocaleString()} CR` : "")}</span>
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

          {/* Wallet selector */}
          <div style="margin-bottom: 16px;">
            <div style="font-size: 11px; color: #6b7280; margin-bottom: 6px;">{currentLanguage.map(l => translations[l].market.payWith)}</div>
            <div style="display: flex; gap: 8px;">
              <Button callback={(): void => { marketBuyWallet.set("company"); }}>
                <div style={marketBuyWallet.map(w => w === "company"
                  ? "flex: 1; padding: 10px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 6px; text-align: center;"
                  : "flex: 1; padding: 10px; background: #1a1a24; border: 1px solid #374151; border-radius: 6px; text-align: center;")}>
                  <div style="font-size: 10px; color: #6b7280;">{currentLanguage.map(l => translations[l].hangar.companyOwned)}</div>
                  <div style={marketBuyWallet.map(w => w === "company" ? "font-size: 12px; font-weight: 600; color: #3b82f6;" : "font-size: 12px; color: #9ca3af;")}>
                    {companyData.map(c => c ? `${c.balance.toLocaleString()} CR` : "0 CR")}
                  </div>
                </div>
              </Button>
              <Button callback={(): void => { marketBuyWallet.set("player"); }}>
                <div style={marketBuyWallet.map(w => w === "player"
                  ? "flex: 1; padding: 10px; background: rgba(34, 197, 94, 0.2); border: 1px solid #22c55e; border-radius: 6px; text-align: center;"
                  : "flex: 1; padding: 10px; background: #1a1a24; border: 1px solid #374151; border-radius: 6px; text-align: center;")}>
                  <div style="font-size: 10px; color: #6b7280;">{currentLanguage.map(l => translations[l].hangar.personal)}</div>
                  <div style={marketBuyWallet.map(w => w === "player" ? "font-size: 12px; font-weight: 600; color: #22c55e;" : "font-size: 12px; color: #9ca3af;")}>
                    {walletPersonal.map(w => `${w.toLocaleString()} CR`)}
                  </div>
                </div>
              </Button>
            </div>
          </div>

          {/* Total */}
          <div style="background: #1a1a24; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 12px; color: #9ca3af;">{currentLanguage.map(l => translations[l].common.total)}:</span>
              <span style="font-size: 16px; font-weight: 700; color: #f59e0b;">
                {marketBuyTotal.map(t => `${t.toLocaleString()} CR`)}
              </span>
            </div>
          </div>

          {/* Buttons */}
          <div style="display: flex; gap: 8px;">
            <Button callback={(): void => { onCloseMarketBuyPopup(); }}>
              <div style="flex: 1; padding: 12px; background: #374151; color: #9ca3af; border-radius: 8px; text-align: center; font-size: 12px;">
                {currentLanguage.map(l => translations[l].common.cancel)}
              </div>
            </Button>
            <Button callback={(): void => { onConfirmMarketBuy(); }}>
              <div style="flex: 1; padding: 12px; background: #22c55e; color: white; border-radius: 8px; text-align: center; font-size: 12px; font-weight: 600;">
                {currentLanguage.map(l => translations[l].common.confirm)}
              </div>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
