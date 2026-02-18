/**
 * RecipeService — Static recipe catalog service
 * Phase 9.2: Loads recipes from DatabaseManager and provides lookup/calculation methods
 *
 * Recipes are static data loaded at startup from recipes.json → DatabaseManager.
 * This service provides a fast in-memory cache for lookups and profit calculations.
 */

import { DatabaseManager, type Recipe } from "../managers/DatabaseManager";
import { ItemService } from "./ItemService";

class RecipeServiceClass {
  private recipes: Recipe[] = [];
  private recipesById: Map<string, Recipe> = new Map();
  private initialized = false;

  /**
   * Initialize the recipe catalog from DatabaseManager
   * Called once at startup from InitService (after ItemService.init())
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    this.recipes = await DatabaseManager.getAll<Recipe>("recipes");
    this.recipesById.clear();
    for (const recipe of this.recipes) {
      this.recipesById.set(recipe.id, recipe);
    }

    this.initialized = true;
    console.log(`[RecipeService] Initialized with ${this.recipes.length} recipes`);
  }

  /** Get all recipes */
  getAllRecipes(): Recipe[] {
    return this.recipes;
  }

  /** Get recipe by id */
  getRecipeById(id: string): Recipe | null {
    return this.recipesById.get(id) || null;
  }

  /** Get recipes by tier */
  getRecipesByTier(tier: number): Recipe[] {
    return this.recipes.filter(r => r.tier === tier);
  }

  /**
   * Get recipes available for a factory based on its tier and max ingredients.
   * T9-T10 factories can execute all recipes regardless of ingredient count.
   */
  getRecipesForFactory(factoryTier: number, maxIngredients: number): Recipe[] {
    if (factoryTier >= 9) return this.recipes;
    return this.recipes.filter(r => r.ingredients.length <= maxIngredients);
  }

  /**
   * Calculate profit for a recipe (single batch)
   * Returns { inputCost, outputValue, profit, profitPerHour }
   */
  calculateProfit(recipeId: string): { inputCost: number; outputValue: number; profit: number; profitPerHour: number } | null {
    const recipe = this.getRecipeById(recipeId);
    if (!recipe) return null;

    let inputCost = 0;
    for (const ing of recipe.ingredients) {
      const item = ItemService.getItemById(ing.itemId);
      if (item) {
        inputCost += item.baseValue * ing.quantity;
      }
    }

    const resultItem = ItemService.getItemById(recipe.resultItemId);
    const outputValue = resultItem ? resultItem.baseValue * recipe.resultQuantity : 0;
    const profit = outputValue - inputCost;
    const profitPerHour = recipe.productionTimeHours > 0
      ? Math.round(profit / recipe.productionTimeHours)
      : 0;

    return { inputCost, outputValue, profit, profitPerHour };
  }

  /**
   * Get the ingredients list with item details for a recipe
   */
  getRecipeIngredientsDetailed(recipeId: string): Array<{ itemId: string; itemName: string; quantity: number; icon: string }> {
    const recipe = this.getRecipeById(recipeId);
    if (!recipe) return [];

    return recipe.ingredients.map(ing => {
      const item = ItemService.getItemById(ing.itemId);
      return {
        itemId: ing.itemId,
        itemName: item?.name || ing.itemId,
        quantity: ing.quantity,
        icon: item?.icon || "??",
      };
    });
  }

  /** Get recipe count */
  getRecipeCount(): number {
    return this.recipes.length;
  }

  /** Check if initialized */
  isReady(): boolean {
    return this.initialized;
  }
}

export const RecipeService = new RecipeServiceClass();
