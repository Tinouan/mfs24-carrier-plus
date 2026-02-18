/**
 * NetworkState - Gestion du statut de connexion et des actions en attente
 *
 * Permet le fonctionnement hybride online/offline:
 * - Détection du statut de connexion
 * - Queue des actions pour sync ultérieure
 * - Persistence locale des actions en attente
 */

import { Subject } from "@microsoft/msfs-sdk";

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export type ConnectionStatus = "connecting" | "online" | "offline" | "syncing";

export interface OfflineAction {
  id: string;
  type: "mission_complete" | "refuel" | "market_sell" | "market_buy";
  timestamp: number;
  data: Record<string, unknown>;
}

export interface SyncResult {
  success: boolean;
  synced: number;
  failed: number;
  errors: string[];
}

// ═══════════════════════════════════════════════════════════
// NETWORK STATE CLASS
// ═══════════════════════════════════════════════════════════

class NetworkStateClass {
  // Connection status (reactive)
  status = Subject.create<ConnectionStatus>("connecting");

  // Pending actions queue (reactive)
  pendingActions = Subject.create<OfflineAction[]>([]);

  // localStorage key for persistence
  private PENDING_KEY = "aco_pending_actions";

  // ═══════════════════════════════════════════════════════════
  // STATUS MANAGEMENT
  // ═══════════════════════════════════════════════════════════

  setOnline(): void {
    this.status.set("online");
    console.log("[NetworkState] Status: ONLINE");
  }

  setOffline(): void {
    this.status.set("offline");
    console.log("[NetworkState] Status: OFFLINE");
  }

  setSyncing(): void {
    this.status.set("syncing");
    console.log("[NetworkState] Status: SYNCING");
  }

  setConnecting(): void {
    this.status.set("connecting");
    console.log("[NetworkState] Status: CONNECTING");
  }

  isOnline(): boolean {
    return this.status.get() === "online";
  }

  isOffline(): boolean {
    return this.status.get() === "offline";
  }

  isSyncing(): boolean {
    return this.status.get() === "syncing";
  }

  getStatus(): ConnectionStatus {
    return this.status.get();
  }

  // ═══════════════════════════════════════════════════════════
  // PENDING ACTIONS QUEUE
  // ═══════════════════════════════════════════════════════════

  /**
   * Queue an action for later sync with SEED
   */
  queueAction(action: Omit<OfflineAction, "id" | "timestamp">): void {
    const newAction: OfflineAction = {
      ...action,
      id: this.generateUUID(),
      timestamp: Date.now(),
    };

    const current = this.pendingActions.get();
    this.pendingActions.set([...current, newAction]);
    this.savePendingActions();

    console.log(`[NetworkState] Queued action: ${action.type} (${current.length + 1} pending)`);
  }

  /**
   * Remove a specific action from the queue (after successful sync)
   */
  removeAction(actionId: string): void {
    const current = this.pendingActions.get();
    const filtered = current.filter(a => a.id !== actionId);
    this.pendingActions.set(filtered);
    this.savePendingActions();
  }

  /**
   * Clear all pending actions
   * PASSE 7: Migrated from localStorage to NativePersistence (MSFS GetStoredData/SetStoredData)
   */
  clearPendingActions(): void {
    this.pendingActions.set([]);
    try { localStorage.removeItem(this.PENDING_KEY); } catch (e) { /* ignore */ }
    try {
      if (typeof SetStoredData === "function") {
        SetStoredData(this.PENDING_KEY, "");
      }
    } catch (e) {
      console.warn("[NetworkState] Could not clear native storage:", e);
    }
    console.log("[NetworkState] Cleared all pending actions");
  }

  /**
   * Get number of pending actions
   */
  getPendingCount(): number {
    return this.pendingActions.get().length;
  }

  /**
   * Check if there are pending actions
   */
  hasPendingActions(): boolean {
    return this.pendingActions.get().length > 0;
  }

  // ═══════════════════════════════════════════════════════════
  // PERSISTENCE
  // ═══════════════════════════════════════════════════════════

  /**
   * Save pending actions to localStorage (fallback) + native storage (MSFS persistent)
   */
  private savePendingActions(): void {
    const data = JSON.stringify(this.pendingActions.get());

    // localStorage fallback
    try {
      localStorage.setItem(this.PENDING_KEY, data);
    } catch (e) { /* ignore */ }

    // Native storage (primary)
    try {
      if (typeof SetStoredData === "function") {
        SetStoredData(this.PENDING_KEY, data);
      }
    } catch (e) {
      console.warn("[NetworkState] Could not save to native storage:", e);
    }
  }

  /**
   * Load pending actions from native storage (call on app init)
   * Falls back to localStorage if native APIs fail
   */
  loadPendingActions(): void {
    // Try native storage first
    try {
      if (typeof GetStoredData === "function") {
        const saved = GetStoredData(this.PENDING_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as OfflineAction[];
          this.pendingActions.set(parsed);
          console.log(`[NetworkState] Loaded ${parsed.length} pending actions from native storage`);
          return;
        }
      }
    } catch (e) {
      console.warn("[NetworkState] Could not load from native storage:", e);
    }

    // Fallback to localStorage
    try {
      const saved = localStorage.getItem(this.PENDING_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as OfflineAction[];
        this.pendingActions.set(parsed);
        console.log(`[NetworkState] Loaded ${parsed.length} pending actions from localStorage fallback`);
      }
    } catch (e) {
      console.warn("[NetworkState] localStorage fallback also failed:", e);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // UTILS
  // ═══════════════════════════════════════════════════════════

  private generateUUID(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}

// ═══════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════

export const NetworkState = new NetworkStateClass();

// Global MSFS declarations in src/types/msfs-globals.d.ts
