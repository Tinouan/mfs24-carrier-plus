/**
 * ModeSelectionScreen - Game mode selection overlay
 * Architecture v3.0: Choose between Solo and Online careers
 *
 * Solo Mode: Local storage, AI economy, no anti-cheat, offline capable
 * Online Mode: SEED server, player economy, anti-cheat, requires connection
 */
import { FSComponent, VNode, Subject } from "@microsoft/msfs-sdk";
import { Button } from "@efb/efb-api";
import type { GameMode } from "../state/GameModeState";

// ═══════════════════════════════════════════════════════════
// MODE SELECTION SCREEN PROPS
// ═══════════════════════════════════════════════════════════

export interface ModeSelectionScreenProps {
  showSelector: Subject<boolean>;
  loading: Subject<boolean>;
  error: Subject<string | null>;
  onSelectMode: (mode: GameMode) => void;
}

// ═══════════════════════════════════════════════════════════
// MODE SELECTION SCREEN COMPONENT
// ═══════════════════════════════════════════════════════════

export function renderModeSelectionScreen(props: ModeSelectionScreenProps): VNode {
  const { showSelector, loading, error, onSelectMode } = props;

  return (
    <div
      style={showSelector.map((show) =>
        show
          ? "position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: #0f0f17; z-index: 400; display: flex; flex-direction: column; align-items: center; justify-content: center;"
          : "display: none;"
      )}
    >
      {/* Logo */}
      <div style="margin-bottom: 16px;">
        <svg style="width: 56px; height: 56px;" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="1.5">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      </div>

      {/* Title */}
      <div style="font-size: 28px; font-weight: 700; color: white; margin-bottom: 4px;">AeroCorp Online</div>
      <div style="font-size: 14px; color: #6b7280; margin-bottom: 32px;">Choisissez votre mode de jeu</div>

      {/* Error Message */}
      <div
        style={error.map((err) =>
          err
            ? "background: #7f1d1d; border: 1px solid #dc2626; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px; max-width: 400px;"
            : "display: none;"
        )}
      >
        <div style="color: #fca5a5; font-size: 13px;">{error}</div>
      </div>

      {/* Loading State */}
      <div
        style={loading.map((isLoading) =>
          isLoading
            ? "display: flex; flex-direction: column; align-items: center;"
            : "display: none;"
        )}
      >
        <svg
          style="width: 32px; height: 32px; animation: spin 1s linear infinite; margin-bottom: 16px;"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#60a5fa"
          stroke-width="2"
        >
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round" />
        </svg>
        <div style="color: #9ca3af; font-size: 14px;">Chargement...</div>
      </div>

      {/* Mode Cards - Hidden when loading */}
      <div
        style={loading.map((isLoading) =>
          isLoading
            ? "display: none;"
            : "display: flex; gap: 24px; flex-wrap: wrap; justify-content: center; padding: 0 24px;"
        )}
      >
        {/* Solo Mode Card */}
        <Button callback={() => onSelectMode("solo")}>
          <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border: 2px solid #334155; border-radius: 16px; padding: 24px; width: 280px; cursor: pointer; transition: all 0.2s; text-align: left;">
            {/* Icon */}
            <div style="width: 48px; height: 48px; background: #1e40af; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
              <svg style="width: 24px; height: 24px;" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>

            {/* Title */}
            <div style="font-size: 20px; font-weight: 700; color: white; margin-bottom: 8px;">Mode Solo</div>

            {/* Description */}
            <div style="font-size: 13px; color: #9ca3af; line-height: 1.5; margin-bottom: 16px;">
              Jouez hors ligne avec une economie locale geree par l'IA. Progression sauvegardee localement.
            </div>

            {/* Features */}
            <div style="display: flex; flex-direction: column; gap: 8px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <svg style="width: 16px; height: 16px; flex-shrink: 0;" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                <span style="font-size: 12px; color: #d1d5db;">Fonctionne hors ligne</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <svg style="width: 16px; height: 16px; flex-shrink: 0;" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                <span style="font-size: 12px; color: #d1d5db;">Economie IA dynamique</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <svg style="width: 16px; height: 16px; flex-shrink: 0;" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                <span style="font-size: 12px; color: #d1d5db;">Liberte totale</span>
              </div>
            </div>

            {/* Badge */}
            <div style="margin-top: 16px; display: inline-block; background: #1e40af; color: white; font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 99px;">
              RECOMMANDE
            </div>
          </div>
        </Button>

        {/* Online Mode Card */}
        <Button callback={() => onSelectMode("online")}>
          <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border: 2px solid #334155; border-radius: 16px; padding: 24px; width: 280px; cursor: pointer; transition: all 0.2s; text-align: left;">
            {/* Icon */}
            <div style="width: 48px; height: 48px; background: #7c3aed; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
              <svg style="width: 24px; height: 24px;" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>

            {/* Title */}
            <div style="font-size: 20px; font-weight: 700; color: white; margin-bottom: 8px;">Mode Online</div>

            {/* Description */}
            <div style="font-size: 13px; color: #9ca3af; line-height: 1.5; margin-bottom: 16px;">
              Connectez-vous au serveur SEED pour une experience multijoueur avec economie partagee.
            </div>

            {/* Features */}
            <div style="display: flex; flex-direction: column; gap: 8px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <svg style="width: 16px; height: 16px; flex-shrink: 0;" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                <span style="font-size: 12px; color: #d1d5db;">Marche entre joueurs</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <svg style="width: 16px; height: 16px; flex-shrink: 0;" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                <span style="font-size: 12px; color: #d1d5db;">Classements mondiaux</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <svg style="width: 16px; height: 16px; flex-shrink: 0;" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2">
                  <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span style="font-size: 12px; color: #d1d5db;">Connexion requise</span>
              </div>
            </div>

            {/* Badge */}
            <div style="margin-top: 16px; display: inline-block; background: #7c3aed; color: white; font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 99px;">
              MULTIJOUEUR
            </div>
          </div>
        </Button>
      </div>

      {/* Footer Note */}
      <div style="margin-top: 32px; font-size: 11px; color: #6b7280; text-align: center; max-width: 400px;">
        Votre choix peut etre modifie plus tard dans les parametres.
        <br />
        <span style="color: #ef4444;">Les carrieres Solo et Online sont completement separees.</span>
      </div>

      {/* CSS for spinner animation */}
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
