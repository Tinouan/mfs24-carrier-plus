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
  AircraftSystemsInline,
  SellOrder,
} from "../managers/DatabaseManager";
import type {
  MarketListing,
  AirportInventoryItem,
  CompanyData,
  CompanyMember,
  CompanyFleetItem,
  AirportInventoryResponse,
} from "../types";
import { SyncService } from "./SyncService";
import { WorkerService } from "./WorkerService";
import { factoryState } from "../state/FactoryState";

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
  source?: string;  // V5.1: Origin ("contract", "market", etc.)
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

    // Player inventory = personal storage ("player" location) + airport items owned by player
    // Personnel items (worker, engineer, pilot…) are company-only and excluded here
    const PERSONNEL_CODES = new Set(["worker", "engineer", "pilot", "copilot", "passenger"]);
    const personalItems = await DatabaseManager.query<DbInventoryItem>("inventory", "location_type", "player");
    const allInventory = await DatabaseManager.getAll<DbInventoryItem>("inventory");
    const playerAirportItems = allInventory.filter(
      (inv) => inv.location_type === "airport"
        && (inv.owner_type === "player" || !inv.owner_type)
        && !PERSONNEL_CODES.has(inv.item_code)
    );
    const inventory = [...personalItems, ...playerAirportItems];
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
        source: inv.source,
      };
    });
  }

  /**
   * Get company inventory (items at airports + aircraft cargo)
   */
  async getCompanyInventory(): Promise<InventoryItem[]> {
    const player = await DatabaseManager.getPlayer();
    if (!player) throw new Error("No player found");

    const company = await DatabaseManager.getCompanyByOwner(player.id);
    if (!company) throw new Error("No company found");

    const items = await DatabaseManager.getAll<Item>("items");
    const result: InventoryItem[] = [];

    // Get company-owned inventory at airports
    // Personnel items (worker, engineer, pilot…) always belong to company
    const PERSONNEL_CODES = new Set(["worker", "engineer", "pilot", "copilot", "passenger"]);
    const allInventory = await DatabaseManager.getAll<DbInventoryItem>("inventory");
    const airportInventory = allInventory.filter(
      (inv) => inv.location_type === "airport"
        && (inv.owner_type === "company" || PERSONNEL_CODES.has(inv.item_code))
    );

    for (const inv of airportInventory) {
      const item = items.find((i) => i.id === inv.item_code || i.code === inv.item_code);
      result.push({
        id: inv.id,
        item_type: inv.item_code,
        item_name: item?.name || inv.item_code,
        quantity: inv.quantity,
        airport_icao: inv.location_id,
        weight_kg: item?.weightKg,
        tier: item?.tier,
        source: inv.source,
      });
    }

    // Get all company aircraft cargo
    const aircraft = await DatabaseManager.getAircraftByCompany(company.id);
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
          owner_type: (inv.owner_type as "player" | "company") || "company",
          source: inv.source,
          contract_id: inv.contract_id,
        };
      }),
    }));

    // Add workers/engineers from workers table as personnel items
    const allWorkers = factoryState.workers.get();
    const workersAtAirport = allWorkers.filter(
      w => w.airport_ident === icao.toUpperCase() && w.status === "available"
    );
    if (workersAtAirport.length > 0) {
      const personnelByType = new Map<string, number>();
      for (const w of workersAtAirport) {
        const key = w.item_id; // "worker" or "engineer"
        personnelByType.set(key, (personnelByType.get(key) || 0) + 1);
      }
      const personnelItems = Array.from(personnelByType.entries()).map(([itemId, qty]) => {
        const item = items.find((i) => i.id === itemId || i.code === itemId);
        return {
          item_id: itemId,
          item_name: item?.name || itemId,
          qty,
          weight_kg: item?.weightKg || 80,
          owner_type: "company" as const,
          source: "personnel",
        };
      });
      // Add to the first container or create a personnel container
      if (containers.length > 0) {
        containers[0].items.push(...personnelItems);
      } else {
        containers.push({
          id: icao.toUpperCase(),
          name: `Storage ${icao.toUpperCase()}`,
          type: "warehouse",
          items: personnelItems,
        });
      }
    }

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
        item_icon_path: item?.icon_path,
        sale_price: o.price_per_unit ?? o.unit_price ?? 0,
        sale_qty: o.quantity,
      };
    });
  }

  /**
   * Buy item from market
   *
   * Note: locationId format determines the source:
   * - "seed_xxx" = SEED server order (uses SyncService.buyMarketOrder for anti-cheat)
   * - other = local order (uses local database only)
   */
  async buyItem(
    locationId: string, // This is actually the order ID in local mode
    itemId: string,
    qty: number,
    payFrom: "player" | "company"
  ): Promise<void> {
    const player = await DatabaseManager.getPlayer();
    if (!player) throw new Error("No player found");

    // ═══════════════════════════════════════════════════════════
    // SEED ORDER: Use SyncService.buyMarketOrder (anti-cheat compliant)
    // SEED calculates and deducts money server-side
    //
    // NOTE [PASSE 6]: This direct SyncService call is intentional.
    // LocalMarketService handles BOTH local orders (Solo mode) AND SEED orders
    // (Online mode). When a SEED order is detected (seed_ prefix), we route
    // directly to SyncService to ensure anti-cheat compliance.
    // ServiceAdapter is NOT used here because this IS the routing logic.
    // ═══════════════════════════════════════════════════════════
    if (locationId.startsWith("seed_") && SyncService.isConnected()) {
      const seedOrderId = locationId.replace("seed_", "");
      console.log(`[LocalMarketService] SEED order detected, using SyncService.buyMarketOrder(${seedOrderId})`);

      const buyerId = payFrom === "player" ? player.id : (await DatabaseManager.getCompanyByOwner(player.id))?.id;
      if (!buyerId) throw new Error("No buyer ID found");

      const success = await SyncService.buyMarketOrder(seedOrderId, buyerId, qty);
      if (!success) {
        throw new Error("SEED purchase failed - check server logs");
      }

      // Reload player data from SEED to get updated balance
      const updatedPlayer = await SyncService.getPlayer();
      if (updatedPlayer) {
        player.money = updatedPlayer.money;
        player.xp = updatedPlayer.xp;
        await DatabaseManager.savePlayer(player);
        console.log(`[LocalMarketService] Player balance updated from SEED: ${player.money}`);
      }

      // Save to native persistence (survives MSFS restarts)
      await DatabaseManager.forceSave();
      console.log(`[LocalMarketService] Bought ${qty}x ${itemId} via SEED`);
      return;
    }

    // ═══════════════════════════════════════════════════════════
    // LOCAL ORDER: Process locally (offline or local market)
    // ═══════════════════════════════════════════════════════════

    // Find the market order
    const order = await DatabaseManager.get<MarketOrder>("market_orders", locationId);
    if (!order || !order.is_active) {
      throw new Error("Order not found or no longer active");
    }

    if (order.quantity < qty) {
      throw new Error("Insufficient quantity available");
    }

    const totalCost = (order.price_per_unit ?? order.unit_price ?? 0) * qty;

    // Check and deduct funds locally
    const orderIcao = order.icao ?? order.airport_icao ?? "";
    const itemName = order.item_name ?? order.item_code;
    if (payFrom === "player") {
      if (player.money < totalCost) throw new Error("Insufficient funds");
      player.money -= totalCost;
      player.money = Math.round(player.money);
      await DatabaseManager.savePlayer(player);

      // V4.1: Log transaction
      await DatabaseManager.saveTransaction({
        timestamp: new Date().toISOString(),
        type: "market_buy",
        amount: -totalCost,
        balance_after: player.money,
        wallet: "player",
        description: `${itemName} x${qty} @ ${orderIcao}`,
        related_id: order.id,
        airport_icao: orderIcao,
      });
    } else {
      const company = await DatabaseManager.getCompanyByOwner(player.id);
      if (!company || company.balance < totalCost) throw new Error("Insufficient company funds");
      company.balance -= totalCost;
      company.balance = Math.round(company.balance);
      await DatabaseManager.put("company", company);

      // V4.1: Log transaction
      await DatabaseManager.saveTransaction({
        timestamp: new Date().toISOString(),
        type: "market_buy",
        amount: -totalCost,
        balance_after: company.balance,
        wallet: "company",
        description: `${itemName} x${qty} @ ${orderIcao}`,
        related_id: order.id,
        airport_icao: orderIcao,
      });
    }

    // Update order quantity
    if (order.quantity === qty) {
      order.is_active = false;
    }
    order.quantity -= qty;
    await DatabaseManager.put("market_orders", order);

    // Phase 9: Worker purchase — create WorkerInstance instead of regular inventory
    if (order.item_code === "worker" || order.item_code === "engineer") {
      const countryCode = order.metadata || "FR"; // Fallback to FR
      const ownerId = payFrom === "company"
        ? (await DatabaseManager.getCompanyByOwner(player.id))?.id || player.id
        : player.id;

      for (let i = 0; i < qty; i++) {
        const worker = WorkerService.generateWorker(
          countryCode,
          orderIcao,
          payFrom === "company" ? "company" : "personal",
          ownerId
        );
        if (order.item_code === "engineer") {
          worker.item_id = "engineer";
        }
        await DatabaseManager.put("workers", worker, false);

        // Update reactive state
        const current = factoryState.workers.get();
        factoryState.workers.set([...current, worker]);
      }
      console.log(`[LocalMarketService] Created ${qty} ${order.item_code}(s) from ${countryCode} at ${orderIcao}`);
    } else {
      // Regular item — add to inventory at the airport with correct owner_type
      const locationType: "airport" = "airport";
      const ownerType: "player" | "company" = payFrom;
      const existingInventory = await DatabaseManager.getInventoryAt(locationType, orderIcao);
      const existing = existingInventory.find(
        (i) => i.item_code === order.item_code && (i.owner_type || "player") === ownerType
      );

      if (existing) {
        existing.quantity += qty;
        await DatabaseManager.put("inventory", existing);
        console.log(`[LocalMarketService] Updated existing inventory: ${existing.id} now has ${existing.quantity} of ${order.item_code} (owner: ${ownerType})`);
      } else {
        const newInv: DbInventoryItem = {
          id: this.generateUUID(),
          location_type: locationType,
          location_id: orderIcao,
          item_code: order.item_code,
          quantity: qty,
          owner_type: ownerType,
        };
        await DatabaseManager.put("inventory", newInv);
        console.log(`[LocalMarketService] Created new inventory: ${newInv.id} with ${qty}x ${order.item_code} at ${orderIcao} (owner: ${ownerType})`);
      }
    }

    console.log(`[LocalMarketService] Bought ${qty}x ${itemId} for ${totalCost} credits at ${orderIcao} (local)`);

    // Save to native persistence (survives MSFS restarts)
    await DatabaseManager.forceSave();
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

    // Force immediate save to native persistence
    try {
      await DatabaseManager.forceSave();
    } catch (e) {
      console.warn("[LocalMarketService] Failed to force native save:", e);
    }
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
        role: "ceo",
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
  // V4: PLAYER ↔ COMPANY TRANSFERS
  // ─────────────────────────────────────────────────────────

  async transferToCompany(amount: number): Promise<void> {
    const player = await DatabaseManager.getPlayer();
    if (!player) throw new Error("No player found");
    if (amount <= 0) throw new Error("Amount must be positive");
    if (player.money < amount) throw new Error("Insufficient player funds");

    const company = await DatabaseManager.getCompanyByOwner(player.id);
    if (!company) throw new Error("No company found");

    player.money -= amount;
    player.money = Math.round(player.money);
    await DatabaseManager.savePlayer(player);

    company.balance += amount;
    company.balance = Math.round(company.balance);
    await DatabaseManager.put("company", company);

    await DatabaseManager.saveTransaction({
      timestamp: new Date().toISOString(),
      type: "transfer_to_company",
      amount: -amount,
      balance_after: player.money,
      wallet: "player",
      description: `Transfer to ${company.name}`,
    });

    await DatabaseManager.saveTransaction({
      timestamp: new Date().toISOString(),
      type: "transfer_to_company",
      amount: amount,
      balance_after: company.balance,
      wallet: "company",
      description: `Transfer from ${player.name}`,
    });

    await DatabaseManager.forceSave();
  }

  async transferFromCompany(amount: number): Promise<void> {
    const player = await DatabaseManager.getPlayer();
    if (!player) throw new Error("No player found");
    if (amount <= 0) throw new Error("Amount must be positive");

    const company = await DatabaseManager.getCompanyByOwner(player.id);
    if (!company) throw new Error("No company found");
    if (company.balance < amount) throw new Error("Insufficient company funds");

    company.balance -= amount;
    company.balance = Math.round(company.balance);
    await DatabaseManager.put("company", company);

    player.money += amount;
    player.money = Math.round(player.money);
    await DatabaseManager.savePlayer(player);

    await DatabaseManager.saveTransaction({
      timestamp: new Date().toISOString(),
      type: "transfer_from_company",
      amount: -amount,
      balance_after: company.balance,
      wallet: "company",
      description: `Transfer to ${player.name}`,
    });

    await DatabaseManager.saveTransaction({
      timestamp: new Date().toISOString(),
      type: "transfer_from_company",
      amount: amount,
      balance_after: player.money,
      wallet: "player",
      description: `Transfer from ${company.name}`,
    });

    await DatabaseManager.forceSave();
  }

  // ─────────────────────────────────────────────────────────
  // V4.1: SELL ORDERS (Player sells items on market)
  // ─────────────────────────────────────────────────────────

  /**
   * Post a sell order (player sells item from inventory)
   * Items are "blocked" by reducing inventory and creating the order
   */
  async postSellOrder(params: {
    item_id: string;
    quantity: number;
    price_per_unit: number;
    owner_type: "player" | "company";
    airport_icao: string;
  }): Promise<SellOrder> {
    const player = await DatabaseManager.getPlayer();
    if (!player) throw new Error("No player found");

    const { item_id, quantity, price_per_unit, owner_type, airport_icao } = params;

    // Get item details
    const items = await DatabaseManager.getAll<Item>("items");
    const item = items.find(i => i.id === item_id || i.code === item_id);
    if (!item) throw new Error(`Item ${item_id} not found in catalog`);

    // Check inventory based on owner_type
    const locationType = owner_type === "player" ? "player" : "airport";
    const inventory = await DatabaseManager.getInventoryAt(locationType, airport_icao);
    const invItem = inventory.find(i => i.item_code === item_id);

    if (!invItem || invItem.quantity < quantity) {
      throw new Error(`Insufficient inventory: need ${quantity}, have ${invItem?.quantity || 0}`);
    }

    // Reduce inventory (block items)
    if (invItem.quantity === quantity) {
      await DatabaseManager.delete("inventory", invItem.id);
    } else {
      invItem.quantity -= quantity;
      await DatabaseManager.put("inventory", invItem);
    }

    // Create sell order
    const order: SellOrder = {
      id: this.generateUUID(),
      seller_id: player.id,
      seller_name: player.name,
      item_id: item_id,
      item_name: item.name,
      item_tier: item.tier,
      quantity: quantity,
      price_per_unit: price_per_unit,
      total_price: quantity * price_per_unit,
      owner_type: owner_type,
      airport_icao: airport_icao,
      status: "active",
      created_at: new Date().toISOString(),
    };

    await DatabaseManager.createSellOrder(order);

    // Log transaction (listing, no money change)
    await DatabaseManager.saveTransaction({
      timestamp: new Date().toISOString(),
      type: "market_sell",
      amount: 0,
      balance_after: owner_type === "player" ? player.money : (await DatabaseManager.getCompanyByOwner(player.id))?.balance || 0,
      wallet: owner_type,
      description: `Listed ${item.name} x${quantity} @ ${price_per_unit}$/unit`,
      related_id: order.id,
      airport_icao: airport_icao,
    });

    console.log(`[LocalMarketService] Posted sell order: ${quantity}x ${item.name} at ${price_per_unit}$/unit`);

    // Save to native persistence
    await DatabaseManager.forceSave();

    return order;
  }

  /**
   * Cancel a sell order (return items to inventory)
   */
  async cancelSellOrder(orderId: string): Promise<void> {
    const player = await DatabaseManager.getPlayer();
    if (!player) throw new Error("No player found");

    const orders = await DatabaseManager.getSellOrdersBySeller(player.id);
    const order = orders.find(o => o.id === orderId);

    if (!order) throw new Error("Sell order not found");
    if (order.status !== "active") throw new Error("Order is not active");

    // Return items to inventory
    const locationType: "airport" = "airport";
    const inventory = await DatabaseManager.getInventoryAt(locationType, order.airport_icao);
    const existing = inventory.find(i => i.item_code === order.item_id);

    if (existing) {
      existing.quantity += order.quantity;
      await DatabaseManager.put("inventory", existing);
    } else {
      const newInv: DbInventoryItem = {
        id: this.generateUUID(),
        location_type: locationType,
        location_id: order.airport_icao,
        item_code: order.item_id,
        quantity: order.quantity,
      };
      await DatabaseManager.put("inventory", newInv);
    }

    // Update order status
    order.status = "cancelled";
    await DatabaseManager.updateSellOrder(order);

    // If aircraft sell order, clear for_sale flag
    if (order.is_aircraft && order.item_id) {
      const aircraft = await DatabaseManager.get<Aircraft>("aircraft", order.item_id);
      if (aircraft) {
        aircraft.for_sale = false;
        aircraft.sale_price = undefined;
        await DatabaseManager.put("aircraft", aircraft);
        console.log(`[LocalMarketService] Aircraft ${aircraft.registration} removed from sale`);
      }
    }

    console.log(`[LocalMarketService] Cancelled sell order: ${order.quantity}x ${order.item_name}`);

    // Save to native persistence
    await DatabaseManager.forceSave();
  }

  /**
   * Get player's sell orders (active and recent)
   */
  async getMySellOrders(): Promise<SellOrder[]> {
    const player = await DatabaseManager.getPlayer();
    if (!player) return [];

    const orders = await DatabaseManager.getSellOrdersBySeller(player.id);
    // Sort by created_at descending
    orders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return orders;
  }

  /**
   * Fulfill a sell order (AI or player buys it)
   * Called by AI buyer or when another player buys
   */
  async fulfillSellOrder(orderId: string, buyerId: string = "AI"): Promise<void> {
    const allOrders = await DatabaseManager.getAll<SellOrder>("sell_orders");
    const order = allOrders.find(o => o.id === orderId);

    if (!order) throw new Error("Sell order not found");
    if (order.status !== "active") throw new Error("Order is not active");

    // Get seller to credit money
    const player = await DatabaseManager.getPlayer();
    if (!player) throw new Error("No player found");

    if (order.seller_id !== player.id) {
      // Order belongs to another player (future multiplayer)
      console.warn(`[LocalMarketService] Cannot fulfill order from different seller`);
      return;
    }

    // Credit money to seller
    if (order.owner_type === "player") {
      player.money += order.total_price;
      player.money = Math.round(player.money);
      await DatabaseManager.savePlayer(player);

      // Log transaction
      await DatabaseManager.saveTransaction({
        timestamp: new Date().toISOString(),
        type: "market_sell",
        amount: order.total_price,
        balance_after: player.money,
        wallet: "player",
        description: `Sold ${order.item_name} x${order.quantity} to ${buyerId}`,
        related_id: order.id,
        airport_icao: order.airport_icao,
      });
    } else {
      const company = await DatabaseManager.getCompanyByOwner(player.id);
      if (company) {
        company.balance += order.total_price;
        company.balance = Math.round(company.balance);
        await DatabaseManager.put("company", company);

        // Log transaction
        await DatabaseManager.saveTransaction({
          timestamp: new Date().toISOString(),
          type: "market_sell",
          amount: order.total_price,
          balance_after: company.balance,
          wallet: "company",
          description: `Sold ${order.item_name} x${order.quantity} to ${buyerId}`,
          related_id: order.id,
          airport_icao: order.airport_icao,
        });
      }
    }

    // Update order status
    order.status = "sold";
    order.sold_at = new Date().toISOString();
    order.buyer_id = buyerId;
    await DatabaseManager.updateSellOrder(order);

    // If aircraft sell order, clear for_sale flag and soft-delete
    if (order.is_aircraft && order.item_id) {
      const aircraft = await DatabaseManager.get<Aircraft>("aircraft", order.item_id);
      if (aircraft) {
        aircraft.for_sale = false;
        aircraft.is_active = false;
        await DatabaseManager.put("aircraft", aircraft);
        console.log(`[LocalMarketService] Aircraft ${aircraft.registration} sold and deactivated`);
      }
    }

    console.log(`[LocalMarketService] Fulfilled sell order: ${order.quantity}x ${order.item_name} for ${order.total_price}$`);

    // Save to native persistence
    await DatabaseManager.forceSave();
  }

  /**
   * Get the base price for an item (from seed/catalog)
   * Used for AI pricing decisions
   */
  async getItemBasePrice(itemCode: string): Promise<number> {
    const items = await DatabaseManager.getAll<Item>("items");
    const item = items.find(i => i.id === itemCode || i.code === itemCode);
    return item?.baseValue || item?.base_price || 100;
  }

  /**
   * Get all active sell orders (for AI buyer processing)
   */
  async getActiveSellOrders(): Promise<SellOrder[]> {
    return DatabaseManager.getActiveSellOrders();
  }

  // ─────────────────────────────────────────────────────────
  // V4.1: AIRCRAFT PURCHASE & SALE
  // ─────────────────────────────────────────────────────────

  /**
   * Purchase an aircraft from the catalog
   */
  async purchaseAircraft(params: {
    catalog_id: string;
    owner_type: "player" | "company";
    location_icao?: string;
  }): Promise<Aircraft> {
    const player = await DatabaseManager.getPlayer();
    if (!player) throw new Error("No player found");

    // Get catalog entry
    const catalog = await DatabaseManager.getAll<AircraftCatalog>("aircraft_catalog");
    const catEntry = catalog.find(c => c.id === params.catalog_id);
    if (!catEntry) throw new Error(`Aircraft ${params.catalog_id} not found in catalog`);

    // Determine location (player's current airport or specified)
    const location = params.location_icao || player.current_airport || "LFPG";

    // Check and deduct funds
    const price = catEntry.basePrice;
    if (params.owner_type === "player") {
      if (player.money < price) throw new Error("Insufficient funds");
      player.money -= price;
      player.money = Math.round(player.money);
      await DatabaseManager.savePlayer(player);

      // Log transaction
      await DatabaseManager.saveTransaction({
        timestamp: new Date().toISOString(),
        type: "market_buy",
        amount: -price,
        balance_after: player.money,
        wallet: "player",
        description: `Purchased ${catEntry.name}`,
        airport_icao: location,
      });
    } else {
      const company = await DatabaseManager.getCompanyByOwner(player.id);
      if (!company || company.balance < price) throw new Error("Insufficient company funds");
      company.balance -= price;
      company.balance = Math.round(company.balance);
      await DatabaseManager.put("company", company);

      // Log transaction
      await DatabaseManager.saveTransaction({
        timestamp: new Date().toISOString(),
        type: "market_buy",
        amount: -price,
        balance_after: company.balance,
        wallet: "company",
        description: `Purchased ${catEntry.name}`,
        airport_icao: location,
      });
    }

    // Generate registration
    const registration = this.generateRegistration(player.nationality || "FR");
    const now = new Date().toISOString();

    // Create systems with all conditions at 100% (new aircraft)
    const systems: AircraftSystemsInline = {
      engine_condition: 100,
      propeller_condition: 100,
      landing_gear_condition: 100,
      electrical_condition: 100,
      avionics_condition: 100,
      pitot_condition: 100,
      engine_failed: false,
      propeller_failed: false,
      landing_gear_failed: false,
      electrical_failed: false,
      avionics_failed: false,
      pitot_failed: false,
      last_maintenance_at: now,
    };

    // Create aircraft with perfect condition
    const aircraft: Aircraft = {
      id: this.generateUUID(),
      registration: registration,
      name: catEntry.name,
      type_code: catEntry.icaoType,
      company_id: params.owner_type === "company" ? (await DatabaseManager.getCompanyByOwner(player.id))?.id || null : null,
      owner_id: params.owner_type === "player" ? player.id : null,
      owner_type: params.owner_type,
      location_icao: location,
      status: "parked",
      fuel_gallons: catEntry.fuelCapacityGal ? catEntry.fuelCapacityGal * 0.5 : 40,
      condition: 100,
      flight_hours: 0,
      cycles: 0,
      cargo_capacity_kg: catEntry.cargoCapacityKg,
      passenger_seats: catEntry.passengerSeats,
      purchase_price: price,
      is_active: true,
      created_at: now,
      updated_at: now,
      systems: systems,  // All systems at 100%
    };

    await DatabaseManager.put("aircraft", aircraft);

    console.log(`[LocalMarketService] Purchased aircraft: ${registration} (${catEntry.name}) at ${location}`);

    // Save to native persistence
    await DatabaseManager.forceSave();

    return aircraft;
  }

  /**
   * Sell an aircraft back to the "dealer" (60% of catalog price * condition)
   */
  async sellAircraft(aircraftId: string): Promise<number> {
    const player = await DatabaseManager.getPlayer();
    if (!player) throw new Error("No player found");

    // Get aircraft
    const aircraft = await DatabaseManager.get<Aircraft>("aircraft", aircraftId);
    if (!aircraft) throw new Error("Aircraft not found");
    if (!aircraft.is_active) throw new Error("Aircraft is not active");

    // Check ownership
    const isOwner = aircraft.owner_type === "player" && aircraft.owner_id === player.id;
    const company = await DatabaseManager.getCompanyByOwner(player.id);
    const isCompanyOwner = aircraft.owner_type === "company" && aircraft.company_id === company?.id;
    if (!isOwner && !isCompanyOwner) throw new Error("You don't own this aircraft");

    // Check cargo is empty
    const cargo = await DatabaseManager.getInventoryAt("aircraft", aircraftId);
    if (cargo.length > 0) {
      const totalCargo = cargo.reduce((sum, c) => sum + c.quantity, 0);
      if (totalCargo > 0) throw new Error("Empty cargo first");
    }

    // Get catalog price
    const catalog = await DatabaseManager.getAll<AircraftCatalog>("aircraft_catalog");
    const catEntry = catalog.find(c => c.icaoType === aircraft.type_code || c.id === aircraft.type_code.toLowerCase());
    const basePrice = catEntry?.basePrice || aircraft.purchase_price || 50000;

    // Calculate sell price: 60% * condition/100
    const condition = aircraft.condition || 100;
    const sellPrice = Math.floor(basePrice * 0.6 * (condition / 100));

    // Credit money
    if (aircraft.owner_type === "player") {
      player.money += sellPrice;
      player.money = Math.round(player.money);
      await DatabaseManager.savePlayer(player);

      // Log transaction
      await DatabaseManager.saveTransaction({
        timestamp: new Date().toISOString(),
        type: "market_sell",
        amount: sellPrice,
        balance_after: player.money,
        wallet: "player",
        description: `Sold aircraft ${aircraft.registration}`,
        related_id: aircraftId,
        airport_icao: aircraft.location_icao,
      });
    } else if (company) {
      company.balance += sellPrice;
      company.balance = Math.round(company.balance);
      await DatabaseManager.put("company", company);

      // Log transaction
      await DatabaseManager.saveTransaction({
        timestamp: new Date().toISOString(),
        type: "market_sell",
        amount: sellPrice,
        balance_after: company.balance,
        wallet: "company",
        description: `Sold aircraft ${aircraft.registration}`,
        related_id: aircraftId,
        airport_icao: aircraft.location_icao,
      });
    }

    // Soft delete aircraft
    aircraft.is_active = false;
    aircraft.updated_at = new Date().toISOString();
    await DatabaseManager.put("aircraft", aircraft);

    console.log(`[LocalMarketService] Sold aircraft: ${aircraft.registration} for ${sellPrice}$`);

    // Save to native persistence
    await DatabaseManager.forceSave();

    return sellPrice;
  }

  /**
   * Post an aircraft for sale on the market (instead of instant system buyback)
   */
  async postAircraftSellOrder(aircraftId: string, askingPrice: number): Promise<SellOrder> {
    const player = await DatabaseManager.getPlayer();
    if (!player) throw new Error("No player found");

    const aircraft = await DatabaseManager.get<Aircraft>("aircraft", aircraftId);
    if (!aircraft) throw new Error("Aircraft not found");

    // Check ownership
    const isOwner = aircraft.owner_type === "player" && aircraft.owner_id === player.id;
    const company = await DatabaseManager.getCompanyByOwner(player.id);
    const isCompanyOwner = aircraft.owner_type === "company" && aircraft.company_id === company?.id;
    if (!isOwner && !isCompanyOwner) throw new Error("You don't own this aircraft");

    // Check cargo is empty
    const cargo = await DatabaseManager.getInventoryAt("aircraft", aircraftId);
    if (cargo.length > 0) {
      const totalCargo = cargo.reduce((sum, c) => sum + c.quantity, 0);
      if (totalCargo > 0) throw new Error("Empty cargo first");
    }

    // Create sell order
    const order: SellOrder = {
      id: this.generateUUID(),
      seller_id: player.id,
      seller_name: player.name,
      item_id: aircraft.id,
      item_name: `${aircraft.registration} (${aircraft.type_code})`,
      item_tier: 0,
      quantity: 1,
      price_per_unit: askingPrice,
      total_price: askingPrice,
      owner_type: aircraft.owner_type,
      airport_icao: aircraft.location_icao,
      status: "active",
      created_at: new Date().toISOString(),
      is_aircraft: true,
    };

    await DatabaseManager.createSellOrder(order);

    // Mark aircraft as for sale
    aircraft.for_sale = true;
    aircraft.sale_price = askingPrice;
    await DatabaseManager.put("aircraft", aircraft);

    // Log transaction (listing, no money change)
    await DatabaseManager.saveTransaction({
      timestamp: new Date().toISOString(),
      type: "market_sell",
      amount: 0,
      balance_after: aircraft.owner_type === "player" ? player.money : (company?.balance || 0),
      wallet: aircraft.owner_type,
      description: `Listed aircraft ${aircraft.registration} for ${askingPrice} CR`,
      related_id: order.id,
      airport_icao: aircraft.location_icao,
    });

    console.log(`[LocalMarketService] Posted aircraft sell order: ${aircraft.registration} at ${askingPrice} CR`);

    await DatabaseManager.forceSave();
    return order;
  }

  /**
   * Get aircraft catalog with filters
   */
  async getAircraftCatalog(filters?: {
    category?: string;
    maxPrice?: number;
    license?: string;
  }): Promise<AircraftCatalog[]> {
    let catalog = await DatabaseManager.getAll<AircraftCatalog>("aircraft_catalog");

    // Filter by isActive
    catalog = catalog.filter(c => c.isActive !== false);

    if (filters?.category) {
      catalog = catalog.filter(c => c.category === filters.category);
    }
    if (filters?.maxPrice) {
      catalog = catalog.filter(c => c.basePrice <= filters.maxPrice!);
    }
    if (filters?.license) {
      catalog = catalog.filter(c => c.requiredLicense === filters.license);
    }

    // Sort by price
    catalog.sort((a, b) => a.basePrice - b.basePrice);

    return catalog;
  }

  /**
   * Get player's aircraft available for sale (with cargo info)
   */
  async getMyAircraftForSale(): Promise<Array<Aircraft & { catalog?: AircraftCatalog; sell_value: number; has_cargo: boolean }>> {
    const player = await DatabaseManager.getPlayer();
    if (!player) return [];

    // Get player's personal aircraft
    const personalAircraft = await DatabaseManager.getAircraftByOwner(player.id);

    // Get company aircraft
    const company = await DatabaseManager.getCompanyByOwner(player.id);
    const companyAircraft = company ? await DatabaseManager.getAircraftByCompany(company.id) : [];

    const allAircraft = [...personalAircraft, ...companyAircraft].filter(a => a.is_active !== false);

    const catalog = await DatabaseManager.getAll<AircraftCatalog>("aircraft_catalog");

    const results = [];
    for (const ac of allAircraft) {
      const catEntry = catalog.find(c => c.icaoType === ac.type_code || c.id === ac.type_code.toLowerCase());
      const basePrice = catEntry?.basePrice || ac.purchase_price || 50000;
      const condition = ac.condition || 100;
      const sellValue = Math.floor(basePrice * 0.6 * (condition / 100));

      // Check cargo
      const cargo = await DatabaseManager.getInventoryAt("aircraft", ac.id);
      const hasCargo = cargo.reduce((sum, c) => sum + c.quantity, 0) > 0;

      results.push({
        ...ac,
        catalog: catEntry,
        sell_value: sellValue,
        has_cargo: hasCargo,
      });
    }

    return results;
  }

  // ─────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────

  /**
   * Generate aircraft registration based on nationality
   */
  private generateRegistration(nationality: string): string {
    const prefixes: Record<string, string> = {
      "FR": "F-", "DE": "D-", "US": "N", "GB": "G-",
      "ES": "EC-", "IT": "I-", "JP": "JA", "CN": "B-",
      "BR": "PT-", "CA": "C-", "AU": "VH-", "NL": "PH-",
      "CH": "HB-", "BE": "OO-", "AT": "OE-", "PL": "SP-",
      "SE": "SE-", "NO": "LN-", "DK": "OY-", "FI": "OH-",
      "PT": "CS-", "GR": "SX-", "IE": "EI-", "RU": "RA-",
      "CZ": "OK-", "HU": "HA-", "RO": "YR-", "SK": "OM-",
    };
    const prefix = prefixes[nationality] || "OO-";

    // Generate suffix
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const nums = "0123456789";
    let suffix = "";

    // US uses N + numbers + letters (e.g., N12345, N123AB)
    if (nationality === "US") {
      suffix = Array.from({ length: 3 }, () => nums[Math.floor(Math.random() * 10)]).join("") +
               Array.from({ length: 2 }, () => chars[Math.floor(Math.random() * 26)]).join("");
    } else {
      // Most countries use 4 letters
      suffix = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * 26)]).join("");
    }

    return prefix + suffix;
  }

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
