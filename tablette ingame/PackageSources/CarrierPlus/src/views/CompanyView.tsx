/**
 * CompanyView - Company tab render function with sub-tabs
 * Extracted from CarrierPlus.tsx for better maintainability
 */
import { FSComponent, VNode, Subject, MappedSubject, NodeReference } from "@microsoft/msfs-sdk";
import { Button } from "@efb/efb-api";
import type { Language, CompanyInfo, CompanySubTab, CompanyFleetItem, CompanyMember } from "../types";

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
 * Props interface for CompanyView
 */
export interface CompanyViewProps {
  activeTab: Subject<string>;
  currentLanguage: Subject<Language>;
  isLoggedIn: Subject<boolean>;
  isP2PMode: Subject<boolean>;
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
  buyCompanyLoading: Subject<boolean>;
  buyCompanyError: Subject<string | null>;
  onBuyCompany: () => void;
  t: (category: string, key: string) => string;
}

/**
 * Render the Company tab content
 */
export function renderCompanyTab(props: CompanyViewProps): VNode {
  const {
    activeTab,
    currentLanguage,
    isLoggedIn,
    isP2PMode,
    companySubTab,
    companyLoading,
    companyData,
    companyMembers,
    companyFleet,
    companyMembersRef,
    companyFleetRef,
    playerMoney,
    buyCompanyName,
    buyCompanyLoading,
    buyCompanyError,
    onBuyCompany,
    t,
  } = props;

  const COMPANY_COST = 50000;

  return (
    <div style={activeTab.map(tab => tab === "company"
      ? "position: absolute; top: 0; left: 0; right: 0; bottom: 0; overflow: hidden; display: flex; flex-direction: column;"
      : "display: none;")}>

      {/* Company Sub-Tabs Header (centered) */}
      <div style="display: flex; justify-content: center; align-items: center; padding: 10px 12px; background: #252532; border-bottom: 1px solid #374151; flex-shrink: 0;">
        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
          <Button callback={(): void => companySubTab.set("apercu")}>
            <div style={companySubTab.map(t => t === "apercu"
              ? "padding: 6px 12px; background: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white; font-weight: 600;"
              : "padding: 6px 12px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white;")}>
              {currentLanguage.map(l => translations[l].company.overview)}
            </div>
          </Button>
          <Button callback={(): void => companySubTab.set("personnel")}>
            <div style={companySubTab.map(t => t === "personnel"
              ? "padding: 6px 12px; background: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white; font-weight: 600;"
              : "padding: 6px 12px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white;")}>
              {currentLanguage.map(l => translations[l].company.staff)}
            </div>
          </Button>
          <Button callback={(): void => companySubTab.set("messagerie")}>
            <div style={companySubTab.map(t => t === "messagerie"
              ? "padding: 6px 12px; background: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white; font-weight: 600;"
              : "padding: 6px 12px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white;")}>
              {currentLanguage.map(l => translations[l].company.messages)}
            </div>
          </Button>
          <Button callback={(): void => companySubTab.set("flotte")}>
            <div style={companySubTab.map(t => t === "flotte"
              ? "padding: 6px 12px; background: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white; font-weight: 600;"
              : "padding: 6px 12px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white;")}>
              {currentLanguage.map(l => translations[l].company.fleet)}
            </div>
          </Button>
          <Button callback={(): void => companySubTab.set("inventaire")}>
            <div style={companySubTab.map(t => t === "inventaire"
              ? "padding: 6px 12px; background: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white; font-weight: 600;"
              : "padding: 6px 12px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white;")}>
              {currentLanguage.map(l => translations[l].company.inventory)}
            </div>
          </Button>
          <Button callback={(): void => companySubTab.set("usines")}>
            <div style={companySubTab.map(t => t === "usines"
              ? "padding: 6px 12px; background: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white; font-weight: 600;"
              : "padding: 6px 12px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white;")}>
              {currentLanguage.map(l => translations[l].company.factories)}
            </div>
          </Button>
          <Button callback={(): void => companySubTab.set("droits")}>
            <div style={companySubTab.map(t => t === "droits"
              ? "padding: 6px 12px; background: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white; font-weight: 600;"
              : "padding: 6px 12px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white;")}>
              {currentLanguage.map(l => translations[l].company.rights)}
            </div>
          </Button>
        </div>
      </div>

      {/* Company Sub-Tab Content */}
      <div style="flex: 1; overflow-y: auto;">

        {/* Apercu Sub-Tab */}
        <div style={companySubTab.map(t => t === "apercu" ? "padding: 16px; color: white;" : "display: none;")}>
          {/* Not logged in message (only show if not logged in AND not P2P mode) */}
          <div style={MappedSubject.create(([logged, p2p]) => (!logged && !p2p) ? "display: block;" : "display: none;", isLoggedIn, isP2PMode)}>
            <div style="background: rgba(245, 158, 11, 0.15); border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; text-align: center;">
              <svg style="width: 32px; height: 32px; margin-bottom: 8px;" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v4"/>
                <path d="M12 16h.01"/>
              </svg>
              <div style="color: #f59e0b; font-size: 13px; font-weight: 600; margin-bottom: 4px;">{currentLanguage.map(l => translations[l].missions.loginRequired)}</div>
              <div style="color: #9ca3af; font-size: 11px;">{currentLanguage.map(l => translations[l].company.loginToSeeCompany)}</div>
            </div>
          </div>

          {/* Logged in content (show if logged in OR P2P mode) */}
          <div style={MappedSubject.create(([logged, p2p]) => (logged || p2p) ? "display: block;" : "display: none;", isLoggedIn, isP2PMode)}>
            {/* Loading state */}
            <div style={companyLoading.map(l => l ? "display: flex; justify-content: center; padding: 32px;" : "display: none;")}>
              <div style="color: #9ca3af; font-size: 12px;">{currentLanguage.map(l => translations[l].common.loading)}</div>
            </div>

            {/* No company - Buy Company Form */}
            <div style={MappedSubject.create(([c, loading]) => !c && !loading ? "display: block;" : "display: none;", companyData, companyLoading)}>
              <div style="background: #252532; border-radius: 12px; padding: 24px;">
                {/* Header */}
                <div style="text-align: center; margin-bottom: 20px;">
                  <div style="width: 56px; height: 56px; border-radius: 12px; background: linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%); display: flex; align-items: center; justify-content: center; margin: 0 auto 12px;">
                    <svg style="width: 28px; height: 28px;" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5">
                      <path d="M3 21h18"/>
                      <path d="M5 21V7l8-4v18"/>
                      <path d="M19 21V11l-6-4"/>
                    </svg>
                  </div>
                  <div style="color: white; font-size: 16px; font-weight: 600; margin-bottom: 4px;">{currentLanguage.map(l => translations[l].company.noCompany)}</div>
                  <div style="color: #9ca3af; font-size: 12px;">{currentLanguage.map(l => translations[l].company.buyCompanyDesc || "Start your own aviation company")}</div>
                </div>

                {/* P2P Mode only - Buy Company Form */}
                <div style={isP2PMode.map(p2p => p2p ? "display: block;" : "display: none;")}>
                  {/* Company Name Input */}
                  <div style="margin-bottom: 16px;">
                    <label style="display: block; color: #9ca3af; font-size: 11px; margin-bottom: 6px; text-transform: uppercase;">{currentLanguage.map(l => translations[l].company.companyName || "Company Name")}</label>
                    <input
                      type="text"
                      value={buyCompanyName}
                      oninput={(e: any) => buyCompanyName.set(e.target.value)}
                      placeholder={currentLanguage.map(l => translations[l].company.enterCompanyName || "My Aviation Company")}
                      style="width: 100%; padding: 10px 12px; background: #1a1a24; border: 1px solid #374151; border-radius: 8px; color: white; font-size: 13px; outline: none; box-sizing: border-box;"
                    />
                  </div>

                  {/* Price Info */}
                  <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 12px; margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                      <span style="color: #9ca3af; font-size: 12px;">{currentLanguage.map(l => translations[l].company.cost || "Cost")}:</span>
                      <span style="color: #3b82f6; font-size: 14px; font-weight: 600;">{COMPANY_COST.toLocaleString()} CR</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                      <span style="color: #9ca3af; font-size: 12px;">{currentLanguage.map(l => translations[l].company.yourBalance || "Your balance")}:</span>
                      <span style={playerMoney.map(m => `color: ${m >= COMPANY_COST ? "#22c55e" : "#ef4444"}; font-size: 14px; font-weight: 600;`)}>{playerMoney.map(m => `${m.toLocaleString()} CR`)}</span>
                    </div>
                  </div>

                  {/* Error Message */}
                  <div style={buyCompanyError.map(e => e ? "display: block; margin-bottom: 12px;" : "display: none;")}>
                    <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; border-radius: 6px; padding: 10px; color: #ef4444; font-size: 12px; text-align: center;">
                      {buyCompanyError}
                    </div>
                  </div>

                  {/* Buy Button */}
                  <Button callback={onBuyCompany}>
                    <div style={MappedSubject.create(([money, loading, name]) => {
                      const canBuy = money >= COMPANY_COST && !loading && name.trim().length > 0;
                      return canBuy
                        ? "width: 100%; padding: 12px; background: linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%); border-radius: 8px; color: white; font-size: 13px; font-weight: 600; text-align: center; cursor: pointer;"
                        : "width: 100%; padding: 12px; background: #374151; border-radius: 8px; color: #6b7280; font-size: 13px; font-weight: 600; text-align: center; cursor: not-allowed;";
                    }, playerMoney, buyCompanyLoading, buyCompanyName)}>
                      {buyCompanyLoading.map(l => l
                        ? currentLanguage.get() === "fr" ? "Achat en cours..." : "Purchasing..."
                        : currentLanguage.get() === "fr" ? "Acheter une compagnie" : "Buy Company"
                      )}
                    </div>
                  </Button>

                  {/* Insufficient funds warning */}
                  <div style={playerMoney.map(m => m < COMPANY_COST ? "display: block; margin-top: 12px;" : "display: none;")}>
                    <div style="color: #f59e0b; font-size: 11px; text-align: center;">
                      {currentLanguage.map(l => translations[l].company.insufficientFunds || "Insufficient funds to purchase a company")}
                    </div>
                  </div>
                </div>

                {/* Network Mode - Redirect to webmap */}
                <div style={isP2PMode.map(p2p => !p2p ? "display: block; text-align: center;" : "display: none;")}>
                  <div style="color: #6b7280; font-size: 11px;">{currentLanguage.map(l => translations[l].company.createFromWebmap)}</div>
                </div>
              </div>
            </div>

            {/* Company data */}
            <div style={companyData.map(c => c ? "display: block;" : "display: none;")}>
              {/* Company Info */}
              <div style="background: #252532; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <div style="width: 48px; height: 48px; border-radius: 8px; background: linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%); display: flex; align-items: center; justify-content: center;">
                    <svg style="width: 24px; height: 24px;" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5">
                      <path d="M3 21h18"/>
                      <path d="M5 21V7l8-4v18"/>
                      <path d="M19 21V11l-6-4"/>
                    </svg>
                  </div>
                  <div style="flex: 1;">
                    <div style="font-size: 16px; font-weight: 600; color: white;">
                      {companyData.map(c => c?.name || "")}
                    </div>
                    <div style="font-size: 11px; color: #9ca3af;">
                      {currentLanguage.map(l => translations[l].company.base)}: {companyData.map(c => c?.home_airport_ident || "")}
                    </div>
                  </div>
                </div>
              </div>

              {/* Finances */}
              <div style="background: #252532; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
                <div style="font-size: 12px; font-weight: 600; color: #9ca3af; text-transform: uppercase; margin-bottom: 12px;">{currentLanguage.map(l => translations[l].company.finances)}</div>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
                  <div>
                    <div style="font-size: 18px; font-weight: 700; color: #22c55e;">
                      {companyData.map(c => c ? `${c.balance.toLocaleString()} CR` : "0 CR")}
                    </div>
                    <div style="font-size: 10px; color: #6b7280;">{currentLanguage.map(l => translations[l].company.balance)}</div>
                  </div>
                  <div>
                    <div style="font-size: 18px; font-weight: 700; color: white;">
                      {companyFleet.map(f => f.length.toString())}
                    </div>
                    <div style="font-size: 10px; color: #6b7280;">{currentLanguage.map(l => translations[l].company.aircraft)}</div>
                  </div>
                </div>
              </div>

              {/* Members */}
              <div style="background: #252532; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
                <div style="font-size: 12px; font-weight: 600; color: #9ca3af; text-transform: uppercase; margin-bottom: 12px;">
                  {MappedSubject.create(([m, l]) => `${translations[l].company.members} (${m.length})`, companyMembers, currentLanguage)}
                </div>
                <div ref={companyMembersRef} style="display: flex; flex-direction: column;">
                  <div style="color: #6b7280; font-size: 11px; text-align: center; padding: 16px;">{currentLanguage.map(l => translations[l].common.loading)}</div>
                </div>
              </div>

              {/* Fleet preview */}
              <div style="background: #252532; border-radius: 12px; padding: 16px;">
                <div style="font-size: 12px; font-weight: 600; color: #9ca3af; text-transform: uppercase; margin-bottom: 12px;">
                  {MappedSubject.create(([f, l]) => `${translations[l].company.fleet} (${f.length})`, companyFleet, currentLanguage)}
                </div>
                <div ref={companyFleetRef} style="display: flex; flex-direction: column;">
                  <div style="color: #6b7280; font-size: 11px; text-align: center; padding: 16px;">{currentLanguage.map(l => translations[l].common.loading)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Personnel Sub-Tab */}
        <div style={companySubTab.map(t => t === "personnel" ? "padding: 16px; color: white;" : "display: none;")}>
          <div style="background: #252532; border-radius: 12px; padding: 24px; text-align: center;">
            <svg style="width: 40px; height: 40px; margin-bottom: 12px; opacity: 0.4;" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87"/>
              <path d="M16 3.13a4 4 0 010 7.75"/>
            </svg>
            <div style="color: #6b7280; font-size: 12px;">{currentLanguage.map(l => translations[l].company.staffManagement)}</div>
            <div style="color: #4b5563; font-size: 10px; margin-top: 4px;">{t("profile", "comingSoon")}</div>
          </div>
        </div>

        {/* Messagerie Sub-Tab */}
        <div style={companySubTab.map(t => t === "messagerie" ? "padding: 16px; color: white;" : "display: none;")}>
          <div style="background: #252532; border-radius: 12px; padding: 24px; text-align: center;">
            <svg style="width: 40px; height: 40px; margin-bottom: 12px; opacity: 0.4;" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"/>
            </svg>
            <div style="color: #6b7280; font-size: 12px;">{currentLanguage.map(l => translations[l].company.companyMessages)}</div>
            <div style="color: #4b5563; font-size: 10px; margin-top: 4px;">{t("profile", "comingSoon")}</div>
          </div>
        </div>

        {/* Flotte Sub-Tab */}
        <div style={companySubTab.map(t => t === "flotte" ? "padding: 16px; color: white;" : "display: none;")}>
          <div style="background: #252532; border-radius: 12px; padding: 24px; text-align: center;">
            <svg style="width: 40px; height: 40px; margin-bottom: 12px; opacity: 0.4;" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5">
              <path d="M22 2L11 13"/>
              <path d="M22 2l-7 20-4-9-9-4 20-7z"/>
            </svg>
            <div style="color: #6b7280; font-size: 12px;">{currentLanguage.map(l => translations[l].company.fleetManagement)}</div>
            <div style="color: #4b5563; font-size: 10px; margin-top: 4px;">{t("profile", "comingSoon")}</div>
          </div>
        </div>

        {/* Inventaire Sub-Tab */}
        <div style={companySubTab.map(t => t === "inventaire" ? "padding: 16px; color: white;" : "display: none;")}>
          <div style="background: #252532; border-radius: 12px; padding: 24px; text-align: center;">
            <svg style="width: 40px; height: 40px; margin-bottom: 12px; opacity: 0.4;" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5">
              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
              <path d="M3.27 6.96L12 12.01l8.73-5.05"/>
              <path d="M12 22.08V12"/>
            </svg>
            <div style="color: #6b7280; font-size: 12px;">{currentLanguage.map(l => translations[l].company.companyInventory)}</div>
            <div style="color: #4b5563; font-size: 10px; margin-top: 4px;">{t("profile", "comingSoon")}</div>
          </div>
        </div>

        {/* Usines Sub-Tab */}
        <div style={companySubTab.map(t => t === "usines" ? "padding: 16px; color: white;" : "display: none;")}>
          <div style="background: #252532; border-radius: 12px; padding: 24px; text-align: center;">
            <svg style="width: 40px; height: 40px; margin-bottom: 12px; opacity: 0.4;" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5">
              <path d="M2 20h20"/>
              <path d="M5 20V8l4-4v4l4-4v4l4-4v16"/>
              <path d="M8 12h.01"/>
              <path d="M12 12h.01"/>
              <path d="M8 16h.01"/>
              <path d="M12 16h.01"/>
            </svg>
            <div style="color: #6b7280; font-size: 12px;">{currentLanguage.map(l => translations[l].company.factoryManagement)}</div>
            <div style="color: #4b5563; font-size: 10px; margin-top: 4px;">{t("profile", "comingSoon")}</div>
          </div>
        </div>

        {/* Droits Sub-Tab */}
        <div style={companySubTab.map(t => t === "droits" ? "padding: 16px; color: white;" : "display: none;")}>
          <div style="background: #252532; border-radius: 12px; padding: 24px; text-align: center;">
            <svg style="width: 40px; height: 40px; margin-bottom: 12px; opacity: 0.4;" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="M9 12l2 2 4-4"/>
            </svg>
            <div style="color: #6b7280; font-size: 12px;">{currentLanguage.map(l => translations[l].company.rightsManagement)}</div>
            <div style="color: #4b5563; font-size: 10px; margin-top: 4px;">{t("profile", "comingSoon")}</div>
          </div>
        </div>

      </div>
    </div>
  );
}
