/**
 * ContratsView - Contrats tab render function with sub-tabs
 * V5: Full contract UI with available, my contracts, active
 */
import { FSComponent, VNode, Subject, MappedSubject, NodeReference } from "@microsoft/msfs-sdk";
import { Button } from "@efb/efb-api";
import type { Language, ContratsSubTab } from "../types";

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
 * Props interface for ContratsView
 */
export interface ContratsViewProps {
  activeTab: Subject<string>;
  currentLanguage: Subject<Language>;
  isLoggedIn: Subject<boolean>;
  contratsSubTab: Subject<ContratsSubTab>;
  // Refs for innerHTML rendering
  availableContractsRef: NodeReference<HTMLDivElement>;
  activeContractsRef: NodeReference<HTMLDivElement>;
  completedContractsRef: NodeReference<HTMLDivElement>;
  contractPopupRef: NodeReference<HTMLDivElement>;
  // Loading
  contractsLoading: Subject<boolean>;
  // Callbacks
  onRefreshContracts: () => void;
  // P2P mode
  isP2PMode: Subject<boolean>;
}

/**
 * Render the Contrats tab content
 */
export function renderContratsTab(props: ContratsViewProps): VNode {
  const {
    activeTab,
    currentLanguage,
    isLoggedIn,
    contratsSubTab,
    availableContractsRef,
    activeContractsRef,
    completedContractsRef,
    contractPopupRef,
    contractsLoading,
    onRefreshContracts,
    isP2PMode,
  } = props;

  return (
    <div style={activeTab.map(tab => tab === "contrats"
      ? "position: absolute; top: 0; left: 0; right: 0; bottom: 0; overflow: hidden; display: flex; flex-direction: column;"
      : "display: none;")}>

      {/* Sub-Tabs Header */}
      <div style="display: flex; justify-content: center; align-items: center; padding: 10px 12px; background: #252532; border-bottom: 1px solid #374151; flex-shrink: 0;">
        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
          <Button callback={(): void => contratsSubTab.set("dashboard")}>
            <div style={contratsSubTab.map(t => t === "dashboard"
              ? "padding: 6px 12px; background: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white; font-weight: 600;"
              : "padding: 6px 12px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white;")}>
              {currentLanguage.map(l => (translations[l] as any).contracts?.available || "Available")}
            </div>
          </Button>
          <Button callback={(): void => contratsSubTab.set("mes-contrats")}>
            <div style={contratsSubTab.map(t => t === "mes-contrats"
              ? "padding: 6px 12px; background: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white; font-weight: 600;"
              : "padding: 6px 12px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white;")}>
              {currentLanguage.map(l => (translations[l] as any).contracts?.myContracts || "My Contracts")}
            </div>
          </Button>
          <Button callback={(): void => contratsSubTab.set("en-cours")}>
            <div style={contratsSubTab.map(t => t === "en-cours"
              ? "padding: 6px 12px; background: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white; font-weight: 600;"
              : "padding: 6px 12px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white;")}>
              {currentLanguage.map(l => (translations[l] as any).contracts?.active || "Active")}
            </div>
          </Button>
        </div>
      </div>

      {/* Sub-Tab Content */}
      <div style="flex: 1; overflow-y: auto; position: relative;">

        {/* Not logged in */}
        <div style={isLoggedIn.map(l => l ? "display: none;" : "display: block; padding: 16px;")}>
          <div style="background: rgba(245, 158, 11, 0.15); border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; text-align: center;">
            <svg style="width: 32px; height: 32px; margin-bottom: 8px;" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 8v4"/>
              <path d="M12 16h.01"/>
            </svg>
            <div style="color: #f59e0b; font-size: 13px; font-weight: 600; margin-bottom: 4px;">{currentLanguage.map(l => translations[l].missions.loginRequired)}</div>
            <div style="color: #9ca3af; font-size: 11px;">{currentLanguage.map(l => l === "fr" ? "Connectez-vous pour voir les contrats" : "Log in to see contracts")}</div>
          </div>
        </div>

        {/* === Dashboard (Available Contracts) === */}
        <div style={MappedSubject.create(([tab, logged]) => tab === "dashboard" && logged ? "padding: 12px 16px; color: white;" : "display: none;", contratsSubTab, isLoggedIn)}>
          {/* Loading */}
          <div style={contractsLoading.map(l => l ? "text-align: center; padding: 20px; color: #6b7280; font-size: 11px;" : "display: none;")}>
            {currentLanguage.map(l => l === "fr" ? "Chargement..." : "Loading...")}
          </div>
          {/* Contracts list rendered via innerHTML */}
          <div ref={availableContractsRef} style={contractsLoading.map(l => l ? "display: none;" : "")}></div>
          {/* Refresh button */}
          <div style={contractsLoading.map(l => l ? "display: none;" : "margin-top: 8px;")}>
            <Button callback={(): void => { onRefreshContracts(); }}>
              <div style="background: #3b82f6; color: white; padding: 8px; border-radius: 6px; text-align: center; font-size: 11px; font-weight: 500;">
                {currentLanguage.map(l => (translations[l] as any).contracts?.refresh || "Refresh")}
              </div>
            </Button>
          </div>
        </div>

        {/* === Mes Contrats (Online Only) === */}
        <div style={MappedSubject.create(([tab, logged]) => tab === "mes-contrats" && logged ? "padding: 16px; color: white; position: relative; min-height: 200px;" : "display: none;", contratsSubTab, isLoggedIn)}>
          {/* Online-only overlay in Solo mode */}
          <div style={isP2PMode.map(p2p => p2p
            ? "display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 48px 20px; text-align: center;"
            : "display: none;")}>
            <svg style="width: 48px; height: 48px; margin-bottom: 12px; opacity: 0.5;" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
              <rect x="9" y="3" width="6" height="4" rx="1"/>
              <path d="M9 14l2 2 4-4"/>
            </svg>
            <div style="color: #9ca3af; font-size: 14px; font-weight: 600; margin-bottom: 4px;">
              {currentLanguage.map(l => (translations[l] as any).contracts?.myContractsOnline || "Online feature")}
            </div>
            <div style="color: #6b7280; font-size: 11px; max-width: 240px;">
              {currentLanguage.map(l => (translations[l] as any).contracts?.onlineOnlyDesc || "Create contracts for other players to accept.")}
            </div>
          </div>
        </div>

        {/* === En Cours (Active Contracts) === */}
        <div style={MappedSubject.create(([tab, logged]) => tab === "en-cours" && logged ? "padding: 12px 16px; color: white;" : "display: none;", contratsSubTab, isLoggedIn)}>
          {/* Active contracts */}
          <div ref={activeContractsRef}></div>
          {/* Completed contracts section */}
          <div style="margin-top: 16px;">
            <div style="font-size: 12px; font-weight: 600; color: #9ca3af; margin-bottom: 8px; border-bottom: 1px solid #374151; padding-bottom: 4px;">
              {currentLanguage.map(l => l === "fr" ? "Historique" : "History")}
            </div>
            <div ref={completedContractsRef}></div>
          </div>
        </div>

      </div>

      {/* Popup overlay (completion, cancel confirm) */}
      <div ref={contractPopupRef} style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none; z-index: 50;"></div>

    </div>
  );
}
