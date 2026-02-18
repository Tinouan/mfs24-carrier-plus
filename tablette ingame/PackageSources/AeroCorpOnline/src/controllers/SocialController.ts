/**
 * SocialController - Controller for social features (Phase 6)
 * Handles friends, player search, messaging, and CR transfers
 * Online only — in Solo/P2P mode, the view shows an overlay
 */
import { NodeReference } from "@microsoft/msfs-sdk";
import { socialState } from "../state";
import { SocialRouter } from "../services";
import {
  renderFriendsListHtml,
  renderPendingRequestsHtml,
  renderSearchResultsHtml,
  renderConversationsListHtml,
  renderMessagesHtml,
} from "../helpers/SocialRenderHelpers";

// ═══════════════════════════════════════════════════════════
// REFS INTERFACE
// ═══════════════════════════════════════════════════════════

interface SocialRefs {
  friendsList: NodeReference<HTMLDivElement>;
  searchInput: NodeReference<HTMLInputElement>;
  searchResults: NodeReference<HTMLDivElement>;
  pendingRequests: NodeReference<HTMLDivElement>;
  conversationsList: NodeReference<HTMLDivElement>;
  messagesContainer: NodeReference<HTMLDivElement>;
  messageInput: NodeReference<HTMLInputElement>;
}

// ═══════════════════════════════════════════════════════════
// CONTROLLER
// ═══════════════════════════════════════════════════════════

export class SocialController {
  private friendsListRef: NodeReference<HTMLDivElement>;
  private searchInputRef: NodeReference<HTMLInputElement>;
  private searchResultsRef: NodeReference<HTMLDivElement>;
  private pendingRequestsRef: NodeReference<HTMLDivElement>;
  private conversationsListRef: NodeReference<HTMLDivElement>;
  private messagesContainerRef: NodeReference<HTMLDivElement>;
  private messageInputRef: NodeReference<HTMLInputElement>;

  private t: (section: string, key: string) => string;
  private playerId = "";
  private setupInputEventBlocker: (el: HTMLInputElement | null) => void;

  constructor(
    refs: SocialRefs,
    translate: (section: string, key: string) => string,
    callbacks: { setupInputEventBlocker: (el: HTMLInputElement | null) => void }
  ) {
    this.friendsListRef = refs.friendsList;
    this.searchInputRef = refs.searchInput;
    this.searchResultsRef = refs.searchResults;
    this.pendingRequestsRef = refs.pendingRequests;
    this.conversationsListRef = refs.conversationsList;
    this.messagesContainerRef = refs.messagesContainer;
    this.messageInputRef = refs.messageInput;
    this.t = translate;
    this.setupInputEventBlocker = callbacks.setupInputEventBlocker;
  }

  setPlayerId(id: string): void {
    this.playerId = id;
  }

  // ═══════════════════════════════════════════════════════════
  // TRANSLATION HELPER
  // ═══════════════════════════════════════════════════════════

  private getSocialTranslations(): Record<string, string> {
    const st = (key: string, fallback: string): string => {
      try {
        const val = this.t("social", key);
        return val && val !== key ? val : fallback;
      } catch { return fallback; }
    };
    return {
      friends: st("friends", "Friends"),
      online: st("online", "Online"),
      offline: st("offline", "Offline"),
      level: st("level", "Level"),
      addFriend: st("addFriend", "Add Friend"),
      removeFriend: st("removeFriend", "Remove"),
      message: st("message", "Message"),
      accept: st("accept", "Accept"),
      decline: st("decline", "Decline"),
      pendingRequests: st("pendingRequests", "Pending Requests"),
      searchPlayers: st("searchPlayers", "Search Players"),
      search: st("search", "Search"),
      noFriends: st("noFriends", "No friends yet"),
      noResults: st("noResults", "No results"),
      noPending: st("noPending", "No pending requests"),
      conversations: st("conversations", "Conversations"),
      noConversations: st("noConversations", "No conversations"),
      noMessages: st("noMessages", "No messages"),
      send: st("send", "Send"),
      typeMessage: st("typeMessage", "Type a message..."),
      transferCR: st("transferCR", "Transfer CR"),
      onlineOnly: st("onlineOnly", "Available in Online mode"),
    };
  }

  // ═══════════════════════════════════════════════════════════
  // FRIENDS
  // ═══════════════════════════════════════════════════════════

  async fetchFriends(): Promise<void> {
    if (!this.playerId) return;
    socialState.friendsLoading.set(true);
    try {
      const friends = await SocialRouter.getFriends(this.playerId);
      const accepted = friends.filter(f => f.status === "accepted");
      const pending = friends.filter(f => f.status === "pending");
      socialState.friendsList.set(accepted);
      socialState.pendingRequests.set(pending);
      this.renderFriendsList();
      this.renderPendingRequests();
    } catch (e) {
      console.error("[SocialController] fetchFriends error:", e);
    } finally {
      socialState.friendsLoading.set(false);
    }
  }

  async addFriend(friendId: string): Promise<void> {
    try {
      await SocialRouter.addFriend(this.playerId, friendId);
      await this.fetchFriends();
    } catch (e) {
      console.error("[SocialController] addFriend error:", e);
    }
  }

  async removeFriend(friendId: string): Promise<void> {
    try {
      await SocialRouter.removeFriend(friendId);
      await this.fetchFriends();
    } catch (e) {
      console.error("[SocialController] removeFriend error:", e);
    }
  }

  async acceptFriend(friendId: string): Promise<void> {
    try {
      await SocialRouter.acceptFriend(friendId);
      await this.fetchFriends();
    } catch (e) {
      console.error("[SocialController] acceptFriend error:", e);
    }
  }

  async declineFriend(friendId: string): Promise<void> {
    try {
      await SocialRouter.declineFriend(friendId);
      await this.fetchFriends();
    } catch (e) {
      console.error("[SocialController] declineFriend error:", e);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PLAYER SEARCH
  // ═══════════════════════════════════════════════════════════

  async searchPlayers(): Promise<void> {
    const input = this.searchInputRef.getOrDefault();
    const query = input?.value?.trim() || "";
    if (!query || query.length < 2) return;

    socialState.searchLoading.set(true);
    socialState.searchQuery.set(query);
    try {
      const results = await SocialRouter.searchPlayers(query);
      socialState.searchResults.set(results);
      this.renderSearchResults();
    } catch (e) {
      console.error("[SocialController] searchPlayers error:", e);
    } finally {
      socialState.searchLoading.set(false);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // MESSAGING
  // ═══════════════════════════════════════════════════════════

  async fetchConversations(): Promise<void> {
    if (!this.playerId) return;
    socialState.conversationsLoading.set(true);
    try {
      const convos = await SocialRouter.getConversations(this.playerId);
      socialState.conversations.set(convos);
      this.renderConversations();
    } catch (e) {
      console.error("[SocialController] fetchConversations error:", e);
    } finally {
      socialState.conversationsLoading.set(false);
    }
  }

  async openConversation(conversationId: string): Promise<void> {
    socialState.activeConversationId.set(conversationId);
    try {
      const messages = await SocialRouter.getMessages(conversationId);
      socialState.activeConversationMessages.set(messages);
      this.renderMessages();
      this.renderConversations(); // Update active highlight
    } catch (e) {
      console.error("[SocialController] openConversation error:", e);
    }
  }

  async sendMessage(): Promise<void> {
    const input = this.messageInputRef.getOrDefault();
    const content = input?.value?.trim() || "";
    if (!content) return;

    const activeId = socialState.activeConversationId.get();
    if (!activeId) return;

    socialState.messageSending.set(true);
    try {
      await SocialRouter.sendMessage(activeId, content);
      if (input) input.value = "";
      // Refresh messages
      const messages = await SocialRouter.getMessages(activeId);
      socialState.activeConversationMessages.set(messages);
      this.renderMessages();
    } catch (e) {
      console.error("[SocialController] sendMessage error:", e);
    } finally {
      socialState.messageSending.set(false);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER METHODS
  // ═══════════════════════════════════════════════════════════

  private renderFriendsList(): void {
    const el = this.friendsListRef.getOrDefault();
    if (!el) return;
    const friends = socialState.friendsList.get();
    const tr = this.getSocialTranslations();
    el.innerHTML = renderFriendsListHtml(friends, tr);

    // Attach event listeners
    el.querySelectorAll("[data-action='message']").forEach(btn => {
      btn.addEventListener("click", () => {
        const friendId = btn.getAttribute("data-friend-id");
        if (friendId) void this.openConversation(friendId);
      });
    });
    el.querySelectorAll("[data-action='remove']").forEach(btn => {
      btn.addEventListener("click", () => {
        const friendId = btn.getAttribute("data-friend-id");
        if (friendId) void this.removeFriend(friendId);
      });
    });
  }

  private renderPendingRequests(): void {
    const el = this.pendingRequestsRef.getOrDefault();
    if (!el) return;
    const pending = socialState.pendingRequests.get();
    const tr = this.getSocialTranslations();
    el.innerHTML = renderPendingRequestsHtml(pending, tr);

    el.querySelectorAll("[data-action='accept']").forEach(btn => {
      btn.addEventListener("click", () => {
        const friendId = btn.getAttribute("data-friend-id");
        if (friendId) void this.acceptFriend(friendId);
      });
    });
    el.querySelectorAll("[data-action='decline']").forEach(btn => {
      btn.addEventListener("click", () => {
        const friendId = btn.getAttribute("data-friend-id");
        if (friendId) void this.declineFriend(friendId);
      });
    });
  }

  private renderSearchResults(): void {
    const el = this.searchResultsRef.getOrDefault();
    if (!el) return;
    const results = socialState.searchResults.get();
    const tr = this.getSocialTranslations();
    el.innerHTML = renderSearchResultsHtml(results, tr);

    el.querySelectorAll("[data-action='add-friend']").forEach(btn => {
      btn.addEventListener("click", () => {
        const playerId = btn.getAttribute("data-player-id");
        if (playerId) void this.addFriend(playerId);
      });
    });
  }

  private renderConversations(): void {
    const el = this.conversationsListRef.getOrDefault();
    if (!el) return;
    const convos = socialState.conversations.get();
    const activeId = socialState.activeConversationId.get();
    const tr = this.getSocialTranslations();
    el.innerHTML = renderConversationsListHtml(convos, activeId, tr);

    el.querySelectorAll("[data-action='open-conversation']").forEach(btn => {
      btn.addEventListener("click", () => {
        const convoId = btn.getAttribute("data-conversation-id");
        if (convoId) void this.openConversation(convoId);
      });
    });
  }

  private renderMessages(): void {
    const el = this.messagesContainerRef.getOrDefault();
    if (!el) return;
    const messages = socialState.activeConversationMessages.get();
    const tr = this.getSocialTranslations();
    el.innerHTML = renderMessagesHtml(messages, this.playerId, tr);
    // Scroll to bottom
    el.scrollTop = el.scrollHeight;
  }
}
