/**
 * HangarRenderHelpers - HTML generation for hangar components
 * Pure functions that generate innerHTML strings for hangar UI.
 * Event listeners must be attached by the caller after setting innerHTML.
 */

import { formatMoney } from "./PlayerHelpers";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface RefuelPopupData {
  registration: string;
  aircraftType: string;
  currentFuel: number;
  maxFuel: number;
  targetFuel: number;
  pricePerGallon: number;
  translations: {
    refuelTitle: string;
    currentLevel: string;
    target: string;
    toAdd: string;
    total: string;
    cancel: string;
    full: string;
    confirmRefuel: string;
  };
}

export interface SystemsPopupData {
  registration: string;
  aircraftType: string;
  flightHours: number;
  systems: Array<{ key: string; label: string; value: number }>;
  translations: {
    systemsStatus: string;
    flightHoursShort: string;
    overallCondition: string;
    good: string;
    worn: string;
    critical: string;
    repair: string;
  };
}

export interface RepairItemData {
  system: string;
  label: string;
  currentCondition: number;
  cost: number;
}

export interface HangarCargoItem {
  item_code: string;
  item_name: string;
  qty: number;
  total_weight_kg: number;
  tier: number;
  source?: string;
  contract_id?: string;
}

export interface HangarSystemData {
  condition: number;
  failed?: boolean;
}

export interface HangarSystemsData {
  systems: Record<string, HangarSystemData>;
  can_takeoff: boolean;
}

export interface HangarAircraftItem {
  id: string;
  registration: string | null;
  aircraft_type: string;
  icao_type: string | null;
  current_airport_ident: string | null;
  status: string;
  required_license: string | null;
  owner_type: string;
  thumbnail_url?: string | null;
  for_sale?: boolean;
}

export interface HangarListTranslations {
  noAircraft: string;
  noMatch: string;
  personalBadge: string;
  companyBadge: string;
  active: string;
  forSaleBadge: string;
}

export interface HangarSystemsTranslations {
  loading: string;
  grounded: string;
  repairRequired: string;
  failure: string;
  engine: string;
  landingGear: string;
  propeller: string;
  electrical: string;
  pitot: string;
  avionics: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// HANGAR CARGO HTML
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate HTML for cargo items list in hangar
 */
export function renderHangarCargoHtml(
  items: HangarCargoItem[],
  emptyMessage: string
): string {
  if (items.length === 0) {
    return `
      <div style="text-align: center; padding: 8px; color: #6b7280; font-size: 10px; font-style: italic;">
        ${emptyMessage}
      </div>
    `;
  }

  return items.map(item => {
    const tierColor = item.tier === 1 ? "#9ca3af" : item.tier === 2 ? "#22c55e" : item.tier === 3 ? "#3b82f6" : "#a855f7";
    const contractBadge = item.source === "contract"
      ? `<span style="background: rgba(139, 92, 246, 0.25); color: #8b5cf6; font-size: 8px; font-weight: 600; padding: 1px 4px; border-radius: 3px; margin-left: 4px;">CONTRAT</span>`
      : "";
    return `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #374151;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="width: 6px; height: 6px; border-radius: 50%; background: ${tierColor};"></span>
          <span style="font-size: 11px; color: white;">${item.item_name}${contractBadge}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 10px; color: #9ca3af;">x${item.qty}</span>
          <span style="font-size: 10px; color: #6b7280;">${Math.round(item.total_weight_kg)} kg</span>
        </div>
      </div>
    `;
  }).join("");
}

// ═══════════════════════════════════════════════════════════════════════════
// HANGAR SYSTEMS HTML
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate HTML for aircraft systems gauges in hangar
 */
export function renderHangarSystemsHtml(
  systemsData: HangarSystemsData | null,
  translations: HangarSystemsTranslations
): string {
  if (!systemsData) {
    return `
      <div style="text-align: center; padding: 12px; color: #6b7280; font-size: 10px;">
        ${translations.loading}
      </div>
    `;
  }

  const systemNames: Record<string, string> = {
    "engine": translations.engine,
    "landing_gear": translations.landingGear,
    "propeller": translations.propeller,
    "electrical": translations.electrical,
    "pitot": translations.pitot,
    "avionics": translations.avionics,
  };

  // System display order (critical systems first)
  const systemOrder = ["engine", "landing_gear", "propeller", "electrical", "pitot", "avionics"];
  const systems = systemsData.systems;
  let html = "";

  // Takeoff warning if grounded
  if (!systemsData.can_takeoff) {
    html += `
      <div style="padding: 10px; background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; border-radius: 6px; margin-bottom: 10px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <svg style="width: 16px; height: 16px; flex-shrink: 0;" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4M12 16h.01"/>
          </svg>
          <span style="font-size: 11px; color: #ef4444; font-weight: 600;">${translations.grounded}</span>
        </div>
        <div style="font-size: 9px; color: #fca5a5; margin-top: 4px; margin-left: 24px;">${translations.repairRequired}</div>
      </div>
    `;
  }

  // Display ALL systems with gauges in a single column
  html += `<div style="display: flex; flex-direction: column; gap: 6px;">`;

  systemOrder.forEach(key => {
    const sys = systems[key];
    if (!sys) return;

    const pct = Math.round(sys.condition);

    // Color based on condition
    let barColor = "#22c55e"; // Green (good)
    let textColor = "#22c55e";
    if (sys.failed) {
      barColor = "#ef4444";
      textColor = "#ef4444";
    } else if (pct < 10) {
      barColor = "#ef4444"; // Red (critical)
      textColor = "#ef4444";
    } else if (pct < 50) {
      barColor = "#f59e0b"; // Orange (warning)
      textColor = "#f59e0b";
    } else if (pct < 75) {
      barColor = "#eab308"; // Yellow
      textColor = "#eab308";
    }

    // Status badge for problematic systems
    let badge = "";
    if (sys.failed) {
      badge = `<span style="font-size: 7px; padding: 1px 4px; background: #ef4444; color: white; border-radius: 2px; font-weight: 700;">${translations.failure}</span>`;
    } else if (pct < 10) {
      badge = `<span style="font-size: 7px; padding: 1px 4px; background: #ef4444; color: white; border-radius: 2px; font-weight: 700;">CRIT</span>`;
    }

    html += `
      <div style="padding: 6px 8px; background: #1a1a24; border-radius: 4px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
          <span style="font-size: 9px; color: #9ca3af;">${systemNames[key] || key}</span>
          ${badge || `<span style="font-size: 10px; color: ${textColor}; font-weight: 600;">${pct}%</span>`}
        </div>
        <div style="background: #374151; border-radius: 2px; height: 4px; overflow: hidden;">
          <div style="width: ${pct}%; height: 100%; background: ${barColor}; transition: width 0.3s;"></div>
        </div>
      </div>
    `;
  });

  html += `</div>`;
  return html;
}

// ═══════════════════════════════════════════════════════════════════════════
// HANGAR AIRCRAFT LIST HTML
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate HTML for aircraft list in hangar
 * Returns HTML string + array of aircraft IDs for event binding
 * CSS classes for event binding:
 * - .hangar-aircraft-item[data-aircraft-id] - Clickable aircraft items
 */
export function renderHangarListHtml(
  aircraft: HangarAircraftItem[],
  selectedId: string | undefined,
  currentSimReg: string,
  filterText: string,
  translations: HangarListTranslations
): string {
  if (aircraft.length === 0) {
    return `
      <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 11px;">
        ${translations.noAircraft}
      </div>
    `;
  }

  // Filter aircraft by registration, type, or airport
  const normalizedFilter = filterText.toLowerCase().trim();
  const filteredAircraft = normalizedFilter
    ? aircraft.filter(ac =>
        (ac.registration?.toLowerCase().includes(normalizedFilter)) ||
        (ac.aircraft_type?.toLowerCase().includes(normalizedFilter)) ||
        (ac.current_airport_ident?.toLowerCase().includes(normalizedFilter))
      )
    : aircraft;

  if (filteredAircraft.length === 0) {
    return `
      <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 11px;">
        ${translations.noMatch}
      </div>
    `;
  }

  // Sort aircraft list - active aircraft first
  const sortedAircraft = [...filteredAircraft].sort((a, b) => {
    const aIsActive = a.registration?.toUpperCase() === currentSimReg;
    const bIsActive = b.registration?.toUpperCase() === currentSimReg;
    if (aIsActive && !bIsActive) return -1;
    if (!aIsActive && bIsActive) return 1;
    return 0;
  });

  return sortedAircraft.map(ac => {
    const isSelected = ac.id === selectedId;
    const isPersonal = ac.owner_type === "personal" || ac.owner_type === "player";
    const isCurrentAircraft = ac.registration?.toUpperCase() === currentSimReg;

    const badgeStyle = isPersonal
      ? "font-size: 8px; padding: 2px 5px; background: #10b981; color: white; border-radius: 3px; font-weight: 600;"
      : "font-size: 8px; padding: 2px 5px; background: #6366f1; color: white; border-radius: 3px; font-weight: 600;";
    const badgeText = isPersonal ? translations.personalBadge : translations.companyBadge;

    // Active aircraft gets green border
    let containerStyle: string;
    if (isSelected && isCurrentAircraft) {
      containerStyle = "padding: 10px; background: rgba(34, 197, 94, 0.15); border: 2px solid #22c55e; border-radius: 6px; cursor: pointer;";
    } else if (isSelected) {
      containerStyle = "padding: 10px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 6px; cursor: pointer;";
    } else if (isCurrentAircraft) {
      containerStyle = "padding: 10px; background: rgba(34, 197, 94, 0.1); border: 1px solid #22c55e; border-radius: 6px; cursor: pointer;";
    } else {
      containerStyle = "padding: 10px; background: #1a1a24; border: 1px solid #374151; border-radius: 6px; cursor: pointer;";
    }

    // Active indicator badge
    const activeIndicator = isCurrentAircraft
      ? `<div style="font-size: 7px; padding: 1px 4px; background: #22c55e; color: white; border-radius: 2px; font-weight: 600; margin-left: 4px;">${translations.active}</div>`
      : "";

    // For sale badge
    const forSaleBadge = ac.for_sale
      ? `<div style="font-size: 7px; padding: 1px 4px; background: #f59e0b; color: #1a1a24; border-radius: 2px; font-weight: 600; margin-left: 4px;">${translations.forSaleBadge}</div>`
      : "";

    // Thumbnail image - use local coui:// images based on icao_type
    const localThumbnailUrl = ac.icao_type
      ? `coui://html_ui/efb_ui/efb_apps/WorldOfAircraft/Assets/aircraft/${ac.icao_type.toUpperCase()}.jpg`
      : "";
    const thumbnailHtml = localThumbnailUrl
      ? `<img src="${localThumbnailUrl}" style="width: 50px; height: 35px; object-fit: cover; border-radius: 4px; margin-right: 8px; flex-shrink: 0;" onerror="this.style.display='none'" />`
      : `<div style="width: 50px; height: 35px; background: #374151; border-radius: 4px; margin-right: 8px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
          <svg style="width: 20px; height: 20px; opacity: 0.5;" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5">
            <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/>
          </svg>
        </div>`;

    return `
      <div class="hangar-aircraft-item" data-aircraft-id="${ac.id}" data-is-active="${isCurrentAircraft}" style="${containerStyle}">
        <div style="display: flex; align-items: center;">
          ${thumbnailHtml}
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px; gap: 4px;">
              <div style="display: flex; align-items: center; flex: 1; min-width: 0; overflow: hidden;">
                <div style="font-size: 11px; font-weight: 600; color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  ${ac.aircraft_type}
                </div>
                ${activeIndicator}${forSaleBadge}
              </div>
              <div style="${badgeStyle} flex-shrink: 0;">
                ${badgeText}
              </div>
            </div>
            <div style="font-size: 10px; color: #6b7280;">
              ${ac.registration || ""}
            </div>
            <div style="font-size: 9px; color: #9ca3af; margin-top: 2px;">
              @ ${ac.current_airport_ident || "N/A"}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

// ═══════════════════════════════════════════════════════════════════════════
// REFUEL POPUP HTML
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate HTML for refuel popup content
 * CSS classes for event binding:
 * - .refuel-close-btn - Close button (X)
 * - .refuel-cancel-btn - Cancel button
 * - .refuel-full-btn - Full tank button
 * - .refuel-confirm-btn - Confirm button
 * - .refuel-slider - Fuel slider input
 */
export function renderRefuelPopupHtml(data: RefuelPopupData): string {
  const { registration, aircraftType, currentFuel, maxFuel, targetFuel, pricePerGallon, translations } = data;

  const fuelToAdd = Math.max(0, targetFuel - currentFuel);
  const cost = fuelToAdd * pricePerGallon;
  const targetPercent = maxFuel > 0 ? Math.round((targetFuel / maxFuel) * 100) : 0;
  const currentPercent = maxFuel > 0 ? Math.round((currentFuel / maxFuel) * 100) : 0;
  const gaugeColor = targetPercent > 50 ? "#22c55e" : targetPercent > 25 ? "#f59e0b" : "#ef4444";

  return `
    <div class="refuel-overlay" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 9999;">
      <div style="background: #1f2937; border: 2px solid #374151; border-radius: 12px; padding: 20px; width: 320px;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <div style="font-size: 18px; font-weight: 700; color: white;">${translations.refuelTitle}</div>
          <button class="refuel-close-btn" style="background: none; border: none; color: #9ca3af; font-size: 24px; cursor: pointer; padding: 0; line-height: 1;">×</button>
        </div>

        <!-- Aircraft Info -->
        <div style="font-size: 14px; color: #9ca3af; margin-bottom: 16px; padding: 10px; background: #374151; border-radius: 8px;">
          <span style="font-weight: 600; color: white;">${registration}</span> - ${aircraftType}
        </div>

        <!-- Fuel Gauge -->
        <div style="margin-bottom: 20px;">
          <div style="font-size: 12px; color: #9ca3af; margin-bottom: 8px;">
            ${translations.currentLevel}: <span style="color: white; font-weight: 600;">${Math.round(currentFuel)} gal</span> (${currentPercent}%)
          </div>
          <div style="height: 20px; background: #374151; border-radius: 10px; overflow: hidden; position: relative;">
            <div style="position: absolute; left: ${currentPercent}%; top: 0; bottom: 0; width: 3px; background: white; z-index: 2;"></div>
            <div style="height: 100%; width: ${targetPercent}%; background: ${gaugeColor}; border-radius: 10px; transition: width 0.1s;"></div>
          </div>
          <div style="display: flex; justify-content: space-between; margin-top: 6px;">
            <span style="font-size: 11px; color: #6b7280;">0 gal</span>
            <span style="font-size: 11px; color: #6b7280;">${Math.round(maxFuel)} gal</span>
          </div>
        </div>

        <!-- Slider -->
        <div style="margin-bottom: 20px;">
          <input type="range" class="refuel-slider" min="${Math.round(currentFuel)}" max="${Math.round(maxFuel)}" value="${Math.round(targetFuel)}"
            style="width: 100%; height: 12px; -webkit-appearance: none; background: #374151; border-radius: 6px; outline: none; cursor: pointer;">
        </div>

        <!-- Target + Cost Row -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding: 12px; background: #374151; border-radius: 8px;">
          <div>
            <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">${translations.target}</div>
            <div style="font-size: 24px; font-weight: 700; color: ${gaugeColor};">${Math.round(targetFuel)} gal</div>
            <div style="font-size: 11px; color: #9ca3af;">+${Math.round(fuelToAdd)} gal ${translations.toAdd}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">${translations.total}</div>
            <div style="font-size: 24px; font-weight: 700; color: #f59e0b;">${formatMoney(cost)}</div>
            <div style="font-size: 11px; color: #9ca3af;">@ ${formatMoney(pricePerGallon)}/gal</div>
          </div>
        </div>

        <!-- Buttons -->
        <div style="display: flex; gap: 10px;">
          <button class="refuel-cancel-btn" style="flex: 1; padding: 14px; background: #374151; color: white; border: none; border-radius: 8px; font-size: 14px; cursor: pointer;">
            ${translations.cancel}
          </button>
          <button class="refuel-full-btn" style="flex: 1; padding: 14px; background: #6366f1; color: white; border: none; border-radius: 8px; font-size: 14px; cursor: pointer;">
            ${translations.full}
          </button>
          <button class="refuel-confirm-btn" style="flex: 1; padding: 14px; background: #22c55e; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">
            ${translations.confirmRefuel}
          </button>
        </div>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEMS POPUP HTML
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate HTML for systems popup overlay
 * CSS classes for event binding:
 * - .systems-close-btn - Close button (X)
 * - .systems-repair-btn - Repair button
 */
export function renderSystemsPopupHtml(data: SystemsPopupData): string {
  const { registration, aircraftType, flightHours, systems, translations } = data;

  // Calculate overall condition
  const avgCondition = systems.reduce((sum, s) => sum + s.value, 0) / systems.length;
  let overallText = translations.good;
  let overallColor = "#22c55e";
  if (avgCondition < 50) {
    overallText = translations.critical;
    overallColor = "#ef4444";
  } else if (avgCondition < 75) {
    overallText = translations.worn;
    overallColor = "#f59e0b";
  }

  const systemsHtml = systems.map(sys => {
    let barColor = "#22c55e";
    if (sys.value < 25) barColor = "#ef4444";
    else if (sys.value < 50) barColor = "#f59e0b";
    else if (sys.value < 75) barColor = "#eab308";

    return `
      <div style="padding: 8px; background: #1a1a24; border-radius: 4px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <span style="font-size: 10px; color: #9ca3af;">${sys.label}</span>
          <span style="font-size: 10px; color: ${barColor}; font-weight: 600;">${sys.value}%</span>
        </div>
        <div style="background: #374151; border-radius: 2px; height: 4px; overflow: hidden;">
          <div style="width: ${sys.value}%; height: 100%; background: ${barColor};"></div>
        </div>
      </div>
    `;
  }).join("");

  return `
    <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 100;">
      <div style="background: #1e1e2e; border-radius: 12px; padding: 16px; max-width: 340px; width: 90%; box-shadow: 0 8px 32px rgba(0,0,0,0.5);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div>
            <div style="font-size: 14px; font-weight: 600; color: white;">${translations.systemsStatus}</div>
            <div style="font-size: 10px; color: #9ca3af;">${registration} • ${aircraftType}</div>
          </div>
          <button class="systems-close-btn" style="background: none; border: none; cursor: pointer; padding: 4px;">
            <svg style="width: 20px; height: 20px;" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div style="display: flex; gap: 12px; margin-bottom: 12px;">
          <div style="flex: 1; background: #252532; border-radius: 8px; padding: 10px; text-align: center;">
            <div style="font-size: 9px; color: #6b7280; margin-bottom: 2px;">${translations.flightHoursShort}</div>
            <div style="font-size: 14px; color: white; font-weight: 600;">${flightHours.toFixed(1)}</div>
          </div>
          <div style="flex: 1; background: #252532; border-radius: 8px; padding: 10px; text-align: center;">
            <div style="font-size: 9px; color: #6b7280; margin-bottom: 2px;">${translations.overallCondition}</div>
            <div style="font-size: 14px; color: ${overallColor}; font-weight: 600;">${overallText}</div>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px;">
          ${systemsHtml}
        </div>

        <button class="systems-repair-btn" style="width: 100%; padding: 10px; background: #f59e0b; color: white; border: none; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer;">
          [FIX] ${translations.repair}
        </button>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
// REPAIR LIST HTML
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate HTML for repair items list in repair popup
 */
export function renderRepairListHtml(
  items: RepairItemData[],
  noRepairNeededText: string,
  loadingText: string
): string {
  if (items.length === 0) {
    return `
      <div style="text-align: center; padding: 16px; color: #22c55e; font-size: 11px;">
        [OK] ${noRepairNeededText}
      </div>
    `;
  }

  return items.map(item => {
    let barColor = "#22c55e";
    if (item.currentCondition < 25) barColor = "#ef4444";
    else if (item.currentCondition < 50) barColor = "#f59e0b";
    else if (item.currentCondition < 75) barColor = "#eab308";

    return `
      <div style="padding: 8px; background: #1a1a24; border-radius: 4px; margin-bottom: 6px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <span style="font-size: 10px; color: white;">${item.label}</span>
          <span style="font-size: 10px; color: #22c55e; font-weight: 600;">$${item.cost.toFixed(0)}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <div style="flex: 1; background: #374151; border-radius: 2px; height: 4px; overflow: hidden;">
            <div style="width: ${item.currentCondition}%; height: 100%; background: ${barColor};"></div>
          </div>
          <span style="font-size: 9px; color: ${barColor};">${item.currentCondition}%</span>
          <span style="font-size: 9px; color: #6b7280;">&gt;</span>
          <span style="font-size: 9px; color: #22c55e;">100%</span>
        </div>
      </div>
    `;
  }).join("");
}
