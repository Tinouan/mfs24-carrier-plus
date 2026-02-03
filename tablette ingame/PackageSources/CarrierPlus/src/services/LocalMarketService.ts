/**
 * LocalMarketService - Market and inventory for P2P local mode
 * Uses DatabaseManager instead of API calls
 */

import { DatabaseManager } from "../managers/DatabaseManager";
import type {
  InventoryItem as DbInventoryItem,
  MarketOrder,
  Item,
  Company,
  Aircraft,
  AircraftCatalog,
} from "../managers/DatabaseManager";
import type {
  MarketListing,
  AirportInventoryItem,
  CompanyData,
  CompanyMember,
  CompanyFleetItem,
  AirportInventoryResponse,
} from "../types";

// ═══════════════════════════════════════════════════════════
// RESPONSE TYPES
// ═══════════════════════════════════════════════════════════

export interface InventoryItem {
  id: number | string;
  item_type: string;
  item_name: string;
  quantity: number;
  airport_icao: string;
  weight_kg?: number;
  tier?: number;
}

// ═══════════════════════════════════════════════════════════
// LOCAL MARKET SERVICE CLASS
// ═══════════════════════════════════════════════════════════

class LocalMarketServiceClass {
  /**
   * Get player inventory (items owned by player at all locations)
   */
  async getPlayerInventory(): Promise<InventoryItem[]> {
    const player = await DatabaseManager.getPlayer();
    if (!player) throw new Error("No player found");

    // In local mode, player inventory is at "player" location
    const inventory = await DatabaseManager.query<DbInventoryItem>("inventory", "location_type", "player");
    const items = await DatabaseManager.getAll<Item>("items");

    return inventory.map((inv) => {
      const item = items.find((i) => i.id === inv.item_code || i.code === inv.item_code);
      return {
        id: inv.id,
        item_type: inv.item_code,
        item_name: item?.name || inv.item_code,
        quantity: inv.quantity,
        airport_icao: inv.location_id,
        weight_kg: item?.weightKg,
        tier: item?.tier,
      };
    });
  }

  /**
   * Get company inventory (items at company-owned locations)
   */
  async getCompanyInventory(): Promise<InventoryItem[]> {
    const player = await DatabaseManager.getPlayer();
    if (!player) throw new Error("No player found");

    const company = await DatabaseManager.getCompanyByOwner(player.id);
    if (!company) throw new Error("No company found");

    // Get all company aircraft and their cargo
    const aircraft = await DatabaseManager.getAircraftByCompany(company.id);
    const items = await DatabaseManager.getAll<Item>("items");
    const result: InventoryItem[] = [];

    for (const ac of aircraft) {
      const cargo = await DatabaseManager.getInventoryAt("aircraft", ac.id);
      for (const inv of cargo) {
        const item = items.find((i) => i.id === inv.item_code || i.code === inv.item_code);
        result.push({
          id: inv.id,
          item_type: inv.item_code,
          item_name: item?.name || inv.item_code,
          quantity: inv.quantity,
          airport_icao: ac.location_icao,
          weight_kg: item?.weightKg,
          tier: item?.tier,
        });
      }
    }

    return result;
  }

  /**
   * Get inventory at specific airport (simplified list)
   */
  async getAirportInventory(icao: string): Promise<AirportInventoryItem[]> {
    const inventory = await DatabaseManager.getInventoryAt("airport", icao.toUpperCase());
    const items = await DatabaseManager.getAll<Item>("items");

    return inventory.map((inv) => {
      const item = items.find((i) => i.id === inv.item_code || i.code === inv.item_code);
      return {
        item_id: inv.item_code,
        item_name: item?.name || inv.item_code,
        quantity: inv.quantity,
        weight_kg: item?.weightKg || 0,
        location_id: inv.id,
        location_name: icao.toUpperCase(),
      };
    });
  }

  /**
   * Get airport inventory (raw format with containers)
   */
  async getAirportInventoryRaw(icao: string): Promise<AirportInventoryResponse> {
    const inventory = await DatabaseManager.getInventoryAt("airport", icao.toUpperCase());
    const items = await DatabaseManager.getAll<Item>("items");

    // Group by location_id (container)
    const containerMap = new Map<string, DbInventoryItem[]>();
    for (const inv of inventory) {
      const existing = containerMap.get(inv.location_id) || [];
      existing.push(inv);
      containerMap.set(inv.location_id, existing);
    }

    // If no containers, create a default one
    if (containerMap.size === 0) {
      containerMap.set(icao.toUpperCase(), []);
    }

    const containers = Array.from(containerMap.entries()).map(([locId, invItems]) => ({
      id: locId,
      name: `Storage ${locId}`,
      type: "warehouse",
      items: invItems.map((inv) => {
        const item = items.find((i) => i.id === inv.item_code || i.code === inv.item_code);
        return {
          item_id: inv.item_code,
          item_name: item?.name || inv.item_code,
          qty: inv.quantity,
          weight_kg: item?.weightKg || 0,
        };
      }),
    }));

    return { containers };
  }

  /**
   * Get market listings (AI sell orders)
   */
  async getMarketListings(tier?: number | null, limit: number = 100): Promise<MarketListing[]> {
    const orders = await DatabaseManager.getActiveMarketOrders();
    const items = await DatabaseManager.getAll<Item>("items");

    let filtered = orders.filter((o) => o.type === "sell" && o.is_active);

    // Filter by tier if specified
    if (tier !== null && tier !== undefined) {
      filtered = filtered.filter((o) => {
        const item = items.find((i) => i.id === o.item_code || i.code === o.item_code);
        return item?.tier === tier;
      });
    }

    // Limit results
    filtered = filtered.slice(0, limit);

    return filtered.map((o) => {
      const item = items.find((i) => i.id === o.item_code || i.code === o.item_code);
      const sellerId = o.seller_id ?? o.company_id ?? "AI";
      return {
        location_id: o.id, // Use order ID as location_id for buying
        airport_ident: o.icao ?? o.airport_icao ?? "",
        company_id: sellerId,
        company_name: sellerId === "AI" ? "AI Trader" : "Player",
        item_id: o.item_code,
        item_code: item?.code || o.item_code,
        item_name: item?.name || o.item_code,
        item_tier: item?.tier || 0,
        item_icon: item?.icon || null,
        sale_price: o.price_per_unit ?? o.unit_price ?? 0,
        sale_qty: o.quantity,
      };
    });
  }

  /**
   * Buy item from market
   */
  async buyItem(
    locationId: string, // This is actually the order ID in local mode
    itemId: string,
    qty: number,
    payFrom: "player" | "company"
  ): Promise<void> {
    const player = await DatabaseManager.getPlayer();
    if (!player) throw new Error("No player found");

    // Find the market order
    const order = await DatabaseManager.get<MarketOrder>("market_orders", locationId);
    if (!order || !order.is_active) {
      throw new Error("Order not found or no longer active");
    }

    if (order.quantity < qty) {
      throw new Error("Insufficient quantity available");
    }

    const totalCost = (order.price_per_unit ?? order.unit_price ?? 0) * qty;

    // Check and deduct funds
    if (payFrom === "player") {
      if (player.money < totalCost) throw new Error("Insufficient funds");
      player.money -= totalCost;
      await DatabaseManager.savePlayer(player);
    } else {
      const company = await DatabaseManager.getCompanyByOwner(player.id);
      if (!company || company.balance < totalCost) throw new Error("Insufficient company funds");
      company.balance -= totalCost;
      await DatabaseManager.put("company", company);
    }

    // Update order quantity
    if (order.quantity === qty) {
      order.is_active = false;
    }
    order.quantity -= qty;
    await DatabaseManager.put("market_orders", order);

    // Add to buyer's inventory at the airport
    const orderIcao = order.icao ?? order.airport_icao ?? "";
    const existingInventory = await DatabaseManager.getInventoryAt("airport", orderIcao);
    const existing = existingInventory.find((i) => i.item_code === order.item_code);

    if (existing) {
      existing.quantity += qty;
      await DatabaseManager.put("inventory", existing);
    } else {
      const newInv: DbInventoryItem = {
        id: this.generateUUID(),
        location_type: "airport",
        location_id: orderIcao,
        item_code: order.item_code,
        quantity: qty,
      };
      await DatabaseManager.put("inventory", newInv);
    }

    console.log(`[LocalMarketService] Bought ${qty}x ${itemId} for ${totalCost} credits at ${orderIcao}`);
  }

  /**
   * Sell item to market (create sell order)
   */
  async sellItem(
    icao: string,
    itemCode: string,
    qty: number,
    pricePerUnit: number
  ): Promise<void> {
    const player = await DatabaseManager.getPlayer();
    if (!player) throw new Error("No player found");

    // Check player has inventory
    const inventory = await DatabaseManager.getInventoryAt("airport", icao);
    const invItem = inventory.find((i) => i.item_code === itemCode);

    if (!invItem || invItem.quantity < qty) {
      throw new Error("Insufficient inventory");
    }

    // Reduce inventory
    if (invItem.quantity === qty) {
      await DatabaseManager.delete("inventory", invItem.id);
    } else {
      invItem.quantity -= qty;
      await DatabaseManager.put("inventory", invItem);
    }

    // Create sell order
    const order: MarketOrder = {
      id: this.generateUUID(),
      type: "sell",
      item_code: itemCode,
      quantity: qty,
      price_per_unit: pricePerUnit,
      icao: icao,
      seller_id: player.id,
      is_active: true,
      created_at: new Date().toISOString(),
    };

    await DatabaseManager.put("market_orders", order);
    console.log(`[LocalMarketService] Created sell order for ${qty}x ${itemCode} at ${pricePerUnit}/unit`);
  }

  /**
   * Get company info
   */
  async getCompanyInfo(): Promise<CompanyData | null> {
    const player = await DatabaseManager.getPlayer();
    if (!player) return null;

    const company = await DatabaseManager.getCompanyByOwner(player.id);
    if (!company) return null;

    // Get home airport (location of first aircraft)
    const aircraft = await DatabaseManager.getAircraftByCompany(company.id);
    const homeAirport = aircraft[0]?.location_icao || "LFPG";

    return {
      id: company.id,
      name: company.name,
      home_airport_ident: homeAirport,
      balance: company.balance,
      created_at: company.created_at,
    };
  }

  /**
   * Get company members (in local P2P mode, only the player)
   */
  async getCompanyMembers(): Promise<CompanyMember[]> {
    const player = await DatabaseManager.getPlayer();
    if (!player) return [];

    return [
      {
        user_id: player.id,
        username: player.name,
        email: "", // Not stored locally
        role: "owner",
      },
    ];
  }

  /**
   * Get company fleet
   */
  async getCompanyFleet(): Promise<CompanyFleetItem[]> {
    const player = await DatabaseManager.getPlayer();
    if (!player) return [];

    const company = await DatabaseManager.getCompanyByOwner(player.id);
    if (!company) return [];

    const aircraft = await DatabaseManager.getAircraftByCompany(company.id);
    const catalog = await DatabaseManager.getAll<AircraftCatalog>("aircraft_catalog");

    return aircraft.map((ac) => {
      const catEntry = catalog.find((c) => c.icaoType === ac.type_code || c.id === ac.type_code);
      return {
        id: ac.id,
        registration: ac.registration,
        aircraft_type: catEntry?.name || ac.type_code,
        current_airport_ident: ac.location_icao,
        status: ac.condition > 50 ? "operational" : "needs_repair",
      };
    });
  }

  /**
   * Get player balance
   */
  async getPlayerBalance(): Promise<number> {
    const player = await DatabaseManager.getPlayer();
    return player?.money || 0;
  }

  /**
   * Get company balance
   */
  async getCompanyBalance(): Promise<number> {
    const player = await DatabaseManager.getPlayer();
    if (!player) return 0;

    const company = await DatabaseManager.getCompanyByOwner(player.id);
    return company?.balance || 0;
  }

  // ─────────────────────────────────────────────────────────
  // HELPERS
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

export const localMarketService = new LocalMarketServiceClass();
