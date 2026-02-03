/**
 * SettingsView - Settings tab render function
 * Extracted from CarrierPlus.tsx for better maintainability
 */
import { FSComponent, VNode, Subject, MappedSubject, NodeReference } from "@microsoft/msfs-sdk";
import { Button } from "@efb/efb-api";
import type { Language, UserInfo } from "../types";

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
 * Props interface for SettingsView
 * Contains all dependencies needed to render the Settings tab
 */
export interface SettingsViewProps {
  // State subjects
  activeTab: Subject<string>;
  currentLanguage: Subject<Language>;
  isLoggedIn: Subject<boolean>;
  currentUser: Subject<UserInfo | null>;
  settingsCredentialsSaved: Subject<boolean>;

  // Input refs
  settingsEmailInputRef: NodeReference<HTMLInputElement>;
  settingsPasswordInputRef: NodeReference<HTMLInputElement>;

  // Callbacks
  onSetLanguage: (lang: Language) => void;
  onSaveCredentials: () => void;
  onLogout: () => void;
}

/**
 * Render the Settings tab content
 */
export function renderSettingsTab(props: SettingsViewProps): VNode {
  const {
    activeTab,
    currentLanguage,
    isLoggedIn,
    currentUser,
    settingsCredentialsSaved,
    settingsEmailInputRef,
    settingsPasswordInputRef,
    onSetLanguage,
    onSaveCredentials,
    onLogout,
  } = props;

  return (
    <div style={activeTab.map(t => t === "settings"
      ? "position: absolute; top: 0; left: 0; right: 0; bottom: 0; overflow-y: auto; display: flex; flex-direction: column;"
      : "display: none;")}>
      <div style="padding: 16px; color: white;">
        <h2 style="font-size: 16px; font-weight: 600; color: #60a5fa; margin: 0 0 16px 0;">
          {currentLanguage.map(l => translations[l].settings.title)}
        </h2>

        {/* Section: Langue - V1.5 i18n */}
        <div style="background: #252532; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
            <svg style="width: 16px; height: 16px;" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
            <span style="font-size: 13px; font-weight: 600; color: white;">
              {currentLanguage.map(l => translations[l].settings.language)}
            </span>
          </div>

          <div style="display: flex; flex-wrap: wrap; gap: 8px;">
            <Button callback={(): void => onSetLanguage("en")}>
              <div style={currentLanguage.map(l => l === "en"
                ? "background: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; padding: 8px 16px; text-align: center; font-size: 12px; color: white; cursor: pointer; font-weight: 500;"
                : "background: #1a1a24; border: 1px solid #374151; border-radius: 6px; padding: 8px 16px; text-align: center; font-size: 12px; color: #9ca3af; cursor: pointer;")}>
                English
              </div>
            </Button>
            <Button callback={(): void => onSetLanguage("fr")}>
              <div style={currentLanguage.map(l => l === "fr"
                ? "background: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; padding: 8px 16px; text-align: center; font-size: 12px; color: white; cursor: pointer; font-weight: 500;"
                : "background: #1a1a24; border: 1px solid #374151; border-radius: 6px; padding: 8px 16px; text-align: center; font-size: 12px; color: #9ca3af; cursor: pointer;")}>
                Francais
              </div>
            </Button>
            <Button callback={(): void => onSetLanguage("de")}>
              <div style={currentLanguage.map(l => l === "de"
                ? "background: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; padding: 8px 16px; text-align: center; font-size: 12px; color: white; cursor: pointer; font-weight: 500;"
                : "background: #1a1a24; border: 1px solid #374151; border-radius: 6px; padding: 8px 16px; text-align: center; font-size: 12px; color: #9ca3af; cursor: pointer;")}>
                Deutsch
              </div>
            </Button>
            <Button callback={(): void => onSetLanguage("es")}>
              <div style={currentLanguage.map(l => l === "es"
                ? "background: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; padding: 8px 16px; text-align: center; font-size: 12px; color: white; cursor: pointer; font-weight: 500;"
                : "background: #1a1a24; border: 1px solid #374151; border-radius: 6px; padding: 8px 16px; text-align: center; font-size: 12px; color: #9ca3af; cursor: pointer;")}>
                Espanol
              </div>
            </Button>
          </div>
        </div>

        {/* Section: Compte - V1.6: Editable credentials */}
        <div style="background: #252532; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
            <span style="font-size: 14px;">👤</span>
            <span style="font-size: 13px; font-weight: 600; color: white;">
              {currentLanguage.map(l => translations[l].settings.account)}
            </span>
          </div>

          {/* Connection status */}
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
            <div style={isLoggedIn.map(l => l
              ? "width: 8px; height: 8px; background: #22c55e; border-radius: 50%;"
              : "width: 8px; height: 8px; background: #ef4444; border-radius: 50%;")}></div>
            <span style="font-size: 11px; color: #9ca3af;">
              {MappedSubject.create(([logged, user, lang]) =>
                logged && user ? `${translations[lang].settings.connected}: ${user.username}` : translations[lang].settings.notConnected,
                isLoggedIn, currentUser, currentLanguage)}
            </span>
          </div>

          <div style="border-top: 1px solid #374151; margin: 12px 0; opacity: 0.5;"></div>

          {/* Email input */}
          <div style="margin-bottom: 12px;">
            <div style="font-size: 11px; color: #6b7280; margin-bottom: 6px;">
              {currentLanguage.map(l => translations[l].settings.email)}
            </div>
            <input
              ref={settingsEmailInputRef}
              type="text"
              placeholder="email@example.com"
              style="width: 100%; background: #1a1a24; border: 1px solid #374151; border-radius: 6px; padding: 10px 12px; color: white; font-size: 12px; outline: none; box-sizing: border-box;"
            />
          </div>

          {/* Password input */}
          <div style="margin-bottom: 12px;">
            <div style="font-size: 11px; color: #6b7280; margin-bottom: 6px;">
              {currentLanguage.map(l => translations[l].login.password)}
            </div>
            <input
              ref={settingsPasswordInputRef}
              type="password"
              placeholder="••••••••"
              style="width: 100%; background: #1a1a24; border: 1px solid #374151; border-radius: 6px; padding: 10px 12px; color: white; font-size: 12px; outline: none; box-sizing: border-box;"
            />
            <div style="font-size: 10px; color: #6b7280; margin-top: 4px;">
              {currentLanguage.map(l => l === "fr" ? "Laisser vide pour garder le mot de passe actuel" : "Leave empty to keep current password")}
            </div>
          </div>

          {/* Save button */}
          <Button callback={(): void => onSaveCredentials()}>
            <div style={settingsCredentialsSaved.map(s => s
              ? "background: #22c55e; border: 1px solid #22c55e; border-radius: 6px; padding: 10px; text-align: center; font-size: 12px; color: white; font-weight: 500;"
              : "background: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; padding: 10px; text-align: center; font-size: 12px; color: white; font-weight: 500;")}>
              {MappedSubject.create(([saved, lang]) => saved
                ? (lang === "fr" ? "Sauvegardé !" : "Saved!")
                : (lang === "fr" ? "Sauvegarder les identifiants" : "Save credentials"),
                settingsCredentialsSaved, currentLanguage)}
            </div>
          </Button>

          <div style="border-top: 1px solid #374151; margin: 12px 0; opacity: 0.5;"></div>

          {/* Logout button */}
          <Button callback={(): void => onLogout()}>
            <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; border-radius: 6px; padding: 12px; text-align: center; font-size: 12px; color: #ef4444; font-weight: 500;">
              {currentLanguage.map(l => translations[l].settings.logout)}
            </div>
          </Button>
        </div>

        {/* Section: A propos */}
        <div style="background: #252532; border-radius: 8px; padding: 16px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
            <span style="font-size: 14px;">ℹ️</span>
            <span style="font-size: 13px; font-weight: 600; color: white;">
              {currentLanguage.map(l => translations[l].settings.about)}
            </span>
          </div>

          <div style="text-align: center; margin-bottom: 12px;">
            <div style="font-size: 16px; font-weight: 600; color: #60a5fa; margin-bottom: 4px;">MFS Carrier+</div>
            <div style="font-size: 12px; color: #9ca3af;">
              {currentLanguage.map(l => translations[l].settings.version)} 0.9.0
            </div>
          </div>

          <div style="border-top: 1px solid #374151; margin: 12px 0; opacity: 0.5;"></div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-size: 12px; color: #6b7280;">
              {currentLanguage.map(l => translations[l].settings.server)}
            </span>
            <span style="font-size: 12px; color: #22c55e;">
              {currentLanguage.map(l => translations[l].settings.connected)} ✓
            </span>
          </div>

          <div style="text-align: center; margin-top: 16px; font-size: 10px; color: #6b7280;">
            © 2026 MFS Carrier+
          </div>
        </div>

      </div>
    </div>
  );
}
