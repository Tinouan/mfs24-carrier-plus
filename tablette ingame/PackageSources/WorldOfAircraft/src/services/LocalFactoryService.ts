/**
 * LocalFactoryService — Factory creation, management, and production
 * Phase 9.4-9.5: Solo mode factory operations
 */

import { DatabaseManager } from "../managers/DatabaseManager";
import type { Factory, WorkerInstance } from "../managers/DatabaseManager";
import type { ProductionBatch } from "../types";
import { factoryState } from "../state/FactoryState";
import { RecipeService } from "./RecipeService";
import { WorkerService } from "./WorkerService";
import { canFactoryExecuteRecipe } from "../constants/factory";
import {
  FACTORY_CREATION_COST,
  AIRPORT_FACTORY_SLOTS,
  getFactoryTierConfig,
  MAX_WORKER_TIER_BONUS,
  XP_PER_BATCH_MULTIPLIER,
  NO_FOOD_EFFICIENCY,
  FOOD_TIER_BONUS,
  calculateEngineerBonus,
  WORKER_XP_TIERS,
} from "../constants/factory";

class LocalFactoryServiceClass {
  // ─────────────────────────────────────────────────────────
  // FACTORY CRUD
  // ─────────────────────────────────────────────────────────

  /** Create a new T1 factory at an airport */
  async createFactory(airportIdent: string, name: string): Promise<Factory> {
    // 1. Verify player has a company
    const player = await DatabaseManager.getPlayer();
    if (!player) throw new Error("No player found");

    const company = await DatabaseManager.getCompanyByOwner(player.id);
    if (!company) throw new Error("You need a company to create a factory");

    // 2. Check funds
    if (company.balance < FACTORY_CREATION_COST) {
      throw new Error(`Insufficient funds. Need ${FACTORY_CREATION_COST} CR, have ${company.balance} CR`);
    }

    // 3. Check airport slots
    const airports = DatabaseManager.getAirportsCache();
    const airport = airports.find(a => a.ident === airportIdent);
    const airportType = airport?.type || "small_airport";
    const maxSlots = AIRPORT_FACTORY_SLOTS[airportType] || 0;

    if (maxSlots === 0) {
      throw new Error("This airport does not support factories");
    }

    const existingFactories = factoryState.factories.get()
      .filter(f => f.airport_ident === airportIdent);
    if (existingFactories.length >= maxSlots) {
      throw new Error(`No factory slots available (${existingFactories.length}/${maxSlots})`);
    }

    // 4. Deduct cost
    company.balance -= FACTORY_CREATION_COST;
    company.balance = Math.round(company.balance);
    await DatabaseManager.put("company", company);

    // Log transaction
    await DatabaseManager.saveTransaction({
      timestamp: new Date().toISOString(),
      type: "factory_create",
      amount: -FACTORY_CREATION_COST,
      balance_after: company.balance,
      wallet: "company",
      description: `Factory "${name}" created at ${airportIdent}`,
      airport_icao: airportIdent,
    });

    // 5. Create T1 factory
    const tierConfig = getFactoryTierConfig(1);
    const factory: Factory = {
      id: this.generateUUID(),
      company_id: company.id,
      airport_ident: airportIdent,
      name: name,
      tier: 1,
      factory_type: "general",
      status: "idle",
      current_recipe_id: null,
      is_active: true,
      max_workers: tierConfig.max_workers,
      max_engineers: tierConfig.max_engineers,
      max_ingredients: tierConfig.max_ingredients,
      food_stock: 0,
      food_capacity: tierConfig.food_capacity,
      food_tier_min: 0,
      food_consumption_per_hour: 0,
      created_at: new Date().toISOString(),
    };

    // 6. Save and update state
    await DatabaseManager.put("factories", factory, false);
    const current = factoryState.factories.get();
    factoryState.factories.set([...current, factory]);

    await DatabaseManager.forceSave();
    console.log(`[LocalFactoryService] Created factory "${name}" T1 at ${airportIdent}`);

    return factory;
  }

  /** Get all factories for the player's company */
  async getMyFactories(): Promise<Factory[]> {
    const player = await DatabaseManager.getPlayer();
    if (!player) return [];
    const company = await DatabaseManager.getCompanyByOwner(player.id);
    if (!company) return [];
    return factoryState.factories.get().filter(f => f.company_id === company.id);
  }

  /** Get factories at an airport (all companies) */
  async getFactoriesAtAirport(airportIdent: string): Promise<Factory[]> {
    return factoryState.factories.get().filter(f => f.airport_ident === airportIdent);
  }

  /** Get remaining factory slots at an airport */
  getRemainingSlots(airportIdent: string, airportType: string): number {
    const maxSlots = AIRPORT_FACTORY_SLOTS[airportType] || 0;
    const usedSlots = factoryState.factories.get()
      .filter(f => f.airport_ident === airportIdent).length;
    return maxSlots - usedSlots;
  }

  /** Upgrade a factory to the next tier */
  async upgradeFactory(factoryId: string): Promise<Factory> {
    const player = await DatabaseManager.getPlayer();
    if (!player) throw new Error("No player found");

    const company = await DatabaseManager.getCompanyByOwner(player.id);
    if (!company) throw new Error("No company found");

    // Find factory
    const factories = factoryState.factories.get();
    const factory = factories.find(f => f.id === factoryId);
    if (!factory) throw new Error("Factory not found");
    if (factory.company_id !== company.id) throw new Error("Factory does not belong to your company");
    if (factory.status !== "idle") throw new Error("Factory must be idle to upgrade");
    if (factory.tier >= 10) throw new Error("Factory is already at maximum tier");

    // Get next tier config
    const nextTier = factory.tier + 1;
    const nextConfig = getFactoryTierConfig(nextTier);

    // Check funds (upgrade_cost is for upgrading TO this tier)
    if (company.balance < nextConfig.upgrade_cost) {
      throw new Error(`Insufficient funds. Need ${nextConfig.upgrade_cost} CR, have ${company.balance} CR`);
    }

    // Deduct cost
    company.balance -= nextConfig.upgrade_cost;
    company.balance = Math.round(company.balance);
    await DatabaseManager.put("company", company);

    await DatabaseManager.saveTransaction({
      timestamp: new Date().toISOString(),
      type: "factory_upgrade",
      amount: -nextConfig.upgrade_cost,
      balance_after: company.balance,
      wallet: "company",
      description: `Factory "${factory.name}" upgraded T${factory.tier}→T${nextTier}`,
      airport_icao: factory.airport_ident,
    });

    // Apply upgrade
    factory.tier = nextTier;
    factory.max_workers = nextConfig.max_workers;
    factory.max_engineers = nextConfig.max_engineers;
    factory.max_ingredients = nextConfig.max_ingredients;
    factory.food_capacity = nextConfig.food_capacity;

    // Save
    await DatabaseManager.put("factories", factory, false);
    factoryState.factories.set([...factories.filter(f => f.id !== factoryId), factory]);

    await DatabaseManager.forceSave();
    console.log(`[LocalFactoryService] Upgraded factory "${factory.name}" to T${nextTier}`);

    return factory;
  }

  /** Delete a factory (must be idle, no workers assigned) */
  async deleteFactory(factoryId: string): Promise<void> {
    const player = await DatabaseManager.getPlayer();
    if (!player) throw new Error("No player found");

    const company = await DatabaseManager.getCompanyByOwner(player.id);
    if (!company) throw new Error("No company found");

    const factories = factoryState.factories.get();
    const factory = factories.find(f => f.id === factoryId);
    if (!factory) throw new Error("Factory not found");
    if (factory.company_id !== company.id) throw new Error("Factory does not belong to your company");
    if (factory.status !== "idle") throw new Error("Factory must be idle to delete");

    // Check no workers assigned
    const workers = factoryState.workers.get()
      .filter(w => w.factory_id === factoryId);
    if (workers.length > 0) {
      throw new Error(`Cannot delete factory with ${workers.length} assigned workers. Unassign them first.`);
    }

    // Delete from DB and state
    await DatabaseManager.delete("factories", factoryId, false);
    factoryState.factories.set(factories.filter(f => f.id !== factoryId));

    await DatabaseManager.forceSave();
    console.log(`[LocalFactoryService] Deleted factory "${factory.name}" at ${factory.airport_ident}`);
  }

  // ─────────────────────────────────────────────────────────
  // WORKER ASSIGNMENT
  // ─────────────────────────────────────────────────────────

  /** Assign a worker to a factory */
  async assignWorkerToFactory(workerId: string, factoryId: string): Promise<void> {
    const workers = factoryState.workers.get();
    const worker = workers.find(w => w.id === workerId);
    if (!worker) throw new Error("Worker not found");

    const factories = factoryState.factories.get();
    const factory = factories.find(f => f.id === factoryId);
    if (!factory) throw new Error("Factory not found");

    // Validations
    if (worker.owner_company_id !== factory.company_id) {
      throw new Error("Worker does not belong to the same company as the factory");
    }
    if (worker.status !== "available") {
      throw new Error(`Worker is not available (status: ${worker.status})`);
    }
    if (worker.airport_ident !== factory.airport_ident) {
      throw new Error("Worker must be at the same airport as the factory");
    }

    // Check factory capacity (separate limits for workers vs engineers)
    const allAssigned = workers.filter(w => w.factory_id === factoryId && w.status === "working");
    if (worker.item_id === "engineer") {
      const engCount = allAssigned.filter(w => w.item_id === "engineer").length;
      if (engCount >= factory.max_engineers) {
        throw new Error(`Factory is at max engineer capacity (${engCount}/${factory.max_engineers})`);
      }
    } else {
      const wrkCount = allAssigned.filter(w => w.item_id !== "engineer").length;
      if (wrkCount >= factory.max_workers) {
        throw new Error(`Factory is at max worker capacity (${wrkCount}/${factory.max_workers})`);
      }
    }

    // Assign
    worker.status = "working";
    worker.factory_id = factoryId;
    await DatabaseManager.put("workers", worker, false);

    // Update state
    factoryState.workers.set(workers.map(w => w.id === workerId ? worker : w));

    await DatabaseManager.forceSave();
    console.log(`[LocalFactoryService] Assigned worker ${workerId} to factory "${factory.name}"`);
  }

  /** Unassign a worker from a factory */
  async unassignWorkerFromFactory(workerId: string): Promise<void> {
    const workers = factoryState.workers.get();
    const worker = workers.find(w => w.id === workerId);
    if (!worker) throw new Error("Worker not found");
    if (!worker.factory_id) throw new Error("Worker is not assigned to any factory");

    worker.status = "available";
    worker.factory_id = null;
    await DatabaseManager.put("workers", worker, false);

    factoryState.workers.set(workers.map(w => w.id === workerId ? worker : w));

    await DatabaseManager.forceSave();
    console.log(`[LocalFactoryService] Unassigned worker ${workerId}`);
  }

  // ─────────────────────────────────────────────────────────
  // PRODUCTION (Phase 9.5)
  // ─────────────────────────────────────────────────────────

  /** Start production on a factory */
  async startProduction(factoryId: string, recipeId: string, quantity: number): Promise<ProductionBatch> {
    const player = await DatabaseManager.getPlayer();
    if (!player) throw new Error("No player found");
    const company = await DatabaseManager.getCompanyByOwner(player.id);
    if (!company) throw new Error("No company found");

    const factories = factoryState.factories.get();
    const factory = factories.find(f => f.id === factoryId);
    if (!factory) throw new Error("Factory not found");
    if (factory.company_id !== company.id) throw new Error("Factory does not belong to your company");
    if (factory.status !== "idle") throw new Error("Factory must be idle to start production");

    // Get assigned workers (optional — factory can run at 30% without them)
    const assignedWorkers = factoryState.workers.get()
      .filter(w => w.factory_id === factoryId && w.status === "working");

    // Get recipe
    const recipe = RecipeService.getRecipeById(recipeId);
    if (!recipe) throw new Error("Recipe not found");

    // Check factory can execute this recipe (ingredient count vs tier)
    if (!canFactoryExecuteRecipe(factory.tier, recipe.ingredients.length)) {
      throw new Error(`Factory T${factory.tier} cannot execute this recipe (needs ${recipe.ingredients.length} ingredients, max ${factory.max_ingredients})`);
    }

    // Check ingredients available in company inventory at factory airport
    const inventory = await DatabaseManager.getInventoryAt("airport", factory.airport_ident);
    for (const ing of recipe.ingredients) {
      const needed = ing.quantity * quantity;
      const available = inventory.find(i => i.item_code === ing.itemId);
      if (!available || available.quantity < needed) {
        throw new Error(`Insufficient ${ing.itemId}: need ${needed}, have ${available?.quantity || 0}`);
      }
    }

    // Consume ingredients
    for (const ing of recipe.ingredients) {
      const needed = ing.quantity * quantity;
      const invItem = inventory.find(i => i.item_code === ing.itemId)!;
      invItem.quantity -= needed;
      if (invItem.quantity <= 0) {
        await DatabaseManager.delete("inventory", invItem.id, false);
      } else {
        await DatabaseManager.put("inventory", invItem, false);
      }
    }

    // Calculate production time: base_eff × food_bonus × eng_bonus × worker_tier_bonus
    const timeBase = recipe.productionTimeHours * quantity;

    // Base efficiency: 30% without workers, 100% with workers
    const baseEfficiency = assignedWorkers.length > 0 ? 1.0 : NO_FOOD_EFFICIENCY;

    // Food bonus by tier (or 30% penalty if no food)
    let foodBonus: number;
    if (factory.food_stock <= 0) {
      foodBonus = NO_FOOD_EFFICIENCY; // 30% — no food penalty
    } else {
      foodBonus = FOOD_TIER_BONUS[factory.food_tier_min ?? 0] ?? 1.0;
    }

    // Engineer bonus (diminishing returns, capped by factory tier)
    const engineers = assignedWorkers.filter(w => w.item_id === "engineer");
    const engBonus = 1 + calculateEngineerBonus(engineers.length, factory.tier);

    // Worker tier bonus (average tier of assigned workers)
    let workerTierBonus = 1.0;
    if (assignedWorkers.length > 0) {
      const avgTier = assignedWorkers.reduce((sum, w) => sum + w.tier, 0) / assignedWorkers.length;
      const tierConfig = WORKER_XP_TIERS[Math.min(Math.max(Math.floor(avgTier) - 1, 0), WORKER_XP_TIERS.length - 1)];
      workerTierBonus = tierConfig.speed_bonus;
    }

    const speedModifier = baseEfficiency * foodBonus * engBonus * workerTierBonus;
    const timeHours = timeBase / speedModifier;

    // Create batch
    const batch: ProductionBatch = {
      id: this.generateUUID(),
      factory_id: factoryId,
      recipe_id: recipeId,
      status: "in_progress",
      quantity: quantity,
      started_at: new Date().toISOString(),
      estimated_completion: new Date(Date.now() + timeHours * 3600000).toISOString(),
      completed_at: null,
      result_quantity: recipe.resultQuantity * quantity,
      workers_assigned: assignedWorkers.length,
    };

    // Update factory status
    factory.status = "producing";
    factory.current_recipe_id = recipeId;
    await DatabaseManager.put("factories", factory, false);
    await DatabaseManager.put("production_batches", batch, false);

    // Update state
    factoryState.factories.set(factories.map(f => f.id === factoryId ? factory : f));
    const batches = factoryState.productionBatches.get();
    factoryState.productionBatches.set([...batches, batch]);

    await DatabaseManager.forceSave();
    console.log(`[LocalFactoryService] Started production: ${recipe.name} x${quantity} at "${factory.name}" (ETA: ${timeHours.toFixed(1)}h)`);

    return batch;
  }

  /** Cancel production on a factory */
  async cancelProduction(factoryId: string): Promise<void> {
    const factories = factoryState.factories.get();
    const factory = factories.find(f => f.id === factoryId);
    if (!factory) throw new Error("Factory not found");
    if (factory.status !== "producing") throw new Error("Factory is not producing");

    const batches = factoryState.productionBatches.get();
    const activeBatch = batches.find(b => b.factory_id === factoryId && b.status === "in_progress");

    if (activeBatch) {
      activeBatch.status = "cancelled";
      activeBatch.completed_at = new Date().toISOString();
      await DatabaseManager.put("production_batches", activeBatch, false);
    }

    // Reset factory
    factory.status = "idle";
    factory.current_recipe_id = null;
    await DatabaseManager.put("factories", factory, false);

    // Update state
    factoryState.factories.set(factories.map(f => f.id === factoryId ? factory : f));
    factoryState.productionBatches.set(batches.map(b =>
      b.id === activeBatch?.id ? activeBatch! : b
    ));

    await DatabaseManager.forceSave();
    console.log(`[LocalFactoryService] Cancelled production at "${factory.name}"`);
  }

  /** Complete a batch (called by FactoryScheduler) */
  async completeBatch(batchId: string): Promise<void> {
    const batches = factoryState.productionBatches.get();
    const batch = batches.find(b => b.id === batchId);
    if (!batch || batch.status !== "in_progress") return;

    const factories = factoryState.factories.get();
    const factory = factories.find(f => f.id === batch.factory_id);
    if (!factory) return;

    const recipe = RecipeService.getRecipeById(batch.recipe_id);
    if (!recipe) return;

    // 1. Calculate tier bonus from workers
    const workers = factoryState.workers.get()
      .filter(w => w.factory_id === factory.id && w.status === "working");

    let finalQty = batch.result_quantity;
    if (workers.length > 0) {
      const avgTier = workers.reduce((sum, w) => sum + w.tier, 0) / workers.length;
      const tierBonus = Math.min(MAX_WORKER_TIER_BONUS, 1.0 + (avgTier - 1) * 0.05);
      finalQty = Math.floor(batch.result_quantity * tierBonus);
    }

    // 2. Add produced items to company inventory at factory airport
    const inventory = await DatabaseManager.getInventoryAt("airport", factory.airport_ident);
    const existing = inventory.find(i => i.item_code === recipe.resultItemId);
    if (existing) {
      existing.quantity += finalQty;
      await DatabaseManager.put("inventory", existing, false);
    } else {
      await DatabaseManager.put("inventory", {
        id: this.generateUUID(),
        location_type: "airport" as const,
        location_id: factory.airport_ident,
        item_code: recipe.resultItemId,
        quantity: finalQty,
      }, false);
    }

    // 3. Add XP to workers
    const xpGain = recipe.tier * XP_PER_BATCH_MULTIPLIER;
    for (const worker of workers) {
      WorkerService.addXP(worker, xpGain);
      await DatabaseManager.put("workers", worker, false);
    }

    // 4. Update batch status
    batch.status = "completed";
    batch.completed_at = new Date().toISOString();
    batch.result_quantity = finalQty;
    await DatabaseManager.put("production_batches", batch, false);

    // 5. Save last recipe info + reset factory
    factory.last_recipe_id = batch.recipe_id;
    factory.last_result_item_id = recipe.resultItemId;
    factory.status = "idle";
    factory.current_recipe_id = null;
    await DatabaseManager.put("factories", factory, false);

    // 6. Update state
    factoryState.factories.set(factories.map(f => f.id === factory.id ? factory : f));
    factoryState.productionBatches.set(batches.map(b => b.id === batchId ? batch : b));
    factoryState.workers.set(factoryState.workers.get().map(w => {
      const updated = workers.find(uw => uw.id === w.id);
      return updated || w;
    }));

    await DatabaseManager.forceSave();
    console.log(`[LocalFactoryService] Batch completed: ${finalQty}x ${recipe.name} at "${factory.name}" (workers got +${xpGain} XP)`);
  }

  // ─────────────────────────────────────────────────────────
  // FOOD MANAGEMENT
  // ─────────────────────────────────────────────────────────

  /** Deposit food items into a factory */
  async depositFood(factoryId: string, itemId: string, quantity: number): Promise<void> {
    const factories = factoryState.factories.get();
    const factory = factories.find(f => f.id === factoryId);
    if (!factory) throw new Error("Factory not found");

    // Check item has "food" tag
    const { ItemService } = await import("./ItemService");
    if (!ItemService.hasTag(itemId, "food")) {
      throw new Error("Only food items can be deposited");
    }

    // Get food item tier
    const foodItem = ItemService.getItemById(itemId);
    const foodTier = foodItem?.tier ?? 0;

    // Check inventory at the factory's airport
    const inventory = await DatabaseManager.getInventoryAt("airport", factory.airport_ident);
    const foodInv = inventory.find(i => i.item_code === itemId);
    if (!foodInv || foodInv.quantity < quantity) {
      throw new Error("Insufficient food in inventory");
    }

    // Calculate how much the factory can accept
    const spaceAvailable = factory.food_capacity - factory.food_stock;
    const toDeposit = Math.min(quantity, spaceAvailable);
    if (toDeposit <= 0) {
      throw new Error("Factory food storage is full");
    }

    // Transfer
    foodInv.quantity -= toDeposit;
    if (foodInv.quantity <= 0) {
      await DatabaseManager.delete("inventory", foodInv.id, false);
    } else {
      await DatabaseManager.put("inventory", foodInv, false);
    }

    factory.food_stock += toDeposit;

    // Update food_tier_min: lowest tier in stock pulls bonus down
    const currentMin = factory.food_tier_min ?? 0;
    factory.food_tier_min = Math.min(currentMin, foodTier);

    await DatabaseManager.put("factories", factory, false);
    factoryState.factories.set(factories.map(f => f.id === factoryId ? factory : f));

    await DatabaseManager.forceSave();
    console.log(`[LocalFactoryService] Deposited ${toDeposit} food (T${foodTier}) to factory "${factory.name}" (food_tier_min=${factory.food_tier_min})`);
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

export const LocalFactoryService = new LocalFactoryServiceClass();
