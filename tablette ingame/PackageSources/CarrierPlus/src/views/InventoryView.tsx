/**
 * InventoryView - Inventory tab render function
 * Extracted from CarrierPlus.tsx for better maintainability
 */
import { FSComponent, VNode, Subject, MappedSubject, NodeReference } from "@microsoft/msfs-sdk";
import { Button } from "@efb/efb-api";
import type { Language, LoadingStatus } from "../types";

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
 * Props interface for InventoryView
 */
export interface InventoryViewProps {
  activeTab: Subject<string>;
  currentLanguage: Subject<Language>;
  isLoggedIn: Subject<boolean>;
  inventoryType: Subject<"player" | "company">;
  inventoryStatus: Subject<LoadingStatus>;
  inventoryError: Subject<string | null>;
  inventoryListRef: NodeReference<HTMLDivElement>;
  onFetchInventory: (type: "player" | "company") => void;
}

/**
 * Render the Inventory tab content
 */
export function renderInventoryTab(props: InventoryViewProps): VNode {
  const {
    activeTab,
    currentLanguage,
    isLoggedIn,
    inventoryType,
    inventoryStatus,
    inventoryError,
    inventoryListRef,
    onFetchInventory,
  } = props;

  return (
    <div style={activeTab.map(t => t === "inventory"
      ? "position: absolute; top: 0; left: 0; right: 0; bottom: 0; overflow-y: auto; display: flex; flex-direction: column;"
      : "display: none;")}>
      <div style="display: flex; flex-direction: column; height: 100%; color: white; padding: 16px;">
        {/* Title */}
        <h2 style="font-size: 16px; font-weight: 600; color: #60a5fa; margin: 0 0 16px 0;">{currentLanguage.map(l => translations[l].inventory.title)}</h2>

        {/* Not logged in message */}
        <div style={isLoggedIn.map(l => l ? "display: none;" : "display: block;")}>
          <div style="background: rgba(245, 158, 11, 0.15); border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; text-align: center;">
            <svg style="width: 32px; height: 32px; margin-bottom: 8px;" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 8v4"/>
              <path d="M12 16h.01"/>
            </svg>
            <div style="color: #f59e0b; font-size: 13px; font-weight: 600; margin-bottom: 4px;">{currentLanguage.map(l => translations[l].missions.loginRequired)}</div>
            <div style="color: #9ca3af; font-size: 11px;">{currentLanguage.map(l => translations[l].inventory.loginToSeeInventory)}</div>
          </div>
        </div>

        {/* Logged in content */}
        <div style={isLoggedIn.map(l => l ? "display: flex; flex-direction: column; flex: 1;" : "display: none;")}>
          {/* Toggle Buttons */}
          <div style="display: flex; gap: 8px; margin-bottom: 12px;">
            <Button callback={(): void => { onFetchInventory("player"); }} disabled={inventoryStatus.map(s => s === "loading")}>
              <div style={inventoryType.map(t => t === "player"
                ? "flex: 1; background: #3b82f6; color: white; border-radius: 8px; padding: 10px; text-align: center; font-size: 11px; font-weight: 600;"
                : "flex: 1; background: #374151; color: #9ca3af; border-radius: 8px; padding: 10px; text-align: center; font-size: 11px; font-weight: 600;")}>
                {MappedSubject.create(([s, t, lang]) => s === "loading" && t === "player" ? "..." : translations[lang].inventory.personal, inventoryStatus, inventoryType, currentLanguage)}
              </div>
            </Button>
            <Button callback={(): void => { onFetchInventory("company"); }} disabled={inventoryStatus.map(s => s === "loading")}>
              <div style={inventoryType.map(t => t === "company"
                ? "flex: 1; background: #3b82f6; color: white; border-radius: 8px; padding: 10px; text-align: center; font-size: 11px; font-weight: 600;"
                : "flex: 1; background: #374151; color: #9ca3af; border-radius: 8px; padding: 10px; text-align: center; font-size: 11px; font-weight: 600;")}>
                {MappedSubject.create(([s, t, lang]) => s === "loading" && t === "company" ? "..." : translations[lang].inventory.company, inventoryStatus, inventoryType, currentLanguage)}
              </div>
            </Button>
          </div>

          {/* Error message */}
          <div style={inventoryError.map(e => e
            ? "background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; border-radius: 8px; padding: 10px; margin-bottom: 12px;"
            : "display: none;")}>
            <span style="color: #ef4444; font-size: 12px;">{inventoryError}</span>
          </div>

          {/* Inventory List */}
          <div style="background: #252532; border-radius: 8px; padding: 12px; flex: 1; overflow-y: auto;">
            <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; margin-bottom: 10px;">
              {currentLanguage.map(l => translations[l].inventory.items)}
            </div>
            <div ref={inventoryListRef}>
              <div style="color: #9ca3af; font-size: 12px; text-align: center; padding: 16px;">
                {currentLanguage.map(l => translations[l].inventory.clickRefreshToLoad)}
              </div>
            </div>
          </div>

          {/* Info Note */}
          <div style="margin-top: 12px; padding: 10px; background: rgba(96, 165, 250, 0.1); border-radius: 8px; border: 1px solid rgba(96, 165, 250, 0.3);">
            <p style="font-size: 10px; color: #9ca3af; margin: 0;">
              {currentLanguage.map(l => translations[l].inventory.infoNote)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
