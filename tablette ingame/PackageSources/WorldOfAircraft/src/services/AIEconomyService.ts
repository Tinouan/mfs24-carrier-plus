/**
 * AIEconomyService - Dynamic economy for solo mode
 * Creates a living market with price fluctuations and AI-generated orders
 */

import { DatabaseManager } from "../managers/DatabaseManager";
import type { Item, MarketOrder, InventoryItem, SellOrder } from "../managers/DatabaseManager";
import { marketState } from "../state/MarketState";
import { factoryState } from "../state/FactoryState";
import { localMarketService } from "./LocalMarketService";
import { localContractService } from "./LocalContractService";
import { WorkerService } from "./WorkerService";

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface AIEconomyCallbacks {
  onPricesUpdated?: (itemCount: number) => void;
  onOrdersGenerated?: (orderCount: number) => void;
  onMissionsGenerated?: (missionCount: number) => void;
}

interface PriceHistory {
  code: string;
  prices: number[];
  trend: "up" | "down" | "stable";
}

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════

// Price fluctuation config
const PRICE_UPDATE_INTERVAL_SIM_SECONDS = 600; // 10 min sim time
const PRICE_FLUCTUATION_PERCENT = 0.05; // ±5%
const PRICE_MIN_MULTIPLIER = 0.5; // Min 50% of base price
const PRICE_MAX_MULTIPLIER = 2.0; // Max 200% of base price

// Order generation config
const ORDER_GENERATION_INTERVAL_SIM_SECONDS = 1800; // 30 min sim time
const MIN_ORDERS_PER_AIRPORT = 2;
const MAX_ORDERS_PER_AIRPORT = 6;
const ORDER_QUANTITY_MIN = 10;
const ORDER_QUANTITY_MAX = 100;

// V4.1: Personnel spawn config
const PERSONNEL_SPAWN_INTERVAL_SIM_SECONDS = 3600; // 1 hour sim time
const WORKERS_PER_LARGE_AIRPORT = { min: 3, max: 5 };
const WORKERS_PER_MEDIUM_AIRPORT = { min: 2, max: 4 };
const ENGINEERS_PER_LARGE_AIRPORT = { min: 1, max: 2 };

// V4.1: AI buyer config (for player sell orders)
const AI_BUYER_INTERVAL_SIM_SECONDS = 900; // 15 min sim time

// V5: Contract refresh config
const CONTRACT_REFRESH_INTERVAL_SIM_SECONDS = 300; // 5 min sim time
const AI_BUY_BASE_PROBABILITY = 0.15; // 15% base chance per tick
const AI_BUY_PRICE_FACTOR = 0.3; // +30% chance if price is 20% below market

// AI airports (main hubs)
const AI_AIRPORTS = [
  "LFPG", "LFPO", "LFBO", "LFML", "LFSB", "LFLL", "LFMN", "LFBD", "LFRS", "LFRN",
  "EGLL", "EHAM", "EDDF", "LEMD", "LIRF", "LSZH", "EBBR", "LOWW", "EKCH", "ESSA",
];

// ═══════════════════════════════════════════════════════════
// AI ECONOMY SERVICE CLASS
// ═══════════════════════════════════════════════════════════

class AIEconomyServiceClass {
  private callbacks: AIEconomyCallbacks = {};
  private lastPriceUpdate = 0;
  private lastOrderGeneration = 0;
  private lastPersonnelSpawn = 0;  // V4.1: Track personnel spawn time
  private lastAIBuyerTick = 0;  // V4.1: Track AI buyer tick
  private lastContractRefresh = 0;  // V5: Track contract refresh
  private priceHistory: Map<string, PriceHistory> = new Map();
  private isRunning = false;
  private tickInterval: number | null = null;

  // ─────────────────────────────────────────────────────────
  // INITIALIZATION
  // ─────────────────────────────────────────────────────────

  initialize(callbacks: AIEconomyCallbacks = {}): void {
    this.callbacks = callbacks;
    console.log("[AIEconomyService] Initialized");
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log("[AIEconomyService] Started");
  }

  stop(): void {
    this.isRunning = false;
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    console.log("[AIEconomyService] Stopped");
  }

  // ─────────────────────────────────────────────────────────
  // MAIN TICK (called from game loop)
  // ─────────────────────────────────────────────────────────

  /**
   * Called periodically with sim time
   * @param simTimeSeconds Current simulation time in seconds
   */
  tick(simTimeSeconds: number): void {
    if (!this.isRunning) return;

    // Update prices every 10 min sim time
    if (simTimeSeconds - this.lastPriceUpdate >= PRICE_UPDATE_INTERVAL_SIM_SECONDS) {
      this.updatePrices();
      this.lastPriceUpdate = simTimeSeconds;
    }

    // Generate AI orders every 30 min sim time
    if (simTimeSeconds - this.lastOrderGeneration >= ORDER_GENERATION_INTERVAL_SIM_SECONDS) {
      this.generateAIOrders();
      this.lastOrderGeneration = simTimeSeconds;
    }

    // V4.1: Spawn personnel every 1 hour sim time
    if (simTimeSeconds - this.lastPersonnelSpawn >= PERSONNEL_SPAWN_INTERVAL_SIM_SECONDS) {
      this.spawnPersonnel();
      this.lastPersonnelSpawn = simTimeSeconds;
    }

    // V4.1: Process AI buyer for player sell orders every 15 min sim time
    if (simTimeSeconds - this.lastAIBuyerTick >= AI_BUYER_INTERVAL_SIM_SECONDS) {
      this.processAIBuyer();
      this.lastAIBuyerTick = simTimeSeconds;
    }

    // V5: Refresh contracts every 5 min sim time
    if (simTimeSeconds - this.lastContractRefresh >= CONTRACT_REFRESH_INTERVAL_SIM_SECONDS) {
      localContractService.refreshContracts();
      this.lastContractRefresh = simTimeSeconds;
    }
  }

  /**
   * Force an immediate economy update (useful for testing or initial setup)
   */
  async forceUpdate(): Promise<void> {
    await this.updatePrices();
    await this.generateAIOrders();
  }

  // ─────────────────────────────────────────────────────────
  // PRICE FLUCTUATION
  // ─────────────────────────────────────────────────────────

  private async updatePrices(): Promise<void> {
    try {
      const items = await DatabaseManager.getAll<Item>("items");
      let updatedCount = 0;

      for (const item of items) {
        // Calculate new price with random fluctuation
        const fluctuation = (Math.random() - 0.5) * 2 * PRICE_FLUCTUATION_PERCENT;
        let newPrice = item.base_price * (1 + fluctuation);

        // Apply market trend (items have memory)
        const history = this.priceHistory.get(item.code);
        if (history) {
          // Trend momentum: if going up, slightly more likely to continue
          if (history.trend === "up" && Math.random() > 0.4) {
            newPrice *= 1.02;
          } else if (history.trend === "down" && Math.random() > 0.4) {
            newPrice *= 0.98;
          }
        }

        // Clamp to min/max
        const originalBase = this.getOriginalBasePrice(item.code) || item.base_price;
        newPrice = Math.max(originalBase * PRICE_MIN_MULTIPLIER, newPrice);
        newPrice = Math.min(originalBase * PRICE_MAX_MULTIPLIER, newPrice);

        // Round to 2 decimals
        newPrice = Math.round(newPrice * 100) / 100;

        // Update trend history
        this.updatePriceHistory(item.code, newPrice, item.base_price);

        // Save updated price
        item.base_price = newPrice;
        await DatabaseManager.put("items", item, false);
        updatedCount++;
      }

      console.log(`[AIEconomyService] Updated ${updatedCount} item prices`);
      this.callbacks.onPricesUpdated?.(updatedCount);

    } catch (error) {
      console.error("[AIEconomyService] Failed to update prices:", error);
    }
  }

  private updatePriceHistory(code: string, newPrice: number, oldPrice: number): void {
    let history = this.priceHistory.get(code);

    if (!history) {
      history = { code, prices: [], trend: "stable" };
      this.priceHistory.set(code, history);
    }

    // Keep last 10 prices
    history.prices.push(newPrice);
    if (history.prices.length > 10) {
      history.prices.shift();
    }

    // Determine trend
    if (history.prices.length >= 3) {
      const recent = history.prices.slice(-3);
      const isRising = recent[2] > recent[1] && recent[1] > recent[0];
      const isFalling = recent[2] < recent[1] && recent[1] < recent[0];

      history.trend = isRising ? "up" : isFalling ? "down" : "stable";
    }
  }

  private getOriginalBasePrice(code: string): number | undefined {
    // Original prices from seed data (hardcoded for reference)
    const originalPrices: Record<string, number> = {
      "FUEL_AVGAS": 2.5,
      "FUEL_JETA": 2.0,
      "CARGO_MAIL": 50,
      "CARGO_PACKAGE": 100,
      "CARGO_PERISHABLE": 200,
      "CARGO_FRAGILE": 250,
      "CARGO_HAZMAT": 500,
      "CARGO_MEDICAL": 300,
      "CARGO_LUXURY": 800,
      "PARTS_ENGINE": 5000,
      "PARTS_AVIONICS": 3000,
      "PARTS_LANDING_GEAR": 4000,
      "PARTS_PROPELLER": 2500,
      "PARTS_ELECTRICAL": 1500,
    };
    return originalPrices[code];
  }

  // ─────────────────────────────────────────────────────────
  // AI ORDER GENERATION
  // ─────────────────────────────────────────────────────────

  private async generateAIOrders(): Promise<void> {
    try {
      // Remove old AI orders
      const existingOrders = await DatabaseManager.getAll<MarketOrder>("market_orders");
      const oldAIOrders = existingOrders.filter((o) => o.seller_id === "AI" && o.is_active);

      for (const order of oldAIOrders) {
        order.is_active = false;
        await DatabaseManager.put("market_orders", order, false);
      }

      // Get items for orders (exclude high-tier parts initially)
      const items = await DatabaseManager.getAll<Item>("items");
      const tradeableItems = items.filter((i) => i.tier === 0);

      let totalOrders = 0;

      // Generate orders for each AI airport
      for (const airport of AI_AIRPORTS) {
        const numOrders = MIN_ORDERS_PER_AIRPORT + Math.floor(Math.random() * (MAX_ORDERS_PER_AIRPORT - MIN_ORDERS_PER_AIRPORT + 1));

        for (let i = 0; i < numOrders; i++) {
          // Pick random item
          const item = tradeableItems[Math.floor(Math.random() * tradeableItems.length)];
          if (!item) continue;

          // Generate quantity
          const quantity = ORDER_QUANTITY_MIN + Math.floor(Math.random() * (ORDER_QUANTITY_MAX - ORDER_QUANTITY_MIN + 1));

          // Price variation based on supply/demand simulation
          const supplyFactor = 0.85 + Math.random() * 0.3; // 85% - 115% of base
          const price = Math.round(item.base_price * supplyFactor * 100) / 100;

          // Create order
          const order: MarketOrder = {
            id: this.generateUUID(),
            type: "sell",
            item_code: item.code,
            quantity,
            price_per_unit: price,
            icao: airport,
            seller_id: "AI",
            is_active: true,
            created_at: new Date().toISOString(),
          };

          await DatabaseManager.put("market_orders", order, false);
          totalOrders++;
        }
      }

      // Refresh market state
      const allActiveOrders = await DatabaseManager.getActiveMarketOrders();
      const listings = allActiveOrders.map((o) => ({
        id: o.id,
        type: o.type,
        item_code: o.item_code,
        quantity: o.quantity,
        price_per_unit: o.price_per_unit,
        icao: o.icao,
        seller_id: o.seller_id,
        is_ai: o.seller_id === "AI",
      }));
      marketState.marketListings.set(listings as any);

      console.log(`[AIEconomyService] Generated ${totalOrders} AI orders across ${AI_AIRPORTS.length} airports`);
      this.callbacks.onOrdersGenerated?.(totalOrders);

    } catch (error) {
      console.error("[AIEconomyService] Failed to generate AI orders:", error);
    }
  }

  // ─────────────────────────────────────────────────────────
  // V4.1: PERSONNEL SPAWNING
  // ─────────────────────────────────────────────────────────

  /**
   * Phase 9: Spawn worker market orders at large airports
   * Workers available ONLY at large_airport
   * 3-5 workers per airport, nationality based on region
   * Price = country_worker_stats.worker_buy_price
   */
  private async spawnPersonnel(): Promise<void> {
    try {
      if (!WorkerService.isReady()) {
        console.log("[AIEconomyService] WorkerService not ready, skipping personnel spawn");
        return;
      }

      // Remove old AI worker market orders
      const existingOrders = await DatabaseManager.getAll<MarketOrder>("market_orders");
      const oldWorkerOrders = existingOrders.filter(
        o => o.seller_id === "AI" && o.is_active && (o.item_code === "worker" || o.item_code === "engineer")
      );
      for (const order of oldWorkerOrders) {
        order.is_active = false;
        await DatabaseManager.put("market_orders", order, false);
      }

      const airports = DatabaseManager.getAirportsCache();
      if (airports.length === 0) {
        console.log("[AIEconomyService] No airports in cache, skipping personnel spawn");
        return;
      }

      // Only spawn at large airports
      const largeAirports = airports.filter(a => a.type === "large_airport");
      let workersSpawned = 0;

      for (const airport of largeAirports.slice(0, 20)) {
        const workerCount = WORKERS_PER_LARGE_AIRPORT.min +
          Math.floor(Math.random() * (WORKERS_PER_LARGE_AIRPORT.max - WORKERS_PER_LARGE_AIRPORT.min + 1));

        // Pick country codes appropriate for the airport's region
        const countryCodes = WorkerService.pickCountriesForAirport(airport.ident, workerCount);

        for (const countryCode of countryCodes) {
          const stats = WorkerService.getCountryStats(countryCode);
          if (!stats) continue;

          // Create a market order for this worker
          const order: MarketOrder = {
            id: this.generateUUID(),
            type: "sell",
            item_code: "worker",
            quantity: 1,
            price_per_unit: stats.worker_buy_price,
            icao: airport.ident,
            seller_id: "AI",
            is_active: true,
            created_at: new Date().toISOString(),
            // Store country code in the order for worker generation at purchase
            metadata: countryCode,
          };

          await DatabaseManager.put("market_orders", order, false);
          workersSpawned++;
        }
      }

      console.log(`[AIEconomyService] Spawned ${workersSpawned} worker market orders at large airports`);
    } catch (error) {
      console.error("[AIEconomyService] Failed to spawn personnel:", error);
    }
  }

  /**
   * Force spawn personnel (for testing or initial setup)
   */
  async forceSpawnPersonnel(): Promise<void> {
    await this.spawnPersonnel();
  }

  // ─────────────────────────────────────────────────────────
  // V4.1: AI BUYER (for player sell orders)
  // ─────────────────────────────────────────────────────────

  /**
   * Process player sell orders and potentially buy them
   * Probability increases if price is below market value
   */
  private async processAIBuyer(): Promise<void> {
    try {
      // Get all active player sell orders
      const allOrders = await DatabaseManager.getActiveSellOrders();
      const playerOrders = allOrders.filter(o => o.seller_id !== "AI" && o.status === "active");

      if (playerOrders.length === 0) {
        return;
      }

      let purchasedCount = 0;

      for (const order of playerOrders) {
        // Calculate buy probability based on price
        const marketPrice = await this.getMarketPriceForItem(order.item_id);
        const priceRatio = marketPrice > 0 ? order.price_per_unit / marketPrice : 1;

        // Base probability + bonus if price is below market
        let buyProbability = AI_BUY_BASE_PROBABILITY;
        if (priceRatio < 0.8) {
          // Price is 20%+ below market: significant bonus
          buyProbability += AI_BUY_PRICE_FACTOR * (1 - priceRatio);
        } else if (priceRatio > 1.2) {
          // Price is 20%+ above market: reduce probability
          buyProbability *= 0.5;
        }

        // Roll the dice
        if (Math.random() < buyProbability) {
          try {
            await localMarketService.fulfillSellOrder(order.id, "AI_BUYER");
            purchasedCount++;
            console.log(`[AIEconomyService] AI bought ${order.quantity}x ${order.item_name} for ${order.total_price} CR`);
          } catch (error) {
            console.error(`[AIEconomyService] Failed to buy order ${order.id}:`, error);
          }
        }
      }

      if (purchasedCount > 0) {
        console.log(`[AIEconomyService] AI purchased ${purchasedCount} player sell orders`);
      }
    } catch (error) {
      console.error("[AIEconomyService] Failed to process AI buyer:", error);
    }
  }

  /**
   * Get average market price for an item (from AI market orders)
   */
  private async getMarketPriceForItem(itemId: string): Promise<number> {
    try {
      // Try to get from items table first
      const item = await DatabaseManager.get<Item>("items", itemId);
      if (item) {
        return item.base_price;
      }

      // Fallback: check market orders for this item
      const orders = await DatabaseManager.getActiveMarketOrders();
      const itemOrders = orders.filter(o => o.item_code === itemId);

      if (itemOrders.length === 0) {
        return 0;
      }

      const totalPrice = itemOrders.reduce((sum, o) => sum + (o.price_per_unit ?? o.unit_price ?? 0), 0);
      return totalPrice / itemOrders.length;
    } catch {
      return 0;
    }
  }

  /**
   * Force AI buyer to run immediately (for testing)
   */
  async forceAIBuyer(): Promise<void> {
    await this.processAIBuyer();
  }

  // ─────────────────────────────────────────────────────────
  // DYNAMIC MISSIONS (Future feature)
  // ─────────────────────────────────────────────────────────

  /**
   * Generate dynamic cargo missions based on market supply/demand
   * TODO: Implement when mission system is integrated with DataLayer
   */
  async generateDynamicMissions(): Promise<void> {
    // Future: analyze market orders to find supply/demand imbalances
    // Generate missions that transport goods from surplus to deficit areas

    console.log("[AIEconomyService] Dynamic missions not yet implemented");
    this.callbacks.onMissionsGenerated?.(0);
  }

  // ─────────────────────────────────────────────────────────
  // MARKET ANALYSIS
  // ─────────────────────────────────────────────────────────

  /**
   * Get price trend for an item
   */
  getPriceTrend(itemCode: string): "up" | "down" | "stable" {
    return this.priceHistory.get(itemCode)?.trend || "stable";
  }

  /**
   * Get best buy price for an item across all airports
   */
  async getBestBuyPrice(itemCode: string): Promise<{ icao: string; price: number } | null> {
    const orders = await DatabaseManager.getMarketOrdersByItem(itemCode);
    const sellOrders = orders.filter((o) => o.type === "sell" && o.is_active);

    if (sellOrders.length === 0) return null;

    const best = sellOrders.reduce((prev, curr) =>
      (curr.price_per_unit ?? 0) < (prev.price_per_unit ?? 0) ? curr : prev
    );

    return { icao: best.icao ?? best.airport_icao ?? "", price: best.price_per_unit ?? best.unit_price ?? 0 };
  }

  /**
   * Get market statistics
   */
  async getMarketStats(): Promise<{
    totalOrders: number;
    aiOrders: number;
    playerOrders: number;
    airports: number;
    totalValue: number;
  }> {
    const orders = await DatabaseManager.getActiveMarketOrders();
    const aiOrders = orders.filter((o) => o.seller_id === "AI");
    const playerOrders = orders.filter((o) => o.seller_id !== "AI");
    const airports = new Set(orders.map((o) => o.icao)).size;
    const totalValue = orders.reduce((sum, o) => sum + (o.price_per_unit ?? o.unit_price ?? 0) * o.quantity, 0);

    return {
      totalOrders: orders.length,
      aiOrders: aiOrders.length,
      playerOrders: playerOrders.length,
      airports,
      totalValue: Math.round(totalValue),
    };
  }

  // ─────────────────────────────────────────────────────────
  // UTILITIES
  // ─────────────────────────────────────────────────────────

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

export const AIEconomyService = new AIEconomyServiceClass();
