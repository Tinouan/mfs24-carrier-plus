/**
 * MissionRecapPopup - End of mission recap popup component
 * Extracted from MissionsView.tsx for better maintainability
 * Shows grade, scores, XP breakdown, and modifiers status
 */
import { FSComponent, VNode, Subject } from "@microsoft/msfs-sdk";
import { Button } from "@efb/efb-api";
import type { Language, MissionRecapData } from "../types";

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
// PROPS INTERFACE
// ═══════════════════════════════════════════════════════════

export interface MissionRecapPopupProps {
  showMissionRecap: Subject<boolean>;
  missionRecapData: Subject<MissionRecapData | null>;
  currentLanguage: Subject<Language>;
  t: (cat: string, key: string) => string;
}

// ═══════════════════════════════════════════════════════════
// GRADE COLORS
// ═══════════════════════════════════════════════════════════

const GRADE_COLORS: Record<string, string> = {
  "S": "#fbbf24",
  "A": "#22c55e",
  "B": "#3b82f6",
  "C": "#9ca3af",
  "D": "#f59e0b",
  "E": "#ef4444",
  "F": "#7f1d1d",
};

const LANDING_COLORS: Record<string, string> = {
  "Butter": "#fbbf24",
  "Smooth": "#22c55e",
  "Good": "#22c55e",
  "Firm": "#3b82f6",
  "Hard": "#f59e0b",
  "Rough": "#ef4444",
  "Very Hard": "#ef4444",
  "Crash": "#7f1d1d",
};

// Labels sans emojis pour compatibilite Coherent GT (emojis = carres noirs)
const MODIFIER_LABELS: Record<string, string> = {
  night: "[NUIT]",
  real_weather: "[METEO]",
  no_autopilot: "[MANUEL]",
  atc_compliance: "[ATC]",
  fuel_saver: "[ECO]",
};

const MODIFIER_LABELS_WITH_BONUS: Record<string, string> = {
  night: "[NUIT] +30%",
  real_weather: "[METEO] +20%",
  no_autopilot: "[MANUEL] +50%",
  atc_compliance: "[ATC] +30%",
  fuel_saver: "[ECO] +20%",
};

// Couleurs pour les labels de modifiers
const MODIFIER_COLORS: Record<string, string> = {
  night: "#7c3aed",      // violet
  real_weather: "#3b82f6", // bleu
  no_autopilot: "#f59e0b", // orange
  atc_compliance: "#22c55e", // vert
  fuel_saver: "#10b981",  // teal
};

// ═══════════════════════════════════════════════════════════
// RENDER FUNCTION
// ═══════════════════════════════════════════════════════════

export function renderMissionRecapPopup(props: MissionRecapPopupProps): VNode {
  const { showMissionRecap, missionRecapData, currentLanguage, t } = props;

  return (
    <div style={showMissionRecap.map(show => show
      ? "position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 1001;"
      : "display: none;")}>
      <div style="background: #1a1a24; border-radius: 16px; padding: 24px; width: 320px; max-width: 95%; border: 2px solid #374151;">
        {/* Header with grade + landing quality */}
        <div style="text-align: center; margin-bottom: 16px;">
          <div style="font-size: 11px; color: #6b7280; text-transform: uppercase; margin-bottom: 4px;">
            {currentLanguage.map(l => translations[l].missions.missionCompleted)}
          </div>
          <div style="display: flex; justify-content: center; align-items: center; gap: 16px;">
            <div style={missionRecapData.map(d => {
              const grade = d?.grade || "F";
              return `font-size: 56px; font-weight: 800; color: ${GRADE_COLORS[grade] || "#9ca3af"}; line-height: 1;`;
            })}>
              {missionRecapData.map(d => d?.grade || "F")}
            </div>
            <div style="text-align: left;">
              <div style="font-family: monospace; font-size: 14px; color: white; font-weight: 600;">
                {missionRecapData.map(d => d ? `${d.origin_icao} > ${d.final_icao}` : "")}
              </div>
              <div style={missionRecapData.map(d => {
                const quality = d?.landing_quality || "--";
                return `font-size: 12px; color: ${LANDING_COLORS[quality] || "#9ca3af"};`;
              })}>
                {missionRecapData.map(d => d?.landing_quality || "--")} ({missionRecapData.map(d => d?.landing_fpm || 0)} fpm)
              </div>
            </div>
          </div>
        </div>

        {/* Flight summary */}
        <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px;">
          <div style="background: #252532; border-radius: 6px; padding: 8px; text-align: center; width: calc(33.33% - 6px);">
            <div style="font-size: 9px; color: #6b7280; text-transform: uppercase;">Temps</div>
            <div style="font-size: 14px; color: white; font-weight: 600;">{missionRecapData.map(d => {
              const mins = d?.flight_time_minutes || 0;
              const h = Math.floor(mins / 60);
              const m = mins % 60;
              return h > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${m}min`;
            })}</div>
          </div>
          <div style="background: #252532; border-radius: 6px; padding: 8px; text-align: center; width: calc(33.33% - 6px);">
            <div style="font-size: 9px; color: #6b7280; text-transform: uppercase;">Cargo</div>
            <div style="font-size: 14px; color: white; font-weight: 600;">{missionRecapData.map(d => `${Math.round(d?.cargo_weight_kg || 0)}kg`)}</div>
          </div>
          <div style="background: #252532; border-radius: 6px; padding: 8px; text-align: center; width: calc(33.33% - 6px);">
            <div style="font-size: 9px; color: #6b7280; text-transform: uppercase;">Fuel</div>
            <div style="font-size: 14px; color: white; font-weight: 600;">{missionRecapData.map(d => `${Math.round(d?.fuel_remaining_percent || 0)}%`)}</div>
          </div>
        </div>

        {/* Score breakdown */}
        <div style="background: #252532; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
          <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; margin-bottom: 8px;">Scores</div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <span style="font-size: 11px; color: #9ca3af;">Atterrissage</span>
            <span style={missionRecapData.map(d => `font-size: 11px; font-weight: 600; color: ${(d?.score_landing || 0) >= 30 ? '#22c55e' : (d?.score_landing || 0) >= 15 ? '#f59e0b' : '#ef4444'};`)}>{missionRecapData.map(d => d?.score_landing || 0)}/40</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <span style="font-size: 11px; color: #9ca3af;">G-Force (max {missionRecapData.map(d => d?.max_gforce?.toFixed(1) || "1.0")}G)</span>
            <span style={missionRecapData.map(d => `font-size: 11px; font-weight: 600; color: ${(d?.score_gforce || 0) >= 15 ? '#22c55e' : (d?.score_gforce || 0) >= 8 ? '#f59e0b' : '#ef4444'};`)}>{missionRecapData.map(d => d?.score_gforce || 0)}/20</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <span style="font-size: 11px; color: #9ca3af;">Destination</span>
            <span style={missionRecapData.map(d => d?.score_destination === 20
              ? "font-size: 11px; color: #22c55e; font-weight: 600;"
              : "font-size: 11px; color: #ef4444; font-weight: 600;")}>{missionRecapData.map(d => d?.score_destination || 0)}/20</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <span style="font-size: 11px; color: #9ca3af;">Temps de vol</span>
            <span style="font-size: 11px; color: #22c55e; font-weight: 600;">{missionRecapData.map(d => d?.score_time || 0)}/10</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="font-size: 11px; color: #9ca3af;">Carburant</span>
            <span style={missionRecapData.map(d => `font-size: 11px; font-weight: 600; color: ${(d?.score_fuel || 0) >= 6 ? '#22c55e' : (d?.score_fuel || 0) >= 3 ? '#f59e0b' : '#ef4444'};`)}>{missionRecapData.map(d => d?.score_fuel || 0)}/10</span>
          </div>
          <div style="border-top: 1px solid #374151; margin-top: 8px; padding-top: 8px; display: flex; justify-content: space-between;">
            <span style="font-size: 12px; color: white; font-weight: 600;">TOTAL</span>
            <span style="font-size: 12px; color: #3b82f6; font-weight: 700;">{missionRecapData.map(d => d?.score_total || 0)}/100</span>
          </div>
        </div>

        {/* Modifiers validated/failed */}
        <div style={missionRecapData.map(d => (d?.modifiers_validated?.length || d?.modifiers_failed?.length)
          ? "background: #252532; border-radius: 8px; padding: 12px; margin-bottom: 16px;"
          : "display: none;")}>
          <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; margin-bottom: 8px;">Bonus Modifiers</div>

          {/* Validated modifiers */}
          <div style={missionRecapData.map(d => (d?.modifiers_validated?.length)
            ? "display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px;"
            : "display: none;")}>
            {missionRecapData.map(d => {
              const mods = d?.modifiers_validated || [];
              return mods.map(m => MODIFIER_LABELS_WITH_BONUS[m] || m).join(" • ");
            })}
          </div>
          <div style={missionRecapData.map(d => (d?.modifiers_validated?.length)
            ? "font-size: 9px; color: #22c55e;"
            : "display: none;")}>
            [OK] Valides
          </div>

          {/* Failed modifiers */}
          <div style={missionRecapData.map(d => (d?.modifiers_failed?.length)
            ? "display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px;"
            : "display: none;")}>
            {missionRecapData.map(d => {
              const mods = d?.modifiers_failed || [];
              return mods.map(m => MODIFIER_LABELS[m] || m).join(" • ");
            })}
          </div>
          <div style={missionRecapData.map(d => (d?.modifiers_failed?.length)
            ? "font-size: 9px; color: #ef4444;"
            : "display: none;")}>
            [KO] Echoues
          </div>
        </div>

        {/* XP Breakdown */}
        <div style={missionRecapData.map(d => d?.xp_breakdown
          ? "background: #252532; border-radius: 8px; padding: 12px; margin-bottom: 12px;"
          : "display: none;")}>
          <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; margin-bottom: 8px;">Calcul XP</div>

          {/* Base XP */}
          <div style="display: flex; justify-content: space-between; font-size: 11px; color: #9ca3af; margin-bottom: 4px;">
            <span>Base (distance x 2)</span>
            <span style="color: white;">{missionRecapData.map(d => d?.xp_breakdown?.base_xp || 0)} XP</span>
          </div>

          {/* Cargo multiplier */}
          <div style={missionRecapData.map(d => (d?.xp_breakdown?.cargo_multiplier || 1) > 1
            ? "display: flex; justify-content: space-between; font-size: 11px; color: #22c55e; margin-bottom: 4px;"
            : "display: flex; justify-content: space-between; font-size: 11px; color: #9ca3af; margin-bottom: 4px;")}>
            <span>Cargo ({missionRecapData.map(d => Math.round(d?.cargo_weight_kg || 0))}kg)</span>
            <span style="font-weight: 600;">x{missionRecapData.map(d => d?.xp_breakdown?.cargo_multiplier?.toFixed(1) || "1.0")}</span>
          </div>

          {/* Real-time bonus */}
          <div style={missionRecapData.map(d => (d?.xp_breakdown?.real_time_bonus || 0) > 0
            ? "display: flex; justify-content: space-between; font-size: 11px; color: #22c55e; margin-bottom: 4px;"
            : "display: flex; justify-content: space-between; font-size: 11px; color: #9ca3af; margin-bottom: 4px;")}>
            <span>Temps reel ({missionRecapData.map(d => Math.round(d?.xp_breakdown?.real_time_ratio || 100))}%)</span>
            <span style="font-weight: 600;">+{missionRecapData.map(d => Math.round((d?.xp_breakdown?.real_time_bonus || 0) * 100))}%</span>
          </div>

          {/* Modifiers bonus */}
          <div style={missionRecapData.map(d => (d?.xp_breakdown?.modifiers_bonus || 0) > 0
            ? "display: flex; justify-content: space-between; font-size: 11px; color: #fbbf24; margin-bottom: 4px;"
            : "display: none;")}>
            <span>Modifiers valides</span>
            <span style="font-weight: 600;">+{missionRecapData.map(d => Math.round((d?.xp_breakdown?.modifiers_bonus || 0) * 100))}%</span>
          </div>

          {/* Grade multiplier */}
          <div style={missionRecapData.map(d => {
            const mult = d?.xp_breakdown?.grade_multiplier || 1.0;
            const color = mult >= 1.5 ? "#22c55e" : mult >= 1.0 ? "#3b82f6" : "#ef4444";
            return `display: flex; justify-content: space-between; font-size: 11px; color: ${color}; margin-bottom: 4px;`;
          })}>
            <span>Grade {missionRecapData.map(d => d?.grade || "F")}</span>
            <span style="font-weight: 600;">x{missionRecapData.map(d => d?.xp_breakdown?.grade_multiplier?.toFixed(1) || "1.0")}</span>
          </div>
        </div>

        {/* Cheat warning */}
        <div style={missionRecapData.map(d => d?.cheated
          ? "background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; border-radius: 8px; padding: 10px; margin-bottom: 16px;"
          : "display: none;")}>
          <div style="font-size: 11px; color: #ef4444; font-weight: 600; text-align: center;">
            [!] TRICHE DETECTEE - XP DIVISE PAR 2
          </div>
        </div>

        {/* XP earned */}
        <div style="background: rgba(34, 197, 94, 0.15); border: 1px solid #22c55e; border-radius: 8px; padding: 12px; text-align: center; margin-bottom: 16px;">
          <div style="font-size: 10px; color: #22c55e; text-transform: uppercase; margin-bottom: 4px;">XP Gagne</div>
          <div style="font-size: 28px; font-weight: 700; color: #22c55e;">
            +{missionRecapData.map(d => d?.xp_earned || 0)}
          </div>
        </div>

        {/* Close button */}
        <Button callback={(): void => { showMissionRecap.set(false); missionRecapData.set(null); }}>
          <div style="background: #3b82f6; color: white; border-radius: 8px; padding: 14px; font-size: 14px; font-weight: 600; text-align: center;">
            {t("common", "close")}
          </div>
        </Button>
      </div>
    </div>
  );
}
