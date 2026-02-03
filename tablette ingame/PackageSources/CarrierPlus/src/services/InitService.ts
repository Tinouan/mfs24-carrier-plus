/**
 * InitService - First launch setup and database initialization
 * Handles loading seed data and creating default player/company
 */

import { DatabaseManager } from "../managers/DatabaseManager";
import type {
  Player, Company, Aircraft, AircraftSystemsInline,
  Item, Recipe, Airport, AircraftCatalog, PilotCareerStats
} from "../managers/DatabaseManager";
import seedData from "../data/seed.json";
import itemsData from "../data/items.json";
import recipesData from "../data/recipes.json";
import aircraftData from "../data/aircraft.json";
// Airports loaded separately due to size (24MB)

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface InitCallbacks {
  onProgress?: (step: string, progress: number) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
  onFirstLaunch?: () => void; // Called when first launch detected, player needs to be created
}

// Legacy seed data structure (items/recipes now come from separate JSON files)
interface SeedData {
  starterAircraft: {
    type_code: string;
    registration: string;
    fuel_gallons: number;
    condition: number;
    flight_hours: number;
    location_icao: string;
  };
  starterMoney: number;
  starterXP: number;
  companyStarterBalance: number;
  aiAirports: string[];
}

// ═══════════════════════════════════════════════════════════
// INIT SERVICE CLASS
// ═══════════════════════════════════════════════════════════

class InitServiceClass {
  private initialized = false;
  private callbacks: InitCallbacks = {};

  // ─────────────────────────────────────────────────────────
  // MAIN INITIALIZATION
  // ─────────────────────────────────────────────────────────

  async initialize(callbacks: InitCallbacks = {}): Promise<void> {
    if (this.initialized) {
      callbacks.onComplete?.();
      return;
    }

    this.callbacks = callbacks;

    try {
      // 1. Initialize database
      this.reportProgress("Initializing database...", 10);
      await DatabaseManager.initialize({
        onReady: () => console.log("[InitService] Database ready"),
        onError: (e) => {
          throw e;
        },
      });

      // 2. Check if first launch
      this.reportProgress("Checking first launch...", 20);
      const playerCount = await DatabaseManager.count("player");

      if (playerCount === 0) {
        // First launch detected - load catalog only, wait for user input
        console.log("[InitService] First launch detected - waiting for user setup...");
        await this.loadCatalogOnly();
        this.initialized = true;
        this.reportProgress("First launch setup required", 50);
        this.callbacks.onFirstLaunch?.();
        // Don't call onComplete yet - wait for completeFirstLaunch()
      } else {
        // Existing player - ensure static data is still available
        this.reportProgress("Loading existing data...", 50);
        console.log("[InitService] Existing database found, checking catalogs...");

        // Check if airports need to be reloaded (they might be missing after localStorage clear)
        const airportCount = await DatabaseManager.count("airports");
        if (airportCount === 0) {
          console.log("[InitService] Airports missing, reloading...");
          this.reportProgress("Reloading airports...", 60);
          await this.loadAirportsMain();
        } else {
          console.log(`[InitService] ${airportCount} airports already loaded`);
        }

        // Check if items catalog needs reload
        const itemsCount = await DatabaseManager.count("items");
        if (itemsCount === 0) {
          console.log("[InitService] Items missing, reloading...");
          this.reportProgress("Reloading items...", 70);
          await this.loadItemsFromJson();
        }

        // Check if aircraft catalog needs reload
        const aircraftCount = await DatabaseManager.count("aircraft_catalog");
        if (aircraftCount === 0) {
          console.log("[InitService] Aircraft catalog missing, reloading...");
          this.reportProgress("Reloading aircraft...", 80);
          await this.loadAircraftCatalog();
        }

        this.initialized = true;
        this.reportProgress("Ready!", 100);
        this.callbacks.onComplete?.();
      }

    } catch (error) {
      console.error("[InitService] Initialization failed:", error);
      this.callbacks.onError?.(error as Error);
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────
  // FIRST LAUNCH SETUP
  // ─────────────────────────────────────────────────────────

  private async firstLaunchSetup(): Promise<void> {
    console.log("[InitService] First launch detected - running setup...");

    const seed = seedData as unknown as SeedData;

    // 1. Load catalogs (items, recipes, aircraft, airports)
    this.reportProgress("Loading catalogs...", 30);
    await this.loadCatalogOnly();

    // 2. Create default player
    this.reportProgress("Creating player...", 50);
    const playerId = await this.createDefaultPlayer(seed);

    // 3. Create default company
    this.reportProgress("Creating company...", 60);
    const companyId = await this.createDefaultCompany(playerId, seed);

    // 4. Create starter aircraft
    this.reportProgress("Creating starter aircraft...", 70);
    await this.createStarterAircraft(companyId, seed);

    // 5. Generate initial AI market orders
    this.reportProgress("Generating market...", 80);
    await this.generateInitialMarket(seed);

    console.log("[InitService] First launch setup complete!");
  }

  /**
   * Load only items and recipes catalog without creating player
   * Called on first launch before user input
   */
  private async loadCatalogOnly(): Promise<void> {
    console.log("[InitService] Loading catalog only (waiting for user setup)...");

    // 1. Load items catalog (from new JSON)
    this.reportProgress("Loading items catalog...", 25);
    await this.loadItemsFromJson();

    // 2. Load recipes (from new JSON)
    this.reportProgress("Loading recipes...", 35);
    await this.loadRecipesFromJson();

    // 3. Load aircraft catalog (from new JSON)
    this.reportProgress("Loading aircraft catalog...", 45);
    await this.loadAircraftCatalog();

    // 4. Load airports (main airports first for quick start)
    this.reportProgress("Loading airports...", 50);
    await this.loadAirportsMain();

    console.log("[InitService] Catalog loaded, ready for first launch setup");
  }

  // ─────────────────────────────────────────────────────────
  // NEW JSON DATA LOADERS
  // ─────────────────────────────────────────────────────────

  private async loadItemsFromJson(): Promise<void> {
    const items = (itemsData as { items: Item[] }).items;
    for (const item of items) {
      // Add compatibility aliases for legacy code
      const itemWithAliases: Item = {
        ...item,
        code: item.id,
        base_price: item.baseValue,
        weight_kg: item.weightKg,
        category: item.tags[0] || "misc",
      };
      await DatabaseManager.put("items", itemWithAliases, false);
    }
    console.log(`[InitService] Loaded ${items.length} items from JSON`);
  }

  private async loadRecipesFromJson(): Promise<void> {
    const recipes = (recipesData as { recipes: Recipe[] }).recipes;
    for (const recipe of recipes) {
      await DatabaseManager.put("recipes", recipe, false);
    }
    console.log(`[InitService] Loaded ${recipes.length} recipes from JSON`);
  }

  private async loadAircraftCatalog(): Promise<void> {
    const aircraft = (aircraftData as { aircraft: AircraftCatalog[] }).aircraft;
    for (const ac of aircraft) {
      await DatabaseManager.put("aircraft_catalog", ac, false);
    }
    console.log(`[InitService] Loaded ${aircraft.length} aircraft types from JSON`);
  }

  private async loadAirportsMain(): Promise<void> {
    // Load main airports from bundled JSON - keep in memory cache, not database
    // This prevents the freeze caused by 5000+ database writes
    try {
      console.log("[InitService] Fetching airports JSON...");
      const response = await fetch("coui://html_ui/efb_ui/efb_apps/CarrierPlus/airports-main.json");
      if (response.ok) {
        console.log("[InitService] Parsing airports JSON...");
        const data = await response.json();
        const airports = data.airports as Airport[];

        // Store in memory cache instead of database (much faster)
        DatabaseManager.setAirportsCache(airports);
        console.log(`[InitService] Loaded ${airports.length} airports into memory cache`);
      } else {
        console.warn("[InitService] Could not load airports-main.json, status:", response.status);
      }
    } catch (error) {
      console.warn("[InitService] Error loading airports:", error);
    }
  }

  /**
   * Complete first launch setup with user-provided data
   * Called after user fills the welcome form
   * Note: Player starts with personal aircraft, no company (can buy one later for 50,000 credits)
   */
  async completeFirstLaunch(
    pilotName: string,
    nationality: string,
    startingAirport: string
  ): Promise<void> {
    console.log(`[InitService] Completing first launch: ${pilotName} (${nationality}) at ${startingAirport}`);

    const seed = seedData as unknown as SeedData;

    // 0. Clean up any orphaned data from previous sessions
    this.reportProgress("Cleaning up old data...", 40);
    await this.cleanupOrphanedData();

    // 1. Create player with custom name (100,000 credits for testing)
    this.reportProgress("Creating pilot profile...", 50);
    const playerId = await this.createCustomPlayer(pilotName, nationality);

    // 1b. Create pilot career stats
    this.reportProgress("Initializing career stats...", 60);
    await this.createPilotCareerStats(playerId);

    // 2. Create PERSONAL starter aircraft at chosen airport (not company)
    // Player can buy a company later for 50,000 credits
    this.reportProgress("Creating starter aircraft...", 70);
    await this.createPersonalStarterAircraft(playerId, startingAirport);

    // 3. Generate initial AI market orders
    this.reportProgress("Generating market...", 80);
    await this.generateInitialMarket(seed);

    this.reportProgress("Ready!", 100);
    console.log("[InitService] First launch setup complete!");
    this.callbacks.onComplete?.();
  }

  private async createCustomPlayer(name: string, nationality: string): Promise<string> {
    const playerId = this.generateUUID();
    const now = new Date().toISOString();

    const player: Player = {
      id: playerId,
      name: name,
      xp: 0,
      money: 100000, // 100,000 credits for testing
      trust_score: 100,
      nationality: nationality,
      is_premium: false,
      created_at: now,
      updated_at: now,
      last_login_at: now,
    };

    await DatabaseManager.put("player", player, false);
    console.log(`[InitService] Created pilot: ${name} (${nationality}) with 100,000 credits`);

    return playerId;
  }

  private async createCustomCompany(playerId: string, pilotName: string): Promise<string> {
    const companyId = this.generateUUID();
    const now = new Date().toISOString();

    const company: Company = {
      id: companyId,
      name: `${pilotName} Aviation`,
      balance: 10000,
      owner_id: playerId,
      reputation: 50,        // Starting reputation
      founded_at: now,
      created_at: now,
      updated_at: now,
    };

    await DatabaseManager.put("company", company, false);
    console.log(`[InitService] Created company: ${company.name}`);

    return companyId;
  }

  /**
   * Create a personal starter aircraft for the player
   */
  private async createPersonalStarterAircraft(playerId: string, airport: string): Promise<string> {
    const aircraftId = this.generateUUID();
    const now = new Date().toISOString();

    // Generate unique registration
    const registration = this.generateRegistration();

    // Create systems with all conditions at 100%
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

    // Create aircraft with all systems in perfect condition
    const aircraft: Aircraft = {
      id: aircraftId,
      registration: registration,
      type_code: "C172",
      company_id: null,      // No company - personal aircraft
      owner_id: playerId,    // Owned by player directly
      location_icao: airport,
      fuel_gallons: 40,
      condition: 100,        // Perfect condition
      flight_hours: 0,
      cycles: 0,
      for_sale: false,
      created_at: now,
      updated_at: now,
      systems: systems,      // All systems at 100%
    };

    await DatabaseManager.put("aircraft", aircraft, false);
    console.log(`[InitService] Created personal Cessna 172 ${registration} at ${airport}`);
    console.log(`[InitService] Aircraft systems: all at 100% condition`);
    console.log(`[InitService] Aircraft details: id=${aircraftId}, owner_id=${playerId}, company_id=null`);

    return aircraftId;
  }

  /**
   * Create a company aircraft (for future company purchases)
   */
  private async createCompanyAircraft(companyId: string, typeCode: string, airport: string): Promise<string> {
    const aircraftId = this.generateUUID();
    const now = new Date().toISOString();

    // Generate unique registration
    const registration = this.generateRegistration();

    // Create systems with all conditions at 100%
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

    const aircraft: Aircraft = {
      id: aircraftId,
      registration: registration,
      type_code: typeCode,
      company_id: companyId,
      owner_id: null,
      location_icao: airport,
      fuel_gallons: 40,
      condition: 100,
      flight_hours: 0,
      cycles: 0,
      for_sale: false,
      created_at: now,
      updated_at: now,
      systems: systems,
    };

    await DatabaseManager.put("aircraft", aircraft, false);
    console.log(`[InitService] Created company aircraft ${registration} (${typeCode}) at ${airport}`);

    return aircraftId;
  }

  // Keep old method for backwards compatibility (legacy)
  private async createStarterAircraftAt(companyId: string, airport: string): Promise<string> {
    return this.createCompanyAircraft(companyId, "C172", airport);
  }

  /**
   * Create initial pilot career stats for a new player
   */
  private async createPilotCareerStats(userId: string): Promise<void> {
    const now = new Date().toISOString();

    const stats: PilotCareerStats = {
      id: this.generateUUID(),
      user_id: userId,
      // Mission counts
      total_missions: 0,
      completed_missions: 0,
      failed_missions: 0,
      cancelled_missions: 0,
      // Flight time
      total_flight_time_minutes: 0,
      total_airborne_time_minutes: 0,
      night_flight_time_minutes: 0,
      ifr_flight_time_minutes: 0,
      // Distance
      total_distance_nm: 0,
      longest_flight_nm: 0,
      // Landings
      total_landings: 0,
      butter_landings: 0,
      hard_landings: 0,
      // Scoring
      total_score: 0,
      best_score: 0,
      // Fuel
      total_fuel_used_lbs: 0,
      // Exploration
      unique_airports_visited: 0,
      unique_countries_visited: 0,
      // Streaks
      current_streak_days: 0,
      longest_streak_days: 0,
      // Career
      career_level: 1,
      career_xp: 0,
      // Timestamps
      created_at: now,
      updated_at: now,
    };

    await DatabaseManager.put("pilot_career_stats", stats, false);
    console.log(`[InitService] Created pilot career stats for user ${userId}`);
  }

  // ─────────────────────────────────────────────────────────
  // CLEANUP HELPERS
  // ─────────────────────────────────────────────────────────

  /**
   * Clean up orphaned data from previous sessions
   * This handles cases where localStorage was partially cleared
   */
  private async cleanupOrphanedData(): Promise<void> {
    console.log("[InitService] Cleaning up orphaned data...");

    // Delete all aircraft (they belong to old players)
    const oldAircraft = await DatabaseManager.getAll<Aircraft>("aircraft");
    for (const ac of oldAircraft) {
      console.log(`[InitService] Removing orphaned aircraft: ${ac.registration}`);
      await DatabaseManager.delete("aircraft", ac.id, false);
    }

    // Delete all companies
    const oldCompanies = await DatabaseManager.getAll<Company>("company");
    for (const comp of oldCompanies) {
      console.log(`[InitService] Removing orphaned company: ${comp.name}`);
      await DatabaseManager.delete("company", comp.id, false);
    }

    // Delete all missions
    const oldMissions = await DatabaseManager.getAll("missions");
    for (const mission of oldMissions) {
      await DatabaseManager.delete("missions", (mission as any).id, false);
    }

    // Clear inventory
    await DatabaseManager.clear("inventory");

    // Clear pilot career stats
    await DatabaseManager.clear("pilot_career_stats");

    // Clear free flight sessions
    await DatabaseManager.clear("free_flight_sessions");

    console.log("[InitService] Orphaned data cleanup complete");
  }

  // ─────────────────────────────────────────────────────────
  // SETUP HELPERS
  // ─────────────────────────────────────────────────────────

  private async loadItems(items: Item[]): Promise<void> {
    for (const item of items) {
      await DatabaseManager.put("items", item, false);
    }
    console.log(`[InitService] Loaded ${items.length} items`);
  }

  private async loadRecipes(recipes: Recipe[]): Promise<void> {
    for (const recipe of recipes) {
      await DatabaseManager.put("recipes", recipe, false);
    }
    console.log(`[InitService] Loaded ${recipes.length} recipes`);
  }

  private async createDefaultPlayer(seed: SeedData): Promise<string> {
    const playerId = this.generateUUID();
    const now = new Date().toISOString();

    const player: Player = {
      id: playerId,
      name: "Pilote",
      xp: seed.starterXP,
      money: seed.starterMoney,
      trust_score: 100,
      is_premium: false,
      created_at: now,
      updated_at: now,
      last_login_at: now,
    };

    await DatabaseManager.put("player", player, false);
    console.log(`[InitService] Created player: ${playerId}`);

    return playerId;
  }

  private async createDefaultCompany(playerId: string, seed: SeedData): Promise<string> {
    const companyId = this.generateUUID();
    const now = new Date().toISOString();

    const company: Company = {
      id: companyId,
      name: "Ma Compagnie",
      balance: seed.companyStarterBalance,
      owner_id: playerId,
      reputation: 50,
      founded_at: now,
      created_at: now,
      updated_at: now,
    };

    await DatabaseManager.put("company", company, false);
    console.log(`[InitService] Created company: ${companyId}`);

    return companyId;
  }

  private async createStarterAircraft(companyId: string, seed: SeedData): Promise<string> {
    const aircraftId = this.generateUUID();
    const now = new Date().toISOString();
    const starter = seed.starterAircraft;

    // Generate unique registration
    const registration = this.generateRegistration();

    const aircraft: Aircraft = {
      id: aircraftId,
      registration: registration,
      type_code: starter.type_code,
      company_id: companyId,
      owner_id: null,  // Company aircraft
      location_icao: starter.location_icao,
      fuel_gallons: starter.fuel_gallons,
      condition: starter.condition,
      flight_hours: starter.flight_hours,
      created_at: now,
    };

    await DatabaseManager.put("aircraft", aircraft, false);
    console.log(`[InitService] Created starter aircraft: ${registration} at ${starter.location_icao}`);

    return aircraftId;
  }

  private async generateInitialMarket(seed: SeedData): Promise<void> {
    const items = await DatabaseManager.getAll<Item>("items");
    const basicItems = items.filter((i) => i.tier <= 1 && i.category !== "parts");

    let orderCount = 0;

    for (const airport of seed.aiAirports) {
      // Generate 2-5 sell orders per airport
      const numOrders = 2 + Math.floor(Math.random() * 4);

      for (let i = 0; i < numOrders; i++) {
        const item = basicItems[Math.floor(Math.random() * basicItems.length)];
        const quantity = 10 + Math.floor(Math.random() * 90);
        const priceVariation = 0.8 + Math.random() * 0.4; // 80% - 120% of base price

        await DatabaseManager.put(
          "market_orders",
          {
            id: this.generateUUID(),
            type: "sell",
            item_code: item.code,
            quantity: quantity,
            price_per_unit: Math.round(item.base_price * priceVariation * 100) / 100,
            icao: airport,
            seller_id: "AI",
            is_active: true,
            created_at: new Date().toISOString(),
          },
          false
        );

        orderCount++;
      }
    }

    console.log(`[InitService] Generated ${orderCount} AI market orders across ${seed.aiAirports.length} airports`);
  }

  // ─────────────────────────────────────────────────────────
  // UTILITIES
  // ─────────────────────────────────────────────────────────

  private generateUUID(): string {
    // Simple UUID v4 generator
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  private generateRegistration(): string {
    // Generate a French-style registration F-XXXX
    const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    let reg = "F-";
    for (let i = 0; i < 4; i++) {
      reg += letters[Math.floor(Math.random() * letters.length)];
    }
    return reg;
  }

  private reportProgress(step: string, progress: number): void {
    console.log(`[InitService] ${progress}% - ${step}`);
    this.callbacks.onProgress?.(step, progress);
  }

  // ─────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────

  isInitialized(): boolean {
    return this.initialized;
  }

  async resetDatabase(): Promise<void> {
    console.log("[InitService] Resetting database...");
    await DatabaseManager.deleteDatabase();
    this.initialized = false;
    console.log("[InitService] Database reset complete. Call initialize() to setup again.");
  }

  async getPlayerInfo(): Promise<Player | undefined> {
    return DatabaseManager.getPlayer();
  }

  async getCompanyInfo(playerId: string): Promise<Company | undefined> {
    return DatabaseManager.getCompanyByOwner(playerId);
  }

  /**
   * Purchase a company for the player
   * Cost: 50,000 credits
   * Returns the new company or throws if insufficient funds
   */
  async purchaseCompany(companyName: string): Promise<Company> {
    const COMPANY_COST = 50000;

    const player = await DatabaseManager.getPlayer();
    if (!player) throw new Error("No player found");

    // Check if player already has a company
    const existingCompany = await DatabaseManager.getCompanyByOwner(player.id);
    if (existingCompany) throw new Error("Player already has a company");

    // Check funds
    if (player.money < COMPANY_COST) {
      throw new Error(`Insufficient funds. Need ${COMPANY_COST} credits, have ${player.money}`);
    }

    // Deduct cost
    player.money -= COMPANY_COST;
    await DatabaseManager.savePlayer(player);

    // Create company
    const companyId = this.generateUUID();
    const now = new Date().toISOString();

    const company: Company = {
      id: companyId,
      name: companyName || `${player.name} Aviation`,
      balance: 0,  // Starting balance
      owner_id: player.id,
      reputation: 50,        // Starting reputation
      founded_at: now,
      created_at: now,
      updated_at: now,
    };

    await DatabaseManager.put("company", company, false);
    console.log(`[InitService] Purchased company: ${company.name} for ${COMPANY_COST} credits`);

    return company;
  }

  /**
   * Get company purchase cost
   */
  getCompanyCost(): number {
    return 50000;
  }
}

// ═══════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════

export const InitService = new InitServiceClass();
