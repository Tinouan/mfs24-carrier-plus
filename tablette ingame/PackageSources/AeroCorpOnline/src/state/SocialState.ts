/**
 * SocialState - State management for social features (Phase 6)
 * Friends, messaging, notifications, CR transfers
 */
import { Subject } from "@microsoft/msfs-sdk";
import type { Friend, DirectMessage, PlayerSearchResult, Notification } from "../types";

export const socialState = {
  // Friends
  friendsList: Subject.create<Friend[]>([]),
  friendsLoading: Subject.create<boolean>(false),
  pendingRequests: Subject.create<Friend[]>([]),

  // Search
  searchResults: Subject.create<PlayerSearchResult[]>([]),
  searchLoading: Subject.create<boolean>(false),
  searchQuery: Subject.create<string>(""),

  // Messaging
  conversations: Subject.create<DirectMessage[]>([]),
  conversationsLoading: Subject.create<boolean>(false),
  activeConversationId: Subject.create<string | null>(null),
  activeConversationMessages: Subject.create<DirectMessage[]>([]),
  messageSending: Subject.create<boolean>(false),

  // Notifications
  notifications: Subject.create<Notification[]>([]),
  unreadCount: Subject.create<number>(0),

  // CR Transfer popup
  showTransferPopup: Subject.create<boolean>(false),
  transferTargetPlayer: Subject.create<PlayerSearchResult | null>(null),
};
