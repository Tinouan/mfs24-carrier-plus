/**
 * LocalFleetService - Aircraft fleet management for P2P local mode
 * Uses DatabaseManager instead of API calls
 */

import { DatabaseManager } from "../managers/DatabaseManager";
import type { Aircraft, AircraftCatalog, InventoryItem, Item } from "../managers/DatabaseManager";
import type {
  AircraftDetails,
  AircraftListItem,
  HangarAircraftItem,
  AircraftSystemsStatus,
  RepairQuote,
  HangarCargoItem,
  AircraftDetailsResponse,
  AircraftCargoResponse,
} from "../types";
import {
  ALL_SYSTEMS_V2, WEAR_PER_HOUR, LANDING_WEAR, GFORCE_WEAR,
  REPAIR_COST_RATE, CRITICAL_SYSTEMS, CRITICAL_THRESHOLD,
} from "../constants/WearConstants";

// ═══════════════════════════════════════════════════════════
// LOCAL FLEET SERVICE CLASS
// ═══════════════════════════════════════════════════════════

class LocalFleetServiceClass {
  /**
   * Get all aircraft in the fleet (for hangar display)
   * Returns both personal aircraft (owned by player) and company aircraft
   */
  async getFleet(): Promise<HangarAircraftItem[]> {
    const player = await DatabaseManager.getPlayer();
    if (!player) throw new Error("No player found");
    console.log(`[LocalFleetService] getFleet() called for player id=${player.id}, name=${player.name}`);

    const catalog = await DatabaseManager.getAll<AircraftCatalog>("aircraft_catalog");

    // DIAGNOSTIC: Check all aircraft in DB
    const allAircraft = await DatabaseManager.getAll<Aircraft>("aircraft");
    console.log(`[LocalFleetService] Total aircraft in DB: ${allAircraft.length}`);
    for (const ac of allAircraft) {
      console.log(`[LocalFleetService] Aircraft: id=${ac.id}, reg=${ac.registration}, owner_id=${ac.owner_id}, company_id=${ac.company_id}`);
    }

    const result: HangarAircraftItem[] = [];

    // 0. Repair orphaned aircraft (owner_id and company_id both undefined/null)
    await this.repairOrphanedAircraft(player.id);

    // 1. Get personal aircraft (owned directly by player) - filter out sold/inactive
    const personalAircraftRaw = await DatabaseManager.getAircraftByOwner(player.id);
    const personalAircraft = personalAircraftRaw.filter(ac => ac.is_active !== false);
    console.log(`[LocalFleetService] Personal aircraft for player ${player.id}: ${personalAircraft.length} (${personalAircraftRaw.length} total)`);
    for (const ac of personalAircraft) {
      const catEntry = catalog.find((c) => c.icaoType === ac.type_code || c.id === ac.type_code);
      result.push({
        id: ac.id,
        registration: ac.registration,
        aircraft_type: catEntry?.name || ac.type_code,
        icao_type: ac.type_code,
        current_airport_ident: ac.location_icao,
        status: ac.status || "parked",
        required_license: catEntry?.requiredLicense || "PPL",
        owner_type: "player",
        thumbnail_url: null,
        for_sale: ac.for_sale === true,
      });
    }

    // 2. Get company aircraft (if player has a company)
    const company = await DatabaseManager.getCompanyByOwner(player.id);
    if (company) {
      const companyAircraftRaw = await DatabaseManager.getAircraftByCompany(company.id);
      const companyAircraft = companyAircraftRaw.filter(ac => ac.is_active !== false);
      for (const ac of companyAircraft) {
        const catEntry = catalog.find((c) => c.icaoType === ac.type_code || c.id === ac.type_code);
        result.push({
          id: ac.id,
          registration: ac.registration,
          aircraft_type: catEntry?.name || ac.type_code,
          icao_type: ac.type_code,
          current_airport_ident: ac.location_icao,
          status: ac.status || "parked",
          required_license: catEntry?.requiredLicense || "PPL",
          owner_type: "company",
          thumbnail_url: null,
          for_sale: ac.for_sale === true,
        });
      }
    }

    return result;
  }

  /**
   * Repair corrupted or incomplete aircraft data
   * Fixes: owner_id, type_code, location_icao, systems, condition, etc.
   */
  private async repairOrphanedAircraft(playerId: string): Promise<void> {
    const allAircraft = await DatabaseManager.getAll<Aircraft>("aircraft");
    const player = await DatabaseManager.getPlayer();
    // FIX 1: Use player's current location, not hardcoded nationality-based default
    const defaultLocation = player?.current_airport || player?.preferred_airport || "LFPG";

    for (const ac of allAircraft) {
      let needsRepair = false;

      // 1. Fix owner_id if missing/invalid OR if it doesn't match current player
      const hasNoOwner = !ac.owner_id || ac.owner_id === "undefined" || ac.owner_id === "null";
      const hasNoCompany = !ac.company_id || ac.company_id === "undefined" || ac.company_id === "null";
      const isPlayerAircraft = ac.owner_type === "player" || hasNoCompany;
      const ownerIdMismatch = ac.owner_id && ac.owner_id !== playerId && isPlayerAircraft;

      if (hasNoOwner && hasNoCompany) {
        console.log(`[LocalFleetService] Fixing orphaned aircraft ${ac.registration}: no owner -> ${playerId}`);
        ac.owner_id = playerId;
        ac.company_id = null;
        needsRepair = true;
      } else if (ownerIdMismatch) {
        // Aircraft belongs to a player but owner_id doesn't match current player
        // This happens when SEED returns a different player ID or after reset
        console.log(`[LocalFleetService] Fixing owner_id mismatch for ${ac.registration}: ${ac.owner_id} -> ${playerId}`);
        ac.owner_id = playerId;
        needsRepair = true;
      }

      // 2. Fix type_code if missing
      if (!ac.type_code || ac.type_code === "undefined") {
        ac.type_code = "C172";
        needsRepair = true;
      }

      // 3. Fix location_icao if missing
      if (!ac.location_icao || ac.location_icao === "undefined" || ac.location_icao === "N/A") {
        ac.location_icao = defaultLocation;
        needsRepair = true;
      }

      // 4. Fix condition if invalid
      if (ac.condition === undefined || ac.condition === null || ac.condition < 0) {
        ac.condition = 100;
        needsRepair = true;
      }

      // 5. Fix fuel_gallons if invalid
      if (ac.fuel_gallons === undefined || ac.fuel_gallons === null || ac.fuel_gallons < 0) {
        ac.fuel_gallons = 40;
        needsRepair = true;
      }

      // 6. Fix flight_hours if invalid
      if (ac.flight_hours === undefined || ac.flight_hours === null) {
        ac.flight_hours = 0;
        needsRepair = true;
      }

      // 7. Fix systems if missing or corrupted
      if (!ac.systems || this.isSystemsCorrupted(ac.systems)) {
        ac.systems = this.createDefaultSystems();
        needsRepair = true;
      }

      // 8. Fix owner_type if missing (new field)
      if (!ac.owner_type) {
        ac.owner_type = ac.company_id ? "company" : "player";
        needsRepair = true;
      }

      // 9. Fix status if missing (new field)
      if (!ac.status) {
        ac.status = "parked";
        needsRepair = true;
      }

      // 10. Fix cargo_capacity_kg if missing (new field)
      if (ac.cargo_capacity_kg === undefined || ac.cargo_capacity_kg === null) {
        // Default based on type_code, fallback to 120 (C172)
        const defaultCapacities: Record<string, number> = {
          "C152": 50, "C172": 120, "DA40": 100, "PA28": 110, "SR22": 180,
          "TBM9": 250, "BE36": 200, "DA62": 200, "BE58": 350, "PA18": 150,
          "PC6T": 1100, "C208": 1500, "DHC6": 2000, "PC12": 700, "B350": 900
        };
        ac.cargo_capacity_kg = defaultCapacities[ac.type_code] || 120;
        needsRepair = true;
      }

      // 11. Fix is_active if missing
      if (ac.is_active === undefined) {
        ac.is_active = true;
        needsRepair = true;
      }

      // Save if any repairs were made
      if (needsRepair) {
        console.log(`[LocalFleetService] Repaired aircraft ${ac.registration}: type=${ac.type_code}, loc=${ac.location_icao}, status=${ac.status}`);
        await DatabaseManager.put("aircraft", ac, false);
      }
    }
  }

  /**
   * Check if aircraft systems are corrupted (all failed or all zero)
   */
  private isSystemsCorrupted(systems: any): boolean {
    if (!systems) return true;

    // Check if any condition is missing or zero
    const conditions = ALL_SYSTEMS_V2.map(s => systems[`${s}_condition`]);

    const allZeroOrMissing = conditions.every(c => c === undefined || c === null || c === 0);
    const anyFailed = ALL_SYSTEMS_V2.some(s => systems[`${s}_failed`]);

    return allZeroOrMissing || (anyFailed && conditions.every(c => c === 0));
  }

  /**
   * Create default healthy systems for an aircraft
   */
  private createDefaultSystems(): Aircraft["systems"] {
    const systems: any = { last_maintenance_at: new Date().toISOString() };
    for (const s of ALL_SYSTEMS_V2) {
      systems[`${s}_condition`] = 100;
      systems[`${s}_failed`] = false;
    }
    return systems;
  }

  /**
   * V2 Migration: Convert V1.6 (6 systems with pitot) to V2 (10 systems).
   * Called on-read — migrates in place and saves.
   */
  private async migrateSystemsV2(ac: Aircraft): Promise<void> {
    const sys = (ac as any).systems;
    if (!sys || typeof sys.engine_condition !== "number") return;
    if (sys.tires_condition !== undefined) return; // already V2

    // Migrate pitot → avionics (take the worst)
    if (sys.pitot_condition !== undefined) {
      sys.avionics_condition = Math.min(sys.avionics_condition ?? 100, sys.pitot_condition);
      delete sys.pitot_condition;
      delete sys.pitot_failed;
    }

    // Add new systems at 100%
    const newSystems = ["tires", "brakes", "oil", "flight_surfaces", "fuel_system"];
    for (const s of newSystems) {
      sys[`${s}_condition`] = 100;
      sys[`${s}_failed`] = false;
    }

    (ac as any).systems = sys;
    await DatabaseManager.put("aircraft", ac);
    console.log(`[LocalFleetService] Migrated aircraft ${ac.id} systems to V2 (10 systems)`);
  }

  /**
   * Get available aircraft at a specific airport
   * Only returns aircraft owned by the player (personal or company)
   */
  async getAvailableAtAirport(icao: string): Promise<AircraftListItem[]> {
    const player = await DatabaseManager.getPlayer();
    if (!player) return [];

    const company = await DatabaseManager.getCompanyByOwner(player.id);
    const allAircraft = await DatabaseManager.getAircraftAtAirport(icao);
    const catalog = await DatabaseManager.getAll<AircraftCatalog>("aircraft_catalog");

    // Filter to only player's aircraft (personal or company)
    const playerAircraft = allAircraft.filter((ac) => {
      const isPersonal = ac.owner_id === player.id;
      const isCompany = company && ac.company_id === company.id;
      return isPersonal || isCompany;
    });

    return playerAircraft
      .filter((ac) => ac.condition > 30) // Only operational aircraft
      .map((ac) => {
        const catEntry = catalog.find((c) => c.icaoType === ac.type_code || c.id === ac.type_code);
        return {
          id: ac.id,
          registration: ac.registration,
          aircraft_type: catEntry?.name || ac.type_code,
          aircraft_model: catEntry?.manufacturer || null,
          cargo_capacity_kg: catEntry?.cargoCapacityKg || 200,
        };
      });
  }

  /**
   * Get detailed aircraft information
   * Supports both NEW format (engine_condition: 100) and OLD format (engine: "ok")
   */
  async getAircraftDetails(aircraftId: string): Promise<AircraftDetails> {
    const ac = await DatabaseManager.get<Aircraft>("aircraft", aircraftId);
    if (!ac) throw new Error("Aircraft not found");

    const catalog = await DatabaseManager.getAll<AircraftCatalog>("aircraft_catalog");
    const catEntry = catalog.find((c) => c.icaoType === ac.type_code || c.id === ac.type_code);

    // Get cargo weight
    const cargo = await DatabaseManager.getInventoryAt("aircraft", aircraftId);
    const items = await DatabaseManager.getAll<Item>("items");
    const cargoKg = cargo.reduce((sum, inv) => {
      const item = items.find((i) => i.id === inv.item_code || i.code === inv.item_code);
      return sum + (item ? item.weightKg * inv.quantity : 0);
    }, 0);

    // Get systems status - handle both NEW and OLD formats
    const storedSystems = (ac as any).systems;
    let systemStatuses: Record<string, string>;

    if (storedSystems && typeof storedSystems.engine_condition === "number") {
      // V2 migration if needed
      await this.migrateSystemsV2(ac);

      // NEW format: convert condition numbers to status strings
      systemStatuses = {};
      for (const s of ALL_SYSTEMS_V2) {
        systemStatuses[s] = this.conditionToStatus(storedSystems[`${s}_condition`] ?? 100, storedSystems[`${s}_failed`] ?? false);
      }
    } else {
      // OLD format or default
      systemStatuses = storedSystems || this.getDefaultSystems(ac.condition);
    }

    // Determine owner type
    const ownerType = ac.owner_id ? "player" : "company";

    return {
      id: ac.id,
      registration: ac.registration,
      description: ac.description || null,
      aircraft_type: catEntry?.name || ac.type_code,
      aircraft_model: catEntry?.manufacturer || "Unknown",
      icao_type: ac.type_code,
      current_airport_ident: ac.location_icao,
      status: ac.status || "parked",
      required_license: catEntry?.requiredLicense || "PPL",
      owner_type: ownerType,
      fuel_gallons: ac.fuel_gallons,
      fuel_capacity_gallons: catEntry ? Math.round(catEntry.maxRangeNm / 10) : 50,
      cargo_kg: cargoKg,
      cargo_capacity_kg: ac.cargo_capacity_kg || catEntry?.cargoCapacityKg || 200,
      passengers: 0,
      passenger_capacity: ac.passenger_seats || catEntry?.passengerSeats || 4,
      condition: ac.condition / 100,
      hours: ac.flight_hours,
      system_statuses: systemStatuses,
      landing_gear: systemStatuses.landing_gear || "ok",
      engine_status: systemStatuses.engine || "ok",
      propeller_status: systemStatuses.propeller || "ok",
      electrical_status: systemStatuses.electrical || "ok",
      avionics_status: systemStatuses.avionics || "ok",
    };
  }

  /**
   * Convert condition percentage (0-100) to status string
   */
  private conditionToStatus(condition: number, failed: boolean): string {
    if (failed) return "failed";
    if (condition >= 70) return "ok";
    if (condition >= 30) return "degraded";
    return "failed";
  }

  /**
   * Get detailed aircraft information (raw format)
   */
  async getAircraftDetailsRaw(aircraftId: string): Promise<AircraftDetailsResponse> {
    const details = await this.getAircraftDetails(aircraftId);
    return {
      id: details.id,
      registration: details.registration,
      description: details.description,
      aircraft_type: details.aircraft_type,
      icao_type: details.icao_type,
      current_airport_ident: details.current_airport_ident,
      status: details.status,
      required_license: details.required_license,
      owner_type: details.owner_type,
      fuel_gallons: details.fuel_gallons,
      fuel_capacity_gallons: details.fuel_capacity_gallons,
      current_cargo_kg: details.cargo_kg,
      cargo_capacity_kg: details.cargo_capacity_kg,
      passenger_capacity: details.passenger_capacity,
      condition: details.condition,
      hours: details.hours,
    };
  }

  /**
   * Get aircraft by ID (basic info)
   */
  async getAircraft(aircraftId: string): Promise<AircraftDetails> {
    return this.getAircraftDetails(aircraftId);
  }

  /**
   * Get aircraft systems status
   * Supports both NEW format (engine_condition: 100) and OLD format (engine: "ok")
   * Returns condition as percentage (0-100) for UI display
   */
  async getAircraftSystems(aircraftId: string): Promise<AircraftSystemsStatus> {
    const ac = await DatabaseManager.get<Aircraft>("aircraft", aircraftId);
    if (!ac) throw new Error("Aircraft not found");

    const storedSystems = (ac as any).systems;
    const systemsRecord: Record<string, { condition: number; failed: boolean; status: string }> = {};
    const warnings: string[] = [];
    const critical: string[] = [];

    // Check if NEW format (has engine_condition) or OLD format (has engine)
    if (storedSystems && typeof storedSystems.engine_condition === "number") {
      // V2 migration if needed
      await this.migrateSystemsV2(ac);

      // V2 format: iterate 10 systems
      for (const name of ALL_SYSTEMS_V2) {
        const conditionKey = `${name}_condition`;
        const failedKey = `${name}_failed`;

        const conditionPercent = storedSystems[conditionKey] ?? 100;
        const failed = storedSystems[failedKey] ?? false;

        let status = "ok";
        if (failed) {
          status = "failed";
        } else if (conditionPercent < 50) {
          status = "degraded";
        }

        // Return condition as percentage (0-100) for UI
        systemsRecord[name] = {
          condition: conditionPercent,
          failed,
          status,
        };

        if (status === "degraded") warnings.push(name);
        if (status === "failed") critical.push(name);
      }
    } else {
      // OLD format (fallback): engine: "ok" | "degraded" | "failed"
      const systems = storedSystems || this.getDefaultSystems(ac.condition);

      for (const [name, status] of Object.entries(systems)) {
        const statusStr = status as string;
        // Convert status to percentage (0-100)
        const sysCondition = statusStr === "ok" ? 100 : statusStr === "degraded" ? 60 : 10;
        const failed = statusStr === "failed";

        systemsRecord[name] = {
          condition: sysCondition,
          failed,
          status: statusStr,
        };

        if (statusStr === "degraded") warnings.push(name);
        if (statusStr === "failed") critical.push(name);
      }
    }

    console.log(`[LocalFleetService] getAircraftSystems(${aircraftId}):`, systemsRecord);

    // V2: Only critical systems block takeoff
    const criticalBlocksTakeoff = critical.some(s => CRITICAL_SYSTEMS.includes(s));

    return {
      systems: systemsRecord,
      warnings,
      critical,
      can_takeoff: !criticalBlocksTakeoff,
    };
  }

  /**
   * Get aircraft cargo (for hangar display)
   */
  async getAircraftCargo(aircraftId: string): Promise<HangarCargoItem[]> {
    const inventory = await DatabaseManager.getInventoryAt("aircraft", aircraftId);
    const items = await DatabaseManager.getAll<Item>("items");

    return inventory.map((inv) => {
      const item = items.find((i) => i.id === inv.item_code || i.code === inv.item_code);
      return {
        item_code: inv.item_code,
        item_name: item?.name || inv.item_code,
        qty: inv.quantity,
        total_weight_kg: item ? item.weightKg * inv.quantity : 0,
        tier: item?.tier || 0,
        source: inv.source,
        contract_id: inv.contract_id,
      };
    });
  }

  /**
   * Get aircraft cargo (raw API response format)
   */
  async getAircraftCargoRaw(aircraftId: string): Promise<AircraftCargoResponse> {
    const cargo = await this.getAircraftCargo(aircraftId);
    const details = await this.getAircraftDetails(aircraftId);

    return {
      current_cargo_kg: cargo.reduce((sum, c) => sum + c.total_weight_kg, 0),
      cargo_capacity_kg: details.cargo_capacity_kg,
      items: cargo.map((c) => ({
        item_id: c.item_code,
        item_name: c.item_name,
        qty: c.qty,
        weight_kg: c.total_weight_kg / c.qty,
        total_weight_kg: c.total_weight_kg,
        source: c.source,
        contract_id: c.contract_id,
      })),
    };
  }

  /**
   * Load cargo onto aircraft
   */
  async loadCargo(
    aircraftId: string,
    fromLocationId: string,
    itemId: string,
    qty: number
  ): Promise<void> {
    // Get source inventory
    const sourceInventory = await DatabaseManager.getInventoryAt("airport", fromLocationId);
    const sourceItem = sourceInventory.find((i) => i.item_code === itemId);

    if (!sourceItem || sourceItem.quantity < qty) {
      throw new Error("Insufficient quantity at source");
    }

    // Seat limit check for personnel items
    const PERSONNEL_ITEMS = ["worker", "engineer", "pilot", "copilot", "passenger"];
    if (PERSONNEL_ITEMS.includes(itemId)) {
      const ac = await DatabaseManager.get<Aircraft>("aircraft", aircraftId);
      const maxSeats = ac?.passenger_seats || 0;
      const aircraftInventory = await DatabaseManager.getInventoryAt("aircraft", aircraftId);
      const currentPersonnel = aircraftInventory
        .filter((i) => PERSONNEL_ITEMS.includes(i.item_code))
        .reduce((sum, i) => sum + i.quantity, 0);
      if (currentPersonnel + qty > maxSeats) {
        throw new Error(`Not enough seats: ${currentPersonnel + qty}/${maxSeats}`);
      }
    }

    // Update source (reduce)
    if (sourceItem.quantity === qty) {
      await DatabaseManager.delete("inventory", sourceItem.id);
    } else {
      sourceItem.quantity -= qty;
      await DatabaseManager.put("inventory", sourceItem);
    }

    // Update aircraft inventory (add)
    const aircraftInventory = await DatabaseManager.getInventoryAt("aircraft", aircraftId);
    const existingItem = aircraftInventory.find((i) => i.item_code === itemId);

    if (existingItem) {
      existingItem.quantity += qty;
      await DatabaseManager.put("inventory", existingItem);
    } else {
      const newItem: InventoryItem = {
        id: this.generateUUID(),
        location_type: "aircraft",
        location_id: aircraftId,
        item_code: itemId,
        quantity: qty,
      };
      await DatabaseManager.put("inventory", newItem);
    }

    console.log(`[LocalFleetService] Loaded ${qty}x ${itemId} onto aircraft ${aircraftId}`);
  }

  /**
   * Unload cargo from aircraft
   */
  async unloadCargo(
    aircraftId: string,
    toLocationId: string,
    itemId: string,
    qty: number
  ): Promise<void> {
    // Get aircraft inventory
    const aircraftInventory = await DatabaseManager.getInventoryAt("aircraft", aircraftId);
    const sourceItem = aircraftInventory.find((i) => i.item_code === itemId);

    if (!sourceItem || sourceItem.quantity < qty) {
      throw new Error("Insufficient quantity on aircraft");
    }

    // Update aircraft (reduce)
    if (sourceItem.quantity === qty) {
      await DatabaseManager.delete("inventory", sourceItem.id);
    } else {
      sourceItem.quantity -= qty;
      await DatabaseManager.put("inventory", sourceItem);
    }

    // Update destination inventory (add)
    const destInventory = await DatabaseManager.getInventoryAt("airport", toLocationId);
    const existingItem = destInventory.find((i) => i.item_code === itemId);

    if (existingItem) {
      existingItem.quantity += qty;
      await DatabaseManager.put("inventory", existingItem);
    } else {
      const newItem: InventoryItem = {
        id: this.generateUUID(),
        location_type: "airport",
        location_id: toLocationId,
        item_code: itemId,
        quantity: qty,
      };
      await DatabaseManager.put("inventory", newItem);
    }

    console.log(`[LocalFleetService] Unloaded ${qty}x ${itemId} from aircraft ${aircraftId}`);
  }

  /**
   * Get repair quote for aircraft
   * Supports both NEW format (engine_condition: 100) and OLD format (engine: "ok")
   */
  async getRepairQuote(aircraftId: string): Promise<RepairQuote> {
    const ac = await DatabaseManager.get<Aircraft>("aircraft", aircraftId);
    if (!ac) throw new Error("Aircraft not found");

    const storedSystems = (ac as any).systems;
    const quotes: Record<string, { current_condition: number; target_condition: number; cost: number }> = {};
    let totalCost = 0;

    // V2: Get aircraft price for repair cost calculation
    const catalog = await DatabaseManager.getAll<AircraftCatalog>("aircraft_catalog");
    const catEntry = catalog.find((c) => c.icaoType === ac.type_code || c.id === ac.type_code);
    const aircraftPrice = ac.purchase_price || catEntry?.basePrice || 100000;

    if (storedSystems && typeof storedSystems.engine_condition === "number") {
      // V2 migration if needed
      await this.migrateSystemsV2(ac);

      // V2 format: use REPAIR_COST_RATE × aircraft_price × (100 - condition)
      for (const name of ALL_SYSTEMS_V2) {
        const conditionKey = `${name}_condition`;
        const failedKey = `${name}_failed`;

        const conditionPercent = storedSystems[conditionKey] ?? 100;
        const failed = storedSystems[failedKey] ?? false;
        const currentCondition = conditionPercent / 100;

        // Only quote if not at 100% or failed
        if (currentCondition < 1 || failed) {
          const rate = REPAIR_COST_RATE[name] || 0.0005;
          const cost = Math.round(rate * aircraftPrice * (100 - conditionPercent));
          quotes[name] = {
            current_condition: currentCondition,
            target_condition: 1,
            cost,
          };
          totalCost += cost;
        }
      }
    } else {
      // OLD format: engine: "ok" | "degraded" | "failed"
      const systems = storedSystems || this.getDefaultSystems(ac.condition);

      for (const [name, status] of Object.entries(systems)) {
        const statusStr = status as string;
        if (statusStr !== "ok") {
          const currentCondition = statusStr === "degraded" ? 0.6 : 0.2;
          const rate = REPAIR_COST_RATE[name] || 0.0005;
          const cost = Math.round(rate * aircraftPrice * (1 - currentCondition) * 100);
          quotes[name] = {
            current_condition: currentCondition,
            target_condition: 1,
            cost,
          };
          totalCost += cost;
        }
      }
    }

    return {
      quotes,
      total_cost: totalCost,
      total_cost_all_systems: totalCost,
    };
  }

  /**
   * Repair aircraft systems
   * Supports both NEW format (engine_condition: 100) and OLD format (engine: "ok")
   */
  async repairAircraft(
    aircraftId: string,
    systemsToRepair: string[],
    payFrom: "player" | "company"
  ): Promise<void> {
    const quote = await this.getRepairQuote(aircraftId);

    // If "all" is passed, repair all systems with quotes
    const actualSystems = systemsToRepair.includes("all")
      ? Object.keys(quote.quotes)
      : systemsToRepair;

    const cost = actualSystems.reduce((sum, sys) => sum + (quote.quotes[sys]?.cost || 0), 0);

    // Get payer and check balance
    const player = await DatabaseManager.getPlayer();
    if (!player) throw new Error("No player found");

    if (payFrom === "player") {
      if (player.money < cost) throw new Error("Insufficient funds");
      player.money -= cost;
      player.money = Math.round(player.money);
      await DatabaseManager.savePlayer(player);
    } else {
      const company = await DatabaseManager.getCompanyByOwner(player.id);
      if (!company || company.balance < cost) throw new Error("Insufficient company funds");
      company.balance -= cost;
      company.balance = Math.round(company.balance);
      await DatabaseManager.put("company", company);
    }

    // Update aircraft systems
    const ac = await DatabaseManager.get<Aircraft>("aircraft", aircraftId);
    if (!ac) throw new Error("Aircraft not found");

    const storedSystems = (ac as any).systems;

    if (storedSystems && typeof storedSystems.engine_condition === "number") {
      // NEW format: set conditions to 100, failed to false
      for (const sys of actualSystems) {
        const conditionKey = `${sys}_condition`;
        const failedKey = `${sys}_failed`;
        storedSystems[conditionKey] = 100;
        storedSystems[failedKey] = false;
      }
      storedSystems.last_maintenance_at = new Date().toISOString();
      (ac as any).systems = storedSystems;

      // Recalculate overall condition from all 10 systems
      const totalCondition = ALL_SYSTEMS_V2.reduce((sum, name) => {
        return sum + (storedSystems[`${name}_condition`] ?? 100);
      }, 0);
      ac.condition = Math.round(totalCondition / ALL_SYSTEMS_V2.length);
    } else {
      // OLD format
      const systems = storedSystems || this.getDefaultSystems(ac.condition);
      for (const sys of actualSystems) {
        if (systems[sys] !== undefined) {
          systems[sys] = "ok";
        }
      }
      (ac as any).systems = systems;

      // Update overall condition
      const okCount = Object.values(systems).filter((s) => s === "ok").length;
      ac.condition = Math.round((okCount / Object.keys(systems).length) * 100);
    }

    await DatabaseManager.put("aircraft", ac);
    console.log(`[LocalFleetService] Repaired systems ${actualSystems.join(", ")} for ${cost} credits`);
  }

  /**
   * Sync fuel from simulator
   */
  async syncFuel(
    aircraftId: string,
    fuelGallons: number,
    _fuelCapacityGallons: number
  ): Promise<AircraftDetails> {
    await DatabaseManager.updateAircraftFuel(aircraftId, fuelGallons);
    return this.getAircraftDetails(aircraftId);
  }

  /**
   * Apply background wear to aircraft
   * Updates both overall condition and individual system conditions
   */
  async applyBackgroundWear(
    aircraftId: string,
    flightTimeMinutes: number,
    avgAltitude: number,
    avgSpeed: number
  ): Promise<void> {
    const ac = await DatabaseManager.get<Aircraft>("aircraft", aircraftId);
    if (!ac) throw new Error("Aircraft not found");

    const flightHours = flightTimeMinutes / 60;

    // Update flight hours
    ac.flight_hours += flightHours;

    // Update systems if using NEW format
    const storedSystems = (ac as any).systems;
    if (storedSystems && typeof storedSystems.engine_condition === "number") {
      // V2 migration if needed
      await this.migrateSystemsV2(ac);

      // V2: Apply per-system wear from WEAR_PER_HOUR constants
      for (const name of ALL_SYSTEMS_V2) {
        const conditionKey = `${name}_condition`;
        const currentCondition = storedSystems[conditionKey] ?? 100;
        const wearRate = WEAR_PER_HOUR[name] || 1.0;
        const systemWear = flightHours * wearRate;

        storedSystems[conditionKey] = Math.max(0, currentCondition - systemWear);
      }

      // V2: Apply G-force wear (avgSpeed param is actually maxGForce from FlightTracker)
      const maxGForce = avgSpeed;
      if (maxGForce > 0) {
        for (const [threshold, wearMap] of GFORCE_WEAR) {
          if (maxGForce >= threshold) {
            for (const [sys, wear] of Object.entries(wearMap)) {
              const key = `${sys}_condition`;
              storedSystems[key] = Math.max(0, (storedSystems[key] ?? 100) - wear);
            }
            break; // Only apply the highest matched threshold
          }
        }
      }

      (ac as any).systems = storedSystems;

      // Recalculate overall condition from all 10 systems
      const totalCondition = ALL_SYSTEMS_V2.reduce((sum, name) => {
        return sum + (storedSystems[`${name}_condition`] ?? 100);
      }, 0);
      ac.condition = Math.round(totalCondition / ALL_SYSTEMS_V2.length);
    } else {
      // OLD format: just update overall condition
      const baseWearPerHour = 0.1;
      ac.condition = Math.max(0, ac.condition - flightHours * baseWearPerHour);
    }

    await DatabaseManager.put("aircraft", ac);
    console.log(`[LocalFleetService] Applied ${wearPercent.toFixed(2)}% wear to aircraft ${aircraftId} (systems updated)`);
  }

  /**
   * Apply landing damage to aircraft based on landing FPM
   * Thresholds:
   * - < 200 FPM: Normal landing, no damage
   * - 200-400 FPM: Firm landing, minor landing gear wear
   * - 400-600 FPM: Hard landing, significant landing gear damage
   * - > 600 FPM: Very hard landing, major damage to multiple systems
   */
  async applyLandingDamage(
    aircraftId: string,
    landingFpm: number,
    missionId?: string
  ): Promise<{ damaged: boolean; systemsAffected: string[] }> {
    const ac = await DatabaseManager.get<Aircraft>("aircraft", aircraftId);
    if (!ac) throw new Error("Aircraft not found");

    const fpm = Math.abs(landingFpm);
    const systemsAffected: string[] = [];
    let damaged = false;

    // No damage for normal landings
    if (fpm < 200) {
      console.log(`[LocalFleetService] Normal landing (${fpm} FPM), no damage applied`);
      return { damaged: false, systemsAffected: [] };
    }

    const storedSystems = (ac as any).systems;

    if (storedSystems && typeof storedSystems.engine_condition === "number") {
      // V2 migration if needed
      await this.migrateSystemsV2(ac);

      // V2: Use LANDING_WEAR table from spec A5
      for (const [minFpm, maxFpm, wearMap] of LANDING_WEAR) {
        if (fpm >= minFpm && fpm < maxFpm) {
          for (const [sys, wear] of Object.entries(wearMap)) {
            const key = `${sys}_condition`;
            const before = storedSystems[key] ?? 100;
            storedSystems[key] = Math.max(0, before - wear);
            if (!systemsAffected.includes(sys)) systemsAffected.push(sys);
          }
          damaged = true;

          // Determine severity for logging
          const severity = fpm >= 1000 ? "critical" : fpm >= 700 ? "severe" : fpm >= 400 ? "moderate" : "minor";
          for (const sys of systemsAffected) {
            const wear = wearMap[sys] || 0;
            if (wear > 0) {
              await this.logDamage(aircraftId, missionId, "hard_landing", sys, severity, wear);
            }
          }
          break;
        }
      }

      // Check for system failures (condition < CRITICAL_THRESHOLD)
      for (const sys of CRITICAL_SYSTEMS) {
        if ((storedSystems[`${sys}_condition`] ?? 100) < CRITICAL_THRESHOLD) {
          storedSystems[`${sys}_failed`] = true;
        }
      }

      (ac as any).systems = storedSystems;

      // Recalculate overall condition from all 10 systems
      const totalCondition = ALL_SYSTEMS_V2.reduce((sum, name) => {
        return sum + (storedSystems[`${name}_condition`] ?? 100);
      }, 0);
      ac.condition = Math.round(totalCondition / ALL_SYSTEMS_V2.length);
    } else {
      // OLD format: just reduce overall condition
      if (fpm >= 400) {
        const damage = Math.min(30, (fpm - 400) * 0.1);
        ac.condition = Math.max(0, ac.condition - damage);
        damaged = true;
        systemsAffected.push("overall");
      }
    }

    if (damaged) {
      await DatabaseManager.put("aircraft", ac);
      console.log(`[LocalFleetService] Applied landing damage (${fpm} FPM) to aircraft ${aircraftId}:`, systemsAffected);
    }

    return { damaged, systemsAffected };
  }

  /**
   * Log damage to aircraft damage log
   */
  private async logDamage(
    aircraftId: string,
    missionId: string | undefined,
    damageType: "wear" | "hard_landing" | "overspeed" | "overstress" | "crash",
    systemAffected: string,
    severity: "minor" | "moderate" | "severe" | "critical",
    damageAmount: number
  ): Promise<void> {
    const log = {
      id: this.generateUUID(),
      aircraft_id: aircraftId,
      mission_id: missionId,
      damage_type: damageType,
      system_affected: systemAffected,
      severity,
      condition_before: 100, // Simplified - would need actual tracking
      condition_after: 100 - damageAmount,
      description: `${severity} ${damageType} damage to ${systemAffected} (${damageAmount.toFixed(1)}%)`,
      created_at: new Date().toISOString(),
    };

    await DatabaseManager.put("aircraft_damage_log", log);
  }

  /**
   * Update aircraft registration
   */
  async updateRegistration(aircraftId: string, registration: string): Promise<AircraftDetails> {
    const ac = await DatabaseManager.get<Aircraft>("aircraft", aircraftId);
    if (!ac) throw new Error("Aircraft not found");

    ac.registration = registration;
    await DatabaseManager.put("aircraft", ac);

    return this.getAircraftDetails(aircraftId);
  }

  /**
   * Update aircraft description/note
   */
  async updateDescription(aircraftId: string, description: string): Promise<AircraftDetails> {
    const ac = await DatabaseManager.get<Aircraft>("aircraft", aircraftId);
    if (!ac) throw new Error("Aircraft not found");

    ac.description = description;
    await DatabaseManager.put("aircraft", ac);

    return this.getAircraftDetails(aircraftId);
  }

  /**
   * Update aircraft location
   */
  async updateLocation(aircraftId: string, icao: string): Promise<void> {
    await DatabaseManager.updateAircraftLocation(aircraftId, icao);
    console.log(`[LocalFleetService] Aircraft ${aircraftId} moved to ${icao}`);
  }

  // ─────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────

  private getDefaultSystems(conditionPercent: number): Record<string, string> {
    const condition = conditionPercent / 100;
    const getStatus = (threshold: number) => {
      if (condition > threshold + 0.2) return "ok";
      if (condition > threshold) return "degraded";
      return "failed";
    };

    const result: Record<string, string> = {};
    for (const s of ALL_SYSTEMS_V2) {
      result[s] = getStatus(s === "engine" ? 0.3 : s === "landing_gear" ? 0.25 : 0.2);
    }
    return result;
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

export const localFleetService = new LocalFleetServiceClass();
