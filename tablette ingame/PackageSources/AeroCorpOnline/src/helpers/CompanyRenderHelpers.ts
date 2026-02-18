/**
 * CompanyRenderHelpers - HTML generation for Company messaging UI
 * Uses inline styles only (Coherent GT constraint)
 */

import type { CompanyMessage } from "../types";

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface CompanyMessagesTranslations {
  pinned: string;
  noMessages: string;
}

// ═══════════════════════════════════════════════════════════
// MESSAGING
// ═══════════════════════════════════════════════════════════

/**
 * Render company messages list HTML
 * CSS classes for event binding:
 * - .pin-message-btn - Pin/unpin button (data-message-id)
 */
export function renderCompanyMessagesHtml(
  messages: CompanyMessage[],
  canPin: boolean,
  translations: CompanyMessagesTranslations
): string {
  if (messages.length === 0) {
    return `<div style="color: #6b7280; font-size: 11px; text-align: center; padding: 24px;">${translations.noMessages}</div>`;
  }

  // Separate pinned messages
  const pinned = messages.filter(m => m.is_pinned);
  const regular = messages.filter(m => !m.is_pinned);

  let html = "";

  // Pinned messages section
  if (pinned.length > 0) {
    html += `<div style="margin-bottom: 8px;">`;
    html += `<div style="font-size: 10px; color: #f59e0b; text-transform: uppercase; font-weight: 600; margin-bottom: 4px; padding: 0 4px;">📌 ${translations.pinned}</div>`;
    for (const msg of pinned) {
      html += renderSingleMessage(msg, canPin, true);
    }
    html += `</div>`;
  }

  // Regular messages
  for (const msg of regular) {
    html += renderSingleMessage(msg, canPin, false);
  }

  return html;
}

function renderSingleMessage(msg: CompanyMessage, canPin: boolean, isPinned: boolean): string {
  const time = new Date(msg.created_at);
  const timeStr = `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;
  const dateStr = `${String(time.getDate()).padStart(2, "0")}/${String(time.getMonth() + 1).padStart(2, "0")}`;

  const bgColor = isPinned ? "#1a1a2e" : "#1a1a24";
  const borderLeft = isPinned ? "border-left: 2px solid #f59e0b;" : "";
  const nameColor = msg.is_system ? "#6b7280" : "#60a5fa";
  const contentStyle = msg.is_system ? "font-style: italic; color: #9ca3af;" : "color: #e5e7eb;";

  const pinBtn = canPin ? `
    <button class="pin-message-btn" data-message-id="${msg.id}" style="background: none; border: none; color: ${isPinned ? "#f59e0b" : "#4b5563"}; cursor: pointer; font-size: 10px; padding: 2px 4px;">📌</button>
  ` : "";

  return `
    <div style="background: ${bgColor}; ${borderLeft} border-radius: 6px; padding: 8px; margin-bottom: 4px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
        <span style="font-size: 11px; color: ${nameColor}; font-weight: 600;">${msg.sender_name}</span>
        <div style="display: flex; align-items: center; gap: 4px;">
          <span style="font-size: 9px; color: #6b7280;">${dateStr} ${timeStr}</span>
          ${pinBtn}
        </div>
      </div>
      <div style="font-size: 11px; ${contentStyle}">${msg.content}</div>
    </div>
  `;
}
