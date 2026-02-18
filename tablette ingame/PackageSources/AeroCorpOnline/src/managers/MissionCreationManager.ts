/**
 * MissionCreationManager - Mission creation and flight plan handling
 * Extracted from AeroCorpOnline.tsx for better maintainability
 *
 * Handles:
 * - Reading flight plan from GPS/ATC SimVars
 * - Payload management (read/write to SimVars)
 * - Flight plan validation helpers
 */

// Global MSFS declarations in src/types/msfs-globals.d.ts

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface FlightPlanData {
  wpCount: number;
  hasActivePlan: boolean;
  totalDistanceNm: number;
  wpIndex: number;
  prevWpId: string;
  nextWpId: string;
  nextWpLat: number;
  nextWpLon: number;
  detectedDestination: string | null;
  detectedOrigin: string | null;
}

export interface PayloadState {
  payloadStartLbs: number;
  fuelStartPercent: number;
}

export interface MissionCreationCallbacks {
  // Flight plan state updates
  onFlightPlanRead: (data: FlightPlanData) => void;
  onDestinationDetected: (icao: string) => void;
  onFlightPlanNotification: (message: string) => void;

  // Error handling
  onError: (error: string) => void;

  // Payload state updates
  onPayloadWritten: (state: PayloadState) => void;

  // Translation
  t: (section: string, key: string) => string;
}

// ═══════════════════════════════════════════════════════════════════════════
// MISSION CREATION MANAGER
// ═══════════════════════════════════════════════════════════════════════════

class MissionCreationManager {
  private callbacks: MissionCreationCallbacks | null = null;
  private initialized = false;

  /**
   * Initialize the manager with callbacks
   */
  initialize(callbacks: MissionCreationCallbacks): void {
    this.callbacks = callbacks;
    this.initialized = true;
    console.log("[MissionCreationManager] Initialized");
  }

  /**
   * Check if manager is initialized
   */
  isInitialized(): boolean {
    return this.initialized && this.callbacks !== null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FLIGHT PLAN READING FROM SIMVARS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Read flight plan data from aircraft GPS SimVars
   * Tries multiple methods to detect destination:
   * 1. Coherent LOAD_CURRENT_ATC_FLIGHTPLAN + GET_FLIGHTPLAN
   * 2. GPS FLIGHT PLAN DESTINATION ICAO
   * 3. ATC FLIGHT PLAN DESTINATION ICAO
   * 4. FS9GPS legacy SimVars
   * 5. Working Title LVars
   */
  readFlightPlanFromGPS(): FlightPlanData {
    console.log("[MissionCreationManager] Reading flight plan from aircraft GPS...");

    let detectedDestination: string | null = null;
    let detectedOrigin: string | null = null;

    try {
      // Basic flight plan info from GPS SimVars
      const wpCount = SimVar.GetSimVarValue("GPS FLIGHT PLAN WP COUNT", "number") as number || 0;
      const hasActive = SimVar.GetSimVarValue("GPS IS ACTIVE FLIGHT PLAN", "bool") as boolean;
      const totalDist = SimVar.GetSimVarValue("GPS FLIGHTPLAN TOTAL DISTANCE", "nautical miles") as number || 0;
      const wpIndex = SimVar.GetSimVarValue("GPS FLIGHT PLAN WP INDEX", "number") as number || 0;

      console.log("[MissionCreationManager] GPS SimVars:", { wpCount, hasActive, totalDist, wpIndex });

      // Previous and next waypoints
      const prevId = SimVar.GetSimVarValue("GPS WP PREV ID", "string") as string || "";
      const nextId = SimVar.GetSimVarValue("GPS WP NEXT ID", "string") as string || "";
      const nextLat = SimVar.GetSimVarValue("GPS WP NEXT LAT", "degrees") as number || 0;
      const nextLon = SimVar.GetSimVarValue("GPS WP NEXT LON", "degrees") as number || 0;

      console.log("[MissionCreationManager] GPS Waypoints:", { prevId, nextId, nextLat, nextLon });

      // Try origin detection from prevId
      if (prevId && /^[A-Z]{4}$/.test(prevId)) {
        detectedOrigin = prevId;
      }

      // Method 1: Register listener and use GET_FLIGHTPLAN (MSFS 2020/2024)
      this.tryCoherentFlightPlan();

      // Method 2: Test GPS Flight Plan destination SimVars
      detectedDestination = this.tryGpsDestinationSimVars();

      // Method 3: Try ATC Flight Plan SimVars
      if (!detectedDestination) {
        detectedDestination = this.tryAtcSimVars();
      }

      // Method 4: Try FS9GPS Legacy SimVars
      if (!detectedDestination) {
        detectedDestination = this.tryFs9GpsSimVars();
      }

      // Method 5: Try Working Title LVars
      if (!detectedDestination) {
        detectedDestination = this.tryWorkingTitleLVars();
      }

      // Method 6: Try other destination SimVars
      if (!detectedDestination) {
        detectedDestination = this.tryOtherDestinationSimVars();
      }

      // Notify if plan active but no destination found
      if (!detectedDestination && hasActive && this.callbacks) {
        console.log("[MissionCreationManager] GPS has active plan but destination not auto-detected");
        this.callbacks.onFlightPlanNotification(this.callbacks.t("missions", "flightPlanActive"));
      }

      // Notify destination if detected
      if (detectedDestination && this.callbacks) {
        this.callbacks.onDestinationDetected(detectedDestination);
        this.callbacks.onFlightPlanNotification(`Destination detectee: ${detectedDestination}`);
      }

      const flightPlanData: FlightPlanData = {
        wpCount,
        hasActivePlan: !!hasActive,
        totalDistanceNm: Math.round(totalDist * 10) / 10,
        wpIndex,
        prevWpId: prevId,
        nextWpId: nextId,
        nextWpLat: nextLat,
        nextWpLon: nextLon,
        detectedDestination,
        detectedOrigin,
      };

      console.log(`[MissionCreationManager] Flight plan: ${wpCount} WPs, ${totalDist.toFixed(1)} nm, dest=${detectedDestination || "a saisir"}`);

      // Notify callback
      if (this.callbacks) {
        this.callbacks.onFlightPlanRead(flightPlanData);
      }

      return flightPlanData;
    } catch (error) {
      console.error("[MissionCreationManager] Error reading flight plan:", error);
      if (this.callbacks) {
        this.callbacks.onError(`Error reading flight plan: ${error}`);
      }
      return {
        wpCount: 0,
        hasActivePlan: false,
        totalDistanceNm: 0,
        wpIndex: 0,
        prevWpId: "",
        nextWpId: "",
        nextWpLat: 0,
        nextWpLon: 0,
        detectedDestination: null,
        detectedOrigin: null,
      };
    }
  }

  /**
   * Try to get flight plan via Coherent API
   */
  private tryCoherentFlightPlan(): void {
    try {
      if (typeof RegisterViewListener !== "undefined") {
        RegisterViewListener("JS_LISTENER_FLIGHTPLAN");
        console.log("[MissionCreationManager] JS_LISTENER_FLIGHTPLAN registered");

        Coherent.call("LOAD_CURRENT_ATC_FLIGHTPLAN")
          .then(() => Coherent.call("GET_FLIGHTPLAN"))
          .then((fp: unknown) => {
            console.log("[MissionCreationManager] GET_FLIGHTPLAN result:", fp);
            const flightPlan = fp as { waypoints?: Array<{ ident?: string }> };
            if (flightPlan && flightPlan.waypoints && flightPlan.waypoints.length > 0) {
              const lastWp = flightPlan.waypoints[flightPlan.waypoints.length - 1];
              const dest = lastWp?.ident || "";
              console.log("[MissionCreationManager] Last waypoint:", lastWp);
              if (dest && /^[A-Z]{4}$/.test(dest)) {
                console.log("[MissionCreationManager] Destination from FLIGHTPLAN:", dest);
                if (this.callbacks) {
                  this.callbacks.onDestinationDetected(dest);
                  this.callbacks.onFlightPlanNotification(`Destination: ${dest}`);
                }
              }
            }
          })
          .catch((e: unknown) => console.log("[MissionCreationManager] GET_FLIGHTPLAN failed:", e));
      }
    } catch (e) {
      console.log("[MissionCreationManager] RegisterViewListener not available:", e);
    }
  }

  /**
   * Try GPS Flight Plan destination SimVars
   */
  private tryGpsDestinationSimVars(): string | null {
    const gpsDestVars = [
      { name: "GPS FLIGHT PLAN DESTINATION ICAO", unit: "string" },
      { name: "GPS FLIGHT PLAN DESTINATION TYPE", unit: "number" },
      { name: "GPS FLIGHT PLAN DESTINATION LAT", unit: "degrees" },
      { name: "GPS FLIGHT PLAN DESTINATION LON", unit: "degrees" },
    ];

    console.log("[MissionCreationManager] -- GPS Flight Plan Destination --");
    for (const v of gpsDestVars) {
      try {
        const value = SimVar.GetSimVarValue(v.name, v.unit);
        console.log(`  ${v.name}: ${value}`);
        if (v.name.includes("ICAO") && value && typeof value === "string" && /^[A-Z]{4}$/.test(value)) {
          console.log(`[MissionCreationManager] *** FOUND DESTINATION: ${value} ***`);
          return value;
        }
      } catch (e) { /* SimVar not available */ }
    }
    return null;
  }

  /**
   * Try ATC Flight Plan SimVars
   */
  private tryAtcSimVars(): string | null {
    const atcVars = [
      { name: "ATC FLIGHT PLAN DESTINATION ICAO", unit: "string" },
      { name: "ATC FLIGHT PLAN DESTINATION TYPE", unit: "number" },
      { name: "ATC FLIGHT PLAN ORIGIN ICAO", unit: "string" },
      { name: "ATC RUNWAY AIRPORT NAME", unit: "string" },
    ];

    console.log("[MissionCreationManager] -- ATC Flight Plan --");
    for (const v of atcVars) {
      try {
        const value = SimVar.GetSimVarValue(v.name, v.unit);
        console.log(`  ${v.name}: ${value}`);
        if (v.name.includes("DESTINATION ICAO") && value && typeof value === "string" && /^[A-Z]{4}$/.test(value)) {
          console.log(`[MissionCreationManager] *** FOUND DESTINATION: ${value} ***`);
          return value;
        }
      } catch (e) { /* SimVar not available */ }
    }
    return null;
  }

  /**
   * Try FS9GPS Legacy SimVars
   */
  private tryFs9GpsSimVars(): string | null {
    const fs9gpsVars = [
      { name: "C:fs9gps:FlightPlanDestinationAirportident", unit: "string" },
      { name: "C:fs9gps:FlightPlanDestinationICAO", unit: "string" },
      { name: "C:fs9gps:FlightPlanWaypointsNumber", unit: "number" },
    ];

    console.log("[MissionCreationManager] -- FS9GPS Legacy --");
    for (const v of fs9gpsVars) {
      try {
        const value = SimVar.GetSimVarValue(v.name, v.unit);
        console.log(`  ${v.name}: ${value}`);
        if (v.name.includes("Destination") && value && typeof value === "string" && /^[A-Z]{4}$/.test(value)) {
          console.log(`[MissionCreationManager] *** FOUND DESTINATION: ${value} ***`);
          return value;
        }
      } catch (e) { /* SimVar not available */ }
    }
    return null;
  }

  /**
   * Try Working Title LVars
   */
  private tryWorkingTitleLVars(): string | null {
    console.log("[MissionCreationManager] Trying Working Title LVars...");
    const wtLvarsToTry = [
      "L:WT_FLIGHT_PLAN_DESTINATION",
      "L:WT_G1000_FLIGHT_PLAN_DESTINATION",
      "L:WT_G3000_FLIGHT_PLAN_DESTINATION",
      "L:AS1000_PFD_SelectedAirport",
      "L:AS3000_PFD_SelectedAirport",
      "L:WT1000_FPL_Destination",
      "L:WT3000_FPL_Destination",
      "L:WTAP_Destination",
      "L:WT_FPL_Dest_ICAO",
      "L:FPL_DESTINATION",
      "L:FLIGHTPLAN_DESTINATION",
    ];

    for (const lvarName of wtLvarsToTry) {
      try {
        const value = SimVar.GetSimVarValue(lvarName, "string") as string || "";
        if (value) {
          console.log(`[MissionCreationManager] LVar ${lvarName}:`, value);
          if (/^[A-Z]{4}$/.test(value)) {
            console.log(`[MissionCreationManager] Destination from LVar:`, value);
            return value;
          }
        }
      } catch (e) { /* LVar not available */ }
    }

    // Also try to get as number (some LVars store index)
    try {
      const wpDestIdx = SimVar.GetSimVarValue("L:WT_FPL_Destination_Index", "number") as number;
      console.log("[MissionCreationManager] WT_FPL_Destination_Index:", wpDestIdx);
    } catch (e) { /* LVar not available */ }

    return null;
  }

  /**
   * Try other destination SimVars
   */
  private tryOtherDestinationSimVars(): string | null {
    const otherVars = [
      { name: "GPS APPROACH AIRPORT ID", unit: "string" },
      { name: "GPS TARGET AIRPORT IDENT", unit: "string" },
      { name: "ATC DESTINATION AIRPORT", unit: "string" },
    ];

    console.log("[MissionCreationManager] -- Other --");
    for (const v of otherVars) {
      try {
        const value = SimVar.GetSimVarValue(v.name, v.unit);
        console.log(`  ${v.name}: ${value}`);
        if (value && typeof value === "string" && /^[A-Z]{4}$/.test(value)) {
          console.log(`[MissionCreationManager] *** FOUND DESTINATION: ${value} ***`);
          return value;
        }
      } catch (e) { /* SimVar not available */ }
    }

    // Try Coherent GET_ACTIVE_FLIGHTPLAN
    try {
      console.log("[MissionCreationManager] Trying Coherent GET_ACTIVE_FLIGHTPLAN...");
      Coherent.call("GET_ACTIVE_FLIGHTPLAN")
        .then((fp: unknown) => {
          console.log("[MissionCreationManager] GET_ACTIVE_FLIGHTPLAN result:", fp);
        })
        .catch((e: unknown) => console.log("[MissionCreationManager] GET_ACTIVE_FLIGHTPLAN failed:", e));
    } catch (e) { /* Coherent not available */ }

    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAYLOAD MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Write cargo payload to SimVars
   * @param cargoWeightKg Cargo weight in kg
   * @returns PayloadState with recorded initial values
   */
  writePayloadToSimVars(cargoWeightKg: number): PayloadState {
    try {
      const cargoWeightLbs = cargoWeightKg * 2.20462; // Convert kg to lbs

      console.log("[MissionCreationManager] Writing payload to SimVars:", cargoWeightKg, "kg =", cargoWeightLbs, "lbs");

      // Get number of payload stations
      const stationCount = SimVar.GetSimVarValue("PAYLOAD STATION COUNT", "number") as number;
      console.log("[MissionCreationManager] Payload stations:", stationCount);

      if (stationCount > 0) {
        // Distribute cargo weight across available stations (simplified: use station 1 or 2 for cargo)
        // Station 1 is usually pilot, station 2+ are passengers/cargo
        const cargoStation = stationCount >= 2 ? 2 : 1;

        // Write cargo weight to the station
        SimVar.SetSimVarValue(`PAYLOAD STATION WEIGHT:${cargoStation}`, "pounds", cargoWeightLbs);
        console.log("[MissionCreationManager] Set PAYLOAD STATION WEIGHT:", cargoStation, "=", cargoWeightLbs, "lbs");
      }

      // Record total payload at start
      const payloadStartLbs = this.getTotalPayload();
      console.log("[MissionCreationManager] Payload at start:", payloadStartLbs, "lbs");

      // Record fuel at start
      const fuelCapacity = SimVar.GetSimVarValue("FUEL TOTAL CAPACITY", "gallons") as number;
      const fuelQuantity = SimVar.GetSimVarValue("FUEL TOTAL QUANTITY", "gallons") as number;
      const fuelStartPercent = fuelCapacity > 0 ? (fuelQuantity / fuelCapacity) * 100 : 100;
      console.log("[MissionCreationManager] Fuel at start:", fuelStartPercent.toFixed(1), "%");

      const state: PayloadState = { payloadStartLbs, fuelStartPercent };

      if (this.callbacks) {
        this.callbacks.onPayloadWritten(state);
      }

      return state;
    } catch (error) {
      console.error("[MissionCreationManager] Error writing payload to SimVars:", error);
      return { payloadStartLbs: 0, fuelStartPercent: 100 };
    }
  }

  /**
   * Get total payload weight from all stations
   * @returns Total payload in pounds
   */
  getTotalPayload(): number {
    try {
      const stationCount = SimVar.GetSimVarValue("PAYLOAD STATION COUNT", "number") as number;
      let totalPayload = 0;

      for (let i = 1; i <= stationCount; i++) {
        const stationWeight = SimVar.GetSimVarValue(`PAYLOAD STATION WEIGHT:${i}`, "pounds") as number;
        totalPayload += stationWeight || 0;
      }

      return totalPayload;
    } catch (error) {
      console.error("[MissionCreationManager] Error reading payload:", error);
      return 0;
    }
  }

  /**
   * Get current fuel state
   * @returns Fuel percentage and gallons
   */
  getCurrentFuelState(): { fuelPercent: number; fuelGallons: number; fuelCapacity: number } {
    try {
      const fuelCapacity = SimVar.GetSimVarValue("FUEL TOTAL CAPACITY", "gallons") as number;
      const fuelQuantity = SimVar.GetSimVarValue("FUEL TOTAL QUANTITY", "gallons") as number;
      const fuelPercent = fuelCapacity > 0 ? (fuelQuantity / fuelCapacity) * 100 : 100;

      return { fuelPercent, fuelGallons: fuelQuantity, fuelCapacity };
    } catch (error) {
      console.error("[MissionCreationManager] Error reading fuel:", error);
      return { fuelPercent: 100, fuelGallons: 0, fuelCapacity: 0 };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WEATHER DATA
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Read departure weather from SimVars
   * @returns Weather data or null
   */
  getDepartureWeather(): { visibility_nm: number; wind_kts: number; precipitation: boolean } | null {
    try {
      const visibility = SimVar.GetSimVarValue("AMBIENT VISIBILITY", "nautical miles") as number;
      const windSpeed = SimVar.GetSimVarValue("AMBIENT WIND VELOCITY", "knots") as number;
      const precipRate = SimVar.GetSimVarValue("AMBIENT PRECIP RATE", "millimeters of water") as number;

      const weather = {
        visibility_nm: visibility || 10,
        wind_kts: windSpeed || 0,
        precipitation: (precipRate || 0) > 0,
      };

      console.log("[MissionCreationManager] Departure weather:", weather);
      return weather;
    } catch (e) {
      console.log("[MissionCreationManager] Could not read weather SimVars");
      return null;
    }
  }

  /**
   * Get current local time string
   */
  getCurrentLocalTime(): string {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AIRCRAFT VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Extract ICAO type code from ATC_MODEL SimVar
   * Format can be: "ICAO C172" or "Asobo_C172" or just "C172"
   */
  extractIcaoType(rawAtcModel: string): string {
    if (!rawAtcModel) return "";

    // Try "ICAO XXXX" format first
    const icaoMatch = rawAtcModel.match(/^ICAO\s+([A-Z0-9]{2,4})/i);
    if (icaoMatch) return icaoMatch[1].toUpperCase();

    // Try "Asobo_XXXX" format
    const asoboMatch = rawAtcModel.match(/^Asobo_([A-Z0-9]{2,4})/i);
    if (asoboMatch) return asoboMatch[1].toUpperCase();

    // Try extracting 2-4 uppercase letters/numbers as type code
    const typeMatch = rawAtcModel.match(/([A-Z][A-Z0-9]{1,3})/);
    if (typeMatch) return typeMatch[1];

    return rawAtcModel.toUpperCase();
  }

  /**
   * Get ATC MODEL SimVar value
   */
  getAtcModel(): string {
    try {
      return SimVar.GetSimVarValue("ATC MODEL", "string") as string || "";
    } catch (e) {
      console.log("[MissionCreationManager] Could not read ATC MODEL SimVar");
      return "";
    }
  }

  /**
   * Validate aircraft model matches expected ICAO type
   */
  validateAircraftModel(expectedIcao: string): { valid: boolean; actualType: string; expectedType: string } {
    const rawAtcModel = this.getAtcModel();
    const extractedType = this.extractIcaoType(rawAtcModel);
    const expectedType = expectedIcao.toUpperCase();

    console.log("[MissionCreationManager] ATC_MODEL check: raw=", rawAtcModel, "extracted=", extractedType, "expected=", expectedType);

    const valid = !extractedType || !expectedType || extractedType === expectedType;

    return { valid, actualType: extractedType, expectedType };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const missionCreationManager = new MissionCreationManager();
