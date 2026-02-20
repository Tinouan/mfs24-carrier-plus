/**
 * FreeFlightRenderHelpers - HTML generation for free flight UI components
 * V2.0: Recap popup and flight history rendering
 * Uses inline styles only (Coherent GT constraint)
 */

import type { FreeFlightRecapData } from "../state/FreeFlightState";
import type { FlightHistoryEntry, FlightHistoryFilter } from "../types";
import { formatMoney, formatMoneyWithSign } from "./PlayerHelpers";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface FreeFlightRecapTranslations {
  reportTitle: string;
  departure: string;
  arrival: string;
  distance: string;
  flightTime: string;
  fuelRemaining: string;
  flightQuality: string;
  landing: string;
  gforceMax: string;
  atcCompliance: string;
  violations: string;
  bonuses: string;
  bonusRealTime: string;
  bonusNight: string;
  bonusAtc: string;
  bonusFuelEco: string;
  bonusNoAP: string;
  bonusBadWeather: string;
  totalBonus: string;
  result: string;
  score: string;
  grade: string;
  xpEarned: string;
  moneyEarned: string;
  moneyDisabled: string;
  close: string;
  butter: string;
  smooth: string;
  normal: string;
  hard: string;
  crash: string;
  perfect: string;
  ok: string;
  poor: string;
}

export interface FlightHistoryTranslations {
  title: string;
  filterAll: string;
  filterMissions: string;
  filterFreeFlight: string;
  totalFlights: string;
  colType: string;
  colDate: string;
  colRoute: string;
  colAircraft: string;
  colDistance: string;
  colTime: string;
  colGrade: string;
  colXP: string;
  colMoney: string;
  mission: string;
  freeflight: string;
  noFlights: string;
  loadMore: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// FREE FLIGHT RECAP POPUP HTML
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate HTML for free flight recap popup
 * CSS classes for event binding:
 * - .ff-recap-close-btn - Close button
 */
export function renderFreeFlightRecapHtml(
  data: FreeFlightRecapData,
  translations: FreeFlightRecapTranslations
): string {
  // Format flight time
  const hours = Math.floor(data.flight_time_minutes / 60);
  const mins = Math.round(data.flight_time_minutes % 60);
  const flightTimeStr = hours > 0 ? `${hours}h ${mins}min` : `${mins}min`;

  // Landing quality translation
  const landingQualityText = translations[data.landing_quality as keyof FreeFlightRecapTranslations] || data.landing_quality;
  const landingColor = data.landing_fpm < 100 ? "#22c55e" : data.landing_fpm < 200 ? "#f59e0b" : "#ef4444";

  // G-force status
  const gforceColor = data.max_gforce <= 2.0 ? "#22c55e" : data.max_gforce <= 2.5 ? "#f59e0b" : "#ef4444";
  const gforceText = data.max_gforce <= 2.5 ? translations.ok : translations.poor;

  // ATC status
  const atcColor = data.atc_compliance >= 100 ? "#22c55e" : data.atc_compliance >= 80 ? "#f59e0b" : "#ef4444";
  const atcText = data.atc_compliance >= 100 ? translations.perfect : `${data.atc_compliance}%`;

  // Grade colors
  const gradeColors: Record<string, string> = {
    S: "#fbbf24",
    A: "#22c55e",
    B: "#3b82f6",
    C: "#9ca3af",
    D: "#f59e0b",
    F: "#ef4444",
  };
  const gradeColor = gradeColors[data.grade] || "#9ca3af";

  // Build bonuses HTML
  const bonusItems = [
    { key: "real_time", label: translations.bonusRealTime, bonus: data.bonuses.real_time },
    { key: "night", label: translations.bonusNight, bonus: data.bonuses.night },
    { key: "atc", label: translations.bonusAtc, bonus: data.bonuses.atc },
    { key: "fuel_eco", label: translations.bonusFuelEco, bonus: data.bonuses.fuel_eco },
    { key: "no_autopilot", label: translations.bonusNoAP, bonus: data.bonuses.no_autopilot },
    { key: "bad_weather", label: translations.bonusBadWeather, bonus: data.bonuses.bad_weather },
  ];

  const bonusesHtml = bonusItems.map(item => {
    const icon = item.bonus.active ? "[+]" : "[-]";
    const color = item.bonus.active ? "#22c55e" : "#6b7280";
    const multiplierText = item.bonus.active ? `x${item.bonus.multiplier.toFixed(2)}` : "x1.00";
    return `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0;">
        <span style="color: ${color}; font-size: 11px;">
          <span style="font-weight: 600; margin-right: 6px;">${icon}</span>
          ${item.label}
        </span>
        <span style="color: ${color}; font-size: 11px; font-family: monospace;">${multiplierText}</span>
      </div>
    `;
  }).join("");

  return `
    <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.8); display: flex; align-items: center; justify-content: center; z-index: 1000;">
      <div style="background: #1a1a24; border: 2px solid #3b82f6; border-radius: 16px; padding: 20px; max-width: 380px; width: 90%; max-height: 90vh; overflow-y: auto;">
        <!-- Title -->
        <div style="text-align: center; margin-bottom: 16px;">
          <div style="font-size: 14px; font-weight: 700; color: #3b82f6; text-transform: uppercase; letter-spacing: 1px;">
            ${translations.reportTitle}
          </div>
        </div>

        <!-- Route -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding: 12px; background: #252532; border-radius: 8px;">
          <div style="text-align: center;">
            <div style="font-size: 20px; font-weight: 700; color: white; font-family: monospace;">${data.departure_icao}</div>
            <div style="font-size: 9px; color: #6b7280; text-transform: uppercase;">${translations.departure}</div>
          </div>
          <div style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 0 12px;">
            <div style="flex: 1; height: 2px; background: #374151;"></div>
            <svg style="width: 20px; height: 20px; fill: #3b82f6; margin: 0 8px;" viewBox="0 0 24 24">
              <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
            </svg>
            <div style="flex: 1; height: 2px; background: #374151;"></div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 20px; font-weight: 700; color: white; font-family: monospace;">${data.arrival_icao}</div>
            <div style="font-size: 9px; color: #6b7280; text-transform: uppercase;">${translations.arrival}</div>
          </div>
        </div>

        <!-- Stats Row (Flexbox for Coherent GT) -->
        <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px;">
          <div style="background: #252532; border-radius: 6px; padding: 8px; text-align: center; width: calc(33.33% - 6px);">
            <div style="font-size: 14px; font-weight: 600; color: white;">${data.distance_nm} nm</div>
            <div style="font-size: 9px; color: #6b7280;">${translations.distance}</div>
          </div>
          <div style="background: #252532; border-radius: 6px; padding: 8px; text-align: center; width: calc(33.33% - 6px);">
            <div style="font-size: 14px; font-weight: 600; color: white;">${flightTimeStr}</div>
            <div style="font-size: 9px; color: #6b7280;">${translations.flightTime}</div>
          </div>
          <div style="background: #252532; border-radius: 6px; padding: 8px; text-align: center; width: calc(33.33% - 6px);">
            <div style="font-size: 14px; font-weight: 600; color: white;">${data.fuel_remaining_percent}%</div>
            <div style="font-size: 9px; color: #6b7280;">${translations.fuelRemaining}</div>
          </div>
        </div>

        <!-- Flight Quality Section -->
        <div style="margin-bottom: 16px;">
          <div style="font-size: 10px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 8px; text-align: center;">
            ${translations.flightQuality}
          </div>
          <div style="background: #252532; border-radius: 8px; padding: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="font-size: 11px; color: #9ca3af;">${translations.landing}:</span>
              <span style="font-size: 11px; color: ${landingColor}; font-weight: 600;">
                ${Math.round(data.landing_fpm)} fpm - ${landingQualityText}
              </span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="font-size: 11px; color: #9ca3af;">${translations.gforceMax}:</span>
              <span style="font-size: 11px; color: ${gforceColor}; font-weight: 600;">
                ${data.max_gforce.toFixed(2)}g - ${gforceText}
              </span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 11px; color: #9ca3af;">${translations.atcCompliance}:</span>
              <span style="font-size: 11px; color: ${atcColor}; font-weight: 600;">
                ${atcText} (${data.atc_violations} ${translations.violations})
              </span>
            </div>
          </div>
        </div>

        <!-- Bonuses Section -->
        <div style="margin-bottom: 16px;">
          <div style="font-size: 10px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 8px; text-align: center;">
            ${translations.bonuses}
          </div>
          <div style="background: #252532; border-radius: 8px; padding: 10px;">
            ${bonusesHtml}
            <div style="border-top: 1px solid #374151; margin-top: 8px; padding-top: 8px; display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 11px; color: white; font-weight: 600;">${translations.totalBonus}:</span>
              <span style="font-size: 13px; color: #3b82f6; font-weight: 700; font-family: monospace;">x${data.bonus_multiplier_total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <!-- Result Section -->
        <div style="margin-bottom: 16px;">
          <div style="font-size: 10px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 8px; text-align: center;">
            ${translations.result}
          </div>
          <div style="background: #252532; border-radius: 8px; padding: 16px; text-align: center;">
            <!-- Score -->
            <div style="margin-bottom: 12px;">
              <span style="font-size: 11px; color: #6b7280;">${translations.score}:</span>
              <span style="font-size: 16px; font-weight: 700; color: white; margin-left: 8px;">${data.score_total} / 1500</span>
            </div>

            <!-- Grade Badge -->
            <div style="display: inline-block; width: 56px; height: 56px; background: ${gradeColor}; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-bottom: 12px;">
              <span style="font-size: 28px; font-weight: 800; color: ${data.grade === "S" ? "#1a1a24" : "white"};">${data.grade}</span>
            </div>

            <!-- XP Earned -->
            <div style="margin-bottom: 6px;">
              <span style="font-size: 11px; color: #9ca3af;">${translations.xpEarned}:</span>
              <span style="font-size: 18px; font-weight: 700; color: #22c55e; margin-left: 8px;">+${data.xp_earned} XP</span>
            </div>

            <!-- Money (disabled for free flight) -->
            <div>
              <span style="font-size: 11px; color: #4b5563;">${translations.moneyEarned}:</span>
              <span style="font-size: 11px; color: #4b5563; margin-left: 8px;">-- (${translations.moneyDisabled})</span>
            </div>
          </div>
        </div>

        <!-- Close Button -->
        <button class="ff-recap-close-btn" style="width: 100%; padding: 12px; background: #3b82f6; color: white; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; text-transform: uppercase;">
          ${translations.close}
        </button>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
// FLIGHT HISTORY TABLE HTML
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate HTML for flight history table
 * CSS classes for event binding:
 * - .flight-history-row - Clickable row (data-id attribute)
 * - .flight-history-filter-btn - Filter buttons (data-filter attribute)
 * - .flight-history-load-more - Load more button
 */
export function renderFlightHistoryHtml(
  entries: FlightHistoryEntry[],
  totalCount: number,
  currentFilter: FlightHistoryFilter,
  translations: FlightHistoryTranslations
): string {
  // Filter buttons
  const filterButtons = `
    <div style="display: flex; gap: 6px; margin-bottom: 12px;">
      <button class="flight-history-filter-btn" data-filter="all" style="padding: 6px 12px; background: ${currentFilter === "all" ? "#3b82f6" : "#252532"}; color: white; border: 1px solid #3b82f6; border-radius: 6px; font-size: 10px; cursor: pointer;">
        ${translations.filterAll}
      </button>
      <button class="flight-history-filter-btn" data-filter="mission" style="padding: 6px 12px; background: ${currentFilter === "mission" ? "#f59e0b" : "#252532"}; color: white; border: 1px solid #f59e0b; border-radius: 6px; font-size: 10px; cursor: pointer;">
        ${translations.filterMissions}
      </button>
      <button class="flight-history-filter-btn" data-filter="freeflight" style="padding: 6px 12px; background: ${currentFilter === "freeflight" ? "#3b82f6" : "#252532"}; color: white; border: 1px solid #3b82f6; border-radius: 6px; font-size: 10px; cursor: pointer;">
        ${translations.filterFreeFlight}
      </button>
      <div style="flex: 1; text-align: right; font-size: 10px; color: #6b7280; align-self: center;">
        ${totalCount} ${translations.totalFlights}
      </div>
    </div>
  `;

  // Empty state
  if (entries.length === 0) {
    return `
      ${filterButtons}
      <div style="background: #252532; border-radius: 12px; padding: 32px; text-align: center;">
        <svg style="width: 40px; height: 40px; margin-bottom: 12px; opacity: 0.4;" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5">
          <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
        </svg>
        <div style="color: #6b7280; font-size: 12px;">${translations.noFlights}</div>
      </div>
    `;
  }

  // Table header (Flexbox for Coherent GT compatibility)
  const tableHeader = `
    <div style="display: flex; gap: 4px; padding: 8px 4px; background: #1a1a24; border-radius: 6px 6px 0 0; font-size: 9px; color: #6b7280; text-transform: uppercase;">
      <div style="width: 30px;">${translations.colType}</div>
      <div style="width: 45px;">${translations.colDate}</div>
      <div style="width: 90px;">${translations.colRoute}</div>
      <div style="width: 50px;">${translations.colAircraft}</div>
      <div style="width: 45px;">${translations.colDistance}</div>
      <div style="width: 40px;">${translations.colTime}</div>
      <div style="width: 30px;">${translations.colGrade}</div>
      <div style="width: 50px; text-align: right;">${translations.colXP}</div>
      <div style="width: 50px; text-align: right;">${translations.colMoney}</div>
    </div>
  `;

  // Table rows
  const gradeColors: Record<string, string> = {
    S: "#fbbf24",
    A: "#22c55e",
    B: "#3b82f6",
    C: "#9ca3af",
    D: "#f59e0b",
    F: "#ef4444",
  };

  const rows = entries.map((entry, index) => {
    const date = new Date(entry.date);
    const dateStr = `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
    const typeColor = entry.type === "mission" ? "#f59e0b" : "#3b82f6";
    const typeLabel = entry.type === "mission" ? translations.mission : translations.freeflight;
    const gradeColor = gradeColors[entry.grade] || "#9ca3af";
    const hours = Math.floor(entry.flight_time_minutes / 60);
    const mins = entry.flight_time_minutes % 60;
    const timeStr = hours > 0 ? `${hours}h${String(mins).padStart(2, "0")}` : `${mins}m`;
    const moneyStr = entry.money_earned > 0 ? `+${entry.money_earned}` : "--";
    const moneyColor = entry.money_earned > 0 ? "#22c55e" : "#4b5563";
    const bgColor = index % 2 === 0 ? "#252532" : "#1f2029";

    return `
      <div class="flight-history-row" data-id="${entry.id}" style="display: flex; gap: 4px; padding: 8px 4px; background: ${bgColor}; font-size: 10px; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#374151'" onmouseout="this.style.background='${bgColor}'">
        <div style="width: 30px; color: ${typeColor}; font-weight: 600;">${typeLabel}</div>
        <div style="width: 45px; color: #9ca3af;">${dateStr}</div>
        <div style="width: 90px; color: white; font-family: monospace; font-size: 9px;">${entry.departure_icao}-${entry.arrival_icao}</div>
        <div style="width: 50px; color: #9ca3af;">${entry.aircraft_type}</div>
        <div style="width: 45px; color: white;">${entry.distance_nm}nm</div>
        <div style="width: 40px; color: #9ca3af;">${timeStr}</div>
        <div style="width: 30px; color: ${gradeColor}; font-weight: 700;">${entry.grade}</div>
        <div style="width: 50px; color: #22c55e; text-align: right; font-weight: 500;">+${entry.xp_earned}</div>
        <div style="width: 50px; color: ${moneyColor}; text-align: right;">${moneyStr}</div>
      </div>
    `;
  }).join("");

  // Load more button
  const loadMoreBtn = entries.length < totalCount ? `
    <button class="flight-history-load-more" style="width: 100%; padding: 10px; background: #252532; color: #9ca3af; border: 1px solid #374151; border-radius: 0 0 6px 6px; font-size: 11px; cursor: pointer;">
      ${translations.loadMore}
    </button>
  ` : "";

  return `
    ${filterButtons}
    <div style="background: #252532; border-radius: 8px; overflow: hidden;">
      ${tableHeader}
      <div style="max-height: 300px; overflow-y: auto;">
        ${rows}
      </div>
      ${loadMoreBtn}
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
// V4.1: UNIFIED TIMELINE (FLIGHTS + TRANSACTIONS)
// ═══════════════════════════════════════════════════════════════════════════

export type UnifiedHistoryFilter = "all" | "flights" | "transactions" | "contracts";

export interface UnifiedTimelineEntry {
  id: string;
  date: string;          // ISO8601
  type: "flight" | "transaction";
  // Flight data
  flightType?: "mission" | "freeflight";
  departure_icao?: string;
  arrival_icao?: string;
  grade?: string;
  xp_earned?: number;
  money_earned?: number;
  flight_time_minutes?: number;
  // Transaction data
  transactionType?: string;
  amount?: number;
  description?: string;
  airport_icao?: string;
}

export interface UnifiedHistoryTranslations {
  filterAll: string;
  filterFlights: string;
  filterTransactions: string;
  filterContracts: string;
  mission: string;
  freeflight: string;
  marketBuy: string;
  marketSell: string;
  marketList: string;
  aircraftBuy: string;
  aircraftSell: string;
  refuel: string;
  repair: string;
  companyCreate: string;
  missionReward: string;
  transferToCompany?: string;
  transferFromCompany?: string;
  contractReward?: string;
  loadMore: string;
  noHistory: string;
}

/**
 * Render unified history timeline (flights + transactions)
 * V4.1: Combined view for Profile > Historique
 */
export function renderUnifiedHistoryHtml(
  entries: UnifiedTimelineEntry[],
  currentFilter: UnifiedHistoryFilter,
  translations: UnifiedHistoryTranslations
): string {
  // Filter buttons
  const filterButtons = `
    <div style="display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap;">
      <button class="unified-history-filter-btn" data-filter="all" style="padding: 6px 12px; background: ${currentFilter === "all" ? "#3b82f6" : "#252532"}; color: white; border: 1px solid #3b82f6; border-radius: 6px; font-size: 10px; cursor: pointer;">
        ${translations.filterAll}
      </button>
      <button class="unified-history-filter-btn" data-filter="flights" style="padding: 6px 12px; background: ${currentFilter === "flights" ? "#60a5fa" : "#252532"}; color: white; border: 1px solid #60a5fa; border-radius: 6px; font-size: 10px; cursor: pointer;">
        ${translations.filterFlights}
      </button>
      <button class="unified-history-filter-btn" data-filter="transactions" style="padding: 6px 12px; background: ${currentFilter === "transactions" ? "#22c55e" : "#252532"}; color: white; border: 1px solid #22c55e; border-radius: 6px; font-size: 10px; cursor: pointer;">
        ${translations.filterTransactions}
      </button>
      <button class="unified-history-filter-btn" data-filter="contracts" style="padding: 6px 12px; background: ${currentFilter === "contracts" ? "#a855f7" : "#252532"}; color: white; border: 1px solid #a855f7; border-radius: 6px; font-size: 10px; cursor: pointer; opacity: 0.5;" disabled>
        ${translations.filterContracts}
      </button>
    </div>
  `;

  // Empty state
  if (entries.length === 0) {
    return `
      ${filterButtons}
      <div style="background: #252532; border-radius: 12px; padding: 32px; text-align: center;">
        <div style="color: #6b7280; font-size: 12px;">${translations.noHistory}</div>
      </div>
    `;
  }

  // Group by date
  const grouped: Record<string, UnifiedTimelineEntry[]> = {};
  for (const entry of entries) {
    const date = new Date(entry.date);
    const dateKey = `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(entry);
  }

  // Render grouped entries
  const gradeColors: Record<string, string> = {
    S: "#fbbf24", A: "#22c55e", B: "#3b82f6", C: "#9ca3af", D: "#f59e0b", F: "#ef4444",
  };

  const getTransactionLabel = (type: string): string => {
    switch (type) {
      case "market_buy": return translations.marketBuy;
      case "market_sell": return translations.marketSell;
      case "market_list": return translations.marketList;
      case "aircraft_buy": return translations.aircraftBuy;
      case "aircraft_sell": return translations.aircraftSell;
      case "refuel": return translations.refuel;
      case "repair": return translations.repair;
      case "company_create": return translations.companyCreate;
      case "mission_reward": return translations.missionReward;
      case "transfer_to_company": return translations.transferToCompany || type;
      case "transfer_from_company": return translations.transferFromCompany || type;
      case "contract_reward": return translations.contractReward || "Contract reward";
      default: return type;
    }
  };

  const sections = Object.entries(grouped).map(([dateKey, dayEntries]) => {
    const rows = dayEntries.map(entry => {
      const time = new Date(entry.date);
      const timeStr = `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;

      if (entry.type === "flight") {
        // Flight entry
        const typeColor = entry.flightType === "mission" ? "#f59e0b" : "#60a5fa";
        const typeLabel = entry.flightType === "mission" ? translations.mission : translations.freeflight;
        const gradeColor = gradeColors[entry.grade || "C"] || "#9ca3af";
        const route = `${entry.departure_icao || "?"} - ${entry.arrival_icao || "?"}`;
        const xpStr = entry.xp_earned ? `+${entry.xp_earned} XP` : "";
        const moneyStr = entry.money_earned ? formatMoneyWithSign(entry.money_earned) : "";
        const hours = Math.floor((entry.flight_time_minutes || 0) / 60);
        const mins = (entry.flight_time_minutes || 0) % 60;
        const durationStr = hours > 0 ? `${hours}h${String(mins).padStart(2, "0")}` : `${mins}min`;

        return `
          <div style="display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; border-bottom: 1px solid #1a1a24;">
            <div style="width: 40px; color: #6b7280; font-size: 10px;">${timeStr}</div>
            <div style="width: 8px; height: 8px; border-radius: 50%; background: ${typeColor}; margin-top: 4px; flex-shrink: 0;"></div>
            <div style="flex: 1;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="font-size: 11px; color: white; font-weight: 500;">${typeLabel} ${route}</div>
                <div style="font-size: 10px; color: ${gradeColor}; font-weight: 700;">${entry.grade || "-"}</div>
              </div>
              <div style="font-size: 10px; color: #6b7280; margin-top: 2px;">
                ${xpStr} ${moneyStr ? "· " + moneyStr : ""} · ${durationStr}
              </div>
            </div>
          </div>
        `;
      } else {
        // Transaction entry
        const amount = entry.amount || 0;
        const isGain = amount > 0;
        const dotColor = isGain ? "#22c55e" : "#ef4444";
        const amountColor = isGain ? "#22c55e" : "#ef4444";
        const abs = Math.abs(amount);
        const amountStr = formatMoneyWithSign(entry.amount!);
        const label = getTransactionLabel(entry.transactionType || "");
        const icaoStr = entry.airport_icao ? ` @ ${entry.airport_icao}` : "";

        return `
          <div style="display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; border-bottom: 1px solid #1a1a24;">
            <div style="width: 40px; color: #6b7280; font-size: 10px;">${timeStr}</div>
            <div style="width: 8px; height: 8px; border-radius: 50%; background: ${dotColor}; margin-top: 4px; flex-shrink: 0;"></div>
            <div style="flex: 1;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="font-size: 11px; color: white;">${label}</div>
                <div style="font-size: 11px; color: ${amountColor}; font-weight: 600;">${amountStr}</div>
              </div>
              <div style="font-size: 10px; color: #6b7280; margin-top: 2px;">
                ${entry.description || ""}${icaoStr}
              </div>
            </div>
          </div>
        `;
      }
    }).join("");

    return `
      <div style="margin-bottom: 16px;">
        <div style="font-size: 10px; color: #9ca3af; font-weight: 600; padding: 8px 0; border-bottom: 1px solid #374151;">${dateKey}</div>
        ${rows}
      </div>
    `;
  }).join("");

  return `
    ${filterButtons}
    <div style="background: #252532; border-radius: 8px; padding: 12px; max-height: 350px; overflow-y: auto;">
      ${sections}
    </div>
  `;
}

/**
 * Render transactions-only history (for Market > Historique)
 * V4.1: Improved visual with bigger cards, colored dots, CR amounts.
 */
export function renderTransactionsHistoryHtml(
  entries: UnifiedTimelineEntry[],
  translations: UnifiedHistoryTranslations
): string {
  if (entries.length === 0) {
    return `
      <div style="background: #252532; border-radius: 12px; padding: 32px; text-align: center;">
        <svg style="width: 40px; height: 40px; margin-bottom: 12px; opacity: 0.4;" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5">
          <path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/>
        </svg>
        <div style="color: #6b7280; font-size: 13px;">${translations.noHistory}</div>
      </div>
    `;
  }

  const getTransactionLabel = (type: string): string => {
    switch (type) {
      case "market_buy": return translations.marketBuy;
      case "market_sell": return translations.marketSell;
      case "market_list": return translations.marketList;
      case "aircraft_buy": return translations.aircraftBuy;
      case "aircraft_sell": return translations.aircraftSell;
      case "refuel": return translations.refuel;
      case "repair": return translations.repair;
      case "company_create": return translations.companyCreate;
      case "mission_reward": return translations.missionReward;
      case "transfer_to_company": return translations.transferToCompany || type;
      case "transfer_from_company": return translations.transferFromCompany || type;
      case "contract_reward": return translations.contractReward || "Contract reward";
      default: return type;
    }
  };

  const getDotColor = (type: string, amount: number): string => {
    switch (type) {
      case "market_buy":
      case "aircraft_buy": return "#ef4444";
      case "market_sell":
      case "market_list":
      case "aircraft_sell": return "#22c55e";
      case "refuel":
      case "repair": return "#f59e0b";
      case "mission_reward": return "#3b82f6";
      case "company_create": return "#8b5cf6";
      case "transfer_to_company":
      case "transfer_from_company": return "#8b5cf6";
      case "contract_reward": return "#10b981";
      default: return amount > 0 ? "#22c55e" : "#ef4444";
    }
  };

  // Group by date
  const grouped: Record<string, UnifiedTimelineEntry[]> = {};
  for (const entry of entries) {
    const date = new Date(entry.date);
    const dateKey = `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(entry);
  }

  const formatAmount = (amount: number): string => {
    return formatMoneyWithSign(amount);
  };

  const sections = Object.entries(grouped).map(([dateKey, dayEntries]) => {
    const cards = dayEntries.map(entry => {
      const time = new Date(entry.date);
      const timeStr = `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;
      const amount = entry.amount || 0;
      const isGain = amount > 0;
      const amountColor = isGain ? "#22c55e" : "#ef4444";
      const label = getTransactionLabel(entry.transactionType || "");
      const dotColor = getDotColor(entry.transactionType || "", amount);
      const icaoStr = entry.airport_icao ? ` @ ${entry.airport_icao}` : "";
      const descStr = entry.description ? `${entry.description}${icaoStr}` : icaoStr.replace(" @ ", "@ ");

      return `
        <div style="background: #252532; border-radius: 8px; padding: 12px; margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
              <div style="width: 10px; height: 10px; border-radius: 50%; background: ${dotColor}; flex-shrink: 0;"></div>
              <div style="font-size: 14px; font-weight: 600; color: white;">${label}</div>
            </div>
            <div style="font-size: 16px; font-weight: 700; color: ${amountColor}; white-space: nowrap; margin-left: 8px;">${formatAmount(amount)}</div>
          </div>
          ${descStr ? `<div style="font-size: 12px; color: #9ca3af; margin-top: 4px; margin-left: 18px;">${descStr}</div>` : ""}
          <div style="font-size: 11px; color: #6b7280; margin-top: 4px; margin-left: 18px;">${dateKey} — ${timeStr}</div>
        </div>
      `;
    }).join("");

    return `
      <div style="margin-bottom: 4px;">
        <div style="font-size: 13px; color: #6b7280; font-weight: 700; padding: 12px 0 8px 0;">${dateKey}</div>
        ${cards}
      </div>
    `;
  }).join("");

  return `<div>${sections}</div>`;
}

/**
 * Render flights-only history (for Profile or Missions)
 * No filter buttons, just a clean flight list.
 */
export function renderFlightsHistoryHtml(
  entries: UnifiedTimelineEntry[],
  translations: UnifiedHistoryTranslations
): string {
  if (entries.length === 0) {
    return `
      <div style="background: #252532; border-radius: 12px; padding: 32px; text-align: center;">
        <div style="color: #6b7280; font-size: 12px;">${translations.noHistory}</div>
      </div>
    `;
  }

  const gradeColors: Record<string, string> = {
    S: "#fbbf24", A: "#22c55e", B: "#3b82f6", C: "#9ca3af", D: "#f59e0b", F: "#ef4444",
  };

  // Group by date
  const grouped: Record<string, UnifiedTimelineEntry[]> = {};
  for (const entry of entries) {
    const date = new Date(entry.date);
    const dateKey = `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(entry);
  }

  const sections = Object.entries(grouped).map(([dateKey, dayEntries]) => {
    const rows = dayEntries.map(entry => {
      const time = new Date(entry.date);
      const timeStr = `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;
      const typeColor = entry.flightType === "mission" ? "#f59e0b" : "#60a5fa";
      const typeLabel = entry.flightType === "mission" ? translations.mission : translations.freeflight;
      const gradeColor = gradeColors[entry.grade || "C"] || "#9ca3af";
      const route = `${entry.departure_icao || "?"} - ${entry.arrival_icao || "?"}`;
      const xpStr = entry.xp_earned ? `+${entry.xp_earned} XP` : "";
      const moneyStr = entry.money_earned ? `+${entry.money_earned}$` : "";
      const hours = Math.floor((entry.flight_time_minutes || 0) / 60);
      const mins = (entry.flight_time_minutes || 0) % 60;
      const durationStr = hours > 0 ? `${hours}h${String(mins).padStart(2, "0")}` : `${mins}min`;

      return `
        <div class="history-flight-row" data-flight-id="${entry.id}" style="display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; border-bottom: 1px solid #1a1a24; cursor: pointer;">
          <div style="width: 40px; color: #6b7280; font-size: 10px;">${timeStr}</div>
          <div style="width: 8px; height: 8px; border-radius: 50%; background: ${typeColor}; margin-top: 4px; flex-shrink: 0;"></div>
          <div style="flex: 1;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="font-size: 11px; color: white; font-weight: 500;">${typeLabel} ${route}</div>
              <div style="font-size: 10px; color: ${gradeColor}; font-weight: 700;">${entry.grade || "-"}</div>
            </div>
            <div style="font-size: 10px; color: #6b7280; margin-top: 2px;">
              ${xpStr} ${moneyStr ? "· " + moneyStr : ""} · ${durationStr}
            </div>
          </div>
        </div>
      `;
    }).join("");

    return `
      <div style="margin-bottom: 16px;">
        <div style="font-size: 10px; color: #9ca3af; font-weight: 600; padding: 8px 0; border-bottom: 1px solid #374151;">${dateKey}</div>
        ${rows}
      </div>
    `;
  }).join("");

  return `
    <div style="background: #252532; border-radius: 8px; padding: 12px; max-height: 400px; overflow-y: auto;">
      ${sections}
    </div>
  `;
}
