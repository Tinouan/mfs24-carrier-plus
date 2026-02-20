/**
 * PositionService - Strict position management
 *
 * BDD = SINGLE source of truth for pilot/aircraft position.
 * SimVar = CONFIRMATION that the player is at the correct location.
 *
 * Position in BDD changes ONLY in 3 cases:
 * 1. First connection (player creation) → chosen airport
 * 2. Successful landing (mission or free flight) → landing airport
 * 3. Paid pilot transfer → destination airport
 */
import { positionState } from "../state/positionState";
import { DatabaseManager } from "../managers";
import { FleetRouter } from "./ServiceRouter";

// Haversine distance (NM) between two lat/lon points
function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

class PositionServiceClass {
  private dbAirport = "";
  private simVarAirport = "----";
  private simDistanceFromDbNm = 0;
  private hasReceivedSimData = false;
  private lastSimLat = 0;
  private lastSimLon = 0;
  private readonly POSITION_MISMATCH_NM = 5;

  // ═══════════════════════════════════════
  // READ — Where is the pilot?
  // ═══════════════════════════════════════

  getDbPosition(): string {
    return this.dbAirport;
  }

  /**
   * Is the sim player at the same airport as the BDD?
   * 1. If GPS SimVar reports a valid airport → trust it (exact ICAO match)
   * 2. If GPS unavailable ("----") → fallback to lat/lon distance check
   * 3. If no data at all → block (no benefit of the doubt)
   */
  isAtCorrectAirport(): boolean {
    // No sim data yet → block
    if (!this.hasReceivedSimData) {
      return false;
    }
    // GPS SimVar available → exact match
    if (this.simVarAirport !== "----" && this.simVarAirport !== "") {
      const result = this.simVarAirport === this.dbAirport;
      if (!result) {
        console.log("[Position] isAtCorrectAirport: GPS match failed — sim=" + this.simVarAirport + " db=" + this.dbAirport);
      }
      return result;
    }
    // GPS unavailable → check lat/lon distance from DB airport
    const result = this.simDistanceFromDbNm <= this.POSITION_MISMATCH_NM;
    if (!result) {
      console.log("[Position] isAtCorrectAirport: distance check failed — dist=" + this.simDistanceFromDbNm.toFixed(1) + "nm > " + this.POSITION_MISMATCH_NM + "nm");
    }
    return result;
  }

  getPositionMismatchMessage(): string {
    return "Votre pilote est a " + this.dbAirport + ", mais vous etes a " + this.simVarAirport + ". Deplacez-vous ou payez un transfert.";
  }

  /**
   * Best-effort airport detection for UI display.
   * If GPS SimVar works → return it.
   * If GPS = "----" → find closest airport in cache from lat/lon.
   * If no data → return "".
   */
  getDetectedSimAirport(): string {
    if (this.simVarAirport !== "----" && this.simVarAirport !== "") {
      return this.simVarAirport;
    }
    if (this.lastSimLat === 0 || this.lastSimLon === 0) return "";
    const airports = DatabaseManager.getAirportsCache();
    if (airports.length === 0) return "";
    let closest = "";
    let minDist = Infinity;
    for (const apt of airports) {
      if (!apt.latitude || !apt.longitude) continue;
      const d = haversineNm(this.lastSimLat, this.lastSimLon, apt.latitude, apt.longitude);
      if (d < minDist) {
        minDist = d;
        closest = apt.ident;
      }
    }
    return minDist < 10 ? closest : "";
  }

  // ═══════════════════════════════════════
  // UPDATE — SimVar (read-only, never modifies BDD)
  // ═══════════════════════════════════════

  /**
   * Update lat/lon distance from DB airport.
   * Called BEFORE updateSimVar() so isAtCorrectAirport() has fresh distance.
   */
  updateSimPosition(lat: number, lon: number): void {
    if (lat !== 0 && lon !== 0) {
      this.lastSimLat = lat;
      this.lastSimLon = lon;
    }
    if (!this.dbAirport || lat === 0 || lon === 0) return;
    this.hasReceivedSimData = true;
    const airports = DatabaseManager.getAirportsCache();
    const dbApt = airports.find(a => a.ident === this.dbAirport);
    if (!dbApt || !dbApt.latitude || !dbApt.longitude) return;
    this.simDistanceFromDbNm = haversineNm(lat, lon, dbApt.latitude, dbApt.longitude);
  }

  updateSimVar(rawClosestAirport: string): void {
    this.simVarAirport = rawClosestAirport || "----";
    this.hasReceivedSimData = true;
    positionState.simVarAirport.set(this.simVarAirport);

    const correct = this.isAtCorrectAirport();
    positionState.isAtCorrectAirport.set(correct);
    if (!correct) {
      console.log("[Position] MISMATCH: sim=" + this.simVarAirport + " db=" + this.dbAirport + " dist=" + this.simDistanceFromDbNm.toFixed(1) + "nm");
    }
  }

  // ═══════════════════════════════════════
  // WRITE BDD — 3 cases ONLY
  // ═══════════════════════════════════════

  /**
   * Case 1: First connection — Player chooses starting airport.
   */
  async setInitialPosition(aircraftId: string, icao: string): Promise<void> {
    await this.updatePlayerAirport(icao);
    await FleetRouter.updateLocation(aircraftId, icao);
    this.dbAirport = icao;
    positionState.dbAirport.set(icao);
    console.log("[Position] Initial position set: " + icao);
  }

  /**
   * Case 2: Successful landing — Position updated.
   * IMPORTANT: icao must be a valid airport detected by SimVar at landing time.
   * If SimVar = "----" at landing, do NOT call this method.
   */
  async onSuccessfulLanding(aircraftId: string, icao: string): Promise<void> {
    if (!icao || icao === "----" || icao === "ZZZZ") {
      console.warn("[Position] Landing ignored — invalid ICAO: " + icao);
      return;
    }
    await this.updatePlayerAirport(icao);
    await FleetRouter.updateLocation(aircraftId, icao);
    this.dbAirport = icao;
    positionState.dbAirport.set(icao);
    console.log("[Position] Landing recorded: " + icao);
  }

  /**
   * Case 3: Paid pilot transfer.
   * aircraftId is optional — pilot-only transfers don't move any aircraft.
   */
  async onPaidTransfer(destinationIcao: string, aircraftId?: string): Promise<void> {
    await this.updatePlayerAirport(destinationIcao);
    if (aircraftId) {
      await FleetRouter.updateLocation(aircraftId, destinationIcao);
    }
    this.dbAirport = destinationIcao;
    positionState.dbAirport.set(destinationIcao);
    positionState.isAtCorrectAirport.set(this.isAtCorrectAirport());
    console.log("[Position] Paid transfer to: " + destinationIcao);
  }

  // ═══════════════════════════════════════
  // LOAD — At startup / onResume
  // ═══════════════════════════════════════

  async loadFromDb(): Promise<string> {
    const player = await DatabaseManager.getPlayer();
    console.log("[Position] loadFromDb — raw player.current_airport = " + (player ? String(player.current_airport) : "(no player)"));
    const currentAirport = player?.current_airport || "";
    const preferredAirport = player?.preferred_airport || "";

    console.log("[Position] loadFromDb: current_airport=" + (currentAirport || "(null)") + ", preferred_airport=" + (preferredAirport || "(null)"));

    // Use current_airport as position. preferred_airport is NOT a position fallback.
    this.dbAirport = currentAirport;
    positionState.dbAirport.set(currentAirport);

    // Re-evaluate after DB load (simVar might already be set)
    positionState.isAtCorrectAirport.set(this.isAtCorrectAirport());
    console.log("[Position] Loaded: pos=" + (currentAirport || "(empty)") + ", simVar=" + this.simVarAirport + ", correct=" + this.isAtCorrectAirport());
    return currentAirport;
  }

  // ═══════════════════════════════════════
  // INTERNAL — Update player.current_airport in DB
  // ═══════════════════════════════════════

  private async updatePlayerAirport(icao: string): Promise<void> {
    const player = await DatabaseManager.getPlayer();
    if (player) {
      const oldAirport = player.current_airport;
      player.current_airport = icao;
      await DatabaseManager.savePlayer(player);
      DatabaseManager.forceSaveSync();
      console.log("[Position] updatePlayerAirport: " + (oldAirport || "(null)") + " -> " + icao + " — saved + forceSaveSync");
    } else {
      console.error("[Position] updatePlayerAirport: NO PLAYER FOUND — cannot save position " + icao);
    }
  }
}

export const PositionService = new PositionServiceClass();
