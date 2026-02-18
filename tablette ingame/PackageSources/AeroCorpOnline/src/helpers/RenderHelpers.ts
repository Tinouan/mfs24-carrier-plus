/**
 * RenderHelpers - DOM rendering helper functions
 * Pure functions that generate HTML strings for dynamic UI updates
 */

import { getRoleBadgeColor, getRoleLabel } from "./CompanyPermissions";
import { formatMoney } from "./PlayerHelpers";
import { ITEM_ICON_MAP } from "../data/itemIconMap";

// ═══════════════════════════════════════════════════════════
// ITEM ICON RENDERING
// ═══════════════════════════════════════════════════════════

const TIER_BORDER_COLORS: Record<number, string> = {
  0: "#d1d5db",  // White/Gray — Raw
  1: "#22c55e",  // Green — Common
  2: "#3b82f6",  // Blue — Advanced
  3: "#a855f7",  // Purple — Rare
  4: "#f59e0b",  // Orange — Epic
  5: "#ef4444",  // Red — Legendary
};

/**
 * Render an item icon (inline SVG with tier border, or letter fallback)
 * ITEM_ICON_MAP values are raw SVG strings (loaded via svg-text-loader plugin).
 * We strip the XML header, resize, and inject inline — no data URLs, no <img> tags.
 */
export function renderItemIcon(iconPath: string | undefined, icon: string, tier: number, size: number = 32): string {
  const borderColor = TIER_BORDER_COLORS[tier] || "#d1d5db";
  const rawSvg = iconPath ? ITEM_ICON_MAP[iconPath] : undefined;
  if (rawSvg) {
    const innerSize = size - 4;
    let svg = rawSvg.replace(/<\?xml[^?]*\?>\s*/, "");
    svg = svg.replace(/width="\d+"/, `width="${innerSize}"`);
    svg = svg.replace(/height="\d+"/, `height="${innerSize}"`);
    return `<span style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border:2px solid ${borderColor};border-radius:6px;overflow:hidden;background:#1a1a2e;flex-shrink:0;">${svg}</span>`;
  }
  return `<span style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border:2px solid ${borderColor};border-radius:6px;font-size:${Math.round(size * 0.35)}px;font-weight:bold;color:${borderColor};background:#1a1a2e;flex-shrink:0;">${icon}</span>`;
}

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface NearbyAirportItem {
  icao: string;
  name: string;
  distance_nm: number;
}

export interface InventoryItemDisplay {
  item_type: string;
  airport_icao: string;
  quantity: number;
}

export interface AircraftListItem {
  id: string;
  registration: string | null;
  aircraft_type: string;
  cargo_capacity_kg: number;
  aircraft_model?: string | null;
}

export interface MarketListingItem {
  location_id: string;
  airport_ident: string;
  company_name: string;
  item_id: string;
  item_code: string;
  item_name: string;
  item_tier: number;
  item_icon?: string | null;
  item_icon_path?: string;
  sale_price: number;
  sale_qty: number;
}

export interface CompanyMemberItem {
  user_id: string;
  username: string;
  role: string;
}

export interface CompanyFleetItem {
  registration: string | null;
  aircraft_type: string;
  current_airport_ident: string | null;
  status: string;
}

// ═══════════════════════════════════════════════════════════
// RENDER FUNCTIONS
// ═══════════════════════════════════════════════════════════

/**
 * Render airports list HTML
 */
export function renderAirportsListHtml(
  airports: NearbyAirportItem[],
  emptyMessage: string
): string {
  if (airports.length === 0) {
    return `<div style="color: #9ca3af; font-size: 10px; text-align: center; padding: 8px;">${emptyMessage}</div>`;
  }

  return airports.map(airport => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px solid #374151;">
      <div style="display: flex; flex-direction: column; overflow: hidden;">
        <span style="font-family: monospace; color: #60a5fa; font-weight: 600; font-size: 11px;">${airport.icao}</span>
        <span style="color: #6b7280; font-size: 9px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100px;">${airport.name}</span>
      </div>
      <div style="text-align: right; flex-shrink: 0;">
        <span style="font-family: monospace; color: #f59e0b; font-size: 10px;">${airport.distance_nm.toFixed(1)}</span>
        <span style="color: #6b7280; font-size: 8px;">nm</span>
      </div>
    </div>
  `).join("");
}

/**
 * Render inventory list HTML
 */
export function renderInventoryListHtml(
  items: InventoryItemDisplay[],
  emptyMessage: string,
  storedAtLabel: string,
  unitsLabel: string
): string {
  if (items.length === 0) {
    return `<div style="color: #9ca3af; font-size: 12px; text-align: center; padding: 16px;">${emptyMessage}</div>`;
  }

  return items.map(item => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #374151;">
      <div style="display: flex; flex-direction: column;">
        <span style="color: white; font-weight: 500; font-size: 13px;">${item.item_type}</span>
        <span style="color: #6b7280; font-size: 10px;">
          ${storedAtLabel}: <span style="font-family: monospace; color: #60a5fa;">${item.airport_icao}</span>
        </span>
      </div>
      <div style="text-align: right;">
        <span style="font-family: monospace; color: #22c55e; font-size: 16px; font-weight: 600;">${item.quantity}</span>
        <span style="color: #6b7280; font-size: 10px; margin-left: 4px;">${unitsLabel}</span>
      </div>
    </div>
  `).join("");
}

/**
 * Render market listings HTML
 */
export function renderMarketListingsHtml(
  listings: MarketListingItem[],
  emptyMessage: string,
  availableLabel: string
): string {
  if (listings.length === 0) {
    return `
      <div style="background: #252532; border-radius: 12px; padding: 24px; text-align: center;">
        <svg style="width: 40px; height: 40px; margin-bottom: 12px; opacity: 0.4;" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.5">
          <path d="M12 2v20"/>
          <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
        </svg>
        <div style="color: #6b7280; font-size: 12px;">${emptyMessage}</div>
      </div>
    `;
  }

  const tierColors: Record<number, string> = {
    0: "#6b7280", 1: "#22c55e", 2: "#3b82f6", 3: "#a855f7", 4: "#f59e0b", 5: "#ef4444"
  };

  return listings.map(item => {
    const tierColor = tierColors[item.item_tier] || "#6b7280";
    return `
      <div class="market-listing-item" data-location-id="${item.location_id}" data-item-id="${item.item_id}"
           style="background: #252532; border-radius: 8px; padding: 12px; margin-bottom: 8px; cursor: pointer; transition: background 0.2s;"
           onmouseover="this.style.background='#2d2d3d'" onmouseout="this.style.background='#252532'">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div style="flex: 1; display: flex; align-items: center; gap: 10px;">
            ${renderItemIcon(item.item_icon_path, item.item_icon || item.item_code.substring(0, 2).toUpperCase(), item.item_tier, 36)}
            <div>
              <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                <span style="font-size: 9px; padding: 2px 6px; border-radius: 4px; background: ${tierColor}20; color: ${tierColor}; font-weight: 600;">T${item.item_tier}</span>
                <span style="font-size: 13px; font-weight: 600; color: white;">${item.item_name}</span>
              </div>
              <div style="font-size: 10px; color: #6b7280;">
                @ <span style="color: #60a5fa;">${item.airport_ident}</span> • ${item.company_name}
              </div>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 14px; font-weight: 700; color: #22c55e;">${formatMoney(item.sale_price)}</div>
            <div style="font-size: 10px; color: #6b7280;">${item.sale_qty} ${availableLabel}</div>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

/**
 * Render company members list HTML
 * CSS classes for event binding:
 * - .role-select - Role change dropdown (data-user-id, value)
 */
export function renderCompanyMembersHtml(
  members: CompanyMemberItem[],
  emptyMessage: string,
  currentUserId?: string,
  isSoloMode?: boolean
): string {
  if (members.length === 0) {
    return `<div style="color: #6b7280; font-size: 11px; text-align: center; padding: 16px;">${emptyMessage}</div>`;
  }

  const isCeo = members.some(m => m.user_id === currentUserId && (m.role === "ceo" || m.role === "owner"));

  return members.map(m => {
    const badgeColor = getRoleBadgeColor(m.role);
    const badgeLabel = getRoleLabel(m.role);
    const isSelf = m.user_id === currentUserId;

    let roleHtml: string;
    if (isCeo && !isSelf && !isSoloMode) {
      roleHtml = `
        <select class="role-select" data-user-id="${m.user_id}" style="background: #0d0d14; color: ${badgeColor}; border: 1px solid ${badgeColor}40; border-radius: 4px; font-size: 10px; padding: 2px 4px; text-transform: uppercase; cursor: pointer;">
          <option value="officer" ${m.role === "officer" ? 'selected' : ''} style="color: #3b82f6;">OFFICER</option>
          <option value="pilot" ${m.role === "pilot" ? 'selected' : ''} style="color: #22c55e;">PILOT</option>
          <option value="recruit" ${m.role === "recruit" ? 'selected' : ''} style="color: #6b7280;">RECRUIT</option>
        </select>`;
    } else {
      roleHtml = `<span style="font-size: 10px; color: ${badgeColor}; background: ${badgeColor}20; padding: 2px 8px; border-radius: 4px; text-transform: uppercase; font-weight: 600;">${badgeLabel}</span>`;
    }

    return `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #1a1a24; border-radius: 6px; margin-bottom: 6px;">
      <span style="font-size: 12px; color: white;">${m.username}${isSelf ? ' <span style="color: #6b7280; font-size: 10px;">(vous)</span>' : ''}</span>
      ${roleHtml}
    </div>`;
  }).join("");
}

/**
 * Render company fleet list HTML
 */
export function renderCompanyFleetHtml(
  fleet: CompanyFleetItem[],
  emptyMessage: string
): string {
  if (fleet.length === 0) {
    return `<div style="color: #6b7280; font-size: 11px; text-align: center; padding: 16px;">${emptyMessage}</div>`;
  }

  return fleet.map(a => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #1a1a24; border-radius: 6px; margin-bottom: 6px;">
      <div>
        <div style="font-size: 12px; color: white; font-weight: 500;">${a.registration || "N/A"}</div>
        <div style="font-size: 10px; color: #6b7280;">${a.aircraft_type}</div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 11px; color: #60a5fa;">${a.current_airport_ident || "?"}</div>
        <div style="font-size: 9px; color: ${a.status === "parked" ? "#22c55e" : a.status === "in_flight" ? "#f59e0b" : "#6b7280"};">${a.status}</div>
      </div>
    </div>
  `).join("");
}
