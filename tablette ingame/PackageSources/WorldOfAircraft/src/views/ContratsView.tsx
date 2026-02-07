/**
 * ContratsView - Contrats tab render function with sub-tabs
 * V4.1: New tab for contracts system
 */
import { FSComponent, VNode, Subject, MappedSubject } from "@microsoft/msfs-sdk";
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
  } = props;

  return (
    <div style={activeTab.map(tab => tab === "contrats"
      ? "position: absolute; top: 0; left: 0; right: 0; bottom: 0; overflow: hidden; display: flex; flex-direction: column;"
      : "display: none;")}>

      {/* Contrats Sub-Tabs Header (centered) */}
      <div style="display: flex; justify-content: center; align-items: center; padding: 10px 12px; background: #252532; border-bottom: 1px solid #374151; flex-shrink: 0;">
        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
          <Button callback={(): void => contratsSubTab.set("dashboard")}>
            <div style={contratsSubTab.map(t => t === "dashboard"
              ? "padding: 6px 12px; background: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white; font-weight: 600;"
              : "padding: 6px 12px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white;")}>
              {currentLanguage.map(l => l === "fr" ? "Tableau de bord" : "Dashboard")}
            </div>
          </Button>
          <Button callback={(): void => contratsSubTab.set("mes-contrats")}>
            <div style={contratsSubTab.map(t => t === "mes-contrats"
              ? "padding: 6px 12px; background: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white; font-weight: 600;"
              : "padding: 6px 12px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white;")}>
              {currentLanguage.map(l => l === "fr" ? "Mes contrats" : "My Contracts")}
            </div>
          </Button>
          <Button callback={(): void => contratsSubTab.set("en-cours")}>
            <div style={contratsSubTab.map(t => t === "en-cours"
              ? "padding: 6px 12px; background: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white; font-weight: 600;"
              : "padding: 6px 12px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 6px; font-size: 11px; color: white;")}>
              {currentLanguage.map(l => l === "fr" ? "En cours" : "In Progress")}
            </div>
          </Button>
        </div>
      </div>

      {/* Contrats Sub-Tab Content */}
      <div style="flex: 1; overflow-y: auto;">

        {/* Not logged in message */}
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

        {/* Dashboard Sub-Tab */}
        <div style={MappedSubject.create(([tab, logged]) => tab === "dashboard" && logged ? "padding: 16px; color: white;" : "display: none;", contratsSubTab, isLoggedIn)}>
          <div style="background: #1e1e2e; border-radius: 12px; padding: 24px; text-align: center;">
            <svg style="width: 48px; height: 48px; margin-bottom: 12px;" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="1.5">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <path d="M14 2v6h6"/>
              <path d="M16 13H8"/>
              <path d="M16 17H8"/>
              <path d="M10 9H8"/>
            </svg>
            <div style="color: #60a5fa; font-size: 16px; font-weight: 600; margin-bottom: 8px;">{currentLanguage.map(l => l === "fr" ? "Tableau de bord" : "Dashboard")}</div>
            <div style="color: #6b7280; font-size: 12px;">Coming soon - Phase 6</div>
            <div style="color: #4b5563; font-size: 10px; margin-top: 8px;">{currentLanguage.map(l => l === "fr" ? "Consultez les contrats disponibles" : "Browse available contracts")}</div>
          </div>
        </div>

        {/* Mes Contrats Sub-Tab */}
        <div style={MappedSubject.create(([tab, logged]) => tab === "mes-contrats" && logged ? "padding: 16px; color: white;" : "display: none;", contratsSubTab, isLoggedIn)}>
          <div style="background: #1e1e2e; border-radius: 12px; padding: 24px; text-align: center;">
            <svg style="width: 48px; height: 48px; margin-bottom: 12px;" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="1.5">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
              <rect x="9" y="3" width="6" height="4" rx="1"/>
              <path d="M9 12h6"/>
              <path d="M9 16h6"/>
            </svg>
            <div style="color: #60a5fa; font-size: 16px; font-weight: 600; margin-bottom: 8px;">{currentLanguage.map(l => l === "fr" ? "Mes contrats" : "My Contracts")}</div>
            <div style="color: #6b7280; font-size: 12px;">Coming soon - Phase 6</div>
            <div style="color: #4b5563; font-size: 10px; margin-top: 8px;">{currentLanguage.map(l => l === "fr" ? "Gerez vos contrats crees" : "Manage your created contracts")}</div>
          </div>
        </div>

        {/* En Cours Sub-Tab */}
        <div style={MappedSubject.create(([tab, logged]) => tab === "en-cours" && logged ? "padding: 16px; color: white;" : "display: none;", contratsSubTab, isLoggedIn)}>
          <div style="background: #1e1e2e; border-radius: 12px; padding: 24px; text-align: center;">
            <svg style="width: 48px; height: 48px; margin-bottom: 12px;" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6l4 2"/>
            </svg>
            <div style="color: #60a5fa; font-size: 16px; font-weight: 600; margin-bottom: 8px;">{currentLanguage.map(l => l === "fr" ? "En cours" : "In Progress")}</div>
            <div style="color: #6b7280; font-size: 12px;">Coming soon - Phase 6</div>
            <div style="color: #4b5563; font-size: 10px; margin-top: 8px;">{currentLanguage.map(l => l === "fr" ? "Suivez vos contrats acceptes" : "Track your accepted contracts")}</div>
          </div>
        </div>

      </div>
    </div>
  );
}
