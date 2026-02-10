/**
 * SocialRenderHelpers - HTML rendering for social UI (Phase 6)
 * Friends list, pending requests, search results, conversations, messages
 */
import type { Friend, DirectMessage, PlayerSearchResult } from "../types";

// ═══════════════════════════════════════════════════════════
// FRIENDS LIST
// ═══════════════════════════════════════════════════════════

export function renderFriendsListHtml(
  friends: Friend[],
  tr: Record<string, string>
): string {
  if (friends.length === 0) {
    return `<div style="text-align: center; padding: 24px; color: #6b7280; font-size: 12px;">${tr.noFriends}</div>`;
  }

  return friends.map(f => `
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: #1a1a24; border-radius: 8px; margin-bottom: 6px;">
      <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;">
        <div style="width: 8px; height: 8px; border-radius: 50%; background: #374151; flex-shrink: 0;"></div>
        <div style="min-width: 0;">
          <div style="font-size: 13px; color: white; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(f.friend_name)}</div>
          <div style="font-size: 10px; color: #6b7280;">${tr.level} ${f.friend_level} • ${escapeHtml(f.friend_nationality)}</div>
        </div>
      </div>
      <div style="display: flex; gap: 6px; flex-shrink: 0;">
        <button data-action="message" data-friend-id="${f.friend_id}" style="background: #3b82f6; color: white; border: none; border-radius: 6px; padding: 4px 10px; font-size: 11px; cursor: pointer;">${tr.message}</button>
        <button data-action="remove" data-friend-id="${f.friend_id}" style="background: #374151; color: #9ca3af; border: none; border-radius: 6px; padding: 4px 10px; font-size: 11px; cursor: pointer;">${tr.removeFriend}</button>
      </div>
    </div>
  `).join("");
}

// ═══════════════════════════════════════════════════════════
// PENDING REQUESTS
// ═══════════════════════════════════════════════════════════

export function renderPendingRequestsHtml(
  pending: Friend[],
  tr: Record<string, string>
): string {
  if (pending.length === 0) {
    return `<div style="text-align: center; padding: 12px; color: #6b7280; font-size: 11px;">${tr.noPending}</div>`;
  }

  return `
    <div style="font-size: 12px; color: #f59e0b; font-weight: 600; margin-bottom: 8px;">${tr.pendingRequests} (${pending.length})</div>
    ${pending.map(f => `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: #1a1a24; border-radius: 8px; margin-bottom: 4px; border: 1px solid #f59e0b33;">
        <div style="min-width: 0;">
          <div style="font-size: 12px; color: white; font-weight: 600;">${escapeHtml(f.friend_name)}</div>
          <div style="font-size: 10px; color: #6b7280;">${tr.level} ${f.friend_level}</div>
        </div>
        <div style="display: flex; gap: 6px; flex-shrink: 0;">
          <button data-action="accept" data-friend-id="${f.id}" style="background: #22c55e; color: white; border: none; border-radius: 6px; padding: 4px 10px; font-size: 11px; cursor: pointer;">${tr.accept}</button>
          <button data-action="decline" data-friend-id="${f.id}" style="background: #ef4444; color: white; border: none; border-radius: 6px; padding: 4px 10px; font-size: 11px; cursor: pointer;">${tr.decline}</button>
        </div>
      </div>
    `).join("")}
  `;
}

// ═══════════════════════════════════════════════════════════
// SEARCH RESULTS
// ═══════════════════════════════════════════════════════════

export function renderSearchResultsHtml(
  results: PlayerSearchResult[],
  tr: Record<string, string>
): string {
  if (results.length === 0) {
    return `<div style="text-align: center; padding: 12px; color: #6b7280; font-size: 11px;">${tr.noResults}</div>`;
  }

  return results.map(p => `
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: #1a1a24; border-radius: 8px; margin-bottom: 4px;">
      <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
        <div style="width: 8px; height: 8px; border-radius: 50%; background: ${p.is_online ? "#22c55e" : "#374151"}; flex-shrink: 0;"></div>
        <div style="min-width: 0;">
          <div style="font-size: 12px; color: white; font-weight: 600;">${escapeHtml(p.name)}</div>
          <div style="font-size: 10px; color: #6b7280;">${tr.level} ${p.level} • ${escapeHtml(p.current_airport)}</div>
        </div>
      </div>
      ${p.is_friend
        ? `<span style="font-size: 10px; color: #22c55e;">${tr.friends}</span>`
        : `<button data-action="add-friend" data-player-id="${p.id}" style="background: #3b82f6; color: white; border: none; border-radius: 6px; padding: 4px 10px; font-size: 11px; cursor: pointer;">${tr.addFriend}</button>`
      }
    </div>
  `).join("");
}

// ═══════════════════════════════════════════════════════════
// CONVERSATIONS LIST
// ═══════════════════════════════════════════════════════════

export function renderConversationsListHtml(
  conversations: DirectMessage[],
  activeId: string | null,
  tr: Record<string, string>
): string {
  if (conversations.length === 0) {
    return `<div style="text-align: center; padding: 24px; color: #6b7280; font-size: 12px;">${tr.noConversations}</div>`;
  }

  // Group by conversation partner (use sender_id or recipient_id as conversation key)
  const convoMap = new Map<string, DirectMessage>();
  for (const msg of conversations) {
    const key = msg.sender_id;
    const existing = convoMap.get(key);
    if (!existing || msg.created_at > existing.created_at) {
      convoMap.set(key, msg);
    }
  }

  return Array.from(convoMap.entries()).map(([id, msg]) => {
    const isActive = activeId === id;
    const bgColor = isActive ? "#252540" : "#1a1a24";
    const borderStyle = isActive ? "border: 1px solid #3b82f6;" : "border: 1px solid transparent;";
    const unreadDot = !msg.read ? `<div style="width: 6px; height: 6px; border-radius: 50%; background: #3b82f6; flex-shrink: 0;"></div>` : "";

    return `
      <div data-action="open-conversation" data-conversation-id="${id}" style="display: flex; align-items: center; gap: 10px; padding: 10px; background: ${bgColor}; border-radius: 8px; margin-bottom: 4px; cursor: pointer; ${borderStyle}">
        <div style="flex: 1; min-width: 0;">
          <div style="font-size: 12px; color: white; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(msg.sender_name)}</div>
          <div style="font-size: 10px; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(msg.content)}</div>
        </div>
        ${unreadDot}
      </div>
    `;
  }).join("");
}

// ═══════════════════════════════════════════════════════════
// MESSAGES
// ═══════════════════════════════════════════════════════════

export function renderMessagesHtml(
  messages: DirectMessage[],
  myPlayerId: string,
  tr: Record<string, string>
): string {
  if (messages.length === 0) {
    return `<div style="text-align: center; padding: 24px; color: #6b7280; font-size: 12px;">${tr.noMessages}</div>`;
  }

  return messages.map(msg => {
    const isMine = msg.sender_id === myPlayerId;
    const align = isMine ? "flex-end" : "flex-start";
    const bgColor = isMine ? "#3b82f6" : "#252540";
    const textColor = isMine ? "white" : "#e5e7eb";
    const time = formatTime(msg.created_at);

    if (msg.type === "system") {
      return `<div style="text-align: center; padding: 4px; font-size: 10px; color: #6b7280; font-style: italic;">${escapeHtml(msg.content)}</div>`;
    }

    if (msg.type === "cr_transfer") {
      const amount = msg.metadata?.amount || 0;
      return `
        <div style="display: flex; justify-content: center; padding: 6px;">
          <div style="background: #22c55e20; border: 1px solid #22c55e44; border-radius: 8px; padding: 8px 14px; text-align: center;">
            <div style="font-size: 11px; color: #22c55e; font-weight: 600;">${tr.transferCR}: ${amount} CR</div>
            <div style="font-size: 10px; color: #6b7280;">${escapeHtml(msg.sender_name)} → ${escapeHtml(msg.recipient_name)}</div>
          </div>
        </div>
      `;
    }

    return `
      <div style="display: flex; justify-content: ${align}; margin-bottom: 6px;">
        <div style="max-width: 75%; background: ${bgColor}; border-radius: 10px; padding: 8px 12px;">
          ${!isMine ? `<div style="font-size: 10px; color: #9ca3af; margin-bottom: 2px;">${escapeHtml(msg.sender_name)}</div>` : ""}
          <div style="font-size: 12px; color: ${textColor}; word-break: break-word;">${escapeHtml(msg.content)}</div>
          <div style="font-size: 9px; color: #6b728080; text-align: right; margin-top: 2px;">${time}</div>
        </div>
      </div>
    `;
  }).join("");
}

// ═══════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  } catch {
    return "";
  }
}
