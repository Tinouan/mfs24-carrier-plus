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
import { SyncManager } from "./SyncManager";
import { NativePersistence } from "./NativePersistence";
import {
  gameModeState,
  loadSavedGameMode,
  isSoloMode,
  isOnlineMode,
  type GameMode
} from "../state/GameModeState";
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

    NetworkState.setOffline(); // Solo mode is always "offline" from SEED perspective

    // 1. Check if Solo setup has ever been completed (true first launch detection)
    const setupComplete = NativePersistence.isSoloSetupComplete();
    console.log(`[InitService] Solo setup complete flag: ${setupComplete}`);

    if (!setupComplete) {
      // True first launch - show welcome popup immediately
      console.log("[InitService] Solo: First launch detected - setup required");
      this.reportProgress("Création de profil requise", 35);
      this.callbacks.onFirstLaunch?.();
      return;
    }

    // 2. Setup was completed before - try to restore from native MSFS persistence
    this.reportProgress("Restauration sauvegarde Solo...", 40);
    const savedData = await NativePersistence.load();

    if (savedData) {
      this.reportProgress("Restauration des données...", 50);
      await NativePersistence.restore(savedData);
      console.log(`[InitService] Solo: Restored data from native persistence (saved ${new Date(savedData.timestamp).toLocaleString()})`);
    } else {
      console.log("[InitService] Solo: No persistence data found");
    }

    // 3. Verify we have local player data (should exist if setup was completed)
    this.reportProgress("Chargement du profil Solo...", 55);
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

    // 3. Generate AI market if needed
    this.reportProgress("Chargement du marché IA...", 70);
    await this.ensureSoloMarket();

    // 4. Start native persistence auto-save (every 60 seconds)
    if (NativePersistence.isAvailable()) {
      NativePersistence.startAutoSave(60000);
      console.log("[InitService] Solo: Auto-save started (60s interval)");
    }

    // 5. Ready!
    this.initialized = true;
    this.reportProgress("Mode Solo prêt !", 100);
    console.log("[InitService] Solo mode initialization complete");
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
    this.reportProgress("Synchronisation avec SEED...", 80);
    await this.loadPlayerDataFromSeedOnlineMode(seedPlayer);

    // 5. Start polling for world updates
    SyncService.startPolling(30000);
    console.log("[InitService] Online: Polling started for world updates");

    // 6. Start SyncManager for connection monitoring
    SyncManager.startConnectionCheck();
    console.log("[InitService] Online: SyncManager started");

    // 7. Ready!
    this.initialized = true;
    this.reportProgress("Mode Online prêt !", 100);
    console.log("[InitService] Online mode initialization complete");
    this.callbacks.onComplete?.();
  }

  /**
   * Load player data from SEED in Online mode
   * In Online mode, SEED is the source of truth - NO local preservation!
   */
  private async loadPlayerDataFromSeedOnlineMode(seedPlayer: SeedPlayer): Promise<void> {
    console.log(`[InitService] Online: Loading player data: ${seedPlayer.name}`);

    // In Online mode, SEED is ALWAYS the source of truth
    const localPlayer: Player = {
      id: seedPlayer.id,
      name: seedPlayer.name,
      xp: seedPlayer.xp,
      money: seedPlayer.money, // SEED value only - no local override!
      trust_score: 100,
      preferred_airport: seedPlayer.home_airport,
      is_premium: false,
      created_at: seedPlayer.created_at,
      updated_at: seedPlayer.updated_at,
      last_login_at: new Date().toISOString(),
    };

    await DatabaseManager.put("player", localPlayer, false);
    console.log(`[InitService] Online: Player cached: ${localPlayer.name} (Money: ${localPlayer.money} from SEED)`);

    // Load player's aircraft from SEED
    const seedAircraft = await SyncService.loadPlayerAircraft(seedPlayer.id);
    for (const seedAc of seedAircraft) {
      const localAircraft: Aircraft = {
        id: seedAc.id,
        registration: seedAc.registration,
        name: seedAc.aircraft_type,
        type_code: seedAc.icao_type,
        owner_id: seedAc.owner_id,
        owner_type: "player",
        company_id: null,
        location_icao: seedAc.current_airport_ident,
        status: seedAc.status || "parked",
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

    // Load company if exists
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
        status: seedAc.status || "parked",
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
   * Note: Player starts with personal aircraft, no company (can buy one later for 50,000 credits)
   *
   * SEED CENTRAL: Player is created both locally and on the SEED server
   */
  async completeFirstLaunch(
    pilotName: string,
    nationality: string,
    startingAirport: string
  ): Promise<void> {
    console.log(`[InitService] Completing first launch: ${pilotName} (${nationality}) at ${startingAirport}`);
    const soloMode = isSoloMode();
    console.log(`[InitService] Game mode: ${soloMode ? "Solo" : "Online"}`);

    const seed = seedData as unknown as SeedData;

    // 0. Clean up any orphaned data from previous sessions
    this.reportProgress("Nettoyage...", 40);
    await this.cleanupOrphanedData();

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
        home_airport: startingAirport,
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
    await this.createCustomPlayer(pilotName, nationality, startingAirport, playerId);

    // 3b. Create pilot career stats
    this.reportProgress("Initialisation des stats...", 65);
    await this.createPilotCareerStats(playerId);

    // 4. Create PERSONAL starter aircraft at chosen airport (not company)
    // Player can buy a company later for 50,000 credits
    this.reportProgress("Création de l'avion...", 70);
    const aircraft = await this.createPersonalStarterAircraft(playerId, startingAirport);

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

    // 7. Save to native persistence immediately
    if (NativePersistence.isAvailable()) {
      await NativePersistence.save();
      console.log("[InitService] First launch data saved to native persistence");

      // 8. For Solo mode, mark setup as complete
      if (soloMode) {
        NativePersistence.setSoloSetupComplete(true);
        console.log("[InitService] Solo setup marked as complete");

        // Start auto-save for Solo mode
        NativePersistence.startAutoSave(60000);
      }
    }

    this.reportProgress("Prêt !", 100);
    console.log("[InitService] First launch setup complete!");
    this.initialized = true;
    this.callbacks.onComplete?.();
  }

  private async createCustomPlayer(name: string, nationality: string, homeAirport: string, existingPlayerId?: string): Promise<string> {
    const playerId = existingPlayerId || this.generateUUID();
    const now = new Date().toISOString();

    const player: Player = {
      id: playerId,
      name: name,
      xp: 0,
      money: 100000, // 100,000 credits for testing
      trust_score: 100,
      nationality: nationality,
      preferred_airport: homeAirport,  // Home base airport
      is_premium: false,
      created_at: now,
      updated_at: now,
      last_login_at: now,
    };

    await DatabaseManager.put("player", player, false);
    console.log(`[InitService] Created pilot: ${name} (${nationality}) at ${homeAirport} with 100,000 credits`);

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
      for_sale: false,
      is_active: true,
      created_at: now,
      updated_at: now,
      systems: systems,           // All systems at 100%
    };

    await DatabaseManager.put("aircraft", aircraft, false);
    console.log(`[InitService] Created personal C172 ${registration} at ${airport} for player ${playerId}`);

    return aircraft;
  }

  /**
   * Sync aircraft to SEED server
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

      const success = await SyncService.saveAircraft(seedAircraft);
      if (success) {
        console.log(`[InitService] Aircraft ${aircraft.registration} synced to SEED`);
      } else {
        console.warn(`[InitService] Failed to sync aircraft ${aircraft.registration} to SEED`);
      }
    } catch (e) {
      console.error("[InitService] Error syncing aircraft to SEED:", e);
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

    // Clear native persistence data and Solo setup flag
    if (NativePersistence.isAvailable()) {
      NativePersistence.clear();
      NativePersistence.clearSoloSetup();
      console.log("[InitService] Native persistence cleared");
    }

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
  async purchaseCompany(companyName: string, headquartersIcao?: string): Promise<Company> {
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
    console.log(`[InitService] Purchased company: ${company.name} at ${hqAirport} for ${COMPANY_COST} credits`);

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
    return 50000;
  }

  /**
   * Trigger a save to native persistence
   * Call this after critical actions (mission complete, purchase, etc.)
   */
  async saveNow(): Promise<boolean> {
    if (NativePersistence.isAvailable()) {
      return NativePersistence.save();
    }
    return false;
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
