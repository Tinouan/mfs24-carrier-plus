/**
 * WorkerService — Worker generation and management
 * Phase 9.3: Loads country stats from seed.json, generates workers with randomized stats
 */

import { DatabaseManager } from "../managers/DatabaseManager";
import type { CountryWorkerStats, WorkerInstance } from "../types";
import { calculateWorkerTier } from "../constants/factory";
import seedData from "../data/seed.json";

class WorkerServiceClass {
  private countryStats: CountryWorkerStats[] = [];
  private countryMap: Map<string, CountryWorkerStats> = new Map();
  private initialized = false;

  /**
   * Initialize country worker stats from seed.json
   * Called once at startup from InitService
   */
  init(): void {
    if (this.initialized) return;

    const seed = seedData as any;
    this.countryStats = (seed.country_worker_stats || []) as CountryWorkerStats[];
    this.countryMap.clear();
    for (const cs of this.countryStats) {
      this.countryMap.set(cs.country_code, cs);
    }

    this.initialized = true;
    console.log(`[WorkerService] Initialized with ${this.countryStats.length} countries`);
  }

  /** Get all available countries */
  getAllCountries(): CountryWorkerStats[] {
    return this.countryStats;
  }

  /** Get country stats by code */
  getCountryStats(code: string): CountryWorkerStats | null {
    return this.countryMap.get(code) || null;
  }

  /** Get countries by region */
  getCountriesByRegion(region: string): CountryWorkerStats[] {
    return this.countryStats.filter(c => c.region === region);
  }

  /**
   * Generate a new WorkerInstance with randomized stats
   * Speed and resistance: ±20% variation from country base
   * Salary: ±10% variation from country base
   */
  generateWorker(
    countryCode: string,
    airportIdent: string,
    ownerType: "company" | "personal",
    ownerId: string
  ): WorkerInstance {
    const stats = this.getCountryStats(countryCode);
    if (!stats) {
      throw new Error(`Unknown country code: ${countryCode}`);
    }

    // ±20% variation on speed and resistance
    const speed = Math.round(stats.base_speed * (0.8 + Math.random() * 0.4));
    const resistance = Math.round(stats.base_resistance * (0.8 + Math.random() * 0.4));

    // ±10% variation on salary
    const hourly_salary = Math.round(stats.base_hourly_salary * (0.9 + Math.random() * 0.2) * 100) / 100;

    const worker: WorkerInstance = {
      id: this.generateUUID(),
      owner_company_id: ownerType === "company" ? ownerId : null,
      owner_player_id: ownerType === "personal" ? ownerId : null,
      owner_type: ownerType,
      item_id: "worker",
      airport_ident: airportIdent,
      country_code: countryCode,
      speed,
      resistance,
      xp: 0,
      tier: 1,
      hourly_salary,
      status: "available",
      factory_id: null,
      for_sale: false,
      sale_price: null,
      injured_at: null,
      injury_duration_days: 0,
      created_at: new Date().toISOString(),
    };

    return worker;
  }

  /** Calculate worker tier from XP */
  calculateTier(xp: number): number {
    return calculateWorkerTier(xp);
  }

  /** Add XP to a worker (mutates and returns) */
  addXP(worker: WorkerInstance, amount: number): WorkerInstance {
    worker.xp += amount;
    worker.tier = this.calculateTier(worker.xp);
    return worker;
  }

  /**
   * Pick random country codes appropriate for an airport region
   * 80% from the airport's region, 20% from other regions
   */
  pickCountriesForAirport(airportIcao: string, count: number): string[] {
    const region = this.getRegionForAirport(airportIcao);
    const regionCountries = this.getCountriesByRegion(region);
    const otherCountries = this.countryStats.filter(c => c.region !== region);
    const result: string[] = [];

    for (let i = 0; i < count; i++) {
      if (Math.random() < 0.8 && regionCountries.length > 0) {
        // 80% chance: pick from region
        result.push(regionCountries[Math.floor(Math.random() * regionCountries.length)].country_code);
      } else if (otherCountries.length > 0) {
        // 20% chance: pick from other regions
        result.push(otherCountries[Math.floor(Math.random() * otherCountries.length)].country_code);
      } else if (regionCountries.length > 0) {
        result.push(regionCountries[Math.floor(Math.random() * regionCountries.length)].country_code);
      }
    }

    return result;
  }

  /**
   * Determine region for an airport based on ICAO prefix
   */
  private getRegionForAirport(icao: string): string {
    const prefix = icao.substring(0, 2);

    // Europe
    if (["LF", "EG", "ED", "EH", "EB", "LE", "LI", "LS", "LO", "EK", "ES",
         "EF", "EN", "EP", "LK", "LH", "LR", "LB", "LG", "LJ", "LZ", "LT",
         "EI", "EV", "EE", "EY"].includes(prefix)) {
      return "europe";
    }

    // Americas
    if (["K", "C", "M", "S", "T"].includes(icao[0]) ||
        ["PA", "PH"].includes(prefix)) {
      return "americas";
    }

    // Asia
    if (["R", "Z", "V", "W"].includes(icao[0]) ||
        ["OM", "OE", "OB", "OI", "OT"].includes(prefix)) {
      // Middle East overrides
      if (["OM", "OE", "OB", "OI", "OT"].includes(prefix)) {
        return "middle_east";
      }
      return "asia";
    }

    // Africa
    if (["D", "F", "G", "H"].includes(icao[0])) {
      return "africa";
    }

    // Oceania
    if (["Y", "NZ"].includes(prefix) || icao[0] === "Y") {
      return "oceania";
    }

    // Default to europe
    return "europe";
  }

  /** Save a worker to DatabaseManager and factoryState */
  async saveWorker(worker: WorkerInstance): Promise<void> {
    await DatabaseManager.put("workers", worker, false);
  }

  /** Get all workers for a company */
  async getWorkersByCompany(companyId: string): Promise<WorkerInstance[]> {
    return DatabaseManager.getWorkersByCompany(companyId);
  }

  /** Check if service is initialized */
  isReady(): boolean {
    return this.initialized;
  }

  private generateUUID(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}

export const WorkerService = new WorkerServiceClass();
