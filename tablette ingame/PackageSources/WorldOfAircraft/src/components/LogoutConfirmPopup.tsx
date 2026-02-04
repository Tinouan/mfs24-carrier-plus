/**
 * LogoutConfirmPopup - Logout confirmation dialog
 * Extracted from WorldOfAircraft.tsx render() for better maintainability
 */
import { FSComponent, VNode, Subject } from "@microsoft/msfs-sdk";
import { Button } from "@efb/efb-api";
import type { Language } from "../types";

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

// ═══════════════════════════════════════════════════════════
// LOGOUT CONFIRM POPUP PROPS
// ═══════════════════════════════════════════════════════════

export interface LogoutConfirmPopupProps {
  showLogoutConfirm: Subject<boolean>;
  currentLanguage: Subject<Language>;
  onCancel: () => void;
  onConfirm: () => void;
}

// ═══════════════════════════════════════════════════════════
// LOGOUT CONFIRM POPUP COMPONENT
// ═══════════════════════════════════════════════════════════

export function renderLogoutConfirmPopup(props: LogoutConfirmPopupProps): VNode {
  const { showLogoutConfirm, currentLanguage, onCancel, onConfirm } = props;

  return (
    <div style={showLogoutConfirm.map(show => show
      ? "position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 200; display: flex; align-items: center; justify-content: center;"
      : "display: none;")}>
      <div style="background: #252532; border: 1px solid #374151; border-radius: 12px; padding: 20px; width: 280px; box-shadow: 0 8px 24px rgba(0,0,0,0.5);">
        <div style="text-align: center; margin-bottom: 16px;">
          <svg style="width: 40px; height: 40px; margin-bottom: 8px;" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4"/>
            <path d="M12 16h.01"/>
          </svg>
          <div style="font-size: 16px; font-weight: 600; color: white; margin-bottom: 4px;">{currentLanguage.map(l => translations[l].login.logout)}</div>
          <div style="font-size: 12px; color: #9ca3af;">{currentLanguage.map(l => translations[l].login.logoutConfirm)}</div>
        </div>
        <div style="display: flex; gap: 10px;">
          <Button callback={onCancel}>
            <div style="flex: 1; background: #374151; color: #9ca3af; border-radius: 6px; padding: 10px; text-align: center; font-size: 12px; font-weight: 500;">
              {currentLanguage.map(l => translations[l].common.cancel)}
            </div>
          </Button>
          <Button callback={onConfirm}>
            <div style="flex: 1; background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid #ef4444; border-radius: 6px; padding: 10px; text-align: center; font-size: 12px; font-weight: 500;">
              {currentLanguage.map(l => translations[l].common.confirm)}
            </div>
          </Button>
        </div>
      </div>
    </div>
  );
}
