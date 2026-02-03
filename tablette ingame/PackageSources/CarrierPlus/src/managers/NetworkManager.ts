/**
 * NetworkManager - P2P network state and connection management
 * Handles discovery, connection, and sync with peers
 */

import { DataLayer } from "../services/DataLayer";

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export type NetworkState = "solo" | "connecting" | "client" | "host";

export interface PeerInfo {
  id: string;
  host: string;
  port: number;
  name: string;
  region: string;
  players: number;
  maxPlayers: number;
  ping?: number;
}

export interface NetworkCallbacks {
  onStateChange?: (state: NetworkState) => void;
  onConnected?: (peer: PeerInfo) => void;
  onDisconnected?: (reason: string) => void;
  onSyncReceived?: (data: any) => void;
  onPlayerJoined?: (playerId: string, playerName: string) => void;
  onPlayerLeft?: (playerId: string) => void;
  onError?: (error: Error) => void;
}

interface SyncData {
  timestamp: number;
  type: "full" | "delta";
  data: {
    market_orders?: any[];
    players?: any[];
    aircraft_positions?: any[];
  };
}

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════

const PEERS_JSON_URL = "https://raw.githubusercontent.com/Tinouan/mfs24-carrier-plus/main/peers.json";
const SYNC_INTERVAL_MS = 5000; // 5 seconds
const CONNECTION_TIMEOUT_MS = 10000; // 10 seconds
const PING_INTERVAL_MS = 30000; // 30 seconds

// ═══════════════════════════════════════════════════════════
// NETWORK MANAGER CLASS
// ═══════════════════════════════════════════════════════════

class NetworkManagerClass {
  private state: NetworkState = "solo";
  private callbacks: NetworkCallbacks = {};
  private currentPeer: PeerInfo | null = null;
  private syncInterval: number | null = null;
  private pingInterval: number | null = null;
  private playerId: string | null = null;
  private connectedPlayers: Map<string, string> = new Map(); // id -> name

  // ─────────────────────────────────────────────────────────
  // INITIALIZATION
  // ─────────────────────────────────────────────────────────

  initialize(callbacks: NetworkCallbacks = {}): void {
    this.callbacks = callbacks;
    console.log("[NetworkManager] Initialized");
  }

  setPlayerId(playerId: string): void {
    this.playerId = playerId;
  }

  // ─────────────────────────────────────────────────────────
  // STATE MANAGEMENT
  // ─────────────────────────────────────────────────────────

  getState(): NetworkState {
    return this.state;
  }

  private setState(state: NetworkState): void {
    const oldState = this.state;
    this.state = state;
    console.log(`[NetworkManager] State changed: ${oldState} → ${state}`);
    this.callbacks.onStateChange?.(state);
  }

  getCurrentPeer(): PeerInfo | null {
    return this.currentPeer;
  }

  getConnectedPlayers(): Map<string, string> {
    return new Map(this.connectedPlayers);
  }

  // ─────────────────────────────────────────────────────────
  // PEER DISCOVERY
  // ─────────────────────────────────────────────────────────

  /**
   * Fetch available peers from GitHub
   */
  async discoverPeers(): Promise<PeerInfo[]> {
    try {
      console.log("[NetworkManager] Discovering peers...");

      const response = await fetch(PEERS_JSON_URL, {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const peers: PeerInfo[] = [];

      for (const shard of data.shards || []) {
        if (shard.host === "dynamic") continue; // Skip dynamic hosts

        peers.push({
          id: shard.id,
          host: shard.host,
          port: shard.port || 7777,
          name: shard.name,
          region: shard.region,
          players: 0,
          maxPlayers: 100,
        });
      }

      console.log(`[NetworkManager] Found ${peers.length} peers`);
      return peers;

    } catch (error) {
      console.warn("[NetworkManager] Failed to discover peers:", error);
      return [];
    }
  }

  /**
   * Ping a peer to check availability and get player count
   */
  async pingPeer(peer: PeerInfo): Promise<PeerInfo | null> {
    try {
      const startTime = Date.now();
      const response = await fetch(`http://${peer.host}:${peer.port}/status`, {
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) return null;

      const status = await response.json();
      const ping = Date.now() - startTime;

      return {
        ...peer,
        players: status.players || 0,
        maxPlayers: status.maxPlayers || 100,
        ping,
      };

    } catch {
      return null;
    }
  }

  /**
   * Find the best available peer
   */
  async findBestPeer(): Promise<PeerInfo | null> {
    const peers = await this.discoverPeers();
    if (peers.length === 0) return null;

    // Ping all peers in parallel
    const pingResults = await Promise.all(
      peers.map((p) => this.pingPeer(p))
    );

    // Filter online peers with capacity
    const onlinePeers = pingResults.filter(
      (p): p is PeerInfo => p !== null && p.players < p.maxPlayers
    );

    if (onlinePeers.length === 0) return null;

    // Sort by ping, prefer lower ping
    onlinePeers.sort((a, b) => (a.ping || 9999) - (b.ping || 9999));

    return onlinePeers[0];
  }

  // ─────────────────────────────────────────────────────────
  // CONNECTION
  // ─────────────────────────────────────────────────────────

  /**
   * Attempt to join the multiplayer world
   */
  async joinWorld(): Promise<boolean> {
    if (this.state !== "solo") {
      console.warn("[NetworkManager] Already connected or connecting");
      return false;
    }

    this.setState("connecting");

    try {
      // Find best peer
      const peer = await this.findBestPeer();

      if (!peer) {
        console.log("[NetworkManager] No peers available, staying in solo mode");
        this.setState("solo");
        return false;
      }

      // Connect to peer
      return this.connectToPeer(peer);

    } catch (error) {
      console.error("[NetworkManager] Failed to join world:", error);
      this.callbacks.onError?.(error as Error);
      this.setState("solo");
      return false;
    }
  }

  /**
   * Connect to a specific peer
   */
  async connectToPeer(peer: PeerInfo): Promise<boolean> {
    try {
      console.log(`[NetworkManager] Connecting to ${peer.name} (${peer.host}:${peer.port})...`);

      // Register with peer
      const response = await fetch(`http://${peer.host}:${peer.port}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player_id: this.playerId,
          player_name: "Player", // TODO: Get from player state
        }),
        signal: AbortSignal.timeout(CONNECTION_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`Join failed: HTTP ${response.status}`);
      }

      const result = await response.json();

      // Connected!
      this.currentPeer = peer;
      DataLayer.setNetworkMode({ host: peer.host, port: peer.port, playerId: this.playerId || undefined });
      this.setState("client");
      this.startSync();
      this.startPing();

      console.log(`[NetworkManager] Connected to ${peer.name} with ${peer.players} players`);
      this.callbacks.onConnected?.(peer);

      return true;

    } catch (error) {
      console.error(`[NetworkManager] Failed to connect to peer:`, error);
      this.callbacks.onError?.(error as Error);
      this.setState("solo");
      return false;
    }
  }

  /**
   * Disconnect from current peer
   */
  disconnect(reason: string = "user"): void {
    if (this.state === "solo") return;

    // Stop sync
    this.stopSync();
    this.stopPing();

    // Notify peer we're leaving
    if (this.currentPeer && this.playerId) {
      fetch(`http://${this.currentPeer.host}:${this.currentPeer.port}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_id: this.playerId }),
      }).catch(() => { /* Ignore errors on disconnect */ });
    }

    this.currentPeer = null;
    this.connectedPlayers.clear();
    DataLayer.setLocalMode();
    this.setState("solo");

    console.log(`[NetworkManager] Disconnected: ${reason}`);
    this.callbacks.onDisconnected?.(reason);
  }

  // ─────────────────────────────────────────────────────────
  // SYNCHRONIZATION
  // ─────────────────────────────────────────────────────────

  private startSync(): void {
    if (this.syncInterval) return;

    this.syncInterval = window.setInterval(async () => {
      if (this.state !== "client" || !this.currentPeer) return;

      try {
        const response = await fetch(
          `http://${this.currentPeer.host}:${this.currentPeer.port}/sync`,
          { signal: AbortSignal.timeout(5000) }
        );

        if (!response.ok) {
          throw new Error(`Sync failed: HTTP ${response.status}`);
        }

        const syncData: SyncData = await response.json();
        this.processSyncData(syncData);

      } catch (error) {
        console.warn("[NetworkManager] Sync failed:", error);
        // After 3 consecutive failures, disconnect
        this.disconnect("sync_failed");
      }
    }, SYNC_INTERVAL_MS);

    console.log("[NetworkManager] Sync started");
  }

  private stopSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  private processSyncData(data: SyncData): void {
    // Process received sync data
    // Update local states with remote data

    if (data.data.market_orders) {
      // Update market state
      // marketState.marketListings.set(data.data.market_orders);
    }

    if (data.data.players) {
      // Update connected players
      this.connectedPlayers.clear();
      for (const player of data.data.players) {
        this.connectedPlayers.set(player.id, player.name);
      }
    }

    this.callbacks.onSyncReceived?.(data);
  }

  /**
   * Send local changes to peer
   */
  async sendUpdate(data: any): Promise<boolean> {
    if (this.state !== "client" || !this.currentPeer) {
      return false;
    }

    try {
      const response = await fetch(
        `http://${this.currentPeer.host}:${this.currentPeer.port}/update`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            player_id: this.playerId,
            timestamp: Date.now(),
            data,
          }),
          signal: AbortSignal.timeout(5000),
        }
      );

      return response.ok;

    } catch {
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────
  // PING / KEEPALIVE
  // ─────────────────────────────────────────────────────────

  private startPing(): void {
    if (this.pingInterval) return;

    this.pingInterval = window.setInterval(async () => {
      if (this.state !== "client" || !this.currentPeer) return;

      const updatedPeer = await this.pingPeer(this.currentPeer);

      if (!updatedPeer) {
        console.warn("[NetworkManager] Peer unreachable, disconnecting...");
        this.disconnect("peer_unreachable");
        return;
      }

      // Update peer info
      this.currentPeer = updatedPeer;

    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  // ─────────────────────────────────────────────────────────
  // HOST MODE (PC only)
  // ─────────────────────────────────────────────────────────

  /**
   * Become a host (PC only)
   * Note: Full implementation requires PeerHost service
   */
  async becomeHost(): Promise<boolean> {
    if (this.state !== "solo") {
      console.warn("[NetworkManager] Must be in solo mode to become host");
      return false;
    }

    // Check if we can host (PC only, port available, etc.)
    // This is a placeholder - actual hosting requires PeerHost service

    console.log("[NetworkManager] Host mode not fully implemented");
    // TODO: Start PeerHost, register with seed, etc.

    return false;
  }

  /**
   * Stop hosting
   */
  stopHosting(): void {
    if (this.state !== "host") return;

    // TODO: Stop PeerHost, notify connected clients

    this.setState("solo");
    console.log("[NetworkManager] Stopped hosting");
  }

  // ─────────────────────────────────────────────────────────
  // STATUS
  // ─────────────────────────────────────────────────────────

  /**
   * Get network status summary
   */
  getStatus(): {
    state: NetworkState;
    peer: PeerInfo | null;
    players: number;
    ping: number | null;
  } {
    return {
      state: this.state,
      peer: this.currentPeer,
      players: this.connectedPlayers.size + 1, // +1 for self
      ping: this.currentPeer?.ping || null,
    };
  }
}

// ═══════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════

export const NetworkManager = new NetworkManagerClass();
