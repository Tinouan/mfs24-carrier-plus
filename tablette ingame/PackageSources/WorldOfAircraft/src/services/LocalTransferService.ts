/**
 * LocalTransferService - Pilot & Aircraft transfer logic (Phase 7)
 * Handles distance calculation, cost estimation, and transfer execution
 * Cost rates: 50 CR/NM for pilot, 80 CR/NM for aircraft
 */
import { DatabaseManager } from "../managers/DatabaseManager";
import type { Airport, Aircraft } from "../managers/DatabaseManager";

const PILOT_RATE_PER_NM = 50;
const AIRCRAFT_RATE_PER_NM = 80;
const EARTH_RADIUS_NM = 3440.065;

// ═══════════════════════════════════════════════════════════
// DISTANCE CALCULATION
// ═══════════════════════════════════════════════════════════

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const rLat1 = lat1 * Math.PI / 180;
  const rLat2 = lat2 * Math.PI / 180;

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_NM * c);
}

async function getAirportCoords(icao: string): Promise<{ lat: number; lon: number } | null> {
  const db = DatabaseManager;
  const airports = await db.getAll<Airport>("airports");
  const airport = airports.find(a => a.ident === icao);
  if (!airport) return null;
  return { lat: airport.latitude, lon: airport.longitude };
}

async function calcDistance(originIcao: string, destIcao: string): Promise<number> {
  const origin = await getAirportCoords(originIcao);
  const dest = await getAirportCoords(destIcao);
  if (!origin || !dest) return 0;
  return haversine(origin.lat, origin.lon, dest.lat, dest.lon);
}

// ═══════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════

export class LocalTransferService {

  static async estimatePilotTransfer(
    originIcao: string,
    destIcao: string
  ): Promise<{ distance_nm: number; cost_cr: number }> {
    const distance_nm = await calcDistance(originIcao, destIcao);
    const cost_cr = Math.round(distance_nm * PILOT_RATE_PER_NM);
    return { distance_nm, cost_cr };
  }

  static async estimateAircraftTransfer(
    originIcao: string,
    destIcao: string
  ): Promise<{ distance_nm: number; cost_cr: number }> {
    const distance_nm = await calcDistance(originIcao, destIcao);
    const cost_cr = Math.round(distance_nm * AIRCRAFT_RATE_PER_NM);
    return { distance_nm, cost_cr };
  }

  static async transferPilot(
    playerId: string,
    destIcao: string
  ): Promise<{ success: boolean; error?: string }> {
    const db = DatabaseManager;

    // Get player
    const player = await db.getPlayer();
    if (!player || player.id !== playerId) {
      return { success: false, error: "Player not found" };
    }

    const originIcao = player.current_airport || player.preferred_airport || "";
    if (!originIcao) {
      return { success: false, error: "No origin airport" };
    }
    if (originIcao === destIcao) {
      return { success: false, error: "Already at this airport" };
    }

    // Calculate cost
    const { distance_nm, cost_cr } = await this.estimatePilotTransfer(originIcao, destIcao);
    if (cost_cr <= 0) {
      return { success: false, error: "Cannot calculate distance" };
    }

    // Check balance
    if (player.money < cost_cr) {
      return { success: false, error: "Insufficient funds" };
    }

    // Deduct cost
    player.money = Math.round(player.money - cost_cr);
    player.current_airport = destIcao;
    await db.savePlayer(player);

    // Log transaction
    await db.saveTransaction({
      timestamp: new Date().toISOString(),
      type: "pilot_transfer",
      amount: -cost_cr,
      balance_after: player.money,
      description: `Pilot transfer ${originIcao} → ${destIcao} (${distance_nm} NM)`,
      wallet: "player",
    });

    console.log(`[LocalTransferService] Pilot transferred: ${originIcao} → ${destIcao}, cost: ${cost_cr} CR`);
    return { success: true };
  }

  static async transferAircraft(
    aircraftId: string,
    destIcao: string
  ): Promise<{ success: boolean; error?: string }> {
    const db = DatabaseManager;

    // Get aircraft
    const aircraft = await db.get<Aircraft>("aircraft", aircraftId);
    if (!aircraft) {
      return { success: false, error: "Aircraft not found" };
    }

    // Must be parked
    if (aircraft.status !== "parked") {
      return { success: false, error: "Aircraft must be parked" };
    }

    const originIcao = aircraft.location_icao;
    if (originIcao === destIcao) {
      return { success: false, error: "Aircraft already at this airport" };
    }

    // Calculate cost
    const { distance_nm, cost_cr } = await this.estimateAircraftTransfer(originIcao, destIcao);
    if (cost_cr <= 0) {
      return { success: false, error: "Cannot calculate distance" };
    }

    // Determine wallet (player or company)
    const wallet: "player" | "company" = aircraft.owner_type;

    if (wallet === "player") {
      // Check player balance
      const player = await db.getPlayer();
      if (!player || player.money < cost_cr) {
        return { success: false, error: "Insufficient funds" };
      }
      player.money = Math.round(player.money - cost_cr);
      await db.savePlayer(player);

      await db.saveTransaction({
        timestamp: new Date().toISOString(),
        type: "aircraft_transfer",
        amount: -cost_cr,
        balance_after: player.money,
        description: `Aircraft ${aircraft.registration} transfer ${originIcao} → ${destIcao} (${distance_nm} NM)`,
        wallet: "player",
      });
    } else {
      // Check company balance
      const companyId = aircraft.company_id;
      if (!companyId) {
        return { success: false, error: "No company found for aircraft" };
      }
      const companies = await db.query<{ id: string; balance: number; owner_id: string; name: string; reputation: number; headquarters_icao?: string; founded_at: string; created_at: string; updated_at: string }>("company", "id", companyId);
      const company = companies[0];
      if (!company || company.balance < cost_cr) {
        return { success: false, error: "Insufficient company funds" };
      }
      company.balance = Math.round(company.balance - cost_cr);
      company.updated_at = new Date().toISOString();
      await db.put("company", company);

      await db.saveTransaction({
        timestamp: new Date().toISOString(),
        type: "aircraft_transfer",
        amount: -cost_cr,
        balance_after: company.balance,
        description: `Aircraft ${aircraft.registration} transfer ${originIcao} → ${destIcao} (${distance_nm} NM)`,
        wallet: "company",
      });
    }

    // Move aircraft
    await db.updateAircraftLocation(aircraftId, destIcao);

    console.log(`[LocalTransferService] Aircraft ${aircraft.registration} transferred: ${originIcao} → ${destIcao}, cost: ${cost_cr} CR`);
    return { success: true };
  }
}
