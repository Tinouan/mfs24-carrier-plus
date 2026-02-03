/**
 * AIEconomyService - Dynamic economy for solo mode
 * Creates a living market with price fluctuations and AI-generated orders
 */

import { DatabaseManager } from "../managers/DatabaseManager";
import type { Item, MarketOrder } from "../managers/DatabaseManager";
import { marketState } from "../state/MarketState";

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
      const tradeableItems = items.filter((i) => i.tier <= 1 && i.category !== "fuel");

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
