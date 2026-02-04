/**
 * LoginPanel - Login panel overlay component
 * Extracted from WorldOfAircraft.tsx render() for better maintainability
 */
import { FSComponent, VNode, Subject, MappedSubject, NodeReference } from "@microsoft/msfs-sdk";
import { Button } from "@efb/efb-api";
import type { UserInfo, Language } from "../types";

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
// LOGIN PANEL PROPS
// ═══════════════════════════════════════════════════════════

export interface LoginPanelProps {
  showLoginPanel: Subject<boolean>;
  isLoggedIn: Subject<boolean>;
  currentUser: Subject<UserInfo | null>;
  loginError: Subject<string | null>;
  loginLoading: Subject<boolean>;
  currentLanguage: Subject<Language>;
  emailInputRef: NodeReference<HTMLInputElement>;
  passwordInputRef: NodeReference<HTMLInputElement>;
  onLogin: () => void;
  onLogout: () => void;
}

// ═══════════════════════════════════════════════════════════
// LOGIN PANEL COMPONENT
// ═══════════════════════════════════════════════════════════

export function renderLoginPanel(props: LoginPanelProps): VNode {
  const {
    showLoginPanel,
    isLoggedIn,
    currentUser,
    loginError,
    loginLoading,
    currentLanguage,
    emailInputRef,
    passwordInputRef,
    onLogin,
    onLogout,
  } = props;

  return (
    <div style={showLoginPanel.map(show => show
      ? "position: absolute; top: 38px; right: 12px; z-index: 100; background: #252532; border: 1px solid #374151; border-radius: 8px; padding: 16px; width: 260px; box-shadow: 0 4px 12px rgba(0,0,0,0.4);"
      : "display: none;")}>

      {/* If logged in, show user info */}
      <div style={isLoggedIn.map(l => l ? "display: block;" : "display: none;")}>
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
          <div style="width: 36px; height: 36px; border-radius: 50%; background: rgba(34, 197, 94, 0.2); display: flex; align-items: center; justify-content: center;">
            <svg style="width: 20px; height: 20px;" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="1.5">
              <circle cx="12" cy="8" r="4"/>
              <path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>
            </svg>
          </div>
          <div>
            <div style="font-size: 13px; font-weight: 600; color: white;">{currentUser.map(u => u?.username || "")}</div>
            <div style="font-size: 10px; color: #9ca3af;">{currentUser.map(u => u?.email || "")}</div>
          </div>
        </div>
        <Button callback={onLogout}>
          <div style="background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid #ef4444; border-radius: 6px; padding: 8px; text-align: center; font-size: 12px; font-weight: 500;">
            {currentLanguage.map(l => translations[l].login.logout)}
          </div>
        </Button>
      </div>

      {/* If not logged in, show login form */}
      <div style={isLoggedIn.map(l => l ? "display: none;" : "display: block;")}>
        <div style="font-size: 14px; font-weight: 600; color: white; margin-bottom: 12px;">{currentLanguage.map(l => translations[l].login.title)}</div>

        {/* Error message */}
        <div style={loginError.map(e => e
          ? "background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; border-radius: 4px; padding: 8px; margin-bottom: 10px; font-size: 11px; color: #ef4444;"
          : "display: none;")}>
          {loginError}
        </div>

        {/* Email input */}
        <div style="margin-bottom: 10px;">
          <label style="font-size: 10px; color: #9ca3af; text-transform: uppercase; display: block; margin-bottom: 4px;">{currentLanguage.map(l => translations[l].login.email)}</label>
          <input
            type="text"
            style="width: 100%; background: #1a1a24; border: 1px solid #374151; border-radius: 4px; padding: 8px 10px; color: white; font-size: 12px; box-sizing: border-box;"
            placeholder="email@exemple.com"
            ref={emailInputRef}
            onkeydown={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
            onkeyup={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
            onkeypress={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
          />
        </div>

        {/* Password input */}
        <div style="margin-bottom: 10px;">
          <label style="font-size: 10px; color: #9ca3af; text-transform: uppercase; display: block; margin-bottom: 4px;">{currentLanguage.map(l => translations[l].login.password)}</label>
          <input
            type="password"
            style="width: 100%; background: #1a1a24; border: 1px solid #374151; border-radius: 4px; padding: 8px 10px; color: white; font-size: 12px; box-sizing: border-box;"
            placeholder="********"
            ref={passwordInputRef}
            onkeydown={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
            onkeyup={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
            onkeypress={(e: KeyboardEvent): void => { e.stopPropagation(); e.stopImmediatePropagation(); }}
          />
        </div>

        {/* Login button */}
        <Button callback={onLogin} disabled={loginLoading}>
          <div style={loginLoading.map(l => l
            ? "background: #374151; color: #9ca3af; border-radius: 6px; padding: 10px; text-align: center; font-size: 12px; font-weight: 600;"
            : "background: #3b82f6; color: white; border-radius: 6px; padding: 10px; text-align: center; font-size: 12px; font-weight: 600;")}>
            {MappedSubject.create(([loading, lang]) => loading ? translations[lang].common.loading : translations[lang].login.login, loginLoading, currentLanguage)}
          </div>
        </Button>
      </div>
    </div>
  );
}
