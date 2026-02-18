/**
 * SettingsView - Settings tab render function
 * Extracted from AeroCorpOnline.tsx for better maintainability
 */
import { FSComponent, VNode, Subject, MappedSubject } from "@microsoft/msfs-sdk";
import { Button } from "@efb/efb-api";
import type { Language } from "../types";
import type { GameMode } from "../state/GameModeState";

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
  isOfflineSimulated: Subject<boolean>;
  currentGameMode: Subject<GameMode | null>;

  // Callbacks
  onSetLanguage: (lang: Language) => void;
  onResetData: () => void;
  onTestCommBus: () => void;
  onSimulateOffline: () => void;
  onChangeGameMode: () => void;
}

/**
 * Render the Settings tab content
 */
export function renderSettingsTab(props: SettingsViewProps): VNode {
  const {
    activeTab,
    currentLanguage,
    isOfflineSimulated,
    currentGameMode,
    onSetLanguage,
    onResetData,
    onTestCommBus,
    onSimulateOffline,
    onChangeGameMode,
  } = props;

  return (
    <div style={activeTab.map(t => t === "settings"
      ? "position: absolute; top: 0; left: 0; right: 0; bottom: 0; overflow-y: auto; display: flex; flex-direction: column;"
      : "display: none;")}>
      <div style="padding: 16px; color: white;">
        <h2 style="font-size: 16px; font-weight: 600; color: #60a5fa; margin: 0 0 16px 0;">
          {currentLanguage.map(l => translations[l].settings.title)}
        </h2>

        {/* Section: Mode de jeu - V3.0 */}
        <div style="background: #252532; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
            <svg style="width: 16px; height: 16px;" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span style="font-size: 13px; font-weight: 600; color: white;">
              {currentLanguage.map(l => l === "fr" ? "Mode de jeu" : "Game Mode")}
            </span>
          </div>

          {/* Current mode display */}
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              {/* Mode icon */}
              <div style={currentGameMode.map(mode => mode === "solo"
                ? "width: 40px; height: 40px; background: #1e40af; border-radius: 10px; display: flex; align-items: center; justify-content: center;"
                : "width: 40px; height: 40px; background: #7c3aed; border-radius: 10px; display: flex; align-items: center; justify-content: center;")}>
                <svg style="width: 20px; height: 20px;" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                  {currentGameMode.map(mode => mode === "solo"
                    ? <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
                    : <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                  )}
                </svg>
              </div>
              <div>
                <div style={currentGameMode.map(mode => mode === "solo"
                  ? "font-size: 14px; font-weight: 600; color: #60a5fa;"
                  : "font-size: 14px; font-weight: 600; color: #a78bfa;")}>
                  {MappedSubject.create(([mode, lang]) => {
                    if (mode === "solo") return lang === "fr" ? "Mode Solo" : "Solo Mode";
                    if (mode === "online") return lang === "fr" ? "Mode Online" : "Online Mode";
                    return lang === "fr" ? "Non défini" : "Not set";
                  }, currentGameMode, currentLanguage)}
                </div>
                <div style="font-size: 11px; color: #6b7280;">
                  {MappedSubject.create(([mode, lang]) => {
                    if (mode === "solo") return lang === "fr" ? "Carrière locale, économie IA" : "Local career, AI economy";
                    if (mode === "online") return lang === "fr" ? "Carrière SEED, économie joueurs" : "SEED career, player economy";
                    return "";
                  }, currentGameMode, currentLanguage)}
                </div>
              </div>
            </div>

            {/* Mode badge */}
            <div style={currentGameMode.map(mode => mode === "solo"
              ? "background: #1e40af; color: white; font-size: 10px; font-weight: 600; padding: 4px 8px; border-radius: 99px;"
              : "background: #7c3aed; color: white; font-size: 10px; font-weight: 600; padding: 4px 8px; border-radius: 99px;")}>
              {currentGameMode.map(mode => mode === "solo" ? "SOLO" : "ONLINE")}
            </div>
          </div>

          {/* Warning message */}
          <div style="background: rgba(251, 191, 36, 0.1); border: 1px solid #f59e0b; border-radius: 6px; padding: 10px; margin-bottom: 12px;">
            <div style="font-size: 11px; color: #fbbf24; display: flex; align-items: flex-start; gap: 8px;">
              <svg style="width: 14px; height: 14px; flex-shrink: 0; margin-top: 1px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>
                {currentLanguage.map(l => l === "fr"
                  ? "Les carrières Solo et Online sont complètement séparées. Changer de mode ne transfère pas vos données."
                  : "Solo and Online careers are completely separate. Switching modes does not transfer your data.")}
              </span>
            </div>
          </div>

          {/* Change mode button */}
          <Button callback={(): void => onChangeGameMode()}>
            <div style="background: #374151; border: 1px solid #4b5563; border-radius: 6px; padding: 12px; text-align: center; font-size: 12px; color: white; font-weight: 500;">
              {currentLanguage.map(l => l === "fr" ? "Changer de mode" : "Change Mode")}
            </div>
          </Button>
        </div>

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

        {/* Section: Danger Zone - Reset Data */}
        <div style="background: #252532; border: 1px solid #7f1d1d; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
            <span style="font-size: 12px; color: #ef4444; font-weight: 700;">[!]</span>
            <span style="font-size: 13px; font-weight: 600; color: #fca5a5;">
              {currentLanguage.map(l => l === "fr" ? "Zone de danger" : "Danger Zone")}
            </span>
          </div>

          <div style="font-size: 11px; color: #9ca3af; margin-bottom: 12px;">
            {currentLanguage.map(l => l === "fr"
              ? "Réinitialiser toutes les données locales. Cette action est irréversible !"
              : "Reset all local data. This action cannot be undone!")}
          </div>

          <Button callback={(): void => onResetData()}>
            <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; border-radius: 6px; padding: 12px; text-align: center; font-size: 12px; color: #ef4444; font-weight: 500;">
              {currentLanguage.map(l => l === "fr" ? "Réinitialiser les données" : "Reset All Data")}
            </div>
          </Button>
        </div>

        {/* Section: Debug */}
        <div style="background: #252532; border: 1px solid #6366f1; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
            <span style="font-size: 11px; color: #818cf8; font-weight: 700;">[DBG]</span>
            <span style="font-size: 13px; font-weight: 600; color: #818cf8;">
              {currentLanguage.map(l => l === "fr" ? "Debug" : "Debug")}
            </span>
          </div>

          {/* Simulate Offline Button */}
          <div style="font-size: 11px; color: #9ca3af; margin-bottom: 12px;">
            {currentLanguage.map(l => l === "fr"
              ? "Force le mode hors ligne pour tester les missions offline."
              : "Force offline mode to test offline missions.")}
          </div>

          <Button callback={(): void => onSimulateOffline()}>
            <div style={isOfflineSimulated.map(offline => offline
              ? "background: #ef4444; border: 1px solid #ef4444; border-radius: 6px; padding: 12px; text-align: center; font-size: 12px; color: white; font-weight: 500;"
              : "background: #6366f1; border: 1px solid #6366f1; border-radius: 6px; padding: 12px; text-align: center; font-size: 12px; color: white; font-weight: 500;")}>
              {MappedSubject.create(([offline, lang]) => offline
                ? (lang === "fr" ? "Mode OFFLINE actif - Cliquer pour reconnecter" : "OFFLINE mode active - Click to reconnect")
                : (lang === "fr" ? "Simuler mode Offline" : "Simulate Offline Mode"),
                isOfflineSimulated, currentLanguage)}
            </div>
          </Button>

          <div style="border-top: 1px solid #374151; margin: 12px 0; opacity: 0.5;"></div>

          {/* Test CommBus */}
          <div style="font-size: 11px; color: #9ca3af; margin-bottom: 12px;">
            {currentLanguage.map(l => l === "fr"
              ? "Teste les APIs MSFS. Resultats dans la console."
              : "Test MSFS APIs. Results in console.")}
          </div>

          <Button callback={(): void => onTestCommBus()}>
            <div style="background: #f59e0b; border: 1px solid #f59e0b; border-radius: 6px; padding: 12px; text-align: center; font-size: 12px; color: white; font-weight: 500;">
              {currentLanguage.map(l => l === "fr" ? "Tester APIs MSFS" : "Test MSFS APIs")}
            </div>
          </Button>
        </div>

        {/* Section: A propos */}
        <div style="background: #252532; border-radius: 8px; padding: 16px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
            <span style="font-size: 11px; color: #60a5fa; font-weight: 700;">[i]</span>
            <span style="font-size: 13px; font-weight: 600; color: white;">
              {currentLanguage.map(l => translations[l].settings.about)}
            </span>
          </div>

          <div style="text-align: center; margin-bottom: 12px;">
            <div style="font-size: 16px; font-weight: 600; color: #60a5fa; margin-bottom: 4px;">AeroCorp Online</div>
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
              {currentLanguage.map(l => translations[l].settings.connected)} [OK]
            </span>
          </div>

          <div style="text-align: center; margin-top: 16px; font-size: 10px; color: #6b7280;">
            © 2026 AeroCorp Online
          </div>
        </div>

      </div>
    </div>
  );
}
