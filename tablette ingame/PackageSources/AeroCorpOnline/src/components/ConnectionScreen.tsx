/**
 * ConnectionScreen - SEED Connection overlay for "Monde Unique"
 * Shows connection status and retry button when disconnected
 */
import { FSComponent, VNode, Subject } from "@microsoft/msfs-sdk";
import { Button } from "@efb/efb-api";
import type { Language } from "../types";
import type { SeedConnectionStatus } from "../state/AuthState";

// ═══════════════════════════════════════════════════════════
// CONNECTION SCREEN PROPS
// ═══════════════════════════════════════════════════════════

export interface ConnectionScreenProps {
  connectionStatus: Subject<SeedConnectionStatus>;
  connectionError: Subject<string | null>;
  initProgress: Subject<number>;
  initStep: Subject<string>;
  currentLanguage: Subject<Language>;
  onRetry: () => void;
  onSwitchToSolo: () => void;
}

// ═══════════════════════════════════════════════════════════
// CONNECTION SCREEN COMPONENT
// ═══════════════════════════════════════════════════════════

export function renderConnectionScreen(props: ConnectionScreenProps): VNode {
  const {
    connectionStatus,
    connectionError,
    initProgress,
    initStep,
    onRetry,
    onSwitchToSolo,
  } = props;

  // Show overlay when connecting or failed (hide when connected)
  return (
    <div
      style={connectionStatus.map((status) =>
        status === "connecting" || status === "failed"
          ? "position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: #1a1a24; z-index: 300; display: flex; flex-direction: column; align-items: center; justify-content: center;"
          : "display: none;"
      )}
    >
      {/* Logo - Globe + Airplane */}
      <div style="margin-bottom: 24px;">
        <svg style="width: 64px; height: 64px;" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"/>
          <ellipse cx="12" cy="12" rx="4" ry="9"/>
          <line x1="3" y1="12" x2="21" y2="12"/>
          <g transform="translate(14, 5) rotate(45)">
            <path d="M0 0L4 2L0 4L1 2L0 0Z" fill="#60a5fa" stroke="none"/>
            <line x1="-2" y1="2" x2="1" y2="2" stroke-width="1"/>
          </g>
        </svg>
      </div>

      {/* Title */}
      <div style="font-size: 24px; font-weight: 700; color: white; margin-bottom: 8px;">AeroCorp Online</div>
      <div style="font-size: 12px; color: #6b7280; margin-bottom: 32px;">Monde Unique</div>

      {/* Status Display - Connecting */}
      <div
        style={connectionStatus.map((status) =>
          status === "connecting"
            ? "display: flex; flex-direction: column; align-items: center;"
            : "display: none;"
        )}
      >
        {/* Spinner */}
        <div style="margin-bottom: 16px;">
          <svg
            style="width: 32px; height: 32px; animation: spin 1s linear infinite;"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#60a5fa"
            stroke-width="2"
          >
            <circle cx="12" cy="12" r="10" stroke-opacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round" />
          </svg>
        </div>

        {/* Progress Text */}
        <div style="font-size: 14px; color: #9ca3af; margin-bottom: 8px;">{initStep}</div>

        {/* Progress Bar */}
        <div style="width: 200px; height: 4px; background: #374151; border-radius: 2px; overflow: hidden;">
          <div
            style={initProgress.map(
              (p) => `width: ${p}%; height: 100%; background: #60a5fa; transition: width 0.3s ease;`
            )}
          />
        </div>
      </div>

      {/* Status Display - Failed */}
      <div
        style={connectionStatus.map((status) =>
          status === "failed"
            ? "display: flex; flex-direction: column; align-items: center;"
            : "display: none;"
        )}
      >
        {/* Error Icon */}
        <div style="margin-bottom: 16px;">
          <svg style="width: 48px; height: 48px;" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5">
            <circle cx="12" cy="12" r="10" />
            <path d="M15 9l-6 6" />
            <path d="M9 9l6 6" />
          </svg>
        </div>

        {/* Error Message */}
        <div style="font-size: 16px; color: #ef4444; font-weight: 600; margin-bottom: 8px;">Connexion impossible</div>
        <div style="font-size: 12px; color: #9ca3af; margin-bottom: 24px; text-align: center; max-width: 280px;">
          {connectionError.map((err) => err || "Impossible de se connecter au serveur SEED")}
        </div>

        {/* Retry Button */}
        <Button callback={onRetry}>
          <div style="background: #60a5fa; color: white; border-radius: 8px; padding: 12px 32px; font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 8px;">
            <svg style="width: 16px; height: 16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 4v6h6" />
              <path d="M23 20v-6h-6" />
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
            </svg>
            Réessayer
          </div>
        </Button>

        {/* Solo Mode Fallback Button */}
        <Button callback={onSwitchToSolo}>
          <div style="background: transparent; color: #9ca3af; border: 1px solid #374151; border-radius: 8px; padding: 10px 32px; font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 8px; margin-top: 12px;">
            <svg style="width: 16px; height: 16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.4-.1.9.3 1.1L11 12l-2 3H6l-1 1 3 2 2 3 1-1v-3l3-2 3.7 7.3c.2.4.7.5 1.1.3l.5-.3c.4-.2.6-.6.5-1.1z" />
            </svg>
            Jouer en Solo
          </div>
        </Button>

        {/* Help Text */}
        <div style="font-size: 10px; color: #6b7280; margin-top: 20px; text-align: center;">
          Continuez sans connexion serveur
        </div>
      </div>

      {/* CSS for spinner animation - injected inline */}
      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
}
