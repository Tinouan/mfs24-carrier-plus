/**
 * InitService - First launch setup and database initialization
 * Handles loading seed data and creating default player/company
 */

import { DatabaseManager } from "../managers/DatabaseManager";
import type {
  Player, Company, Aircraft, AircraftSystemsInline,
  Item, Recipe, Airport, AircraftCatalog, PilotCareerStats
} from "../managers/DatabaseManager";
import { SyncService, type SeedPlayer, type SeedAircraft } from "./SyncService";
import { NetworkState } from "../state/NetworkState";
import { factoryState } from "../state/FactoryState";
import { SyncManager } from "./SyncManager";
import { NativePersistence } from "./NativePersistence";
import {
  gameModeState,
  loadSavedGameMode,
  isSoloMode,
  isOnlineMode,
  setModeInitialized,
  resetModeSelection,
  type GameMode
} from "../state/GameModeState";
import { ItemService } from "./ItemService";
import { RecipeService } from "./RecipeService";
import { WorkerService } from "./WorkerService";
import { FactoryScheduler } from "../managers/FactoryScheduler";
import seedData from "../data/seed.json";
import itemsData from "../data/items.json";
import recipesData from "../data/recipes.json";
import aircraftData from "../data/aircraft.json";
import npcFactoriesSeed from "../data/npc_factories_seed.json";
// Airports loaded separately due to size (24MB)

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════

/** Company creation cost - aligned with spec ARCHITECTURE.md */
export const COMPANY_CREATION_COST = 25_000;

/** V4.1: Passenger seats by aircraft type (ICAO code) */
const PASSENGER_SEATS_BY_TYPE: Record<string, number> = {
  C172: 3,
  PA28: 3,
  SR22: 3,
  DA40: 3,
  C208: 9,
  PC12: 9,
  BE20: 8,
  B738: 189,
  A320: 180,
  CRJ9: 90,
};
const DEFAULT_PASSENGER_SEATS = 4;

/** Get passenger seats for an aircraft type */
export function getPassengerSeats(typeCode: string): number {
  return PASSENGER_SEATS_BY_TYPE[typeCode.toUpperCase()] ?? DEFAULT_PASSENGER_SEATS;
}

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface InitCallbacks {
  onProgress?: (step: string, progress: number) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
  onFirstLaunch?: () => void; // Called when first launch detected, player needs to be created
  onModeSelectionRequired?: () => void; // Called when user needs to select Solo/Online mode
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
  private seedConnected = false;

  // ─────────────────────────────────────────────────────────
  // MAIN INITIALIZATION (Architecture v3.0 - Solo/Online)
  // ─────────────────────────────────────────────────────────

  async initialize(callbacks: InitCallbacks = {}): Promise<void> {
    if (this.initialized) {
      callbacks.onComplete?.();
      return;
    }

    this.callbacks = callbacks;

    // CRITICAL: Reset initialization flag at start - prevents stale data routing
    setModeInitialized(false);

    try {
      // ═══════════════════════════════════════════════════════════
      // PHASE 1: Base initialization (common to both modes)
      // ═══════════════════════════════════════════════════════════

      // 0. Check native persistence availability
      if (NativePersistence.isAvailable()) {
        console.log("[InitService] Native persistence (GetStoredData) is available!");
      } else {
        console.warn("[InitService] Native persistence NOT available - data won't persist between MSFS sessions");
      }

      // 1. Initialize local database FIRST (instant, offline-first)
      this.reportProgress("Chargement local...", 5);
      NetworkState.setConnecting();

      await DatabaseManager.initialize({
        onReady: () => console.log("[InitService] Local database ready"),
        onError: (e) => {
          throw e;
        },
        // Persistence is handled by DatabaseManager.schedulePersistentSave() → saveToDataStore()
        // which saves to "WorldOfAircraftData" key. No need for separate NativePersistence callback.
      });

      // 2. Load local catalogs (items, recipes, aircraft types)
      this.reportProgress("Chargement des catalogues...", 15);
      await this.loadCatalogOnly();

      // ═══════════════════════════════════════════════════════════
      // PHASE 2: Check saved game mode or prompt user
      // ═══════════════════════════════════════════════════════════

      this.reportProgress("Vérification du mode de jeu...", 25);
      const savedMode = loadSavedGameMode();

      if (!savedMode) {
        // No mode selected - prompt user to choose
        console.log("[InitService] No game mode selected - showing mode selector");
        this.reportProgress("Sélection du mode requise", 30);
        this.callbacks.onModeSelectionRequired?.();
        return;
      }

      // ═══════════════════════════════════════════════════════════
      // PHASE 3: Initialize based on selected mode
      // ═══════════════════════════════════════════════════════════

      if (savedMode === "solo") {
        await this.initializeSoloMode();
      } else {
        await this.initializeOnlineMode();
      }

    } catch (error) {
      console.error("[InitService] Initialization failed:", error);
      NetworkState.setOffline();
      this.callbacks.onError?.(error as Error);
      throw error;
    }
  }

  /**
   * Continue initialization after mode selection
   * Called from WorldOfAircraft when user selects a mode
   */
  async continueWithMode(mode: GameMode): Promise<void> {
    console.log(`[InitService] Continuing initialization with mode: ${mode}`);

    // CRITICAL: Reset initialization flag before starting mode setup
    // This prevents ServiceAdapter from routing to old data during mode switch
    setModeInitialized(false);

    try {
      if (mode === "solo") {
        await this.initializeSoloMode();
      } else {
        await this.initializeOnlineMode();
      }
    } catch (error) {
      console.error("[InitService] Mode initialization failed:", error);
      this.callbacks.onError?.(error as Error);
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────
  // SOLO MODE INITIALIZATION
  // Local storage, AI economy, NO anti-cheat, offline capable
  // ─────────────────────────────────────────────────────────

  private async initializeSoloMode(): Promise<void> {
    console.log("[InitService] ═══════════════════════════════════════");
    console.log("[InitService] SOLO MODE - Local career, no server");
    console.log("[InitService] ═══════════════════════════════════════");

    // DEBUG: Raw storage values
    try {
      const rawSetupNew = typeof GetStoredData === "function" ? GetStoredData("WOA_Solo_SetupComplete") : "N/A";
      const rawSetupOld = typeof GetStoredData === "function" ? GetStoredData("WOA_SoloSetupComplete") : "N/A";
      const rawSaveData = typeof GetStoredData === "function" ? GetStoredData("WOA_Solo_SaveData") : "N/A";
      const rawPlayerId = typeof GetStoredData === "function" ? GetStoredData("WOA_Solo_PlayerId") : "N/A";
      console.log("[InitService] Solo persistence check: setup=", rawSetupNew, "old=", rawSetupOld, "save=", rawSaveData ? "YES" : "NO", "pid=", rawPlayerId);
    } catch (e) {
      console.warn("[InitService] GetStoredData not available");
    }

    NetworkState.setOffline(); // Solo mode is always "offline" from SEED perspective

    // 1. Check if Solo setup has ever been completed (true first launch detection)
    const setupComplete = NativePersistence.isSetupComplete("solo");
    console.log(`[InitService] Solo setup complete flag: ${setupComplete}`);

    if (!setupComplete) {
      // True first launch - show welcome popup immediately
      console.log("[InitService] Solo: First launch detected - setup required");
      this.reportProgress("Création de profil requise", 35);
      this.callbacks.onFirstLaunch?.();
      return;
    }

    // 2. Data is already restored by DatabaseManager.initialize() → restoreFromDataStore()
    // which loads from "WorldOfAircraftData" key. No need for separate NativePersistence restore.
    // NativePersistence is now ONLY used for flags (setup complete, player ID, language, units).

    // 3. Verify we have local player data (should exist if setup was completed)
    this.reportProgress("Chargement du profil Solo...", 40);
    const localPlayer = await DatabaseManager.getPlayer();

    if (!localPlayer) {
      // Edge case: setup flag says complete but no player found - re-trigger first launch
      console.warn("[InitService] Solo: Setup was marked complete but no player found - re-triggering first launch");
      NativePersistence.clearSoloSetup(); // Clear the flag so we don't get stuck in a loop
      this.reportProgress("Création de profil requise", 60);
      this.callbacks.onFirstLaunch?.();
      return;
    }

    console.log(`[InitService] Solo: Loaded player ${localPlayer.name} (${localPlayer.money} credits)`);

    // FIX 5: Realign new player aircraft to current_airport (if 0 missions/flights)
    await this.realignNewPlayerAircraft();

    // FIX 6: Ensure all aircraft have passenger_seats from catalog
    await this.fixAircraftPassengerSeats();

    // 3. Generate AI market if needed
    this.reportProgress("Chargement du marché IA...", 70);
    await this.ensureSoloMarket();

    // 4. Load factory state (workers, factories, batches) from DatabaseManager
    this.reportProgress("Chargement des usines...", 80);
    await this.loadFactoryState();

    // 4b. Initialize NPC T0 factories (if not already created)
    this.reportProgress("Chargement des usines NPC...", 85);
    await this.initNpcFactories();

    // 5. Start factory scheduler (Solo mode: local batch completion + hourly tick)
    FactoryScheduler.start();

    // 6. Auto-save is handled by DatabaseManager.schedulePersistentSave() → saveToDataStore()
    // which saves to "WorldOfAircraftData". No need for separate NativePersistence auto-save.

    // DEBUG: Seed ALL items x100 at LFRK + 10M credits for testing (remove after testing)
    await this.seedTestInventoryAll();
    // Reload factory state so newly seeded workers/engineers appear in UI
    await this.loadFactoryState();

    // 7. Ready!
    this.initialized = true;
    setModeInitialized(true); // CRITICAL: Enable ServiceAdapter routing now
    this.reportProgress("Mode Solo prêt !", 100);
    console.log("[InitService] Solo mode initialization complete - data routing enabled");
    this.callbacks.onComplete?.();
  }

  // ─────────────────────────────────────────────────────────
  // ONLINE MODE INITIALIZATION
  // SEED server, player economy, STRICT anti-cheat
  // ─────────────────────────────────────────────────────────

  private async initializeOnlineMode(): Promise<void> {
    console.log("[InitService] ═══════════════════════════════════════");
    console.log("[InitService] ONLINE MODE - SEED server, anti-cheat");
    console.log("[InitService] ═══════════════════════════════════════");

    // 1. Try to connect to SEED (required for Online mode)
    this.reportProgress("Connexion au serveur SEED...", 35);
    const connected = await SyncService.connect();

    if (!connected) {
      // Online mode requires connection
      console.error("[InitService] Online: SEED connection failed - required for Online mode");
      this.reportProgress("Connexion au serveur requise", 40);
      NetworkState.setOffline();
      this.callbacks.onError?.(new Error("SEED_CONNECTION_REQUIRED"));
      return;
    }

    this.seedConnected = true;
    NetworkState.setOnline();
    console.log("[InitService] Online: Connected to SEED");

    // 2. Load world data from SEED
    this.reportProgress("Chargement du monde...", 50);
    await SyncService.loadWorld();
    console.log("[InitService] Online: World data loaded from SEED");

    // 3. Check if player exists on SEED
    this.reportProgress("Chargement du profil Online...", 65);
    const playerId = this.getOrCreatePlayerId();
    const seedPlayer = await SyncService.loadOrCreatePlayer(playerId);

    if (!seedPlayer) {
      // First launch - player doesn't exist on SEED
      console.log("[InitService] Online: Player not found on SEED - first launch");
      this.initialized = true;
      this.reportProgress("Création de profil requise", 70);
      this.callbacks.onFirstLaunch?.();
      return;
    }

    // 4. Load player data from SEED (NO local preservation in Online mode!)
    // IMPORTANT: Pass our local playerId to ensure consistency with local aircraft
    this.reportProgress("Synchronisation avec SEED...", 80);
    await this.loadPlayerDataFromSeedOnlineMode(seedPlayer, playerId);

    // 5. Start polling for world updates
    SyncService.startPolling(30000);
    console.log("[InitService] Online: Polling started for world updates");

    // 6. Start SyncManager for connection monitoring
    SyncManager.startConnectionCheck();
    console.log("[InitService] Online: SyncManager started");

    // 7. Ready!
    this.initialized = true;
    setModeInitialized(true); // CRITICAL: Enable ServiceAdapter routing now
    this.reportProgress("Mode Online prêt !", 100);
    console.log("[InitService] Online mode initialization complete - data routing enabled");
    this.callbacks.onComplete?.();
  }

  /**
   * Load player data from SEED in Online mode
   * Architecture v3.0: SEED is the ONLY source of truth for Online mode
   * NO merge with local data - Solo and Online are COMPLETELY SEPARATE games!
   *
   * @param seedPlayer - Player data from SEED server
   * @param localPlayerId - Our local player ID (from NativePersistence) to ensure consistency
   */
  private async loadPlayerDataFromSeedOnlineMode(seedPlayer: SeedPlayer, localPlayerId: string): Promise<void> {
    console.log(`[InitService] Online: Loading player data: ${seedPlayer.name}`);
    console.log(`[InitService] Online: Local player ID: ${localPlayerId}, SEED player ID: ${seedPlayer.id}`);

    // ═══════════════════════════════════════════════════════════════════════
    // CRITICAL: Clear local data first to prevent Solo/Online data contamination
    // Architecture v3.0: Solo and Online have COMPLETELY SEPARATE saves
    // ═══════════════════════════════════════════════════════════════════════
    console.log("[InitService] Online: Clearing local cache before SEED sync...");
    await DatabaseManager.clear("aircraft");
    await DatabaseManager.clear("player");
    await DatabaseManager.clear("company");
    await DatabaseManager.clear("inventory");
    // DEBUG: Verify clear worked
    const invAfterClear = await DatabaseManager.getAll("inventory");
    console.log(`[InitService] Online: After clear, inventory count: ${invAfterClear.length}`);
    console.log("[InitService] Online: Local cache cleared - loading fresh from SEED");

    // Use LOCAL player ID for consistency
    // SEED data is used for name, money, xp, etc.
    const localPlayer: Player = {
      id: localPlayerId,
      name: seedPlayer.name,
      xp: seedPlayer.xp,
      money: seedPlayer.money,
      trust_score: 100,
      preferred_airport: seedPlayer.home_airport,
      is_premium: false,
      created_at: seedPlayer.created_at,
      updated_at: seedPlayer.updated_at,
      last_login_at: new Date().toISOString(),
    };

    await DatabaseManager.put("player", localPlayer, false);
    console.log(`[InitService] Online: Player cached: ${localPlayer.name} (ID: ${localPlayerId}, Money: ${localPlayer.money})`);

    // Load aircraft from SEED - NO merge, SEED is the only source of truth
    const seedAircraft = await SyncService.loadPlayerAircraft(seedPlayer.id);
    for (const seedAc of seedAircraft) {
      const localAircraft: Aircraft = {
        id: seedAc.id,
        registration: seedAc.registration,
        name: seedAc.aircraft_type,
        type_code: seedAc.icao_type,
        owner_id: localPlayerId,
        owner_type: "player",
        company_id: null,
        location_icao: seedAc.current_airport_ident,
        status: (seedAc.status || "parked") as "parked" | "in_flight" | "maintenance" | "stored",
        fuel_gallons: seedAc.fuel_gallons,
        condition: seedAc.condition,
        flight_hours: seedAc.hours,
        cycles: 0,
        cargo_capacity_kg: seedAc.cargo_capacity_kg,
        for_sale: false,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await DatabaseManager.put("aircraft", localAircraft, false);
    }
    console.log(`[InitService] Online: Loaded ${seedAircraft.length} aircraft from SEED`);

    // Load company if exists on SEED
    const company = await SyncService.loadPlayerCompany(seedPlayer.id);
    if (company) {
      await DatabaseManager.put("company", company, false);
      console.log(`[InitService] Online: Loaded company: ${company.name}`);
    }
  }

  /**
   * Ensure Solo mode has AI market orders
   */
  private async ensureSoloMarket(): Promise<void> {
    const existingOrders = await DatabaseManager.getActiveMarketOrders();
    if (existingOrders.length > 0) {
      console.log(`[InitService] Solo: Market has ${existingOrders.length} orders`);
      return;
    }

    // Generate AI market for Solo mode
    console.log("[InitService] Solo: Generating AI market orders...");
    const seed = seedData as unknown as SeedData;
    await this.generateInitialMarket(seed);
  }

  /**
   * Phase 9: Load factories, workers, and production batches from DB into reactive state
   */
  private async loadFactoryState(): Promise<void> {
    const factories = await DatabaseManager.getAll<import("../managers/DatabaseManager").Factory>("factories");
    const workers = await DatabaseManager.getAll<import("../managers/DatabaseManager").WorkerInstance>("workers");
    const batches = await DatabaseManager.getAll<import("../types").ProductionBatch>("production_batches");

    factoryState.factories.set(factories as any);
    factoryState.workers.set(workers as any);
    factoryState.productionBatches.set(batches as any);

    console.log(`[InitService] Factory state loaded: ${factories.length} factories, ${workers.length} workers, ${batches.length} batches`);
  }

  /**
   * Phase 9.5: Initialize NPC T0 factories from seed data
   * Creates ~411 NPC factories worldwide that auto-produce T0 raw materials
   * Skips factories with invalid ICAO codes (not in airports cache)
   */
  private async initNpcFactories(): Promise<void> {
    const existingFactories = await DatabaseManager.getAll<import("../managers/DatabaseManager").Factory>("factories");
    const npcFactories = existingFactories.filter(f => f.tier === 0 && f.company_id === "NPC");

    if (npcFactories.length > 0) {
      console.log(`[InitService] NPC factories already exist: ${npcFactories.length}, skipping seed`);
      return;
    }

    const airports = DatabaseManager.getAirportsCache();
    const airportSet = new Set(airports.map(a => a.ident));
    const now = new Date().toISOString();
    let created = 0;
    let skipped = 0;

    for (const entry of npcFactoriesSeed) {
      // Verify ICAO exists in our airports database
      if (!airportSet.has(entry.airport_ident)) {
        skipped++;
        continue;
      }

      const factory: import("../managers/DatabaseManager").Factory = {
        id: this.generateUUID(),
        company_id: "NPC",
        airport_ident: entry.airport_ident,
        name: entry.name,
        tier: 0,
        factory_type: "npc_t0",
        status: "producing",
        current_recipe_id: null,
        is_active: true,
        max_workers: 0,
        max_engineers: 0,
        max_ingredients: 0,
        food_stock: 0,
        food_capacity: 0,
        food_tier_min: 0,
        food_consumption_per_hour: 0,
        item_id: entry.item_id,
        stock_current: 500,
        stock_max: 1000,
        production_rate: 50,
        created_at: now,
      };

      await DatabaseManager.put("factories", factory, false);
      created++;
    }

    if (skipped > 0) {
      console.warn(`[InitService] NPC factories: ${skipped} skipped (ICAO not found in airports cache)`);
    }
    console.log(`[InitService] NPC factories created: ${created} factories`);

    // Re-load factory state to include NPC factories
    await this.loadFactoryState();
  }

  /**
   * Get or create a local player ID (stored via NativePersistence for cross-session persistence)
   * This ID links to the SEED player record
   */
  private getOrCreatePlayerId(): string {
    // Use NativePersistence which persists across EFB sessions (unlike localStorage in Coherent GT)
    let playerId = NativePersistence.getPlayerId();
    if (!playerId) {
      playerId = this.generateUUID();
      NativePersistence.setPlayerId(playerId);
      console.log(`[InitService] Created new player ID: ${playerId}`);
    } else {
      console.log(`[InitService] Loaded existing player ID: ${playerId}`);
    }
    return playerId;
  }

  /**
   * Load player data from SEED into local states
   * IMPORTANT: Preserves local money/xp if we have local data (from NativePersistence)
   * This allows offline purchases to persist across EFB reloads
   */
  private async loadPlayerDataFromSeed(seedPlayer: SeedPlayer): Promise<void> {
    console.log(`[InitService] Loading player data: ${seedPlayer.name}`);

    // Check if we have existing local player data (from NativePersistence)
    const existingLocalPlayer = await DatabaseManager.getPlayer();

    // Determine which money/xp values to use
    // If we have local data, prefer local values (they may include offline purchases)
    // Only use SEED values for first-time sync or if local has no data
    let finalMoney = seedPlayer.money;
    let finalXp = seedPlayer.xp;

    if (existingLocalPlayer && existingLocalPlayer.id === seedPlayer.id) {
      // We have local data for the same player - keep local money/xp
      // This preserves offline purchases that haven't synced to SEED yet
      finalMoney = existingLocalPlayer.money;
      finalXp = existingLocalPlayer.xp;
      console.log(`[InitService] Preserving local balance: ${finalMoney} (SEED has: ${seedPlayer.money})`);
    } else {
      console.log(`[InitService] Using SEED balance: ${seedPlayer.money}`);
    }

    // Convert SEED player to local Player format and cache locally
    const localPlayer: Player = {
      id: seedPlayer.id,
      name: seedPlayer.name,
      xp: finalXp,
      money: finalMoney,
      trust_score: 100,
      preferred_airport: seedPlayer.home_airport,
      is_premium: false,
      created_at: seedPlayer.created_at,
      updated_at: seedPlayer.updated_at,
      last_login_at: new Date().toISOString(),
    };

    // Save to local cache
    await DatabaseManager.put("player", localPlayer, false);
    console.log(`[InitService] Player cached locally: ${localPlayer.name} (Money: ${localPlayer.money})`);

    // Load player's aircraft from SEED and convert to local format
    const seedAircraft = await SyncService.loadPlayerAircraft(seedPlayer.id);
    for (const seedAc of seedAircraft) {
      // Convert SEED format to local Aircraft format
      const localAircraft: Aircraft = {
        id: seedAc.id,
        registration: seedAc.registration,
        name: seedAc.aircraft_type,
        type_code: seedAc.icao_type,
        owner_id: seedAc.owner_id,
        owner_type: "player",
        company_id: null,
        location_icao: seedAc.current_airport_ident,  // KEY FIX: Map field name
        status: (seedAc.status || "parked") as "parked" | "in_flight" | "maintenance" | "stored",
        fuel_gallons: seedAc.fuel_gallons,
        condition: seedAc.condition,
        flight_hours: seedAc.hours,
        cycles: 0,
        cargo_capacity_kg: seedAc.cargo_capacity_kg,
        for_sale: false,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await DatabaseManager.put("aircraft", localAircraft, false);
    }
    console.log(`[InitService] Loaded ${seedAircraft.length} aircraft from SEED`);

    // Load player's company if exists
    const company = await SyncService.loadPlayerCompany(seedPlayer.id);
    if (company) {
      await DatabaseManager.put("company", company, false);
      console.log(`[InitService] Loaded company: ${company.name}`);
    }
  }

  /**
   * Check if connected to SEED
   */
  isSeedConnected(): boolean {
    return this.seedConnected && SyncService.isConnected();
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

    // 5. Initialize static service caches (Phase 9)
    await ItemService.init();
    await RecipeService.init();
    WorkerService.init();

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
      const response = await fetch("coui://html_ui/efb_ui/efb_apps/WorldOfAircraft/airports-main.json");
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
   * Note: Player starts with personal aircraft, no company (can buy one later for 25,000 credits)
   *
   * SEED CENTRAL: Player is created both locally and on the SEED server
   */
  async completeFirstLaunch(
    pilotName: string,
    nationality: string,
    startingAirport: string
  ): Promise<void> {
    // V4.1 FIX: Validate and sanitize starting airport
    const validAirport = /^[A-Z]{4}$/.test(startingAirport) ? startingAirport : "LFPG";
    if (validAirport !== startingAirport) {
      console.warn(`[InitService] Invalid airport "${startingAirport}", using fallback: ${validAirport}`);
    }

    console.log(`[InitService] Completing first launch: ${pilotName} (${nationality}) at ${validAirport}`);
    const soloMode = isSoloMode();
    console.log(`[InitService] Game mode: ${soloMode ? "Solo" : "Online"}`);

    const seed = seedData as unknown as SeedData;

    // 0. CRITICAL: Clear ALL stores before creating new player
    // This eliminates ghost data that was restored from WorldOfAircraftData
    // Without this, DatabaseManager.put("player") would ADD to existing array instead of replacing
    this.reportProgress("Nettoyage...", 40);
    console.log("[InitService] Clearing all stores for fresh start...");
    await DatabaseManager.clear("player");           // CRITICAL: Old player with wrong balance
    await DatabaseManager.clear("pilot_career_stats");
    await DatabaseManager.clear("aircraft");
    await DatabaseManager.clear("company");
    await DatabaseManager.clear("company_members");
    await DatabaseManager.clear("inventory");
    await DatabaseManager.clear("missions");
    await DatabaseManager.clear("mission_legs");
    await DatabaseManager.clear("mission_waypoints");
    await DatabaseManager.clear("mission_events");
    await DatabaseManager.clear("mission_cargo");
    await DatabaseManager.clear("flight_history");
    await DatabaseManager.clear("transaction_log");
    await DatabaseManager.clear("sell_orders");
    await DatabaseManager.clear("free_flight_sessions");
    await DatabaseManager.clear("factories");
    await DatabaseManager.clear("workers");
    await DatabaseManager.clear("production_batches");
    // Note: Keep items, recipes, aircraft_catalog, airports (static data)
    console.log("[InitService] All player data stores cleared");

    // 1. Get the player ID (already created in getOrCreatePlayerId)
    const playerId = this.getOrCreatePlayerId();

    // 2. Create player on SEED (Online mode only)
    if (!soloMode) {
      this.reportProgress("Création du profil sur le serveur...", 50);
      const now = new Date().toISOString();
      const seedPlayer: SeedPlayer = {
        id: playerId,
        name: pilotName,
        money: 100000, // 100,000 credits for testing
        xp: 0,
        home_airport: validAirport,  // V4.1 FIX: Use validated airport
        created_at: now,
        updated_at: now,
      };

      const seedCreated = await SyncService.createPlayer(seedPlayer);
      if (!seedCreated) {
        console.error("[InitService] Failed to create player on SEED");
        this.callbacks.onError?.(new Error("SEED_PLAYER_CREATION_FAILED"));
        return;
      }
      console.log(`[InitService] Player created on SEED: ${pilotName}`);
    } else {
      console.log("[InitService] Solo mode: skipping SEED player creation");
    }

    // 3. Create player locally
    this.reportProgress("Création du profil local...", 60);
    await this.createCustomPlayer(pilotName, nationality, validAirport, playerId);  // V4.1 FIX

    // 3b. Create pilot career stats
    this.reportProgress("Initialisation des stats...", 65);
    await this.createPilotCareerStats(playerId);

    // 4. Create PERSONAL starter aircraft at chosen airport (not company)
    // Player can buy a company later for 25,000 credits
    this.reportProgress("Création de l'avion...", 70);
    const aircraft = await this.createPersonalStarterAircraft(playerId, validAirport);  // V4.1 FIX

    // 4b. Sync aircraft to SEED (Online mode only)
    if (!soloMode) {
      this.reportProgress("Synchronisation de l'avion...", 75);
      await this.syncAircraftToSeed(aircraft);

      // 5. Load world data (market orders, etc.) - already loaded from SEED
      this.reportProgress("Chargement du monde...", 80);
      await SyncService.loadWorld();

      // 6. Start polling for world updates
      SyncService.startPolling(30000);
    } else {
      console.log("[InitService] Solo mode: skipping SEED sync, generating AI market");
      this.reportProgress("Génération du marché IA...", 75);
      await this.ensureSoloMarket();
    }

    // 7. Mark setup as complete (flag only)
    if (soloMode && NativePersistence.isAvailable()) {
      NativePersistence.setSoloSetupComplete(true);
      console.log("[InitService] Solo setup marked as complete");
    }

    // 8. CRITICAL: Force save new player data to WorldOfAircraftData backup
    // This ensures the NEW player (100,000 CR) overwrites any ghost data
    await DatabaseManager.forceSave();
    console.log("[InitService] New player data saved to WorldOfAircraftData backup");

    this.reportProgress("Prêt !", 100);
    console.log("[InitService] First launch setup complete!");
    this.initialized = true;
    setModeInitialized(true); // CRITICAL: Enable ServiceAdapter routing now
    console.log("[InitService] First launch complete - data routing enabled");
    this.callbacks.onComplete?.();
  }

  private async createCustomPlayer(name: string, nationality: string, homeAirport: string, existingPlayerId?: string): Promise<string> {
    const playerId = existingPlayerId || this.generateUUID();
    const now = new Date().toISOString();

    // V4.1 FIX: Get airport coordinates for map marker fallback
    const airports = DatabaseManager.getAirportsCache();
    const airportData = airports.find(a => a.ident === homeAirport);
    const startLat = airportData?.latitude || 0;
    const startLon = airportData?.longitude || 0;

    const player: Player = {
      id: playerId,
      name: name,
      xp: 0,
      money: 100000, // 100,000 credits for testing
      trust_score: 100,
      nationality: nationality,
      preferred_airport: homeAirport,  // Home base airport
      current_airport: homeAirport,    // V4.1: Start at home airport
      last_latitude: startLat,         // V4.1: For map marker fallback
      last_longitude: startLon,        // V4.1: For map marker fallback
      is_premium: false,
      created_at: now,
      updated_at: now,
      last_login_at: now,
    };

    await DatabaseManager.put("player", player, false);
    console.log(`[InitService] Created pilot: ${name} (${nationality}) at ${homeAirport} (${startLat}, ${startLon}) with 100,000 credits`);

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
  private async createPersonalStarterAircraft(playerId: string, airport: string): Promise<Aircraft> {
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
      name: "Mon premier avion",  // Default nickname
      type_code: "C172",
      company_id: null,           // No company - personal aircraft
      owner_id: playerId,         // Owned by player directly
      owner_type: "player",       // Explicit ownership type
      location_icao: airport,
      status: "parked",           // Aircraft starts parked
      fuel_gallons: 40,
      condition: 100,             // Perfect condition
      flight_hours: 0,
      cycles: 0,
      cargo_capacity_kg: 120,     // C172 cargo capacity from catalog
      passenger_seats: getPassengerSeats("C172"),  // V4.1: Passenger capacity
      for_sale: false,
      is_active: true,
      created_at: now,
      updated_at: now,
      systems: systems,           // All systems at 100%
    };

    await DatabaseManager.put("aircraft", aircraft, false);
    console.log(`[InitService] Created personal C172 ${registration} at ${airport} for player ${playerId}`);

    // DIAGNOSTIC: Verify aircraft was actually saved
    const allAircraft = await DatabaseManager.getAll<Aircraft>("aircraft");
    console.log(`[InitService] VERIFY: Total aircraft in DB after creation: ${allAircraft.length}`);
    const savedAircraft = await DatabaseManager.getAircraftByOwner(playerId);
    console.log(`[InitService] VERIFY: Aircraft with owner_id=${playerId}: ${savedAircraft.length}`);
    if (savedAircraft.length > 0) {
      console.log(`[InitService] VERIFY: First aircraft: id=${savedAircraft[0].id}, reg=${savedAircraft[0].registration}, owner=${savedAircraft[0].owner_id}`);
    }

    return aircraft;
  }

  /**
   * Sync aircraft to SEED server (creates new aircraft on SEED)
   */
  private async syncAircraftToSeed(aircraft: Aircraft): Promise<void> {
    try {
      // Convert to SEED format (simplified, without local-only fields)
      const seedAircraft: SeedAircraft = {
        id: aircraft.id,
        owner_id: aircraft.owner_id || "",
        registration: aircraft.registration,
        aircraft_type: aircraft.name || "C172",
        icao_type: aircraft.type_code,
        current_airport_ident: aircraft.location_icao,
        status: aircraft.status || "parked",
        fuel_gallons: aircraft.fuel_gallons,
        fuel_capacity_gallons: 56, // C172 default
        cargo_kg: 0,
        cargo_capacity_kg: aircraft.cargo_capacity_kg || 120,
        condition: aircraft.condition || 100,
        hours: aircraft.flight_hours || 0,
      };

      // Use createAircraft (POST) for new aircraft, not saveAircraft (PUT)
      const success = await SyncService.createAircraft(seedAircraft);
      if (success) {
        console.log(`[InitService] Aircraft ${aircraft.registration} created on SEED`);
      } else {
        console.warn(`[InitService] Failed to create aircraft ${aircraft.registration} on SEED`);
      }
    } catch (e) {
      console.error("[InitService] Error creating aircraft on SEED:", e);
    }
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
      owner_type: "company",      // Explicit ownership type
      location_icao: airport,
      status: "parked",           // Aircraft starts parked
      fuel_gallons: 40,
      condition: 100,
      flight_hours: 0,
      cycles: 0,
      cargo_capacity_kg: 200,     // Default, will be overwritten from catalog
      passenger_seats: getPassengerSeats(typeCode),  // V4.1: Passenger capacity
      for_sale: false,
      is_active: true,
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
  // FIX 5: REALIGN NEW PLAYER AIRCRAFT
  // ─────────────────────────────────────────────────────────

  /**
   * FIX 5: Realign aircraft position for new players (0 missions, 0 flights)
   * This fixes the case where aircraft location_icao drifted away from player.current_airport
   */
  async realignNewPlayerAircraft(): Promise<void> {
    const player = await DatabaseManager.getPlayer();
    if (!player || !player.current_airport) {
      console.log("[InitService] realignNewPlayerAircraft: No player or current_airport");
      return;
    }

    // Check if player has any completed missions or flights
    const careerStats = await DatabaseManager.getOrCreatePilotCareerStats(player.id);
    const totalActivity = (careerStats.completed_missions || 0) + (careerStats.total_landings || 0);

    if (totalActivity > 0) {
      console.log(`[InitService] realignNewPlayerAircraft: Player has ${totalActivity} activities, skipping`);
      return;
    }

    // Get player's aircraft
    const aircraft = await DatabaseManager.getAircraftByOwner(player.id);
    if (aircraft.length === 0) {
      console.log("[InitService] realignNewPlayerAircraft: No aircraft found");
      return;
    }

    // Realign all aircraft to player.current_airport
    for (const ac of aircraft) {
      if (ac.location_icao !== player.current_airport) {
        console.log(`[InitService] realignNewPlayerAircraft: Moving ${ac.registration} from ${ac.location_icao} to ${player.current_airport}`);
        ac.location_icao = player.current_airport;
        ac.updated_at = new Date().toISOString();
        await DatabaseManager.put("aircraft", ac, false);
      }
    }

    console.log(`[InitService] realignNewPlayerAircraft: Realigned ${aircraft.length} aircraft to ${player.current_airport}`);
  }

  /**
   * FIX 6: Ensure all aircraft have passenger_seats and cargo_capacity_kg from catalog
   * Fixes aircraft created before these fields were properly set
   */
  async fixAircraftPassengerSeats(): Promise<void> {
    const allAircraft = await DatabaseManager.getAll<Aircraft>("aircraft");
    const catalog = await DatabaseManager.getAll<AircraftCatalog>("aircraft_catalog");
    let fixed = 0;

    for (const ac of allAircraft) {
      const catEntry = catalog.find(c => c.icaoType === ac.type_code || c.id === ac.type_code);
      let needsUpdate = false;

      if (!ac.passenger_seats || ac.passenger_seats === 0) {
        ac.passenger_seats = catEntry?.passengerSeats || getPassengerSeats(ac.type_code) || 4;
        needsUpdate = true;
      }

      if (!ac.cargo_capacity_kg || ac.cargo_capacity_kg === 0) {
        ac.cargo_capacity_kg = catEntry?.cargoCapacityKg || 200;
        needsUpdate = true;
      }

      if (needsUpdate) {
        ac.updated_at = new Date().toISOString();
        await DatabaseManager.put("aircraft", ac, false);
        fixed++;
        console.log(`[InitService] Fixed aircraft ${ac.registration}: seats=${ac.passenger_seats}, cargo=${ac.cargo_capacity_kg}kg`);
      }
    }

    if (fixed > 0) {
      console.log(`[InitService] fixAircraftPassengerSeats: Fixed ${fixed}/${allAircraft.length} aircraft`);
    }
  }

  // ─────────────────────────────────────────────────────────
  // DEBUG: SEED TEST INVENTORY (remove after testing)
  // ─────────────────────────────────────────────────────────

  /**
   * DEBUG: Add 100 of ALL items (T0-T5) + 10M credits + 100 workers at LFRK
   * Only runs once (checks for existing debug_seed_all items)
   */
  private async seedTestInventoryAll(): Promise<void> {
    const companies = await DatabaseManager.getAll<Company>("company");
    if (companies.length === 0) {
      console.log("[InitService] seedTestInventoryAll: No company found, skipping");
      return;
    }

    const company = companies[0];
    const now = new Date().toISOString();

    // --- 10M credits ---
    if (company.balance < 10_000_000) {
      company.balance = 10_000_000;
      company.updated_at = now;
      await DatabaseManager.put("company", company, false);
      console.log(`[InitService] seedTestInventoryAll: Set ${company.name} balance to 10,000,000 CR`);
    }

    // --- ALL items x100 at LFRK ---
    const existingInv = await DatabaseManager.getInventoryAt("airport", "LFRK");
    const debugItems = existingInv.filter(i => i.source === "debug_seed_all");
    if (debugItems.length > 0) {
      console.log(`[InitService] seedTestInventoryAll: Items already seeded (${debugItems.length}), skipping`);
    } else {
      // Remove old debug_seed items first
      const oldDebug = existingInv.filter(i => i.source === "debug_seed");
      for (const old of oldDebug) {
        await DatabaseManager.delete("inventory", old.id, false);
      }

      const allItems = [
        // T0 — Raw Materials (37)
        "raw-fish", "raw-meat", "raw-vegetables", "raw-wheat", "raw-fruits",
        "raw-salt", "raw-sugar", "raw-milk", "raw-cocoa", "raw-vanilla",
        "iron-ore", "copper-ore", "raw-wood", "raw-stone", "sand",
        "clay", "limestone", "aluminum-ore", "titanium-ore", "granite",
        "crude-oil", "coal", "natural-gas", "uranium-ore", "biomass",
        "raw-rubber", "cotton", "raw-silicon", "rare-earth-metals",
        "sulfur", "phosphate", "graphite", "water",
        "raw-pepper", "raw-egg", "raw-salad", "raw-chili",
        // T1 — Processed (39)
        "dried-fish", "bread", "salted-meat", "vegetable-stew", "fruit-jam",
        "sugar-syrup", "butter", "flour", "cocoa-powder", "vanilla-extract",
        "steel-ingot", "copper-ingot", "planks", "stone-bricks", "glass",
        "bricks", "cement", "aluminum-ingot", "titanium-ingot", "marble-slabs",
        "diesel", "charcoal", "compressed-gas", "biofuel", "uranium-pellets",
        "rubber-sheets", "fabric", "silicon-wafers", "sulfuric-acid", "fertilizer",
        "peppered-meat", "meat-omelette", "salted-omelette", "pepper-omelette",
        "fish-omelette", "meat-salad", "seafood-salad", "vanilla-salad", "chili-meat",
        // T2 — Intermediate (49)
        "quality-bread", "smoked-fish", "chocolate-bar", "fruit-cake", "cheese",
        "sausage", "vegetable-soup", "pastry", "dried-fruit", "honey-bread",
        "reinforced-steel", "wire-cable", "wooden-beams", "concrete-blocks",
        "window-panes", "insulation", "steel-pipes", "aluminum-frame",
        "circuit-board", "titanium-plates", "jet-fuel", "heating-oil",
        "premium-biofuel", "rocket-propellant", "nuclear-fuel-rod",
        "plastic-sheets", "medical-bandages", "cleaning-solution", "paint", "adhesive",
        "steel-beam", "copper-wire", "fiberglass", "plywood", "ceramic-tiles",
        "rubber-gasket", "steel-nails", "canned-fish", "spiced-meat", "fruit-juice",
        "cheese-wheel", "chili-sauce", "vanilla-cake", "lubricant", "graphite-rod",
        "dye", "battery-cell", "firebricks", "asphalt", "tempered-glass",
        // T3 — Advanced (15)
        "structural-panel", "insulated-wall", "armored-plate", "hydraulic-cylinder",
        "electric-motor", "sensor-module", "power-supply", "led-panel",
        "premium-chocolate", "gourmet-meal", "aged-cheese",
        "carbon-fiber", "industrial-solvent", "turbine-blade", "advanced-battery",
        // T4 — High-Tech (13)
        "avionics-unit", "landing-gear-part", "navigation-system",
        "solar-panel", "industrial-robot-arm", "generator",
        "satellite-dish", "medical-scanner", "prefab-module", "climate-control",
        "airline-meal-kit", "luxury-chocolate-box", "artisan-cheese-platter",
        // T5 — Elite (10)
        "flight-computer", "aircraft-engine-part", "satellite-component",
        "nuclear-reactor-core", "luxury-watch", "fine-dining-set",
        "surgical-robot", "research-lab-kit",
        "first-class-catering", "royal-banquet-set",
      ];

      for (const itemCode of allItems) {
        const invItem: import("../managers/DatabaseManager").InventoryItem = {
          id: this.generateUUID(),
          location_type: "airport",
          location_id: "LFRK",
          item_code: itemCode,
          quantity: 100,
          owner_type: "company",
          source: "debug_seed_all",
          created_at: now,
          updated_at: now,
        };
        await DatabaseManager.put("inventory", invItem, false);
      }
      console.log(`[InitService] seedTestInventoryAll: Added ${allItems.length} items x100 at LFRK`);
    }

    // --- 100 workers (separate check) ---
    const existingWorkers = await DatabaseManager.getWorkersByCompany(company.id);
    const workersAtLFRK = existingWorkers.filter(w => w.airport_ident === "LFRK");
    if (workersAtLFRK.length >= 100) {
      console.log(`[InitService] seedTestInventoryAll: Workers already seeded (${workersAtLFRK.length}), skipping`);
    } else {
      const toCreate = 100 - workersAtLFRK.length;
      for (let i = 0; i < toCreate; i++) {
        const worker: import("../managers/DatabaseManager").WorkerInstance = {
          id: this.generateUUID(),
          owner_company_id: company.id,
          owner_player_id: null,
          owner_type: "company",
          item_id: "worker",
          airport_ident: "LFRK",
          country_code: "FR",
          speed: 50 + Math.floor(Math.random() * 15),
          resistance: 45 + Math.floor(Math.random() * 15),
          xp: 0,
          tier: 0,
          hourly_salary: 15,
          status: "available",
          factory_id: null,
          for_sale: false,
          sale_price: null,
          injured_at: null,
          injury_duration_days: 0,
          created_at: now,
        };
        await DatabaseManager.put("workers", worker, false);
      }
      console.log(`[InitService] seedTestInventoryAll: Added ${toCreate} workers at LFRK`);
    }

    // --- 20 engineers (separate check) ---
    const allWorkersNow = await DatabaseManager.getWorkersByCompany(company.id);
    const engineersAtLFRK = allWorkersNow.filter(w => w.airport_ident === "LFRK" && w.item_id === "engineer");
    if (engineersAtLFRK.length >= 20) {
      console.log(`[InitService] seedTestInventoryAll: Engineers already seeded (${engineersAtLFRK.length}), skipping`);
    } else {
      const toCreate = 20 - engineersAtLFRK.length;
      for (let i = 0; i < toCreate; i++) {
        const engineer: import("../managers/DatabaseManager").WorkerInstance = {
          id: this.generateUUID(),
          owner_company_id: company.id,
          owner_player_id: null,
          owner_type: "company",
          item_id: "engineer",
          airport_ident: "LFRK",
          country_code: "FR",
          speed: 60 + Math.floor(Math.random() * 20),
          resistance: 55 + Math.floor(Math.random() * 15),
          xp: 0,
          tier: 0,
          hourly_salary: 30,
          status: "available",
          factory_id: null,
          for_sale: false,
          sale_price: null,
          injured_at: null,
          injury_duration_days: 0,
          created_at: now,
        };
        await DatabaseManager.put("workers", engineer, false);
      }
      console.log(`[InitService] seedTestInventoryAll: Added ${toCreate} engineers at LFRK`);
    }
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

    const aircraft: Aircraft = {
      id: aircraftId,
      registration: registration,
      type_code: starter.type_code,
      company_id: companyId,
      owner_id: null,           // Company aircraft
      owner_type: "company",    // Explicit ownership type
      location_icao: starter.location_icao,
      status: "parked",         // Aircraft starts parked
      fuel_gallons: starter.fuel_gallons,
      condition: 100,           // Perfect condition (ignore seed.condition)
      flight_hours: starter.flight_hours || 0,
      cycles: 0,
      cargo_capacity_kg: 120,   // Default C172 capacity
      is_active: true,
      created_at: now,
      updated_at: now,
      systems: systems,         // All systems at 100%
    };

    await DatabaseManager.put("aircraft", aircraft, false);
    console.log(`[InitService] Created starter aircraft: ${registration} at ${starter.location_icao} (condition: 100%)`);


    return aircraftId;
  }

  private async generateInitialMarket(seed: SeedData): Promise<void> {
    const items = await DatabaseManager.getAll<Item>("items");
    const basicItems = items.filter((i) => i.tier === 0);

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

    // V4.1 FIX: Clear DatabaseManager's own backup (DATASTORE_KEY = "WorldOfAircraftData")
    // This is a SEPARATE persistence system from NativePersistence!
    try {
      if (typeof SetStoredData === "function") {
        SetStoredData("WorldOfAircraftData", "");
        console.log("[InitService] Cleared WorldOfAircraftData from SetStoredData");
      }
    } catch (e) {
      console.warn("[InitService] Failed to clear WorldOfAircraftData:", e);
    }

    // Also clear sessionStorage backup
    try {
      sessionStorage.removeItem("WorldOfAircraftData");
      console.log("[InitService] Cleared WorldOfAircraftData from sessionStorage");
    } catch (e) {
      // sessionStorage may not be available
    }

    // Clear ALL native persistence data for BOTH modes
    if (NativePersistence.isAvailable()) {
      // Clear save data for BOTH modes explicitly
      NativePersistence.clearSaveData("solo");
      NativePersistence.clearSaveData("online");

      // V4.1 FIX: Clear OLD migration key WOA_SaveData (legacy from before mode separation)
      try {
        if (typeof SetStoredData === "function") {
          SetStoredData("WOA_SaveData", "");
          console.log("[InitService] Cleared legacy migration key WOA_SaveData");
        }
      } catch (e) {
        console.warn("[InitService] Failed to clear legacy key:", e);
      }

      // Clear setup flags for BOTH modes
      NativePersistence.clearSetup("solo");
      NativePersistence.clearSetup("online");

      // Clear player IDs for BOTH modes (CRITICAL - was missing!)
      NativePersistence.clearPlayerId("solo");
      NativePersistence.clearPlayerId("online");

      // V4.1 FIX: Verify the data was actually cleared
      const verifyResult = NativePersistence.verifyClear("solo");
      if (!verifyResult.cleared) {
        console.error("[InitService] CRITICAL: Save data not properly cleared!", verifyResult);
      } else {
        console.log("[InitService] Verified: Solo save data is empty");
      }

      console.log("[InitService] Native persistence cleared (save data + setup flags + player IDs)");
    }

    // V4.1 FIX: Clear localStorage backup (NativePersistence.set() also saves to localStorage)
    try {
      // Clear all WOA-related localStorage keys
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith("WOA_") || key.startsWith("woa_") || key.startsWith("carrier_"))) {
          keysToRemove.push(key);
        }
      }
      for (const key of keysToRemove) {
        localStorage.removeItem(key);
      }
      console.log(`[InitService] Cleared ${keysToRemove.length} localStorage keys`);
    } catch (e) {
      console.warn("[InitService] Failed to clear localStorage:", e);
    }

    // Clear game mode selection
    resetModeSelection();

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
   * Cost: COMPANY_CREATION_COST (25,000 credits)
   * Returns the new company or throws if insufficient funds
   */
  async purchaseCompany(companyName: string, headquartersIcao?: string): Promise<Company> {
    const player = await DatabaseManager.getPlayer();
    if (!player) throw new Error("No player found");

    // Check if player already has a company
    const existingCompany = await DatabaseManager.getCompanyByOwner(player.id);
    if (existingCompany) throw new Error("Player already has a company");

    // Check funds
    if (player.money < COMPANY_CREATION_COST) {
      throw new Error(`Insufficient funds. Need ${COMPANY_CREATION_COST} credits, have ${player.money}`);
    }

    // Deduct cost
    player.money -= COMPANY_CREATION_COST;
    await DatabaseManager.savePlayer(player);

    // V4.1: Log transaction
    await DatabaseManager.saveTransaction({
      timestamp: new Date().toISOString(),
      type: "company_create",
      amount: -COMPANY_CREATION_COST,
      balance_after: player.money,
      wallet: "player",
      description: `Company "${companyName || player.name + " Aviation"}" created`,
      airport_icao: headquartersIcao?.trim().toUpperCase() || player.preferred_airport || "LFPG",
    });

    // Create company
    const companyId = this.generateUUID();
    const now = new Date().toISOString();

    // Use provided headquarters or fallback to player's preferred airport
    const hqAirport = headquartersIcao?.trim().toUpperCase() || player.preferred_airport || "LFPG";

    const company: Company = {
      id: companyId,
      name: companyName || `${player.name} Aviation`,
      balance: 0,  // Starting balance
      owner_id: player.id,
      reputation: 50,                                    // Starting reputation
      headquarters_icao: hqAirport,                      // HQ at chosen or player's home airport
      founded_at: now,
      created_at: now,
      updated_at: now,
    };

    await DatabaseManager.put("company", company, false);
    console.log(`[InitService] Purchased company: ${company.name} at ${hqAirport} for ${COMPANY_CREATION_COST} credits`);

    // Sync company to SEED server
    try {
      const seedCompany = await SyncService.createCompany({
        name: company.name,
        owner_id: company.owner_id,
        home_airport_ident: hqAirport,
        balance: company.balance,
      });
      if (seedCompany) {
        console.log(`[InitService] Company synced to SEED: ${seedCompany.name}`);
      } else {
        console.warn("[InitService] Failed to sync company to SEED");
      }
    } catch (e) {
      console.error("[InitService] Error syncing company to SEED:", e);
    }

    return company;
  }

  /**
   * Get company purchase cost
   */
  getCompanyCost(): number {
    return COMPANY_CREATION_COST;
  }

  /**
   * Trigger an immediate save to native persistence
   * Call this after critical actions (mission complete, purchase, etc.)
   * Uses DatabaseManager.forceSave() which saves to "WorldOfAircraftData" key
   */
  async saveNow(): Promise<boolean> {
    try {
      await DatabaseManager.forceSave();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if native persistence is available
   */
  hasNativePersistence(): boolean {
    return NativePersistence.isAvailable();
  }
}

// ═══════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════

export const InitService = new InitServiceClass();
