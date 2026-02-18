/**
 * CargoRenderHelpers - HTML generation for cargo UI components
 * Pure functions that generate innerHTML strings for cargo panels.
 * Event listeners must be attached by the caller after setting innerHTML.
 */

import { renderItemIcon } from "./RenderHelpers";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface AirportInventoryItem {
  item_id: string;
  location_id: string;
  item_name: string;
  quantity: number;
  weight_kg: number;
  location_name: string;
  owner_type?: "player" | "company";  // V4.1: Ownership tag
  category?: string;                   // V4.1: Item category (e.g. "personnel")
  source?: string;                     // V5.1: Origin ("contract", "market", etc.)
  contract_id?: string;                // V5.1: Linked contract ID
  contract_route?: string;             // V5.1: Contract route "LFPG -> EGLL"
  item_icon?: string;                  // V9: 2-3 letter icon fallback
  item_icon_path?: string;             // V9: SVG icon path
  item_tier?: number;                  // V9: Item tier for icon border color
}

export interface AircraftCargoItem {
  item_id: string;
  item_name: string;
  qty: number;
  weight_kg: number;
  total_weight_kg: number;
  source?: string;                     // V5.1
  contract_id?: string;                // V5.1
  contract_route?: string;             // V5.1
  item_icon?: string;                  // V9
  item_icon_path?: string;             // V9
  item_tier?: number;                  // V9
}

// ═══════════════════════════════════════════════════════════════════════════
// AIRPORT INVENTORY HTML (LEFT PANEL)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate HTML for airport inventory list (items available to load)
 * CSS classes for event binding:
 * - .load-btn[data-id, data-loc, data-name, data-qty, data-weight] - Load button
 */
export function renderAirportInventoryHtml(
  items: AirportInventoryItem[],
  emptyMessage: string
): string {
  if (items.length === 0) {
    return `<div style="color: #9ca3af; font-size: 11px; text-align: center; padding: 16px;">
      ${emptyMessage}
    </div>`;
  }

  return items.map(item => {
    const contractBadge = item.source === "contract"
      ? `<span style="background: rgba(139, 92, 246, 0.25); color: #8b5cf6; font-size: 8px; font-weight: 600; padding: 1px 4px; border-radius: 3px; margin-left: 4px;">CONTRAT</span>`
      : "";
    const contractRoute = item.contract_route
      ? `<div style="font-size: 9px; color: #8b5cf6; margin-top: 1px;">${item.contract_route}</div>`
      : "";
    return `
    <div class="cargo-item" data-id="${item.item_id}" data-loc="${item.location_id}" data-name="${item.item_name}" data-qty="${item.quantity}" data-weight="${item.weight_kg}" style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #1a1a24; border-radius: 6px; margin-bottom: 6px;">
      <div style="flex: 1; display: flex; align-items: center; gap: 8px;">
        ${renderItemIcon(item.item_icon_path, item.item_icon || item.item_id.substring(0, 2).toUpperCase(), item.item_tier || 0, 28)}
        <div>
          <div style="font-size: 12px; color: white; font-weight: 500;">${item.item_name}${contractBadge}</div>
          <div style="font-size: 10px; color: #6b7280;">${item.weight_kg}kg • ${item.location_name}</div>${contractRoute}
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 6px;">
        <span style="font-size: 13px; color: #22c55e; font-weight: 600;">x${item.quantity}</span>
        <button class="load-btn" data-id="${item.item_id}" data-loc="${item.location_id}" data-name="${item.item_name}" data-qty="${item.quantity}" data-weight="${item.weight_kg}" style="background: #3b82f6; color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; display: flex; align-items: center;">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" style="width:14px;height:14px;"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
      </div>
    </div>`;
  }).join("");
}

// ═══════════════════════════════════════════════════════════════════════════
// AIRCRAFT CARGO HTML (RIGHT PANEL)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate HTML for aircraft cargo list (items loaded on aircraft)
 * CSS classes for event binding:
 * - .unload-btn[data-id, data-name, data-qty, data-weight] - Unload button
 */
export function renderAircraftCargoHtml(
  items: AircraftCargoItem[],
  emptyMessage: string
): string {
  if (items.length === 0) {
    return `<div style="color: #9ca3af; font-size: 11px; text-align: center; padding: 16px;">
      ${emptyMessage}
    </div>`;
  }

  return items.map(item => {
    const contractBadge = item.source === "contract"
      ? `<span style="background: rgba(139, 92, 246, 0.25); color: #8b5cf6; font-size: 8px; font-weight: 600; padding: 1px 4px; border-radius: 3px; margin-left: 4px;">CONTRAT</span>`
      : "";
    return `
    <div class="cargo-item" data-id="${item.item_id}" data-name="${item.item_name}" data-qty="${item.qty}" data-weight="${item.weight_kg}" style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #1a1a24; border-radius: 6px; margin-bottom: 6px;">
      <div style="display: flex; align-items: center; gap: 6px;">
        <button class="unload-btn" data-id="${item.item_id}" data-name="${item.item_name}" data-qty="${item.qty}" data-weight="${item.weight_kg}" style="background: #f59e0b; color: #1a1a24; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; display: flex; align-items: center;">
          <svg viewBox="0 0 24 24" fill="none" stroke="#1a1a24" stroke-width="2" style="width:14px;height:14px;"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <span style="font-size: 13px; color: #60a5fa; font-weight: 600;">x${item.qty}</span>
      </div>
      <div style="flex: 1; display: flex; align-items: center; justify-content: flex-end; gap: 8px;">
        <div style="text-align: right;">
          <div style="font-size: 12px; color: white; font-weight: 500;">${item.item_name}${contractBadge}</div>
          <div style="font-size: 10px; color: #6b7280;">${item.total_weight_kg}kg total</div>
        </div>
        ${renderItemIcon(item.item_icon_path, item.item_icon || item.item_id.substring(0, 2).toUpperCase(), item.item_tier || 0, 28)}
      </div>
    </div>`;
  }).join("");
}

// ═══════════════════════════════════════════════════════════════════════════
// V4.1: PASSENGERS HTML (PERSONNEL ITEMS)
// ═══════════════════════════════════════════════════════════════════════════

export interface PassengerItem {
  item_id: string;
  location_id: string;
  item_name: string;
  quantity: number;
  weight_kg: number;
  source?: string;         // V5.1
  contract_route?: string; // V5.1
}

/**
 * Generate HTML for airport passengers list (personnel items available to load)
 * CSS classes for event binding:
 * - .load-pax-btn[data-id, data-loc, data-name, data-qty, data-weight] - Load button
 */
export function renderAirportPassengersHtml(
  items: PassengerItem[],
  emptyMessage: string
): string {
  if (items.length === 0) {
    return `<div style="color: #9ca3af; font-size: 10px; text-align: center; padding: 4px;">
      ${emptyMessage}
    </div>`;
  }

  return items.map(item => {
    const contractBadge = item.source === "contract"
      ? `<span style="background: rgba(139, 92, 246, 0.25); color: #8b5cf6; font-size: 7px; font-weight: 600; padding: 1px 3px; border-radius: 3px; margin-left: 3px;">CONTRAT</span>`
      : "";
    return `
    <div class="pax-item" style="display: flex; justify-content: space-between; align-items: center; padding: 4px 6px; margin-bottom: 4px;">
      <div style="display: flex; align-items: center; gap: 4px;">
        <span style="width: 6px; height: 6px; border-radius: 50%; background: #a855f7; display: inline-block;"></span>
        <span style="font-size: 10px; color: white;">${item.item_name}${contractBadge}</span>
        <span style="font-size: 10px; color: #a855f7; font-weight: 600;">x${item.quantity}</span>
      </div>
      <button class="load-pax-btn" data-id="${item.item_id}" data-loc="${item.location_id}" data-name="${item.item_name}" data-qty="${item.quantity}" data-weight="${item.weight_kg}" style="background: #a855f7; color: white; border: none; border-radius: 4px; padding: 2px 6px; cursor: pointer; display: flex; align-items: center;">
        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" style="width:12px;height:12px;"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </button>
    </div>`;
  }).join("");
}

/**
 * Generate HTML for aircraft passengers list (personnel loaded on aircraft)
 * CSS classes for event binding:
 * - .unload-pax-btn[data-id, data-name, data-qty, data-weight] - Unload button
 */
export function renderAircraftPassengersHtml(
  items: Array<{ item_id: string; item_name: string; qty: number; weight_kg: number; source?: string }>,
  emptyMessage: string
): string {
  if (items.length === 0) {
    return `<div style="color: #9ca3af; font-size: 10px; text-align: center; padding: 4px;">
      ${emptyMessage}
    </div>`;
  }

  return items.map(item => {
    const contractBadge = item.source === "contract"
      ? `<span style="background: rgba(139, 92, 246, 0.25); color: #8b5cf6; font-size: 7px; font-weight: 600; padding: 1px 3px; border-radius: 3px; margin-left: 3px;">CONTRAT</span>`
      : "";
    return `
    <div class="pax-item" style="display: flex; justify-content: space-between; align-items: center; padding: 4px 6px; margin-bottom: 4px;">
      <button class="unload-pax-btn" data-id="${item.item_id}" data-name="${item.item_name}" data-qty="${item.qty}" data-weight="${item.weight_kg}" style="background: #f59e0b; color: #1a1a24; border: none; border-radius: 4px; padding: 2px 6px; cursor: pointer; display: flex; align-items: center;">
        <svg viewBox="0 0 24 24" fill="none" stroke="#1a1a24" stroke-width="2" style="width:12px;height:12px;"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
      </button>
      <div style="display: flex; align-items: center; gap: 4px;">
        <span style="font-size: 10px; color: #a855f7; font-weight: 600;">x${item.qty}</span>
        <span style="font-size: 10px; color: white;">${item.item_name}${contractBadge}</span>
        <span style="width: 6px; height: 6px; border-radius: 50%; background: #a855f7; display: inline-block;"></span>
      </div>
    </div>`;
  }).join("");
}
