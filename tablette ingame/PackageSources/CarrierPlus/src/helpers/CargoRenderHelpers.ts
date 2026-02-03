/**
 * CargoRenderHelpers - HTML generation for cargo UI components
 * Pure functions that generate innerHTML strings for cargo panels.
 * Event listeners must be attached by the caller after setting innerHTML.
 */

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
}

export interface AircraftCargoItem {
  item_id: string;
  item_name: string;
  qty: number;
  weight_kg: number;
  total_weight_kg: number;
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

  return items.map(item => `
    <div class="cargo-item" data-id="${item.item_id}" data-loc="${item.location_id}" data-name="${item.item_name}" data-qty="${item.quantity}" data-weight="${item.weight_kg}" style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #1a1a24; border-radius: 6px; margin-bottom: 6px;">
      <div style="flex: 1;">
        <div style="font-size: 12px; color: white; font-weight: 500;">${item.item_name}</div>
        <div style="font-size: 10px; color: #6b7280;">${item.weight_kg}kg • ${item.location_name}</div>
      </div>
      <div style="display: flex; align-items: center; gap: 6px;">
        <span style="font-size: 13px; color: #22c55e; font-weight: 600;">x${item.quantity}</span>
        <button class="load-btn" data-id="${item.item_id}" data-loc="${item.location_id}" data-name="${item.item_name}" data-qty="${item.quantity}" data-weight="${item.weight_kg}" style="background: #3b82f6; color: white; border: none; border-radius: 4px; padding: 4px 8px; font-size: 10px; cursor: pointer;">
          →
        </button>
      </div>
    </div>
  `).join("");
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

  return items.map(item => `
    <div class="cargo-item" data-id="${item.item_id}" data-name="${item.item_name}" data-qty="${item.qty}" data-weight="${item.weight_kg}" style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #1a1a24; border-radius: 6px; margin-bottom: 6px;">
      <div style="display: flex; align-items: center; gap: 6px;">
        <button class="unload-btn" data-id="${item.item_id}" data-name="${item.item_name}" data-qty="${item.qty}" data-weight="${item.weight_kg}" style="background: #f59e0b; color: #1a1a24; border: none; border-radius: 4px; padding: 4px 8px; font-size: 10px; cursor: pointer;">
          ←
        </button>
        <span style="font-size: 13px; color: #60a5fa; font-weight: 600;">x${item.qty}</span>
      </div>
      <div style="flex: 1; text-align: right;">
        <div style="font-size: 12px; color: white; font-weight: 500;">${item.item_name}</div>
        <div style="font-size: 10px; color: #6b7280;">${item.total_weight_kg}kg total</div>
      </div>
    </div>
  `).join("");
}
