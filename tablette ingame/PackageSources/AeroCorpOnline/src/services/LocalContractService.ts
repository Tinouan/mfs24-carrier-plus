/**
 * LocalContractService - Contract generation, acceptance, and completion
 * Handles AI-generated contracts for Solo mode
 */

import { DatabaseManager, Item, Airport, InventoryItem, Aircraft } from "../managers/DatabaseManager";
import type { ContractOffer, ActiveContract, ContractCargoItem } from "../types";
import { positionState } from "../state/positionState";

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════

const TARGET_AI_CONTRACTS = 10;
const MAX_ACTIVE_CONTRACTS = 3;

// Distance ranges (nm)
const MIN_DISTANCE_NM = 20;
const MAX_DISTANCE_NM = 800;

// Reward formula: base CR per nm per 100kg
const REWARD_PER_NM_PER_100KG = 2;

// License requirements by distance
const LICENSE_BY_DISTANCE: { maxNm: number; license: string }[] = [
  { maxNm: 150, license: "PPL" },
  { maxNm: 400, license: "IR" },
  { maxNm: 600, license: "CPL" },
  { maxNm: Infinity, license: "ATPL" },
];

// Passenger names for description generation
const PASSENGER_TYPES = [
  "passagers", "techniciens", "ingenieurs", "ouvriers", "cadres",
  "medecins", "touristes", "journalistes", "inspecteurs", "consultants",
];

// AI creator names
const AI_CREATOR_NAMES = [
  "IA Transport", "AirCargo Express", "SkyFreight", "EuroLogistics",
  "Atlas Cargo", "Nordic Air Services", "MedFly", "TransCont",
];

// ═══════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════

class LocalContractServiceClass {

  // ─────────────────────────────────────────────────────────
  // PUBLIC: Get contracts
  // ─────────────────────────────────────────────────────────

  async getAvailableContracts(): Promise<ContractOffer[]> {
    const contracts = await DatabaseManager.getAvailableContracts();
    // Sort by reward descending
    return contracts.sort((a, b) => b.reward_cr - a.reward_cr);
  }

  async getActiveContracts(): Promise<ActiveContract[]> {
    const player = await DatabaseManager.getPlayer();
    if (!player) return [];
    return DatabaseManager.getActiveContracts(player.id);
  }

  async getCompletedContracts(): Promise<ActiveContract[]> {
    const player = await DatabaseManager.getPlayer();
    if (!player) return [];
    return DatabaseManager.getCompletedContracts(player.id);
  }

  // ─────────────────────────────────────────────────────────
  // PUBLIC: Generate AI contracts
  // ─────────────────────────────────────────────────────────

  async generateAIContracts(playerAirport: string): Promise<void> {
    // Count existing AI offers for THIS airport only
    const existing = await DatabaseManager.getAvailableContracts();
    const aiContracts = existing.filter(c => c.creator_type === "ai" && c.status === "available" && c.origin_icao === playerAirport);

    // Generate up to TARGET for this airport
    if (aiContracts.length >= TARGET_AI_CONTRACTS) return;

    const toGenerate = TARGET_AI_CONTRACTS - aiContracts.length;
    const airports = DatabaseManager.getAirportsCache();
    const playerAirportData = airports.find(a => a.ident === playerAirport);
    if (!playerAirportData) return;

    const items = await DatabaseManager.getAll<Item>("items");

    for (let i = 0; i < toGenerate; i++) {
      const contract = this.createRandomContract(playerAirportData, airports, items);
      if (contract) {
        await DatabaseManager.saveContractOffer(contract);
      }
    }

    console.log(`[LocalContractService] Generated ${toGenerate} AI contracts from ${playerAirport}`);
  }

  // ─────────────────────────────────────────────────────────
  // PUBLIC: Accept contract
  // ─────────────────────────────────────────────────────────

  async acceptContract(offerId: string, wallet: "player" | "company"): Promise<ActiveContract> {
    const player = await DatabaseManager.getPlayer();
    if (!player) throw new Error("No player found");

    const offer = await DatabaseManager.getContractOffer(offerId);
    if (!offer) throw new Error("Contract not found");
    if (offer.status !== "available") throw new Error("Contract no longer available");

    // Check max active
    const actifs = await DatabaseManager.getActiveContracts(player.id);
    const inProgress = actifs.filter(c => c.status === "in_progress");
    if (inProgress.length >= MAX_ACTIVE_CONTRACTS) throw new Error("Max 3 active contracts");

    // Mark offer as accepted
    offer.status = "accepted";
    offer.accepted_by = player.id;
    offer.accepted_at = new Date().toISOString();
    await DatabaseManager.saveContractOffer(offer);

    // Create active contract
    const contract: ActiveContract = {
      id: this.generateUUID(),
      offer_id: offer.id,
      pilot_id: player.id,
      pilot_name: player.name,
      origin_icao: offer.origin_icao,
      destination_icao: offer.destination_icao,
      distance_nm: offer.distance_nm,
      cargo_type: offer.cargo_type,
      cargo_description: offer.cargo_description,
      cargo_weight_kg: offer.cargo_weight_kg,
      cargo_items: offer.cargo_items,
      passenger_count: offer.passenger_count,
      reward_cr: offer.reward_cr,
      accepted_at: new Date().toISOString(),
      status: "in_progress",
      wallet: wallet,
    };

    await DatabaseManager.saveActiveContract(contract);

    // Spawn contract cargo at origin airport inventory
    const ownerType = wallet === "company" ? "company" : "player";
    if (offer.cargo_items && offer.cargo_items.length > 0) {
      for (const item of offer.cargo_items) {
        const invItem: InventoryItem = {
          id: this.generateUUID(),
          location_type: "airport",
          location_id: offer.origin_icao,
          item_code: item.item_code,
          quantity: item.quantity,
          owner_type: ownerType,
          source: "contract",
          contract_id: contract.id,
          created_at: new Date().toISOString(),
        };
        await DatabaseManager.put("inventory", invItem);
        console.log(`[Contracts] Spawned ${item.quantity}x ${item.item_code} at ${offer.origin_icao}`);
      }
    }
    if (offer.passenger_count && offer.passenger_count > 0) {
      const invItem: InventoryItem = {
        id: this.generateUUID(),
        location_type: "airport",
        location_id: offer.origin_icao,
        item_code: "passenger",
        quantity: offer.passenger_count,
        owner_type: ownerType,
        source: "contract",
        contract_id: contract.id,
        created_at: new Date().toISOString(),
      };
      await DatabaseManager.put("inventory", invItem);
      console.log(`[Contracts] Spawned ${offer.passenger_count} passengers at ${offer.origin_icao}`);
    }

    await DatabaseManager.forceSave();

    console.log(`[LocalContractService] Accepted contract: ${offer.origin_icao} -> ${offer.destination_icao} (${offer.reward_cr} CR)`);
    return contract;
  }

  // ─────────────────────────────────────────────────────────
  // PUBLIC: Complete contract
  // ─────────────────────────────────────────────────────────

  async completeContract(contractId: string): Promise<{ reward: number; xp: number }> {
    const player = await DatabaseManager.getPlayer();
    if (!player) throw new Error("No player found");

    const contract = await DatabaseManager.getActiveContract(contractId);
    if (!contract) throw new Error("Contract not found");
    if (contract.status !== "in_progress") throw new Error("Contract not in progress");

    // Success
    contract.status = "completed";
    contract.completed_at = new Date().toISOString();

    // Calculate XP bonus
    const xpEarned = Math.round(contract.distance_nm * 0.5 + contract.cargo_weight_kg * 0.1);
    contract.xp_earned = xpEarned;

    // Credit reward
    const reward = contract.reward_cr;
    if (contract.wallet === "company") {
      const company = await DatabaseManager.getCompanyByOwner(player.id);
      if (company) {
        company.balance += reward;
        company.balance = Math.round(company.balance);
        await DatabaseManager.put("company", company);
        await DatabaseManager.saveTransaction({
          timestamp: new Date().toISOString(),
          type: "contract_reward",
          amount: reward,
          balance_after: company.balance,
          wallet: "company",
          description: `Contract: ${contract.origin_icao} > ${contract.destination_icao}`,
          related_id: contractId,
          airport_icao: contract.destination_icao,
        });
      }
    } else {
      player.money += reward;
      player.money = Math.round(player.money);
      player.xp += xpEarned;
      await DatabaseManager.savePlayer(player);
      await DatabaseManager.saveTransaction({
        timestamp: new Date().toISOString(),
        type: "contract_reward",
        amount: reward,
        balance_after: player.money,
        wallet: "player",
        description: `Contract: ${contract.origin_icao} > ${contract.destination_icao}`,
        related_id: contractId,
        airport_icao: contract.destination_icao,
      });
    }

    await DatabaseManager.saveActiveContract(contract);

    // Remove delivered cargo from aircraft
    await this.removeContractCargoFromAircraft(contract);

    await DatabaseManager.forceSave();

    console.log(`[LocalContractService] Completed contract: ${contract.origin_icao} > ${contract.destination_icao} (+${reward} CR, +${xpEarned} XP)`);
    return { reward, xp: xpEarned };
  }

  // ─────────────────────────────────────────────────────────
  // PUBLIC: Cancel contract
  // ─────────────────────────────────────────────────────────

  async cancelContract(contractId: string): Promise<void> {
    const contract = await DatabaseManager.getActiveContract(contractId);
    if (!contract) throw new Error("Contract not found");
    if (contract.status !== "in_progress") throw new Error("Contract not in progress");

    contract.status = "cancelled";
    contract.failure_reason = "cancelled";
    contract.completed_at = new Date().toISOString();
    await DatabaseManager.saveActiveContract(contract);

    // Remove spawned contract cargo from origin airport
    await DatabaseManager.removeContractCargo(contractId, contract.origin_icao);
    console.log(`[Contracts] Removed contract cargo from ${contract.origin_icao}`);

    // Restore offer to available
    const offer = await DatabaseManager.getContractOffer(contract.offer_id);
    if (offer) {
      offer.status = "available";
      offer.accepted_by = undefined;
      offer.accepted_at = undefined;
      await DatabaseManager.saveContractOffer(offer);
    }

    await DatabaseManager.forceSave();
    console.log(`[LocalContractService] Cancelled contract: ${contract.origin_icao} > ${contract.destination_icao}`);
  }

  // ─────────────────────────────────────────────────────────
  // PUBLIC: Refresh (called periodically by AIEconomy)
  // ─────────────────────────────────────────────────────────

  async refreshContracts(): Promise<void> {
    const player = await DatabaseManager.getPlayer();
    if (!player) return;

    // Regenerate AI contracts at player's DB position — never default to LFPG
    const airport = positionState.dbAirport.get() || player.current_airport || "";
    if (!airport) {
      console.warn("[LocalContractService] No position — skipping contract refresh");
      return;
    }
    await this.generateAIContracts(airport);
  }

  // ─────────────────────────────────────────────────────────
  // PRIVATE: Create a random AI contract
  // ─────────────────────────────────────────────────────────

  private createRandomContract(origin: Airport, airports: Airport[], items: Item[]): ContractOffer | null {
    // Pick destination with weighted distance distribution:
    // ~20% very short (20-50nm), ~30% short (50-150nm), ~30% medium (150-400nm), ~20% long (400-800nm)
    const allCandidates = airports.filter(a => {
      if (a.ident === origin.ident) return false;
      if (a.type !== "large_airport" && a.type !== "medium_airport" && a.type !== "small_airport") return false;
      const dist = this.calculateDistance(origin.latitude, origin.longitude, a.latitude, a.longitude);
      return dist >= MIN_DISTANCE_NM && dist <= MAX_DISTANCE_NM;
    });

    if (allCandidates.length === 0) return null;

    // Weighted distance band selection
    const distRoll = Math.random();
    let minDist: number, maxDist: number;
    if (distRoll < 0.20) { minDist = 20; maxDist = 50; }           // 20% very short
    else if (distRoll < 0.50) { minDist = 50; maxDist = 150; }     // 30% short
    else if (distRoll < 0.80) { minDist = 150; maxDist = 400; }    // 30% medium
    else { minDist = 400; maxDist = 800; }                          // 20% long

    let candidates = allCandidates.filter(a => {
      const dist = this.calculateDistance(origin.latitude, origin.longitude, a.latitude, a.longitude);
      return dist >= minDist && dist <= maxDist;
    });

    // Fallback to all candidates if preferred band is empty
    if (candidates.length === 0) candidates = allCandidates;

    const dest = candidates[Math.floor(Math.random() * candidates.length)];
    const distance = Math.round(this.calculateDistance(origin.latitude, origin.longitude, dest.latitude, dest.longitude));

    // Determine cargo type: 60% items, 30% passengers, 10% mixed
    const roll = Math.random();
    let cargoType: "items" | "passengers" | "mixed";
    if (roll < 0.6) cargoType = "items";
    else if (roll < 0.9) cargoType = "passengers";
    else cargoType = "mixed";

    // Generate cargo details
    let cargoDescription = "";
    let cargoWeightKg = 0;
    let cargoItems: ContractCargoItem[] | undefined;
    let passengerCount: number | undefined;
    let minCapacityKg = 0;

    if (cargoType === "items" || cargoType === "mixed") {
      // Pick 1-3 random items
      const transportableItems = items.filter(i => i.weightKg > 0 && i.weightKg <= 50);
      const itemCount = 1 + Math.floor(Math.random() * 3);
      cargoItems = [];

      for (let i = 0; i < itemCount && transportableItems.length > 0; i++) {
        const item = transportableItems[Math.floor(Math.random() * transportableItems.length)];
        const qty = 5 + Math.floor(Math.random() * 46); // 5-50 units
        const weight = Math.round(qty * item.weightKg);
        cargoItems.push({
          item_code: item.id,
          item_name: item.name,
          quantity: qty,
          weight_kg: weight,
        });
        cargoWeightKg += weight;
      }

      cargoDescription = cargoItems.map(ci => `${ci.quantity}x ${ci.item_name}`).join(", ");
    }

    if (cargoType === "passengers" || cargoType === "mixed") {
      passengerCount = 1 + Math.floor(Math.random() * 8); // 1-8 passengers
      const paxWeight = passengerCount * 85; // ~85kg per passenger with luggage
      cargoWeightKg += paxWeight;
      const paxType = PASSENGER_TYPES[Math.floor(Math.random() * PASSENGER_TYPES.length)];
      const paxDesc = `${passengerCount} ${paxType}`;
      cargoDescription = cargoDescription ? `${cargoDescription} + ${paxDesc}` : paxDesc;
    }

    minCapacityKg = Math.round(cargoWeightKg * 1.1); // 10% margin

    // Calculate reward: distance x weight x multiplier
    const difficultyMultiplier = distance > 400 ? 1.5 : distance > 150 ? 1.0 : 0.8;
    const reward = Math.round(distance * (cargoWeightKg / 100) * REWARD_PER_NM_PER_100KG * difficultyMultiplier);

    // License requirement
    const licenseEntry = LICENSE_BY_DISTANCE.find(l => distance <= l.maxNm);
    const requiredLicense = licenseEntry?.license || "PPL";

    const creatorName = AI_CREATOR_NAMES[Math.floor(Math.random() * AI_CREATOR_NAMES.length)];

    return {
      id: this.generateUUID(),
      creator_id: "AI",
      creator_name: creatorName,
      creator_type: "ai",
      origin_icao: origin.ident,
      destination_icao: dest.ident,
      distance_nm: distance,
      cargo_type: cargoType,
      cargo_description: cargoDescription,
      cargo_weight_kg: cargoWeightKg,
      cargo_items: cargoItems,
      passenger_count: passengerCount,
      reward_cr: reward,
      required_license: requiredLicense,
      min_cargo_capacity_kg: minCapacityKg,
      status: "available",
      created_at: new Date().toISOString(),
    };
  }

  // ─────────────────────────────────────────────────────────
  // UTILITIES
  // ─────────────────────────────────────────────────────────

  /** Remove contract cargo from aircraft after delivery */
  private async removeContractCargoFromAircraft(contract: ActiveContract): Promise<void> {
    const allAircraft = await DatabaseManager.getAll<Aircraft>("aircraft");
    // Build list of items to remove
    const itemsToRemove: { item_code: string; quantity: number }[] = [];
    if (contract.cargo_items) {
      for (const ci of contract.cargo_items) {
        itemsToRemove.push({ item_code: ci.item_code, quantity: ci.quantity });
      }
    }
    if (contract.passenger_count && contract.passenger_count > 0) {
      itemsToRemove.push({ item_code: "passenger", quantity: contract.passenger_count });
    }
    if (itemsToRemove.length === 0) return;

    // Search all aircraft for matching cargo and remove
    for (const ac of allAircraft) {
      const inventory = await DatabaseManager.getInventoryAt("aircraft", ac.id);
      for (const toRemove of itemsToRemove) {
        const invItem = inventory.find(i => i.item_code === toRemove.item_code);
        if (invItem) {
          if (invItem.quantity <= toRemove.quantity) {
            await DatabaseManager.delete("inventory", invItem.id);
          } else {
            invItem.quantity -= toRemove.quantity;
            await DatabaseManager.put("inventory", invItem);
          }
          console.log(`[Contracts] Removed ${toRemove.quantity}x ${toRemove.item_code} from aircraft ${ac.registration}`);
        }
      }
    }

    // Also clean up any remaining contract cargo at origin airport (in case not all was loaded)
    await DatabaseManager.removeContractCargo(contract.id, contract.origin_icao);
  }

  /** Haversine distance in nautical miles */
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3440.065; // Earth radius in nm
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
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

export const localContractService = new LocalContractServiceClass();
