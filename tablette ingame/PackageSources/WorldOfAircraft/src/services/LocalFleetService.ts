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

    // 1. Get personal aircraft (owned directly by player)
    const personalAircraft = await DatabaseManager.getAircraftByOwner(player.id);
    console.log(`[LocalFleetService] Personal aircraft for player ${player.id}: ${personalAircraft.length}`);
    for (const ac of personalAircraft) {
      const catEntry = catalog.find((c) => c.icaoType === ac.type_code || c.id === ac.type_code);
      result.push({
        id: ac.id,
        registration: ac.registration,
        aircraft_type: catEntry?.name || ac.type_code,
        icao_type: ac.type_code,
        current_airport_ident: ac.location_icao,
        status: ac.condition > 50 ? "operational" : "needs_repair",
        required_license: catEntry?.requiredLicense || "PPL",
        owner_type: "player",
        thumbnail_url: null,
      });
    }

    // 2. Get company aircraft (if player has a company)
    const company = await DatabaseManager.getCompanyByOwner(player.id);
    if (company) {
      const companyAircraft = await DatabaseManager.getAircraftByCompany(company.id);
      for (const ac of companyAircraft) {
        const catEntry = catalog.find((c) => c.icaoType === ac.type_code || c.id === ac.type_code);
        result.push({
          id: ac.id,
          registration: ac.registration,
          aircraft_type: catEntry?.name || ac.type_code,
          icao_type: ac.type_code,
          current_airport_ident: ac.location_icao,
          status: ac.condition > 50 ? "operational" : "needs_repair",
          required_license: catEntry?.requiredLicense || "PPL",
          owner_type: "company",
          thumbnail_url: null,
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
    const defaultLocation = player?.nationality === "FR" ? "LFPG" : "KJFK";

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
    const conditions = [
      systems.engine_condition,
      systems.propeller_condition,
      systems.landing_gear_condition,
      systems.electrical_condition,
      systems.avionics_condition,
      systems.pitot_condition,
    ];

    const allZeroOrMissing = conditions.every(c => c === undefined || c === null || c === 0);
    const anyFailed = systems.engine_failed || systems.propeller_failed ||
                      systems.landing_gear_failed || systems.electrical_failed ||
                      systems.avionics_failed || systems.pitot_failed;

    return allZeroOrMissing || (anyFailed && conditions.every(c => c === 0));
  }

  /**
   * Create default healthy systems for an aircraft
   */
  private createDefaultSystems(): Aircraft["systems"] {
    return {
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
      last_maintenance_at: new Date().toISOString(),
    };
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
      // NEW format: convert condition numbers to status strings
      systemStatuses = {
        engine: this.conditionToStatus(storedSystems.engine_condition, storedSystems.engine_failed),
        propeller: this.conditionToStatus(storedSystems.propeller_condition, storedSystems.propeller_failed),
        landing_gear: this.conditionToStatus(storedSystems.landing_gear_condition, storedSystems.landing_gear_failed),
        electrical: this.conditionToStatus(storedSystems.electrical_condition, storedSystems.electrical_failed),
        avionics: this.conditionToStatus(storedSystems.avionics_condition, storedSystems.avionics_failed),
        pitot: this.conditionToStatus(storedSystems.pitot_condition, storedSystems.pitot_failed),
      };
    } else {
      // OLD format or default
      systemStatuses = storedSystems || this.getDefaultSystems(ac.condition);
    }

    // Determine owner type
    const ownerType = ac.owner_id ? "player" : "company";

    return {
      id: ac.id,
      registration: ac.registration,
      aircraft_type: catEntry?.name || ac.type_code,
      aircraft_model: catEntry?.manufacturer || "Unknown",
      icao_type: ac.type_code,
      current_airport_ident: ac.location_icao,
      status: ac.condition > 50 ? "operational" : "needs_repair",
      required_license: catEntry?.requiredLicense || "PPL",
      owner_type: ownerType,
      fuel_gallons: ac.fuel_gallons,
      fuel_capacity_gallons: catEntry ? Math.round(catEntry.maxRangeNm / 10) : 50,
      cargo_kg: cargoKg,
      cargo_capacity_kg: catEntry?.cargoCapacityKg || 200,
      passengers: 0,
      passenger_capacity: catEntry?.category === "airliner" ? 100 : 4,
      condition: ac.condition / 100,
      hours: ac.flight_hours,
      landing_gear: systemStatuses.landing_gear,
      engine_status: systemStatuses.engine,
      propeller_status: systemStatuses.propeller,
      electrical_status: systemStatuses.electrical,
      pitot_status: systemStatuses.pitot,
      avionics_status: systemStatuses.avionics,
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
      // NEW format: engine_condition: 0-100, engine_failed: boolean
      const systemNames = ["engine", "propeller", "landing_gear", "electrical", "avionics", "pitot"];

      for (const name of systemNames) {
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

    return {
      systems: systemsRecord,
      warnings,
      critical,
      can_takeoff: critical.length === 0,
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
        item_name: item?.name || inv.item_code,
        qty: inv.quantity,
        total_weight_kg: item ? item.weightKg * inv.quantity : 0,
        tier: item?.tier || 0,
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
        item_id: c.item_name, // Note: would need item_id stored
        item_name: c.item_name,
        qty: c.qty,
        weight_kg: c.total_weight_kg / c.qty,
        total_weight_kg: c.total_weight_kg,
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

    // Base repair cost per system
    const baseCosts: Record<string, number> = {
      engine: 5000,
      propeller: 2000,
      landing_gear: 3000,
      electrical: 1500,
      avionics: 4000,
      pitot: 500,
    };

    const systemNames = ["engine", "propeller", "landing_gear", "electrical", "avionics", "pitot"];

    if (storedSystems && typeof storedSystems.engine_condition === "number") {
      // NEW format: engine_condition: 0-100
      for (const name of systemNames) {
        const conditionKey = `${name}_condition`;
        const failedKey = `${name}_failed`;

        const conditionPercent = storedSystems[conditionKey] ?? 100;
        const failed = storedSystems[failedKey] ?? false;
        const currentCondition = conditionPercent / 100;

        // Only quote if not at 100% or failed
        if (currentCondition < 1 || failed) {
          const cost = Math.round((1 - currentCondition) * (baseCosts[name] || 1000));
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
          const cost = Math.round((1 - currentCondition) * (baseCosts[name] || 1000));
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
      await DatabaseManager.savePlayer(player);
    } else {
      const company = await DatabaseManager.getCompanyByOwner(player.id);
      if (!company || company.balance < cost) throw new Error("Insufficient company funds");
      company.balance -= cost;
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

      // Recalculate overall condition from all systems
      const systemNames = ["engine", "propeller", "landing_gear", "electrical", "avionics", "pitot"];
      const totalCondition = systemNames.reduce((sum, name) => {
        return sum + (storedSystems[`${name}_condition`] ?? 100);
      }, 0);
      ac.condition = Math.round(totalCondition / systemNames.length);
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

    // Calculate wear factors based on flight conditions
    const baseWearPerHour = 0.1; // 0.1% base wear per hour
    const altitudeFactor = Math.max(1, avgAltitude / 10000); // More wear at higher altitude
    const speedFactor = Math.max(1, avgSpeed / 200); // More wear at higher speed

    const flightHours = flightTimeMinutes / 60;
    const wearPercent = flightHours * baseWearPerHour * altitudeFactor * speedFactor;

    // Update flight hours
    ac.flight_hours += flightHours;

    // Update systems if using NEW format
    const storedSystems = (ac as any).systems;
    if (storedSystems && typeof storedSystems.engine_condition === "number") {
      // Apply varying wear to each system (some degrade faster than others)
      const systemWearRates: Record<string, number> = {
        engine: 1.2,        // Engine wears faster
        propeller: 1.0,
        landing_gear: 0.3,  // Landing gear wears less during flight
        electrical: 0.8,
        avionics: 0.5,      // Avionics are more protected
        pitot: 0.6,
      };

      const systemNames = ["engine", "propeller", "landing_gear", "electrical", "avionics", "pitot"];

      for (const name of systemNames) {
        const conditionKey = `${name}_condition`;
        const currentCondition = storedSystems[conditionKey] ?? 100;
        const wearRate = systemWearRates[name] || 1.0;
        const systemWear = wearPercent * wearRate;

        storedSystems[conditionKey] = Math.max(0, currentCondition - systemWear);
      }

      (ac as any).systems = storedSystems;

      // Recalculate overall condition from systems average
      const totalCondition = systemNames.reduce((sum, name) => {
        return sum + (storedSystems[`${name}_condition`] ?? 100);
      }, 0);
      ac.condition = Math.round(totalCondition / systemNames.length);
    } else {
      // OLD format: just update overall condition
      ac.condition = Math.max(0, ac.condition - wearPercent);
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
      // NEW format: apply damage to specific systems

      // Firm landing (200-400 FPM): Minor landing gear wear
      if (fpm >= 200 && fpm < 400) {
        const damage = (fpm - 200) * 0.05; // 0-10% damage
        storedSystems.landing_gear_condition = Math.max(0, storedSystems.landing_gear_condition - damage);
        systemsAffected.push("landing_gear");
        damaged = true;

        await this.logDamage(aircraftId, missionId, "hard_landing", "landing_gear", "minor", damage);
      }

      // Hard landing (400-600 FPM): Significant landing gear damage + minor propeller
      if (fpm >= 400 && fpm < 600) {
        const gearDamage = 10 + (fpm - 400) * 0.1; // 10-30% damage
        const propDamage = (fpm - 400) * 0.025; // 0-5% damage

        storedSystems.landing_gear_condition = Math.max(0, storedSystems.landing_gear_condition - gearDamage);
        storedSystems.propeller_condition = Math.max(0, storedSystems.propeller_condition - propDamage);
        systemsAffected.push("landing_gear", "propeller");
        damaged = true;

        await this.logDamage(aircraftId, missionId, "hard_landing", "landing_gear", "moderate", gearDamage);
        if (propDamage > 0) {
          await this.logDamage(aircraftId, missionId, "hard_landing", "propeller", "minor", propDamage);
        }
      }

      // Very hard landing (>600 FPM): Major damage to multiple systems
      if (fpm >= 600) {
        const severity = fpm >= 800 ? "critical" : "severe";
        const gearDamage = 30 + (fpm - 600) * 0.15; // 30-60%+ damage
        const propDamage = 10 + (fpm - 600) * 0.05; // 10-20%+ damage
        const engineDamage = (fpm - 600) * 0.05; // 0-10%+ damage
        const avionicsDamage = (fpm - 600) * 0.025; // 0-5%+ damage

        storedSystems.landing_gear_condition = Math.max(0, storedSystems.landing_gear_condition - gearDamage);
        storedSystems.propeller_condition = Math.max(0, storedSystems.propeller_condition - propDamage);
        storedSystems.engine_condition = Math.max(0, storedSystems.engine_condition - engineDamage);
        storedSystems.avionics_condition = Math.max(0, storedSystems.avionics_condition - avionicsDamage);
        systemsAffected.push("landing_gear", "propeller", "engine", "avionics");
        damaged = true;

        // Check for system failures on very hard landings
        if (storedSystems.landing_gear_condition < 20) {
          storedSystems.landing_gear_failed = true;
        }

        await this.logDamage(aircraftId, missionId, "hard_landing", "landing_gear", severity, gearDamage);
        await this.logDamage(aircraftId, missionId, "hard_landing", "propeller", "moderate", propDamage);
        await this.logDamage(aircraftId, missionId, "hard_landing", "engine", "minor", engineDamage);
      }

      (ac as any).systems = storedSystems;

      // Recalculate overall condition
      const systemNames = ["engine", "propeller", "landing_gear", "electrical", "avionics", "pitot"];
      const totalCondition = systemNames.reduce((sum, name) => {
        return sum + (storedSystems[`${name}_condition`] ?? 100);
      }, 0);
      ac.condition = Math.round(totalCondition / systemNames.length);
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

    return {
      engine: getStatus(0.3),
      propeller: getStatus(0.2),
      landing_gear: getStatus(0.25),
      electrical: getStatus(0.15),
      avionics: getStatus(0.2),
      pitot: getStatus(0.1),
    };
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
