/**
 * LocalSocialService - Social service for Solo/P2P mode
 * Returns empty results since social features require Online mode
 */
import type { Friend, DirectMessage, PlayerSearchResult } from "../types";

export class LocalSocialService {
  // Friends — Solo: always empty
  static async getFriends(_playerId: string): Promise<Friend[]> { return []; }
  static async searchPlayers(_query: string): Promise<PlayerSearchResult[]> { return []; }
  static async addFriend(_playerId: string, _friendId: string): Promise<void> { }
  static async removeFriend(_friendId: string): Promise<void> { }
  static async acceptFriend(_friendId: string): Promise<void> { }
  static async declineFriend(_friendId: string): Promise<void> { }

  // Messages — Solo: always empty
  static async getConversations(_playerId: string): Promise<DirectMessage[]> { return []; }
  static async getMessages(_conversationId: string): Promise<DirectMessage[]> { return []; }
  static async sendMessage(_to: string, _content: string): Promise<void> { }

  // Transfer CR — Solo: not available
  static async transferCR(_fromId: string, _toId: string, _amount: number): Promise<void> {
    throw new Error("CR transfer not available in Solo mode");
  }
}
