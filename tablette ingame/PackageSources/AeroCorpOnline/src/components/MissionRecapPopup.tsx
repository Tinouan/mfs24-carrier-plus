/**
 * MissionRecapPopup - End of mission recap popup V2
 * Layout: Grade header, 4-category evaluation (/1000), modifiers, XP formula
 * Reference: grade-tracking-v3.html (VUE 3)
 */
import { FSComponent, VNode, Subject } from "@microsoft/msfs-sdk";
import { Button } from "@efb/efb-api";
import type { Language, MissionRecapData } from "../types";

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function getGradeColor(grade: string): string {
  switch (grade) {
    case "S": return "#eab308";
    case "A": return "#22c55e";
    case "B": return "#f59e0b";
    case "C": return "#e2e2e8";
    case "D": case "E": case "F": return "#ef4444";
    default: return "#4b5563";
  }
}

function getGradeActiveBg(grade: string): string {
  switch (grade) {
    case "S": return "#2a2a1a";
    case "A": return "#1a3a2a";
    case "B": return "#2a2a1a";
    case "C": return "#2a2a2a";
    default: return "#2a1a1a";
  }
}

function getBarColor(pct: number): string {
  if (pct > 80) return "#22c55e";
  if (pct > 50) return "#38bdf8";
  return "#f59e0b";
}

function formatNumber(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

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
// RENDER FUNCTION
// ═══════════════════════════════════════════════════════════

export function renderMissionRecapPopup(props: MissionRecapPopupProps): VNode {
  const { showMissionRecap, missionRecapData } = props;

  const gradeLetters = ["F", "E", "D", "C", "B", "A", "S"];

  return (
    <div style={showMissionRecap.map(show => show
      ? "position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 1001;"
      : "display: none;")}>

      <div style="background: #13131f; border-radius: 16px; border: 1px solid #2a2a3d; width: 400px; max-height: calc(100% - 40px); overflow-y: auto;">

        {/* ═══ HEADER GRADE ═══ */}
        <div style="background: #161625; padding: 24px 28px; text-align: center; border-bottom: 1px solid #2a2a3d;">
          <div style="font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: #6b7280; font-weight: 500; margin-bottom: 8px;">Mission terminee</div>
          <div style="font-size: 20px; font-weight: 700; color: #f0f0f5; margin-bottom: 4px;">
            {missionRecapData.map(d => d ? d.origin_icao : "----")}
            <span style="color: #4b5563; margin: 0 8px;">-</span>
            {missionRecapData.map(d => d ? d.final_icao : "----")}
          </div>
          <div style="font-family: monospace; font-size: 12px; color: #6b7280; margin-bottom: 20px;">
            {missionRecapData.map(d => {
              if (!d) return "";
              const mins = d.flight_time_minutes || 0;
              const h = Math.floor(mins / 60);
              const m = mins % 60;
              const timeStr = h > 0 ? `${h}h ${m.toString().padStart(2, "0")}min` : `${m}min`;
              return `${d.distance_nm} nm | ${timeStr}${d.aircraft_type ? ` | ${d.aircraft_type}` : ""}`;
            })}
          </div>

          {/* Grade circle 88px */}
          <div style={missionRecapData.map(d => {
            const c = getGradeColor(d?.grade || "--");
            return `width: 88px; height: 88px; border-radius: 50%; border: 3px solid ${c}; display: inline-flex; align-items: center; justify-content: center; font-size: 44px; font-weight: 700; color: ${c}; margin-bottom: 10px;`;
          })}>
            {missionRecapData.map(d => d?.grade || "--")}
          </div>

          {/* Score /1000 */}
          <div style="font-family: monospace; font-size: 15px; color: #9ca3af;">
            <span style={missionRecapData.map(d => {
              const c = getGradeColor(d?.grade || "--");
              return `font-size: 20px; font-weight: 700; color: ${c};`;
            })}>{missionRecapData.map(d => d?.score_total || 0)}</span> / 1000
          </div>

          {/* Grade scale pips */}
          <div style="display: flex; align-items: center; justify-content: center; gap: 4px; margin-top: 14px;">
            {gradeLetters.map(letter => (
              <div style={missionRecapData.map(d => {
                const g = d?.grade || "--";
                if (g === letter) {
                  const c = getGradeColor(g);
                  const bg = getGradeActiveBg(g);
                  return `padding: 3px 8px; border-radius: 4px; font-family: monospace; font-size: 10px; font-weight: 600; background: ${bg}; color: ${c}; border: 1px solid ${c};`;
                }
                return "padding: 3px 8px; border-radius: 4px; font-family: monospace; font-size: 10px; font-weight: 600; background: #1a1a2a; color: #4b5563;";
              })}>{letter}</div>
            ))}
          </div>
        </div>

        {/* ═══ EVALUATION DU VOL ═══ */}
        <div style="padding: 20px 28px;">
          <div style="font-size: 10px; letter-spacing: 2.5px; text-transform: uppercase; color: #4b5563; font-weight: 600; margin-bottom: 14px;">Evaluation du vol</div>

          {/* Atterrissage /450 */}
          <div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid #1e1e2e;">
            <div style="width: 32px; height: 32px; border-radius: 8px; background: #252040; color: #818cf8; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; margin-right: 14px; flex-shrink: 0;">ATR</div>
            <div style="flex: 1;">
              <div style="font-size: 13px; font-weight: 500; color: #d1d5db;">Atterrissage</div>
              <div style="font-family: monospace; font-size: 11px; color: #6b7280;">
                {missionRecapData.map(d => `${d?.landing_fpm || 0} fpm`)}
              </div>
            </div>
            <div style="width: 100px; margin: 0 14px;">
              <div style="height: 6px; background: #1e1e2e; border-radius: 3px; overflow: hidden;">
                <div style={missionRecapData.map(d => {
                  const pct = Math.round(((d?.score_landing || 0) / 450) * 100);
                  return `width: ${pct}%; height: 100%; background: ${getBarColor(pct)}; border-radius: 3px;`;
                })}></div>
              </div>
            </div>
            <div style="font-family: monospace; font-size: 13px; font-weight: 600; text-align: right; min-width: 70px;">
              <span style={missionRecapData.map(d => {
                const pct = Math.round(((d?.score_landing || 0) / 450) * 100);
                return `color: ${getBarColor(pct)};`;
              })}>{missionRecapData.map(d => d?.score_landing || 0)}</span>
              <span style="color: #4b5563; font-weight: 400;"> /450</span>
            </div>
          </div>

          {/* G-Force /200 */}
          <div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid #1e1e2e;">
            <div style="width: 32px; height: 32px; border-radius: 8px; background: #351a1a; color: #ef4444; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; margin-right: 14px; flex-shrink: 0;">G</div>
            <div style="flex: 1;">
              <div style="font-size: 13px; font-weight: 500; color: #d1d5db;">G-Force max</div>
              <div style="font-family: monospace; font-size: 11px; color: #6b7280;">
                {missionRecapData.map(d => `${(d?.max_gforce || 1).toFixed(1)} G`)}
              </div>
            </div>
            <div style="width: 100px; margin: 0 14px;">
              <div style="height: 6px; background: #1e1e2e; border-radius: 3px; overflow: hidden;">
                <div style={missionRecapData.map(d => {
                  const pct = Math.round(((d?.score_gforce || 0) / 200) * 100);
                  return `width: ${pct}%; height: 100%; background: ${getBarColor(pct)}; border-radius: 3px;`;
                })}></div>
              </div>
            </div>
            <div style="font-family: monospace; font-size: 13px; font-weight: 600; text-align: right; min-width: 70px;">
              <span style={missionRecapData.map(d => {
                const pct = Math.round(((d?.score_gforce || 0) / 200) * 100);
                return `color: ${getBarColor(pct)};`;
              })}>{missionRecapData.map(d => d?.score_gforce || 0)}</span>
              <span style="color: #4b5563; font-weight: 400;"> /200</span>
            </div>
          </div>

          {/* Destination /250 */}
          <div style="display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid #1e1e2e;">
            <div style="width: 32px; height: 32px; border-radius: 8px; background: #1a2e1a; color: #22c55e; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; margin-right: 14px; flex-shrink: 0;">DST</div>
            <div style="flex: 1;">
              <div style="font-size: 13px; font-weight: 500; color: #d1d5db;">Destination</div>
              <div style="font-family: monospace; font-size: 11px; color: #6b7280;">
                {missionRecapData.map(d => {
                  if (!d) return "";
                  return d.final_icao === d.destination_icao
                    ? `${d.final_icao} atteint`
                    : `${d.final_icao} (attendu: ${d.destination_icao})`;
                })}
              </div>
            </div>
            <div style="width: 100px; margin: 0 14px;">
              <div style="height: 6px; background: #1e1e2e; border-radius: 3px; overflow: hidden;">
                <div style={missionRecapData.map(d => {
                  const pct = Math.round(((d?.score_destination || 0) / 250) * 100);
                  return `width: ${pct}%; height: 100%; background: ${getBarColor(pct)}; border-radius: 3px;`;
                })}></div>
              </div>
            </div>
            <div style="font-family: monospace; font-size: 13px; font-weight: 600; text-align: right; min-width: 70px;">
              <span style={missionRecapData.map(d => {
                const pct = Math.round(((d?.score_destination || 0) / 250) * 100);
                return `color: ${getBarColor(pct)};`;
              })}>{missionRecapData.map(d => d?.score_destination || 0)}</span>
              <span style="color: #4b5563; font-weight: 400;"> /250</span>
            </div>
          </div>

          {/* Distance /100 */}
          <div style="display: flex; align-items: center; padding: 10px 0;">
            <div style="width: 32px; height: 32px; border-radius: 8px; background: #1a2435; color: #38bdf8; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; margin-right: 14px; flex-shrink: 0;">NM</div>
            <div style="flex: 1;">
              <div style="font-size: 13px; font-weight: 500; color: #d1d5db;">Distance</div>
              <div style="font-family: monospace; font-size: 11px; color: #6b7280;">
                {missionRecapData.map(d => {
                  if (!d) return "";
                  const flown = d.distance_flown_nm || 0;
                  const planned = d.distance_nm || 0;
                  const ratio = planned > 0 ? Math.round((flown / planned) * 100) : 0;
                  return `${Math.round(flown)} / ${planned} nm (${ratio}%)`;
                })}
              </div>
            </div>
            <div style="width: 100px; margin: 0 14px;">
              <div style="height: 6px; background: #1e1e2e; border-radius: 3px; overflow: hidden;">
                <div style={missionRecapData.map(d => {
                  const pct = d?.score_distance || 0;
                  return `width: ${pct}%; height: 100%; background: ${getBarColor(pct)}; border-radius: 3px;`;
                })}></div>
              </div>
            </div>
            <div style="font-family: monospace; font-size: 13px; font-weight: 600; text-align: right; min-width: 70px;">
              <span style={missionRecapData.map(d => {
                const pct = d?.score_distance || 0;
                return `color: ${getBarColor(pct)};`;
              })}>{missionRecapData.map(d => d?.score_distance || 0)}</span>
              <span style="color: #4b5563; font-weight: 400;"> /100</span>
            </div>
          </div>
        </div>

        <div style="height: 1px; background: #2a2a3d; margin: 0 28px;"></div>

        {/* ═══ MODIFICATEURS XP ═══ */}
        <div style="padding: 16px 28px;">
          <div style="font-size: 10px; letter-spacing: 2.5px; text-transform: uppercase; color: #4b5563; font-weight: 600; margin-bottom: 10px;">Modificateurs XP</div>

          {/* Night */}
          <div style={missionRecapData.map(d => (d?.xp_breakdown?.night_bonus || 0) > 0
            ? "display: flex; justify-content: space-between; align-items: center; padding: 6px 0;"
            : "display: none;")}>
            <span style="font-size: 12px; color: #9ca3af;">Vol de nuit</span>
            <span style="font-family: monospace; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 4px; background: #1a2e1a; color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.25);">
              {missionRecapData.map(d => `+${Math.round((d?.xp_breakdown?.night_bonus || 0) * 100)}%`)}
            </span>
          </div>

          {/* Cargo */}
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0;">
            <span style="font-size: 12px; color: #9ca3af;">
              {missionRecapData.map(d => `Cargo (${d?.xp_breakdown?.cargo_fill_percent || 0}% soute)`)}
            </span>
            <span style="font-family: monospace; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 4px; background: #1a2e1a; color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.25);">
              {missionRecapData.map(d => `x${(d?.xp_breakdown?.cargo_multiplier || 1).toFixed(1)}`)}
            </span>
          </div>

          {/* Fuel */}
          <div style={missionRecapData.map(d => (d?.xp_breakdown?.fuel_bonus || 0) > 0
            ? "display: flex; justify-content: space-between; align-items: center; padding: 6px 0;"
            : "display: none;")}>
            <span style="font-size: 12px; color: #9ca3af;">
              {missionRecapData.map(d => `Carburant restant (${Math.round(d?.fuel_remaining_percent || 0)}%)`)}
            </span>
            <span style="font-family: monospace; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 4px; background: #1a2e1a; color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.25);">
              {missionRecapData.map(d => `+${Math.round((d?.xp_breakdown?.fuel_bonus || 0) * 100)}%`)}
            </span>
          </div>

          {/* Lights */}
          <div style={missionRecapData.map(d => (d?.xp_breakdown?.lights_bonus || 0) > 0
            ? "display: flex; justify-content: space-between; align-items: center; padding: 6px 0;"
            : "display: none;")}>
            <span style="font-size: 12px; color: #9ca3af;">
              {missionRecapData.map(d => `Lumieres (${Math.round((d?.xp_breakdown?.lights_compliance || 0) * 100)}%)`)}
            </span>
            <span style="font-family: monospace; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 4px; background: #1a2e1a; color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.25);">
              {missionRecapData.map(d => `+${Math.round((d?.xp_breakdown?.lights_bonus || 0) * 100)}%`)}
            </span>
          </div>

          {/* Suivi de vol */}
          <div style={missionRecapData.map(d => (d?.xp_breakdown?.flightpath_bonus || 0) > 0
            ? "display: flex; justify-content: space-between; align-items: center; padding: 6px 0;"
            : "display: none;")}>
            <span style="font-size: 12px; color: #9ca3af;">
              {missionRecapData.map(d => `Suivi de vol (${Math.round((d?.xp_breakdown?.flightpath_compliance || 0) * 100)}%)`)}
            </span>
            <span style="font-family: monospace; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 4px; background: #1a2e1a; color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.25);">
              {missionRecapData.map(d => `+${Math.round((d?.xp_breakdown?.flightpath_bonus || 0) * 100)}%`)}
            </span>
          </div>

          {/* Météo difficile */}
          <div style={missionRecapData.map(d => (d?.xp_breakdown?.weather_bonus || 0) > 0
            ? "display: flex; justify-content: space-between; align-items: center; padding: 6px 0;"
            : "display: none;")}>
            <span style="font-size: 12px; color: #9ca3af;">
              {missionRecapData.map(d => `Meteo difficile (${Math.round((d?.xp_breakdown?.weather_difficulty || 0) * 100)}%)`)}
            </span>
            <span style="font-family: monospace; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 4px; background: #1a2e1a; color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.25);">
              {missionRecapData.map(d => `+${Math.round((d?.xp_breakdown?.weather_bonus || 0) * 100)}%`)}
            </span>
          </div>

          {/* Vitesse sim (was "Temps reel") */}
          <div style={missionRecapData.map(d => (d?.xp_breakdown?.simrate_bonus || 0) > 0
            ? "display: flex; justify-content: space-between; align-items: center; padding: 6px 0;"
            : "display: none;")}>
            <span style="font-size: 12px; color: #9ca3af;">
              {missionRecapData.map(d => `Vitesse sim (${Math.round(d?.xp_breakdown?.simrate_ratio || 0)}%)`)}
            </span>
            <span style="font-family: monospace; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 4px; background: #1a2e1a; color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.25);">
              {missionRecapData.map(d => `x${(1 + (d?.xp_breakdown?.simrate_bonus || 0)).toFixed(1)}`)}
            </span>
          </div>
        </div>

        {/* ═══ CALCUL XP ═══ */}
        <div style="background: #111120; padding: 18px 28px; border-top: 1px solid #2a2a3d;">
          <div style="font-size: 10px; letter-spacing: 2.5px; text-transform: uppercase; color: #4b5563; font-weight: 600; margin-bottom: 10px;">Calcul XP</div>

          <div style="display: flex; justify-content: space-between; padding: 3px 0; font-size: 12px;">
            <span style="color: #6b7280;">
              {missionRecapData.map(d => `Base (${d?.xp_breakdown?.distance_nm || 0}nm x 4)`)}
            </span>
            <span style="font-family: monospace; color: #9ca3af; font-weight: 500;">
              {missionRecapData.map(d => `${formatNumber(d?.xp_breakdown?.base_xp || 0)} XP`)}
            </span>
          </div>

          <div style="display: flex; justify-content: space-between; padding: 3px 0; font-size: 12px;">
            <span style="color: #6b7280;">
              {missionRecapData.map(d => `Cargo ${d?.xp_breakdown?.cargo_fill_percent || 0}%`)}
            </span>
            <span style="font-family: monospace; color: #9ca3af; font-weight: 500;">
              {missionRecapData.map(d => `x ${(d?.xp_breakdown?.cargo_multiplier || 1).toFixed(1)}`)}
            </span>
          </div>

          <div style="display: flex; justify-content: space-between; padding: 3px 0; font-size: 12px;">
            <span style="color: #6b7280;">
              {missionRecapData.map(d => {
                const parts = ["Nuit", "Carburant"];
                if ((d?.xp_breakdown?.lights_bonus || 0) > 0) parts.push("Lumieres");
                if ((d?.xp_breakdown?.flightpath_bonus || 0) > 0) parts.push("Suivi vol");
                if ((d?.xp_breakdown?.weather_bonus || 0) > 0) parts.push("Meteo");
                return parts.join(" + ");
              })}
            </span>
            <span style="font-family: monospace; color: #9ca3af; font-weight: 500;">
              {missionRecapData.map(d => `x ${(d?.xp_breakdown?.total_additive || 1).toFixed(1)}`)}
            </span>
          </div>

          <div style="display: flex; justify-content: space-between; padding: 3px 0; font-size: 12px;">
            <span style="color: #6b7280;">Vitesse sim</span>
            <span style="font-family: monospace; color: #9ca3af; font-weight: 500;">
              {missionRecapData.map(d => `x ${(1 + (d?.xp_breakdown?.simrate_bonus || 0)).toFixed(1)}`)}
            </span>
          </div>

          <div style="display: flex; justify-content: space-between; padding: 3px 0; font-size: 12px;">
            <span style="color: #6b7280;">
              {missionRecapData.map(d => `Grade ${d?.xp_breakdown?.grade || d?.grade || "--"}`)}
            </span>
            <span style="font-family: monospace; color: #9ca3af; font-weight: 500;">
              {missionRecapData.map(d => `x ${(d?.xp_breakdown?.grade_multiplier || 1).toFixed(1)}`)}
            </span>
          </div>

          {/* TOTAL */}
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding-top: 12px; border-top: 1px solid #2a2a3d;">
            <div style="font-size: 13px; font-weight: 600; color: #d1d5db;">XP gagne</div>
            <div style="font-family: monospace; font-size: 22px; font-weight: 700; color: #22c55e;">
              {missionRecapData.map(d => formatNumber(d?.xp_earned || 0))} <span style="font-size: 13px; font-weight: 500; color: #6b7280;">XP</span>
            </div>
          </div>
        </div>

        {/* Cheat warning */}
        <div style={missionRecapData.map(d => d?.cheated
          ? "padding: 12px 28px; border-top: 1px solid #2a2a3d;"
          : "display: none;")}>
          <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; border-radius: 8px; padding: 10px;">
            <div style="font-size: 11px; color: #ef4444; font-weight: 600; text-align: center;">
              [!] TRICHE DETECTEE - XP REDUIT
            </div>
          </div>
        </div>

        {/* ═══ NOUVELLE MISSION ═══ */}
        <div style="padding: 16px 28px; border-top: 1px solid #2a2a3d; text-align: center;">
          <Button callback={(): void => { showMissionRecap.set(false); missionRecapData.set(null); }}>
            <div style="width: 100%; padding: 12px; background: #1a365d; border: 1px solid #2563eb; border-radius: 8px; color: #93c5fd; font-size: 13px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase;">
              Nouvelle mission
            </div>
          </Button>
        </div>
      </div>
    </div>
  );
}
