/**
 * ItemService — Static item catalog service
 * Phase 9.2: Loads items from DatabaseManager and provides lookup methods
 *
 * Items are static data loaded at startup from items.json → DatabaseManager.
 * This service provides a fast in-memory cache for lookups.
 */

import { DatabaseManager, type Item } from "../managers/DatabaseManager";

class ItemServiceClass {
  private items: Item[] = [];
  private itemsById: Map<string, Item> = new Map();
  private initialized = false;

  /**
   * Initialize the item catalog from DatabaseManager
   * Called once at startup from InitService
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    this.items = await DatabaseManager.getAll<Item>("items");
    this.itemsById.clear();
    for (const item of this.items) {
      this.itemsById.set(item.id, item);
      // Also index by code (legacy alias)
      if (item.code && item.code !== item.id) {
        this.itemsById.set(item.code, item);
      }
    }

    this.initialized = true;
    console.log(`[ItemService] Initialized with ${this.items.length} items`);
  }

  /** Get all items */
  getAllItems(): Item[] {
    return this.items;
  }

  /** Get item by id or code */
  getItemById(id: string): Item | null {
    return this.itemsById.get(id) || null;
  }

  /** Get items by tier (0=raw, 1=T1, 2=T2) */
  getItemsByTier(tier: number): Item[] {
    return this.items.filter(i => i.tier === tier);
  }

  /** Get items by tag */
  getItemsByTag(tag: string): Item[] {
    return this.items.filter(i => i.tags?.includes(tag));
  }

  /** Get all raw materials (T0) */
  getRawMaterials(): Item[] {
    return this.items.filter(i => i.isRaw);
  }

  /** Get all food items (any tier with "food" tag) */
  getFoodItems(): Item[] {
    return this.items.filter(i => i.tags?.includes("food"));
  }

  /** Search items by name or tag */
  searchItems(query: string): Item[] {
    const q = query.toLowerCase();
    return this.items.filter(
      i => i.name.toLowerCase().includes(q) ||
        i.tags?.some(t => t.toLowerCase().includes(q))
    );
  }

  /** Check if item has a specific tag */
  hasTag(itemId: string, tag: string): boolean {
    const item = this.getItemById(itemId);
    return item?.tags?.includes(tag) ?? false;
  }

  /** Get item count */
  getItemCount(): number {
    return this.items.length;
  }

  /** Check if initialized */
  isReady(): boolean {
    return this.initialized;
  }
}

export const ItemService = new ItemServiceClass();
