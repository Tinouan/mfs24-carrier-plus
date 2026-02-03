/**
 * HangarRenderHelpers - HTML generation for hangar components
 * Pure functions that generate innerHTML strings for hangar UI.
 * Event listeners must be attached by the caller after setting innerHTML.
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface HangarCargoItem {
  item_name: string;
  qty: number;
  total_weight_kg: number;
  tier: number;
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
  owner_type: string;
}

export interface HangarListTranslations {
  noAircraft: string;
  noMatch: string;
  personalBadge: string;
  companyBadge: string;
  active: string;
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
    return `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #374151;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="width: 6px; height: 6px; border-radius: 50%; background: ${tierColor};"></span>
          <span style="font-size: 11px; color: white;">${item.item_name}</span>
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
  html += `<div style="display: grid; grid-template-columns: 1fr; gap: 6px;">`;

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

    // Thumbnail image - use local coui:// images based on icao_type
    const localThumbnailUrl = ac.icao_type
      ? `coui://html_ui/efb_ui/efb_apps/CarrierPlus/Assets/aircraft/${ac.icao_type.toUpperCase()}.jpg`
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
                ${activeIndicator}
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
